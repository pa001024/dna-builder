import { describe, expect, it } from "vitest"
import {
    type AssistCharSettings,
    type CharSettingsInput,
    createDefaultAssistSideSettings,
    createDefaultCharSettings,
    createEmptyModVariant,
    MOD_SLOT_COUNTS,
    normalizeAssistSideSettings,
    normalizeCharSettings,
    serializeCharSettings,
    serializeCharSettingsForShare,
} from "../charSettings"
import { affixes, talents } from "../d"
import { charData, weaponNameMap } from "../index"
import { isAffixCompatibleWithSlot } from "../transcend"
import { getSlotBaseAffixId, getSlotMaxInlayCount, getTranscendSlotType, type TranscendEquippedGear } from "../transcendGear"
import {
    createDefaultTranscendSettings,
    createMaxedReachableTalentLevels,
    createMaxedTranscendTalentLevels,
    encodeTranscendSettings,
    isEquippedGear,
    normalizeTranscendSettings,
    TRANSCEND_MAX_AFFIXES_PER_SLOT,
    type TranscendGearEntry,
} from "../transcendSettings"

const CHAR_WITH_SKILLS = charData.find(char => (char.技能?.length ?? 0) > 1)!
const OTHER_CHAR = charData.find(char => char.id !== CHAR_WITH_SKILLS.id && (char.技能?.length ?? 0) > 0)!
const UNKNOWN_CHAR_ID = Math.max(...charData.map(char => char.id)) + 1
const skillName = (skill: { 名称?: string }): string => skill.名称 ?? ""
const FIRST_SKILL = skillName(CHAR_WITH_SKILLS.技能[0])
const SECOND_SKILL = skillName(CHAR_WITH_SKILLS.技能[1])
const OTHER_CHAR_SKILL = skillName(OTHER_CHAR.技能[0])

/** 构造一份带完整协战 loadout 的设置（用于往返与体积测试） */
function createFullSettings() {
    const settings = createDefaultCharSettings()
    settings.baseName = FIRST_SKILL
    settings.team1 = CHAR_WITH_SKILLS.id
    settings.team1Weapon = 10206
    settings.team2 = OTHER_CHAR.id
    settings.team2Weapon = 20102
    const fill = (side: AssistCharSettings, offset: number) => {
        side.charLevel = 70 + offset
        side.charSkillLevel = [12, 11, 10]
        side.baseName = skillName(CHAR_WITH_SKILLS.技能[offset % 2])
        side.extraMastery = "长柄"
        side.weaponLevel = 79
        side.weaponRefine = 4
        side.targetFunction = "伤害"
        side.customVariables = [
            ["甲", "1+1"],
            ["乙", "攻击*2"],
        ]
        side.dotSettings = { skill: 1, melee: 0.5, ranged: 0, skillweapon: 2, forceOwnAdditionalDamage: true }
        side.enabled = true
        side.auraMod = 31524
        side.charMods = Array.from({ length: MOD_SLOT_COUNTS.角色 }, (_, index) => [50000 + offset * 10 + index, 10] as [number, number])
        side.meleeMods = Array.from({ length: MOD_SLOT_COUNTS.近战 }, (_, index) => [51000 + offset * 10 + index, 10] as [number, number])
        side.rangedMods = Array.from({ length: MOD_SLOT_COUNTS.远程 }, (_, index) => [52000 + offset * 10 + index, 8] as [number, number])
        side.skillWeaponMods = Array.from(
            { length: MOD_SLOT_COUNTS.同律 },
            (_, index) => [53000 + offset * 10 + index, 6] as [number, number]
        )
        side.modVariants = [
            {
                中枢: 31524,
                角色: Array.from({ length: MOD_SLOT_COUNTS.角色 }, () => [54000 + offset, 5] as [number, number]),
                近战: Array.from({ length: MOD_SLOT_COUNTS.近战 }, () => null),
                远程: Array.from({ length: MOD_SLOT_COUNTS.远程 }, () => null),
                同律: Array.from({ length: MOD_SLOT_COUNTS.同律 }, () => null),
            },
        ]
        side.modVariantIndex = 1
        side.buffs = [
            ["增益甲", 3],
            ["增益乙", 2, 0.5],
        ]
        side.customBuff = [
            ["攻击", 100],
            ["暴击", 0.25],
        ]
        side.useGlobal = false
        side.effectConfig = { "m:50000": 3, "w:10206": 2 }
    }
    fill(settings.assist1, 1)
    fill(settings.assist2, 2)
    return settings
}

describe("CharSettings 协战 loadout（U88a）", () => {
    it("默认值包含 mainTargetEnabled 与两套协战配置，且键顺序固定", () => {
        const settings = createDefaultCharSettings()
        const keys = Object.keys(settings)

        expect(keys.indexOf("mainTargetEnabled")).toBe(keys.indexOf("targetFunction") + 1)
        expect(keys.indexOf("assist1")).toBe(keys.indexOf("team2BuildVariant") + 1)
        expect(keys.indexOf("assist2")).toBe(keys.indexOf("assist1") + 1)
        expect(keys.indexOf("timelineDPS")).toBe(keys.indexOf("assist2") + 1)
        expect(keys.indexOf("transcend")).toBe(keys.indexOf("timelineDPS") + 1)
        expect(settings.mainTargetEnabled).toBe(true)
        expect(settings.assist1).toEqual(createDefaultAssistSideSettings())
        // 升华默认关闭、无天赋、三组装备为空
        expect(settings.transcend).toEqual(createDefaultTranscendSettings())
        expect(settings.transcend.enabled).toBe(false)
    })

    it("两次默认值互不共享引用（含嵌套数组与对象）", () => {
        const first = createDefaultCharSettings()
        const second = createDefaultCharSettings()

        expect(first.assist1).not.toBe(second.assist1)
        expect(first.assist1.charMods).not.toBe(second.assist1.charMods)
        expect(first.assist1.modVariants).not.toBe(second.assist1.modVariants)
        expect(first.assist1.dotSettings).not.toBe(second.assist1.dotSettings)
        expect(first.assist1.effectConfig).not.toBe(second.assist1.effectConfig)
        expect(first.assist1).not.toBe(first.assist2)
        expect(first.assist1.charMods).not.toBe(first.assist2.charMods)

        first.assist1.charMods[0] = [1234, 5]
        first.assist1.dotSettings.skill = 3
        expect(second.assist1.charMods[0]).toBeNull()
        expect(first.assist2.charMods[0]).toBeNull()
        expect(second.assist1.dotSettings.skill).toBe(0)
    })
})

