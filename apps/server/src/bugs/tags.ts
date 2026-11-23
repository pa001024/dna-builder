import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import * as schema from "../db/schema"
import { canSetTrackingTags } from "./permissions"
import {
    type Actor,
    actorRefOf,
    type BugDb,
    BugDomainError,
    type BugSeverity,
    type BugTx,
    DEFAULT_FIX_STAGE,
    type EvidenceRef,
    FIX_STAGE_KEYS,
    type FixStage,
    type TagDefinitionRow,
} from "./types"

/** 标签来源：AI 只能建议分类／环境／严重程度，修复阶段只能由确定性策略、维护者或 GitHub 维护者发起。 */
export type TagSource = "ai" | "maintainer" | "github" | "system"

export type TagDefinition = {
    tagKey: string
    namespace: string
    exclusiveGroup: string | null
    displayI18nKey: string
    semanticDescription: string
    allowedSources: TagSource[]
    evidencePolicy: string | null
    /** GitHub canonical label；本站显示走 displayI18nKey。 */
    canonicalLabel: string | null
}

/** 游戏问题主分类（spec §14.1 的稳定 key）。 */
export const GAME_CATEGORIES = [
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

export type GameCategory = (typeof GAME_CATEGORIES)[number]

const FIX_LABELS: Record<FixStage, string> = {
    "fix.unconfirmed": "fix:unconfirmed",
    "fix.needs_info": "fix:needs-info",
    "fix.confirmed": "fix:confirmed",
    "fix.planned": "fix:planned",
    "fix.in_progress": "fix:in-progress",
    "fix.reported_fixed": "fix:reported-fixed",
    "fix.released": "fix:released",
    "fix.verified": "fix:verified",
    "fix.regressed": "fix:regressed",
}

/** 修复阶段语义：全部互斥，来源限定为确定性策略 / 维护者 / GitHub 维护者。 */
const FIX_DEFINITIONS: TagDefinition[] = FIX_STAGE_KEYS.map(tagKey => ({
    tagKey,
    namespace: "fix",
    exclusiveGroup: "fix_stage",
    displayI18nKey: `bug.tag.${tagKey}`,
    semanticDescription: `修复跟踪阶段：${tagKey.slice(4)}`,
    allowedSources: ["system", "maintainer", "github"],
    evidencePolicy: tagKey === "fix.released" || tagKey === "fix.verified" ? "需要修复版本或验证证据，缺失时如实标记依据未提供" : null,
    canonicalLabel: FIX_LABELS[tagKey],
}))

const CATEGORY_DEFINITIONS: TagDefinition[] = GAME_CATEGORIES.map(category => ({
    tagKey: `category.${category}`,
    namespace: "category",
    exclusiveGroup: "primary_category",
    displayI18nKey: `bug.category.${category}`,
    semanticDescription: `主分类：${category}`,
    allowedSources: ["ai", "maintainer", "github", "system"],
    evidencePolicy: null,
    canonicalLabel: `category:${category}`,
}))

const SEVERITY_DEFINITIONS: TagDefinition[] = ["s0", "s1", "s2", "s3", "s4"].map(level => ({
    tagKey: `severity.${level}`,
    namespace: "severity",
    exclusiveGroup: "severity",
    displayI18nKey: `bug.severity.${level}`,
    semanticDescription: `严重程度：${level.toUpperCase()}`,
    allowedSources: ["system", "maintainer", "github"],
    evidencePolicy: "严重程度必须来自字典与被采纳的确定性分级，用户自报不直接生效",
    canonicalLabel: `severity:${level}`,
}))

const TYPE_DEFINITIONS: TagDefinition[] = [
    {
        tagKey: "type.game_bug",
        namespace: "type",
        exclusiveGroup: null,
        displayI18nKey: "bug.tag.type.game_bug",
        semanticDescription: "游戏 BUG 反馈",
        allowedSources: ["system"],
        evidencePolicy: null,
        canonicalLabel: "type:game-bug",
    },
]

const SOURCE_DEFINITIONS: TagDefinition[] = [
    {
        tagKey: "source.bug_library",
        namespace: "source",
        exclusiveGroup: null,
        displayI18nKey: "bug.tag.source.bug_library",
        semanticDescription: "来自本站 BUG 库",
        allowedSources: ["system"],
        evidencePolicy: null,
        canonicalLabel: "source:bug-library",
    },
]

/** 代码内置标签字典；数据库中的定义可覆盖展示与权限字段，但 tagKey 语义不变。 */
export const TAG_REGISTRY: readonly TagDefinition[] = [
    ...FIX_DEFINITIONS,
    ...CATEGORY_DEFINITIONS,
    ...SEVERITY_DEFINITIONS,
    ...TYPE_DEFINITIONS,
    ...SOURCE_DEFINITIONS,
]

const TAG_BY_KEY = new Map(TAG_REGISTRY.map(definition => [definition.tagKey, definition]))
const TAG_BY_LABEL = new Map(
    TAG_REGISTRY.filter(definition => definition.canonicalLabel).map(definition => [definition.canonicalLabel!, definition.tagKey])
)

/** 按 tagKey 取代码内置定义。 */
export function getTagDefinition(tagKey: string): TagDefinition | undefined {
    return TAG_BY_KEY.get(tagKey)
}

/** tagKey → GitHub canonical label。 */
export function labelNameForTagKey(tagKey: string): string | null {
    return TAG_BY_KEY.get(tagKey)?.canonicalLabel ?? null
}

/** GitHub label → tagKey；未注册 label 返回 null，不猜测语义。 */
export function tagKeyForLabelName(labelName: string): string | null {
    return TAG_BY_LABEL.get(labelName) ?? null
}

/** 主分类是否合法。 */
export function isGameCategory(category: string): category is GameCategory {
    return (GAME_CATEGORIES as readonly string[]).includes(category)
}

/** 主分类 tagKey。 */
export function tagKeyForCategory(category: string): string {
    return `category.${category}`
}

/** 严重程度 tagKey；U 表示未分级，不产生标签。 */
export function tagKeyForSeverity(severity: BugSeverity): string | null {
    return severity === "U" ? null : `severity.${severity.toLowerCase()}`
}

/** 从 tagKey 反解主分类；非分类标签返回 null。 */
export function categoryForTagKey(tagKey: string): string | null {
    return getTagDefinition(tagKey)?.namespace === "category" ? tagKey.slice("category.".length) : null
}

/** 从 tagKey 反解严重程度；非严重程度标签返回 null。 */
export function severityForTagKey(tagKey: string): BugSeverity | null {
    if (getTagDefinition(tagKey)?.namespace !== "severity") return null
    return tagKey.slice("severity.".length).toUpperCase() as BugSeverity
}

/** 由有效标签集合推导修复阶段；空集规范成 unconfirmed（spec §15.6.1）。 */
export function computeFixStage(activeTagKeys: readonly string[]): FixStage {
    const present = new Set(activeTagKeys)
    return FIX_STAGE_KEYS.find(key => present.has(key)) ?? DEFAULT_FIX_STAGE
}

/**
 * @description 校验标签集合：拒绝未注册标签与互斥组内多个标签；返回规范化（去重排序）结果。
 * @param tagKeys 期望的标签集合
 * @returns 规范化后的 tagKey 数组
 */
export function validateTagSet(tagKeys: readonly string[]): string[] {
    const unique = [...new Set(tagKeys)].sort()
    const groups = new Map<string, string>()

    for (const tagKey of unique) {
        const definition = getTagDefinition(tagKey)
        if (!definition) {
            throw new BugDomainError("VALIDATION_FAILED", `未注册的标签：${tagKey}`)
        }
        if (!definition.exclusiveGroup) continue

        const existing = groups.get(definition.exclusiveGroup)
        if (existing && existing !== tagKey) {
            throw new BugDomainError("VALIDATION_FAILED", `互斥组 ${definition.exclusiveGroup} 只能有一个标签`, {
                group: definition.exclusiveGroup,
                tags: [existing, tagKey],
            })
        }
        groups.set(definition.exclusiveGroup, tagKey)
    }

    return unique
}

/** 组装一条新 Bug 的确定性初始标签集合（分类 / 严重程度 / 修复阶段 / 类型 / 来源）。 */
export function composeBugTagSet(input: {
    category: string
    severity: BugSeverity
    tags?: readonly string[]
    needsInfo?: boolean
}): string[] {
    const fixStage: FixStage = input.needsInfo ? "fix.needs_info" : DEFAULT_FIX_STAGE
    const severityTag = tagKeyForSeverity(input.severity)
    return validateTagSet([
        tagKeyForCategory(input.category),
        ...(severityTag ? [severityTag] : []),
        fixStage,
        "type.game_bug",
        "source.bug_library",
        ...(input.tags ?? []),
    ])
}

/**
 * @description 把代码内置字典写入 `bug_tag_definitions`（不覆盖已有行），保证标签赋值的外键可用。
 * @param db 数据库
 */
export function ensureTagRegistry(db: BugDb): void {
    db.insert(schema.bugTagDefinitions)
        .values(
            TAG_REGISTRY.map(definition => ({
                tagKey: definition.tagKey,
                namespace: definition.namespace,
                exclusiveGroup: definition.exclusiveGroup,
                displayI18nKey: definition.displayI18nKey,
                semanticDescription: definition.semanticDescription,
                allowedSources: definition.allowedSources,
                evidencePolicy: definition.evidencePolicy,
                registryVersion: 1,
            }))
        )
        .onConflictDoNothing()
        .run()
}

/** 读取数据库中的标签字典（数据库行优先），用于版本化对账。 */
export function loadTagRegistry(db: BugDb): Map<string, TagDefinition> {
    const rows = db.select().from(schema.bugTagDefinitions).all()
    const registry = new Map(TAG_BY_KEY)
    for (const row of rows) {
        registry.set(row.tagKey, mergeDefinition(row, TAG_BY_KEY.get(row.tagKey)))
    }
    return registry
}

function mergeDefinition(row: TagDefinitionRow, fallback: TagDefinition | undefined): TagDefinition {
    return {
        tagKey: row.tagKey,
        namespace: row.namespace,
        exclusiveGroup: row.exclusiveGroup,
        displayI18nKey: row.displayI18nKey,
        semanticDescription: row.semanticDescription ?? fallback?.semanticDescription ?? "",
        allowedSources: (row.allowedSources ?? []) as TagSource[],
        evidencePolicy: row.evidencePolicy,
        canonicalLabel: fallback?.canonicalLabel ?? null,
    }
}

export type ApplyTagSetInput = {
    bugId: string
    tagKeys: readonly string[]
    actor: Actor
    evidenceRefs?: EvidenceRef[]
    /** 标签来源；默认维护者动作。 */
    source?: TagSource
    expectedTagVersion?: number
    /** 仅在显式传入时更新 fixedVersion。 */
    fixedVersion?: string | null
    now?: number
}

export type ApplyTagSetResult = {
    added: string[]
    removed: string[]
    tagVersion: number
    fixStage: string
    eventId: string | null
}

/**
 * @description 在一次事务内应用标签集合：校验互斥组与版本、记录增删历史、投影 `bugs.tags`/`fixStage`，
 * 并为受管标签写 label 同步 outbox。
 * @param db 数据库
 * @param input 目标集合与来源
 * @param tx 可选事务（已在更大事务内调用时传入）
 * @returns 增删结果与新标签版本
 */
export function applyTagSet(db: BugDb, input: ApplyTagSetInput, tx?: BugTx): ApplyTagSetResult {
    const execute = (runner: BugDb) => applyTagSetInDb(runner, input)
    return tx ? execute(tx) : db.transaction(execute)
}

function applyTagSetInDb(db: BugDb, input: ApplyTagSetInput): ApplyTagSetResult {
    const source = input.source ?? "maintainer"
    if (source === "maintainer" && !canSetTrackingTags(input.actor)) {
        throw new BugDomainError("FORBIDDEN", "只有维护者可以修改跟踪标签")
    }

    const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, input.bugId)).get()
    if (!bug) throw new BugDomainError("NOT_FOUND", "BUG 不存在")
    if (input.expectedTagVersion !== undefined && input.expectedTagVersion !== bug.tagVersion) {
        throw new BugDomainError("CONFLICT", "标签版本已变化，请刷新后重试", { current: bug.tagVersion })
    }

    ensureTagRegistry(db)
    const nextTags = validateTagSet(input.tagKeys)
    const currentRows = db
        .select()
        .from(schema.bugTagAssignments)
        .where(and(eq(schema.bugTagAssignments.bugId, input.bugId), isNull(schema.bugTagAssignments.removedAt)))
        .all()
    const currentTags = new Set(currentRows.map(row => row.tagKey))

    const added = nextTags.filter(tagKey => !currentTags.has(tagKey))
    const removed = [...currentTags].filter(tagKey => !nextTags.includes(tagKey)).sort()
    const now = input.now ?? Date.now()

    if (!added.length && !removed.length && input.fixedVersion === undefined) {
        return { added, removed, tagVersion: bug.tagVersion, fixStage: bug.fixStage ?? computeFixStage(nextTags), eventId: null }
    }

    const eventId = schema.id()
    const entityVersion = bug.tagVersion + 1

    db.insert(schema.bugEvents)
        .values({
            eventId,
            bugId: input.bugId,
            kind: "tags_updated",
            actor: actorRefOf(input.actor),
            payloadSafe: { added, removed, source },
            entityVersion,
            createdAt: now,
        })
        .run()

    if (added.length) {
        db.insert(schema.bugTagAssignments)
            .values(
                added.map(tagKey => ({
                    bugId: input.bugId,
                    tagKey,
                    source,
                    actor: null,
                    evidenceRefs: input.evidenceRefs ?? [],
                    entityVersion,
                    eventId,
                    createdAt: now,
                }))
            )
            .run()
    }

    if (removed.length) {
        db.update(schema.bugTagAssignments)
            .set({ removedAt: now })
            .where(
                and(
                    eq(schema.bugTagAssignments.bugId, input.bugId),
                    inArray(schema.bugTagAssignments.tagKey, removed),
                    isNull(schema.bugTagAssignments.removedAt)
                )
            )
            .run()
    }

    const fixStage = computeFixStage(nextTags)
    db.update(schema.bugs)
        .set({
            tags: nextTags,
            fixStage,
            fixStageSource: source,
            tagVersion: entityVersion,
            version: sql`${schema.bugs.version} + 1`,
            ...(input.fixedVersion !== undefined ? { fixedVersion: input.fixedVersion } : {}),
        })
        .where(eq(schema.bugs.id, input.bugId))
        .run()

    const outboxRows = [
        ...added.map(tagKey => ({ tagKey, operation: "label_add" })),
        ...removed.map(tagKey => ({ tagKey, operation: "label_remove" })),
    ]
        .map(({ tagKey, operation }) => ({ tagKey, operation, label: labelNameForTagKey(tagKey) }))
        .filter((row): row is { tagKey: string; operation: string; label: string } => Boolean(row.label))

    if (outboxRows.length) {
        db.insert(schema.bugOutbox)
            .values(
                outboxRows.map(row => ({
                    eventId,
                    operation: row.operation,
                    targetMapping: row.label,
                    state: "queued" as const,
                    nextAttemptAt: now,
                    createdAt: now,
                }))
            )
            .onConflictDoNothing()
            .run()
    }

    return { added, removed, tagVersion: entityVersion, fixStage, eventId }
}
