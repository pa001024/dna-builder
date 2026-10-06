/**
 * 数据集查询引擎。
 *
 * 全部为纯函数，只依赖「记录键 + 记录主体」的标准记录形态，不感知具体数据集，
 * 因此过滤 / 全文匹配 / 排序 / 投影 / 分页的口径都能被单测直接覆盖。
 *
 * 字段口径：
 * - 字段名支持 `a.b` 路径，遇到数组会自动按元素下钻（`特质.名称` 取到所有特质名）；
 * - 比较是宽松的：数字与数字字符串互认，数组字段按元素逐个匹配（任一命中即算命中）。
 */

/** 查询可用的记录形态（与注册表的 DataRecord 结构一致） */
export type QueryableRecord = {
    key: string
    data: Record<string, unknown>
}

/** 过滤算子 */
export type DataFilterOp = "EQ" | "NE" | "CONTAINS" | "IN" | "GT" | "GTE" | "LT" | "LTE" | "EXISTS"

/** 过滤条件 */
export type DataFilter = {
    field: string
    op?: DataFilterOp | null
    value?: unknown
}

/** 排序规则 */
export type DataSort = {
    field: string
    desc?: boolean | null
}

/** 查询参数 */
export type DataQuery = {
    where?: (DataFilter | null)[] | null
    search?: string | null
    sort?: (DataSort | null)[] | null
    fields?: (string | null)[] | null
    offset?: number | null
    limit?: number | null
}

/** 查询结果 */
export type DataQueryResult = {
    /** 过滤后总条数（分页前） */
    total: number
    /** 实际生效的偏移 */
    offset: number
    /** 实际生效的单页上限 */
    limit: number
    /** 本页条数 */
    count: number
    /** 本页记录 */
    items: QueryableRecord[]
}

/** 默认单页条数 */
export const DEFAULT_QUERY_LIMIT = 50

/** 单页条数上限（防止一次拉走整张表） */
export const MAX_QUERY_LIMIT = 500

/** 全文匹配的最大递归深度 */
const SEARCH_MAX_DEPTH = 6

/** 全文匹配单条记录的最大节点访问量（超大记录只扫描有限节点） */
const SEARCH_MAX_NODES = 20000

/**
 * 取字段值（支持 `a.b` 路径与数组下钻）。
 * @param record 记录主体
 * @param field 字段名
 * @returns 命中的全部值；字段不存在时为空数组
 */
export function resolveFieldValues(record: Record<string, unknown>, field: string): unknown[] {
    let current: unknown[] = [record]

    for (const segment of field.split(".")) {
        const next: unknown[] = []
        for (const item of current) {
            if (item === null || item === undefined) continue
            if (Array.isArray(item)) {
                // 数组按元素下钻，让 `特质.名称` 这类列表字段可用
                for (const element of item) {
                    if (element && typeof element === "object" && !Array.isArray(element)) {
                        const value = (element as Record<string, unknown>)[segment]
                        if (value !== undefined) next.push(value)
                    }
                }
            } else if (typeof item === "object") {
                const value = (item as Record<string, unknown>)[segment]
                if (value !== undefined) next.push(value)
            }
        }
        current = next
    }

    return current
}

/**
 * 判断字段值是否存在且非空。
 * @param value 字段值
 * @returns 是否存在有效值
 */
function isPresent(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return false
    if (Array.isArray(value)) return value.length > 0
    return true
}

/**
 * 宽松相等：数字 / 字符串 / 布尔按文本互认，数组按元素逐个比较，对象按 JSON 文本比较。
 * @param a 左值
 * @param b 右值
 * @returns 是否相等
 */
function looseEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a === undefined || a === null || b === undefined || b === null) return false
    if (Array.isArray(a)) return a.some(item => looseEquals(item, b))
    if (Array.isArray(b)) return b.some(item => looseEquals(a, item))
    if (typeof a === "object" || typeof b === "object") {
        return JSON.stringify(a) === JSON.stringify(b)
    }
    return String(a) === String(b)
}

/**
 * 判断字段值是否「包含」目标值。
 * @param value 字段值
 * @param target 目标值
 * @returns 是否包含
 */
