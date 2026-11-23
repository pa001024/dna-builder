import { and, eq, sql } from "drizzle-orm"
import * as schema from "../db/schema"
import { invalidateDedupIndex, isEligibleDuplicateCandidate } from "./dedup"
import { computeIssueBody, defaultIssueTargetMapping } from "./github"
import { sha256Hex } from "./submission"
import {
    composeBugTagSet,
    computeFixStage,
    ensureTagRegistry,
    getTagDefinition,
    isGameCategory,
    tagKeyForCategory,
    tagKeyForSeverity,
} from "./tags"
import {
    type Actor,
    actorRefOf,
    type BugActorRef,
    type BugDb,
    BugDomainError,
    type BugEnvironment,
    type BugJobRow,
    type BugProposal,
    type BugRow,
    type BugSeverity,
    type BugStatus,
    PROPOSAL_MAX_PARTS,
    PROPOSAL_MAX_QUESTIONS,
    PROPOSAL_MAX_STEPS,
    PROPOSAL_MAX_SUMMARY,
    PROPOSAL_MAX_TAGS,
    PROPOSAL_MAX_TITLE,
    PROPOSAL_SCHEMA_VERSION,
    type ProposalPart,
    parseProcessJobKey,
    type SubmissionRow,
    type SubmissionState,
    type SubmissionVersionRow,
    submissionVersionId,
} from "./types"

const DISPOSITIONS = ["game_bug", "needs_info", "not_bug", "filtered", "privacy_blocked"] as const
const DUPLICATE_DECISIONS = ["same", "related", "different", "unknown"] as const
const SEVERITIES: readonly BugSeverity[] = ["S0", "S1", "S2", "S3", "S4", "U"]
const MAX_STEP_LENGTH = 500
const MAX_QUESTION_LENGTH = 500

export type ValidatedProposal = {
    proposal: BugProposal
    job: BugJobRow
    submission: SubmissionRow
    version: SubmissionVersionRow
    versionId: string
    gameId: string
    submissionId: string
    revision: number
}

export type ProposalApplyResult = {
    submissionId: string
    submissionState: SubmissionState
    createdBugIds: string[]
    linkedBugIds: string[]
    occurrenceIds: string[]
    eventIds: string[]
}

function fail(message: string, meta?: Record<string, unknown>): never {
    throw new BugDomainError("VALIDATION_FAILED", message, meta)
}

function assertString(value: unknown, field: string, maxLength: number, required = false): void {
    if (value === null || value === undefined) {
        if (required) fail(`${field} 不能为空`)
        return
    }
    if (typeof value !== "string") fail(`${field} 必须是字符串`)
    if (required && !value.trim()) fail(`${field} 不能为空`)
    if (value.length > maxLength) fail(`${field} 超过长度上限 ${maxLength}`)
}

function codePointLength(text: string): number {
    return Array.from(text).length
}

function codePointSlice(text: string, start: number, end: number): string {
    return Array.from(text).slice(start, end).join("")
}

/** 校验 AI 提供的标签：必须是注册表内允许 AI 发起的标签，且与字段一致。 */
function validateAiTags(part: ProposalPart): string[] {
    if (!Array.isArray(part.tags) || part.tags.length > PROPOSAL_MAX_TAGS) {
        fail("tags 超过数量上限", { partId: part.partId })
    }
    const seen = new Set<string>()
    for (const tagKey of part.tags) {
        if (typeof tagKey !== "string") fail("tags 必须是字符串数组")
        const definition = getTagDefinition(tagKey)
        if (!definition) fail(`未注册的标签：${tagKey}`, { partId: part.partId })
        if (!definition.allowedSources.includes("ai")) fail(`标签不允许由 AI 发起：${tagKey}`, { partId: part.partId })
        if (definition.namespace === "category" && tagKey !== tagKeyForCategory(part.primaryCategory)) {
            fail("分类标签与 primaryCategory 冲突", { partId: part.partId, tagKey })
        }
        const severityTag = tagKeyForSeverity(part.suggestedSeverity)
        if (definition.namespace === "severity" && tagKey !== severityTag) {
            fail("严重程度标签与 suggestedSeverity 冲突", { partId: part.partId, tagKey })
        }
        seen.add(tagKey)
    }
    // 分类与严重程度以字段为准，标签仅校验一致性，不重复写入集合。
    return [...seen].filter(tagKey => {
        const namespace = getTagDefinition(tagKey)?.namespace
        return namespace !== "category" && namespace !== "severity"
    })
}

