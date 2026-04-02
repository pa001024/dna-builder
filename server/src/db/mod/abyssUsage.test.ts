import { beforeAll, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import jwt from "jsonwebtoken"
import charData from "../../../../src/data/d/char.data"
import petData from "../../../../src/data/d/pet.data"
import weaponData from "../../../../src/data/d/weapon.data"
import { db, schema } from ".."
import { jwtToken } from "../yoga"
import { getCurrentSeasonId } from "./abyssUsage"

const GRAPHQL_URL = "http://localhost:8887/graphql"

/**
 * 发送 GraphQL 请求。
 * @param query GraphQL 文本。
 * @param variables 请求变量。
 * @param token 可选 JWT token。
 * @returns GraphQL 响应 JSON。
 */
async function graphqlRequest<T>(query: string, variables?: Record<string, unknown>, token?: string): Promise<T> {
    const response = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(token ? { token } : {}),
        },
        body: JSON.stringify({ query, variables }),
    })
    return (await response.json()) as T
}

/**
 * 清空深渊使用相关数据。
 */
async function clearAbyssUsageData() {
    await db.delete(schema.abyssUsageWeaponParticipants)
    await db.delete(schema.abyssUsageRoleParticipants)
    await db.delete(schema.abyssUsageSubmissions)
}

/**
 * 计算 UID 的 sha256。
 * @param uid 原始 UID。
 * @returns sha256 值。
 */
function sha256(uid: string) {
    return createHash("sha256").update(uid).digest("hex")
}

/**
 * 汇总分布计数。
 * @param items 分布数组。
 * @returns 总计数。
 */
function sumDistribution(items: number[]) {
    return items.reduce((sum, item) => sum + item, 0)
}

type SmokedSubmission = {
    uidSha256: string
    charId: number
    meleeId: number
    rangedId: number
    support1: number
    supportWeapon1: number
    support2: number
    supportWeapon2: number
    petId: number
    stars: number
    ownedChars: Array<{ charId: number; gradeLevel: number }>
    ownedWeapons: Array<{ weaponId: number; skillLevel: number }>
}

const SMOKE_SEASON_ID = getCurrentSeasonId()
const SMOKE_SUBMISSIONS: SmokedSubmission[] = []
const SMOKE_EXPECTED = {
    submissionCount: 0,
    roleStats: new Map<number, { submissionCount: number; slotCount: number; grade: Map<number, number> }>(),
    weaponStats: new Map<number, { submissionCount: number; slotCount: number; skill: Map<number, number> }>(),
    lineupStats: new Map<string, number>(),
}

const SMOKE_ADMIN_TOKEN = jwt.sign(
    {
        id: "smoke-admin",
        email: "smoke-admin@example.com",
        name: "smoke-admin",
        qq: null,
        roles: "admin",
    },
    jwtToken
)

/**
 * 生成一个可复现的随机数。
 * @param seed 种子。
 * @returns 伪随机数生成器。
 */
function createSeededRandom(seed: number) {
    let value = seed >>> 0
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0
        return value / 0x100000000
    }
}

/**
 * 从备选数组里随机取一个元素。
 * @param random 随机函数。
 * @param items 备选项。
 * @returns 随机选中的元素。
 */
function pick<T>(random: () => number, items: T[]) {
    return items[Math.floor(random() * items.length)]!
}

/**
 * 从备选数组中随机取一个且从池子移除。
 * @param random 随机函数。
 * @param items 备选项。
 * @returns 选中的元素。
 */
function pickUnique<T>(random: () => number, items: T[]) {
    const index = Math.floor(random() * items.length)
    const [picked] = items.splice(index, 1)
    return picked!
}

/**
 * 从数组中随机抽取若干唯一项。
 * @param random 随机函数。
 * @param items 备选项。
 * @param count 抽取数量。
 * @returns 抽取结果。
 */
function pickManyUnique<T>(random: () => number, items: T[], count: number) {
    const pool = [...items]
    const result: T[] = []
    const limit = Math.min(count, pool.length)
    for (let index = 0; index < limit; index++) {
        result.push(pickUnique(random, pool))
    }
    return result
}

/**
 * 归一化协战顺序，和后端保持一致。
 * @param support1 协战 1 角色。
 * @param supportWeapon1 协战 1 武器。
 * @param support2 协战 2 角色。
 * @param supportWeapon2 协战 2 武器。
 * @returns 归一化后的协战顺序。
 */
function normalizeSupportPair(support1: number, supportWeapon1: number, support2: number, supportWeapon2: number) {
    if (support1 < support2 || (support1 === support2 && supportWeapon1 <= supportWeapon2)) {
        return { support1, supportWeapon1, support2, supportWeapon2 }
    }
    return {
        support1: support2,
        supportWeapon1: supportWeapon2,
        support2: support1,
        supportWeapon2: supportWeapon1,
    }
}

