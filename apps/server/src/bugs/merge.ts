import { and, eq, inArray, sql } from "drizzle-orm"
import * as schema from "../db/schema"
import { invalidateDedupIndex } from "./dedup"
import { canAdminEdit } from "./permissions"
import { type Actor, actorRefOf, type BugDb, BugDomainError, type BugRow } from "./types"

export type MergeBugsOptions = {
    reason?: string
    /** 每个参与 Bug 的期望版本（乐观并发）；缺失的条目跳过校验。 */
    expectedVersions?: Record<string, number>
    evidence?: Record<string, unknown>
    now?: number
}

export type MergeBugsResult = {
    mergeEventId: string
    targetId: string
    movedOccurrenceIds: string[]
}

export type RevertMergeResult = {
    mergeEventId: string
    restoredOccurrenceIds: string[]
    sourceBugIds: string[]
}

type BeforeState = { status: string; duplicateOf: string | null; version: number }
type VoteRestore = { userId: string; originalBugId: string; beforeActive: boolean }

/**
 * @description 合并已有 Bug：迁移证据关联、按用户去重投票、标记源记录为 duplicate、
 * 写归并日志与关闭遗留 Issue 的 outbox；禁止成环，也不允许重复合并到同一目标。
 * @param db 数据库
 * @param sourceIds 被归并的 Bug
 * @param targetId 规范根
 * @param actor 维护者身份
 * @param options 理由、期望版本与证据
 * @returns 归并结果
 */
export function mergeBugs(
    db: BugDb,
    sourceIds: readonly string[],
    targetId: string,
    actor: Actor,
    options: MergeBugsOptions = {}
): MergeBugsResult {
    if (!canAdminEdit(actor)) throw new BugDomainError("FORBIDDEN", "只有维护者可以合并 BUG")

    const uniqueSources = [...new Set(sourceIds)].filter(id => id !== targetId)
    if (!uniqueSources.length) throw new BugDomainError("VALIDATION_FAILED", "至少需要一个不同于目标的源 BUG")

    const now = options.now ?? Date.now()
    let gameId = ""

    const result = db.transaction(tx => {
        const target = tx.select().from(schema.bugs).where(eq(schema.bugs.id, targetId)).get()
        if (!target) throw new BugDomainError("NOT_FOUND", "目标 BUG 不存在")
        gameId = target.gameId

        const sources = tx.select().from(schema.bugs).where(inArray(schema.bugs.id, uniqueSources)).all()
        if (sources.length !== uniqueSources.length) throw new BugDomainError("NOT_FOUND", "存在无效的源 BUG")

        assertNoCycle(tx, target, uniqueSources)

        for (const source of sources) {
            if (source.duplicateOf === targetId) {
                throw new BugDomainError("CONFLICT", "源 BUG 已经归并到目标", { sourceId: source.id })
            }
            assertExpectedVersion(options.expectedVersions, source.id, source.version)
        }
        assertExpectedVersion(options.expectedVersions, target.id, target.version)

        const occurrences = tx.select().from(schema.bugOccurrences).where(inArray(schema.bugOccurrences.bugId, uniqueSources)).all()
        const movedOccurrenceIds = occurrences.map(occurrence => occurrence.id)
        const originalOwners: Record<string, string> = {}
        for (const occurrence of occurrences) originalOwners[occurrence.id] = occurrence.bugId
        if (movedOccurrenceIds.length) {
            tx.update(schema.bugOccurrences)
                .set({ bugId: targetId, relation: "merged" })
                .where(inArray(schema.bugOccurrences.id, movedOccurrenceIds))
                .run()
        }

        const voteRestores = dedupeVotes(tx, uniqueSources, targetId)

        const beforeStates: Record<string, BeforeState> = {}
        for (const bug of [...sources, target]) {
            beforeStates[bug.id] = { status: bug.status, duplicateOf: bug.duplicateOf, version: bug.version }
        }
        const beforeVersions: Record<string, number> = {}
        for (const bug of [...sources, target]) beforeVersions[bug.id] = bug.version

        tx.update(schema.bugs)
            .set({ status: "duplicate", duplicateOf: targetId, version: sql`${schema.bugs.version} + 1` })
            .where(inArray(schema.bugs.id, uniqueSources))
            .run()
        tx.update(schema.bugs)
            .set({ version: sql`${schema.bugs.version} + 1` })
            .where(eq(schema.bugs.id, targetId))
            .run()

        const mergeEventId = schema.id()
        tx.insert(schema.bugMergeEvents)
            .values({
                id: mergeEventId,
                sourceBugIds: uniqueSources,
                targetBugId: targetId,
                decisionEvidence: {
                    reason: options.reason ?? null,
                    ...(options.evidence ?? {}),
                    originalOwners,
                    beforeStates,
                    voteRestores,
                },
                beforeVersions,
                movedOccurrenceIds,
                actor: actorRefOf(actor),
                createdAt: now,
            })
            .run()

        const eventId = schema.id()
        tx.insert(schema.bugEvents)
            .values({
                eventId,
                bugId: targetId,
                kind: "bugs_merged",
                actor: actorRefOf(actor),
                payloadSafe: { mergeEventId, sourceBugIds: uniqueSources, movedOccurrenceIds },
                entityVersion: target.version + 1,
                createdAt: now,
            })
            .run()

        const links = tx
            .select()
            .from(schema.githubIssueLinks)
            .where(and(inArray(schema.githubIssueLinks.bugId, uniqueSources), eq(schema.githubIssueLinks.role, "primary")))
            .all()
        if (links.length) {
            tx.insert(schema.bugOutbox)
                .values(
                    links.map(link => ({
                        eventId,
                        operation: "close_duplicate_issue",
                        targetMapping: `repo:${link.repositoryId}:issue:${link.issueId}`,
                        state: "queued" as const,
                        nextAttemptAt: now,
                        createdAt: now,
                    }))
                )
                .onConflictDoNothing()
                .run()
        }

        return { mergeEventId, targetId, movedOccurrenceIds }
    })

    if (gameId) invalidateDedupIndex(db, gameId)
    return result
}

