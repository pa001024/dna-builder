import jwt from "jsonwebtoken"
import { type JWTUser, jwtToken } from "../db/yoga"

/** 解析请求头里的登录令牌（支持 `token` 与 `Authorization: Bearer`）；未登录或令牌无效时返回 null。 */
export function resolveUser(headers: Headers): JWTUser | null {
    const raw = (headers.get("token") || headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "").trim()
    if (!raw) return null
    try {
        return jwt.verify(raw, jwtToken) as JWTUser
    } catch {
        return null
    }
}

/** 统一的失败响应：写入状态码并返回 `{ success: false, error }`。 */
export function fail(set: { status?: number | string }, status: number, error: string) {
    set.status = status
    return { success: false as const, error }
}
