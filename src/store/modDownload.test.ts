import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import type { GameMod } from "@/api/gen/api-types"
import type { InstalledShareMod, Mod } from "@/store/db"
import { useModDownloadStore } from "./modDownload"

/**
 * 下载队列的行为测试：串行执行、进度上报（只前进不回退）、失败续跑、取消、更新时替换旧版本。
 * 这里把 Rust 下载器（downloadFile / deleteFile）、暂停通知（pauseDownload）、
 * 本地解压安装（game store）与数据库（db / liveQuery）都替换为可控桩，
 * 只验证队列自身的调度与状态机。
 */

/** 可控下载桩：按目标临时包路径挂起，测试里手动推进进度 / 结束 / 失败。 */
interface PendingDownload {
    /** 触发一次进度回调。 */
    progress: (downloaded: number, total?: number) => void
    /** 下载完成。 */
    resolve: () => void
    /** 下载失败。 */
    reject: (error: unknown) => void
}

const h = vi.hoisted(() => ({
    /** 本地安装记录表（模拟 Dexie，就地增删以保证 ref 响应性）。 */
    installed: [] as InstalledShareMod[],
    /** 本地 MOD 列表（按实体查询）。 */
    localMods: [] as Mod[],
    /** 已被移除的本地 MOD（更新安装应先删旧）。 */
    removed: [] as Mod[],
    /** 下载请求顺序（下载 URL）。 */
    requested: [] as string[],
    /** 挂起中的下载（按临时包路径索引）。 */
    pending: new Map<string, PendingDownload>(),
    /** 被 Rust 侧「暂停」的临时包路径（模拟取消下载）。 */
    paused: [] as string[],
    /** 被删除的临时包路径。 */
    deleted: [] as string[],
    /** 解压导入调用记录：临时包路径 + 目标实体。 */
    imports: [] as { path: string; entity: string }[],
    /** 解压导入是否成功。 */
    importOk: true,
    /** 当前登录令牌，为空表示未登录。 */
    jwtToken: "token",
}))

vi.mock("@/env", () => ({ env: { isApp: true, endpoint: "https://api.test.invalid", apiEndpoint: "https://api.test.invalid" } }))

vi.mock("i18next", () => ({ t: (key: string) => key }))

vi.mock("dexie", () => ({ liveQuery: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }))

vi.mock("@vueuse/rxjs", () => ({ useObservable: () => ref(h.installed) }))

vi.mock("@tauri-apps/api/path", () => ({
    tempDir: async () => "C:\\Temp\\",
    join: async (...parts: string[]) => parts.join("\\").replace(/\\+$/, ""),
}))

vi.mock("@/api/modShare", () => ({
    modDownloadUrl: (id: string) => `https://api.test.invalid/api/mods/${id}/download`,
    modVersionDownloadUrl: (modId: string, versionId: string) =>
        `https://api.test.invalid/api/mods/${modId}/versions/${versionId}/download`,
}))

vi.mock("@/api/app", () => ({
    deleteFile: async (filePath: string) => {
        h.deleted.push(filePath)
        return ""
    },
    downloadFile: (
        url: string,
        filename: string,
        options: { onProgress?: (event: { filename: string; progress: number; downloaded: number; total: number }) => void }
    ) => startDownload(url, filename, options),
}))

vi.mock("@/utils/game-download", () => ({
    pauseDownload: async (filename: string) => {
        h.paused.push(filename)
        const pending = h.pending.get(filename)
        if (!pending) return ""
        h.pending.delete(filename)
        pending.reject(new Error("download_paused"))
        return ""
    },
    isDownloadPausedError: (error: unknown) => error instanceof Error && error.message.includes("download_paused"),
}))

vi.mock("@/store/db", () => ({
    STANDALONE_ENTITY: "独立",
    db: {
        installedShareMods: {
            put: async (row: InstalledShareMod) => {
                const index = h.installed.findIndex(item => item.id === row.id)
                if (index >= 0) h.installed[index] = row
                else h.installed.push(row)
            },
            delete: async (id: string) => {
                const index = h.installed.findIndex(item => item.id === id)
                if (index >= 0) h.installed.splice(index, 1)
            },
        },
    },
}))

vi.mock("@/store/game", () => ({
    useGameStore: () => ({
        path: "C:/game/EM.exe",
        customEntitys: [],
        addCustomEntity: vi.fn(async () => {}),
        getModsByEntity: vi.fn(async (entity: string) => h.localMods.filter(mod => mod.entity === entity)),
        removeMod: vi.fn(async (mod: Mod) => {
            h.removed.push(mod)
            const index = h.localMods.findIndex(item => item.id === mod.id)
            if (index >= 0) h.localMods.splice(index, 1)
        }),
        importModPaths: vi.fn(async (paths: string[], entity: string) => {
            h.imports.push({ path: paths[0], entity })
            return h.importOk
        }),
    }),
}))

