/**
 * CharBuild parity 夹具抽取器（Agent E 所有，spec §7）。
 *
 * TS 侧构造构筑 → `createWorkerSnapshot(build)` dump 输入 +
 * `calculate()` / `calculateAttributes()` / `calculateWeaponAttributes().weapon`
 * 三件套输出 → 落盘 `crates/dob-calc-core/tests/fixtures/*.json`。
 *
 * 每个 fixture 自带元信息：来源测试文件 + 用例名 + TS 基线版本（packages/data）。
 * P0→P1→P2 顺序抽取：P0 全覆盖（dot 零数据闭环 / EffectLv 8 用例 /
 * evaluateAST 单测向量，testAttrs 先 dump 为 JSON）。
 *
 * 运行：bun tools/extract-calc-fixtures.ts（可重复运行，全量覆盖写）。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { CharBuildOptions } from "../packages/data/CharBuild"
import { CharBuild, CharBuildTimeline } from "../packages/data/CharBuild"
import { calcWeaponReplacementIncomes, createBuffFromSettings, createCharBuildFromSettings } from "../packages/data/CharBuildHelper"
import { createWorkerSnapshot } from "../packages/data/CharBuildSnapshot"
import type { CharSettings } from "../packages/data/charSettings"
import { createDefaultCharSettings, normalizeCharSettings } from "../packages/data/charSettings"
import { petEntrys } from "../packages/data/d/pet.data"
import type { Buff, Mod, Weapon } from "../packages/data/data-types"
import { getModBuffLvFromSetting, getWBuffLvFromSetting } from "../packages/data/effectLv"
import {
    buffData,
    buffMap,
    charData,
    modData,
    modEffectMap,
    monsterData,
    petMap,
    weaponData,
    weaponEffectMap,
    weaponMap,
} from "../packages/data/index"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../packages/data/leveled"
import { getWBuffLvFromSnapshot, LeveledBuffHelper, LeveledWeaponHelper } from "../packages/data/leveled/LeveledHelpers"
import packageJson from "../packages/data/package.json"
import {
    collectPetBuffs,
    collectTraitBuffs,
    getEffectivePetLevel,
    getPetActiveDuration,
    getPetBaseCd,
    getPetBuffData,
    getPetTrait,
    getPetTraitByLevel,
    getTraitProperties,
    isPetRelatedBuffName,
    resolvePetCoverage,
} from "../packages/data/petTrait"
import { createShardBuild1, shardBuild1, shardBuild1CharId } from "../packages/data/tests/fixtures/shardBuild1"
import { AST_VECTORS, createAstBuild } from "./ast-vectors"

const TS_BASELINE: string = packageJson.version
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "crates", "dob-calc-core", "tests", "fixtures")

type FixtureCase = {
    name: string
    request: { charId: number; settings: Record<string, unknown> }
    expected: Record<string, unknown>
}

type FixtureDoc = {
    meta: { sourceFile: string; caseName: string; tsBaseline: string; kind: string }
    request?: { charId: number; settings: Record<string, unknown> }
    expected?: Record<string, unknown>
    cases?: FixtureCase[]
}

/** JSON 深拷贝（CharSettings/快照/面板均为纯数据，可安全序列化）。 */
function toJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

/** 三件套输出：calculate / attributes / weapon（attributes 取 calculateWeaponAttributes
 * 口径，含充盈/召唤物转化后的最终值，与 Rust `evaluate_build` 的 result.attributes 同源）。 */
function triple(build: CharBuild): { calculate: number; attributes: Record<string, number>; weapon: unknown } {
    const full = build.calculateWeaponAttributes() as unknown as Record<string, unknown>
    const { weapon, ...rest } = toJson(full)
    return { calculate: build.calculate(), attributes: rest as Record<string, number>, weapon: toJson(weapon ?? null) }
}

function writeFixture(name: string, doc: FixtureDoc): void {
    mkdirSync(FIXTURE_DIR, { recursive: true })
    writeFileSync(join(FIXTURE_DIR, `${name}.json`), `${JSON.stringify(doc, null, 2)}\n`)
    console.log(`wrote ${name}.json`)
}

function fullSettings(settings: CharSettings): Record<string, unknown> {
    return toJson(settings)
}

// ── P0-1: dot 零数据闭环 ──────────────────────────────────────────────

function mkDotWeapon(name: string, trigger: number): LeveledWeapon {
    const data = {
        id: 99999,
        名称: name,
        类型: ["近战", "长柄"],
        伤害类型: "切割",
        攻击: 100,
        暴击: 0.05,
        暴伤: 1.5,
        触发: trigger,
        描述: "",
        加成: {},
        熔炼: "",
        技能: [],
    } as unknown as Weapon
    return new LeveledWeapon(data)
}

function createDotBuild(overrides: Partial<CharBuildOptions> = {}): CharBuild {
    const char = new LeveledChar("黎瑟")
    return new CharBuild({
        char,
        skillLevel: 10,
        hpPercent: 1,
        resonanceGain: 3,
        charMods: [],
        buffs: [],
        melee: mkDotWeapon("测试近战", 1),
        ranged: mkDotWeapon("测试远程", 1),
        baseName: char.技能[0].名称,
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        targetFunction: "伤害",
        dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 0 },
        ...overrides,
    })
}

