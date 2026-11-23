import { createHash, randomBytes } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import * as schema from "../db/schema"
import { cancelProcessJobs, enqueueJob } from "./jobs"
import { canViewPrivate } from "./permissions"
import {
    type Actor,
    type BugAssetRow,
    type BugDb,
    BugDomainError,
    type BugEnvironment,
    type BugPublicationPolicy,
    processJobKey,
    type SubmissionRow,
    type SubmissionState,
    type SubmissionVersionRow,
    submissionVersionId,
} from "./types"

/** 反馈附件上限（spec §10）。 */
export const MAX_SUBMISSION_ASSETS = 8
export const MAX_SUBMISSION_TEXT_CHARS = 50_000
export const MAX_SUBMISSION_TEXT_BYTES = 256 * 1024
const DEFAULT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000

/** 上传后尚未绑定到具体 revision 的资产占位版本号；上传接口与提交接口共用。 */
export const UNATTACHED_ASSET_VERSION = "unattached"

const RECEIPT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

export type CreateSubmissionInput = {
    gameId: string
    rawTextPrivate?: string | null
    assetIds?: readonly string[]
    context?: BugEnvironment | null
    publicationPolicy?: BugPublicationPolicy
}

export type SubmissionReceipt = {
    submissionId: string
    revision: number
    state: SubmissionState
    /** 匿名提交一次性返回；登录用户与后续补充都为 null。 */
    receiptToken: string | null
}

export type SubmissionDetail = {
    submission: SubmissionRow
    versions: SubmissionVersionRow[]
    assets: BugAssetRow[]
}

export type ResolvedReceipt = {
    submissionId: string
    anonActorId: string | null
    state: SubmissionState
    actorKey: string
}

/** SHA-256 十六进制摘要。 */
export function sha256Hex(value: string | Uint8Array): string {
    return createHash("sha256").update(value).digest("hex")
}

/** 回执 token 摘要；数据库只存摘要，不存原文。 */
export function receiptDigest(receiptToken: string): string {
    return sha256Hex(receiptToken)
}

/** 生成匿名回执 token：32 字节随机，base64url 编码（43 字符）。 */
export function generateReceiptToken(): string {
    return randomBytes(32).toString("base64url")
}

/** 生成不含回执信息的匿名 actor 标识。 */
function generateAnonActorId(): string {
    return `anon_${randomBytes(12).toString("hex")}`
}

/** 幂等键分区用的身份键；匿名回执必须先解析出 anonActorId。 */
export function actorKeyOf(actor: Actor, anonActorId?: string | null): string {
    switch (actor.kind) {
        case "user":
            return `user:${actor.userId}`
        case "receipt":
            return anonActorId ? `anon:${anonActorId}` : `anon:${sha256Hex(actor.receiptToken).slice(0, 16)}`
        case "worker":
            return `worker:${actor.workerId}`
        default:
            return "anonymous"
    }
}

const SUBMISSION_STATES_ALLOWING_WITHDRAW: SubmissionState[] = ["received", "queued", "retry_wait"]

/** 内容摘要：原文 + 排序后的资产 id，用于 inputHash 与 revision 去重。 */
export function submissionContentHash(rawText: string | null | undefined, assetIds: readonly string[] = []): string {
    return sha256Hex(JSON.stringify({ text: rawText ?? "", assetIds: [...assetIds].sort() }))
}

function validateContent(rawText: string | null | undefined, assetIds: readonly string[]): void {
    const text = (rawText ?? "").trim()
    if (!text && !assetIds.length) {
        throw new BugDomainError("VALIDATION_FAILED", "反馈内容不能为空")
    }
    if ((rawText ?? "").length > MAX_SUBMISSION_TEXT_CHARS) {
        throw new BugDomainError("VALIDATION_FAILED", `文字不能超过 ${MAX_SUBMISSION_TEXT_CHARS} 字符`)
    }
    if (Buffer.byteLength(rawText ?? "", "utf8") > MAX_SUBMISSION_TEXT_BYTES) {
        throw new BugDomainError("VALIDATION_FAILED", "文字内容超出大小限制")
    }
    if (assetIds.length > MAX_SUBMISSION_ASSETS) {
        throw new BugDomainError("VALIDATION_FAILED", `图片最多 ${MAX_SUBMISSION_ASSETS} 张`)
    }
}

