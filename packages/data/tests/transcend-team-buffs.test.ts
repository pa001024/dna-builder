import { describe, expect, it } from "vitest"
import { createAssistBuildFromSettings, createCharBuildFromSettings } from "../CharBuildHelper"
import { type CharSettings, createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { charMap } from "../d"
import type { DnaSeasonAffix } from "../d/dnaseasonequip.data"
import type { Buff } from "../data-types"
import {
    buildTranscendTeamSides,
    collectTranscendEffects,
    resolveGearEffects,
    TRANSCEND_BUFF_SOURCE,
    type TranscendDataTables,
    type TranscendEffects,
    type TranscendTeamSideContext,
} from "../transcend"
import { TRANSCEND_BUFF_MAP, type TranscendTeammateMeta, UNIQUE_AFFIX_MAP } from "../transcendBuffs"
import { createDefaultTranscendBuildSettings, createTranscendBuild } from "../transcendBuild"
import { addTranscendGearVariant, switchTranscendGearVariant, type TranscendGearEntry, type TranscendSlotGroup } from "../transcendSettings"

const MAIN_ID = charMap.get("妮弗尔夫人")!.id
const ASSIST1_ID = charMap.get("莉兹贝尔")!.id
const ASSIST2_ID = charMap.get("刻舟")!.id
const BUFF_NAME = "升华·激昂号令"
/** synthetic 队友词条 id：不在数据表里 → `getAffixSlotTypes` 为空 → 任意槽位可装 */
const SYNTH_A = 9902015
const SYNTH_B = 9902016
const SYNTH_C = 9902017

/**
 * 读取角色技能名（数据表的 `Skill.名称` 为可选字段）。
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
function gear(slotId: number, affixId = 2015): TranscendGearEntry {
    return {
        slotId,
        affixId,
        rollLevel: 1,
        masterworkLevel: 0,
        ancient: false,
        finalMasterwork: false,
    }
}

/**
 * 主控 + 两名协战的完整配置（升华默认关闭）：武器均用同一把近战。
 * @param mainId 主控角色 id（默认妮弗尔夫人）
 * @returns 已归一化的配置
 */
function createTeamSettings(mainId = MAIN_ID): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(mainId, 1)
    settings.charSkillLevel = [10, 10, 10]
    settings.meleeWeapon = 10302
    settings.rangedWeapon = 20601
    settings.auraMod = 0
    settings.team1 = ASSIST1_ID
    settings.team1Weapon = 10302
    settings.team2 = ASSIST2_ID
    settings.team2Weapon = 10302
    settings.assist1 = { ...settings.assist1, charLevel: 80, charSkillLevel: [10, 10, 10], baseName: charSkillName(ASSIST1_ID) }
    settings.assist2 = { ...settings.assist2, charLevel: 80, charSkillLevel: [10, 10, 10], baseName: charSkillName(ASSIST2_ID) }
    settings.targetFunction = "伤害"
    return normalizeCharSettings(settings)
}

/** 覆写升华装备组并启用总开关（原地修改） */
function enableGear(
    settings: CharSettings,
    groups: { mainGear?: TranscendGearEntry[]; assist1Gear?: TranscendGearEntry[]; assist2Gear?: TranscendGearEntry[] }
): CharSettings {
    settings.transcend = {
        ...settings.transcend,
        enabled: true,
        mainGear: groups.mainGear ?? [],
        assist1Gear: groups.assist1Gear ?? [],
        assist2Gear: groups.assist2Gear ?? [],
    }
    return settings
}

/** 取某构筑位的升华派生 BUFF（`pt` 只由 `collectTranscendEffects` 写入） */
function collectSide(
    settings: CharSettings,
    side: TranscendSlotGroup,
    tables?: TranscendDataTables,
    teamSides?: readonly TranscendTeamSideContext[]
): TranscendEffects {
    const charId = side === "main" ? MAIN_ID : side === "assist1" ? ASSIST1_ID : ASSIST2_ID
    return collectTranscendEffects(settings.transcend, side, {
        charId,
        charElement: "光",
        teamSides: teamSides ?? buildTranscendTeamSides(settings, MAIN_ID),
        tables,
    })
}

