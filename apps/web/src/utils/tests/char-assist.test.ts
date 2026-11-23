import { describe, expect, it } from "vitest"
import { nextTick, ref } from "vue"
import { useCharSettings } from "@/composables/useCharSettings"
import {
    type AssistCharSettings,
    type CharSettings,
    type CharSettingsInput,
    createDefaultCharSettings,
    normalizeCharSettings,
    weaponMap,
} from "@/data"
import { resolveTraceOffRoots } from "@/data/traceEffects"
import {
    convertTopSettingsToAssist,
    getAssistCharSkills,
    getAssistFacade,
    mapAssistPatch,
    resetAssistForChar,
    suggestAssistWeapon,
} from "@/utils/char-assist"

const ASSIST_CHAR = 4101 // 黎瑟
const OTHER_CHAR = 1503 // 刻舟
const MELEE_WEAPON = 10101 // 辉珀刃 [近战]
const RANGED_WEAPON = 20102 // 剥离 [远程]

function createSettings(patch: CharSettingsInput = {}): CharSettings {
    return normalizeCharSettings({
        ...createDefaultCharSettings(),
        team1: ASSIST_CHAR,
        team1Weapon: MELEE_WEAPON,
        ...patch,
    })
}

function createAssist(overrides: Partial<AssistCharSettings> = {}): Partial<AssistCharSettings> {
    return {
        charLevel: 60,
        charSkillLevel: [7, 8, 9],
        baseName: "涡旋电场",
        extraMastery: "重剑",
        weaponLevel: 33,
        weaponRefine: 2,
        ...overrides,
    }
}