describe("normalizeCharSettings 协战补齐（U88a）", () => {
    it("旧存档只有 team1/team1Weapon：assist1 补默认并启用，assist2 未配置不启用", () => {
        const settings = normalizeCharSettings({ team1: CHAR_WITH_SKILLS.id, team1Weapon: 10206 })

        expect(settings.assist1.enabled).toBe(true)
        expect(settings.assist1.charLevel).toBe(80)
        expect(settings.assist1.charSkillLevel).toEqual([10, 10, 10])
        expect(settings.assist1.charMods).toHaveLength(MOD_SLOT_COUNTS.角色)
        expect(settings.assist1.meleeMods).toEqual(Array(MOD_SLOT_COUNTS.近战).fill(null))
        expect(settings.assist1.baseName).toBe(FIRST_SKILL)

        expect(settings.assist2.enabled).toBe(false)
        expect(settings.assist2.baseName).toBe("")
        expect(settings.mainTargetEnabled).toBe(true)
    })

    it("旧存档的角色名/武器名格式仍归一化为 id，并同步推断协战启用", () => {
        const weapon = [...weaponNameMap.values()][0]
        const settings = normalizeCharSettings({
            team1: CHAR_WITH_SKILLS.名称,
            team1Weapon: weapon.名称,
        } as unknown as CharSettingsInput)

        expect(settings.team1).toBe(CHAR_WITH_SKILLS.id)
        expect(settings.team1Weapon).toBe(weapon.id)
        expect(settings.assist1.enabled).toBe(true)
    })

    it('team1 为 "-" 时协战不启用且技能名为空', () => {
        const settings = normalizeCharSettings({ team1: "-" })

        expect(settings.assist1.enabled).toBe(false)
        expect(settings.assist1.baseName).toBe("")
        expect(settings.assist2.enabled).toBe(false)
    })

    it("空的/非法的 baseName 回退该角色首个技能，合法技能名保留", () => {
        const fallback = normalizeCharSettings({ team1: CHAR_WITH_SKILLS.id, assist1: { baseName: "  不存在技能  " } })
        expect(fallback.assist1.baseName).toBe(FIRST_SKILL)

        const empty = normalizeCharSettings({ team1: CHAR_WITH_SKILLS.id, assist1: { baseName: "   " } })
        expect(empty.assist1.baseName).toBe(FIRST_SKILL)

        const kept = normalizeCharSettings({ team1: CHAR_WITH_SKILLS.id, assist1: { baseName: ` ${SECOND_SKILL} ` } })
        expect(kept.assist1.baseName).toBe(SECOND_SKILL)

        const otherCharSkill = normalizeCharSettings({
            team1: CHAR_WITH_SKILLS.id,
            assist1: { baseName: OTHER_CHAR_SKILL },
        })
        expect(otherCharSkill.assist1.baseName).toBe(FIRST_SKILL)
    })

    it("嵌套脏数据逐项归一化", () => {
        const dirty = {
            team1: CHAR_WITH_SKILLS.id,
            assist1: {
                charLevel: 120,
                charSkillLevel: 12,
                weaponLevel: 999,
                weaponRefine: -1,
                auraMod: -2,
                charMods: [[1, 2], [3], "x", [4, 5, 6], [Number.NaN, 1]],
                meleeMods: "bad",
                modVariants: [{ 角色: [[1, 2]] }, "bad"],
                modVariantIndex: 99,
                buffs: [["甲", 1, 0.5], ["乙", 2, 1], ["丙", 1], "bad"],
                customBuff: [
                    ["攻击", 0.30000000000000004],
                    ["坏", "x"],
                ],
                effectConfig: { "m:1": 3, "m:2": Number.NaN, "m:3": "4" },
            },
        } as unknown as CharSettingsInput
        const settings = normalizeCharSettings(dirty)

        expect(settings.assist1.charLevel).toBe(80)
        expect(settings.assist1.charSkillLevel).toEqual([10, 10, 10])
        expect(settings.assist1.weaponLevel).toBe(80)
        expect(settings.assist1.weaponRefine).toBe(0)
        expect(settings.assist1.auraMod).toBe(0)

        expect(settings.assist1.charMods).toHaveLength(MOD_SLOT_COUNTS.角色)
        expect(settings.assist1.charMods[0]).toEqual([1, 2])
        expect(settings.assist1.charMods[1]).toBeNull()
        expect(settings.assist1.charMods[2]).toBeNull()
        expect(settings.assist1.charMods[3]).toEqual([4, 5])
        expect(settings.assist1.charMods[4]).toBeNull()
        expect(settings.assist1.meleeMods).toEqual(Array(MOD_SLOT_COUNTS.近战).fill(null))

        // 形状不合法的变体补成空变体，保持下标与字母一一对应；越界索引钳制到末尾
        expect(settings.assist1.modVariants).toHaveLength(2)
        expect(settings.assist1.modVariants[0].角色[0]).toEqual([1, 2])
        expect(settings.assist1.modVariants[1].角色).toEqual(Array(MOD_SLOT_COUNTS.角色).fill(null))
        expect(settings.assist1.modVariantIndex).toBe(2)

        // 覆盖率 0.5 保留第三项，覆盖率 1 省略；自定义 BUFF 收敛浮点尾差
        expect(settings.assist1.buffs).toEqual([
            ["甲", 1, 0.5],
            ["乙", 2],
            ["丙", 1],
        ])
        expect(settings.assist1.customBuff).toEqual([["攻击", 0.3]])
        expect(settings.assist1.effectConfig).toEqual({ "m:1": 3 })
    })

    it("normalizeAssistSideSettings 可独立调用，缺失值按传入默认值兜底", () => {
        const defaults: AssistCharSettings = { ...createDefaultAssistSideSettings(), charLevel: 60, weaponLevel: 70 }
        const normalized = normalizeAssistSideSettings(undefined, "-", defaults)

        expect(normalized.charLevel).toBe(60)
        expect(normalized.weaponLevel).toBe(70)
        expect(normalized.enabled).toBe(false)
        expect(normalized.baseName).toBe("")
        expect(normalized.buffs).toEqual([])
        expect(normalized.charMods).not.toBe(defaults.charMods)

        const configured = normalizeAssistSideSettings(
            { charLevel: 30, enabled: false, baseName: FIRST_SKILL },
            CHAR_WITH_SKILLS.id,
            createDefaultAssistSideSettings()
        )
        expect(configured.charLevel).toBe(30)
        expect(configured.enabled).toBe(false)
        expect(configured.baseName).toBe(FIRST_SKILL)
    })

    it("mainTargetEnabled 非布尔值一律视为启用", () => {
        expect(normalizeCharSettings({ mainTargetEnabled: false }).mainTargetEnabled).toBe(false)
        expect(normalizeCharSettings({ mainTargetEnabled: 0 as unknown as boolean }).mainTargetEnabled).toBe(true)
        expect(normalizeCharSettings({}).mainTargetEnabled).toBe(true)
    })

    it("协战 DOT 脏数据：负数归零、NaN 取默认、forceOwnAdditionalDamage 非布尔回退", () => {
        const settings = normalizeCharSettings({
            team1: CHAR_WITH_SKILLS.id,
            assist1: { dotSettings: { skill: -2, melee: Number.NaN, ranged: 1.5, forceOwnAdditionalDamage: "yes" } },
        } as unknown as CharSettingsInput)

        expect(settings.assist1.dotSettings).toEqual({
            skill: 0,
            melee: 0,
            ranged: 1.5,
            skillweapon: 0,
            forceOwnAdditionalDamage: false,
        })

        // 非零默认值时，缺失 / NaN 键必须沿用默认而不是归零
        const defaults = createDefaultAssistSideSettings()
        defaults.dotSettings = { skill: 2, melee: 3, ranged: 4, skillweapon: 5, forceOwnAdditionalDamage: true }
        const normalized = normalizeAssistSideSettings(
            { dotSettings: { skill: -1, melee: Number.NaN, forceOwnAdditionalDamage: "yes" } },
            "-",
            defaults
        )
        expect(normalized.dotSettings).toEqual({ skill: 0, melee: 3, ranged: 4, skillweapon: 5, forceOwnAdditionalDamage: true })
    })

    it("modVariantIndex 缺失时沿用 defaults，非法时钳制到变体数", () => {
        const defaults = createDefaultAssistSideSettings()
        defaults.modVariants = [createEmptyModVariant(), createEmptyModVariant()]
        defaults.modVariantIndex = 1

        expect(normalizeAssistSideSettings({}, "-", defaults).modVariantIndex).toBe(1)
        expect(normalizeAssistSideSettings({ modVariantIndex: 99 }, "-", defaults).modVariantIndex).toBe(2)
    })

    it("assist2 旧存档：有效 team2 启用并回退首个技能；不在 charMap 的 id 不启用", () => {
        const valid = normalizeCharSettings({ team2: OTHER_CHAR.id })
        expect(valid.assist2.enabled).toBe(true)
        expect(valid.assist2.baseName).toBe(OTHER_CHAR_SKILL)
        expect(valid.assist1.enabled).toBe(false)

        const unknown = normalizeCharSettings({ team2: UNKNOWN_CHAR_ID })
        expect(unknown.team2).toBe(UNKNOWN_CHAR_ID)
        expect(unknown.assist2.enabled).toBe(false)
        expect(unknown.assist2.baseName).toBe("")
    })
})

