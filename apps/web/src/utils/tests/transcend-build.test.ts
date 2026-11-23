import { describe, expect, it, vi } from "vitest"
import {
    affixes,
    createDefaultTranscendBuildSettings,
    createMaxedReachableTalentLevels,
    createMaxedTranscendTalentLevels,
    createTranscendBuild,
    createTranscendBuildShare,
    normalizeTranscendBuildSettings,
    parseTranscendBuildShare,
    serializeTranscendBuildSettings,
    stages,
    type TranscendBuildSettings,
    type TranscendEquippedGear,
    type TranscendGearEntry,
    type TranscendGearItemConfig,
    type TranscendSettings,
    type TranscendSideLoadout,
    talents,
} from "@/data"
import { isModProvidedBuff } from "@/data/buffFilter"
import { isPetRelatedBuffName } from "@/data/petTrait"
import {
    addGearEntry,
    clampGearEntry,
    computeTranscendTeamSnapshot,
    countSlotEntries,
    createTranscendBuffContexts,
    createTranscendTeamCache,
    getAffixDataUiType,
    getCompatibleAffixes,
    getDefaultTranscendBuildSettings,
    getDynamicWeaponDisplayValue,
    getModeResult,
    getSideGear,
    getSideGearSlots,
    getSideSlotIds,
    getSingleParticipatingSide,
    getSingleParticipatingSkillName,
    getTranscendAssistBuffSources,
    getTranscendBuffOptions,
    getTranscendBuildStorageKey,
    getTranscendTeamBuffSourceIds,
    getUnlockAllTalentLevels,
    getVisibleTalentStageWarnings,
    isCompatibleNormalAffix,
    isGemAffix,
    localizeTranscendWarning,
    mergeUnlockedTalentLevels,
    partitionSlotEntries,
    reconcileTranscendTeamBuffs,
    removeGearEntry,
    resolveSingleWeaponSelection,
    setSideGear,
    type TranscendTeamSnapshot,
    updateGearEntry,
} from "@/utils/transcend-build"
import { getGearLineMarkState, getItemAffixLines, isAncientGearIconLine, isAncientGearLine } from "@/utils/transcend-gear/display"
import { getAffixCapabilities, getAffixSummaryParts } from "@/utils/transcendence-gear"

/** 头盔基础词条（只兼容 1 号槽） */
const HELMET_AFFIX = 102
/** 手套基础词条（只兼容 3 号槽） */
const GLOVE_AFFIX = 101
/** 同时配置太古与最终精造公式、500 档的词条 */
const CRAFT_AFFIX = 1001
/** 角色专属词条（charIds: [1801]，头盔槽） */
const CHAR_SPECIFIC_AFFIX = 180101
/** 镶嵌物引用的宝石词条（头盔 / 手套槽） */
const GEM_AFFIX = 3101
/** 暗金专属词条（plan 4，非镶嵌物来源） */
const UNIQUE_AFFIX = 2001

/** 可用的主控角色与首个技能 */
function mainCharSettings(): TranscendBuildSettings {
    const settings = createDefaultTranscendBuildSettings(1101)
    settings.main.baseName = "残光"
    return settings
}

