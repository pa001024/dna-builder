import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import type { GameMod } from "@/api/gen/api-types"
import type { InstalledShareMod, Mod } from "@/store/db"
import { useModDownloadStore } from "./modDownload"

/**
 * 下载队列的行为测试：串行执行、进度上报、失败续跑、取消、更新时替换旧版本。
 * 这里把网络（modShare）、本地安装（game store）与数据库（db/liveQuery）都替换为可控桩，
 * 只验证队列自身的调度与状态机。
 */

/** 可控下载桩：按 key 挂起，测试里手动 resolve/reject。 */
interface PendingDownload {
    resolve: (bytes: ArrayBuffer) => void
    reject: (error: unknown) => void
    onProgress?: (progress: { loaded: number; total: number }) => void
}

const h = vi.hoisted(() => ({
    /** 本地安装记录表（模拟 Dexie，就地增删以保证 ref 响应性）。 */
    installed: [] as InstalledShareMod[],
    /** 本地 MOD 列表（按实体查询）。 */
    localMods: [] as Mod[],
    /** 已被移除的本地 MOD（更新安装应先删旧）。 */
    removed: [] as Mod[],
    /** 下载请求顺序（发布 id 或 `发布id:版本id`）。 */
    requested: [] as string[],
    /** 挂起中的下载。 */
    pending: new Map<string, PendingDownload>(),
    /** 导入是否成功。 */
    importOk: true,
    /** 当前登录令牌，为空表示未登录。 */
    jwtToken: "token",
}))

vi.mock("@/env", () => ({ env: { isApp: true, endpoint: "https://api.test.invalid", apiEndpoint: "https://api.test.invalid" } }))

vi.mock("i18next", () => ({ t: (key: string) => key }))

vi.mock("dexie", () => ({ liveQuery: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }))

vi.mock("@vueuse/rxjs", () => ({ useObservable: () => ref(h.installed) }))

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
        importModToEntity: vi.fn(async () => h.importOk),
    }),
}))

vi.mock("@/store/ui", () => ({
    useUIStore: () => ({ showSuccessMessage: vi.fn(), showErrorMessage: vi.fn() }),
}))

vi.mock("@/store/user", () => ({ useUserStore: () => ({ jwtToken: h.jwtToken }) }))

vi.mock("@/api/modShare", () => ({
    modDownloadUrl: (id: string) => `https://api.test.invalid/api/mods/${id}/download`,
    modVersionDownloadUrl: (modId: string, versionId: string) =>
        `https://api.test.invalid/api/mods/${modId}/versions/${versionId}/download`,
    isDownloadAbortedError: (error: unknown) => error instanceof Error && error.name === "AbortError",
    downloadGameMod: (id: string, _token: string, options?: { onProgress?: PendingDownload["onProgress"]; signal?: AbortSignal }) =>
        startDownload(id, options),
    downloadGameModVersion: (
        modId: string,
        versionId: string,
        _token: string,
        options?: { onProgress?: PendingDownload["onProgress"]; signal?: AbortSignal }
    ) => startDownload(`${modId}:${versionId}`, options),
}))

/**
 * @description 发起一次可控下载（记录请求顺序，挂起等待测试手动完成）。
 * @param key 下载标识。
 * @param options 进度与取消选项。
 * @returns 下载结果的 Promise。
 */
