import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
    buildTranscendTeamSides,
    CharBuildTimeline,
    type CharSettings,
    charMap,
    createDefaultCharSettings,
    createMaxedReachableTalentLevels,
    LeveledBuff,
    normalizeCharSettings,
    serializeCharSettings,
    serializeCharSettingsForShare,
    TRANSCEND_BUFF_SOURCE,
    type TranscendGearAffixRoll,
    type TranscendGearEntry,
    type TranscendGearItemConfig,
    type TranscendSettings,
    talents,
} from "@/data"
import { createAssistBuildFromSettings, createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { computeCharTeamSnapshot } from "@/utils/char-team"
import {
    collectDerivedBuffEntries,
    createDerivedBuffSourceResolver,
    createTranscendEditorSettings,
    createTranscendGainContext,
    DERIVED_BUFF_GEAR_LABEL_KEY,
    DERIVED_BUFF_TALENT_LABEL_KEY,
    getDerivedBuffRenderKey,
    getDerivedBuffSlotName,
    mergeSharedCharSettings,
    resolveMainTranscendInjection,
} from "@/utils/transcend-gear/gain-context"
import { calculateSnapshotDamage } from "@/utils/transcend-gear/income-core"

const MAIN_ID = 1101
const ASSIST1_ID = 1102
const ASSIST2_ID = 1103
const MELEE_WEAPON = 10302
const ASSIST1_WEAPON = 10302
const ASSIST2_WEAPON = 20102

/**
 * 读取角色技能名。
 * @param charId 角色 id
 * @param index 技能索引
 * @returns 技能名称
 */
function charSkillName(charId: number, index = 0): string {
    const name = charMap.get(charId)?.技能?.[index]?.名称
    if (!name) throw new Error(`角色 ${charId} 缺少第 ${index} 个技能`)
    return name
}

/** 构造一条升华装备词条（默认最低档位） */
function gear(patch: Partial<TranscendGearEntry> & Pick<TranscendGearEntry, "slotId" | "affixId">): TranscendGearEntry {
    return { rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, ...patch }
}

/** 主控 + 两条协战的完整配置（升华默认关闭） */
function createTeamSettings(): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(MAIN_ID, 1)
    settings.charSkillLevel = [10, 10, 10]
    // 本文件验证升华 / 装备注入口径：关闭溯源，避免默认满溯的派生 BUFF 混淆断言
    settings.traceLevel = 0
    settings.meleeWeapon = MELEE_WEAPON
    settings.targetFunction = "伤害"
    settings.team1 = ASSIST1_ID
    settings.team1Weapon = ASSIST1_WEAPON
    settings.assist1 = {
        ...settings.assist1,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        traceLevel: 0,
        baseName: charSkillName(ASSIST1_ID),
        targetFunction: "伤害",
        enabled: true,
    }
    settings.team2 = ASSIST2_ID
    settings.team2Weapon = ASSIST2_WEAPON
    settings.assist2 = {
        ...settings.assist2,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        traceLevel: 0,
        baseName: charSkillName(ASSIST2_ID),
        targetFunction: "伤害",
        enabled: true,
    }
    return normalizeCharSettings(settings)
}

/**
 * 启用升华并覆写配置。
 * @param settings 角色配置
 * @param patch 升华配置覆盖项
 * @returns 同一份配置
 */
function enableTranscend(settings: CharSettings, patch: Partial<TranscendSettings> = {}): CharSettings {
    settings.transcend = { ...settings.transcend, enabled: true, ...patch }
    return settings
}

/**
 * 按页面口径计算三人快照（主控构筑由工厂构造，含主控升华注入）。
 * @param settings 角色配置
 * @returns 三人快照
 */
function snapshotOf(settings: CharSettings) {
    return computeCharTeamSnapshot({
        settings,
        charId: MAIN_ID,
        mainBuild: createCharBuildFromSettings(MAIN_ID, settings),
    })
}