describe("升华构筑槽位 helper", () => {
    it("主控 8 槽、协战一 9-12、协战二 13-16，三组区间连续", () => {
        expect(getSideSlotIds("main")).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
        expect(getSideSlotIds("assist1")).toEqual([9, 10, 11, 12])
        expect(getSideSlotIds("assist2")).toEqual([13, 14, 15, 16])
    })

    it("槽型名按上游映射：8 号位复用戒指、协战位为护符/印章/典籍/纹饰", () => {
        const main = getSideGearSlots("main")
        expect(main[0]).toMatchObject({ slotId: 1, slotType: 1, name: "头盔" })
        expect(main[7]).toMatchObject({ slotId: 8, slotType: 7, name: "戒指" })
        expect(getSideGearSlots("assist1").map(slot => slot.name)).toEqual(["护符", "印章", "典籍", "纹饰"])
        expect(getSideGearSlots("assist2").map(slot => slot.slotType)).toEqual([8, 9, 10, 11])
    })

    it("按构筑位读写装备组：三组一人一套，互不影响", () => {
        const settings = createDefaultTranscendBuildSettings(0).transcend
        setSideGear(settings, "assist1", [
            { slotId: 9, affixId: 1501, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
        ])
        expect(getSideGear(settings, "assist1")).toHaveLength(1)
        expect(getSideGear(settings, "main")).toHaveLength(0)
        expect(settings.assist1Gear).toHaveLength(1)
        // 协战二不共享协战一的装备
        expect(getSideGear(settings, "assist2")).toHaveLength(0)
        setSideGear(settings, "assist2", [
            { slotId: 13, affixId: 1501, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
        ])
        expect(getSideGear(settings, "assist1")).toHaveLength(1)
        expect(getSideGear(settings, "assist2")).toHaveLength(1)
        expect(settings.assist2Gear[0].slotId).toBe(13)
    })
})

describe("词条条目钳制 / 去重 / 兼容过滤", () => {
    it("钳制档位与精造次数，并丢弃词条不支持的太古/最终精造", () => {
        const clamped = clampGearEntry({
            slotId: 1,
            affixId: HELMET_AFFIX,
            rollLevel: 9999,
            masterworkLevel: 99,
            ancient: true,
            finalMasterwork: true,
        })
        expect(clamped.rollLevel).toBe(affixes.find(affix => affix.id === HELMET_AFFIX)?.totalValueLevel)
        expect(clamped.masterworkLevel).toBe(10)
        expect(clamped.ancient).toBe(false)
        expect(clamped.finalMasterwork).toBe(false)
    })

    it("保留词条确实支持的太古/最终精造", () => {
        const clamped = clampGearEntry({
            slotId: 9,
            affixId: CRAFT_AFFIX,
            rollLevel: 1,
            masterworkLevel: 0,
            ancient: true,
            finalMasterwork: true,
        })
        expect(clamped.ancient).toBe(true)
        expect(clamped.finalMasterwork).toBe(true)
    })

    it("同槽同词条去重、基础 1 条 + 随机 4 条（共 5 条）", () => {
        const first = addGearEntry([], 1, HELMET_AFFIX)
        expect(first.status).toBe("added")
        expect(first.entries).toHaveLength(1)
        expect(first.entries[0].rollLevel).toBe(50)

        const duplicate = addGearEntry(first.entries, 1, HELMET_AFFIX)
        expect(duplicate.status).toBe("exists")
        expect(duplicate.entries).toHaveLength(1)

        const compatible = getCompatibleAffixes(1)
        let entries = first.entries
        for (const affix of compatible) {
            if (countSlotEntries(entries, 1) >= 4) break
            entries = addGearEntry(entries, 1, affix.id).entries
        }
        expect(countSlotEntries(entries, 1)).toBe(4)
        expect(entries).toHaveLength(5)
        const extra = compatible.find(affix => !entries.some(entry => entry.affixId === affix.id))
        expect(extra).toBeTruthy()
        expect(addGearEntry(entries, 1, extra!.id).status).toBe("full")
    })

    it("基础词条单独占 1 条：已有 4 条随机时仍可添加", () => {
        const randomAffixes = getCompatibleAffixes(1).filter(affix => affix.id !== HELMET_AFFIX && affix.plan === 2)
        expect(randomAffixes.length).toBeGreaterThanOrEqual(4)
        let entries: TranscendGearEntry[] = []
        for (const affix of randomAffixes.slice(0, 4)) {
            entries = addGearEntry(entries, 1, affix.id).entries
        }
        expect(countSlotEntries(entries, 1)).toBe(4)
        const base = addGearEntry(entries, 1, HELMET_AFFIX)
        expect(base.status).toBe("added")
        expect(base.entries).toHaveLength(5)
        expect(countSlotEntries(base.entries, 1)).toBe(4)
    })

    it("拒绝与槽位不兼容的词条", () => {
        expect(addGearEntry([], 1, GLOVE_AFFIX).status).toBe("incompatible")
        expect(addGearEntry([], 1, 99999999).status).toBe("unknown-affix")
    })

    it("更新时重新钳制，删除按槽位+词条定位", () => {
        const entries = addGearEntry([], 1, HELMET_AFFIX).entries
        const updated = updateGearEntry(entries, 1, HELMET_AFFIX, { rollLevel: 0, masterworkLevel: 42 })
        expect(updated[0].rollLevel).toBe(1)
        expect(updated[0].masterworkLevel).toBe(10)
        expect(removeGearEntry(updated, 1, HELMET_AFFIX)).toHaveLength(0)
        expect(removeGearEntry(updated, 2, HELMET_AFFIX)).toHaveLength(1)
    })

    it("兼容词条按槽位过滤，专属（含角色专属）词缀不进入普通列表", () => {
        const all = getCompatibleAffixes(1).map(affix => affix.id)
        expect(all).toContain(HELMET_AFFIX)
        expect(all).not.toContain(GLOVE_AFFIX)
        expect(all).not.toContain(CHAR_SPECIFIC_AFFIX)
        expect(getCompatibleAffixes(1, 1101).map(affix => affix.id)).not.toContain(CHAR_SPECIFIC_AFFIX)
        expect(getCompatibleAffixes(1, 1801).map(affix => affix.id)).not.toContain(CHAR_SPECIFIC_AFFIX)
        expect(getCompatibleAffixes(1, 1101, "防御").map(affix => affix.id)).toContain(HELMET_AFFIX)
    })

    it("宝石词缀按镶嵌物数据判定，不进入普通词条列表", () => {
        expect(isGemAffix(GEM_AFFIX)).toBe(true)
        expect(isGemAffix(UNIQUE_AFFIX)).toBe(false)
        expect(isGemAffix(HELMET_AFFIX)).toBe(false)
        expect(getAffixDataUiType(GEM_AFFIX)).toBe("gem")
        expect(getAffixDataUiType(UNIQUE_AFFIX)).toBe("unique")
        expect(getAffixDataUiType(HELMET_AFFIX)).toBe("normal")
        expect(getAffixDataUiType(99999999)).toBe("unknown")
        expect(getCompatibleAffixes(1).map(affix => affix.id)).not.toContain(GEM_AFFIX)
        expect(getCompatibleAffixes(1).map(affix => affix.id)).not.toContain(UNIQUE_AFFIX)
    })

    it("普通词条过滤排除镶嵌物引用的词条，即使该词条不是 plan 4", () => {
        const helmet = affixes.find(affix => affix.id === HELMET_AFFIX)
        expect(helmet).toBeTruthy()
        expect(helmet!.plan).not.toBe(4)
        expect(isCompatibleNormalAffix(helmet!, 1)).toBe(true)
        expect(isCompatibleNormalAffix(helmet!, 1, 0, "", id => id === HELMET_AFFIX)).toBe(false)
    })

    it("每槽 4 条随机上限只统计随机词条：宝石 + 普通", () => {
        const base = { slotId: 1, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }
        let entries: TranscendGearEntry[] = [{ ...base, affixId: GEM_AFFIX, gemId: 7001101, socketIndex: 0 }]
        expect(countSlotEntries(entries, 1)).toBe(0)

        const compatible = getCompatibleAffixes(1).filter(affix => affix.id !== HELMET_AFFIX && affix.plan === 2)
        let added = 0
        for (const affix of compatible) {
            if (added >= 4) break
            const result = addGearEntry(entries, 1, affix.id)
            if (result.status !== "added") continue
            entries = result.entries
            added++
        }
        expect(added).toBe(4)
        expect(countSlotEntries(entries, 1)).toBe(4)
        const extra = compatible.find(affix => !entries.some(entry => entry.affixId === affix.id))
        expect(extra).toBeTruthy()
        expect(addGearEntry(entries, 1, extra!.id).status).toBe("full")
    })

    it("每槽 4 条随机上限只统计随机词条：专属 + 普通", () => {
        const base = { slotId: 1, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }
        let entries: TranscendGearEntry[] = [{ ...base, affixId: UNIQUE_AFFIX }]
        expect(countSlotEntries(entries, 1)).toBe(0)

        const compatible = getCompatibleAffixes(1).filter(affix => affix.id !== HELMET_AFFIX && affix.plan === 2)
        let added = 0
        for (const affix of compatible) {
            if (added >= 4) break
            const result = addGearEntry(entries, 1, affix.id)
            if (result.status !== "added") continue
            entries = result.entries
            added++
        }
        expect(added).toBe(4)
        expect(countSlotEntries(entries, 1)).toBe(4)
        const extra = compatible.find(affix => !entries.some(entry => entry.affixId === affix.id))
        expect(extra).toBeTruthy()
        expect(addGearEntry(entries, 1, extra!.id).status).toBe("full")
    })

    it("装备组回写保留暗金专属与孔位宝石", () => {
        const settings = createDefaultTranscendBuildSettings(0).transcend
        settings.mainGear = [
            {
                slotId: 1,
                item: {
                    kind: "unique",
                    slotType: 1,
                    uniqueId: 1001,
                    uniqueAffix: { affixId: UNIQUE_AFFIX, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                    affixes: [{ affixId: HELMET_AFFIX, rollLevel: 10, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
                    sockets: [{ socketIndex: 0, gemId: 7001101 }],
                },
            },
        ]
        const entries = getSideGear(settings, "main")
        expect(entries.some(entry => entry.affixId === UNIQUE_AFFIX)).toBe(true)
        expect(entries.some(entry => entry.gemId === 7001101)).toBe(true)

        setSideGear(settings, "main", updateGearEntry(entries, 1, HELMET_AFFIX, { rollLevel: 20 }))
        const group = settings.mainGear as TranscendEquippedGear[]
        expect(group).toHaveLength(1)
        expect(group[0].item.kind).toBe("unique")
        expect(group[0].item.uniqueAffix?.affixId).toBe(UNIQUE_AFFIX)
        expect(group[0].item.sockets?.[0]?.gemId).toBe(7001101)
        expect(group[0].item.affixes.find(affix => affix.affixId === HELMET_AFFIX)?.rollLevel).toBe(20)
    })

    it("槽位条目按数据分堆，未知词缀单独保留", () => {
        const base = { slotId: 1, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }
        const entries: TranscendGearEntry[] = [
            { ...base, affixId: HELMET_AFFIX },
            { ...base, affixId: GEM_AFFIX, gemId: 7001101, socketIndex: 0 },
            { ...base, affixId: 99999999 },
            { ...base, slotId: 2, affixId: 99999998 },
        ]
        const grouped = partitionSlotEntries(entries, 1, id => affixes.find(affix => affix.id === id))
        expect(grouped.regular.map(entry => entry.affixId)).toEqual([HELMET_AFFIX])
        expect(grouped.gem.map(entry => entry.affixId)).toEqual([GEM_AFFIX])
        expect(grouped.unknown.map(entry => entry.affixId)).toEqual([99999999])
    })

    it("词缀能力由词条数据推导（普通 / 专属 / 宝石 / 未知）", () => {
        const helmet = affixes.find(affix => affix.id === HELMET_AFFIX)
        const craft = affixes.find(affix => affix.id === CRAFT_AFFIX)
        const unique = affixes.find(affix => affix.id === UNIQUE_AFFIX)
        const gem = affixes.find(affix => affix.id === GEM_AFFIX)
        expect(helmet && craft && unique && gem).toBeTruthy()

        expect(getAffixCapabilities({ affixId: HELMET_AFFIX }, helmet)).toMatchObject({
            type: "normal",
            known: true,
            roll: true,
            masterwork: true,
            ancient: false,
            finalMasterwork: false,
            editable: true,
            fixed: false,
        })
        expect(getAffixCapabilities({ affixId: CRAFT_AFFIX }, craft)).toMatchObject({
            type: "normal",
            roll: true,
            masterwork: true,
            ancient: true,
            finalMasterwork: true,
            editable: true,
        })
        expect(getAffixCapabilities({ affixId: UNIQUE_AFFIX }, unique)).toMatchObject({
            type: "unique",
            known: true,
            roll: false,
            masterwork: false,
            ancient: false,
            finalMasterwork: false,
            editable: false,
            fixed: true,
        })
        expect(getAffixCapabilities({ affixId: GEM_AFFIX, gemId: 7001101, socketIndex: 0 }, gem)).toMatchObject({
            type: "gem",
            known: true,
            editable: false,
            fixed: true,
        })
        expect(getAffixCapabilities({ affixId: GEM_AFFIX, gemId: 7001101, socketIndex: 0 }, null)).toMatchObject({
            type: "gem",
            known: false,
            fixed: false,
        })
        expect(getAffixCapabilities({ affixId: 99999999 })).toMatchObject({ type: "unknown", known: false, editable: false, fixed: false })
    })

    it("词缀摘要按段返回原始游戏文本，供界面逐段翻译", () => {
        const craft = affixes.find(affix => affix.id === CRAFT_AFFIX)
        const unique = affixes.find(affix => affix.id === UNIQUE_AFFIX)
        expect(craft && unique).toBeTruthy()
        expect(getAffixSummaryParts(craft!)).toEqual(["攻击"])
        const parts = getAffixSummaryParts(unique!)
        expect(parts.length).toBeGreaterThan(0)
        expect(parts.every(part => part.length > 0 && !part.includes(" · "))).toBe(true)
    })

    it("协战单槽三种选择路径归一为单一武器槽", () => {
        expect(resolveSingleWeaponSelection("melee", 20298, 0)).toEqual({ meleeWeapon: 0, rangedWeapon: 20298 })
        expect(resolveSingleWeaponSelection("ranged", 0, 10206)).toEqual({ meleeWeapon: 10206, rangedWeapon: 0 })
        expect(resolveSingleWeaponSelection("", 10206, 20298)).toEqual({ meleeWeapon: 10206, rangedWeapon: 0 })
        expect(resolveSingleWeaponSelection("", 0, 0)).toEqual({ meleeWeapon: 0, rangedWeapon: 0 })
    })

    it("动态 BUFF 平值按武器基础属性归一，比例值原样保留", () => {
        const weapon = { 基础攻击: 1000, 基础暴击: 0.25, 基础触发: 0.5 }
        expect(getDynamicWeaponDisplayValue(weapon, "攻击", 150)).toBeCloseTo(0.15)
        expect(getDynamicWeaponDisplayValue(weapon, "暴击", 0.05)).toBeCloseTo(0.2)
        expect(getDynamicWeaponDisplayValue(weapon, "触发", 0.1)).toBeCloseTo(0.2)
        expect(getDynamicWeaponDisplayValue(weapon, "攻速", 0.05)).toBe(0.05)
        expect(getDynamicWeaponDisplayValue(null, "攻击", 150)).toBe(150)
    })

    it("队伍来源变化时增删协战 BUFF：旧来源移除、新来源按满级补入", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.assist1 = { ...settings.assist1, enabled: true, charId: 1102, meleeWeapon: 0, rangedWeapon: 0 }
        const firstIds = getTranscendTeamBuffSourceIds(settings)
        expect(firstIds).toEqual([1102])
        const added = reconcileTranscendTeamBuffs([], [], firstIds)
        expect(added.some(([name]) => name === "芙罗拉Q")).toBe(true)

        // 换成幻景：芙罗拉来源移除，幻景来源补入
        settings.assist1 = { ...settings.assist1, charId: 1103 }
        const nextIds = getTranscendTeamBuffSourceIds(settings)
        expect(nextIds).toEqual([1103])
        const switched = reconcileTranscendTeamBuffs(added, firstIds, nextIds)
        expect(switched.some(([name]) => name === "芙罗拉Q")).toBe(false)
        expect(switched.some(([name]) => name === "幻景Q")).toBe(true)
        // 幻景Q 等级来源 Q，默认等级取 mx=30（数值由表达式按来源侧有效等级求值）
        expect(switched.find(([name]) => name === "幻景Q")![1]).toBe(30)
    })

    it("同名条目保留现有等级；来源集合不变时再调和不会改变等级", () => {
        const edited: [string, number][] = [["幻景Q", 3]]
        const next = reconcileTranscendTeamBuffs(edited, [], [1103])
        expect(next.find(([name]) => name === "幻景Q")![1]).toBe(3)
        const again = reconcileTranscendTeamBuffs(next, [1103], [1103])
        expect(again.find(([name]) => name === "幻景Q")![1]).toBe(3)
        expect(again).toHaveLength(next.length)
    })

    it("协战武器 (队友) BUFF 作为队伍来源参与增删", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.assist1 = { ...settings.assist1, enabled: true, charId: 1102, meleeWeapon: 10502, rangedWeapon: 0 }
        const name = "泽世的慈雨(队友)"
        expect(getTranscendBuffOptions(settings).map(option => option.name)).toContain(name)

        const source = getTranscendAssistBuffSources(settings).find(item => item.option.name === name)
        expect(source?.sides).toEqual(["assist1"])

        const withWeapon = reconcileTranscendTeamBuffs([], [], getTranscendTeamBuffSourceIds(settings))
        expect(withWeapon.some(([buffName]) => buffName === name)).toBe(true)
        const withoutWeapon = reconcileTranscendTeamBuffs(withWeapon, [1102, 10502], [1102])
        expect(withoutWeapon.some(([buffName]) => buffName === name)).toBe(false)
    })

    it("候选口径：协战限定 BUFF 与自定义 BUFF 可选，魔灵相关 BUFF 由 joint 字段接管", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.assist1 = { ...settings.assist1, enabled: true, charId: 1801, meleeWeapon: 10502, rangedWeapon: 20298 }
        const names = getTranscendBuffOptions(settings).map(option => option.name)
        expect(names).toContain("菲娜Q")
        expect(names).toContain("自定义BUFF")
        expect(names.some(name => isPetRelatedBuffName(name))).toBe(false)
    })

    it("主控自身武器的 (队友) BUFF 不进入协战来源", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.main.meleeWeapon = 10502
        settings.assist1 = { ...settings.assist1, enabled: true, charId: 1102, meleeWeapon: 0, rangedWeapon: 0 }
        const name = "泽世的慈雨(队友)"
        expect(getTranscendAssistBuffSources(settings).some(source => source.option.name === name)).toBe(false)
        expect(getTranscendTeamBuffSourceIds(settings)).toEqual([1102])
    })
})

describe("三段计算与缓存", () => {
    it("主控有角色时输出伤害，未启用协战为 null，合计等于有效段之和", () => {
        const snapshot = computeTranscendTeamSnapshot(mainCharSettings())
        expect(snapshot.main?.damage).toBeGreaterThan(0)
        expect(snapshot.assist1).toBeNull()
        expect(snapshot.assist2).toBeNull()
        expect(snapshot.total).toBe(snapshot.main?.damage)
        expect(getModeResult(snapshot, "main")).toMatchObject({ active: true, damage: snapshot.main?.damage })
        expect(getModeResult(snapshot, "assist1")).toMatchObject({ active: false, damage: null })
        expect(getModeResult(snapshot, "total")).toMatchObject({ active: true, damage: snapshot.total })
    })

    it("唯一参与段：单段返回该段，多段返回 null", () => {
        const settings = mainCharSettings()
        settings.assist1 = { ...settings.assist1, enabled: true, charId: 1102, baseName: "风花飞旋" }
        settings.assist2 = { ...settings.assist2, enabled: true, charId: 1103, baseName: "幻景Q" }
        // 三段参与
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(settings))).toBeNull()
        // 两段参与
        settings.assist2.enabled = false
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(settings))).toBeNull()
        // 仅主控参与（协战一、协战二均禁用）
        settings.assist1.enabled = false
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(settings))).toBe("main")
        // 主控禁用、仅协战一参与
        settings.main.enabled = false
        settings.assist1.enabled = true
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(settings))).toBe("assist1")
    })

    it("唯一参与段的技能名：单段取该段 baseName，空名 / 多段 / 0 段为 null", () => {
        const settings = mainCharSettings()
        expect(getSingleParticipatingSkillName(computeTranscendTeamSnapshot(settings))).toBe("残光")
        // 单段空 baseName → null（调用方显示「合计」）
        settings.main.baseName = ""
        expect(getSingleParticipatingSkillName(computeTranscendTeamSnapshot(settings))).toBeNull()
        // 多段参与 → null
        settings.main.baseName = "残光"
        settings.assist1 = { ...settings.assist1, enabled: true, charId: 1102, baseName: "风花飞旋" }
        expect(getSingleParticipatingSkillName(computeTranscendTeamSnapshot(settings))).toBeNull()
        // 主控禁用后唯一参与段是协战一，取协战一自己的技能名
        settings.main.enabled = false
        expect(getSingleParticipatingSkillName(computeTranscendTeamSnapshot(settings))).toBe("风花飞旋")
        // 0 段参与 → null
        settings.assist1.enabled = false
        expect(getSingleParticipatingSkillName(computeTranscendTeamSnapshot(settings))).toBeNull()
        expect(getSingleParticipatingSkillName(computeTranscendTeamSnapshot(createDefaultTranscendBuildSettings(0)))).toBeNull()
    })

    it("无角色 / 全部禁用不算参与段，invalid / failed 仍算参与", () => {
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(createDefaultTranscendBuildSettings(0)))).toBeNull()
        const settings = mainCharSettings()
        settings.assist1 = { ...settings.assist1, charId: 1102, enabled: false }
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(settings))).toBe("main")
        // 全部禁用 → 无参与段
        settings.main.enabled = false
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(settings))).toBeNull()
        // 唯一启用段的表达式无效仍算参与
        settings.main.enabled = true
        settings.main.targetFunction = "1 +"
        expect(getSingleParticipatingSide(computeTranscendTeamSnapshot(settings))).toBe("main")
        // 唯一启用段构建失败仍算参与
        const huge = "9".repeat(200)
        settings.main.targetFunction = `${huge} * ${huge}`
        const failed = computeTranscendTeamSnapshot(settings)
        expect(failed.sideStates.main.state).toBe("failed")
        expect(getSingleParticipatingSide(failed)).toBe("main")
    })

    it("启用协战后合计包含协战段，协战不吃主控天赋", () => {
        const settings = mainCharSettings()
        settings.assist1 = {
            ...settings.assist1,
            enabled: true,
            charId: 1102,
            baseName: "风花飞旋",
        }
        const withAssist = computeTranscendTeamSnapshot(settings)
        expect(withAssist.assist1?.damage).toBeGreaterThan(0)
        expect(withAssist.total).toBe((withAssist.main?.damage ?? 0) + (withAssist.assist1?.damage ?? 0))
    })

    it("无角色时主控为 null，合计不可用（不显示 0）", () => {
        const snapshot = computeTranscendTeamSnapshot(createDefaultTranscendBuildSettings(0))
        expect(snapshot.main).toBeNull()
        expect(snapshot.total).toBeNull()
        expect(snapshot.sideStates.main.state).toBe("empty")
        expect(getModeResult(snapshot, "total")).toMatchObject({ active: false, damage: null, state: "empty" })
    })

    it("表达式无效时该段标记 invalid，合计返回 null 而不是 0", () => {
        const settings = mainCharSettings()
        settings.main.targetFunction = "1 +"
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.sideStates.main.state).toBe("invalid")
        expect(snapshot.main?.error).toBeTruthy()
        expect(snapshot.total).toBeNull()
        expect(snapshot.totalError).toBe(snapshot.targetError)
        const total = getModeResult(snapshot, "total")
        expect(total.damage).toBeNull()
        expect(total.state).toBe("invalid")
        expect(total.error).toBeTruthy()
    })

    it("未启用的协战状态可见，但不影响主控合计", () => {
        const settings = mainCharSettings()
        settings.assist1 = { ...settings.assist1, charId: 1102, enabled: false, baseName: "风花飞旋" }
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.sideStates.assist1).toMatchObject({ state: "disabled", charId: 1102 })
        expect(snapshot.assist1).toBeNull()
        expect(snapshot.total).toBe(snapshot.main?.damage)
    })

    it("启用协战后任一无效段都会阻止合计", () => {
        const settings = mainCharSettings()
        settings.assist1 = { ...settings.assist1, charId: 1102, enabled: true, baseName: "风花飞旋" }
        settings.main.targetFunction = "1 +"
        expect(computeTranscendTeamSnapshot(settings).total).toBeNull()
    })

    it("设置未变时复用快照，变更后重建", () => {
        const build = vi.fn((settings: TranscendBuildSettings): TranscendTeamSnapshot => {
            const snapshot = computeTranscendTeamSnapshot(settings)
            return { ...snapshot, total: -1 }
        })
        const cache = createTranscendTeamCache(build)
        const settings = mainCharSettings()
        const first = cache.get(settings)
        const second = cache.get(settings)
        expect(build).toHaveBeenCalledTimes(1)
        expect(second).toBe(first)
        expect(first.total).toBe(-1)

        settings.main.charLevel = 79
        const third = cache.get(settings)
        expect(build).toHaveBeenCalledTimes(2)
        expect(third).not.toBe(first)

        cache.clear()
        cache.get(settings)
        expect(build).toHaveBeenCalledTimes(3)
    })

    it("仅 DOT 频率变化也重建快照（缓存键包含 dotSettings）", () => {
        const build = vi.fn((settings: TranscendBuildSettings): TranscendTeamSnapshot => computeTranscendTeamSnapshot(settings))
        const cache = createTranscendTeamCache(build)
        const settings = mainCharSettings()
        const first = cache.get(settings)
        expect(build).toHaveBeenCalledTimes(1)
        expect(first.main!.build.build.calculateDotDamage()).toBe(0)

        settings.main.dotSettings.melee = 0.5
        const second = cache.get(settings)
        expect(build).toHaveBeenCalledTimes(2)
        expect(second).not.toBe(first)
        expect(second.main!.build.build.calculateDotDamage()).toBeGreaterThan(0)
        // 默认表达式「伤害」不含 DOT：合计不变
        expect(second.total).toBeCloseTo(first.total ?? 0, 6)

        // 目标改为 DOT伤害 后，合计随 DOT 参与表达式而更新
        settings.main.targetFunction = "DOT伤害"
        const third = cache.get(settings)
        expect(build).toHaveBeenCalledTimes(3)
        expect(third).not.toBe(second)
        expect(third.total).toBeGreaterThan(0)
    })

    it("切换结果模式不触发重算", () => {
        const build = vi.fn((settings: TranscendBuildSettings): TranscendTeamSnapshot => computeTranscendTeamSnapshot(settings))
        const cache = createTranscendTeamCache(build)
        const snapshot = cache.get(mainCharSettings())
        getModeResult(snapshot, "main")
        getModeResult(snapshot, "assist1")
        getModeResult(snapshot, "assist2")
        getModeResult(snapshot, "total")
        expect(build).toHaveBeenCalledTimes(1)
    })

    it("存储键独立于老构筑", () => {
        expect(getTranscendBuildStorageKey(1101)).toBe("transcendBuild.1101")
        expect(getTranscendBuildStorageKey(1101)).not.toBe("build.1101")
    })
})

