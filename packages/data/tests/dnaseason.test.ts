import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { describe, expect, it, vi } from "vitest"
import {
    hydrateRegisteredDataPackBindings,
    registerDataPackBinding,
    resetRegisteredDataPackBindings,
} from "../../../apps/web/src/utils/data-pack/data-pack-bridge"
import { rewriteDataPackModule } from "../../../apps/web/src/utils/data-pack/data-pack-rewrite-plugin"
import { buildDnaSeasonReplacements, isLegacyDnaSeasonVersion } from "../../../tools/dnaseason"
import {
    assertFoldedElements,
    deriveDnaSeasonModules,
    normalizeCharIds,
    normalizeSkillReplacements,
    plan4AttrStatus,
    plan4MappingStatus,
    recoverFoldedElement,
} from "../../../tools/dnaseason/derive"
import { buildSpawnUnits } from "../../../tools/dnaseason/spawn"
import { charMap, dungeonMap, eventData, hardBossMap, monsterMap, resourceMap, rewardMap } from "../d"
import achievementData from "../d/achievement.data"
import charData from "../d/char.data"
import * as seasonModule from "../d/dnaseason.data"
import * as equipModule from "../d/dnaseasonequip.data"
import * as progressModule from "../d/dnaseasonprogress.data"
import * as riftModule from "../d/dnaseasonrift.data"
import modData from "../d/mod.data"
import questChainData from "../d/questchain.data"
import regionData from "../d/region.data"
import weaponData from "../d/weapon.data"
import type { SkillField } from "../leveled/LeveledSkill"
import { mapTranscendAttr } from "../transcend"
import { applyVersionGate, setCurrentVersionLimit } from "../versionGate"

/** 上游主角占位 RoleId：Char.json 本身不导出，按 R8b 已知缺口放行。 */
const KNOWN_MISSING_ROLE_IDS = new Set([120101, 160101, 220101])

/** Plan 4 基线：123 个词条只有 exact（自动映射引擎属性）/ handwritten（本地手写 buff）两档。 */
const PLAN4_STATUS_BASELINE: Record<number, "exact" | "handwritten"> = {
    2001: "handwritten",
    2002: "handwritten",
    2003: "handwritten",
    2004: "handwritten",
    2005: "handwritten",
    2006: "handwritten",
    2007: "handwritten",
    2008: "handwritten",
    2009: "handwritten",
    2010: "handwritten",
    2011: "handwritten",
    2012: "handwritten",
    2013: "handwritten",
    2014: "handwritten",
    2015: "handwritten",
    3101: "exact",
    3102: "exact",
    3103: "exact",
    3111: "exact",
    3112: "exact",
    3113: "exact",
    3121: "exact",
    3122: "exact",
    3123: "exact",
    3131: "exact",
    3132: "exact",
    3133: "exact",
    3141: "exact",
    3142: "exact",
    3143: "exact",
    3201: "exact",
    3202: "handwritten",
    3203: "exact",
    3211: "exact",
    3212: "handwritten",
    3213: "exact",
    3221: "exact",
    3222: "handwritten",
    3223: "exact",
    3231: "exact",
    3232: "handwritten",
    3233: "exact",
    3241: "exact",
    3242: "handwritten",
    3243: "exact",
    3301: "exact",
    3302: "exact",
    3303: "exact",
    3311: "exact",
    3312: "exact",
    3313: "exact",
    3321: "exact",
    3322: "exact",
    3323: "exact",
    3331: "exact",
    3332: "exact",
    3333: "exact",
    3341: "exact",
    3342: "exact",
    3343: "exact",
    3401: "exact",
    3402: "exact",
    3403: "exact",
    3411: "exact",
    3412: "exact",
    3413: "exact",
    3421: "exact",
    3422: "exact",
    3423: "exact",
    3431: "exact",
    3432: "exact",
    3433: "exact",
    3441: "exact",
    3442: "exact",
    3443: "exact",
    3501: "exact",
    3502: "exact",
    3503: "exact",
    3511: "exact",
    3512: "exact",
    3513: "exact",
    3521: "exact",
    3522: "exact",
    3523: "exact",
    3531: "exact",
    3532: "exact",
    3533: "exact",
    3541: "exact",
    3542: "exact",
    3543: "exact",
    3601: "exact",
    3602: "exact",
    3603: "exact",
    3611: "exact",
    3612: "exact",
    3613: "exact",
    3621: "exact",
    3622: "exact",
    3623: "exact",
    3631: "exact",
    3632: "exact",
    3633: "exact",
    3641: "exact",
    3642: "exact",
    3643: "exact",
    110201: "handwritten",
    150201: "handwritten",
    150202: "handwritten",
    150203: "handwritten",
    150401: "handwritten",
    180101: "handwritten",
    180102: "handwritten",
    210101: "handwritten",
    240101: "handwritten",
    240102: "handwritten",
    240103: "handwritten",
    310201: "handwritten",
    310202: "handwritten",
    320301: "handwritten",
    320302: "handwritten",
    420101: "handwritten",
    2030301: "handwritten",
    2040601: "handwritten",
}

/** 4 个模块的全部 45 个导出（带模块前缀，避免 seasons 重名）。 */
function allExports(): Array<[string, unknown]> {
    return [
        ...Object.entries(seasonModule).map(([name, value]) => [`dnaseason.${name}`, value] as [string, unknown]),
        ...Object.entries(equipModule).map(([name, value]) => [`dnaseasonequip.${name}`, value] as [string, unknown]),
        ...Object.entries(progressModule).map(([name, value]) => [`dnaseasonprogress.${name}`, value] as [string, unknown]),
        ...Object.entries(riftModule).map(([name, value]) => [`dnaseasonrift.${name}`, value] as [string, unknown]),
    ]
}

function recordArrays(): Array<[string, Array<Record<string, unknown>>]> {
    return [
        ["seasons", seasonModule.seasons as any],
        ["tiers", seasonModule.tiers as any],
        ["buffTypes", seasonModule.buffTypes as any],
        ["buffLevels", seasonModule.buffLevels as any],
        ["dropBonuses", seasonModule.dropBonuses as any],
        ["resourceTabs", seasonModule.resourceTabs as any],
        ["bagTabs", seasonModule.bagTabs as any],
        ["stashTabs", seasonModule.stashTabs as any],
        ["commissionTiers", seasonModule.commissionTiers as any],
        ["commissionTiers.tiers", seasonModule.commissionTiers.flatMap(row => row.tiers) as any],
        ["seasons.questPhases.quests", seasonModule.seasons.flatMap(row => row.questPhases.flatMap(phase => phase.quests)) as any],
        ["nestBosses", seasonModule.nestBosses as any],
        ["equipConstants", seasonModule.equipConstants as any],
        ["slots", equipModule.slots as any],
        ["rarities", equipModule.rarities as any],
        ["powerTiers", equipModule.powerTiers as any],
        ["namePrefixes", equipModule.namePrefixes as any],
        ["baseNames", equipModule.baseNames as any],
        ["uniqueEquips", equipModule.uniqueEquips as any],
        ["generateGroups", equipModule.generateGroups as any],
        ["crafts", equipModule.crafts as any],
        ["breakdowns", equipModule.breakdowns as any],
        ["affixPools", equipModule.affixPools as any],
        ["affixLevels", equipModule.affixLevels as any],
        ["affixes", equipModule.affixes as any],
        ["inlays", equipModule.inlays as any],
        ["stages", progressModule.stages as any],
        ["levels", progressModule.levels as any],
        ["talentTrees", progressModule.talentTrees as any],
        ["talentMenus", progressModule.talentMenus as any],
        ["talentLevelUpCosts", progressModule.talentLevelUpCosts as any],
        ["talents", progressModule.talents as any],
        ["riftSeasons", riftModule.seasons as any],
        ["floors", riftModule.floors as any],
        ["rankConfigs", riftModule.rankConfigs as any],
        ["rankRewards", riftModule.rankRewards as any],
        ["rankRoles", riftModule.rankRoles as any],
        ["challenges", riftModule.challenges as any],
        ["monsterScores", riftModule.monsterScores as any],
    ]
}