function extractDot(): void {
    const cases: { name: string; build: () => CharBuild; extra?: (build: CharBuild) => Record<string, unknown> }[] = [
        { name: "技能触发默认0", build: () => createDotBuild() },
        { name: "充盈巧力紫41317技能触发0.54", build: () => createDotBuild({ charMods: [new LeveledMod(41317)] }) },
        { name: "充盈巧力金51317技能触发1", build: () => createDotBuild({ charMods: [new LeveledMod(51317)] }) },
        {
            name: "满触发上限2.5",
            build: () => createDotBuild({ charMods: [new LeveledMod(51317)] }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()) }),
        },
        {
            name: "触发溢出250按100",
            build: () => createDotBuild({ melee: mkDotWeapon("测试近战", 2.5) }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()) }),
        },
        {
            name: "武器触发0隐藏",
            build: () => createDotBuild({ melee: mkDotWeapon("测试近战", 0), ranged: mkDotWeapon("测试远程", 0) }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()) }),
        },
        {
            name: "输入频率99受上限约束",
            build: () => createDotBuild({ charMods: [new LeveledMod(51317)], dotSettings: { skill: 99, melee: 99, ranged: 99 } }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()) }),
        },
        {
            name: "菲娜Q非光暗n4",
            build: () =>
                createDotBuild({
                    char: new LeveledChar("菲娜"),
                    charMods: [new LeveledMod(51317)],
                    dotSettings: { skill: 0, melee: 2, ranged: 2 },
                }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()), dotDamage: build.calculateDotDamage() }),
        },
        {
            name: "负抗-4反转0.5",
            build: () =>
                createDotBuild({ charMods: [new LeveledMod(51317)], enemyResistance: -4, dotSettings: { skill: 0, melee: 2, ranged: 2 } }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()), dotDamage: build.calculateDotDamage() }),
        },
        {
            name: "正抗0.5反转",
            build: () =>
                createDotBuild({ charMods: [new LeveledMod(51317)], enemyResistance: 0.5, dotSettings: { skill: 0, melee: 2, ranged: 2 } }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()), dotDamage: build.calculateDotDamage() }),
        },
        {
            name: "伤害公式全量",
            build: () => createDotBuild({ charMods: [new LeveledMod(51317)], dotSettings: { skill: 1, melee: 1, ranged: 1 } }),
            extra: build => ({ dotFrequencies: toJson(build.calculateDotFrequencies()), dotDamage: build.calculateDotDamage() }),
        },
        {
            name: "melee命名空间",
            build: () => createDotBuild({ charMods: [new LeveledMod(51317)], dotSettings: { skill: 1, melee: 1, ranged: 1 } }),
            extra: build => ({ dotDamageMelee: build.calculateDotDamage("melee"), dotDamageAll: build.calculateDotDamage() }),
        },
    ]
    cases.forEach((item, index) => {
        const build = item.build()
        writeFixture(`dot_${String(index).padStart(2, "0")}`, {
            meta: {
                sourceFile: "packages/data/tests/dot.test.ts",
                caseName: item.name,
                tsBaseline: TS_BASELINE,
                kind: "snapshot+triple+dot",
            },
            request: {
                charId: build.char.id,
                settings: toJson({ dotSettings: build.dotSettings, enemyResistance: build.enemyResistance }),
            },
            expected: { ...triple(build), snapshot: toJson(createWorkerSnapshot(build)), ...(item.extra ? item.extra(build) : {}) },
        })
    })
}

// ── P0-2: EffectLv 8 用例（纯函数值 + 2 构筑） ─────────────────────────

function baseEffectSettings(overrides: Partial<CharSettings> = {}): CharSettings {
    return normalizeCharSettings({
        ...createDefaultCharSettings(),
        charSkillLevel: 10,
        meleeWeapon: 10601,
        meleeWeaponLevel: 80,
        meleeWeaponRefine: 5,
        rangedWeapon: 20101,
        rangedWeaponLevel: 80,
        rangedWeaponRefine: 5,
        auraMod: 31524,
        ...overrides,
    } as Partial<CharSettings>)
}

function extractEffectLv(): void {
    const values: Record<string, unknown> = {
        缺省51313取最大: getModBuffLvFromSetting(undefined, 51313),
        缺省41324无特效取1: getModBuffLvFromSetting(undefined, 41324),
        显式覆盖0: getModBuffLvFromSetting({ "m:51313": 0 }, 51313),
        显式覆盖1: getModBuffLvFromSetting({ "m:51313": 1 }, 51313),
        未配置走默认: getModBuffLvFromSetting({ "m:51313": 0 }, 41324),
        武器无特效默认1: getWBuffLvFromSetting(undefined, 10601, "光"),
        武器显式0: getWBuffLvFromSetting({ "w:10601": 0 }, 10601, "光"),
        暗限定火取0: getWBuffLvFromSetting(undefined, 10107, "火"),
        暗限定暗取最大: getWBuffLvFromSetting(undefined, 10107, "暗"),
        快照火取0: getWBuffLvFromSnapshot({ wLv: { 10107: 120 } }, 10107, "火"),
        快照暗120: getWBuffLvFromSnapshot({ wLv: { 10107: 120 } }, 10107, "暗"),
    }
    const snapOf = (settings: CharSettings): Record<string, unknown> => {
        const build = createCharBuildFromSettings(4101, settings)
        return { settings: fullSettings(settings), snapshot: toJson(createWorkerSnapshot(build)), ...triple(build) }
    }
    writeFixture("effect_lv", {
        meta: {
            sourceFile: "packages/data/tests/EffectLv.test.ts",
            caseName: "8用例纯函数值+2构筑",
            tsBaseline: TS_BASELINE,
            kind: "pure-values",
        },
        request: { charId: 4101, settings: fullSettings(baseEffectSettings()) },
        expected: {
            ...values,
            effectConfig关: snapOf(
                baseEffectSettings({ charMods: [[51313, 10], ...Array<null>(7).fill(null)] as never, effectConfig: { "m:51313": 0 } })
            ),
            全局回退: snapOf(baseEffectSettings({ useGlobal: true, charMods: [[51313, 10], ...Array<null>(7).fill(null)] as never })),
        },
    })
}

