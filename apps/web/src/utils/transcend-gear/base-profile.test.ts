import { describe, expect, it } from "vitest"
import { affixes, inlays, uniqueEquips } from "@/data"
import { getBaseNameAffixProfile } from "./base-profile"
import { isAffixConflicting } from "./generation"

/** 海蚀护胸：槽型 2（护胸），固定词条 103（生命） */
const CHEST_BASE_NAME_ID = 1004
/** 槽 3/5 的 201 池：1006–1011 一组排斥 */
const GLOVE_BASE_NAME_ID = 1007
const EARRING_BASE_NAME_ID = 1013

const affix = (id: number) => affixes.find(item => item.id === id)!

describe("基础名词条画像", () => {
    it("槽 2 → 固定词条 103（生命）；强度只改数值（p=1/25/50）", () => {
        const profile = getBaseNameAffixProfile(CHEST_BASE_NAME_ID)!
        expect(profile.slot.id).toBe(2)
        expect(profile.baseAffix?.id).toBe(103)
        expect(profile.baseAffix?.plan).toBe(1)
        expect(profile.fixedAt(1)).toBeCloseTo(0.9171, 4)
        expect(profile.fixedAt(25)).toBeCloseTo(1.753, 4)
        expect(profile.fixedAt(50)).toBeCloseTo(2.6237, 4)
        // 固定词条不在随机池内，恒 1 条
        expect(profile.poolGroups.some(group => group.affixes.some(item => item.id === 103))).toBe(false)
    })

    it("随机池 = 槽位洗练池 202/203/204 共 38 条，全部 Plan 2", () => {
        const profile = getBaseNameAffixProfile(CHEST_BASE_NAME_ID)!
        expect(profile.poolGroups.map(group => group.poolId)).toEqual([202, 203, 204])
        const pool = profile.poolGroups.flatMap(group => group.affixes)
        expect(pool).toHaveLength(38)
        expect(pool.every(item => item.plan === 2)).toBe(true)
        expect(new Set(pool.map(item => item.pool))).toEqual(new Set([202, 203, 204]))
        // 无池词缀 1030/1031 不进入随机池
        expect(pool.some(item => item.id === 1030 || item.id === 1031)).toBe(false)
        // Plan 3（技能等级等）不在洗练池口径内
        expect(pool.some(item => item.plan === 3)).toBe(false)
        // 宝石词缀与暗金专属词缀只能通过镶嵌 / 暗金进入装备
        const gemIds = new Set(inlays.flatMap(inlay => Object.keys(inlay.affixIdsBySlot).map(Number)))
        const uniqueAffixIds = new Set(uniqueEquips.map(equip => equip.affixId))
        expect(pool.some(item => gemIds.has(item.id) || uniqueAffixIds.has(item.id))).toBe(false)
    })

    it("品质 1–5 → 随机 0/1/2/3/4 条；Plan 2 档位 = 10p−9..10p", () => {
        const profile = getBaseNameAffixProfile(CHEST_BASE_NAME_ID)!
        expect(profile.randomCountByRarity).toEqual({ 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 })
        expect(profile.plan2RangeAt(1)).toEqual({ min: 1, max: 10 })
        expect(profile.plan2RangeAt(20)).toEqual({ min: 191, max: 200 })
        expect(profile.plan2RangeAt(50)).toEqual({ min: 491, max: 500 })
    })

    it("排斥判定复用生成规则：单向声明按双向生效；1042 排斥 1046、1042 与 1043 可共存", () => {
        expect(isAffixConflicting(affix(1042), new Set([1046]))).toBe(true)
        expect(isAffixConflicting(affix(1046), new Set([1042]))).toBe(true)
        expect(isAffixConflicting(affix(1042), new Set([1043]))).toBe(false)
        expect(isAffixConflicting(affix(1006), new Set([1007]))).toBe(true)
    })

    it("203 池排斥为精确成对：[小 id, 大 id] 排序去重，不推断传递关系", () => {
        const profile = getBaseNameAffixProfile(CHEST_BASE_NAME_ID)!
        const pool = profile.poolGroups.find(group => group.poolId === 203)!
        const sorted = [...pool.exclusionPairs].sort(([leftA, rightA], [leftB, rightB]) => leftA - leftB || rightA - rightB)

        expect(pool.exclusionPairs).toEqual(sorted)
        expect(pool.exclusionPairs.every(([left, right]) => left < right)).toBe(true)
        expect(new Set(pool.exclusionPairs.map(([left, right]) => `${left}-${right}`)).size).toBe(pool.exclusionPairs.length)

        // 1024–1029 两两互斥（6 选 2 = 15 对）
        expect(pool.exclusionPairs.filter(([left, right]) => left >= 1024 && right <= 1029)).toHaveLength(15)

        // 1042 排斥 1046；1042 与 1043 不互斥（旧「连通组」口径会把二者并进同一组）
        const pairKeys = new Set(pool.exclusionPairs.map(([left, right]) => `${left}-${right}`))
        expect(pairKeys.has("1042-1046")).toBe(true)
        expect(pairKeys.has("1042-1043")).toBe(false)

        const relation1042 = pool.exclusionRelations.find(entry => entry.affixId === 1042)!
        const relation1043 = pool.exclusionRelations.find(entry => entry.affixId === 1043)!
        expect(relation1042.excludedAffixIds).toEqual([1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057])
        // 对称性：1043 同样排斥 1046，且关系里不含 1042（数据只声明了 1042→1046 等单向关系）
        expect(relation1043.excludedAffixIds).toEqual(relation1042.excludedAffixIds)
        expect(relation1043.excludedAffixIds).toContain(1046)
        expect(relation1043.excludedAffixIds).not.toContain(1042)
        expect(pool.exclusionRelations.find(entry => entry.affixId === 1024)!.excludedAffixIds).toEqual([1025, 1026, 1027, 1028, 1029])

        // 202 / 204 池内无排斥关系
        expect(profile.poolGroups.find(group => group.poolId === 202)!.exclusionPairs).toEqual([])
        expect(profile.poolGroups.find(group => group.poolId === 202)!.exclusionRelations).toEqual([])
        expect(profile.poolGroups.find(group => group.poolId === 204)!.exclusionPairs).toEqual([])
    })

    it("槽 3/5 的 201 池：1006–1011 一组排斥（15 对），其余词条无排斥", () => {
        for (const baseNameId of [GLOVE_BASE_NAME_ID, EARRING_BASE_NAME_ID]) {
            const pool = getBaseNameAffixProfile(baseNameId)!.poolGroups.find(group => group.poolId === 201)!
            expect(pool.affixes).toHaveLength(14)
            expect(pool.exclusionPairs).toHaveLength(15)
            expect(pool.exclusionRelations.map(entry => entry.affixId)).toEqual([1006, 1007, 1008, 1009, 1010, 1011])
            for (const relation of pool.exclusionRelations) expect(relation.excludedAffixIds).toHaveLength(5)
        }
    })

    it("槽 8 的 211 池与固定词条映射（104 / 111 / 106 / 107）", () => {
        const profile = getBaseNameAffixProfile(1022)!
        expect(profile.slot.id).toBe(8)
        expect(profile.baseAffix?.id).toBe(107)
        expect(profile.poolGroups).toHaveLength(1)
        expect(profile.poolGroups[0].poolId).toBe(211)
        expect(profile.poolGroups[0].affixes).toHaveLength(13)
        expect(profile.poolGroups[0].exclusionRelations).toEqual([])

        const fixedAffixOf = (baseNameId: number) => getBaseNameAffixProfile(baseNameId)!.baseAffix?.id
        expect(fixedAffixOf(1013)).toBe(104)
        expect(fixedAffixOf(1016)).toBe(111)
        expect(fixedAffixOf(1019)).toBe(106)
        expect(fixedAffixOf(1022)).toBe(107)
    })

    it("未知基础名返回 null", () => {
        expect(getBaseNameAffixProfile(0)).toBeNull()
        expect(getBaseNameAffixProfile(999999)).toBeNull()
    })
})
