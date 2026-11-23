import Dexie, { type Table } from "dexie"
import {
    hydrateStoredGearItem,
    normalizeGearItem,
    resolveInlayAffixId,
    type TranscendGearItemConfig,
    type TranscendGearKind,
    toStoredGearItem,
} from "@/data"
import { hashGearItem } from "./hash"

/**
 * 升华装备库存：独立 Dexie 库 `dna-transcend-gear`（不写主库 `dna`、不写数据包库）。
 * 库存只存可复现源字段；显示快照与派生字段读取时重建。`hash` 非唯一，相同物品多份即多行。
 * 仓储接口另有内存实现，便于测试与 IndexedDB 不可用时的降级。
 */

/** IndexedDB 数据库名（与主库 / 数据包库分开，便于整体清理与容量排查） */
export const TRANSCEND_GEAR_DB_NAME = "dna-transcend-gear"
/** 库存备份 JSON 的类型标记 */
export const TRANSCEND_GEAR_STOCK_KIND = "dna-builder/transcend-gear-stock"

/** 库存行：`affixIds` 为多值索引（含宝石按槽解析出的词缀），供按词缀检索 */
export interface TranscendGearStockRow {
    id?: number
    hash: string
    item: TranscendGearItemConfig
    kind: TranscendGearKind
    /** 物品固有槽型（1-11） */
    slotType: number
    uniqueId?: number
    affixIds: number[]
    createdAt: number
    updatedAt: number
}

/** 库存筛选：槽型与类型可单独或组合使用 */
export interface TranscendGearStockFilter {
    slotType?: number
    kind?: TranscendGearKind
}

/** 导入结果 */
export interface TranscendGearImportResult {
    added: number
    skipped: number
    /** 旧数据缺 `socketCount`、按已镶嵌数推断已开孔数的件数 */
    inferredSockets: number
}

/** 导入选项 */
export interface TranscendGearImportOptions {
    /** 先清空库存再导入（备份还原）；缺省为追加合并 */
    replace?: boolean
}

/** 库存仓储接口：Dexie 与内存两种实现共用 */
export interface TranscendGearRepo {
    /** 列出库存（按更新时间倒序）；可按槽型 / 类型筛选 */
    list(filter?: TranscendGearStockFilter): Promise<TranscendGearStockRow[]>
    get(id: number): Promise<TranscendGearStockRow | null>
    /** 新增一件物品（写入前按当前数据归一化并计算 hash）；非法物品抛出 */
    add(item: TranscendGearItemConfig): Promise<TranscendGearStockRow>
    /** 批量新增：非法物品跳过 */
    addMany(items: readonly TranscendGearItemConfig[]): Promise<TranscendGearStockRow[]>
    /** 覆盖已有物品配置（保留 createdAt，刷新 hash 与 updatedAt） */
    update(id: number, item: TranscendGearItemConfig): Promise<TranscendGearStockRow | null>
    remove(id: number): Promise<void>
    clear(): Promise<void>
    /** 导出备份 JSON（物品只含可复现源字段，读取端重新推导派生字段） */
    exportJson(): Promise<string>
    /** 导入备份 JSON：按当前数据归一化，非法物品跳过 */
    importJson(text: string, options?: TranscendGearImportOptions): Promise<TranscendGearImportResult>
}

/** 数据库连接 */
class TranscendGearDatabase extends Dexie {
    items!: Table<TranscendGearStockRow, number>

    constructor() {
        super(TRANSCEND_GEAR_DB_NAME)
        this.version(1).stores({
            items: "++id, hash, kind, slotType, uniqueId, updatedAt, *affixIds, [kind+slotType]",
        })
    }
}

/** 数据库连接缓存（同一次页面生命周期内复用） */
let database: TranscendGearDatabase | null = null

/**
 * 取库存数据库实例（首次调用创建连接）。
 * @returns Dexie 数据库实例
 */
export function getTranscendGearDatabase(): TranscendGearDatabase {
    return (database ??= new TranscendGearDatabase())
}

/** 解析失败的统一错误 */
function invalidItem(): Error {
    return new Error("invalid transcend gear item")
}

/**
 * 由物品配置生成库存行（id / 时间戳由调用方补）。
 * `item` 只存可复现源字段（展示快照与派生字段读取时重建）；`hash` 仍按完整归一化物品计算。
 * @param item 归一化后的装备物品
 * @param now 写入时刻
 * @param createdAt 首次入库时刻
 * @returns 库存行（不含 id）
 */
