import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import type { GraphQLError, GraphQLResolveInfo } from "graphql"
import { createGraphQLError } from "graphql-yoga"
import {
    type Actor,
    actorKeyOf,
    actorRefOf,
    addRevision,
    type BugDb,
    BugDomainError,
    type BugEnvironment,
    type BugEvidenceRef,
    type BugPublicationPolicy,
    type BugRelationType,
    type BugRow,
    type BugSeverity,
    type BugStatus,
    canAddFeedback,
    canEditComment,
    canSubmit,
    canVote,
    compareBugRanking,
    createSubmission,
    DEFAULT_FIX_STAGE,
    effectiveSeverity,
    getSubmission,
    isMaintainer,
    loadTagRegistry,
    normalizeForIndex,
    parseSubmissionVersionId,
    resolveDuplicateRoot,
    resolveReceiptActor,
    type SubmissionState,
    severityRank,
    sha256Hex,
    tokenizeQuery,
    toRankingInput,
    withdrawSubmission,
    withIdempotency,
} from "../../bugs"
import { resolveActor } from "../../util/actor"
import { db, schema } from ".."
import type { Context, JWTUser } from "../yoga"
import { getSubSelection } from "."

const DEFAULT_PAGE_LIMIT = 30
const MAX_PAGE_LIMIT = 100
const MAX_QUERY_LENGTH = 200
const MAX_COMMENT_LENGTH = 5_000
const POLL_INTERVAL_SECONDS = 5
const TIMELINE_LIMIT = 100

/** 默认不展示的结束态：重复项与拒绝项只有显式筛选才出现（spec §4.2）。 */
const DEFAULT_HIDDEN_STATUSES: readonly BugStatus[] = ["duplicate", "rejected", "resolved", "closed"]
/** 发布策略的 GraphQL 枚举字面量（spec §18.4 示例使用大写）。 */
const PUBLICATION_POLICY_ENUM = {
    internal_only: "INTERNAL_ONLY",
    catalog_safe: "CATALOG_SAFE",
    github_safe: "GITHUB_SAFE",
} as const

export const typeDefs = /* GraphQL */ `
    enum Severity {
        S0
        S1
        S2
        S3
        S4
        U
    }

    enum BugStatus {
        untriaged
        needs_info
        confirmed
        in_progress
        resolved
        closed
        reopen_requested
        duplicate
        rejected
    }

    enum BugSort {
        priority
        severity
        votes
        recent
        created
    }

    enum TagsMatch {
        any
        all
    }

    enum RelationType {
        possible_duplicate
        related
        regression_of
        duplicate_of
    }

    enum Visibility {
        public
        private
    }

    enum PublicationPolicy {
        INTERNAL_ONLY
        CATALOG_SAFE
        GITHUB_SAFE
    }

    enum ReproductionResult {
        reproduced
        not_reproduced
        unknown
    }

    enum SubmissionState {
        received
        queued
        processing
        processed
        needs_info
        privacy_blocked
        filtered
        retry_wait
        failed
        withdrawn
    }

    enum DiscussionSource {
        local
        github
        system
    }

    type BugEnvironment {
        platform: String
        region: String
        gameVersion: String
        frequency: String
    }

    type GithubIssueSummary {
        linkId: ID!
        repositoryId: String!
        issueId: String!
        issueNumber: Int!
        htmlUrl: String!
        role: String!
        syncState: String!
        remoteState: String
        remoteStateReason: String
        updatedAt: Float
    }

    type Bug {
        id: ID!
        displayKey: String!
        gameId: String!
        title: String!
        summary: String!
        expected: String
        actual: String
        steps: [String!]!
        environment: BugEnvironment
        primaryCategory: String!
        tags: [String!]!
        severity: Severity!
        severitySource: String
        status: BugStatus!
        resolution: String
        fixStage: String!
        fixStageSource: String
        fixEvidenceStatus: String
        visibility: Visibility!
        version: Int!
        tagVersion: Int!
        votes: Int!
        reporters: Int!
        occurrences: Int!
        duplicateOf: ID
        fixedVersion: String
        createdAt: Float!
        lastActivityAt: Float
        githubIssue: GithubIssueSummary
    }

    type BugPage {
        total: Int!
        offset: Int!
        limit: Int!
        items: [Bug!]!
    }

    type BugEvidenceRef {
        type: String!
        versionId: String
        start: Int
        end: Int
        quote: String
        assetId: String
        region: [Float!]
        observation: String
    }

    type BugEvidence {
        occurrenceId: ID!
        submissionVersionId: String!
        relation: String!
        evidenceRefs: [BugEvidenceRef!]!
        environment: BugEnvironment
        createdAt: Float!
    }

    type BugEvent {
        eventId: ID!
        kind: String!
        actorKind: String
        actorId: String
        payload: JSON
        entityVersion: Int
        createdAt: Float!
    }

    type BugStats {
        votes: Int!
        reporters: Int!
        occurrences: Int!
        feedbacks: Int!
        comments: Int!
    }

    type PublicBugDetail {
        bug: Bug!
        stats: BugStats!
        evidence: [BugEvidence!]!
        timeline: [BugEvent!]!
        rawSubmissionCount: Int!
    }

    type RawSubmission {
        submissionId: ID!
        revision: Int!
        text: String!
        createdAt: Float
    }

    type DiscussionEntry {
        id: ID!
        bugId: ID!
        source: DiscussionSource!
        author: String
        body: String!
        revision: Int!
        visibility: Visibility!
        deleted: Boolean!
        createdAt: Float!
    }

    type DiscussionPage {
        total: Int!
        offset: Int!
        limit: Int!
        items: [DiscussionEntry!]!
    }

    type BugRelation {
        id: ID!
        sourceBugId: ID!
        targetBugId: ID!
        relationType: RelationType!
        evidenceRefs: [String!]!
        origin: String!
        state: String!
        revision: Int!
        createdAt: Float!
    }

    type TagDefinition {
        tagKey: String!
        namespace: String!
        exclusiveGroup: String
        displayI18nKey: String!
        semanticDescription: String!
        allowedSources: [String!]!
        evidencePolicy: String
        canonicalLabel: String
        githubLabel: String
    }

    type TagExclusiveGroup {
        group: String!
        tagKeys: [String!]!
    }

    type TagRegistry {
        registryVersion: Int!
        tags: [TagDefinition!]!
        exclusiveGroups: [TagExclusiveGroup!]!
    }

    type SubmissionSummary {
        submissionId: ID!
        state: SubmissionState!
        revision: Int!
        createdAt: Float!
        bugIds: [ID!]!
    }

    type MyBugPage {
        submissions: [SubmissionSummary!]!
        votedBugIds: [ID!]!
        subscribedBugIds: [ID!]!
    }

    type SubmissionInfo {
        submissionId: ID!
        gameId: String!
        state: SubmissionState!
        currentRevision: Int!
        anonymous: Boolean!
        createdAt: Float!
        retentionUntil: Float
    }

    type SubmissionVersion {
        revision: Int!
        text: String
        context: BugEnvironment
        publicationPolicy: PublicationPolicy!
        createdAt: Float!
    }

    type SubmissionAsset {
        assetId: ID!
        mime: String!
        bytes: Int!
        width: Int
        height: Int
        scanState: String!
        redactionState: String!
        hasPublicDerivative: Boolean!
        createdAt: Float!
    }

    type SubmissionDetail {
        submission: SubmissionInfo!
        versions: [SubmissionVersion!]!
        assets: [SubmissionAsset!]!
        bugIds: [ID!]!
    }

    type SubmissionReceipt {
        submissionId: ID!
        revision: Int!
        state: SubmissionState!
        processingMode: String!
        receiptToken: String
        suggestedPollAfterSeconds: Int!
    }

    type FeedbackReceipt {
        feedbackId: ID!
        submissionId: ID!
        bugId: ID!
        state: SubmissionState!
        receiptToken: String
        suggestedPollAfterSeconds: Int!
    }

    type CommentResult {
        ok: Boolean!
        comment: DiscussionEntry
    }

    type VoteResult {
        bugId: ID!
        active: Boolean!
        votes: Int!
        reporters: Int!
    }

    type ReopenResult {
        ok: Boolean!
        bugId: ID!
        status: BugStatus!
        eventId: String
    }

    input BugFilter {
        q: String
        category: [String!]
        tags: [String!]
        tagsMatch: TagsMatch
        severity: [Severity!]
        status: [BugStatus!]
        fixStage: [String!]
        relationType: [RelationType!]
        platform: [String!]
        region: [String!]
        gameVersion: String
        versionFrom: String
        versionTo: String
    }

    input BugContextInput {
        gameId: String!
        platform: String
        region: String
        gameVersion: String
        frequency: String
    }

    input SubmitBugInput {
        text: String
        assetIds: [ID!]
        context: BugContextInput
        publicationPolicy: PublicationPolicy!
    }

    input FeedbackInput {
        text: String
        assetIds: [ID!]
        reproductionResult: ReproductionResult
        gameVersion: String
        environment: BugContextInput
    }

    type Query {
        bug(id: ID!): PublicBugDetail
        bugs(filter: BugFilter, sort: BugSort, offset: Int, limit: Int): BugPage!
        bugDiscussion(bugId: ID!, offset: Int, limit: Int): DiscussionPage!
        bugRelations(bugId: ID!): [BugRelation!]!
        bugTagRegistry: TagRegistry!
        rawSubmissions(bugId: ID!): [RawSubmission!]!
        myBugs: MyBugPage!
        mySubmission(id: ID!): SubmissionDetail
        submission(id: ID!): SubmissionDetail
    }

    type Mutation {
        submitBug(input: SubmitBugInput!, idempotencyKey: String!): SubmissionReceipt!
        addBugRevision(submissionId: ID!, input: SubmitBugInput!, idempotencyKey: String!): SubmissionReceipt!
        withdrawSubmission(submissionId: ID!): Boolean!
        addFeedback(bugId: ID!, input: FeedbackInput!): FeedbackReceipt!
        addComment(bugId: ID!, body: String!, visibility: Visibility): CommentResult!
        editComment(commentId: ID!, body: String!, expectedRevision: Int!): CommentResult!
        deleteBugComment(commentId: ID!): CommentResult!
        setVote(bugId: ID!, active: Boolean!): VoteResult!
        setSubscription(bugId: ID!, channels: [String!], preferences: JSON): Boolean!
        requestReopen(bugId: ID!, feedbackId: ID!): ReopenResult!
    }
`

