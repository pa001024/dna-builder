import { afterEach, describe, expect, it, vi } from "vitest"
import {
    affixes,
    CharBuild,
    type CharSettings,
    charMap,
    createDefaultCharSettings,
    normalizeCharSettings,
    TRANSCEND_BUFF_MAP,
    type TranscendBuildSettings,
    type TranscendGearAffixRoll,
    type TranscendGearItemConfig,
    UNIQUE_AFFIX_MAP,
    uniqueEquips,
} from "@/data"
import { createAssistBuildFromSettings, createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { createBuildFromSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { computeCharTeamSnapshot } from "@/utils/char-team"
import { createTranscendGainContext } from "./gain-context"
import {
    createAffixIncomeCandidates,
    getAffixIncomeKey,
    getUniqueAffixIncomeKey,
    requestAffixIncomes,
    requestGearIncomes,
    withoutUniqueAffix,
} from "./income"
import type { GearIncomeRequest } from "./income.worker"
import { calculateTeamSnapshotDamage } from "./income-core"

/**
 * U137：收益一律按目标函数卡当前显示的团队合计测量。
 * baseline = `computeCharTeamSnapshot(...).total`（启用侧伤害之和），
 * 候选只改写 owner side 装备组后按同一口径重建全部启用侧。
 */

const MAIN_ID = charMap.get("妮弗尔夫人")!.id
const ASSIST1_ID = charMap.get("莉兹贝尔")!.id
const ASSIST2_ID = charMap.get("刻舟")!.id
const FU_SHU_ID = charMap.get("扶疏")!.id
/** synthetic 队友词条 id：不在数据表里 → 任意槽位可装 */
const SYNTH_TEAMMATE_ID = 9902015

/** 装备条目 */
interface GearEntry {
    slotId: number
    item: TranscendGearItemConfig
}

/**
 * 读取角色技能名。
 * @param charId 角色 id
 * @param index 技能索引
 * @returns 技能名称
 */
function skillName(charId: number, index = 0): string {
    const name = charMap.get(charId)?.技能?.[index]?.名称
    if (!name) throw new Error(`角色 ${charId} 缺少第 ${index} 个技能`)
    return name
}

/** 构造一条词条 roll（默认 50 级档位） */
function roll(affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll {
    return { affixId, rollLevel: 50, masterworkLevel: 0, ancient: false, finalMasterwork: false, ...patch }
}

/** 普通物品 */
function normalItem(slotType: number, affixId: number): TranscendGearItemConfig {
    return { kind: "normal", slotType, equipBaseScore: 50, affixes: [roll(affixId, { source: "random" })] }
}

/**
 * 唯一装物品（真实 `uniqueEquips` 身份，归一化不降级）。
 * @param affixId 专属词条 id
 * @returns 物品配置
 */
function uniqueItemOf(affixId: number): TranscendGearItemConfig {
    const equip = uniqueEquips.find(entry => entry.affixId === affixId)!
    return {
        kind: "unique",
        slotType: equip.slot,
        uniqueId: equip.id,
        affixes: [],
        uniqueAffix: roll(affixId, { source: "unique", rollLevel: 1 }),
    }
}

/** 主控槽位（1-8）中匹配该槽型的装备位 */
function mainSlotOf(slotType: number): number {
    return [1, 2, 3, 4, 5, 6, 7, 8].find(id => (id === 8 ? 7 : id) === slotType)!
}

/**
 * 三人完整配置：主控 + 两名协战均启用，各自使用本侧的伤害技能。
 * @param mainId 主控角色 id
 * @returns 归一化后的配置
 */
function createTeamSettings(mainId = MAIN_ID): CharSettings {
    const settings = createDefaultCharSettings()
    settings.baseName = skillName(mainId)
    settings.charSkillLevel = [10, 10, 10]
    settings.traceLevel = 0
    settings.meleeWeapon = 10302
    settings.rangedWeapon = 20601
    settings.auraMod = 0
    settings.targetFunction = "伤害"
    settings.team1 = ASSIST1_ID
    settings.team1Weapon = 10302
    settings.assist1 = {
        ...settings.assist1,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        traceLevel: 0,
        baseName: skillName(ASSIST1_ID),
        targetFunction: "伤害",
        enabled: true,
    }
    settings.team2 = ASSIST2_ID
    settings.team2Weapon = 10302
    settings.assist2 = {
        ...settings.assist2,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        traceLevel: 0,
        baseName: skillName(ASSIST2_ID),
        targetFunction: "伤害",
        enabled: true,
    }
    return normalizeCharSettings(settings)
}

/**
 * 写入升华装备组并启用总开关（原地修改：`item.slotType` 必须与槽位槽型一致）。
 * @param settings 角色配置
 * @param groups 三组装备条目
 * @returns 同一份配置
 */
function setGear(
    settings: CharSettings,
    groups: { mainGear?: GearEntry[]; assist1Gear?: GearEntry[]; assist2Gear?: GearEntry[] }
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

/** `requestGearIncomes` 只读取 `transcend`：完整设置到请求体的最小投影 */
function transcendOnly(settings: CharSettings): TranscendBuildSettings {
    return { transcend: settings.transcend } as unknown as TranscendBuildSettings
}

/** 真实求值 worker：与生产 worker 同口径（多侧快照求和） */
class RealWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    postMessage(request: GearIncomeRequest) {
        queueMicrotask(() => {
            const base = calculateTeamSnapshotDamage(request.baseline.map(entry => entry.build))
            const incomes: Record<string, number> = {}
            const failures: { key: string; error: string }[] = []
            for (const candidate of request.candidates) {
                const next = calculateTeamSnapshotDamage(candidate.builds.map(entry => entry.build))
                if (next.damage === undefined || base.damage === undefined) {
                    failures.push({ key: candidate.key, error: next.error ?? base.error ?? "build-unavailable" })
                    continue
                }
                incomes[candidate.key] = next.damage - base.damage
            }
            this.onmessage?.({ data: { id: request.id, baseline: base.damage, incomes, failures } } as unknown as MessageEvent)
        })
    }
    terminate() {}
}

/** 仅替换收益请求依赖的浏览器全局（node 测试环境没有 Worker / window） */
function installRuntimeStubs() {
    vi.stubGlobal("Worker", RealWorker)
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
}

/**
 * 页面等价主控构造（U137-fix）：与 `CharBuildView` 一样只传 `teamWeapons`，
 * 不显式给 `teamWeaponCategories`，用于验证页面与工厂同源。
 * @param build 工厂主控（取其已解析的字段做深拷贝）
 * @param teamWeapons 协战武器 id 列表
 * @returns 页面等价构筑
 */
function pageEquivalentMainBuild(build: CharBuild, teamWeapons: (number | string)[]): CharBuild {
    return new CharBuild({
        char: build.char.clone(),
        hpPercent: build.hpPercent,
        resonanceGain: build.resonanceGain,
        imbalance: build.imbalance,
        auraMod: build.auraMod ? build.auraMod.clone() : undefined,
        charMods: build.charMods.map(mod => (mod ? mod.clone() : null)),
        meleeMods: build.meleeMods.map(mod => (mod ? mod.clone() : null)),
        rangedMods: build.rangedMods.map(mod => (mod ? mod.clone() : null)),
        skillMods: build.skillMods.map(mod => (mod ? mod.clone() : null)),
        buffs: [...new Set([...build.buffs, ...build.dynamicBuffs])].map(buff => buff.clone()),
        melee: build.meleeWeapon.clone(),
        ranged: build.rangedWeapon.clone(),
        baseName: build.baseName,
        enemyId: build.enemyId,
        enemy: build.enemy.clone(),
        enemyLevel: build.enemyLevel,
        enemyResistance: build.enemyResistance,
        targetFunction: build.targetFunction,
        customVariables: build.customVariables.map(variable => [...variable] as [string, string]),
        skillLevel: [...build.baseSkillLevel],
        timeline: build.timeline,
        timelineDPS: build.timelineDPS,
        teamWeapons,
        extraMastery: build.extraMastery,
        dotSettings: { ...build.dotSettings },
        petBaseCd: build.petBaseCd,
        settings: build.settings,
        skillReplacements: build.skillReplacements,
        teamRole: "main",
    })
}

/**
 * 页面目标卡同口径的团队合计。
 * @param settings 完整配置
 * @returns 合计；不可用时为 null
 */
function panelTotal(settings: CharSettings): number | null {
    return computeCharTeamSnapshot({
        settings,
        charId: MAIN_ID,
        mainBuild: createCharBuildFromSettings(MAIN_ID, settings),
    }).total
}

/**
 * 指定团队快照组的伤害合计。
 * @param context 宿主收益上下文
 * @param side 装备所属构筑位
 * @param gear 该位装备组
 * @returns 团队合计
 */
function totalOfSnapshot(
    context: ReturnType<typeof createTranscendGainContext>,
    side: "main" | "assist1" | "assist2",
    gear: GearEntry[]
): number {
    const team = context.buildTeamSnapshots!(side, gear)!
    return calculateTeamSnapshotDamage(team.sides.map(entry => entry.build)).damage!
}

/**
 * synthetic 纯队友词条：临时注册词条 / 映射 / BUFF，结束后逐项恢复。
 * 真实数据里可装的 other-teammates 词条只有 2015（协战槽），主控侧规则用本夹具验证。
 * @param run 使用注入数据的回调
 * @returns 回调结果
 */
function withSyntheticTeammateAffix<T>(run: () => T): T {
    const affix = {
        id: SYNTH_TEAMMATE_ID,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "测试：释放终结技后使其他队友获得昂扬",
        planName: "专属词缀",
        mappingStatus: "handwritten",
    } as (typeof affixes)[number]
    const buffName = "测试·合成队友昂扬"
    const savedMapping = UNIQUE_AFFIX_MAP[SYNTH_TEAMMATE_ID]
    affixes.push(affix)
    UNIQUE_AFFIX_MAP[SYNTH_TEAMMATE_ID] = {
        buffs: [buffName],
        status: "handwritten",
        team: { target: "other-teammates", trigger: "ultimate", duration: -1, stackScope: "per-source", maxStacksPerSource: 1 },
    }
    TRANSCEND_BUFF_MAP.set(buffName, { 名称: buffName, attr: { 昂扬: 1 } })
    try {
        return run()
    } finally {
        const index = affixes.indexOf(affix)
        if (index >= 0) affixes.splice(index, 1)
        if (savedMapping) UNIQUE_AFFIX_MAP[SYNTH_TEAMMATE_ID] = savedMapping
        else delete UNIQUE_AFFIX_MAP[SYNTH_TEAMMATE_ID]
        TRANSCEND_BUFF_MAP.delete(buffName)
    }
}

describe("U137 团队合计快照", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("baseline 与 computeCharTeamSnapshot.total 一致（三侧启用，2015 在协战一）", async () => {
        installRuntimeStubs()
        const item = uniqueItemOf(2015)
        const gear = [{ slotId: 9, item }]
        const settings = setGear(createTeamSettings(), { assist1Gear: gear })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const team = context.buildTeamSnapshots!("assist1", gear)!

        expect(team.target).toBe("team")
        expect(team.sides.map(entry => entry.side)).toEqual(["main", "assist1", "assist2"])
        expect(calculateTeamSnapshotDamage(team.sides.map(entry => entry.build)).damage!).toBeCloseTo(panelTotal(settings)!, 8)

        const result = await requestGearIncomes({
            settings: transcendOnly(settings),
            side: "assist1",
            slotId: 9,
            candidates: [],
            gainContext: context,
        })
        expect(result.target).toBe("team")
        expect(result.baseline).toBeCloseTo(panelTotal(settings)!, 8)
    })

    it("缓存键覆盖合计口径 / 三侧角色 id（换口径或换队伍必须失效）", () => {
        const settings = createTeamSettings()
        const keyOf = (patch: Partial<CharSettings> = {}, charId = MAIN_ID) =>
            createTranscendGainContext({ settings: { ...settings, ...patch }, charId }).key
        const first = keyOf()

        expect(first.startsWith("team-total:v1\u0000")).toBe(true)
        expect(keyOf({}, ASSIST1_ID)).not.toBe(first)
        expect(keyOf({ team1: ASSIST2_ID })).not.toBe(first)
        expect(keyOf({ team2: "-" as number | "-" })).not.toBe(first)
        expect(keyOf({ mainTargetEnabled: false })).not.toBe(first)
        expect(keyOf({ assist1: { ...settings.assist1, enabled: false } })).not.toBe(first)
        expect(keyOf({ assist2: { ...settings.assist2, enabled: false } })).not.toBe(first)
        expect(keyOf({}, MAIN_ID)).toBe(first)
    })
})

describe("U137 协战装备收益 = 对团队合计的贡献", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("2015 装协战一：团队合计收益 > 0，协战一自身伤害不变", async () => {
        installRuntimeStubs()
        const item = uniqueItemOf(2015)
        const gear = [{ slotId: 9, item }]
        const settings = setGear(createTeamSettings(), { assist1Gear: gear })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const candidates = createAffixIncomeCandidates(item, { charId: ASSIST1_ID })

        const result = await requestAffixIncomes({
            side: "assist1",
            baselineGear: gear,
            slotId: 9,
            candidates,
            gainContext: context,
        })

        expect(result.target).toBe("team")
        expect(result.failures).toEqual([])
        expect(result.incomes[getUniqueAffixIncomeKey(2015)]).toBeGreaterThan(0)

        // 自身侧口径仍是 0：2015 只给其他构筑位，差分必须来自团队合计
        const withoutGear = setGear(createTeamSettings(), { assist1Gear: [] })
        const withAssist = createAssistBuildFromSettings(settings, "assist1", undefined, { mainCharId: MAIN_ID })!
        const withoutAssist = createAssistBuildFromSettings(withoutGear, "assist1", undefined, { mainCharId: MAIN_ID })!
        expect(withAssist.calculate()).toBeCloseTo(withoutAssist.calculate(), 8)

        // 去掉 2015 后团队合计确实下降（收益来自其他侧获得昂扬）
        const baseline = totalOfSnapshot(context, "assist1", gear)
        const removed = totalOfSnapshot(context, "assist1", [])
        expect(baseline).toBeGreaterThan(removed)
    })

    it("2015 整件装备（空槽 → 装备）的团队合计收益 > 0", async () => {
        installRuntimeStubs()
        const item = uniqueItemOf(2015)
        const settings = setGear(createTeamSettings(), {})
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const result = await requestGearIncomes({
            settings: transcendOnly(settings),
            side: "assist1",
            slotId: 9,
            candidates: [{ key: "item", item }],
            gainContext: context,
        })

        expect(result.target).toBe("team")
        expect(result.incomes.item).toBeGreaterThan(0)
        expect(result.baseline).toBeCloseTo(panelTotal(settings)!, 8)
    })

    it("2015 是唯一启用侧：没有其他队友可吃 buff，团队合计收益 = 0", async () => {
        installRuntimeStubs()
        const item = uniqueItemOf(2015)
        const gear = [{ slotId: 9, item }]
        const settings = setGear(createTeamSettings(), { assist1Gear: gear })
        settings.mainTargetEnabled = false
        settings.team2 = "-"
        settings.assist2.enabled = false
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const team = context.buildTeamSnapshots!("assist1", gear)!

        expect(team.target).toBe("team")
        expect(team.sides.map(entry => entry.side)).toEqual(["assist1"])
        const result = await requestAffixIncomes({
            side: "assist1",
            baselineGear: gear,
            slotId: 9,
            candidates: createAffixIncomeCandidates(item, { charId: ASSIST1_ID }),
            gainContext: context,
        })
        expect(result.incomes[getUniqueAffixIncomeKey(2015)]).toBe(0)
    })

    it("合成主控可装纯队友词条：有队友 > 0，无队友 = 0（不为 2015 特判）", async () => {
        installRuntimeStubs()
        await withSyntheticTeammateAffix(async () => {
            const item: TranscendGearItemConfig = {
                kind: "unique",
                slotType: 5,
                affixes: [],
                uniqueAffix: roll(SYNTH_TEAMMATE_ID, { source: "unique", rollLevel: 1 }),
            }
            const gear = [{ slotId: 5, item }]
            const candidate = { key: getUniqueAffixIncomeKey(SYNTH_TEAMMATE_ID), item: withoutUniqueAffix(item, SYNTH_TEAMMATE_ID) }

            const withTeam = setGear(createTeamSettings(), { mainGear: gear })
            const withTeamResult = await requestAffixIncomes({
                side: "main",
                baselineGear: gear,
                slotId: 5,
                candidates: [candidate],
                gainContext: createTranscendGainContext({ settings: withTeam, charId: MAIN_ID }),
            })
            expect(withTeamResult.incomes[candidate.key]).toBeGreaterThan(0)

            const solo = setGear(createTeamSettings(), { mainGear: gear })
            solo.team1 = "-"
            solo.team2 = "-"
            solo.assist1.enabled = false
            solo.assist2.enabled = false
            const soloResult = await requestAffixIncomes({
                side: "main",
                baselineGear: gear,
                slotId: 5,
                candidates: [candidate],
                gainContext: createTranscendGainContext({ settings: solo, charId: MAIN_ID }),
            })
            expect(soloResult.incomes[candidate.key]).toBe(0)
        })
    })

    it("普通词条装协战一：收益 = 对团队合计的贡献，不再等于协战自身差分", async () => {
        installRuntimeStubs()
        const item = normalItem(8, 1506)
        const gear = [{ slotId: 9, item }]
        const settings = setGear(createTeamSettings(), { assist1Gear: gear })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const result = await requestAffixIncomes({
            side: "assist1",
            baselineGear: gear,
            slotId: 9,
            candidates: createAffixIncomeCandidates(item),
            gainContext: context,
        })

        // 与页面同口径：基准 = 含该词条，候选 = 去掉该词条
        const withoutItem = { ...item, affixes: [] }
        const withoutSettings = setGear(createTeamSettings(), { assist1Gear: [{ slotId: 9, item: withoutItem }] })
        const expected = (panelTotal(settings)! - panelTotal(withoutSettings)!) / panelTotal(withoutSettings)!
        const withoutSelf = createAssistBuildFromSettings(withoutSettings, "assist1", undefined, { mainCharId: MAIN_ID })!
        const withSelf = createAssistBuildFromSettings(settings, "assist1", undefined, { mainCharId: MAIN_ID })!
        const selfGain = (withSelf.calculate() - withoutSelf.calculate()) / withoutSelf.calculate()

        const key = getAffixIncomeKey(0, 1506)
        expect(result.incomes[key]).toBeCloseTo(expected, 8)
        expect(result.incomes[key]).not.toBeCloseTo(selfGain, 2)
    })

    it("主控 item：收益按团队合计计算（与主控单侧口径的差异来自分母）", async () => {
        installRuntimeStubs()
        const item = normalItem(2, 1013)
        const slotId = mainSlotOf(2)
        const gear = [{ slotId, item }]
        const settings = setGear(createTeamSettings(), { mainGear: gear })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: gear,
            slotId,
            candidates: createAffixIncomeCandidates(item),
            gainContext: context,
        })

        const withoutItem = { ...item, affixes: [] }
        const withoutSettings = setGear(createTeamSettings(), { mainGear: [{ slotId, item: withoutItem }] })
        const expected = (panelTotal(settings)! - panelTotal(withoutSettings)!) / panelTotal(withoutSettings)!
        const withMain = createCharBuildFromSettings(MAIN_ID, settings)
        const withoutMain = createCharBuildFromSettings(MAIN_ID, withoutSettings)
        const mainGain = (withMain.calculate() - withoutMain.calculate()) / withoutMain.calculate()

        const key = getAffixIncomeKey(0, 1013)
        expect(result.incomes[key]).toBeCloseTo(expected, 8)
        expect(result.incomes[key]).not.toBeCloseTo(mainGain, 2)
    })
})