// ── P0-3: evaluateAST（testAttrs 先 dump + 23 向量） ────────────────────

function extractAst(): void {
    const baseline = createAstBuild()
    writeFixture("ast_test_attrs", {
        meta: {
            sourceFile: "packages/data/tests/evaluateAST.test.ts",
            caseName: "testAttrs基线dump",
            tsBaseline: TS_BASELINE,
            kind: "testAttrs",
        },
        request: { charId: baseline.char.id, settings: toJson({ note: "beforeEach构筑的calculateWeaponAttributes输出" }) },
        expected: { testAttrs: toJson(baseline.calculateWeaponAttributes()), snapshot: toJson(createWorkerSnapshot(baseline)) },
    })
    AST_VECTORS.forEach((vector, index) => {
        const build = createAstBuild()
        const attrs = build.calculateWeaponAttributes()
        writeFixture(`ast_${String(index).padStart(3, "0")}`, {
            meta: { sourceFile: `packages/data/tests/${vector.file}`, caseName: vector.name, tsBaseline: TS_BASELINE, kind: "ast-vector" },
            request: { charId: build.char.id, settings: toJson({ targetFunction: vector.targetFunction }) },
            expected: {
                value: build.evaluateAST(vector.targetFunction, attrs),
                snapshot: toJson(createWorkerSnapshot(build)),
                attributes: toJson(build.calculateAttributes()),
            },
        })
    })
}

// ── P1 ────────────────────────────────────────────────────────────────

function extractLeveled(): void {
    const throwsForMissingMod = ((): boolean => {
        try {
            new LeveledMod(99999)
            return false
        } catch {
            return true
        }
    })()
    const expected: Record<string, unknown> = {
        炽灼攻击3级: new LeveledMod(11001, 3).攻击,
        炽灼攻击1级: new LeveledMod(11001, 1).攻击,
        雷鸣极昼钳制10: new LeveledMod(51334, 20).等级,
        炽灼下限0: new LeveledMod(11001, -1).等级,
        单元素数组取档0: new LeveledMod(41413, 0).技能伤害,
        单元素数组取档满: new LeveledMod(41413).技能伤害,
        减伤单元素0: new LeveledMod(56142, 0).减伤,
        减伤单元素满: new LeveledMod(56142).减伤,
        不存在MOD抛错: throwsForMissingMod,
        法露茜Q默认等级: new LeveledBuff("法露茜Q").等级,
        武器基础攻击: new LeveledWeapon(10302).基础攻击,
        武器精炼上限: new LeveledWeapon(10302, 9).精炼,
        武器1级下限: new LeveledWeapon(10302, 0, 0).等级,
        角色80级攻击: new LeveledChar("黎瑟", 80).基础攻击,
        角色1级钳制: new LeveledChar("黎瑟", 0).等级,
        紫MOD特效数值: new LeveledMod(41312).技能威力,
        金MOD特效数值: new LeveledMod(51312).技能威力,
        紫MOD进击攻击: new LeveledMod(41311).攻击,
        紫MOD决斗增伤: new LeveledMod(41313).增伤,
        紫MOD暴虐攻速: new LeveledMod(42311).攻速,
    }
    writeFixture("leveled", {
        meta: {
            sourceFile: "packages/data/tests/leveled.test.ts",
            caseName: "等级公式/取档/钳制锚点",
            tsBaseline: TS_BASELINE,
            kind: "leveled-values",
        },
        request: { charId: charData.find(char => char.名称 === "黎瑟")!.id, settings: fullSettings(createDefaultCharSettings()) },
        expected,
    })
}