/** 测试可注入 `context.db`；生产环境走模块单例。 */
export type BugResolverContext = Context & { db?: BugDb }

/**
 * @description 取当前请求使用的数据库：优先 context 注入的测试库，否则用服务端单例。
 * @param context GraphQL 上下文
 * @returns drizzle 实例
 */
export function bugDb(context: Context): BugDb {
    return (context as BugResolverContext).db ?? db
}

/** 构造带 `extensions.code` 的 GraphQL 错误（spec §18.4）。 */
export function gqlError(code: string, message: string, meta?: Record<string, unknown>): GraphQLError {
    return createGraphQLError(message, { extensions: { code, ...(meta ?? {}) } })
}

/**
 * @description 把领域层错误码映射到 GraphQL `extensions.code`；已有 GraphQL 错误原样抛出。
 * @param fn 业务执行体
 * @returns 业务结果
 */
export async function withDomainErrors<T>(fn: () => T | Promise<T>): Promise<T> {
    try {
        return await fn()
    } catch (error) {
        if (error instanceof BugDomainError) throw gqlError(error.code, error.message)
        throw error
    }
}

/** 管理员校验：重新按 JWT 数组精确匹配角色，不用子串判断。 */
export function requireAdmin(context: Context): JWTUser {
    const roles = context.user?.roles
    if (!context.user || !Array.isArray(roles) || !roles.includes("admin")) {
        throw gqlError("FORBIDDEN", "需要管理员权限")
    }
    return context.user
}

/** 是否为管理员（不做抛错，供 Optional 场景用）。 */
export function isAdminContext(context: Context): boolean {
    return Boolean(context.user && Array.isArray(context.user.roles) && context.user.roles.includes("admin"))
}

/**
 * @description 解析请求身份：优先已登录用户，其次回执 / worker 头；凭据无效时抛 UNAUTHORIZED。
 * @param context GraphQL 上下文
 * @returns 领域身份
 */
export async function currentActor(context: Context): Promise<Actor> {
    if (context.user) {
        return { kind: "user", userId: context.user.id, roles: Array.isArray(context.user.roles) ? context.user.roles : [] }
    }
    const headers = context.request?.headers
    if (!headers) return { kind: "anonymous" }
    const actor = await resolveActor(headers)
    if (!actor) throw gqlError("UNAUTHORIZED", "凭据无效")
    return actor
}

/** 要求登录用户；未登录抛 UNAUTHORIZED。 */
export function requireUser(context: Context): JWTUser {
    if (!context.user) throw gqlError("UNAUTHORIZED", "需要登录")
    return context.user
}

export type BugStatsDto = {
    votes: number
    reporters: number
    occurrences: number
    feedbacks: number
    comments: number
    lastActivityAt: number | null
    lastEvidenceAt: number | null
}

export type GithubIssueDto = {
    linkId: string
    repositoryId: string
    issueId: string
    issueNumber: number
    htmlUrl: string
    role: string
    syncState: string
    remoteState: string | null
    remoteStateReason: string | null
    updatedAt: number | null
}

export type BugDto = {
    id: string
    displayKey: string
    gameId: string
    title: string
    summary: string
    expected: string | null
    actual: string | null
    steps: string[]
    environment: BugEnvironment | null
    primaryCategory: string
    tags: string[]
    severity: BugSeverity
    severitySource: string | null
    status: BugStatus
    resolution: string | null
    fixStage: string
    fixStageSource: string | null
    fixEvidenceStatus: string | null
    visibility: "public" | "private"
    version: number
    tagVersion: number
    votes: number
    reporters: number
    occurrences: number
    duplicateOf: string | null
    fixedVersion: string | null
    createdAt: number
    lastActivityAt: number | null
    githubIssue: GithubIssueDto | null
}

/** 批量载入投票、证据与讨论聚合，避免列表逐条查询。 */
export function loadBugStats(db: BugDb, bugIds: readonly string[]): Map<string, BugStatsDto> {
    const stats = new Map<string, BugStatsDto>()
    for (const bugId of bugIds) {
        stats.set(bugId, { votes: 0, reporters: 0, occurrences: 0, feedbacks: 0, comments: 0, lastActivityAt: null, lastEvidenceAt: null })
    }
    if (!bugIds.length) return stats
    const ids = [...new Set(bugIds)]

    const voteRows = db
        .select({ bugId: schema.bugVoteIntents.originalBugId, total: sql<number>`count(*)` })
        .from(schema.bugVoteIntents)
        .where(and(inArray(schema.bugVoteIntents.originalBugId, ids), eq(schema.bugVoteIntents.active, true)))
        .groupBy(schema.bugVoteIntents.originalBugId)
        .all()
    for (const row of voteRows) {
        const entry = stats.get(row.bugId)
        if (entry) entry.votes = Number(row.total)
    }

    const occurrences = db.select().from(schema.bugOccurrences).where(inArray(schema.bugOccurrences.bugId, ids)).all()
    const reporters = new Map<string, Set<string>>()
    for (const occurrence of occurrences) {
        const entry = stats.get(occurrence.bugId)
        if (!entry) continue
        entry.occurrences++
        const createdAt = occurrence.createdAt ?? 0
        if (createdAt > (entry.lastEvidenceAt ?? 0)) entry.lastEvidenceAt = createdAt
        entry.lastActivityAt = Math.max(entry.lastActivityAt ?? 0, createdAt)
        const actor = occurrence.sourceActor
        const key = actor ? `${actor.kind}:${actor.id}` : "unknown"
        if (!reporters.has(occurrence.bugId)) reporters.set(occurrence.bugId, new Set())
        reporters.get(occurrence.bugId)!.add(key)
    }
    for (const [bugId, set] of reporters) {
        const entry = stats.get(bugId)
        if (entry) entry.reporters = set.size
    }

    const feedbackRows = db
        .select({
            bugId: schema.bugFeedback.bugId,
            total: sql<number>`count(*)`,
            latest: sql<number>`max(${schema.bugFeedback.createdAt})`,
        })
        .from(schema.bugFeedback)
        .where(inArray(schema.bugFeedback.bugId, ids))
        .groupBy(schema.bugFeedback.bugId)
        .all()
    for (const row of feedbackRows) {
        const entry = stats.get(row.bugId)
        if (!entry) continue
        entry.feedbacks = Number(row.total)
        entry.lastActivityAt = Math.max(entry.lastActivityAt ?? 0, Number(row.latest ?? 0))
    }

    const commentRows = db
        .select({
            bugId: schema.bugDiscussionEntries.bugId,
            total: sql<number>`count(*)`,
            latest: sql<number>`max(${schema.bugDiscussionEntries.createdAt})`,
        })
        .from(schema.bugDiscussionEntries)
        .where(and(inArray(schema.bugDiscussionEntries.bugId, ids), isNull(schema.bugDiscussionEntries.deletedAt)))
        .groupBy(schema.bugDiscussionEntries.bugId)
        .all()
    for (const row of commentRows) {
        const entry = stats.get(row.bugId)
        if (!entry) continue
        entry.comments = Number(row.total)
        entry.lastActivityAt = Math.max(entry.lastActivityAt ?? 0, Number(row.latest ?? 0))
    }

    return stats
}

