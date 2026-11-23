import { eq } from "drizzle-orm"
import { Elysia, t } from "elysia"
import {
    type Actor,
    type BugAssetRow,
    canViewPrivate,
    isMaintainer,
    parseSubmissionVersionId,
    resolveReceiptActor,
    sha256Hex,
    UNATTACHED_ASSET_VERSION,
} from "../bugs"
import { db, schema } from "../db"
import type { BugPublicationPolicy } from "../db/schema"
import { resolveActor } from "../util/actor"
import { BUG_ASSET_PRIVATE_PREFIX, deleteBugAssets, getBugAssetUrl, isSafeBugAssetKey, uploadBugAsset } from "../util/bug-asset-storage"
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, reencodeImage, validateImageAsset } from "../util/image-sniff"
import { getActiveBackends, isObjectStorageConfigured, readObjectBytes } from "../util/object-storage"
import { createIpLimiter, RateLimiter } from "../util/rate-limit"

/**
 * BUG 图片资产接口。
 *
 * - `POST /api/v1/bug-assets`：multipart 上传；原图永远落在私有前缀，回执只给 assetId 与扫描状态。
 * - `GET /api/v1/bug-assets/:id/status`：上传者 / 回执 / 维护者 / 内部 worker 查看校验与脱敏进度。
 * - `GET /api/v1/bug-assets/:id/content`：私有原图的鉴权代理；有公开派生图时对无权方只 302 到 CDN。
 *
 * 授权一律按「资产 → 反馈版本 → 反馈归属」推导，不看上传顺序；未绑定反馈的资产只对维护者与 worker 可见，
 * 避免仅凭 assetId 就能读取他人私图。
 */

/** 匿名上传限流：每 IP 每 10 分钟次数。 */
const ANON_UPLOAD_LIMIT = Number(process.env.BUG_ASSET_ANON_RATE_LIMIT ?? "") || 10

/** 登录用户上传限流：每用户每 10 分钟次数。 */
const USER_UPLOAD_LIMIT = Number(process.env.BUG_ASSET_USER_RATE_LIMIT ?? "") || 60

/** 上传限流窗口。 */
const UPLOAD_WINDOW_MS = 10 * 60_000

/** 可选的发布策略；缺省最保守。 */
const POLICY_VALUES = new Set<BugPublicationPolicy>(["internal_only", "catalog_safe", "github_safe"])

const anonUploadLimiter = createIpLimiter(ANON_UPLOAD_LIMIT, UPLOAD_WINDOW_MS)
const userUploadLimiter = new RateLimiter(USER_UPLOAD_LIMIT, UPLOAD_WINDOW_MS)

const uploadBodySchema = t.Object({
    file: t.File(),
    publicationPolicy: t.Optional(t.String({ maxLength: 32 })),
})

const idParamsSchema = t.Object({ id: t.String({ maxLength: 64 }) })

type ErrorCode =
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "PAYLOAD_TOO_LARGE"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "VALIDATION_FAILED"
    | "RATE_LIMITED"
    | "UNAVAILABLE"

type StatusSetter = { status?: number | string; headers: Record<string, string | number | undefined> }

/**
 * @description 统一的失败响应；正文只暴露错误码与可读说明，不含对象 key 或内部栈。
 */
function fail(set: StatusSetter, status: number, code: ErrorCode, error: string) {
    set.status = status
    return { success: false as const, code, error }
}

/**
 * @description 规范化发布策略：大小写不敏感；未知值返回 null 由调用方拒绝。
 */
function normalizePolicy(raw: string | undefined | null): BugPublicationPolicy | null {
    if (!raw) return "internal_only"
    const value = raw.trim().toLowerCase()
    return POLICY_VALUES.has(value as BugPublicationPolicy) ? (value as BugPublicationPolicy) : null
}

/**
 * @description 图片校验失败时给出 HTTP 状态：体积/像素超限算 413，格式与编码问题算 415，其余算 400。
 */
function statusForImageError(message: string): number {
    if (message.includes("像素") || message.includes("不得超过")) return 413
    if (message.includes("格式") || message.includes("类型") || message.includes("编码") || message.includes("解码")) return 415
    return 400
}

/**
 * @description 判断 actor 能否读取该资产的私有原图：worker 与维护者直接放行；
 * 其余按资产绑定的反馈版本回查归属，未绑定（unattached）的资产不对普通用户开放。
 */