function buildRow(item: TranscendGearItemConfig, now: number, createdAt = now): Omit<TranscendGearStockRow, "id"> {
    const affixIds = new Set<number>()
    if (item.kind === "unique" && item.uniqueAffix) affixIds.add(item.uniqueAffix.affixId)
    for (const roll of item.affixes) affixIds.add(roll.affixId)
    // 宝石词缀按物品槽型解析：检索时同一颗宝石在不同装备上命中不同词缀
    for (const socket of item.sockets ?? []) {
        const affixId = resolveInlayAffixId(socket.gemId, item.slotType)
        if (affixId !== null) affixIds.add(affixId)
    }
    return {
        hash: hashGearItem(item),
        item: toStoredGearItem(item),
        kind: item.kind,
        slotType: item.slotType,
        uniqueId: item.uniqueId,
        affixIds: [...affixIds].sort((left, right) => left - right),
        createdAt,
        updatedAt: now,
    }
}

/**
 * 读取时按当前数据还原派生字段；失败时保留原对象（旧行 / 脏数据不静默丢件）。
 * @param row 库存行
 * @returns 还原后的库存行
 */
function hydrateRow(row: TranscendGearStockRow): TranscendGearStockRow {
    const item = hydrateStoredGearItem(row.item)
    if (item) return { ...row, item }
    console.warn(`升华装备库存行 ${row.id ?? "?"} 还原失败，保留原对象`)
    return row
}

/**
 * 归一化待写入物品：库存自包含，未知词条 / 缺失专属词条不得裁剪或降级。
 * @param item 原始物品
 * @returns 归一化后的物品；槽型非法时抛出
 */
function normalizeForWrite(item: TranscendGearItemConfig): TranscendGearItemConfig {
    const normalized = normalizeGearItem(item, undefined, { preserveUnknown: true })
    if (!normalized) throw invalidItem()
    return normalized
}

/**
 * 备份条目是否需要推断已开孔数：有已镶嵌孔，但 `socketCount` 缺失或 ≤ 0（会被归一化抬高）的旧数据。
 * @param raw 备份中的原始物品
 * @returns 需要推断为 true
 */
function needsSocketCountInference(raw: unknown): boolean {
    if (!raw || typeof raw !== "object") return false
    const record = raw as { sockets?: unknown; socketCount?: unknown }
    if (!Array.isArray(record.sockets) || record.sockets.length === 0) return false
    const count = Number(record.socketCount)
    return !Number.isFinite(count) || count <= 0
}

/** 仓储的底层存储原语（两种实现各自提供） */
interface GearRepoCore {
    listRows(): Promise<TranscendGearStockRow[]>
    getRow(id: number): Promise<TranscendGearStockRow | null>
    insertRow(row: Omit<TranscendGearStockRow, "id">): Promise<TranscendGearStockRow>
    updateRow(id: number, row: Omit<TranscendGearStockRow, "id">): Promise<TranscendGearStockRow | null>
    removeRow(id: number): Promise<void>
    clearRows(): Promise<void>
    /** 原子替换整表（导入备份用：单事务 clear + insert，失败不清空库存） */
    replaceRows(rows: Omit<TranscendGearStockRow, "id">[]): Promise<void>
}

/**
 * 按更新时间倒序排列库存行（同刻按 id 倒序，保证顺序稳定）。
 * @param rows 库存行
 * @returns 排序后的新数组
 */
function sortRows(rows: readonly TranscendGearStockRow[]): TranscendGearStockRow[] {
    return [...rows].sort((left, right) => right.updatedAt - left.updatedAt || (right.id ?? 0) - (left.id ?? 0))
}

/**
 * 解析备份 JSON：兼容带标记的备份包、`{ items }` 容器与裸物品数组。
 * @param text 备份文本
 * @returns 待导入的原始物品列表
 */
function parseStockBackup(text: string): unknown[] {
    if (typeof text !== "string" || !text.trim()) throw new Error("empty gear backup")
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed
    if (!parsed || typeof parsed !== "object") throw new Error("invalid gear backup")
    const source = parsed as { items?: unknown }
    if (!Array.isArray(source.items)) throw new Error("invalid gear backup")
    return source.items.map(entry => (entry && typeof entry === "object" && "item" in entry ? (entry as { item: unknown }).item : entry))
}

/**
 * 用底层原语组装仓储接口（导入导出 / 归一化 / 排序在此统一实现）。
 * @param core 存储原语
 * @returns 仓储
 */