describe("原构筑页升华接入（U91b）", () => {
    it("协战只吃自己组装备：不吃主控装备与天赋，也不吃另一协战的装备", () => {
        const base = snapshotOf(createTeamSettings())
        const geared = snapshotOf(
            enableTranscend(createTeamSettings(), {
                talentLevels: [[100001, 1]],
                mainGear: [gear({ slotId: 3, affixId: 101 })],
                assist1Gear: [gear({ slotId: 9, affixId: 1506 })],
                assist2Gear: [gear({ slotId: 13, affixId: 1506 })],
            })
        )

        // 主控：天赋 + 主控装备进入面板；协战装备不进入
        expect(geared.main!.build.calculateAttributes().攻击).toBeGreaterThan(base.main!.build.calculateAttributes().攻击)
        // 协战一：只吃自己组装备
        expect(geared.assist1!.build.calculateAttributes().技能威力).toBeGreaterThan(base.assist1!.build.calculateAttributes().技能威力)
        // 协战二不受协战一装备影响（同一协战二配置，去掉协战一装备后数值不变）
        const assist2Only = snapshotOf(
            enableTranscend(createTeamSettings(), {
                talentLevels: [[100001, 1]],
                mainGear: [gear({ slotId: 3, affixId: 101 })],
                assist2Gear: [gear({ slotId: 13, affixId: 1506 })],
            })
        )
        expect(geared.assist2!.build.calculateAttributes().技能威力).toBeCloseTo(
            assist2Only.assist2!.build.calculateAttributes().技能威力,
            9
        )
        // 协战不吃天赋
        expect(geared.assist1!.build.skillLevel).toEqual([10, 10, 10])
        expect(geared.assist2!.build.calculateAttributes().攻击).toBeCloseTo(base.assist2!.build.calculateAttributes().攻击, 9)
    })

    it("关闭总开关即使配置了装备 / 天赋也回到未启用数值", () => {
        const base = snapshotOf(createTeamSettings())
        const configured = createTeamSettings()
        configured.transcend = {
            ...configured.transcend,
            enabled: false,
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 101 })],
            assist1Gear: [gear({ slotId: 9, affixId: 1506 })],
        }
        const disabled = snapshotOf(configured)

        expect(disabled.main!.build.calculateAttributes()).toEqual(base.main!.build.calculateAttributes())
        expect(disabled.assist1!.build.calculateAttributes()).toEqual(base.assist1!.build.calculateAttributes())
        expect(disabled.assist2!.build.calculateAttributes()).toEqual(base.assist2!.build.calculateAttributes())
        expect(disabled.main!.damage).toBeCloseTo(base.main!.damage!, 9)
        expect(disabled.assist1!.damage).toBeCloseTo(base.assist1!.damage!, 9)
    })

    it("分享序列化只带激活变体且 < 20,000 字符；读取后装备与开关还原", () => {
        const settings = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 1038 }), gear({ slotId: 1, affixId: 102 })],
            assist1Gear: [gear({ slotId: 9, affixId: 1506 })],
            assist2Gear: [gear({ slotId: 13, affixId: 1506 })],
        })
        settings.transcend.gearVariants = [
            {
                id: "A",
                mainGear: settings.transcend.mainGear,
                assist1Gear: settings.transcend.assist1Gear,
                assist2Gear: settings.transcend.assist2Gear,
            },
            {
                id: "B",
                mainGear: [gear({ slotId: 3, affixId: 1038 })],
                assist1Gear: [],
                assist2Gear: [],
            },
        ]

        const shared = serializeCharSettingsForShare(settings)
        expect(shared.length).toBeLessThan(20_000)
        // 本地存档仍保留全部变体（与分享口径分离）
        expect(serializeCharSettings(settings).length).toBeGreaterThan(shared.length)

        const restored = normalizeCharSettings(JSON.parse(shared))
        expect(restored.transcend.enabled).toBe(true)
        expect(restored.transcend.talentLevels).toEqual([[100001, 1]])
        expect(restored.transcend.activeGearVariant).toBe("A")
        expect(restored.transcend.gearVariants).toHaveLength(1)
        expect(restored.transcend.mainGear.map(entry => entry.slotId).sort()).toEqual([1, 3])
        expect(restored.transcend.assist1Gear).toHaveLength(1)
        expect(restored.transcend.assist2Gear).toHaveLength(1)
    })

    it("剪贴板完整序列化保留全部变体；分享序列化仍只保留激活变体", () => {
        const settings = enableTranscend(createTeamSettings(), {
            mainGear: [gear({ slotId: 3, affixId: 101 })],
            assist1Gear: [gear({ slotId: 9, affixId: 1506 })],
        })
        settings.transcend.gearVariants = [
            {
                id: "A",
                mainGear: settings.transcend.mainGear,
                assist1Gear: settings.transcend.assist1Gear,
                assist2Gear: settings.transcend.assist2Gear,
            },
            { id: "B", mainGear: [gear({ slotId: 3, affixId: 1038 })], assist1Gear: [], assist2Gear: [] },
            { id: "C", mainGear: [gear({ slotId: 6, affixId: 1040 })], assist1Gear: [], assist2Gear: [] },
        ]

        // 本地复制 → 粘贴（无服务端 20,000 上限）：三份变体与激活项完整还原
        const clipboard = normalizeCharSettings(JSON.parse(serializeCharSettings(settings)))
        expect(clipboard.transcend.gearVariants.map(variant => variant.id)).toEqual(["A", "B", "C"])
        expect(clipboard.transcend.activeGearVariant).toBe("A")
        expect(clipboard.transcend.gearVariants[1].mainGear).toHaveLength(1)
        expect(clipboard.transcend.gearVariants[2].mainGear).toHaveLength(1)
        expect(clipboard.transcend.mainGear).toHaveLength(1)

        // 对外分享仍只带激活变体
        const shared = normalizeCharSettings(JSON.parse(serializeCharSettingsForShare(settings)))
        expect(shared.transcend.gearVariants).toHaveLength(1)
        expect(shared.transcend.activeGearVariant).toBe("A")
    })

    it("载入旧分享（无 transcend 字段）保留本地升华配置；新分享按分享内容", () => {
        const local = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 3, affixId: 101 })],
        })
        const legacyShare = { ...createTeamSettings(), transcend: undefined }
        const merged = mergeSharedCharSettings(legacyShare, local.transcend)
        expect(merged.transcend.enabled).toBe(true)
        expect(merged.transcend.talentLevels).toEqual([[100001, 1]])
        expect(merged.transcend.mainGear).toHaveLength(1)

        const sharedWithTranscend = createTeamSettings()
        sharedWithTranscend.transcend = { ...sharedWithTranscend.transcend, enabled: false }
        const adopted = mergeSharedCharSettings(sharedWithTranscend, local.transcend)
        expect(adopted.transcend.enabled).toBe(false)
        expect(adopted.transcend.mainGear).toHaveLength(0)
    })
})

