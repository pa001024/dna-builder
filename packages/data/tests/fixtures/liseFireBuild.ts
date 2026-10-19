import type { CharBuild } from "../../CharBuild"
import { createCharBuildFromSettings } from "../../CharBuildHelper"
import { type CharSettings, normalizeCharSettings } from "../../charSettings"
import { charData } from "../../index"

/**
 * 线上真实构筑快照：黎瑟·浴火（id 4103）的★推荐构筑 PXQvFiw-m2（作者盲目吃鱼）。
 *
 * 原始数据取自线上分享（sdk/python/tests/golden/online/PXQvFiw-m2.json），抽出为公共夹具，
 * 供 autoBuild 性能基准（tools/benchmark-autobuild.ts）与真实构筑回归测试共用，避免两处副本漂移。
 * 该构筑特征：综合DPS 目标函数 + 25 个自定义变量 + 22 条 BUFF（含 6 溯 / 灾厄 5 熔 / 双队友助战），
 * 是 autoBuild 全量候选搜索（角色 343 + 近战 92 + 远程 75 + 同律 88）下 calculate() 热路径的真实压力样本。
 * 本地复算 target 与作者标注一致：28053254998.1983（约 280.53 亿）。
 */
export const liseFireBuild = {
    charLevel: 80,
    baseName: "求索",
    hpPercent: 1,
    resonanceGain: 3,
    enemyId: 300,
    enemyLevel: 80,
    enemyResistance: -4,
    isRouge: false,
    targetFunction: "综合DPS",
    customVariables: [
        ["[迸发射击]初始用时", "1.2"],
        ["[校准]初始用时", "3"],
        ["[狙击]初始用时", "0.5"],
        ["[迸发射击]用时", "[迸发射击]初始用时/角色::技能速度!"],
        ["[校准]用时", "[校准]初始用时/角色::技能速度!"],
        ["[狙击]用时", "[狙击]初始用时/角色::技能速度!"],
        ["[真相]周期", "max(1, [校准]用时)"],
        ["[强化狙击]周期", "[真相]周期//[校准]用时"],
        ["[强化狙击及1溯]伤害", "(涡流狙击::[强化狙击子弹]伤害+迸发射击::伤害)*[电能协同]多重系数"],
        ["[电能协同]多重系数", "min(2, 1+远程::多重!*0.3)"],
        ["[电流步枪]数量", "2"],
        ["[电流步枪]循环用时", "6*角色::技能耐久!+[迸发射击]用时"],
        [
            "[电流步枪]循环伤害",
            "[电流步枪]数量*(迸发射击::伤害+ ([电流步枪]循环用时-[迸发射击]用时)/[狙击]用时*涡流狙击::[狙击子弹]伤害)*[电能协同]多重系数",
        ],
        ["[狙击及1溯]循环伤害", "[电流步枪]循环用时/[强化狙击]周期*[强化狙击及1溯]伤害"],
        [
            "[真相]伤害",
            "35*角色::技能威力!*(角色::攻击!+近战::攻击!)*角色::[攻击]{转震荡:1}/角色::攻击!*角色::[攻击]{转灾厄:1}/角色::[攻击]{转震荡:1}*(角色::技能速度)*(1+近战::暴击!*(近战::暴伤!-1))",
        ],
        ["[技能]DPS", "([电流步枪]循环伤害+[狙击及1溯]循环伤害)/[电流步枪]循环用时"],
        ["[灾厄]DPS", "求索::[求索]伤害/[真相]周期"],
        ["[DOT]DPS", "角色::DOT伤害+近战::DOT伤害+远程::DOT伤害"],
        ["综合DPS", "[技能]DPS+[灾厄]DPS+[DOT]DPS"],
        ["灾厄伤害占比", "[灾厄]DPS/综合DPS"],
        [
            "[乘区验证]近战总攻击",
            "求索::[求索]伤害/35/(1+角色::属性穿透)/角色::技能威力!/(1+角色::增伤+角色::技能伤害)/(1+角色::昂扬)/(1+(近战::暴击)*(近战::暴伤-1))*(2-角色::技能无视防御)/(1+角色::技能追伤)/(1+角色::技能独立增伤)/(角色::技能速度)*角色::[攻击]{转震荡:1}/角色::[攻击]{转灾厄:1}",
        ],
        ["[灾厄值]紊乱获取", "ceil(12*角色::技能速度!)"],
        ["[灾厄值]触发获取", "ceil(2*角色::技能速度!)"],
        [
            "[灾厄值]每秒",
            "(([灾厄值]紊乱获取+2*[灾厄值]触发获取)/[强化狙击]周期+[电流步枪]数量*[灾厄值]触发获取/[狙击]用时)*[电能协同]多重系数",
        ],
        ["[灾厄值]每秒阈值", "ceil(100*2.21/1.61)"],
    ],
    charSkillLevel: [12, 12, 12],
    extraMastery: "",
    meleeWeapon: 10199,
    meleeWeaponLevel: 80,
    meleeWeaponRefine: 5,
    rangedWeapon: 20306,
    rangedWeaponLevel: 80,
    rangedWeaponRefine: 5,
    auraMod: 51746,
    imbalance: false,
    charMods: [
        [51441, 10],
        [51334, 10],
        [51748, 10],
        [51748, 10],
        [51942, 10],
        [56142, 10],
        [51748, 10],
        [51748, 10],
    ],
    meleeMods: [
        [52011, 10],
        [52008, 10],
        [52013, 10],
        [42003, 10],
        [52010, 10],
        [52007, 10],
        [52012, 10],
        [42002, 10],
    ],
    rangedMods: [
        [53009, 10],
        [53010, 10],
        [43002, 10],
        [43003, 10],
        [53007, 10],
        [53008, 10],
        [53011, 10],
        [53005, 10],
    ],
    skillWeaponMods: [null, null, null, null],
    modVariantIndex: 0,
    modVariants: [
        {
            中枢: 51746,
            角色: [
                [51441, 10],
                [51334, 10],
                [51748, 10],
                [51748, 10],
                [51942, 10],
                [51748, 10],
                [51748, 10],
                [51748, 10],
            ],
            近战: [
                [52011, 10],
                [52008, 10],
                [52013, 10],
                [42003, 10],
                [52010, 10],
                [52007, 10],
                [52012, 10],
                [42002, 10],
            ],
            远程: [
                [53009, 10],
                [53010, 10],
                [43002, 10],
                [43003, 10],
                [53007, 10],
                [53008, 10],
                [53011, 10],
                [53005, 10],
            ],
            同律: [null, null, null, null],
        },
    ],
    buffs: [
        ["黎瑟·浴火Q", 30],
        ["黎瑟·浴火2溯", 1],
        ["黎瑟·浴火4溯", 30],
        ["黎瑟·浴火6溯", 1],
        ["扶疏助战", 1],
        ["扶疏Q", 120],
        ["扶疏1溯", 1],
        ["扶疏被动", 12],
        ["扶疏被动(4溯)", 12],
        ["羽翼·鼓舞·昂扬(水)", 10],
        ["无解谜题5熔", 1],
        ["煜明助战", 1],
        ["煜明被动", 12],
        ["煜明1溯", 1],
        ["罪愆的逆鳞(队友)", 5],
        ["羽翼·鼓舞·昂扬(雷)", 10],
        ["黎瑟·浴火E", 1],
        ["煜明7溯", 2],
        ["自定义BUFF", 1],
        ["黎瑟·浴火被动", 6],
        ["泽世的慈雨(队友)", 5],
        ["黎瑟·浴火被动2", 1],
    ],
    customBuff: [],
    petId: 4241,
    petLevel: 3,
    petCoverage: 1,
    petAutoCoverage: true,
    traits: [
        [1030, 3],
        [1026, 3],
        [1025, 3],
        [1010, 3],
    ],
    team1: 2401,
    team1Weapon: 10502,
    team1Build: "h8YeFTULlY",
    team1BuildVariant: "A",
    team2: 4201,
    team2Weapon: 10203,
    team2Build: "OEH0TIqVkt",
    team2BuildVariant: "A",
    timelineDPS: false,
    useGlobal: false,
    effectConfig: {},
    dotSettings: {
        skill: 1,
        melee: 0,
        ranged: 0,
        skillweapon: 0,
        forceOwnAdditionalDamage: false,
    },
}