/** 关系查询返回的 Issue 链接行。 */
export type GithubIssueLinkRow = typeof schema.githubIssueLinks.$inferSelect

/** 关系查询的 issueLinks → 主 Issue 投影（优先 role=primary）。 */
export function primaryIssueOf(links: readonly GithubIssueLinkRow[] | null | undefined): GithubIssueDto | null {
    if (!links?.length) return null
    const row = links.find(link => link.role === "primary") ?? links[0]
    if (!row) return null
    return {
        linkId: row.id,
        repositoryId: row.repositoryId,
        issueId: row.issueId,
        issueNumber: row.issueNumber,
        htmlUrl: row.htmlUrl,
        role: row.role,
        syncState: row.syncState,
        remoteState: row.remoteState,
        remoteStateReason: row.remoteStateReason,
        updatedAt: row.remoteUpdatedAt,
    }
}

/** 批量取每个 Bug 的当前主 Issue 链接。 */
export function loadPrimaryIssueLinks(db: BugDb, bugIds: readonly string[]): Map<string, GithubIssueDto> {
    const links = new Map<string, GithubIssueDto>()
    if (!bugIds.length) return links
    const rows = db
        .select()
        .from(schema.githubIssueLinks)
        .where(and(inArray(schema.githubIssueLinks.bugId, [...new Set(bugIds)]), eq(schema.githubIssueLinks.role, "primary")))
        .all()
    for (const row of rows) {
        if (links.has(row.bugId)) continue
        const dto = primaryIssueOf([row])
        if (dto) links.set(row.bugId, dto)
    }
    return links
}

/** Bug 行 → GraphQL DTO（严重程度按有效值投影）。 */
export function toBugDto(row: BugRow, stats?: BugStatsDto, issue?: GithubIssueDto | null): BugDto {
    return {
        id: row.id,
        displayKey: row.displayKey,
        gameId: row.gameId,
        title: row.title,
        summary: row.summary,
        expected: row.expected,
        actual: row.actual,
        steps: row.steps ?? [],
        environment: row.environment,
        primaryCategory: row.primaryCategory,
        tags: row.tags ?? [],
        severity: effectiveSeverity(row),
        severitySource: row.severitySource,
        status: row.status,
        resolution: row.resolution,
        fixStage: row.fixStage ?? DEFAULT_FIX_STAGE,
        fixStageSource: row.fixStageSource,
        fixEvidenceStatus: row.fixEvidenceStatus,
        visibility: row.visibility,
        version: row.version,
        tagVersion: row.tagVersion,
        votes: stats?.votes ?? 0,
        reporters: stats?.reporters ?? 0,
        occurrences: stats?.occurrences ?? 0,
        duplicateOf: row.duplicateOf,
        fixedVersion: row.fixedVersion,
        createdAt: row.createdAt ?? 0,
        lastActivityAt: stats?.lastActivityAt ?? row.createdAt ?? null,
        githubIssue: issue ?? null,
    }
}

/** 显式传入的 GraphQL 证据字符串：原样保存（不伪造坐标或引用）。 */
export function evidenceRefsFromStrings(refs: readonly string[] | null | undefined): BugEvidenceRef[] {
    return (refs ?? []).map(ref => ref as unknown as BugEvidenceRef)
}

/** 数据库里的证据引用 → GraphQL 字符串（对象按 JSON 序列化，保持可读且不丢字段）。 */
export function evidenceRefsToGraphql(refs: readonly unknown[] | null | undefined): string[] {
    return (refs ?? []).map(ref => (typeof ref === "string" ? ref : JSON.stringify(ref)))
}

function toEvidenceRefDto(ref: BugEvidenceRef) {
    if (ref && ref.type === "text") {
        return { type: "text", versionId: ref.versionId, start: ref.start, end: ref.end, quote: ref.quote }
    }
    const image = ref as Extract<BugEvidenceRef, { type: "image" }>
    return {
        type: "image",
        assetId: image?.assetId ?? "",
        region: image?.region ? [...image.region] : null,
        observation: image?.observation ?? "",
    }
}

/** 关系查询返回的 Occurrence 行。 */
type BugOccurrenceRow = typeof schema.bugOccurrences.$inferSelect

/**
 * @description 公开证据投影：只保留发布策略允许外发且（图片）已有脱敏派生图的引用；
 * 内部私有来源不出现在公开详情里（spec §3 不变量 10）。
 * @param preloaded 关系查询已取回的 occurrences（未传时按 bugId 现查）
 */
function loadPublicEvidence(db: BugDb, bugId: string, preloaded?: readonly BugOccurrenceRow[]) {
    const occurrences = preloaded ?? db.select().from(schema.bugOccurrences).where(eq(schema.bugOccurrences.bugId, bugId)).all()
    if (!occurrences.length) return []

    const versionIds = [...new Set(occurrences.map(occurrence => occurrence.submissionVersionId))]
    const submissionIds = new Set<string>()
    for (const versionId of versionIds) {
        const parsed = parseSubmissionVersionId(versionId)
        if (parsed) submissionIds.add(parsed.submissionId)
    }
    const policies = new Map<string, BugPublicationPolicy>()
    if (submissionIds.size) {
        const rows = db
            .select()
            .from(schema.bugSubmissionVersions)
            .where(inArray(schema.bugSubmissionVersions.submissionId, [...submissionIds]))
            .all()
        for (const row of rows) policies.set(`${row.submissionId}:${row.revision}`, row.publicationPolicy)
    }

    const imageAssetIds = new Set<string>()
    for (const occurrence of occurrences) {
        for (const ref of occurrence.evidenceRefs ?? []) {
            if (ref.type === "image") imageAssetIds.add(ref.assetId)
        }
    }
    const publicAssetIds = new Set<string>()
    if (imageAssetIds.size) {
        const rows = db
            .select({ id: schema.bugAssets.id })
            .from(schema.bugAssets)
            .where(and(inArray(schema.bugAssets.id, [...imageAssetIds]), sql`${schema.bugAssets.publicDerivativeKey} is not null`))
            .all()
        for (const row of rows) publicAssetIds.add(row.id)
    }

    return occurrences
        .map(occurrence => {
            const policy = policies.get(occurrence.submissionVersionId)
            const evidenceRefs = (occurrence.evidenceRefs ?? [])
                .filter(() => Boolean(policy) && policy !== "internal_only")
                .filter(ref => (ref.type === "image" ? publicAssetIds.has(ref.assetId) : true))
                .map(toEvidenceRefDto)
            return {
                occurrenceId: occurrence.id,
                submissionVersionId: occurrence.submissionVersionId,
                relation: occurrence.relation,
                evidenceRefs,
                environment: occurrence.reportedEnvironment ?? null,
                createdAt: occurrence.createdAt ?? 0,
            }
        })
        .filter(evidence => evidence.evidenceRefs.length > 0)
}