describe("U137 专属组件抑制在团队快照路径生效", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("协战一装备 240101：整体与技能等级组件收益均 > 0，suppress 改变团队合计", async () => {
        installRuntimeStubs()
        const item = uniqueItemOf(240101)
        const gear = [{ slotId: 9, item }]
        const settings = createTeamSettings()
        // 扶疏（2401）才能装 240101：替换协战一角色与技能
        settings.team1 = FU_SHU_ID
        settings.assist1 = { ...settings.assist1, baseName: skillName(FU_SHU_ID, 1), enabled: true }
        setGear(settings, { assist1Gear: gear })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const candidates = createAffixIncomeCandidates(item, { charId: FU_SHU_ID })
        const componentKey = "unique-component:240101:skill:Skill2"

        expect(candidates.map(candidate => candidate.key)).toContain(componentKey)
        const result = await requestAffixIncomes({
            side: "assist1",
            baselineGear: gear,
            slotId: 9,
            candidates,
            gainContext: context,
        })

        const overall = result.incomes[getUniqueAffixIncomeKey(240101)]
        const component = result.incomes[componentKey]
        expect(overall).toBeGreaterThan(0)
        expect(component).toBeGreaterThan(0)
        // 该词条的手写被动无伤害属性：整体收益 = 技能等级组件收益
        expect(component!).toBeLessThanOrEqual(overall!)

        // suppress 透传到协战自身构筑：技能等级被隔离后该侧伤害下降
        const plain = totalOfSnapshot(context, "assist1", gear)
        const team = context.buildTeamSnapshots!("assist1", gear, { suppress: { affixId: 240101, skillLevel: true } })!
        const suppressed = calculateTeamSnapshotDamage(team.sides.map(entry => entry.build)).damage!
        expect(plain).toBeGreaterThan(suppressed)
    })

    it("团队词条 2015 建模组件：suppress 昂扬后跨侧副本不再提供昂扬", async () => {
        installRuntimeStubs()
        const item = uniqueItemOf(2015)
        const gear = [{ slotId: 9, item }]
        const settings = setGear(createTeamSettings(), { assist1Gear: gear })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const componentKey = "unique-component:2015:modeled:0:昂扬"
        const candidates = createAffixIncomeCandidates(item, { charId: ASSIST1_ID })
        expect(candidates.map(candidate => candidate.key)).toContain(componentKey)

        // 修复 `collectTeammateBuffs` suppress 透传前该组件收益恒 0
        const result = await requestAffixIncomes({
            side: "assist1",
            baselineGear: gear,
            slotId: 9,
            candidates,
            gainContext: context,
        })
        expect(result.incomes[componentKey]).toBeGreaterThan(0)

        const plain = context.buildTeamSnapshots!("assist1", gear)!
        const suppressed = context.buildTeamSnapshots!("assist1", gear, { suppress: { affixId: 2015, attrs: ["昂扬"] } })!
        const yangOf = (team: NonNullable<typeof plain>) =>
            team.sides
                .filter(entry => entry.side === "main")
                .flatMap(entry => entry.build.buffs)
                .map(buff => buff.data.attr?.昂扬)
                .filter((value): value is number => typeof value === "number")
                .reduce((sum, value) => sum + value, 0)

        expect(yangOf(plain)).toBeCloseTo(4.3, 8)
        expect(yangOf(suppressed)).toBe(0)
        expect(calculateTeamSnapshotDamage(plain.sides.map(entry => entry.build)).damage!).toBeGreaterThan(
            calculateTeamSnapshotDamage(suppressed.sides.map(entry => entry.build)).damage!
        )
    })
})