/** synthetic 队友词条：注册映射与 BUFF，测试结束后恢复（不改持久化数据） */
interface SyntheticAffixSpec {
    id: number
    team: TranscendTeammateMeta
    buff?: Partial<Buff>
    /** `addSkillLevel` 等词条级覆盖 */
    affix?: Partial<DnaSeasonAffix>
}

/**
 * 在内存里临时注册 synthetic 队友词条（`UNIQUE_AFFIX_MAP` + `TRANSCEND_BUFF_MAP` + `tables.affixes`），
 * 回调结束后逐项恢复；用于覆盖 `all-teammates` / `single` / `maxStacksPerSource` 等当前数据不可达的分支。
 * @param specs 词条定义
 * @param run 使用注入数据表的回调
 * @returns 回调结果
 */
function withSyntheticAffixes<T>(specs: readonly SyntheticAffixSpec[], run: (tables: TranscendDataTables) => T): T {
    const affixOverrides: DnaSeasonAffix[] = []
    const cleanups: (() => void)[] = []
    for (const spec of specs) {
        const buffName = `测试·队友限定${spec.id}`
        const savedMapping = UNIQUE_AFFIX_MAP[spec.id]
        const savedBuff = TRANSCEND_BUFF_MAP.get(buffName)
        affixOverrides.push({ id: spec.id, plan: 4, minValue: 1, maxValue: 1, totalValueLevel: 1, ...spec.affix })
        UNIQUE_AFFIX_MAP[spec.id] = { buffs: [buffName], status: "handwritten", team: spec.team }
        TRANSCEND_BUFF_MAP.set(buffName, { 名称: buffName, attr: { 昂扬: 1 }, ...spec.buff })
        cleanups.push(() => {
            if (savedMapping) UNIQUE_AFFIX_MAP[spec.id] = savedMapping
            else delete UNIQUE_AFFIX_MAP[spec.id]
            if (savedBuff) TRANSCEND_BUFF_MAP.set(buffName, savedBuff)
            else TRANSCEND_BUFF_MAP.delete(buffName)
        })
    }
    try {
        return run({ affixes: affixOverrides })
    } finally {
        for (const cleanup of cleanups) cleanup()
    }
}