function extractModEquip(): void {
    const occupancy = CharBuild.collectModOccupancy([new LeveledMod(31301)])
    const build = new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 0.5,
        resonanceGain: 2,
        charMods: [],
        buffs: [],
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20601),
        baseName: "快速出击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0.5,
        targetFunction: "伤害",
    })
    writeFixture("mod_equip", {
        meta: {
            sourceFile: "packages/data/tests/CharBuildModEquip.test.ts",
            caseName: "互斥/占用/槽位口径+构筑三件套",
            tsBaseline: TS_BASELINE,
            kind: "modequip+triple",
        },
        request: { charId: build.char.id, settings: toJson({ targetFunction: "伤害" }) },
        expected: {
            囚狼新版组: CharBuild.modExclusionGroup(new LeveledMod(103001)),
            囚狼旧版组: CharBuild.modExclusionGroup(new LeveledMod(32201)),
            换生灵海妖组: CharBuild.modExclusionGroup(new LeveledMod(31301)),
            不死鸟组: CharBuild.modExclusionGroup(new LeveledMod(41001)),
            occupancy海妖: { series: [...occupancy.series], names: [...occupancy.names], counts: [...occupancy.counts] },
            槽位兼容光环: build.isModSlotCompatible(new LeveledMod(31524), "charMods"),
            槽位不兼容光环: build.isModSlotCompatible(new LeveledMod(31524), "meleeMods"),
            中枢兼容: build.isAuraCompatible(new LeveledMod(31524)),
            契约者同名可装: build.isModEquipable(new LeveledMod(41741), "charMods", CharBuild.collectModOccupancy([])),
            批量过滤: build
                .filterEquipableMods([new LeveledMod(41001), new LeveledMod(41741)], "charMods", { equipped: [[]] })
                .map(mod => mod.id),
            snapshot: toJson(createWorkerSnapshot(build)),
            ...triple(build),
        },
    })
}

function extractPet(): void {
    const settings = normalizeCharSettings({ ...createDefaultCharSettings(), petId: 4211, petLevel: 3 } as Partial<CharSettings>)
    const build = createCharBuildFromSettings(charData.find(char => char.名称 === "黎瑟")!.id, settings)
    writeFixture("pet", {
        meta: {
            sourceFile: "packages/data/tests/petTrait.test.ts",
            caseName: "目录/归一/CD/BUFF/覆盖率+构筑三件套",
            tsBaseline: TS_BASELINE,
            kind: "pet+triple",
        },
        request: { charId: build.char.id, settings: fullSettings(settings) },
        expected: {
            凶猛档位: toJson(getPetTrait(10103)),
            凶猛属性: getTraitProperties(getPetTrait(10103)!),
            老道档位: toJson(getPetTraitByLevel(1030, 3)),
            有效等级: getEffectivePetLevel(3, [[1010, 3], null, null, null]),
            魔灵CD: getPetBaseCd(4211),
            主动持续: getPetActiveDuration(4211, 3),
            被动数据: toJson(getPetBuffData(4211)),
            潜质相关判定: [isPetRelatedBuffName("魔灵潜质:凶猛"), isPetRelatedBuffName("黎瑟E")],
            收集潜质: collectTraitBuffs([[1010, 3], null, [1014, 3], null]).map(buff => buff.名称),
            收集魔灵: collectPetBuffs(4211, 3, 1).map(buff => buff.名称),
            自动覆盖率: resolvePetCoverage(4211, 3, [null, null, null, null], 1, true),
            snapshot: toJson(createWorkerSnapshot(build)),
            ...triple(build),
        },
    })
}

function mkTimelineWeapon(name: string): LeveledWeapon {
    return new LeveledWeapon({
        id: 99999,
        名称: name,
        类型: ["近战", "长柄"],
        伤害类型: "切割",
        攻击: 100,
        暴击: 0.05,
        暴伤: 1.5,
        触发: 1,
        描述: "",
        加成: {},
        熔炼: "",
        技能: [],
    } as unknown as Weapon)
}

function mkTimeline(
    items: { track: number; name: string; time: number; duration: number; lv?: number; buff?: LeveledBuff }[]
): CharBuildTimeline {
    return new CharBuildTimeline("测试轴", items)
}

function createTimelineBuild(
    charName: string,
    baseName: string,
    items: { track: number; name: string; time: number; duration: number; lv?: number; buff?: LeveledBuff }[],
    overrides: Partial<CharBuildOptions> = {}
): CharBuild {
    return new CharBuild({
        char: new LeveledChar(charName),
        skillLevel: 10,
        hpPercent: 1,
        resonanceGain: 3,
        charMods: [],
        buffs: [],
        melee: mkTimelineWeapon("测试近战"),
        ranged: mkTimelineWeapon("测试远程"),
        baseName,
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        targetFunction: "伤害",
        timeline: mkTimeline(items),
        ...overrides,
    })
}

function extractTimeline(): void {
    const cases: { name: string; build: CharBuild }[] = [
        { name: "多事件累计", build: createTimelineBuild("丽蓓卡", "缠绵之触", [{ track: 0, name: "缠绵之触", time: 0, duration: 8 }]) },
        {
            name: "普通技能多事件线性累加",
            build: createTimelineBuild("黎瑟", "快速出击", [{ track: 0, name: "快速出击", time: 0, duration: 1 }]),
        },
        {
            name: "时间线BUFF附加",
            build: createTimelineBuild("黎瑟", "快速出击", [
                { track: 0, name: "快速出击", time: 0, duration: 1, lv: 1, buff: createBuffFromSettings("连击蓄力攻击加成", 5, []) },
            ]),
        },
        {
            name: "DPS折算",
            build: createTimelineBuild("黎瑟", "快速出击", [{ track: 0, name: "快速出击", time: 0, duration: 2 }], { timelineDPS: true }),
        },
        { name: "总时长0", build: createTimelineBuild("黎瑟", "快速出击", [], { timelineDPS: true }) },
    ]
    cases.forEach((item, index) => {
        writeFixture(`timeline_${String(index).padStart(2, "0")}`, {
            meta: {
                sourceFile: "packages/data/tests/timeline.test.ts",
                caseName: item.name,
                tsBaseline: TS_BASELINE,
                kind: "timeline+triple",
            },
            request: { charId: item.build.char.id, settings: toJson({ targetFunction: "伤害", timelineDPS: item.build.timelineDPS }) },
            expected: { snapshot: toJson(createWorkerSnapshot(item.build)), ...triple(item.build) },
        })
    })
}