describe("U137 无启用侧回退", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("三侧全部停用：回退 owner 侧并标记，不冒充团队合计", async () => {
        installRuntimeStubs()
        const item = normalItem(2, 1013)
        const slotId = mainSlotOf(2)
        const gear = [{ slotId, item }]
        const settings = setGear(createTeamSettings(), { mainGear: gear })
        settings.mainTargetEnabled = false
        settings.team1 = "-"
        settings.team2 = "-"
        settings.assist1.enabled = false
        settings.assist2.enabled = false
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const team = context.buildTeamSnapshots!("main", gear)!

        expect(team.target).toBe("owner")
        expect(team.sides.map(entry => entry.side)).toEqual(["main"])

        const affixResult = await requestAffixIncomes({
            side: "main",
            baselineGear: gear,
            slotId,
            candidates: createAffixIncomeCandidates(item),
            gainContext: context,
        })
        expect(affixResult.target).toBe("owner")
        expect(affixResult.incomes[getAffixIncomeKey(0, 1013)]).not.toBeNull()

        const gearResult = await requestGearIncomes({
            settings: transcendOnly(settings),
            side: "main",
            slotId,
            candidates: [{ key: "c1", item: { ...item, affixes: [] } }],
            gainContext: context,
        })
        expect(gearResult.target).toBe("owner")
        expect(typeof gearResult.baseline).toBe("number")
    })
})