vi.mock("@/store/ui", () => ({
    useUIStore: () => ({ showSuccessMessage: vi.fn(), showErrorMessage: vi.fn() }),
}))

vi.mock("@/store/user", () => ({ useUserStore: () => ({ jwtToken: h.jwtToken }) }))

/**
 * @description 发起一次可控下载（记录请求顺序，挂起等待测试推进进度或结束）。
 * @param url 下载地址。
 * @param filename 目标临时包路径。
 * @param options 进度选项。
 * @returns 下载完成的 Promise。
 */
function startDownload(url: string, filename: string, options?: { onProgress?: PendingDownload["progress"] }) {
    h.requested.push(url)
    return new Promise<void>((resolve, reject) => {
        h.pending.set(filename, {
            progress: (downloaded: number, total?: number) =>
                options?.onProgress?.({
                    filename,
                    progress: total ? Math.floor((downloaded * 100) / total) : 0,
                    downloaded,
                    total: total ?? 0,
                }),
            resolve,
            reject,
        })
    })
}

/**
 * @description 取当前挂起的下载（队列串行，同一时刻只会有一个）。
 * 目标路径由 Rust 侧解析（系统临时目录），因此这里等下载真正发起后再取。
 * @returns 临时包路径与挂起句柄。
 */
async function currentDownload() {
    await vi.waitFor(() => expect(h.pending.size).toBeGreaterThan(0))
    const entry = [...h.pending.entries()].pop()
    if (!entry) throw new Error("当前没有挂起的下载")
    return { tempPath: entry[0], pending: entry[1] }
}

/**
 * @description 触发当前下载的一次进度回调。
 * @param downloaded 已下载字节数。
 * @param total 总字节数（0 表示响应头未给出，由发布元数据兜底）。
 */
async function emitProgress(downloaded: number, total?: number) {
    const { pending } = await currentDownload()
    pending.progress(downloaded, total)
}

/**
 * @description 让当前下载成功结束。
 */
async function finishDownload() {
    const { tempPath, pending } = await currentDownload()
    h.pending.delete(tempPath)
    pending.resolve()
}

/**
 * @description 让当前下载失败。
 * @param error 失败原因。
 */
async function failDownload(error: Error) {
    const { tempPath, pending } = await currentDownload()
    h.pending.delete(tempPath)
    pending.reject(error)
}

/**
 * @description 构造测试用分享发布。
 * @param id 发布 id。
 * @param overrides 需要覆盖的字段。
 * @returns 分享发布对象。
 */
function makeMod(id: string, overrides: Partial<GameMod> = {}): GameMod {
    return {
        id,
        name: `MOD-${id}`,
        category: "standalone",
        fileName: `${id}.zip`,
        fileSize: 200,
        status: "approved",
        userId: "user-1",
        downloads: 0,
        views: 0,
        likes: 0,
        isActive: true,
        createdAt: 1,
        updateAt: 100,
        latestVersion: { id: "v1", version: "1.0.0", fileName: `${id}.zip`, fileSize: 200, downloads: 0, createdAt: 1 },
        ...overrides,
    }
}

