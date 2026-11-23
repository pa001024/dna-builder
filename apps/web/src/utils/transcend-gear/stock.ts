import { liveQuery } from "dexie"
import { ref } from "vue"
import { hydrateStoredGearItem, normalizeGearItem, type TranscendGearItemConfig } from "@/data"
import { hashGearItem, isSameGearItem } from "./hash"
import {
    createDexieTranscendGearRepo,
    createMemoryTranscendGearRepo,
    type TranscendGearImportOptions,
    type TranscendGearImportResult,
    type TranscendGearRepo,
    type TranscendGearStockFilter,
    type TranscendGearStockRow,
} from "./repo"

/**
 * 升华装备库存单例：Dexie 仓储 + `liveQuery` 自动刷新；IndexedDB 不可用或订阅失败时
 * 降级为内存仓储并保留当前行。仓储只存可复现源字段，派生字段读取时按当前数据重建；
 * 归属判定同时看 hash 与品质 / 强度 / 基础名 / 赛季（旧物品缺字段视为通配）。
 */

/** 库存订阅器（测试可注入以模拟 liveQuery 失败） */
export type TranscendGearStockWatcher = (
    loader: () => Promise<TranscendGearStockRow[]>,
    observer: { next: (value: TranscendGearStockRow[]) => void; error: (cause: unknown) => void }
) => { unsubscribe(): void }

/** 库存单例的可替换依赖 */
export interface TranscendGearStockOptions {
    createDexieRepo?: () => TranscendGearRepo
    createMemoryRepo?: (seed?: readonly TranscendGearStockRow[]) => TranscendGearRepo
    watch?: TranscendGearStockWatcher
    /** 是否具备 IndexedDB（测试注入 false 走内存降级） */
    hasIndexedDB?: () => boolean
}

/** 默认订阅：Dexie `liveQuery` */
const defaultWatcher: TranscendGearStockWatcher = (loader, observer) => liveQuery(loader).subscribe(observer)

/**
 * 仓储写入返回的行只含源字段：按当前数据还原派生字段，调用方（装备 / 展示）可直接使用。
 * @param row 库存行
 * @returns 还原后的库存行
 */
function hydrateRow(row: TranscendGearStockRow): TranscendGearStockRow {
    const item = hydrateStoredGearItem(row.item)
    return item ? { ...row, item } : row
}

/**
 * 创建库存控制器（默认导出单例使用，测试可注入仓储与订阅器）。
 * @param options 依赖覆盖
 * @returns 库存状态与操作
 */
