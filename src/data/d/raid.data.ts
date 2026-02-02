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
        RaidBuffDes: "雷属性角色技能威力大于100%时，每超过30%，造成技能伤害时无视目标3.5%防御，最多无视42.0%防御。",
        RaidBuffParameter: ["30%", "3.5%", "42.0%"],
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
        IsOnline: [true, true, false, false, false],
        PreRaidRank: 1,
        RankName: ["SSS", "SS", "S", "A", "B"],
        RankPercent: [5, 20, 45, 70, 100],
        RankReward: [300316, 300317, 300318, 300319, 300320],
    },
}