describe("宿主收益上下文（U91b）", () => {
    it("缓存键稳定且覆盖设置 / charId / 数据包 / 背包特效等级 / 时间线", () => {
        const settings = enableTranscend(createTeamSettings(), { mainGear: [gear({ slotId: 3, affixId: 101 })] })
        const timeline = new CharBuildTimeline("循环", [{ track: 0, name: "A", time: 0, duration: 1, lv: 10 }])
        const keyOf = (patch: Partial<Parameters<typeof createTranscendGainContext>[0]> = {}) =>
            createTranscendGainContext({ settings, charId: MAIN_ID, dataPackKey: "pack-a", timeline, ...patch }).key
        const inv = { buffLv: { 2: 3, 1: 2 }, wLv: { 10: 5 } }
        const first = keyOf({ inv })
        // 同一输入（背包键插入顺序不同）→ 同键
        expect(keyOf({ inv: { buffLv: { 1: 2, 2: 3 }, wLv: { 10: 5 } } })).toBe(first)
        // 任一输入变化 → 键变化
        expect(keyOf({ inv, charId: ASSIST1_ID })).not.toBe(first)
        expect(keyOf({ inv: { buffLv: { 2: 4, 1: 2 }, wLv: { 10: 5 } } })).not.toBe(first)
        expect(keyOf({ inv, timeline: new CharBuildTimeline("循环", [{ track: 0, name: "A", time: 0, duration: 1, lv: 9 }]) })).not.toBe(
            first
        )
        expect(keyOf({ inv, dataPackKey: "pack-b" })).not.toBe(first)
        const modChanged = { ...settings, charMods: [[31524, 10]] as [number, number][] } as CharSettings
        expect(createTranscendGainContext({ settings: modChanged, charId: MAIN_ID, dataPackKey: "pack-a" }).key).not.toBe(first)
    })

    it("主控快照按宿主完整构筑构造：带装备高于清空该槽，与页面构筑一致", () => {
        const settings = enableTranscend(createTeamSettings(), { mainGear: [gear({ slotId: 3, affixId: 101 })] })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const withGear = context.buildSnapshot("main")!
        const withoutGear = context.buildSnapshot("main", [])!
        const pageBuild = createCharBuildFromSettings(MAIN_ID, settings)

        expect(withGear).not.toBeNull()
        expect(withoutGear).not.toBeNull()
        expect(calculateSnapshotDamage(withGear).damage).toBeCloseTo(pageBuild.calculate(), 8)
        expect(calculateSnapshotDamage(withGear).damage!).toBeGreaterThan(calculateSnapshotDamage(withoutGear).damage!)
    })

    it("协战快照只构造该协战，与协战工厂同值", () => {
        const settings = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            assist1Gear: [gear({ slotId: 9, affixId: 1506 })],
        })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const snapshot = context.buildSnapshot("assist1")!
        const assist = createAssistBuildFromSettings(settings, "assist1")!

        expect(snapshot).not.toBeNull()
        expect(calculateSnapshotDamage(snapshot).damage).toBeCloseTo(assist.calculate(), 8)
    })

    it("目标表达式非法时该侧返回 null（界面显示占位而不是 0%）", () => {
        const settings = enableTranscend(createTeamSettings())
        settings.targetFunction = "1 +"
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        expect(context.buildSnapshot("main")).toBeNull()
    })
})

