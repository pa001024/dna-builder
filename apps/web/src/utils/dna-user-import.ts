import { DNAAPI } from "dna-api"
import type { UDNAUser } from "@/store/db"

type JsonObject = Record<string, unknown>

/**
 * 判断值是否为可读取的 JSON 对象。
 * @param value 待判断的 JSON 值
 * @returns 是否为非数组对象
 */
function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * 从多个候选字段中读取文本值，并兼容数字形式的 ID。
 * @param data JSON 对象
 * @param keys 候选字段名
 * @returns 第一个非空文本值
 */
function readText(data: JsonObject, ...keys: string[]): string | undefined {
    for (const key of keys) {
        const value = data[key]
        if (typeof value === "string" && value.length > 0) return value
        if (typeof value === "number" && Number.isFinite(value)) return String(value)
    }
    return undefined
}

/**
 * 读取数字字段，兼容官方接口返回的数字字符串。
 * @param data JSON 对象
 * @param key 字段名
 * @returns 数字值，不存在或无效时返回 undefined
 */
function readNumber(data: JsonObject, key: string): number | undefined {
    const value = data[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

/**
 * 选择账号数据本体，兼容官方 API 响应和直接复制 data 字段的格式。
 * @param value JSON 根对象
 * @returns 账号数据对象
 */
function getAccountData(value: JsonObject): JsonObject {
    const containsAccountFields = "uid" in value || "userId" in value || "token" in value
    return !containsAccountFields && isJsonObject(value.data) ? value.data : value
}

/**
 * 将账号 JSON 文本归一化为本地 IndexedDB 使用的账号结构。
 * @param json 账号 JSON 文本
 * @returns 可写入本地数据库的账号数据
 * @throws JSON 格式错误或缺少用户 ID/token 时抛出错误
 */
export function parseDnaUserImportJson(json: string): UDNAUser {
    const parsed: unknown = JSON.parse(json)
    if (!isJsonObject(parsed)) {
        throw new Error("账号 JSON 必须是对象")
    }

    const data = getAccountData(parsed)
    const uid = readText(data, "uid", "userId")
    const token = readText(data, "token")
    if (!uid || !token) {
        throw new Error("账号 JSON 缺少 userId/uid 或 token")
    }

    const server = readText(data, "server")
    const userData: UDNAUser = {
        uid,
        name: readText(data, "name", "userName") || uid,
        dev_code: readText(data, "dev_code", "devCode", "devcode", "dNum") || DNAAPI.generateDeviceCode(),
        token,
        server: server === "global" || (!server && !!readText(data, "registerLang")) ? "global" : "cn",
        kf_token: readText(data, "kf_token", "kfToken") || "",
        refreshToken: readText(data, "refreshToken") || "",
        pic: readText(data, "pic", "headUrl") || "",
        status: readNumber(data, "status") ?? 0,
        isComplete: readNumber(data, "isComplete") ?? 0,
    }

    const isOfficial = readNumber(data, "isOfficial")
    const isRegister = readNumber(data, "isRegister")
    if (isOfficial !== undefined) userData.isOfficial = isOfficial
    if (isRegister !== undefined) userData.isRegister = isRegister
    return userData
}