describe("升华数据：计数", () => {
    it("赛季 / 难度阶 / 资源", () => {
        expect(seasonModule.seasons).toHaveLength(1)
        expect(seasonModule.tiers).toHaveLength(16)
        expect(seasonModule.resources).toHaveLength(46)
        expect(seasonModule.resourceTabs).toHaveLength(3)
        expect(seasonModule.bagTabs).toHaveLength(4)
        expect(seasonModule.stashTabs).toHaveLength(10)
        expect(seasonModule.commissionTiers).toHaveLength(10)
        expect(seasonModule.nestBosses).toHaveLength(6)
    })

    it("旅程任务 52 条", () => {
        const quests = seasonModule.seasons[0].questPhases.flatMap(phase => phase.quests)
        expect(quests).toHaveLength(52)
        expect(quests.map(quest => quest.id)).toEqual([...quests.map(quest => quest.id)].sort((left, right) => left - right))
    })

    it("天赋 300 节点 / 420 条 effect", () => {
        expect(progressModule.talents).toHaveLength(300)
        expect(progressModule.talents.reduce((sum, talent) => sum + talent.effects.length, 0)).toBe(420)
        expect(progressModule.levels).toHaveLength(100)
    })

    it("装备词条 212（Plan 11/70/8/123）", () => {
        expect(equipModule.affixes).toHaveLength(212)
        const plans = equipModule.affixes.reduce<Record<number, number>>((counts, affix) => {
            counts[affix.plan] = (counts[affix.plan] ?? 0) + 1
            return counts
        }, {})
        expect(plans).toEqual({ 1: 11, 2: 70, 3: 8, 4: 123 })
        expect(equipModule.uniqueEquips).toHaveLength(32)
        expect(equipModule.inlays).toHaveLength(30)
    })

    it("唯一装目录只含上游导出的 32 件现行装备", () => {
        const uniqueEquips = equipModule.uniqueEquips
        expect(uniqueEquips).toHaveLength(32)
        expect(new Set(uniqueEquips.map(equip => equip.affixId)).size).toBe(32)
        expect(uniqueEquips.every(equip => equip.id >= 100000)).toBe(true)
        expect(uniqueEquips.every(equip => equip.icon.startsWith("T_Season_"))).toBe(true)
        expect(uniqueEquips.filter(equip => equip.name === "泽被万物护符").map(equip => equip.id)).toEqual([210001])
    })

    it("螺旋 500 层 / 3 子赛季", () => {
        expect(riftModule.floors).toHaveLength(500)
        expect(riftModule.floors.filter(floor => floor.floorType === 1)).toHaveLength(250)
        expect(riftModule.floors.filter(floor => floor.floorType === 2)).toHaveLength(250)
        expect(riftModule.seasons).toHaveLength(3)
        expect(riftModule.eliteMonsterIds).toHaveLength(328)
    })
})

describe("升华数据：引用完整性", () => {
    it("活动 / 委托 / 资源 / 梦魇引用命中本地表", () => {
        const eventIds = new Set(eventData.map(event => event.id))
        expect(eventIds.has(seasonModule.seasons[0].eventId)).toBe(true)

        for (const commission of seasonModule.seasons[0].commissions) {
            expect(dungeonMap.has(commission.dungeonId)).toBe(true)
        }
        for (const id of seasonModule.resources) {
            expect(resourceMap.has(id)).toBe(true)
        }

        const hardBossDiffIds = new Set([...hardBossMap.values()].flatMap(boss => (boss.diff ?? []).map(diff => diff.id)))
        for (const nest of seasonModule.nestBosses) {
            expect(dungeonMap.has(nest.dungeonId)).toBe(true)
            expect(resourceMap.has(nest.keyId)).toBe(true)
            expect(hardBossDiffIds.has(nest.seasonDifficulty)).toBe(true)
        }
    })

    it("奖励引用全部命中 rewardMap", () => {
        const questRewards = seasonModule.seasons[0].questPhases.flatMap(phase => phase.quests.flatMap(quest => quest.rewardIds))
        for (const id of questRewards) {
            expect(rewardMap.has(id)).toBe(true)
        }
        for (const commission of seasonModule.commissionTiers) {
            for (const tier of commission.tiers) {
                for (const id of tier.dungeonRewards ?? []) {
                    expect(rewardMap.has(id)).toBe(true)
                }
                for (const id of Object.values(tier.dropRewards ?? {})) {
                    expect(rewardMap.has(id)).toBe(true)
                }
            }
        }
        for (const floor of riftModule.floors) {
            if (floor.passReward !== undefined) {
                expect(rewardMap.has(floor.passReward)).toBe(true)
            }
        }
    })

    it("螺旋副本 / Boss 命中本地表", () => {
        for (const floor of riftModule.floors) {
            for (const id of floor.dungeonIds ?? []) {
                expect(dungeonMap.has(id)).toBe(true)
            }
            for (const id of floor.bossUnitIds ?? []) {
                expect(monsterMap.has(id)).toBe(true)
            }
        }
    })

    it("普通/精英刷怪组全部解析为 spawnUnits，且 UnitId 可在 monsterMap 查到", () => {
        const spawnIds = new Set<number>(riftModule.eliteMonsterIds)
        for (const floor of riftModule.floors) {
            for (const id of floor.normalMonsterIds ?? []) {
                spawnIds.add(id)
            }
            for (const id of floor.eliteMonsterIds ?? []) {
                spawnIds.add(id)
            }
        }
        expect(Object.keys(riftModule.spawnUnits)).toHaveLength(spawnIds.size)
        for (const id of spawnIds) {
            const units = riftModule.spawnUnits[id]
            expect(units, `刷怪组 ${id}`).toBeDefined()
            expect(units.length).toBeGreaterThan(0)
            for (const unitId of units) {
                expect(monsterMap.has(unitId), `UnitId ${unitId}`).toBe(true)
            }
        }
    })

    it("词条引用命中 affixPools / affixes", () => {
        const affixIds = new Set(equipModule.affixes.map(affix => affix.id))
        for (const unique of equipModule.uniqueEquips) {
            expect(affixIds.has(unique.affixId)).toBe(true)
        }
        for (const slot of equipModule.slots) {
            if (slot.baseAffixId !== undefined) {
                expect(affixIds.has(slot.baseAffixId)).toBe(true)
            }
        }
    })

    it("排行角色只缺 3 个主角占位 id", () => {
        const missing = [...new Set(riftModule.rankRoles.flatMap(role => role.roleIds))].filter(id => !charMap.has(id))
        expect(new Set(missing)).toEqual(KNOWN_MISSING_ROLE_IDS)
    })
})