describe("编辑器宿主 facade（U91b）", () => {
    it("主控取宿主角色 / loadout；协战取 teamN + teamNWeapon，无角色时停用", () => {
        const settings = createTeamSettings()
        const facade = createTranscendEditorSettings(settings, MAIN_ID)

        expect(facade.main.charId).toBe(MAIN_ID)
        expect(facade.main.meleeWeapon).toBe(settings.meleeWeapon)
        expect(facade.main.charLevel).toBe(settings.charLevel)
        expect(facade.main.enabled).toBe(true)
        expect(facade.assist1.charId).toBe(ASSIST1_ID)
        expect(facade.assist1.meleeWeapon).toBe(ASSIST1_WEAPON)
        expect(facade.assist1.rangedWeapon).toBe(0)
        expect(facade.assist1.meleeWeaponLevel).toBe(settings.assist1.weaponLevel)
        expect(facade.assist1.enabled).toBe(true)
        expect(facade.assist2.charId).toBe(ASSIST2_ID)
        expect(facade.assist2.rangedWeapon).toBe(ASSIST2_WEAPON)
        expect(facade.assist2.meleeWeapon).toBe(0)
        expect(facade.assist2.enabled).toBe(true)
        // joint / 环境镜像宿主配置，装备相对收益 facade 与页面同口径
        expect(facade.transcend).toBe(settings.transcend)
        expect(facade.buffs).toBe(settings.buffs)
        expect(facade.enemyId).toBe(settings.enemyId)
        expect(facade.hpPercent).toBe(settings.hpPercent)

        const noAssist = createTeamSettings()
        noAssist.team2 = "-"
        noAssist.assist2.enabled = true
        const emptyFacade = createTranscendEditorSettings(noAssist, MAIN_ID)
        expect(emptyFacade.assist2.charId).toBe(0)
        expect(emptyFacade.assist2.enabled).toBe(false)
    })
})

describe("页面主控注入 helper（U91b-fix）", () => {
    it("与工厂同序同口径：技能等级增量 / BUFF 追加顺序 / 技能替换", () => {
        const plain = createTeamSettings()
        const settings = enableTranscend(createTeamSettings(), {
            talentLevels: [[100001, 1]],
            mainGear: [gear({ slotId: 1, affixId: 310201 }), gear({ slotId: 6, affixId: 1040, ancient: true, finalMasterwork: true })],
        })
        const baseBuffs = createCharBuildFromSettings(MAIN_ID, plain).buffs
        const injection = resolveMainTranscendInjection({
            transcend: settings.transcend,
            charId: MAIN_ID,
            charElement: charMap.get(MAIN_ID)?.属性 ?? "",
            charSkillLevel: settings.charSkillLevel,
            buffs: baseBuffs,
            traceSettings: settings,
        })
        const factory = createCharBuildFromSettings(MAIN_ID, settings)

        expect(injection.skillLevel).toEqual(factory.baseSkillLevel)
        expect(injection.skillLevel).toEqual([10, 10, 10])
        // 技能等级加成随合成 BUFF 注入（属性值由 CharBuild 二次解析），不再单独透传三元组
        expect(factory.skillLevel).toEqual([10, 10, 18])
        expect(injection.buffs.map(buff => [buff.名称, buff.等级])).toEqual(factory.buffs.map(buff => [buff.名称, buff.等级]))
        expect(injection.skillReplacements).toEqual(factory.skillReplacements)
        // 基础 BUFF 保持原顺序在前，升华 BUFF 追加在后
        expect(injection.buffs.slice(0, baseBuffs.length).map(buff => buff.名称)).toEqual(baseBuffs.map(buff => buff.名称))
        expect(injection.buffs[injection.buffs.length - 1].名称).toContain("升华")
    })

    it("关闭总开关时技能等级 / BUFF / 技能替换均不变", () => {
        const settings = createTeamSettings()
        const baseBuffs = createCharBuildFromSettings(MAIN_ID, settings).buffs
        const injection = resolveMainTranscendInjection({
            transcend: settings.transcend,
            charId: MAIN_ID,
            charElement: charMap.get(MAIN_ID)?.属性 ?? "",
            charSkillLevel: settings.charSkillLevel,
            buffs: baseBuffs,
            traceSettings: settings,
        })

        expect(injection.skillLevel).toEqual(settings.charSkillLevel)
        expect(injection.skillLevel).toEqual([10, 10, 10])
        expect(injection.buffs).toEqual(baseBuffs)
        expect(injection.skillReplacements).toEqual({})
    })

    it("带 teamSides 时与工厂一致：跨侧队友 BUFF 进入页面主控", () => {
        const settings = enableTranscend(createTeamSettings(), {
            assist1Gear: [gear({ slotId: 9, affixId: 2015 })],
            assist2Gear: [gear({ slotId: 13, affixId: 2015 })],
        })
        const baseBuffs = createCharBuildFromSettings(MAIN_ID, createTeamSettings()).buffs
        const injection = resolveMainTranscendInjection({
            transcend: settings.transcend,
            charId: MAIN_ID,
            charElement: charMap.get(MAIN_ID)?.属性 ?? "",
            charSkillLevel: settings.charSkillLevel,
            buffs: baseBuffs,
            teamSides: buildTranscendTeamSides(settings, MAIN_ID),
            traceSettings: settings,
        })
        const factory = createCharBuildFromSettings(MAIN_ID, settings)

        expect(injection.buffs.map(buff => [buff.名称, buff.source?.ownerSide])).toEqual(
            factory.buffs.map(buff => [buff.名称, buff.source?.ownerSide])
        )
        expect(injection.buffs.filter(buff => buff.source?.ownerSide)).toHaveLength(2)
    })
})

