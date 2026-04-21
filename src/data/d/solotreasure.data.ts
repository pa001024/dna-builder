export interface SoloTreasureRarity {
    rarity: number
    time: number
    show: number
}

export const soloTreasureRarityData: Record<string, SoloTreasureRarity> = {
    1: {
        time: 1,
        show: 2,
        rarity: 1,
    },
    2: {
        time: 1.5,
        show: 4,
        rarity: 2,
    },
    3: {
        time: 2,
        show: 5,
        rarity: 3,
    },
    4: {
        time: 2.5,
        show: 6,
        rarity: 4,
    },
    5: {
        time: 3,
        show: 6,
        rarity: 5,
    },
    6: {
        time: 2,
        show: 5,
        rarity: 6,
    },
}

export interface ExtractionTreasureGuard {
    MechanismID: number
    MechanismItemBox: number
    MechanismName: string
    RepairSpeed: number
}

export const extractionTreasureGuardData: Record<number, ExtractionTreasureGuard> = {
    "131067": {
        MechanismID: 131067,
        MechanismItemBox: 131065,
        MechanismName: "守护机关1",
        RepairSpeed: 0.1,
    },
}
export const extractionTreasureTypeNameMap: Record<number, string> = {
    1: "骨牌",
    2: "首饰",
    3: "日用品",
    4: "藏品",
    5: "机枢密钥",
}

export interface SoloTreasureDropEntry {
    BoxDropRate?: number
    DropMechanismId?: number
    KillScore?: number
    MonsterTag: string
}

export interface ExtractionTreasureMechanism {
    id: number
    itemLevelLimit: Record<string, number>
    itemLevelWeight: Record<string, number>
    itemNumRange: number[]
    name: string
    shape: number[]
}

export interface ExtractionTreasure {
    icon: string
    id: number
    name: string
    rarity: number
    shape: number[]
    type: number
    value: number
}

export interface ExtractionTreasureBag {
    desc: string
    eventUnlockCondition?: number
    id: number
    name: string
    price: number
    shape: number[][]
    shapeType: number
    shopItemId?: number
}

export interface SoloTreasureReward {
    id: number
    w: number
}

export interface SoloTreasureRainy {
    id: number
    type: string
    count: number
    rc: SoloTreasureReward[]
}

export interface SoloTreasure {
    id: number
    desc: string
    /** EvacuationTime */ etime: number
    /** GameTotalTime */ gtime: number
    /** TurnRainyTime */ rtime: number
    /** WarningTime */ wtime: number
    gamePlayId: number[]
    rainy: SoloTreasureRainy[]
}

export interface TreasureHuntEvent {
    EventId: number
    EventProgress: number[]
    EventRepeatDungeon: number[]
    EventShop: number
    EventStoryDungeon: number[]
    LimitTaskId: number[]
    PermanentTaskId: number[]
    PermanentTaskRewardView: number
}

// from TreasureHuntEvent
export const treasureHuntEventData: Record<string, TreasureHuntEvent> = {
    "103014": {
        EventId: 103014,
        EventProgress: [1001, 1002, 1003, 1004, 1005],
        EventRepeatDungeon: [10301401, 10301402, 10301403, 10301404],
        EventShop: 87,
        EventStoryDungeon: [10301411, 10301412, 10301413, 10301414, 10301415],
        LimitTaskId: [1301, 1302, 1303],
        PermanentTaskId: [1304],
        PermanentTaskRewardView: 103014,
    },
}

export interface SoloTreasureGamePlaySpawnMonster {
    id: number
    num: number
    lv: number
}

export interface SoloTreasureGamePlaySpawn {
    id: number
    time: number
    th: number
    radius: number[]
    m: SoloTreasureGamePlaySpawnMonster[]
}

export interface SoloTreasureGamePlayDom {
    id: number
    type: string
    uid: number
    pos: [number, number]
    icon?: string
    tributeId?: number
}

export interface SoloTreasureGamePlay {
    id: number
    name?: string
    type: number
    cd?: number
    gain?: number
    spawn?: SoloTreasureGamePlaySpawn
    dom: SoloTreasureGamePlayDom[]
    g1?: number
    g2?: number
    g3?: number
    g4?: number
    m1?: number
    m2?: number
    m3?: number
    m4?: number
}

export interface TreasureHuntProgress {
    id: number
    did: number
    name: string
    score: number
    icon: string
    petConText: string
    condition: number
}

export interface TreasureHuntRepeatDungeon {
    id: number
    name: string
    desc: string
    image: string
    easyDungeonId?: number
    easyModeFee?: number
    hardDungeonId: number
    hardModeFee: number
    banEasyPhantom: boolean
    banHardPhantom: boolean
    levelBackPack: number[]
    trialCharacter: number[]
    trialWeapon: number[]
    unlockCondition: number
    easyMaxConvertResource?: number
    easyScoreToResource?: Record<string, number>
    hardMaxConvertResource?: number
    hardScoreToResource?: Record<string, number>
}

export interface TreasureHuntStoryDungeon {
    id: number
    did: number
    name: string
    desc: string
    image: string
    fee: number
    feeResource: number
    banPhantom: boolean
    levelBackPack: number[]
    limitCharacter?: number[]
    trialCharacter: number[]
    trialPet?: number[]
    trialWeapon: number[]
    unlockCondition: number
}