function createRepo(core: GearRepoCore): TranscendGearRepo {
    return {
        async list(filter) {
            const rows = sortRows(await core.listRows()).map(hydrateRow)
            if (!filter) return rows
            return rows.filter(row => {
                if (filter.slotType !== undefined && row.slotType !== filter.slotType) return false
                if (filter.kind !== undefined && row.kind !== filter.kind) return false
                return true
            })
        },
        async get(id) {
            const row = await core.getRow(Math.round(Number(id)))
            return row ? hydrateRow(row) : null
        },
        async add(item) {
            return core.insertRow(buildRow(normalizeForWrite(item), Date.now()))
        },
        async addMany(items) {
            const result: TranscendGearStockRow[] = []
            for (const item of Array.isArray(items) ? items : []) {
                const normalized = normalizeGearItem(item, undefined, { preserveUnknown: true })
                if (!normalized) continue
                result.push(await core.insertRow(buildRow(normalized, Date.now())))
            }
            return result
        },
        async update(id, item) {
            const existing = await core.getRow(Math.round(Number(id)))
            if (!existing) return null
            const normalized = normalizeForWrite(item)
            return core.updateRow(Math.round(Number(id)), buildRow(normalized, Date.now(), existing.createdAt))
        },
        async remove(id) {
            await core.removeRow(Math.round(Number(id)))
        },
        async clear() {
            await core.clearRows()
        },
        async exportJson() {
            const rows = sortRows(await core.listRows())
            // 旧行可能带快照 / 派生字段：先按当前数据还原再裁剪，备份只保留可复现源字段
            const items = rows.map(row => toStoredGearItem(hydrateStoredGearItem(row.item) ?? row.item))
            const payload = { kind: TRANSCEND_GEAR_STOCK_KIND, exportedAt: Date.now(), items }
            return JSON.stringify(payload)
        },
        async importJson(text, options) {
            const source = parseStockBackup(text)
            // 先归一化收集，再决定是否落库：备份文件损坏 / 全部非法时不得清空现有库存
            const normalizedItems: TranscendGearItemConfig[] = []
            let skipped = 0
            let inferredSockets = 0
            for (const raw of source) {
                const normalized = normalizeGearItem(raw, undefined, { preserveUnknown: true })
                if (normalized) {
                    normalizedItems.push(normalized)
                    if (needsSocketCountInference(raw)) inferredSockets += 1
                } else skipped += 1
            }
            if (options?.replace && source.length > 0 && normalizedItems.length === 0) {
                throw new Error("invalid gear backup")
            }
            const now = Date.now()
            const rows = normalizedItems.map(item => buildRow(item, now))
            if (options?.replace) await core.replaceRows(rows)
            else {
                for (const row of rows) await core.insertRow(row)
            }
            return { added: rows.length, skipped, inferredSockets }
        },
    }
}

/**
 * 创建 Dexie 库存仓储。
 * @param database 数据库实例（测试 / 降级时可注入）
 * @returns 仓储
 */
export function createDexieTranscendGearRepo(database?: TranscendGearDatabase): TranscendGearRepo {
    const db = database ?? getTranscendGearDatabase()
    return createRepo({
        listRows: () => db.items.toArray(),
        async getRow(id) {
            return (await db.items.get(id)) ?? null
        },
        async insertRow(row) {
            const id = await db.items.add(row as TranscendGearStockRow)
            return { ...row, id }
        },
        async updateRow(id, row) {
            if (!(await db.items.get(id))) return null
            await db.items.put({ ...row, id })
            return { ...row, id }
        },
        async removeRow(id) {
            await db.items.delete(id)
        },
        async clearRows() {
            await db.items.clear()
        },
        async replaceRows(rows) {
            // 单事务：中途失败会整体回滚，已有库存不会被清空
            await db.transaction("rw", db.items, async () => {
                await db.items.clear()
                for (const row of rows) await db.items.add(row as TranscendGearStockRow)
            })
        },
    })
}

/**
 * 创建内存库存仓储（单测与 IndexedDB 不可用 / 订阅失败时的降级）。
 * @param seed 初始行（保留原 id；缺 id 时顺序分配）
 * @returns 仓储
 */
export function createMemoryTranscendGearRepo(seed: readonly TranscendGearStockRow[] = []): TranscendGearRepo {
    const rows = new Map<number, TranscendGearStockRow>()
    let nextId = 1
    for (const row of seed) {
        const id = row.id ?? nextId
        rows.set(id, { ...row, id })
        nextId = Math.max(nextId, id + 1)
    }
    return createRepo({
        async listRows() {
            return [...rows.values()]
        },
        async getRow(id) {
            return rows.get(id) ?? null
        },
        async insertRow(row) {
            const id = nextId
            nextId += 1
            const saved = { ...row, id }
            rows.set(id, saved)
            return saved
        },
        async updateRow(id, row) {
            if (!rows.has(id)) return null
            const saved = { ...row, id }
            rows.set(id, saved)
            return saved
        },
        async removeRow(id) {
            rows.delete(id)
        },
        async clearRows() {
            rows.clear()
        },
        async replaceRows(next) {
            rows.clear()
            for (const row of next) {
                const id = nextId
                nextId += 1
                rows.set(id, { ...row, id })
            }
        },
    })
}