describe("buff 栏只读派生条目（U93b / U98）", () => {
    /** 构造一条升华派生 BUFF（可指定队友来源侧） */
    function derivedBuff(ownerSide?: "main" | "assist1" | "assist2"): LeveledBuff {
        const buff = new LeveledBuff({ 名称: "升华·激昂号令", attr: { 昂扬: 4.3 } }, 1)
        buff.pt = TRANSCEND_BUFF_SOURCE
        buff.source = { kind: "gear", id: 2015, ownerSide, stackKey: ownerSide ? `team:${ownerSide}:gear` : "gear:9:-:2015:other" }
        return buff
    }

    it("按名称 + 完整来源身份聚合：两个协战各一行，份数 = 1", () => {
        const settings = enableTranscend(createTeamSettings(), {
            assist1Gear: [gear({ slotId: 9, affixId: 2015 })],
            assist2Gear: [gear({ slotId: 13, affixId: 2015 })],
        })
        const build = createCharBuildFromSettings(MAIN_ID, settings)
        const entries = collectDerivedBuffEntries(
            build.buffs,
            settings.buffs.map(buff => buff[0])
        )

        expect(entries.map(entry => [entry.name, entry.labelKey, entry.sourceSide, entry.stacks])).toEqual([
            ["升华·激昂号令", "transcend-build.mode_assist1", "assist1", 1],
            ["升华·激昂号令", "transcend-build.mode_assist2", "assist2", 1],
        ])
    })

    it("同一来源侧重复同名条目聚合为 ×N；自身装备派生用装备标签键", () => {
        const entries = collectDerivedBuffEntries([derivedBuff("assist1"), derivedBuff("assist1"), derivedBuff()], [])
        expect(entries.map(entry => [entry.labelKey, entry.sourceSide, entry.stacks])).toEqual([
            ["transcend-build.mode_assist1", "assist1", 2],
            [DERIVED_BUFF_GEAR_LABEL_KEY, undefined, 1],
        ])
    })

    it("不同装备位 / 宝石孔位的同名 BUFF 分行，同来源身份仍聚合", () => {
        const slot9a = derivedBuff("assist1")
        slot9a.source = { kind: "gear", id: 2015, slotId: 9 }
        const slot9b = derivedBuff("assist1")
        slot9b.source = { kind: "gear", id: 2015, slotId: 9 }
        const slot10 = derivedBuff("assist1")
        slot10.source = { kind: "gear", id: 2015, slotId: 10 }
        const gem0 = derivedBuff("assist1")
        gem0.source = { kind: "gear", id: 3101, slotId: 9, socketIndex: 0 }
        const gem1 = derivedBuff("assist1")
        gem1.source = { kind: "gear", id: 3101, slotId: 9, socketIndex: 1 }

        const entries = collectDerivedBuffEntries([slot9a, slot9b, slot10, gem0, gem1], [])
        expect(entries.map(entry => [entry.sourceSlotId, entry.sourceSocketIndex, entry.stacks])).toEqual([
            [9, undefined, 2],
            [10, undefined, 1],
            [9, 0, 1],
            [9, 1, 1],
        ])
    })

    it("同 id 随机 + 淬炼双行按来源类分行：不同档位各显示各自数值（不是 ×2 只取首行）", () => {
        const roll = (affixId: number, rollLevel: number): TranscendGearAffixRoll => ({
            affixId,
            rollLevel,
            masterworkLevel: 0,
            ancient: false,
            finalMasterwork: false,
        })
        const gloveItem = (affixes: TranscendGearAffixRoll[], temperingAffixIndex?: number): TranscendGearItemConfig => ({
            kind: "normal",
            slotType: 3,
            rarityId: 5,
            equipBaseScore: 50,
            affixes,
            ...(temperingAffixIndex === undefined
                ? {}
                : { craft: { masterworkLevel: 0, temperingAffixIndex, temperingCount: 1, enchantCount: 0 } }),
        })
        const settingsFor = (item: TranscendGearItemConfig) => {
            const settings = createTeamSettings()
            settings.transcend = { ...settings.transcend, enabled: true, mainGear: [{ slotId: 3, item }] }
            return normalizeCharSettings(settings)
        }
        const entriesFor = (item: TranscendGearItemConfig) =>
            collectDerivedBuffEntries(createCharBuildFromSettings(MAIN_ID, settingsFor(item)).buffs, [])
        const attackOf = (entry: { attributes: { name: string; value: number }[] }) =>
            entry.attributes.find(attribute => attribute.name === "攻击")?.value ?? Number.NaN

        const randomEntry = entriesFor(gloveItem([roll(101, 1), roll(1001, 1)])).find(entry => entry.affixId === 1001)!
        const temperingEntry = entriesFor(gloveItem([roll(101, 1), roll(1001, 5)], 1)).find(entry => entry.affixId === 1001)!
        const twinEntries = entriesFor(gloveItem([roll(101, 1), roll(1001, 1), roll(1001, 5)], 2)).filter(entry => entry.affixId === 1001)

        expect(twinEntries).toHaveLength(2)
        expect(twinEntries.map(entry => entry.affixSourceClass)).toEqual(["other", "tempering"])
        expect(attackOf(twinEntries[0])).toBeCloseTo(attackOf(randomEntry), 12)
        expect(attackOf(twinEntries[1])).toBeCloseTo(attackOf(temperingEntry), 12)
        // 两行档位不同：分行比合成 ×2 后的首行数值更完整
        expect(attackOf(twinEntries[0])).not.toBeCloseTo(attackOf(twinEntries[1]), 6)
        expect(new Set(twinEntries.map(entry => getDerivedBuffRenderKey(entry))).size).toBe(2)
    })

    it("resolveSourceName 按来源身份解析具体装备 / 天赋名；缺省时来源名留空", () => {
        const gearBuff = derivedBuff("assist1")
        gearBuff.source = { kind: "gear", id: 2015, slotId: 9, ownerSide: "assist1" }
        const talentBuff = new LeveledBuff({ 名称: "升华·天赋", attr: { 攻击: 1 } }, 1)
        talentBuff.pt = TRANSCEND_BUFF_SOURCE
        talentBuff.source = { kind: "talent", id: 100001 }

        const calls: unknown[] = []
        const entries = collectDerivedBuffEntries([gearBuff, talentBuff], [], {
            resolveSourceName: (source, side) => {
                calls.push([source.kind, source.slotId, side])
                return source.kind === "talent" ? "天赋节点" : "测试头盔"
            },
        })

        expect(entries.map(entry => [entry.sourceKind, entry.sourceName])).toEqual([
            ["gear", "测试头盔"],
            ["talent", "天赋节点"],
        ])
        expect(calls).toEqual([
            ["gear", 9, "assist1"],
            ["talent", undefined, undefined],
        ])
        expect(collectDerivedBuffEntries([gearBuff], []).map(entry => entry.sourceName)).toEqual([undefined])
    })

    it("填充加成属性 / 效果参数 / 建模备注 / 限定", () => {
        const buff = derivedBuff()
        buff.限定 = "火"
        buff.技能 = "月猎|日食"
        buff.tag = ["充盈"]

        const [entry] = collectDerivedBuffEntries([buff], [])
        expect(entry.attributes).toEqual([{ name: "昂扬", value: 4.3 }])
        expect(entry.effect).toEqual({ target: "other-teammates", trigger: "ultimate", duration: -1 })
        expect(entry.note).toContain("仅其他构筑位")
        expect([entry.limited, entry.skill, entry.tags]).toEqual(["火", "月猎|日食", ["充盈"]])
    })

    it("天赋同名不同节点分行，sourceId 进入分组与渲染 key", () => {
        const nodeA = new LeveledBuff({ 名称: "升华天赋·攻击", attr: { 攻击: 0.1 } }, 1)
        nodeA.pt = TRANSCEND_BUFF_SOURCE
        nodeA.source = { kind: "talent", id: 100001 }
        const nodeB = new LeveledBuff({ 名称: "升华天赋·攻击", attr: { 攻击: 0.1 } }, 1)
        nodeB.pt = TRANSCEND_BUFF_SOURCE
        nodeB.source = { kind: "talent", id: 100002 }

        const entries = collectDerivedBuffEntries([nodeA, nodeB], [])
        expect(entries.map(entry => entry.sourceId)).toEqual([100001, 100002])
        expect(new Set(entries.map(entry => getDerivedBuffRenderKey(entry))).size).toBe(2)
    })

    it("同一节点不同效果下标不合并", () => {
        const effectA = new LeveledBuff({ 名称: "升华天赋·攻击", attr: { 攻击: 0.1 } }, 1)
        effectA.pt = TRANSCEND_BUFF_SOURCE
        effectA.source = { kind: "talent", id: 100001, effectIndex: 0 }
        const effectB = new LeveledBuff({ 名称: "升华天赋·攻击", attr: { 攻击: 0.2 } }, 1)
        effectB.pt = TRANSCEND_BUFF_SOURCE
        effectB.source = { kind: "talent", id: 100001, effectIndex: 1 }

        const entries = collectDerivedBuffEntries([effectA, effectB], [])
        expect(entries.map(entry => [entry.sourceId, entry.effectIndex, entry.attributes[0]?.value])).toEqual([
            [100001, 0, 0.1],
            [100001, 1, 0.2],
        ])
        expect(new Set(entries.map(entry => getDerivedBuffRenderKey(entry))).size).toBe(2)
    })

    it("默认全解锁天赋：同名天赋按节点分行且渲染 key 唯一", () => {
        const settings = enableTranscend(createTeamSettings(), { talentLevels: createMaxedReachableTalentLevels() })
        const build = createCharBuildFromSettings(MAIN_ID, settings)
        const entries = collectDerivedBuffEntries(build.buffs, [])
        const talentEntries = entries.filter(entry => entry.sourceKind === "talent")

        expect(talentEntries.length).toBeGreaterThan(0)
        expect(talentEntries.every(entry => entry.sourceId !== undefined)).toBe(true)
        const keys = entries.map(entry => getDerivedBuffRenderKey(entry))
        expect(new Set(keys).size).toBe(keys.length)

        const names = talentEntries.map(entry => entry.name)
        const duplicatedName = names.find(name => names.filter(item => item === name).length > 1)
        expect(duplicatedName, "默认全解锁场景应出现同名天赋节点").toBeTruthy()
        const sameName = talentEntries.filter(entry => entry.name === duplicatedName)
        expect(new Set(sameName.map(entry => entry.sourceId)).size).toBe(sameName.length)
    })

    it("加成属性过滤 0 / 非有限值", () => {
        const zero = new LeveledBuff({ 名称: "升华天赋·防御", attr: { 防御: 0 } }, 1)
        zero.pt = TRANSCEND_BUFF_SOURCE
        zero.source = { kind: "talent", id: 100002 }
        const nan = new LeveledBuff({ 名称: "升华天赋·攻击", attr: { 攻击: Number.NaN } }, 1)
        nan.pt = TRANSCEND_BUFF_SOURCE
        nan.source = { kind: "talent", id: 100003 }

        expect(collectDerivedBuffEntries([zero, nan], []).map(entry => entry.attributes)).toEqual([[], []])
    })

    it("天赋来源解析失败回退天赋标签键", () => {
        const buff = new LeveledBuff({ 名称: "升华天赋·攻击", attr: { 攻击: 0.1 } }, 1)
        buff.pt = TRANSCEND_BUFF_SOURCE
        buff.source = { kind: "talent", id: 100001 }

        const [entry] = collectDerivedBuffEntries([buff], [], { resolveSourceName: () => undefined })
        expect([entry.labelKey, entry.sourceName]).toEqual([DERIVED_BUFF_TALENT_LABEL_KEY, undefined])
    })

    it("手动 BUFF 同名项不算派生；非升华 BUFF 与空构筑返回空", () => {
        const manual = new LeveledBuff({ 名称: "升华·激昂号令", attr: { 昂扬: 4.3 } }, 1)
        expect(collectDerivedBuffEntries([derivedBuff(), manual], ["升华·激昂号令"])).toEqual([])
        expect(collectDerivedBuffEntries([], [])).toEqual([])
    })

    it("卸下来源后派生条目消失（随构筑重建自动增删）", () => {
        const settings = enableTranscend(createTeamSettings(), { assist1Gear: [gear({ slotId: 9, affixId: 2015 })] })
        const withGear = createCharBuildFromSettings(MAIN_ID, settings)
        expect(collectDerivedBuffEntries(withGear.buffs, []).map(entry => entry.sourceSide)).toEqual(["assist1"])

        settings.transcend = { ...settings.transcend, assist1Gear: [] }
        const withoutGear = createCharBuildFromSettings(MAIN_ID, settings)
        expect(collectDerivedBuffEntries(withoutGear.buffs, [])).toEqual([])
    })

    it("main 来源用主控标签；coverage < 1 原样保留给视图", () => {
        const buff = derivedBuff("main")
        buff.coverage = 0.5
        expect(collectDerivedBuffEntries([buff], [])).toEqual([
            {
                name: "升华·激昂号令",
                labelKey: "transcend-build.mode_main",
                sourceSide: "main",
                stacks: 1,
                coverage: 0.5,
                sourceKind: "gear",
                affixId: 2015,
                sourceSlotId: undefined,
                sourceSocketIndex: undefined,
                sourceName: undefined,
                attributes: [{ name: "昂扬", value: 2.15 }],
                description: undefined,
                note: "仅其他构筑位；每名装备者各提供一份，不同来源可叠加，自身不获得",
                effect: { target: "other-teammates", trigger: "ultimate", duration: -1 },
                limited: undefined,
                skill: undefined,
                tags: undefined,
            },
        ])
    })

    it("装备位展示官方槽型名而非编号", () => {
        expect(getDerivedBuffSlotName(1)).toBe("头盔")
        expect(getDerivedBuffSlotName(9)).toBe("护符")
        expect(getDerivedBuffSlotName(16)).toBe("纹饰")
        expect(getDerivedBuffSlotName(0)).toBe("")
    })

    it("派生区只读渲染：auto-fill 网格 / 具体来源 / 详情区，且无编辑事件", () => {
        const source = readFileSync(new URL("../../components/BuffSectionBody.vue", import.meta.url), "utf8")
        const derived = source.slice(source.indexOf("data-derived-buffs"))
        expect(derived).toContain("repeat(auto-fill,minmax(11rem,1fr))")
        expect(derived).toContain("data-derived-buff-source")
        expect(derived).toContain("data-derived-buff-tip-attributes")
        expect(derived).toContain("data-derived-buff-tip-conditions")
        expect(derived).toContain("data-derived-buff-tip-description")
        expect(derived).toContain("data-derived-buff-coverage")
        expect(derived).toContain("char-build.derived_buffs_coverage")
        expect(derived).toContain("$t(buff.labelKey)")
        expect(derived).toContain("slotNameText(buff.sourceSlotId)")
        expect(derived).not.toContain("{ slot: buff.sourceSlotId }")
        expect(derived).not.toContain("toggle")
        expect(derived).not.toContain("set-buff")
    })
})