/** 公开原始提交：只返回 `github_safe` 版本（作者明确允许展示原文），同一版本只出现一次。 */
function loadRawSubmissions(db: BugDb, bugId: string, preloaded?: readonly BugOccurrenceRow[]) {
    const occurrences = preloaded ?? db.select().from(schema.bugOccurrences).where(eq(schema.bugOccurrences.bugId, bugId)).all()
    const keys = new Map<string, { submissionId: string; revision: number }>()
    for (const occurrence of occurrences) {
        const parsed = parseSubmissionVersionId(occurrence.submissionVersionId)
        if (parsed) keys.set(`${parsed.submissionId}:${parsed.revision}`, parsed)
    }
    if (keys.size === 0) return []

    const versions = db
        .select()
        .from(schema.bugSubmissionVersions)
        .where(inArray(schema.bugSubmissionVersions.submissionId, [...new Set([...keys.values()].map(key => key.submissionId))]))
        .all()
    const byKey = new Map(versions.map(version => [`${version.submissionId}:${version.revision}`, version]))

    return [...keys.values()]
        .map(key => byKey.get(`${key.submissionId}:${key.revision}`))
        .filter(version => version?.publicationPolicy === "github_safe" && Boolean(version.rawTextPrivate))
        .map(version => ({
            submissionId: version!.submissionId,
            revision: version!.revision,
            text: version!.rawTextPrivate!,
            createdAt: version!.createdAt,
        }))
}

/** Bug 时间线：只输出安全投影后的事件载荷。 */
function toTimelineDto(events: readonly (typeof schema.bugEvents.$inferSelect)[]) {
    return events.map(event => ({
        eventId: event.eventId,
        kind: event.kind,
        actorKind: event.actor?.kind ?? null,
        actorId: event.actor?.id ?? null,
        payload: event.payloadSafe ?? null,
        entityVersion: event.entityVersion,
        createdAt: event.createdAt ?? 0,
    }))
}

type BugFilterInput = {
    q?: string | null
    category?: readonly string[] | null
    tags?: readonly string[] | null
    tagsMatch?: string | null
    severity?: readonly string[] | null
    status?: readonly string[] | null
    fixStage?: readonly string[] | null
    relationType?: readonly string[] | null
    platform?: readonly string[] | null
    region?: readonly string[] | null
    gameVersion?: string | null
    versionFrom?: string | null
    versionTo?: string | null
}

function normalizeLimit(value: number | null | undefined): number {
    if (!value || value <= 0) return DEFAULT_PAGE_LIMIT
    return Math.min(value, MAX_PAGE_LIMIT)
}

function normalizeOffset(value: number | null | undefined): number {
    return value && value > 0 ? Math.trunc(value) : 0
}

/** 版本号按数字段比较；任一侧没有数字时返回 null（不猜测，spec §4.2）。 */
function compareGameVersion(a: string, b: string): number | null {
    const left = a.match(/\d+/g)
    const right = b.match(/\d+/g)
    if (!left || !right) return null
    const length = Math.max(left.length, right.length)
    for (let index = 0; index < length; index++) {
        const l = Number(left[index] ?? 0)
        const r = Number(right[index] ?? 0)
        if (l !== r) return l - r
    }
    return 0
}

function matchesDimension(value: string | null | undefined, selected: readonly string[]): boolean {
    const normalized = value?.trim().toLowerCase() || null
    if (!normalized) return selected.some(item => item.toLowerCase() === "unknown")
    return selected.some(item => item.toLowerCase() === normalized)
}

/** 筛选与排序全部在内存完成：公开库规模小，且版本号/标签语义无法安全下推 SQL。 */
function matchesBugFilter(row: BugRow, filter: BugFilterInput, relationBugIds: Set<string> | null): boolean {
    if (filter.q) {
        const tokens = tokenizeQuery(filter.q)
        const haystack = normalizeForIndex(`${row.title} ${row.summary}`)
        if (!tokens.every(token => haystack.includes(token))) return false
    }
    if (filter.category?.length && !filter.category.includes(row.primaryCategory)) return false
    if (filter.tags?.length) {
        const tags = row.tags ?? []
        const matched =
            filter.tagsMatch === "all" ? filter.tags.every(tag => tags.includes(tag)) : filter.tags.some(tag => tags.includes(tag))
        if (!matched) return false
    }
    if (filter.severity?.length && !filter.severity.includes(effectiveSeverity(row))) return false

    const statuses = filter.status?.length ? filter.status : null
    if (statuses) {
        if (!statuses.includes(row.status)) return false
    } else if (DEFAULT_HIDDEN_STATUSES.includes(row.status)) {
        return false
    }

    if (filter.fixStage?.length) {
        const fixStage = row.fixStage ?? DEFAULT_FIX_STAGE
        if (!filter.fixStage.includes(fixStage)) return false
    }
    if (filter.relationType?.length) {
        if (!relationBugIds?.has(row.id)) return false
    }
    if (filter.platform?.length && !matchesDimension(row.environment?.platform, filter.platform)) return false
    if (filter.region?.length && !matchesDimension(row.environment?.region, filter.region)) return false

    const gameVersion = row.environment?.gameVersion ?? null
    if (filter.gameVersion) {
        const wanted = filter.gameVersion.trim().toLowerCase()
        if (wanted === "unknown") {
            if (gameVersion) return false
        } else if ((gameVersion?.trim().toLowerCase() ?? null) !== wanted) {
            return false
        }
    }
    if (filter.versionFrom) {
        if (!gameVersion) return false
        const compared = compareGameVersion(gameVersion, filter.versionFrom)
        if (compared === null || compared < 0) return false
    }
    if (filter.versionTo) {
        if (!gameVersion) return false
        const compared = compareGameVersion(gameVersion, filter.versionTo)
        if (compared === null || compared > 0) return false
    }
    return true
}

/** 显式按关系类型筛选时，先收集参与该类型有效关系的 Bug。 */
function loadRelationBugIds(db: BugDb, relationTypes: readonly string[]): Set<string> {
    const rows = db
        .select({ sourceBugId: schema.bugRelations.sourceBugId, targetBugId: schema.bugRelations.targetBugId })
        .from(schema.bugRelations)
        .where(
            and(eq(schema.bugRelations.state, "active"), inArray(schema.bugRelations.relationType, [...relationTypes] as BugRelationType[]))
        )
        .all()
    const ids = new Set<string>()
    for (const row of rows) {
        ids.add(row.sourceBugId)
        ids.add(row.targetBugId)
    }
    return ids
}

function sortBugRows<T extends BugRow>(rows: readonly T[], sort: string | null | undefined, stats: Map<string, BugStatsDto>): T[] {
    const list = [...rows]
    const byId = (a: BugRow, b: BugRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    const voteOf = (row: BugRow) => stats.get(row.id)?.votes ?? 0
    switch (sort ?? "priority") {
        case "severity":
            list.sort(
                (a, b) => severityRank(effectiveSeverity(a)) - severityRank(effectiveSeverity(b)) || voteOf(b) - voteOf(a) || byId(a, b)
            )
            break
        case "votes":
            list.sort((a, b) => voteOf(b) - voteOf(a) || (b.createdAt ?? 0) - (a.createdAt ?? 0) || byId(a, b))
            break
        case "recent":
            list.sort((a, b) => (stats.get(b.id)?.lastEvidenceAt ?? 0) - (stats.get(a.id)?.lastEvidenceAt ?? 0) || byId(a, b))
            break
        case "created":
            list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || byId(a, b))
            break
        default:
            list.sort((a, b) =>
                compareBugRanking(
                    toRankingInput(a, {
                        voteCount: voteOf(a),
                        lastEvidenceAt: stats.get(a.id)?.lastEvidenceAt ?? null,
                    }),
                    toRankingInput(b, {
                        voteCount: voteOf(b),
                        lastEvidenceAt: stats.get(b.id)?.lastEvidenceAt ?? null,
                    })
                )
            )
    }
    return list
}

