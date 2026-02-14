import { computed, type WritableComputedRef } from "vue"
import { type LocationQuery, type LocationQueryValue, useRoute, useRouter } from "vue-router"

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
            const nextQuery: LocationQuery = { ...route.query }
            const currentRawValue = normalizeQueryValue(route.query[key])

            if (isValueEqual(value, defaultValue)) {
                if (currentRawValue === undefined) {
                    return
                }

                delete nextQuery[key]
                void router.replace({ query: nextQuery })
                return
            }

            const serializedValue = options?.serialize ? options.serialize(value) : serializeSearchParamValue(value)
            if (serializedValue === undefined) {
                if (currentRawValue === undefined) {
                    return
                }

                delete nextQuery[key]
                void router.replace({ query: nextQuery })
                return
            }

            if (serializedValue === currentRawValue) {
                return
            }

            nextQuery[key] = serializedValue
            void router.replace({ query: nextQuery })
        },
    })
}