/** 提取玩法机制表，由 importdata 自动写入。 */
export const extractionTreasureMechanismData: ExtractionTreasureMechanism[] = [
    {
        id: 131059,
        name: "藏珍竹筐",
        itemLevelLimit: {
            "3": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.6,
            "2": 0.3,
            "3": 0.07,
            "6": 0.03,
        },
        itemNumRange: [1, 4],
        shape: [6, 4],
    },
    {
        id: 131060,
        name: "小型竹篓",
        itemLevelLimit: {
            "3": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.6,
            "2": 0.3,
            "3": 0.07,
            "6": 0.03,
        },
        itemNumRange: [2, 3],
        shape: [6, 4],
    },
    {
        id: 131061,
        name: "妙妙葫芦",
        itemLevelLimit: {
            "3": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.6,
            "2": 0.3,
            "3": 0.07,
            "6": 0.03,
        },
        itemNumRange: [1, 4],
        shape: [6, 4],
    },
    {
        id: 131062,
        name: "藏珍兜娄",
        itemLevelLimit: {
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.4,
            "2": 0.3,
            "3": 0.25,
            "6": 0.05,
        },
        itemNumRange: [2, 3],
        shape: [6, 4],
    },
    {
        id: 131063,
        name: "妙妙箱",
        itemLevelLimit: {
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.4,
            "2": 0.3,
            "3": 0.25,
            "6": 0.05,
        },
        itemNumRange: [2, 3],
        shape: [6, 4],
    },
    {
        id: 131064,
        name: "中型竹篓",
        itemLevelLimit: {
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.4,
            "2": 0.3,
            "3": 0.25,
            "6": 0.05,
        },
        itemNumRange: [2, 4],
        shape: [6, 4],
    },
    {
        id: 131065,
        name: "特制藏宝炉",
        itemLevelLimit: {
            "4": 1,
            "5": 1,
            "6": 1,
        },
        itemLevelWeight: {},
        itemNumRange: [3, 4],
        shape: [8, 6],
    },
    {
        id: 131066,
        name: "三连卣",
        itemLevelLimit: {
            "4": 1,
            "5": 1,
            "6": 1,
        },
        itemLevelWeight: {},
        itemNumRange: [3, 5],
        shape: [8, 6],
    },
    {
        id: 131072,
        name: "特制藏宝炉",
        itemLevelLimit: {
            "4": 1,
            "5": 1,
            "6": 1,
        },
        itemLevelWeight: {},
        itemNumRange: [3, 5],
        shape: [8, 6],
    },
    {
        id: 131074,
        name: "藏珍竹筐",
        itemLevelLimit: {
            "3": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.6,
            "2": 0.3,
            "3": 0.07,
            "6": 0.03,
        },
        itemNumRange: [1, 4],
        shape: [6, 4],
    },
    {
        id: 131075,
        name: "小型竹篓",
        itemLevelLimit: {
            "3": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.6,
            "2": 0.3,
            "3": 0.07,
            "6": 0.03,
        },
        itemNumRange: [2, 3],
        shape: [6, 4],
    },
    {
        id: 131076,
        name: "妙妙葫芦",
        itemLevelLimit: {
            "3": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.6,
            "2": 0.3,
            "3": 0.07,
            "6": 0.03,
        },
        itemNumRange: [1, 4],
        shape: [6, 4],
    },
    {
        id: 131077,
        name: "藏珍兜娄",
        itemLevelLimit: {
            "3": 1,
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.17,
            "2": 0.2,
            "3": 0.3,
            "4": 0.2,
            "6": 0.03,
        },
        itemNumRange: [2, 3],
        shape: [6, 4],
    },
    {
        id: 131078,
        name: "妙妙箱",
        itemLevelLimit: {
            "3": 1,
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.17,
            "2": 0.2,
            "3": 0.3,
            "4": 0.2,
            "6": 0.03,
        },
        itemNumRange: [2, 3],
        shape: [6, 4],
    },
    {
        id: 131079,
        name: "中型竹篓",
        itemLevelLimit: {
            "3": 1,
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.17,
            "2": 0.2,
            "3": 0.3,
            "4": 0.2,
            "6": 0.03,
        },
        itemNumRange: [2, 4],
        shape: [6, 4],
    },
    {
        id: 131080,
        name: "特制藏宝炉",
        itemLevelLimit: {
            "4": 1,
            "5": 1,
            "6": 1,
        },
        itemLevelWeight: {},
        itemNumRange: [3, 4],
        shape: [8, 6],
    },
    {
        id: 131081,
        name: "三连卣",
        itemLevelLimit: {
            "4": 1,
            "5": 1,
            "6": 1,
        },
        itemLevelWeight: {},
        itemNumRange: [3, 5],
        shape: [8, 6],
    },
    {
        id: 131084,
        name: "藏珍竹筐",
        itemLevelLimit: {
            "3": 1,
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.2,
            "2": 0.2,
            "3": 0.3,
            "4": 0.2,
            "6": 0.1,
        },
        itemNumRange: [2, 4],
        shape: [8, 6],
    },
    {
        id: 131085,
        name: "小型竹篓",
        itemLevelLimit: {
            "3": 1,
            "4": 1,
            "6": 1,
        },
        itemLevelWeight: {
            "1": 0.2,
            "2": 0.2,
            "3": 0.3,
            "4": 0.2,
            "6": 0.1,
        },
        itemNumRange: [2, 3],
        shape: [8, 6],
    },
    {
        id: 131086,
        name: "中型竹篓",
        itemLevelLimit: {
            "4": 1,
            "5": 1,
            "6": 1,
        },
        itemLevelWeight: {},
        itemNumRange: [3, 4],
        shape: [8, 6],
    },
    {
        id: 131087,
        name: "藏珍兜娄",
        itemLevelLimit: {
            "4": 1,
            "5": 1,
            "6": 1,
        },
        itemLevelWeight: {},
        itemNumRange: [2, 5],
        shape: [8, 6],
    },
]