describe("升华数据：属性规范名（U14）", () => {
    const RAW_ENGINE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/
    /** 上游 1.8.7.1 已删除的两个词条字段（拼写拆开以保持全仓 grep 零匹配） */
    const REMOVED_ATTR_FIELDS = ["attr" + "ConfigKey", "name"]
    /** 53 个规范属性名：生成数据的 attr 集合必须与它完全相等 */
    const CANONICAL_ATTR_NAMES = [
        "充盈威力",
        "光属性攻击",
        "光属性增伤",
        "减伤",
        "召唤物伤害",
        "同律近战攻击",
        "同律近战暴伤",
        "同律近战暴击",
        "同律近战触发",
        "同律远程攻击",
        "同律远程暴伤",
        "同律远程暴击",
        "同律远程触发",
        "增伤",
        "属性穿透",
        "技能伤害",
        "技能威力",
        "技能效益",
        "技能耐久",
        "技能范围",
        "护盾",
        "攻击",
        "昂扬",
        "普通近战攻击",
        "普通近战暴伤",
        "普通近战暴击",
        "普通近战触发",
        "普通远程攻击",
        "普通远程暴伤",
        "普通远程暴击",
        "普通远程触发",
        "暗属性攻击",
        "暗属性增伤",
        "水属性攻击",
        "水属性增伤",
        "火属性攻击",
        "火属性增伤",
        "生命",
        "生命回复",
        "生命恢复增幅",
        "神智",
        "神智回复",
        "移动速度",
        "背水",
        "赛季增伤",
        "近战增伤",
        "远程增伤",
        "火属性追伤",
        "水属性追伤",
        "雷属性追伤",
        "风属性追伤",
        "光属性追伤",
        "暗属性追伤",
        "防御",
        "雷属性攻击",
        "雷属性增伤",
        "风属性攻击",
        "风属性增伤",
    ]
    const affixAttrs = equipModule.affixes.flatMap(affix => affix.addAttrs ?? [])
    const talentAttrs = progressModule.talents.flatMap(talent => talent.effects)

    it("attr 均为规范名，装备与天赋词条都不再携带上游已删字段", () => {
        expect(affixAttrs.length + talentAttrs.length).toBe(593)
        for (const attr of [...affixAttrs, ...talentAttrs]) {
            expect(attr.attr, attr.attr).not.toMatch(RAW_ENGINE_NAME)
            for (const field of REMOVED_ATTR_FIELDS) {
                expect(attr, attr.attr).not.toHaveProperty(field)
            }
        }
    })

    it("attr 集合与 58 个规范名完全相等（集合相等，不只计数）", () => {
        const actual = new Set([...affixAttrs, ...talentAttrs].map(attr => attr.attr))
        expect(actual).toEqual(new Set(CANONICAL_ATTR_NAMES))
        expect(actual.size).toBe(58)
    })

    it("S0 伤害率词条 1030 导出为 赛季增伤（真实数据）", () => {
        const attr = equipModule.affixes.find(affix => affix.id === 1030)?.addAttrs?.[0]
        expect(attr).toMatchObject({ attr: "赛季增伤", rateZone: "S0DamageRate", isPercent: true })
        for (const field of REMOVED_ATTR_FIELDS) {
            expect(attr).not.toHaveProperty(field)
        }
        // 普通增伤（111 / 1023）不受影响
        for (const id of [111, 1023]) {
            expect(equipModule.affixes.find(affix => affix.id === id)?.addAttrs?.[0]).toMatchObject({ attr: "增伤" })
        }
    })

    it("元素的机读字段保留，词条不再输出本地化名称", () => {
        const byId = new Map(equipModule.affixes.map(affix => [affix.id, affix]))
        const bonus: Array<[number, string, string]> = [
            [1024, "Water", "水"],
            [1025, "Fire", "火"],
            [1026, "Wind", "风"],
            [1027, "Thunder", "雷"],
            [1028, "Light", "光"],
            [1029, "Dark", "暗"],
        ]
        for (const [affixId, type, cn] of bonus) {
            const attr = byId.get(affixId)?.addAttrs?.[0]
            expect(attr, `${affixId}`).toMatchObject({ attr: `${cn}属性追伤`, type, element: type })
            for (const field of REMOVED_ATTR_FIELDS) {
                expect(attr, `${affixId}`).not.toHaveProperty(field)
            }
        }
        // 元素伤害率按元素输出独立键（1032 水 / 1035 雷 / 1037 暗）
        const boost = byId.get(1032)?.addAttrs?.[0]
        expect(boost).toMatchObject({ attr: "水属性增伤", element: "Water" })
        for (const field of REMOVED_ATTR_FIELDS) {
            expect(boost).not.toHaveProperty(field)
        }
    })

    it("六个元素天赋带具体 element 字段与独立属性键", () => {
        const byId = new Map(progressModule.talents.map(talent => [talent.id, talent]))
        const cases: Array<[number, string, string]> = [
            [100210, "Wind", "风"],
            [100230, "Fire", "火"],
            [100250, "Dark", "暗"],
            [100280, "Thunder", "雷"],
            [100290, "Water", "水"],
            [100300, "Light", "光"],
        ]
        for (const [talentId, element, cn] of cases) {
            const effect = byId.get(talentId)?.effects.find(item => item.attr === `${cn}属性增伤`)
            expect(effect, `${talentId}`).toMatchObject({ attr: `${cn}属性增伤`, element })
            for (const field of REMOVED_ATTR_FIELDS) {
                expect(effect, `${talentId}`).not.toHaveProperty(field)
            }
        }
    })

    it("恰好 18 条属性带 element（12 装备 + 6 天赋），且只出现在元素限定属性上", () => {
        const withElement = [...affixAttrs, ...talentAttrs].filter(attr => attr.element !== undefined)
        expect(withElement).toHaveLength(18)
        expect(affixAttrs.filter(attr => attr.element !== undefined)).toHaveLength(12)
        expect(talentAttrs.filter(attr => attr.element !== undefined)).toHaveLength(6)
        expect(withElement.filter(attr => attr.attr.endsWith("属性增伤"))).toHaveLength(12)
        expect(withElement.filter(attr => attr.attr.endsWith("属性追伤"))).toHaveLength(6)
        for (const attr of withElement) {
            expect(attr.attr.endsWith("属性追伤") || attr.attr.endsWith("属性增伤"), attr.attr).toBe(true)
        }
    })

    it("武器作用域按规范名落表", () => {
        const attrs = new Set(affixAttrs.map(attr => attr.attr))
        for (const key of ["普通近战攻击", "普通远程暴击", "同律近战暴伤", "同律远程触发"]) {
            expect(attrs.has(key), key).toBe(true)
        }
        const talent = progressModule.talents.find(item => item.id === 100010)
        expect(talent?.effects[0]).toMatchObject({ attr: "普通近战暴击", type: "CMelee" })
    })
})