describe("U93b 队友限定升华 BUFF（2015 跨侧注入）", () => {
    it("仅协战一装备 210003：主控 / 协战二各 1 份，协战一自身 0 份", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)] })
        const main = collectSide(settings, "main")
        const assist1 = collectSide(settings, "assist1")
        const assist2 = collectSide(settings, "assist2")

        expect(main.buffs.map(buff => buff.名称)).toEqual([BUFF_NAME])
        expect(assist2.buffs.map(buff => buff.名称)).toEqual([BUFF_NAME])
        expect(assist1.buffs).toEqual([])
        expect(main.buffs[0].pt).toBe(TRANSCEND_BUFF_SOURCE)
        expect(main.buffs[0].source).toMatchObject({
            kind: "gear",
            id: 2015,
            slotId: 9,
            ownerSide: "assist1",
            stackKey: "team:assist1:gear:9:-:2015:other:0",
        })
        // 派生 BUFF 只存在于构筑实例，不写任何持久化字段
        expect(settings.buffs).toEqual([])
    })

    it("协战一 + 协战二都装备：主控 2 份（昂扬 8.6 / 技速加成 1.6），两个协战各 1 份", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)], assist2Gear: [gear(13)] })
        const main = collectSide(settings, "main")

        expect(main.buffs).toHaveLength(2)
        expect(main.buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist1", "assist2"])
        expect(collectSide(settings, "assist1").buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist2"])
        expect(collectSide(settings, "assist2").buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist1"])

        const attributes = createCharBuildFromSettings(MAIN_ID, settings).calculateAttributes()
        expect(attributes.昂扬).toBeCloseTo(8.6, 6)
        // 属性表里技能速度 = 1（基础）+ 加成；两份 0.8 加成后仍低于 2.8 上限
        expect(attributes.技能速度 - 1).toBeCloseTo(1.6, 6)
        expect(attributes.技能速度).toBeLessThan(2.8)
    })

    it("v2 暗金专属行（source:unique）的跨侧 stackKey 使用来源类后缀", () => {
        const settings = createTeamSettings()
        settings.transcend = {
            ...settings.transcend,
            enabled: true,
            assist1Gear: [
                {
                    slotId: 9,
                    item: {
                        kind: "unique",
                        slotType: 8,
                        uniqueId: 210003,
                        uniqueAffix: { affixId: 2015, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false },
                        affixes: [],
                    },
                },
            ],
        }
        const normalized = normalizeCharSettings(settings)
        const main = collectSide(normalized, "main")
        expect(main.buffs.map(buff => buff.名称)).toEqual([BUFF_NAME])
        // 专属来源归入 other 类；key 仍是 5 段（装备位 + 孔位 + 词条 + 来源类）
        expect(main.buffs[0].source).toMatchObject({
            ownerSide: "assist1",
            stackKey: "team:assist1:gear:9:-:2015:other:0",
            affixSourceClass: "other",
        })
    })

    it("同 id 随机 + 淬炼双行 + team single：按效果下标分组，仍只保留一份", () => {
        withSyntheticAffixes(
            [
                {
                    id: SYNTH_A,
                    team: { target: "all-teammates", trigger: "passive", duration: -1, stackScope: "single" },
                },
            ],
            tables => {
                const buffName = `测试·队友限定${SYNTH_A}`
                const settings = enableGear(createTeamSettings(), {
                    mainGear: [
                        { ...gear(1, SYNTH_A), source: "random" as const },
                        { ...gear(1, SYNTH_A), source: "tempering" as const },
                    ],
                })
                // 本地：两行同 id 但 single 口径只取最早一份
                const main = collectSide(settings, "main", tables).buffs.filter(buff => buff.名称 === buffName)
                expect(main).toHaveLength(1)
                // 跨侧：派生副本同样只保留一份（不按来源类翻倍）
                const assist1 = collectSide(settings, "assist1", tables).buffs.filter(buff => buff.名称 === buffName)
                expect(assist1).toHaveLength(1)
                expect(assist1[0].source?.ownerSide).toBe("main")
            }
        )
    })

    it("协战一 enabled=false：既不做来源也不做受益方", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)], assist2Gear: [gear(13)] })
        settings.assist1.enabled = false
        const sides = buildTranscendTeamSides(settings, MAIN_ID)
        expect(sides.find(side => side.side === "assist1")?.active).toBe(false)

        const main = collectSide(settings, "main")
        expect(main.buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist2"])
        const assist1 = collectTranscendEffects(settings.transcend, "assist1", {
            charId: ASSIST1_ID,
            charElement: "光",
            teamSides: sides,
        })
        expect(assist1.buffs).toEqual([])
        // 协战二只装备了自己：停用的协战一不作为来源，因此协战二自身 0 份
        expect(collectSide(settings, "assist2").buffs).toEqual([])
    })

    it("升华总开关关闭：不产生任何派生 BUFF", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)], assist2Gear: [gear(13)] })
        settings.transcend.enabled = false
        for (const side of ["main", "assist1", "assist2"] as const) {
            expect(collectSide(settings, side).buffs).toEqual([])
        }
    })

    it("有意行为：无 teamSides 时不跨侧，本地 other-teammates 仍被屏蔽（不再自注入）", () => {
        // TASKS §2 / RESEARCH §Computation：2015 只给其他构筑位，不存在「旧的自身注入」兼容
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)] })
        const main = collectTranscendEffects(settings.transcend, "main", { charId: MAIN_ID, charElement: "光" })
        const assist1 = collectTranscendEffects(settings.transcend, "assist1", { charId: ASSIST1_ID, charElement: "光" })
        expect(main.buffs).toEqual([])
        expect(assist1.buffs).toEqual([])
    })

    it("装备变体 A/B/C：只按激活变体派生，切换后结果随之变化", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)] })
        const variantB = addTranscendGearVariant(settings.transcend)!
        // B 组卸下 210003
        settings.transcend.assist1Gear = []
        expect(collectSide(settings, "main").buffs).toEqual([])

        expect(switchTranscendGearVariant(settings.transcend, "A")).toBe(true)
        expect(variantB).not.toBe("A")
        expect(collectSide(settings, "main").buffs).toHaveLength(1)
    })

    it("source.ownerSide / stackKey 稳定且可重复；同来源重复条目不产生两份", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9), gear(9)] })
        const first = collectSide(settings, "main")
        const second = collectSide(settings, "main")
        expect(first.buffs).toHaveLength(1)
        expect(second.buffs.map(buff => buff.source?.stackKey)).toEqual(first.buffs.map(buff => buff.source?.stackKey))
        expect(first.buffs[0].source?.ownerSide).toBe("assist1")
    })

    it("未知 / 缺失角色不抛错；缺失协战不参与来源", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)] })
        const sides = buildTranscendTeamSides(settings, undefined)
        expect(sides.map(side => side.active)).toEqual([false, true, true])
        const effects = collectTranscendEffects(settings.transcend, "assist1", { charId: ASSIST1_ID, charElement: "光", teamSides: sides })
        // 主控来源缺失时仍可被其它协战受益，但主控自身不作为来源
        expect(effects.buffs).toHaveLength(0)
        expect(collectTranscendEffects(settings.transcend, "main", { teamSides: [] }).buffs).toEqual([])
    })

    it("CharBuild 构造自动接线：主控与协战 build 都带应得派生 BUFF", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)], assist2Gear: [gear(13)] })
        const names = (build: { buffs: { 名称: string; pt?: string }[] }) =>
            build.buffs.filter(buff => buff.pt === TRANSCEND_BUFF_SOURCE).map(buff => buff.名称)

        const main = createCharBuildFromSettings(MAIN_ID, settings)
        expect(names(main)).toEqual([BUFF_NAME, BUFF_NAME])
        const assist1 = createAssistBuildFromSettings(settings, "assist1", undefined, { mainCharId: MAIN_ID })!
        expect(names(assist1)).toEqual([BUFF_NAME])
        const assist2 = createAssistBuildFromSettings(settings, "assist2", undefined, { mainCharId: MAIN_ID })!
        expect(names(assist2)).toEqual([BUFF_NAME])
    })

    it("主控 8 号位不可装 2015（槽型 7 vs 8）：主控作为来源在本地模型不可达", () => {
        const result = resolveGearEffects([gear(8)], "main", { charId: MAIN_ID })
        expect(result.entries).toEqual([])
        expect(result.warnings.join()).toContain("不能装备")
    })

    it("buildTranscendTeamSides 接受数字字符串 charId（与构筑工厂 toId 同口径）", () => {
        const settings = createTeamSettings()
        settings.team2 = String(ASSIST2_ID) as unknown as number
        expect(buildTranscendTeamSides(settings, MAIN_ID)[2]).toMatchObject({ charId: ASSIST2_ID, active: true })
    })
})