function extractWeaponIncome(): void {
    const build = new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 1,
        resonanceGain: 0,
        charMods: [],
        buffs: [],
        melee: LeveledWeaponHelper.fromId(10209, 5, 80, 25),
        ranged: new LeveledWeapon(20601),
        baseName: "普通攻击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        targetFunction: "伤害",
    })
    const incomes = calcWeaponReplacementIncomes(build, [weaponMap.get(10209)!], weapon =>
        getWBuffLvFromSetting(undefined, weapon.id, "雷")
    )
    writeFixture("weapon_income", {
        meta: {
            sourceFile: "packages/data/tests/weapon-income.test.ts",
            caseName: "7用例收益锚点",
            tsBaseline: TS_BASELINE,
            kind: "income+triple",
        },
        request: { charId: build.char.id, settings: toJson({ targetFunction: "伤害" }) },
        expected: { snapshot: toJson(createWorkerSnapshot(build)), ...triple(build), incomes: [...incomes.entries()] },
    })
}

function extractCharBuildFixed(): void {
    const build = createShardBuild1()
    const attrs = build.calculateWeaponAttributes()
    writeFixture("charbuild_fixed", {
        meta: {
            sourceFile: "packages/data/tests/CharBuild.test.ts",
            caseName: "固定值点（面板/宏/三件套）",
            tsBaseline: TS_BASELINE,
            kind: "fixed+triple",
        },
        request: { charId: shardBuild1CharId, settings: toJson({ targetFunction: build.targetFunction }) },
        expected: {
            snapshot: toJson(createWorkerSnapshot(build)),
            ...triple(build),
            攻击: (attrs as unknown as Record<string, number>).攻击,
            目标函数伤害: build.calculateTargetFunction(attrs, "伤害"),
            DPS宏: build.calculateTargetFunction(attrs, "DPS"),
            DPH宏: build.calculateTargetFunction(attrs, "DPH"),
        },
    })
}

// ── P2 ────────────────────────────────────────────────────────────────

function extractShardE2E(): void {
    const build = createShardBuild1()
    const attrs = build.calculateWeaponAttributes()
    // request 必须携带 shardBuild1 的完整真实设置（直接用夹具源对象归一化）：
    // 用默认设置拼几个字段会导致 Rust 侧装配出空构筑，与 expected 对不上。
    const settings = normalizeCharSettings(shardBuild1 as unknown as Partial<CharSettings>)
    writeFixture("e2e_shard", {
        meta: {
            sourceFile: "packages/data/tests/fixtures/shardBuild1.ts",
            caseName: "shardBuild1端到端黄金构筑",
            tsBaseline: TS_BASELINE,
            kind: "e2e",
        },
        request: { charId: shardBuild1CharId, settings: fullSettings(settings) },
        expected: {
            snapshot: toJson(createWorkerSnapshot(build)),
            ...triple(build),
            targetByBasename: toJson(build.calculateByBasename(build.baseName)[1]),
            dotDamage: build.calculateDotDamage(),
            oneTime: build.calculateOneTime(attrs),
        },
    })
}

function extractEffectCode(): void {
    const fakeEffect = (code: string): Buff => ({ 名称: "码效测试特效", mx: 1, code }) as Buff
    const fakeMod = (): Mod => ({ id: 999001, 名称: "码效测试", 系列: "测试", 品质: "金", 耐受: 0, 类型: "角色" }) as Mod
    const mk = (charMods: (LeveledMod | null)[] = [], buffs: LeveledBuff[] = [], melee?: LeveledWeapon): CharBuild =>
        new CharBuild({
            char: new LeveledChar("黎瑟"),
            skillLevel: 10,
            hpPercent: 1,
            resonanceGain: 0,
            charMods,
            buffs,
            melee: melee ?? LeveledWeaponHelper.fromId(10601, 5, 80, 1),
            ranged: LeveledWeaponHelper.fromId(20601, 5, 80, 0),
            baseName: "普通攻击",
            enemyId: 130,
            enemyLevel: 80,
            enemyResistance: 0,
            targetFunction: "伤害",
            extraMastery: "单手剑",
        })
    const on = mk([new LeveledMod(fakeMod(), 10, 1, fakeEffect("增伤+=0.5"))])
    const off = mk([new LeveledMod(fakeMod(), 10, 0, fakeEffect("增伤+=0.5"))])
    const speedBuff = new LeveledBuff({ 名称: "测速", code: "技能速度+=3" } as Buff, 1)
    const withCode = mk([], [speedBuff], LeveledWeaponHelper.fromId(10199, 0, 80, 6))
    const scoped = new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 1,
        resonanceGain: 0,
        buffs: [LeveledBuffHelper.fromName("黎瑟·浴火2溯", 1)!, LeveledBuffHelper.fromName("无解谜题5熔", 1)!],
        melee: LeveledWeaponHelper.fromId(10601, 5, 80, 1),
        ranged: LeveledWeaponHelper.fromId(20601, 5, 80, 0),
        baseName: "普通攻击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0,
        targetFunction: "伤害",
    })
    writeFixture("effect_code", {
        meta: {
            sourceFile: "packages/data/tests/effect-code.test.ts",
            caseName: "code开/关差值",
            tsBaseline: TS_BASELINE,
            kind: "code-diff",
        },
        request: { charId: on.char.id, settings: toJson({ targetFunction: "伤害" }) },
        expected: {
            on增伤: on.calculateAttributes().增伤,
            off增伤: off.calculateAttributes().增伤,
            差值: on.calculateAttributes().增伤 - off.calculateAttributes().增伤,
            on快照: toJson(createWorkerSnapshot(on)),
            off快照: toJson(createWorkerSnapshot(off)),
            withCode技能伤害: withCode.calculateAttributes().技能伤害,
            withCode快照: toJson(createWorkerSnapshot(withCode)),
            复合共存有限: Number.isFinite(scoped.calculateAttributes().技能伤害),
            武器特效表: {
                has10199: weaponEffectMap.has(10199),
                modHas51313: modEffectMap.has(51313),
                buffHas浴火: buffMap.has("黎瑟·浴火2溯"),
            },
        },
    })
}