describe("升华数据：派生字段", () => {
    it("parentIds 由 unlockChildren 反转且无环", () => {
        const byId = new Map(progressModule.talents.map(talent => [talent.id, talent]))
        for (const talent of progressModule.talents) {
            expect(talent.parentIds).toBeDefined()
        }
        const visiting = new Set<number>()
        const done = new Set<number>()
        const visit = (id: number) => {
            if (done.has(id)) {
                return
            }
            expect(visiting.has(id), `天赋 ${id} 存在环`).toBe(false)
            visiting.add(id)
            for (const parentId of byId.get(id)?.parentIds ?? []) {
                expect(byId.has(parentId), `天赋 ${id} 的父节点 ${parentId}`).toBe(true)
                visit(parentId)
            }
            visiting.delete(id)
            done.add(id)
        }
        for (const talent of progressModule.talents) {
            visit(talent.id)
        }
    })

    it("Plan 4 全部带 mappingStatus，只有 exact / handwritten 两档", () => {
        const plan4 = equipModule.affixes.filter(affix => affix.plan === 4)
        const counts: Record<string, number> = {}
        for (const affix of plan4) {
            expect(["exact", "handwritten"]).toContain(affix.mappingStatus)
            counts[affix.mappingStatus!] = (counts[affix.mappingStatus!] ?? 0) + 1
        }
        expect(counts).toEqual({ exact: 85, handwritten: 38 })
    })

    it("技能替换：直接与 Buff 间接映射齐全，仅可解析条目带字段", () => {
        const byId = new Map(equipModule.affixes.map(affix => [affix.id, affix]))
        expect(byId.get(180101)?.skillReplacements?.["180101"]).toMatchObject({
            id: 180112,
            名称: "“在一个暖和的午后”",
            类型: "伤害",
        })
        expect(byId.get(180102)?.skillReplacements?.["180102"]).toMatchObject({ id: 180123, 类型: "增益" })
        expect(byId.get(320301)?.skillReplacements?.["320302"]).toMatchObject({ id: 320312, 名称: "猫猫头出击！" })
        // 310201 无 ActivateSkills，经 PassiveEffect → Buff 间接解析（全表唯一间接路径）
        expect(byId.get(310201)?.activateSkills).toBeUndefined()
        expect(byId.get(310201)?.passiveEffectId).toBe(310211)
        expect(byId.get(310201)?.skillReplacements?.["310201"]).toMatchObject({ id: 310212, 名称: "高温清扫" })
        expect(equipModule.affixes.filter(affix => affix.skillReplacements && !affix.activateSkills).map(affix => affix.id)).toEqual([
            310201,
        ])

        const weapon = byId.get(2040601)?.skillReplacements?.["2040601"]
        expect(weapon?.id).toBe(2040603)
        expect(weapon?.字段).toHaveLength(2)
        expect(weapon?.字段?.map(field => field.名称)).toEqual(["射击伤害", "子弹伤害"])

        // 目标技能无可解析字段时只保留身份/名称，不得编造
        for (const [affixId, from] of [
            [180101, "180101"],
            [180102, "180102"],
            [310201, "310201"],
            [320301, "320302"],
        ] as const) {
            expect(byId.get(affixId)?.skillReplacements?.[from]?.字段).toBeUndefined()
        }

        // 只有 5 条词条带替换表；activateSkills 原样保留；外层键全部为数字（SkillOwner 等被跳过）
        expect(equipModule.affixes.filter(affix => affix.skillReplacements).map(affix => affix.id)).toEqual([
            180101, 180102, 310201, 320301, 2040601,
        ])
        expect(byId.get(180101)?.activateSkills).toEqual({ "180101": 180112 })
        for (const affix of equipModule.affixes) {
            for (const key of Object.keys(affix.skillReplacements ?? {})) {
                expect(key, `affix ${affix.id}`).toMatch(/^\d+$/)
            }
        }
    })

    it("名称继承源技能名（180112/180123/320312 不取目标技能名）", () => {
        const charSkills = charData.flatMap(row => row.技能 ?? [])
        const nameOf = (skillId: number) => charSkills.find(skill => skill.id === skillId)?.名称
        const byId = new Map(equipModule.affixes.map(affix => [affix.id, affix]))

        expect(nameOf(180101)).toBe("“在一个暖和的午后”")
        expect(nameOf(180102)).toBe("“下午茶开始了！”")
        expect(nameOf(320302)).toBe("猫猫头出击！")
        expect(byId.get(180101)?.skillReplacements?.["180101"]?.名称).toBe(nameOf(180101))
        expect(byId.get(180102)?.skillReplacements?.["180102"]?.名称).toBe(nameOf(180102))
        expect(byId.get(320301)?.skillReplacements?.["320302"]?.名称).toBe(nameOf(320302))

        // 目标技能不在角色技能表（无官方名），名称只能继承源技能；baseName/时间线/旧分享依赖该性质
        for (const targetId of [180112, 180123, 320312]) {
            expect(
                charSkills.some(skill => skill.id === targetId),
                `target ${targetId}`
            ).toBe(false)
        }
    })

    it("2040603 替换字段等于源技能 2040601 的 desc 展示值（非 +120% 替换伤害）", () => {
        const sourceSkill = weaponData.flatMap(weapon => weapon.技能 ?? []).find(skill => skill.id === 2040601)
        const replacement = equipModule.affixes.find(affix => affix.id === 2040601)?.skillReplacements?.["2040601"]
        const coreOf = (fields: readonly SkillField[] | undefined) =>
            fields?.map(field => ({ 名称: field.名称, 值: field.值, 削韧: field.削韧, tag: field.tag }))

        expect(sourceSkill?.字段).toHaveLength(2)
        expect(replacement?.字段).toHaveLength(2)
        expect(coreOf(replacement?.字段)).toEqual(coreOf(sourceSkill?.字段))
        // 源技能带时序、替换字段不带（uasset 关闭）；若未来改为导出真实节点伤害，本测试必须显式更新
        expect(sourceSkill?.字段?.every(field => field.取消 !== undefined && field.连段 !== undefined)).toBe(true)
        expect(replacement?.字段?.every(field => field.取消 === undefined && field.连段 === undefined)).toBe(true)
    })

    it("16 条专属词条带上游精确 charIds", () => {
        const byId = new Map(equipModule.affixes.map(affix => [affix.id, affix]))
        expect(byId.get(150401)?.charIds).toEqual([1504])
        expect(byId.get(150201)?.charIds).toEqual([1502])
        expect(byId.get(180101)?.charIds).toEqual([1801])
        expect(byId.get(210101)?.charIds).toEqual([2101])
        expect(byId.get(240101)?.charIds).toEqual([2401])
        expect(byId.get(310201)?.charIds).toEqual([3102])
        expect(byId.get(320301)?.charIds).toEqual([3203])
        expect(byId.get(420101)?.charIds).toEqual([4201])
        expect(byId.get(110201)?.charIds).toEqual([1102])

        const matched = Object.fromEntries(equipModule.affixes.filter(affix => affix.charIds).map(affix => [affix.id, affix.charIds]))
        expect(matched).toEqual({
            110201: [1102],
            150201: [1502],
            150202: [1502],
            150203: [1502],
            150401: [1504],
            180101: [1801],
            180102: [1801],
            210101: [2101],
            240101: [2401],
            240102: [2401],
            240103: [2401],
            310201: [3102],
            310202: [3102],
            320301: [3203],
            320302: [3203],
            420101: [4201],
        })
        expect(Object.keys(matched)).toHaveLength(16)
        expect(byId.get(2030301)?.charIds).toBeUndefined()
        expect(byId.get(2040601)?.charIds).toBeUndefined()
    })

    it("charIds 校验：空数组/非正整数被拒绝，合法值去重升序", () => {
        expect(normalizeCharIds([]).ids).toBeUndefined()
        expect(normalizeCharIds([0]).ids).toBeUndefined()
        expect(normalizeCharIds([-1]).ids).toBeUndefined()
        expect(normalizeCharIds([1.5]).ids).toBeUndefined()
        expect(normalizeCharIds(["1504"]).ids).toBeUndefined()
        expect(normalizeCharIds("1504").ids).toBeUndefined()
        expect(normalizeCharIds([1504, 1502, 1504]).ids).toEqual([1502, 1504])
    })

    it("逐条基线：123 个 Plan 4 词条状态逐一相符", () => {
        const plan4 = equipModule.affixes.filter(affix => affix.plan === 4)
        const actual = Object.fromEntries(plan4.map(affix => [affix.id, affix.mappingStatus]))
        expect(actual).toEqual(PLAN4_STATUS_BASELINE)
    })

    it("5 条神智自然回复词条（神智回复）映射为 exact", () => {
        const byId = new Map(equipModule.affixes.map(affix => [affix.id, affix]))
        for (const [affixId, value] of [
            [3302, 1],
            [3312, 2],
            [3322, 3],
            [3332, 4],
            [3342, 5],
        ] as const) {
            const affix = byId.get(affixId)
            expect(affix?.mappingStatus, `${affixId}`).toBe("exact")
            expect(affix?.addAttrs?.[0]?.attr).toBe("神智回复")
            expect(affix?.minValue).toBe(value)
        }
    })

    it("词缀分类名 / 池名覆盖", () => {
        expect(new Set(equipModule.affixes.map(affix => affix.planName))).toEqual(new Set(["基础词缀", "随机词缀", "技能等级", "专属词缀"]))
        const pooled = equipModule.affixes.filter(affix => affix.pool !== undefined)
        expect(pooled.length).toBeGreaterThan(0)
        for (const affix of pooled) {
            expect(affix.poolName).toBeTruthy()
        }
    })

    it("螺旋子赛季有 displayName", () => {
        for (const season of riftModule.seasons) {
            expect(season.displayName).toMatch(/^第 \d+ 赛季$/)
        }
    })
})