describe("U127 180102 下午茶追伤：自身与队友各一份（all-teammates）", () => {
    const FEINA_ID = charMap.get("菲娜")!.id

    it("main 装备 → main 本地 1 份 + 协战一 / 协战二各 1 份（owner=main），不重复计数", () => {
        const settings = enableGear(createTeamSettings(FEINA_ID), { mainGear: [gear(5, 180102)] })
        const teamSides = buildTranscendTeamSides(settings, FEINA_ID)
        const context = (side: TranscendSlotGroup, charId: number) =>
            collectTranscendEffects(settings.transcend, side, { charId, charElement: "光", teamSides })
        const chaseBuffs = (side: TranscendSlotGroup, charId: number) =>
            context(side, charId).buffs.filter(buff => buff.名称 === "升华·下午茶追伤")

        expect(UNIQUE_AFFIX_MAP[180102].team).toEqual({
            target: "all-teammates",
            trigger: "passive",
            duration: -1,
            stackScope: "per-source",
            maxStacksPerSource: 1,
        })

        // 来源侧只保留本地一份（不被跨侧自注入），四属性各 20%
        const main = chaseBuffs("main", FEINA_ID)
        expect(main).toHaveLength(1)
        expect(main[0].source?.ownerSide).toBeUndefined()
        expect(main[0].source?.stackKey).toBeUndefined()
        expect(main[0].values).toEqual({ 水属性追伤: 0.2, 火属性追伤: 0.2, 雷属性追伤: 0.2, 风属性追伤: 0.2 })

        for (const [side, charId] of [
            ["assist1", ASSIST1_ID],
            ["assist2", ASSIST2_ID],
        ] as const) {
            const buffs = chaseBuffs(side, charId)
            expect(buffs, side).toHaveLength(1)
            expect(buffs[0].values, side).toEqual({ 水属性追伤: 0.2, 火属性追伤: 0.2, 雷属性追伤: 0.2, 风属性追伤: 0.2 })
            expect(buffs[0].source, side).toMatchObject({ ownerSide: "main", stackKey: "team:main:gear:5:-:180102:other:0" })
        }
    })
})

