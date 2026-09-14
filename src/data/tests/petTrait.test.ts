import { describe, expect, it } from "vitest"
import { createDefaultCharSettings } from "@/composables/useCharSettings"
import { createCharBuildFromSettings } from "../CharBuildHelper"
import { buffMap } from "../d"
import { petEntrys } from "../d/pet.data"
import {
    calcPetBuffLevelIncome,
    calcPetCoverageIncome,
    collectPetBuffs,
    collectTraitBuffs,
    getEffectivePetLevel,
    getPetActiveDuration,
    getPetBaseCd,
    getPetBuffData,
    getPetTrait,
    getPetTraitByLevel,
    getPetTraits,
    getTraitCdReduce,
    getTraitPetLevelBonus,
    getTraitProperties,
    isPetRelatedBuffName,
    normalizeTraitSlots,
    PET_SKILL_LEVEL_OFFSET,
    resolvePetCoverage,
    TRAIT_BUFF_NAME_PREFIX,
    TRAIT_SLOT_COUNT,
} from "../petTrait"

/** 老道：魔灵支援和被动等级+1（无属性 BUFF，靠提升魔灵技能等级生效） */
const LAODAO_SLOT: [number, number] = [1030, 3]
/** 凶猛 r5（攻击+24%） */
const XIONGMENG_SLOT: [number, number] = [1010, 3]
/** 敏锐 r5（支援技能冷却-24%） */
const MINRUI_SLOT: [number, number] = [1014, 3]
/** 黑曜艾尔芙（登记了被动物与主动技 BUFF 的活力魔灵，主动 20s / 持续 12s） */
const HEIYAO_PET_ID = 4211
/** 堇青艾尔芙（主动为增伤，用于验证冷却缩减 → 覆盖率 → 收益） */
const QINGJING_PET_ID = 4221

describe("魔灵潜质目录", () => {
    it("与潜质数据源一一对应（每个稀有度档位一条潜质）", () => {
        expect(getPetTraits().length).toBe(petEntrys.length)
        const trait = getPetTrait(10103)
        expect(trait?.name).toBe("凶猛")
        expect(trait?.bid).toBe(1010)
        expect(trait?.r).toBe(5)
        expect(trait?.level).toBe(3)
        expect(trait?.desc).toBe("攻击+24%")
        expect(trait?.url).toBe("/imgs/webp/T_Armory_Pet_Attr_Base_Gold.webp")
    })

    it("按 [基础潜质 id, 等级] 可反查档位，且等级与稀有度对应", () => {
        expect(getPetTraitByLevel(1010, 1)?.id).toBe(10101)
        expect(getPetTraitByLevel(1010, 3)?.id).toBe(10103)
        expect(getPetTraitByLevel(1010, 4)).toBeUndefined()
        // 只出 r5 的潜质没有 1/2 级档位
        expect(getPetTraitByLevel(1004, 1)).toBeUndefined()
        expect(getPetTraitByLevel(1004, 3)?.name).toBe("顽强")
    })

    it("参与属性结算的潜质都关联到同名的魔灵潜质 BUFF", () => {
        getPetTraits()
            .filter(trait => trait.buffName !== null)
            .forEach(trait => {
                expect(trait.buffName).toBe(`${TRAIT_BUFF_NAME_PREFIX}${trait.name}`)
                expect(buffMap.has(trait.buffName!)).toBe(true)
                // 潜质等级即 BUFF 等级（r3/r4/r5 → 1/2/3）
                expect(trait.level).toBe(trait.r - 2)
            })
        expect(getPetTrait(10103)?.buffName).not.toBeNull()
        // 纯玩法潜质不产生属性
        expect(getPetTrait(10011)?.buffName).toBeNull()
    })

    it("潜质属性按等级取 BUFF 等级曲线上的数值", () => {
        expect(getTraitProperties(getPetTrait(10101)!)).toEqual({ 攻击: 0.08 })
        expect(getTraitProperties(getPetTrait(10103)!)).toEqual({ 攻击: 0.24 })
        expect(getTraitProperties(getPetTrait(10133)!)).toEqual({ 护盾: 0.24 })
        expect(getTraitProperties(getPetTrait(10143)!)).toEqual({ 魔灵CD缩减: 0.24 })
        expect(getTraitProperties(getPetTrait(10011)!)).toEqual({})
    })

    it("槽位批量构造构筑 BUFF 时跳过空槽与无属性潜质", () => {
        const buffs = collectTraitBuffs([XIONGMENG_SLOT, null, [1001, 3], MINRUI_SLOT])
        expect(buffs.map(buff => buff.名称)).toEqual(["魔灵潜质:凶猛", "魔灵潜质:敏锐"])
        expect(buffs[0].攻击).toBeCloseTo(0.24)
        expect(buffs[1].魔灵CD缩减).toBeCloseTo(0.24)
    })

    it("老道不产生属性 BUFF，而是给魔灵技能等级 +1", () => {
        const laodao = getPetTraitByLevel(LAODAO_SLOT[0], LAODAO_SLOT[1])
        expect(laodao?.name).toBe("老道")
        expect(laodao?.buffName).toBeNull()
        expect(laodao?.petSkillLevelBonus).toBe(1)
        expect(getTraitProperties(laodao!)).toEqual({})
    })
})