function validateEvidenceRefs(db: BugDb, part: ProposalPart, versionId: string, rawText: string | null, requireEvidence: boolean): void {
    if (!Array.isArray(part.evidenceRefs)) fail("evidenceRefs 必须是数组", { partId: part.partId })
    if (requireEvidence && !part.evidenceRefs.length) {
        fail("识别为游戏问题时至少需要一条证据引用", { partId: part.partId })
    }

    const textLength = rawText ? codePointLength(rawText) : 0
    for (const reference of part.evidenceRefs) {
        if (reference.type === "text") {
            if (reference.versionId !== versionId) fail("证据引用了其他反馈版本", { partId: part.partId })
            if (!rawText) fail("证据引用了不存在的原文", { partId: part.partId })
            if (!Number.isInteger(reference.start) || !Number.isInteger(reference.end)) fail("证据偏移必须是整数")
            if (reference.start < 0 || reference.end <= reference.start || reference.end > textLength) {
                fail("证据偏移越界", { partId: part.partId, start: reference.start, end: reference.end })
            }
            if (codePointSlice(rawText, reference.start, reference.end) !== reference.quote) {
                fail("证据 quote 与原文切片不一致", { partId: part.partId, start: reference.start, end: reference.end })
            }
            continue
        }

        if (reference.type === "image") {
            const asset = db.select().from(schema.bugAssets).where(eq(schema.bugAssets.id, reference.assetId)).get()
            if (!asset) fail("证据引用了不存在的图片", { partId: part.partId, assetId: reference.assetId })
            if (asset.submissionVersionId !== versionId) fail("证据引用了未授权图片", { partId: part.partId })
            if (reference.region !== null) {
                if (!Array.isArray(reference.region) || reference.region.length !== 4) fail("图片 region 必须是 4 元组")
                if (reference.region.some(value => typeof value !== "number" || value < 0 || value > 1)) {
                    fail("图片 region 必须是 0..1 归一化坐标")
                }
            }
            assertString(reference.observation, "observation", 1000, true)
            continue
        }

        fail("未知的证据引用类型")
    }
}

function validatePart(db: BugDb, part: ProposalPart, versionId: string, rawText: string | null, gameId: string): void {
    if (!part.partId?.trim() || part.partId.length > 64) fail("partId 非法")
    assertString(part.title, "title", PROPOSAL_MAX_TITLE, true)
    assertString(part.summary, "summary", PROPOSAL_MAX_SUMMARY, true)
    assertString(part.actual, "actual", PROPOSAL_MAX_SUMMARY)
    assertString(part.expected, "expected", PROPOSAL_MAX_SUMMARY)
    assertString(part.severityReason, "severityReason", 1000, true)
    if (!isGameCategory(part.primaryCategory)) fail(`未知主分类：${part.primaryCategory}`, { partId: part.partId })
    if (!SEVERITIES.includes(part.suggestedSeverity)) fail(`未知严重程度：${part.suggestedSeverity}`, { partId: part.partId })

    if (!Array.isArray(part.steps) || part.steps.length > PROPOSAL_MAX_STEPS) fail("steps 超过数量上限", { partId: part.partId })
    for (const step of part.steps) assertString(step, "step", MAX_STEP_LENGTH, true)

    if (!Array.isArray(part.missingInformation) || part.missingInformation.length > 20) {
        fail("missingInformation 超过数量上限", { partId: part.partId })
    }
    for (const item of part.missingInformation) assertString(item, "missingInformation", MAX_QUESTION_LENGTH, true)

    if (!part.duplicate || !DUPLICATE_DECISIONS.includes(part.duplicate.decision)) fail("duplicate.decision 非法", { partId: part.partId })
    if (!Array.isArray(part.duplicate.reasons) || !Array.isArray(part.duplicate.contradictions))
        fail("duplicate 证据字段必须是数组", { partId: part.partId })

    if (part.duplicate.candidateBugId) {
        const candidate = db.select().from(schema.bugs).where(eq(schema.bugs.id, part.duplicate.candidateBugId)).get()
        if (!candidate || candidate.gameId !== gameId) fail("判重候选不存在或跨游戏", { partId: part.partId })
        if (part.duplicate.decision === "same" && !isEligibleDuplicateCandidate(db, candidate.id, gameId)) {
            fail("判重候选不可用于自动关联", { partId: part.partId })
        }
    } else if (part.duplicate.decision === "same") {
        fail("decision=same 必须提供候选 Bug", { partId: part.partId })
    }

    validateAiTags(part)
    validateEvidenceRefs(db, part, versionId, rawText, part.duplicate.decision !== "same")
}

