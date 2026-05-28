import type { SpawnInfo } from "./dungeon.data"

export interface IronSurvival {
    DungeonId: number
    LevelThreshold: number[]
    MonsterSpawnId: number[][]
    StrongKillCount: number[]
    StrongLoopSpawnId: number[][]
}
export interface IronSurvivalDungeon {
    DungeonId: number
    IronRoundsReward: Record<number, number>
    IronRoundsRewardView: Record<number, number>
    IronTicketId: number[]
    MonsterLevelDrop: number[]
}
export interface MonsterLevelDrop {
    BaseProbability: number[]
    EndTime: number
    MonsterLevel: number[]
    MonsterLevelDropId: number
    MonsterLevelDropView: number
    ProbabilityUp: number[]
    RewardId: number[]
    StartTime: number
}

export interface MonsterLevelDropDisplayRow {
    level: number
    probability: number
    probabilityUp: number
    rewardId: number
}

export const ironSurvivalData: Record<number, IronSurvival> = {
    "91601": {
        DungeonId: 91601,
        LevelThreshold: [120, 160],
        MonsterSpawnId: [
            [916021, 916101],
            [916012, 916102],
            [916023, 916103],
            [916014, 916104],
            [916025, 916105],
            [916016, 916106],
        ],
        StrongKillCount: [50, 50, 50],
        StrongLoopSpawnId: [
            [916031, 916032, 916033, 916034],
            [916035, 916036, 916037, 916038, 916039, 916040, 916041, 916042],
            [
                916043, 916044, 916045, 916046, 916047, 916048, 916049, 916050, 916051, 916052, 916053, 916054, 916055, 916056, 916057,
                916058, 916059, 916060,
            ],
        ],
    },
    "91602": {
        DungeonId: 91602,
        LevelThreshold: [120, 160],
        MonsterSpawnId: [
            [916021, 916101],
            [916012, 916102],
            [916023, 916103],
            [916014, 916104],
            [916025, 916105],
            [916016, 916106],
        ],
        StrongKillCount: [50, 50, 50],
        StrongLoopSpawnId: [
            [916031, 916032, 916033, 916034],
            [916035, 916036, 916037, 916038, 916039, 916040, 916041, 916042],
            [
                916043, 916044, 916045, 916046, 916047, 916048, 916049, 916050, 916051, 916052, 916053, 916054, 916055, 916056, 916057,
                916058, 916059, 916060,
            ],
        ],
    },
    "91603": {
        DungeonId: 91603,
        LevelThreshold: [120, 160],
        MonsterSpawnId: [
            [916021, 916101],
            [916012, 916102],
            [916023, 916103],
            [916014, 916104],
            [916025, 916105],
            [916016, 916106],
        ],
        StrongKillCount: [50, 50, 50],
        StrongLoopSpawnId: [
            [916031, 916032, 916033, 916034],
            [916035, 916036, 916037, 916038, 916039, 916040, 916041, 916042],
            [
                916043, 916044, 916045, 916046, 916047, 916048, 916049, 916050, 916051, 916052, 916053, 916054, 916055, 916056, 916057,
                916058, 916059, 916060,
            ],
        ],
    },
    "91604": {
        DungeonId: 91604,
        LevelThreshold: [120, 160],
        MonsterSpawnId: [
            [916021, 916101],
            [916012, 916102],
            [916023, 916103],
            [916014, 916104],
            [916025, 916105],
            [916016, 916106],
        ],
        StrongKillCount: [50, 50, 50],
        StrongLoopSpawnId: [
            [916031, 916032, 916033, 916034],
            [916035, 916036, 916037, 916038, 916039, 916040, 916041, 916042],
            [
                916043, 916044, 916045, 916046, 916047, 916048, 916049, 916050, 916051, 916052, 916053, 916054, 916055, 916056, 916057,
                916058, 916059, 916060,
            ],
        ],
    },
    "91605": {
        DungeonId: 91605,
        LevelThreshold: [120, 160],
        MonsterSpawnId: [
            [916021, 916101],
            [916012, 916102],
            [916023, 916103],
            [916014, 916104],
            [916025, 916105],
            [916016, 916106],
        ],
        StrongKillCount: [50, 50, 50],
        StrongLoopSpawnId: [
            [916031, 916032, 916033, 916034],
            [916035, 916036, 916037, 916038, 916039, 916040, 916041, 916042],
            [
                916043, 916044, 916045, 916046, 916047, 916048, 916049, 916050, 916051, 916052, 916053, 916054, 916055, 916056, 916057,
                916058, 916059, 916060,
            ],
        ],
    },
    "91606": {
        DungeonId: 91606,
        LevelThreshold: [120, 160],
        MonsterSpawnId: [
            [916021, 916101],
            [916012, 916102],
            [916023, 916103],
            [916014, 916104],
            [916025, 916105],
            [916016, 916106],
        ],
        StrongKillCount: [50, 50, 50],
        StrongLoopSpawnId: [
            [916031, 916032, 916033, 916034],
            [916035, 916036, 916037, 916038, 916039, 916040, 916041, 916042],
            [
                916043, 916044, 916045, 916046, 916047, 916048, 916049, 916050, 916051, 916052, 916053, 916054, 916055, 916056, 916057,
                916058, 916059, 916060,
            ],
        ],
    },
}

