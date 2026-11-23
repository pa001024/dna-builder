import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { eq } from "drizzle-orm"
import jwt from "jsonwebtoken"
import { receiptDigest, sha256Hex, UNATTACHED_ASSET_VERSION } from "../bugs"
import { createTestDb, GAME_ID, seedUser } from "../bugs/test-helpers"
import * as realSchema from "../db/schema"
import { jwtToken } from "../db/yoga"
import { MAX_IMAGE_BYTES } from "../util/image-sniff"

/** 1×1 PNG，保证 sharp 能真实解码。 */
const PNG_BYTES = new Uint8Array(
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
)

/** 记录被 mock 的对象存储调用。 */
const storage = {
    objects: new Map<string, Uint8Array>(),
    puts: [] as { key: string; contentType?: string }[],
    available: true,
    putsFail: false,
}

mock.module("../util/object-storage", () => ({
    putObject: async (key: string, data: Uint8Array, contentType?: string) => {
        if (storage.putsFail) throw new Error("storage down")
        storage.objects.set(key, new Uint8Array(data))
        storage.puts.push({ key, contentType })
    },
    deleteObject: async (key: string) => {
        storage.objects.delete(key)
    },
    getPublicObjectUrl: (key: string) => `https://cdn.test.invalid/${key}`,
    getActiveBackends: () => (storage.available ? [{ label: "OSS" }] : []),
    isObjectStorageConfigured: () => storage.available,
    readObjectBytes: async (key: string) => {
        const bytes = storage.objects.get(key)
        if (!bytes) throw new Error("missing object")
        return bytes
    },
}))

const { db: testDb } = createTestDb()

/** 测试可切换的落库失败注入。 */
const dbState = { failInsert: false }

const dbProxy = new Proxy({} as typeof testDb, {
    get(_target, prop) {
        if (dbState.failInsert && prop === "insert") {
            return () => {
                throw new Error("db unavailable")
            }
        }
        const value = (testDb as unknown as Record<string | symbol, unknown>)[prop]
        return typeof value === "function" ? value.bind(testDb) : value
    },
})

mock.module("../db", () => ({ db: dbProxy, schema: realSchema }))

process.env.BUG_ASSET_ANON_RATE_LIMIT = "3"
process.env.BUG_ASSET_USER_RATE_LIMIT = "3"
const { bugAssetsPlugin } = await import("./bug-assets")
const { BUG_ASSET_PRIVATE_PREFIX } = await import("../util/bug-asset-storage")

const app = bugAssetsPlugin()

/** 生成 43 字符的 base64url 回执 token；每条反馈独立（摘要唯一）。 */
function makeReceiptToken(seed: string): string {
    return `${seed}${"r".repeat(43 - seed.length)}`
}

let ipCounter = 0

/** 每个用例用独立 IP，避免匿名限流相互干扰。 */
function nextIp(): string {
    ipCounter += 1
    return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
}

function createToken(id: string, roles: string[] = []): string {
    return jwt.sign({ id, name: id, roles }, jwtToken)
}

/** 测试库在整个文件内复用，用户只插入一次。 */
function ensureUser(id: string, roles: string[] = []): void {
    const existing = testDb.select().from(realSchema.users).where(eq(realSchema.users.id, id)).get()
    if (!existing) seedUser(testDb, id, roles)
}

/**
 * @description 上传一张图片（multipart）。
 */
function upload(
    options: { bytes?: Uint8Array; type?: string; policy?: string; token?: string; receipt?: string; ip?: string; name?: string } = {}
) {
    const bytes = options.bytes ?? PNG_BYTES
    const part =
        bytes.buffer instanceof ArrayBuffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes)
    const form = new FormData()
    form.set("file", new File([part], options.name ?? "shot.png", { type: options.type ?? "image/png" }))
    if (options.policy) form.set("publicationPolicy", options.policy)

    const headers: Record<string, string> = { "x-forwarded-for": options.ip ?? nextIp() }
    if (options.token) headers.token = options.token
    if (options.receipt) headers.authorization = `Receipt ${options.receipt}`

    return app.handle(new Request("http://localhost/api/v1/bug-assets/", { method: "POST", headers, body: form }))
}

/** 读取资产状态。 */
function getStatus(id: string, headers: Record<string, string> = {}) {
    return app.handle(new Request(`http://localhost/api/v1/bug-assets/${id}/status`, { headers }))
}

/** 读取资产内容。 */
function getContent(id: string, headers: Record<string, string> = {}) {
    return app.handle(new Request(`http://localhost/api/v1/bug-assets/${id}/content`, { headers }))
}