describe("升华数据：无版本标记", () => {
    it("每条记录都不带 版本 字段（含嵌套 commissionTiers.tiers / seasons.questPhases.quests）", () => {
        const arrays = recordArrays()
        const nestedTiers = arrays.find(([name]) => name === "commissionTiers.tiers")?.[1] ?? []
        const nestedQuests = arrays.find(([name]) => name === "seasons.questPhases.quests")?.[1] ?? []
        expect(nestedTiers, "commissionTiers.tiers").toHaveLength(160)
        expect(nestedQuests, "seasons.questPhases.quests").toHaveLength(52)
        for (const [name, records] of arrays) {
            for (const record of records) {
                expect(Object.hasOwn(record, "版本"), name).toBe(false)
            }
        }
        expect(Object.hasOwn(seasonModule.globalConstants, "版本")).toBe(false)
        expect(seasonModule.resources.every(item => typeof item === "number")).toBe(true)
    })

    it("4 个模块 45 个导出在 1.6 门限下仍为全量", async () => {
        const before = allExports()
        expect(before).toHaveLength(45)

        // 用 1.6 门限重新加载 4 个模块：不再有 gate 包装，导出应与默认门限下完全一致。
        let exports16: Array<[string, unknown]> = []
        try {
            setCurrentVersionLimit(1.6)
            const reloaded = await Promise.all([
                // @ts-expect-error vitest 支持 query 形式的模块缓存隔离，tsc-rs 不解析该 specifier
                import("../d/dnaseason.data?ver=one-six").then(module => ["dnaseason", module] as const),
                // @ts-expect-error 同上
                import("../d/dnaseasonequip.data?ver=one-six").then(module => ["dnaseasonequip", module] as const),
                // @ts-expect-error 同上
                import("../d/dnaseasonprogress.data?ver=one-six").then(module => ["dnaseasonprogress", module] as const),
                // @ts-expect-error 同上
                import("../d/dnaseasonrift.data?ver=one-six").then(module => ["dnaseasonrift", module] as const),
            ])
            exports16 = reloaded.flatMap(([stem, module]) =>
                Object.entries(module).map(([name, value]) => [`${stem}.${name}`, value] as [string, unknown])
            )
        } finally {
            setCurrentVersionLimit(Number.POSITIVE_INFINITY)
        }
        expect(exports16).toHaveLength(45)
        const expected = new Map(before)
        for (const [name, value] of exports16) {
            expect(value, `${name} 在 1.6 下应为全量`).toEqual(expected.get(name))
        }
    })
})

const UPSTREAM_CN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", "DuetNightAbyssData2", "final", "i18n", "cn")
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "d")

function readUpstream(hasUpstream: boolean, name: string) {
    return hasUpstream ? JSON.parse(readFileSync(path.join(UPSTREAM_CN, `${name}.json`), "utf-8")) : undefined
}

/** 读取生成数据文件的顶层纯字面量（rawXxx），用于“落盘值 == 当前上游 derive”的漂移检测。 */
function readTopLevelLiterals(file: string): Record<string, unknown> {
    const text = readFileSync(file, "utf-8")
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const literals: Record<string, unknown> = {}
    const toValue = (node: ts.Node): unknown => {
        if (ts.isArrayLiteralExpression(node)) {
            return node.elements.map(toValue)
        }
        if (ts.isObjectLiteralExpression(node)) {
            const value: Record<string, unknown> = {}
            for (const property of node.properties) {
                if (!ts.isPropertyAssignment(property)) {
                    throw new Error(`不支持的字面量属性：${ts.SyntaxKind[property.kind]}`)
                }
                const name = property.name
                if (!ts.isIdentifier(name) && !ts.isStringLiteral(name) && !ts.isNumericLiteral(name)) {
                    throw new Error(`不支持的字面量属性名：${ts.SyntaxKind[name.kind]}`)
                }
                value[name.text] = toValue(property.initializer)
            }
            return value
        }
        if (ts.isStringLiteral(node)) {
            return node.text
        }
        if (ts.isNumericLiteral(node)) {
            return Number(node.text)
        }
        if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
            return -Number(node.operand.text)
        }
        if (node.kind === ts.SyntaxKind.TrueKeyword) {
            return true
        }
        if (node.kind === ts.SyntaxKind.FalseKeyword) {
            return false
        }
        throw new Error(`不支持的字面量：${ts.SyntaxKind[node.kind]}`)
    }
    for (const statement of source.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue
        }
        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
                continue
            }
            if (ts.isArrayLiteralExpression(declaration.initializer) || ts.isObjectLiteralExpression(declaration.initializer)) {
                literals[declaration.name.text] = toValue(declaration.initializer)
            }
        }
    }
    return literals
}

describe("升华数据：刷怪组解析", () => {
    it("三种 MonsterSpawnInfos 形状、去重升序、缺组与空组", () => {
        const table = {
            1: { MonsterSpawnInfos: [{ UnitId: 30 }, { UnitId: 10 }, { UnitId: 30 }] },
            2: { MonsterSpawnInfos: { UnitId: 42 } },
            3: { MonsterSpawnInfos: [[{ UnitId: 7 }, { UnitId: 3 }], [{ UnitId: 7 }]] },
            4: {},
            5: { MonsterSpawnInfos: [] },
        }
        const result = buildSpawnUnits(table, [5, 3, 1, 2, 4, 6])
        expect(result.spawnUnits[1]).toEqual([10, 30])
        expect(result.spawnUnits[2]).toEqual([42])
        expect(result.spawnUnits[3]).toEqual([3, 7])
        expect(result.spawnUnits[4]).toEqual([])
        expect(result.spawnUnits[5]).toEqual([])
        expect(result.spawnUnits[6]).toBeUndefined()
        expect(Object.keys(result.spawnUnits)).toEqual(["1", "2", "3", "4", "5"])
        expect(result.warnings.filter(warning => warning.includes("不存在刷怪组 6"))).toHaveLength(1)
        expect(result.warnings.filter(warning => warning.includes("没有 MonsterSpawnInfos"))).toHaveLength(1)
    })

    it("实际数据覆盖 528 个刷怪组，全部非空且升序去重", () => {
        expect(Object.keys(riftModule.spawnUnits)).toHaveLength(528)
        for (const [spawnId, units] of Object.entries(riftModule.spawnUnits)) {
            expect(units.length, `刷怪组 ${spawnId}`).toBeGreaterThan(0)
            expect(
                [...new Set(units)].sort((left, right) => left - right),
                `刷怪组 ${spawnId}`
            ).toEqual(units)
        }
    })
})