describe("派生 BUFF 来源名解析（U98）", () => {
    /** 主控 1 号位头盔：基础名「海蚀头盔」+ 前缀「强力」= 强力海蚀头盔；孔 0 镶一级红宝石 */
    const item: TranscendGearItemConfig = {
        kind: "normal",
        slotType: 1,
        iconId: 1001,
        nameId: 1001,
        affixes: [],
        sockets: [{ socketIndex: 0, gemId: 7001101 }],
    }

    /**
     * 构造只带某一构筑位装备的设置。
     * @param slotId 装备位
     * @param side 构筑位
     * @returns 角色配置
     */
    function settingsWithGear(slotId: number, side: "main" | "assist1" | "assist2"): CharSettings {
        const settings = createDefaultCharSettings()
        const group = [{ slotId, item }]
        settings.transcend = {
            ...settings.transcend,
            mainGear: side === "main" ? group : [],
            assist1Gear: side === "assist1" ? group : [],
            assist2Gear: side === "assist2" ? group : [],
        }
        return settings
    }

    const identity = (text: string | undefined | null) => text ?? ""

    it("主控 / 协战装备按构筑位取装备名，跨位不命中", () => {
        const mainResolver = createDerivedBuffSourceResolver(settingsWithGear(1, "main"), identity, "zh-CN")
        expect(mainResolver({ kind: "gear", id: 1001, slotId: 1 })).toBe("强力海蚀头盔")

        const assistResolver = createDerivedBuffSourceResolver(settingsWithGear(9, "assist1"), identity, "zh-CN")
        expect(assistResolver({ kind: "gear", id: 1001, slotId: 9 }, "assist1")).toBe("强力海蚀头盔")
        expect(assistResolver({ kind: "gear", id: 1001, slotId: 1 })).toBeUndefined()

        const assist2Resolver = createDerivedBuffSourceResolver(settingsWithGear(13, "assist2"), identity, "zh-CN")
        expect(assist2Resolver({ kind: "gear", id: 1001, slotId: 13 }, "assist2")).toBe("强力海蚀头盔")
    })

    it("宝石孔位拼宝石名；孔位未命中退回装备名", () => {
        const resolver = createDerivedBuffSourceResolver(settingsWithGear(1, "main"), identity, "zh-CN")
        expect(resolver({ kind: "gear", id: 3101, slotId: 1, socketIndex: 0 })).toBe("强力海蚀头盔 · 一级红宝石")
        expect(resolver({ kind: "gear", id: 3101, slotId: 1, socketIndex: 3 })).toBe("强力海蚀头盔")
    })

    it("天赋按节点 id 取节点名（不附加技术 id）；未知来源返回 undefined", () => {
        const resolver = createDerivedBuffSourceResolver(createDefaultCharSettings(), identity, "zh-CN")
        const talent = talents[0]
        expect(resolver({ kind: "talent", id: talent.id })).toBe(talent.name)
        expect(resolver({ kind: "talent", id: -1 })).toBeUndefined()
        expect(resolver({ kind: "gear", id: 1001 })).toBeUndefined()
    })

    it("安全模式 / 畸形装备不抛错，回退 undefined", () => {
        const emptyResolver = createDerivedBuffSourceResolver(createDefaultCharSettings(), identity, "zh-CN")
        expect(emptyResolver({ kind: "gear", id: 1001, slotId: 1 })).toBeUndefined()

        const settings = createDefaultCharSettings()
        settings.transcend = {
            ...settings.transcend,
            mainGear: [{ slotId: 1, item: null as unknown as TranscendGearItemConfig }],
        }
        const malformedResolver = createDerivedBuffSourceResolver(settings, identity, "zh-CN")
        expect(() => malformedResolver({ kind: "gear", id: 1001, slotId: 1 })).not.toThrow()
        expect(malformedResolver({ kind: "gear", id: 1001, slotId: 1 })).toBeUndefined()
    })
})

describe("U98 派生增益六语言文案", () => {
    const LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"] as const
    const KEYS = [
        "derived_buffs_source",
        "derived_buffs_attributes",
        "derived_buffs_conditions",
        "derived_buffs_description",
        "derived_buffs_slot",
        "derived_buffs_talent",
    ]

    it("六语言新键均存在且非空", () => {
        for (const locale of LOCALES) {
            const bundle = JSON.parse(
                readFileSync(new URL(`../../../public/i18n/${locale}/translation.json`, import.meta.url), "utf8")
            ) as Record<string, Record<string, unknown>>
            for (const key of KEYS) {
                const value = bundle["char-build"]?.[key]
                expect(typeof value, `${locale} ${key}`).toBe("string")
                expect((value as string).length, `${locale} ${key}`).toBeGreaterThan(0)
            }
        }
    })
})
