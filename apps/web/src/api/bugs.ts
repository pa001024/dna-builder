import { gql } from "@urql/vue"
import { nanoid } from "nanoid"
import { env } from "../env"
import { gqClient } from "./client"
import {
    addBugRevisionMutation,
    addCommentMutation,
    addFeedbackMutation,
    deleteBugCommentMutation,
    editCommentMutation,
    requestReopenMutation,
    setSubscriptionMutation,
    setVoteMutation,
    submitBugMutation,
    withdrawSubmissionMutation,
} from "./gen/api-mutations"
import {
    bugDiscussionQuery,
    bugRelationsQuery,
    bugsQuery,
    bugTagRegistryQuery,
    myBugsQuery,
    rawSubmissionsQuery,
    submissionQuery,
} from "./gen/api-queries"
import type * as Types from "./gen/api-types"
import { extractType } from "./query"

/**
 * 游戏 BUG 库的前端 API 面。
 *
 * 两层协议：
 * - GraphQL（`/graphql`）负责业务读写；需要按 `extensions.code` 分支的 mutation
 *   直接调 `gqClient`，不用会吞错误的 `typedMutation`。
 * - REST（`/api/v1/bug-assets`）负责图片上传与鉴权读取；原图永远在私有前缀，
 *   公开派生图只能经同接口 302 或 blob 代理拿到。
 *
 * 匿名身份用 `Authorization: Receipt <token>`，回执 token 只存在 localStorage，
 * 不放进 URL；幂等键按草稿持久化，网络重试复用同一个 key。
 */

/** 默认游戏 id（spec §7 `GAME_ID`）。 */
export const DEFAULT_GAME_ID = "duet-night-abyss"

/** 回执 token 的 localStorage 前缀：一条反馈一枚。 */
const RECEIPT_KEY_PREFIX = "bug_receipt_"

/** 幂等键的 localStorage 前缀：按草稿作用域保存，提交成功后主动清除。 */
const IDEMPOTENCY_KEY_PREFIX = "bug_idempotency_"

/** 主分类（与服务端 `GAME_CATEGORIES` 一致）。 */
export const BUG_CATEGORIES = [
    "login",
    "quest",
    "combat",
    "character",
    "equipment",
    "map",
    "ui",
    "performance",
    "multiplayer",
    "audio",
    "other",
] as const

/** 严重程度（U＝未分级）。 */
export const BUG_SEVERITIES = ["S0", "S1", "S2", "S3", "S4", "U"] as const

/** BUG 状态机取值。 */
export const BUG_STATUSES = [
    "untriaged",
    "needs_info",
    "confirmed",
    "in_progress",
    "resolved",
    "closed",
    "reopen_requested",
    "duplicate",
    "rejected",
] as const

/** 排序口径（allowlist）。 */
export const BUG_SORTS = ["priority", "severity", "votes", "recent", "created"] as const

/** 修复跟踪阶段（与 `fix_stage` 互斥组一致）。 */
export const FIX_STAGES = [
    "fix.unconfirmed",
    "fix.needs_info",
    "fix.confirmed",
    "fix.planned",
    "fix.in_progress",
    "fix.reported_fixed",
    "fix.released",
    "fix.verified",
    "fix.regressed",
] as const

/** BUG 之间的关联类型。 */
export const BUG_RELATION_TYPES = ["possible_duplicate", "related", "regression_of", "duplicate_of"] as const

/** 处理状态取值（回执页展示用）。 */
export const SUBMISSION_STATES = [
    "received",
    "queued",
    "processing",
    "processed",
    "needs_info",
    "privacy_blocked",
    "filtered",
    "retry_wait",
    "failed",
    "withdrawn",
] as const

/** 图片发布策略：REST 上传用 snake_case，GraphQL 提交用大写枚举。 */
export const PUBLICATION_POLICIES = ["INTERNAL_ONLY", "CATALOG_SAFE", "GITHUB_SAFE"] as const

/** 环境信息候选项：`value` 即落库文本，`labelKey` 仅供展示译名。 */
export type EnvironmentOption = { value: string; labelKey?: string }

/**
 * 环境信息字典（spec §7 要求由产品配置提供，v1 先固定）：
 * 平台取渠道名；区服沿用魔灵赛跑的 `CN/ASIA/US/EU` 口径；频率保持可读文本。
 */