describe("char-assist", () => {
    it("单武器按类型落到近战 / 远程槽，另一槽为 0", () => {
        const melee = getAssistFacade(createSettings({ assist1: createAssist() }), "assist1")
        expect(melee.meleeWeapon).toBe(MELEE_WEAPON)
        expect(melee.rangedWeapon).toBe(0)
        expect(melee.meleeWeaponLevel).toBe(33)
        expect(melee.meleeWeaponRefine).toBe(2)

        const ranged = getAssistFacade(createSettings({ team1Weapon: RANGED_WEAPON, assist1: createAssist() }), "assist1")
        expect(ranged.rangedWeapon).toBe(RANGED_WEAPON)
        expect(ranged.meleeWeapon).toBe(0)

        const empty = getAssistFacade(createSettings({ team1: "-", team1Weapon: "-" }), "assist1")
        expect(empty.charId).toBe(0)
        expect(empty.meleeWeapon).toBe(0)
        expect(empty.rangedWeapon).toBe(0)
    })

    it("charSkillLevel / customVariables 是独立副本", () => {
        const settings = createSettings({ assist1: createAssist({ customVariables: [["威力", "技能威力*2"]] }) })
        const facade = getAssistFacade(settings, "assist1")
        expect(facade.charSkillLevel).toEqual([7, 8, 9])
        expect(facade.customVariables).toEqual([["威力", "技能威力*2"]])
        expect(facade.charSkillLevel).not.toBe(settings.assist1.charSkillLevel)
        expect(facade.customVariables[0]).not.toBe(settings.assist1.customVariables[0])
        facade.charSkillLevel[0] = 1
        expect(settings.assist1.charSkillLevel[0]).toBe(7)
    })

    it("等级 / 精炼钳制到 1-80 与 0-5", () => {
        const settings = createSettings()
        expect(mapAssistPatch(settings, "assist1", { charLevel: 999 }).assist.charLevel).toBe(80)
        expect(mapAssistPatch(settings, "assist1", { charLevel: 0 }).assist.charLevel).toBe(1)
        expect(mapAssistPatch(settings, "assist1", { meleeWeaponLevel: 400 }).assist.weaponLevel).toBe(80)
        expect(mapAssistPatch(settings, "assist1", { rangedWeaponLevel: -5 }).assist.weaponLevel).toBe(1)
        expect(mapAssistPatch(settings, "assist1", { meleeWeaponRefine: 9 }).assist.weaponRefine).toBe(5)
        expect(mapAssistPatch(settings, "assist1", { rangedWeaponRefine: -1 }).assist.weaponRefine).toBe(0)
    })

    it("武器补丁按非 0 槽写回单武器 id", () => {
        const settings = createSettings()
        expect(mapAssistPatch(settings, "assist1", { rangedWeapon: RANGED_WEAPON }).weaponId).toBe(RANGED_WEAPON)
        expect(mapAssistPatch(settings, "assist1", { meleeWeapon: MELEE_WEAPON, rangedWeapon: 0 }).weaponId).toBe(MELEE_WEAPON)
        expect(mapAssistPatch(settings, "assist1", { meleeWeapon: 0, rangedWeapon: 0 }).weaponId).toBe(0)
        expect(mapAssistPatch(settings, "assist1", { meleeWeapon: 0 }).weaponId).toBe(0)
    })

    it("换角色清空 baseName / extraMastery，同角色不清", () => {
        const settings = createSettings({ assist1: createAssist() })
        const changed = mapAssistPatch(settings, "assist1", { charId: OTHER_CHAR })
        expect(changed.teamId).toBe(OTHER_CHAR)
        expect(changed.assist.baseName).toBe("")
        expect(changed.assist.extraMastery).toBe("")

        const same = mapAssistPatch(settings, "assist1", { charId: ASSIST_CHAR })
        expect(same.teamId).toBe(ASSIST_CHAR)
        expect(same.assist).not.toHaveProperty("baseName")
        expect(same.assist).not.toHaveProperty("extraMastery")
    })

    it("复位补丁回填首个技能并设置启用位", () => {
        const swapped = createSettings({ team1: OTHER_CHAR })
        expect(resetAssistForChar(swapped, "assist1")).toEqual({ baseName: "少年游", extraMastery: "", enabled: true })

        const cleared = createSettings({ team1: "-" })
        expect(resetAssistForChar(cleared, "assist1")).toEqual({ baseName: "", extraMastery: "", enabled: false })
    })

    it("协战技能取前三个并按 charSkillLevel 等级化", () => {
        const settings = createSettings({ assist1: createAssist() })
        // 关闭溯源：本用例只验证 charSkillLevel 等级化（U114 起非菲娜 3/5 根源也会提供等级增量）
        settings.assist1.traceOffRoots = resolveTraceOffRoots(undefined, 0, ASSIST_CHAR)
        const skills = getAssistCharSkills(settings, "assist1")
        expect(skills.map(skill => skill.名称)).toEqual(["快速出击", "涡旋电场", "战术节能"])
        expect(skills.map(skill => skill.等级)).toEqual([7, 8, 9])
        expect(getAssistCharSkills(createSettings({ team1: "-" }), "assist1")).toEqual([])
    })

    it("自定义 BUFF 静态三键计入协战回退展示等级", () => {
        const settings = createSettings({
            assist1: createAssist({ buffs: [["自定义BUFF", 1]], customBuff: [["E技能等级", 4]] }),
        })
        settings.assist1.traceOffRoots = resolveTraceOffRoots(undefined, 0, ASSIST_CHAR)
        expect(getAssistCharSkills(settings, "assist1").map(skill => skill.等级)).toEqual([11, 8, 9])
    })

    it("映射不修改入参", () => {
        const settings = createSettings({ assist1: createAssist(), extraMastery: "长柄" })
        const snapshot = structuredClone(settings)
        getAssistFacade(settings, "assist1")
        mapAssistPatch(settings, "assist1", {
            charId: OTHER_CHAR,
            meleeWeapon: RANGED_WEAPON,
            charLevel: 79,
            customVariables: [["a", "b"]],
        })
        resetAssistForChar(settings, "assist1")
        expect(settings).toEqual(snapshot)
    })

    describe("未归一化的 assistN（换键 / 种子直写后的短暂状态）", () => {
        /** 模拟 useCharSettings 换键时读入的原始存档：只保留部分字段 */
        function createPartialSettings(assist1: unknown): CharSettings {
            return { ...normalizeCharSettings({ team1: ASSIST_CHAR, team1Weapon: MELEE_WEAPON }), assist1 } as CharSettings
        }

        it("缺 charSkillLevel / customVariables / dotSettings 时返回默认值且不抛错", () => {
            const settings = createPartialSettings({ charLevel: 55, baseName: "涡旋电场" })
            const facade = getAssistFacade(settings, "assist1")
            expect(facade.charSkillLevel).toEqual([10, 10, 10])
            expect(facade.customVariables).toEqual([])
            expect(facade.dotSettings).toEqual({ skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false })
            expect(facade.charLevel).toBe(55)
            expect(facade.baseName).toBe("涡旋电场")
            expect(facade.enabled).toBe(true)
        })

        it("assistN 整体缺失或为脏值时不抛错", () => {
            for (const value of [undefined, null, "bad", 42, []]) {
                const settings = createPartialSettings(value)
                const facade = getAssistFacade(settings, "assist1")
                expect(facade.charSkillLevel).toEqual([10, 10, 10])
                expect(facade.charId).toBe(ASSIST_CHAR)
                expect(facade.meleeWeapon).toBe(MELEE_WEAPON)
            }
        })

        it("mapAssistPatch / getAssistCharSkills 对部分字段不崩溃，钳制回退用归一化默认值", () => {
            const settings = createPartialSettings({ charLevel: 55 })
            // 关闭溯源：本用例只验证钳制回退的默认等级
            settings.assist1.traceOffRoots = resolveTraceOffRoots(undefined, 0, ASSIST_CHAR)
            expect(mapAssistPatch(settings, "assist1", { charLevel: Number.NaN }).assist.charLevel).toBe(55)
            expect(mapAssistPatch(settings, "assist1", { meleeWeaponLevel: Number.NaN }).assist.weaponLevel).toBe(80)
            // 运行时脏值（旧存档 / 外部写入）：单数字应按三项展开
            const dirtyLevels = 12 as unknown as [number, number, number]
            expect(mapAssistPatch(settings, "assist1", { charSkillLevel: dirtyLevels }).assist.charSkillLevel).toEqual([12, 12, 12])
            expect(getAssistCharSkills(settings, "assist1").map(skill => skill.等级)).toEqual([10, 10, 10])
            expect(resetAssistForChar(settings, "assist1")).toEqual({ baseName: "快速出击", extraMastery: "", enabled: true })
        })
    })

    it("useCharSettings：换键读入的原始存档会被重新归一化", async () => {
        const charId = ref(1101)
        const settings = useCharSettings(charId)
        settings.value = { ...settings.value, assist1: { charLevel: 55 } } as CharSettings

        charId.value = 4101
        await nextTick()

        const assist = settings.value.assist1 as Partial<AssistCharSettings>
        expect(assist.charSkillLevel).toEqual([10, 10, 10])
        expect(assist.customVariables).toEqual([])
        expect(assist.dotSettings).toEqual({ skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false })
        expect(assist.charLevel).toBe(55)
    })

    describe("convertTopSettingsToAssist", () => {
        function createTop(patch: CharSettingsInput = {}): CharSettings {
            return normalizeCharSettings({ ...createDefaultCharSettings(), ...patch })
        }

        function filledSlots(length: number, first: [number, number]): ([number, number] | null)[] {
            const slots = Array<[number, number] | null>(length).fill(null)
            slots[0] = [...first] as [number, number]
            return slots
        }

        it("整体搬运 MOD / BUFF / 特效 / 目标等字段，且与来源相互独立", () => {
            const top = createTop({
                charLevel: 70,
                charSkillLevel: [11, 12, 13],
                baseName: "涡旋电场",
                extraMastery: "长柄",
                meleeWeaponLevel: 80,
                meleeWeaponRefine: 5,
                targetFunction: "技能威力*2",
                customVariables: [["x", "1+1"]],
                dotSettings: { skill: 1, melee: 2, ranged: 3, skillweapon: 4, forceOwnAdditionalDamage: true },
                auraMod: 31524,
                charMods: filledSlots(8, [30001, 5]),
                meleeMods: filledSlots(8, [30002, 4]),
                rangedMods: filledSlots(8, [30003, 3]),
                skillWeaponMods: filledSlots(4, [30004, 2]),
                modVariantIndex: 1,
                modVariants: [
                    {
                        中枢: 31525,
                        角色: filledSlots(8, [31001, 1]),
                        近战: filledSlots(8, [31002, 1]),
                        远程: filledSlots(8, [31003, 1]),
                        同律: filledSlots(4, [31004, 1]),
                    },
                ],
                buffs: [["狂热", 3, 0.5]],
                customBuff: [["攻击", 100]],
                useGlobal: true,
                effectConfig: { "m:30001": 2 },
            })
            const snapshot = structuredClone(top)
            const { assist, weaponId, baseNameFallback } = convertTopSettingsToAssist(top, ASSIST_CHAR, MELEE_WEAPON, false)

            expect(baseNameFallback).toBe(false)
            expect(weaponId).toBe(MELEE_WEAPON)
            expect(assist.charLevel).toBe(70)
            expect(assist.charSkillLevel).toEqual([11, 12, 13])
            expect(assist.baseName).toBe("涡旋电场")
            expect(assist.extraMastery).toBe("长柄")
            expect(assist.weaponLevel).toBe(80)
            expect(assist.weaponRefine).toBe(5)
            expect(assist.targetFunction).toBe("技能威力*2")
            expect(assist.customVariables).toEqual([["x", "1+1"]])
            expect(assist.dotSettings).toEqual({ skill: 1, melee: 2, ranged: 3, skillweapon: 4, forceOwnAdditionalDamage: true })
            expect(assist.auraMod).toBe(31524)
            expect(assist.charMods[0]).toEqual([30001, 5])
            expect(assist.meleeMods[0]).toEqual([30002, 4])
            expect(assist.rangedMods[0]).toEqual([30003, 3])
            expect(assist.skillWeaponMods[0]).toEqual([30004, 2])
            expect(assist.modVariantIndex).toBe(1)
            expect(assist.modVariants).toHaveLength(1)
            expect(assist.modVariants[0].中枢).toBe(31525)
            expect(assist.modVariants[0].角色[0]).toEqual([31001, 1])
            expect(assist.buffs).toEqual([["狂热", 3, 0.5]])
            expect(assist.customBuff).toEqual([["攻击", 100]])
            expect(assist.useGlobal).toBe(true)
            expect(assist.effectConfig).toEqual({ "m:30001": 2 })
            expect(assist.enabled).toBe(false)

            expect(assist.charMods[0]).not.toBe(top.charMods[0])
            expect(assist.modVariants[0]).not.toBe(top.modVariants[0])
            expect(assist.buffs[0]).not.toBe(top.buffs[0])
            assist.charMods[0] = null
            assist.buffs.push(["坚韧", 1])
            expect(top).toEqual(snapshot)
        })

        it("远程单武器取远程槽的等级与精炼", () => {
            const top = createTop({ meleeWeaponLevel: 80, meleeWeaponRefine: 5, rangedWeaponLevel: 60, rangedWeaponRefine: 1 })
            const { assist, weaponId } = convertTopSettingsToAssist(top, ASSIST_CHAR, RANGED_WEAPON)
            expect(weaponId).toBe(RANGED_WEAPON)
            expect(assist.weaponLevel).toBe(60)
            expect(assist.weaponRefine).toBe(1)
        })

        it("空武器时按来源推荐：单把直用，两把按计算技能归属", () => {
            const meleeSkill = weaponMap.get(MELEE_WEAPON)?.技能?.[0]?.名称 ?? ""
            const rangedSkill = weaponMap.get(RANGED_WEAPON)?.技能?.[0]?.名称 ?? ""
            expect(meleeSkill).not.toBe("")
            expect(rangedSkill).not.toBe("")

            expect(suggestAssistWeapon(createTop({ meleeWeapon: MELEE_WEAPON, rangedWeapon: 0 }))).toBe(MELEE_WEAPON)
            expect(suggestAssistWeapon(createTop({ meleeWeapon: 0, rangedWeapon: RANGED_WEAPON }))).toBe(RANGED_WEAPON)
            expect(suggestAssistWeapon(createTop({ meleeWeapon: 0, rangedWeapon: 0 }))).toBe(0)
            const both = { meleeWeapon: MELEE_WEAPON, rangedWeapon: RANGED_WEAPON } as const
            expect(suggestAssistWeapon(createTop({ ...both, baseName: meleeSkill }))).toBe(MELEE_WEAPON)
            expect(suggestAssistWeapon(createTop({ ...both, baseName: rangedSkill }))).toBe(RANGED_WEAPON)
            expect(suggestAssistWeapon(createTop({ ...both, baseName: "涡旋电场" }))).toBe(MELEE_WEAPON)
        })

        it("空武器时推荐结果随转换返回，并取对应槽位等级", () => {
            const rangedSkill = weaponMap.get(RANGED_WEAPON)?.技能?.[0]?.名称 ?? ""
            const top = createTop({
                meleeWeapon: MELEE_WEAPON,
                rangedWeapon: RANGED_WEAPON,
                baseName: rangedSkill,
                rangedWeaponLevel: 55,
                rangedWeaponRefine: 2,
            })
            const { assist, weaponId, baseNameFallback } = convertTopSettingsToAssist(top, ASSIST_CHAR, "-")
            expect(weaponId).toBe(RANGED_WEAPON)
            expect(assist.weaponLevel).toBe(55)
            expect(assist.weaponRefine).toBe(2)
            expect(baseNameFallback).toBe(true)
            expect(assist.baseName).toBe("快速出击")
        })

        it("来源技能不在协战技能表内时回退并标记，在表内不标记", () => {
            const fallback = convertTopSettingsToAssist(createTop({ baseName: "不存在的技能" }), ASSIST_CHAR, MELEE_WEAPON)
            expect(fallback.baseNameFallback).toBe(true)
            expect(fallback.assist.baseName).toBe("快速出击")

            const kept = convertTopSettingsToAssist(createTop({ baseName: "战术节能" }), ASSIST_CHAR, MELEE_WEAPON)
            expect(kept.baseNameFallback).toBe(false)
            expect(kept.assist.baseName).toBe("战术节能")
        })

        it("启用位：传入则保留，不传按角色有效性推断", () => {
            const top = createTop()
            expect(convertTopSettingsToAssist(top, ASSIST_CHAR, MELEE_WEAPON, false).assist.enabled).toBe(false)
            expect(convertTopSettingsToAssist(top, ASSIST_CHAR, MELEE_WEAPON, true).assist.enabled).toBe(true)
            expect(convertTopSettingsToAssist(top, ASSIST_CHAR, MELEE_WEAPON).assist.enabled).toBe(true)
            expect(convertTopSettingsToAssist(top, "-", MELEE_WEAPON).assist.enabled).toBe(false)
        })
    })
})