describe("serializeCharSettings 协战往返（U88a）", () => {
    it("协战全字段保留，normalize(serialize(x)) 与 normalize(x) 深等", () => {
        const normalized = normalizeCharSettings(createFullSettings())
        const serialized = JSON.parse(serializeCharSettings(normalized))
        const restored = normalizeCharSettings(serialized)

        expect(serialized.assist1).toEqual(normalized.assist1)
        expect(serialized.assist2).toEqual(normalized.assist2)
        expect(restored).toEqual(normalized)
    })

    it("空 loadout 序列化仍保留 assist1/assist2 完整形状", () => {
        const serialized = JSON.parse(serializeCharSettings({}))
        const assistKeys = Object.keys(createDefaultAssistSideSettings())

        expect("assist1" in serialized).toBe(true)
        expect("assist2" in serialized).toBe(true)
        expect(Object.keys(serialized.assist1)).toEqual(assistKeys)
        expect(Object.keys(serialized.assist2)).toEqual(assistKeys)
        // 未配置角色（teamN = "-"）时启用位推断为 false，其余字段保持默认
        expect(serialized.assist1.enabled).toBe(false)
        expect(serialized.assist1.charLevel).toBe(80)
        expect(serialized.assist1.charMods).toEqual(Array(MOD_SLOT_COUNTS.角色).fill(null))
    })

    it("往返保留 createFullSettings 的字段字面量（不只与 normalize(x) 互比）", () => {
        const normalized = normalizeCharSettings(createFullSettings())
        const restored = normalizeCharSettings(JSON.parse(serializeCharSettings(normalized)))

        expect(restored.assist1.auraMod).toBe(31524)
        expect(restored.assist1.modVariants).toHaveLength(1)
        expect(restored.assist1.modVariants[0].中枢).toBe(31524)
        expect(restored.assist1.modVariants[0].角色[0]).toEqual([54001, 5])
        expect(restored.assist1.customVariables).toEqual([
            ["甲", "1+1"],
            ["乙", "攻击*2"],
        ])
        expect(restored.assist1.dotSettings).toEqual({ skill: 1, melee: 0.5, ranged: 0, skillweapon: 2, forceOwnAdditionalDamage: true })
        expect(restored.assist1.buffs).toEqual([
            ["增益甲", 3],
            ["增益乙", 2, 0.5],
        ])
        expect(restored.assist1.customBuff).toEqual([
            ["攻击", 100],
            ["暴击", 0.25],
        ])
        expect(restored.assist1.effectConfig).toEqual({ "m:50000": 3, "w:10206": 2 })
    })

    it("典型三人满 loadout 序列化长度 < 20000", () => {
        const json = serializeCharSettings(createFullSettings())

        expect(json.length).toBeLessThan(20000)
        expect(JSON.parse(json).assist1.charMods).toHaveLength(MOD_SLOT_COUNTS.角色)
    })
})