/** 公开 BUG 列表（spec §4.2）：Issue 关联表用 `with` 内联，未选中时不查。 */
async function queryBugPage(
    db: BugDb,
    filter: BugFilterInput | null,
    sort: string | null | undefined,
    offset: number,
    limit: number,
    info: GraphQLResolveInfo
) {
    const normalizedFilter: BugFilterInput = filter ?? {}
    const rows = await db.query.bugs.findMany({
        where: eq(schema.bugs.visibility, "public"),
        with: { issueLinks: getSubSelection(info, "items.githubIssue") ? true : undefined },
    })
    const relationBugIds = normalizedFilter.relationType?.length ? loadRelationBugIds(db, normalizedFilter.relationType) : null
    const matched = rows.filter(row => matchesBugFilter(row, normalizedFilter, relationBugIds))
    const needsStats =
        (sort ?? "priority") !== "created" ||
        Boolean(
            getSubSelection(info, "items.votes") ||
                getSubSelection(info, "items.reporters") ||
                getSubSelection(info, "items.occurrences") ||
                getSubSelection(info, "items.lastActivityAt")
        )
    const stats = needsStats
        ? loadBugStats(
              db,
              matched.map(row => row.id)
          )
        : new Map<string, BugStatsDto>()
    const sorted = sortBugRows(matched, sort, stats)
    const pageRows = sorted.slice(offset, offset + limit)
    return {
        total: matched.length,
        offset,
        limit,
        items: pageRows.map(row => toBugDto(row, stats.get(row.id), primaryIssueOf(row.issueLinks))),
    }
}

type SubmitBugInput = {
    text?: string | null
    assetIds?: readonly string[] | null
    context?: {
        gameId: string
        platform?: string | null
        region?: string | null
        gameVersion?: string | null
        frequency?: string | null
    } | null
    publicationPolicy: string
}

function toBugEnvironment(
    input: { platform?: string | null; region?: string | null; gameVersion?: string | null; frequency?: string | null } | null | undefined
): BugEnvironment | null {
    if (!input) return null
    return {
        platform: input.platform ?? null,
        region: input.region ?? null,
        gameVersion: input.gameVersion ?? null,
        frequency: input.frequency ?? null,
    }
}

function payloadHashOf(input: SubmitBugInput): string {
    return sha256Hex(
        JSON.stringify({
            text: input.text ?? "",
            assetIds: [...(input.assetIds ?? [])].sort(),
            context: input.context
                ? {
                      gameId: input.context.gameId,
                      platform: input.context.platform ?? null,
                      region: input.context.region ?? null,
                      gameVersion: input.context.gameVersion ?? null,
                      frequency: input.context.frequency ?? null,
                  }
                : null,
            publicationPolicy: input.publicationPolicy,
        })
    )
}

function toSubmissionReceipt(receipt: { submissionId: string; revision: number; state: SubmissionState; receiptToken: string | null }) {
    return {
        submissionId: receipt.submissionId,
        revision: receipt.revision,
        state: receipt.state,
        processingMode: "immediate",
        receiptToken: receipt.receiptToken,
        suggestedPollAfterSeconds: POLL_INTERVAL_SECONDS,
    }
}

/** 回执重放时无法再次给出 token（库里只有摘要），其余字段从持久化记录还原。 */
function replaySubmissionReceipt(db: BugDb, submissionId: string) {
    const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, submissionId)).get()
    if (!submission) throw gqlError("NOT_FOUND", "反馈不存在")
    return {
        submissionId: submission.id,
        revision: submission.currentRevision,
        state: submission.state,
        processingMode: "immediate",
        receiptToken: null,
        suggestedPollAfterSeconds: POLL_INTERVAL_SECONDS,
    }
}

/** 评论 / 反馈归属键：登录用户 `user:<id>`，回执 `anon:<anonActorId>`。 */
type ScopedActor = { actor: Actor; actorKey: string; anonActorId: string | null }

/**
 * @description 解析能操作指定 Bug 的身份：登录用户直接通过；回执必须关联到该 Bug
 * （其反馈版本产生了该 Bug 的证据），否则拒绝。
 */
async function actorForBug(context: Context, database: BugDb, bugId: string): Promise<ScopedActor> {
    const actor = await currentActor(context)
    if (actor.kind === "user") return { actor, actorKey: `user:${actor.userId}`, anonActorId: null }
    if (actor.kind !== "receipt") throw gqlError("UNAUTHORIZED", "需要登录或有效回执")

    const resolved = resolveReceiptActor(database, actor.receiptToken)
    if (!resolved) throw gqlError("UNAUTHORIZED", "回执无效")

    const versions = database
        .select({ revision: schema.bugSubmissionVersions.revision })
        .from(schema.bugSubmissionVersions)
        .where(eq(schema.bugSubmissionVersions.submissionId, resolved.submissionId))
        .all()
    const versionIds = versions.map(version => `${resolved.submissionId}:${version.revision}`)
    const linked = versionIds.length
        ? database
              .select({ id: schema.bugOccurrences.id })
              .from(schema.bugOccurrences)
              .where(and(eq(schema.bugOccurrences.bugId, bugId), inArray(schema.bugOccurrences.submissionVersionId, versionIds)))
              .get()
        : undefined
    if (!linked) throw gqlError("FORBIDDEN", "回执不覆盖该 BUG")
    return { actor, actorKey: resolved.actorKey, anonActorId: resolved.anonActorId }
}

/** 讨论可见范围：公开评论 + 本人的私密评论。 */
function discussionOwnerKey(context: Context, database: BugDb, bugId: string): string | null {
    if (context.user) return `user:${context.user.id}`
    const headers = context.request?.headers
    if (!headers) return null
    const authorization = headers.get("authorization")?.trim() ?? ""
    const match = /^Receipt\s+(\S+)$/i.exec(authorization)
    if (!match) return null
    const resolved = resolveReceiptActor(database, match[1]!)
    if (!resolved) return null
    const versions = database
        .select({ revision: schema.bugSubmissionVersions.revision })
        .from(schema.bugSubmissionVersions)
        .where(eq(schema.bugSubmissionVersions.submissionId, resolved.submissionId))
        .all()
    const versionIds = versions.map(version => `${resolved.submissionId}:${version.revision}`)
    if (!versionIds.length) return null
    const linked = database
        .select({ id: schema.bugOccurrences.id })
        .from(schema.bugOccurrences)
        .where(and(eq(schema.bugOccurrences.bugId, bugId), inArray(schema.bugOccurrences.submissionVersionId, versionIds)))
        .get()
    return linked ? resolved.actorKey : null
}

function toDiscussionDto(row: typeof schema.bugDiscussionEntries.$inferSelect) {
    return {
        id: row.id,
        bugId: row.bugId,
        source: row.source,
        author: row.displayAuthor,
        body: row.deletedAt ? "" : row.bodySafe,
        revision: row.revision,
        visibility: row.visibility,
        deleted: Boolean(row.deletedAt),
        createdAt: row.createdAt ?? 0,
    }
}

function displayNameOf(database: BugDb, actor: Actor): string | null {
    if (actor.kind !== "user") return null
    const user = database.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, actor.userId)).get()
    return user?.name ?? null
}

function findBug(database: BugDb, bugId: string): BugRow {
    const bug = database.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()
    if (!bug) throw gqlError("NOT_FOUND", "BUG 不存在")
    return bug
}

function findPublicBug(database: BugDb, bugId: string): BugRow {
    const bug = findBug(database, bugId)
    if (bug.visibility !== "public") throw gqlError("NOT_FOUND", "BUG 不存在")
    return bug
}

function submitInputToDomain(input: SubmitBugInput) {
    return {
        rawTextPrivate: input.text ?? null,
        assetIds: [...(input.assetIds ?? [])],
        context: toBugEnvironment(input.context),
        publicationPolicy: input.publicationPolicy.toLowerCase() as BugPublicationPolicy,
    }
}

