import { join, tempDir } from "@tauri-apps/api/path"
import { useObservable } from "@vueuse/rxjs"
import { liveQuery } from "dexie"
import { t } from "i18next"
import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { deleteFile, downloadFile } from "@/api/app"
import type { GameMod, GameModVersion } from "@/api/gen/api-types"
import { modDownloadUrl, modVersionDownloadUrl } from "@/api/modShare"
import { env } from "@/env"
import { isDownloadPausedError, pauseDownload } from "@/utils/game-download"
import { buildModTempFileName, computeDownloadProgress, findInstalledLocalMod, MOD_TEMP_DIR_NAME, modTaskKey } from "@/utils/mod-download"
import { db, type InstalledShareMod, STANDALONE_ENTITY } from "./db"
import { useGameStore } from "./game"
import { useUIStore } from "./ui"
import { useUserStore } from "./user"

/**
 * 分享 MOD 的下载队列 Store：串行下载 + 进度上报 + 下载完自动解压安装。
 * 下载走桌面端 Rust 下载器（download_file，绕过浏览器 CORS，可直接下载「接口 302 到 OSS/CDN」的地址），
 * 落盘的临时 zip 再复用已有的路径式导入（import_mod 从本地目录解压）安装到游戏 MOD 目录。
 * 临时包写在系统临时目录（而非工作目录：应用可能装在 Program Files，工作目录不可写）。
 * 队列为全局单例，切页面/关弹窗都不会中断下载；已完成的任务短暂保留后自动移出，
 * 失败的任务保留到用户重试或清除。安装成功后写入 installedShareMods，
 * 商店卡片据此显示「已下载 / 可更新」。
 */

/** 任务状态。 */
export type ModTaskStatus = "pending" | "downloading" | "installing" | "done" | "error"

/** 入队所需的发布快照（与列表数据解耦，任务在执行时不依赖已变更的列表项）。 */
export interface ModDownloadRequest {
    modId: string
    /** 目标版本 id，缺省表示最新版。 */
    versionId?: string
    /** 发布名称，写入本地 MOD 名称。 */
    name: string
    /** 分类：char | weapon | other | standalone。 */
    category: string
    /** 适用实体（角色/武器/自定义实体名）。 */
    modEntity?: string
    /** 版本号标签（展示用）。 */
    version?: string
    /** 压缩包文件名。 */
    fileName: string
    /** 压缩包大小（字节），响应头缺失时作为进度基准。 */
    fileSize: number
    /** 该发布当前 updateAt，写入安装记录用于更新判定。 */
    modUpdateAt: number
    /** 封面直链，写入本地 MOD 预览图。 */
    coverUrl?: string
}

/** 队列任务 = 发布快照 + 运行状态。 */
export interface ModDownloadTask extends ModDownloadRequest {
    /** 任务 key：最新版为发布 id，指定版本为 `发布id:版本id`。 */
    key: string
    status: ModTaskStatus
    /** 已下载字节数。 */
    loaded: number
    /** 下载百分比 0-100，总量未知时为 null。 */
    progress: number | null
    error?: string
    /** 安装到的本地实体（用于完成后刷新对应列表）。 */
    entity?: string
    /** 本次下载落盘的临时压缩包路径（相对工作目录），下载结束/取消后删除。 */
    tempPath?: string
    createdAt: number
}

/** 已完成任务在队列中的保留时长（毫秒），让用户能看到成功状态。 */
const DONE_TASK_VISIBLE_MS = 4000

/** 是否属于队列中的活跃状态（占用队列、卡片显示进度）。 */
export function isTaskActive(task: ModDownloadTask | undefined) {
    return !!task && task.status !== "done" && task.status !== "error"
}

