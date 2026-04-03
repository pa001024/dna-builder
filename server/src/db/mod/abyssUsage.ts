import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { and, desc, eq, inArray, or, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { abyssDungeons } from "../../../../src/data/d/abyss.data"
import { db, schema } from ".."
import type { Context } from "../yoga"

type AbyssUsageSubmissionInput = {
    uidSha256: string
    charId: number
    meleeId: number
    rangedId: number
    support1: number
    supportWeapon1: number
    support2: number
    supportWeapon2: number
    stars: number
    petId?: number | null
    ownedChars?: Array<{ charId: number; gradeLevel: number }>
    ownedWeapons?: Array<{ weaponId: number; skillLevel: number }>
}

type AbyssUsageRoleStatRow = {
    submissionId: string
    charId: number
    roleType: string
    gradeLevel: number
}

type AbyssUsageWeaponStatRow = {
    submissionId: string
    weaponId: number
    roleType: string
    skillLevel: number
}

type AbyssUsageSlotStatRow = {
    kind: "support" | "meleeWeapon" | "rangedWeapon" | "pet"
    id: number | null
    submissionCount: number
}

type AbyssUsageSlotStats = {
    support: Array<{ id: number; submissionCount: number }>
    meleeWeapon: Array<{ id: number; submissionCount: number }>
    rangedWeapon: Array<{ id: number; submissionCount: number }>
    pet: Array<{ id: number; submissionCount: number }>
}

/**
 * 归一化深渊统计用角色 ID。
 * @param charId 角色 ID。
 * @returns 统计时使用的角色 ID。
 */
function normalizeAbyssCharId(charId: number): number {
    return charId === 160101 ? 1601 : charId
}

export const typeDefs = /* GraphQL */ `
    type AbyssUsageSubmission {
        id: String!
        uidSha256: String!
        seasonId: Int!
        charId: Int!
        meleeId: Int!
        rangedId: Int!
        support1: Int!
        supportWeapon1: Int!
        support2: Int!
        supportWeapon2: Int!
        stars: Int!
        petId: Int
        createdAt: String
        updateAt: String
        roleParticipants: [AbyssUsageRoleParticipant!]!
        weaponParticipants: [AbyssUsageWeaponParticipant!]!
    }

    type AbyssUsageRoleParticipant {
        submissionId: String!
        roleType: String!
        charId: Int!
        gradeLevel: Int!
        createdAt: String
    }

    type AbyssUsageWeaponParticipant {
        submissionId: String!
        roleType: String!
        weaponId: Int!
        skillLevel: Int!
        createdAt: String
    }

    type AbyssRoleUsageStat {
        charId: Int!
        submissionCount: Int!
        slotCount: Int!
        ownedCount: Int!
        gradeLevelDistribution: [Int!]!
    }

    type AbyssWeaponUsageStat {
        weaponId: Int!
        submissionCount: Int!
        slotCount: Int!
        ownedCount: Int!
        skillLevelDistribution: [Int!]!
    }

    type AbyssUsageLineupStat {
        charId: Int!
        meleeId: Int!
        rangedId: Int!
        support1: Int!
        supportWeapon1: Int!
        support2: Int!
        supportWeapon2: Int!
        petId: Int
        submissionCount: Int!
    }

    type AbyssUsageSlotStat {
        id: Int!
        submissionCount: Int!
    }

    type AbyssUsageSlotStats {
        support: [AbyssUsageSlotStat!]!
        meleeWeapon: [AbyssUsageSlotStat!]!
        rangedWeapon: [AbyssUsageSlotStat!]!
        pet: [AbyssUsageSlotStat!]!
    }

    type Query {
        abyssUsageSubmissions(limit: Int = 20, offset: Int = 0): [AbyssUsageSubmission!]!
        abyssUsageRoleStats(seasonId: Int): [AbyssRoleUsageStat!]!
        abyssUsageWeaponStats(seasonId: Int): [AbyssWeaponUsageStat!]!
        abyssUsageLineupStats(seasonId: Int, charId: Int, mainOnly: Boolean, limit: Int): [AbyssUsageLineupStat!]!
        abyssUsageSlotStats(seasonId: Int): AbyssUsageSlotStats!
        abyssUsageRoleRank(seasonId: Int, limit: Int = 20): [AbyssRoleUsageStat!]!
        abyssUsageWeaponRank(seasonId: Int, limit: Int = 20): [AbyssWeaponUsageStat!]!
    }

    input AbyssOwnedCharInput {
        charId: Int!
        gradeLevel: Int!
    }

    input AbyssOwnedWeaponInput {
        weaponId: Int!
        skillLevel: Int!
    }

    input AbyssUsageSubmissionInput {
        uidSha256: String!
        charId: Int!
        meleeId: Int!
        rangedId: Int!
        support1: Int!
        supportWeapon1: Int!
        support2: Int!
        supportWeapon2: Int!
        stars: Int!
        petId: Int
        ownedChars: [AbyssOwnedCharInput!]
        ownedWeapons: [AbyssOwnedWeaponInput!]
    }

    type Mutation {
        submitAbyssUsage(input: AbyssUsageSubmissionInput!): AbyssUsageSubmission!
    }
`

/**
 * 归一化可拥有的角色 ID 列表。
 * @param ids 角色 ID 列表。
 * @returns 去重后的合法角色 ID 列表。
 */
function normalizeOwnedCharIds(items?: Array<{ charId: number; gradeLevel: number }>) {
    const charMap = new Map<number, number>()
    for (const item of items || []) {
        if (!Number.isInteger(item.charId) || item.charId <= 0) continue
        if (!Number.isInteger(item.gradeLevel) || item.gradeLevel < 0) continue
        const current = charMap.get(item.charId)
        if (current == null || item.gradeLevel > current) {
            charMap.set(item.charId, item.gradeLevel)
        }
    }
    return [...charMap.entries()].map(([charId, gradeLevel]) => ({ charId, gradeLevel }))
}

/**
 * 归一化可拥有的武器 ID 列表。
 * @param items 武器与技能等级列表。
 * @returns 按武器 ID 去重且保留最高技能等级的列表。
 */
function normalizeOwnedWeaponIds(items?: Array<{ weaponId: number; skillLevel: number }>) {
    const weaponMap = new Map<number, number>()
    for (const item of items || []) {
        if (!Number.isInteger(item.weaponId) || item.weaponId <= 0) continue
        if (!Number.isInteger(item.skillLevel) || item.skillLevel < 0) continue
        const current = weaponMap.get(item.weaponId)
        if (current == null || item.skillLevel > current) {
            weaponMap.set(item.weaponId, item.skillLevel)
        }
    }
    return [...weaponMap.entries()].map(([weaponId, skillLevel]) => ({ weaponId, skillLevel }))
}

/**
 * 根据当前时间推导当前深渊赛季 ID。
 * @param timestamp 当前时间戳，单位毫秒。
 * @returns 当前赛季 ID。
 */
export function getCurrentSeasonId(timestamp = Date.now()) {
    const now = Math.floor(timestamp / 1000)
    const seasons = abyssDungeons
        .filter(item => typeof item.sid === "number" && typeof item.st === "number" && typeof item.et === "number")
        .map(item => ({ seasonId: item.sid!, startTime: item.st!, endTime: item.et! }))
        .sort((a, b) => a.startTime - b.startTime)
    const current = seasons.find(item => now >= item.startTime && now < item.endTime)
    return current?.seasonId || null
}

function serializeSubmission(submission: typeof schema.abyssUsageSubmissions.$inferSelect) {
    return {
        ...submission,
        createdAt: submission.createdAt ?? "",
        updateAt: submission.updateAt ?? "",
    }
}

/**
 * 将持有信息转为角色参与明细。
 * @param ownedChars 已持有角色。
 * @returns 角色参与行。
 */
function buildOwnedRoleParticipantRows(submissionId: string, seasonId: number, ownedChars: Array<{ charId: number; gradeLevel: number }>) {
    return ownedChars.map(item => ({
        submissionId,
        seasonId,
        roleType: "owned",
        charId: item.charId,
        gradeLevel: item.gradeLevel,
    }))
}

/**
 * 将持有信息转为武器参与明细。
 * @param submissionId 提交 ID。
 * @param seasonId 赛季 ID。
 * @param ownedWeapons 已持有武器。
 * @returns 武器参与行。
 */
function buildOwnedWeaponParticipantRows(
    submissionId: string,
    seasonId: number,
    ownedWeapons: Array<{ weaponId: number; skillLevel: number }>
) {
    return ownedWeapons.map(item => ({
        submissionId,
        seasonId,
        roleType: "owned",
        weaponId: item.weaponId,
        skillLevel: item.skillLevel,
    }))
}

/**
 * 将阵容转为使用明细。
 * @param submissionId 提交 ID。
 * @param seasonId 赛季 ID。
 * @param lineup 阵容。
 * @param ownedChars 已持有角色。
 * @param ownedWeapons 已持有武器。
 * @returns 使用明细；若缺少对应持有信息则返回 null。
 */
function buildUsageParticipantRows(
    submissionId: string,
    seasonId: number,
    lineup: {
        charId: number
        meleeId: number
        support1: number
        supportWeapon1: number
        support2: number
        supportWeapon2: number
    },
    ownedChars: Array<{ charId: number; gradeLevel: number }>,
    ownedWeapons: Array<{ weaponId: number; skillLevel: number }>
) {
    const charMap = new Map(ownedChars.map(item => [item.charId, item.gradeLevel]))
    const weaponMap = new Map(ownedWeapons.map(item => [item.weaponId, item.skillLevel]))
    const roleParticipantMap = new Map<number, { roleType: "main" | "support"; charId: number; gradeLevel: number }>()
    const weaponParticipantMap = new Map<number, { roleType: "main" | "support"; weaponId: number; skillLevel: number }>()
    const usageParticipants = [
        {
            roleType: "main" as const,
            charId: lineup.charId,
            gradeLevel: charMap.get(lineup.charId),
            weaponId: lineup.meleeId,
            skillLevel: weaponMap.get(lineup.meleeId),
        },
        {
            roleType: "support" as const,
            charId: lineup.support1,
            gradeLevel: charMap.get(lineup.support1),
            weaponId: lineup.supportWeapon1,
            skillLevel: weaponMap.get(lineup.supportWeapon1),
        },
        {
            roleType: "support" as const,
            charId: lineup.support2,
            gradeLevel: charMap.get(lineup.support2),
            weaponId: lineup.supportWeapon2,
            skillLevel: weaponMap.get(lineup.supportWeapon2),
        },
    ]

    const validParticipants = usageParticipants.filter(
        item => item.charId > 0 && item.weaponId > 0 && item.gradeLevel != null && item.skillLevel != null
    )

    if (validParticipants.length === 0) {
        return null
    }

    for (const item of validParticipants) {
        const roleCurrent = roleParticipantMap.get(item.charId)
        if (!roleCurrent || item.gradeLevel! > roleCurrent.gradeLevel) {
            roleParticipantMap.set(item.charId, {
                roleType: item.roleType,
                charId: item.charId,
                gradeLevel: item.gradeLevel!,
            })
        }
        const weaponCurrent = weaponParticipantMap.get(item.weaponId)
        if (!weaponCurrent || item.skillLevel! > weaponCurrent.skillLevel) {
            weaponParticipantMap.set(item.weaponId, {
                roleType: item.roleType,
                weaponId: item.weaponId,
                skillLevel: item.skillLevel!,
            })
        }
    }

    return {
        usageParticipants: validParticipants.map(item => ({
            submissionId,
            seasonId,
            roleType: item.roleType,
            charId: item.charId,
            gradeLevel: item.gradeLevel!,
            weaponId: item.weaponId,
            skillLevel: item.skillLevel!,
        })),
        roleParticipants: [...roleParticipantMap.values()].map(item => ({
            submissionId,
            seasonId,
            roleType: item.roleType,
            charId: item.charId,
            gradeLevel: item.gradeLevel,
        })),
        weaponParticipants: [...weaponParticipantMap.values()].map(item => ({
            submissionId,
            seasonId,
            roleType: item.roleType,
            weaponId: item.weaponId,
            skillLevel: item.skillLevel,
        })),
    }
}

/**
 * 将角色统计行聚合为最终统计。
 * @param rows 角色统计行。
 * @returns 角色统计列表。
 */
function buildRoleStats(rows: AbyssUsageRoleStatRow[]) {
    const grouped = new Map<
        number,
        {
            submissionIds: Set<string>
            ownedSubmissionIds: Set<string>
            grade: Map<number, Set<string>>
        }
    >()
    for (const row of rows) {
        const charId = normalizeAbyssCharId(row.charId)
        const groupedBucket = grouped.get(charId) || {
            submissionIds: new Set<string>(),
            ownedSubmissionIds: new Set<string>(),
            grade: new Map<number, Set<string>>(),
        }
        if (row.roleType === "owned") {
            groupedBucket.ownedSubmissionIds.add(row.submissionId)
        } else {
            groupedBucket.submissionIds.add(row.submissionId)
            const gradeSet = groupedBucket.grade.get(row.gradeLevel) || new Set<string>()
            gradeSet.add(row.submissionId)
            groupedBucket.grade.set(row.gradeLevel, gradeSet)
        }
        grouped.set(charId, groupedBucket)
    }
    return [...grouped.entries()]
        .map(([charId, bucket]) => ({
            charId,
            submissionCount: bucket.submissionIds.size,
            slotCount: [...bucket.grade.values()].reduce((sum, set) => sum + set.size, 0),
            ownedCount: bucket.ownedSubmissionIds.size,
            gradeLevelDistribution: buildIndexedDistribution(bucket.grade),
        }))
        .sort((a, b) => b.submissionCount - a.submissionCount || b.slotCount - a.slotCount || a.charId - b.charId)
}

/**
 * 将武器统计行聚合为最终统计。
 * @param rows 武器统计行。
 * @returns 武器统计列表。
 */
function buildWeaponStats(rows: AbyssUsageWeaponStatRow[]) {
    const grouped = new Map<
        number,
        {
            submissionIds: Set<string>
            ownedSubmissionIds: Set<string>
            skill: Map<number, Set<string>>
        }
    >()
    for (const row of rows) {
        const bucket = grouped.get(row.weaponId) || {
            submissionIds: new Set<string>(),
            ownedSubmissionIds: new Set<string>(),
            skill: new Map<number, Set<string>>(),
        }
        if (row.roleType === "owned") {
            bucket.ownedSubmissionIds.add(row.submissionId)
        } else {
            bucket.submissionIds.add(row.submissionId)
            const skillSet = bucket.skill.get(row.skillLevel) || new Set<string>()
            skillSet.add(row.submissionId)
            bucket.skill.set(row.skillLevel, skillSet)
        }
        grouped.set(row.weaponId, bucket)
    }
    return [...grouped.entries()]
        .map(([weaponId, bucket]) => ({
            weaponId,
            submissionCount: bucket.submissionIds.size,
            slotCount: [...bucket.skill.values()].reduce((sum, set) => sum + set.size, 0),
            ownedCount: bucket.ownedSubmissionIds.size,
            skillLevelDistribution: buildIndexedDistribution(bucket.skill),
        }))
        .sort((a, b) => b.submissionCount - a.submissionCount || b.slotCount - a.slotCount || a.weaponId - b.weaponId)
}

/**
 * 将离散分布转为按等级索引的数组。
 * @param grouped 分组后的计数。
 * @returns 一维分布数组。
 */
function buildIndexedDistribution(grouped: Map<number, Set<string>>) {
    const maxLevel = [...grouped.keys()].reduce((max, level) => Math.max(max, level), 0)
    const values = Array.from({ length: maxLevel + 1 }, () => 0)
    for (const [level, submissions] of grouped.entries()) {
        values[level] = submissions.size
    }
    return values
}

/**
 * 按赛季在角色数据层直接聚合。
 * @param seasonId 赛季 ID。
 * @returns 角色统计行。
 */
async function loadRoleStatRows(seasonId?: number | null) {
    const where = seasonId ? eq(schema.abyssUsageRoleParticipants.seasonId, seasonId) : undefined
    return await db
        .select({
            submissionId: schema.abyssUsageRoleParticipants.submissionId,
            charId: schema.abyssUsageRoleParticipants.charId,
            roleType: schema.abyssUsageRoleParticipants.roleType,
            gradeLevel: schema.abyssUsageRoleParticipants.gradeLevel,
        })
        .from(schema.abyssUsageRoleParticipants)
        .where(where)
        .groupBy(
            schema.abyssUsageRoleParticipants.submissionId,
            schema.abyssUsageRoleParticipants.charId,
            schema.abyssUsageRoleParticipants.roleType,
            schema.abyssUsageRoleParticipants.gradeLevel
        )
}

/**
 * 按赛季在武器数据层直接聚合。
 * @param seasonId 赛季 ID。
 * @returns 武器统计行。
 */
async function loadWeaponStatRows(seasonId?: number | null) {
    const where = seasonId ? eq(schema.abyssUsageWeaponParticipants.seasonId, seasonId) : undefined
    return await db
        .select({
            submissionId: schema.abyssUsageWeaponParticipants.submissionId,
            weaponId: schema.abyssUsageWeaponParticipants.weaponId,
            roleType: schema.abyssUsageWeaponParticipants.roleType,
            skillLevel: schema.abyssUsageWeaponParticipants.skillLevel,
        })
        .from(schema.abyssUsageWeaponParticipants)
        .where(where)
        .groupBy(
            schema.abyssUsageWeaponParticipants.submissionId,
            schema.abyssUsageWeaponParticipants.weaponId,
            schema.abyssUsageWeaponParticipants.roleType,
            schema.abyssUsageWeaponParticipants.skillLevel
        )
}

/**
 * 按赛季一次性聚合四类单项出现次数。
 * @param seasonId 赛季 ID。
 * @returns 分组后的单项出现次数统计。
 */
async function loadSlotStats(seasonId?: number | null) {
    const seasonWhere = seasonId ? sql`WHERE ${schema.abyssUsageSubmissions.seasonId} = ${seasonId}` : sql``
    const rows = (await db.all(
        sql`
            WITH raw AS (
                SELECT ${"support"} AS kind, ${schema.abyssUsageSubmissions.support1} AS id
                FROM ${schema.abyssUsageSubmissions}
                ${seasonWhere}
                UNION ALL
                SELECT ${"support"} AS kind, ${schema.abyssUsageSubmissions.support2} AS id
                FROM ${schema.abyssUsageSubmissions}
                ${seasonWhere}
                UNION ALL
                SELECT ${"meleeWeapon"} AS kind, ${schema.abyssUsageSubmissions.meleeId} AS id
                FROM ${schema.abyssUsageSubmissions}
                ${seasonWhere}
                UNION ALL
                SELECT ${"rangedWeapon"} AS kind, ${schema.abyssUsageSubmissions.rangedId} AS id
                FROM ${schema.abyssUsageSubmissions}
                ${seasonWhere}
                UNION ALL
                SELECT ${"pet"} AS kind, ${schema.abyssUsageSubmissions.petId} AS id
                FROM ${schema.abyssUsageSubmissions}
                ${seasonWhere}
            )
            SELECT kind, id, count(*) AS submissionCount
            FROM raw
            WHERE id IS NOT NULL AND id > 0
            GROUP BY kind, id
            ORDER BY kind, submissionCount DESC, id ASC
        `
    )) as AbyssUsageSlotStatRow[]
    const result: AbyssUsageSlotStats = {
        support: [],
        meleeWeapon: [],
        rangedWeapon: [],
        pet: [],
    }
    for (const row of rows) {
        const id = row.id
        if (id == null || !Number.isInteger(id) || id <= 0) continue
        const safeId = id as number
        result[row.kind].push({ id: safeId, submissionCount: row.submissionCount })
    }
    return result
}

/**
 * 按提交 ID 批量加载参与明细。
 * @param submissionIds 提交 ID 列表。
 * @returns 按 submissionId 聚合后的参与明细映射。
 */
async function loadParticipantsBySubmissionIds(submissionIds: string[]) {
    if (submissionIds.length === 0) {
        return {
            role: new Map<string, (typeof schema.abyssUsageRoleParticipants.$inferSelect)[]>(),
            weapon: new Map<string, (typeof schema.abyssUsageWeaponParticipants.$inferSelect)[]>(),
        }
    }
    const roleParticipants = await db.query.abyssUsageRoleParticipants.findMany({
        where: inArray(schema.abyssUsageRoleParticipants.submissionId, submissionIds),
    })
    const weaponParticipants = await db.query.abyssUsageWeaponParticipants.findMany({
        where: inArray(schema.abyssUsageWeaponParticipants.submissionId, submissionIds),
    })
    const roleGrouped = new Map<string, (typeof schema.abyssUsageRoleParticipants.$inferSelect)[]>()
    for (const participant of roleParticipants) {
        const list = roleGrouped.get(participant.submissionId) || []
        list.push(participant)
        roleGrouped.set(participant.submissionId, list)
    }
    const weaponGrouped = new Map<string, (typeof schema.abyssUsageWeaponParticipants.$inferSelect)[]>()
    for (const participant of weaponParticipants) {
        const list = weaponGrouped.get(participant.submissionId) || []
        list.push(participant)
        weaponGrouped.set(participant.submissionId, list)
    }
    return { role: roleGrouped, weapon: weaponGrouped }
}

function normalizeLineupSupport(support1: number, supportWeapon1: number, support2: number, supportWeapon2: number) {
    const leftRank = support1 > 0 ? support1 : Number.POSITIVE_INFINITY
    const rightRank = support2 > 0 ? support2 : Number.POSITIVE_INFINITY
    if (leftRank < rightRank || (leftRank === rightRank && supportWeapon1 <= supportWeapon2)) {
        return {
            support1,
            supportWeapon1,
            support2,
            supportWeapon2,
        }
    }
    return {
        support1: support2,
        supportWeapon1: supportWeapon2,
        support2: support1,
        supportWeapon2: supportWeapon1,
    }
}

/**
 * 校验阵容内的角色是否存在重复。
 * @param charIds 角色 ID 列表。
 */
function validateLineupDistinct(charIds: number[]) {
    const activeCharIds = charIds.filter(charId => charId > 0)
    if (new Set(activeCharIds).size !== activeCharIds.length) {
        throw createGraphQLError("阵容角色重复")
    }
}

/**
 * 按赛季在阵容数据层直接聚合。
 * @param seasonId 赛季 ID。
 * @returns 阵容统计行。
 */
async function loadLineupStatRows(seasonId?: number | null, charId?: number | null, mainOnly?: boolean | null, limit?: number | null) {
    const seasonWhere = seasonId ? eq(schema.abyssUsageSubmissions.seasonId, seasonId) : undefined
    const charWhere =
        charId && charId > 0
            ? mainOnly
                ? eq(schema.abyssUsageSubmissions.charId, charId)
                : or(
                      eq(schema.abyssUsageSubmissions.charId, charId),
                      eq(schema.abyssUsageSubmissions.meleeId, charId),
                      eq(schema.abyssUsageSubmissions.rangedId, charId),
                      eq(schema.abyssUsageSubmissions.support1, charId),
                      eq(schema.abyssUsageSubmissions.support2, charId)
                  )
            : undefined
    const where = seasonWhere && charWhere ? and(seasonWhere, charWhere) : seasonWhere || charWhere
    const query = db
        .select({
            charId: schema.abyssUsageSubmissions.charId,
            meleeId: schema.abyssUsageSubmissions.meleeId,
            rangedId: schema.abyssUsageSubmissions.rangedId,
            support1: schema.abyssUsageSubmissions.support1,
            supportWeapon1: schema.abyssUsageSubmissions.supportWeapon1,
            support2: schema.abyssUsageSubmissions.support2,
            supportWeapon2: schema.abyssUsageSubmissions.supportWeapon2,
            petId: schema.abyssUsageSubmissions.petId,
            submissionCount: sql<number>`count(*)`,
        })
        .from(schema.abyssUsageSubmissions)
        .where(where)
        .groupBy(
            schema.abyssUsageSubmissions.charId,
            schema.abyssUsageSubmissions.meleeId,
            schema.abyssUsageSubmissions.rangedId,
            schema.abyssUsageSubmissions.support1,
            schema.abyssUsageSubmissions.supportWeapon1,
            schema.abyssUsageSubmissions.support2,
            schema.abyssUsageSubmissions.supportWeapon2,
            schema.abyssUsageSubmissions.petId
        )
        .orderBy(
            desc(sql<number>`count(*)`),
            schema.abyssUsageSubmissions.charId,
            schema.abyssUsageSubmissions.meleeId,
            schema.abyssUsageSubmissions.rangedId,
            schema.abyssUsageSubmissions.support1,
            schema.abyssUsageSubmissions.supportWeapon1,
            schema.abyssUsageSubmissions.support2,
            schema.abyssUsageSubmissions.supportWeapon2,
            schema.abyssUsageSubmissions.petId
        )
    if (typeof limit === "number" && limit > 0) {
        return await query.limit(limit)
    }
    return await query
}

export const resolvers = {
    Query: {
        abyssUsageSubmissions: async (_parent, args, context) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权限")
            }
            const limit = args?.limit ?? 20
            const offset = args?.offset ?? 0
            const items = await db.query.abyssUsageSubmissions.findMany({
                orderBy: [desc(schema.abyssUsageSubmissions.createdAt)],
                limit,
                offset,
            })
            const grouped = await loadParticipantsBySubmissionIds(items.map(item => item.id))
            return items.map(item => ({
                ...serializeSubmission(item),
                roleParticipants: grouped.role.get(item.id) || [],
                weaponParticipants: grouped.weapon.get(item.id) || [],
            }))
        },
        abyssUsageRoleStats: async (_parent, args) => {
            const rows = await loadRoleStatRows(args?.seasonId)
            if (rows.length === 0) return []
            return buildRoleStats(rows)
        },
        abyssUsageWeaponStats: async (_parent, args) => {
            const rows = await loadWeaponStatRows(args?.seasonId)
            if (rows.length === 0) return []
            return buildWeaponStats(rows)
        },
        abyssUsageLineupStats: async (_parent, args) => {
            const charId = args?.charId
            if (charId != null && (!Number.isInteger(charId) || charId <= 0)) {
                throw createGraphQLError("charId 非法")
            }
            if (args?.mainOnly != null && typeof args.mainOnly !== "boolean") {
                throw createGraphQLError("mainOnly 非法")
            }
            const limit = args?.limit
            if (limit != null && (!Number.isInteger(limit) || limit <= 0)) {
                throw createGraphQLError("limit 非法")
            }
            return loadLineupStatRows(args?.seasonId, charId, args?.mainOnly, limit)
        },
        abyssUsageSlotStats: async (_parent, args) => {
            return await loadSlotStats(args?.seasonId)
        },
        abyssUsageRoleRank: async (_parent, args) => {
            const rows = await loadRoleStatRows(args?.seasonId)
            if (rows.length === 0) return []
            return buildRoleStats(rows)
        },
        abyssUsageWeaponRank: async (_parent, args) => {
            const limit = args?.limit ?? 20
            const rows = await loadWeaponStatRows(args?.seasonId)
            if (rows.length === 0) return []
            return buildWeaponStats(rows).slice(0, limit)
        },
    },
    Mutation: {
        submitAbyssUsage: async (_parent, args) => {
            const input = args?.input as AbyssUsageSubmissionInput | undefined
            if (!input) throw createGraphQLError("非法请求")
            if (!input.uidSha256.trim()) throw createGraphQLError("uidSha256 不能为空")
            if (!Number.isInteger(input.charId) || input.charId <= 0) throw createGraphQLError("charId 非法")
            if (!Number.isInteger(input.meleeId) || input.meleeId <= 0) throw createGraphQLError("meleeId 非法")
            if (!Number.isInteger(input.rangedId) || input.rangedId <= 0) throw createGraphQLError("rangedId 非法")
            if (!Number.isInteger(input.support1) || input.support1 < 0) throw createGraphQLError("support1 非法")
            if (!Number.isInteger(input.supportWeapon1) || input.supportWeapon1 < 0) throw createGraphQLError("supportWeapon1 非法")
            if (!Number.isInteger(input.support2) || input.support2 < 0) throw createGraphQLError("support2 非法")
            if (!Number.isInteger(input.supportWeapon2) || input.supportWeapon2 < 0) throw createGraphQLError("supportWeapon2 非法")
            if (!Number.isInteger(input.stars) || input.stars < 0) throw createGraphQLError("stars 非法")

            const uidSha256 = input.uidSha256.trim()
            const seasonId = getCurrentSeasonId()
            if (!seasonId) throw createGraphQLError("当前不在任何可上传的深渊赛季内")
            const ownedChars = normalizeOwnedCharIds(input.ownedChars)
            const ownedWeapons = normalizeOwnedWeaponIds(input.ownedWeapons)
            validateLineupDistinct([input.charId, input.support1, input.support2])
            const normalizedLineupSupport = normalizeLineupSupport(
                input.support1,
                input.supportWeapon1,
                input.support2,
                input.supportWeapon2
            )

            return await db.transaction(async tx => {
                const submissionPayload = {
                    uidSha256,
                    seasonId,
                    charId: input.charId,
                    meleeId: input.meleeId,
                    rangedId: input.rangedId,
                    support1: normalizedLineupSupport.support1,
                    supportWeapon1: normalizedLineupSupport.supportWeapon1,
                    support2: normalizedLineupSupport.support2,
                    supportWeapon2: normalizedLineupSupport.supportWeapon2,
                    stars: input.stars,
                    petId: input.petId ?? null,
                }

                const [submission] = await tx
                    .insert(schema.abyssUsageSubmissions)
                    .values(submissionPayload)
                    .onConflictDoUpdate({
                        target: [schema.abyssUsageSubmissions.uidSha256, schema.abyssUsageSubmissions.seasonId],
                        set: submissionPayload,
                    })
                    .returning()

                if (!submission) throw createGraphQLError("创建失败")
                const usageResult = buildUsageParticipantRows(
                    submission.id,
                    seasonId,
                    {
                        charId: input.charId,
                        meleeId: input.meleeId,
                        support1: input.support1,
                        supportWeapon1: input.supportWeapon1,
                        support2: input.support2,
                        supportWeapon2: input.supportWeapon2,
                    },
                    ownedChars,
                    ownedWeapons
                )
                if (!usageResult) {
                    throw createGraphQLError("无法从持有信息生成参与明细")
                }

                await tx.delete(schema.abyssUsageRoleParticipants).where(eq(schema.abyssUsageRoleParticipants.submissionId, submission.id))
                await tx
                    .delete(schema.abyssUsageWeaponParticipants)
                    .where(eq(schema.abyssUsageWeaponParticipants.submissionId, submission.id))
                await tx
                    .insert(schema.abyssUsageRoleParticipants)
                    .values([...buildOwnedRoleParticipantRows(submission.id, seasonId, ownedChars), ...usageResult.roleParticipants])
                await tx
                    .insert(schema.abyssUsageWeaponParticipants)
                    .values([...buildOwnedWeaponParticipantRows(submission.id, seasonId, ownedWeapons), ...usageResult.weaponParticipants])

                return {
                    ...serializeSubmission(submission),
                    roleParticipants: [
                        ...buildOwnedRoleParticipantRows(submission.id, seasonId, ownedChars),
                        ...usageResult.roleParticipants,
                    ],
                    weaponParticipants: [
                        ...buildOwnedWeaponParticipantRows(submission.id, seasonId, ownedWeapons),
                        ...usageResult.weaponParticipants,
                    ],
                }
            })
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type AbyssUsageGQL = CreateMobius<typeof typeDefs>