describe("U137 收益快照 suppress 透传到跨侧来源", () => {
    it("2015 昂扬：suppress 只去掉昂扬，技能速度仍注入", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)] })
        const teamSides = buildTranscendTeamSides(settings, MAIN_ID)
        const collect = (suppress?: { affixId: number; attrs?: string[] }) =>
            collectTranscendEffects(settings.transcend, "main", { charId: MAIN_ID, charElement: "光", teamSides, suppress })

        const plain = collect()
        const suppressed = collect({ affixId: 2015, attrs: ["昂扬"] })

        expect(plain.buffs).toHaveLength(1)
        expect(plain.buffs[0].values).toEqual({ 昂扬: 4.3, 技能速度: 0.8 })
        expect(suppressed.buffs).toHaveLength(1)
        expect(suppressed.buffs[0].values).toEqual({ 技能速度: 0.8 })
    })

    it("suppress 限定 ownerSide：同一 2015 两侧共存只抑制对应侧副本", () => {
        const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9)], assist2Gear: [gear(13)] })
        const teamSides = buildTranscendTeamSides(settings, MAIN_ID)
        const collect = (suppress?: { affixId: number; attrs?: string[]; ownerSide?: "main" | "assist1" | "assist2" }) =>
            collectTranscendEffects(settings.transcend, "main", { charId: MAIN_ID, charElement: "光", teamSides, suppress })
        const valuesOf = (suppress?: Parameters<typeof collect>[0]) => collect(suppress).buffs.map(buff => buff.values)

        expect(valuesOf()).toEqual([
            { 昂扬: 4.3, 技能速度: 0.8 },
            { 昂扬: 4.3, 技能速度: 0.8 },
        ])
        // 只抑制协战一副本：协战二那份昂扬仍进入主控
        expect(valuesOf({ affixId: 2015, attrs: ["昂扬"], ownerSide: "assist1" })).toEqual([
            { 技能速度: 0.8 },
            { 昂扬: 4.3, 技能速度: 0.8 },
        ])
        expect(valuesOf({ affixId: 2015, attrs: ["昂扬"], ownerSide: "assist2" })).toEqual([
            { 昂扬: 4.3, 技能速度: 0.8 },
            { 技能速度: 0.8 },
        ])
    })

    it("180102 all-teammates：跨侧副本同样按 suppress 去掉命中的属性键", () => {
        const FEINA_ID = charMap.get("菲娜")!.id
        const settings = enableGear(createTeamSettings(FEINA_ID), { mainGear: [gear(5, 180102)] })
        const teamSides = buildTranscendTeamSides(settings, FEINA_ID)
        const collect = (suppress?: { affixId: number; attrs?: string[] }) =>
            collectTranscendEffects(settings.transcend, "assist1", {
                charId: ASSIST1_ID,
                charElement: "光",
                teamSides,
                suppress,
            })

        expect(collect().buffs[0].values).toEqual({ 水属性追伤: 0.2, 火属性追伤: 0.2, 雷属性追伤: 0.2, 风属性追伤: 0.2 })
        expect(collect({ affixId: 180102, attrs: ["水属性追伤"] }).buffs[0].values).toEqual({
            火属性追伤: 0.2,
            雷属性追伤: 0.2,
            风属性追伤: 0.2,
        })
    })
})