/** dob-app 第二语料导入：settings 原样入库 + 当前 TS 重算 total/面板（冲突时当前 TS 赢）。 */
function extractDobApp(): void {
    const imports = [
        { file: "fixture_shardBuild1", caseName: "dob-app第二语料·莉兹贝尔同律纯蓄" },
        { file: "fixture_vy", caseName: "dob-app第二语料·薇召唤体系" },
        { file: "fixture_lieseBathfire1", caseName: "dob-app第二语料·黎瑟浴火" },
        { file: "fixture_OkdnBN3OlC", caseName: "dob-app第二语料·蓄势待发" },
    ] as const
    for (const item of imports) {
        const raw = JSON.parse(readFileSync(`E:/dev/dob-app/_check/fixtures/${item.file}.json`, "utf8")) as {
            charId: number
            settings: string | CharSettings
            expected: { total: number }
        }
        const settings = normalizeCharSettings(typeof raw.settings === "string" ? JSON.parse(raw.settings) : raw.settings)
        const build = createCharBuildFromSettings(raw.charId, settings)
        const panel = build.calculateWeaponAttributes() as { weapon?: unknown }
        writeFixture(`dobapp_${item.file.replace("fixture_", "")}`, {
            meta: {
                sourceFile: `_check/fixtures/${item.file}.json`,
                caseName: item.caseName,
                tsBaseline: TS_BASELINE,
                kind: "dobapp-import",
            },
            request: { charId: raw.charId, settings: fullSettings(settings) },
            expected: {
                dobTotal: raw.expected.total,
                calculate: build.calculate(),
                attributes: toJson(build.calculateAttributes() as unknown as Record<string, number>),
                weapon: toJson(panel.weapon ?? null),
                snapshot: toJson(createWorkerSnapshot(build)),
            },
        })
    }
}
// ── U17: 普通近战/远程前缀 vs 同律面板 ────────────────────────────────

/** 普通前缀用例的设置：同律武器由角色数据派生，这里只指定近战/远程武器。 */
function ordinarySettings(
    baseName: string,
    meleeWeapon: number,
    rangedWeapon: number,
    customBuff: [string, number][],
    extraBuffs: [string, number][] = [],
    targetFunction = ""
): CharSettings {
    const buffs: [string, number][] = [...(customBuff.length ? [["自定义BUFF", 1] as [string, number]] : []), ...extraBuffs]
    return normalizeCharSettings({
        ...createDefaultCharSettings(),
        auraMod: 0,
        baseName,
        meleeWeapon,
        rangedWeapon,
        buffs,
        customBuff,
        targetFunction,
    } as Partial<CharSettings>)
}

function extractOrdinaryPrefix(): void {
    const specs = [
        {
            name: "ordinary_prefix",
            charName: "贝蕾妮卡",
            baseName: "普通攻击",
            meleeWeapon: 10302,
            rangedWeapon: 20601,
            ordinary: "普通近战攻击",
            bare: "近战攻击",
        },
        {
            name: "ordinary_ranged",
            charName: "赛琪",
            baseName: "普通攻击",
            meleeWeapon: 10302,
            rangedWeapon: 20601,
            ordinary: "普通远程攻击",
            bare: "远程攻击",
        },
        {
            name: "ordinary_inherit",
            charName: "煜明",
            baseName: "疑星落",
            meleeWeapon: 10303,
            rangedWeapon: 20601,
            ordinary: "普通近战攻击",
            bare: "近战攻击",
        },
        {
            name: "ordinary_inherit_circle",
            charName: "芙罗拉",
            baseName: "圆舞",
            meleeWeapon: 10303,
            rangedWeapon: 20601,
            ordinary: "普通近战攻击",
            bare: "近战攻击",
        },
        {
            name: "ordinary_inherit_sword",
            charName: "刻舟",
            baseName: "剑非剑",
            meleeWeapon: 10303,
            rangedWeapon: 20601,
            ordinary: "普通近战攻击",
            bare: "近战攻击",
        },
    ] as const
    for (const spec of specs) {
        const charId = charData.find(char => char.名称 === spec.charName)!.id
        const variants: [string, [string, number][]][] = [
            ["baseline", []],
            ["ordinary", [[spec.ordinary, 0.1]]],
            ["bare", [[spec.bare, 0.1]]],
        ]
        const cases = variants.map(([name, customBuff]) => {
            const settings = ordinarySettings(spec.baseName, spec.meleeWeapon, spec.rangedWeapon, customBuff)
            const panels = createCharBuildFromSettings(charId, settings).getAllWeaponSkillsAttrs()
            return {
                name,
                request: { charId, settings: fullSettings(settings) },
                expected: {
                    melee: toJson(panels.get("近战") ?? null),
                    ranged: toJson(panels.get("远程") ?? null),
                    skill: toJson(panels.get("同律") ?? null),
                },
            }
        })
        writeFixture(spec.name, {
            meta: {
                sourceFile: "crates/dob-calc-core/tests/parity_ordinary_prefix.rs",
                caseName: `${spec.charName} 普通前缀 / 同律面板`,
                tsBaseline: TS_BASELINE,
                kind: "panels",
            },
            cases,
        })
    }
}