describe("modDownload 下载队列", () => {
    beforeEach(() => {
        h.installed.length = 0
        h.localMods.length = 0
        h.removed.length = 0
        h.requested.length = 0
        h.pending.clear()
        h.paused.length = 0
        h.deleted.length = 0
        h.imports.length = 0
        h.importOk = true
        h.jwtToken = "token"
        setActivePinia(createPinia())
    })

    it("串行执行：前一个任务下载完成前不会开始下一个", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        store.enqueue(makeMod("mod-b"))

        expect(store.tasks.map(task => task.status)).toEqual(["downloading", "pending"])
        // 串行：此刻只发起了第一个任务的下载请求，且走的是版本下载接口
        await vi.waitFor(() => expect(h.requested).toEqual(["https://api.test.invalid/api/mods/mod-a/versions/v1/download"]))
        expect(h.requested).toHaveLength(1)

        await finishDownload()
        // 下一个任务开始时，前一个任务已不再占用下载（进入安装或已完成）
        await vi.waitFor(() => expect(h.requested).toHaveLength(2))
        expect(store.tasks[0].status).not.toBe("downloading")
        expect(store.tasks[1].status).toBe("downloading")
    })

    it("下载过程中上报进度，进度只前进不回退，总大小缺失时用发布元数据兜底", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))

        await emitProgress(50, 200)
        expect(store.tasks[0].loaded).toBe(50)
        expect(store.tasks[0].progress).toBe(25)

        // 续传/重试导致后端报出更小的已下载字节数时，进度条保持原值
        await emitProgress(20, 200)
        expect(store.tasks[0].progress).toBe(25)

        // 响应头没给总大小（total = 0）时用发布元数据 fileSize 兜底
        await emitProgress(100, 0)
        expect(store.tasks[0].progress).toBe(50)
    })

    it("下载完成后从本地临时包解压安装，并删除临时包", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        const { tempPath } = await currentDownload()
        await finishDownload()

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("done"))
        expect(h.imports).toEqual([{ path: tempPath, entity: "独立" }])
        expect(h.deleted).toEqual([tempPath])
        expect(h.installed).toHaveLength(1)
        expect(h.installed[0]).toMatchObject({
            id: "mod-a",
            versionId: "v1",
            version: "1.0.0",
            localName: "MOD-mod-a v1.0.0",
            entity: "独立",
        })
        expect(store.installTick).toBe(1)
        expect(store.lastInstalledEntity).toBe("独立")
    })

    it("更新安装：先移除旧的本地 MOD，再写入新版本记录", async () => {
        h.localMods.push({ id: 7, entity: "独立", name: "MOD-mod-a v1.0.0", files: ["a.pak"], addTime: 1, size: 1, pic: "" })
        h.installed.push({
            id: "mod-a",
            versionId: "v1",
            version: "1.0.0",
            fileSize: 200,
            modUpdateAt: 100,
            localName: "MOD-mod-a v1.0.0",
            entity: "独立",
            installedAt: 1,
        })

        const store = useModDownloadStore()
        const mod = makeMod("mod-a", {
            updateAt: 300,
            latestVersion: { id: "v2", version: "1.1.0", fileName: "mod-a-1.1.0.zip", fileSize: 400, downloads: 0, createdAt: 300 },
        })
        store.enqueue(mod)
        // 最新版任务会锁定时解析到的版本 id，下载地址指向新版本
        await vi.waitFor(() => expect(h.requested).toEqual(["https://api.test.invalid/api/mods/mod-a/versions/v2/download"]))
        await finishDownload()

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("done"))
        expect(h.removed.map(item => item.id)).toEqual([7])
        expect(h.localMods).toHaveLength(0)
        expect(h.installed).toHaveLength(1)
        expect(h.installed[0]).toMatchObject({
            id: "mod-a",
            versionId: "v2",
            version: "1.1.0",
            localName: "MOD-mod-a v1.1.0",
            modUpdateAt: 300,
        })
    })

    it("某个任务失败不影响后续任务继续执行", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        store.enqueue(makeMod("mod-b"))

        await failDownload(new Error("网络错误"))

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("error"))
        expect(store.tasks[0].error).toBe("网络错误")
        // 失败的半成品临时包同样要清掉
        expect(h.deleted).toHaveLength(1)
        await vi.waitFor(() => expect(h.requested).toHaveLength(2))
    })

    it("解压安装失败时任务标记为失败且不写入安装记录", async () => {
        h.importOk = false
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        await finishDownload()

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("error"))
        expect(store.tasks[0].error).toBe("game-launcher.importModFailed")
        expect(h.installed).toHaveLength(0)
    })

    it("重试失败的任务会重新排队并执行", async () => {
        h.importOk = false
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        await finishDownload()
        await vi.waitFor(() => expect(store.tasks[0].status).toBe("error"))

        h.importOk = true
        store.retryTask(store.tasks[0].key)
        expect(store.tasks[0].status).toBe("downloading")
        await finishDownload()

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("done"))
        expect(h.installed).toHaveLength(1)
    })

    it("取消下载中的任务会通知 Rust 侧停止、移出队列并清理临时包", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        const { tempPath } = await currentDownload()

        store.cancelTask(store.tasks[0].key)
        expect(h.paused).toEqual([tempPath])
        await vi.waitFor(() => expect(store.tasks).toHaveLength(0))
        expect(h.deleted).toEqual([tempPath])
        expect(store.activeCount).toBe(0)
    })

    it("同一发布重复入队会被忽略", () => {
        const store = useModDownloadStore()
        expect(store.enqueue(makeMod("mod-a"))).toBe(true)
        expect(store.enqueue(makeMod("mod-a"))).toBe(false)
        expect(store.tasks).toHaveLength(1)
    })

    it("未登录时不允许入队", () => {
        h.jwtToken = ""
        const store = useModDownloadStore()
        expect(store.enqueue(makeMod("mod-a"))).toBe(false)
        expect(store.tasks).toHaveLength(0)
    })

    it("清空队列会移除全部任务并通知下载中的任务停止", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        store.enqueue(makeMod("mod-b"))
        const { tempPath } = await currentDownload()

        store.clearTasks()
        expect(store.tasks).toHaveLength(0)
        expect(h.paused).toEqual([tempPath])
        await vi.waitFor(() => expect(h.deleted).toEqual([tempPath]))
    })
})
