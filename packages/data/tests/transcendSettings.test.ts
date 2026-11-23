import { describe, expect, it } from "vitest"
import {
    createDefaultTranscendBuildSettings,
    createTranscendBuildShare,
    normalizeTranscendBuildSettings,
    parseTranscendBuildShare,
} from "../transcendBuild"
import type { TranscendGearItemConfig } from "../transcendGear"
import {
    addTranscendGearVariant,
    getActiveGearVariant,
    normalizeTranscendSettings,
    removeTranscendGearVariant,
    switchTranscendGearVariant,
    syncActiveGearVariant,
    TRANSCEND_GEAR_VARIANT_MAX_COUNT,
} from "../transcendSettings"

const item = (slotType: number): TranscendGearItemConfig => ({
    kind: "normal",
    slotType,
    affixes: [],
    craft: { masterworkLevel: 0, temperingCount: 0, enchantCount: 0 },
})
const equipped = (slotId: number, slotType: number) => ({ slotId, item: item(slotType) })

describe("装备变体", () => {
    it("默认是变体 A（唯一一份、无装备）", () => {
        const transcend = createDefaultTranscendBuildSettings(1101).transcend
        expect(transcend.gearVariants).toEqual([{ id: "A", mainGear: [], assist1Gear: [], assist2Gear: [] }])
        expect(transcend.activeGearVariant).toBe("A")
        expect(getActiveGearVariant(transcend)?.id).toBe("A")
    })

    it("追加变体以当前装备为模板并切换过去，最多三份", () => {
        const transcend = createDefaultTranscendBuildSettings(1101).transcend
        transcend.mainGear = [equipped(1, 1)]
        transcend.assist1Gear = [equipped(9, 8)]
        transcend.assist2Gear = [equipped(13, 8)]
        syncActiveGearVariant(transcend)

        expect(addTranscendGearVariant(transcend)).toBe("B")
        expect(transcend.activeGearVariant).toBe("B")
        expect(transcend.gearVariants).toHaveLength(2)
        expect(transcend.gearVariants[1].mainGear).toEqual(transcend.mainGear)
        expect(transcend.gearVariants[1].mainGear).not.toBe(transcend.gearVariants[0].mainGear)
        expect(transcend.gearVariants[1].assist1Gear).not.toBe(transcend.gearVariants[0].assist1Gear)
        expect(transcend.gearVariants[1].assist2Gear).not.toBe(transcend.gearVariants[0].assist2Gear)

        expect(addTranscendGearVariant(transcend)).toBe("C")
        expect(transcend.gearVariants).toHaveLength(TRANSCEND_GEAR_VARIANT_MAX_COUNT)
        expect(addTranscendGearVariant(transcend)).toBeNull()
    })

    it("切换只替换装备：角色 / 天赋 / 环境 / 技能等级 / BUFF / 目标表达式 / 自定义变量不变", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.talentLevels = [[100010, 3]]
        settings.assist1 = { ...settings.assist1, charId: 1102, enabled: true }
        settings.main = { ...settings.main, charSkillLevel: [7, 8, 9] }
        settings.buffs = [["助战50攻", 2, 0.5]]
        settings.targetFunction = "角色::攻击 * 2"
        settings.customVariables = [["x", "3 + 4"]]
        settings.transcend.mainGear = [equipped(1, 1)]
        settings.transcend.assist1Gear = [equipped(9, 8)]
        settings.transcend.assist2Gear = [equipped(13, 8)]
        syncActiveGearVariant(settings.transcend)

        expect(addTranscendGearVariant(settings.transcend)).toBe("B")
        settings.transcend.mainGear = [equipped(2, 2)]
        settings.transcend.assist1Gear = []
        settings.transcend.assist2Gear = []
        syncActiveGearVariant(settings.transcend)

        const main = settings.main
        const assist1 = settings.assist1
        const assist2 = settings.assist2
        const talents = settings.transcend.talentLevels
        const enemyId = settings.enemyId
        const buffs = settings.buffs
        const targetFunction = settings.targetFunction
        const customVariables = settings.customVariables
        expect(switchTranscendGearVariant(settings.transcend, "A")).toBe(true)
        expect(settings.transcend.activeGearVariant).toBe("A")
        expect(settings.transcend.mainGear).toEqual([equipped(1, 1)])
        expect(settings.transcend.assist1Gear).toEqual([equipped(9, 8)])
        expect(settings.transcend.assist2Gear).toEqual([equipped(13, 8)])
        expect(settings.main).toBe(main)
        expect(settings.main.charSkillLevel).toEqual([7, 8, 9])
        expect(settings.assist1).toBe(assist1)
        expect(settings.assist2).toBe(assist2)
        expect(settings.transcend.talentLevels).toBe(talents)
        expect(settings.enemyId).toBe(enemyId)
        expect(settings.buffs).toBe(buffs)
        expect(settings.targetFunction).toBe(targetFunction)
        expect(settings.customVariables).toBe(customVariables)

        expect(switchTranscendGearVariant(settings.transcend, "B")).toBe(true)
        expect(settings.transcend.mainGear).toEqual([equipped(2, 2)])
        expect(switchTranscendGearVariant(settings.transcend, "Z")).toBe(false)
    })

    it("激活 id 非法时 syncActiveGearVariant 回退第一份并写回合法 id", () => {
        const transcend = createDefaultTranscendBuildSettings(1101).transcend
        transcend.gearVariants = [{ id: "B", mainGear: [equipped(2, 2)], assist1Gear: [], assist2Gear: [] }]
        transcend.activeGearVariant = "Z"
        transcend.mainGear = [equipped(3, 3)]
        transcend.assist1Gear = []
        transcend.assist2Gear = []
        syncActiveGearVariant(transcend)
        expect(transcend.activeGearVariant).toBe("B")
        expect(transcend.gearVariants[0].mainGear).toEqual([equipped(3, 3)])
    })

    it("删除当前变体回退到相邻变体；最后一份不允许删除", () => {
        const transcend = createDefaultTranscendBuildSettings(1101).transcend
        transcend.mainGear = [equipped(1, 1)]
        syncActiveGearVariant(transcend)
        addTranscendGearVariant(transcend)
        transcend.mainGear = [equipped(2, 2)]
        syncActiveGearVariant(transcend)
        addTranscendGearVariant(transcend)
        transcend.mainGear = [equipped(3, 3)]
        syncActiveGearVariant(transcend)

        expect(removeTranscendGearVariant(transcend, "C")).toBe(true)
        expect(transcend.activeGearVariant).toBe("B")
        expect(transcend.mainGear).toEqual([equipped(2, 2)])
        expect(removeTranscendGearVariant(transcend, "B")).toBe(true)
        expect(transcend.activeGearVariant).toBe("A")
        expect(transcend.mainGear).toEqual([equipped(1, 1)])
        expect(removeTranscendGearVariant(transcend, "A")).toBe(false)
        expect(transcend.gearVariants).toHaveLength(1)
    })

    it("删除非激活变体不影响当前装备", () => {
        const transcend = createDefaultTranscendBuildSettings(1101).transcend
        transcend.mainGear = [equipped(1, 1)]
        syncActiveGearVariant(transcend)
        addTranscendGearVariant(transcend)
        switchTranscendGearVariant(transcend, "A")
        expect(removeTranscendGearVariant(transcend, "B")).toBe(true)
        expect(transcend.activeGearVariant).toBe("A")
        expect(transcend.mainGear).toEqual([equipped(1, 1)])
    })
})