/**
 * @description Proposal 的确定性校验：版本 / inputHash / 最新 revision / 字段上限 / 证据切片 /
 * 判重候选与标签权限全部通过才允许应用；不信任模型输出。
 * @param db 数据库
 * @param proposal AI 建议
 * @param job 当前处理任务
 * @returns 校验后的上下文
 */
export function validateProposal(db: BugDb, proposal: BugProposal, job: BugJobRow): ValidatedProposal {
    if (!proposal || typeof proposal !== "object") fail("Proposal 不是对象")
    if (proposal.schemaVersion !== PROPOSAL_SCHEMA_VERSION) fail("Proposal schemaVersion 不匹配", { schemaVersion: proposal.schemaVersion })
    if (job.kind !== "process_submission") fail("任务类型不接受 Proposal")

    const target = parseProcessJobKey(job.idempotencyKey)
    if (!target) fail("任务键无法解析 submission 版本")
    const versionId = submissionVersionId(target.submissionId, target.revision)
    if (proposal.submissionVersionId !== versionId) fail("Proposal 指向其他反馈版本", { expected: versionId })
    if (!job.inputHash || proposal.inputHash !== job.inputHash) fail("Proposal inputHash 与任务不匹配")

    const submission = db.select().from(schema.bugSubmissions).where(eq(schema.bugSubmissions.id, target.submissionId)).get()
    if (!submission) throw new BugDomainError("NOT_FOUND", "反馈不存在")
    const version = db
        .select()
        .from(schema.bugSubmissionVersions)
        .where(
            and(
                eq(schema.bugSubmissionVersions.submissionId, target.submissionId),
                eq(schema.bugSubmissionVersions.revision, target.revision)
            )
        )
        .get()
    if (!version) throw new BugDomainError("NOT_FOUND", "反馈版本不存在")
    if (submission.currentRevision !== target.revision) {
        throw new BugDomainError("CONFLICT", "反馈已有更新版本，拒绝过期结果", { current: submission.currentRevision })
    }
    if (submission.state === "withdrawn") throw new BugDomainError("CONFLICT", "反馈已撤回")

    if (!DISPOSITIONS.includes(proposal.disposition)) fail("未知 disposition")
    if (!Array.isArray(proposal.parts) || proposal.parts.length > PROPOSAL_MAX_PARTS) {
        fail("parts 超过数量上限", { max: PROPOSAL_MAX_PARTS })
    }
    if (!Array.isArray(proposal.clarificationQuestions) || proposal.clarificationQuestions.length > PROPOSAL_MAX_QUESTIONS) {
        fail("clarificationQuestions 超过数量上限")
    }
    for (const question of proposal.clarificationQuestions) assertString(question, "question", MAX_QUESTION_LENGTH, true)

    const partIds = new Set<string>()
    for (const part of proposal.parts) {
        if (!part || typeof part !== "object") fail("part 不是对象")
        if (partIds.has(part.partId)) fail(`重复的 partId：${part.partId}`)
        partIds.add(part.partId)
        validatePart(db, part, versionId, version.rawTextPrivate, submission.gameId)
    }

    return {
        proposal,
        job,
        submission,
        version,
        versionId,
        gameId: submission.gameId,
        submissionId: target.submissionId,
        revision: target.revision,
    }
}

/** 从 Bug 沿 duplicateOf 走到规范根，禁止成环。 */
export function resolveDuplicateRoot(db: BugDb, bugId: string): BugRow {
    const seen = new Set<string>()
    let current = db.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()
    while (current) {
        if (seen.has(current.id)) throw new BugDomainError("CONFLICT", "duplicateOf 存在环")
        seen.add(current.id)
        if (!current.duplicateOf) return current
        current = db.select().from(schema.bugs).where(eq(schema.bugs.id, current.duplicateOf)).get()
    }
    throw new BugDomainError("NOT_FOUND", "判重目标不存在")
}

function nextDisplayKey(db: BugDb): string {
    const row = db
        .select({ value: sql<number>`coalesce(max(cast(substr(${schema.bugs.displayKey}, 5) as integer)), 0)` })
        .from(schema.bugs)
        .get()
    return `BUG-${Number(row?.value ?? 0) + 1}`
}

function writeEvent(
    db: BugDb,
    input: {
        kind: string
        bugId?: string | null
        submissionId?: string | null
        actor: BugActorRef
        payload?: Record<string, unknown>
        entityVersion?: number | null
        now: number
    }
): string {
    const eventId = schema.id()
    db.insert(schema.bugEvents)
        .values({
            eventId,
            bugId: input.bugId ?? null,
            submissionId: input.submissionId ?? null,
            kind: input.kind,
            actor: input.actor,
            payloadSafe: input.payload ?? null,
            entityVersion: input.entityVersion ?? null,
            createdAt: input.now,
        })
        .run()
    return eventId
}