export function createTranscendGearStock(options: TranscendGearStockOptions = {}) {
    const createDexieRepo = options.createDexieRepo ?? (() => createDexieTranscendGearRepo())
    const createMemoryRepo = options.createMemoryRepo ?? ((seed?: readonly TranscendGearStockRow[]) => createMemoryTranscendGearRepo(seed))
    const watch = options.watch ?? defaultWatcher
    const hasIndexedDB = options.hasIndexedDB ?? (() => typeof indexedDB !== "undefined")

    const rows = ref<TranscendGearStockRow[]>([])
    const initialized = ref(false)
    const loading = ref(false)
    const usingMemory = ref(false)
    const error = ref("")

    let repo: TranscendGearRepo | null = null
    let subscription: { unsubscribe(): void } | null = null
    let initializing: Promise<void> | null = null

    /** 把异常转成可展示文本 */
    function errorText(cause: unknown): string {
        return cause instanceof Error ? cause.message : String(cause)
    }

    /** 内存仓储写后刷新（Dexie 由 liveQuery 推送） */
    async function refresh(): Promise<void> {
        if (!repo) return
        rows.value = await repo.list()
    }

    /** 订阅失败：停止订阅并切到内存仓储，当前行原样保留 */
    function degrade(cause: unknown): void {
        subscription?.unsubscribe()
        subscription = null
        repo = createMemoryRepo(rows.value)
        usingMemory.value = true
        error.value = errorText(cause)
        loading.value = false
    }

    /**
     * 初始化库存（首次调用创建仓储并订阅 `liveQuery`）。
     * IndexedDB 不可用或首次读取失败时整体降级为内存仓储，并在界面提示。
     */
    async function init(): Promise<void> {
        if (initialized.value) return
        if (initializing) return initializing
        initializing = (async () => {
            loading.value = true
            try {
                if (!hasIndexedDB()) throw new Error("IndexedDB unavailable")
                const dexieRepo = createDexieRepo()
                rows.value = await dexieRepo.list()
                repo = dexieRepo
                error.value = ""
                subscription = watch(() => dexieRepo.list(), {
                    next: value => {
                        rows.value = value
                        loading.value = false
                    },
                    error: cause => degrade(cause),
                })
            } catch (cause) {
                subscription?.unsubscribe()
                subscription = null
                repo = createMemoryRepo(rows.value)
                usingMemory.value = true
                error.value = errorText(cause)
                rows.value = await repo.list()
            } finally {
                initialized.value = true
                loading.value = false
                initializing = null
            }
        })()
        return initializing
    }

    /** 获取仓储（必要时初始化） */
    async function ensureRepo(): Promise<TranscendGearRepo> {
        await init()
        if (!repo) throw new Error("transcend gear stock unavailable")
        return repo
    }

    /**
     * 加入库存（仓储只存源字段；返回行已按当前数据还原派生字段，调用方可直接装备 / 展示）。
     * @param item 装备物品
     * @returns 库存行
     */
    async function add(item: TranscendGearItemConfig): Promise<TranscendGearStockRow> {
        const target = await ensureRepo()
        const saved = await target.add(item)
        if (usingMemory.value) await refresh()
        return hydrateRow(saved)
    }

    /**
     * 更新库存行（保留 createdAt，重算 hash）。
     * @param id 行 id
     * @param item 新物品
     * @returns 更新后的行；行不存在时为 null
     */
    async function update(id: number, item: TranscendGearItemConfig): Promise<TranscendGearStockRow | null> {
        const target = await ensureRepo()
        const saved = await target.update(id, item)
        if (usingMemory.value) await refresh()
        return saved ? hydrateRow(saved) : null
    }

    /**
     * 删除库存行（仅从库存移除，不改动已装备配置）。
     * @param id 行 id
     */
    async function remove(id: number): Promise<void> {
        const target = await ensureRepo()
        await target.remove(id)
        if (usingMemory.value) await refresh()
    }

    /**
     * 按槽型 / 类型筛选库存（用于弹窗）。
     * @param filter 筛选条件
     * @returns 库存行
     */
    async function list(filter?: TranscendGearStockFilter): Promise<TranscendGearStockRow[]> {
        const target = await ensureRepo()
        return target.list(filter)
    }

    /**
     * 导出库存备份 JSON。
     * @returns JSON 文本
     */
    async function exportJson(): Promise<string> {
        const target = await ensureRepo()
        return target.exportJson()
    }

    /**
     * 导入库存备份 JSON。
     * @param text 备份文本
     * @param options 导入选项
     * @returns 导入结果
     */
    async function importJson(text: string, options?: TranscendGearImportOptions): Promise<TranscendGearImportResult> {
        const target = await ensureRepo()
        const result = await target.importJson(text, options)
        if (usingMemory.value) await refresh()
        return result
    }

    /**
     * 库存中与给定物品同一身份的行。
     * 存储的 `hash` 可能是旧版本前缀（tg1 / tg2）：命中失败时先把行内物品按当前口径归一化
     * （补齐 craft 状态、统一装备级精锻）再重算 hash 比较，避免 hash 版本升级后旧库存全部
     * 显示「未拥有」。只读兜底，不改写库存行。
     * @param item 装备物品
     * @returns 匹配的库存行
     */
    function matchingRows(item: TranscendGearItemConfig): TranscendGearStockRow[] {
        const hash = hashGearItem(item)
        return rows.value.filter(row => {
            if (row.hash === hash) return isSameGearItem(row.item, item)
            const normalized = normalizeGearItem(row.item, undefined, { preserveUnknown: true })
            return normalized !== null && hashGearItem(normalized) === hash && isSameGearItem(normalized, item)
        })
    }

    /**
     * 判断物品是否已在库存（hash + 元数据身份，含多份）。
     * @param item 装备物品
     * @returns 拥有为 true
     */
    function owns(item: TranscendGearItemConfig): boolean {
        return matchingRows(item).length > 0
    }

    /**
     * 物品在库存中的份数（同一身份才计数）。
     * @param item 装备物品
     * @returns 份数
     */
    function ownedCount(item: TranscendGearItemConfig): number {
        return matchingRows(item).length
    }

    /** 停止 liveQuery 订阅（页面销毁 / HMR 时调用） */
    function dispose(): void {
        subscription?.unsubscribe()
        subscription = null
    }

    return {
        rows,
        initialized,
        loading,
        usingMemory,
        error,
        init,
        add,
        update,
        remove,
        list,
        exportJson,
        importJson,
        owns,
        ownedCount,
        matchingRows,
        refresh,
        dispose,
    }
}

export const transcendGearStock = createTranscendGearStock()