/** 插入一条反馈与其首个版本，返回 submissionId。 */
function seedSubmission(options: { userId?: string | null; receipt?: string | null; revision?: number; id?: string } = {}): string {
    const id = options.id ?? `sub-${Math.floor(Math.random() * 1e9)}`
    const revision = options.revision ?? 1
    testDb
        .insert(realSchema.bugSubmissions)
        .values({
            id,
            gameId: GAME_ID,
            userId: options.userId ?? null,
            anonActorId: options.receipt ? `anon_${id}` : null,
            receiptDigest: options.receipt ? receiptDigest(options.receipt) : null,
            state: "processing",
            currentRevision: revision,
        })
        .run()
    testDb
        .insert(realSchema.bugSubmissionVersions)
        .values({ submissionId: id, revision, contentSha256: sha256Hex("seed"), publicationPolicy: "github_safe" })
        .run()
    return id
}

/** 插入一张已绑定反馈版本的图片资产，并把字节放进 mock 存储。 */
function seedAsset(options: {
    submissionVersionId: string
    bytes?: Uint8Array
    mime?: string
    scanState?: string
    redactionState?: string
    publicDerivativeKey?: string | null
}): string {
    const id = `asset-${Math.floor(Math.random() * 1e9)}`
    const key = `${BUG_ASSET_PRIVATE_PREFIX}${id}.png`
    const bytes = options.bytes ?? PNG_BYTES
    testDb
        .insert(realSchema.bugAssets)
        .values({
            id,
            submissionVersionId: options.submissionVersionId,
            privateObjectKey: key,
            sha256: sha256Hex(bytes),
            actualMime: options.mime ?? "image/png",
            bytes: bytes.byteLength,
            dimensions: { width: 1, height: 1 },
            scanState: options.scanState ?? "clean",
            redactionState: options.redactionState ?? "redacted",
            publicDerivativeKey: options.publicDerivativeKey ?? null,
            publicationPolicy: "github_safe",
        })
        .run()
    storage.objects.set(key, bytes)
    return id
}

beforeEach(() => {
    storage.puts = []
    storage.available = true
    storage.putsFail = false
    dbState.failInsert = false
})

afterEach(() => {
    delete process.env.BUG_WORKER_TOKEN
})

describe("POST /api/v1/bug-assets", () => {
    it("接受合法图片，返回未被公开的 assetId 与 pending 状态", async () => {
        const response = await upload({ policy: "github_safe" })
        expect(response.status).toBe(200)

        const body = (await response.json()) as Record<string, unknown>
        expect(typeof body.assetId).toBe("string")
        expect(body.scanState).toBe("pending")
        expect(body.redactionState).toBe("pending")
        expect(body.publicationPolicy).toBe("github_safe")
        expect(body).not.toHaveProperty("objectKey")
        expect(body).not.toHaveProperty("url")

        const row = testDb
            .select()
            .from(realSchema.bugAssets)
            .where(eq(realSchema.bugAssets.id, body.assetId as string))
            .get()
        expect(row?.submissionVersionId).toBe(UNATTACHED_ASSET_VERSION)
        expect(row?.privateObjectKey.startsWith(BUG_ASSET_PRIVATE_PREFIX)).toBe(true)
        expect(row?.scanState).toBe("pending")
        expect(storage.objects.has(row!.privateObjectKey)).toBe(true)
        // 落库的是重编码后的安全副本，不是上传原文
        expect(row?.bytes).not.toBe(PNG_BYTES.byteLength)
    })

    it("internal_only 策略的资产不需要脱敏", async () => {
        const response = await upload({ policy: "internal_only" })
        const body = (await response.json()) as Record<string, unknown>
        expect(body.redactionState).toBe("not_required")
    })

    it("拒绝伪装 MIME（内容不是图片）并返回 415", async () => {
        const response = await upload({ bytes: new TextEncoder().encode("not an image at all"), type: "image/png" })
        expect(response.status).toBe(415)
        const body = (await response.json()) as Record<string, unknown>
        expect(body.code).toBe("UNSUPPORTED_MEDIA_TYPE")
    })

    it("拒绝声明类型与实际格式不一致", async () => {
        // Elysia 从文件名推断 File.type，这里用 .jpg 扩展名声明 JPEG、内容仍是 PNG
        const response = await upload({ bytes: PNG_BYTES, name: "shot.jpg" })
        expect(response.status).toBe(415)
    })

    it("拒绝超过字节上限的图片并返回 413", async () => {
        const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1)
        const response = await upload({ bytes: oversized, type: "image/png" })
        expect(response.status).toBe(413)
        const body = (await response.json()) as Record<string, unknown>
        expect(body.code).toBe("PAYLOAD_TOO_LARGE")
    })

    it("未知发布策略返回 400", async () => {
        const response = await upload({ policy: "everyone" })
        expect(response.status).toBe(400)
    })

    it("无效凭据返回 401", async () => {
        const response = await upload({ token: "not-a-jwt" })
        expect(response.status).toBe(401)
    })

    it("存储不可用时拒绝接收（不假成功）", async () => {
        storage.available = false
        const response = await upload()
        expect(response.status).toBe(503)
    })

    it("落库失败时回收已上传对象并返回 503", async () => {
        dbState.failInsert = true
        const before = storage.objects.size
        const response = await upload()
        expect(response.status).toBe(503)
        expect(storage.objects.size).toBe(before)
    })

    it("匿名按 IP 限流，超限返回 429 与 retry-after", async () => {
        const ip = "10.42.42.42"
        for (let index = 0; index < 3; index++) {
            const ok = await upload({ ip })
            expect(ok.status).toBe(200)
        }
        const limited = await upload({ ip })
        expect(limited.status).toBe(429)
        expect(limited.headers.get("retry-after")).toBeTruthy()
    })

    it("登录用户按 userId 限流", async () => {
        ensureUser("limited-user")
        const token = createToken("limited-user")
        for (let index = 0; index < 3; index++) {
            const ok = await upload({ token, ip: nextIp() })
            expect(ok.status).toBe(200)
        }
        const limited = await upload({ token, ip: nextIp() })
        expect(limited.status).toBe(429)
    })
})