function containsValue(value: unknown, target: unknown): boolean {
    if (target === undefined || target === null) return false
    if (Array.isArray(value)) return value.some(item => looseEquals(item, target))
    if (value === undefined || value === null) return false
    if (typeof value === "object") {
        return JSON.stringify(value).toLowerCase().includes(String(target).toLowerCase())
    }
    // 字符串取子串，数字 / 布尔退化为文本包含（便于用 "110" 命中 1101）
    return String(value).toLowerCase().includes(String(target).toLowerCase())
}

/** 可比较值的形态：0 = 数值，1 = 文本，2 = 不参与比较 */
type Comparable = { kind: 0 | 1 | 2; value: number | string }

/**
 * 把任意值转成可比较形态。
 * @param value 任意值
 * @returns 可比较形态
 */
function toComparable(value: unknown): Comparable {
    if (typeof value === "number") return { kind: 0, value }
    if (typeof value === "boolean") return { kind: 0, value: value ? 1 : 0 }
    if (typeof value === "string") {
        const trimmed = value.trim()
        if (trimmed !== "" && Number.isFinite(Number(trimmed))) return { kind: 0, value: Number(trimmed) }
        return { kind: 1, value }
    }
    return { kind: 2, value: "" }
}

/**
 * 比较两个值（数值优先，其次文本；不可比较的值排最后）。
 * @param a 左值
 * @param b 右值
 * @returns 负数表示 a 在前，正数表示 b 在前，0 表示相等
 */
export function compareValues(a: unknown, b: unknown): number {
    const left = toComparable(a)
    const right = toComparable(b)
    if (left.kind !== right.kind) return left.kind - right.kind
    if (left.kind === 2) return 0
    if (left.kind === 0) {
        const l = left.value as number
        const r = right.value as number
        return l === r ? 0 : l < r ? -1 : 1
    }
    const l = left.value as string
    const r = right.value as string
    return l === r ? 0 : l < r ? -1 : 1
}

/**
 * 把字段值列表摊平成可比较的标量列表（数组值展开，空值丢弃）。
 * @param values 字段值列表
 * @returns 标量列表
 */
function flattenComparables(values: unknown[]): unknown[] {
    const result: unknown[] = []
    for (const value of values) {
        if (Array.isArray(value)) {
            result.push(...value.filter(item => item !== undefined && item !== null))
        } else if (value !== undefined && value !== null) {
            result.push(value)
        }
    }
    return result
}

/**
 * 判定单条记录是否命中过滤条件。
 * @param record 记录
 * @param filter 过滤条件
 * @returns 是否命中
 */
export function matchFilter(record: QueryableRecord, filter: DataFilter): boolean {
    const values = resolveFieldValues(record.data, filter.field)

    switch (filter.op ?? "EQ") {
        case "EXISTS":
            return values.some(isPresent)
        case "EQ":
            return values.some(value => looseEquals(value, filter.value))
        case "NE":
            return !values.some(value => looseEquals(value, filter.value))
        case "IN": {
            const targets = Array.isArray(filter.value) ? filter.value : [filter.value]
            return values.some(value => targets.some(target => looseEquals(value, target)))
        }
        case "CONTAINS":
            return values.some(value => containsValue(value, filter.value))
        case "GT":
            return flattenComparables(values).some(value => compareValues(value, filter.value) > 0)
        case "GTE":
            return flattenComparables(values).some(value => compareValues(value, filter.value) >= 0)
        case "LT":
            return flattenComparables(values).some(value => compareValues(value, filter.value) < 0)
        case "LTE":
            return flattenComparables(values).some(value => compareValues(value, filter.value) <= 0)
        default:
            return false
    }
}

/**
 * 在记录内递归查找文本（键名与标量值都参与匹配）。
 * @param value 当前节点
 * @param needle 已转小写的关键词
 * @param depth 当前深度
 * @param budget 剩余节点预算
 * @returns 是否命中
 */
function scanForText(value: unknown, needle: string, depth: number, budget: { remaining: number }): boolean {
    if (typeof value === "string") return value.toLowerCase().includes(needle)
    if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase().includes(needle)
    if (!value || typeof value !== "object" || depth >= SEARCH_MAX_DEPTH || budget.remaining <= 0) return false

    budget.remaining -= 1
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        // 键名也算命中（如特效表的 `@近战增伤`）
        if (key.toLowerCase().includes(needle)) return true
        if (scanForText(child, needle, depth + 1, budget)) return true
    }
    return false
}