function assertExpectedVersion(expected: Record<string, number> | undefined, bugId: string, current: number): void {
    const wanted = expected?.[bugId]
    if (wanted !== undefined && wanted !== current) {
        throw new BugDomainError("CONFLICT", "BUG 版本已变化，请刷新后重试", { bugId, expected: wanted, current })
    }
}

/** 目标不能是被归并源的后代，既有的 duplicateOf 链也不能成环。 */
function assertNoCycle(db: BugDb, target: BugRow, sourceIds: readonly string[]): void {
    const sources = new Set(sourceIds)
    const chain = new Set<string>()
    let cursor: BugRow | undefined = target
    while (cursor) {
        if (sources.has(cursor.id)) throw new BugDomainError("CONFLICT", "合并会形成 duplicateOf 环")
        if (chain.has(cursor.id)) throw new BugDomainError("CONFLICT", "既有 duplicateOf 链存在环")
        chain.add(cursor.id)
        if (!cursor.duplicateOf) break
        cursor = db.select().from(schema.bugs).where(eq(schema.bugs.id, cursor.duplicateOf)).get()
    }
}

/** 同一用户在主目标与源记录上都有意图时，只保留较新一条生效，并记录可恢复的原状态。 */
function dedupeVotes(db: BugDb, sourceIds: readonly string[], targetId: string): VoteRestore[] {
    const sourceVotes = db.select().from(schema.bugVoteIntents).where(inArray(schema.bugVoteIntents.originalBugId, sourceIds)).all()
    if (!sourceVotes.length) return []

    const targetVotes = new Map(
        db
            .select()
            .from(schema.bugVoteIntents)
            .where(eq(schema.bugVoteIntents.originalBugId, targetId))
            .all()
            .map(vote => [vote.userId, vote])
    )

    const restores: VoteRestore[] = []
    for (const vote of sourceVotes) {
        const existing = targetVotes.get(vote.userId)
        if (!existing) continue
        const voteTime = vote.updatedAt ?? 0
        const existingTime = existing.updatedAt ?? 0
        const loser = voteTime > existingTime ? existing : vote
        if (!loser.active) continue

        db.update(schema.bugVoteIntents)
            .set({ active: false, updatedAt: existingTime > voteTime ? existingTime : voteTime })
            .where(and(eq(schema.bugVoteIntents.userId, loser.userId), eq(schema.bugVoteIntents.originalBugId, loser.originalBugId)))
            .run()
        restores.push({ userId: loser.userId, originalBugId: loser.originalBugId, beforeActive: true })
    }
    return restores
}