function startDownload(key: string, options?: { onProgress?: PendingDownload["onProgress"]; signal?: AbortSignal }) {
    h.requested.push(key)
    return new Promise<ArrayBuffer>((resolve, reject) => {
        h.pending.set(key, { resolve, reject, onProgress: options?.onProgress })
        options?.signal?.addEventListener("abort", () => {
            h.pending.delete(key)
            const error = new Error("aborted")
            error.name = "AbortError"
            reject(error)
        })
    })
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

/**
 * @description 计算挂起下载的 key（最新版任务也会锁定时解析到的版本，走版本下载接口）。
 * @param modId 发布 id。
 * @param versionId 版本 id。
 * @returns 下载标识。
 */
function downloadKey(modId: string, versionId = "v1") {
    return `${modId}:${versionId}`
}

/**
 * @description 完成挂起中的下载。
 * @param key 下载标识。
 * @param size 返回的字节数。
 */
function finishDownload(key: string, size = 200) {
    h.pending.get(key)?.resolve(new ArrayBuffer(size))
    h.pending.delete(key)
}

describe("modDownload 下载队列", () => {
    beforeEach(() => {
        h.installed.length = 0
        h.localMods.length = 0
        h.removed.length = 0
        h.requested.length = 0
        h.pending.clear()
        h.importOk = true
        h.jwtToken = "token"
        setActivePinia(createPinia())
    })

    it("串行执行：前一个任务下载完成前不会开始下一个", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        store.enqueue(makeMod("mod-b"))

        expect(store.tasks.map(task => task.status)).toEqual(["downloading", "pending"])
        expect(h.requested).toEqual([downloadKey("mod-a")])

        finishDownload(downloadKey("mod-a"))
        // 下一个任务开始时，前一个任务已不再占用下载（进入安装或已完成）
        await vi.waitFor(() => expect(h.requested).toHaveLength(2))
        expect(store.tasks[0].status).not.toBe("downloading")
        expect(store.tasks[1].status).toBe("downloading")
    })

    it("下载过程中上报进度，总量未知时为不确定进度", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))

        h.pending.get(downloadKey("mod-a"))?.onProgress?.({ loaded: 50, total: 200 })
        expect(store.tasks[0].loaded).toBe(50)
        expect(store.tasks[0].progress).toBe(25)

        h.pending.get(downloadKey("mod-a"))?.onProgress?.({ loaded: 80, total: 0 })
        expect(store.tasks[0].progress).toBeNull()
    })

    it("安装成功后写入已安装记录并通知刷新（独立分类）", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        finishDownload(downloadKey("mod-a"))

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("done"))
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
        finishDownload(downloadKey("mod-a", "v2"))

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

        const error = new Error("网络错误")
        h.pending.get(downloadKey("mod-a"))?.reject(error)
        h.pending.delete(downloadKey("mod-a"))

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("error"))
        expect(store.tasks[0].error).toBe("网络错误")
        await vi.waitFor(() => expect(h.requested).toEqual([downloadKey("mod-a"), downloadKey("mod-b")]))
    })

    it("安装失败时任务标记为失败且不写入安装记录", async () => {
        h.importOk = false
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        finishDownload(downloadKey("mod-a"))

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("error"))
        expect(store.tasks[0].error).toBe("game-launcher.importModFailed")
        expect(h.installed).toHaveLength(0)
    })

    it("重试失败的任务会重新排队并执行", async () => {
        h.importOk = false
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        finishDownload(downloadKey("mod-a"))
        await vi.waitFor(() => expect(store.tasks[0].status).toBe("error"))

        h.importOk = true
        store.retryTask(store.tasks[0].key)
        expect(store.tasks[0].status).toBe("downloading")
        finishDownload(downloadKey("mod-a"))

        await vi.waitFor(() => expect(store.tasks[0].status).toBe("done"))
        expect(h.installed).toHaveLength(1)
    })

    it("取消下载中的任务会中止请求并移出队列", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        const key = store.tasks[0].key

        store.cancelTask(key)
        await vi.waitFor(() => expect(store.tasks).toHaveLength(0))
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

    it("清空队列会移除全部任务并中止进行中的下载", async () => {
        const store = useModDownloadStore()
        store.enqueue(makeMod("mod-a"))
        store.enqueue(makeMod("mod-b"))

        store.clearTasks()
        expect(store.tasks).toHaveLength(0)
        await vi.waitFor(() => expect(h.pending.size).toBe(0))
    })
})