export const useModDownloadStore = defineStore("modDownload", () => {
    const game = useGameStore()
    const ui = useUIStore()
    const user = useUserStore()

    /** 队列任务（按入队顺序）。 */
    const tasks = ref<ModDownloadTask[]>([])
    /** 是否正在执行队列（同一时刻只跑一个任务，保证进度可读）。 */
    const running = ref(false)
    /** 安装完成计数：外部监听它刷新本地 MOD 列表。 */
    const installTick = ref(0)
    /** 最近一次安装的目标实体，供外部刷新对应分类。 */
    const lastInstalledEntity = ref("")
    /** 已完成任务的移出定时器。 */
    const removeTimers = new Map<string, ReturnType<typeof setTimeout>>()

    /** 本地已安装记录（Dexie 实时查询，安装/删除后自动刷新卡片状态）。 */
    const installedRows = useObservable<InstalledShareMod[]>(liveQuery(() => db.installedShareMods.toArray()) as any)

    /** 发布 id → 安装记录。 */
    const installedMap = computed(() => new Map((installedRows.value ?? []).map(row => [row.id, row])))

    /** 活跃任务数（等待中 + 下载中 + 安装中）。 */
    const activeCount = computed(() => tasks.value.filter(isTaskActive).length)
    /** 是否有任务正在下载或安装。 */
    const busy = computed(() => tasks.value.some(task => task.status === "downloading" || task.status === "installing"))

    /**
     * @description 读取某个发布的本地安装记录。
     * @param modId 发布 id。
     * @returns 安装记录，未安装时返回 undefined。
     */
    function getInstalledRecord(modId: string) {
        return installedMap.value.get(modId)
    }

    /**
     * @description 读取某个发布当前的活跃任务。
     * @param modId 发布 id。
     * @returns 活跃任务（等待/下载/安装中），没有时返回 undefined。
     */
    function getActiveTask(modId: string) {
        return tasks.value.find(task => task.modId === modId && isTaskActive(task))
    }

    /**
     * @description 读取指定任务 key 的活跃任务（详情页按版本查用）。
     * @param key 任务 key。
     * @returns 活跃任务，没有时返回 undefined。
     */
    function getActiveTaskByKey(key: string) {
        const task = tasks.value.find(item => item.key === key)
        return isTaskActive(task) ? task : undefined
    }

    /**
     * @description 把发布（或指定版本）加入下载队列，空闲时立即开始执行。
     * 重复入队（同发布同版本已在队列中）会被忽略。
     * @param mod 远端发布。
     * @param version 目标版本，缺省表示最新版本。
     * @returns 是否成功入队。
     */
    function enqueue(mod: GameMod, version?: GameModVersion) {
        if (!env.isApp) {
            ui.showErrorMessage(t("game-launcher.appOnlyDownload"))
            return false
        }
        if (!user.jwtToken) {
            ui.showErrorMessage(t("game-launcher.loginToDownload"))
            return false
        }
        if (!game.path) {
            ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
            return false
        }

        const key = modTaskKey(mod.id, version?.id)
        const existing = tasks.value.find(task => task.key === key)
        if (existing && isTaskActive(existing)) {
            ui.showErrorMessage(t("game-launcher.queueAlreadyQueued"))
            return false
        }
        // 已失败的任务重新入队时复用同一位置（先移除旧记录，避免同 key 重复）
        if (existing) removeTask(key)

        const target = version || mod.latestVersion
        tasks.value.push({
            key,
            modId: mod.id,
            // 最新版任务也把已解析到的版本 id 带上：记录更精确，且下载地址锁定用户点击时看到的版本
            versionId: target?.id || undefined,
            name: mod.name,
            category: mod.category,
            modEntity: mod.entity,
            version: target?.version || undefined,
            fileName: target?.fileName || mod.fileName,
            fileSize: target?.fileSize || mod.fileSize,
            modUpdateAt: mod.updateAt,
            coverUrl: mod.coverUrl || undefined,
            status: "pending",
            loaded: 0,
            progress: computeDownloadProgress(0, target?.fileSize || mod.fileSize),
            createdAt: Date.now(),
        })
        void pump()
        return true
    }

    /**
     * @description 从队列移除任务记录（不负责中止下载与清理文件，由执行体收尾）。
     * @param key 任务 key。
     */
    function removeTask(key: string) {
        const timer = removeTimers.get(key)
        if (timer) {
            clearTimeout(timer)
            removeTimers.delete(key)
        }
        const index = tasks.value.findIndex(task => task.key === key)
        if (index >= 0) tasks.value.splice(index, 1)
    }

    /**
     * @description 删除任务下载落的临时压缩包（取消/失败/完成安装后调用）。
     * @param task 队列任务。
     */
    function cleanupTempFile(task: ModDownloadTask) {
        const tempPath = task.tempPath
        if (!tempPath) return
        task.tempPath = undefined
        void deleteFile(tempPath, true).catch(error => {
            console.error("删除 MOD 临时压缩包失败:", error)
        })
    }

    /**
     * @description 取消任务：等待中的直接移出；下载中的按文件名通知 Rust 侧停止，随后由执行体收尾。
     * @param key 任务 key。
     */
    function cancelTask(key: string) {
        const task = tasks.value.find(item => item.key === key)
        if (!task) return
        if (task.status === "pending") {
            removeTask(key)
            return
        }
        if (task.status === "downloading" && task.tempPath) {
            // Rust 下载循环轮询该标记后返回 download_paused，runTask 据此把任务移出队列并清理临时包
            void pauseDownload(task.tempPath).catch(error => {
                console.error("暂停 MOD 下载失败:", error)
            })
        }
    }

    /**
     * @description 重试失败的任务（重新排队）。
     * @param key 任务 key。
     */
    function retryTask(key: string) {
        const task = tasks.value.find(item => item.key === key)
        if (task?.status !== "error") return
        task.status = "pending"
        task.error = undefined
        task.loaded = 0
        task.progress = computeDownloadProgress(0, task.fileSize)
        void pump()
    }

    /**
     * @description 清空所有任务：下载中的先通知 Rust 侧停止（临时包与状态由 runTask 收尾）。
     */
    function clearTasks() {
        for (const task of [...tasks.value]) {
            cancelTask(task.key)
            removeTask(task.key)
        }
    }

    /**
     * @description 清空已完成与失败的任务，保留正在进行的任务。
     */
    function clearFinishedTasks() {
        for (const task of [...tasks.value]) {
            if (task.status === "done" || task.status === "error") removeTask(task.key)
        }
    }

    /**
     * @description 串行执行队列：一次只跑一个任务，跑完继续取下一个。
     */
    async function pump() {
        if (running.value) return
        if (!tasks.value.some(task => task.status === "pending")) return

        running.value = true
        try {
            for (;;) {
                const task = tasks.value.find(item => item.status === "pending")
                if (!task) break
                await runTask(task)
            }
        } finally {
            running.value = false
        }
    }

    /**
     * @description 执行单个任务：下载到临时包（含进度）→ 从本地目录解压安装 → 记录已安装版本。
     * 任何失败都落在任务状态上，不向调用方抛出，避免打断后续任务。
     * @param task 队列任务。
     */
    async function runTask(task: ModDownloadTask) {
        try {
            task.status = "downloading"
            task.error = undefined
            // 临时包放系统临时目录：应用可能装在 Program Files，工作目录不可写
            const tempPath = await join(await tempDir(), MOD_TEMP_DIR_NAME, buildModTempFileName(task.modId, Date.now()))
            task.tempPath = tempPath
            const url = task.versionId ? modVersionDownloadUrl(task.modId, task.versionId) : modDownloadUrl(task.modId)
            await downloadFile(url, tempPath, {
                headers: { token: user.jwtToken },
                // MOD 包走「接口 302 到 CDN」：分块下载会对同一地址重复发 Range 请求，强制单流
                singleStream: true,
                onProgress: event => {
                    task.loaded = event.downloaded
                    // 响应头没给出总大小时用发布元数据兜底，避免进度条一直停在 0%
                    const total = event.total > 0 ? event.total : task.fileSize
                    const percent = computeDownloadProgress(event.downloaded, total)
                    // 续传/重试可能让后端报出更小的字节数，这里只允许进度前进，保证进度条不回退
                    if (percent !== null) task.progress = Math.max(task.progress ?? 0, percent)
                },
            })

            task.status = "installing"
            task.progress = 100
            const entity = await installTask(task, tempPath)
            task.entity = entity
            task.status = "done"
            installTick.value += 1
            lastInstalledEntity.value = entity
            ui.showSuccessMessage(t("game-launcher.modDownloadSuccess"))

            removeTimers.set(
                task.key,
                setTimeout(() => removeTask(task.key), DONE_TASK_VISIBLE_MS)
            )
        } catch (error) {
            if (isDownloadPausedError(error)) {
                // 用户主动取消：静默移出队列
                cleanupTempFile(task)
                removeTask(task.key)
                return
            }
            console.error("下载安装 MOD 失败:", error)
            task.status = "error"
            task.error = error instanceof Error ? error.message : String(error)
            ui.showErrorMessage(t("game-launcher.modDownloadFailed", { error: task.error }))
        } finally {
            // 压缩包已解压进 MOD 目录（或本次下载已失败/取消），临时包不再需要
            cleanupTempFile(task)
        }
    }

    /**
     * @description 把已下载到本地临时包的压缩包安装到对应分类，并写入已安装记录。
     * 复用已有的路径式导入（import_mod 从本地目录解压），若该发布此前已安装过，先移除旧的本地 MOD。
     * @param task 队列任务（携带发布快照）。
     * @param tempPath 临时压缩包路径。
     * @returns 安装到的本地实体名。
     */
    async function installTask(task: ModDownloadTask, tempPath: string): Promise<string> {
        if (!game.path) throw new Error(t("game-launcher.selectGameFileFirst"))

        // 其他（自定义）分类：本地不存在该自定义实体时自动创建，保证一键安装后可见可用
        if (task.category === "other" && task.modEntity) {
            const exists = (game.customEntitys ?? []).some(entity => entity.name === task.modEntity)
            if (!exists) {
                await game.addCustomEntity({ name: task.modEntity, icon: "ri:gamepad-line" })
            }
        }

        const targetEntity = task.category === "standalone" ? STANDALONE_ENTITY : task.modEntity || STANDALONE_ENTITY
        const previous = getInstalledRecord(task.modId)

        // 更新安装：先删掉上一次安装的本地 MOD（含磁盘文件），避免同名残留两份
        if (previous) {
            const localMods = await game.getModsByEntity(previous.entity)
            const stale = findInstalledLocalMod(localMods, previous)
            if (stale) await game.removeMod(stale)
            await db.installedShareMods.delete(task.modId)
        }

        const localName = task.version ? `${task.name} v${task.version}` : task.name
        const ok = await game.importModPaths([tempPath], targetEntity, {
            name: localName,
            pic: task.coverUrl || "",
        })
        if (!ok) throw new Error(t("game-launcher.importModFailed"))

        await db.installedShareMods.put({
            id: task.modId,
            versionId: task.versionId || "",
            version: task.version || "",
            fileSize: task.fileSize,
            modUpdateAt: task.modUpdateAt,
            localName,
            entity: targetEntity,
            installedAt: Date.now(),
        })
        return targetEntity
    }

    return {
        tasks,
        running,
        busy,
        activeCount,
        installTick,
        lastInstalledEntity,
        installedMap,
        getInstalledRecord,
        getActiveTask,
        getActiveTaskByKey,
        enqueue,
        removeTask,
        cancelTask,
        retryTask,
        clearTasks,
        clearFinishedTasks,
    }
})