/**
 * @description 解除误合并：按 merge event 的原始快照恢复证据归属、源 Bug 状态与投票意图，
 * 不凭当前缓存猜测原数据。
 * @param db 数据库
 * @param mergeEventId 归并日志 id
 * @param actor 维护者身份
 * @param options 理由与时间
 * @returns 恢复结果
 */
export function revertMergeBugs(
    db: BugDb,
    mergeEventId: string,
    actor: Actor,
    options: { reason?: string; now?: number } = {}
): RevertMergeResult {
    if (!canAdminEdit(actor)) throw new BugDomainError("FORBIDDEN", "只有维护者可以解除合并")
    const now = options.now ?? Date.now()
    let gameId = ""

    const result = db.transaction(tx => {
        const event = tx.select().from(schema.bugMergeEvents).where(eq(schema.bugMergeEvents.id, mergeEventId)).get()
        if (!event) throw new BugDomainError("NOT_FOUND", "归并记录不存在")
        if (event.revertedAt) throw new BugDomainError("CONFLICT", "该归并已解除")

        const target = tx.select().from(schema.bugs).where(eq(schema.bugs.id, event.targetBugId)).get()
        if (target) gameId = target.gameId

        const evidence = (event.decisionEvidence ?? {}) as {
            originalOwners?: Record<string, string>
            beforeStates?: Record<string, BeforeState>
            voteRestores?: VoteRestore[]
        }

        const restoredOccurrenceIds: string[] = []
        for (const [occurrenceId, originalBugId] of Object.entries(evidence.originalOwners ?? {})) {
            const updated = tx
                .update(schema.bugOccurrences)
                .set({ bugId: originalBugId, relation: "original" })
                .where(and(eq(schema.bugOccurrences.id, occurrenceId), eq(schema.bugOccurrences.bugId, event.targetBugId)))
                .returning({ id: schema.bugOccurrences.id })
                .all()
            if (updated.length) restoredOccurrenceIds.push(occurrenceId)
        }

        const sourceBugIds = event.sourceBugIds ?? []
        for (const sourceId of sourceBugIds) {
            const before = evidence.beforeStates?.[sourceId]
            tx.update(schema.bugs)
                .set({
                    status: (before?.status as BugRow["status"]) ?? "untriaged",
                    duplicateOf: before?.duplicateOf ?? null,
                    version: sql`${schema.bugs.version} + 1`,
                })
                .where(eq(schema.bugs.id, sourceId))
                .run()
        }

        for (const restore of evidence.voteRestores ?? []) {
            if (!restore.beforeActive) continue
            tx.update(schema.bugVoteIntents)
                .set({ active: true, updatedAt: now })
                .where(
                    and(eq(schema.bugVoteIntents.userId, restore.userId), eq(schema.bugVoteIntents.originalBugId, restore.originalBugId))
                )
                .run()
        }

        tx.update(schema.bugMergeEvents).set({ revertedAt: now }).where(eq(schema.bugMergeEvents.id, mergeEventId)).run()

        tx.insert(schema.bugEvents)
            .values({
                eventId: schema.id(),
                bugId: event.targetBugId,
                kind: "merge_reverted",
                actor: actorRefOf(actor),
                payloadSafe: { mergeEventId, sourceBugIds, reason: options.reason ?? null, restoredOccurrenceIds },
                createdAt: now,
            })
            .run()

        return { mergeEventId, restoredOccurrenceIds, sourceBugIds }
    })

    if (gameId) invalidateDedupIndex(db, gameId)
    return result
}
