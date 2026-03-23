import crypto from "node:crypto"
import { Elysia } from "elysia"
import { config } from "./config.ts"
import { scheduleRun } from "./runner.ts"

/**
 * 创建 GitHub Webhook 服务。
 */

/**
 * 启动 webhook 服务。
 * @returns {Promise<void>}
 */
export async function startWebhookServer(): Promise<void> {
    const app = createWebhookApp()
    app.listen({
        port: config.webhookPort,
        hostname: config.webhookHost,
    })
    console.log(`dob-bot webhook listening on http://${config.webhookHost}:${config.webhookPort}${config.webhookPath}`)
    await new Promise(() => {})
}

/**
 * 创建 Elysia 应用。
 * @returns {Elysia}
 */
export function createWebhookApp() {
    return new Elysia()
        .get("/health", () => ({ ok: true }))
        .post(config.webhookPath, async ({ request, headers, set }) => {
            const rawBody = await request.text()
            const event = String(headers["x-github-event"] ?? "")
            const delivery = String(headers["x-github-delivery"] ?? "")
            const signature = String(headers["x-hub-signature-256"] ?? "")

            if (!verifyGithubSignature(config.webhookSecret, rawBody, signature)) {
                set.status = 401
                return { ok: false, error: "invalid signature" }
            }

            if (event === "ping") {
                return { ok: true, zen: "pong", delivery }
            }

            if (event === "issues" || event === "issue_comment" || event === "pull_request_review") {
                const payload = tryParseJson(rawBody)
                console.log(`dob-bot webhook event: ${event} (${delivery})`)
                void scheduleRun(`${event}:${delivery}`)
                return { ok: true, event, delivery, action: extractAction(payload) }
            }

            return { ok: true, event, delivery, ignored: true }
        })
}

/**
 * 校验 GitHub Webhook 签名。
 * @param {string} secret
 * @param {string} body
 * @param {string} signatureHeader
 * @returns {boolean}
 */
function verifyGithubSignature(secret: string, body: string, signatureHeader: string): boolean {
    if (!secret || !signatureHeader.startsWith("sha256=")) return false
    const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex")
    const expected = Buffer.from(crypto.createHmac("sha256", secret).update(body).digest("hex"), "hex")
    return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

/**
 * 尝试解析 JSON。
 * @param {string} text
 * @returns {unknown}
 */
function tryParseJson(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}

/**
 * 提取事件动作。
 * @param {unknown} payload
 * @returns {string | null}
 */
function extractAction(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null
    const obj = payload as { action?: unknown }
    return typeof obj.action === "string" ? obj.action : null
}