export const ENVIRONMENT_OPTIONS: Record<"platform" | "region" | "frequency", readonly EnvironmentOption[]> = {
    platform: [{ value: "PC" }, { value: "iOS" }, { value: "Android" }, { value: "Steam" }, { value: "WeGame" }],
    region: [
        { value: "CN", labelKey: "bug.env.region.cn" },
        { value: "ASIA", labelKey: "bug.env.region.asia" },
        { value: "US", labelKey: "bug.env.region.na" },
        { value: "EU", labelKey: "bug.env.region.eu" },
    ],
    frequency: [
        { value: "每次", labelKey: "bug.env.frequency.always" },
        { value: "经常", labelKey: "bug.env.frequency.often" },
        { value: "偶尔", labelKey: "bug.env.frequency.sometimes" },
        { value: "仅一次", labelKey: "bug.env.frequency.once" },
    ],
}

export type BugCredential = {
    /** 登录 JWT；缺省由全局 GraphQL 客户端自动附带。 */
    token?: string
    /** 匿名回执 token，按 `Authorization: Receipt` 发送。 */
    receiptToken?: string
}

/** 统一错误：`code` 来自 GraphQL `extensions.code` 或 REST 响应体。 */
export class BugApiError extends Error {
    readonly code?: string

    constructor(message: string, code?: string) {
        super(message)
        this.name = "BugApiError"
        this.code = code
    }
}

/** 既可能带数据也可能带错误的返回：调用方按 `error` 分支，而不是依赖异常。 */
export type BugResult<T> = { data: T; error?: undefined } | { data?: undefined; error: BugApiError }

/** 图片上传响应（服务端不返回任何私有 URL）。 */
export interface BugAssetUpload {
    assetId: string
    scanState: string
    redactionState: string
    publicationPolicy: string
    mime: string
    bytes: number
}

/** 图片状态响应。 */
export interface BugAssetStatus {
    assetId: string
    scanState: string
    redactionState: string
    publicationPolicy: string
    mime: string
    bytes: number
    width: number | null
    height: number | null
    hasPublicDerivative: boolean
    publicUrl: string | null
    createdAt: number
}

// ==========================================
// 本地存储：回执 token / 幂等键
// ==========================================

/**
 * @description 取 localStorage；SSR 或隐私模式下不可用时返回 null，不抛错。
 */
function storage(): Storage | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage
    } catch {
        return null
    }
}

/**
 * @description 读取某条反馈的回执 token。
 * @param submissionId 反馈 id
 * @returns 回执 token 或 null
 */
export function getReceiptToken(submissionId: string): string | null {
    return storage()?.getItem(RECEIPT_KEY_PREFIX + submissionId) ?? null
}

/**
 * @description 保存回执 token（提交成功后一次性展示并落盘）。
 * @param submissionId 反馈 id
 * @param token 回执 token
 */
export function setReceiptToken(submissionId: string, token: string): void {
    storage()?.setItem(RECEIPT_KEY_PREFIX + submissionId, token)
}

/**
 * @description 删除回执 token（撤回或清理时使用）。
 * @param submissionId 反馈 id
 */
export function removeReceiptToken(submissionId: string): void {
    storage()?.removeItem(RECEIPT_KEY_PREFIX + submissionId)
}

/**
 * @description 列出本机保存过回执的反馈 id，供“我的反馈”补展示匿名提交。
 * @returns 反馈 id 列表（顺序不保证）
 */
export function listReceiptSubmissions(): string[] {
    const local = storage()
    if (!local) return []
    const ids: string[] = []
    for (let index = 0; index < local.length; index++) {
        const key = local.key(index)
        if (key?.startsWith(RECEIPT_KEY_PREFIX)) ids.push(key.slice(RECEIPT_KEY_PREFIX.length))
    }
    return ids
}

/**
 * @description 取（或创建）某草稿作用域的幂等键：同 key 重试返回同一回执。
 * @param scope 草稿作用域（如 `submit` / `feedback:<bugId>`）
 * @returns 幂等键
 */
export function getOrCreateIdempotencyKey(scope: string): string {
    const key = IDEMPOTENCY_KEY_PREFIX + scope
    const local = storage()
    if (!local) return nanoid()
    const existing = local.getItem(key)
    if (existing) return existing
    const created = nanoid()
    local.setItem(key, created)
    return created
}

/**
 * @description 清除草稿作用域的幂等键（仅在一次提交成功、需要继续新建时调用）。
 * @param scope 草稿作用域
 */
export function clearIdempotencyKey(scope: string): void {
    storage()?.removeItem(IDEMPOTENCY_KEY_PREFIX + scope)
}