describe("U137-fix P1：页面等价主控与工厂同源（41803 重剑）", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("teamWeapons 派生类别与工厂一致；页面式 / 工厂伤害与收益 baseline 同值", () => {
        installRuntimeStubs()
        const settings = createTeamSettings()
        settings.charMods = [[41803, 10]]
        settings.meleeWeapon = 10302
        settings.team1Weapon = 10302
        settings.team2Weapon = 10302
        const factory = createCharBuildFromSettings(MAIN_ID, settings)

        expect(factory.teamWeaponCategories).toEqual(["重剑", "重剑"])
        const pageLike = pageEquivalentMainBuild(factory, [settings.team1Weapon, settings.team2Weapon])
        expect(pageLike.teamWeaponCategories).toEqual(["重剑", "重剑"])
        expect(pageLike.calculate()).toBeCloseTo(factory.calculate(), 8)

        // 目标卡（页面式）与收益 baseline（工厂）同值
        const panel = computeCharTeamSnapshot({ settings, charId: MAIN_ID, mainBuild: pageLike })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const team = context.buildTeamSnapshots!("main", [])!
        expect(calculateTeamSnapshotDamage(team.sides.map(entry => entry.build)).damage!).toBeCloseTo(panel.total!, 8)

        // wasm 快照路径携带类别，重建后数值一致
        const snapshot = createWorkerSnapshot(pageLike)
        expect(snapshot.teamWeaponCategories).toEqual(["重剑", "重剑"])
        expect(createBuildFromSnapshot(snapshot).calculate()).toBeCloseTo(pageLike.calculate(), 8)
    })

    it("显式 teamWeaponCategories 优先于 teamWeapons 派生；字符串 / 空槽忽略", () => {
        const settings = createTeamSettings()
        const factory = createCharBuildFromSettings(MAIN_ID, settings)
        const explicit = pageEquivalentMainBuild(factory, [10302, 10302])
        expect(explicit.teamWeaponCategories).toEqual(["重剑", "重剑"])

        const ignored = pageEquivalentMainBuild(factory, ["-", 10302])
        expect(ignored.teamWeaponCategories).toEqual(["重剑"])
        expect(pageEquivalentMainBuild(factory, ["-", "-"]).teamWeaponCategories).toEqual([])
    })
})