/** 绑定资产到 revision，并拒绝已被其他反馈占用的资产。 */
function attachAssets(db: BugDb, assetIds: readonly string[], versionId: string): void {
    if (!assetIds.length) return
    const rows = db
        .select()
        .from(schema.bugAssets)
        .where(inArray(schema.bugAssets.id, [...assetIds]))
        .all()
    if (rows.length !== new Set(assetIds).size) {
        throw new BugDomainError("VALIDATION_FAILED", "存在无效的图片资产")
    }
    for (const row of rows) {
        if (row.submissionVersionId !== UNATTACHED_ASSET_VERSION && row.submissionVersionId !== versionId) {
            throw new BugDomainError("CONFLICT", "图片资产已绑定到其他反馈", { assetId: row.id })
        }
    }
    db.update(schema.bugAssets)
        .set({ submissionVersionId: versionId })
        .where(inArray(schema.bugAssets.id, [...assetIds]))
        .run()
}

/**
 * @description 先持久化再回执：在同一事务内写 Submission、首个版本、资产绑定与处理 Job。
 * 匿名提交生成高熵回执 token，数据库只保存摘要。
 * @param db 数据库
 * @param input 提交内容
 * @param actor 请求身份（worker 不允许冒充用户提交）
 * @param options 时间 / 是否入队 / 保留期
 * @returns 回执
 */
export function createSubmission(
    db: BugDb,
    input: CreateSubmissionInput,
    actor: Actor,
    options: { now?: number; enqueue?: boolean; retentionMs?: number } = {}
): SubmissionReceipt {
    if (actor.kind === "worker") {
        throw new BugDomainError("FORBIDDEN", "集成身份不能冒用用户提交反馈")
    }
    if (!input.gameId?.trim()) throw new BugDomainError("VALIDATION_FAILED", "缺少游戏 id")

    const assetIds = [...new Set(input.assetIds ?? [])]
    validateContent(input.rawTextPrivate, assetIds)

    const now = options.now ?? Date.now()
    const submissionId = schema.id()
    const versionId = submissionVersionId(submissionId, 1)
    const contentHash = submissionContentHash(input.rawTextPrivate, assetIds)
    const anonymous = actor.kind !== "user"
    const receiptToken = anonymous ? generateReceiptToken() : null
    const anonActorId = anonymous ? generateAnonActorId() : null
    const enqueue = options.enqueue !== false

    db.transaction(tx => {
        tx.insert(schema.bugSubmissions)
            .values({
                id: submissionId,
                gameId: input.gameId,
                userId: actor.kind === "user" ? actor.userId : null,
                anonActorId,
                receiptDigest: receiptToken ? receiptDigest(receiptToken) : null,
                state: enqueue ? "queued" : "received",
                currentRevision: 1,
                createdAt: now,
                retentionUntil: now + (options.retentionMs ?? DEFAULT_RETENTION_MS),
            })
            .run()

        tx.insert(schema.bugSubmissionVersions)
            .values({
                submissionId,
                revision: 1,
                rawTextPrivate: input.rawTextPrivate ?? null,
                contentSha256: contentHash,
                context: input.context ?? null,
                publicationPolicy: input.publicationPolicy ?? "internal_only",
                createdAt: now,
            })
            .run()

        attachAssets(tx, assetIds, versionId)

        if (enqueue) {
            enqueueJob(tx, {
                kind: "process_submission",
                idempotencyKey: processJobKey(submissionId, 1),
                inputRevision: 1,
                inputHash: contentHash,
                now,
            })
        }
    })

    return { submissionId, revision: 1, state: enqueue ? "queued" : "received", receiptToken }
}

/**
 * @description 校验请求身份对 Submission 的归属；回执必须用 token 摘要比对，不能只看 actorKey。
 * @returns 解析出的归属键（用于审计与幂等分区），无权限时抛 FORBIDDEN
 */
export function resolveSubmissionActorKey(actor: Actor, submission: SubmissionRow): string {
    if (actor.kind === "user" && submission.userId === actor.userId) return `user:${actor.userId}`
    if (actor.kind === "receipt") {
        const matches = Boolean(submission.receiptDigest) && receiptDigest(actor.receiptToken) === submission.receiptDigest
        if (matches) return `anon:${submission.anonActorId ?? ""}`
    }
    throw new BugDomainError("FORBIDDEN", "无权访问该反馈")
}

