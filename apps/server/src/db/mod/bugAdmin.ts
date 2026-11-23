import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, inArray, or, sql } from "drizzle-orm"
import type { GraphQLResolveInfo } from "graphql"
import {
    type Actor,
    actorRefOf,
    applyTagSet,
    type BugDb,
    type BugJobState,
    type BugRelationType,
    type BugRow,
    ensureTagRegistry,
    getTagDefinition,
    mergeBugs,
    revertMergeBugs,
} from "../../bugs"
import { schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."
import {
    type BugDto,
    bugDb,
    evidenceRefsFromStrings,
    type GithubIssueLinkRow,
    gqlError,
    loadBugStats,
    loadPrimaryIssueLinks,
    primaryIssueOf,
    requireAdmin,
    toBugDto,
    withDomainErrors,
} from "./bug"

/** 对称关联类型：同一对 Bug 只保留一条（spec §12.4）。 */
const SYMMETRIC_RELATIONS = new Set<BugRelationType>(["related"])
const RELATION_TYPES = new Set<BugRelationType>(["possible_duplicate", "related", "regression_of", "duplicate_of"])

const ADMIN_JOB_DEFAULT_LIMIT = 50
const ADMIN_JOB_MAX_LIMIT = 100
const ADMIN_MERGE_EVENT_LIMIT = 100

export const typeDefs = /* GraphQL */ `
    input AdminBugFields {
        title: String
        summary: String
        expected: String
        actual: String
        steps: [String!]
        primaryCategory: String
        severity: Severity
        status: BugStatus
        visibility: Visibility
        resolution: String
        fixedVersion: String
    }

    type AdminBugResult {
        bug: Bug!
        changed: [String!]!
        version: Int!
    }

    type TagSyncResult {
        added: [String!]!
        removed: [String!]!
        tagVersion: Int!
        fixStage: String!
        eventId: String
    }

    input AdminBugJobFilter {
        states: [String!]
        kinds: [String!]
        limit: Int
    }

    type AdminBugJob {
        id: ID!
        kind: String!
        state: String!
        priority: String!
        attempt: Int!
        inputRevision: Int!
        idempotencyKey: String!
        inputHash: String
        leaseOwner: String
        leaseUntil: Float
        eligibleAt: Float!
        lastError: String
        resultRef: String
        createdAt: Float!
    }

    type AdminBugJobStateCount {
        state: String!
        count: Int!
    }

    type AdminBugJobsResult {
        total: Int!
        items: [AdminBugJob!]!
        counts: [AdminBugJobStateCount!]!
    }

    type AdminBugMergeEvent {
        id: ID!
        sourceBugIds: [ID!]!
        targetBugId: ID!
        revertedAt: Float
        createdAt: Float!
    }

    type Query {
        adminBugJobs(filter: AdminBugJobFilter, offset: Int): AdminBugJobsResult!
        adminBugMergeEvents(bugId: ID!): [AdminBugMergeEvent!]!
        adminBug(id: ID!): Bug!
    }

    type Mutation {
        adminUpdateBug(bugId: ID!, fields: AdminBugFields!, reason: String!, expectedVersion: Int!): AdminBugResult!
        adminMergeBugs(sourceBugIds: [ID!]!, targetBugId: ID!, reason: String!, expectedVersions: [Int!]!): AdminBugResult!
        adminRevertMerge(mergeEventId: ID!, reason: String!, expectedVersions: [Int!]!): AdminBugResult!
        adminSetRelation(bugId: ID!, targetBugId: ID!, relationType: RelationType!, evidenceRefs: [String!], expectedGraphVersion: Int!): AdminBugResult!
        adminRemoveRelation(relationId: ID!, reason: String!, expectedRelationVersion: Int!): AdminBugResult!
        adminSetTrackingTags(bugId: ID!, tagKeys: [String!]!, expectedTagVersion: Int!, reason: String!, fixedVersion: String, evidenceRefs: [String!]): TagSyncResult!
        adminSetGithubBinding(tagKey: String!, repositoryId: String!, labelName: String!, expectedRegistryVersion: Int!): Boolean!
        adminRetryJob(jobId: ID!, step: String!): Boolean!
        adminReconcile(syncId: ID!): Boolean!
    }
`

function adminActorOf(context: Context): Actor {
    const user = requireAdmin(context)
    return { kind: "user", userId: user.id, roles: Array.isArray(user.roles) ? user.roles : [] }
}

function findBug(database: BugDb, bugId: string): BugRow {
    const bug = database.select().from(schema.bugs).where(eq(schema.bugs.id, bugId)).get()
    if (!bug) throw gqlError("NOT_FOUND", "BUG 不存在")
    return bug
}

/** Bug DTO：stats / issue 关联表按选择集决定是否查询（未选中的内联表不查）。 */
function bugDto(database: BugDb, row: BugRow, info?: GraphQLResolveInfo, issueLinks?: readonly GithubIssueLinkRow[]): BugDto {
    const wantsStats = info
        ? Boolean(
              getSubSelection(info, "bug.votes") ||
                  getSubSelection(info, "bug.reporters") ||
                  getSubSelection(info, "bug.occurrences") ||
                  getSubSelection(info, "bug.lastActivityAt")
          )
        : true
    const wantsIssue = info ? Boolean(getSubSelection(info, "bug.githubIssue")) : true
    const issue = wantsIssue ? (issueLinks ? primaryIssueOf(issueLinks) : loadPrimaryIssueLinks(database, [row.id]).get(row.id)) : undefined
    return toBugDto(row, wantsStats ? loadBugStats(database, [row.id]).get(row.id) : undefined, issue)
}

function adminResult(
    database: BugDb,
    row: BugRow,
    changed: string[],
    info?: GraphQLResolveInfo
): { bug: BugDto; changed: string[]; version: number } {
    return { bug: bugDto(database, row, info), changed, version: row.version }
}

/** 空字符串不可写入非空的标题 / 摘要。 */
function requireText(value: string | null | undefined, field: string): string | null | undefined {
    if (value === undefined || value === null) return value
    const trimmed = value.trim()
    if (!trimmed) throw gqlError("VALIDATION_FAILED", `${field} 不能为空`)
    return trimmed
}

/**
 * @description 把管理动作的期望版本数组转成领域层的 `expectedVersions` 记录。
 * 约定：长度等于源列表时为「仅源记录」，多一位时最后一位是目标版本。
 */
function expectedVersionRecord(bugIds: readonly string[], targetId: string | null, versions: readonly number[]): Record<string, number> {
    const record: Record<string, number> = {}
    bugIds.forEach((bugId, index) => {
        const version = versions[index]
        if (version !== undefined) record[bugId] = version
    })
    if (targetId && versions.length > bugIds.length) {
        const targetVersion = versions[bugIds.length]
        if (targetVersion !== undefined) record[targetId] = targetVersion
    }
    return record
}

export const resolvers = {
    Query: {
        adminBugJobs: async (_parent, args, context, info) =>
            withDomainErrors(() => {
                requireAdmin(context)
                const database = bugDb(context)
                const filter = args?.filter
                const limit = Math.max(1, Math.min(filter?.limit ?? ADMIN_JOB_DEFAULT_LIMIT, ADMIN_JOB_MAX_LIMIT))
                const skip = Math.max(0, args?.offset ?? 0)
                const kinds = (filter?.kinds ?? []).filter(Boolean)
                const states = (filter?.states ?? []).filter(Boolean) as BugJobState[]

                const kindWhere = kinds.length ? inArray(schema.bugJobs.kind, kinds) : undefined
                const stateWhere = states.length ? inArray(schema.bugJobs.state, states) : undefined
                const where = and(kindWhere, stateWhere)

                const items = database
                    .select()
                    .from(schema.bugJobs)
                    .where(where)
                    .orderBy(desc(schema.bugJobs.createdAt))
                    .limit(limit)
                    .offset(skip)
                    .all()
                const total = getSubSelection(info, "total")
                    ? Number(database.select({ total: sql<number>`count(*)` }).from(schema.bugJobs).where(where).get()?.total ?? 0)
                    : 0
                // 按状态计数只应用 kind 过滤：前端的每个状态页签都要能看到自己的数量
                const counts = getSubSelection(info, "counts")
                    ? database
                          .select({ state: schema.bugJobs.state, count: sql<number>`count(*)` })
                          .from(schema.bugJobs)
                          .where(kindWhere)
                          .groupBy(schema.bugJobs.state)
                          .all()
                          .map(row => ({ state: row.state, count: Number(row.count) }))
                    : []

                return {
                    total,
                    counts,
                    items: items.map(row => ({
                        id: row.id,
                        kind: row.kind,
                        state: row.state,
                        priority: row.priorityClass,
                        attempt: row.attempt,
                        inputRevision: row.inputRevision,
                        idempotencyKey: row.idempotencyKey,
                        inputHash: row.inputHash,
                        leaseOwner: row.leaseOwner,
                        leaseUntil: row.leaseUntil,
                        eligibleAt: row.eligibleAt,
                        lastError: row.lastError,
                        resultRef: row.resultRef,
                        createdAt: row.createdAt ?? 0,
                    })),
                }
            }),

        adminBugMergeEvents: async (_parent, { bugId }, context) =>
            withDomainErrors(() => {
                requireAdmin(context)
                const database = bugDb(context)
                const rows = database
                    .select()
                    .from(schema.bugMergeEvents)
                    .where(
                        or(
                            eq(schema.bugMergeEvents.targetBugId, bugId),
                            sql`exists (select 1 from json_each(${schema.bugMergeEvents.sourceBugIds}) where json_each.value = ${bugId})`
                        )
                    )
                    .orderBy(desc(schema.bugMergeEvents.createdAt))
                    .limit(ADMIN_MERGE_EVENT_LIMIT)
                    .all()
                return rows.map(row => ({
                    id: row.id,
                    sourceBugIds: row.sourceBugIds ?? [],
                    targetBugId: row.targetBugId,
                    revertedAt: row.revertedAt,
                    createdAt: row.createdAt ?? 0,
                }))
            }),

        adminBug: async (_parent, { id }, context, info) =>
            withDomainErrors(async () => {
                requireAdmin(context)
                const database = bugDb(context)
                // 后台详情不过滤 visibility：管理员需要处理私有 BUG；Issue 关联表用 with 内联
                const row = await database.query.bugs.findFirst({
                    where: eq(schema.bugs.id, id),
                    with: { issueLinks: getSubSelection(info, "bug.githubIssue") ? true : undefined },
                })
                if (!row) throw gqlError("NOT_FOUND", "BUG 不存在")
                return bugDto(database, row, info, row.issueLinks)
            }),
    },
    Mutation: {
        adminUpdateBug: async (_parent, { bugId, fields, reason, expectedVersion }, context, info) =>
            withDomainErrors(() => {
                const actor = adminActorOf(context)
                const database = bugDb(context)
                const bug = findBug(database, bugId)
                if (bug.version !== expectedVersion) {
                    throw gqlError("CONFLICT", "BUG 版本已变化，请刷新后重试", { current: bug.version })
                }

                const changes: Partial<typeof schema.bugs.$inferInsert> = {}
                const changed: string[] = []
                const title = requireText(fields.title, "标题")
                if (title !== undefined && title !== null) {
                    changes.title = title
                    changed.push("title")
                }
                const summary = requireText(fields.summary, "摘要")
                if (summary !== undefined && summary !== null) {
                    changes.summary = summary
                    changed.push("summary")
                }
                if (fields.expected !== undefined) {
                    changes.expected = fields.expected
                    changed.push("expected")
                }
                if (fields.actual !== undefined) {
                    changes.actual = fields.actual
                    changed.push("actual")
                }
                if (fields.steps !== undefined && fields.steps !== null) {
                    changes.steps = [...fields.steps]
                    changed.push("steps")
                }
                if (fields.primaryCategory !== undefined && fields.primaryCategory !== null) {
                    if (!fields.primaryCategory.trim()) throw gqlError("VALIDATION_FAILED", "主分类不能为空")
                    changes.primaryCategory = fields.primaryCategory.trim()
                    changed.push("primaryCategory")
                }
                if (fields.severity !== undefined && fields.severity !== null) {
                    const severity = fields.severity as BugRow["confirmedSeverity"]
                    changes.confirmedSeverity = severity === "U" ? null : severity
                    changes.severitySource = "maintainer"
                    changed.push("severity")
                }
                if (fields.status !== undefined && fields.status !== null) {
                    changes.status = fields.status as BugRow["status"]
                    changed.push("status")
                }
                if (fields.visibility !== undefined && fields.visibility !== null) {
                    changes.visibility = fields.visibility as BugRow["visibility"]
                    changed.push("visibility")
                }
                if (fields.resolution !== undefined) {
                    changes.resolution = fields.resolution
                    changed.push("resolution")
                }
                if (fields.fixedVersion !== undefined) {
                    changes.fixedVersion = fields.fixedVersion
                    changed.push("fixedVersion")
                }

                const now = Date.now()
                if (!changed.length) return adminResult(database, bug, changed, info)

                database
                    .update(schema.bugs)
                    .set({ ...changes, version: sql`${schema.bugs.version} + 1` })
                    .where(and(eq(schema.bugs.id, bugId), eq(schema.bugs.version, expectedVersion)))
                    .run()
                const updated = findBug(database, bugId)
                if (updated.version === bug.version) throw gqlError("CONFLICT", "BUG 版本已变化，请刷新后重试")

                database
                    .insert(schema.bugEvents)
                    .values({
                        eventId: schema.id(),
                        bugId,
                        kind: "bug_admin_updated",
                        actor: actorRefOf(actor),
                        payloadSafe: { changed, reason, patch: changes },
                        entityVersion: updated.version,
                        createdAt: now,
                    })
                    .run()

                return adminResult(database, updated, changed, info)
            }),

        adminMergeBugs: async (_parent, { sourceBugIds, targetBugId, reason, expectedVersions }, context, info) =>
            withDomainErrors(() => {
                const actor = adminActorOf(context)
                const database = bugDb(context)
                const result = mergeBugs(database, sourceBugIds, targetBugId, actor, {
                    reason,
                    expectedVersions: expectedVersionRecord(sourceBugIds, targetBugId, expectedVersions),
                })
                const target = findBug(database, targetBugId)
                return adminResult(database, target, result.movedOccurrenceIds, info)
            }),

        adminRevertMerge: async (_parent, { mergeEventId, reason, expectedVersions }, context, info) =>
            withDomainErrors(() => {
                const actor = adminActorOf(context)
                const database = bugDb(context)
                const event = database.select().from(schema.bugMergeEvents).where(eq(schema.bugMergeEvents.id, mergeEventId)).get()
                if (!event) throw gqlError("NOT_FOUND", "归并记录不存在")

                const expected = expectedVersionRecord(event.sourceBugIds ?? [], event.targetBugId, expectedVersions)
                for (const [bugId, version] of Object.entries(expected)) {
                    const current = database
                        .select({ version: schema.bugs.version })
                        .from(schema.bugs)
                        .where(eq(schema.bugs.id, bugId))
                        .get()
                    if (current && current.version !== version) {
                        throw gqlError("CONFLICT", "BUG 版本已变化，请刷新后重试", { bugId, current: current.version })
                    }
                }

                const result = revertMergeBugs(database, mergeEventId, actor, { reason })
                const target = findBug(database, event.targetBugId)
                return adminResult(database, target, result.restoredOccurrenceIds, info)
            }),

        adminSetRelation: async (_parent, { bugId, targetBugId, relationType, evidenceRefs, expectedGraphVersion }, context, info) =>
            withDomainErrors(() => {
                const actor = adminActorOf(context)
                const database = bugDb(context)
                if (!RELATION_TYPES.has(relationType as BugRelationType)) throw gqlError("VALIDATION_FAILED", "未知的关联类型")
                if (bugId === targetBugId) throw gqlError("VALIDATION_FAILED", "不能关联到自身")

                const source = findBug(database, bugId)
                findBug(database, targetBugId)
                if (expectedGraphVersion !== source.version) {
                    throw gqlError("CONFLICT", "BUG 版本已变化，请刷新后重试", { current: source.version })
                }

                const type = relationType as BugRelationType
                const symmetryKey = SYMMETRIC_RELATIONS.has(type) ? `${type}:${[bugId, targetBugId].sort().join(":")}` : null
                const existing = database
                    .select()
                    .from(schema.bugRelations)
                    .where(
                        and(
                            eq(schema.bugRelations.state, "active"),
                            eq(schema.bugRelations.relationType, type),
                            symmetryKey
                                ? eq(schema.bugRelations.symmetryKey, symmetryKey)
                                : and(eq(schema.bugRelations.sourceBugId, bugId), eq(schema.bugRelations.targetBugId, targetBugId))
                        )
                    )
                    .get()
                if (existing) return adminResult(database, source, [existing.id], info)

                const now = Date.now()
                const relationId = schema.id()
                database
                    .insert(schema.bugRelations)
                    .values({
                        id: relationId,
                        sourceBugId: bugId,
                        targetBugId,
                        relationType: type,
                        symmetryKey,
                        evidenceRefs: evidenceRefsFromStrings(evidenceRefs),
                        origin: "maintainer",
                        actor: actorRefOf(actor),
                        revision: 1,
                        visibility: "public",
                        state: "active",
                        createdAt: now,
                    })
                    .run()
                database
                    .update(schema.bugs)
                    .set({ version: sql`${schema.bugs.version} + 1` })
                    .where(eq(schema.bugs.id, bugId))
                    .run()
                database
                    .insert(schema.bugEvents)
                    .values({
                        eventId: schema.id(),
                        bugId,
                        kind: "relation_added",
                        actor: actorRefOf(actor),
                        payloadSafe: { relationId, targetBugId, relationType: type },
                        entityVersion: source.version + 1,
                        createdAt: now,
                    })
                    .run()

                return adminResult(database, findBug(database, bugId), [relationId], info)
            }),

        adminRemoveRelation: async (_parent, { relationId, reason, expectedRelationVersion }, context, info) =>
            withDomainErrors(() => {
                const actor = adminActorOf(context)
                const database = bugDb(context)
                const relation = database.select().from(schema.bugRelations).where(eq(schema.bugRelations.id, relationId)).get()
                if (relation?.state !== "active") throw gqlError("NOT_FOUND", "关联不存在")
                if (relation.revision !== expectedRelationVersion) {
                    throw gqlError("CONFLICT", "关联版本已变化，请刷新后重试", { current: relation.revision })
                }

                const now = Date.now()
                database
                    .update(schema.bugRelations)
                    .set({ state: "removed", revision: relation.revision + 1, deletedAt: now })
                    .where(eq(schema.bugRelations.id, relationId))
                    .run()
                database
                    .update(schema.bugs)
                    .set({ version: sql`${schema.bugs.version} + 1` })
                    .where(eq(schema.bugs.id, relation.sourceBugId))
                    .run()
                database
                    .insert(schema.bugEvents)
                    .values({
                        eventId: schema.id(),
                        bugId: relation.sourceBugId,
                        kind: "relation_removed",
                        actor: actorRefOf(actor),
                        payloadSafe: { relationId, reason },
                        createdAt: now,
                    })
                    .run()

                return adminResult(database, findBug(database, relation.sourceBugId), [relationId], info)
            }),

        adminSetTrackingTags: async (_parent, { bugId, tagKeys, expectedTagVersion, reason, fixedVersion, evidenceRefs }, context) =>
            withDomainErrors(() => {
                const actor = adminActorOf(context)
                const database = bugDb(context)
                const result = applyTagSet(database, {
                    bugId,
                    tagKeys: [...tagKeys],
                    actor,
                    expectedTagVersion,
                    fixedVersion: fixedVersion ?? undefined,
                    evidenceRefs: evidenceRefsFromStrings(evidenceRefs),
                    source: "maintainer",
                })
                if (reason && result.eventId) {
                    database
                        .update(schema.bugEvents)
                        .set({ payloadSafe: { added: result.added, removed: result.removed, source: "maintainer", reason } })
                        .where(eq(schema.bugEvents.eventId, result.eventId))
                        .run()
                }
                return result
            }),

        adminSetGithubBinding: async (_parent, { tagKey, repositoryId, labelName, expectedRegistryVersion }, context) =>
            withDomainErrors(() => {
                requireAdmin(context)
                const database = bugDb(context)
                if (!getTagDefinition(tagKey)) throw gqlError("VALIDATION_FAILED", `未注册的标签：${tagKey}`)
                ensureTagRegistry(database)

                const definition = database.select().from(schema.bugTagDefinitions).where(eq(schema.bugTagDefinitions.tagKey, tagKey)).get()
                const registryVersion = definition?.registryVersion ?? 1
                if (registryVersion !== expectedRegistryVersion) {
                    throw gqlError("CONFLICT", "标签字典版本已变化，请刷新后重试", { current: registryVersion })
                }

                database
                    .insert(schema.githubLabelBindings)
                    .values({ repositoryId, labelName, tagKey, registryVersion, state: "active" })
                    .onConflictDoUpdate({
                        target: [schema.githubLabelBindings.repositoryId, schema.githubLabelBindings.labelName],
                        set: { tagKey, registryVersion, state: "active" },
                    })
                    .run()
                return true
            }),

        adminRetryJob: async (_parent, { jobId, step }, context) =>
            withDomainErrors(() => {
                requireAdmin(context)
                const database = bugDb(context)
                const job = database.select().from(schema.bugJobs).where(eq(schema.bugJobs.id, jobId)).get()
                if (!job) throw gqlError("NOT_FOUND", "任务不存在")
                if (!step?.trim()) throw gqlError("VALIDATION_FAILED", "缺少重试步骤")
                if (step !== job.kind) throw gqlError("VALIDATION_FAILED", `任务步骤不匹配：期望 ${job.kind}`)

                database
                    .update(schema.bugJobs)
                    .set({ state: "queued", eligibleAt: Date.now(), leaseOwner: null, leaseUntil: null, lastError: null })
                    .where(eq(schema.bugJobs.id, jobId))
                    .run()
                return true
            }),

        adminReconcile: async (_parent, { syncId }, context) =>
            withDomainErrors(() => {
                requireAdmin(context)
                const database = bugDb(context)
                const link = database.select().from(schema.githubIssueLinks).where(eq(schema.githubIssueLinks.id, syncId)).get()
                if (!link) throw gqlError("NOT_FOUND", "同步记录不存在")

                const now = Date.now()
                database
                    .insert(schema.bugOutbox)
                    .values({
                        eventId: schema.id(),
                        operation: "reconcile_issue",
                        targetMapping: `repo:${link.repositoryId}:issue:${link.issueId}`,
                        state: "queued",
                        nextAttemptAt: now,
                        createdAt: now,
                    })
                    .onConflictDoNothing()
                    .run()
                return true
            }),
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type BugAdminGQL = CreateMobius<typeof typeDefs>