function bugIdsOfSubmission(database: BugDb, submissionId: string, revisions: readonly number[]): string[] {
    if (!revisions.length) return []
    const versionIds = revisions.map(revision => `${submissionId}:${revision}`)
    const rows = database
        .select({ bugId: schema.bugOccurrences.bugId })
        .from(schema.bugOccurrences)
        .where(inArray(schema.bugOccurrences.submissionVersionId, versionIds))
        .all()
    return [...new Set(rows.map(row => row.bugId))]
}

function toSubmissionDetailDto(
    database: BugDb,
    detail: NonNullable<ReturnType<typeof getSubmission>>,
    selection: { versions: boolean; assets: boolean; bugIds: boolean }
) {
    const bugIds = selection.bugIds
        ? bugIdsOfSubmission(
              database,
              detail.submission.id,
              detail.versions.map(version => version.revision)
          )
        : []
    return {
        submission: {
            submissionId: detail.submission.id,
            gameId: detail.submission.gameId,
            state: detail.submission.state,
            currentRevision: detail.submission.currentRevision,
            anonymous: Boolean(detail.submission.anonActorId),
            createdAt: detail.submission.createdAt ?? 0,
            retentionUntil: detail.submission.retentionUntil,
        },
        versions: selection.versions
            ? detail.versions
                  .slice()
                  .sort((a, b) => a.revision - b.revision)
                  .map(version => ({
                      revision: version.revision,
                      text: version.rawTextPrivate,
                      context: version.context ?? null,
                      publicationPolicy: PUBLICATION_POLICY_ENUM[version.publicationPolicy],
                      createdAt: version.createdAt ?? 0,
                  }))
            : [],
        assets: selection.assets
            ? detail.assets.map(asset => ({
                  assetId: asset.id,
                  mime: asset.actualMime,
                  bytes: asset.bytes,
                  width: asset.dimensions?.width ?? null,
                  height: asset.dimensions?.height ?? null,
                  scanState: asset.scanState,
                  redactionState: asset.redactionState,
                  hasPublicDerivative: Boolean(asset.publicDerivativeKey),
                  createdAt: asset.createdAt ?? 0,
              }))
            : [],
        bugIds,
    }
}

/** SubmissionDetail 内联表的取用意图：未选中的表不查。 */
function submissionSelectionOf(info: GraphQLResolveInfo) {
    return {
        versions: Boolean(getSubSelection(info, "versions")),
        assets: Boolean(getSubSelection(info, "assets")),
        bugIds: Boolean(getSubSelection(info, "bugIds")),
    }
}