export const ironSurvivalDungeonData: Record<number, IronSurvivalDungeon> = {
    "91601": {
        DungeonId: 91601,
        IronRoundsReward: {
            "100": 303104,
            "120": 303108,
            "140": 303112,
            "160": 303116,
            "180": 303120,
            "200": 303124,
        },
        IronRoundsRewardView: {
            "100": 303104,
            "120": 303108,
            "140": 303112,
            "160": 303116,
            "180": 303120,
            "200": 303124,
        },
        IronTicketId: [1001],
        MonsterLevelDrop: [1, 2],
    },
    "91602": {
        DungeonId: 91602,
        IronRoundsReward: {
            "100": 303204,
            "120": 303208,
            "140": 303212,
            "160": 303216,
            "180": 303220,
            "200": 303224,
        },
        IronRoundsRewardView: {
            "100": 303204,
            "120": 303208,
            "140": 303212,
            "160": 303216,
            "180": 303220,
            "200": 303224,
        },
        IronTicketId: [1001],
        MonsterLevelDrop: [1, 2],
    },
    "91603": {
        DungeonId: 91603,
        IronRoundsReward: {
            "100": 303404,
            "120": 303408,
            "140": 303412,
            "160": 303416,
            "180": 303420,
            "200": 303424,
        },
        IronRoundsRewardView: {
            "100": 303404,
            "120": 303408,
            "140": 303412,
            "160": 303416,
            "180": 303420,
            "200": 303424,
        },
        IronTicketId: [1001],
        MonsterLevelDrop: [1, 2],
    },
    "91604": {
        DungeonId: 91604,
        IronRoundsReward: {
            "100": 303304,
            "120": 303308,
            "140": 303312,
            "160": 303316,
            "180": 303320,
            "200": 303324,
        },
        IronRoundsRewardView: {
            "100": 303304,
            "120": 303308,
            "140": 303312,
            "160": 303316,
            "180": 303320,
            "200": 303324,
        },
        IronTicketId: [1001],
        MonsterLevelDrop: [1, 2],
    },
    "91605": {
        DungeonId: 91605,
        IronRoundsReward: {
            "100": 303604,
            "120": 303608,
            "140": 303612,
            "160": 303616,
            "180": 303620,
            "200": 303624,
        },
        IronRoundsRewardView: {
            "100": 303604,
            "120": 303608,
            "140": 303612,
            "160": 303616,
            "180": 303620,
            "200": 303624,
        },
        IronTicketId: [1001],
        MonsterLevelDrop: [1, 2],
    },
    "91606": {
        DungeonId: 91606,
        IronRoundsReward: {
            "100": 303504,
            "120": 303508,
            "140": 303512,
            "160": 303516,
            "180": 303520,
            "200": 303524,
        },
        IronRoundsRewardView: {
            "100": 303504,
            "120": 303508,
            "140": 303512,
            "160": 303516,
            "180": 303520,
            "200": 303524,
        },
        IronTicketId: [1001],
        MonsterLevelDrop: [1, 2],
    },
}