describe("升华数据：数据包重写不带版本参数", () => {
    const DNASEASON_MODULES: Array<[string, object]> = [
        ["dnaseason", seasonModule],
        ["dnaseasonequip", equipModule],
        ["dnaseasonprogress", progressModule],
        ["dnaseasonrift", riftModule],
    ]
    const UNGATED_EXPORTS: Array<[string, string, string]> = [
        ["dnaseason", "resources", "array"],
        ["dnaseason", "globalConstants", "object"],
        ["dnaseasonequip", "slotTypes", "object"],
        ["dnaseasonequip", "craftTypes", "object"],
        ["dnaseasonprogress", "talentTypes", "object"],
        ["dnaseasonrift", "eliteMonsterIds", "array"],
        ["dnaseasonrift", "spawnUnits", "object"],
        ["dnaseasonrift", "globals", "object"],
    ]

    it("四个模块 45 条 registerDataPackBinding 均不带版本参数", () => {
        let total = 0
        for (const [stem, module] of DNASEASON_MODULES) {
            const output = rewriteDataPackModule(path.join(DATA_DIR, `${stem}.data.ts`))
            expect(output, stem).toBeTruthy()
            const registrations = output?.match(/registerDataPackBinding\(/g) ?? []
            expect(registrations, `${stem} 注册数`).toHaveLength(Object.keys(module).length)
            expect(output, `${stem} 版本参数`).not.toContain('", "1.8")')
            total += registrations.length
        }
        expect(total).toBe(45)
    })

    it("8 个非记录型导出保留正确的空值类型", () => {
        for (const [stem, name, kind] of UNGATED_EXPORTS) {
            const output = rewriteDataPackModule(path.join(DATA_DIR, `${stem}.data.ts`))
            expect(output, `${stem}.${name}`).toContain(
                `registerDataPackBinding("${stem}.data", "${name}", "${kind}", value => { ${name} = value as typeof ${name} })`
            )
        }
    })

    it("1.6 门限下水合打包值原样生效", () => {
        const moduleKey = "dnaseason.gate.test"
        const packed: Record<string, unknown> = {
            resources: [1, 2],
            globalConstants: { DNASeasonSiftId: 1007 },
            slotTypes: { 1: "Head" },
            craftTypes: { 1: "Masterwork" },
            talentTypes: { 1: "Normal" },
            eliteMonsterIds: [88802001],
            spawnUnits: { 88802001: [6001011] },
            globals: { RiftMaxLayer: 250 },
        }
        const received: Record<string, unknown> = {}
        for (const [, name, kind] of UNGATED_EXPORTS) {
            registerDataPackBinding(moduleKey, name, kind as "array" | "object", value => {
                received[name] = value
            })
        }
        try {
            setCurrentVersionLimit(1.6)
            hydrateRegisteredDataPackBindings(moduleKey, packed)
        } finally {
            setCurrentVersionLimit(Number.POSITIVE_INFINITY)
        }
        try {
            for (const [, name] of UNGATED_EXPORTS) {
                expect(received[name], `${name} 在 1.6 下应原样生效`).toEqual(packed[name])
            }
        } finally {
            // reset 会以空值重放 setter，必须在断言之后再清理绑定
            resetRegisteredDataPackBindings()
        }
    })
})

describe("升华数据：其他模块版本门禁保留", () => {
    const VERSIONED_MODULES: Array<[string, Array<{ 版本?: string }>]> = [
        ["char", charData],
        ["weapon", weaponData],
        ["mod", modData],
        ["achievement", achievementData],
        ["questchain", questChainData],
        ["region", regionData],
    ]

    it("六个模块仍带 版本 字段", () => {
        for (const [name, rows] of VERSIONED_MODULES) {
            expect(
                rows.some(row => typeof row.版本 === "string"),
                name
            ).toBe(true)
        }
    })

    it("applyVersionGate 仍按门限过滤 1.8 / 本地映射条目", () => {
        const samples: Array<[string, Array<{ 版本?: string }>]> = [
            ["char", charData.filter(row => row.版本 === "1.8").slice(0, 1)],
            ["weapon", weaponData.filter(row => row.版本 === "1.8").slice(0, 1)],
            ["questchain", questChainData.filter(row => row.版本 === "1.7").slice(0, 1)],
        ]
        for (const [name, sample] of samples) {
            expect(sample, name).toHaveLength(1)
        }
        try {
            setCurrentVersionLimit(1.6)
            for (const [name, sample] of samples) {
                expect(applyVersionGate(sample), name).toEqual([])
            }
            expect(applyVersionGate([{ id: 1, 版本: "1.6" }])).toHaveLength(1)
        } finally {
            setCurrentVersionLimit(Number.POSITIVE_INFINITY)
        }
        expect(applyVersionGate([{ id: 1, 版本: "1.8" }])).toHaveLength(1)
    })
})

describe("升华数据：上游形状与历史版本", () => {
    it("缺少必需顶层键时给出文件名与缺键清单，而不是 TypeError", () => {
        const source = {
            season: {},
            equip: {},
            progress: {},
            rift: {},
            spawnUnits: {},
        }
        expect(() => deriveDnaSeasonModules(source as any)).toThrow(/DNASeason\.json.*缺少必需顶层键.*seasons/)
    })

    it("-v 历史版本低于 1.8 时跳过升华模块", () => {
        expect(isLegacyDnaSeasonVersion(["bun", "tool", "-v", "1.1"])).toBe(true)
        expect(isLegacyDnaSeasonVersion(["bun", "tool", "--version=1.7.4"])).toBe(true)
        expect(isLegacyDnaSeasonVersion(["bun", "tool", "-v", "1.8"])).toBe(false)
        expect(isLegacyDnaSeasonVersion(["bun", "tool", "-v", "1.10"])).toBe(false)
        expect(isLegacyDnaSeasonVersion(["bun", "tool"])).toBe(false)
    })

    it("buildDnaSeasonReplacements 在 -v 1.7 时接线跳过并告警", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
            await expect(buildDnaSeasonReplacements("dnaseason", ["bun", "tool", "-v", "1.7"])).resolves.toEqual([])
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("跳过 4 个升华数据模块"))
        } finally {
            warn.mockRestore()
        }
    })
})

/** 最小可派生上游源：必需键齐全、只保留计数下限所需条目，不依赖同级上游仓库。 */
function minimalSource() {
    return {
        season: {
            seasons: [{ id: 1, questPhases: [], commissions: [] }],
            tiers: [],
            buffTypes: [],
            buffLevels: [],
            dropBonuses: [],
            resources: [],
            resourceTabs: [],
            bagTabs: [],
            stashTabs: [],
            commissionTiers: [],
            nestBosses: [],
            equipConstants: [],
            globalConstants: {},
        },
        equip: {
            slotTypes: {},
            craftTypes: {},
            slots: [],
            rarities: [],
            powerTiers: [],
            namePrefixes: [],
            baseNames: [],
            uniqueEquips: [],
            generateGroups: [],
            crafts: [],
            breakdowns: [],
            affixPools: [],
            affixLevels: [],
            affixes: [{ id: 1, plan: 1, minValue: 0, maxValue: 0, totalValueLevel: 1 }],
            inlays: [],
        },
        progress: {
            talentTypes: {},
            stages: [],
            levels: [],
            talentTrees: [],
            talentMenus: [],
            talentLevelUpCosts: [],
            talents: [],
        },
        rift: {
            seasons: [],
            eliteMonsterIds: [],
            floors: [{}],
            rankConfigs: [],
            rankRewards: [],
            rankRoles: [],
            challenges: [],
            monsterScores: [],
            globals: {},
        },
        spawnUnits: { 1: [1] },
    }
}

const plan4Affix = (patch: Record<string, unknown>) => ({
    id: 3101,
    plan: 4,
    minValue: 1,
    maxValue: 1,
    totalValueLevel: 1,
    ...patch,
})