/**
 * @description 匿名回执的请求头；无 token 时返回 undefined。
 * @param receiptToken 回执 token
 * @returns 请求头
 */
export function receiptHeaders(receiptToken: string | null | undefined): Record<string, string> | undefined {
    return receiptToken ? { Authorization: `Receipt ${receiptToken}` } : undefined
}

/**
 * @description 构造一次回执作用域的 GraphQL 调用上下文：网络直取，避免缓存把别人的结果复用给当前身份。
 * @param credential 登录 / 回执凭据
 * @returns urql 操作上下文
 */
function credentialContext(credential?: BugCredential) {
    const headers = receiptHeaders(credential?.receiptToken)
    if (!headers) return { requestPolicy: "network-only" as const }
    return {
        requestPolicy: "network-only" as const,
        fetchOptions: { headers },
    }
}

// ==========================================
// REST：图片资产
// ==========================================

/**
 * @description 统一的 REST 基址。
 */
function apiBase(): string {
    return env.apiEndpoint.replace(/\/$/, "")
}

/**
 * @description 组装 REST 请求头：登录用 `token`，匿名回执用 `Authorization`。
 */
function assetHeaders(credential?: BugCredential): Record<string, string> {
    const headers: Record<string, string> = {}
    if (credential?.token) headers.token = credential.token
    const receipt = receiptHeaders(credential?.receiptToken)
    if (receipt) Object.assign(headers, receipt)
    return headers
}

/** REST 失败响应体：只暴露错误码与可读说明。 */
interface BugAssetFailure {
    success?: false
    code?: string
    error?: string
}

/**
 * @description 解析 REST 响应：非 2xx 或 `success:false` 一律抛 `BugApiError`。
 */
async function readAssetResponse<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => null)) as (T & BugAssetFailure) | null
    if (!response.ok || payload?.success === false) {
        throw new BugApiError(payload?.error || `请求失败（HTTP ${response.status}）`, payload?.code)
    }
    return payload as T
}

/**
 * @description 上传一张 BUG 证据图（multipart）。原图只落私有前缀，响应不含任何 URL。
 * @param file 图片文件
 * @param publicationPolicy 发布策略（默认 GITHUB_SAFE）
 * @param credential 登录 / 回执凭据
 * @returns 资产 id 与扫描状态
 */
export async function uploadBugAsset(
    file: File,
    publicationPolicy: (typeof PUBLICATION_POLICIES)[number] = "GITHUB_SAFE",
    credential?: BugCredential
): Promise<BugAssetUpload> {
    const form = new FormData()
    form.append("file", file)
    form.append("publicationPolicy", publicationPolicy.toLowerCase())
    const response = await fetch(`${apiBase()}/api/v1/bug-assets`, {
        method: "POST",
        headers: assetHeaders(credential),
        body: form,
    })
    return readAssetResponse<BugAssetUpload>(response)
}

/**
 * @description 查询图片的校验 / 脱敏进度。
 * @param assetId 资产 id
 * @param credential 登录 / 回执凭据
 * @returns 资产状态
 */
export async function getBugAssetStatus(assetId: string, credential?: BugCredential): Promise<BugAssetStatus> {
    const response = await fetch(`${apiBase()}/api/v1/bug-assets/${encodeURIComponent(assetId)}/status`, {
        headers: assetHeaders(credential),
    })
    return readAssetResponse<BugAssetStatus>(response)
}

/**
 * @description 公开派生图的图片地址；无权限方访问原图接口时服务端会 302 到这里。
 * @param assetId 资产 id
 * @returns 可直接用于 `img.src` 的地址
 */
export function bugAssetContentUrl(assetId: string): string {
    return `${apiBase()}/api/v1/bug-assets/${encodeURIComponent(assetId)}/content`
}

/**
 * @description 带凭据读取原图并转成 blob URL（`<img>` 无法附加请求头）。
 * @param assetId 资产 id
 * @param credential 登录 / 回执凭据
 * @returns blob URL；调用方负责在卸载时 `URL.revokeObjectURL`
 */
export async function fetchBugAssetBlobUrl(assetId: string, credential?: BugCredential): Promise<string> {
    const response = await fetch(bugAssetContentUrl(assetId), { headers: assetHeaders(credential) })
    if (!response.ok) {
        throw new BugApiError(`图片读取失败（HTTP ${response.status}）`)
    }
    return URL.createObjectURL(await response.blob())
}

// ==========================================
// GraphQL：公共查询
// ==========================================

