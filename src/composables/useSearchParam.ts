import { computed, type WritableComputedRef } from "vue"
import { type LocationQuery, type LocationQueryValue, type Router, useRoute, useRouter } from "vue-router"

/**
 * URL 参数绑定配置。
 */
export interface UseSearchParamOptions<T> {
    /**
     * 自定义反序列化方法。
     */
    parse?: (rawValue: string) => T
    /**
     * 自定义序列化方法。
     */
    serialize?: (value: T) => string | undefined
}

/**
 * 将 query 原始值标准化为单个字符串。
 * @param queryValue query 值
 * @returns 标准化后的字符串
 */
function normalizeQueryValue(queryValue: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
    if (Array.isArray(queryValue)) {
        for (const item of queryValue) {
            if (item !== null && item !== undefined) {
                return item
            }
        }
        return undefined
    }

    if (queryValue === null || queryValue === undefined) {
        return undefined
    }

    return queryValue
}

/**
 * 判断两个值是否相等，用于决定是否从 URL 中移除默认值。
 * @param left 左值
 * @param right 右值
 * @returns 是否相等
 */
function isValueEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
        return true
    }

    if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
        return false
    }

    try {
        return JSON.stringify(left) === JSON.stringify(right)
    } catch {
        return false
    }
}

/**
 * 将值序列化为 query 字符串。
 * @param value 待序列化值
 * @returns query 字符串
 */
function serializeSearchParamValue<T>(value: T): string | undefined {
    if (value === null || value === undefined) {
        return undefined
    }

    if (typeof value === "string") {
        return value
    }

    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value)
    }

    try {
        return JSON.stringify(value)
    } catch {
        return undefined
    }
}

interface PendingQueryReplace {
    /** 发起写入时的路由路径：提交时若已离开该页面则直接丢弃，避免旧页面的 query 污染新页面 */
    path: string
    /** 待提交的键变更：值为 undefined 表示删除该键 */
    changes: Map<string, string | undefined>
    scheduled: boolean
}

const pendingQueryReplaceMap = new WeakMap<Router, PendingQueryReplace>()

/**
 * 获取或创建当前 router 的待提交批次。
 * 同一个 tick 内多次写入会合并进同一批次；若中途发生了跨页面跳转，
 * 则旧批次直接作废（旧页面的 query 快照绝不带到新页面）。
 * @param router 路由实例
 * @param path 发起写入时的路由路径
 * @returns 待提交批次
 */
function getPendingQueryReplace(router: Router, path: string): PendingQueryReplace {
    const existing = pendingQueryReplaceMap.get(router)
    if (existing && existing.path === path) {
        return existing
    }

    const pending: PendingQueryReplace = {
        path,
        changes: new Map(),
        scheduled: false,
    }
    pendingQueryReplaceMap.set(router, pending)
    return pending
}

/**
 * 调度一次 query 合并写回。
 * 提交时以当前路由的 query 为基底合并变更（而不是写入时的快照），
 * 且一旦发现已经离开写入时的页面就直接丢弃——
 * 否则 `router.replace({ query })` 会把旧页面的搜索词涂到新页面的 URL 上。
 * @param router 路由实例
 * @param pending 待提交批次
 */
function scheduleQueryReplace(router: Router, pending: PendingQueryReplace) {
    if (pending.scheduled) return
    pending.scheduled = true

    queueMicrotask(() => {
        if (pendingQueryReplaceMap.get(router) !== pending) return

        pendingQueryReplaceMap.delete(router)

        const currentRoute = router.currentRoute.value
        if (currentRoute.path !== pending.path) return

        const nextQuery: LocationQuery = { ...currentRoute.query }
        let changed = false
        for (const [key, rawValue] of pending.changes) {
            const currentRawValue = normalizeQueryValue(nextQuery[key])
            if (rawValue === undefined) {
                if (currentRawValue !== undefined) {
                    delete nextQuery[key]
                    changed = true
                }
                continue
            }
            if (rawValue !== currentRawValue) {
                nextQuery[key] = rawValue
                changed = true
            }
        }

        if (!changed) return
        void router.replace({ query: nextQuery })
    })
}

/**
 * 按默认值类型解析 query 字符串。
 * @param rawValue query 原始字符串
 * @param defaultValue 默认值
 * @param options URL 参数绑定配置
 * @returns 解析后的值
 */
function parseSearchParamValue<T>(rawValue: string | undefined, defaultValue: T, options?: UseSearchParamOptions<T>): T {
    if (rawValue === undefined) {
        return defaultValue
    }

    if (options?.parse) {
        try {
            return options.parse(rawValue)
        } catch {
            return defaultValue
        }
    }

    if (typeof defaultValue === "string") {
        return rawValue as T
    }

    if (typeof defaultValue === "number") {
        const parsedNumber = Number(rawValue)
        return (Number.isFinite(parsedNumber) ? parsedNumber : defaultValue) as T
    }

    if (typeof defaultValue === "boolean") {
        if (rawValue === "1" || rawValue.toLowerCase() === "true") {
            return true as T
        }
        if (rawValue === "0" || rawValue.toLowerCase() === "false") {
            return false as T
        }
        return defaultValue
    }

    try {
        return JSON.parse(rawValue) as T
    } catch {
        return defaultValue
    }
}

/**
 * 解析“数字或空字符串”类型的 query 参数。
 * @param rawValue query 原始字符串
 * @returns 数字或空字符串
 */
export function parseNumberOrEmptySearchParam(rawValue: string): number | "" {
    if (rawValue.trim() === "") {
        return ""
    }

    const parsedNumber = Number(rawValue)
    return Number.isFinite(parsedNumber) ? parsedNumber : ""
}

/**
 * 基于 URL query 参数创建可读写的响应式状态。
 * 读取时按默认值类型自动反序列化；写入时使用 router.replace 覆盖当前历史记录。
 * 同一个 tick 内的多次写入会合并为一次提交；提交时若已离开写入时的页面则直接丢弃，
 * 跨页面的 query 参数不会相互泄露。
 * @param key query 参数名
 * @param defaultValue 默认值
 * @param options URL 参数绑定配置
 * @returns 可读写 computed
 */
export function useSearchParam<T>(key: string, defaultValue: T, options?: UseSearchParamOptions<T>): WritableComputedRef<T> {
    const route = useRoute()
    const router = useRouter()

    return computed<T>({
        get() {
            const rawValue = normalizeQueryValue(route.query[key])
            return parseSearchParamValue(rawValue, defaultValue, options)
        },
        set(value) {
            const pending = getPendingQueryReplace(router, route.path)

            if (isValueEqual(value, defaultValue)) {
                pending.changes.set(key, undefined)
                scheduleQueryReplace(router, pending)
                return
            }

            const serializedValue = options?.serialize ? options.serialize(value) : serializeSearchParamValue(value)
            pending.changes.set(key, serializedValue)
            scheduleQueryReplace(router, pending)
        },
    })
}