/** 追加版本：作者新增证据或纠正，不动其他人的规范 Bug；旧 revision 的处理任务被取消。 */
export function addRevision(
    db: BugDb,
    submissionId: string,
    input: Omit<CreateSubmissionInput, "gameId">,
    actor: Actor,
    options: { now?: number; enqueue?: boolean } = {}
): SubmissionReceipt {
    const assetIds = [...new Set(input.assetIds ?? [])]
    validateContent(input.rawTextPrivate, assetIds)
    const now = options.now ?? Date.now()
    const enqueue = options.enqueue !== false

    return db.transaction(tx => {
        const submission = tx.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, submissionId)).get()
        if (!submission) throw new BugDomainError("NOT_FOUND", "反馈不存在")
        resolveSubmissionActorKey(actor, submission)
        if (submission.state === "withdrawn") throw new BugDomainError("CONFLICT", "已撤回的反馈不能追加")

        const revision = submission.currentRevision + 1
        const versionId = submissionVersionId(submissionId, revision)
        const contentHash = submissionContentHash(input.rawTextPrivate, assetIds)

        tx.insert(schema.bugSubmissionVersions)
            .values({
                submissionId,
                revision,
                rawTextPrivate: input.rawTextPrivate ?? null,
                contentSha256: contentHash,
                context: input.context ?? null,
                publicationPolicy: input.publicationPolicy ?? "internal_only",
                createdAt: now,
            })
            .run()
        attachAssets(tx, assetIds, versionId)

        tx.update(schema.bugSubmissions)
            .set({ state: enqueue ? "queued" : submission.state, currentRevision: revision })
            .where(eq(schema.bugSubmissions.id, submissionId))
            .run()

        cancelProcessJobs(tx, submissionId)
        if (enqueue) {
            enqueueJob(tx, {
                kind: "process_submission",
                idempotencyKey: processJobKey(submissionId, revision),
                inputRevision: revision,
                inputHash: contentHash,
                now,
            })
        }

        return { submissionId, revision, state: enqueue ? "queued" : submission.state, receiptToken: null }
    })
}

/** 撤回：只允许尚未进入处理结果的反馈，不删除其他人的规范 Bug。 */
export function withdrawSubmission(db: BugDb, submissionId: string, actor: Actor): boolean {
    return db.transaction(tx => {
        const submission = tx.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, submissionId)).get()
        if (!submission) throw new BugDomainError("NOT_FOUND", "反馈不存在")
        resolveSubmissionActorKey(actor, submission)
        if (!SUBMISSION_STATES_ALLOWING_WITHDRAW.includes(submission.state)) {
            throw new BugDomainError("CONFLICT", "当前状态不允许撤回")
        }
        tx.update(schema.bugSubmissions).set({ state: "withdrawn" }).where(eq(schema.bugSubmissions.id, submissionId)).run()
        cancelProcessJobs(tx, submissionId)
        return true
    })
}

/** 读取反馈详情；无权限时返回 null（不泄露记录是否存在）。 */
/**
 * @description 读取 Submission 详情；版本与资产表可按需加载（GraphQL 未选中的内联表不查）。
 * @param db 数据库
 * @param submissionId 反馈 id
 * @param actor 当前身份
 * @param options 是否加载 versions / assets（默认都加载）
 * @returns 详情；无权查看时为 null
 */
export function getSubmission(
    db: BugDb,
    submissionId: string,
    actor: Actor,
    options: { versions?: boolean; assets?: boolean } = {}
): SubmissionDetail | null {
    const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, submissionId)).get()
    if (!submission) return null

    const resolvedActorKey = resolveActorKeyIfAuthorized(actor, submission)
    if (!canViewPrivate(actor, submission, resolvedActorKey)) return null

    const versions =
        options.versions === false
            ? []
            : db.select().from(schema.bugSubmissionVersions).where(eq(schema.bugSubmissionVersions.submissionId, submissionId)).all()
    const versionIds = versions.map(version => submissionVersionId(submissionId, version.revision))
    const assets =
        options.assets === false || versionIds.length === 0
            ? []
            : db.select().from(schema.bugAssets).where(inArray(schema.bugAssets.submissionVersionId, versionIds)).all()

    return { submission, versions, assets }
}

function resolveActorKeyIfAuthorized(actor: Actor, submission: SubmissionRow): string | null {
    if (actor.kind === "receipt") {
        const matches = Boolean(submission.receiptDigest) && receiptDigest(actor.receiptToken) === submission.receiptDigest
        return matches ? `anon:${submission.anonActorId ?? ""}` : null
    }
    if (actor.kind === "user") return `user:${actor.userId}`
    return null
}

/**
 * @description 回执 token → Submission 归属解析；格式非法、摘要不匹配都返回 null。
 * @param db 数据库
 * @param receiptToken 回执 token 原文
 * @returns 归属信息；无效时为 null
 */
export function resolveReceiptActor(db: BugDb, receiptToken: string): ResolvedReceipt | null {
    if (!RECEIPT_TOKEN_PATTERN.test(receiptToken)) return null
    const digest = receiptDigest(receiptToken)
    const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.receiptDigest, digest)).get()
    if (!submission) return null
    return {
        submissionId: submission.id,
        anonActorId: submission.anonActorId,
        state: submission.state,
        actorKey: `anon:${submission.anonActorId ?? ""}`,
    }
}
