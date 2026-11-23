import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"
import type * as schema from "../db/schema"
import type {
    BugActorRef,
    BugDiscussionSource,
    BugEnvironment,
    BugEvidenceRef,
    BugJobPriority,
    BugJobState,
    BugOutboxState,
    BugPublicationPolicy,
    BugRelationType,
    BugReproductionResult,
    BugSeverity,
    BugStatus,
    BugSubmissionState,
    BugVisibility,
} from "../db/schema"
import type { Actor } from "../util/actor"

export type {
    Actor,
    BugActorRef,
    BugDiscussionSource,
    BugEnvironment,
    BugEvidenceRef,
    BugJobPriority,
    BugJobState,
    BugOutboxState,
    BugPublicationPolicy,
    BugRelationType,
    BugReproductionResult,
    BugSeverity,
    BugStatus,
    BugSubmissionState,
    BugVisibility,
}

export type BugDb = BunSQLiteDatabase<typeof schema>
export type BugTx = Parameters<Parameters<BugDb["transaction"]>[0]>[0]

export type Severity = BugSeverity
export type SubmissionState = BugSubmissionState
export type JobState = BugJobState
export type OutboxState = BugOutboxState
export type EvidenceRef = BugEvidenceRef
export type BugRow = typeof schema.bugs.$inferSelect
export type BugJobRow = typeof schema.bugJobs.$inferSelect
export type SubmissionRow = typeof schema.bugSubmissions.$inferSelect
export type SubmissionVersionRow = typeof schema.bugSubmissionVersions.$inferSelect
export type BugAssetRow = typeof schema.bugAssets.$inferSelect
export type BugOccurrenceRow = typeof schema.bugOccurrences.$inferSelect
export type BugTagAssignmentRow = typeof schema.bugTagAssignments.$inferSelect
export type TagDefinitionRow = typeof schema.bugTagDefinitions.$inferSelect

/** 领域错误码，与 GraphQL `extensions.code` 对齐。 */
export type BugErrorCode = "VALIDATION_FAILED" | "CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "RATE_LIMITED" | "UNAVAILABLE"

/** 领域层统一错误：调用方按 code 映射接口错误，不向用户泄露内部细节。 */
export class BugDomainError extends Error {
    readonly code: BugErrorCode
    readonly meta?: Record<string, unknown>

    constructor(code: BugErrorCode, message: string, meta?: Record<string, unknown>) {
        super(message)
        this.name = "BugDomainError"
        this.code = code
        this.meta = meta
    }
}

/** 修复阶段 tagKey，空集规范成 `fix.unconfirmed`（spec §15.6.1）。 */
export const FIX_STAGE_KEYS = [
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

export type FixStage = (typeof FIX_STAGE_KEYS)[number]

/** 默认修复阶段：没有有效 fix 标签时按未确认处理。 */
export const DEFAULT_FIX_STAGE: FixStage = "fix.unconfirmed"

/** 任务类型约定；Proposal 提交依赖 `process_submission:<submissionId>:<revision>` 口径。 */
export const BUG_JOB_KINDS = {
    processSubmission: "process_submission",
    rebuildDedupIndex: "rebuild_dedup_index",
    syncIssue: "sync_issue",
} as const

export type BugJobKind = (typeof BUG_JOB_KINDS)[keyof typeof BUG_JOB_KINDS]

/** Proposal 的处理结论（spec §11.2）。 */
export type ProposalDisposition = "game_bug" | "needs_info" | "not_bug" | "filtered" | "privacy_blocked"

/** AI 判重结论；只有 `same` 允许直接关联已有 Bug。 */
export type DuplicateDecision = "same" | "related" | "different" | "unknown"

export type ProposalPart = {
    partId: string
    title: string
    summary: string
    primaryCategory: string
    tags: string[]
    actual: string | null
    expected: string | null
    steps: string[]
    environment: { platform: string | null; region: string | null; gameVersion: string | null }
    suggestedSeverity: Severity
    severityReason: string
    evidenceRefs: EvidenceRef[]
    duplicate: {
        decision: DuplicateDecision
        candidateBugId: string | null
        reasons: string[]
        contradictions: string[]
    }
    missingInformation: string[]
}

/** pi 产出的结构化建议；应用前必须通过确定性校验与事务提交。 */
export type BugProposal = {
    schemaVersion: 1
    submissionVersionId: string
    inputHash: string
    disposition: ProposalDisposition
    parts: ProposalPart[]
    clarificationQuestions: string[]
}

export const PROPOSAL_SCHEMA_VERSION = 1
export const PROPOSAL_MAX_PARTS = 8
export const PROPOSAL_MAX_TITLE = 100
export const PROPOSAL_MAX_SUMMARY = 2000
export const PROPOSAL_MAX_STEPS = 20
export const PROPOSAL_MAX_TAGS = 8
export const PROPOSAL_MAX_QUESTIONS = 3

/** Submission 版本标识：`<submissionId>:<revision>`。 */
export function submissionVersionId(submissionId: string, revision: number): string {
    return `${submissionId}:${revision}`
}

/** 解析版本标识；格式不符返回 null（不猜测）。 */
export function parseSubmissionVersionId(value: string): { submissionId: string; revision: number } | null {
    const match = /^(.+):(\d+)$/.exec(value)
    if (!match) return null
    const revision = Number(match[2])
    if (!Number.isInteger(revision) || revision < 1) return null
    return { submissionId: match[1]!, revision }
}

/** 任务幂等键：一次 revision 只有一个处理任务。 */
export function processJobKey(submissionId: string, revision: number): string {
    return `${BUG_JOB_KINDS.processSubmission}:${submissionId}:${revision}`
}

/** 从任务幂等键反解 submission 版本；非处理任务返回 null。 */
export function parseProcessJobKey(idempotencyKey: string): { submissionId: string; revision: number } | null {
    const match = /^process_submission:([^:]+):(\d+)$/.exec(idempotencyKey)
    if (!match) return null
    return { submissionId: match[1]!, revision: Number(match[2]) }
}

/** Actor 转审计引用；回执身份必须由调用方先解析出 anonActorId。 */
export function actorRefOf(actor: Actor, anonActorId?: string | null): BugActorRef {
    switch (actor.kind) {
        case "user":
            return { kind: "user", id: actor.userId }
        case "worker":
            return { kind: "worker", id: actor.workerId }
        case "receipt":
            return { kind: "anonymous", id: anonActorId ?? "anonymous" }
        default:
            return { kind: "anonymous", id: "anonymous" }
    }
}