/** 提取玩法宝藏表，由 importdata 自动写入。 */
export const extractionTreasureData: ExtractionTreasure[] = [
    {
        id: 100101,
        name: "竹制雀牌（中）",
        icon: "T_Activity_SoloTreasure_22",
        shape: [1, 1],
        type: 1,
        rarity: 1,
        value: 50,
    },
    {
        id: 100104,
        name: "铜耳环",
        icon: "T_Activity_SoloTreasure_12",
        shape: [1, 1],
        type: 2,
        rarity: 1,
        value: 80,
    },
    {
        id: 100105,
        name: "香囊",
        icon: "T_Activity_SoloTreasure_14",
        shape: [2, 2],
        type: 3,
        rarity: 1,
        value: 320,
    },
    {
        id: 100106,
        name: "木梳",
        icon: "T_Activity_SoloTreasure_07",
        shape: [1, 3],
        type: 3,
        rarity: 1,
        value: 180,
    },
    {
        id: 100107,
        name: "食盒",
        icon: "T_Activity_SoloTreasure_10",
        shape: [2, 3],
        type: 3,
        rarity: 1,
        value: 360,
    },
    {
        id: 100108,
        name: "骨制雀牌（中）",
        icon: "T_Activity_SoloTreasure_03",
        shape: [1, 1],
        type: 1,
        rarity: 2,
        value: 250,
    },
    {
        id: 100111,
        name: "玉扳指",
        icon: "T_Activity_SoloTreasure_18",
        shape: [1, 1],
        type: 2,
        rarity: 2,
        value: 500,
    },
    {
        id: 100112,
        name: "长命锁",
        icon: "T_Activity_SoloTreasure_20",
        shape: [1, 1],
        type: 2,
        rarity: 2,
        value: 450,
    },
    {
        id: 100113,
        name: "砚台",
        icon: "T_Activity_SoloTreasure_16",
        shape: [2, 2],
        type: 3,
        rarity: 2,
        value: 1200,
    },
    {
        id: 100114,
        name: "单盏油灯",
        icon: "T_Activity_SoloTreasure_17",
        shape: [1, 2],
        type: 3,
        rarity: 2,
        value: 600,
    },
    {
        id: 100115,
        name: "金制雀牌（中）",
        icon: "T_Activity_SoloTreasure_05",
        shape: [1, 1],
        type: 1,
        rarity: 3,
        value: 1000,
    },
    {
        id: 100118,
        name: "兼毫笔",
        icon: "T_Activity_SoloTreasure_04",
        shape: [1, 2],
        type: 3,
        rarity: 3,
        value: 2000,
    },
    {
        id: 100119,
        name: "鸟纹爵",
        icon: "T_Activity_SoloTreasure_08",
        shape: [2, 3],
        type: 4,
        rarity: 3,
        value: 9000,
    },
    {
        id: 100120,
        name: "鎏金镶玉铜枕",
        icon: "T_Activity_SoloTreasure_21",
        shape: [3, 4],
        type: 3,
        rarity: 3,
        value: 12000,
    },
    {
        id: 100121,
        name: "玉珏",
        icon: "T_Activity_SoloTreasure_19",
        shape: [1, 1],
        type: 2,
        rarity: 3,
        value: 1500,
    },
    {
        id: 100122,
        name: "金镯",
        icon: "T_Activity_SoloTreasure_06",
        shape: [1, 1],
        type: 2,
        rarity: 3,
        value: 1600,
    },
    {
        id: 100123,
        name: "嵌珍珠宝石金项链",
        icon: "T_Activity_SoloTreasure_15",
        shape: [2, 2],
        type: 2,
        rarity: 4,
        value: 20000,
    },
    {
        id: 100124,
        name: "天青瓷碗",
        icon: "T_Activity_SoloTreasure_11",
        shape: [2, 2],
        type: 3,
        rarity: 4,
        value: 16000,
    },
    {
        id: 100125,
        name: "博山炉",
        icon: "T_Activity_SoloTreasure_01",
        shape: [2, 3],
        type: 3,
        rarity: 4,
        value: 26000,
    },
    {
        id: 100126,
        name: "点翠冠",
        icon: "T_Activity_SoloTreasure_02",
        shape: [3, 3],
        type: 2,
        rarity: 5,
        value: 150000,
    },
    {
        id: 100127,
        name: "玉雕太皓神像",
        icon: "T_Activity_SoloTreasure_23",
        shape: [3, 3],
        type: 4,
        rarity: 5,
        value: 135000,
    },
    {
        id: 100128,
        name: "青铜神树",
        icon: "T_Activity_SoloTreasure_09",
        shape: [3, 4],
        type: 4,
        rarity: 5,
        value: 240000,
    },
    {
        id: 100129,
        name: "四羊铜尊",
        icon: "T_Activity_SoloTreasure_13",
        shape: [3, 4],
        type: 4,
        rarity: 5,
        value: 280000,
    },
    {
        id: 100130,
        name: "机枢密钥壹号",
        icon: "T_Activity_SoloTreasure_27",
        shape: [1, 1],
        type: 5,
        rarity: 6,
        value: 0,
    },
    {
        id: 100131,
        name: "机枢密钥贰号",
        icon: "T_Activity_SoloTreasure_28",
        shape: [1, 1],
        type: 5,
        rarity: 6,
        value: 0,
    },
    {
        id: 100132,
        name: "机枢密钥叁号",
        icon: "T_Activity_SoloTreasure_29",
        shape: [1, 1],
        type: 5,
        rarity: 6,
        value: 0,
    },
]