/**
 * 判定记录是否命中全文匹配（大小写不敏感，跨字段）。
 * @param record 记录
 * @param keyword 关键词
 * @returns 是否命中；关键词为空视为命中
 */
export function matchSearch(record: QueryableRecord, keyword: string): boolean {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return true
    if (record.key.toLowerCase().includes(needle)) return true
    return scanForText(record.data, needle, 0, { remaining: SEARCH_MAX_NODES })
}

/**
 * 按排序规则比较两条记录。
 *
 * 缺值的字段恒排最后（不受 desc 影响），保证分页结果稳定可预期。
 * @param a 左记录
 * @param b 右记录
 * @param sorts 排序规则（按顺序生效）
 * @returns 负数表示 a 在前
 */
export function compareRecords(a: QueryableRecord, b: QueryableRecord, sorts: DataSort[]): number {
    for (const sort of sorts) {
        const left = flattenComparables(resolveFieldValues(a.data, sort.field))
        const right = flattenComparables(resolveFieldValues(b.data, sort.field))
        if (left.length === 0 || right.length === 0) {
            if (left.length === 0 && right.length === 0) continue
            return left.length === 0 ? 1 : -1
        }
        const compared = compareValues(left[0], right[0])
        if (compared !== 0) return sort.desc ? -compared : compared
    }
    return 0
}

/**
 * 按字段列表投影记录（只保留顶层字段）。
 * @param record 记录
 * @param fields 字段名列表，含 `a.b` 时取顶层 `a`；为空表示不投影
 * @returns 投影后的记录；`fields` 为空时原样返回
 */
export function projectRecord(record: QueryableRecord, fields: string[]): QueryableRecord {
    if (fields.length === 0) {
        return record
    }

    const projected: Record<string, unknown> = {}
    for (const field of fields) {
        const top = field.split(".")[0]
        if (Object.hasOwn(record.data, top)) {
            projected[top] = record.data[top]
        }
    }
    return { key: record.key, data: projected }
}

/**
 * 归一化单页条数。
 * @param limit 请求值
 * @returns 生效值（0 表示不返回记录）
 */
function clampLimit(limit: number | null | undefined): number {
    if (limit === null || limit === undefined || !Number.isFinite(limit) || limit < 0) {
        return DEFAULT_QUERY_LIMIT
    }
    return Math.min(Math.floor(limit), MAX_QUERY_LIMIT)
}

/**
 * 归一化偏移量。
 * @param offset 请求值
 * @returns 生效值
 */
function clampOffset(offset: number | null | undefined): number {
    if (offset === null || offset === undefined || !Number.isFinite(offset) || offset < 0) {
        return 0
    }
    return Math.floor(offset)
}

/**
 * 执行一次数据查询：过滤 → 全文匹配 → 排序 → 分页 → 投影。
 * @param records 数据集记录
 * @param query 查询参数
 * @returns 查询结果（total 为过滤后总数，items 为本页记录）
 */
export function runDataQuery(records: QueryableRecord[], query: DataQuery): DataQueryResult {
    const filters = (query.where ?? []).filter((item): item is DataFilter => Boolean(item?.field))
    const sorts = (query.sort ?? []).filter((item): item is DataSort => Boolean(item?.field))
    const fields = (query.fields ?? []).filter((item): item is string => Boolean(item))
    const keyword = (query.search ?? "").trim()
    const limit = clampLimit(query.limit)
    const offset = clampOffset(query.offset)

    let matched = records
    if (filters.length > 0) {
        matched = matched.filter(record => filters.every(filter => matchFilter(record, filter)))
    }
    if (keyword) {
        matched = matched.filter(record => matchSearch(record, keyword))
    }

    const total = matched.length
    if (sorts.length > 0) {
        matched = [...matched].sort((a, b) => compareRecords(a, b, sorts))
    }

    const page = matched.slice(offset, offset + limit)
    const items = fields.length > 0 ? page.map(record => projectRecord(record, fields)) : page

    return { total, offset, limit, count: items.length, items }
}