/** 详情查询：手工补全 stats / evidence / timeline，字段与服务端 `PublicBugDetail` 对齐。 */
const BUG_DETAIL_QUERY = /* GraphQL */ `
    query ($id: ID!) {
        bug(id: $id) {
            bug {
                id
                displayKey
                gameId
                title
                summary
                expected
                actual
                steps
                environment {
                    platform
                    region
                    gameVersion
                    frequency
                }
                primaryCategory
                tags
                severity
                severitySource
                status
                resolution
                fixStage
                fixStageSource
                fixEvidenceStatus
                visibility
                version
                tagVersion
                votes
                reporters
                occurrences
                duplicateOf
                fixedVersion
                createdAt
                lastActivityAt
                githubIssue {
                    linkId
                    repositoryId
                    issueId
                    issueNumber
                    htmlUrl
                    role
                    syncState
                    remoteState
                    remoteStateReason
                    updatedAt
                }
            }
            stats {
                votes
                reporters
                occurrences
                feedbacks
                comments
            }
            evidence {
                occurrenceId
                submissionVersionId
                relation
                evidenceRefs {
                    type
                    versionId
                    start
                    end
                    quote
                    assetId
                    region
                    observation
                }
                environment {
                    platform
                    region
                    gameVersion
                    frequency
                }
                createdAt
            }
            timeline {
                eventId
                kind
                actorKind
                actorId
                entityVersion
                createdAt
            }
            rawSubmissionCount
        }
    }
`

/**
 * @description BUG 列表（服务端排序与分页，筛选条件全部在 URL 中）。
 * 投票数 / 状态会随他人操作变化，列表一律走网络，避免规范化缓存回放旧计数。
 */
export function listBugs(variables: { filter?: Types.BugFilter; sort?: Types.BugSort; offset?: number; limit?: number } = {}) {
    return bugsQuery(variables, { requestPolicy: "network-only" })
}

/**
 * @description BUG 详情（公开投影：bug + stats + evidence + timeline）。
 * 生成的 `bugQuery` 只选了 `bug` 子集，这里补全 stats / evidence / timeline，
 * 避免详情页把缺失字段当成空数据。
 */
export function getBug(id: string): Promise<BugResult<Types.PublicBugDetail>> {
    return queryBug<Types.PublicBugDetail>(BUG_DETAIL_QUERY, { id }, { requestPolicy: "network-only" })
}

/**
 * @description BUG 的原始提交原文：仅 `github_safe` 版本可见，详情页按需单独请求。
 */
export function getBugRawSubmissions(bugId: string): Promise<BugResult<Types.RawSubmission[]>> {
    return queryBug<Types.RawSubmission[]>(rawSubmissionsQuery.raw, { bugId }, { requestPolicy: "network-only" })
}

/**
 * @description BUG 讨论时间线。
 * @param force 是否跳过规范化缓存（自己发表评论后刷新用）
 */
export function getBugDiscussion(bugId: string, offset = 0, limit = 50, force = false) {
    return bugDiscussionQuery({ bugId, offset, limit }, force ? { requestPolicy: "network-only" } : undefined)
}

/**
 * @description BUG 关联（疑似重复 / 相关 / 回归）。
 */
export function getBugRelations(bugId: string) {
    return bugRelationsQuery({ bugId })
}

/**
 * @description 标签语义字典（界面译名来自 `displayI18nKey`）。
 */
export function getBugTagRegistry() {
    return bugTagRegistryQuery()
}

/**
 * @description 当前登录用户的提交 / 投票 / 订阅。
 */
export function getMyBugs() {
    return myBugsQuery(undefined, { requestPolicy: "network-only" })
}

/**
 * @description 读取一条反馈的原始内容与处理结果；登录作者或回执持有者可见。
 * 直接调 client 保留错误码，便于区分“回执无效”和“网络失败”。
 * @param submissionId 反馈 id
 * @param credential 登录 / 回执凭据
 * @returns 反馈详情或错误
 */
export function getSubmission(submissionId: string, credential?: BugCredential): Promise<BugResult<Types.SubmissionDetail | null>> {
    return queryBug<Types.SubmissionDetail | null>(submissionQuery.raw, { id: submissionId }, credentialContext(credential))
}

// ==========================================
// GraphQL：写操作（保留错误码）
// ==========================================

/**
 * @description 把 urql 的 CombinedError / 网络异常归一成带 code 的错误。
 */
