import type { RewardItem } from "../../utils/reward-utils"

export interface RaidCalculationItem {
    FomulaId: number
    RaidTimeRate: number[]
    RaidTimeZone: number[]
}

export const RaidCalculation: RaidCalculationItem[] = [
    {
        FomulaId: 1,
        RaidTimeRate: [0.025, 0.05, 0.075],
        RaidTimeZone: [10, 20, 60],
    },
    {
        FomulaId: 2,
        RaidTimeRate: [0.01, 0.018, 0.025],
        RaidTimeZone: [25, 80, 180],
    },
]

export interface RaidDungeonItem {
    BaseRaidPoint: number
    DifficultyLevel: number
    DungeonId: number
    FomulaId: number
    MinCompleteDamage: number
    RaidBuffID: number[]
    RaidDungeonType: number
    RaidSeason: number
    TicketNum?: {
        "217": number
    }
    UnlockDate: number
}
export interface RaidBuffItem {
    RaidBuffID: number
    RaidBuffDes: string
    RaidBuffParameter: string[]
}

export const RaidBuff = [
    {
        RaidBuffID: 1,
        RaidBuffDes: "风属性角色技能威力大于100%时，每超过30%，全属性穿透提高5%，最多提高50%。",
        RaidBuffParameter: ["30%", "5%", "50%"],
    },
    {
        RaidBuffID: 2,
        RaidBuffDes: "风属性角色技能威力大于100%时，每超过30%，全属性穿透提高5%，最多提高50%。",
        RaidBuffParameter: ["30%", "5%", "50%"],
    },
    {
        RaidBuffID: 3,
        RaidBuffDes: "风属性角色技能威力大于100%时，每超过30%，全属性穿透提高5%，最多提高50%。",
        RaidBuffParameter: ["30%", "5%", "50%"],
    },
    {
        RaidBuffID: 12,
        RaidBuffDes: "雷属性角色技能威力大于100%时，每超过30%，造成技能伤害时无视目标3.5%防御，最多无视42%防御。",
        RaidBuffParameter: ["30%", "3.5%", "42%"],
    },
    {
        RaidBuffID: 13,
        RaidBuffDes:
            "光属性角色技能范围大于技能耐久时，每超过10%，造成技能伤害时无视目标7%防御，最多无视42%防御；技能耐久大于技能范围时，每超过20%，全属性穿透提高10%，最多提高50%。",
        RaidBuffParameter: ["10%", "7%", "42%", "20%", "10%", "50%"],
    },
].reduce(
    (prev, cur) => {
        prev[cur.RaidBuffID] = cur
        return prev
    },
    {} as Record<number, RaidBuffItem>
)