/** 12 类武器面板 base（与引擎 `weapon_panel` 一致）。 */
const ORDINARY_MELEE_BASES = [
    "攻击",
    "暴击",
    "暴伤",
    "触发",
    "攻速",
    "多重",
    "增伤",
    "装填",
    "弹匣",
    "弹药",
    "武器倍率",
    "独立增伤",
] as const

/** 普通面板用例的公共期望：三槽静态面板。 */
function ordinaryPanels(charId: number, baseName: string, meleeWeapon: number, rangedWeapon: number, customBuff: [string, number][]) {
    const settings = ordinarySettings(baseName, meleeWeapon, rangedWeapon, customBuff)
    const panels = createCharBuildFromSettings(charId, settings).getAllWeaponSkillsAttrs()
    return {
        request: { charId, settings: fullSettings(settings) },
        expected: {
            melee: toJson(panels.get("近战") ?? null),
            ranged: toJson(panels.get("远程") ?? null),
            skill: toJson(panels.get("同律") ?? null),
        },
    }
}

/** 12 类 base 的普通面板正例（同律面板逐字段不变）；近战/远程各一组。 */
function extractOrdinaryAllBases(): void {
    const charId = charData.find(char => char.名称 === "贝蕾妮卡")!.id
    const allMelee = ORDINARY_MELEE_BASES.map(base => [`普通近战${base}`, 0.1] as [string, number])
    const allRanged = ORDINARY_MELEE_BASES.map(base => [`普通远程${base}`, 0.1] as [string, number])
    const cases = [
        // 近战武器 10302：装填/弹匣/弹药基础值为 0，面板看不出变化
        { name: "baseline", ...ordinaryPanels(charId, "普通攻击", 10302, 20601, []) },
        { name: "all_bases", ...ordinaryPanels(charId, "普通攻击", 10302, 20601, allMelee) },
        // 远程武器 20101：装填/弹匣/弹药基础值非 0，覆盖其余 3 类 base
        { name: "ranged-baseline", ...ordinaryPanels(charId, "普通攻击", 10302, 20101, []) },
        { name: "ranged-all_bases", ...ordinaryPanels(charId, "普通攻击", 10302, 20101, allRanged) },
    ]
    writeFixture("ordinary_all_bases", {
        meta: {
            sourceFile: "crates/dob-calc-core/tests/parity_ordinary_prefix.rs",
            caseName: "贝蕾妮卡 12 类普通 base（近战/远程）",
            tsBaseline: TS_BASELINE,
            kind: "panels",
        },
        cases,
    })
}

/** 混合独立因子：`近战独立增伤` 与 `普通近战独立增伤` 各自成因子。 */
function extractOrdinaryMixedIndependent(): void {
    const charId = charData.find(char => char.名称 === "贝蕾妮卡")!.id
    const variants: [string, [string, number][]][] = [
        ["prefix", [["近战独立增伤", 0.2]]],
        ["ordinary", [["普通近战独立增伤", 0.3]]],
        [
            "mixed",
            [
                ["近战独立增伤", 0.2],
                ["普通近战独立增伤", 0.3],
            ],
        ],
    ]
    const cases = variants.map(([name, customBuff]) => ({
        name,
        ...ordinaryPanels(charId, "普通攻击", 10302, 20601, customBuff),
    }))
    writeFixture("ordinary_mixed_independent", {
        meta: {
            sourceFile: "crates/dob-calc-core/tests/parity_ordinary_prefix.rs",
            caseName: "贝蕾妮卡 混合独立因子",
            tsBaseline: TS_BASELINE,
            kind: "panels",
        },
        cases,
    })
}