describe("GET /api/v1/bug-assets/:id/status", () => {
    it("登录作者可以读取自己资产的状态", async () => {
        ensureUser("owner")
        const submissionId = seedSubmission({ userId: "owner" })
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })

        const response = await getStatus(assetId, { token: createToken("owner") })
        expect(response.status).toBe(200)
        const body = (await response.json()) as Record<string, unknown>
        expect(body.assetId).toBe(assetId)
        expect(body.scanState).toBe("clean")
        expect(body.redactionState).toBe("redacted")
        expect(body).not.toHaveProperty("privateObjectKey")
    })

    it("回执 token 可以读取匿名反馈资产的状态", async () => {
        const token = makeReceiptToken("status")
        const submissionId = seedSubmission({ receipt: token })
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })

        const response = await getStatus(assetId, { authorization: `Receipt ${token}` })
        expect(response.status).toBe(200)
    })

    it("其他用户、其他回执与匿名一律 404", async () => {
        ensureUser("owner")
        const submissionId = seedSubmission({ userId: "owner" })
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })

        expect((await getStatus(assetId, { token: createToken("intruder") })).status).toBe(404)
        expect((await getStatus(assetId, { authorization: `Receipt ${"z".repeat(43)}` })).status).toBe(404)
        expect((await getStatus(assetId)).status).toBe(404)
    })

    it("无效凭据返回 401，而不是降级成匿名", async () => {
        const submissionId = seedSubmission({})
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })
        expect((await getStatus(assetId, { token: "broken" })).status).toBe(401)
    })

    it("未绑定反馈的资产只对维护者与 worker 可见", async () => {
        ensureUser("owner")
        const assetId = seedAsset({ submissionVersionId: UNATTACHED_ASSET_VERSION })

        expect((await getStatus(assetId, { token: createToken("owner") })).status).toBe(404)

        ensureUser("admin-user", ["admin"])
        expect((await getStatus(assetId, { token: createToken("admin-user", ["admin"]) })).status).toBe(200)

        process.env.BUG_WORKER_TOKEN = "worker-secret"
        expect((await getStatus(assetId, { "x-worker-token": "worker-secret" })).status).toBe(200)
    })

    it("不存在的资产返回 404", async () => {
        expect((await getStatus("does-not-exist", { token: createToken("nobody") })).status).toBe(404)
    })
})

describe("GET /api/v1/bug-assets/:id/content", () => {
    it("作者可以流式读取私有原图", async () => {
        ensureUser("owner")
        const submissionId = seedSubmission({ userId: "owner" })
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })

        const response = await getContent(assetId, { token: createToken("owner") })
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("image/png")
        expect(response.headers.get("cache-control")).toBe("private, max-age=0, no-store")
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES)
    })

    it("回执 token 可以读取匿名反馈的原图", async () => {
        const token = makeReceiptToken("content")
        const submissionId = seedSubmission({ receipt: token })
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })

        const response = await getContent(assetId, { authorization: `Receipt ${token}` })
        expect(response.status).toBe(200)
    })

    it("无权访问且没有公开派生图时返回 404", async () => {
        ensureUser("owner")
        const submissionId = seedSubmission({ userId: "owner" })
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })

        expect((await getContent(assetId, { token: createToken("intruder") })).status).toBe(404)
        expect((await getContent(assetId)).status).toBe(404)
    })

    it("无权访问但存在公开派生图时 302 到 CDN", async () => {
        ensureUser("owner")
        const submissionId = seedSubmission({ userId: "owner" })
        const publicKey = "bug-assets/public/abc123.webp"
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1`, publicDerivativeKey: publicKey })

        const response = await getContent(assetId)
        expect(response.status).toBe(302)
        expect(response.headers.get("location")).toBe(`https://cdn.test.invalid/${publicKey}`)
    })

    it("存储不可用时返回 503", async () => {
        ensureUser("owner")
        const submissionId = seedSubmission({ userId: "owner" })
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })
        storage.available = false

        expect((await getContent(assetId, { token: createToken("owner") })).status).toBe(503)
    })

    it("无效凭据返回 401", async () => {
        const submissionId = seedSubmission({})
        const assetId = seedAsset({ submissionVersionId: `${submissionId}:1` })
        expect((await getContent(assetId, { token: "broken" })).status).toBe(401)
    })
})