describe("潜质槽位归一化", () => {
    it("固定槽位数，并把已选潜质压紧到前几槽（空槽补 null）", () => {
        expect(normalizeTraitSlots([null, MINRUI_SLOT])).toEqual([MINRUI_SLOT, null, null, null])
        expect(normalizeTraitSlots(undefined)).toEqual([null, null, null, null])
        expect(normalizeTraitSlots(undefined).length).toBe(TRAIT_SLOT_COUNT)
    })

    it("同一潜质（基础潜质 id）只保留第一个槽位", () => {
        // 凶猛 r5 与凶猛 r3 共用同一条 BUFF，重复装备会让收益计算互相干扰；胆小是另一条潜质，不受影响
        expect(normalizeTraitSlots([XIONGMENG_SLOT, [1010, 1], MINRUI_SLOT, [1013, 3]])).toEqual([
            XIONGMENG_SLOT,
            MINRUI_SLOT,
            [1013, 3],
            null,
        ])
    })

    it("剔除非法档位（未上线的潜质或越界等级）", () => {
        expect(normalizeTraitSlots([[9999, 3], [1010, 9], XIONGMENG_SLOT])).toEqual([XIONGMENG_SLOT, null, null, null])
    })
})

describe("魔灵CD 属性（秒）", () => {
    it("未选魔灵时为 0；装备敏锐潜质后按缩减把原始冷却折算成秒", () => {
        const noPet = createCharBuildFromSettings(1504, {
            ...createDefaultCharSettings(),
            traits: [MINRUI_SLOT, null, null, null],
        })
        const noPetAttrs = noPet.calculateWeaponAttributes()
        // 没有魔灵 → 没有可折算的冷却
        expect(noPetAttrs.魔灵CD).toBe(0)
        expect(noPetAttrs.魔灵CD缩减).toBeCloseTo(0.24)

        const withPet = { ...createDefaultCharSettings(), petId: HEIYAO_PET_ID, petLevel: 4, petCoverage: 1 }
        const plain = createCharBuildFromSettings(1504, withPet).calculateWeaponAttributes()
        // 黑曜艾尔芙主动技原始冷却 20 秒
        expect(getPetBaseCd(HEIYAO_PET_ID)).toBe(20)
        expect(plain.魔灵CD).toBeCloseTo(20)
        expect(plain.魔灵CD缩减).toBe(0)

        const reduced = createCharBuildFromSettings(1504, {
            ...withPet,
            traits: [MINRUI_SLOT, null, null, null],
        }).calculateWeaponAttributes()
        // 20 × (1 - 0.24) = 15.2 秒
        expect(reduced.魔灵CD).toBeCloseTo(15.2)
        // 魔灵CD 与攻击类潜质互不影响
        expect(reduced.攻击).toBeCloseTo(plain.攻击)
    })

    it("可参与表达式引用（角色::魔灵CD!，值为秒）", () => {
        const build = createCharBuildFromSettings(1504, {
            ...createDefaultCharSettings(),
            petId: HEIYAO_PET_ID,
            traits: [MINRUI_SLOT, null, null, null],
        })
        const attrs = build.calculateWeaponAttributes()
        expect(build.evaluateAST("角色::魔灵CD!", attrs)).toBeCloseTo(15.2)
        expect(build.evaluateAST("角色::魔灵CD! - 10", attrs)).toBeCloseTo(5.2)
    })

    it("同一潜质叠加时缩减不会突破 100%（不出现负冷却）", () => {
        const build = createCharBuildFromSettings(1504, {
            ...createDefaultCharSettings(),
            petId: HEIYAO_PET_ID,
            // 绕过槽位去重直接注入，验证属性侧的上限钳制
            traits: [MINRUI_SLOT, MINRUI_SLOT, MINRUI_SLOT, MINRUI_SLOT],
        })
        const attrs = build.calculateWeaponAttributes()
        expect(attrs.魔灵CD缩减).toBeLessThanOrEqual(1)
        expect(attrs.魔灵CD).toBeGreaterThanOrEqual(0)
    })
})