/**
 * 从角色/武器/魔灵原始数据中提取可用于烟测的 ID 池。
 * @returns 随机池。
 */
function buildSmokePools() {
    const chars = charData.map(item => item.id).filter((id): id is number => Number.isInteger(id) && id > 0)
    const weapons = weaponData.map(item => item.id).filter((id): id is number => Number.isInteger(id) && id > 0)
    const pets = petData.map(item => item.id).filter((id): id is number => Number.isInteger(id) && id > 0)

    return { chars, weapons, pets }
}

/**
 * 生成测试用深渊提交样本。
 */
function buildSmokeSubmissions() {
    if (SMOKE_SUBMISSIONS.length > 0) {
        return
    }

    const random = createSeededRandom(20260402)
    const pools = buildSmokePools()
    const { chars, weapons, pets } = pools

    const gradePool = [0, 1, 2, 3, 4, 5, 6]
    const skillPool = [0, 1, 2, 3, 4, 5]

    for (let index = 0; index < 100; index++) {
        const charPool = [...chars]
        const weaponPool = [...weapons]
        const lineup = {
            charId: pickUnique(random, charPool),
            meleeId: pickUnique(random, weaponPool),
            rangedId: pickUnique(random, weaponPool),
            support1: pickUnique(random, charPool),
            supportWeapon1: pickUnique(random, weaponPool),
            support2: pickUnique(random, charPool),
            supportWeapon2: pickUnique(random, weaponPool),
            petId: pick(random, pets),
        }
        const mainGrade = pick(random, gradePool)
        const supportGrade1 = pick(random, gradePool)
        const supportGrade2 = pick(random, gradePool)
        const mainSkill = pick(random, skillPool)
        const supportSkill1 = pick(random, skillPool)
        const supportSkill2 = pick(random, skillPool)
        const swappedSupportOrder = random() > 0.5

        const supportLeft = swappedSupportOrder
            ? { charId: lineup.support2, weaponId: lineup.supportWeapon2, gradeLevel: supportGrade2, skillLevel: supportSkill2 }
            : { charId: lineup.support1, weaponId: lineup.supportWeapon1, gradeLevel: supportGrade1, skillLevel: supportSkill1 }
        const supportRight = swappedSupportOrder
            ? { charId: lineup.support1, weaponId: lineup.supportWeapon1, gradeLevel: supportGrade1, skillLevel: supportSkill1 }
            : { charId: lineup.support2, weaponId: lineup.supportWeapon2, gradeLevel: supportGrade2, skillLevel: supportSkill2 }
        const extraOwnedChars = pickManyUnique(
            random,
            chars.filter(id => id !== lineup.charId && id !== supportLeft.charId && id !== supportRight.charId),
            1 + Math.floor(random() * 3)
        )
        const extraOwnedWeapons = pickManyUnique(
            random,
            weapons.filter(
                id => id !== lineup.meleeId && id !== lineup.rangedId && id !== supportLeft.weaponId && id !== supportRight.weaponId
            ),
            1 + Math.floor(random() * 4)
        )

        const submission = {
            uidSha256: sha256(`smoke-uid-${index}`),
            ...lineup,
            stars: 3 + (index % 3),
            ownedChars: [
                { charId: lineup.charId, gradeLevel: mainGrade },
                { charId: supportLeft.charId, gradeLevel: supportLeft.gradeLevel },
                { charId: supportRight.charId, gradeLevel: supportRight.gradeLevel },
                ...extraOwnedChars.map(charId => ({ charId, gradeLevel: pick(random, gradePool) })),
            ],
            ownedWeapons: [
                { weaponId: lineup.meleeId, skillLevel: mainSkill },
                { weaponId: supportLeft.weaponId, skillLevel: supportLeft.skillLevel },
                { weaponId: supportRight.weaponId, skillLevel: supportRight.skillLevel },
                ...extraOwnedWeapons.map(weaponId => ({ weaponId, skillLevel: pick(random, skillPool) })),
            ],
        }

        SMOKE_SUBMISSIONS.push(submission)
        SMOKE_EXPECTED.submissionCount += 1

        const roleParticipants = [
            { charId: lineup.charId, gradeLevel: mainGrade },
            { charId: supportLeft.charId, gradeLevel: supportLeft.gradeLevel },
            { charId: supportRight.charId, gradeLevel: supportRight.gradeLevel },
        ]
        for (const participant of roleParticipants) {
            const bucket = SMOKE_EXPECTED.roleStats.get(participant.charId) || {
                submissionCount: 0,
                slotCount: 0,
                grade: new Map<number, number>(),
            }
            bucket.submissionCount += 1
            bucket.slotCount += 1
            bucket.grade.set(participant.gradeLevel, (bucket.grade.get(participant.gradeLevel) || 0) + 1)
            SMOKE_EXPECTED.roleStats.set(participant.charId, bucket)
        }

        const weaponParticipants = [
            { weaponId: lineup.meleeId, skillLevel: mainSkill },
            { weaponId: lineup.supportWeapon1, skillLevel: supportLeft.skillLevel },
            { weaponId: lineup.supportWeapon2, skillLevel: supportRight.skillLevel },
        ]
        for (const participant of weaponParticipants) {
            const bucket = SMOKE_EXPECTED.weaponStats.get(participant.weaponId) || {
                submissionCount: 0,
                slotCount: 0,
                skill: new Map<number, number>(),
            }
            bucket.submissionCount += 1
            bucket.slotCount += 1
            bucket.skill.set(participant.skillLevel, (bucket.skill.get(participant.skillLevel) || 0) + 1)
            SMOKE_EXPECTED.weaponStats.set(participant.weaponId, bucket)
        }

        const normalizedSupport = normalizeSupportPair(lineup.support1, lineup.supportWeapon1, lineup.support2, lineup.supportWeapon2)
        const lineupKey = [
            lineup.charId,
            lineup.meleeId,
            lineup.rangedId,
            normalizedSupport.support1,
            normalizedSupport.supportWeapon1,
            normalizedSupport.support2,
            normalizedSupport.supportWeapon2,
            lineup.petId,
        ].join(":")
        SMOKE_EXPECTED.lineupStats.set(lineupKey, (SMOKE_EXPECTED.lineupStats.get(lineupKey) || 0) + 1)
    }
}