export const resolvers = {
    Query: {
        bug: async (_parent, { id }, context, info) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const wantsIssue = Boolean(getSubSelection(info, "bug.githubIssue"))
                const wantsEvidence = Boolean(getSubSelection(info, "evidence"))
                const wantsRaw = Boolean(getSubSelection(info, "rawSubmissionCount"))
                const wantsTimeline = Boolean(getSubSelection(info, "timeline"))
                const row = await database.query.bugs.findFirst({
                    where: eq(schema.bugs.id, id),
                    with: {
                        issueLinks: wantsIssue ? true : undefined,
                        occurrences: wantsEvidence || wantsRaw ? true : undefined,
                        events: wantsTimeline
                            ? { orderBy: (events, { desc: descEvent }) => [descEvent(events.createdAt)], limit: TIMELINE_LIMIT }
                            : undefined,
                    },
                })
                if (row?.visibility !== "public") return null
                const wantsStats = Boolean(
                    getSubSelection(info, "stats") ||
                        getSubSelection(info, "bug.votes") ||
                        getSubSelection(info, "bug.reporters") ||
                        getSubSelection(info, "bug.occurrences") ||
                        getSubSelection(info, "bug.lastActivityAt")
                )
                const stats = wantsStats ? loadBugStats(database, [row.id]).get(row.id) : undefined
                return {
                    bug: toBugDto(row, stats, primaryIssueOf(row.issueLinks)),
                    stats: {
                        votes: stats?.votes ?? 0,
                        reporters: stats?.reporters ?? 0,
                        occurrences: stats?.occurrences ?? 0,
                        feedbacks: stats?.feedbacks ?? 0,
                        comments: stats?.comments ?? 0,
                    },
                    evidence: wantsEvidence ? loadPublicEvidence(database, row.id, row.occurrences) : [],
                    timeline: wantsTimeline ? toTimelineDto(row.events) : [],
                    rawSubmissionCount: wantsRaw ? loadRawSubmissions(database, row.id, row.occurrences).length : 0,
                }
            }),

        bugs: async (_parent, args, context, info) =>
            withDomainErrors(() => {
                const { filter, sort, offset, limit } = args ?? {}
                if (filter?.q && filter.q.length > MAX_QUERY_LENGTH) {
                    throw gqlError("VALIDATION_FAILED", `关键词不能超过 ${MAX_QUERY_LENGTH} 字符`)
                }
                return queryBugPage(bugDb(context), filter ?? null, sort, normalizeOffset(offset), normalizeLimit(limit), info)
            }),

        bugDiscussion: async (_parent, { bugId, offset, limit }, context) =>
            withDomainErrors(() => {
                const database = bugDb(context)
                const bug = database.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()
                if (bug?.visibility !== "public") {
                    return { total: 0, offset: normalizeOffset(offset), limit: normalizeLimit(limit), items: [] }
                }
                const ownerKey = discussionOwnerKey(context, database, bugId)
                const visibilityWhere = ownerKey
                    ? or(
                          eq(schema.bugDiscussionEntries.visibility, "public"),
                          and(
                              eq(schema.bugDiscussionEntries.visibility, "private"),
                              eq(schema.bugDiscussionEntries.sourceActorId, ownerKey)
                          )
                      )
                    : eq(schema.bugDiscussionEntries.visibility, "public")
                const where = and(
                    eq(schema.bugDiscussionEntries.bugId, bugId),
                    isNull(schema.bugDiscussionEntries.deletedAt),
                    visibilityWhere
                )
                const total = database.select({ total: sql<number>`count(*)` }).from(schema.bugDiscussionEntries).where(where).get()
                const rows = database
                    .select()
                    .from(schema.bugDiscussionEntries)
                    .where(where)
                    .orderBy(desc(schema.bugDiscussionEntries.createdAt), desc(schema.bugDiscussionEntries.id))
                    .limit(normalizeLimit(limit))
                    .offset(normalizeOffset(offset))
                    .all()
                return {
                    total: Number(total?.total ?? 0),
                    offset: normalizeOffset(offset),
                    limit: normalizeLimit(limit),
                    items: rows.map(toDiscussionDto),
                }
            }),

        bugRelations: async (_parent, { bugId }, context) =>
            withDomainErrors(() => {
                const database = bugDb(context)
                const bug = database.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()
                if (!bug) return []
                if (
                    bug.visibility !== "public" &&
                    !isMaintainer({ kind: "user", userId: context.user?.id ?? "", roles: context.user?.roles ?? [] })
                ) {
                    return []
                }
                return database
                    .select()
                    .from(schema.bugRelations)
                    .where(
                        and(
                            eq(schema.bugRelations.state, "active"),
                            or(eq(schema.bugRelations.sourceBugId, bugId), eq(schema.bugRelations.targetBugId, bugId))
                        )
                    )
                    .orderBy(desc(schema.bugRelations.createdAt))
                    .all()
                    .map(relation => ({
                        id: relation.id,
                        sourceBugId: relation.sourceBugId,
                        targetBugId: relation.targetBugId,
                        relationType: relation.relationType,
                        evidenceRefs: evidenceRefsToGraphql(relation.evidenceRefs),
                        origin: relation.origin,
                        state: relation.state,
                        revision: relation.revision,
                        createdAt: relation.createdAt ?? 0,
                    }))
            }),

        bugTagRegistry: async (_parent, _args, context) =>
            withDomainErrors(() => {
                const database = bugDb(context)
                const registry = loadTagRegistry(database)
                const versions = database.select({ version: schema.bugTagDefinitions.registryVersion }).from(schema.bugTagDefinitions).all()
                const registryVersion = versions.reduce((max, row) => Math.max(max, row.version ?? 1), 1)
                const groups = new Map<string, string[]>()
                for (const definition of registry.values()) {
                    if (!definition.exclusiveGroup) continue
                    if (!groups.has(definition.exclusiveGroup)) groups.set(definition.exclusiveGroup, [])
                    groups.get(definition.exclusiveGroup)!.push(definition.tagKey)
                }
                return {
                    registryVersion,
                    tags: [...registry.values()].map(definition => ({
                        tagKey: definition.tagKey,
                        namespace: definition.namespace,
                        exclusiveGroup: definition.exclusiveGroup,
                        displayI18nKey: definition.displayI18nKey,
                        semanticDescription: definition.semanticDescription,
                        allowedSources: definition.allowedSources,
                        evidencePolicy: definition.evidencePolicy,
                        canonicalLabel: definition.canonicalLabel,
                        githubLabel: definition.canonicalLabel,
                    })),
                    exclusiveGroups: [...groups.entries()].map(([group, tagKeys]) => ({ group, tagKeys: tagKeys.sort() })),
                }
            }),

        rawSubmissions: async (_parent, { bugId }, context) =>
            withDomainErrors(() => {
                const database = bugDb(context)
                const bug = database.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()
                if (bug?.visibility !== "public") return []
                return loadRawSubmissions(database, bugId)
            }),

        myBugs: async (_parent, _args, context, info) =>
            withDomainErrors(() => {
                const user = requireUser(context)
                const database = bugDb(context)
                const submissionItems = getSubSelection(info, "submissions")
                    ? database
                          .select()
                          .from(schema.bugSubmissions)
                          .where(eq(schema.bugSubmissions.userId, user.id))
                          .orderBy(desc(schema.bugSubmissions.createdAt))
                          .all()
                          .map(submission => {
                              const versions = database
                                  .select({ revision: schema.bugSubmissionVersions.revision })
                                  .from(schema.bugSubmissionVersions)
                                  .where(eq(schema.bugSubmissionVersions.submissionId, submission.id))
                                  .all()
                              return {
                                  submissionId: submission.id,
                                  state: submission.state,
                                  revision: submission.currentRevision,
                                  createdAt: submission.createdAt ?? 0,
                                  bugIds: bugIdsOfSubmission(
                                      database,
                                      submission.id,
                                      versions.map(version => version.revision)
                                  ),
                              }
                          })
                    : []
                const votes = getSubSelection(info, "votedBugIds")
                    ? database
                          .select({ bugId: schema.bugVoteIntents.originalBugId })
                          .from(schema.bugVoteIntents)
                          .where(and(eq(schema.bugVoteIntents.userId, user.id), eq(schema.bugVoteIntents.active, true)))
                          .all()
                    : []
                const subscriptions = getSubSelection(info, "subscribedBugIds")
                    ? database
                          .select({ bugId: schema.bugSubscriptions.bugId })
                          .from(schema.bugSubscriptions)
                          .where(eq(schema.bugSubscriptions.actorKey, `user:${user.id}`))
                          .all()
                    : []
                return {
                    submissions: submissionItems,
                    votedBugIds: votes.map(vote => vote.bugId),
                    subscribedBugIds: subscriptions.map(subscription => subscription.bugId),
                }
            }),

        mySubmission: async (_parent, { id }, context, info) =>
            withDomainErrors(() => {
                const user = requireUser(context)
                const database = bugDb(context)
                const selection = submissionSelectionOf(info)
                const detail = getSubmission(
                    database,
                    id,
                    { kind: "user", userId: user.id, roles: user.roles ?? [] },
                    { versions: selection.versions || selection.bugIds, assets: selection.assets }
                )
                if (!detail || detail.submission.userId !== user.id) return null
                return toSubmissionDetailDto(database, detail, selection)
            }),

        submission: async (_parent, { id }, context, info) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const actor = await currentActor(context)
                if (actor.kind === "anonymous" || actor.kind === "worker") return null
                const selection = submissionSelectionOf(info)
                const detail = getSubmission(database, id, actor, {
                    versions: selection.versions || selection.bugIds,
                    assets: selection.assets,
                })
                return detail ? toSubmissionDetailDto(database, detail, selection) : null
            }),
    },

    Mutation: {
        submitBug: async (_parent, { input, idempotencyKey }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const actor = await currentActor(context)
                if (!canSubmit(actor)) throw gqlError("FORBIDDEN", "集成身份不能提交反馈")
                const gameId = input.context?.gameId?.trim()
                if (!gameId) throw gqlError("VALIDATION_FAILED", "缺少游戏 id")
                if (!idempotencyKey) throw gqlError("VALIDATION_FAILED", "缺少幂等键")

                const payloadHash = payloadHashOf(input)
                let receipt: ReturnType<typeof createSubmission> | null = null
                const result = withIdempotency(
                    database,
                    { actorKey: actorKeyOf(actor), op: "submitBug", key: idempotencyKey, payloadHash },
                    tx => {
                        receipt = createSubmission(tx as unknown as BugDb, { gameId, ...submitInputToDomain(input) }, actor)
                        return receipt.submissionId
                    }
                )
                if (result.replayed) return replaySubmissionReceipt(database, result.resultId)
                return toSubmissionReceipt(receipt!)
            }),

        addBugRevision: async (_parent, { submissionId, input, idempotencyKey }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const actor = await currentActor(context)
                if (actor.kind === "worker") throw gqlError("FORBIDDEN", "集成身份不能追加反馈")
                if (!idempotencyKey) throw gqlError("VALIDATION_FAILED", "缺少幂等键")

                const payloadHash = payloadHashOf(input)
                let receipt: ReturnType<typeof addRevision> | null = null
                const result = withIdempotency(
                    database,
                    { actorKey: actorKeyOf(actor), op: "addBugRevision", key: idempotencyKey, payloadHash },
                    tx => {
                        receipt = addRevision(tx as unknown as BugDb, submissionId, submitInputToDomain(input), actor)
                        return `${receipt.submissionId}:${receipt.revision}`
                    }
                )
                if (result.replayed) {
                    const parsed = parseSubmissionVersionId(result.resultId)
                    const submission = database
                        .select()
                        .from(schema.bugSubmissions)
                        .where(eq(schema.bugSubmissions.id, parsed?.submissionId ?? submissionId))
                        .get()
                    if (!submission) throw gqlError("NOT_FOUND", "反馈不存在")
                    return {
                        submissionId: submission.id,
                        revision: parsed?.revision ?? submission.currentRevision,
                        state: submission.state,
                        processingMode: "immediate",
                        receiptToken: null,
                        suggestedPollAfterSeconds: POLL_INTERVAL_SECONDS,
                    }
                }
                return toSubmissionReceipt(receipt!)
            }),

        withdrawSubmission: async (_parent, { submissionId }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const actor = await currentActor(context)
                if (actor.kind === "anonymous" || actor.kind === "worker") throw gqlError("UNAUTHORIZED", "需要登录或有效回执")
                return withdrawSubmission(database, submissionId, actor)
            }),

        addFeedback: async (_parent, { bugId, input }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const bug = findPublicBug(database, bugId)
                const actor = await currentActor(context)
                if (!canAddFeedback(actor)) throw gqlError("FORBIDDEN", "集成身份不能提交反馈")

                const environment = toBugEnvironment(input.environment)
                const receipt = createSubmission(
                    database,
                    {
                        gameId: bug.gameId,
                        rawTextPrivate: input.text ?? null,
                        assetIds: [...(input.assetIds ?? [])],
                        context: {
                            ...(environment ?? {}),
                            gameVersion: input.gameVersion ?? environment?.gameVersion ?? null,
                        },
                        publicationPolicy: "internal_only",
                    },
                    actor,
                    { enqueue: false }
                )
                const submission = database
                    .select()
                    .from(schema.bugSubmissions)
                    .where(eq(schema.bugSubmissions.id, receipt.submissionId))
                    .get()
                if (!submission) throw gqlError("UNAVAILABLE", "反馈保存失败")

                const feedbackId = schema.id()
                const now = Date.now()
                database
                    .insert(schema.bugFeedback)
                    .values({
                        id: feedbackId,
                        bugId,
                        submissionVersionId: `${receipt.submissionId}:${receipt.revision}`,
                        feedbackKind: input.reproductionResult ? "reproduction" : "evidence",
                        reproductionResult: input.reproductionResult ?? null,
                        gameVersion: input.gameVersion ?? null,
                        sourceActor: actorRefOf(actor, submission.anonActorId),
                        visibility: "public",
                        createdAt: now,
                    })
                    .run()

                const text = input.text?.trim()
                if (text) {
                    database
                        .insert(schema.bugDiscussionEntries)
                        .values({
                            bugId,
                            source: "local",
                            sourceActorId: actorKeyOf(actor, submission.anonActorId),
                            displayAuthor: displayNameOf(database, actor),
                            bodySafe: text,
                            visibility: "public",
                            feedbackId,
                            exportPolicy: "internal_only",
                            createdAt: now,
                        })
                        .run()
                }

                database
                    .insert(schema.bugEvents)
                    .values({
                        eventId: schema.id(),
                        bugId,
                        submissionId: receipt.submissionId,
                        kind: "new_evidence",
                        actor: actorRefOf(actor, submission.anonActorId),
                        payloadSafe: { feedbackId, reproductionResult: input.reproductionResult ?? null },
                        entityVersion: bug.version,
                        createdAt: now,
                    })
                    .run()

                return {
                    feedbackId,
                    submissionId: receipt.submissionId,
                    bugId,
                    state: receipt.state,
                    receiptToken: receipt.receiptToken,
                    suggestedPollAfterSeconds: POLL_INTERVAL_SECONDS,
                }
            }),

        addComment: async (_parent, { bugId, body, visibility }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                findPublicBug(database, bugId)
                const scoped = await actorForBug(context, database, bugId)
                const text = body?.trim()
                if (!text) throw gqlError("VALIDATION_FAILED", "评论内容不能为空")
                if (text.length > MAX_COMMENT_LENGTH) throw gqlError("VALIDATION_FAILED", `评论不能超过 ${MAX_COMMENT_LENGTH} 个字符`)

                const commentVisibility = visibility ?? "public"
                const [row] = database
                    .insert(schema.bugDiscussionEntries)
                    .values({
                        bugId,
                        source: "local",
                        sourceActorId: scoped.actorKey,
                        displayAuthor: displayNameOf(database, scoped.actor),
                        bodySafe: text,
                        visibility: commentVisibility,
                        exportPolicy: commentVisibility === "public" ? "github_safe" : "internal_only",
                    })
                    .returning()
                    .all()
                if (!row) throw gqlError("UNAVAILABLE", "评论保存失败")
                return { ok: true, comment: toDiscussionDto(row) }
            }),

        editComment: async (_parent, { commentId, body, expectedRevision }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const entry = database.select().from(schema.bugDiscussionEntries).where(eq(schema.bugDiscussionEntries.id, commentId)).get()
                if (!entry || entry.deletedAt) throw gqlError("NOT_FOUND", "评论不存在")
                const scoped = await actorForBug(context, database, entry.bugId)
                if (!canEditComment(scoped.actor, entry, scoped.actorKey)) throw gqlError("FORBIDDEN", "无权编辑此评论")
                if (entry.revision !== expectedRevision)
                    throw gqlError("CONFLICT", "评论已被修改，请刷新后重试", { current: entry.revision })

                const text = body?.trim()
                if (!text) throw gqlError("VALIDATION_FAILED", "评论内容不能为空")
                if (text.length > MAX_COMMENT_LENGTH) throw gqlError("VALIDATION_FAILED", `评论不能超过 ${MAX_COMMENT_LENGTH} 个字符`)

                const [row] = database
                    .update(schema.bugDiscussionEntries)
                    .set({
                        bodySafe: text,
                        revision: entry.revision + 1,
                        exportPolicy: entry.visibility === "public" ? "github_safe" : "internal_only",
                    })
                    .where(eq(schema.bugDiscussionEntries.id, commentId))
                    .returning()
                    .all()
                if (!row) throw gqlError("UNAVAILABLE", "评论更新失败")
                return { ok: true, comment: toDiscussionDto(row) }
            }),

        deleteBugComment: async (_parent, { commentId }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const entry = database.select().from(schema.bugDiscussionEntries).where(eq(schema.bugDiscussionEntries.id, commentId)).get()
                if (!entry || entry.deletedAt) throw gqlError("NOT_FOUND", "评论不存在")
                const scoped = await actorForBug(context, database, entry.bugId)
                if (!canEditComment(scoped.actor, entry, scoped.actorKey)) throw gqlError("FORBIDDEN", "无权删除此评论")

                const [row] = database
                    .update(schema.bugDiscussionEntries)
                    .set({ bodySafe: "", deletedAt: Date.now() })
                    .where(eq(schema.bugDiscussionEntries.id, commentId))
                    .returning()
                    .all()
                if (!row) throw gqlError("UNAVAILABLE", "评论删除失败")
                return { ok: true, comment: toDiscussionDto(row) }
            }),

        setVote: async (_parent, { bugId, active }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const user = requireUser(context)
                const actor: Actor = { kind: "user", userId: user.id, roles: user.roles ?? [] }
                if (!canVote(actor)) throw gqlError("FORBIDDEN", "只有登录用户可以投票")

                const bug = findPublicBug(database, bugId)
                const root = resolveDuplicateRoot(database, bug.id)
                const now = Date.now()
                database
                    .insert(schema.bugVoteIntents)
                    .values({ userId: user.id, originalBugId: root.id, active, updatedAt: now })
                    .onConflictDoUpdate({
                        target: [schema.bugVoteIntents.userId, schema.bugVoteIntents.originalBugId],
                        set: { active, updatedAt: now },
                    })
                    .run()

                const stats = loadBugStats(database, [root.id]).get(root.id)
                const current = database
                    .select({ active: schema.bugVoteIntents.active })
                    .from(schema.bugVoteIntents)
                    .where(and(eq(schema.bugVoteIntents.userId, user.id), eq(schema.bugVoteIntents.originalBugId, root.id)))
                    .get()
                return {
                    bugId: root.id,
                    active: Boolean(current?.active),
                    votes: stats?.votes ?? 0,
                    reporters: stats?.reporters ?? 0,
                }
            }),

        setSubscription: async (_parent, { bugId, channels, preferences }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                findPublicBug(database, bugId)
                const scoped = await actorForBug(context, database, bugId)
                database
                    .insert(schema.bugSubscriptions)
                    .values({
                        actorKey: scoped.actorKey,
                        bugId,
                        channels: channels?.length ? [...channels] : ["in_app"],
                        preferences: (preferences as Record<string, unknown> | null) ?? null,
                    })
                    .onConflictDoUpdate({
                        target: [schema.bugSubscriptions.actorKey, schema.bugSubscriptions.bugId],
                        set: {
                            channels: channels?.length ? [...channels] : ["in_app"],
                            preferences: (preferences as Record<string, unknown> | null) ?? null,
                        },
                    })
                    .run()
                return true
            }),

        requestReopen: async (_parent, { bugId, feedbackId }, context) =>
            withDomainErrors(async () => {
                const database = bugDb(context)
                const bug = findPublicBug(database, bugId)
                const scoped = await actorForBug(context, database, bugId)
                const feedback = database.select().from(schema.bugFeedback).where(eq(schema.bugFeedback.id, feedbackId)).get()
                if (!feedback || feedback.bugId !== bugId) throw gqlError("NOT_FOUND", "反馈不存在")

                const now = Date.now()
                const eventId = schema.id()
                database
                    .insert(schema.bugEvents)
                    .values({
                        eventId,
                        bugId,
                        kind: "reopen_requested",
                        actor: actorRefOf(scoped.actor, scoped.anonActorId),
                        payloadSafe: { feedbackId },
                        entityVersion: bug.version + 1,
                        createdAt: now,
                    })
                    .run()
                database
                    .update(schema.bugs)
                    .set({ status: "reopen_requested", version: sql`${schema.bugs.version} + 1` })
                    .where(eq(schema.bugs.id, bugId))
                    .run()

                return { ok: true, bugId, status: "reopen_requested" as const, eventId }
            }),
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type BugGQL = CreateMobius<typeof typeDefs>