function canAccessAsset(actor: Actor, asset: BugAssetRow): boolean {
    if (actor.kind === "worker") return true
    if (actor.kind === "user" && isMaintainer(actor)) return true
    if (asset.submissionVersionId === UNATTACHED_ASSET_VERSION) return false

    const parsed = parseSubmissionVersionId(asset.submissionVersionId)
    if (!parsed) return false

    const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, parsed.submissionId)).get()
    if (!submission) return false

    if (actor.kind === "receipt") {
        const resolved = resolveReceiptActor(db, actor.receiptToken)
        return canViewPrivate(actor, submission, resolved?.actorKey ?? null)
    }
    return canViewPrivate(actor, submission)
}

/**
 * @description 读取资产行；非法 id 直接当作不存在，避免把格式错误暴露成 422。
 */
function loadAsset(id: string): BugAssetRow | null {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
    return db.select().from(schema.bugAssets).where(eq(schema.bugAssets.id, id)).get() ?? null
}

/**
 * @description 对外的资产状态投影：不含私有对象 key，公开地址只在确实有派生图时给出。
 */
function assetStatusDto(asset: BugAssetRow) {
    return {
        assetId: asset.id,
        scanState: asset.scanState,
        redactionState: asset.redactionState,
        publicationPolicy: asset.publicationPolicy,
        mime: asset.actualMime,
        bytes: asset.bytes,
        width: asset.dimensions?.width ?? null,
        height: asset.dimensions?.height ?? null,
        hasPublicDerivative: Boolean(asset.publicDerivativeKey),
        publicUrl: asset.publicDerivativeKey ? getBugAssetUrl(asset.publicDerivativeKey) : null,
        createdAt: asset.createdAt ?? 0,
    }
}

/**
 * @description 上传限流：登录用户按 userId，其余（匿名 / 回执）按客户端 IP 计数。
 * @returns 允许时 null；超限时返回已写好状态码的响应体
 */
function enforceUploadRateLimit(actor: Actor, headers: Headers, set: StatusSetter) {
    const result = actor.kind === "user" ? userUploadLimiter.allow(`user:${actor.userId}`) : anonUploadLimiter.allow(headers)
    if (result.allowed) return null
    set.headers["retry-after"] = String(Math.max(1, Math.ceil((result.retryAfterMs ?? UPLOAD_WINDOW_MS) / 1000)))
    return fail(set, 429, "RATE_LIMITED", "上传过于频繁，请稍后重试")
}

/**
 * @description BUG 图片资产插件（上传 / 状态 / 鉴权代理）。
 */