/**
 * 批量写入烟测样本。
 */
async function seedSmokeSubmissions() {
    if (!SMOKE_SEASON_ID) {
        return
    }
    const variables: Record<string, unknown> = {}
    const mutationFields = SMOKE_SUBMISSIONS.map((submission, index) => {
        const key = `input${index}`
        variables[key] = submission
        return `
            submit${index}: submitAbyssUsage(input: $${key}) {
                id
            }
        `
    }).join("\n")

    const result = await graphqlRequest<{
        data?: Record<string, { id: string }>
        errors?: Array<{ message: string }>
    }>(
        `
        mutation SeedSmokeSubmissions(${SMOKE_SUBMISSIONS.map((_, index) => `$input${index}: AbyssUsageSubmissionInput!`).join(", ")}) {
            ${mutationFields}
        }
    `,
        variables
    )
    expect(result.errors).toBeUndefined()
    for (const [key, value] of Object.entries(result.data || {})) {
        expect(key.startsWith("submit")).toBe(true)
        expect(value.id).toBeTypeOf("string")
    }
}

/**
 * 创建烟测统计所需的管理员上下文。
 */
async function ensureSmokeAdminUser() {
    const userId = "smoke-admin"
    const existing = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
    })
    if (existing) {
        await db.update(schema.users).set({ roles: "admin" }).where(eq(schema.users.id, userId))
        return
    }

    await db.insert(schema.users).values({
        id: userId,
        email: "smoke-admin@example.com",
        name: "smoke-admin",
        roles: "admin",
    })
}