describe("U137-fix：每侧目标函数与失败语义", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("协战一目标表达式 x2：worker 按本侧表达式求值", async () => {
        installRuntimeStubs()
        const settings = createTeamSettings()
        settings.assist1.targetFunction = "伤害 * 2"
        const defaultSettings = createTeamSettings()
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        const result = await requestGearIncomes({
            settings: transcendOnly(settings),
            side: "assist1",
            slotId: 9,
            candidates: [],
            gainContext: context,
        })
        const panel = computeCharTeamSnapshot({
            settings,
            charId: MAIN_ID,
            mainBuild: createCharBuildFromSettings(MAIN_ID, settings),
        })
        const defaultPanel = computeCharTeamSnapshot({
            settings: defaultSettings,
            charId: MAIN_ID,
            mainBuild: createCharBuildFromSettings(MAIN_ID, defaultSettings),
        })

        expect(result.baseline).toBeCloseTo(panel.total!, 8)
        expect(panel.assist1?.damage).toBeCloseTo((defaultPanel.assist1?.damage ?? 0) * 2, 8)
        expect(result.baseline).not.toBeCloseTo(defaultPanel.total!, 2)
    })

    it("协战无武器：baseline 明确失败，不返回部分和", async () => {
        installRuntimeStubs()
        const settings = createTeamSettings()
        settings.team1Weapon = "-"
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        expect(context.buildTeamSnapshots!("assist1", [])).toBeNull()
        await expect(
            requestGearIncomes({ settings: transcendOnly(settings), side: "assist1", slotId: 9, candidates: [], gainContext: context })
        ).rejects.toThrow("build-unavailable")
        await expect(
            requestAffixIncomes({
                side: "assist1",
                baselineGear: [{ slotId: 9, item: normalItem(8, 1506) }],
                slotId: 9,
                candidates: createAffixIncomeCandidates(normalItem(8, 1506)),
                gainContext: context,
            })
        ).rejects.toThrow("build-unavailable")
    })

    it("协战目标表达式非法：baseline 明确失败", async () => {
        installRuntimeStubs()
        const settings = createTeamSettings()
        settings.assist1.targetFunction = "1 +"
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        expect(context.buildTeamSnapshots!("main", [])).toBeNull()
        await expect(
            requestGearIncomes({ settings: transcendOnly(settings), side: "main", slotId: 2, candidates: [], gainContext: context })
        ).rejects.toThrow("build-unavailable")
    })

    it("候选快照失败：逐项 failure，基准仍按完整侧集合求值", async () => {
        installRuntimeStubs()
        const valid = createTranscendGainContext({ settings: createTeamSettings(), charId: MAIN_ID }).buildTeamSnapshots!("main", [])!
        const buildTeamSnapshots = vi.fn().mockReturnValueOnce(valid).mockReturnValue(null)
        const item = normalItem(2, 1013)
        const result = await requestAffixIncomes({
            side: "main",
            baselineGear: [{ slotId: mainSlotOf(2), item }],
            slotId: mainSlotOf(2),
            candidates: createAffixIncomeCandidates(item),
            gainContext: { key: "ctx", buildSnapshot: () => null, buildTeamSnapshots },
        })

        const key = getAffixIncomeKey(0, 1013)
        expect(result.incomes[key]).toBeNull()
        expect(result.failures).toEqual([{ key, error: "build-unavailable" }])
    })
})