function toBugApiError(error: unknown): BugApiError {
    if (error instanceof BugApiError) return error
    const source = error as
        | {
              message?: string
              graphQLErrors?: Array<{ message?: string; extensions?: Record<string, unknown> }>
              networkError?: Error
          }
        | null
        | undefined
    const graphError = source?.graphQLErrors?.[0]
    const code = typeof graphError?.extensions?.code === "string" ? graphError.extensions.code : undefined
    const message = graphError?.message || source?.networkError?.message || source?.message || "请求失败"
    return new BugApiError(message, code)
}

/**
 * @description 从 GraphQL 返回体里取 mutation / query 的顶层字段。
 */
function pickPayload<T>(data: Record<string, unknown> | null | undefined, name: string): T {
    const payload = data?.[name] ?? Object.values(data ?? {})[0]
    return payload as T
}

/**
 * @description 直调 urql query（不吞错误）。
 */
async function queryBug<T>(doc: string, variables: Record<string, unknown>, context?: Record<string, unknown>): Promise<BugResult<T>> {
    try {
        const result = await gqClient.query(gql(doc), variables, context as any).toPromise()
        if (result.error) return { error: toBugApiError(result.error) }
        return { data: pickPayload<T>(result.data, extractType(doc)) }
    } catch (error) {
        return { error: toBugApiError(error) }
    }
}

/**
 * @description 直调 urql mutation（不吞错误，保留 `extensions.code`）。
 */
async function mutateBug<T>(doc: string, variables: Record<string, unknown>, context?: Record<string, unknown>): Promise<BugResult<T>> {
    try {
        const result = await gqClient.mutation(gql(doc), variables, context as any).toPromise()
        if (result.error) return { error: toBugApiError(result.error) }
        return { data: pickPayload<T>(result.data, extractType(doc)) }
    } catch (error) {
        return { error: toBugApiError(error) }
    }
}

/**
 * @description 提交一条新反馈。匿名提交成功后回执 token 自动落盘（界面只负责一次性展示）。
 * @param input 反馈内容
 * @param options 幂等作用域 / 显式幂等键 / 凭据
 * @returns 回执或错误
 */
export async function submitBug(
    input: Types.SubmitBugInput,
    options: { idempotencyKey?: string; scope?: string; credential?: BugCredential } = {}
): Promise<BugResult<Types.SubmissionReceipt>> {
    const scope = options.scope ?? "submit"
    const idempotencyKey = options.idempotencyKey ?? getOrCreateIdempotencyKey(scope)
    const result = await mutateBug<Types.SubmissionReceipt>(
        submitBugMutation.raw,
        { input, idempotencyKey },
        credentialContext(options.credential)
    )
    if (result.data?.receiptToken) setReceiptToken(result.data.submissionId, result.data.receiptToken)
    return result
}

/**
 * @description 追加一条反馈版本（作者补充证据）。
 */
export async function addBugRevision(
    submissionId: string,
    input: Types.SubmitBugInput,
    options: { idempotencyKey?: string; scope?: string; credential?: BugCredential } = {}
): Promise<BugResult<Types.SubmissionReceipt>> {
    const scope = options.scope ?? `revision:${submissionId}`
    const idempotencyKey = options.idempotencyKey ?? getOrCreateIdempotencyKey(scope)
    const result = await mutateBug<Types.SubmissionReceipt>(
        addBugRevisionMutation.raw,
        { submissionId, input, idempotencyKey },
        credentialContext(options.credential)
    )
    if (result.data?.receiptToken) setReceiptToken(result.data.submissionId, result.data.receiptToken)
    return result
}

/**
 * @description 对已有 BUG “我也遇到 / 仍有此问题”反馈；新回执 token 自动落盘。
 */
export async function addFeedback(
    bugId: string,
    input: Types.FeedbackInput,
    credential?: BugCredential
): Promise<BugResult<Types.FeedbackReceipt>> {
    const result = await mutateBug<Types.FeedbackReceipt>(addFeedbackMutation.raw, { bugId, input }, credentialContext(credential))
    if (result.data?.receiptToken) setReceiptToken(result.data.submissionId, result.data.receiptToken)
    return result
}

/**
 * @description 发表公开补充（登录用户或关联回执持有者）。
 */
export function addBugComment(
    bugId: string,
    body: string,
    visibility: Types.Visibility = "public",
    credential?: BugCredential
): Promise<BugResult<Types.CommentResult>> {
    return mutateBug<Types.CommentResult>(addCommentMutation.raw, { bugId, body, visibility }, credentialContext(credential))
}

/**
 * @description 编辑自己的评论（需要当前版本号，服务端做乐观并发校验）。
 */