/** 攻击细分普通键：4 类攻击 × `增伤/独立增伤`，以及继承型同律不追加。 */
function extractOrdinaryAttackType(): void {
    const meleeId = charData.find(char => char.名称 === "贝蕾妮卡")!.id
    const attackTypes = [
        { name: "普攻", expr: "普通攻击::一段伤害", add: "普通近战普攻增伤", indep: "普通近战普攻独立增伤" },
        { name: "蓄力", expr: "蓄力攻击::蓄力攻击伤害", add: "普通近战蓄力增伤", indep: "普通近战蓄力独立增伤" },
        { name: "下落", expr: "下落攻击::下落攻击伤害", add: "普通近战下落增伤", indep: "普通近战下落独立增伤" },
        { name: "滑行", expr: "滑行攻击::滑行攻击伤害", add: "普通近战滑行增伤", indep: "普通近战滑行独立增伤" },
    ]
    const makeCase = (charId: number, baseName: string, melee: number, name: string, expr: string, customBuff: [string, number][]) => {
        const settings = ordinarySettings(baseName, melee, 20601, customBuff, [], expr)
        const build = createCharBuildFromSettings(charId, settings)
        return {
            name,
            request: { charId, settings: fullSettings(settings) },
            expected: {
                value: build.evaluateAST(expr, build.calculateWeaponAttributes()),
                snapshot: toJson(createWorkerSnapshot(build)),
            },
        }
    }
    const cases: ReturnType<typeof makeCase>[] = []
    for (const type of attackTypes) {
        cases.push(makeCase(meleeId, "蓄力攻击", 10302, `${type.name}-baseline`, type.expr, []))
        cases.push(makeCase(meleeId, "蓄力攻击", 10302, `${type.name}-add`, type.expr, [[type.add, 0.1]]))
        cases.push(makeCase(meleeId, "蓄力攻击", 10302, `${type.name}-indep`, type.expr, [[type.indep, 0.1]]))
    }
    // 继承型同律（疑星落，字段 tag 为下落攻击）：普通键不追加，裸键仍按降级口径生效
    const inheritId = charData.find(char => char.名称 === "煜明")!.id
    const inheritExpr = "疑星落::[疑星落]伤害"
    cases.push(makeCase(inheritId, "疑星落", 10303, "inherit-baseline", inheritExpr, []))
    cases.push(makeCase(inheritId, "疑星落", 10303, "inherit-ordinary", inheritExpr, [["普通近战下落增伤", 0.1]]))
    cases.push(makeCase(inheritId, "疑星落", 10303, "inherit-bare", inheritExpr, [["近战下落增伤", 0.1]]))
    writeFixture("ordinary_attack_type", {
        meta: {
            sourceFile: "crates/dob-calc-core/tests/parity_ordinary_prefix.rs",
            caseName: "攻击细分普通键（4 类 × 增伤/独立增伤）",
            tsBaseline: TS_BASELINE,
            kind: "ast-vector",
        },
        cases,
    })
}

/**
 * 继承型同律 + 读取 `skillWeaponAttr` 的 code BUFF（琳恩裂伤特性 `攻击 += skillWeaponAttr.攻击`）。
 * `普通近战攻击` 不得经继承槽的面板别名泄漏到同律面板/角色属性。
 */
function extractOrdinaryInheritCode(): void {
    const spec = { charName: "煜明", baseName: "疑星落", meleeWeapon: 10303, rangedWeapon: 20601 }
    const charId = charData.find(char => char.名称 === spec.charName)!.id
    const variants: [string, [string, number][]][] = [
        ["baseline", []],
        ["ordinary", [["普通近战攻击", 0.1]]],
    ]
    const cases = variants.map(([name, customBuff]) => {
        const settings = ordinarySettings(spec.baseName, spec.meleeWeapon, spec.rangedWeapon, customBuff, [["琳恩裂伤特性", 1]])
        const build = createCharBuildFromSettings(charId, settings)
        const panels = build.getAllWeaponSkillsAttrs()
        return {
            name,
            request: { charId, settings: fullSettings(settings) },
            expected: {
                snapshot: toJson(createWorkerSnapshot(build)),
                ...triple(build),
                panels: {
                    melee: toJson(panels.get("近战") ?? null),
                    ranged: toJson(panels.get("远程") ?? null),
                    skill: toJson(panels.get("同律") ?? null),
                },
            },
        }
    })
    writeFixture("ordinary_inherit_code", {
        meta: {
            sourceFile: "crates/dob-calc-core/tests/parity_ordinary_prefix.rs",
            caseName: "煜明 继承同律 code 面板读取",
            tsBaseline: TS_BASELINE,
            kind: "e2e",
        },
        cases,
    })
}

/** 全量模块表落盘：供 Rust 真实求值建表（`BuildPayload::from_json` 输入形状）。 */
function extractModules(): void {
    const modules = {
        "char.data": charData,
        "mod.data": modData,
        "weapon.data": weaponData,
        "buff.data": buffData,
        "effect.data": [...modEffectMap.values(), ...weaponEffectMap.values()],
        "monster.data": monsterData,
        "pet.data": [...petMap.values()],
        petTraits: petEntrys,
    }
    writeFileSync(join(FIXTURE_DIR, "modules.json"), JSON.stringify(modules))
    console.log("wrote modules.json")
}

extractDot()
extractEffectLv()
extractAst()
extractLeveled()
extractModEquip()
extractPet()
extractTimeline()
extractWeaponIncome()
extractCharBuildFixed()
extractShardE2E()
extractEffectCode()
extractDobApp()
extractOrdinaryPrefix()
extractOrdinaryAllBases()
extractOrdinaryMixedIndependent()
extractOrdinaryAttackType()
extractOrdinaryInheritCode()
extractModules()
console.log(`done, tsBaseline=${TS_BASELINE}`)