describe("装备变体归一化与分享", () => {
    it("保留全部合法变体与 active；顶层装备是激活变体的权威副本", () => {
        const normalized = normalizeTranscendSettings({
            enabled: true,
            talentLevels: [],
            mainGear: [equipped(1, 1)],
            assist1Gear: [equipped(9, 8)],
            assist2Gear: [equipped(13, 8)],
            gearVariants: [
                { id: "A", mainGear: [equipped(2, 2)], assist1Gear: [], assist2Gear: [] },
                { id: "B", mainGear: [equipped(3, 3)], assist1Gear: [], assist2Gear: [] },
                { id: "B", mainGear: [], assist1Gear: [], assist2Gear: [] },
                { id: "X", mainGear: [], assist1Gear: [], assist2Gear: [] },
            ],
            activeGearVariant: "B",
        })
        expect(normalized.gearVariants.map(variant => variant.id)).toEqual(["A", "B", "C"])
        expect(normalized.activeGearVariant).toBe("B")
        expect(normalized.mainGear).toEqual([equipped(1, 1)])
        expect(normalized.assist1Gear).toEqual([equipped(9, 8)])
        expect(normalized.assist2Gear).toEqual([equipped(13, 8)])
        expect(normalized.gearVariants[1]).toMatchObject({
            mainGear: [equipped(1, 1)],
            assist1Gear: [equipped(9, 8)],
            assist2Gear: [equipped(13, 8)],
        })
        expect(normalized.gearVariants[0].mainGear).toEqual([equipped(2, 2)])
    })

    it("顶层装备为空时以激活变体为准；active 缺失回退第一份", () => {
        const normalized = normalizeTranscendSettings({
            enabled: true,
            gearVariants: [{ id: "B", mainGear: [equipped(2, 2)], assist1Gear: [], assist2Gear: [] }],
            activeGearVariant: "Z",
        })
        expect(normalized.activeGearVariant).toBe("B")
        expect(normalized.mainGear).toEqual([equipped(2, 2)])
    })

    it("按组非空优先：顶层只有 mainGear、变体另有协战装备时不丢装备", () => {
        const normalized = normalizeTranscendSettings({
            enabled: true,
            mainGear: [equipped(1, 1)],
            assist1Gear: [],
            gearVariants: [{ id: "A", mainGear: [], assist1Gear: [equipped(9, 8)], assist2Gear: [equipped(13, 8)] }],
            activeGearVariant: "A",
        })
        expect(normalized.mainGear).toEqual([equipped(1, 1)])
        expect(normalized.assist1Gear).toEqual([equipped(9, 8)])
        expect(normalized.assist2Gear).toEqual([equipped(13, 8)])
        expect(normalized.gearVariants[0]).toMatchObject({
            mainGear: [equipped(1, 1)],
            assist1Gear: [equipped(9, 8)],
            assist2Gear: [equipped(13, 8)],
        })
    })

    it("顶层组非空时权威：同组以顶层为准，变体旧值被覆盖", () => {
        const normalized = normalizeTranscendSettings({
            enabled: true,
            mainGear: [equipped(1, 1)],
            assist1Gear: [equipped(9, 8)],
            assist2Gear: [equipped(13, 8)],
            gearVariants: [
                {
                    id: "A",
                    mainGear: [equipped(2, 2)],
                    assist1Gear: [equipped(10, 9)],
                    assist2Gear: [equipped(14, 9)],
                },
            ],
            activeGearVariant: "A",
        })
        expect(normalized.mainGear).toEqual([equipped(1, 1)])
        expect(normalized.assist1Gear).toEqual([equipped(9, 8)])
        expect(normalized.assist2Gear).toEqual([equipped(13, 8)])
        expect(normalized.gearVariants[0].mainGear).toEqual([equipped(1, 1)])
        expect(normalized.gearVariants[0].assist1Gear).toEqual([equipped(9, 8)])
        expect(normalized.gearVariants[0].assist2Gear).toEqual([equipped(13, 8)])
    })

    it("post-U32b 兼容读取：旧 assistGear 归入协战一、协战二为空，不写回旧字段", () => {
        const normalized = normalizeTranscendSettings({
            enabled: true,
            mainGear: [equipped(1, 1)],
            assistGear: [equipped(9, 8)],
            gearVariants: [{ id: "A", mainGear: [], assistGear: [equipped(10, 9)] }],
            activeGearVariant: "A",
        })
        expect(normalized.mainGear).toEqual([equipped(1, 1)])
        expect(normalized.assist1Gear).toEqual([equipped(9, 8)])
        expect(normalized.assist2Gear).toEqual([])
        expect(normalized.gearVariants[0].assist1Gear).toEqual([equipped(9, 8)])
        expect(normalized.gearVariants[0].assist2Gear).toEqual([])
        expect("assistGear" in normalized).toBe(false)
        expect("assistGear" in normalized.gearVariants[0]).toBe(false)
    })

    it("半写项目加载：缺 gearVariants / 协战装备、非法 active id 归一化为合法变体", () => {
        const normalized = normalizeTranscendSettings({
            enabled: true,
            mainGear: [equipped(1, 1)],
            activeGearVariant: "Z",
        })
        expect(normalized.activeGearVariant).toBe("A")
        expect(normalized.gearVariants).toHaveLength(1)
        expect(normalized.mainGear).toEqual([equipped(1, 1)])
        expect(normalized.assist1Gear).toEqual([])
        expect(normalized.assist2Gear).toEqual([])
        expect(normalized.gearVariants[0]).toMatchObject({
            id: "A",
            mainGear: [equipped(1, 1)],
            assist1Gear: [],
            assist2Gear: [],
        })

        const brokenActive = normalizeTranscendSettings({
            enabled: true,
            gearVariants: [{ id: "B", mainGear: [equipped(2, 2)], assist1Gear: [], assist2Gear: [] }],
            activeGearVariant: 42,
        })
        expect(brokenActive.activeGearVariant).toBe("B")
        expect(brokenActive.mainGear).toEqual([equipped(2, 2)])
    })

    it("命名项目口径：JSON 往返后变体与 active 完整（加载即新形状）", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [equipped(1, 1)]
        syncActiveGearVariant(settings.transcend)
        addTranscendGearVariant(settings.transcend)
        settings.transcend.mainGear = [equipped(2, 2)]
        syncActiveGearVariant(settings.transcend)

        const stored = JSON.parse(JSON.stringify(settings))
        const loaded = normalizeTranscendBuildSettings(stored, undefined, { preserveUnknownIds: true })
        expect(loaded.transcend.gearVariants.map(variant => variant.id)).toEqual(["A", "B"])
        expect(loaded.transcend.activeGearVariant).toBe("B")
        expect(loaded.transcend.gearVariants[0].mainGear).toEqual([equipped(1, 1)])
        expect(loaded.transcend.mainGear).toEqual([equipped(2, 2)])
    })

    it("分享往返带全部变体与 active", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        settings.transcend.mainGear = [equipped(1, 1)]
        syncActiveGearVariant(settings.transcend)
        addTranscendGearVariant(settings.transcend)
        settings.transcend.mainGear = [equipped(2, 2)]
        syncActiveGearVariant(settings.transcend)

        const parsed = parseTranscendBuildShare(createTranscendBuildShare(settings))!
        expect(parsed.settings.transcend.gearVariants.map(variant => variant.id)).toEqual(["A", "B"])
        expect(parsed.settings.transcend.activeGearVariant).toBe("B")
        expect(parsed.settings.transcend.gearVariants[0].mainGear).toEqual([equipped(1, 1)])
        expect(parsed.settings.transcend.gearVariants[1].mainGear).toEqual([equipped(2, 2)])
        expect(parsed.settings.transcend.mainGear).toEqual([equipped(2, 2)])
    })

    it("分享往返：淬炼与随机词条同 id 的两行（无来源持久化形状）完整保留", () => {
        const settings = createDefaultTranscendBuildSettings(1101)
        settings.transcend.enabled = true
        // 厚重海蚀护符：基础生命 108 + 随机 1501 防御 / 1502 生命 + 淬炼 1502 生命 + 专属 240101
        const screenshotItem: TranscendGearItemConfig = {
            kind: "unique",
            slotType: 9,
            uniqueId: 210001,
            uniqueAffix: { affixId: 240101, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "unique" },
            rarityId: 10,
            equipBaseScore: 50,
            affixes: [
                { affixId: 108, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "base" },
                { affixId: 1501, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
                { affixId: 1502, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "random" },
                { affixId: 1502, rollLevel: 500, masterworkLevel: 0, ancient: false, finalMasterwork: false, source: "tempering" },
            ],
            craft: { masterworkLevel: 0, temperingAffixIndex: 3, temperingCount: 1, enchantCount: 0 },
        }
        settings.transcend.assist1Gear = [{ slotId: 10, item: screenshotItem }]
        syncActiveGearVariant(settings.transcend)

        // 持久化形状不含 source：读回时必须靠 craft 淬炼下标把第二条 1502 归为淬炼而不是去重丢弃
        const shareText = createTranscendBuildShare(settings)
        const stored = JSON.parse(shareText)
        expect(
            stored.settings.transcend.gearVariants[0].assist1Gear[0].item.affixes.every(
                (roll: { source?: string }) => roll.source === undefined
            )
        ).toBe(true)
        const parsed = parseTranscendBuildShare(shareText)!
        const gearItem = (parsed.settings.transcend.assist1Gear[0] as { item: TranscendGearItemConfig }).item
        expect(gearItem.affixes.map(entry => [entry.affixId, entry.source])).toEqual([
            [108, "base"],
            [1501, "random"],
            [1502, "random"],
            [1502, "tempering"],
        ])
        expect(gearItem.craft?.temperingAffixIndex).toBe(3)
        expect(gearItem.craft?.temperingCount).toBe(1)
        expect(gearItem.uniqueAffix?.affixId).toBe(240101)
    })
})