export function editBugComment(
    commentId: string,
    body: string,
    expectedRevision: number,
    credential?: BugCredential
): Promise<BugResult<Types.CommentResult>> {
    return mutateBug<Types.CommentResult>(editCommentMutation.raw, { commentId, body, expectedRevision }, credentialContext(credential))
}

/**
 * @description 删除自己的评论（服务端墓碑化）。
 */
export function deleteBugComment(commentId: string, credential?: BugCredential): Promise<BugResult<Types.CommentResult>> {
    return mutateBug<Types.CommentResult>(deleteBugCommentMutation.raw, { commentId }, credentialContext(credential))
}

/**
 * @description 设置 / 撤销投票（仅登录用户）。
 */
export function setVote(bugId: string, active: boolean): Promise<BugResult<Types.VoteResult>> {
    return mutateBug<Types.VoteResult>(setVoteMutation.raw, { bugId, active })
}

/**
 * @description 订阅 / 取消订阅某 BUG 的状态变化。
 */
export function setBugSubscription(bugId: string, channels?: string[]): Promise<BugResult<boolean>> {
    return mutateBug<boolean>(setSubscriptionMutation.raw, { bugId, channels })
}

/**
 * @description 用一条既有反馈请求重开（服务端按自动重开策略处理）。
 */
export function requestBugReopen(bugId: string, feedbackId: string): Promise<BugResult<Types.ReopenResult>> {
    return mutateBug<Types.ReopenResult>(requestReopenMutation.raw, { bugId, feedbackId })
}

/**
 * @description 撤回自己的反馈。
 */
export function withdrawBugSubmission(submissionId: string, credential?: BugCredential): Promise<BugResult<boolean>> {
    return mutateBug<boolean>(withdrawSubmissionMutation.raw, { submissionId }, credentialContext(credential))
}

// ==========================================
// 展示辅助（枚举 → i18n key / 徽章样式）
// ==========================================

/**
 * @description 主分类译名 key。
 */
export function categoryLabelKey(category: string): string {
    return `bug.category.${category}`
}

/**
 * @description 严重程度译名 key。
 */
export function severityLabelKey(severity: string): string {
    return `bug.severity.${severity.toLowerCase()}`
}

/**
 * @description 状态译名 key。
 */
export function statusLabelKey(status: string): string {
    return `bug.status.${status}`
}

/**
 * @description 修复阶段译名 key。
 */
export function fixStageLabelKey(tagKey: string): string {
    return `bug.tag.${tagKey}`
}

/**
 * @description 发布策略译名 key。
 */
export function publicationPolicyLabelKey(policy: string): string {
    return `bug.publication.${policy}`
}

/**
 * @description 环境字段值的译名 key：未登记的值（AI 抽取的自由文本）返回 undefined，调用方回退原文。
 */
export function environmentLabelKey(value: string | null | undefined): string | undefined {
    if (!value) return undefined
    for (const options of Object.values(ENVIRONMENT_OPTIONS)) {
        const found = options.find(option => option.value === value)
        if (found?.labelKey) return found.labelKey
    }
    return undefined
}

/**
 * @description 关联类型译名 key。
 */
export function relationLabelKey(relationType: string): string {
    return `bug.relation.${relationType}`
}

/**
 * @description 反馈处理状态译名 key。
 */
export function submissionStateLabelKey(state: string): string {
    return `bug.submission_state.${state}`
}

/**
 * @description 严重程度徽章样式：S0/S1 用错误色，往下逐级淡化，U 用中性色。
 */
export function severityBadgeClass(severity: string): string {
    switch (severity) {
        case "S0":
            return "badge-error"
        case "S1":
            return "badge-warning"
        case "S2":
            return "badge-secondary"
        case "S3":
            return "badge-info"
        case "S4":
            return "badge-ghost"
        default:
            return "badge-outline"
    }
}

/**
 * @description 状态徽章样式：结束态淡化，进行态强调。
 */
export function statusBadgeClass(status: string): string {
    switch (status) {
        case "confirmed":
        case "in_progress":
            return "badge-primary"
        case "resolved":
            return "badge-success"
        case "closed":
        case "duplicate":
        case "rejected":
            return "badge-ghost"
        case "needs_info":
        case "reopen_requested":
            return "badge-warning"
        default:
            return "badge-outline"
    }
}

/**
 * @description 反馈状态是否已经终态（回执页据此停止轮询）。
 */
export function isSubmissionTerminal(state: string): boolean {
    return state === "processed" || state === "failed" || state === "filtered" || state === "withdrawn"
}
