import type { WeaponSkill } from "../leveled/LeveledSkill"

export interface DnaSeasonSlot {
    id: number
    name: string
    baseAffixId?: number
    maxInlayCount?: number
    temperAffixPoolIds?: number[]
}

export interface DnaSeasonRarity {
    id: number
    showRarityId: number
    name: string
    minAffixCount: number[]
    hasUniqueAffix: boolean
    craftTypes: number[]
}

export interface DnaSeasonPowerTier {
    id: number
    minPower: number
    maxPower: number
    spAffixGet: boolean
}

export interface DnaSeasonNamePrefix {
    id: number
    slot: number
    name: string
}

export interface DnaSeasonBaseName {
    id: number
    slot: number
    name: string
    icon?: string
}

export interface DnaSeasonUniqueEquip {
    id: number
    slot: number
    name: string
    icon: string
    affixId: number
}

export interface DnaSeasonGenerateGroup {
    id: number
    icon: string
}

export interface DnaSeasonCraft {
    id: number
    condition?: number
    costItems?: Record<string, number>
    costPriceId?: number
    costPriceCount?: number
    maxCount?: number
    enchantGrowthFactor?: number
    enchantGrowthMaxCount?: number
    /** 打造面板的官方标题（游戏 TextMap 原文，随语言由数据包对照表解析）。 */
    title?: string
    /** 打造机制的官方说明（游戏 TextMap 原文，缺失时不渲染）。 */
    desc?: string
}

export interface DnaSeasonBreakdown {
    rarity: number
    itemIds: number[]
    itemCounts: number[]
    priceId: number
    price: number
    tierIds: number[]
}

export interface DnaSeasonAffixPool {
    id: number
    name: string
}

export interface DnaSeasonAffixLevelPlan {
    planId: number
    minRollLevel: number
    maxRollLevel: number
}

export interface DnaSeasonAffixLevel {
    power: number
    plans: DnaSeasonAffixLevelPlan[]
}

export interface DnaSeasonAffixAttr {
    attr: string
    addType: "Rate" | "Value"
    /** 上游 U14b：元素限定属性（元素增伤 / 元素追伤）的机读元素枚举（Fire/Water/…）。 */
    element?: string
    isPercent?: boolean
    individualRateZone?: number
    tag?: string
    type?: string
    rateZone?: string
}

export interface DnaSeasonAffixUpdateFunc {
    Multi?: number
    Add?: number
}

export interface DnaSeasonAffix {
    id: number
    plan: number
    addAttrs?: DnaSeasonAffixAttr[]
    minValue: number
    maxValue: number
    totalValueLevel: number
    affixUpdatePerLvFunc?: DnaSeasonAffixUpdateFunc
    ancientFunc?: DnaSeasonAffixUpdateFunc
    maxAffixUpdateFunc?: DnaSeasonAffixUpdateFunc
    pool?: number
    /** 随机词条槽位适用性（本地建模）：仅用于池字段无法表达适用槽型的词条；技能等级词条按已知部位映射，未知组合不输出。 */
    slotTypes?: number[]
    exclusionAffixIds?: number[]
    desc?: string
    /** 适用角色 id；由上游导出器按 skillId 精确 join，导入器不得根据描述文本猜测。 */
    charIds?: number[]
    passiveEffectId?: number
    /** 技能等级提升：Plan 3 用 `skillTypes`（Skill1/Skill2/Passive），1.8.7.1 起 Plan 4 用 `skillIds`（上游 `AddSkillLevel.SkillID`）。 */
    addSkillLevel?: { skillTypes?: string[]; skillIds?: number[] }
    activateSkills?: Record<string, number>
    /** 技能替换：原技能 id → 替换技能（上游 skillReplacements，与 MOD `技能替换` 同形）。
     * `字段` 是目标技能自身 SkillDesc 展示值，不是词条改写后的伤害：2040601→2040603 的字段与源技能
     * 2040601 逐值相同，官方「子弹倍率 +120%」在未导出的 SkillEffects/CreateSkillCreature 链上。 */
    skillReplacements?: Record<string, WeaponSkill>
    /** 词条方案名，上游无文本，导入期本地派生。 */
    planName?: string
    /** 词条池名（affixPools.name），仅带 pool 的词条存在。 */
    poolName?: string
    /** 伤害建模映射状态，仅 Plan 4 标注：exact 自动映射引擎属性，handwritten 本地手写建模。 */
    mappingStatus?: "exact" | "handwritten"
}

export interface DnaSeasonInlayBreakdown {
    itemIds: number[]
    itemCounts: number[]
    priceId: number
    price: number
}

export interface DnaSeasonInlay {
    id: number
    inlayType: number
    affixIdsBySlot: Record<string, number[]>
    breakdown: DnaSeasonInlayBreakdown
}

const rawSlotTypes: Record<string, string> = {
    "1": "Head",
    "2": "Chest",
    "3": "Hand",
    "4": "Foot",
    "5": "Belt",
    "6": "Necklace",
    "7": "Ring",
    "8": "Amulet",
    "9": "CrystalBall",
    "10": "MagicBook",
    "11": "Shield",
}

const rawCraftTypes: Record<string, string> = {
    "1": "Masterwork",
    "2": "FinalMasterwork",
    "3": "Tempering",
    "4": "Enchant",
    "5": "CreateSocket",
    "6": "EquipInlay",
    "7": "UnEquipInlay",
}

const rawSlots: DnaSeasonSlot[] = [
    {
        id: 1,
        name: "头盔",
        baseAffixId: 102,
        maxInlayCount: 2,
        temperAffixPoolIds: [202, 203, 204],
    },
    {
        id: 2,
        name: "护胸",
        baseAffixId: 103,
        maxInlayCount: 2,
        temperAffixPoolIds: [202, 203, 204],
    },
    {
        id: 3,
        name: "手套",
        baseAffixId: 101,
        maxInlayCount: 2,
        temperAffixPoolIds: [201, 203, 205],
    },
    {
        id: 4,
        name: "靴子",
        baseAffixId: 105,
        maxInlayCount: 2,
        temperAffixPoolIds: [201, 204, 205],
    },
    {
        id: 5,
        name: "耳环",
        baseAffixId: 104,
        maxInlayCount: 1,
        temperAffixPoolIds: [201, 203, 205],
    },
    {
        id: 6,
        name: "项链",
        baseAffixId: 111,
        maxInlayCount: 1,
        temperAffixPoolIds: [201, 204, 205],
    },
    {
        id: 7,
        name: "戒指",
        baseAffixId: 106,
        maxInlayCount: 1,
        temperAffixPoolIds: [202, 203, 204],
    },
    {
        id: 8,
        name: "护符",
        baseAffixId: 107,
        temperAffixPoolIds: [211],
    },
    {
        id: 9,
        name: "印章",
        baseAffixId: 108,
        temperAffixPoolIds: [211],
    },
    {
        id: 10,
        name: "典籍",
        baseAffixId: 109,
        temperAffixPoolIds: [211],
    },
    {
        id: 11,
        name: "纹饰",
        baseAffixId: 110,
        temperAffixPoolIds: [211],
    },
]

const rawRarities: DnaSeasonRarity[] = [
    {
        id: 1,
        showRarityId: 1,
        name: "白色品质",
        minAffixCount: [0],
        hasUniqueAffix: false,
        craftTypes: [5, 6, 7],
    },
    {
        id: 2,
        showRarityId: 3,
        name: "蓝色品质",
        minAffixCount: [1],
        hasUniqueAffix: false,
        craftTypes: [5, 6, 7],
    },
    {
        id: 3,
        showRarityId: 3,
        name: "蓝色品质",
        minAffixCount: [2],
        hasUniqueAffix: false,
        craftTypes: [5, 6, 7],
    },
    {
        id: 4,
        showRarityId: 5,
        name: "金色品质",
        minAffixCount: [3],
        hasUniqueAffix: false,
        craftTypes: [1, 2, 3, 4, 5, 6, 7],
    },
    {
        id: 5,
        showRarityId: 5,
        name: "金色品质",
        minAffixCount: [4],
        hasUniqueAffix: false,
        craftTypes: [1, 2, 3, 4, 5, 6, 7],
    },
    {
        id: 10,
        showRarityId: 10,
        name: "暗金品质",
        minAffixCount: [4],
        hasUniqueAffix: true,
        craftTypes: [1, 2, 3, 4, 5, 6, 7],
    },
]

