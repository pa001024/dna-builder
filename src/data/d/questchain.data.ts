export interface QuestChain {
    id: number
    name: string
    chapterName: string
    chapterNumber?: string
    episode: string
    type: number
    icon?: string
    reward?: number[]
    questReward?: Record<number, number>
    quests: QuestChainItem[]
    main?: number
    startTime?: number
    endTime?: number
    desc?: string
    detail?: string
    npc?: number
}

export interface QuestChainItem {
    id: number
    next?: Record<string, number>
}

export const questChainData: QuestChain[] = [
    {
        id: 100101,
        name: "逃离净界岛",
        chapterName: "夜航篇",
        chapterNumber: "序章",
        episode: "涉过沙海的你",
        type: 1,
        icon: "T_Chapter_Icon01",
        reward: [50500],
        questReward: {
            "10010102": 300301,
        },
        quests: [
            {
                id: 10010101,
                next: {
                    Success: 10010102,
                },
            },
            {
                id: 10010102,
                next: {
                    Success: 10010103,
                },
            },
            {
                id: 10010103,
                next: {
                    Success: 10010104,
                },
            },
            {
                id: 10010104,
                next: {
                    Success: 10010105,
                },
            },
            {
                id: 10010105,
                next: {
                    Success: 10010106,
                },
            },
            {
                id: 10010106,
                next: {
                    Success: 10010107,
                },
            },
            {
                id: 10010107,
                next: {
                    Success: 10010108,
                },
            },
            {
                id: 10010108,
                next: {
                    Success: 10010109,
                },
            },
            {
                id: 10010109,
                next: {
                    Success: 10010110,
                },
            },
            {
                id: 10010110,
                next: {
                    Success: 10010111,
                },
            },
            {
                id: 10010111,
            },
        ],
    },
    {
        id: 100102,
        name: "时光掩埋之地",
        chapterName: "夜航篇",
        chapterNumber: "序章",
        episode: "涉过沙海的你",
        type: 1,
        icon: "T_Chapter_Icon01",
        reward: [50501],
        quests: [
            {
                id: 10010201,
                next: {
                    Success: 10010203,
                },
            },
            {
                id: 10010203,
                next: {
                    Success: 10010204,
                },
            },
            {
                id: 10010204,
                next: {
                    Success: 10010205,
                },
            },
            {
                id: 10010205,
                next: {
                    Success: 10010206,
                },
            },
            {
                id: 10010206,
                next: {
                    Success: 10010207,
                },
            },
            {
                id: 10010207,
                next: {
                    Success: 10010208,
                },
            },
            {
                id: 10010208,
                next: {
                    Success: 10010209,
                },
            },
            {
                id: 10010209,
                next: {
                    Success: 10010210,
                },
            },
            {
                id: 10010210,
                next: {
                    Success: 10010212,
                },
            },
            {
                id: 10010212,
                next: {
                    Success: 10010213,
                },
            },
            {
                id: 10010213,
            },
        ],
    },
    {
        id: 100103,
        name: "尘沙的回声",
        chapterName: "夜航篇",
        chapterNumber: "序章",
        episode: "涉过沙海的你",
        type: 1,
        icon: "T_Chapter_Icon01",
        reward: [50502],
        quests: [
            {
                id: 10010301,
                next: {
                    Success: 10010302,
                },
            },
            {
                id: 10010302,
                next: {
                    Success: 10010303,
                },
            },
            {
                id: 10010303,
                next: {
                    Success: 10010304,
                },
            },
            {
                id: 10010304,
                next: {
                    Success: 10010305,
                },
            },
            {
                id: 10010305,
                next: {
                    Success: 10010306,
                },
            },
            {
                id: 10010306,
                next: {
                    Success: 10010310,
                },
            },
            {
                id: 10010307,
                next: {
                    Success: 10010308,
                },
            },
            {
                id: 10010308,
            },
            {
                id: 10010310,
                next: {
                    Success: 10010307,
                },
            },
            {
                id: 10010311,
                next: {
                    Success: 10010312,
                },
            },
            {
                id: 10010312,
                next: {
                    Success: 10010301,
                },
            },
        ],
    },
    {
        id: 100201,
        name: "二次诞生",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50503],
        quests: [
            {
                id: 10020101,
                next: {
                    Success: 10020102,
                },
            },
            {
                id: 10020102,
                next: {
                    Success: 10020103,
                },
            },
            {
                id: 10020103,
                next: {
                    Success: 10020104,
                },
            },
            {
                id: 10020104,
                next: {
                    Success: 10020105,
                },
            },
            {
                id: 10020105,
                next: {
                    Success: 10020106,
                },
            },
            {
                id: 10020106,
                next: {
                    Success: 10020107,
                },
            },
            {
                id: 10020107,
                next: {
                    Success: 10020108,
                },
            },
            {
                id: 10020108,
                next: {
                    Success: 10020111,
                },
            },
            {
                id: 10020111,
                next: {
                    Success: 10020112,
                },
            },
            {
                id: 10020112,
            },
        ],
    },
    {
        id: 100202,
        name: "生存之道",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50504],
        questReward: {
            "10020215": 4000008,
            "10020223": 50531,
        },
        quests: [
            {
                id: 10020201,
                next: {
                    Success: 10020202,
                },
            },
            {
                id: 10020202,
                next: {
                    Success: 10020203,
                },
            },
            {
                id: 10020203,
                next: {
                    Success: 10020204,
                },
            },
            {
                id: 10020204,
                next: {
                    Success: 10020205,
                },
            },
            {
                id: 10020205,
                next: {
                    Success: 10020206,
                },
            },
            {
                id: 10020206,
                next: {
                    Success: 10020207,
                },
            },
            {
                id: 10020207,
                next: {
                    Success: 10020208,
                },
            },
            {
                id: 10020208,
                next: {
                    Success: 10020209,
                },
            },
            {
                id: 10020209,
                next: {
                    Success: 10020210,
                },
            },
            {
                id: 10020210,
                next: {
                    Success: 10020211,
                },
            },
            {
                id: 10020211,
                next: {
                    Success: 10020215,
                },
            },
            {
                id: 10020215,
                next: {
                    Success: 10020221,
                },
            },
            {
                id: 10020221,
                next: {
                    Success: 10020222,
                },
            },
            {
                id: 10020222,
                next: {
                    Success: 10020223,
                },
            },
            {
                id: 10020223,
            },
        ],
    },
    {
        id: 100203,
        name: "群星绮晶",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50508],
        quests: [
            {
                id: 10020301,
                next: {
                    Success: 10020302,
                },
            },
            {
                id: 10020302,
                next: {
                    Success: 10020303,
                },
            },
            {
                id: 10020303,
                next: {
                    Success: 10020304,
                },
            },
            {
                id: 10020304,
                next: {
                    Success: 10020305,
                },
            },
            {
                id: 10020305,
                next: {
                    Success: 10020308,
                },
            },
            {
                id: 10020308,
                next: {
                    Success: 10020310,
                },
            },
            {
                id: 10020310,
                next: {
                    Success: 10020311,
                },
            },
            {
                id: 10020311,
                next: {
                    Success: 10020312,
                },
            },
            {
                id: 10020312,
                next: {
                    Success: 10020313,
                },
            },
            {
                id: 10020313,
                next: {
                    Success: 10020314,
                },
            },
            {
                id: 10020314,
                next: {
                    Success: 10020316,
                },
            },
            {
                id: 10020316,
            },
        ],
    },
    {
        id: 100204,
        name: "门后的秘密",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50509],
        questReward: {
            "10020407": 4000005,
        },
        quests: [
            {
                id: 10020401,
                next: {
                    Success: 10020402,
                },
            },
            {
                id: 10020402,
                next: {
                    Success: 10020403,
                },
            },
            {
                id: 10020403,
                next: {
                    Success: 10020404,
                },
            },
            {
                id: 10020404,
                next: {
                    Success: 10020405,
                },
            },
            {
                id: 10020405,
                next: {
                    Success: 10020406,
                },
            },
            {
                id: 10020406,
                next: {
                    Success: 10020407,
                },
            },
            {
                id: 10020407,
                next: {
                    Success: 10020408,
                },
            },
            {
                id: 10020408,
                next: {
                    Success: 10020409,
                },
            },
            {
                id: 10020409,
                next: {
                    Success: 10020410,
                },
            },
            {
                id: 10020410,
                next: {
                    Success: 10020412,
                },
            },
            {
                id: 10020412,
            },
        ],
    },
    {
        id: 100205,
        name: "猎物与猎人",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50510],
        questReward: {
            "10020505": 4000010,
        },
        quests: [
            {
                id: 10020501,
                next: {
                    Success: 10020502,
                },
            },
            {
                id: 10020502,
                next: {
                    Success: 10020503,
                },
            },
            {
                id: 10020503,
                next: {
                    Success: 10020504,
                },
            },
            {
                id: 10020504,
                next: {
                    Success: 10020505,
                },
            },
            {
                id: 10020505,
                next: {
                    Success: 10020506,
                },
            },
            {
                id: 10020506,
                next: {
                    Success: 10020507,
                },
            },
            {
                id: 10020507,
            },
        ],
    },
    {
        id: 100206,
        name: "长冬望夏",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50512],
        quests: [
            {
                id: 10020602,
                next: {
                    Success: 10020603,
                },
            },
            {
                id: 10020603,
                next: {
                    Success: 10020604,
                },
            },
            {
                id: 10020604,
                next: {
                    Success: 10020605,
                },
            },
            {
                id: 10020605,
                next: {
                    Success: 10020606,
                },
            },
            {
                id: 10020606,
                next: {
                    Success: 10020607,
                },
            },
            {
                id: 10020607,
                next: {
                    Success: 10020608,
                },
            },
            {
                id: 10020608,
                next: {
                    Success: 10020611,
                },
            },
            {
                id: 10020611,
                next: {
                    Success: 10020612,
                },
            },
            {
                id: 10020612,
                next: {
                    Success: 10020613,
                },
            },
            {
                id: 10020613,
                next: {
                    Success: 10020615,
                },
            },
            {
                id: 10020615,
            },
            {
                id: 10020651,
                next: {
                    Success: 10020652,
                },
            },
            {
                id: 10020652,
                next: {
                    Success: 10020602,
                },
            },
        ],
    },
    {
        id: 100207,
        name: "献给一位少女的花束",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50513],
        quests: [
            {
                id: 10020701,
                next: {
                    Success: 10020702,
                },
            },
            {
                id: 10020702,
                next: {
                    Success: 10020703,
                },
            },
            {
                id: 10020703,
                next: {
                    Success: 10020704,
                },
            },
            {
                id: 10020704,
                next: {
                    Success: 10020705,
                },
            },
            {
                id: 10020705,
                next: {
                    Success: 10020706,
                },
            },
            {
                id: 10020706,
                next: {
                    Success: 10020707,
                },
            },
            {
                id: 10020707,
                next: {
                    Success: 10020710,
                },
            },
            {
                id: 10020708,
                next: {
                    Success: 10020709,
                },
            },
            {
                id: 10020709,
            },
            {
                id: 10020710,
                next: {
                    Success: 10020708,
                },
            },
        ],
    },
    {
        id: 100208,
        name: "乘着轻柔的风",
        chapterName: "夜航篇",
        chapterNumber: "第一章",
        episode: "黑铁·白花",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50514],
        quests: [
            {
                id: 10020801,
                next: {
                    Success: 10020802,
                },
            },
            {
                id: 10020802,
                next: {
                    Success: 10020803,
                },
            },
            {
                id: 10020803,
                next: {
                    Success: 10020804,
                },
            },
            {
                id: 10020804,
                next: {
                    Success: 10020806,
                },
            },
            {
                id: 10020806,
                next: {
                    Success: 10020807,
                },
            },
            {
                id: 10020807,
                next: {
                    Success: 10020808,
                },
            },
            {
                id: 10020808,
                next: {
                    Success: 10020809,
                },
            },
            {
                id: 10020809,
                next: {
                    Success: 10020810,
                },
            },
            {
                id: 10020810,
            },
        ],
    },
    {
        id: 100301,
        name: "迷路的孩子",
        chapterName: "夜航篇",
        chapterNumber: "第二章",
        episode: "雪国的孩子",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50521],
        questReward: {
            "10030110": 4000014,
        },
        quests: [
            {
                id: 10030101,
                next: {
                    Success: 10030103,
                },
            },
            {
                id: 10030103,
                next: {
                    Success: 10030104,
                },
            },
            {
                id: 10030104,
                next: {
                    Success: 10030105,
                },
            },
            {
                id: 10030105,
                next: {
                    Success: 10030106,
                },
            },
            {
                id: 10030106,
                next: {
                    Success: 10030107,
                },
            },
            {
                id: 10030107,
                next: {
                    Success: 10030198,
                },
            },
            {
                id: 10030108,
                next: {
                    Success: 10030109,
                },
            },
            {
                id: 10030109,
                next: {
                    Success: 10030110,
                },
            },
            {
                id: 10030110,
                next: {
                    Success: 10030111,
                },
            },
            {
                id: 10030111,
                next: {
                    Success: 10030112,
                },
            },
            {
                id: 10030112,
                next: {
                    Success: 10030113,
                },
            },
            {
                id: 10030113,
                next: {
                    Success: 10030114,
                },
            },
            {
                id: 10030114,
                next: {
                    Success: 10030115,
                },
            },
            {
                id: 10030115,
                next: {
                    Success: 10030116,
                },
            },
            {
                id: 10030116,
            },
            {
                id: 10030197,
                next: {
                    Success: 10030108,
                },
            },
            {
                id: 10030198,
                next: {
                    Success: 10030197,
                },
            },
        ],
    },
    {
        id: 100302,
        name: "不祥的阴翳",
        chapterName: "夜航篇",
        chapterNumber: "第二章",
        episode: "雪国的孩子",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50522],
        questReward: {
            "10030219": 4000015,
        },
        quests: [
            {
                id: 10030201,
                next: {
                    Success: 10030202,
                },
            },
            {
                id: 10030202,
                next: {
                    Success: 10030203,
                },
            },
            {
                id: 10030203,
                next: {
                    Success: 10030205,
                },
            },
            {
                id: 10030205,
                next: {
                    Success: 10030206,
                },
            },
            {
                id: 10030206,
                next: {
                    Success: 10030207,
                },
            },
            {
                id: 10030207,
                next: {
                    Success: 10030208,
                },
            },
            {
                id: 10030208,
                next: {
                    Success: 10030209,
                },
            },
            {
                id: 10030209,
                next: {
                    Success: 10030214,
                },
            },
            {
                id: 10030214,
            },
            {
                id: 10030299,
                next: {
                    Success: 10030201,
                },
            },
        ],
    },
    {
        id: 100303,
        name: "我们的时代",
        chapterName: "夜航篇",
        chapterNumber: "第二章",
        episode: "雪国的孩子",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50523],
        quests: [
            {
                id: 10030301,
            },
            {
                id: 10030394,
                next: {
                    Success: 10030301,
                },
            },
            {
                id: 10030395,
                next: {
                    Success: 10030394,
                },
            },
            {
                id: 10030396,
                next: {
                    Success: 10030395,
                },
            },
            {
                id: 10030397,
                next: {
                    Success: 10030396,
                },
            },
            {
                id: 10030398,
                next: {
                    Success: 10030397,
                },
            },
            {
                id: 10030399,
                next: {
                    Success: 10030398,
                },
            },
        ],
    },
    {
        id: 100304,
        name: "迫近的凛冬",
        chapterName: "夜航篇",
        chapterNumber: "第二章",
        episode: "雪国的孩子",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50524],
        questReward: {
            "10030404": 4000016,
        },
        quests: [
            {
                id: 10030401,
                next: {
                    Success: 10030402,
                },
            },
            {
                id: 10030402,
                next: {
                    Success: 10030403,
                },
            },
            {
                id: 10030403,
                next: {
                    Success: 10030404,
                },
            },
            {
                id: 10030404,
                next: {
                    Success: 10030405,
                },
            },
            {
                id: 10030405,
            },
            {
                id: 10030498,
                next: {
                    Success: 10030499,
                },
            },
            {
                id: 10030499,
                next: {
                    Success: 10030401,
                },
            },
        ],
    },
    {
        id: 100305,
        name: "朱红的大地",
        chapterName: "夜航篇",
        chapterNumber: "第二章",
        episode: "雪国的孩子",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50525],
        quests: [
            {
                id: 10030501,
                next: {
                    Success: 10030502,
                },
            },
            {
                id: 10030502,
                next: {
                    Success: 10030503,
                },
            },
            {
                id: 10030503,
                next: {
                    Success: 10030504,
                },
            },
            {
                id: 10030504,
                next: {
                    Success: 10030505,
                },
            },
            {
                id: 10030505,
                next: {
                    Success: 10030506,
                },
            },
            {
                id: 10030506,
                next: {
                    Success: 10030507,
                },
            },
            {
                id: 10030507,
                next: {
                    Success: 10030508,
                },
            },
            {
                id: 10030508,
                next: {
                    Success: 10030509,
                },
            },
            {
                id: 10030509,
                next: {
                    Success: 10030510,
                },
            },
            {
                id: 10030510,
                next: {
                    Success: 10030511,
                },
            },
            {
                id: 10030511,
                next: {
                    Success: 10030512,
                },
            },
            {
                id: 10030512,
            },
        ],
    },
    {
        id: 100306,
        name: "无垢的心脏",
        chapterName: "夜航篇",
        chapterNumber: "第二章",
        episode: "雪国的孩子",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50526],
        quests: [
            {
                id: 10030601,
            },
        ],
    },
    {
        id: 100307,
        name: "致无名者的安魂曲",
        chapterName: "夜航篇",
        chapterNumber: "第二章",
        episode: "雪国的孩子",
        type: 1,
        main: 1,
        icon: "T_Chapter_Icon01",
        reward: [50527],
        quests: [
            {
                id: 10030701,
                next: {
                    Success: 10030702,
                },
            },
            {
                id: 10030702,
            },
        ],
    },
    {
        id: 110101,
        name: "尘沙的另一岸",
        chapterName: "泊暮篇",
        chapterNumber: "第一章",
        episode: "俯瞰者的游戏",
        type: 1,
        main: 2,
        icon: "T_Chapter_Icon02",
        reward: [50515],
        quests: [
            {
                id: 11010101,
                next: {
                    Success: 11010104,
                },
            },
            {
                id: 11010103,
                next: {
                    Success: 11010101,
                },
            },
            {
                id: 11010104,
                next: {
                    Success: 11010106,
                },
            },
            {
                id: 11010106,
                next: {
                    Success: 11010107,
                },
            },
            {
                id: 11010107,
                next: {
                    Success: 11010108,
                },
            },
            {
                id: 11010108,
                next: {
                    Success: 11010109,
                },
            },
            {
                id: 11010109,
            },
        ],
    },
    {
        id: 110103,
        name: "动力心脏",
        chapterName: "泊暮篇",
        chapterNumber: "第一章",
        episode: "俯瞰者的游戏",
        type: 1,
        main: 2,
        icon: "T_Chapter_Icon02",
        reward: [50516],
        quests: [
            {
                id: 11010301,
                next: {
                    Success: 11010311,
                },
            },
            {
                id: 11010303,
                next: {
                    Success: 11010312,
                },
            },
            {
                id: 11010305,
                next: {
                    Success: 11010306,
                },
            },
            {
                id: 11010306,
                next: {
                    Success: 11010309,
                },
            },
            {
                id: 11010307,
                next: {
                    Success: 11010303,
                },
            },
            {
                id: 11010308,
            },
            {
                id: 11010309,
                next: {
                    Success: 11010308,
                },
            },
            {
                id: 11010311,
                next: {
                    Success: 11010314,
                },
            },
            {
                id: 11010312,
                next: {
                    Success: 11010313,
                },
            },
            {
                id: 11010313,
                next: {
                    Success: 11010305,
                },
            },
            {
                id: 11010314,
                next: {
                    Success: 11010307,
                },
            },
        ],
    },
    {
        id: 110105,
        name: "枪炮与菟丝花",
        chapterName: "泊暮篇",
        chapterNumber: "第一章",
        episode: "俯瞰者的游戏",
        type: 1,
        main: 2,
        icon: "T_Chapter_Icon02",
        reward: [50517],
        quests: [
            {
                id: 11010501,
                next: {
                    Success: 11010525,
                },
            },
            {
                id: 11010502,
                next: {
                    Success: 11010520,
                },
            },
            {
                id: 11010505,
                next: {
                    Success: 11010518,
                },
            },
            {
                id: 11010507,
                next: {
                    Success: 11010509,
                },
            },
            {
                id: 11010509,
                next: {
                    Success: 11010510,
                },
            },
            {
                id: 11010510,
                next: {
                    Success: 11010521,
                },
            },
            {
                id: 11010511,
                next: {
                    Success: 11010528,
                },
            },
            {
                id: 11010512,
                next: {
                    Success: 11010513,
                },
            },
            {
                id: 11010513,
                next: {
                    Success: 11010514,
                },
            },
            {
                id: 11010514,
                next: {
                    Success: 11010519,
                },
            },
            {
                id: 11010515,
                next: {
                    Success: 11010516,
                },
            },
            {
                id: 11010516,
            },
            {
                id: 11010518,
                next: {
                    Success: 11010524,
                },
            },
            {
                id: 11010519,
                next: {
                    Success: 11010515,
                },
            },
            {
                id: 11010520,
                next: {
                    Success: 11010507,
                },
            },
            {
                id: 11010521,
                next: {
                    Success: 11010522,
                },
            },
            {
                id: 11010522,
                next: {
                    Success: 11010523,
                },
            },
            {
                id: 11010523,
                next: {
                    Success: 11010526,
                },
            },
            {
                id: 11010524,
                next: {
                    Success: 11010502,
                },
            },
            {
                id: 11010525,
                next: {
                    Success: 11010505,
                },
            },
            {
                id: 11010526,
                next: {
                    Success: 11010511,
                },
            },
            {
                id: 11010527,
                next: {
                    Success: 11010529,
                },
            },
            {
                id: 11010528,
                next: {
                    Success: 11010527,
                },
            },
            {
                id: 11010529,
                next: {
                    Success: 11010512,
                },
            },
        ],
    },
    {
        id: 110107,
        name: "俯瞰者们",
        chapterName: "泊暮篇",
        chapterNumber: "第一章",
        episode: "俯瞰者的游戏",
        type: 1,
        main: 2,
        icon: "T_Chapter_Icon02",
        reward: [50518],
        questReward: {
            "11010706": 4000011,
        },
        quests: [
            {
                id: 11010702,
                next: {
                    Success: 11010705,
                },
            },
            {
                id: 11010704,
                next: {
                    Success: 11010706,
                },
            },
            {
                id: 11010705,
                next: {
                    Success: 11010704,
                },
            },
            {
                id: 11010706,
            },
        ],
    },
    {
        id: 110108,
        name: "死或生",
        chapterName: "泊暮篇",
        chapterNumber: "第一章",
        episode: "俯瞰者的游戏",
        type: 1,
        main: 2,
        icon: "T_Chapter_Icon02",
        reward: [50519],
        quests: [
            {
                id: 11010801,
                next: {
                    Success: 11010802,
                },
            },
            {
                id: 11010802,
                next: {
                    Success: 11010804,
                },
            },
            {
                id: 11010804,
                next: {
                    Success: 11010816,
                },
            },
            {
                id: 11010808,
                next: {
                    Success: 11010809,
                },
            },
            {
                id: 11010809,
                next: {
                    Success: 11010815,
                },
            },
            {
                id: 11010810,
                next: {
                    Success: 11010813,
                },
            },
            {
                id: 11010812,
                next: {
                    Success: 11010814,
                },
            },
            {
                id: 11010813,
                next: {
                    Success: 11010812,
                },
            },
            {
                id: 11010814,
                next: {
                    Success: 11010801,
                },
            },
            {
                id: 11010815,
                next: {
                    Success: 11010810,
                },
            },
            {
                id: 11010816,
            },
        ],
    },
    {
        id: 110109,
        name: "审判日",
        chapterName: "泊暮篇",
        chapterNumber: "第一章",
        episode: "俯瞰者的游戏",
        type: 1,
        main: 2,
        icon: "T_Chapter_Icon02",
        reward: [50520],
        quests: [
            {
                id: 11010902,
                next: {
                    Success: 11010907,
                },
            },
            {
                id: 11010903,
                next: {
                    Success: 11010904,
                },
            },
            {
                id: 11010904,
                next: {
                    Success: 11010910,
                },
            },
            {
                id: 11010905,
                next: {
                    Success: 11010906,
                },
            },
            {
                id: 11010906,
                next: {
                    Success: 11010909,
                },
            },
            {
                id: 11010907,
                next: {
                    Success: 11010908,
                },
            },
            {
                id: 11010908,
                next: {
                    Success: 11010903,
                },
            },
            {
                id: 11010909,
            },
            {
                id: 11010910,
                next: {
                    Success: 11010905,
                },
            },
        ],
    },
    {
        id: 120001,
        name: "爱乐之城",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 6,
        icon: "T_Chapter_Icon03",
        reward: [50528],
        startTime: 1765159200,
        endTime: 8204788800,
        quests: [
            {
                id: 12000101,
                next: {
                    Success: 12000102,
                },
            },
            {
                id: 12000102,
                next: {
                    Success: 12000103,
                },
            },
            {
                id: 12000103,
                next: {
                    Success: 12000104,
                },
            },
            {
                id: 12000104,
            },
        ],
    },
    {
        id: 120002,
        name: "异乡来客",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 6,
        icon: "T_Chapter_Icon03",
        reward: [50529],
        startTime: 1765159200,
        endTime: 8204788800,
        quests: [
            {
                id: 12000201,
                next: {
                    Success: 12000202,
                },
            },
            {
                id: 12000202,
                next: {
                    Success: 12000203,
                },
            },
            {
                id: 12000203,
                next: {
                    Success: 12000204,
                },
            },
            {
                id: 12000204,
                next: {
                    Success: 12000205,
                },
            },
            {
                id: 12000205,
                next: {
                    Success: 12000206,
                },
            },
            {
                id: 12000206,
                next: {
                    Success: 12000207,
                },
            },
            {
                id: 12000207,
                next: {
                    Success: 12000208,
                },
            },
            {
                id: 12000208,
                next: {
                    Success: 12000209,
                },
            },
            {
                id: 12000209,
            },
        ],
    },
    {
        id: 120003,
        name: "《寻物启事》",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 6,
        icon: "T_Chapter_Icon03",
        reward: [50530],
        startTime: 1766455200,
        endTime: 8204788800,
        quests: [
            {
                id: 12000301,
                next: {
                    Success: 12000302,
                },
            },
            {
                id: 12000302,
                next: {
                    Success: 12000303,
                },
            },
            {
                id: 12000303,
                next: {
                    Success: 12000304,
                },
            },
            {
                id: 12000304,
                next: {
                    Success: 12000305,
                },
            },
            {
                id: 12000305,
                next: {
                    Success: 12000306,
                },
            },
            {
                id: 12000306,
                next: {
                    Success: 12000307,
                },
            },
            {
                id: 12000307,
                next: {
                    Success: 12000308,
                },
            },
            {
                id: 12000308,
            },
        ],
    },
    {
        id: 120101,
        name: "初谒华胥",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津掠影蔽香尘",
        type: 1,
        icon: "T_Chapter_Icon03",
        reward: [50532],
        quests: [
            {
                id: 12010101,
                next: {
                    Success: 12010102,
                },
            },
            {
                id: 12010102,
                next: {
                    Success: 12010103,
                },
            },
            {
                id: 12010103,
                next: {
                    Success: 12010104,
                },
            },
            {
                id: 12010104,
                next: {
                    Success: 12010105,
                },
            },
            {
                id: 12010105,
                next: {
                    Success: 12010106,
                },
            },
            {
                id: 12010106,
                next: {
                    Success: 12010107,
                },
            },
            {
                id: 12010107,
                next: {
                    Success: 12010108,
                },
            },
            {
                id: 12010108,
                next: {
                    Success: 12010109,
                },
            },
            {
                id: 12010109,
                next: {
                    Success: 12010110,
                },
            },
            {
                id: 12010110,
                next: {
                    Success: 12010111,
                },
            },
            {
                id: 12010111,
                next: {
                    Success: 12010112,
                },
            },
            {
                id: 12010112,
            },
        ],
    },
    {
        id: 120102,
        name: "潮逢应天",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津掠影蔽香尘",
        type: 1,
        icon: "T_Chapter_Icon03",
        reward: [50533],
        quests: [
            {
                id: 12010201,
                next: {
                    Success: 12010203,
                },
            },
            {
                id: 12010203,
                next: {
                    Success: 12010204,
                },
            },
            {
                id: 12010204,
                next: {
                    Success: 12010205,
                },
            },
            {
                id: 12010205,
                next: {
                    Success: 12010206,
                },
            },
            {
                id: 12010206,
                next: {
                    Success: 12010250,
                },
            },
            {
                id: 12010207,
                next: {
                    Success: 12010208,
                },
            },
            {
                id: 12010208,
                next: {
                    Success: 12010253,
                },
            },
            {
                id: 12010209,
                next: {
                    Success: 12010252,
                },
            },
            {
                id: 12010210,
                next: {
                    Success: 12010211,
                },
            },
            {
                id: 12010211,
                next: {
                    Success: 12010212,
                },
            },
            {
                id: 12010212,
                next: {
                    Success: 12010213,
                },
            },
            {
                id: 12010213,
                next: {
                    Success: 12010214,
                },
            },
            {
                id: 12010214,
            },
            {
                id: 12010250,
                next: {
                    Success: 12010254,
                },
            },
            {
                id: 12010251,
                next: {
                    Success: 12010210,
                },
            },
            {
                id: 12010252,
                next: {
                    Success: 12010251,
                },
            },
            {
                id: 12010253,
                next: {
                    Success: 12010209,
                },
            },
            {
                id: 12010254,
                next: {
                    Success: 12010207,
                },
            },
        ],
    },
    {
        id: 120103,
        name: "群玄啸鸣",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津掠影蔽香尘",
        type: 1,
        icon: "T_Chapter_Icon03",
        reward: [50534],
        questReward: {
            "12010306": 4000017,
        },
        quests: [
            {
                id: 12010301,
                next: {
                    Success: 12010302,
                },
            },
            {
                id: 12010302,
                next: {
                    Success: 12010303,
                },
            },
            {
                id: 12010303,
                next: {
                    Success: 12010304,
                },
            },
            {
                id: 12010304,
                next: {
                    Success: 12010306,
                },
            },
            {
                id: 12010306,
                next: {
                    Success: 12010307,
                },
            },
            {
                id: 12010307,
                next: {
                    Success: 12010308,
                },
            },
            {
                id: 12010308,
                next: {
                    Success: 12010322,
                },
            },
            {
                id: 12010309,
                next: {
                    Success: 12010351,
                },
            },
            {
                id: 12010310,
                next: {
                    Success: 12010311,
                },
            },
            {
                id: 12010311,
                next: {
                    Success: 12010312,
                },
            },
            {
                id: 12010312,
                next: {
                    Success: 12010313,
                },
            },
            {
                id: 12010313,
                next: {
                    Success: 12010314,
                },
            },
            {
                id: 12010314,
                next: {
                    Success: 12010320,
                },
            },
            {
                id: 12010315,
                next: {
                    Success: 12010316,
                },
            },
            {
                id: 12010316,
                next: {
                    扶疏: 12010317,
                    虬先生: 12010318,
                },
            },
            {
                id: 12010317,
            },
            {
                id: 12010318,
            },
            {
                id: 12010320,
                next: {
                    Success: 12010315,
                },
            },
            {
                id: 12010322,
                next: {
                    Success: 12010309,
                },
            },
            {
                id: 12010351,
                next: {
                    Success: 12010352,
                },
            },
            {
                id: 12010352,
                next: {
                    Success: 12010310,
                },
            },
        ],
    },
    {
        id: 120104,
        name: "忘川照影",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津掠影蔽香尘",
        type: 1,
        icon: "T_Chapter_Icon03",
        reward: [50535],
        quests: [
            {
                id: 12010401,
                next: {
                    Success: 12010402,
                },
            },
            {
                id: 12010402,
                next: {
                    Success: 12010403,
                },
            },
            {
                id: 12010403,
                next: {
                    Success: 12010404,
                },
            },
            {
                id: 12010404,
                next: {
                    Success: 12010405,
                },
            },
            {
                id: 12010405,
                next: {
                    Success: 12010406,
                },
            },
            {
                id: 12010406,
                next: {
                    Success: 12010407,
                },
            },
            {
                id: 12010407,
                next: {
                    Success: 12010408,
                },
            },
            {
                id: 12010408,
                next: {
                    Success: 12010409,
                },
            },
            {
                id: 12010409,
                next: {
                    Success: 12010411,
                },
            },
            {
                id: 12010411,
                next: {
                    Success: 12010412,
                },
            },
            {
                id: 12010412,
                next: {
                    Success: 12010413,
                },
            },
            {
                id: 12010413,
                next: {
                    Success: 12010414,
                },
            },
            {
                id: 12010414,
                next: {
                    Success: 12010415,
                },
            },
            {
                id: 12010415,
                next: {
                    Success: 12010416,
                },
            },
            {
                id: 12010416,
                next: {
                    Success: 12010417,
                },
            },
            {
                id: 12010417,
                next: {
                    Success: 12010418,
                },
            },
            {
                id: 12010418,
                next: {
                    Success: 12010419,
                },
            },
            {
                id: 12010419,
                next: {
                    Success: 12010420,
                },
            },
            {
                id: 12010420,
            },
        ],
    },
    {
        id: 120105,
        name: "诡原惊鸦",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津掠影蔽香尘",
        type: 1,
        icon: "T_Chapter_Icon03",
        reward: [50536],
        quests: [
            {
                id: 12010501,
                next: {
                    Success: 12010502,
                },
            },
            {
                id: 12010502,
                next: {
                    Success: 12010503,
                },
            },
            {
                id: 12010503,
                next: {
                    Success: 12010504,
                },
            },
            {
                id: 12010504,
                next: {
                    Success: 12010517,
                },
            },
            {
                id: 12010513,
                next: {
                    Success: 12010514,
                },
            },
            {
                id: 12010514,
                next: {
                    Success: 12010515,
                },
            },
            {
                id: 12010515,
                next: {
                    Success: 12010516,
                },
            },
            {
                id: 12010516,
            },
            {
                id: 12010517,
                next: {
                    Success: 12010518,
                },
            },
            {
                id: 12010518,
                next: {
                    Success: 12010519,
                },
            },
            {
                id: 12010519,
                next: {
                    Success: 12010513,
                },
            },
        ],
    },
    {
        id: 120106,
        name: "神渎天倾",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津掠影蔽香尘",
        type: 1,
        icon: "T_Chapter_Icon03",
        reward: [50537],
        quests: [
            {
                id: 12010601,
                next: {
                    Success: 12010602,
                },
            },
            {
                id: 12010602,
                next: {
                    Success: 12010603,
                },
            },
            {
                id: 12010603,
                next: {
                    Success: 12010604,
                },
            },
            {
                id: 12010604,
                next: {
                    Success: 12010605,
                },
            },
            {
                id: 12010605,
                next: {
                    Success: 12010606,
                },
            },
            {
                id: 12010606,
                next: {
                    Success: 12010607,
                },
            },
            {
                id: 12010607,
                next: {
                    Success: 12010608,
                },
            },
            {
                id: 12010608,
            },
        ],
    },
    {
        id: 120111,
        name: "出发，去往书本外的世界",
        chapterName: "世界纪游",
        chapterNumber: "海伯利亚",
        episode: "夜莺飞往彩色的梦",
        type: 6,
        icon: "T_Chapter_Icon03",
        reward: [50592],
        startTime: 1764036000,
        quests: [
            {
                id: 12011101,
                next: {
                    Success: 12011102,
                },
            },
            {
                id: 12011102,
                next: {
                    Success: 12011103,
                },
            },
            {
                id: 12011103,
                next: {
                    Success: 12011105,
                },
            },
            {
                id: 12011105,
                next: {
                    Success: 12011106,
                },
            },
            {
                id: 12011106,
                next: {
                    完成副本: 12011107,
                    未完成副本: 12011110,
                },
            },
            {
                id: 12011107,
                next: {
                    Success: 12011108,
                },
            },
            {
                id: 12011108,
                next: {
                    Success: 12011109,
                },
            },
            {
                id: 12011109,
            },
            {
                id: 12011110,
                next: {
                    Success: 12011107,
                },
            },
            {
                id: 12011150,
                next: {
                    Success: 12011101,
                },
            },
        ],
    },
    {
        id: 120112,
        name: "旧朋友，新故事",
        chapterName: "世界纪游",
        chapterNumber: "海伯利亚",
        episode: "夜莺飞往彩色的梦",
        type: 6,
        icon: "T_Chapter_Icon03",
        reward: [50593],
        startTime: 1764122400,
        quests: [
            {
                id: 12011201,
                next: {
                    Success: 12011202,
                },
            },
            {
                id: 12011202,
                next: {
                    Success: 12011203,
                },
            },
            {
                id: 12011203,
                next: {
                    Success: 12011204,
                },
            },
            {
                id: 12011204,
                next: {
                    完成副本: 12011205,
                    未完成副本: 12011210,
                },
            },
            {
                id: 12011205,
                next: {
                    Success: 12011206,
                },
            },
            {
                id: 12011206,
                next: {
                    Success: 12011207,
                },
            },
            {
                id: 12011207,
            },
            {
                id: 12011210,
                next: {
                    Success: 12011205,
                },
            },
            {
                id: 12011250,
                next: {
                    Success: 12011201,
                },
            },
        ],
    },
    {
        id: 120113,
        name: "不期而遇的特别委托",
        chapterName: "世界纪游",
        chapterNumber: "海伯利亚",
        episode: "夜莺飞往彩色的梦",
        type: 6,
        icon: "T_Chapter_Icon03",
        reward: [50594],
        startTime: 1764208800,
        quests: [
            {
                id: 12011301,
                next: {
                    Success: 12011302,
                },
            },
            {
                id: 12011302,
                next: {
                    Success: 12011303,
                },
            },
            {
                id: 12011303,
                next: {
                    Success: 12011305,
                },
            },
            {
                id: 12011305,
                next: {
                    Success: 12011306,
                },
            },
            {
                id: 12011306,
                next: {
                    完成副本: 12011308,
                    未完成副本: 12011307,
                },
            },
            {
                id: 12011307,
                next: {
                    Success: 12011308,
                },
            },
            {
                id: 12011308,
            },
            {
                id: 12011350,
                next: {
                    Success: 12011301,
                },
            },
        ],
    },
    {
        id: 120114,
        name: "小夜莺，向明天展翅吧",
        chapterName: "世界纪游",
        chapterNumber: "海伯利亚",
        episode: "夜莺飞往彩色的梦",
        type: 6,
        icon: "T_Chapter_Icon03",
        reward: [50595],
        startTime: 1764295200,
        quests: [
            {
                id: 12011401,
                next: {
                    Success: 12011403,
                },
            },
            {
                id: 12011403,
                next: {
                    Success: 12011404,
                },
            },
            {
                id: 12011404,
                next: {
                    Success: 12011405,
                },
            },
            {
                id: 12011405,
                next: {
                    Success: 12011406,
                },
            },
            {
                id: 12011406,
                next: {
                    Success: 12011407,
                },
            },
            {
                id: 12011407,
                next: {
                    Success: 12011408,
                },
            },
            {
                id: 12011408,
                next: {
                    Success: 12011409,
                },
            },
            {
                id: 12011409,
                next: {
                    Success: 12011410,
                },
            },
            {
                id: 12011410,
                next: {
                    Success: 12011411,
                },
            },
            {
                id: 12011411,
                next: {
                    Success: 12011415,
                },
            },
            {
                id: 12011412,
                next: {
                    Success: 12011413,
                },
            },
            {
                id: 12011413,
                next: {
                    完成副本: 12011414,
                    未完成副本: 12011420,
                },
            },
            {
                id: 12011414,
            },
            {
                id: 12011415,
                next: {
                    Success: 12011412,
                },
            },
            {
                id: 12011420,
                next: {
                    Success: 12011414,
                },
            },
            {
                id: 12011450,
                next: {
                    Success: 12011401,
                },
            },
        ],
    },
    {
        id: 200101,
        name: "流浪的皎皎",
        chapterName: "夜航篇",
        episode: "流浪的皎皎",
        type: 4,
        reward: [50550],
        questReward: {
            "20010102": 4000018,
        },
        quests: [
            {
                id: 20010101,
                next: {
                    Success: 20010102,
                },
            },
            {
                id: 20010102,
                next: {
                    Success: 20010103,
                },
            },
            {
                id: 20010103,
                next: {
                    Success: 20010104,
                },
            },
            {
                id: 20010104,
                next: {
                    Success: 20010105,
                },
            },
            {
                id: 20010105,
            },
        ],
    },
    {
        id: 200102,
        name: "花期未至",
        chapterName: "夜航篇",
        episode: "花期未至",
        type: 1,
        main: 1,
        reward: [50551],
        quests: [
            {
                id: 20010201,
                next: {
                    Success: 20010202,
                },
            },
            {
                id: 20010202,
                next: {
                    Success: 20010203,
                },
            },
            {
                id: 20010203,
                next: {
                    Success: 20010204,
                },
            },
            {
                id: 20010204,
                next: {
                    Success: 20010205,
                },
            },
            {
                id: 20010205,
            },
        ],
    },
    {
        id: 200103,
        name: "魔灵啊魔灵",
        chapterName: "夜航篇",
        episode: "魔灵啊魔灵",
        type: 4,
        reward: [50577],
        quests: [
            {
                id: 20010301,
                next: {
                    Success: 20010302,
                },
            },
            {
                id: 20010302,
                next: {
                    Success: 20010303,
                },
            },
            {
                id: 20010303,
                next: {
                    Success: 20010304,
                },
            },
            {
                id: 20010304,
                next: {
                    Success: 20010305,
                },
            },
            {
                id: 20010305,
                next: {
                    Success: 20010306,
                },
            },
            {
                id: 20010306,
            },
        ],
    },
    {
        id: 200104,
        name: "我可以养它吗",
        chapterName: "夜航篇",
        episode: "我可以养它吗",
        type: 4,
        reward: [50578],
        quests: [
            {
                id: 20010401,
                next: {
                    Success: 20010409,
                },
            },
            {
                id: 20010402,
                next: {
                    Success: 20010403,
                },
            },
            {
                id: 20010403,
                next: {
                    Success: 20010404,
                },
            },
            {
                id: 20010404,
                next: {
                    Success: 20010405,
                },
            },
            {
                id: 20010405,
                next: {
                    Success: 20010406,
                },
            },
            {
                id: 20010406,
                next: {
                    Success: 20010407,
                },
            },
            {
                id: 20010407,
                next: {
                    Success: 20010410,
                },
            },
            {
                id: 20010408,
            },
            {
                id: 20010409,
                next: {
                    Success: 20010402,
                },
            },
            {
                id: 20010410,
                next: {
                    Success: 20010415,
                },
            },
            {
                id: 20010415,
                next: {
                    Success: 20010408,
                },
            },
        ],
    },
    {
        id: 200201,
        name: "归来之人",
        chapterName: "夜航篇",
        episode: "归来之人",
        desc: "留意莎莉口中的“夫人”",
        detail: "莎莉婶婶似乎是因某位夫人的事情感到烦恼，遇见这位夫人的话，或许可以留意一下。",
        type: 3,
        reward: [50552],
        npc: 700020,
        quests: [
            {
                id: 20020100,
                next: {
                    Success: 20020102,
                },
            },
            {
                id: 20020102,
                next: {
                    Success: 20020104,
                },
            },
            {
                id: 20020104,
                next: {
                    Success: 20020105,
                },
            },
            {
                id: 20020105,
                next: {
                    "【分支2.1】（隐瞒在矿坑中得到的日记）": 20020106,
                    "【分支2.2】（交出在矿坑中得到的日记）": 20020107,
                },
            },
            {
                id: 20020106,
            },
            {
                id: 20020107,
            },
        ],
    },
    {
        id: 200203,
        name: "消失的少女",
        chapterName: "夜航篇",
        episode: "消失的少女",
        desc: "帮爱尔莎寻找女儿安妮",
        detail: "爱尔莎夫人的独女安妮失踪了。\n在冰湖城闲逛的时候，留意一下有没有疑似安妮的人吧。",
        type: 3,
        reward: [50554],
        npc: 700006,
        quests: [
            {
                id: 20020300,
                next: {
                    Success: 20020312,
                },
            },
            {
                id: 20020302,
                next: {
                    Success: 20020314,
                },
            },
            {
                id: 20020303,
                next: {
                    Success: 20020305,
                },
            },
            {
                id: 20020305,
                next: {
                    Success: 20020306,
                },
            },
            {
                id: 20020306,
                next: {
                    "（不展示爱丽丝的日记）222": 20020319,
                    "（展示爱丽丝的日记）111": 20020320,
                },
            },
            {
                id: 20020309,
            },
            {
                id: 20020310,
            },
            {
                id: 20020312,
                next: {
                    Success: 20020313,
                },
            },
            {
                id: 20020313,
                next: {
                    Success: 20020302,
                },
            },
            {
                id: 20020314,
                next: {
                    Success: 20020303,
                },
            },
            {
                id: 20020319,
                next: {
                    Success: 20020309,
                },
            },
            {
                id: 20020320,
                next: {
                    Success: 20020310,
                },
            },
        ],
    },
    {
        id: 200204,
        name: "停摆的钟",
        chapterName: "夜航篇",
        episode: "停摆的钟",
        desc: "完成任意狩月人委托（可通过委托界面接取）",
        detail: "答应了威尔斯的邀请。\n和他一起出一次委托任务。",
        type: 3,
        reward: [50555],
        npc: 200015,
        quests: [
            {
                id: 20020400,
                next: {
                    Success: 20020403,
                },
            },
            {
                id: 20020403,
                next: {
                    Success: 20020404,
                },
            },
            {
                id: 20020404,
                next: {
                    Success: 20020405,
                },
            },
            {
                id: 20020405,
            },
        ],
    },
    {
        id: 200205,
        name: "海的另一端 ",
        chapterName: "夜航篇",
        episode: "海的另一端 ",
        desc: "前往净界岛",
        detail: "经过交谈，你知道布鲁内托和你一样来自净界岛，年轻时的他向往着外面的世界，在好奇心的驱使下，乘着渔船来到了帝国，可谁知这一来便让他永远失去了重返故乡的机会，落魄到只能靠行骗生活。\n你向他讲起净界岛的变故，勾起了他那挥之不去的乡愁。有机会的话，代替他重回净界岛，看看他的老房子，带点故乡的东西给他吧。",
        type: 3,
        reward: [50556],
        npc: 700048,
        quests: [
            {
                id: 20020501,
                next: {
                    Success: 20020503,
                },
            },
            {
                id: 20020503,
                next: {
                    Success: 20020504,
                },
            },
            {
                id: 20020504,
                next: {
                    Success: 20020505,
                },
            },
            {
                id: 20020505,
                next: {
                    Success: 20020507,
                },
            },
            {
                id: 20020506,
            },
            {
                id: 20020507,
                next: {
                    Success: 20020508,
                },
            },
            {
                id: 20020508,
                next: {
                    Success: 20020512,
                },
            },
            {
                id: 20020509,
                next: {
                    Success: 20020510,
                },
            },
            {
                id: 20020510,
                next: {
                    Success: 20020506,
                },
            },
            {
                id: 20020512,
                next: {
                    Success: 20020509,
                },
            },
        ],
    },
    {
        id: 200206,
        name: "灵感飞贼",
        chapterName: "夜航篇",
        episode: "灵感飞贼",
        desc: "与巴克交谈",
        detail: "身为剧作家的巴克先生不吝啬在每一句话中添加繁多的修辞，这正体现了他身为专业剧作家的文学素养。\n不过此时，巴克先生更需要一位专业的翻译，去听听他在说什么吧。",
        type: 3,
        reward: [50557],
        npc: 200003,
        quests: [
            {
                id: 20020600,
                next: {
                    Success: 20020603,
                },
            },
            {
                id: 20020603,
                next: {
                    Success: 20020605,
                },
            },
            {
                id: 20020605,
                next: {
                    Success: 20020609,
                },
            },
            {
                id: 20020606,
                next: {
                    Success: 20020607,
                },
            },
            {
                id: 20020607,
                next: {
                    Success: 20020608,
                },
            },
            {
                id: 20020608,
            },
            {
                id: 20020609,
                next: {
                    Success: 20020606,
                },
            },
        ],
    },
    {
        id: 200207,
        name: "你所牵挂的",
        chapterName: "夜航篇",
        episode: "你所牵挂的",
        desc: "与艾玛交谈",
        detail: "为纪念碑献花的学生艾玛似乎总有些心不在焉的，趁她现在独自一人在发呆，去问问发生了什么吧。",
        type: 3,
        reward: [50558],
        npc: 700086,
        quests: [
            {
                id: 20020700,
                next: {
                    Success: 20020702,
                },
            },
            {
                id: 20020702,
                next: {
                    Success: 20020703,
                },
            },
            {
                id: 20020703,
                next: {
                    Success: 20020704,
                },
            },
            {
                id: 20020704,
                next: {
                    Success: 20020705,
                },
            },
            {
                id: 20020705,
                next: {
                    Success: 20020707,
                },
            },
            {
                id: 20020706,
            },
            {
                id: 20020707,
                next: {
                    Success: 20020706,
                },
            },
        ],
    },
    {
        id: 200208,
        name: "最后的契约",
        chapterName: "夜航篇",
        episode: "你好，冰湖城",
        type: 3,
        reward: [50559],
        quests: [
            {
                id: 20020802,
                next: {
                    Success: 20020803,
                },
            },
            {
                id: 20020803,
            },
        ],
    },
    {
        id: 200209,
        name: "危险的药方",
        chapterName: "夜航篇",
        episode: "你好，冰湖城",
        type: 3,
        reward: [50560],
        quests: [
            {
                id: 20020901,
                next: {
                    Success: 20020902,
                },
            },
            {
                id: 20020902,
                next: {
                    选项12: 20020903,
                    选项3: 20020904,
                },
            },
            {
                id: 20020903,
                next: {
                    Success: 20020905,
                },
            },
            {
                id: 20020904,
                next: {
                    Success: 20020905,
                },
            },
            {
                id: 20020905,
                next: {
                    Success: 20020906,
                },
            },
            {
                id: 20020906,
            },
        ],
    },
    {
        id: 200210,
        name: "下水道的枯木",
        chapterName: "夜航篇",
        episode: "下水道的枯木",
        type: 3,
        reward: [50561],
        quests: [
            {
                id: 20021001,
                next: {
                    Success: 20021002,
                },
            },
            {
                id: 20021002,
                next: {
                    Success: 20021003,
                },
            },
            {
                id: 20021003,
                next: {
                    Success: 20021004,
                },
            },
            {
                id: 20021004,
            },
            {
                id: 20021007,
                next: {
                    Success: 20021001,
                },
            },
        ],
    },
    {
        id: 200211,
        name: "看不见的角",
        chapterName: "夜航篇",
        episode: "看不见的角",
        desc: "与费伊交谈",
        detail: "冰湖城里似乎有一位将自己误认为卡戎之民的索拉女孩，去看看到底是怎么回事吧。",
        type: 3,
        reward: [50562],
        npc: 700012,
        quests: [
            {
                id: 20021100,
                next: {
                    Success: 20021101,
                },
            },
            {
                id: 20021101,
                next: {
                    Success: 20021102,
                },
            },
            {
                id: 20021102,
                next: {
                    Success: 20021103,
                },
            },
            {
                id: 20021103,
                next: {
                    Success: 20021104,
                },
            },
            {
                id: 20021104,
                next: {
                    Success: 20021105,
                },
            },
            {
                id: 20021105,
            },
        ],
    },
    {
        id: 200212,
        name: "“血石”",
        chapterName: "夜航篇",
        episode: "“血石”",
        desc: "向凯文报告",
        detail: "你在冰湖城发现了一位神色紧张的矿工，他身边装满矿石的麻袋上似乎沾染着可疑的血迹。\n你感觉事情有些不对劲，或许把这件事报告给位于冰湖城门口的卫戍部队成员凯文比较稳妥。",
        type: 3,
        reward: [50563],
        npc: 700113,
        quests: [
            {
                id: 20021200,
                next: {
                    Success: 20021205,
                },
            },
            {
                id: 20021202,
                next: {
                    Success: 20021203,
                },
            },
            {
                id: 20021203,
            },
            {
                id: 20021205,
                next: {
                    Success: 20021206,
                },
            },
            {
                id: 20021206,
                next: {
                    分支1: 20021207,
                    分支2: 20021202,
                },
            },
            {
                id: 20021207,
            },
        ],
    },
    {
        id: 200213,
        name: "你好，冰湖城",
        chapterName: "夜航篇",
        episode: "你好，冰湖城",
        desc: "调查玛尔洁的三件“宝物”背后的故事",
        detail: "就如玛尔洁所说的那样，最不值钱的东西往往也是最值钱的，这些大街小巷随处可见的垃圾桶中似乎也藏着许多不为人知的故事。\n玛尔洁交给你的“一张药方”、“一大盒纸星星”和“一把钥匙”像是一枚枚路标，各自指向属于自己的终点。事不宜迟，快沿着这些线索的痕迹去调查看看它们背后的故事吧！",
        type: 3,
        reward: [50564],
        questReward: {
            "20021300": 4000001,
        },
        npc: 700115,
        quests: [
            {
                id: 20021300,
                next: {
                    Success: 20021301,
                },
            },
            {
                id: 20021301,
                next: {
                    Success: 20021302,
                },
            },
            {
                id: 20021302,
                next: {
                    Success: 20021303,
                },
            },
            {
                id: 20021303,
                next: {
                    Success: 20021304,
                },
            },
            {
                id: 20021304,
            },
        ],
    },
    {
        id: 200215,
        name: "末等厨师",
        chapterName: "夜航篇",
        episode: "末等厨师",
        desc: "前去钓鱼吧",
        detail: "为马库斯钓一条月牙鱼吧。这次马库斯有了更为精确的目标，希望他这次的烹饪可以成功吧。",
        type: 4,
        reward: [50566],
        questReward: {
            "20021501": 4000009,
        },
        npc: 700116,
        quests: [
            {
                id: 20021500,
                next: {
                    Success: 20021501,
                },
            },
            {
                id: 20021501,
                next: {
                    Success: 20021510,
                },
            },
            {
                id: 20021502,
                next: {
                    Success: 20021503,
                },
            },
            {
                id: 20021503,
                next: {
                    Success: 20021504,
                },
            },
            {
                id: 20021504,
                next: {
                    Success: 20021509,
                },
            },
            {
                id: 20021506,
                next: {
                    Success: 20021507,
                },
            },
            {
                id: 20021507,
                next: {
                    Success: 20021508,
                },
            },
            {
                id: 20021508,
            },
            {
                id: 20021509,
                next: {
                    Success: 20021506,
                },
            },
            {
                id: 20021510,
                next: {
                    Success: 20021502,
                },
            },
        ],
    },
    {
        id: 200216,
        name: "帝国三兄弟",
        chapterName: "夜航篇",
        episode: "帝国三兄弟",
        type: 3,
        reward: [50567],
        quests: [
            {
                id: 20021601,
                next: {
                    Success: 20021602,
                },
            },
            {
                id: 20021602,
                next: {
                    Success: 20021603,
                },
            },
            {
                id: 20021603,
                next: {
                    Success: 20021604,
                },
            },
            {
                id: 20021604,
            },
        ],
    },
    {
        id: 200219,
        name: "藏梦的星星",
        chapterName: "夜航篇",
        episode: "你好，冰湖城",
        type: 3,
        reward: [50570],
        quests: [
            {
                id: 20021901,
                next: {
                    Success: 20021902,
                },
            },
            {
                id: 20021902,
                next: {
                    Success: 20021903,
                },
            },
            {
                id: 20021903,
                next: {
                    Success: 20021905,
                },
            },
            {
                id: 20021904,
                next: {
                    Success: 20021901,
                },
            },
            {
                id: 20021905,
                next: {
                    Success: 20021906,
                },
            },
            {
                id: 20021906,
            },
        ],
    },
    {
        id: 200220,
        name: "小队名字几个字",
        chapterName: "夜航篇",
        episode: "小队名字几个字",
        type: 4,
        reward: [50571],
        quests: [
            {
                id: 20022002,
                next: {
                    Success: 20022004,
                },
            },
            {
                id: 20022004,
                next: {
                    Success: 20022005,
                },
            },
            {
                id: 20022005,
                next: {
                    Success: 20022006,
                },
            },
            {
                id: 20022006,
                next: {
                    Success: 20022007,
                },
            },
            {
                id: 20022007,
                next: {
                    Success: 20022008,
                },
            },
            {
                id: 20022008,
                next: {
                    Success: 20022009,
                },
            },
            {
                id: 20022009,
            },
        ],
    },
    {
        id: 200221,
        name: "欲望与考古",
        chapterName: "夜航篇",
        episode: "欲望与考古",
        type: 3,
        reward: [50572],
        quests: [
            {
                id: 20022101,
                next: {
                    Success: 20022102,
                },
            },
            {
                id: 20022102,
                next: {
                    Success: 20022103,
                },
            },
            {
                id: 20022103,
                next: {
                    Success: 20022104,
                },
            },
            {
                id: 20022104,
            },
            {
                id: 20022105,
                next: {
                    Success: 20022101,
                },
            },
        ],
    },
    {
        id: 200222,
        name: "下水道嘉年华",
        chapterName: "夜航篇",
        episode: "下水道嘉年华",
        desc: "前往下水道与达顿聊聊",
        detail: "在冰湖城下水道里建设的免费娱乐项目，听起来虽然不太靠谱，但面前这个叫达顿的男人看起来却是信心满满。既然免费，不如跟过去看看这男人究竟搞了些什么名堂吧。",
        type: 3,
        reward: [50573],
        npc: 700069,
        quests: [
            {
                id: 20022200,
                next: {
                    Success: 20022202,
                },
            },
            {
                id: 20022202,
                next: {
                    Success: 20022203,
                },
            },
            {
                id: 20022203,
                next: {
                    Success: 20022204,
                },
            },
            {
                id: 20022204,
                next: {
                    Success: 20022205,
                },
            },
            {
                id: 20022205,
            },
        ],
    },
    {
        id: 200223,
        name: "小小研究者",
        chapterName: "夜航篇",
        episode: "小小研究者",
        desc: "与西奥聊聊",
        detail: "西奥，这位年纪轻轻的研究者（自称的）渴望了解卡戎的方方面面，而你，就是他所选定的第一位实验对象。",
        type: 3,
        reward: [50574],
        npc: 700011,
        quests: [
            {
                id: 20022300,
                next: {
                    Success: 20022301,
                },
            },
            {
                id: 20022301,
            },
        ],
    },
    {
        id: 200224,
        name: "小小研究者",
        chapterName: "夜航篇",
        episode: "小小研究者",
        desc: "与西奥聊聊",
        detail: "一段时间后你在下水道入口再次碰到了西奥，过去与他聊聊，看看他这次又在好奇些什么东西吧。",
        type: 3,
        reward: [50575],
        quests: [
            {
                id: 20022401,
                next: {
                    Success: 20022402,
                },
            },
            {
                id: 20022402,
                next: {
                    Success: 20022403,
                },
            },
            {
                id: 20022403,
                next: {
                    Success: 20022404,
                },
            },
            {
                id: 20022404,
            },
        ],
    },
    {
        id: 200225,
        name: "小小研究者",
        chapterName: "夜航篇",
        episode: "小小研究者",
        desc: "与西奥聊聊",
        detail: "一段时间后你在修普诺斯之家再次碰到了西奥，过去与他聊聊，看看他这次又在好奇些什么东西吧。",
        type: 3,
        reward: [50576],
        quests: [
            {
                id: 20022501,
                next: {
                    Success: 20022502,
                },
            },
            {
                id: 20022502,
                next: {
                    Success: 20022503,
                },
            },
            {
                id: 20022503,
                next: {
                    Success: 20022504,
                },
            },
            {
                id: 20022504,
            },
        ],
    },
    {
        id: 200227,
        name: "全新戏剧",
        chapterName: "夜航篇",
        episode: "全新戏剧",
        desc: "与热情的剧团成员交谈",
        type: 4,
        reward: [50580],
        quests: [
            {
                id: 20022701,
                next: {
                    选项1: 20022703,
                    选项2: 20022702,
                },
            },
            {
                id: 20022702,
            },
            {
                id: 20022703,
            },
        ],
    },
    {
        id: 200228,
        name: "再次见证的伊始",
        chapterName: "夜航篇",
        episode: "再次见证的伊始",
        desc: "铁匠皎皎似乎正在找你",
        type: 4,
        quests: [
            {
                id: 20022801,
                next: {
                    Success: 20022802,
                },
            },
            {
                id: 20022802,
                next: {
                    Success: 20022803,
                },
            },
            {
                id: 20022803,
                next: {
                    Success: 20022804,
                },
            },
            {
                id: 20022804,
            },
        ],
    },
    {
        id: 200229,
        name: "阿特拉西亚美学大师",
        chapterName: "夜航篇",
        episode: "阿特拉西亚美学大师",
        desc: "找到呼喊声的源头",
        type: 4,
        reward: [50582],
        questReward: {
            "20022901": 4000013,
        },
        quests: [
            {
                id: 20022901,
                next: {
                    Success: 20022902,
                },
            },
            {
                id: 20022902,
                next: {
                    Success: 20022903,
                },
            },
            {
                id: 20022903,
                next: {
                    Success: 20022904,
                },
            },
            {
                id: 20022904,
            },
        ],
    },
    {
        id: 200230,
        name: "千面歌者的忧郁",
        chapterName: "夜航篇",
        episode: "千面歌者的忧郁",
        desc: "随费恩一起去见他的“老师”",
        detail: "一位言行夸张的男子拦下了你，并声称他的“老师”正在等你。随他一起去看看发生了什么事吧。",
        type: 3,
        reward: [50583],
        npc: 700306,
        quests: [
            {
                id: 20023000,
                next: {
                    Success: 20023001,
                },
            },
            {
                id: 20023001,
                next: {
                    Success: 20023002,
                },
            },
            {
                id: 20023002,
                next: {
                    Success: 20023003,
                },
            },
            {
                id: 20023003,
                next: {
                    Success: 20023004,
                },
            },
            {
                id: 20023004,
                next: {
                    Success: 20023006,
                },
            },
            {
                id: 20023006,
                next: {
                    Success: 20023007,
                },
            },
            {
                id: 20023007,
            },
        ],
    },
    {
        id: 200231,
        name: "旧痕难弥",
        chapterName: "夜航篇",
        episode: "旧痕难弥",
        desc: "回应拉斯的求助",
        detail: "一位名叫拉斯的男孩向你求助，听听看他想说些什么吧。",
        type: 3,
        reward: [50584],
        npc: 700303,
        quests: [
            {
                id: 20023100,
                next: {
                    Success: 20023101,
                },
            },
            {
                id: 20023101,
                next: {
                    Success: 20023102,
                },
            },
            {
                id: 20023102,
                next: {
                    Success: 20023103,
                },
            },
            {
                id: 20023103,
                next: {
                    Success: 20023105,
                },
            },
            {
                id: 20023105,
                next: {
                    Success: 20023108,
                },
            },
            {
                id: 20023108,
            },
        ],
    },
    {
        id: 200232,
        name: "箱子小姐的烦恼",
        chapterName: "夜航篇",
        episode: "箱子小姐的烦恼",
        desc: "寻找奇怪歌声的源头",
        detail: "一阵诡异的歌声从街角传入你的耳朵，你决定鼓起勇气，去寻找那段歌声的源头。",
        type: 3,
        reward: [50585],
        npc: 700309,
        quests: [
            {
                id: 20023201,
                next: {
                    Success: 20023202,
                },
            },
            {
                id: 20023202,
                next: {
                    Success: 20023203,
                },
            },
            {
                id: 20023203,
                next: {
                    Success: 20023204,
                },
            },
            {
                id: 20023204,
                next: {
                    Success: 20023205,
                },
            },
            {
                id: 20023205,
            },
        ],
    },
    {
        id: 200233,
        name: "于无眠之夜远航",
        chapterName: "夜航篇",
        episode: "于无眠之夜远航",
        desc: "回忆几个事件间的联系，找到隐藏的真相",
        detail: "最近经历的几件事都指向了一桩十六年前的绑架纵火案，直觉告诉你这其中存在着千丝万缕的联系，根据已有的线索试着理清现状吧。",
        type: 3,
        reward: [50586],
        quests: [
            {
                id: 20023301,
                next: {
                    Success: 20023302,
                },
            },
            {
                id: 20023302,
                next: {
                    Success: 20023304,
                },
            },
            {
                id: 20023304,
                next: {
                    不揭发: 20023305,
                    揭发: 20023306,
                },
            },
            {
                id: 20023305,
            },
            {
                id: 20023306,
            },
        ],
    },
    {
        id: 200234,
        name: "猫的报恩",
        chapterName: "夜航篇",
        episode: "猫的报恩",
        desc: "去看看孤独的野猫",
        detail: "你又一次见到了那只在广场附近徘徊的野猫，它似乎是认出了你，大老远就喵喵叫了起来。",
        type: 4,
        reward: [50589],
        quests: [
            {
                id: 20023401,
                next: {
                    Success: 20023402,
                },
            },
            {
                id: 20023402,
            },
        ],
    },
    {
        id: 200235,
        name: "狩月人的第一步",
        chapterName: "夜航篇",
        episode: "狩月人的第一步",
        desc: "开始一次委托，就从避险开始吧",
        detail: "完成一次避险委托",
        type: 4,
        reward: [50590],
        quests: [
            {
                id: 20023501,
                next: {
                    Success: 20023502,
                },
            },
            {
                id: 20023502,
            },
        ],
    },
    {
        id: 200236,
        name: "教学任务：委托密函",
        chapterName: "夜航篇",
        episode: "教学任务：委托密函",
        desc: "完成委托密函：松露与榛子",
        detail: "完成松露与榛子对应的委托密函，获取松露与榛子的思绪片段",
        type: 4,
        reward: [50591],
        quests: [
            {
                id: 20023601,
                next: {
                    Success: 20023603,
                },
            },
            {
                id: 20023602,
            },
            {
                id: 20023603,
                next: {
                    已合成: 20023604,
                    未合成: 20023602,
                },
            },
            {
                id: 20023604,
            },
        ],
    },
    {
        id: 200301,
        name: "神的垂青",
        chapterName: "世界纪游",
        episode: "神的垂青",
        desc: "前往尘漠石海",
        detail: "你被一个神神叨叨的老者叫停了脚步，他说着让人半懂半不懂的话，向你提出了委托。",
        type: 3,
        reward: [50596],
        quests: [
            {
                id: 20030100,
                next: {
                    Success: 20030101,
                },
            },
            {
                id: 20030101,
                next: {
                    Success: 20030104,
                },
            },
            {
                id: 20030103,
                next: {
                    Success: 20030106,
                },
            },
            {
                id: 20030104,
                next: {
                    Success: 20030103,
                },
            },
            {
                id: 20030106,
            },
        ],
    },
    {
        id: 200302,
        name: "诸星耀时",
        chapterName: "世界纪游",
        episode: "诸星耀时",
        desc: "陪赵谦去取货",
        detail: "路过百年春时，你远远听到了两个人的激烈交流。原来是织星客在华胥境内的生意，受烛阴之灾影响而变得不太安全。若是有空，不妨帮这位织星客一把。",
        type: 3,
        reward: [50597],
        npc: 700321,
        quests: [
            {
                id: 20030200,
                next: {
                    Success: 20030201,
                },
            },
            {
                id: 20030201,
                next: {
                    Success: 20030202,
                },
            },
            {
                id: 20030202,
                next: {
                    Success: 20030203,
                },
            },
            {
                id: 20030203,
                next: {
                    Success: 20030204,
                },
            },
            {
                id: 20030204,
            },
        ],
    },
    {
        id: 200303,
        name: "大风之隙",
        chapterName: "世界纪游",
        episode: "大风之隙",
        desc: "在沉船附近寻找“宝藏”",
        detail: "一个奇怪的人在黑市拦下了你，对方似乎知道你脑海中浮现的那个声音的来由，不妨听听他想要说些什么。",
        type: 3,
        reward: [50598],
        npc: 700322,
        quests: [
            {
                id: 20030300,
                next: {
                    Success: 20030301,
                },
            },
            {
                id: 20030301,
                next: {
                    Success: 20030302,
                },
            },
            {
                id: 20030302,
                next: {
                    Success: 20030303,
                },
            },
            {
                id: 20030303,
                next: {
                    Success: 20030304,
                },
            },
            {
                id: 20030304,
            },
        ],
    },
    {
        id: 200304,
        name: "不似木樨归处",
        chapterName: "世界纪游",
        episode: "不似木樨归处",
        desc: "不似木樨归处",
        detail: "白打听到了一处好吃地道的桂花糕摊位，就在烟津渡的码头处，陪她一起去看看吧。",
        type: 3,
        reward: [50599],
        npc: 700324,
        quests: [
            {
                id: 20030400,
                next: {
                    Success: 20030401,
                },
            },
            {
                id: 20030401,
                next: {
                    Success: 20030402,
                },
            },
            {
                id: 20030402,
                next: {
                    Success: 20030403,
                },
            },
            {
                id: 20030403,
                next: {
                    Success: 20030404,
                },
            },
            {
                id: 20030404,
                next: {
                    Success: 20030405,
                },
            },
            {
                id: 20030405,
                next: {
                    Success: 20030406,
                },
            },
            {
                id: 20030406,
                next: {
                    Success: 20030407,
                },
            },
            {
                id: 20030407,
                next: {
                    Success: 20030408,
                },
            },
            {
                id: 20030408,
                next: {
                    Success: 20030409,
                },
            },
            {
                id: 20030409,
            },
        ],
    },
    {
        id: 200305,
        name: "错时重逢",
        chapterName: "世界纪游",
        episode: "错时重逢",
        desc: "与灵灵聊聊",
        detail: "小女孩瑟瑟发抖地向白龙神君祈祷，去帮帮她吧。",
        type: 3,
        reward: [50600],
        quests: [
            {
                id: 20030500,
                next: {
                    Success: 20030501,
                },
            },
            {
                id: 20030501,
                next: {
                    Success: 20030509,
                },
            },
            {
                id: 20030502,
                next: {
                    Success: 20030503,
                },
            },
            {
                id: 20030503,
                next: {
                    Success: 20030504,
                },
            },
            {
                id: 20030504,
                next: {
                    Success: 20030505,
                },
            },
            {
                id: 20030505,
                next: {
                    Success: 20030506,
                },
            },
            {
                id: 20030506,
                next: {
                    Success: 20030507,
                },
            },
            {
                id: 20030507,
                next: {
                    Success: 20030508,
                },
            },
            {
                id: 20030508,
            },
            {
                id: 20030509,
                next: {
                    Success: 20030502,
                },
            },
        ],
    },
    {
        id: 200306,
        name: "机枢探妙",
        chapterName: "世界纪游",
        episode: "机枢探妙",
        desc: "前往牵机方枢所引的地方",
        detail: "怀中的牵机方枢传来一阵奇怪的动静，似乎在为你指明某种方向。既然如此，那便去一探究竟吧。",
        type: 3,
        reward: [50601],
        npc: 700323,
        quests: [
            {
                id: 20030600,
                next: {
                    Success: 20030601,
                },
            },
            {
                id: 20030601,
                next: {
                    Success: 20030602,
                },
            },
            {
                id: 20030602,
                next: {
                    Success: 20030603,
                },
            },
            {
                id: 20030603,
            },
        ],
    },
    {
        id: 200307,
        name: "高光时刻",
        chapterName: "世界纪游",
        episode: "高光时刻",
        desc: "协助拍戏",
        detail: "主演的缺席，让面前这位导演苦恼了很久很久。在导演的一再邀请之下，要不要帮他们拍一下烟津渡的几场戏呢？",
        type: 3,
        reward: [50602],
        npc: 700365,
        quests: [
            {
                id: 20030700,
                next: {
                    Success: 20030701,
                },
            },
            {
                id: 20030701,
                next: {
                    Success: 20030702,
                },
            },
            {
                id: 20030702,
                next: {
                    Success: 20030703,
                },
            },
            {
                id: 20030703,
            },
        ],
    },
    {
        id: 200308,
        name: "闹鬼妙妙香",
        chapterName: "世界纪游",
        episode: "闹鬼妙妙香",
        desc: "去“闹鬼”的仓库看看",
        detail: "百年春角落里无人问津的仓库，不知为何最近却传出了“闹鬼”的谣言，等到夜深人静之时，和白一起去看看吧。",
        type: 3,
        reward: [50605],
        npc: 700372,
        quests: [
            {
                id: 20030800,
                next: {
                    Success: 20030801,
                },
            },
            {
                id: 20030801,
                next: {
                    Success: 20030802,
                },
            },
            {
                id: 20030802,
                next: {
                    Success: 20030803,
                },
            },
            {
                id: 20030803,
            },
        ],
    },
    {
        id: 200309,
        name: "尾生抱柱",
        chapterName: "世界纪游",
        episode: "尾生抱柱",
        desc: "去幽明涧看看发生了什么",
        detail: "最近总有华胥之民宣称路过幽明涧时感觉有阵阵凉风，想必是无由生作祟，不如抽空和白一起去看看是怎么回事。",
        type: 3,
        reward: [50604],
        quests: [
            {
                id: 20030901,
                next: {
                    Success: 20030902,
                },
            },
            {
                id: 20030902,
                next: {
                    Success: 20030903,
                },
            },
            {
                id: 20030903,
                next: {
                    Success: 20030906,
                },
            },
            {
                id: 20030904,
                next: {
                    Success: 20030905,
                },
            },
            {
                id: 20030905,
            },
            {
                id: 20030906,
                next: {
                    Success: 20030904,
                },
            },
        ],
    },
    {
        id: 200310,
        name: "香火归尘",
        chapterName: "世界纪游",
        episode: "香火归尘",
        desc: "香火归尘任务面板1",
        detail: "附近传来不知何人的呜咽声，赶快过去看看情况吧。",
        type: 3,
        reward: [50606],
        npc: 701087,
        quests: [
            {
                id: 20031001,
                next: {
                    Success: 20031003,
                },
            },
            {
                id: 20031003,
                next: {
                    Success: 20031004,
                },
            },
            {
                id: 20031004,
                next: {
                    Success: 20031005,
                },
            },
            {
                id: 20031005,
                next: {
                    Success: 20031006,
                },
            },
            {
                id: 20031006,
            },
        ],
    },
    {
        id: 200311,
        name: "梨与礼",
        chapterName: "世界纪游",
        episode: "梨与礼",
        desc: "与杨父交谈",
        detail: "那位带着孩子的父亲似乎有事相求，去和他聊聊吧。",
        type: 3,
        reward: [50607],
        quests: [
            {
                id: 20031100,
                next: {
                    Success: 20031101,
                },
            },
            {
                id: 20031101,
                next: {
                    Success: 20031103,
                },
            },
            {
                id: 20031102,
            },
            {
                id: 20031103,
                next: {
                    Success: 20031102,
                },
            },
        ],
    },
    {
        id: 200312,
        name: "柳色如故",
        chapterName: "世界纪游",
        episode: "柳色如故",
        desc: "查看小女孩的情况",
        detail: "屋檐下的小女孩似乎快要站着睡着了，去看看她的情况。",
        type: 3,
        reward: [50608],
        quests: [
            {
                id: 20031200,
                next: {
                    Success: 20031201,
                },
            },
            {
                id: 20031201,
                next: {
                    Success: 20031204,
                },
            },
            {
                id: 20031202,
                next: {
                    Success: 20031203,
                },
            },
            {
                id: 20031203,
            },
            {
                id: 20031204,
                next: {
                    Success: 20031202,
                },
            },
        ],
    },
    {
        id: 200313,
        name: "花茶的味道",
        chapterName: "世界纪游",
        episode: "花茶的味道",
        desc: "无",
        detail: "浮星埠不远处的茶馆旁传来了阵阵人声，听起来像是在争执些什么。想来又有热闹可以凑了，不如去看看。",
        type: 3,
        reward: [50609],
        npc: 701091,
        quests: [
            {
                id: 20031301,
                next: {
                    Success: 20031302,
                },
            },
            {
                id: 20031302,
                next: {
                    Success: 20031303,
                },
            },
            {
                id: 20031303,
                next: {
                    Success: 20031304,
                },
            },
            {
                id: 20031304,
                next: {
                    Success: 20031305,
                },
            },
            {
                id: 20031305,
                next: {
                    Success: 20031306,
                },
            },
            {
                id: 20031306,
            },
        ],
    },
    {
        id: 200314,
        name: "虬先生的投资",
        chapterName: "世界纪游",
        episode: "虬先生的投资",
        desc: "与虬先生聊聊",
        detail: "虬先生意味深长地看着你微笑，似乎还有什么话想说，去看看他葫芦里卖的什么药吧。",
        type: 4,
        reward: [50610],
        npc: 701096,
        quests: [
            {
                id: 20031401,
            },
        ],
    },
    {
        id: 200315,
        name: "烟津渡最大危机！",
        chapterName: "世界纪游",
        episode: "烟津渡最大危机！",
        desc: "与白聊聊",
        detail: "没想到微茫市居然在公然售卖危险的“大烟花”，必须在事态越发严重前阻止他们。",
        type: 3,
        reward: [50611],
        npc: 701095,
        quests: [
            {
                id: 20031500,
                next: {
                    Success: 20031502,
                },
            },
            {
                id: 20031502,
                next: {
                    Success: 20031503,
                },
            },
            {
                id: 20031503,
                next: {
                    Success: 20031504,
                },
            },
            {
                id: 20031504,
                next: {
                    Success: 20031505,
                },
            },
            {
                id: 20031505,
            },
        ],
    },
    {
        id: 400101,
        name: "狩猎委托·其一",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [110002],
        startTime: 1765159200,
        endTime: 1766437200,
        quests: [
            {
                id: 4001011,
            },
        ],
    },
    {
        id: 400102,
        name: "狩猎委托·其二",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [110004],
        startTime: 1765227600,
        endTime: 1766437200,
        quests: [
            {
                id: 4001021,
            },
        ],
    },
    {
        id: 400103,
        name: "狩猎委托·其三",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [110006],
        startTime: 1765314000,
        endTime: 1766437200,
        quests: [
            {
                id: 4001031,
            },
        ],
    },
    {
        id: 400104,
        name: "狩猎委托·其四",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [110008],
        startTime: 1765400400,
        endTime: 1766437200,
        quests: [
            {
                id: 4001041,
            },
        ],
    },
    {
        id: 400105,
        name: "狩猎委托·其五",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [110010],
        startTime: 1765486800,
        endTime: 1766437200,
        quests: [
            {
                id: 4001051,
            },
        ],
    },
    {
        id: 400106,
        name: "狩猎委托·其六",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [110012],
        startTime: 1765573200,
        endTime: 1766437200,
        quests: [
            {
                id: 4001061,
            },
        ],
    },
    {
        id: 400107,
        name: "狩猎委托·其七",
        chapterName: "世界纪游",
        chapterNumber: "华胥",
        episode: "烟津渡影蔽香尘",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [110014],
        startTime: 1765659600,
        endTime: 1766437200,
        quests: [
            {
                id: 4001071,
            },
        ],
    },
    {
        id: 400111,
        name: "皎皎特别剧场",
        chapterName: "世界纪游",
        episode: "皎皎特别剧场",
        type: 5,
        icon: "T_Chapter_Icon03",
        reward: [50603],
        startTime: 1766628000,
        endTime: 1768856400,
        quests: [
            {
                id: 40011101,
                next: {
                    Success: 40011102,
                },
            },
            {
                id: 40011102,
                next: {
                    Success: 40011103,
                },
            },
            {
                id: 40011103,
                next: {
                    Success: 40011104,
                },
            },
            {
                id: 40011104,
                next: {
                    Success: 40011105,
                },
            },
            {
                id: 40011105,
                next: {
                    Success: 40011106,
                },
            },
            {
                id: 40011106,
                next: {
                    Success: 40011107,
                },
            },
            {
                id: 40011107,
            },
        ],
    },
]

export const questChainMap = new Map(questChainData.map(questChain => [questChain.id, questChain]))

export default questChainData