export const RaidDungeon: Record<string | number, RaidDungeonItem> = {
    "21001": {
        BaseRaidPoint: 1000,
        DifficultyLevel: 1,
        DungeonId: 21001,
        FomulaId: 1,
        MinCompleteDamage: 47200000,
        RaidBuffID: [1],
        RaidDungeonType: 1,
        RaidSeason: 1001,
        UnlockDate: 1769133600,
    },
    "21002": {
        BaseRaidPoint: 10000,
        DifficultyLevel: 2,
        DungeonId: 21002,
        FomulaId: 1,
        MinCompleteDamage: 206600000,
        RaidBuffID: [2],
        RaidDungeonType: 1,
        RaidSeason: 1001,
        UnlockDate: 1769133600,
    },
    "21003": {
        BaseRaidPoint: 135000,
        DifficultyLevel: 3,
        DungeonId: 21003,
        FomulaId: 1,
        MinCompleteDamage: 6149100000,
        RaidBuffID: [3],
        RaidDungeonType: 1,
        RaidSeason: 1001,
        UnlockDate: 1769133600,
    },
    "21011": {
        BaseRaidPoint: 3500,
        DifficultyLevel: 1,
        DungeonId: 21011,
        FomulaId: 2,
        MinCompleteDamage: 88400000,
        RaidBuffID: [1],
        RaidDungeonType: 2,
        RaidSeason: 1001,
        TicketNum: {
            "217": 3,
        },
        UnlockDate: 1769392800,
    },
    "21012": {
        BaseRaidPoint: 40000,
        DifficultyLevel: 2,
        DungeonId: 21012,
        FomulaId: 2,
        MinCompleteDamage: 859700000,
        RaidBuffID: [2],
        RaidDungeonType: 2,
        RaidSeason: 1001,
        TicketNum: {
            "217": 4,
        },
        UnlockDate: 1769461200,
    },
    "21013": {
        BaseRaidPoint: 400000,
        DifficultyLevel: 3,
        DungeonId: 21013,
        FomulaId: 2,
        MinCompleteDamage: 10001800000,
        RaidBuffID: [3],
        RaidDungeonType: 2,
        RaidSeason: 1001,
        TicketNum: {
            "217": 5,
        },
        UnlockDate: 1769547600,
    },
    "21201": {
        BaseRaidPoint: 1000,
        DifficultyLevel: 1,
        DungeonId: 21201,
        FomulaId: 1,
        MinCompleteDamage: 47200000,
        RaidBuffID: [12],
        RaidDungeonType: 1,
        RaidSeason: 1002,
        UnlockDate: 1774317600,
    },
    "21202": {
        BaseRaidPoint: 10000,
        DifficultyLevel: 2,
        DungeonId: 21202,
        FomulaId: 1,
        MinCompleteDamage: 206600000,
        RaidBuffID: [12],
        RaidDungeonType: 1,
        RaidSeason: 1002,
        UnlockDate: 1774317600,
    },
    "21203": {
        BaseRaidPoint: 135000,
        DifficultyLevel: 3,
        DungeonId: 21203,
        FomulaId: 1,
        MinCompleteDamage: 6149100000,
        RaidBuffID: [12],
        RaidDungeonType: 1,
        RaidSeason: 1002,
        UnlockDate: 1774317600,
    },
    "21211": {
        BaseRaidPoint: 3500,
        DifficultyLevel: 1,
        DungeonId: 21211,
        FomulaId: 2,
        MinCompleteDamage: 88400000,
        RaidBuffID: [12],
        RaidDungeonType: 2,
        RaidSeason: 1002,
        TicketNum: {
            "217": 3,
        },
        UnlockDate: 1774576800,
    },
    "21212": {
        BaseRaidPoint: 40000,
        DifficultyLevel: 2,
        DungeonId: 21212,
        FomulaId: 2,
        MinCompleteDamage: 859700000,
        RaidBuffID: [12],
        RaidDungeonType: 2,
        RaidSeason: 1002,
        TicketNum: {
            "217": 4,
        },
        UnlockDate: 1774645200,
    },
    "21213": {
        BaseRaidPoint: 400000,
        DifficultyLevel: 3,
        DungeonId: 21213,
        FomulaId: 2,
        MinCompleteDamage: 10001800000,
        RaidBuffID: [12],
        RaidDungeonType: 2,
        RaidSeason: 1002,
        TicketNum: {
            "217": 5,
        },
        UnlockDate: 1774731600,
    },
    "21301": {
        BaseRaidPoint: 1000,
        DifficultyLevel: 1,
        DungeonId: 21301,
        FomulaId: 1,
        MinCompleteDamage: 47200000,
        RaidBuffID: [13],
        RaidDungeonType: 1,
        RaidSeason: 1003,
        UnlockDate: 1779156000,
    },
    "21302": {
        BaseRaidPoint: 10000,
        DifficultyLevel: 2,
        DungeonId: 21302,
        FomulaId: 1,
        MinCompleteDamage: 206600000,
        RaidBuffID: [13],
        RaidDungeonType: 1,
        RaidSeason: 1003,
        UnlockDate: 1779156000,
    },
    "21303": {
        BaseRaidPoint: 135000,
        DifficultyLevel: 3,
        DungeonId: 21303,
        FomulaId: 1,
        MinCompleteDamage: 6149100000,
        RaidBuffID: [13],
        RaidDungeonType: 1,
        RaidSeason: 1003,
        UnlockDate: 1779156000,
    },
    "21311": {
        BaseRaidPoint: 3500,
        DifficultyLevel: 1,
        DungeonId: 21311,
        FomulaId: 2,
        MinCompleteDamage: 88400000,
        RaidBuffID: [13],
        RaidDungeonType: 2,
        RaidSeason: 1003,
        TicketNum: {
            "217": 3,
        },
        UnlockDate: 1779415200,
    },
    "21312": {
        BaseRaidPoint: 40000,
        DifficultyLevel: 2,
        DungeonId: 21312,
        FomulaId: 2,
        MinCompleteDamage: 859700000,
        RaidBuffID: [13],
        RaidDungeonType: 2,
        RaidSeason: 1003,
        TicketNum: {
            "217": 4,
        },
        UnlockDate: 1779483600,
    },
    "21313": {
        BaseRaidPoint: 400000,
        DifficultyLevel: 3,
        DungeonId: 21313,
        FomulaId: 2,
        MinCompleteDamage: 10001800000,
        RaidBuffID: [13],
        RaidDungeonType: 2,
        RaidSeason: 1003,
        TicketNum: {
            "217": 5,
        },
        UnlockDate: 1779570000,
    },
}

export interface RaidSeasonItem {
    EventId: number
    PreRaidRank: number
    PreRaidTime: number
    RaidPointToRewrad: {
        "1000": number
    }
    RaidPointToRewradMaxTime: number
    RaidRankCount: number
    RaidSeason: number
    RaidTime: number
    Shop: string
}