const rawPowerTiers: DnaSeasonPowerTier[] = [
    {
        id: 1,
        minPower: 1,
        maxPower: 5,
        spAffixGet: false,
    },
    {
        id: 2,
        minPower: 5,
        maxPower: 10,
        spAffixGet: false,
    },
    {
        id: 3,
        minPower: 10,
        maxPower: 15,
        spAffixGet: false,
    },
    {
        id: 4,
        minPower: 15,
        maxPower: 25,
        spAffixGet: false,
    },
    {
        id: 5,
        minPower: 25,
        maxPower: 35,
        spAffixGet: false,
    },
    {
        id: 6,
        minPower: 35,
        maxPower: 45,
        spAffixGet: false,
    },
    {
        id: 7,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 8,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 9,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 10,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 11,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 12,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 13,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 14,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 15,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 16,
        minPower: 50,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1001,
        minPower: 1,
        maxPower: 1,
        spAffixGet: false,
    },
    {
        id: 1002,
        minPower: 1,
        maxPower: 1,
        spAffixGet: false,
    },
    {
        id: 1003,
        minPower: 1,
        maxPower: 1,
        spAffixGet: false,
    },
    {
        id: 1004,
        minPower: 1,
        maxPower: 2,
        spAffixGet: false,
    },
    {
        id: 1005,
        minPower: 2,
        maxPower: 2,
        spAffixGet: false,
    },
    {
        id: 1006,
        minPower: 2,
        maxPower: 2,
        spAffixGet: false,
    },
    {
        id: 1007,
        minPower: 2,
        maxPower: 3,
        spAffixGet: false,
    },
    {
        id: 1008,
        minPower: 3,
        maxPower: 3,
        spAffixGet: false,
    },
    {
        id: 1009,
        minPower: 3,
        maxPower: 3,
        spAffixGet: false,
    },
    {
        id: 1010,
        minPower: 3,
        maxPower: 4,
        spAffixGet: false,
    },
    {
        id: 1011,
        minPower: 4,
        maxPower: 4,
        spAffixGet: false,
    },
    {
        id: 1012,
        minPower: 4,
        maxPower: 4,
        spAffixGet: false,
    },
    {
        id: 1013,
        minPower: 4,
        maxPower: 5,
        spAffixGet: false,
    },
    {
        id: 1014,
        minPower: 5,
        maxPower: 5,
        spAffixGet: false,
    },
    {
        id: 1015,
        minPower: 5,
        maxPower: 5,
        spAffixGet: false,
    },
    {
        id: 1016,
        minPower: 5,
        maxPower: 6,
        spAffixGet: false,
    },
    {
        id: 1017,
        minPower: 6,
        maxPower: 6,
        spAffixGet: false,
    },
    {
        id: 1018,
        minPower: 6,
        maxPower: 6,
        spAffixGet: false,
    },
    {
        id: 1019,
        minPower: 6,
        maxPower: 7,
        spAffixGet: false,
    },
    {
        id: 1020,
        minPower: 7,
        maxPower: 7,
        spAffixGet: false,
    },
    {
        id: 1021,
        minPower: 7,
        maxPower: 7,
        spAffixGet: false,
    },
    {
        id: 1022,
        minPower: 7,
        maxPower: 8,
        spAffixGet: false,
    },
    {
        id: 1023,
        minPower: 8,
        maxPower: 8,
        spAffixGet: false,
    },
    {
        id: 1024,
        minPower: 8,
        maxPower: 8,
        spAffixGet: false,
    },
    {
        id: 1025,
        minPower: 8,
        maxPower: 9,
        spAffixGet: false,
    },
    {
        id: 1026,
        minPower: 9,
        maxPower: 9,
        spAffixGet: false,
    },
    {
        id: 1027,
        minPower: 9,
        maxPower: 9,
        spAffixGet: false,
    },
    {
        id: 1028,
        minPower: 9,
        maxPower: 10,
        spAffixGet: false,
    },
    {
        id: 1029,
        minPower: 10,
        maxPower: 10,
        spAffixGet: false,
    },
    {
        id: 1030,
        minPower: 10,
        maxPower: 10,
        spAffixGet: false,
    },
    {
        id: 1031,
        minPower: 10,
        maxPower: 11,
        spAffixGet: false,
    },
    {
        id: 1032,
        minPower: 11,
        maxPower: 11,
        spAffixGet: false,
    },
    {
        id: 1033,
        minPower: 11,
        maxPower: 11,
        spAffixGet: false,
    },
    {
        id: 1034,
        minPower: 11,
        maxPower: 12,
        spAffixGet: false,
    },
    {
        id: 1035,
        minPower: 12,
        maxPower: 12,
        spAffixGet: false,
    },
    {
        id: 1036,
        minPower: 12,
        maxPower: 12,
        spAffixGet: false,
    },
    {
        id: 1037,
        minPower: 12,
        maxPower: 13,
        spAffixGet: false,
    },
    {
        id: 1038,
        minPower: 13,
        maxPower: 13,
        spAffixGet: false,
    },
    {
        id: 1039,
        minPower: 13,
        maxPower: 13,
        spAffixGet: false,
    },
    {
        id: 1040,
        minPower: 13,
        maxPower: 14,
        spAffixGet: false,
    },
    {
        id: 1041,
        minPower: 14,
        maxPower: 14,
        spAffixGet: false,
    },
    {
        id: 1042,
        minPower: 14,
        maxPower: 14,
        spAffixGet: false,
    },
    {
        id: 1043,
        minPower: 14,
        maxPower: 15,
        spAffixGet: false,
    },
    {
        id: 1044,
        minPower: 15,
        maxPower: 15,
        spAffixGet: false,
    },
    {
        id: 1045,
        minPower: 15,
        maxPower: 15,
        spAffixGet: false,
    },
    {
        id: 1046,
        minPower: 15,
        maxPower: 16,
        spAffixGet: false,
    },
    {
        id: 1047,
        minPower: 16,
        maxPower: 16,
        spAffixGet: false,
    },
    {
        id: 1048,
        minPower: 16,
        maxPower: 16,
        spAffixGet: false,
    },
    {
        id: 1049,
        minPower: 16,
        maxPower: 17,
        spAffixGet: false,
    },
    {
        id: 1050,
        minPower: 17,
        maxPower: 17,
        spAffixGet: false,
    },
    {
        id: 1051,
        minPower: 17,
        maxPower: 17,
        spAffixGet: false,
    },
    {
        id: 1052,
        minPower: 17,
        maxPower: 18,
        spAffixGet: false,
    },
    {
        id: 1053,
        minPower: 18,
        maxPower: 18,
        spAffixGet: false,
    },
    {
        id: 1054,
        minPower: 18,
        maxPower: 18,
        spAffixGet: false,
    },
    {
        id: 1055,
        minPower: 18,
        maxPower: 19,
        spAffixGet: false,
    },
    {
        id: 1056,
        minPower: 19,
        maxPower: 19,
        spAffixGet: false,
    },
    {
        id: 1057,
        minPower: 19,
        maxPower: 19,
        spAffixGet: false,
    },
    {
        id: 1058,
        minPower: 19,
        maxPower: 20,
        spAffixGet: false,
    },
    {
        id: 1059,
        minPower: 20,
        maxPower: 22,
        spAffixGet: false,
    },
    {
        id: 1060,
        minPower: 22,
        maxPower: 23,
        spAffixGet: false,
    },
    {
        id: 1061,
        minPower: 23,
        maxPower: 23,
        spAffixGet: false,
    },
    {
        id: 1062,
        minPower: 23,
        maxPower: 24,
        spAffixGet: false,
    },
    {
        id: 1063,
        minPower: 24,
        maxPower: 24,
        spAffixGet: false,
    },
    {
        id: 1064,
        minPower: 24,
        maxPower: 25,
        spAffixGet: false,
    },
    {
        id: 1065,
        minPower: 25,
        maxPower: 25,
        spAffixGet: false,
    },
    {
        id: 1066,
        minPower: 25,
        maxPower: 26,
        spAffixGet: false,
    },
    {
        id: 1067,
        minPower: 26,
        maxPower: 27,
        spAffixGet: false,
    },
    {
        id: 1068,
        minPower: 27,
        maxPower: 28,
        spAffixGet: false,
    },
    {
        id: 1069,
        minPower: 28,
        maxPower: 28,
        spAffixGet: false,
    },
    {
        id: 1070,
        minPower: 28,
        maxPower: 29,
        spAffixGet: false,
    },
    {
        id: 1071,
        minPower: 29,
        maxPower: 30,
        spAffixGet: false,
    },
    {
        id: 1072,
        minPower: 30,
        maxPower: 30,
        spAffixGet: false,
    },
    {
        id: 1073,
        minPower: 30,
        maxPower: 31,
        spAffixGet: false,
    },
    {
        id: 1074,
        minPower: 31,
        maxPower: 31,
        spAffixGet: false,
    },
    {
        id: 1075,
        minPower: 31,
        maxPower: 32,
        spAffixGet: false,
    },
    {
        id: 1076,
        minPower: 32,
        maxPower: 33,
        spAffixGet: false,
    },
    {
        id: 1077,
        minPower: 33,
        maxPower: 33,
        spAffixGet: false,
    },
    {
        id: 1078,
        minPower: 33,
        maxPower: 34,
        spAffixGet: false,
    },
    {
        id: 1079,
        minPower: 34,
        maxPower: 34,
        spAffixGet: false,
    },
    {
        id: 1080,
        minPower: 34,
        maxPower: 35,
        spAffixGet: false,
    },
    {
        id: 1081,
        minPower: 35,
        maxPower: 36,
        spAffixGet: false,
    },
    {
        id: 1082,
        minPower: 36,
        maxPower: 36,
        spAffixGet: false,
    },
    {
        id: 1083,
        minPower: 36,
        maxPower: 37,
        spAffixGet: false,
    },
    {
        id: 1084,
        minPower: 37,
        maxPower: 37,
        spAffixGet: false,
    },
    {
        id: 1085,
        minPower: 37,
        maxPower: 38,
        spAffixGet: false,
    },
    {
        id: 1086,
        minPower: 38,
        maxPower: 38,
        spAffixGet: false,
    },
    {
        id: 1087,
        minPower: 38,
        maxPower: 39,
        spAffixGet: false,
    },
    {
        id: 1088,
        minPower: 39,
        maxPower: 39,
        spAffixGet: false,
    },
    {
        id: 1089,
        minPower: 39,
        maxPower: 40,
        spAffixGet: false,
    },
    {
        id: 1090,
        minPower: 40,
        maxPower: 40,
        spAffixGet: false,
    },
    {
        id: 1091,
        minPower: 40,
        maxPower: 41,
        spAffixGet: false,
    },
    {
        id: 1092,
        minPower: 41,
        maxPower: 41,
        spAffixGet: false,
    },
    {
        id: 1093,
        minPower: 41,
        maxPower: 42,
        spAffixGet: false,
    },
    {
        id: 1094,
        minPower: 42,
        maxPower: 42,
        spAffixGet: false,
    },
    {
        id: 1095,
        minPower: 42,
        maxPower: 43,
        spAffixGet: false,
    },
    {
        id: 1096,
        minPower: 43,
        maxPower: 43,
        spAffixGet: false,
    },
    {
        id: 1097,
        minPower: 43,
        maxPower: 44,
        spAffixGet: false,
    },
    {
        id: 1098,
        minPower: 44,
        maxPower: 44,
        spAffixGet: false,
    },
    {
        id: 1099,
        minPower: 44,
        maxPower: 45,
        spAffixGet: false,
    },
    {
        id: 1100,
        minPower: 45,
        maxPower: 45,
        spAffixGet: false,
    },
    {
        id: 1101,
        minPower: 45,
        maxPower: 46,
        spAffixGet: false,
    },
    {
        id: 1102,
        minPower: 45,
        maxPower: 46,
        spAffixGet: false,
    },
    {
        id: 1103,
        minPower: 45,
        maxPower: 47,
        spAffixGet: false,
    },
    {
        id: 1104,
        minPower: 45,
        maxPower: 47,
        spAffixGet: false,
    },
    {
        id: 1105,
        minPower: 45,
        maxPower: 48,
        spAffixGet: false,
    },
    {
        id: 1106,
        minPower: 45,
        maxPower: 48,
        spAffixGet: false,
    },
    {
        id: 1107,
        minPower: 45,
        maxPower: 49,
        spAffixGet: false,
    },
    {
        id: 1108,
        minPower: 45,
        maxPower: 49,
        spAffixGet: false,
    },
    {
        id: 1109,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1110,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1111,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1112,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1113,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1114,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1115,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1116,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1117,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1118,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1119,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1120,
        minPower: 45,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1121,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1122,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1123,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1124,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1125,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1126,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1127,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1128,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1129,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1130,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1131,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1132,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1133,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1134,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1135,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1136,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1137,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1138,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1139,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1140,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1141,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1142,
        minPower: 46,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1143,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1144,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1145,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1146,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1147,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1148,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1149,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1150,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1151,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1152,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1153,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1154,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1155,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1156,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1157,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1158,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1159,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1160,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1161,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1162,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1163,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1164,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1165,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1166,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1167,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1168,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1169,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1170,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1171,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1172,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1173,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1174,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1175,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1176,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1177,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1178,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1179,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1180,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1181,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1182,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1183,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1184,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1185,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1186,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1187,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1188,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1189,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1190,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1191,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1192,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1193,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1194,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1195,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1196,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1197,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1198,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1199,
        minPower: 47,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1200,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1201,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1202,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1203,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1204,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1205,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1206,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1207,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1208,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1209,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1210,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1211,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1212,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1213,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1214,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1215,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1216,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1217,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1218,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1219,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1220,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1221,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1222,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1223,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1224,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1225,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1226,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1227,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1228,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1229,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1230,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1231,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1232,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1233,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1234,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1235,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1236,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1237,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1238,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1239,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1240,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1241,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1242,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1243,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1244,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1245,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1246,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1247,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1248,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1249,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
    {
        id: 1250,
        minPower: 48,
        maxPower: 50,
        spAffixGet: true,
    },
]

const rawNamePrefixes: DnaSeasonNamePrefix[] = [
    {
        id: 1001,
        slot: 1,
        name: "强力",
    },
    {
        id: 1002,
        slot: 2,
        name: "精致",
    },
    {
        id: 1003,
        slot: 3,
        name: "耐磨",
    },
    {
        id: 1004,
        slot: 4,
        name: "锋利",
    },
    {
        id: 1005,
        slot: 5,
        name: "完美",
    },
    {
        id: 1006,
        slot: 6,
        name: "尊贵",
    },
    {
        id: 1007,
        slot: 7,
        name: "古老",
    },
    {
        id: 1008,
        slot: 8,
        name: "卓越",
    },
    {
        id: 1009,
        slot: 9,
        name: "厚重",
    },
    {
        id: 1010,
        slot: 10,
        name: "神秘",
    },
    {
        id: 1011,
        slot: 11,
        name: "神秘",
    },
]

const rawBaseNames: DnaSeasonBaseName[] = [
    {
        id: 1001,
        slot: 1,
        name: "海蚀头盔",
        icon: "T_Season_010101",
    },
    {
        id: 1002,
        slot: 1,
        name: "海雾头盔",
        icon: "T_Season_010103",
    },
    {
        id: 1003,
        slot: 1,
        name: "海妖头盔",
        icon: "T_Season_010102",
    },
    {
        id: 1004,
        slot: 2,
        name: "海蚀护胸",
        icon: "T_Season_010201",
    },
    {
        id: 1005,
        slot: 2,
        name: "海雾护胸",
        icon: "T_Season_010203",
    },
    {
        id: 1006,
        slot: 2,
        name: "海妖护胸",
        icon: "T_Season_010202",
    },
    {
        id: 1007,
        slot: 3,
        name: "海蚀手套",
        icon: "T_Season_010301",
    },
    {
        id: 1008,
        slot: 3,
        name: "海雾手套",
        icon: "T_Season_010303",
    },
    {
        id: 1009,
        slot: 3,
        name: "海妖手套",
        icon: "T_Season_010302",
    },
    {
        id: 1010,
        slot: 4,
        name: "海蚀靴子",
        icon: "T_Season_010401",
    },
    {
        id: 1011,
        slot: 4,
        name: "海雾靴子",
        icon: "T_Season_010403",
    },
    {
        id: 1012,
        slot: 4,
        name: "海妖靴子",
        icon: "T_Season_010402",
    },
    {
        id: 1013,
        slot: 5,
        name: "海蚀耳环",
        icon: "T_Season_010601",
    },
    {
        id: 1014,
        slot: 5,
        name: "海雾耳环",
        icon: "T_Season_010603",
    },
    {
        id: 1015,
        slot: 5,
        name: "海妖耳环",
        icon: "T_Season_010602",
    },
    {
        id: 1016,
        slot: 6,
        name: "海蚀项链",
        icon: "T_Season_010501",
    },
    {
        id: 1017,
        slot: 6,
        name: "海雾项链",
        icon: "T_Season_010503",
    },
    {
        id: 1018,
        slot: 6,
        name: "海妖项链",
        icon: "T_Season_010502",
    },
    {
        id: 1019,
        slot: 7,
        name: "海蚀戒指",
        icon: "T_Season_010701",
    },
    {
        id: 1020,
        slot: 7,
        name: "海雾戒指",
        icon: "T_Season_010703",
    },
    {
        id: 1021,
        slot: 7,
        name: "海妖戒指",
        icon: "T_Season_010702",
    },
    {
        id: 1022,
        slot: 8,
        name: "海蚀印章",
        icon: "T_Season_010801",
    },
    {
        id: 1023,
        slot: 8,
        name: "海雾印章",
        icon: "T_Season_010803",
    },
    {
        id: 1024,
        slot: 8,
        name: "海妖印章",
        icon: "T_Season_010802",
    },
    {
        id: 1025,
        slot: 9,
        name: "海蚀护符",
        icon: "T_Season_010901",
    },
    {
        id: 1026,
        slot: 9,
        name: "海雾护符",
        icon: "T_Season_010903",
    },
    {
        id: 1027,
        slot: 9,
        name: "海妖护符",
        icon: "T_Season_010902",
    },
    {
        id: 1028,
        slot: 10,
        name: "海蚀纹饰",
        icon: "T_Season_011001",
    },
    {
        id: 1029,
        slot: 10,
        name: "海雾纹饰",
        icon: "T_Season_011003",
    },
    {
        id: 1030,
        slot: 10,
        name: "海妖纹饰",
        icon: "T_Season_011002",
    },
    {
        id: 1031,
        slot: 11,
        name: "海蚀典籍",
        icon: "T_Season_011101",
    },
    {
        id: 1032,
        slot: 11,
        name: "海雾典籍",
        icon: "T_Season_011103",
    },
    {
        id: 1033,
        slot: 11,
        name: "海妖典籍",
        icon: "T_Season_011102",
    },
]

const rawUniqueEquips: DnaSeasonUniqueEquip[] = [
    {
        id: 110001,
        slot: 1,
        name: "枪火玫瑰宝冠",
        icon: "T_Season_DG_0103",
        affixId: 310201,
    },
    {
        id: 110002,
        slot: 1,
        name: "漂流海螺头盔",
        icon: "T_Season_DG_0102",
        affixId: 180101,
    },
    {
        id: 110003,
        slot: 1,
        name: "水雾增压护额",
        icon: "T_Season_DG_0104",
        affixId: 210101,
    },
    {
        id: 110004,
        slot: 1,
        name: "猩红盈满头盔",
        icon: "T_Season_DG_0101",
        affixId: 2002,
    },
    {
        id: 120001,
        slot: 2,
        name: "烈阳咒灵护胸",
        icon: "T_Season_DG_0202",
        affixId: 150202,
    },
    {
        id: 120002,
        slot: 2,
        name: "月光咒灵护胸",
        icon: "T_Season_DG_0203",
        affixId: 150203,
    },
    {
        id: 120003,
        slot: 2,
        name: "星落梯云战甲",
        icon: "T_Season_DG_0204",
        affixId: 420101,
    },
    {
        id: 130001,
        slot: 3,
        name: "古术之握",
        icon: "T_Season_DG_0301",
        affixId: 240102,
    },
    {
        id: 140001,
        slot: 4,
        name: "爆破天才战靴",
        icon: "T_Season_DG_0403",
        affixId: 320301,
    },
    {
        id: 140002,
        slot: 4,
        name: "摘星战靴",
        icon: "T_Season_DG_0402",
        affixId: 2001,
    },
    {
        id: 140003,
        slot: 4,
        name: "刀锋漫步者",
        icon: "T_Season_DG_0401",
        affixId: 2013,
    },
    {
        id: 150001,
        slot: 5,
        name: "晦月契约耳环",
        icon: "T_Season_DG_0601",
        affixId: 180102,
    },
    {
        id: 150002,
        slot: 5,
        name: "界限反转耳环·技能耐久",
        icon: "T_Season_DG_0602_02",
        affixId: 2004,
    },
    {
        id: 150003,
        slot: 5,
        name: "界限反转耳环·技能范围",
        icon: "T_Season_DG_0602_01",
        affixId: 2005,
    },
    {
        id: 150004,
        slot: 5,
        name: "界限反转耳环·技能效益",
        icon: "T_Season_DG_0602_03",
        affixId: 2006,
    },
    {
        id: 160001,
        slot: 6,
        name: "同辉链接吊坠",
        icon: "T_Season_DG_0503",
        affixId: 240103,
    },
    {
        id: 160002,
        slot: 6,
        name: "涉过黎明之链",
        icon: "T_Season_DG_0502",
        affixId: 150201,
    },
    {
        id: 160003,
        slot: 6,
        name: "变奏乐章项链",
        icon: "T_Season_DG_0506",
        affixId: 110201,
    },
    {
        id: 160004,
        slot: 6,
        name: "爆破天才项链",
        icon: "T_Season_DG_0505",
        affixId: 320302,
    },
    {
        id: 160005,
        slot: 6,
        name: "终章舞曲项链",
        icon: "T_Season_DG_0504",
        affixId: 2030301,
    },
    {
        id: 160006,
        slot: 6,
        name: "晦暗研磨项链",
        icon: "T_Season_DG_0501",
        affixId: 2040601,
    },
    {
        id: 170001,
        slot: 7,
        name: "不息装填戒指",
        icon: "T_Season_DG_0701",
        affixId: 310202,
    },
    {
        id: 170002,
        slot: 7,
        name: "智者遗骸戒指",
        icon: "T_Season_DG_0704",
        affixId: 2003,
    },
    {
        id: 170003,
        slot: 7,
        name: "蚀刻涡流之戒",
        icon: "T_Season_DG_0703_06",
        affixId: 2007,
    },
    {
        id: 170004,
        slot: 7,
        name: "蚀刻烙印之戒",
        icon: "T_Season_DG_0703_05",
        affixId: 2008,
    },
    {
        id: 170005,
        slot: 7,
        name: "蚀刻风暴之戒",
        icon: "T_Season_DG_0703_02",
        affixId: 2009,
    },
    {
        id: 170006,
        slot: 7,
        name: "蚀刻轰鸣之戒",
        icon: "T_Season_DG_0703_04",
        affixId: 2010,
    },
    {
        id: 170007,
        slot: 7,
        name: "蚀刻光耀之戒",
        icon: "T_Season_DG_0703_03",
        affixId: 2011,
    },
    {
        id: 170008,
        slot: 7,
        name: "蚀刻暗喻之戒",
        icon: "T_Season_DG_0703_01",
        affixId: 2012,
    },
    {
        id: 210001,
        slot: 8,
        name: "泽被万物护符",
        icon: "T_Season_DG_0901",
        affixId: 240101,
    },
    {
        id: 210002,
        slot: 8,
        name: "净化涤荡护符",
        icon: "T_Season_DG_0903",
        affixId: 2014,
    },
    {
        id: 210003,
        slot: 8,
        name: "激昂号令护符",
        icon: "T_Season_DG_0902",
        affixId: 2015,
    },
]

const rawGenerateGroups: DnaSeasonGenerateGroup[] = [
    {
        id: 1,
        icon: "T_Coin_Main_Lv3",
    },
    {
        id: 2,
        icon: "T_Coin_Other_Mod",
    },
    {
        id: 3,
        icon: "T_Coin_Main_Lv3",
    },
    {
        id: 4,
        icon: "T_Coin_Other_Mod",
    },
    {
        id: 5,
        icon: "T_Coin_Main_Lv3",
    },
    {
        id: 6,
        icon: "T_Coin_Other_Mod",
    },
    {
        id: 7,
        icon: "T_Coin_Main_Lv3",
    },
    {
        id: 8,
        icon: "T_Coin_Other_Mod",
    },
    {
        id: 9,
        icon: "T_Coin_Main_Lv3",
    },
    {
        id: 10,
        icon: "T_Coin_Other_Mod",
    },
]

const rawCrafts: DnaSeasonCraft[] = [
    {
        id: 1,
        condition: 29006,
        costItems: {
            "7000104": 1,
        },
        costPriceId: 7000101,
        costPriceCount: 50000,
        maxCount: 10,
        title: "精锻",
        desc: "精锻会提升物品的词缀数值",
    },
    {
        id: 2,
        condition: 29006,
        costItems: {
            "7000104": 1,
            "7000105": 1,
        },
        costPriceId: 7000101,
        costPriceCount: 500000,
        title: "精锻",
        desc: "最终精锻：随机强化一个已有词缀",
    },
    {
        id: 3,
        condition: 29011,
        costItems: {
            "7000103": 50,
        },
        costPriceId: 7000101,
        costPriceCount: 600000,
        title: "淬炼",
        desc: "淬炼可为装备新增一条词缀",
    },
    {
        id: 4,
        condition: 29006,
        costItems: {
            "7000102": 100,
            "7000103": 5,
        },
        costPriceId: 7000101,
        costPriceCount: 300000,
        enchantGrowthFactor: 1,
        enchantGrowthMaxCount: 5,
        title: "附魔",
        desc: "附魔会用新的词缀替换一条已有的词缀",
    },
    {
        id: 5,
        costItems: {
            "7000106": 1,
        },
        costPriceId: 7000101,
        costPriceCount: 450000,
        title: "镶嵌",
        desc: "可为放入的装备添加镶孔、镶嵌宝石、拆取镶嵌的宝石",
    },
    {
        id: 6,
        title: "镶嵌",
        desc: "可为放入的装备添加镶孔、镶嵌宝石、拆取镶嵌的宝石",
    },
    {
        id: 7,
        costPriceId: 7000101,
        costPriceCount: 50000,
        title: "拆取",
        desc: "可为放入的装备添加镶孔、镶嵌宝石、拆取镶嵌的宝石",
    },
]

const rawBreakdowns: DnaSeasonBreakdown[] = [
    {
        rarity: 1,
        itemIds: [7000102],
        itemCounts: [1],
        priceId: 7000101,
        price: 20,
        tierIds: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
            1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033,
            1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054,
            1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075,
            1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096,
            1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117,
            1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138,
            1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159,
            1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180,
            1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201,
            1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222,
            1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243,
            1244, 1245, 1246, 1247, 1248, 1249, 1250,
        ],
    },
    {
        rarity: 2,
        itemIds: [7000102],
        itemCounts: [3],
        priceId: 7000101,
        price: 400,
        tierIds: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
            1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033,
            1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054,
            1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075,
            1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096,
            1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117,
            1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138,
            1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159,
            1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180,
            1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201,
            1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222,
            1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243,
            1244, 1245, 1246, 1247, 1248, 1249, 1250,
        ],
    },
    {
        rarity: 3,
        itemIds: [7000102],
        itemCounts: [3],
        priceId: 7000101,
        price: 400,
        tierIds: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
            1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033,
            1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054,
            1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075,
            1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096,
            1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117,
            1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138,
            1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159,
            1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180,
            1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201,
            1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222,
            1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243,
            1244, 1245, 1246, 1247, 1248, 1249, 1250,
        ],
    },
    {
        rarity: 4,
        itemIds: [7000102, 7000103],
        itemCounts: [5, 1],
        priceId: 7000101,
        price: 8000,
        tierIds: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
            1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033,
            1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054,
            1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075,
            1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096,
            1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117,
            1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138,
            1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159,
            1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180,
            1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201,
            1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222,
            1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243,
            1244, 1245, 1246, 1247, 1248, 1249, 1250,
        ],
    },
    {
        rarity: 5,
        itemIds: [7000102, 7000103],
        itemCounts: [5, 1],
        priceId: 7000101,
        price: 8000,
        tierIds: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
            1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033,
            1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054,
            1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075,
            1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096,
            1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117,
            1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138,
            1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159,
            1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180,
            1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201,
            1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222,
            1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243,
            1244, 1245, 1246, 1247, 1248, 1249, 1250,
        ],
    },
    {
        rarity: 10,
        itemIds: [7000102, 7000103],
        itemCounts: [5, 5],
        priceId: 7000101,
        price: 100000,
        tierIds: [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012,
            1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020, 1021, 1022, 1023, 1024, 1025, 1026, 1027, 1028, 1029, 1030, 1031, 1032, 1033,
            1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054,
            1055, 1056, 1057, 1058, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074, 1075,
            1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091, 1092, 1093, 1094, 1095, 1096,
            1097, 1098, 1099, 1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107, 1108, 1109, 1110, 1111, 1112, 1113, 1114, 1115, 1116, 1117,
            1118, 1119, 1120, 1121, 1122, 1123, 1124, 1125, 1126, 1127, 1128, 1129, 1130, 1131, 1132, 1133, 1134, 1135, 1136, 1137, 1138,
            1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159,
            1160, 1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175, 1176, 1177, 1178, 1179, 1180,
            1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1199, 1200, 1201,
            1202, 1203, 1204, 1205, 1206, 1207, 1208, 1209, 1210, 1211, 1212, 1213, 1214, 1215, 1216, 1217, 1218, 1219, 1220, 1221, 1222,
            1223, 1224, 1225, 1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243,
            1244, 1245, 1246, 1247, 1248, 1249, 1250,
        ],
    },
]