describe("按构筑位独立的目标表达式 / 启用开关", () => {
    /** 三段同角色、可分别设置表达式的基础设置 */
    const teamSettings = () => {
        const settings = mainCharSettings()
        settings.assist1 = { ...settings.main, enabled: true }
        settings.assist2 = { ...settings.main, enabled: true }
        return settings
    }

    it("每段用自己的表达式校验与求值", () => {
        const settings = teamSettings()
        settings.main.targetFunction = "攻击!"
        settings.assist1.targetFunction = "防御!"
        settings.assist2.targetFunction = "生命!"
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.main!.build.build.targetFunction).toBe("攻击!")
        expect(snapshot.assist1!.build.build.targetFunction).toBe("防御!")
        expect(snapshot.assist2!.build.build.targetFunction).toBe("生命!")
        expect(snapshot.main!.damage).toBeCloseTo(snapshot.main!.build.build.calculateAttributes().攻击, 6)
        expect(snapshot.assist1!.damage).toBeCloseTo(snapshot.assist1!.build.build.calculateAttributes().防御, 6)
        expect(snapshot.assist2!.damage).toBeCloseTo(snapshot.assist2!.build.build.calculateAttributes().生命, 6)
        expect(snapshot.total).toBeCloseTo(
            (snapshot.main!.damage ?? 0) + (snapshot.assist1!.damage ?? 0) + (snapshot.assist2!.damage ?? 0),
            6
        )
    })

    it("主控禁用时协战仍参与合计，主控状态为 disabled", () => {
        const settings = teamSettings()
        settings.main.enabled = false
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.sideStates.main).toMatchObject({ state: "disabled", charId: 1101 })
        expect(snapshot.main).toBeNull()
        expect(snapshot.assist1).not.toBeNull()
        expect(snapshot.assist2).not.toBeNull()
        expect(snapshot.total).toBeCloseTo((snapshot.assist1?.damage ?? 0) + (snapshot.assist2?.damage ?? 0), 6)
        expect(getModeResult(snapshot, "total")).toMatchObject({ active: true, damage: snapshot.total, state: "ok" })
    })

    it("禁用段的表达式错误不影响合计与错误口径", () => {
        const settings = teamSettings()
        settings.main.enabled = false
        settings.main.targetFunction = "1 +"
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.sideStates.main.state).toBe("disabled")
        expect(snapshot.targetError).toBeNull()
        expect(snapshot.total).not.toBeNull()
    })

    it("启用段按主控 → 协战顺序取第一个表达式错误", () => {
        const settings = teamSettings()
        // 两段用文本不同的错误（缺少操作数 / 找不到标识符），能判别取的是哪一段
        settings.main.targetFunction = "1 +"
        settings.assist1.targetFunction = "foo_bar_xyz"
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.main?.error).toContain("缺少操作数")
        expect(snapshot.assist1?.error).toContain("foo_bar_xyz")
        expect(snapshot.targetError).toBe(snapshot.main?.error)
        expect(snapshot.targetError).not.toContain("foo_bar_xyz")
        expect(snapshot.total).toBeNull()
        expect(snapshot.totalError).toBe(snapshot.targetError)
    })

    it("主控禁用时错误改取协战段", () => {
        const settings = teamSettings()
        settings.main.enabled = false
        settings.assist1.targetFunction = "1 +"
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.sideStates.assist1.state).toBe("invalid")
        expect(snapshot.targetError).toBe(snapshot.assist1?.error)
        expect(snapshot.total).toBeNull()
        expect(getModeResult(snapshot, "total").state).toBe("invalid")
    })

    it("三段全部禁用时合计视图保持空态（不区分 disabled 的产品口径待定）", () => {
        const settings = teamSettings()
        settings.main.enabled = false
        settings.assist1.enabled = false
        settings.assist2.enabled = false
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect([snapshot.main, snapshot.assist1, snapshot.assist2]).toEqual([null, null, null])
        expect(snapshot.sideStates.main.state).toBe("disabled")
        expect(snapshot.sideStates.assist1.state).toBe("disabled")
        expect(snapshot.sideStates.assist2.state).toBe("disabled")
        expect(snapshot.total).toBeNull()
        expect(snapshot.totalError).toBeNull()
        expect(snapshot.targetError).toBeNull()
        expect(getModeResult(snapshot, "total")).toMatchObject({ mode: "total", active: false, damage: null, error: null, state: "empty" })
    })

    it("唯一启用段无法计算时合计状态为 failed（不显示未启用）", () => {
        const settings = teamSettings()
        // 合法表达式但求值溢出为 Infinity：构建成功、该段 failed
        const huge = "9".repeat(200)
        settings.main.targetFunction = `${huge} * ${huge}`
        settings.assist1.enabled = false
        settings.assist2.enabled = false
        const snapshot = computeTranscendTeamSnapshot(settings)
        expect(snapshot.sideStates.main.state).toBe("failed")
        expect(snapshot.sideStates.assist1.state).toBe("disabled")
        expect(snapshot.sideStates.assist2.state).toBe("disabled")
        expect(snapshot.main).toBeNull()
        expect(snapshot.total).toBeNull()
        expect(snapshot.totalError).toBeNull()
        expect(getModeResult(snapshot, "total")).toMatchObject({ mode: "total", active: false, damage: null, error: null, state: "failed" })
    })

    it("旧设置（顶层全局表达式）三段沿用同一表达式", () => {
        const base = mainCharSettings()
        const legacy = {
            main: { ...base.main },
            assist1: { ...base.main, enabled: true },
            assist2: { ...base.main, enabled: false },
            transcend: base.transcend,
            targetFunction: "攻击!",
            customVariables: [] as [string, string][],
        }
        for (const loadout of [legacy.main, legacy.assist1, legacy.assist2]) {
            delete (loadout as Partial<TranscendSideLoadout>).targetFunction
            delete (loadout as Partial<TranscendSideLoadout>).customVariables
        }
        const snapshot = computeTranscendTeamSnapshot(legacy as unknown as TranscendBuildSettings)
        expect(snapshot.main!.build.build.targetFunction).toBe("攻击!")
        expect(snapshot.assist1!.build.build.targetFunction).toBe("攻击!")
        expect(snapshot.main!.damage).toBeCloseTo(snapshot.main!.build.build.calculateAttributes().攻击, 6)
    })
})