export const ironSurvivalMonsterSpawnData: SpawnInfo[] = [
    {
        id: 916012,
        time: 6,
        th: 28,
        radius: [1500, 10000, 1500, 5000],
        m: [
            {
                id: 6014001,
                num: 2,
            },
            {
                id: 7002001,
                num: 10,
            },
            {
                id: 6013001,
                num: 4,
            },
            {
                id: 7001001,
                num: 9,
            },
            {
                id: 7012001,
                num: 15,
            },
        ],
    },
    {
        id: 916014,
        time: 6,
        th: 28,
        radius: [1500, 10000, 1500, 5000],
        m: [
            {
                id: 6004001,
                num: 2,
            },
            {
                id: 7002001,
                num: 10,
            },
            {
                id: 6013001,
                num: 4,
            },
            {
                id: 7001001,
                num: 9,
            },
            {
                id: 7012001,
                num: 15,
            },
        ],
    },
    {
        id: 916016,
        time: 6,
        th: 28,
        radius: [1500, 10000, 1500, 5000],
        m: [
            {
                id: 6014001,
                num: 2,
            },
            {
                id: 7002001,
                num: 10,
            },
            {
                id: 6013001,
                num: 4,
            },
            {
                id: 7001001,
                num: 9,
            },
            {
                id: 7012001,
                num: 15,
            },
        ],
    },
    {
        id: 916021,
        time: 6,
        th: 25,
        radius: [1500, 10000, 1500, 5000],
        m: [
            {
                id: 6004001,
                num: 2,
            },
            {
                id: 8001001,
                num: 9,
            },
            {
                id: 8002001,
                num: 12,
            },
            {
                id: 9007001,
                num: 9,
            },
            {
                id: 6013001,
                num: 3,
            },
        ],
    },
    {
        id: 916023,
        time: 6,
        th: 28,
        radius: [1500, 10000, 1500, 5000],
        m: [
            {
                id: 6004001,
                num: 2,
            },
            {
                id: 8001001,
                num: 10,
            },
            {
                id: 8002001,
                num: 14,
            },
            {
                id: 9007001,
                num: 10,
            },
            {
                id: 6013001,
                num: 4,
            },
        ],
    },
    {
        id: 916025,
        time: 6,
        th: 28,
        radius: [1500, 10000, 1500, 5000],
        m: [
            {
                id: 6004001,
                num: 2,
            },
            {
                id: 8001001,
                num: 10,
            },
            {
                id: 8002001,
                num: 14,
            },
            {
                id: 9007001,
                num: 10,
            },
            {
                id: 6013001,
                num: 4,
            },
        ],
    },
    {
        id: 916031,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6001301,
                num: 1,
            },
        ],
    },
    {
        id: 916032,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6002301,
                num: 1,
            },
        ],
    },
    {
        id: 916033,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6015301,
                num: 1,
            },
        ],
    },
    {
        id: 916034,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7011301,
                num: 1,
            },
        ],
    },
    {
        id: 916035,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6016301,
                num: 1,
            },
        ],
    },
    {
        id: 916036,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6004301,
                num: 1,
            },
        ],
    },
    {
        id: 916037,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6007301,
                num: 1,
            },
        ],
    },
    {
        id: 916038,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6011301,
                num: 1,
            },
        ],
    },
    {
        id: 916039,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7012301,
                num: 1,
            },
        ],
    },
    {
        id: 916040,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7013301,
                num: 1,
            },
        ],
    },
    {
        id: 916041,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 10003301,
                num: 1,
            },
        ],
    },
    {
        id: 916042,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7015301,
                num: 1,
            },
        ],
    },
    {
        id: 916043,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6012301,
                num: 1,
            },
        ],
    },
    {
        id: 916044,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6013301,
                num: 1,
            },
        ],
    },
    {
        id: 916045,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6014301,
                num: 1,
            },
        ],
    },
    {
        id: 916046,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7001301,
                num: 1,
            },
        ],
    },
    {
        id: 916047,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7002301,
                num: 1,
            },
        ],
    },
    {
        id: 916048,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7003301,
                num: 1,
            },
        ],
    },
    {
        id: 916049,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 10004301,
                num: 1,
            },
        ],
    },
    {
        id: 916050,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7008301,
                num: 1,
            },
        ],
    },
    {
        id: 916051,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7009301,
                num: 1,
            },
        ],
    },
    {
        id: 916052,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 8001301,
                num: 1,
            },
        ],
    },
    {
        id: 916053,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 8002301,
                num: 1,
            },
        ],
    },
    {
        id: 916054,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6017301,
                num: 1,
            },
        ],
    },
    {
        id: 916055,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 9001301,
                num: 1,
            },
        ],
    },
    {
        id: 916056,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 9002301,
                num: 1,
            },
        ],
    },
    {
        id: 916057,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 9003301,
                num: 1,
            },
        ],
    },
    {
        id: 916058,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 9005301,
                num: 1,
            },
        ],
    },
    {
        id: 916059,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 9006301,
                num: 1,
            },
        ],
    },
    {
        id: 916060,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 9007301,
                num: 1,
            },
        ],
    },
    {
        id: 916101,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6004302,
                num: 1,
            },
        ],
    },
    {
        id: 916102,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 7009302,
                num: 1,
            },
        ],
    },
    {
        id: 916103,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 6017302,
                num: 1,
            },
        ],
    },
    {
        id: 916104,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 9007302,
                num: 1,
            },
        ],
    },
    {
        id: 916105,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 10001301,
                num: 1,
            },
        ],
    },
    {
        id: 916106,
        time: 1,
        th: 1,
        radius: [100, 1500, 100, 1500],
        m: [
            {
                id: 10002301,
                num: 1,
            },
        ],
    },
]