describe("CharSettings 升华配置（U91a）", () => {
    /** 极端升华配置：当前版本可达天赋全满级 + 16 槽各满词条 + 3 份装备变体 */
    function createExtremeTranscendSettings() {
        const perSlot = (slotId: number): TranscendGearEntry[] =>
            affixes
                .filter(affix => isAffixCompatibleWithSlot(affix.id, slotId))
                .slice(0, TRANSCEND_MAX_AFFIXES_PER_SLOT)
                .map(affix => ({ slotId, affixId: affix.id, rollLevel: 500, masterworkLevel: 10, ancient: true, finalMasterwork: true }))
        const slotIds = Array.from({ length: 16 }, (_, index) => index + 1)
        const mainGear = slotIds.slice(0, 8).flatMap(perSlot)
        const assist1Gear = slotIds.slice(8, 12).flatMap(perSlot)
        const assist2Gear = slotIds.slice(12, 16).flatMap(perSlot)
        const settings = createDefaultTranscendSettings()
        settings.enabled = true
        // 与界面「一键解锁」默认口径一致：只开当前版本可达阶段
        settings.talentLevels = createMaxedReachableTalentLevels()
        settings.mainGear = mainGear
        settings.assist1Gear = assist1Gear
        settings.assist2Gear = assist2Gear
        settings.gearVariants = ["A", "B", "C"].map(id => ({ id, mainGear, assist1Gear, assist2Gear }))
        return settings
    }

    it("缺失 / null / 脏数据一律归一化为关闭默认", () => {
        const expected = createDefaultTranscendSettings()
        expect(normalizeCharSettings({}).transcend).toEqual(expected)
        expect(normalizeCharSettings({ transcend: null }).transcend).toEqual(expected)
        const dirty = { transcend: { enabled: "yes", talentLevels: "bad", mainGear: 1 } } as unknown as CharSettingsInput
        expect(normalizeCharSettings(dirty).transcend).toEqual(expected)
    })

    it("归一化保留启用的天赋与装备，并钳制越界档位", () => {
        const settings = normalizeCharSettings({
            transcend: {
                enabled: true,
                talentLevels: [[100001, 99]],
                mainGear: [
                    { slotId: 1, affixId: 310201, rollLevel: 999, masterworkLevel: 99, ancient: true, finalMasterwork: true },
                    { slotId: 1, affixId: 102, rollLevel: 999, masterworkLevel: 99, ancient: true, finalMasterwork: true },
                ],
            },
        })

        expect(settings.transcend.enabled).toBe(true)
        expect(settings.transcend.talentLevels).toEqual([[100001, 1]])
        expect(settings.transcend.mainGear).toHaveLength(1)
        const equipped = settings.transcend.mainGear[0]
        expect(equipped.slotId).toBe(1)
        expect(isEquippedGear(equipped)).toBe(true)
        if (!isEquippedGear(equipped)) throw new Error("升华装备应为 v2 物品")
        // 专属词条进 uniqueAffix，档位 / 精造固定；普通词条精造钳制到 10、档位钳制到上限
        expect(equipped.item.kind).toBe("unique")
        expect(equipped.item.uniqueAffix).toMatchObject({ affixId: 310201, rollLevel: 1, masterworkLevel: 0, source: "unique" })
        expect(equipped.item.affixes.find(item => item.affixId === 102)).toMatchObject({ affixId: 102, rollLevel: 50, masterworkLevel: 10 })
        expect(settings.transcend.gearVariants).toHaveLength(1)
        expect(settings.transcend.gearVariants[0].mainGear).toHaveLength(1)
    })

    it("序列化往返保留升华配置与变体", () => {
        const settings = createFullSettings()
        settings.transcend = createExtremeTranscendSettings()
        const restored = normalizeCharSettings(JSON.parse(serializeCharSettings(settings)))

        expect(restored.transcend.enabled).toBe(true)
        expect(restored.transcend.talentLevels).toHaveLength(createMaxedReachableTalentLevels().length)
        expect(restored.transcend.gearVariants).toHaveLength(3)
        expect(restored.transcend.mainGear.length).toBeGreaterThan(0)
        expect(restored.transcend.gearVariants[1].mainGear).toEqual(restored.transcend.mainGear)
    })

    it("默认 / 典型三人满 loadout（含默认升华）序列化 < 20000", () => {
        expect(serializeCharSettings(createDefaultCharSettings()).length).toBeLessThan(20000)
        expect(serializeCharSettings(createFullSettings()).length).toBeLessThan(20000)
    })

    it("分享序列化折叠为激活变体：极端升华分享载荷 ≤ 6000 且读取后装备完整", () => {
        const settings = createFullSettings()
        settings.transcend = createExtremeTranscendSettings()
        const normalized = normalizeCharSettings(settings)
        const shareText = serializeCharSettingsForShare(settings)
        const share = JSON.parse(shareText)

        expect(shareText.length).toBeLessThanOrEqual(6000)
        // 顶层重复组省略、只保留激活变体（含三组装备），读取时恢复
        expect("mainGear" in share.transcend).toBe(false)
        expect(share.transcend.gearVariants).toHaveLength(1)
        expect(share.transcend.gearVariants[0][0]).toBe(normalized.transcend.activeGearVariant)
        const restored = normalizeCharSettings(share)
        expect(restored.transcend.mainGear).toHaveLength(normalized.transcend.mainGear.length)
        expect(restored.transcend.assist1Gear).toHaveLength(normalized.transcend.assist1Gear.length)
        expect(restored.transcend.assist2Gear).toHaveLength(normalized.transcend.assist2Gear.length)
        expect(restored.transcend.gearVariants).toHaveLength(1)
        expect(restored.transcend.gearVariants[0].mainGear).toEqual(restored.transcend.mainGear)
        // 主动变体 id 保留
        expect(restored.transcend.activeGearVariant).toBe(normalized.transcend.activeGearVariant)
    })

    it("本地序列化保留全部变体（体积可能超过 20000，不作为失败）", () => {
        const settings = createFullSettings()
        settings.transcend = createExtremeTranscendSettings()
        const localText = serializeCharSettings(settings)
        const shareText = serializeCharSettingsForShare(settings)

        expect(JSON.parse(localText).transcend.gearVariants).toHaveLength(3)
        expect(localText.length).toBeGreaterThan(shareText.length)
    })

    it("U96 压缩形状：全开天赋省略 talentLevels、顶层三组省略、装备为位置数组", () => {
        const settings = createFullSettings()
        settings.transcend = createExtremeTranscendSettings()
        const payload = JSON.parse(serializeCharSettings(settings)).transcend

        expect(payload.enabled).toBe(1)
        expect("talentLevels" in payload).toBe(false)
        expect("mainGear" in payload).toBe(false)
        expect("assist1Gear" in payload).toBe(false)
        expect("assist2Gear" in payload).toBe(false)
        expect(payload.gearVariants).toHaveLength(3)
        expect(payload.gearVariants[0][0]).toBe("A")
        const firstItem = payload.gearVariants[0][1][0]
        expect(Array.isArray(firstItem)).toBe(true)
        // [slotId, kind(0|1), slotType, ...]；词缀为 [affixId, rollLevel, ancient(1)]
        expect(firstItem[0]).toBe(1)
        expect(firstItem[1]).toBe(0)
        expect(Array.isArray(firstItem[10])).toBe(true)
        expect(firstItem[10][0][0]).toBe(102)
        expect(Array.isArray(firstItem[10][0])).toBe(true)
        // 派生字段与展示快照不落盘
        const text = serializeCharSettings(settings)
        expect(text).not.toContain("masterworkLevel")
        expect(text).not.toContain("finalMasterwork")
        expect(text).not.toContain("nameSnapshot")
        expect(text).not.toContain('"source"')
        // 全开天赋的显式列表不再出现在文本里
        expect(text).not.toContain("talentLevels")
    })

    it("U96 天赋缺省语义：缺字段 = 默认全开（可达节点），显式 [] = 一个都不开，自定义等级写显式数组", () => {
        const reachable = createMaxedReachableTalentLevels()
        const implicit = normalizeCharSettings({ transcend: { enabled: true } })
        expect(implicit.transcend.talentLevels).toHaveLength(reachable.length)
        // 「默认全开」只覆盖当前版本可达阶段，不等于包含未开放阶段的全量
        expect(reachable.length).toBeLessThan(talents.length)
        // 默认全开（界面一键解锁口径）序列化时省略字段
        const defaultSettings = {
            ...createDefaultCharSettings(),
            transcend: { ...createDefaultTranscendSettings(), enabled: true, talentLevels: reachable },
        }
        expect("talentLevels" in JSON.parse(serializeCharSettings(defaultSettings)).transcend).toBe(false)

        const explicitEmpty = normalizeCharSettings({ transcend: { enabled: true, talentLevels: [] } })
        expect(explicitEmpty.transcend.talentLevels).toEqual([])

        const settings = createFullSettings()
        settings.transcend = { ...createDefaultTranscendSettings(), enabled: true, talentLevels: [[100001, 1]] }
        const payload = JSON.parse(serializeCharSettings(settings)).transcend
        expect(payload.talentLevels).toEqual([[100001, 1]])
        expect(normalizeCharSettings(JSON.parse(serializeCharSettings(settings))).transcend.talentLevels).toEqual([[100001, 1]])

        // 少一个节点的自定义全开表也必须显式写回
        const maxed = createMaxedTranscendTalentLevels()
        const custom = maxed.slice(0, -1)
        settings.transcend = { ...createDefaultTranscendSettings(), enabled: true, talentLevels: custom }
        expect(JSON.parse(serializeCharSettings(settings)).transcend.talentLevels).toHaveLength(custom.length)

        // 勾选「包含未开放阶段」的全量满级不是默认口径：显式写回且往返一致
        settings.transcend = { ...createDefaultTranscendSettings(), enabled: true, talentLevels: maxed }
        const allText = serializeCharSettings(settings)
        expect(JSON.parse(allText).transcend.talentLevels).toHaveLength(maxed.length)
        expect(normalizeCharSettings(JSON.parse(allText)).transcend.talentLevels).toEqual(maxed)
    })

    it("U96 旧 JSON 兼容：v2 对象装备与 v1 平铺条目都能归一化", () => {
        const v2 = normalizeCharSettings({
            transcend: {
                enabled: true,
                talentLevels: [],
                mainGear: [
                    {
                        slotId: 1,
                        item: {
                            kind: "normal",
                            slotType: 1,
                            rarityId: 5,
                            affixes: [{ affixId: 102, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
                        },
                    },
                ],
            },
        })
        expect(v2.transcend.mainGear).toHaveLength(1)

        const v1 = normalizeCharSettings({
            transcend: {
                enabled: true,
                talentLevels: [],
                mainGear: [{ slotId: 1, affixId: 102, rollLevel: 10, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
            },
        })
        expect(v1.transcend.mainGear).toHaveLength(1)
        expect(isEquippedGear(v1.transcend.mainGear[0])).toBe(true)
    })

    it("U96 装备细节往返：太古 / 精锻 / 最终精锻 / 淬炼 / 附魔快照 / 宝石孔 / 暗金", () => {
        const settings = createDefaultCharSettings()
        settings.transcend = {
            enabled: true,
            talentLevels: [],
            mainGear: [
                {
                    slotId: 1,
                    item: {
                        kind: "normal",
                        slotType: 1,
                        rarityId: 5,
                        equipBaseScore: 50,
                        iconId: 1004,
                        nameId: 1002,
                        seasonId: 2,
                        affixes: [
                            { affixId: 102, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                            { affixId: 1002, rollLevel: 30, masterworkLevel: 0, ancient: true, finalMasterwork: false },
                            { affixId: 1003, rollLevel: 20, masterworkLevel: 0, ancient: true, finalMasterwork: false },
                        ],
                        craft: {
                            masterworkLevel: 10,
                            temperingCount: 0,
                            finalMasterworkAffixIndex: 1,
                            enchantAffixIndex: 2,
                            enchantCount: 2,
                            enchantSnapshot: {
                                affixIndex: 2,
                                roll: { affixId: 1005, rollLevel: 18, masterworkLevel: 0, ancient: true, finalMasterwork: false },
                            },
                        },
                        sockets: [{ socketIndex: 1, gemId: 12001 }],
                        socketCount: 2,
                    },
                },
                {
                    slotId: 3,
                    item: {
                        kind: "unique",
                        slotType: 3,
                        uniqueId: 210003,
                        uniqueAffix: {
                            affixId: 310201,
                            rollLevel: 1,
                            masterworkLevel: 0,
                            ancient: false,
                            finalMasterwork: false,
                            source: "unique",
                        },
                        affixes: [{ affixId: 101, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
                        craft: { masterworkLevel: 0, temperingCount: 0, enchantCount: 0 },
                    },
                },
            ],
            assist1Gear: [],
            assist2Gear: [],
            gearVariants: [
                { id: "A", mainGear: [], assist1Gear: [], assist2Gear: [] },
                { id: "B", mainGear: [], assist1Gear: [], assist2Gear: [] },
                { id: "C", mainGear: [], assist1Gear: [], assist2Gear: [] },
            ],
            activeGearVariant: "A",
        }
        const normalized = normalizeCharSettings(settings)
        const text = serializeCharSettings(normalized)
        const payload = JSON.parse(text).transcend

        // 专属词条只存 affixId；附魔快照存 [下标, [affixId, 档位, ancient]]
        const [mainItem, uniqueItem] = payload.gearVariants[0][1]
        expect(mainItem[9]).toBeNull()
        expect(mainItem[10]).toEqual([
            [102, 50],
            [1002, 30, 1],
            [1003, 20, 1],
        ])
        expect(mainItem[11].slice(0, 6)).toEqual([10, null, 2, 1, null, 2])
        expect(mainItem[11][6][1]).toEqual([1005, 18, 1])
        expect(mainItem[12]).toEqual([[1, 12001]])
        expect(uniqueItem[1]).toBe(1)
        expect(uniqueItem[3]).toBe(210003)
        expect(uniqueItem[9]).toBe(310201)

        const restored = normalizeCharSettings(JSON.parse(text))
        expect(restored.transcend).toEqual(normalized.transcend)
    })

    it("U96 极端 3 变体本地序列化 ≤ 12500，且压缩幂等", () => {
        const settings = createFullSettings()
        settings.transcend = createExtremeTranscendSettings()
        const normalized = normalizeCharSettings(settings)
        const text = serializeCharSettings(normalized)

        expect(text.length).toBeLessThanOrEqual(12500)
        // 压缩 → 归一化 → 再压缩结果逐字节一致
        const again = serializeCharSettings(normalizeCharSettings(JSON.parse(text)))
        expect(again).toBe(text)
        // 归一化后的内存结构不变：三变体、装备与词条数与压缩前一致
        const restored = normalizeCharSettings(JSON.parse(text))
        expect(restored.transcend).toEqual(normalized.transcend)

        // 勾选「包含未开放阶段」（300 节点显式写回）仍 ≤ 12500；分享仍远低于服务端 20000 上限
        settings.transcend = { ...settings.transcend, talentLevels: createMaxedTranscendTalentLevels() }
        const allText = serializeCharSettings(settings)
        expect(allText.length).toBeLessThanOrEqual(12500)
        expect(serializeCharSettingsForShare(settings).length).toBeLessThan(20000)
    })

    it("U96 未使用升华时不写 transcend 键", () => {
        const text = serializeCharSettings(createDefaultCharSettings())
        const parsed = JSON.parse(text)

        expect("transcend" in parsed).toBe(false)
        expect(text.length).toBeLessThan(2428)
        expect(normalizeCharSettings(parsed).transcend).toEqual(createDefaultTranscendSettings())
    })
})

describe("U96 压缩格式收口（U96-fix）", () => {
    /** 更真实的极端装备：每槽基础 + 3 随机，精锻 10 / 最终精锻 / 淬炼 / 附魔快照，2 孔（受槽型上限约束） */
    function createRealisticGear(slotId: number): TranscendEquippedGear {
        const slotType = getTranscendSlotType(slotId)
        const baseAffixId = getSlotBaseAffixId(slotType)!
        const pool = affixes.filter(affix => affix.id !== baseAffixId && isAffixCompatibleWithSlot(affix.id, slotId))
        const finalAffix = pool.find(affix => affix.maxAffixUpdateFunc)!
        const others = pool.filter(affix => affix.id !== finalAffix.id)
        const [temperAffix, enchantAffix, snapshotAffix] = others
        const socketCount = Math.min(2, getSlotMaxInlayCount(slotType))
        const sockets = Array.from({ length: socketCount }, (_, index) => ({ socketIndex: index, gemId: 12001 + index }))
        return {
            slotId,
            item: {
                kind: "normal",
                slotType,
                rarityId: 5,
                equipBaseScore: 50,
                affixes: [
                    { affixId: baseAffixId, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                    { affixId: finalAffix.id, rollLevel: 50, masterworkLevel: 0, ancient: true, finalMasterwork: false },
                    { affixId: temperAffix.id, rollLevel: 40, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                    { affixId: enchantAffix.id, rollLevel: 30, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                ],
                craft: {
                    masterworkLevel: 10,
                    finalMasterworkAffixIndex: 1,
                    temperingAffixIndex: 2,
                    temperingCount: 5,
                    enchantAffixIndex: 3,
                    enchantCount: 3,
                    enchantSnapshot: {
                        affixIndex: 3,
                        roll: { affixId: snapshotAffix.id, rollLevel: 20, masterworkLevel: 0, ancient: true, finalMasterwork: false },
                    },
                },
                ...(sockets.length ? { sockets, socketCount } : {}),
            },
        }
    }

    function createRealisticExtremeTranscend() {
        const slotIds = Array.from({ length: 16 }, (_, index) => index + 1)
        const mainGear = slotIds.slice(0, 8).map(createRealisticGear)
        const assist1Gear = slotIds.slice(8, 12).map(createRealisticGear)
        const assist2Gear = slotIds.slice(12, 16).map(createRealisticGear)
        return {
            ...createDefaultTranscendSettings(),
            enabled: true,
            talentLevels: createMaxedTranscendTalentLevels(),
            mainGear,
            assist1Gear,
            assist2Gear,
            gearVariants: ["A", "B", "C"].map(id => ({ id, mainGear, assist1Gear, assist2Gear })),
        }
    }

    it("安全模式（注入空表）隐式全开按静态可达表恢复，不会被固化成显式 []", () => {
        const payload = { enabled: 1, gearVariants: [["A"]], activeGearVariant: "A" }
        const safe = normalizeTranscendSettings(payload, { talents: [], affixes: [] })

        expect(safe.talentLevels).toEqual(createMaxedReachableTalentLevels())
        const encoded = encodeTranscendSettings(safe, { talents: [] }) as Record<string, unknown>
        expect("talentLevels" in encoded).toBe(false)
        // 换回真实数据再读仍是全开
        expect(normalizeCharSettings({ transcend: JSON.parse(JSON.stringify(encoded)) }).transcend.talentLevels).toEqual(
            createMaxedReachableTalentLevels()
        )
    })

    it("畸形 / 截断压缩行被丢弃，不伪造空装备", () => {
        const settings = normalizeCharSettings({
            transcend: {
                enabled: 1,
                gearVariants: [["A", [[], [1], [1, 0, "x"], [-1, 0, 1], [1, 0, 99]], [], []]],
                activeGearVariant: "A",
            },
        } as unknown as CharSettingsInput)

        expect(settings.transcend.mainGear).toEqual([])
        expect(settings.transcend.gearVariants[0].mainGear).toEqual([])
    })

    it("混合数组：同一组内压缩行与 v2 对象都能归一化", () => {
        const settings = createDefaultCharSettings()
        settings.transcend = {
            ...createDefaultTranscendSettings(),
            enabled: true,
            talentLevels: [],
            mainGear: [{ slotId: 1, affixId: 102, rollLevel: 10, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
        }
        const payload = JSON.parse(serializeCharSettings(settings)).transcend
        // 压缩行 + 旧 v2 对象混排（槽位不同，避免互相覆盖）
        payload.gearVariants[0][1].push({
            slotId: 3,
            item: {
                kind: "normal",
                slotType: 3,
                affixes: [{ affixId: 101, rollLevel: 10, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
            },
        })
        const restored = normalizeCharSettings({ transcend: payload })

        expect(restored.transcend.mainGear.map(entry => entry.slotId).sort()).toEqual([1, 3])
    })

    it("分享保留激活变体 B 并省略顶层三组", () => {
        const settings = createDefaultCharSettings()
        settings.transcend = {
            ...createDefaultTranscendSettings(),
            enabled: true,
            talentLevels: [],
            gearVariants: [
                { id: "A", mainGear: [], assist1Gear: [], assist2Gear: [] },
                {
                    id: "B",
                    mainGear: [{ slotId: 3, affixId: 101, rollLevel: 10, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
                    assist1Gear: [],
                    assist2Gear: [],
                },
                { id: "C", mainGear: [], assist1Gear: [], assist2Gear: [] },
            ],
            activeGearVariant: "B",
        }
        const normalized = normalizeCharSettings(settings)
        const share = JSON.parse(serializeCharSettingsForShare(settings))

        expect("mainGear" in share.transcend).toBe(false)
        expect(share.transcend.gearVariants).toHaveLength(1)
        expect(share.transcend.gearVariants[0][0]).toBe("B")
        const restored = normalizeCharSettings(share)
        expect(restored.transcend.activeGearVariant).toBe("B")
        expect(restored.transcend.mainGear).toHaveLength(normalized.transcend.mainGear.length)
    })

    it("分享未使用升华时与本地序列化同口径省略 transcend 键", () => {
        const text = serializeCharSettingsForShare(createDefaultCharSettings())

        expect("transcend" in JSON.parse(text)).toBe(false)
        expect(normalizeCharSettings(JSON.parse(text)).transcend).toEqual(createDefaultTranscendSettings())
    })

    it("enabled:false + 可达满级天赋 + 无装备往返一致", () => {
        const settings = createDefaultCharSettings()
        settings.transcend = { ...createDefaultTranscendSettings(), enabled: false, talentLevels: createMaxedReachableTalentLevels() }
        const text = serializeCharSettings(settings)
        const payload = JSON.parse(text).transcend

        expect(payload.enabled).toBe(0)
        expect("talentLevels" in payload).toBe(false)
        const restored = normalizeCharSettings(JSON.parse(text))
        expect(restored.transcend.enabled).toBe(false)
        expect(restored.transcend.talentLevels).toEqual(createMaxedReachableTalentLevels())
        expect(restored.transcend.mainGear).toEqual([])
    })

    it("legacyUnique（未知 uniqueId）经压缩格式往返保持标记", () => {
        const settings = createDefaultCharSettings()
        settings.transcend = {
            ...createDefaultTranscendSettings(),
            enabled: true,
            talentLevels: [],
            mainGear: [
                {
                    slotId: 1,
                    item: {
                        kind: "unique",
                        slotType: 1,
                        uniqueId: 999999,
                        uniqueAffix: {
                            affixId: 310201,
                            rollLevel: 1,
                            masterworkLevel: 0,
                            ancient: false,
                            finalMasterwork: false,
                            source: "unique",
                        },
                        affixes: [],
                        craft: { masterworkLevel: 0, temperingCount: 0, enchantCount: 0 },
                    },
                },
            ],
        }
        const normalized = normalizeCharSettings(settings)
        const first = normalized.transcend.mainGear[0] as TranscendEquippedGear
        expect(first.item.legacyUnique).toBe(true)

        const restored = normalizeCharSettings(JSON.parse(serializeCharSettings(normalized)))
        expect(restored.transcend).toEqual(normalized.transcend)
    })

    it("encode 支持注入天赋表，与归一化默认全开同口径", () => {
        const custom = talents
            .filter(talent => talent.stageId === 1)
            .map(talent => ({ id: talent.id, maxLevel: 1, stageId: talent.stageId }))
        const settings = normalizeTranscendSettings({ enabled: 1, gearVariants: [["A"]] }, { talents: custom, affixes: [] })

        expect(settings.talentLevels).toHaveLength(custom.length)
        expect(settings.talentLevels.every(([, level]) => level === 1)).toBe(true)
        const injected = encodeTranscendSettings(settings, { talents: custom }) as Record<string, unknown>
        expect("talentLevels" in injected).toBe(false)
        // 静态表口径下不是默认全开：显式写回（只多写、无数据错误）
        const staticEncoded = encodeTranscendSettings(settings) as Record<string, unknown>
        expect(staticEncoded.talentLevels).toHaveLength(custom.length)
    })

    it("真实极端件（精锻 / 淬炼 / 附魔快照 / 孔位 + 300 天赋）长度受控", () => {
        const settings = createFullSettings()
        settings.transcend = createRealisticExtremeTranscend()
        const normalized = normalizeCharSettings(settings)
        const first = normalized.transcend.mainGear[0] as TranscendEquippedGear

        // fixture 自身有效：精锻满级 + 最终精锻 / 淬炼 / 附魔快照都在
        expect(first.item.craft).toMatchObject({
            masterworkLevel: 10,
            temperingAffixIndex: 2,
            temperingCount: 5,
            enchantAffixIndex: 3,
            enchantCount: 3,
        })
        expect(first.item.craft?.finalMasterworkAffixIndex).toBeDefined()
        expect(first.item.craft?.enchantSnapshot).toBeDefined()

        const text = serializeCharSettings(normalized)
        const shareText = serializeCharSettingsForShare(normalized)
        const restored = normalizeCharSettings(JSON.parse(text))

        expect(restored.transcend).toEqual(normalized.transcend)
        expect(text.length).toBeLessThanOrEqual(13500)
        expect(shareText.length).toBeLessThan(20000)
    })
})