describe("abyssUsage", () => {
    it("应该完成深渊上传和统计烟测", async () => {
        expect(SMOKE_SEASON_ID).toBeTypeOf("number")

        await db.delete(schema.abyssUsageWeaponParticipants)
        await db.delete(schema.abyssUsageRoleParticipants)
        await db.delete(schema.abyssUsageSubmissions)
        await ensureSmokeAdminUser()
        buildSmokeSubmissions()

        expect(getCurrentSeasonId(1761512399 * 1000)).toBeNull()
        expect(getCurrentSeasonId(1761512400 * 1000)).toBe(1001)
        expect(getCurrentSeasonId(1766437200 * 1000)).toBe(1003)

        const uidHash = sha256("123456789")
        expect(uidHash).toHaveLength(64)

        const serviceResult = await graphqlRequest<{ data?: { __typename?: string }; errors?: Array<{ message: string }> }>(
            "{ __typename }"
        )
        expect(serviceResult.errors).toBeUndefined()
        expect(serviceResult.data?.__typename).toBe("Query")

        const sample = SMOKE_SUBMISSIONS[0]!
        const anonymousResult = await graphqlRequest<{ data?: { submitAbyssUsage?: { id: string } }; errors?: Array<{ message: string }> }>(
            `
            mutation SubmitAbyssUsage($input: AbyssUsageSubmissionInput!) {
                submitAbyssUsage(input: $input) {
                    id
                }
            }
        `,
            {
                input: {
                    uidSha256: sha256("test-uid"),
                    charId: sample.charId,
                    meleeId: sample.meleeId,
                    rangedId: sample.rangedId,
                    support1: sample.support1,
                    supportWeapon1: sample.supportWeapon1,
                    support2: sample.support2,
                    supportWeapon2: sample.supportWeapon2,
                    stars: 3,
                    ownedChars: sample.ownedChars,
                    ownedWeapons: sample.ownedWeapons,
                },
            }
        )
        expect(anonymousResult.errors?.[0]?.message).toBeUndefined()
        expect(anonymousResult.data?.submitAbyssUsage?.id).toBeTypeOf("string")

        await seedSmokeSubmissions()

        const statsResult = await graphqlRequest<{
            data?: {
                abyssUsageRoleStats?: Array<{
                    charId: number
                    submissionCount: number
                    slotCount: number
                    ownedCount: number
                    gradeLevelDistribution: number[]
                }>
                abyssUsageWeaponStats?: Array<{
                    weaponId: number
                    submissionCount: number
                    slotCount: number
                    ownedCount: number
                    skillLevelDistribution: number[]
                }>
                abyssUsageLineupStats?: Array<{
                    charId: number
                    meleeId: number
                    rangedId: number
                    support1: number
                    supportWeapon1: number
                    support2: number
                    supportWeapon2: number
                    petId?: number | null
                    submissionCount: number
                }>
                abyssUsageSubmissions?: Array<{
                    seasonId: number
                }>
            }
            errors?: Array<{ message: string }>
        }>(
            `
            query SmokeStats($seasonId: Int) {
                abyssUsageRoleStats(seasonId: $seasonId) {
                    charId
                    submissionCount
                    slotCount
                    ownedCount
                    gradeLevelDistribution
                }
                abyssUsageWeaponStats(seasonId: $seasonId) {
                    weaponId
                    submissionCount
                    slotCount
                    ownedCount
                    skillLevelDistribution
                }
                abyssUsageLineupStats(seasonId: $seasonId) {
                    charId
                    meleeId
                    rangedId
                    support1
                    supportWeapon1
                    support2
                    supportWeapon2
                    petId
                    submissionCount
                }
                abyssUsageSubmissions(limit: 200, offset: 0) {
                    seasonId
                }
            }
        `,
            { seasonId: SMOKE_SEASON_ID },
            SMOKE_ADMIN_TOKEN
        )

        expect(statsResult.errors).toBeUndefined()
        const submissions = statsResult.data?.abyssUsageSubmissions || []
        expect(submissions).toHaveLength(SMOKE_SUBMISSIONS.length + 1)
        expect(submissions.every(item => item.seasonId === SMOKE_SEASON_ID)).toBe(true)

        const roleRows = statsResult.data?.abyssUsageRoleStats || []
        const weaponRows = statsResult.data?.abyssUsageWeaponStats || []
        const lineupRows = statsResult.data?.abyssUsageLineupStats || []

        expect(roleRows.length).toBeGreaterThan(0)
        expect(weaponRows.length).toBeGreaterThan(0)
        expect(lineupRows.length).toBeGreaterThan(0)

        for (const [charId, expected] of SMOKE_EXPECTED.roleStats.entries()) {
            const actual = roleRows.find(item => item.charId === charId)
            expect(actual).toBeDefined()
            expect(actual?.submissionCount).toBeGreaterThan(0)
            expect(actual?.slotCount).toBeGreaterThan(0)
            expect(actual?.ownedCount).toBeGreaterThan(0)
            expect(sumDistribution(actual?.gradeLevelDistribution || [])).toBeGreaterThan(0)
            expect(expected.submissionCount).toBeGreaterThan(0)
        }

        for (const [weaponId, expected] of SMOKE_EXPECTED.weaponStats.entries()) {
            const actual = weaponRows.find(item => item.weaponId === weaponId)
            expect(actual).toBeDefined()
            expect(actual?.submissionCount).toBeGreaterThan(0)
            expect(actual?.slotCount).toBeGreaterThan(0)
            expect(actual?.ownedCount).toBeGreaterThan(0)
            expect(sumDistribution(actual?.skillLevelDistribution || [])).toBeGreaterThan(0)
            expect(expected.submissionCount).toBeGreaterThan(0)
        }

        for (const [lineupKey, expected] of SMOKE_EXPECTED.lineupStats.entries()) {
            const [charId, meleeId, rangedId, support1, supportWeapon1, support2, supportWeapon2, petId] = lineupKey.split(":").map(Number)
            const actual = lineupRows.find(
                item =>
                    item.charId === charId &&
                    item.meleeId === meleeId &&
                    item.rangedId === rangedId &&
                    item.support1 === support1 &&
                    item.supportWeapon1 === supportWeapon1 &&
                    item.support2 === support2 &&
                    item.supportWeapon2 === supportWeapon2 &&
                    (Number.isNaN(petId) ? item.petId == null : item.petId === petId)
            )
            expect(actual).toBeDefined()
            expect(actual?.submissionCount).toBe(expected)
        }
    }, 15000)
})