export const RaidSeason: Record<string | number, RaidSeasonItem> = {
    "1001": {
        EventId: 111001,
        PreRaidRank: 1,
        PreRaidTime: 62,
        RaidPointToRewrad: {
            "1000": 300315,
        },
        RaidPointToRewradMaxTime: 750,
        RaidRankCount: 1000,
        RaidSeason: 1001,
        RaidTime: 173,
        Shop: "RaidShopSeason01",
    },
    "1002": {
        EventId: 111002,
        PreRaidRank: 1,
        PreRaidTime: 62,
        RaidPointToRewrad: {
            "1000": 300315,
        },
        RaidPointToRewradMaxTime: 750,
        RaidRankCount: 1000,
        RaidSeason: 1002,
        RaidTime: 173,
        Shop: "RaidShopSeason01",
    },
    "1003": {
        EventId: 111003,
        PreRaidRank: 1,
        PreRaidTime: 62,
        RaidPointToRewrad: {
            "1000": 300315,
        },
        RaidPointToRewradMaxTime: 750,
        RaidRankCount: 1000,
        RaidSeason: 1003,
        RaidTime: 168,
        Shop: "RaidShopSeason01",
    },
}

export type PreRaidRankRewardItem = RewardItem

/**
 * 构造排位奖励快照。
 * @param rewardId 奖励组ID
 * @param titleId 称号框ID
 * @param titleName 称号名称
 * @param coinCount 狩月纪念币数量
 * @param moduleCount 移转模块数量
 * @param weaponModuleCount 武器移转模块数量
 * @returns 排位奖励快照
 */
function createPreRaidRankReward(
    rewardId: number,
    titleId: number,
    titleName: string,
    coinCount: number,
    moduleCount: number,
    weaponModuleCount: number
): PreRaidRankRewardItem {
    return {
        id: rewardId,
        t: "Reward",
        p: 1,
        m: "Fixed",
        child: [
            {
                id: titleId,
                t: "TitleFrame",
                c: 1,
                p: 0,
                n: titleName,
            },
            {
                id: 220,
                t: "Resource",
                c: coinCount,
                p: 0,
                n: "狩月纪念币",
            },
            {
                id: 201,
                t: "Resource",
                c: moduleCount,
                p: 0,
                n: "移转模块",
            },
            {
                id: 202,
                t: "Resource",
                c: weaponModuleCount,
                p: 0,
                n: "武器移转模块",
            },
        ],
    }
}

const PreRaidRankRewardVersions: Record<number, PreRaidRankRewardItem[]> = {
    1001: [
        createPreRaidRankReward(300316, 10008, "SSS级狩月人", 3000, 2, 2),
        createPreRaidRankReward(300317, 10009, "SS级狩月人", 2500, 2, 2),
        createPreRaidRankReward(300318, 10010, "S级狩月人", 2000, 2, 2),
        createPreRaidRankReward(300319, 10012, "A级狩月人", 1500, 1, 1),
        createPreRaidRankReward(300320, 10011, "B级狩月人", 1000, 1, 1),
    ],
    1002: [
        createPreRaidRankReward(300316, 10013, "SSS级狩月人·2", 3000, 2, 2),
        createPreRaidRankReward(300317, 10014, "SS级狩月人·2", 2500, 2, 2),
        createPreRaidRankReward(300318, 10015, "S级狩月人·2", 2000, 2, 2),
        createPreRaidRankReward(300319, 10016, "A级狩月人·2", 1500, 1, 1),
        createPreRaidRankReward(300320, 10017, "B级狩月人·2", 1000, 1, 1),
    ],
    1003: [
        createPreRaidRankReward(300316, 10021, "SSS级狩月人·3", 3000, 2, 2),
        createPreRaidRankReward(300317, 10022, "SS级狩月人·3", 2500, 2, 2),
        createPreRaidRankReward(300318, 10023, "S级狩月人·3", 2000, 2, 2),
        createPreRaidRankReward(300319, 10024, "A级狩月人·3", 1500, 1, 1),
        createPreRaidRankReward(300320, 10025, "B级狩月人·3", 1000, 1, 1),
    ],
}

export interface PreRaidRankItem {
    IsOnline: boolean[]
    PreRaidRank: number
    RankName: string[]
    RankPercent: number[]
    RankReward: number[]
}

export const PreRaidRank: Record<string | number, PreRaidRankItem> = {
    "1001": {
        IsOnline: [true, true, false, false, false],
        PreRaidRank: 1,
        RankName: ["SSS", "SS", "S", "A", "B"],
        RankPercent: [5, 20, 45, 70, 100],
        RankReward: [300316, 300317, 300318, 300319, 300320],
    },
    "1002": {
        IsOnline: [false, false, false, false, false],
        PreRaidRank: 1,
        RankName: ["SSS", "SS", "S", "A", "B"],
        RankPercent: [15, 35, 55, 75, 100],
        RankReward: [300316, 300317, 300318, 300319, 300320],
    },
    "1003": {
        IsOnline: [false, false, false, false, false],
        PreRaidRank: 1,
        RankName: ["SSS", "SS", "S", "A", "B"],
        RankPercent: [15, 35, 55, 75, 100],
        RankReward: [300316, 300317, 300318, 300319, 300320],
    },
}

/**
 * 获取指定赛季的排位奖励快照。
 * @param season 赛季ID
 * @param rankIndex 排名下标
 * @returns 排位奖励快照
 */
export function getPreRaidRankReward(season: number | string, rankIndex: number): PreRaidRankRewardItem | undefined {
    return PreRaidRankRewardVersions[season as number]?.[rankIndex]
}
