import { afterEach, describe, expect, it } from "bun:test"
import jwt from "jsonwebtoken"
import { jwtToken } from "../db/yoga"
import { resolveActor } from "./actor"

/** 合法的回执 token：base64url 字符集、长度 43 */
const RECEIPT_TOKEN = "a".repeat(43)

/**
 * @description 生成与 resolveUser 同密钥的登录令牌。
 */
function createToken(payload: Record<string, unknown>) {
    return jwt.sign(payload, jwtToken)
}

afterEach(() => {
    delete process.env.BUG_WORKER_TOKEN
})

describe("resolveActor", () => {
    it("识别 token 头里的 JWT", async () => {
        const token = createToken({ id: "user-1", name: "tester", roles: ["user", "mod"] })
        const actor = await resolveActor(new Headers({ token }))
        expect(actor).toEqual({ kind: "user", userId: "user-1", roles: ["user", "mod"] })
    })

    it("识别 Authorization: Bearer JWT，roles 缺省为空数组", async () => {
        const token = createToken({ id: "user-2", name: "tester" })
        const actor = await resolveActor(new Headers({ authorization: `Bearer ${token}` }))
        expect(actor).toEqual({ kind: "user", userId: "user-2", roles: [] })
    })

    it("JWT 无效时返回 null，不降级为匿名", async () => {
        const actor = await resolveActor(new Headers({ token: "not-a-jwt" }))
        expect(actor).toBeNull()
    })

    it("兼容 Authorization 里直接放 JWT（与 resolveUser 口径一致）", async () => {
        const token = createToken({ id: "user-raw", name: "tester", roles: [] })
        const actor = await resolveActor(new Headers({ authorization: token }))
        expect(actor).toEqual({ kind: "user", userId: "user-raw", roles: [] })
    })

    it("无法识别的 Authorization 方案返回 null", async () => {
        expect(await resolveActor(new Headers({ authorization: "Basic abc" }))).toBeNull()
        expect(await resolveActor(new Headers({ authorization: "Bearer" }))).toBeNull()
        expect(await resolveActor(new Headers({ authorization: "Bearer not-a-jwt" }))).toBeNull()
    })

    it("识别 Authorization: Receipt <token>", async () => {
        const actor = await resolveActor(new Headers({ authorization: `Receipt ${RECEIPT_TOKEN}` }))
        expect(actor).toEqual({ kind: "receipt", receiptToken: RECEIPT_TOKEN })
    })

    it("回执 token 为空、过短或含非法字符时返回 null", async () => {
        expect(await resolveActor(new Headers({ authorization: "Receipt " }))).toBeNull()
        expect(await resolveActor(new Headers({ authorization: "Receipt short" }))).toBeNull()
        expect(await resolveActor(new Headers({ authorization: `Receipt ${"a".repeat(43)}!` }))).toBeNull()
    })

    it("识别 X-Worker-Token（与用户 JWT 分密）", async () => {
        process.env.BUG_WORKER_TOKEN = "worker-secret"
        const actor = await resolveActor(new Headers({ "x-worker-token": "worker-secret", "x-worker-id": "w-1" }))
        expect(actor).toEqual({ kind: "worker", workerId: "w-1" })
    })

    it("worker token 未配置或不匹配时返回 null", async () => {
        expect(await resolveActor(new Headers({ "x-worker-token": "worker-secret" }))).toBeNull()

        process.env.BUG_WORKER_TOKEN = "worker-secret"
        expect(await resolveActor(new Headers({ "x-worker-token": "wrong" }))).toBeNull()
    })

    it("完全无凭据时返回 anonymous", async () => {
        expect(await resolveActor(new Headers())).toEqual({ kind: "anonymous" })
    })

    it("多种凭据并存时用户身份优先", async () => {
        process.env.BUG_WORKER_TOKEN = "worker-secret"
        const token = createToken({ id: "user-3", name: "tester", roles: [] })
        const actor = await resolveActor(new Headers({ token, "x-worker-token": "worker-secret" }))
        expect(actor?.kind).toBe("user")
    })
})