describe("U137-fix：suppress 收敛到 owner 侧 / 装备位", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("同一 2015 两侧共存：suppress 只扣除 owner 侧副本，不重复扣除", async () => {
        installRuntimeStubs()
        const item = uniqueItemOf(2015)
        const gear = [{ slotId: 9, item }]
        const settings = setGear(createTeamSettings(), {
            assist1Gear: gear,
            assist2Gear: [{ slotId: 13, item }],
        })
        const context = createTranscendGainContext({ settings, charId: MAIN_ID })
        type Team = NonNullable<ReturnType<NonNullable<typeof context.buildTeamSnapshots>>>
        const yangOf = (team: Team) =>
            team.sides
                .filter(entry => entry.side === "main")
                .flatMap(entry => entry.build.buffs)
                .map(buff => buff.data.attr?.昂扬)
                .filter((value): value is number => typeof value === "number")
                .reduce((sum, value) => sum + value, 0)
        const totalOf = (team: Team) => calculateTeamSnapshotDamage(team.sides.map(entry => entry.build)).damage!

        const plain = context.buildTeamSnapshots!("assist1", gear)!
        const scoped = context.buildTeamSnapshots!("assist1", gear, {
            suppress: { affixId: 2015, attrs: ["昂扬"], ownerSide: "assist1" },
        })!
        const unscoped = context.buildTeamSnapshots!("assist1", gear, { suppress: { affixId: 2015, attrs: ["昂扬"] } })!

        expect(yangOf(plain)).toBeCloseTo(8.6, 8)
        expect(yangOf(scoped)).toBeCloseTo(4.3, 8)
        expect(yangOf(unscoped)).toBe(0)
        expect(totalOf(scoped)).toBeGreaterThan(totalOf(unscoped))

        // 请求层候选自动带 ownerSide + slotId：组件收益只扣 owner 侧
        const result = await requestAffixIncomes({
            side: "assist1",
            baselineGear: gear,
            slotId: 9,
            candidates: createAffixIncomeCandidates(item, { charId: ASSIST1_ID }),
            gainContext: context,
        })
        const expected = (totalOf(plain) - totalOf(scoped)) / totalOf(scoped)
        expect(result.incomes["unique-component:2015:modeled:0:昂扬"]).toBeCloseTo(expected, 8)
    })
})