function submissionSourceActor(submission: SubmissionRow, fallback: Actor): BugActorRef {
    if (submission.userId) return { kind: "user", id: submission.userId }
    if (submission.anonActorId) return { kind: "anonymous", id: submission.anonActorId }
    return actorRefOf(fallback)
}

function insertOccurrence(
    db: BugDb,
    input: {
        bugId: string
        versionId: string
        part: ProposalPart
        sourceActor: BugActorRef
        now: number
    }
): string {
    const reportedEnvironment: BugEnvironment = {
        platform: input.part.environment?.platform ?? null,
        region: input.part.environment?.region ?? null,
        gameVersion: input.part.environment?.gameVersion ?? null,
    }
    const row = db
        .insert(schema.bugOccurrences)
        .values({
            bugId: input.bugId,
            submissionVersionId: input.versionId,
            partId: input.part.partId,
            evidenceRefs: input.part.evidenceRefs,
            reportedEnvironment,
            sourceActor: input.sourceActor,
            relation: "original",
            createdAt: input.now,
        })
        .returning({ id: schema.bugOccurrences.id })
        .all()[0]
    if (!row) throw new BugDomainError("CONFLICT", "证据关联写入失败")
    return row.id
}

/** 采纳 AI 建议的严重程度：必须有证据与理由，否则按 U 处理（spec §14.2）。 */
function adoptSeverity(part: ProposalPart): BugSeverity {
    return part.evidenceRefs.length && part.severityReason.trim() ? part.suggestedSeverity : "U"
}

function createBugFromPart(
    db: BugDb,
    ctx: ValidatedProposal,
    part: ProposalPart,
    status: BugStatus,
    sourceActor: BugActorRef,
    now: number
): { bugId: string; eventId: string } {
    const severity = adoptSeverity(part)
    /** 敏感提交只进内部库：Bug 置为 private，且不产出 GitHub 同步任务。 */
    const publishable = ctx.version.publicationPolicy !== "internal_only"
    const tagKeys = composeBugTagSet({
        category: part.primaryCategory,
        severity,
        tags: validateAiTags(part),
        needsInfo: status === "needs_info",
    })
    const fixStage = computeFixStage(tagKeys)
    const bugId = schema.id()
    const displayKey = nextDisplayKey(db)

    db.insert(schema.bugs)
        .values({
            id: bugId,
            displayKey,
            gameId: ctx.gameId,
            primaryCategory: part.primaryCategory,
            tags: tagKeys,
            title: part.title,
            summary: part.summary,
            actual: part.actual,
            expected: part.expected,
            steps: part.steps,
            environment: {
                platform: part.environment?.platform ?? null,
                region: part.environment?.region ?? null,
                gameVersion: part.environment?.gameVersion ?? null,
            },
            status,
            fixStage,
            fixStageSource: "system",
            tagVersion: 1,
            visibility: publishable ? "public" : "private",
            suggestedSeverity: severity === "U" ? null : severity,
            severitySource: severity === "U" ? null : "ai",
            version: 1,
            createdAt: now,
        })
        .run()

    db.insert(schema.bugTagAssignments)
        .values(
            tagKeys.map(tagKey => ({
                bugId,
                tagKey,
                source: tagKey.startsWith("category.") || tagKey.startsWith("severity.") ? "ai" : "system",
                actor: null,
                evidenceRefs: [],
                entityVersion: 1,
                createdAt: now,
            }))
        )
        .run()

    const eventId = writeEvent(db, {
        kind: "bug_created",
        bugId,
        submissionId: ctx.submissionId,
        actor: sourceActor,
        payload: { partId: part.partId, disposition: ctx.proposal.disposition, duplicateDecision: part.duplicate.decision },
        entityVersion: 1,
        now,
    })

    if (publishable) {
        const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()!
        const body = computeIssueBody(bug, { eventId })
        db.insert(schema.bugOutbox)
            .values({
                eventId,
                operation: "create_issue",
                targetMapping: defaultIssueTargetMapping(),
                sourceRevision: ctx.revision,
                payloadHash: sha256Hex(body),
                state: "queued",
                nextAttemptAt: now,
                createdAt: now,
            })
            .onConflictDoNothing()
            .run()
    }

    return { bugId, eventId }
}

