import { timingSafeEqual } from "node:crypto"
import { resolveUser } from "./auth"

/**
 * BUG 收集的请求身份。
 *
 * - `user`：登录账号（JWT 解出的服务端角色，高权限操作仍应回查数据库）
 * - `receipt`：匿名回执 token 原文，由上层 hash 后查表确认归属哪条 submission
 * - `worker`：内部 pipeline worker（`BUG_WORKER_TOKEN` 与用户 JWT 分密）
 * - `anonymous`：完全无凭据，仅能在限流后提交新反馈
 */
export type Actor =
    | { kind: "user"; userId: string; roles: string[] }
    | { kind: "receipt"; receiptToken: string }
    | { kind: "worker"; workerId: string }
    | { kind: "anonymous" }

/** 回执 token 口径：高熵随机串（base64url 字符集），长度限制挡住空值与超长垃圾输入。 */
const RECEIPT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

/** `Authorization: Receipt <token>` */
const RECEIPT_AUTH_PATTERN = /^Receipt\s+(\S+)$/i

/**
 * @description 恒定时间比较两个字符串，避免通过响应耗时猜测 worker token。
 * @param actual 请求携带的值
 * @param expected 服务端配置的值
 * @returns 是否相等
 */
function safeEqual(actual: string, expected: string): boolean {
    const actualBytes = Buffer.from(actual)
    const expectedBytes = Buffer.from(expected)
    if (actualBytes.length !== expectedBytes.length) return false
    return timingSafeEqual(actualBytes, expectedBytes)
}

/**
 * @description 解析请求身份：依次尝试用户 JWT（`token` 头 / `Authorization`）、匿名回执、内部 worker。
 * 完全没有任何凭据时返回 anonymous；携带了凭据但无法识别或无效时返回 null，由调用方拒绝而不是静默降级。
 * @param headers 请求头
 * @returns 身份；凭据无效时为 null
 */
export async function resolveActor(headers: Headers): Promise<Actor | null> {
    const tokenHeader = (headers.get("token") || "").trim()
    const authorization = (headers.get("authorization") || "").trim()

    if (tokenHeader || authorization) {
        const user = resolveUser(headers)
        if (user) return { kind: "user", userId: user.id, roles: Array.isArray(user.roles) ? user.roles : [] }
    }

    if (authorization) {
        const receiptMatch = RECEIPT_AUTH_PATTERN.exec(authorization)
        if (!receiptMatch) {
            // Authorization 存在但不是可识别的凭据：拒绝而不是静默降级成匿名
            return null
        }
        const receiptToken = receiptMatch[1]
        if (!RECEIPT_TOKEN_PATTERN.test(receiptToken)) return null
        return { kind: "receipt", receiptToken }
    }

    if (tokenHeader) return null

    const workerToken = headers.get("x-worker-token")?.trim()
    if (workerToken) {
        const expected = process.env.BUG_WORKER_TOKEN?.trim()
        if (!expected || !safeEqual(workerToken, expected)) return null
        const workerId = headers.get("x-worker-id")?.trim() || "default"
        return { kind: "worker", workerId }
    }

    return { kind: "anonymous" }
}
