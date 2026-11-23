import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import type { InboxWriteInput } from "./server-client.ts"
import { createWebhookApp, verifyGithubSignature } from "./webhook.ts"

const SECRET = "test-webhook-secret"
const WEBHOOK_PATH = "/bug-sync/webhook"

function sign(body: string, secret = SECRET): string {
    return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
}

function issuesPayload(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        action: "opened",
        repository: { id: 42, full_name: "owner/repo" },
        installation: { id: 7 },
        issue: { number: 3 },
        ...overrides,
    })
}

function createServerMock() {
    const deliveries = new Map<string, InboxWriteInput>()
    const writes: InboxWriteInput[] = []
    let down = false
    return {
        writes,
        deliveries,
        setDown(value: boolean) {
            down = value
        },
        async writeInbox(input: InboxWriteInput) {
            if (down) throw new Error("connect ECONNREFUSED")
            writes.push(input)
            const duplicate = deliveries.has(input.deliveryId)
            deliveries.set(input.deliveryId, input)
            return { ok: true, duplicate }
        },
    }
}

function createApp(server = createServerMock()) {
    const app = createWebhookApp({
        config: { webhookSecret: SECRET, webhookHost: "127.0.0.1", webhookPort: 0, webhookPath: WEBHOOK_PATH },
        registry: {
            isAllowed: ({ repositoryId, fullName }) => String(repositoryId) === "42" && fullName === "owner/repo",
        },
        server,
    })
    return { app, server }
}

type PostOptions = {
    body?: string
    event?: string
    delivery?: string
    signature?: string
    headers?: Record<string, string>
}

async function post(app: ReturnType<typeof createWebhookApp>, options: PostOptions = {}) {
    const body = options.body ?? issuesPayload()
    const res = await app.handle(
        new Request(`http://localhost${WEBHOOK_PATH}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-github-event": options.event ?? "issues",
                "x-github-delivery": options.delivery ?? "delivery-1",
                "x-hub-signature-256": options.signature ?? sign(body),
                ...options.headers,
            },
            body,
        })
    )
    return { status: res.status, json: (await res.json()) as Record<string, any> }
}

describe("verifyGithubSignature", () => {
    const body = issuesPayload()

    test("正确签名通过", () => {
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), sign(body))).toBe(true)
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), sign(body).toUpperCase().replace("SHA256=", "sha256="))).toBe(
            true
        )
    })

    test("错误签名被拒绝", () => {
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), sign(body, "other-secret"))).toBe(false)
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(`${body} `), sign(body))).toBe(false)
    })

    test("格式不合法的签名头被拒绝", () => {
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), null)).toBe(false)
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), "")).toBe(false)
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), "sha1=abcd")).toBe(false)
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), "sha256=abc")).toBe(false)
        expect(verifyGithubSignature(SECRET, new TextEncoder().encode(body), `sha256=${"z".repeat(64)}`)).toBe(false)
        expect(verifyGithubSignature("", new TextEncoder().encode(body), sign(body, ""))).toBe(false)
    })
})

describe("webhook receiver", () => {
    test("验签通过后把 delivery 落 Inbox 并回 200", async () => {
        const { app, server } = createApp()
        const { status, json } = await post(app)

        expect(status).toBe(200)
        expect(json.accepted).toBe(true)
        expect(json.duplicate).toBe(false)
        expect(server.writes).toHaveLength(1)
        expect(server.writes[0]).toMatchObject({
            deliveryId: "delivery-1",
            event: "issues",
            action: "opened",
            repositoryId: "42",
            installationId: "7",
        })
    })

    test("签名错误回 401 且不写 Inbox", async () => {
        const { app, server } = createApp()
        const { status, json } = await post(app, { signature: sign(issuesPayload(), "wrong-secret") })

        expect(status).toBe(401)
        expect(json.ok).toBe(false)
        expect(server.writes).toHaveLength(0)
    })

    test("重复 delivery 复用 Inbox，不重复产生业务效果", async () => {
        const { app, server } = createApp()

        const first = await post(app, { delivery: "delivery-replay" })
        const second = await post(app, { delivery: "delivery-replay" })

        expect(first.status).toBe(200)
        expect(first.json.duplicate).toBe(false)
        expect(second.status).toBe(200)
        expect(second.json.duplicate).toBe(true)
        expect(server.deliveries.size).toBe(1)
    })

    test("非 allowlist 仓库回 200 accepted:false，避免无意义重试", async () => {
        const { app, server } = createApp()
        const body = issuesPayload({ repository: { id: 999, full_name: "someone/else" } })
        const { status, json } = await post(app, { body })

        expect(status).toBe(200)
        expect(json.accepted).toBe(false)
        expect(server.writes).toHaveLength(0)
    })

    test("server 不可达时回 503，不假 ACK", async () => {
        const server = createServerMock()
        server.setDown(true)
        const { app } = createApp(server)
        const { status, json } = await post(app)

        expect(status).toBe(503)
        expect(json.ok).toBe(false)
    })

    test("ping 直接回 pong，不落 Inbox", async () => {
        const { app, server } = createApp()
        const body = JSON.stringify({ zen: "Keep it logically awesome." })
        const { status, json } = await post(app, { body, event: "ping" })

        expect(status).toBe(200)
        expect(json.zen).toBe("Keep it logically awesome.")
        expect(server.writes).toHaveLength(0)
    })

    test("未订阅事件确认后忽略", async () => {
        const { app, server } = createApp()
        const { status, json } = await post(app, { body: issuesPayload({ action: undefined }), event: "push" })

        expect(status).toBe(200)
        expect(json.ignored).toBe(true)
        expect(server.writes).toHaveLength(0)
    })

    test("缺少 action 的 delivery 不写 Inbox", async () => {
        const { app, server } = createApp()
        const body = JSON.stringify({ repository: { id: 42, full_name: "owner/repo" } })
        const { status, json } = await post(app, { body })

        expect(status).toBe(200)
        expect(json.accepted).toBe(false)
        expect(server.writes).toHaveLength(0)
    })

    test("installation 事件按 repositories 数组匹配 allowlist", async () => {
        const { app, server } = createApp()
        const body = JSON.stringify({
            action: "created",
            installation: { id: 9 },
            repositories: [{ id: 42, full_name: "owner/repo" }],
        })
        const { status, json } = await post(app, { body, event: "installation", delivery: "delivery-inst" })

        expect(status).toBe(200)
        expect(json.accepted).toBe(true)
        expect(server.writes[0]).toMatchObject({ event: "installation", action: "created", repositoryId: "42", installationId: "9" })
    })

    test("超限正文回 413", async () => {
        const { app, server } = createApp()
        const body = issuesPayload()
        const { status } = await post(app, { body, headers: { "content-length": String(2 * 1024 * 1024) } })

        expect(status).toBe(413)
        expect(server.writes).toHaveLength(0)
    })
})