export const monsterLevelDropData: MonsterLevelDrop[] = [
    {
        BaseProbability: [10, 20, 40, 60, 80, 100, 120, 160, 200],
        EndTime: 2524622400,
        MonsterLevel: [80, 100, 120, 140, 160, 170, 180, 190, 200],
        MonsterLevelDropId: 1,
        MonsterLevelDropView: 15003,
        ProbabilityUp: [0, 1, 1, 1, 2, 2, 4, 4, 0],
        RewardId: [303003, 303003, 303003, 303003, 303003, 303003, 303003, 303003, 303003],
        StartTime: 1704081600,
    },
    {
        BaseProbability: [10, 20, 40, 60, 80, 100, 120, 160, 200],
        EndTime: 2524622400,
        MonsterLevel: [80, 100, 120, 140, 160, 170, 180, 190, 200],
        MonsterLevelDropId: 2,
        MonsterLevelDropView: 15002,
        ProbabilityUp: [0, 1, 1, 1, 2, 2, 4, 4, 0],
        RewardId: [303002, 303002, 303002, 303002, 303002, 303002, 303002, 303002, 303002],
        StartTime: 1704081600,
    },
]

export const monsterLevelDropMap = new Map<number, MonsterLevelDrop>()
monsterLevelDropData.forEach(drop => {
    monsterLevelDropMap.set(drop.MonsterLevelDropId, drop)
})