/** 提取玩法背包表，由 importdata 自动写入。 */
export const extractionTreasureBagData: ExtractionTreasureBag[] = [
    {
        id: 1,
        name: "百宝囊·一",
        desc: "24.0",
        price: 0,
        shape: [
            [2, 2],
            [2, 2],
            [4, 4],
        ],
        shapeType: 1,
    },
    {
        id: 2,
        name: "百宝囊·二",
        desc: "35.0",
        price: 800,
        shape: [
            [1, 3],
            [3, 3],
            [1, 3],
            [5, 4],
        ],
        shapeType: 0,
        eventUnlockCondition: 10301417,
        shopItemId: 10007121,
    },
    {
        id: 3,
        name: "百宝囊·三",
        desc: "45.0",
        price: 4000,
        shape: [
            [1, 3],
            [3, 3],
            [1, 3],
            [5, 6],
        ],
        shapeType: 0,
        eventUnlockCondition: 10301418,
        shopItemId: 10007122,
    },
    {
        id: 4,
        name: "百宝囊·四",
        desc: "55.0",
        price: 10000,
        shape: [
            [1, 3],
            [3, 3],
            [1, 3],
            [5, 3],
            [5, 5],
        ],
        shapeType: 2,
        eventUnlockCondition: 10301419,
        shopItemId: 10007123,
    },
    {
        id: 5,
        name: "百宝囊·五",
        desc: "60.0",
        price: 30000,
        shape: [[5, 12]],
        shapeType: 3,
        eventUnlockCondition: 10301420,
        shopItemId: 10007124,
    },
    {
        id: 6,
        name: "百宝囊·六",
        desc: "70.0",
        price: 150000,
        shape: [[5, 14]],
        shapeType: 3,
        eventUnlockCondition: 10301421,
        shopItemId: 10007125,
    },
]

// from SoloTreasureDrop
export const soloTreasureDropData: Record<string, SoloTreasureDropEntry> = {
    "Mon.SoloTreasure.AContainer": {
        BoxDropRate: 0.03,
        DropMechanismId: 131076,
        MonsterTag: "Mon.SoloTreasure.AContainer",
    },
    "Mon.SoloTreasure.APoint": {
        KillScore: 400,
        MonsterTag: "Mon.SoloTreasure.APoint",
    },
    "Mon.SoloTreasure.BContainer": {
        BoxDropRate: 0.03,
        DropMechanismId: 131061,
        MonsterTag: "Mon.SoloTreasure.BContainer",
    },
    "Mon.SoloTreasure.BPoint": {
        KillScore: 200,
        MonsterTag: "Mon.SoloTreasure.BPoint",
    },
    "Mon.SoloTreasure.CContainer": {
        BoxDropRate: 0.3,
        DropMechanismId: 131079,
        MonsterTag: "Mon.SoloTreasure.CContainer",
    },
    "Mon.SoloTreasure.CPoint": {
        KillScore: 3000,
        MonsterTag: "Mon.SoloTreasure.CPoint",
    },
    "Mon.SoloTreasure.DContainer": {
        BoxDropRate: 0.3,
        DropMechanismId: 131064,
        MonsterTag: "Mon.SoloTreasure.DContainer",
    },
    "Mon.SoloTreasure.DPoint": {
        KillScore: 1500,
        MonsterTag: "Mon.SoloTreasure.DPoint",
    },
    "Mon.SoloTreasure.EContainer": {
        BoxDropRate: 1,
        DropMechanismId: 131080,
        MonsterTag: "Mon.SoloTreasure.EContainer",
    },
    "Mon.SoloTreasure.EPoint": {
        KillScore: 10000,
        MonsterTag: "Mon.SoloTreasure.EPoint",
    },
    "Mon.SoloTreasure.FContainer": {
        BoxDropRate: 1,
        DropMechanismId: 131065,
        MonsterTag: "Mon.SoloTreasure.FContainer",
    },
    "Mon.SoloTreasure.FPoint": {
        KillScore: 5000,
        MonsterTag: "Mon.SoloTreasure.FPoint",
    },
}