describe("溯源关闭列表携带（U113）", () => {
    it("facade 携带关闭列表（缺省为空数组）", () => {
        const facade = getAssistFacade(createSettings({ assist1: createAssist({ traceOffRoots: [2] }) }), "assist1")
        expect(facade.traceOffRoots).toEqual([2])
        const empty = getAssistFacade(createSettings({ assist1: createAssist() }), "assist1")
        expect(empty.traceOffRoots).toEqual([])
    })

    it("mapAssistPatch：旧字段 patch 清空关闭列表，新字段直接写回", () => {
        const settings = createSettings({ assist1: createAssist({ traceOffRoots: [2] }) })
        const legacy = mapAssistPatch(settings, "assist1", { traceLevel: 0 }).assist
        expect(legacy.traceLevel).toBe(0)
        expect(legacy.traceOffRoots).toBeUndefined()
        const next = mapAssistPatch(settings, "assist1", { traceOffRoots: [1, 3] }).assist
        expect(next.traceOffRoots).toEqual([1, 3])
    })

    it("convertTopSettingsToAssist 拷贝关闭列表", () => {
        const converted = convertTopSettingsToAssist(createSettings({ traceOffRoots: [2] }), ASSIST_CHAR, MELEE_WEAPON)
        expect(converted.assist.traceOffRoots).toEqual([2])
    })
})

describe("溯源层数设置携带（U115）", () => {
    it("facade / patch / convert 携带 traceStacks（缺省为空数组）", () => {
        const facade = getAssistFacade(createSettings({ assist1: createAssist({ traceStacks: [[1, 2, 0.5]] }) }), "assist1")
        expect(facade.traceStacks).toEqual([[1, 2, 0.5]])
        const empty = getAssistFacade(createSettings({ assist1: createAssist() }), "assist1")
        expect(empty.traceStacks).toEqual([])

        const next = mapAssistPatch(createSettings({ assist1: createAssist() }), "assist1", { traceStacks: [[1, 3]] }).assist
        expect(next.traceStacks).toEqual([[1, 3]])

        const converted = convertTopSettingsToAssist(createSettings({ traceStacks: [[1, 2, 0.5]] }), ASSIST_CHAR, MELEE_WEAPON)
        expect(converted.assist.traceStacks).toEqual([[1, 2, 0.5]])
    })
})