/** 该构筑的角色 id（黎瑟·浴火）。 */
export const liseFireBuildCharId = charData.find(char => char.名称 === "黎瑟·浴火")!.id

/**
 * 归一化后的构筑配置（可直接交给 createCharBuildFromSettings）。
 *
 * 夹具按可读的字面量书写，而 CharSettings 要求元组类型（如 [string, string]），二者不构成子类型关系，
 * 故经 unknown 中转断言：这里是测试夹具，形状由 normalizeCharSettings 运行期校验。
 */
export const liseFireBuildSettings: CharSettings = normalizeCharSettings(liseFireBuild as unknown as Partial<CharSettings>)

/**
 * 按夹具配置构造真实构筑实例（每次调用返回全新的、各自独立的实例）。
 *
 * customVariables 逐条复制后传入：createCharBuildFromSettings 会直接引用配置里的数组，
 * 而本夹具的配置是模块级共享对象，共享同一数组会让「原地修改自定义变量」的测试互相污染。
 * @returns 黎瑟·浴火推荐构筑
 */
export function createLiseFireBuild(): CharBuild {
    return createCharBuildFromSettings(liseFireBuildCharId, {
        ...liseFireBuildSettings,
        customVariables: liseFireBuildSettings.customVariables.map(entry => [entry[0], entry[1]] as [string, string]),
    })
}