function submissionStateForDisposition(disposition: BugProposal["disposition"]): SubmissionState {
    switch (disposition) {
        case "game_bug":
        case "not_bug":
            return "processed"
        case "needs_info":
            return "needs_info"
        case "filtered":
            return "filtered"
        case "privacy_blocked":
            return "privacy_blocked"
    }
}

/**
 * @description 在单个事务内应用 Proposal：重读任务 fencing、重校验版本、写 Bug / Occurrence / 事件 / outbox，
 * 最后推进 Submission 状态；同一 Part 重复提交不会创建第二个 Bug。
 * @param db 数据库
 * @param proposal 已由模型产出但尚未提交的建议
 * @param job 当前任务（必须仍持有租约）
 * @param actor 提交身份（用于审计兜底）
 * @returns 创建 / 关联结果
 */
export function applyProposal(db: BugDb, proposal: BugProposal, job: BugJobRow, actor: Actor): ProposalApplyResult {
    let gameId = ""
    const result = db.transaction(tx => {
        const fresh = tx.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, job.id)).get()
        if (!fresh) throw new BugDomainError("NOT_FOUND", "任务不存在")
        if (fresh.state !== "running" || fresh.fencingToken !== job.fencingToken) {
            throw new BugDomainError("CONFLICT", "任务租约已失效，拒绝提交过期结果")
        }

        const ctx = validateProposal(tx, proposal, fresh)
        gameId = ctx.gameId
        ensureTagRegistry(tx)

        const now = Date.now()
        const sourceActor = submissionSourceActor(ctx.submission, actor)
        const createdBugIds: string[] = []
        const linkedBugIds: string[] = []
        const occurrenceIds: string[] = []
        const eventIds: string[] = []

        for (const part of proposal.parts) {
            const existing = tx
                .select()
                .from(schema.bugOccurrences)
                .where(and(eq(schema.bugOccurrences.submissionVersionId, ctx.versionId), eq(schema.bugOccurrences.partId, part.partId)))
                .get()
            if (existing) {
                linkedBugIds.push(existing.bugId)
                occurrenceIds.push(existing.id)
                continue
            }

            if (proposal.disposition === "game_bug" && part.duplicate.decision === "same" && part.duplicate.candidateBugId) {
                const root = resolveDuplicateRoot(tx, part.duplicate.candidateBugId)
                const occurrenceId = insertOccurrence(tx, { bugId: root.id, versionId: ctx.versionId, part, sourceActor, now })
                occurrenceIds.push(occurrenceId)
                linkedBugIds.push(root.id)
                eventIds.push(
                    writeEvent(tx, {
                        kind: "occurrence_linked",
                        bugId: root.id,
                        submissionId: ctx.submissionId,
                        actor: sourceActor,
                        payload: { partId: part.partId, relation: "same" },
                        entityVersion: root.version + 1,
                        now,
                    })
                )
                tx.update(schema.bugs)
                    .set({ version: sql`${schema.bugs.version} + 1` })
                    .where(eq(schema.bugs.id, root.id))
                    .run()
                continue
            }

            if (proposal.disposition !== "game_bug" && proposal.disposition !== "needs_info") continue

            const status: BugStatus = proposal.disposition === "needs_info" ? "needs_info" : "untriaged"
            const created = createBugFromPart(tx, ctx, part, status, sourceActor, now)
            createdBugIds.push(created.bugId)
            eventIds.push(created.eventId)

            occurrenceIds.push(insertOccurrence(tx, { bugId: created.bugId, versionId: ctx.versionId, part, sourceActor, now }))
            eventIds.push(
                writeEvent(tx, {
                    kind: "occurrence_created",
                    bugId: created.bugId,
                    submissionId: ctx.submissionId,
                    actor: sourceActor,
                    payload: { partId: part.partId },
                    entityVersion: 1,
                    now,
                })
            )
        }

        const submissionState = submissionStateForDisposition(proposal.disposition)
        tx.update(schema.bugSubmissions).set({ state: submissionState }).where(eq(schema.bugSubmissions.id, ctx.submissionId)).run()

        eventIds.push(
            writeEvent(tx, {
                kind: "submission_processed",
                submissionId: ctx.submissionId,
                actor: sourceActor,
                payload: {
                    disposition: proposal.disposition,
                    createdBugIds,
                    linkedBugIds,
                    clarificationQuestions: proposal.clarificationQuestions,
                },
                entityVersion: ctx.revision,
                now,
            })
        )

        return {
            submissionId: ctx.submissionId,
            submissionState,
            createdBugIds,
            linkedBugIds,
            occurrenceIds,
            eventIds,
        }
    })

    invalidateDedupIndex(db, gameId || undefined)
    return result
}
