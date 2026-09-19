import { type CharSettings, normalizeCharSettings } from "../../../composables/useCharSettings"
import type { CharBuild } from "../../CharBuild"
import { createCharBuildFromSettings } from "../../CharBuildHelper"
import { charData } from "../../index"

/**
 * 线上真实构筑快照：莉兹贝尔（id 1501）的「萨麦尔」同律武器纯蓄 DPS 配装。
 *
 * 原始数据取自 `src/data/tests/CharBuild.test.ts` 中的 `shardBuild1`，抽出为公共夹具，
 * 供性能基准（`tools/benchmark-charbuild.ts`）与真实构筑回归测试共用，避免两处副本漂移。
 * 该构筑特征：8 个角色 MOD + 8 个近战 MOD + 8 个远程 MOD + 4 个同律 MOD、25 条 BUFF、
 * 1 条带 code 的复合 BUFF、17 个自定义变量（含相互引用），是属性汇总与 AST 求值的压力样本。
 */
export const shardBuild1 = {
    charLevel: 80,
    baseName: "萨麦尔",
    hpPercent: 1,
    resonanceGain: 3,
    enemyId: 300,
    enemyLevel: 80,
    enemyResistance: -4,
    isRouge: false,
    targetFunction: "[若华纯蓄]DPS",
    customVariables: [
        ["[权火]暴击转化", "(melee::暴击-1.98*0.22)/4/0.2"],
        ["[权火]暴伤转化", "(melee::暴伤-0.3*2.2)/4/2"],
        ["[权火]触发转化", "melee::触发/4/0.25"],
        ["[萨麦尔]S蓄用时", "1.75/萨麦尔::攻速!"],
        ["[远程]用时", "0"],
        ["[以坚忍之名]用时", "0.6"],
        ["循环用时", "12*[萨麦尔]S蓄用时+[以坚忍之名]用时"],
        [
            "[dot]DPS",
            "0.2*角色::攻击!*(1+角色::充盈威力!)*6*3/0.4*(角色::[攻击]{转属克:1}+4*角色::[攻击]{转属逆:1})/角色::[攻击]{转震荡:1}",
        ],
        ["[若华纯蓄]DPS", "(12*萨麦尔S蓄伤害+以坚忍之名::伤害)/循环用时+[dot]DPS"],
        ["魔灵主动综合提升", "1+0.0467*0.6"],
        [
            "每秒神智获取",
            "12+4+[每3s]基础神智回复/3+[喘息]等效神智回复-(ceil(25*(2-角色::技能效益!))*12+ceil(15*(2-角色::技能效益!)))/循环用时",
        ],
        ["萨麦尔S蓄伤害", "萨麦尔::[萨麦尔]S级蓄力攻击伤害"],
        ["[萨麦尔]双暴区", "1+(萨麦尔::暴击)*(萨麦尔::暴伤-1)"],
        [
            "[萨麦尔S蓄]属克一级暴主数字",
            "18.93*(角色::技能威力)*(角色::攻击!*5+萨麦尔::攻击!)*萨麦尔::暴伤*(1+角色::增伤+角色::武器伤害+melee::增伤+0.75)*(1+角色::昂扬)*(1+角色::属性穿透)*8*0.5",
        ],
        ["[每3s]基础神智回复", "2+角色::神智!//200"],
        ["[喘息]期望周期", "(5//[萨麦尔]S蓄用时+2)*[萨麦尔]S蓄用时*循环用时/(循环用时-[以坚忍之名]用时)"],
        ["[喘息]等效神智回复", "20/[喘息]期望周期"],
    ],
    charSkillLevel: 12,
    extraMastery: "单手剑",
    meleeWeapon: 10399,
    meleeWeaponLevel: 80,
    meleeWeaponRefine: 5,
    rangedWeapon: 20510,
    rangedWeaponLevel: 80,
    rangedWeaponRefine: 5,
    auraMod: 51765,
    imbalance: false,
    charMods: [
        [51463, 10],
        [51326, 10],
        [51768, 10],
        [51768, 10],
        [56162, 10],
        [31203, 10],
        [51768, 10],
        [51768, 10],
    ],
    meleeMods: [
        [52011, 10],
        [52007, 10],
        [42002, 10],
        [42003, 10],
        [52010, 10],
        [52008, 10],
        [42006, 10],
        [52203, 10],
    ],
    rangedMods: [[53011, 10], [53111, 10], [53008, 10], [43006, 10], null, [33332, 10], [53801, 10], null],
    skillWeaponMods: [
        [54003, 10],
        [54002, 10],
        [54004, 10],
        [54204, 10],
    ],
    modVariantIndex: 0,
    modVariants: [],
    buffs: [
        ["莉兹贝尔1溯", 1],
        ["莉兹贝尔6溯", 1],
        ["连击蓄力攻击加成", 5],
        ["羽翼·鼓舞·专注(光)", 10],
        ["菲娜助战", 1],
        ["菲娜被动+1溯", 1],
        ["织梦的白羽(队友)", 5],
        ["色散成霓", 10],
        ["全盛·振奋", 10],
        ["弧光百劫(队友)", 5],
        ["菲娜Q", 12],
        ["自定义BUFF", 1],
        ["扶疏助战", 1],
        ["扶疏Q", 120],
        ["扶疏1溯", 1],
        ["扶疏被动", 12],
        ["羽翼·鼓舞·昂扬(水)", 10],
        ["激扬寒波", 10],
        ["扶疏被动(4溯)", 12],
        ["权火将熄5熔", 1],
        ["莉兹贝尔7溯", 5],
    ],
    customBuff: [
        ["近战触发", 2.32],
        ["近战范围", 4.8],
    ],
    petId: 4261,
    petLevel: 3,
    petCoverage: 0.6,
    petAutoCoverage: true,
    traits: [[1025, 3], [1026, 3], [1023, 3], null],
    team1: 1801,
    team1Weapon: 20509,
    team1Build: "-",
    team1BuildVariant: "A",
    team2: 2401,
    team2Weapon: 20602,
    team2Build: "-",
    team2BuildVariant: "A",
    timelineDPS: false,
    useGlobal: false,
    effectConfig: {},
    dotSettings: { skill: 0, melee: 0, ranged: 0, skillweapon: 0, forceOwnAdditionalDamage: false },
    actions: { enable: false, i: [], b: [], hp: [], bgs: [] },
}