describe("U93b-fix 队友限定范式分支（synthetic 词条）", () => {
    it("all-teammates：受益侧本地副本与跨侧副本并存（per-source）", () => {
        withSyntheticAffixes([{ id: SYNTH_A, team: { target: "all-teammates", stackScope: "per-source" } }], tables => {
            const settings = enableGear(createTeamSettings(), {
                mainGear: [gear(1, SYNTH_A)],
                assist1Gear: [gear(9, SYNTH_A)],
            })
            // 主控：自身 + 协战一各一份；本地副本在前
            expect(collectSide(settings, "main", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual([undefined, "assist1"])
            // 协战一：自身 + 主控各一份
            expect(collectSide(settings, "assist1", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual([undefined, "main"])
        })
    })

    it("single：local + cross 统一按 affixId 只保留稳定顺序最早一份", () => {
        withSyntheticAffixes([{ id: SYNTH_A, team: { target: "all-teammates", stackScope: "single" } }], tables => {
            const settings = enableGear(createTeamSettings(), {
                assist1Gear: [gear(9, SYNTH_A)],
                assist2Gear: [gear(13, SYNTH_A)],
            })
            // 全队唯一一份属于最早的协战一
            expect(collectSide(settings, "main", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist1"])
            // 协战一保留自己的本地副本（比协战二更早）
            expect(collectSide(settings, "assist1", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual([undefined])
            // 协战二拿协战一的一份
            expect(collectSide(settings, "assist2", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist1"])

            // 三人全装：主控本地副本最早，两个协战都只吃主控一份
            const all = enableGear(createTeamSettings(), {
                mainGear: [gear(1, SYNTH_A)],
                assist1Gear: [gear(9, SYNTH_A)],
                assist2Gear: [gear(13, SYNTH_A)],
            })
            expect(collectSide(all, "main", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual([undefined])
            expect(collectSide(all, "assist1", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual(["main"])
            expect(collectSide(all, "assist2", tables).buffs.map(buff => buff.source?.ownerSide)).toEqual(["main"])
        })
    })

    it("maxStacksPerSource：同来源同 affix 多件按上限注入；不同 affix 各自成层", () => {
        withSyntheticAffixes(
            [
                { id: SYNTH_A, team: { target: "all-teammates", stackScope: "per-source", maxStacksPerSource: 2 } },
                { id: SYNTH_B, team: { target: "all-teammates", stackScope: "per-source" } },
                { id: SYNTH_C, team: { target: "all-teammates", stackScope: "per-source" } },
            ],
            tables => {
                const settings = enableGear(createTeamSettings(), {
                    assist1Gear: [gear(9, SYNTH_A), gear(10, SYNTH_A), gear(11, SYNTH_B), gear(12, SYNTH_C), gear(9, SYNTH_C)],
                })
                const main = collectSide(settings, "main", tables)
                expect(main.buffs.map(buff => buff.source?.id)).toEqual([SYNTH_A, SYNTH_A, SYNTH_B, SYNTH_C])
            }
        )
    })

    it("来源侧不按来源元素丢弃队友 BUFF：`限定` 只按受益侧判定", () => {
        withSyntheticAffixes(
            [{ id: SYNTH_A, team: { target: "all-teammates", stackScope: "per-source" }, buff: { 限定: "光" } }],
            tables => {
                const settings = enableGear(createTeamSettings(), { assist1Gear: [gear(9, SYNTH_A)] })
                const sides: TranscendTeamSideContext[] = [
                    { side: "main", charId: MAIN_ID, charElement: "光", active: true },
                    // 来源元素（火）≠ BUFF 限定（光）：仍按受益侧判定
                    { side: "assist1", charId: ASSIST1_ID, charElement: "火", active: true },
                    { side: "assist2", active: false },
                ]
                const allowed = collectTranscendEffects(settings.transcend, "main", {
                    charId: MAIN_ID,
                    charElement: "光",
                    teamSides: sides,
                    tables,
                })
                expect(allowed.buffs).toHaveLength(1)
                const denied = collectTranscendEffects(settings.transcend, "main", {
                    charId: MAIN_ID,
                    charElement: "火",
                    teamSides: sides,
                    tables,
                })
                expect(denied.buffs).toEqual([])
            }
        )
    })

    it("跨侧只注入 BUFF：来源侧技能等级 / 技能替换 / 警告 / 建模说明不跨侧", () => {
        withSyntheticAffixes(
            [
                {
                    id: SYNTH_A,
                    team: { target: "all-teammates", stackScope: "per-source" },
                    affix: {
                        addSkillLevel: { skillTypes: ["Skill2"] },
                        skillReplacements: { 310201: { id: 310212, 名称: "测试替换", 类型: "测试" } },
                    },
                },
            ],
            tables => {
                const settings = enableGear(createTeamSettings(), {
                    assist1Gear: [gear(9, SYNTH_A), gear(10, 987654), gear(11, 987655)],
                })
                const main = collectSide(settings, "main", tables)
                expect(main.buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist1"])
                // 来源侧技能等级三键不跨侧：主控效果里没有三键 BUFF（合成技能等级条目不带 team 元数据）
                expect(main.buffs.some(buff => (buff.名称 ?? "").endsWith("技能等级"))).toBe(false)
                expect(main.skillReplacements).toEqual({})
                expect(main.warnings).toEqual([])
                expect(main.modelingNotes).toEqual([])
            }
        )
    })

    it("主控天赋不跨侧：只有带 `team` 元数据的装备词条参与队友注入", () => {
        const settings = enableGear(createTeamSettings(), {})
        settings.transcend = { ...settings.transcend, talentLevels: [[100001, 1]] }
        expect(collectSide(settings, "main").buffs.map(buff => buff.名称)).toEqual(["升华天赋·攻击"])
        expect(collectSide(settings, "assist1").buffs).toEqual([])
    })

    it("懒团队解析器：主控来源的队友 BUFF 经 `角色名::属性` 进入协战 build", () => {
        // 150401 仅对主控 1504 生效且可装 1 号位；临时把它登记为 all-teammates
        const resolverMainId = charMap.get("苏乙")!.id
        const saved = UNIQUE_AFFIX_MAP[150401]
        UNIQUE_AFFIX_MAP[150401] = { ...saved, team: { target: "all-teammates", stackScope: "per-source" } }
        try {
            const assistName = charMap.get(ASSIST1_ID)!.名称
            const baseline = createTeamSettings(resolverMainId)
            baseline.transcend = { ...baseline.transcend, enabled: true, mainGear: [] }
            expect(createCharBuildFromSettings(resolverMainId, baseline).evaluateAST(`${assistName}::技能速度`)).toBeCloseTo(1, 6)

            const settings = createTeamSettings(resolverMainId)
            settings.transcend = { ...settings.transcend, enabled: true, mainGear: [gear(1, 150401)] }
            // 主控 +120% 技能速度通过懒解析器进入协战 build（缺 mainCharId 时为 1）
            expect(createCharBuildFromSettings(resolverMainId, settings).evaluateAST(`${assistName}::技能速度`)).toBeCloseTo(2.2, 6)
        } finally {
            UNIQUE_AFFIX_MAP[150401] = saved
        }
    })

    it("createTranscendBuild：三侧按净化后 loadout 派生（数字字符串 charId 仍作来源）", () => {
        const settings = createDefaultTranscendBuildSettings(MAIN_ID)
        // 只验证升华队友词条：关闭三侧溯源，避免派生 BUFF 混入 ownerSide 断言
        settings.main.traceLevel = 0
        settings.assist1.traceLevel = 0
        settings.assist2.traceLevel = 0
        settings.main.charId = MAIN_ID
        settings.assist1 = {
            ...settings.assist1,
            charId: ASSIST1_ID,
            enabled: true,
            meleeWeapon: 10302,
            baseName: charSkillName(ASSIST1_ID),
        }
        settings.assist2 = {
            ...settings.assist2,
            charId: String(ASSIST2_ID) as unknown as number,
            enabled: true,
            meleeWeapon: 10302,
            baseName: charSkillName(ASSIST2_ID),
        }
        settings.transcend = { ...settings.transcend, enabled: true, assist1Gear: [], assist2Gear: [gear(13)] }

        const assist1 = createTranscendBuild(settings, "assist1")
        expect(assist1?.build.buffs.map(buff => buff.source?.ownerSide)).toEqual(["assist2"])
    })
})