describe("魔灵 BUFF 与技能等级", () => {
    it("读取魔灵登记的被动/主动 BUFF，未登记 BUFF 的魔灵两项为空", () => {
        expect(getPetBuffData(HEIYAO_PET_ID).passive?.名称).toBe("黑曜艾尔芙")
        expect(getPetBuffData(HEIYAO_PET_ID).active?.名称).toBe("黑曜艾尔芙(主动)")
        expect(getPetBuffData(4073)).toEqual({ passive: null, active: null })
    })

    it("魔灵相关 BUFF（潜质 / 被动物 / 主动技）会被 BUFF 列表排除", () => {
        expect(isPetRelatedBuffName("魔灵潜质:凶猛")).toBe(true)
        expect(isPetRelatedBuffName("黑曜艾尔芙")).toBe(true)
        expect(isPetRelatedBuffName("黑曜艾尔芙(主动)")).toBe(true)
        expect(isPetRelatedBuffName("菲娜Q")).toBe(false)
    })

    it("生效等级（值索引）= 突破等级 + 潜质加成，展示等级 = 生效等级 + 1", () => {
        expect(getEffectivePetLevel(3, [])).toBe(3)
        expect(getEffectivePetLevel(3, [LAODAO_SLOT, null, null, null])).toBe(4)
        // 已满突破（4）时加成不再溢出
        expect(getEffectivePetLevel(4, [LAODAO_SLOT, null, null, null])).toBe(4)
        expect(getTraitPetLevelBonus([LAODAO_SLOT, XIONGMENG_SLOT, null, null])).toBe(1)

        // 突破 0 → Lv.1；突破 3 → Lv.4；突破 3 + 老道 → Lv.5（值索引 4 = 数据源最后一档）
        expect(getEffectivePetLevel(0, []) + PET_SKILL_LEVEL_OFFSET).toBe(1)
        expect(getEffectivePetLevel(3, []) + PET_SKILL_LEVEL_OFFSET).toBe(4)
        expect(getEffectivePetLevel(3, [LAODAO_SLOT, null, null, null]) + PET_SKILL_LEVEL_OFFSET).toBe(5)
    })

    it("被动物按生效技能等级取值，主动技额外按覆盖率缩放", () => {
        const [passive, active] = collectPetBuffs(HEIYAO_PET_ID, 4, 0.5)
        expect(passive.属性攻击).toBeCloseTo(0.096)
        // 4 级主动昂扬为 24%，覆盖率 50% → 12%
        expect(active.昂扬).toBeCloseTo(0.12)
        expect(active.coverage).toBeCloseTo(0.5)
    })

    it("老道的收益按「不含加成 → 含加成」两个等级求差，满突破时加成被上限吃掉为 0", () => {
        const baseSettings = { ...createDefaultCharSettings(), baseName: "射击", petId: HEIYAO_PET_ID, petCoverage: 1 }
        // 突破 3：3 级 → 4 级（属性攻击 4.8% → 9.6%）有收益
        const level3 = createCharBuildFromSettings(1504, { ...baseSettings, petLevel: 3, traits: [null, null, null, null] })
        expect(level3.calculate()).toBeGreaterThan(0)
        expect(calcPetBuffLevelIncome(level3, 3, 4)).toBeGreaterThan(0)
        // 同一构筑上「4 级 → 4 级」为 0，避免把上限内的加成误算成收益
        expect(calcPetBuffLevelIncome(level3, 4, 4)).toBe(0)

        // 突破 4（满突破）：加成无法再提升等级 → 0
        const level4 = createCharBuildFromSettings(1504, { ...baseSettings, petLevel: 4, traits: [null, null, null, null] })
        expect(calcPetBuffLevelIncome(level4, 4, 4)).toBe(0)
        // 已装备老道（生效等级 4）时它的贡献同样为 0
        const withLaodaoAtMax = createCharBuildFromSettings(1504, {
            ...baseSettings,
            petLevel: 4,
            traits: [LAODAO_SLOT, null, null, null],
        })
        expect(getEffectivePetLevel(4, [LAODAO_SLOT, null, null, null])).toBe(4)
        expect(calcPetBuffLevelIncome(withLaodaoAtMax, 4, 4)).toBe(0)

        const noPet = createCharBuildFromSettings(1504, { ...createDefaultCharSettings(), baseName: "射击" })
        expect(calcPetBuffLevelIncome(noPet, 3, 4)).toBe(0)
        expect(calcPetBuffLevelIncome(noPet, 4, 4)).toBe(0)
    })

    it("主动技持续时间从描述占位符解析，自动覆盖率 = 持续时间 / 实际冷却", () => {
        // 黑曜艾尔芙主动：…持续{}秒（第三个占位符），各档位均为 12 秒
        expect(getPetActiveDuration(HEIYAO_PET_ID, 3)).toBe(12)
        // 没有主动技 / 未选魔灵 → 0
        expect(getPetActiveDuration(0, 3)).toBe(0)

        // 原始冷却 20 秒：自动覆盖率 12/20 = 60%
        expect(resolvePetCoverage(HEIYAO_PET_ID, 3, [], 1, true)).toBeCloseTo(0.6)
        // 装备敏锐（缩减 24%）→ 12/15.2 ≈ 78.9%，与角色属性「魔灵CD」同源
        expect(getTraitCdReduce([MINRUI_SLOT, null, null, null])).toBeCloseTo(0.24)
        expect(resolvePetCoverage(HEIYAO_PET_ID, 3, [MINRUI_SLOT, null, null, null], 1, true)).toBeCloseTo(12 / 15.2)
        // 手动模式直接用设置值
        expect(resolvePetCoverage(HEIYAO_PET_ID, 3, [MINRUI_SLOT, null, null, null], 0.5, false)).toBeCloseTo(0.5)
        // 无法自动计算（未选魔灵）时退回手动值
        expect(resolvePetCoverage(0, 3, [], 0.25, true)).toBeCloseTo(0.25)
    })

    it("敏锐这类冷却缩减潜质的收益 = 自动覆盖率提升带来的主动技收益", () => {
        // 堇青艾尔芙主动为「增伤」，覆盖率提高会直接抬升伤害
        const build = createCharBuildFromSettings(1504, {
            ...createDefaultCharSettings(),
            baseName: "射击",
            petId: QINGJING_PET_ID,
            petLevel: 3,
            petCoverage: 1,
            petAutoCoverage: true,
        })
        expect(getPetActiveDuration(QINGJING_PET_ID, 3)).toBe(12)
        expect(build.calculate()).toBeGreaterThan(0)

        // 60%（无缩减）→ 78.95%（敏锐 24% 缩减）有收益
        const without = resolvePetCoverage(QINGJING_PET_ID, 3, [], 1, true)
        const withReduce = resolvePetCoverage(QINGJING_PET_ID, 3, [MINRUI_SLOT, null, null, null], 1, true)
        expect(without).toBeCloseTo(0.6)
        expect(withReduce).toBeCloseTo(12 / 15.2)
        expect(calcPetCoverageIncome(build, without, withReduce)).toBeGreaterThan(0)
        // 同一覆盖率（手动模式）没有收益
        expect(calcPetCoverageIncome(build, without, without)).toBe(0)
    })

    it("未装备魔灵时被动物与主动技都不进入构筑", () => {
        const base = createCharBuildFromSettings(1504, { ...createDefaultCharSettings(), baseName: "射击" })
        const withPet = createCharBuildFromSettings(1504, {
            ...createDefaultCharSettings(),
            baseName: "射击",
            petId: HEIYAO_PET_ID,
            petLevel: 4,
            petCoverage: 1,
        })
        expect(base.buffs.length).toBe(0)
        expect(withPet.buffs.length).toBe(2)
        // 被动物提供暗属性攻击（按百分比乘区并入攻击），主动技提供昂扬
        expect(withPet.calculateWeaponAttributes().攻击).toBeGreaterThan(base.calculateWeaponAttributes().攻击)
        expect(withPet.calculateWeaponAttributes().昂扬).toBeGreaterThan(base.calculateWeaponAttributes().昂扬)
    })
})