const rawAffixPools: DnaSeasonAffixPool[] = [
    {
        id: 201,
        name: "进攻",
    },
    {
        id: 202,
        name: "防御",
    },
    {
        id: 203,
        name: "战术",
    },
    {
        id: 204,
        name: "技巧",
    },
    {
        id: 205,
        name: "治愈",
    },
    {
        id: 211,
        name: "协战",
    },
]

const rawAffixLevels: DnaSeasonAffixLevel[] = [
    {
        power: 1,
        plans: [
            {
                planId: 1,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 2,
                minRollLevel: 1,
                maxRollLevel: 10,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 2,
        plans: [
            {
                planId: 1,
                minRollLevel: 2,
                maxRollLevel: 2,
            },
            {
                planId: 2,
                minRollLevel: 11,
                maxRollLevel: 20,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 3,
        plans: [
            {
                planId: 1,
                minRollLevel: 3,
                maxRollLevel: 3,
            },
            {
                planId: 2,
                minRollLevel: 21,
                maxRollLevel: 30,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 4,
        plans: [
            {
                planId: 1,
                minRollLevel: 4,
                maxRollLevel: 4,
            },
            {
                planId: 2,
                minRollLevel: 31,
                maxRollLevel: 40,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 5,
        plans: [
            {
                planId: 1,
                minRollLevel: 5,
                maxRollLevel: 5,
            },
            {
                planId: 2,
                minRollLevel: 41,
                maxRollLevel: 50,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 6,
        plans: [
            {
                planId: 1,
                minRollLevel: 6,
                maxRollLevel: 6,
            },
            {
                planId: 2,
                minRollLevel: 51,
                maxRollLevel: 60,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 7,
        plans: [
            {
                planId: 1,
                minRollLevel: 7,
                maxRollLevel: 7,
            },
            {
                planId: 2,
                minRollLevel: 61,
                maxRollLevel: 70,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 8,
        plans: [
            {
                planId: 1,
                minRollLevel: 8,
                maxRollLevel: 8,
            },
            {
                planId: 2,
                minRollLevel: 71,
                maxRollLevel: 80,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 9,
        plans: [
            {
                planId: 1,
                minRollLevel: 9,
                maxRollLevel: 9,
            },
            {
                planId: 2,
                minRollLevel: 81,
                maxRollLevel: 90,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 10,
        plans: [
            {
                planId: 1,
                minRollLevel: 10,
                maxRollLevel: 10,
            },
            {
                planId: 2,
                minRollLevel: 91,
                maxRollLevel: 100,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 11,
        plans: [
            {
                planId: 1,
                minRollLevel: 11,
                maxRollLevel: 11,
            },
            {
                planId: 2,
                minRollLevel: 101,
                maxRollLevel: 110,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 12,
        plans: [
            {
                planId: 1,
                minRollLevel: 12,
                maxRollLevel: 12,
            },
            {
                planId: 2,
                minRollLevel: 111,
                maxRollLevel: 120,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 13,
        plans: [
            {
                planId: 1,
                minRollLevel: 13,
                maxRollLevel: 13,
            },
            {
                planId: 2,
                minRollLevel: 121,
                maxRollLevel: 130,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 14,
        plans: [
            {
                planId: 1,
                minRollLevel: 14,
                maxRollLevel: 14,
            },
            {
                planId: 2,
                minRollLevel: 131,
                maxRollLevel: 140,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 15,
        plans: [
            {
                planId: 1,
                minRollLevel: 15,
                maxRollLevel: 15,
            },
            {
                planId: 2,
                minRollLevel: 141,
                maxRollLevel: 150,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 16,
        plans: [
            {
                planId: 1,
                minRollLevel: 16,
                maxRollLevel: 16,
            },
            {
                planId: 2,
                minRollLevel: 151,
                maxRollLevel: 160,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 17,
        plans: [
            {
                planId: 1,
                minRollLevel: 17,
                maxRollLevel: 17,
            },
            {
                planId: 2,
                minRollLevel: 161,
                maxRollLevel: 170,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 18,
        plans: [
            {
                planId: 1,
                minRollLevel: 18,
                maxRollLevel: 18,
            },
            {
                planId: 2,
                minRollLevel: 171,
                maxRollLevel: 180,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 19,
        plans: [
            {
                planId: 1,
                minRollLevel: 19,
                maxRollLevel: 19,
            },
            {
                planId: 2,
                minRollLevel: 181,
                maxRollLevel: 190,
            },
            {
                planId: 3,
                minRollLevel: 1,
                maxRollLevel: 2,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 20,
        plans: [
            {
                planId: 1,
                minRollLevel: 20,
                maxRollLevel: 20,
            },
            {
                planId: 2,
                minRollLevel: 191,
                maxRollLevel: 200,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 21,
        plans: [
            {
                planId: 1,
                minRollLevel: 21,
                maxRollLevel: 21,
            },
            {
                planId: 2,
                minRollLevel: 201,
                maxRollLevel: 210,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 22,
        plans: [
            {
                planId: 1,
                minRollLevel: 22,
                maxRollLevel: 22,
            },
            {
                planId: 2,
                minRollLevel: 211,
                maxRollLevel: 220,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 23,
        plans: [
            {
                planId: 1,
                minRollLevel: 23,
                maxRollLevel: 23,
            },
            {
                planId: 2,
                minRollLevel: 221,
                maxRollLevel: 230,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 24,
        plans: [
            {
                planId: 1,
                minRollLevel: 24,
                maxRollLevel: 24,
            },
            {
                planId: 2,
                minRollLevel: 231,
                maxRollLevel: 240,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 25,
        plans: [
            {
                planId: 1,
                minRollLevel: 25,
                maxRollLevel: 25,
            },
            {
                planId: 2,
                minRollLevel: 241,
                maxRollLevel: 250,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 26,
        plans: [
            {
                planId: 1,
                minRollLevel: 26,
                maxRollLevel: 26,
            },
            {
                planId: 2,
                minRollLevel: 251,
                maxRollLevel: 260,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 27,
        plans: [
            {
                planId: 1,
                minRollLevel: 27,
                maxRollLevel: 27,
            },
            {
                planId: 2,
                minRollLevel: 261,
                maxRollLevel: 270,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 28,
        plans: [
            {
                planId: 1,
                minRollLevel: 28,
                maxRollLevel: 28,
            },
            {
                planId: 2,
                minRollLevel: 271,
                maxRollLevel: 280,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 29,
        plans: [
            {
                planId: 1,
                minRollLevel: 29,
                maxRollLevel: 29,
            },
            {
                planId: 2,
                minRollLevel: 281,
                maxRollLevel: 290,
            },
            {
                planId: 3,
                minRollLevel: 2,
                maxRollLevel: 3,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 30,
        plans: [
            {
                planId: 1,
                minRollLevel: 30,
                maxRollLevel: 30,
            },
            {
                planId: 2,
                minRollLevel: 291,
                maxRollLevel: 300,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 31,
        plans: [
            {
                planId: 1,
                minRollLevel: 31,
                maxRollLevel: 31,
            },
            {
                planId: 2,
                minRollLevel: 301,
                maxRollLevel: 310,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 32,
        plans: [
            {
                planId: 1,
                minRollLevel: 32,
                maxRollLevel: 32,
            },
            {
                planId: 2,
                minRollLevel: 311,
                maxRollLevel: 320,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 33,
        plans: [
            {
                planId: 1,
                minRollLevel: 33,
                maxRollLevel: 33,
            },
            {
                planId: 2,
                minRollLevel: 321,
                maxRollLevel: 330,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 34,
        plans: [
            {
                planId: 1,
                minRollLevel: 34,
                maxRollLevel: 34,
            },
            {
                planId: 2,
                minRollLevel: 331,
                maxRollLevel: 340,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 35,
        plans: [
            {
                planId: 1,
                minRollLevel: 35,
                maxRollLevel: 35,
            },
            {
                planId: 2,
                minRollLevel: 341,
                maxRollLevel: 350,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 36,
        plans: [
            {
                planId: 1,
                minRollLevel: 36,
                maxRollLevel: 36,
            },
            {
                planId: 2,
                minRollLevel: 351,
                maxRollLevel: 360,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 37,
        plans: [
            {
                planId: 1,
                minRollLevel: 37,
                maxRollLevel: 37,
            },
            {
                planId: 2,
                minRollLevel: 361,
                maxRollLevel: 370,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 38,
        plans: [
            {
                planId: 1,
                minRollLevel: 38,
                maxRollLevel: 38,
            },
            {
                planId: 2,
                minRollLevel: 371,
                maxRollLevel: 380,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 39,
        plans: [
            {
                planId: 1,
                minRollLevel: 39,
                maxRollLevel: 39,
            },
            {
                planId: 2,
                minRollLevel: 381,
                maxRollLevel: 390,
            },
            {
                planId: 3,
                minRollLevel: 3,
                maxRollLevel: 4,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 40,
        plans: [
            {
                planId: 1,
                minRollLevel: 40,
                maxRollLevel: 40,
            },
            {
                planId: 2,
                minRollLevel: 391,
                maxRollLevel: 400,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 41,
        plans: [
            {
                planId: 1,
                minRollLevel: 41,
                maxRollLevel: 41,
            },
            {
                planId: 2,
                minRollLevel: 401,
                maxRollLevel: 410,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 42,
        plans: [
            {
                planId: 1,
                minRollLevel: 42,
                maxRollLevel: 42,
            },
            {
                planId: 2,
                minRollLevel: 411,
                maxRollLevel: 420,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 43,
        plans: [
            {
                planId: 1,
                minRollLevel: 43,
                maxRollLevel: 43,
            },
            {
                planId: 2,
                minRollLevel: 421,
                maxRollLevel: 430,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 44,
        plans: [
            {
                planId: 1,
                minRollLevel: 44,
                maxRollLevel: 44,
            },
            {
                planId: 2,
                minRollLevel: 431,
                maxRollLevel: 440,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 45,
        plans: [
            {
                planId: 1,
                minRollLevel: 45,
                maxRollLevel: 45,
            },
            {
                planId: 2,
                minRollLevel: 441,
                maxRollLevel: 450,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 46,
        plans: [
            {
                planId: 1,
                minRollLevel: 46,
                maxRollLevel: 46,
            },
            {
                planId: 2,
                minRollLevel: 451,
                maxRollLevel: 460,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 47,
        plans: [
            {
                planId: 1,
                minRollLevel: 47,
                maxRollLevel: 47,
            },
            {
                planId: 2,
                minRollLevel: 461,
                maxRollLevel: 470,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 48,
        plans: [
            {
                planId: 1,
                minRollLevel: 48,
                maxRollLevel: 48,
            },
            {
                planId: 2,
                minRollLevel: 471,
                maxRollLevel: 480,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 49,
        plans: [
            {
                planId: 1,
                minRollLevel: 49,
                maxRollLevel: 49,
            },
            {
                planId: 2,
                minRollLevel: 481,
                maxRollLevel: 490,
            },
            {
                planId: 3,
                minRollLevel: 4,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
    {
        power: 50,
        plans: [
            {
                planId: 1,
                minRollLevel: 50,
                maxRollLevel: 50,
            },
            {
                planId: 2,
                minRollLevel: 491,
                maxRollLevel: 500,
            },
            {
                planId: 3,
                minRollLevel: 5,
                maxRollLevel: 5,
            },
            {
                planId: 4,
                minRollLevel: 1,
                maxRollLevel: 1,
            },
        ],
    },
]

const rawAffixes: DnaSeasonAffix[] = [
    {
        id: 101,
        plan: 1,
        addAttrs: [
            {
                attr: "攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.9171,
        maxValue: 2.6237,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 102,
        plan: 1,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.9171,
        maxValue: 2.6237,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 103,
        plan: 1,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.9171,
        maxValue: 2.6237,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 104,
        plan: 1,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.9171,
        maxValue: 2.6237,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 105,
        plan: 1,
        addAttrs: [
            {
                attr: "移动速度",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.0563,
        maxValue: 0.1609,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 106,
        plan: 1,
        addAttrs: [
            {
                attr: "减伤",
                addType: "Value",
                individualRateZone: 1,
                isPercent: true,
            },
        ],
        minValue: -0.15,
        maxValue: -0.4291,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 107,
        plan: 1,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 1.07,
        maxValue: 3.061,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 108,
        plan: 1,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 1.07,
        maxValue: 3.061,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 109,
        plan: 1,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 1.07,
        maxValue: 3.061,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 110,
        plan: 1,
        addAttrs: [
            {
                attr: "减伤",
                addType: "Value",
                individualRateZone: 1,
                isPercent: true,
            },
        ],
        minValue: -0.18,
        maxValue: -0.5149,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 111,
        plan: 1,
        addAttrs: [
            {
                attr: "增伤",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.423,
        maxValue: 1.2101,
        totalValueLevel: 50,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        planName: "基础词缀",
    },
    {
        id: 1001,
        plan: 2,
        addAttrs: [
            {
                attr: "攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.3057,
        maxValue: 0.8746,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1002,
        plan: 2,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.3057,
        maxValue: 0.8746,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 202,
        planName: "随机词缀",
        poolName: "防御",
    },
    {
        id: 1003,
        plan: 2,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.3057,
        maxValue: 0.8746,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 202,
        planName: "随机词缀",
        poolName: "防御",
    },
    {
        id: 1004,
        plan: 2,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.3057,
        maxValue: 0.8746,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 202,
        planName: "随机词缀",
        poolName: "防御",
    },
    {
        id: 1005,
        plan: 2,
        addAttrs: [
            {
                attr: "神智",
                addType: "Rate",
            },
        ],
        minValue: 0.3057,
        maxValue: 0.8746,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 205,
        planName: "随机词缀",
        poolName: "治愈",
    },
    {
        id: 1006,
        plan: 2,
        addAttrs: [
            {
                attr: "水属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.0594,
        maxValue: 0.17,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        exclusionAffixIds: [1007, 1008, 1009, 1010, 1011],
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1007,
        plan: 2,
        addAttrs: [
            {
                attr: "火属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.0594,
        maxValue: 0.17,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        exclusionAffixIds: [1006, 1008, 1009, 1010, 1011],
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1008,
        plan: 2,
        addAttrs: [
            {
                attr: "风属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.0594,
        maxValue: 0.17,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        exclusionAffixIds: [1006, 1007, 1009, 1010, 1011],
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1009,
        plan: 2,
        addAttrs: [
            {
                attr: "雷属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.0594,
        maxValue: 0.17,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        exclusionAffixIds: [1006, 1007, 1008, 1010, 1011],
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1010,
        plan: 2,
        addAttrs: [
            {
                attr: "光属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.0594,
        maxValue: 0.17,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        exclusionAffixIds: [1006, 1007, 1008, 1009, 1011],
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1011,
        plan: 2,
        addAttrs: [
            {
                attr: "暗属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.0594,
        maxValue: 0.17,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        exclusionAffixIds: [1006, 1007, 1008, 1009, 1010],
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1012,
        plan: 2,
        addAttrs: [
            {
                attr: "移动速度",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.0187,
        maxValue: 0.0536,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1013,
        plan: 2,
        addAttrs: [
            {
                attr: "技能威力",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.2676,
        maxValue: 0.7655,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1014,
        plan: 2,
        addAttrs: [
            {
                attr: "技能效益",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.1673,
        maxValue: 0.4785,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1015,
        plan: 2,
        addAttrs: [
            {
                attr: "技能耐久",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.4014,
        maxValue: 1.1483,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1016,
        plan: 2,
        addAttrs: [
            {
                attr: "技能范围",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.2058,
        maxValue: 0.5889,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1017,
        plan: 2,
        addAttrs: [
            {
                attr: "昂扬",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.188,
        maxValue: 0.5378,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1018,
        plan: 2,
        addAttrs: [
            {
                attr: "背水",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.0627,
        maxValue: 0.1793,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1019,
        plan: 2,
        addAttrs: [
            {
                attr: "近战增伤",
                addType: "Value",
                tag: "Melee",
                isPercent: true,
            },
        ],
        minValue: 0.2115,
        maxValue: 0.6051,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1020,
        plan: 2,
        addAttrs: [
            {
                attr: "远程增伤",
                addType: "Value",
                tag: "Ranged",
                isPercent: true,
            },
        ],
        minValue: 0.2115,
        maxValue: 0.6051,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1021,
        plan: 2,
        addAttrs: [
            {
                attr: "技能伤害",
                addType: "Value",
                tag: "Skill",
                isPercent: true,
            },
        ],
        minValue: 0.2115,
        maxValue: 0.6051,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1022,
        plan: 2,
        addAttrs: [
            {
                attr: "召唤物伤害",
                addType: "Value",
                tag: "Summon",
                isPercent: true,
            },
        ],
        minValue: 0.2115,
        maxValue: 0.6051,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1023,
        plan: 2,
        addAttrs: [
            {
                attr: "增伤",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.141,
        maxValue: 0.4034,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 201,
        planName: "随机词缀",
        poolName: "进攻",
    },
    {
        id: 1024,
        plan: 2,
        addAttrs: [
            {
                attr: "水属性追伤",
                element: "Water",
                addType: "Value",
                type: "Water",
                isPercent: true,
            },
        ],
        minValue: 0.0834,
        maxValue: 0.2387,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1025, 1026, 1027, 1028, 1029],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1025,
        plan: 2,
        addAttrs: [
            {
                attr: "火属性追伤",
                element: "Fire",
                addType: "Value",
                type: "Fire",
                isPercent: true,
            },
        ],
        minValue: 0.0834,
        maxValue: 0.2387,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1024, 1026, 1027, 1028, 1029],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1026,
        plan: 2,
        addAttrs: [
            {
                attr: "风属性追伤",
                element: "Wind",
                addType: "Value",
                type: "Wind",
                isPercent: true,
            },
        ],
        minValue: 0.0834,
        maxValue: 0.2387,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1024, 1025, 1027, 1028, 1029],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1027,
        plan: 2,
        addAttrs: [
            {
                attr: "雷属性追伤",
                element: "Thunder",
                addType: "Value",
                type: "Thunder",
                isPercent: true,
            },
        ],
        minValue: 0.0834,
        maxValue: 0.2387,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1024, 1025, 1026, 1028, 1029],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1028,
        plan: 2,
        addAttrs: [
            {
                attr: "光属性追伤",
                element: "Light",
                addType: "Value",
                type: "Light",
                isPercent: true,
            },
        ],
        minValue: 0.0834,
        maxValue: 0.2387,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1024, 1025, 1026, 1027, 1029],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1029,
        plan: 2,
        addAttrs: [
            {
                attr: "暗属性追伤",
                element: "Dark",
                addType: "Value",
                type: "Dark",
                isPercent: true,
            },
        ],
        minValue: 0.0834,
        maxValue: 0.2387,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1024, 1025, 1026, 1027, 1028],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1030,
        plan: 2,
        addAttrs: [
            {
                attr: "赛季增伤",
                addType: "Value",
                rateZone: "S0DamageRate",
                isPercent: true,
            },
        ],
        minValue: 0.0625,
        maxValue: 0.1788,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        planName: "随机词缀",
    },
    {
        id: 1031,
        plan: 2,
        addAttrs: [
            {
                attr: "属性穿透",
                addType: "Value",
                rateZone: "Almighty",
                isPercent: true,
            },
        ],
        minValue: 0.075,
        maxValue: 0.2146,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        planName: "随机词缀",
    },
    {
        id: 1032,
        plan: 2,
        addAttrs: [
            {
                attr: "水属性增伤",
                element: "Water",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.143,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1033,
        plan: 2,
        addAttrs: [
            {
                attr: "火属性增伤",
                element: "Fire",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.143,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1034,
        plan: 2,
        addAttrs: [
            {
                attr: "风属性增伤",
                element: "Wind",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.143,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1035,
        plan: 2,
        addAttrs: [
            {
                attr: "雷属性增伤",
                element: "Thunder",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.143,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1036,
        plan: 2,
        addAttrs: [
            {
                attr: "光属性增伤",
                element: "Light",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.143,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1037,
        plan: 2,
        addAttrs: [
            {
                attr: "暗属性增伤",
                element: "Dark",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.143,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1038,
        plan: 3,
        minValue: 1,
        maxValue: 5,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 2,
        },
        maxAffixUpdateFunc: {
            Add: 1,
        },
        slotTypes: [3],
        desc: "战技技能等级",
        addSkillLevel: {
            skillTypes: ["Skill1"],
        },
        planName: "技能等级",
    },
    {
        id: 1039,
        plan: 3,
        minValue: 1,
        maxValue: 5,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 2,
        },
        maxAffixUpdateFunc: {
            Add: 1,
        },
        slotTypes: [5],
        desc: "终结技技能等级",
        addSkillLevel: {
            skillTypes: ["Skill2"],
        },
        planName: "技能等级",
    },
    {
        id: 1040,
        plan: 3,
        minValue: 1,
        maxValue: 5,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 2,
        },
        maxAffixUpdateFunc: {
            Add: 1,
        },
        slotTypes: [6],
        desc: "被动技能等级",
        addSkillLevel: {
            skillTypes: ["Passive"],
        },
        planName: "技能等级",
    },
    {
        id: 1041,
        plan: 2,
        addAttrs: [
            {
                attr: "充盈威力",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.65,
        maxValue: 1.8595,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 204,
        planName: "随机词缀",
        poolName: "技巧",
    },
    {
        id: 1042,
        plan: 2,
        addAttrs: [
            {
                attr: "普通近战攻击",
                addType: "Value",
                type: "CMelee",
                isPercent: true,
            },
        ],
        minValue: 0.428,
        maxValue: 1.2244,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1043,
        plan: 2,
        addAttrs: [
            {
                attr: "普通近战暴击",
                addType: "Value",
                type: "CMelee",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1044,
        plan: 2,
        addAttrs: [
            {
                attr: "普通近战暴伤",
                addType: "Value",
                type: "CMelee",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1045,
        plan: 2,
        addAttrs: [
            {
                attr: "普通近战触发",
                addType: "Value",
                type: "CMelee",
                isPercent: true,
            },
        ],
        minValue: 0.234,
        maxValue: 0.6694,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1046,
        plan: 2,
        addAttrs: [
            {
                attr: "普通远程攻击",
                addType: "Value",
                type: "CRanged",
                isPercent: true,
            },
        ],
        minValue: 0.428,
        maxValue: 1.2244,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1047,
        plan: 2,
        addAttrs: [
            {
                attr: "普通远程暴击",
                addType: "Value",
                type: "CRanged",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1048,
        plan: 2,
        addAttrs: [
            {
                attr: "普通远程暴伤",
                addType: "Value",
                type: "CRanged",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1049,
        plan: 2,
        addAttrs: [
            {
                attr: "普通远程触发",
                addType: "Value",
                type: "CRanged",
                isPercent: true,
            },
        ],
        minValue: 0.234,
        maxValue: 0.6694,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1050,
        plan: 2,
        addAttrs: [
            {
                attr: "同律近战攻击",
                addType: "Value",
                type: "UMelee",
                isPercent: true,
            },
        ],
        minValue: 0.428,
        maxValue: 1.2244,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1051,
        plan: 2,
        addAttrs: [
            {
                attr: "同律近战暴击",
                addType: "Value",
                type: "UMelee",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1052,
        plan: 2,
        addAttrs: [
            {
                attr: "同律近战暴伤",
                addType: "Value",
                type: "UMelee",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1053,
        plan: 2,
        addAttrs: [
            {
                attr: "同律近战触发",
                addType: "Value",
                type: "UMelee",
                isPercent: true,
            },
        ],
        minValue: 0.234,
        maxValue: 0.6694,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1054, 1055, 1056, 1057],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1054,
        plan: 2,
        addAttrs: [
            {
                attr: "同律远程攻击",
                addType: "Value",
                type: "URanged",
                isPercent: true,
            },
        ],
        minValue: 0.428,
        maxValue: 1.2244,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1055,
        plan: 2,
        addAttrs: [
            {
                attr: "同律远程暴击",
                addType: "Value",
                type: "URanged",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1056,
        plan: 2,
        addAttrs: [
            {
                attr: "同律远程暴伤",
                addType: "Value",
                type: "URanged",
                isPercent: true,
            },
        ],
        minValue: 0.2476,
        maxValue: 0.7083,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1057,
        plan: 2,
        addAttrs: [
            {
                attr: "同律远程触发",
                addType: "Value",
                type: "URanged",
                isPercent: true,
            },
        ],
        minValue: 0.234,
        maxValue: 0.6694,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 203,
        exclusionAffixIds: [1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053],
        planName: "随机词缀",
        poolName: "战术",
    },
    {
        id: 1058,
        plan: 3,
        addAttrs: [
            {
                attr: "神智回复",
                addType: "Value",
            },
        ],
        minValue: 3,
        maxValue: 15,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 3,
        },
        maxAffixUpdateFunc: {
            Add: 3,
        },
        pool: 205,
        planName: "技能等级",
        poolName: "治愈",
    },
    {
        id: 1059,
        plan: 2,
        addAttrs: [
            {
                attr: "生命回复",
                addType: "Value",
            },
        ],
        minValue: 50,
        maxValue: 143.038,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 205,
        planName: "随机词缀",
        poolName: "治愈",
    },
    {
        id: 1060,
        plan: 2,
        addAttrs: [
            {
                attr: "生命恢复增幅",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.125,
        maxValue: 0.3576,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 205,
        planName: "随机词缀",
        poolName: "治愈",
    },
    {
        id: 1061,
        plan: 2,
        addAttrs: [
            {
                attr: "减伤",
                addType: "Value",
                individualRateZone: 1,
                isPercent: true,
            },
        ],
        minValue: -0.05,
        maxValue: -0.143,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 202,
        planName: "随机词缀",
        poolName: "防御",
    },
    {
        id: 1501,
        plan: 2,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.3567,
        maxValue: 1.0203,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1502,
        plan: 2,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.3567,
        maxValue: 1.0203,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1503,
        plan: 2,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.3567,
        maxValue: 1.0203,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1504,
        plan: 2,
        addAttrs: [
            {
                attr: "神智",
                addType: "Rate",
            },
        ],
        minValue: 0.535,
        maxValue: 1.5305,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1505,
        plan: 2,
        addAttrs: [
            {
                attr: "移动速度",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.0375,
        maxValue: 0.1073,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1506,
        plan: 2,
        addAttrs: [
            {
                attr: "技能威力",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.3345,
        maxValue: 0.9569,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1507,
        plan: 2,
        addAttrs: [
            {
                attr: "技能效益",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.2091,
        maxValue: 0.5981,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1508,
        plan: 2,
        addAttrs: [
            {
                attr: "技能耐久",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.5018,
        maxValue: 1.4354,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1509,
        plan: 2,
        addAttrs: [
            {
                attr: "技能范围",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.2573,
        maxValue: 0.7361,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1510,
        plan: 3,
        minValue: 1,
        maxValue: 5,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 2,
        },
        maxAffixUpdateFunc: {
            Add: 1,
        },
        slotTypes: [8],
        desc: "战技技能等级",
        addSkillLevel: {
            skillTypes: ["Skill1"],
        },
        planName: "技能等级",
    },
    {
        id: 1511,
        plan: 3,
        minValue: 1,
        maxValue: 5,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 2,
        },
        maxAffixUpdateFunc: {
            Add: 1,
        },
        slotTypes: [9],
        desc: "终结技技能等级",
        addSkillLevel: {
            skillTypes: ["Skill2"],
        },
        planName: "技能等级",
    },
    {
        id: 1512,
        plan: 3,
        minValue: 1,
        maxValue: 5,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 2,
        },
        maxAffixUpdateFunc: {
            Add: 1,
        },
        slotTypes: [10],
        desc: "被动技能等级",
        addSkillLevel: {
            skillTypes: ["Passive"],
        },
        planName: "技能等级",
    },
    {
        id: 1513,
        plan: 2,
        addAttrs: [
            {
                attr: "充盈威力",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.65,
        maxValue: 1.8595,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1514,
        plan: 3,
        addAttrs: [
            {
                attr: "神智回复",
                addType: "Value",
            },
        ],
        minValue: 3,
        maxValue: 15,
        totalValueLevel: 5,
        affixUpdatePerLvFunc: {
            Add: 0,
        },
        ancientFunc: {
            Add: 3,
        },
        maxAffixUpdateFunc: {
            Add: 3,
        },
        pool: 211,
        planName: "技能等级",
        poolName: "协战",
    },
    {
        id: 1515,
        plan: 2,
        addAttrs: [
            {
                attr: "生命回复",
                addType: "Value",
            },
        ],
        minValue: 50,
        maxValue: 143.038,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1516,
        plan: 2,
        addAttrs: [
            {
                attr: "生命恢复增幅",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.125,
        maxValue: 0.3576,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 1517,
        plan: 2,
        addAttrs: [
            {
                attr: "减伤",
                addType: "Value",
                individualRateZone: 1,
                isPercent: true,
            },
        ],
        minValue: -0.06,
        maxValue: -0.1716,
        totalValueLevel: 500,
        affixUpdatePerLvFunc: {
            Multi: 1.01,
        },
        ancientFunc: {
            Multi: 1.2,
        },
        maxAffixUpdateFunc: {
            Multi: 1.1,
        },
        pool: 211,
        planName: "随机词缀",
        poolName: "协战",
    },
    {
        id: 2001,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "螺旋飞跃后，下落攻击造成的伤害提高900.0%，持续20.0秒。",
        passiveEffectId: 9001,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2002,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "普通攻击造成伤害时，若连击点数已满，本次伤害额外附加100.0%暴击率；若自身生命值高于80.0%，有32.0%概率使本次伤害翻倍。",
        passiveEffectId: 9002,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2003,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "每累计消耗50.0点神智，在自身附近掉落1个弹药补给箱。",
        passiveEffectId: 9003,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2004,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "技能耐久超过100.0%时，溢出部分转化为独立的伤害提高效果，转化比例为2.4%。",
        passiveEffectId: 9004,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2005,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "技能范围超过100.0%时，溢出部分转化为独立的伤害提高效果，转化比例为4.9%。",
        passiveEffectId: 9005,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2006,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "技能效益超过100.0%时，溢出部分转化为独立的伤害提高效果，转化比例为5.6%。",
        passiveEffectId: 9006,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2007,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "水属性角色的召唤物造成伤害时，无视目标17.5%防御。",
        passiveEffectId: 9007,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2008,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "火属性角色造成技能伤害时，25.0%概率为目标附加54.0%火属性弱点（受到的火属性伤害提升），持续8.0秒。",
        passiveEffectId: 9008,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2009,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "风属性角色造成的武器伤害提高，数值为充盈威力超过100%部分的11.1%。",
        passiveEffectId: 9009,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2010,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "雷属性角色造成技能伤害时，33.3%概率重复此次伤害。",
        passiveEffectId: 9010,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2011,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "光属性角色触发紊乱后，造成的技能伤害提高515.0%，持续10.0秒。",
        passiveEffectId: 9011,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2012,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "暗属性角色造成武器伤害时，有25.0%概率获得一层随机属性追伤，每层追伤6.4%，持续12.0秒；每种属性最多叠加10层。",
        passiveEffectId: 9012,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2013,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "闪避后，移动速度提高30.0%，持续5.0秒。",
        passiveEffectId: 9013,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2014,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "造成治疗效果时，使目标获得75.0%全属性穿透，持续8.0秒。",
        passiveEffectId: 9014,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2015,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "释放终结技后，使其他队友获得430.0%昂扬和80.0%技能速度，持续时间无限。",
        passiveEffectId: 9015,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 3101,
        plan: 4,
        addAttrs: [
            {
                attr: "火属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.01,
        maxValue: 0.01,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3102,
        plan: 4,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.12,
        maxValue: 0.12,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3103,
        plan: 4,
        addAttrs: [
            {
                attr: "充盈威力",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.15,
        maxValue: 0.15,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3111,
        plan: 4,
        addAttrs: [
            {
                attr: "火属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.02,
        maxValue: 0.02,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3112,
        plan: 4,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.24,
        maxValue: 0.24,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3113,
        plan: 4,
        addAttrs: [
            {
                attr: "充盈威力",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.3,
        maxValue: 0.3,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3121,
        plan: 4,
        addAttrs: [
            {
                attr: "火属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.03,
        maxValue: 0.03,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3122,
        plan: 4,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.36,
        maxValue: 0.36,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3123,
        plan: 4,
        addAttrs: [
            {
                attr: "充盈威力",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.45,
        maxValue: 0.45,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3131,
        plan: 4,
        addAttrs: [
            {
                attr: "火属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.04,
        maxValue: 0.04,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3132,
        plan: 4,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.48,
        maxValue: 0.48,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3133,
        plan: 4,
        addAttrs: [
            {
                attr: "充盈威力",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.6,
        maxValue: 0.6,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3141,
        plan: 4,
        addAttrs: [
            {
                attr: "火属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3142,
        plan: 4,
        addAttrs: [
            {
                attr: "生命",
                addType: "Rate",
            },
        ],
        minValue: 0.6,
        maxValue: 0.6,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3143,
        plan: 4,
        addAttrs: [
            {
                attr: "充盈威力",
                addType: "Value",
                isPercent: true,
            },
        ],
        minValue: 0.75,
        maxValue: 0.75,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3201,
        plan: 4,
        addAttrs: [
            {
                attr: "水属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.01,
        maxValue: 0.01,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3202,
        plan: 4,
        addAttrs: [
            {
                attr: "生命回复",
                addType: "Value",
            },
        ],
        minValue: 12,
        maxValue: 12,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 3203,
        plan: 4,
        addAttrs: [
            {
                attr: "召唤物伤害",
                addType: "Value",
                tag: "Summon",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3211,
        plan: 4,
        addAttrs: [
            {
                attr: "水属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.02,
        maxValue: 0.02,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3212,
        plan: 4,
        addAttrs: [
            {
                attr: "生命回复",
                addType: "Value",
            },
        ],
        minValue: 24,
        maxValue: 24,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 3213,
        plan: 4,
        addAttrs: [
            {
                attr: "召唤物伤害",
                addType: "Value",
                tag: "Summon",
                isPercent: true,
            },
        ],
        minValue: 0.1,
        maxValue: 0.1,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3221,
        plan: 4,
        addAttrs: [
            {
                attr: "水属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.03,
        maxValue: 0.03,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3222,
        plan: 4,
        addAttrs: [
            {
                attr: "生命回复",
                addType: "Value",
            },
        ],
        minValue: 36,
        maxValue: 36,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 3223,
        plan: 4,
        addAttrs: [
            {
                attr: "召唤物伤害",
                addType: "Value",
                tag: "Summon",
                isPercent: true,
            },
        ],
        minValue: 0.15,
        maxValue: 0.15,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3231,
        plan: 4,
        addAttrs: [
            {
                attr: "水属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.04,
        maxValue: 0.04,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3232,
        plan: 4,
        addAttrs: [
            {
                attr: "生命回复",
                addType: "Value",
            },
        ],
        minValue: 48,
        maxValue: 48,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 3233,
        plan: 4,
        addAttrs: [
            {
                attr: "召唤物伤害",
                addType: "Value",
                tag: "Summon",
                isPercent: true,
            },
        ],
        minValue: 0.2,
        maxValue: 0.2,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3241,
        plan: 4,
        addAttrs: [
            {
                attr: "水属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3242,
        plan: 4,
        addAttrs: [
            {
                attr: "生命回复",
                addType: "Value",
            },
        ],
        minValue: 60,
        maxValue: 60,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 3243,
        plan: 4,
        addAttrs: [
            {
                attr: "召唤物伤害",
                addType: "Value",
                tag: "Summon",
                isPercent: true,
            },
        ],
        minValue: 0.25,
        maxValue: 0.25,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3301,
        plan: 4,
        addAttrs: [
            {
                attr: "风属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.01,
        maxValue: 0.01,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3302,
        plan: 4,
        addAttrs: [
            {
                attr: "神智回复",
                addType: "Value",
            },
        ],
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3303,
        plan: 4,
        addAttrs: [
            {
                attr: "远程增伤",
                addType: "Value",
                tag: "Ranged",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3311,
        plan: 4,
        addAttrs: [
            {
                attr: "风属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.02,
        maxValue: 0.02,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3312,
        plan: 4,
        addAttrs: [
            {
                attr: "神智回复",
                addType: "Value",
            },
        ],
        minValue: 2,
        maxValue: 2,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3313,
        plan: 4,
        addAttrs: [
            {
                attr: "远程增伤",
                addType: "Value",
                tag: "Ranged",
                isPercent: true,
            },
        ],
        minValue: 0.1,
        maxValue: 0.1,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3321,
        plan: 4,
        addAttrs: [
            {
                attr: "风属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.03,
        maxValue: 0.03,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3322,
        plan: 4,
        addAttrs: [
            {
                attr: "神智回复",
                addType: "Value",
            },
        ],
        minValue: 3,
        maxValue: 3,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3323,
        plan: 4,
        addAttrs: [
            {
                attr: "远程增伤",
                addType: "Value",
                tag: "Ranged",
                isPercent: true,
            },
        ],
        minValue: 0.15,
        maxValue: 0.15,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3331,
        plan: 4,
        addAttrs: [
            {
                attr: "风属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.04,
        maxValue: 0.04,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3332,
        plan: 4,
        addAttrs: [
            {
                attr: "神智回复",
                addType: "Value",
            },
        ],
        minValue: 4,
        maxValue: 4,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3333,
        plan: 4,
        addAttrs: [
            {
                attr: "远程增伤",
                addType: "Value",
                tag: "Ranged",
                isPercent: true,
            },
        ],
        minValue: 0.2,
        maxValue: 0.2,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3341,
        plan: 4,
        addAttrs: [
            {
                attr: "风属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3342,
        plan: 4,
        addAttrs: [
            {
                attr: "神智回复",
                addType: "Value",
            },
        ],
        minValue: 5,
        maxValue: 5,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3343,
        plan: 4,
        addAttrs: [
            {
                attr: "远程增伤",
                addType: "Value",
                tag: "Ranged",
                isPercent: true,
            },
        ],
        minValue: 0.25,
        maxValue: 0.25,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3401,
        plan: 4,
        addAttrs: [
            {
                attr: "雷属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.01,
        maxValue: 0.01,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3402,
        plan: 4,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.12,
        maxValue: 0.12,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3403,
        plan: 4,
        addAttrs: [
            {
                attr: "技能伤害",
                addType: "Value",
                tag: "Skill",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3411,
        plan: 4,
        addAttrs: [
            {
                attr: "雷属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.02,
        maxValue: 0.02,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3412,
        plan: 4,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.24,
        maxValue: 0.24,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3413,
        plan: 4,
        addAttrs: [
            {
                attr: "技能伤害",
                addType: "Value",
                tag: "Skill",
                isPercent: true,
            },
        ],
        minValue: 0.1,
        maxValue: 0.1,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3421,
        plan: 4,
        addAttrs: [
            {
                attr: "雷属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.03,
        maxValue: 0.03,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3422,
        plan: 4,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.36,
        maxValue: 0.36,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3423,
        plan: 4,
        addAttrs: [
            {
                attr: "技能伤害",
                addType: "Value",
                tag: "Skill",
                isPercent: true,
            },
        ],
        minValue: 0.15,
        maxValue: 0.15,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3431,
        plan: 4,
        addAttrs: [
            {
                attr: "雷属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.04,
        maxValue: 0.04,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3432,
        plan: 4,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.48,
        maxValue: 0.48,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3433,
        plan: 4,
        addAttrs: [
            {
                attr: "技能伤害",
                addType: "Value",
                tag: "Skill",
                isPercent: true,
            },
        ],
        minValue: 0.2,
        maxValue: 0.2,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3441,
        plan: 4,
        addAttrs: [
            {
                attr: "雷属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3442,
        plan: 4,
        addAttrs: [
            {
                attr: "护盾",
                addType: "Rate",
            },
        ],
        minValue: 0.6,
        maxValue: 0.6,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3443,
        plan: 4,
        addAttrs: [
            {
                attr: "技能伤害",
                addType: "Value",
                tag: "Skill",
                isPercent: true,
            },
        ],
        minValue: 0.25,
        maxValue: 0.25,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3501,
        plan: 4,
        addAttrs: [
            {
                attr: "光属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.01,
        maxValue: 0.01,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3502,
        plan: 4,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.12,
        maxValue: 0.12,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3503,
        plan: 4,
        addAttrs: [
            {
                attr: "技能威力",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.08,
        maxValue: 0.08,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3511,
        plan: 4,
        addAttrs: [
            {
                attr: "光属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.02,
        maxValue: 0.02,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3512,
        plan: 4,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.24,
        maxValue: 0.24,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3513,
        plan: 4,
        addAttrs: [
            {
                attr: "技能威力",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.16,
        maxValue: 0.16,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3521,
        plan: 4,
        addAttrs: [
            {
                attr: "光属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.03,
        maxValue: 0.03,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3522,
        plan: 4,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.36,
        maxValue: 0.36,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3523,
        plan: 4,
        addAttrs: [
            {
                attr: "技能威力",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.24,
        maxValue: 0.24,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3531,
        plan: 4,
        addAttrs: [
            {
                attr: "光属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.04,
        maxValue: 0.04,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3532,
        plan: 4,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.48,
        maxValue: 0.48,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3533,
        plan: 4,
        addAttrs: [
            {
                attr: "技能威力",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.32,
        maxValue: 0.32,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3541,
        plan: 4,
        addAttrs: [
            {
                attr: "光属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3542,
        plan: 4,
        addAttrs: [
            {
                attr: "防御",
                addType: "Rate",
            },
        ],
        minValue: 0.6,
        maxValue: 0.6,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3543,
        plan: 4,
        addAttrs: [
            {
                attr: "技能威力",
                addType: "Rate",
                isPercent: true,
            },
        ],
        minValue: 0.4,
        maxValue: 0.4,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3601,
        plan: 4,
        addAttrs: [
            {
                attr: "暗属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.01,
        maxValue: 0.01,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3602,
        plan: 4,
        addAttrs: [
            {
                attr: "神智",
                addType: "Rate",
            },
        ],
        minValue: 0.12,
        maxValue: 0.12,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3603,
        plan: 4,
        addAttrs: [
            {
                attr: "近战增伤",
                addType: "Value",
                tag: "Melee",
                isPercent: true,
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3611,
        plan: 4,
        addAttrs: [
            {
                attr: "暗属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.02,
        maxValue: 0.02,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3612,
        plan: 4,
        addAttrs: [
            {
                attr: "神智",
                addType: "Rate",
            },
        ],
        minValue: 0.24,
        maxValue: 0.24,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3613,
        plan: 4,
        addAttrs: [
            {
                attr: "近战增伤",
                addType: "Value",
                tag: "Melee",
                isPercent: true,
            },
        ],
        minValue: 0.1,
        maxValue: 0.1,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3621,
        plan: 4,
        addAttrs: [
            {
                attr: "暗属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.03,
        maxValue: 0.03,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3622,
        plan: 4,
        addAttrs: [
            {
                attr: "神智",
                addType: "Rate",
            },
        ],
        minValue: 0.36,
        maxValue: 0.36,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3623,
        plan: 4,
        addAttrs: [
            {
                attr: "近战增伤",
                addType: "Value",
                tag: "Melee",
                isPercent: true,
            },
        ],
        minValue: 0.15,
        maxValue: 0.15,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3631,
        plan: 4,
        addAttrs: [
            {
                attr: "暗属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.04,
        maxValue: 0.04,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3632,
        plan: 4,
        addAttrs: [
            {
                attr: "神智",
                addType: "Rate",
            },
        ],
        minValue: 0.48,
        maxValue: 0.48,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3633,
        plan: 4,
        addAttrs: [
            {
                attr: "近战增伤",
                addType: "Value",
                tag: "Melee",
                isPercent: true,
            },
        ],
        minValue: 0.2,
        maxValue: 0.2,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3641,
        plan: 4,
        addAttrs: [
            {
                attr: "暗属性攻击",
                addType: "Rate",
            },
        ],
        minValue: 0.05,
        maxValue: 0.05,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3642,
        plan: 4,
        addAttrs: [
            {
                attr: "神智",
                addType: "Rate",
            },
        ],
        minValue: 0.6,
        maxValue: 0.6,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 3643,
        plan: 4,
        addAttrs: [
            {
                attr: "近战增伤",
                addType: "Value",
                tag: "Melee",
                isPercent: true,
            },
        ],
        minValue: 0.25,
        maxValue: 0.25,
        totalValueLevel: 1,
        planName: "专属词缀",
        mappingStatus: "exact",
    },
    {
        id: 110201,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>芙罗拉</>战技等级+10，[重奏]大于36层时，每0.5秒获得1层[交响]；[交响]的伤害效果命中时，如果目标数量少于3，额外获得9点连击点数；<H>第一根源</>效果变化为每消耗1层[交响]，获得1层[花刺]。",
        charIds: [1102],
        addSkillLevel: {
            skillIds: [110201],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 150201,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>妮弗尔夫人</>被动等级+10，[啼鸣交织]触发的[月猎]和[日食]效果可以被雾海安魂提升，且每次触发[啼鸣交织]有60%概率增加1次[送葬]状态下释放[月猎]或[日食]的次数并使[送葬]持续时间延长0.5s。",
        charIds: [1502],
        addSkillLevel: {
            skillIds: [150203],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 150202,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>妮弗尔夫人</>战技等级+10，释放[日食]后不会切换至[月猎]。",
        charIds: [1502],
        addSkillLevel: {
            skillIds: [150201],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 150203,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>妮弗尔夫人</>战技等级+10，[月猎]的伤害提升150.0%，且释放[月猎]后不会切换至[日食]。",
        charIds: [1502],
        addSkillLevel: {
            skillIds: [150201],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 150401,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "<H>苏乙</>[遨游]持续时间变为永续，达10层时,自身获得技能速度提高120.0%效果，[剑如虹]每次攻击消耗弹药变为3枚。",
        charIds: [1504],
        passiveEffectId: 150411,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 180101,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>菲娜</>战技等级+10，[“在一个暖和的午后”]效果变化：消耗相等于远程武器[最大弹药量]10.0%的弹夹弹药（上限5发），对前方范围内的敌人造成[消耗量×34.0%]光属性伤害，视为远程武器伤害，并使此次技能造成的伤害提高3.0%（独立），最多叠加10次。随后[夜莺]留在原地，每0.5秒重复上述效果，长按释放此技能或弹夹内剩余弹药为0时结束并重置伤害提高效果。",
        charIds: [1801],
        addSkillLevel: {
            skillIds: [180101, 180112],
        },
        activateSkills: {
            "180101": 180112,
        },
        skillReplacements: {
            "180101": {
                id: 180112,
                名称: "“在一个暖和的午后”",
                类型: "伤害",
            },
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 180102,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>菲娜</>终结技等级+10，[喧闹下午茶]效果强化：[夜莺][猎犬][独角兽][蝴蝶]同时出场，为自身和队友附加4种对应属性的20.0%追加伤害（单一增益），每2.0秒对领域内敌人造成267.0%对应属性伤害各1次，视为远程武器伤害，并触发1次[“故事还没有结束”]（需解锁）。领域持续期间，受到伤害时不会产生僵直，取消领域切换及[“在一个暖和的午后”]的变化效果。",
        charIds: [1801],
        addSkillLevel: {
            skillIds: [180102, 180123],
        },
        activateSkills: {
            "180102": 180123,
        },
        skillReplacements: {
            "180102": {
                id: 180123,
                名称: "“下午茶开始了！”",
                类型: "增益",
            },
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 210101,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>丽蓓卡</>战技等级+10，[海月水母]每次攻击时，有30.0%概率额外对范围内敌人造成一次水属性伤害，伤害倍率为12000.0%。",
        charIds: [2101],
        addSkillLevel: {
            skillIds: [210101],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 240101,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>扶疏</>终结技等级+10，[九针治未]提供的技能威力提高移除上限。",
        charIds: [2401],
        addSkillLevel: {
            skillIds: [240102],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 240102,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>扶疏</>终结技等级+10，释放[形与神俱]不再为其他队友附加[九针治未]，转而获得全属性穿透，数值为自身技能威力的3.4%。",
        charIds: [2401],
        addSkillLevel: {
            skillIds: [240102],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 240103,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "<H>扶疏</>第六根源的效果修正为：[形与神俱]的攻击速度提高效果持续期间，自身获得水、火、风、雷四属性追加伤害，每种100.0%。",
        charIds: [2401],
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 310201,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>希尔妲</>终结技等级+10，[高温清扫]不再命令[清扫机]在自身周围持续旋转并发射[高温祛污焰束]，转而使[清扫机]自动射击间隔变为0.2，伤害倍率为903.6%。",
        charIds: [3102],
        passiveEffectId: 310211,
        addSkillLevel: {
            skillIds: [310202],
        },
        skillReplacements: {
            "310201": {
                id: 310212,
                名称: "高温清扫",
                类型: "伤害",
            },
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 310202,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>希尔妲</>被动等级+10，[优雅怒意]持续期间，造成的伤害提高200.0%，远程武器弹夹清空时自动装填。",
        charIds: [3102],
        passiveEffectId: 310212,
        addSkillLevel: {
            skillIds: [310203],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 320301,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>卡嘉</>终结技等级+10，[猫猫头出击！]效果变化：不再持续消耗[毁灭灵感]，不再生成小型[猫猫头炮台]且不再提供增益效果，转而使卡嘉自身操控[猫猫头炮台]进行攻击。卡嘉操控下的[速射模式]、[贯穿模式]、[轰炸模式]相对小型[猫猫头炮台]原本伤害倍率分别提高319.3%、408.9%、508.2%。",
        charIds: [3203],
        addSkillLevel: {
            skillIds: [320302, 320312],
        },
        activateSkills: {
            "320302": 320312,
        },
        skillReplacements: {
            "320302": {
                id: 320312,
                名称: "猫猫头出击！",
                类型: "伤害",
            },
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 320302,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>卡嘉</>被动等级+10，[猫猫头炮台]效果强化：[毁灭灵感]大于300.0时，[猫猫头炮台]造成伤害时，消耗目标1.0层[火属性紊乱]对其追加1次700.0%火属性充盈伤害。",
        charIds: [3203],
        passiveEffectId: 320311,
        addSkillLevel: {
            skillIds: [320303],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 420101,
        plan: 4,
        minValue: 10,
        maxValue: 10,
        totalValueLevel: 1,
        desc: "<H>煜明</>战技等级+10，释放[疑星落]及[星河寥落]时，需消耗24点神智，并在释放后回到空中，视为释放了1次[玉山崩]。\n连击等级S释放[星河寥落]时，造成的伤害无视目标100.0%防御，并消耗所有连击点数。",
        charIds: [4201],
        passiveEffectId: 420111,
        addSkillLevel: {
            skillIds: [420101],
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2030301,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "<H>炽枪的花宴</>每轮射击仅消耗1枚子弹，且造成的伤害提高（独立），提高倍率为[5.8%×自身技能威力属性值]。",
        passiveEffectId: 2030201,
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
    {
        id: 2040601,
        plan: 4,
        minValue: 1,
        maxValue: 1,
        totalValueLevel: 1,
        desc: "<H>切割齿轮</>的子弹的攻击倍率提升120%；且多重射击不再额外发射弹片，转而提升主弹片的持续时间，主弹片同时最多存在3枚。",
        activateSkills: {
            "2040601": 2040603,
        },
        skillReplacements: {
            "2040601": {
                id: 2040603,
                名称: "射击",
                类型: "射击",
                字段: [
                    {
                        名称: "射击伤害",
                        值: 0.05,
                        削韧: 10,
                        tag: ["远程", "武器", "Shotgun20406"],
                    },
                    {
                        名称: "子弹伤害",
                        值: 0.17,
                        削韧: 5,
                        tag: ["远程", "武器", "Shotgun20406"],
                    },
                ],
            },
        },
        planName: "专属词缀",
        mappingStatus: "handwritten",
    },
]

const rawInlays: DnaSeasonInlay[] = [
    {
        id: 7001101,
        inlayType: 0,
        affixIdsBySlot: {
            "3101": [1, 3],
            "3102": [2, 4],
            "3103": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [1],
            priceId: 7000101,
            price: 200,
        },
    },
    {
        id: 7001102,
        inlayType: 0,
        affixIdsBySlot: {
            "3111": [1, 3],
            "3112": [2, 4],
            "3113": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [5],
            priceId: 7000101,
            price: 400,
        },
    },
    {
        id: 7001103,
        inlayType: 0,
        affixIdsBySlot: {
            "3121": [1, 3],
            "3122": [2, 4],
            "3123": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [10],
            priceId: 7000101,
            price: 1000,
        },
    },
    {
        id: 7001104,
        inlayType: 0,
        affixIdsBySlot: {
            "3131": [1, 3],
            "3132": [2, 4],
            "3133": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [25],
            priceId: 7000101,
            price: 5000,
        },
    },
    {
        id: 7001105,
        inlayType: 0,
        affixIdsBySlot: {
            "3141": [1, 3],
            "3142": [2, 4],
            "3143": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [125],
            priceId: 7000101,
            price: 20000,
        },
    },
    {
        id: 7001201,
        inlayType: 0,
        affixIdsBySlot: {
            "3201": [1, 3],
            "3202": [2, 4],
            "3203": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [1],
            priceId: 7000101,
            price: 200,
        },
    },
    {
        id: 7001202,
        inlayType: 0,
        affixIdsBySlot: {
            "3211": [1, 3],
            "3212": [2, 4],
            "3213": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [5],
            priceId: 7000101,
            price: 400,
        },
    },
    {
        id: 7001203,
        inlayType: 0,
        affixIdsBySlot: {
            "3221": [1, 3],
            "3222": [2, 4],
            "3223": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [10],
            priceId: 7000101,
            price: 1000,
        },
    },
    {
        id: 7001204,
        inlayType: 0,
        affixIdsBySlot: {
            "3231": [1, 3],
            "3232": [2, 4],
            "3233": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [25],
            priceId: 7000101,
            price: 5000,
        },
    },
    {
        id: 7001205,
        inlayType: 0,
        affixIdsBySlot: {
            "3241": [1, 3],
            "3242": [2, 4],
            "3243": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [125],
            priceId: 7000101,
            price: 20000,
        },
    },
    {
        id: 7001301,
        inlayType: 0,
        affixIdsBySlot: {
            "3301": [1, 3],
            "3302": [2, 4],
            "3303": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [1],
            priceId: 7000101,
            price: 200,
        },
    },
    {
        id: 7001302,
        inlayType: 0,
        affixIdsBySlot: {
            "3311": [1, 3],
            "3312": [2, 4],
            "3313": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [5],
            priceId: 7000101,
            price: 400,
        },
    },
    {
        id: 7001303,
        inlayType: 0,
        affixIdsBySlot: {
            "3321": [1, 3],
            "3322": [2, 4],
            "3323": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [10],
            priceId: 7000101,
            price: 1000,
        },
    },
    {
        id: 7001304,
        inlayType: 0,
        affixIdsBySlot: {
            "3331": [1, 3],
            "3332": [2, 4],
            "3333": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [25],
            priceId: 7000101,
            price: 5000,
        },
    },
    {
        id: 7001305,
        inlayType: 0,
        affixIdsBySlot: {
            "3341": [1, 3],
            "3342": [2, 4],
            "3343": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [125],
            priceId: 7000101,
            price: 20000,
        },
    },
    {
        id: 7001401,
        inlayType: 0,
        affixIdsBySlot: {
            "3401": [1, 3],
            "3402": [2, 4],
            "3403": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [1],
            priceId: 7000101,
            price: 200,
        },
    },
    {
        id: 7001402,
        inlayType: 0,
        affixIdsBySlot: {
            "3411": [1, 3],
            "3412": [2, 4],
            "3413": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [5],
            priceId: 7000101,
            price: 400,
        },
    },
    {
        id: 7001403,
        inlayType: 0,
        affixIdsBySlot: {
            "3421": [1, 3],
            "3422": [2, 4],
            "3423": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [10],
            priceId: 7000101,
            price: 1000,
        },
    },
    {
        id: 7001404,
        inlayType: 0,
        affixIdsBySlot: {
            "3431": [1, 3],
            "3432": [2, 4],
            "3433": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [25],
            priceId: 7000101,
            price: 5000,
        },
    },
    {
        id: 7001405,
        inlayType: 0,
        affixIdsBySlot: {
            "3441": [1, 3],
            "3442": [2, 4],
            "3443": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [125],
            priceId: 7000101,
            price: 20000,
        },
    },
    {
        id: 7001501,
        inlayType: 0,
        affixIdsBySlot: {
            "3501": [1, 3],
            "3502": [2, 4],
            "3503": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [1],
            priceId: 7000101,
            price: 200,
        },
    },
    {
        id: 7001502,
        inlayType: 0,
        affixIdsBySlot: {
            "3511": [1, 3],
            "3512": [2, 4],
            "3513": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [5],
            priceId: 7000101,
            price: 400,
        },
    },
    {
        id: 7001503,
        inlayType: 0,
        affixIdsBySlot: {
            "3521": [1, 3],
            "3522": [2, 4],
            "3523": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [10],
            priceId: 7000101,
            price: 1000,
        },
    },
    {
        id: 7001504,
        inlayType: 0,
        affixIdsBySlot: {
            "3531": [1, 3],
            "3532": [2, 4],
            "3533": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [25],
            priceId: 7000101,
            price: 5000,
        },
    },
    {
        id: 7001505,
        inlayType: 0,
        affixIdsBySlot: {
            "3541": [1, 3],
            "3542": [2, 4],
            "3543": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [125],
            priceId: 7000101,
            price: 20000,
        },
    },
    {
        id: 7001601,
        inlayType: 0,
        affixIdsBySlot: {
            "3601": [1, 3],
            "3602": [2, 4],
            "3603": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [1],
            priceId: 7000101,
            price: 200,
        },
    },
    {
        id: 7001602,
        inlayType: 0,
        affixIdsBySlot: {
            "3611": [1, 3],
            "3612": [2, 4],
            "3613": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [5],
            priceId: 7000101,
            price: 400,
        },
    },
    {
        id: 7001603,
        inlayType: 0,
        affixIdsBySlot: {
            "3621": [1, 3],
            "3622": [2, 4],
            "3623": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [10],
            priceId: 7000101,
            price: 1000,
        },
    },
    {
        id: 7001604,
        inlayType: 0,
        affixIdsBySlot: {
            "3631": [1, 3],
            "3632": [2, 4],
            "3633": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [25],
            priceId: 7000101,
            price: 5000,
        },
    },
    {
        id: 7001605,
        inlayType: 0,
        affixIdsBySlot: {
            "3641": [1, 3],
            "3642": [2, 4],
            "3643": [5, 6, 7],
        },
        breakdown: {
            itemIds: [7001001],
            itemCounts: [125],
            priceId: 7000101,
            price: 20000,
        },
    },
]

export const slots = rawSlots

export const rarities = rawRarities

export const powerTiers = rawPowerTiers

export const namePrefixes = rawNamePrefixes

export const baseNames = rawBaseNames

export const uniqueEquips = rawUniqueEquips

export const generateGroups = rawGenerateGroups

export const crafts = rawCrafts

export const breakdowns = rawBreakdowns

export const affixPools = rawAffixPools

export const affixLevels = rawAffixLevels

export const affixes = rawAffixes

export const inlays = rawInlays

export const slotTypes = rawSlotTypes

export const craftTypes = rawCraftTypes