/** 该构筑的角色 id（莉兹贝尔）。 */
export const shardBuild1CharId = charData.find(char => char.名称 === "莉兹贝尔")!.id

/**
 * 归一化后的构筑配置（可直接交给 `createCharBuildFromSettings`）。
 *
 * 夹具按「可读的裸数组字面量」书写（如 `customVariables: string[][]`），
 * 而 `CharSettings` 要求元组类型（`[string, string]`），二者不构成子类型关系，
 * 故经 `unknown` 中转断言：这里是测试夹具，形状由 normalizeCharSettings 运行期校验。
 */
export const shardBuild1Settings: CharSettings = normalizeCharSettings(shardBuild1 as unknown as Partial<CharSettings>)

/**
 * 按夹具配置构造真实构筑实例（每次调用返回全新的、各自独立的实例）。
 *
 * `customVariables` 逐条复制后传入：`createCharBuildFromSettings` 会直接引用配置里的数组，
 * 而本夹具的配置是模块级共享对象，共享同一数组会让「原地修改自定义变量」的测试互相污染。
 * @returns 莉兹贝尔真实构筑
 */
export function createShardBuild1(): CharBuild {
    return createCharBuildFromSettings(shardBuild1CharId, {
        ...shardBuild1Settings,
        customVariables: shardBuild1Settings.customVariables.map(entry => [entry[0], entry[1]] as [string, string]),
    })
}