describe("分享页 / 构筑页太古红星口径", () => {
    /** 专属词条透传 ancient 的旧数据 / 导入物品 */
    const item: TranscendGearItemConfig = {
        kind: "unique",
        slotType: 1,
        equipBaseScore: 50,
        uniqueId: 1001,
        uniqueAffix: { affixId: UNIQUE_AFFIX, rollLevel: 1, masterworkLevel: 0, ancient: true, finalMasterwork: false },
        affixes: [
            { affixId: HELMET_AFFIX, rollLevel: 1, masterworkLevel: 0, ancient: true, finalMasterwork: false, source: "base" },
            { affixId: CRAFT_AFFIX, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
        ],
    }

    it("专属行不再排除太古（旧 Lua 只排除 base）；基础行仍不显示红星", () => {
        const lines = getItemAffixLines(item, 1)
        const uniqueLine = lines.find(line => line.source === "unique")!
        const baseLine = lines.find(line => line.source === "base")!
        expect(uniqueLine.ancient).toBe(true)
        expect(baseLine.ancient).toBe(true)
        expect(isAncientGearLine(uniqueLine)).toBe(true)
        expect(isAncientGearLine(baseLine)).toBe(false)
        // 词条行按 Forge 叠图渲染太古层；图标口径同样计入
        expect(getGearLineMarkState(uniqueLine)).toMatchObject({ ancient: true, forge: true, pointStyle: 1 })
        expect(isAncientGearIconLine(uniqueLine)).toBe(true)
        expect(lines.some(isAncientGearIconLine)).toBe(true)
    })

    it("太古随机行不显示强度区间；非太古随机行显示区间", () => {
        const ancientRandom: TranscendGearItemConfig = {
            kind: "normal",
            slotType: 1,
            equipBaseScore: 50,
            affixes: [{ affixId: CRAFT_AFFIX, rollLevel: 1, masterworkLevel: 0, ancient: true, finalMasterwork: false, source: "random" }],
        }
        expect(getItemAffixLines(ancientRandom, 1)[0].rangeText).toBe("")
        expect(getItemAffixLines(item, 1).find(line => line.source === "random")!.rangeText).not.toBe("")
    })
})

describe("升华 BUFF 选项", () => {
    it("排除魔之楔提供与魔灵 / 潜质相关 BUFF，自定义 BUFF 保留", () => {
        const options = getTranscendBuffOptions(mainCharSettings())
        for (const option of options) expect(isModProvidedBuff(option.buff), option.name).toBe(false)
        expect(options.some(option => option.name === "全盛·振奋")).toBe(false)
        expect(options.some(option => option.name === "魔灵潜质:凶猛")).toBe(false)
        expect(options.some(option => option.name === "自定义BUFF")).toBe(true)
    })

    it("协战角色限定的 BUFF 也可选（三侧上下文）", () => {
        const settings = mainCharSettings()
        settings.assist1 = { ...settings.assist1, charId: 1801, enabled: true, baseName: "风花飞旋" }
        const names = getTranscendBuffOptions(settings).map(option => option.name)
        expect(names).toContain("菲娜Q")
        expect(getTranscendBuffOptions(mainCharSettings()).map(option => option.name)).not.toContain("菲娜Q")
    })

    it("已选等级与覆盖率从设置回填；主控接收队友来源、协战不接收", () => {
        const settings = mainCharSettings()
        settings.assist1 = { ...settings.assist1, charId: 1801, enabled: true, baseName: "风花飞旋" }
        settings.buffs = [["菲娜Q", 7, 0.5]]
        const option = getTranscendBuffOptions(settings).find(item => item.name === "菲娜Q")
        expect(option).toMatchObject({ lv: 7, coverage: 0.5 })
        const contexts = createTranscendBuffContexts(settings)
        expect(contexts.sides.main.phantomIds.has(1801)).toBe(true)
        expect(contexts.sides.assist1.phantomIds.size).toBe(0)
        expect(contexts.selectable.mainIds.has(1801)).toBe(true)
    })
})

describe("告警本地化", () => {
    it("已知数据层模板走 i18n 键，未知文案原样返回", () => {
        const calls: { key: string; options?: Record<string, string> }[] = []
        const translate = (key: string, options?: Record<string, string>) => {
            calls.push({ key, options })
            return `${key}|${JSON.stringify(options)}`
        }
        expect(localizeTranscendWarning("装备位 9 不属于 main 分组，已忽略", translate)).toContain("warn_slot_group")
        expect(calls[0].options).toEqual({ slot: "9", side: "main" })
        expect(localizeTranscendWarning("词条 1001 不存在，已忽略", translate)).toContain("warn_affix_missing")
        expect(localizeTranscendWarning("未知文案", translate)).toBe("未知文案")
    })
})

describe("天赋默认可达口径", () => {
    it("页面默认构筑只包含当前开放阶段（阶段一 100 节点）", () => {
        const settings = getDefaultTranscendBuildSettings(1101)
        expect(settings.transcend.enabled).toBe(true)
        expect(settings.transcend.talentLevels).toHaveLength(100)
        const stageIds = new Set(settings.transcend.talentLevels.map(([id]) => talents.find(talent => talent.id === id)!.stageId))
        expect(stageIds).toEqual(new Set(stages.map(stage => stage.id)))
        expect(settings.transcend.talentLevels).not.toEqual(createMaxedTranscendTalentLevels())
    })

    it("全部解锁默认只到阶段一，并保留已有未开放阶段投入", () => {
        const reachable = createMaxedReachableTalentLevels()
        expect(mergeUnlockedTalentLevels([], reachable)).toEqual(reachable)
        const withTheory = mergeUnlockedTalentLevels([[100101, 1]], reachable)
        expect(withTheory).toHaveLength(reachable.length + 1)
        expect(withTheory.find(([id]) => id === 100101)?.[1]).toBe(1)
        expect(mergeUnlockedTalentLevels([], [])).toEqual([])
    })

    it("理论开关开启后全部解锁为 300 节点", () => {
        const theory = mergeUnlockedTalentLevels([], createMaxedTranscendTalentLevels())
        expect(theory).toHaveLength(300)
        expect(theory).toHaveLength(talents.length)
    })

    it("全部解锁 view 分支：理论开关 off → 可达 100；on → 理论 300；off 时保留阶段二投入", () => {
        expect(getUnlockAllTalentLevels([], false)).toEqual(createMaxedReachableTalentLevels())
        expect(getUnlockAllTalentLevels([], true)).toHaveLength(300)
        const merged = getUnlockAllTalentLevels([[100101, 1]], false)
        expect(merged).toHaveLength(createMaxedReachableTalentLevels().length + 1)
        expect(merged.find(([id]) => id === 100101)?.[1]).toBe(1)
    })

    it("当前查看阶段的 unreleased 被抑制，unreachable 保留", () => {
        const withStageTwo = [...createMaxedReachableTalentLevels(), [100101, 1] as [number, number]]
        expect(getVisibleTalentStageWarnings(withStageTwo, 1)).toEqual([{ stageId: 2, reason: "unreleased" }])
        expect(getVisibleTalentStageWarnings(withStageTwo, 2)).toEqual([])
        expect(getVisibleTalentStageWarnings([[100101, 1]], 2)).toEqual([{ stageId: 2, reason: "unreachable" }])
    })

    it("页面默认构筑与手动仅阶段一的天赋计算一致", () => {
        const settings = getDefaultTranscendBuildSettings(1101)
        const manualStage1 = talents
            .filter(talent => talent.stageId === 1)
            .map(talent => [talent.id, Math.max(1, Math.round(talent.maxLevel || 1))] as [number, number])
        const manual: TranscendBuildSettings = { ...settings, transcend: { ...settings.transcend, talentLevels: manualStage1 } }
        const damage = (value: TranscendBuildSettings) => createTranscendBuild(value, "main")!.build.calculate()
        expect(damage(manual)).toBeCloseTo(damage(settings), 9)
    })
})

describe("构筑持久化裁剪", () => {
    /** 带展示快照与 per-affix 派生字段的头盔（102 为基础词条、1024 可承载最终精锻） */
    function gearSettings(): TranscendBuildSettings {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [
            {
                slotId: 1,
                item: {
                    kind: "normal",
                    slotType: 1,
                    rarityId: 5,
                    equipBaseScore: 50,
                    iconId: 1001,
                    nameId: 1001,
                    seasonId: 1,
                    nameSnapshot: "强力海蚀头盔",
                    iconSnapshot: "T_Season_010101",
                    affixes: [
                        {
                            affixId: HELMET_AFFIX,
                            rollLevel: 50,
                            masterworkLevel: 10,
                            ancient: false,
                            finalMasterwork: false,
                            source: "base",
                        },
                        { affixId: 1024, rollLevel: 500, masterworkLevel: 10, ancient: true, finalMasterwork: true, source: "random" },
                    ],
                    craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 1, temperingCount: 0, enchantCount: 0 },
                    sockets: [{ socketIndex: 0, gemId: 7001101, nameSnapshot: "宝石名", iconSnapshot: "gem-icon" }],
                },
            },
        ]
        return settings
    }

    /** 从序列化文本里取出装备物品原始形状（不经归一化，直接看落盘内容） */
    function decodeGearItems(text: string): TranscendGearItemConfig[] {
        const root = JSON.parse(text) as {
            settings?: { transcend?: { gearVariants?: unknown[] } }
            transcend?: { gearVariants?: unknown[] }
        }
        const transcend = root.settings?.transcend ?? root.transcend
        const items: TranscendGearItemConfig[] = []
        for (const variant of Array.isArray(transcend?.gearVariants) ? transcend.gearVariants : []) {
            const row = variant as { mainGear?: unknown[]; assist1Gear?: unknown[]; assist2Gear?: unknown[] }
            for (const group of [row.mainGear, row.assist1Gear, row.assist2Gear]) {
                for (const entry of Array.isArray(group) ? group : []) {
                    const equipped = entry as Partial<TranscendEquippedGear>
                    if (equipped.item) items.push(equipped.item)
                }
            }
        }
        return items
    }

    it("存档 / 分享只含源字段：无展示快照与 per-affix 派生字段", () => {
        const settings = gearSettings()
        for (const text of [serializeTranscendBuildSettings(settings), createTranscendBuildShare(settings)]) {
            expect(text).not.toContain("nameSnapshot")
            expect(text).not.toContain("iconSnapshot")
            const items = decodeGearItems(text)
            expect(items).toHaveLength(1)
            expect(items[0].sockets).toEqual([{ socketIndex: 0, gemId: 7001101 }])
            expect(items[0].craft?.masterworkLevel).toBe(10)
            for (const affix of items[0].affixes) {
                expect(affix).not.toHaveProperty("masterworkLevel")
                expect(affix).not.toHaveProperty("finalMasterwork")
                expect(affix).not.toHaveProperty("source")
            }
        }
    })

    /** 收集设置里顶层三组与全部变体的装备物品 */
    function settingsGearItems(transcend: TranscendSettings): TranscendGearItemConfig[] {
        const items: TranscendGearItemConfig[] = []
        const groups = [transcend.mainGear, transcend.assist1Gear, transcend.assist2Gear]
        for (const variant of transcend.gearVariants) groups.push(variant.mainGear, variant.assist1Gear, variant.assist2Gear)
        for (const group of groups) {
            for (const entry of group) if ("item" in entry) items.push(entry.item)
        }
        return items
    }

    /** 去掉展示快照：快照按 §134 不入库，等价性比较时忽略 */
    function withoutGearSnapshots(transcend: TranscendSettings): TranscendSettings {
        const clone = JSON.parse(JSON.stringify(transcend)) as TranscendSettings
        for (const item of settingsGearItems(clone)) {
            delete item.nameSnapshot
            delete item.iconSnapshot
            for (const socket of item.sockets ?? []) {
                delete socket.nameSnapshot
                delete socket.iconSnapshot
            }
        }
        return clone
    }

    it("序列化往返：归一化后与原始设置等价（数值 / 身份一致）", () => {
        const settings = gearSettings()
        const baseline = withoutGearSnapshots(normalizeTranscendBuildSettings(settings).transcend)
        expect(normalizeTranscendBuildSettings(JSON.parse(serializeTranscendBuildSettings(settings))).transcend).toEqual(baseline)
        const share = parseTranscendBuildShare(createTranscendBuildShare(settings))
        expect(share?.charId).toBe(settings.main.charId)
        expect(share?.settings.transcend).toEqual(baseline)
    })
})