export const soloTreasureData: SoloTreasure[] = [
    {
        id: 41801,
        desc: "正常",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88101, 88201],
        rainy: [
            {
                id: 7180001,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180002,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515053,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230101,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003051,
                        w: 1,
                    },
                    {
                        id: 10004051,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41802,
        desc: "正常",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88101, 88201],
        rainy: [
            {
                id: 7180001,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180002,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515053,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230101,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003051,
                        w: 1,
                    },
                    {
                        id: 10004051,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41803,
        desc: "挑战",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88111, 88211],
        rainy: [
            {
                id: 7180015,
                type: "Mechanism",
                count: 3,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180016,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515054,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230103,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003052,
                        w: 1,
                    },
                    {
                        id: 10004052,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41804,
        desc: "挑战",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88111, 88211],
        rainy: [
            {
                id: 7180015,
                type: "Mechanism",
                count: 3,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180016,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515054,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230103,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003052,
                        w: 1,
                    },
                    {
                        id: 10004052,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41805,
        desc: "正常",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88102, 88202],
        rainy: [
            {
                id: 7180013,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180014,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515053,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230102,
                type: "Monster",
                count: 6,
                rc: [
                    {
                        id: 10003051,
                        w: 1,
                    },
                    {
                        id: 10004051,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41806,
        desc: "正常",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88102, 88202],
        rainy: [
            {
                id: 7180013,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180014,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515053,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230102,
                type: "Monster",
                count: 6,
                rc: [
                    {
                        id: 10003051,
                        w: 1,
                    },
                    {
                        id: 10004051,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41807,
        desc: "挑战",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88112, 88212],
        rainy: [
            {
                id: 7180017,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180018,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515054,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230104,
                type: "Monster",
                count: 6,
                rc: [
                    {
                        id: 10003052,
                        w: 1,
                    },
                    {
                        id: 10004052,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41808,
        desc: "挑战",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88112, 88212],
        rainy: [
            {
                id: 7180017,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180018,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515054,
                        w: 1,
                    },
                ],
            },
            {
                id: 7230104,
                type: "Monster",
                count: 6,
                rc: [
                    {
                        id: 10003052,
                        w: 1,
                    },
                    {
                        id: 10004052,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41809,
        desc: "挑战",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88113, 88213],
        rainy: [
            {
                id: 7180302,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180309,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515054,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180310,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003052,
                        w: 1,
                    },
                    {
                        id: 10004052,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41810,
        desc: "挑战",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88113, 88213],
        rainy: [
            {
                id: 7180302,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180309,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515054,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180310,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003052,
                        w: 1,
                    },
                    {
                        id: 10004052,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41811,
        desc: "正常",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88104, 88204],
        rainy: [
            {
                id: 7180312,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180319,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515053,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180320,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003051,
                        w: 1,
                    },
                    {
                        id: 10004051,
                        w: 1,
                    },
                ],
            },
        ],
    },
    {
        id: 41812,
        desc: "挑战",
        etime: 10,
        gtime: 600,
        rtime: 420,
        wtime: 60,
        gamePlayId: [88114, 88214],
        rainy: [
            {
                id: 7180302,
                type: "Mechanism",
                count: 2,
                rc: [
                    {
                        id: 131072,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180309,
                type: "Monster",
                count: 1,
                rc: [
                    {
                        id: 8515054,
                        w: 1,
                    },
                ],
            },
            {
                id: 7180310,
                type: "Monster",
                count: 12,
                rc: [
                    {
                        id: 10003052,
                        w: 1,
                    },
                    {
                        id: 10004052,
                        w: 1,
                    },
                ],
            },
        ],
    },
]
export const soloTreasureGamePlayData: SoloTreasureGamePlay[] = [
    {
        id: 88101,
        name: "保护容器",
        type: 1,
        cd: 40,
        gain: 10000,
        spawn: {
            id: 9170001,
            time: 1,
            th: 24,
            radius: [1000, 10000, 1000, 10000],
            m: [
                {
                    id: 6017051,
                    num: 10,
                    lv: 120,
                },
                {
                    id: 6016051,
                    num: 10,
                    lv: 120,
                },
                {
                    id: 6015051,
                    num: 5,
                    lv: 120,
                },
            ],
        },
        dom: [
            {
                id: 2710216,
                type: "Mechanism",
                uid: 131067,
                pos: [51059.47, 20510.69],
            },
            {
                id: 2710217,
                type: "Mechanism",
                uid: 131067,
                pos: [52399.84, 22109.08],
            },
        ],
    },
    {
        id: 88102,
        name: "保护容器",
        type: 1,
        cd: 40,
        gain: 10000,
        spawn: {
            id: 9170002,
            time: 1,
            th: 24,
            radius: [1000, 10000, 1000, 10000],
            m: [
                {
                    id: 6017051,
                    num: 10,
                    lv: 120,
                },
                {
                    id: 6016051,
                    num: 10,
                    lv: 120,
                },
                {
                    id: 6015051,
                    num: 5,
                    lv: 120,
                },
            ],
        },
        dom: [
            {
                id: 2850020,
                type: "Mechanism",
                uid: 131067,
                pos: [-22584.08, -29230.44],
            },
            {
                id: 2850021,
                type: "Mechanism",
                uid: 131067,
                pos: [-20881.34, -27714.75],
            },
            {
                id: 2850022,
                type: "Mechanism",
                uid: 131067,
                pos: [-19578.08, -29853.1],
            },
        ],
    },
    {
        id: 88104,
        name: "保护容器",
        type: 1,
        cd: 40,
        gain: 10000,
        spawn: {
            id: 9170004,
            time: 1,
            th: 24,
            radius: [1000, 10000, 1000, 10000],
            m: [
                {
                    id: 6017051,
                    num: 10,
                    lv: 120,
                },
                {
                    id: 6016051,
                    num: 10,
                    lv: 120,
                },
                {
                    id: 6015051,
                    num: 5,
                    lv: 120,
                },
            ],
        },
        dom: [
            {
                id: 292750793,
                type: "Mechanism",
                uid: 131067,
                pos: [-22690.85, -44206.83],
            },
            {
                id: 292750794,
                type: "Mechanism",
                uid: 131067,
                pos: [-17412.41, -43330.77],
            },
            {
                id: 292750795,
                type: "Mechanism",
                uid: 131067,
                pos: [-20651.82, -43074.66],
            },
        ],
    },
    {
        id: 88111,
        name: "保护容器",
        type: 1,
        cd: 40,
        gain: 20000,
        spawn: {
            id: 9170011,
            time: 1,
            th: 24,
            radius: [1000, 10000, 1000, 10000],
            m: [
                {
                    id: 6017052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6016052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6015052,
                    num: 4,
                    lv: 120,
                },
                {
                    id: 10003052,
                    num: 2,
                    lv: 120,
                },
                {
                    id: 10004052,
                    num: 3,
                    lv: 120,
                },
            ],
        },
        dom: [
            {
                id: 2860189,
                type: "Mechanism",
                uid: 131067,
                pos: [51059.47, 20510.69],
            },
            {
                id: 2860190,
                type: "Mechanism",
                uid: 131067,
                pos: [52399.84, 22109.08],
            },
        ],
    },
    {
        id: 88112,
        name: "保护容器",
        type: 1,
        cd: 40,
        gain: 20000,
        spawn: {
            id: 9170012,
            time: 1,
            th: 24,
            radius: [1000, 10000, 1000, 10000],
            m: [
                {
                    id: 6017052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6016052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6015052,
                    num: 4,
                    lv: 120,
                },
                {
                    id: 10003052,
                    num: 2,
                    lv: 120,
                },
                {
                    id: 10004052,
                    num: 3,
                    lv: 120,
                },
            ],
        },
        dom: [
            {
                id: 2880061,
                type: "Mechanism",
                uid: 131067,
                pos: [-22584.08, -29230.44],
            },
            {
                id: 2880062,
                type: "Mechanism",
                uid: 131067,
                pos: [-20881.34, -27714.75],
            },
            {
                id: 2880063,
                type: "Mechanism",
                uid: 131067,
                pos: [-19578.08, -29853.1],
            },
        ],
    },
    {
        id: 88113,
        name: "保护容器",
        type: 1,
        cd: 40,
        gain: 20000,
        spawn: {
            id: 9170013,
            time: 1,
            th: 24,
            radius: [1000, 10000, 1000, 10000],
            m: [
                {
                    id: 6017052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6016052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6015052,
                    num: 4,
                    lv: 120,
                },
                {
                    id: 10003052,
                    num: 2,
                    lv: 120,
                },
                {
                    id: 10004052,
                    num: 3,
                    lv: 120,
                },
            ],
        },
        dom: [
            {
                id: 292770352,
                type: "Mechanism",
                uid: 131067,
                pos: [-22690.85, -44206.83],
            },
            {
                id: 292770353,
                type: "Mechanism",
                uid: 131067,
                pos: [-17412.41, -43330.77],
            },
            {
                id: 292770354,
                type: "Mechanism",
                uid: 131067,
                pos: [-20651.82, -43074.66],
            },
        ],
    },
    {
        id: 88114,
        name: "保护容器",
        type: 1,
        cd: 40,
        gain: 20000,
        spawn: {
            id: 9170014,
            time: 1,
            th: 24,
            radius: [1000, 10000, 1000, 10000],
            m: [
                {
                    id: 6017052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6016052,
                    num: 8,
                    lv: 120,
                },
                {
                    id: 6015052,
                    num: 4,
                    lv: 120,
                },
                {
                    id: 10003052,
                    num: 2,
                    lv: 120,
                },
                {
                    id: 10004052,
                    num: 3,
                    lv: 120,
                },
            ],
        },
        dom: [
            {
                id: 292760137,
                type: "Mechanism",
                uid: 131067,
                pos: [-22690.85, -44206.83],
            },
            {
                id: 292760138,
                type: "Mechanism",
                uid: 131067,
                pos: [-17412.41, -43330.77],
            },
            {
                id: 292760139,
                type: "Mechanism",
                uid: 131067,
                pos: [-20651.82, -43074.66],
            },
        ],
    },
    {
        id: 88201,
        type: 2,
        dom: [
            {
                id: 2710215,
                type: "Mechanism",
                uid: 131069,
                icon: "T_Gp_SacrificeContainer",
                tributeId: 131069,
                pos: [41091.64, 33143.74],
            },
        ],
        g1: 2000,
        g2: 5000,
        g3: 10000,
        g4: 99999,
        m1: 9180101,
        m2: 9180201,
        m3: 9180301,
        m4: 9180401,
    },
    {
        id: 88202,
        type: 2,
        dom: [
            {
                id: 2850018,
                type: "Mechanism",
                uid: 131069,
                icon: "T_Gp_SacrificeContainer",
                tributeId: 131069,
                pos: [-21278.22, -15858.85],
            },
        ],
        g1: 2000,
        g2: 5000,
        g3: 10000,
        g4: 99999,
        m1: 9180102,
        m2: 9180202,
        m3: 9180302,
        m4: 9180402,
    },
    {
        id: 88204,
        type: 2,
        dom: [
            {
                id: 292750859,
                type: "Mechanism",
                uid: 131069,
                icon: "T_Gp_SacrificeContainer",
                tributeId: 131069,
                pos: [-12277.74, -47418.55],
            },
        ],
        g1: 2000,
        g2: 5000,
        g3: 10000,
        g4: 99999,
        m1: 9180104,
        m2: 9180204,
        m3: 9180304,
        m4: 9180404,
    },
    {
        id: 88211,
        type: 2,
        dom: [
            {
                id: 2860205,
                type: "Mechanism",
                uid: 131069,
                icon: "T_Gp_SacrificeContainer",
                tributeId: 131069,
                pos: [41091.64, 33143.74],
            },
        ],
        g1: 2000,
        g2: 5000,
        g3: 10000,
        g4: 99999,
        m1: 9180111,
        m2: 9180211,
        m3: 9180311,
        m4: 9180411,
    },
    {
        id: 88212,
        type: 2,
        dom: [
            {
                id: 2880073,
                type: "Mechanism",
                uid: 131069,
                icon: "T_Gp_SacrificeContainer",
                tributeId: 131069,
                pos: [-21278.22, -15858.85],
            },
        ],
        g1: 2000,
        g2: 5000,
        g3: 10000,
        g4: 99999,
        m1: 9180112,
        m2: 9180212,
        m3: 9180312,
        m4: 9180412,
    },
    {
        id: 88213,
        type: 2,
        dom: [
            {
                id: 292770418,
                type: "Mechanism",
                uid: 131069,
                icon: "T_Gp_SacrificeContainer",
                tributeId: 131069,
                pos: [-12277.74, -47418.55],
            },
        ],
        g1: 2000,
        g2: 5000,
        g3: 10000,
        g4: 99999,
        m1: 9180113,
        m2: 9180213,
        m3: 9180313,
        m4: 9180413,
    },
    {
        id: 88214,
        type: 2,
        dom: [
            {
                id: 292760203,
                type: "Mechanism",
                uid: 131069,
                icon: "T_Gp_SacrificeContainer",
                tributeId: 131069,
                pos: [-12277.74, -47418.55],
            },
        ],
        g1: 2000,
        g2: 5000,
        g3: 10000,
        g4: 99999,
        m1: 9180114,
        m2: 9180214,
        m3: 9180314,
        m4: 9180414,
    },
]
export const treasureHuntProgressData: TreasureHuntProgress[] = [
    {
        id: 1001,
        did: 10301411,
        name: "初筛",
        score: 20000,
        icon: "T_SoloTreasure_Bird01",
        petConText: "低功率运行",
        condition: 10301422,
    },
    {
        id: 1002,
        did: 10301412,
        name: "再试",
        score: 50000,
        icon: "T_SoloTreasure_Bird02",
        petConText: "中功率运行",
        condition: 10301423,
    },
    {
        id: 1003,
        did: 10301413,
        name: "次选",
        score: 80000,
        icon: "T_SoloTreasure_Bird03",
        petConText: "高功率运行",
        condition: 10301424,
    },
    {
        id: 1004,
        did: 10301414,
        name: "终赛",
        score: 120000,
        icon: "T_SoloTreasure_Bird04",
        petConText: "超载运行",
        condition: 10301425,
    },
    {
        id: 1005,
        did: 10301415,
        name: "决胜",
        score: 120000,
        icon: "T_SoloTreasure_Bird05",
        petConText: "已损毁",
        condition: 10301426,
    },
]
export const treasureHuntRepeatDungeonData: TreasureHuntRepeatDungeon[] = [
    {
        id: 10301401,
        name: "烟津渡",
        desc: "烟津渡原身为皓京最大的运输码头，也是织星客们进出华胥的首要关卡枢纽，后逐步发展为城市。在奉香大典的召集下，织星客们出资捐赠了大量珍宝财物用以支持群英试，为此，大典官方将第一道赛场安排在了烟津渡。",
        image: "T_SoloTreasure_Gangkou",
        easyDungeonId: 41802,
        easyModeFee: 0,
        hardDungeonId: 41804,
        hardModeFee: 1000,
        banEasyPhantom: false,
        banHardPhantom: true,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        trialCharacter: [150402, 230101, 420101],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10102001, 20602001, 10203001, 20502002],
        unlockCondition: 10301401,
    },
    {
        id: 10301402,
        name: "尘漠石海",
        desc: "尘漠石海曾因烛阴之灾而沦为无人之境，令华胥人闻之心惊。现烛阴归位，此地的晶尘化现象却无法彻底改缮，为消弭群众心中对于此地的恐惧，也为了清理此地剩余的盘踞秽兽，大典官方将第二道赛场安排在这里。",
        image: "T_SoloTreasure_Wuhui",
        easyDungeonId: 41806,
        easyModeFee: 500,
        hardDungeonId: 41808,
        hardModeFee: 2000,
        banEasyPhantom: false,
        banHardPhantom: true,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        trialCharacter: [150402, 230101, 420101],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10102001, 20602001, 10203001, 20502002],
        unlockCondition: 10301402,
    },
    {
        id: 10301403,
        name: "皓京西郊",
        desc: "皓京西郊以林地为主，人烟稀少。由于皓京城区因双龙之乱部分建筑受创，西郊被设立为本次比赛的最终场地。",
        image: "T_SoloTreasure_Dongjiao",
        hardDungeonId: 41810,
        hardModeFee: 4000,
        banEasyPhantom: false,
        banHardPhantom: true,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        trialCharacter: [150402, 230101, 420101],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10102001, 20602001, 10203001, 20502002],
        unlockCondition: 10301403,
    },
    {
        id: 10301404,
        name: "特邀赛",
        desc: "奉香群英试举办以来在华胥各地引起了极高的关注度，各路明星选手在赛事中的亮眼表现十分引人注目。为吸引更多年轻子弟接受华胥这场翻天覆地的变化，大赛官方邀请这些明星选手们参与挑战升级的特邀赛，并准备了对应的邀请函。",
        image: "T_SoloTreasure_Dongjiao",
        easyDungeonId: 41811,
        easyModeFee: 1,
        hardDungeonId: 41812,
        hardModeFee: 3,
        easyMaxConvertResource: 1000000,
        easyScoreToResource: {
            "101": 2,
        },
        hardMaxConvertResource: 3000000,
        hardScoreToResource: {
            "101": 0.5,
        },
        banEasyPhantom: false,
        banHardPhantom: true,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        trialCharacter: [150402, 230101, 420101],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10102001, 20602001, 10203001, 20502002],
        unlockCondition: 10301404,
    },
]
export const treasureHuntStoryDungeonData: TreasureHuntStoryDungeon[] = [
    {
        id: 10301411,
        did: 41801,
        name: "烟津渡",
        desc: "烟津渡原身为皓京最大的运输码头，也是织星客们进出华胥的首要关卡枢纽，后逐步发展为城市。在奉香大典的召集下，织星客们出资捐赠了大量珍宝财物用以支持群英试，为此，大典官方将第一道赛场安排在了烟津渡。",
        image: "T_SoloTreasure_Gangkou",
        fee: 0,
        feeResource: 6000004,
        banPhantom: false,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        limitCharacter: [1504, 2301, 1601, 160101],
        trialCharacter: [150402, 230101],
        trialPet: [605],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10102001, 20602001],
        unlockCondition: 10301422,
    },
    {
        id: 10301412,
        did: 41803,
        name: "烟津渡",
        desc: "烟津渡原身为皓京最大的运输码头，也是织星客们进出华胥的首要关卡枢纽，后逐步发展为城市。在奉香大典的召集下，织星客们出资捐赠了大量珍宝财物用以支持群英试，为此，大典官方将第一道赛场安排在了烟津渡。",
        image: "T_SoloTreasure_Gangkou",
        fee: 1000,
        feeResource: 6000004,
        banPhantom: false,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        limitCharacter: [1504, 4201, 1601, 160101],
        trialCharacter: [150402, 420101],
        trialPet: [605],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10203001, 20502002],
        unlockCondition: 10301423,
    },
    {
        id: 10301413,
        did: 41805,
        name: "尘漠石海",
        desc: "尘漠石海曾因烛阴之灾而沦为无人之境，令华胥人闻之心惊。现烛阴归位，此地的晶尘化现象却无法彻底改缮，为消弭群众心中对于此地的恐惧，也为了清理此地剩余的盘踞秽兽，大典官方将第二道赛场安排在这里。",
        image: "T_SoloTreasure_Wuhui",
        fee: 2000,
        feeResource: 6000004,
        banPhantom: false,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        limitCharacter: [1504, 4201, 1601, 160101],
        trialCharacter: [150402, 420101],
        trialPet: [605],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10203001, 20502002],
        unlockCondition: 10301424,
    },
    {
        id: 10301414,
        did: 41807,
        name: "尘漠石海",
        desc: "尘漠石海曾因烛阴之灾而沦为无人之境，令华胥人闻之心惊。现烛阴归位，此地的晶尘化现象却无法彻底改缮，为消弭群众心中对于此地的恐惧，也为了清理此地剩余的盘踞秽兽，大典官方将第二道赛场安排在这里。",
        image: "T_SoloTreasure_Wuhui",
        fee: 3000,
        feeResource: 6000004,
        banPhantom: false,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        limitCharacter: [1504, 4201, 1601, 160101],
        trialCharacter: [150402, 420101],
        trialPet: [605],
        trialWeapon: [10103002, 20501002, 20407002, 10202002, 10203001, 20502002],
        unlockCondition: 10301425,
    },
    {
        id: 10301415,
        did: 41809,
        name: "皓京西郊",
        desc: "皓京西郊以林地为主，人烟稀少。由于皓京城区因双龙之乱部分建筑受创，西郊被设立为本次比赛的最终场地。",
        image: "T_SoloTreasure_Dongjiao",
        fee: 5000,
        feeResource: 6000004,
        banPhantom: false,
        levelBackPack: [1, 2, 3, 4, 5, 6],
        limitCharacter: [4201, 2301, 1601, 160101],
        trialCharacter: [420101, 230101],
        trialPet: [-1],
        trialWeapon: [10103002, 20501002, 10203001, 20502002, 10102001, 20602001],
        unlockCondition: 10301426,
    },
]