export function bugAssetsPlugin() {
    return new Elysia({ prefix: "/api/v1/bug-assets" })
        .post(
            "/",
            async ({ body, request, set }) => {
                const actor = await resolveActor(request.headers)
                if (!actor) return fail(set, 401, "UNAUTHORIZED", "凭据无效")
                if (actor.kind === "worker") return fail(set, 403, "FORBIDDEN", "内部 worker 不通过该接口上传")

                const limited = enforceUploadRateLimit(actor, request.headers, set)
                if (limited) return limited

                const policy = normalizePolicy(body.publicationPolicy)
                if (!policy) return fail(set, 400, "VALIDATION_FAILED", "未知的发布策略")

                const file = body.file
                if (!(file instanceof File) || file.size <= 0) return fail(set, 400, "VALIDATION_FAILED", "缺少图片内容")
                if (file.size > MAX_IMAGE_BYTES) {
                    return fail(set, 413, "PAYLOAD_TOO_LARGE", `图片不得超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MiB`)
                }

                const bytes = new Uint8Array(await file.arrayBuffer())
                const validation = await validateImageAsset(bytes, { declaredMime: file.type || null })
                if (!validation.ok || !validation.mime || !validation.width || !validation.height) {
                    const message = validation.error ?? "图片校验失败"
                    const failureStatus = statusForImageError(message)
                    return fail(set, failureStatus, failureStatus === 413 ? "PAYLOAD_TOO_LARGE" : "UNSUPPORTED_MEDIA_TYPE", message)
                }

                if (!isObjectStorageConfigured()) return fail(set, 503, "UNAVAILABLE", "图片存储暂不可用")

                // 入库前先剥元数据并按像素预算缩放：私有原图也不保留 EXIF/GPS
                const format = validation.mime === "image/png" ? "png" : "webp"
                let safeBytes: Buffer
                try {
                    safeBytes = await reencodeImage(bytes, MAX_IMAGE_PIXELS, { format })
                } catch {
                    return fail(set, 415, "UNSUPPORTED_MEDIA_TYPE", "图片无法安全解码，请转换后重试")
                }
                const storedMime = format === "png" ? "image/png" : "image/webp"

                let objectKey: string
                try {
                    objectKey = (await uploadBugAsset(new Uint8Array(safeBytes), storedMime, false)).objectKey
                } catch (error) {
                    console.error("BUG 资产上传失败", error)
                    return fail(set, 503, "UNAVAILABLE", "图片存储暂不可用")
                }

                try {
                    const inserted = db
                        .insert(schema.bugAssets)
                        .values({
                            submissionVersionId: UNATTACHED_ASSET_VERSION,
                            privateObjectKey: objectKey,
                            sha256: sha256Hex(safeBytes),
                            actualMime: storedMime,
                            bytes: safeBytes.byteLength,
                            dimensions: { width: validation.width, height: validation.height },
                            scanState: "pending",
                            redactionState: policy === "internal_only" ? "not_required" : "pending",
                            publicationPolicy: policy,
                        })
                        .returning({ id: schema.bugAssets.id })
                        .all()

                    const assetId = inserted[0]?.id
                    if (!assetId) throw new Error("资产落库未返回 id")

                    return {
                        success: true as const,
                        assetId,
                        scanState: "pending",
                        redactionState: policy === "internal_only" ? "not_required" : "pending",
                        publicationPolicy: policy,
                        mime: storedMime,
                        bytes: safeBytes.byteLength,
                    }
                } catch (error) {
                    console.error("BUG 资产落库失败", error)
                    await deleteBugAssets([objectKey])
                    return fail(set, 503, "UNAVAILABLE", "资产暂不可用，请稍后重试")
                }
            },
            { body: uploadBodySchema }
        )
        .get(
            "/:id/status",
            async ({ params, request, set }) => {
                const actor = await resolveActor(request.headers)
                if (!actor) return fail(set, 401, "UNAUTHORIZED", "凭据无效")

                const asset = loadAsset(params.id)
                if (!asset || !canAccessAsset(actor, asset)) return fail(set, 404, "NOT_FOUND", "资产不存在")

                return { success: true as const, ...assetStatusDto(asset) }
            },
            { params: idParamsSchema }
        )
        .get(
            "/:id/content",
            async ({ params, request, set }) => {
                const actor = await resolveActor(request.headers)
                if (!actor) return fail(set, 401, "UNAUTHORIZED", "凭据无效")

                const asset = loadAsset(params.id)
                if (!asset) return fail(set, 404, "NOT_FOUND", "资产不存在")

                const publicUrl = asset.publicDerivativeKey ? getBugAssetUrl(asset.publicDerivativeKey) : null
                if (!canAccessAsset(actor, asset)) {
                    // 无权读原图时才暴露公开派生图；没有派生图统一 404，不确认资产是否存在
                    if (!publicUrl) return fail(set, 404, "NOT_FOUND", "资产不存在")
                    set.status = 302
                    set.headers.location = publicUrl
                    set.headers["cache-control"] = "public, max-age=300"
                    return { success: true as const, url: publicUrl }
                }

                const key = asset.privateObjectKey
                if (!isSafeBugAssetKey(key) || !key.startsWith(BUG_ASSET_PRIVATE_PREFIX)) {
                    return fail(set, 503, "UNAVAILABLE", "资产地址无效")
                }
                const backend = getActiveBackends()[0]
                if (!backend) return fail(set, 503, "UNAVAILABLE", "图片存储暂不可用")

                try {
                    const bytes = await readObjectBytes(key, backend)
                    // 复用底层 ArrayBuffer 避免为大图再复制一份；SharedArrayBuffer 兜底走拷贝
                    const body =
                        bytes.buffer instanceof ArrayBuffer
                            ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
                            : new Uint8Array(bytes)
                    return new Response(body, {
                        headers: {
                            "content-type": asset.actualMime,
                            "content-length": String(bytes.byteLength),
                            "cache-control": "private, max-age=0, no-store",
                            "x-content-type-options": "nosniff",
                        },
                    })
                } catch (error) {
                    console.error("BUG 资产读取失败", error)
                    return fail(set, 503, "UNAVAILABLE", "资产暂不可用，请稍后重试")
                }
            },
            { params: idParamsSchema }
        )
}