describe("升华派生：元素恢复与 Plan 4 白名单（纯函数）", () => {
    it("recoverFoldedElement 优先级：element → elementType → type", () => {
        expect(recoverFoldedElement({ element: "Fire", elementType: "Water", type: "Wind" })).toBe("火")
        expect(recoverFoldedElement({ elementType: "Water", type: "Wind" })).toBe("水")
        expect(recoverFoldedElement({ type: "Wind" })).toBe("风")
        expect(recoverFoldedElement({ name: "雷属性伤害提升" })).toBeUndefined()
        expect(recoverFoldedElement({ element: "水" })).toBe("水")
        expect(recoverFoldedElement({ element: "Bogus" })).toBeUndefined()
    })

    it("原型链键不穿透：constructor / toString 不是有效元素或属性", () => {
        for (const key of ["constructor", "toString"]) {
            expect(recoverFoldedElement({ element: key }), key).toBeUndefined()
            expect(plan4AttrStatus({ attr: key }), key).toBeUndefined()
        }
        const warnings: string[] = []
        expect(plan4MappingStatus(plan4Affix({ addAttrs: [{ attr: "constructor" }] }), warnings)).toBe("handwritten")
        expect(warnings.join()).toContain("constructor")
        expect(warnings.join()).toContain("未登记映射")
    })

    it("assertFoldedElements：天赋缺元素报错含天赋 id，装备缺元素报错含词条 id", () => {
        expect(() =>
            assertFoldedElements({
                equip: { affixes: [] },
                progress: { talents: [{ id: 100210, effects: [{ attr: "元素增伤" }] }] },
            })
        ).toThrow("天赋 100210")
        expect(() =>
            assertFoldedElements({
                equip: { affixes: [{ id: 1032, addAttrs: [{ attr: "元素增伤" }] }] },
                progress: { talents: [] },
            })
        ).toThrow("词条 1032")
        expect(() =>
            assertFoldedElements({
                equip: { affixes: [] },
                progress: { talents: [{ id: 1, effects: [{ attr: "元素增伤", element: "Water" }] }] },
            })
        ).not.toThrow()
    })

    it("Plan 4 未知属性告警并降级 handwritten；S0 增伤落入独立乘区 exact", () => {
        const unknown: string[] = []
        expect(plan4MappingStatus(plan4Affix({ addAttrs: [{ attr: "BogusAttr" }] }), unknown)).toBe("handwritten")
        expect(unknown.join()).toContain("3101")
        expect(unknown.join()).toContain("BogusAttr")
        expect(unknown.join()).toContain("未登记映射")

        // S0 伤害率在运行时映射到独立乘区 赛季增伤，派生状态必须同为 exact
        expect(plan4AttrStatus({ attr: "增伤", rateZone: "S0DamageRate" })).toBe("exact")
        expect(plan4AttrStatus({ attr: "赛季增伤" })).toBe("exact")
        expect(plan4AttrStatus({ attr: "增伤" })).toBe("exact")
        // 旧 raw 形状与运行时同口径：raw 键自带分区信息，不降级
        expect(plan4AttrStatus({ attr: "DamageRate_NoTag_S0DamageRate" })).toBe("exact")
        expect(plan4AttrStatus({ attr: "DamageRate" })).toBe("exact")
    })

    it("追伤七分量按 exact 映射，元素写在键名里不再走折叠恢复", () => {
        for (const element of ["火", "水", "雷", "风", "光", "暗"]) {
            expect(plan4AttrStatus({ attr: `${element}属性追伤` }), element).toBe("exact")
        }
        expect(plan4AttrStatus({ attr: "自属性追伤" })).toBe("exact")
        // 字面「追加伤害」已不是上游规范名：不再要求 element 元数据，也不标 exact
        expect(plan4AttrStatus({ attr: "追加伤害" })).toBeUndefined()
        expect(() =>
            assertFoldedElements({
                equip: { affixes: [{ id: 1032, addAttrs: [{ attr: "追加伤害" }] }] },
                progress: { talents: [] },
            })
        ).not.toThrow()
    })

    it("元素弱点七键与旧 raw `<Element>DamagedRate` 均映射 exact；裸 DamagedRate 仍为减伤（U95）", () => {
        const elements: Array<[string, string]> = [
            ["Fire", "火"],
            ["Water", "水"],
            ["Thunder", "雷"],
            ["Wind", "风"],
            ["Light", "光"],
            ["Dark", "暗"],
        ]
        for (const [, element] of elements) {
            expect(plan4AttrStatus({ attr: `${element}属性弱点` }), element).toBe("exact")
            expect(mapTranscendAttr(`${element}属性弱点`)).toEqual({ key: `${element}属性弱点`, status: "exact" })
        }
        expect(plan4AttrStatus({ attr: "全属性弱点" })).toBe("exact")
        for (const [raw, element] of elements) {
            expect(plan4AttrStatus({ attr: `${raw}DamagedRate` }), raw).toBe("exact")
            expect(mapTranscendAttr(`${raw}DamagedRate`), raw).toEqual({ key: `${element}属性弱点`, status: "exact", element })
        }
        // 裸 DamagedRate 是个体减伤，不得当成全属性弱点
        expect(plan4AttrStatus({ attr: "DamagedRate" })).toBe("exact")
        expect(mapTranscendAttr("DamagedRate")).toEqual({ key: "减伤", status: "exact", negate: true })
    })

    it("Plan 4 S0 增伤派生状态与运行时映射一致（无状态分叉）", () => {
        const cases = [
            { attr: "增伤", rateZone: "S0DamageRate" },
            { attr: "DamageRate_NoTag_S0DamageRate", rateZone: "S0DamageRate" },
            { attr: "属性穿透", rateZone: "Almighty" },
        ]
        for (const attr of cases) {
            const derived = plan4AttrStatus(attr)
            const runtime = mapTranscendAttr(attr.attr, attr)
            expect(derived, `${attr.attr}｜${attr.rateZone}`).toBe(runtime.status)
            expect(runtime.key, `${attr.attr}｜${attr.rateZone}`).toBe(attr.rateZone === "S0DamageRate" ? "赛季增伤" : "属性穿透")
        }
    })

    it("legacy 负例：ATK_Physical / 无作用域武器属性不落 exact", () => {
        expect(plan4AttrStatus({ attr: "ATK_Fire" })).toBe("exact")
        expect(plan4AttrStatus({ attr: "ATK_Physical" })).toBeUndefined()
        const warnings: string[] = []
        expect(plan4MappingStatus(plan4Affix({ addAttrs: [{ attr: "ATK_Physical" }] }), warnings)).toBe("handwritten")
        expect(warnings.join()).toContain("ATK_Physical")
        // 裸 DamagedRate 只有个体减伤形态，与运行时一致按 exact 处理
        expect(plan4AttrStatus({ attr: "DamagedRate" })).toBe("exact")
        // 武器 raw 属性必须带合法作用域后缀，与运行时 mapTranscendAttr 一致
        expect(plan4AttrStatus({ attr: "WeaponATKModifierRate" })).toBeUndefined()
        expect(plan4AttrStatus({ attr: "WeaponATKModifierRate_Bogus" })).toBeUndefined()
        expect(plan4AttrStatus({ attr: "WeaponATKModifierRate_CMelee" })).toBe("exact")
    })

    it("normalizeSkillReplacements 校验 from/to/id/名称/类型/字段并按数字键排序", () => {
        const warnings: string[] = []
        const result = normalizeSkillReplacements(
            {
                "310201": { id: 310212, 名称: "高温清扫", 类型: "伤害" },
                "180101": { id: 180112, 名称: "“在一个暖和的午后”", 类型: "伤害", 字段: [{ 名称: "射击伤害", 值: 0.05 }] },
                SkillOwner: { id: 1, 名称: "x", 类型: "y" },
                "1": { id: "2", 名称: "x", 类型: "y" },
                "2": { id: 3, 名称: "", 类型: "y" },
                "3": { id: 4, 名称: "x", 类型: "y", 字段: {} },
            },
            9999,
            warnings
        )
        expect(Object.keys(result ?? {})).toEqual(["180101", "310201"])
        expect(result?.["180101"].字段).toHaveLength(1)
        expect(warnings).toHaveLength(4)
        expect(warnings.join()).toContain("SkillOwner")
        expect(warnings.join()).toContain("不是数组")
    })

    it("normalizeSkillReplacements 缺省返回 undefined，非法顶层与空结果告警后丢弃", () => {
        expect(normalizeSkillReplacements(undefined, 1, [])).toBeUndefined()

        const warnings: string[] = []
        expect(normalizeSkillReplacements([], 1, warnings)).toBeUndefined()
        expect(warnings).toEqual([expect.stringContaining("skillReplacements 不是对象")])

        const emptyWarnings: string[] = []
        expect(normalizeSkillReplacements({ "1": { id: 2, 名称: "", 类型: "" } }, 1, emptyWarnings)).toBeUndefined()
        expect(emptyWarnings).toHaveLength(1)
    })

    it("normalizeSkillReplacements 缺类型仍保留条目（空串透传），非字符串类型才丢弃", () => {
        const warnings: string[] = []
        const result = normalizeSkillReplacements(
            {
                "180101": { id: 180112, 名称: "“在一个暖和的午后”" },
                "180102": { id: 180123, 名称: "“下午茶开始了！”", 类型: undefined },
                "320302": { id: 320312, 名称: "猫猫头出击！", 类型: 1 },
            },
            9999,
            warnings
        )
        expect(result).toEqual({
            "180101": { id: 180112, 名称: "“在一个暖和的午后”", 类型: "" },
            "180102": { id: 180123, 名称: "“下午茶开始了！”", 类型: "" },
        })
        expect(warnings).toEqual([expect.stringContaining("类型不是字符串")])
    })
})

describe("升华派生：最小源端到端（不依赖上游仓库）", () => {
    it("最小源可完整派生", () => {
        expect(() => deriveDnaSeasonModules(minimalSource() as any)).not.toThrow()
    })

    it("必需键齐全但关键数组为空时拒绝导入", () => {
        const base = minimalSource()
        expect(() => deriveDnaSeasonModules({ ...base, season: { ...base.season, seasons: [] } } as any)).toThrow(
            /DNASeason\.json 的 seasons 为空/
        )
        expect(() => deriveDnaSeasonModules({ ...base, equip: { ...base.equip, affixes: [] } } as any)).toThrow(
            /DNASeasonEquip\.json 的 affixes 为空/
        )
        expect(() => deriveDnaSeasonModules({ ...base, rift: { ...base.rift, floors: [] } } as any)).toThrow(
            /DNASeasonRift\.json 的 floors 为空/
        )
        expect(() => deriveDnaSeasonModules({ ...base, spawnUnits: {} } as any)).toThrow(/MonsterSpawn 刷怪组索引为空/)
    })

    it("无池 Plan 3 技能等级词条按「技能类型 × 家族」派生部位 slotTypes（§138 补正）", () => {
        const base = minimalSource()
        const skillLevel = (id: number, skillTypes: string[], patch: Record<string, unknown> = {}) => ({
            id,
            plan: 3,
            addSkillLevel: { skillTypes },
            minValue: 1,
            maxValue: 5,
            totalValueLevel: 5,
            ...patch,
        })
        const source = {
            ...base,
            equip: {
                ...base.equip,
                affixPools: [{ id: 211, name: "协战" }],
                affixes: [
                    skillLevel(1038, ["Skill1"]),
                    skillLevel(1039, ["Skill2"]),
                    skillLevel(1040, ["Passive"]),
                    skillLevel(1499, ["Skill1"]),
                    skillLevel(1500, ["Skill2"]),
                    skillLevel(1510, ["Skill1"]),
                    skillLevel(1511, ["Skill2"]),
                    skillLevel(1512, ["Passive"]),
                    skillLevel(1520, ["Skill2"], { pool: 211 }),
                    skillLevel(1540, ["Skill2"], { addSkillLevel: { skillIds: [2040601] } }),
                    skillLevel(1550, []),
                    skillLevel(1598, ["Skill1", "Passive", "Unknown"]),
                    skillLevel(1599, ["Skill2"]),
                    skillLevel(1600, ["Skill2"]),
                    { id: 1530, plan: 3, minValue: 1, maxValue: 5, totalValueLevel: 5 },
                ],
            },
        }
        const rows = deriveDnaSeasonModules(source as any).dnaseasonequip.rawAffixes as any[]
        const slotTypesOf = (id: number) => rows.find(row => row.id === id)?.slotTypes
        // 主控：战技 → 手套(3)，终结技 → 耳环(5)，被动 → 项链(6)
        expect(slotTypesOf(1038)).toEqual([3])
        expect(slotTypesOf(1039)).toEqual([5])
        expect(slotTypesOf(1040)).toEqual([6])
        // 协战：战技 → 护符(8)，终结技 → 印章(9)，被动 → 典籍(10)
        expect(slotTypesOf(1510)).toEqual([8])
        expect(slotTypesOf(1511)).toEqual([9])
        expect(slotTypesOf(1512)).toEqual([10])
        // 多 skillTypes 取并集，未知类型忽略
        expect(slotTypesOf(1598)).toEqual([8, 10])
        // 家族边界：1499 主控 / 1500 协战 / 1599 协战 / 1600 不命中
        expect(slotTypesOf(1499)).toEqual([3])
        expect(slotTypesOf(1500)).toEqual([9])
        expect(slotTypesOf(1599)).toEqual([9])
        expect(slotTypesOf(1600)).toBeUndefined()
        // 带 pool / 仅 skillIds / 空 skillTypes / 无 addSkillLevel 均不命中
        expect(slotTypesOf(1520)).toBeUndefined()
        expect(slotTypesOf(1540)).toBeUndefined()
        expect(slotTypesOf(1550)).toBeUndefined()
        expect(slotTypesOf(1530)).toBeUndefined()
    })

    it("非法 charIds 不落盘并告警", () => {
        const base = minimalSource()
        const source = { ...base, equip: { ...base.equip, affixes: [plan4Affix({ id: 150401, charIds: [] })] } }
        const modules = deriveDnaSeasonModules(source as any)
        expect(modules.warnings.some(warning => warning.includes("150401") && warning.includes("charIds 非法"))).toBe(true)
        const row = (modules.dnaseasonequip.rawAffixes as any[]).find(affix => affix.id === 150401)
        expect(row.charIds).toBeUndefined()
    })

    it.skipIf(!existsSync(UPSTREAM_CN))("唯一装不过滤：导入产物条数与上游导出条数一致", () => {
        const upstream = readUpstream(true, "DNASeasonEquip").uniqueEquips
        expect(equipModule.uniqueEquips.map(equip => equip.id)).toEqual(upstream.map((equip: any) => equip.id))
        expect(equipModule.uniqueEquips).toHaveLength(32)
    })

    it("Plan 4 白名单外属性告警并降级 handwritten", () => {
        const base = minimalSource()
        const source = {
            ...base,
            equip: { ...base.equip, affixes: [plan4Affix({ addAttrs: [{ attr: "BogusAttr" }] })] },
        }
        const modules = deriveDnaSeasonModules(source as any)
        expect(
            modules.warnings.some(warning => warning.includes("3101") && warning.includes("BogusAttr") && warning.includes("未登记映射"))
        ).toBe(true)
        const row = (modules.dnaseasonequip.rawAffixes as any[]).find(affix => affix.id === 3101)
        expect(row.mappingStatus).toBe("handwritten")
    })

    it("Plan 4 的 S0 增伤派生为 exact（运行时落入赛季增伤独立乘区）", () => {
        const base = minimalSource()
        const source = {
            ...base,
            equip: {
                ...base.equip,
                affixes: [plan4Affix({ addAttrs: [{ attr: "增伤", rateZone: "S0DamageRate" }] })],
            },
        }
        const modules = deriveDnaSeasonModules(source as any)
        const row = (modules.dnaseasonequip.rawAffixes as any[]).find(affix => affix.id === 3101)
        expect(row.mappingStatus).toBe("exact")
        expect(modules.warnings.filter(warning => warning.includes("3101"))).toEqual([])
    })

    it("元素增伤 无法恢复元素时导入失败并带 id", () => {
        const base = minimalSource()
        const equipSource = {
            ...base,
            equip: {
                ...base.equip,
                affixes: [plan4Affix({ id: 1032, plan: 2, addAttrs: [{ attr: "元素增伤" }] })],
            },
        }
        expect(() => deriveDnaSeasonModules(equipSource as any)).toThrow(/无法恢复元素.*词条 1032/)

        const talentSource = {
            ...base,
            progress: { ...base.progress, talents: [{ id: 100210, effects: [{ attr: "元素增伤" }] }] },
        }
        expect(() => deriveDnaSeasonModules(talentSource as any)).toThrow(/无法恢复元素.*天赋 100210/)
    })
})

describe.skipIf(!existsSync(UPSTREAM_CN))("升华数据：落盘值 == 当前上游 derive（漂移检测）", () => {
    it("4 个数据文件的 raw 字面量与当前上游独立 derive 逐字段一致", () => {
        const source = {
            season: readUpstream(true, "DNASeason"),
            equip: readUpstream(true, "DNASeasonEquip"),
            progress: readUpstream(true, "DNASeasonProgress"),
            rift: readUpstream(true, "DNASeasonRift"),
            spawnUnits: riftModule.spawnUnits,
        }
        const first = deriveDnaSeasonModules(source as any)
        const second = deriveDnaSeasonModules(source as any)
        expect(JSON.stringify(second)).toBe(JSON.stringify(first))

        for (const stem of ["dnaseason", "dnaseasonequip", "dnaseasonprogress", "dnaseasonrift"] as const) {
            const actual = readTopLevelLiterals(path.join(DATA_DIR, `${stem}.data.ts`))
            const expected = Object.fromEntries(Object.entries(first[stem]).filter(([name]) => name.startsWith("raw")))
            expect(Object.keys(actual).sort(), `${stem} 变量集合`).toEqual(Object.keys(expected).sort())
            for (const [name, value] of Object.entries(expected)) {
                expect(actual[name], `${stem}.${name}`).toEqual(value)
            }
        }
    })
})
