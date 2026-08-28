// 条件表（Condition）
// 由 tools/import-i18n-data.ts 从 DuetNightAbyssData2/out/Condition.json 自动填充

/** 条件表条目 */
export interface ConditionItem {
    id: number
    logic: "AND" | "OR"
    map: Record<string, unknown>
    isNot?: boolean
    remark?: string
}

export const conditionsMap: Record<number, ConditionItem> = {
    "1": {
        id: 1,
        logic: "AND",
        map: {
            AvatarStatus: [["InBigWorld", "T"]],
            SubRegionType: ["home"],
        },
        remark: "区域仅据点显示的入口",
    },
    "2": {
        id: 2,
        logic: "AND",
        map: {
            AvatarStatus: [["InBigWorld", "T"]],
        },
        remark: "区域始终显示的入口",
    },
    "3": {
        id: 3,
        logic: "AND",
        map: {
            DungeonType: ["Rouge"],
        },
        remark: "仅肉鸽显示的入口",
    },
    "4": {
        id: 4,
        logic: "OR",
        map: {
            AvatarStatus: [["InBigWorld", "T"]],
            DungeonType: ["Training", "Trial"],
        },
        remark: "显示军械库入口",
    },
    "5": {
        id: 5,
        logic: "AND",
        map: {
            AvatarStatus: [["InSpecialQuest", "F"]],
            InStoryMode: ["F"],
        },
        remark: "剧情模式特殊任务均不显示",
    },
    "6": {
        id: 6,
        logic: "AND",
        map: {
            InStoryMode: ["T"],
        },
        remark: "剧情模式显示",
    },
    "7": {
        id: 7,
        logic: "AND",
        map: {
            AvatarStatus: [["InBigWorld", "T"]],
            SubRegionType: ["field"],
        },
        remark: "区域仅据点不显示的入口",
    },
    "9": {
        id: 9,
        logic: "AND",
        map: {
            PlayerLevelMin: [999],
        },
        remark: "推车关卡小车交互",
    },
    "10": {
        id: 10,
        logic: "AND",
        map: {
            InStoryMode: ["F"],
        },
        remark: "剧情模式不显示",
    },
    "11": {
        id: 11,
        logic: "AND",
        map: {
            AvatarStatus: [["InHardBoss", "F"]],
        },
        remark: "不在梦魇残声中显示",
    },
    "24": {
        id: 24,
        logic: "AND",
        map: {
            MechanismState: [[0, 1610002, 909]],
        },
        remark: "推车关卡小车交互",
    },
    "25": {
        id: 25,
        logic: "AND",
        map: {
            QuestChain: [100201],
        },
        remark: "区域地图回到据点按钮解锁条件",
    },
    "26": {
        id: 26,
        logic: "AND",
        map: {
            QuestChain: [100103],
        },
        remark: "大地图科赛托斯地图解锁",
    },
    "27": {
        id: 27,
        logic: "AND",
        map: {
            QuestChain: [100201],
        },
        remark: "区域地图据点界面解锁",
    },
    "30": {
        id: 30,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100103],
        },
        remark: "区域地图印象系统解锁条件",
    },
    "31": {
        id: 31,
        logic: "AND",
        map: {
            QuestChain: [100101],
        },
        remark: "酒馆解锁条件",
    },
    "33": {
        id: 33,
        logic: "AND",
        map: {
            ConstantBool: ["F"],
        },
        remark: "跳板解锁条件",
    },
    "98": {
        id: 98,
        logic: "AND",
        map: {
            ConstantBool: ["T"],
        },
        remark: "恒定真条件",
    },
    "99": {
        id: 99,
        logic: "AND",
        map: {
            ConstantBool: ["F"],
        },
        remark: "恒定假条件",
    },
    "101": {
        id: 101,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
        },
        remark: "解锁玩家等级1",
    },
    "102": {
        id: 102,
        logic: "AND",
        map: {
            PlayerLevelMin: [2],
        },
        remark: "解锁玩家等级2",
    },
    "103": {
        id: 103,
        logic: "AND",
        map: {
            PlayerLevelMin: [3],
        },
        remark: "解锁玩家等级3",
    },
    "104": {
        id: 104,
        logic: "AND",
        map: {
            PlayerLevelMin: [4],
        },
        remark: "解锁玩家等级4",
    },
    "105": {
        id: 105,
        logic: "AND",
        map: {
            PlayerLevelMin: [5],
        },
        remark: "解锁玩家等级5",
    },
    "106": {
        id: 106,
        logic: "AND",
        map: {
            PlayerLevelMin: [6],
        },
        remark: "解锁玩家等级6",
    },
    "107": {
        id: 107,
        logic: "AND",
        map: {
            PlayerLevelMin: [7],
        },
        remark: "解锁玩家等级7",
    },
    "108": {
        id: 108,
        logic: "AND",
        map: {
            PlayerLevelMin: [8],
        },
        remark: "解锁玩家等级8",
    },
    "109": {
        id: 109,
        logic: "AND",
        map: {
            PlayerLevelMin: [9],
        },
        remark: "解锁玩家等级9",
    },
    "110": {
        id: 110,
        logic: "AND",
        map: {
            PlayerLevelMin: [10],
        },
        remark: "解锁玩家等级10",
    },
    "111": {
        id: 111,
        logic: "AND",
        map: {
            PlayerLevelMin: [11],
        },
        remark: "解锁玩家等级11",
    },
    "112": {
        id: 112,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
        },
        remark: "解锁玩家等级12",
    },
    "113": {
        id: 113,
        logic: "AND",
        map: {
            PlayerLevelMin: [13],
        },
        remark: "解锁玩家等级13",
    },
    "114": {
        id: 114,
        logic: "AND",
        map: {
            PlayerLevelMin: [14],
        },
        remark: "解锁玩家等级14",
    },
    "115": {
        id: 115,
        logic: "AND",
        map: {
            PlayerLevelMin: [15],
        },
        remark: "解锁玩家等级15",
    },
    "116": {
        id: 116,
        logic: "AND",
        map: {
            PlayerLevelMin: [16],
        },
        remark: "解锁玩家等级16",
    },
    "117": {
        id: 117,
        logic: "AND",
        map: {
            PlayerLevelMin: [17],
        },
        remark: "解锁玩家等级17",
    },
    "118": {
        id: 118,
        logic: "AND",
        map: {
            PlayerLevelMin: [18],
        },
        remark: "解锁玩家等级18",
    },
    "119": {
        id: 119,
        logic: "AND",
        map: {
            PlayerLevelMin: [19],
        },
        remark: "解锁玩家等级19",
    },
    "120": {
        id: 120,
        logic: "AND",
        map: {
            PlayerLevelMin: [20],
        },
        remark: "解锁玩家等级20",
    },
    "121": {
        id: 121,
        logic: "AND",
        map: {
            PlayerLevelMin: [21],
        },
        remark: "解锁玩家等级21",
    },
    "122": {
        id: 122,
        logic: "AND",
        map: {
            PlayerLevelMin: [22],
        },
        remark: "解锁玩家等级22",
    },
    "123": {
        id: 123,
        logic: "AND",
        map: {
            PlayerLevelMin: [23],
        },
        remark: "解锁玩家等级23",
    },
    "124": {
        id: 124,
        logic: "AND",
        map: {
            PlayerLevelMin: [24],
        },
        remark: "解锁玩家等级24",
    },
    "125": {
        id: 125,
        logic: "AND",
        map: {
            PlayerLevelMin: [25],
        },
        remark: "解锁玩家等级25",
    },
    "126": {
        id: 126,
        logic: "AND",
        map: {
            PlayerLevelMin: [26],
        },
        remark: "解锁玩家等级26",
    },
    "127": {
        id: 127,
        logic: "AND",
        map: {
            PlayerLevelMin: [27],
        },
        remark: "解锁玩家等级27",
    },
    "128": {
        id: 128,
        logic: "AND",
        map: {
            PlayerLevelMin: [28],
        },
        remark: "解锁玩家等级28",
    },
    "129": {
        id: 129,
        logic: "AND",
        map: {
            PlayerLevelMin: [29],
        },
        remark: "解锁玩家等级29",
    },
    "130": {
        id: 130,
        logic: "AND",
        map: {
            PlayerLevelMin: [30],
        },
        remark: "解锁玩家等级30",
    },
    "131": {
        id: 131,
        logic: "AND",
        map: {
            PlayerLevelMin: [31],
        },
        remark: "解锁玩家等级31",
    },
    "132": {
        id: 132,
        logic: "AND",
        map: {
            PlayerLevelMin: [32],
        },
        remark: "解锁玩家等级32",
    },
    "133": {
        id: 133,
        logic: "AND",
        map: {
            PlayerLevelMin: [33],
        },
        remark: "解锁玩家等级33",
    },
    "134": {
        id: 134,
        logic: "AND",
        map: {
            PlayerLevelMin: [34],
        },
        remark: "解锁玩家等级34",
    },
    "135": {
        id: 135,
        logic: "AND",
        map: {
            PlayerLevelMin: [35],
        },
        remark: "解锁玩家等级35",
    },
    "136": {
        id: 136,
        logic: "AND",
        map: {
            PlayerLevelMin: [36],
        },
        remark: "解锁玩家等级36",
    },
    "137": {
        id: 137,
        logic: "AND",
        map: {
            PlayerLevelMin: [37],
        },
        remark: "解锁玩家等级37",
    },
    "138": {
        id: 138,
        logic: "AND",
        map: {
            PlayerLevelMin: [38],
        },
        remark: "解锁玩家等级38",
    },
    "139": {
        id: 139,
        logic: "AND",
        map: {
            PlayerLevelMin: [39],
        },
        remark: "解锁玩家等级39",
    },
    "140": {
        id: 140,
        logic: "AND",
        map: {
            PlayerLevelMin: [40],
        },
        remark: "解锁玩家等级40",
    },
    "141": {
        id: 141,
        logic: "AND",
        map: {
            PlayerLevelMin: [41],
        },
        remark: "解锁玩家等级41",
    },
    "142": {
        id: 142,
        logic: "AND",
        map: {
            PlayerLevelMin: [42],
        },
        remark: "解锁玩家等级42",
    },
    "143": {
        id: 143,
        logic: "AND",
        map: {
            PlayerLevelMin: [43],
        },
        remark: "解锁玩家等级43",
    },
    "144": {
        id: 144,
        logic: "AND",
        map: {
            PlayerLevelMin: [44],
        },
        remark: "解锁玩家等级44",
    },
    "145": {
        id: 145,
        logic: "AND",
        map: {
            PlayerLevelMin: [45],
        },
        remark: "解锁玩家等级45",
    },
    "146": {
        id: 146,
        logic: "AND",
        map: {
            PlayerLevelMin: [46],
        },
        remark: "解锁玩家等级46",
    },
    "147": {
        id: 147,
        logic: "AND",
        map: {
            PlayerLevelMin: [47],
        },
        remark: "解锁玩家等级47",
    },
    "148": {
        id: 148,
        logic: "AND",
        map: {
            PlayerLevelMin: [48],
        },
        remark: "解锁玩家等级48",
    },
    "149": {
        id: 149,
        logic: "AND",
        map: {
            PlayerLevelMin: [49],
        },
        remark: "解锁玩家等级49",
    },
    "150": {
        id: 150,
        logic: "AND",
        map: {
            PlayerLevelMin: [50],
        },
        remark: "解锁玩家等级50",
    },
    "151": {
        id: 151,
        logic: "AND",
        map: {
            PlayerLevelMin: [51],
        },
        remark: "解锁玩家等级51",
    },
    "152": {
        id: 152,
        logic: "AND",
        map: {
            PlayerLevelMin: [52],
        },
        remark: "解锁玩家等级52",
    },
    "153": {
        id: 153,
        logic: "AND",
        map: {
            PlayerLevelMin: [53],
        },
        remark: "解锁玩家等级53",
    },
    "154": {
        id: 154,
        logic: "AND",
        map: {
            PlayerLevelMin: [54],
        },
        remark: "解锁玩家等级54",
    },
    "155": {
        id: 155,
        logic: "AND",
        map: {
            PlayerLevelMin: [55],
        },
        remark: "解锁玩家等级55",
    },
    "156": {
        id: 156,
        logic: "AND",
        map: {
            PlayerLevelMin: [56],
        },
        remark: "解锁玩家等级56",
    },
    "157": {
        id: 157,
        logic: "AND",
        map: {
            PlayerLevelMin: [57],
        },
        remark: "解锁玩家等级57",
    },
    "158": {
        id: 158,
        logic: "AND",
        map: {
            PlayerLevelMin: [58],
        },
        remark: "解锁玩家等级58",
    },
    "159": {
        id: 159,
        logic: "AND",
        map: {
            PlayerLevelMin: [59],
        },
        remark: "解锁玩家等级59",
    },
    "160": {
        id: 160,
        logic: "AND",
        map: {
            PlayerLevelMin: [60],
        },
        remark: "解锁玩家等级60",
    },
    "165": {
        id: 165,
        logic: "AND",
        map: {
            PlayerLevelMin: [65],
        },
        remark: "解锁玩家等级65",
    },
    "210": {
        id: 210,
        logic: "AND",
        map: {
            PlayerLevelMin: [10],
        },
        remark: "魔之楔手册揭晓等级10",
    },
    "212": {
        id: 212,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
        },
        remark: "魔之楔手册揭晓等级12",
    },
    "220": {
        id: 220,
        logic: "AND",
        map: {
            PlayerLevelMin: [20],
        },
        remark: "魔之楔手册揭晓等级20",
    },
    "225": {
        id: 225,
        logic: "AND",
        map: {
            PlayerLevelMin: [25],
        },
        remark: "魔之楔手册揭晓等级25",
    },
    "230": {
        id: 230,
        logic: "AND",
        map: {
            PlayerLevelMin: [30],
        },
        remark: "魔之楔手册揭晓等级30",
    },
    "235": {
        id: 235,
        logic: "AND",
        map: {
            PlayerLevelMin: [35],
        },
        remark: "魔之楔手册揭晓等级35",
    },
    "240": {
        id: 240,
        logic: "AND",
        map: {
            PlayerLevelMin: [40],
        },
        remark: "魔之楔手册揭晓等级40",
    },
    "310": {
        id: 310,
        logic: "AND",
        map: {
            Quest: [10020405],
        },
        remark: "修普诺斯之家解锁条件",
    },
    "311": {
        id: 311,
        logic: "AND",
        map: {
            Quest: [10020107],
        },
        remark: "据点解锁条件",
    },
    "312": {
        id: 312,
        logic: "AND",
        map: {
            Quest: [10020215],
        },
        remark: "下水道（井盖）解锁条件",
    },
    "313": {
        id: 313,
        logic: "AND",
        map: {
            QuestChain: [100203],
        },
        remark: "奥哥家解锁条件",
    },
    "314": {
        id: 314,
        logic: "AND",
        map: {
            Quest: [10020301],
        },
        remark: "矿坑解锁条件",
    },
    "315": {
        id: 315,
        logic: "AND",
        map: {
            Quest: [10030397],
        },
        remark: "秘密基地（正门）解锁条件",
    },
    "316": {
        id: 316,
        logic: "AND",
        map: {
            Quest: [10030399],
        },
        remark: "病房解锁条件",
    },
    "317": {
        id: 317,
        logic: "AND",
        map: {
            Quest: [10030197],
        },
        remark: "剧院解锁条件",
    },
    "318": {
        id: 318,
        logic: "AND",
        map: {
            Quest: [11010903],
        },
        remark: "炼火之地解锁条件",
    },
    "319": {
        id: 319,
        logic: "AND",
        map: {
            Quest: [11010810],
        },
        remark: "加温区解锁条件",
    },
    "320": {
        id: 320,
        logic: "AND",
        map: {
            Quest: [10020210],
        },
        remark: "下水道（贫民窟）解锁条件",
    },
    "321": {
        id: 321,
        logic: "AND",
        map: {
            Quest: [10030394],
        },
        remark: "秘密基地（管道）解锁条件",
    },
    "322": {
        id: 322,
        logic: "AND",
        map: {
            Quest: [11010103],
        },
        remark: "龙莎要塞解锁条件",
    },
    "323": {
        id: 323,
        logic: "AND",
        map: {
            Quest: [12010304],
        },
        remark: "潜龙居解锁条件",
    },
    "324": {
        id: 324,
        logic: "AND",
        map: {
            Quest: [12010602],
        },
        remark: "烛阴祭坛解锁条件",
    },
    "325": {
        id: 325,
        logic: "AND",
        map: {
            QuestChain: [120003],
        },
        remark: "烟津渡解锁条件",
    },
    "326": {
        id: 326,
        logic: "AND",
        map: {
            Quest: [12020309],
        },
        remark: "山外山解锁条件",
    },
    "327": {
        id: 327,
        logic: "AND",
        map: {
            Quest: [12020306],
        },
        remark: "皓京主城解锁条件",
    },
    "328": {
        id: 328,
        logic: "AND",
        map: {
            Quest: [12020612],
        },
        remark: "太虚陵解锁条件",
    },
    "329": {
        id: 329,
        logic: "AND",
        map: {
            QuestChain: [120202],
        },
        remark: "由来巷解锁条件",
    },
    "330": {
        id: 330,
        logic: "AND",
        map: {
            Quest: [12020214],
        },
        remark: "执律阁内部解锁条件",
    },
    "331": {
        id: 331,
        logic: "AND",
        map: {
            Quest: [12020210],
        },
        remark: "允许玩家从执律阁内出去条件",
    },
    "332": {
        id: 332,
        logic: "AND",
        map: {
            Quest: [10040116],
        },
        remark: "冰湖城-火车站解锁条件",
    },
    "333": {
        id: 333,
        logic: "AND",
        map: {
            InStoryMode: ["F"],
            QuestChain: [120206],
        },
        remark: "火车站地下解锁条件",
    },
    "350": {
        id: 350,
        logic: "AND",
        map: {
            PlayerLevelMax: [50],
        },
        remark: "魔之楔手册隐藏条件等级小于50",
    },
    "1001": {
        id: 1001,
        logic: "AND",
        map: {
            QuestChain: [200201],
        },
        remark: "印象系统",
    },
    "1004": {
        id: 1004,
        logic: "AND",
        map: {
            Quest: [20020300],
        },
        remark: "印象系统",
    },
    "1005": {
        id: 1005,
        logic: "AND",
        map: {
            Impression: [[510005, 1]],
        },
        remark: "印象系统",
    },
    "1007": {
        id: 1007,
        logic: "AND",
        map: {
            Impression: [[510007, 1]],
        },
        remark: "印象系统",
    },
    "1008": {
        id: 1008,
        logic: "AND",
        map: {
            Quest: [20020320],
        },
        remark: "交出日记",
    },
    "1009": {
        id: 1009,
        logic: "AND",
        map: {
            Impression: [[510009, 1]],
        },
        remark: "印象系统",
    },
    "1010": {
        id: 1010,
        logic: "AND",
        map: {
            Impression: [[510010, 1]],
        },
        remark: "印象系统",
    },
    "1012": {
        id: 1012,
        logic: "AND",
        map: {
            Impression: [[510012, 1]],
        },
        remark: "印象系统",
    },
    "1013": {
        id: 1013,
        logic: "AND",
        map: {
            Impression: [[510058, 1]],
        },
        remark: "印象系统",
    },
    "1014": {
        id: 1014,
        logic: "AND",
        map: {
            Impression: [[510014, 1]],
        },
        remark: "印象系统",
    },
    "1015": {
        id: 1015,
        logic: "AND",
        map: {
            Impression: [[510015, 1]],
        },
        remark: "印象系统",
    },
    "1016": {
        id: 1016,
        logic: "AND",
        map: {
            Impression: [[510016, 1]],
        },
        remark: "印象系统",
    },
    "1017": {
        id: 1017,
        logic: "AND",
        map: {
            Impression: [[510017, 1]],
        },
        remark: "印象系统",
    },
    "1019": {
        id: 1019,
        logic: "AND",
        map: {
            Impression: [[510019, 1]],
        },
        remark: "印象系统，威尔斯小传解锁",
    },
    "1020": {
        id: 1020,
        logic: "AND",
        map: {
            Quest: [20020501],
        },
        remark: "印象系统",
    },
    "1021": {
        id: 1021,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 10]],
        },
        remark: "冰湖城印象商店解锁-任意10",
    },
    "1022": {
        id: 1022,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 10]],
        },
        remark: "冰湖城印象商店解锁-功利10",
    },
    "1023": {
        id: 1023,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 10]],
        },
        remark: "冰湖城印象商店解锁-道德10",
    },
    "1024": {
        id: 1024,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 10]],
        },
        remark: "冰湖城印象商店解锁-才智10",
    },
    "1025": {
        id: 1025,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 10]],
        },
        remark: "冰湖城印象商店解锁-共情10",
    },
    "1026": {
        id: 1026,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 10]],
        },
        remark: "冰湖城印象商店解锁-混沌10",
    },
    "1027": {
        id: 1027,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 10]],
        },
        remark: "冰湖城印象商店解锁-全部10",
    },
    "1028": {
        id: 1028,
        logic: "AND",
        map: {
            Impression: [[510030, 1]],
        },
        remark: "印象系统-巴克",
    },
    "1029": {
        id: 1029,
        logic: "AND",
        map: {
            Impression: [[510033, 1]],
        },
        remark: "印象系统-阿诺",
    },
    "1030": {
        id: 1030,
        logic: "AND",
        map: {
            Impression: [[510035, 1]],
        },
        remark: "印象系统-艾玛",
    },
    "1031": {
        id: 1031,
        logic: "AND",
        map: {
            Impression: [[510037, 1]],
        },
        remark: "印象系统-贝琳达",
    },
    "1032": {
        id: 1032,
        logic: "AND",
        map: {
            Impression: [[510050, 1]],
        },
        remark: "印象系统-莱娜",
    },
    "1033": {
        id: 1033,
        logic: "AND",
        map: {
            Quest: [20020906],
        },
        remark: "露娜-小传解锁",
    },
    "1034": {
        id: 1034,
        logic: "AND",
        map: {
            QuestChain: [200210],
        },
        remark: "印象系统-荷尔洛",
    },
    "1035": {
        id: 1035,
        logic: "AND",
        map: {
            Impression: [[510039, 1]],
        },
        remark: "印象系统-费伊-一阶段",
    },
    "1036": {
        id: 1036,
        logic: "AND",
        map: {
            Impression: [[510041, 1]],
        },
        remark: "印象系统-费伊-二阶段",
    },
    "1037": {
        id: 1037,
        logic: "AND",
        map: {
            Impression: [[510025, 1]],
        },
        remark: "印象系统-拉里",
    },
    "1038": {
        id: 1038,
        logic: "AND",
        map: {
            Quest: [20021501],
        },
        remark: "印象系统-马库斯",
    },
    "1039": {
        id: 1039,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 20]],
        },
        remark: "冰湖城印象商店解锁-任意20",
    },
    "1040": {
        id: 1040,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 20]],
        },
        remark: "冰湖城印象商店解锁-功利20",
    },
    "1041": {
        id: 1041,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 20]],
        },
        remark: "冰湖城印象商店解锁-道德20",
    },
    "1042": {
        id: 1042,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 20]],
        },
        remark: "冰湖城印象商店解锁-才智20",
    },
    "1043": {
        id: 1043,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 20]],
        },
        remark: "冰湖城印象商店解锁-共情20",
    },
    "1044": {
        id: 1044,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 20]],
        },
        remark: "冰湖城印象商店解锁-混沌20",
    },
    "1045": {
        id: 1045,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 20]],
        },
        remark: "冰湖城印象商店解锁-全部20",
    },
    "1046": {
        id: 1046,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 30]],
        },
        remark: "冰湖城印象商店解锁-任意30",
    },
    "1047": {
        id: 1047,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 30]],
        },
        remark: "冰湖城印象商店解锁-功利30",
    },
    "1048": {
        id: 1048,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 30]],
        },
        remark: "冰湖城印象商店解锁-道德30",
    },
    "1049": {
        id: 1049,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 30]],
        },
        remark: "冰湖城印象商店解锁-才智30",
    },
    "1050": {
        id: 1050,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 30]],
        },
        remark: "冰湖城印象商店解锁-共情30",
    },
    "1051": {
        id: 1051,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 30]],
        },
        remark: "冰湖城印象商店解锁-混沌30",
    },
    "1052": {
        id: 1052,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 30]],
        },
        remark: "冰湖城印象商店解锁-全部30",
    },
    "1053": {
        id: 1053,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 40]],
        },
        remark: "冰湖城印象商店解锁-任意40",
    },
    "1054": {
        id: 1054,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 40]],
        },
        remark: "冰湖城印象商店解锁-功利40",
    },
    "1055": {
        id: 1055,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 40]],
        },
        remark: "冰湖城印象商店解锁-道德40",
    },
    "1056": {
        id: 1056,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 40]],
        },
        remark: "冰湖城印象商店解锁-才智40",
    },
    "1057": {
        id: 1057,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 40]],
        },
        remark: "冰湖城印象商店解锁-共情40",
    },
    "1058": {
        id: 1058,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 40]],
        },
        remark: "冰湖城印象商店解锁-混沌40",
    },
    "1059": {
        id: 1059,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 40]],
        },
        remark: "冰湖城印象商店解锁-全部40",
    },
    "1060": {
        id: 1060,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 50]],
        },
        remark: "冰湖城印象商店解锁-任意50",
    },
    "1061": {
        id: 1061,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 50]],
        },
        remark: "冰湖城印象商店解锁-功利50",
    },
    "1062": {
        id: 1062,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 50]],
        },
        remark: "冰湖城印象商店解锁-道德50",
    },
    "1063": {
        id: 1063,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 50]],
        },
        remark: "冰湖城印象商店解锁-才智50",
    },
    "1064": {
        id: 1064,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 50]],
        },
        remark: "冰湖城印象商店解锁-共情50",
    },
    "1065": {
        id: 1065,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 50]],
        },
        remark: "冰湖城印象商店解锁-混沌50",
    },
    "1066": {
        id: 1066,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 50]],
        },
        remark: "冰湖城印象商店解锁-全部50",
    },
    "1067": {
        id: 1067,
        logic: "AND",
        map: {
            QuestChain: [200213],
        },
        remark: "印象系统-玛尔洁",
    },
    "1068": {
        id: 1068,
        logic: "AND",
        map: {
            QuestChain: [200216],
        },
        remark: "印象系统-帝国三兄弟",
    },
    "1069": {
        id: 1069,
        logic: "AND",
        map: {
            Impression: [[510002, 1]],
        },
        remark: "印象系统-希琳夫人I阶段",
    },
    "1070": {
        id: 1070,
        logic: "AND",
        map: {
            Impression: [[510075, 1]],
        },
        remark: "印象系统-雪莉",
    },
    "1071": {
        id: 1071,
        logic: "AND",
        map: {
            Impression: [[510079, 1]],
        },
        remark: "印象系统-达顿",
    },
    "1072": {
        id: 1072,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 20]],
        },
        remark: "冰湖城印象商店解锁-混沌40（点滴）",
    },
    "1073": {
        id: 1073,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 20]],
        },
        remark: "冰湖城印象商店解锁-共情40（点滴）",
    },
    "1074": {
        id: 1074,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 20]],
        },
        remark: "冰湖城印象商店解锁-功利40（点滴）",
    },
    "1075": {
        id: 1075,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 20]],
        },
        remark: "冰湖城印象商店解锁-道德40（点滴）",
    },
    "1076": {
        id: 1076,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 20]],
        },
        remark: "冰湖城印象商店解锁-才智40（点滴）",
    },
    "1077": {
        id: 1077,
        logic: "AND",
        map: {
            Quest: [20020319],
        },
        remark: "不展示日记，爱丽丝变成安妮",
    },
    "1078": {
        id: 1078,
        logic: "OR",
        map: {
            Impression: [
                [510105, 2],
                [510105, 3],
            ],
        },
        remark: "凯文个人小传",
    },
    "1079": {
        id: 1079,
        logic: "AND",
        map: {
            Impression: [[510106, 1]],
        },
        remark: "吉姆个人小传",
    },
    "1080": {
        id: 1080,
        logic: "AND",
        map: {
            Impression: [[510107, 1]],
        },
        remark: "悲观皎皎个人小传",
    },
    "1081": {
        id: 1081,
        logic: "AND",
        map: {
            Impression: [[510109, 2]],
        },
        remark: "瓦伦个人小传",
    },
    "1082": {
        id: 1082,
        logic: "AND",
        map: {
            Impression: [[510111, 1]],
        },
        remark: "空空皎皎个人小传",
    },
    "1083": {
        id: 1083,
        logic: "AND",
        map: {
            Quest: [20023102],
        },
        remark: "多纳特个人小传",
    },
    "1084": {
        id: 1084,
        logic: "AND",
        map: {
            Quest: [20023102],
        },
        remark: "拉斯个人小传",
    },
    "1085": {
        id: 1085,
        logic: "AND",
        map: {
            Quest: [20023001],
        },
        remark: "薇奥莱塔个人小传",
    },
    "1086": {
        id: 1086,
        logic: "AND",
        map: {
            Quest: [20023202],
        },
        remark: "吉赛尔个人小传",
    },
    "1087": {
        id: 1087,
        logic: "AND",
        map: {
            Impression: [[500080, 1]],
        },
        remark: "赫斯特个人小传",
    },
    "1090": {
        id: 1090,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Any", 10]],
        },
        remark: "华胥印象商店解锁-任意10",
    },
    "1091": {
        id: 1091,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Benefit", 10]],
        },
        remark: "华胥印象商店解锁-功利10",
    },
    "1092": {
        id: 1092,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Morality", 10]],
        },
        remark: "华胥印象商店解锁-道德10",
    },
    "1093": {
        id: 1093,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Wisdom", 10]],
        },
        remark: "华胥印象商店解锁-才智10",
    },
    "1094": {
        id: 1094,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Empathy", 10]],
        },
        remark: "华胥印象商店解锁-共情10",
    },
    "1095": {
        id: 1095,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Chaos", 10]],
        },
        remark: "华胥印象商店解锁-混沌10",
    },
    "1096": {
        id: 1096,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "All", 10]],
        },
        remark: "华胥印象商店解锁-全部10",
    },
    "1097": {
        id: 1097,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Any", 20]],
        },
        remark: "华胥印象商店解锁-任意20",
    },
    "1098": {
        id: 1098,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Benefit", 20]],
        },
        remark: "华胥印象商店解锁-功利20",
    },
    "1099": {
        id: 1099,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Morality", 20]],
        },
        remark: "华胥印象商店解锁-道德20",
    },
    "1100": {
        id: 1100,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Wisdom", 20]],
        },
        remark: "华胥印象商店解锁-才智20",
    },
    "1101": {
        id: 1101,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Empathy", 20]],
        },
        remark: "华胥印象商店解锁-共情20",
    },
    "1102": {
        id: 1102,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Chaos", 20]],
        },
        remark: "华胥印象商店解锁-混沌20",
    },
    "1103": {
        id: 1103,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "All", 20]],
        },
        remark: "华胥印象商店解锁-全部20",
    },
    "1104": {
        id: 1104,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Any", 30]],
        },
        remark: "华胥印象商店解锁-任意30",
    },
    "1105": {
        id: 1105,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Benefit", 30]],
        },
        remark: "华胥印象商店解锁-功利30",
    },
    "1106": {
        id: 1106,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Morality", 30]],
        },
        remark: "华胥印象商店解锁-道德30",
    },
    "1107": {
        id: 1107,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Wisdom", 30]],
        },
        remark: "华胥印象商店解锁-才智30",
    },
    "1108": {
        id: 1108,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Empathy", 30]],
        },
        remark: "华胥印象商店解锁-共情30",
    },
    "1109": {
        id: 1109,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Chaos", 30]],
        },
        remark: "华胥印象商店解锁-混沌30",
    },
    "1110": {
        id: 1110,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "All", 30]],
        },
        remark: "华胥印象商店解锁-全部30",
    },
    "1111": {
        id: 1111,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Any", 40]],
        },
        remark: "华胥印象商店解锁-任意40",
    },
    "1112": {
        id: 1112,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Benefit", 40]],
        },
        remark: "华胥印象商店解锁-功利40",
    },
    "1113": {
        id: 1113,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Morality", 40]],
        },
        remark: "华胥印象商店解锁-道德40",
    },
    "1114": {
        id: 1114,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Wisdom", 40]],
        },
        remark: "华胥印象商店解锁-才智40",
    },
    "1115": {
        id: 1115,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Empathy", 40]],
        },
        remark: "华胥印象商店解锁-共情40",
    },
    "1116": {
        id: 1116,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Chaos", 40]],
        },
        remark: "华胥印象商店解锁-混沌40",
    },
    "1117": {
        id: 1117,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "All", 40]],
        },
        remark: "华胥印象商店解锁-全部40",
    },
    "1118": {
        id: 1118,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Any", 50]],
        },
        remark: "华胥印象商店解锁-任意50",
    },
    "1119": {
        id: 1119,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Benefit", 50]],
        },
        remark: "华胥印象商店解锁-功利50",
    },
    "1120": {
        id: 1120,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Morality", 50]],
        },
        remark: "华胥印象商店解锁-道德50",
    },
    "1121": {
        id: 1121,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Wisdom", 50]],
        },
        remark: "华胥印象商店解锁-才智50",
    },
    "1122": {
        id: 1122,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Empathy", 50]],
        },
        remark: "华胥印象商店解锁-共情50",
    },
    "1123": {
        id: 1123,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Chaos", 50]],
        },
        remark: "华胥印象商店解锁-混沌50",
    },
    "1124": {
        id: 1124,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "All", 50]],
        },
        remark: "华胥印象商店解锁-全部50",
    },
    "1125": {
        id: 1125,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Chaos", 20]],
        },
        remark: "华胥印象商店解锁-混沌40（点滴）",
    },
    "1126": {
        id: 1126,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Empathy", 20]],
        },
        remark: "华胥印象商店解锁-共情40（点滴）",
    },
    "1127": {
        id: 1127,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Benefit", 20]],
        },
        remark: "华胥印象商店解锁-功利40（点滴）",
    },
    "1128": {
        id: 1128,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Morality", 20]],
        },
        remark: "华胥印象商店解锁-道德40（点滴）",
    },
    "1129": {
        id: 1129,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1041, "Wisdom", 20]],
        },
        remark: "华胥印象商店解锁-才智40（点滴）",
    },
    "1130": {
        id: 1130,
        logic: "AND",
        map: {
            Impression: [[510127, 1]],
        },
        remark: "程老头个人小传",
    },
    "1131": {
        id: 1131,
        logic: "AND",
        map: {
            Impression: [[510127, 1]],
        },
        remark: "程夫人个人小传",
    },
    "1132": {
        id: 1132,
        logic: "AND",
        map: {
            Impression: [[510128, 1]],
        },
        remark: "蒋正义个人小传",
    },
    "1133": {
        id: 1133,
        logic: "AND",
        map: {
            Impression: [[510129, 1]],
        },
        remark: "萨米个人小传",
    },
    "1134": {
        id: 1134,
        logic: "AND",
        map: {
            Impression: [[510130, 1]],
        },
        remark: "李什个人小传",
    },
    "1135": {
        id: 1135,
        logic: "AND",
        map: {
            Impression: [[510123, 1]],
        },
        remark: "笃平个人小传",
    },
    "1136": {
        id: 1136,
        logic: "AND",
        map: {
            Impression: [[510125, 1]],
        },
        remark: "饴生个人小传",
    },
    "1137": {
        id: 1137,
        logic: "AND",
        map: {
            Impression: [[510126, 1]],
        },
        remark: "拉蒙个人小传",
    },
    "1138": {
        id: 1138,
        logic: "AND",
        map: {
            Impression: [[510133, 1]],
        },
        remark: "筱云个人小传",
    },
    "1139": {
        id: 1139,
        logic: "AND",
        map: {
            Impression: [[510134, 1]],
        },
        remark: "具睦个人小传",
    },
    "1140": {
        id: 1140,
        logic: "AND",
        map: {
            Impression: [[510137, 1]],
        },
        remark: "权都通个人小传",
    },
    "1141": {
        id: 1141,
        logic: "AND",
        map: {
            Impression: [[510138, 1]],
        },
        remark: "黄药师个人小传",
    },
    "1142": {
        id: 1142,
        logic: "AND",
        map: {
            Impression: [[510139, 1]],
        },
        remark: "余下个人小传",
    },
    "1143": {
        id: 1143,
        logic: "AND",
        map: {
            Impression: [[510139, 1]],
        },
        remark: "董筑个人小传",
    },
    "1144": {
        id: 1144,
        logic: "AND",
        map: {
            Impression: [[510140, 1]],
        },
        remark: "酒瓢子个人小传",
    },
    "1145": {
        id: 1145,
        logic: "AND",
        map: {
            Impression: [[510141, 1]],
        },
        remark: "丰登个人小传",
    },
    "1146": {
        id: 1146,
        logic: "AND",
        map: {
            Impression: [[510142, 1]],
        },
        remark: "灵异皎皎个人小传",
    },
    "1147": {
        id: 1147,
        logic: "AND",
        map: {
            Impression: [[510153, 1]],
        },
        remark: "花留情个人小传",
    },
    "1148": {
        id: 1148,
        logic: "AND",
        map: {
            Impression: [[510155, 1]],
        },
        remark: "罗汉个人小传",
    },
    "1149": {
        id: 1149,
        logic: "AND",
        map: {
            Impression: [[510157, 1]],
        },
        remark: "乐观皎皎个人小传",
    },
    "1150": {
        id: 1150,
        logic: "AND",
        map: {
            Impression: [[510159, 1]],
        },
        remark: "萍姐个人小传",
    },
    "1151": {
        id: 1151,
        logic: "AND",
        map: {
            Impression: [[510160, 1]],
        },
        remark: "程宫个人小传",
    },
    "1152": {
        id: 1152,
        logic: "AND",
        map: {
            Impression: [[510161, 1]],
        },
        remark: "诸葛明个人小传",
    },
    "1153": {
        id: 1153,
        logic: "AND",
        map: {
            Impression: [[510162, 1]],
        },
        remark: "香官皎皎个人小传",
    },
    "1154": {
        id: 1154,
        logic: "AND",
        map: {
            Impression: [[510163, 1]],
        },
        remark: "因何生个人小传",
    },
    "1155": {
        id: 1155,
        logic: "AND",
        map: {
            Impression: [[510166, 1]],
        },
        remark: "史迪森个人小传",
    },
    "1156": {
        id: 1156,
        logic: "AND",
        map: {
            Impression: [[510168, 1]],
        },
        remark: "时尚少女个人小传",
    },
    "1157": {
        id: 1157,
        logic: "AND",
        map: {
            Impression: [[510171, 1]],
        },
        remark: "格罗瑞亚个人小传",
    },
    "1158": {
        id: 1158,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 60]],
        },
        remark: "冰湖城印象商店解锁-任意60",
    },
    "1159": {
        id: 1159,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 60]],
        },
        remark: "冰湖城印象商店解锁-功利60",
    },
    "1160": {
        id: 1160,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 60]],
        },
        remark: "冰湖城印象商店解锁-道德60",
    },
    "1161": {
        id: 1161,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 60]],
        },
        remark: "冰湖城印象商店解锁-才智60",
    },
    "1162": {
        id: 1162,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 60]],
        },
        remark: "冰湖城印象商店解锁-共情60",
    },
    "1163": {
        id: 1163,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 60]],
        },
        remark: "冰湖城印象商店解锁-混沌60",
    },
    "1164": {
        id: 1164,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 60]],
        },
        remark: "冰湖城印象商店解锁-全部60",
    },
    "1165": {
        id: 1165,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 80]],
        },
        remark: "冰湖城印象商店解锁-任意80",
    },
    "1166": {
        id: 1166,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 80]],
        },
        remark: "冰湖城印象商店解锁-功利80",
    },
    "1167": {
        id: 1167,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 80]],
        },
        remark: "冰湖城印象商店解锁-道德80",
    },
    "1168": {
        id: 1168,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 80]],
        },
        remark: "冰湖城印象商店解锁-才智80",
    },
    "1169": {
        id: 1169,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 80]],
        },
        remark: "冰湖城印象商店解锁-共情80",
    },
    "1170": {
        id: 1170,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 80]],
        },
        remark: "冰湖城印象商店解锁-混沌80",
    },
    "1171": {
        id: 1171,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 80]],
        },
        remark: "冰湖城印象商店解锁-全部80",
    },
    "1172": {
        id: 1172,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 100]],
        },
        remark: "冰湖城印象商店解锁-任意100",
    },
    "1173": {
        id: 1173,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 100]],
        },
        remark: "冰湖城印象商店解锁-功利100",
    },
    "1174": {
        id: 1174,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 100]],
        },
        remark: "冰湖城印象商店解锁-道德100",
    },
    "1175": {
        id: 1175,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 100]],
        },
        remark: "冰湖城印象商店解锁-才智100",
    },
    "1176": {
        id: 1176,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 100]],
        },
        remark: "冰湖城印象商店解锁-共情100",
    },
    "1177": {
        id: 1177,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 100]],
        },
        remark: "冰湖城印象商店解锁-混沌100",
    },
    "1178": {
        id: 1178,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 100]],
        },
        remark: "冰湖城印象商店解锁-全部100",
    },
    "1179": {
        id: 1179,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Any", 120]],
        },
        remark: "冰湖城印象商店解锁-任意120",
    },
    "1180": {
        id: 1180,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Benefit", 120]],
        },
        remark: "冰湖城印象商店解锁-功利120",
    },
    "1181": {
        id: 1181,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Morality", 120]],
        },
        remark: "冰湖城印象商店解锁-道德120",
    },
    "1182": {
        id: 1182,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Wisdom", 120]],
        },
        remark: "冰湖城印象商店解锁-才智120",
    },
    "1183": {
        id: 1183,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Empathy", 120]],
        },
        remark: "冰湖城印象商店解锁-共情120",
    },
    "1184": {
        id: 1184,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "Chaos", 120]],
        },
        remark: "冰湖城印象商店解锁-混沌120",
    },
    "1185": {
        id: 1185,
        logic: "AND",
        map: {
            ImprShopUnlock: [[1011, "All", 120]],
        },
        remark: "冰湖城印象商店解锁-全部120",
    },
    "2001": {
        id: 2001,
        logic: "AND",
        map: {
            QuestChain: [200104],
        },
        remark: "梦魇残声-BossXibi难度1解锁",
    },
    "2002": {
        id: 2002,
        logic: "OR",
        map: {
            DungeonComplete: [[50101, 1, 1]],
            HardBossComplete: [[1001, 1]],
        },
        remark: "梦魇残声-BossXibi难度2解锁",
    },
    "2003": {
        id: 2003,
        logic: "OR",
        map: {
            DungeonComplete: [[50102, 1, 1]],
            HardBossComplete: [[1002, 1]],
        },
        remark: "梦魇残声-BossXibi难度3解锁",
    },
    "2004": {
        id: 2004,
        logic: "OR",
        map: {
            DungeonComplete: [[50103, 1, 1]],
            HardBossComplete: [[1003, 1]],
        },
        remark: "梦魇残声-BossXibi难度4解锁",
    },
    "2005": {
        id: 2005,
        logic: "OR",
        map: {
            DungeonComplete: [[50104, 1, 1]],
            HardBossComplete: [[1004, 1]],
        },
        remark: "梦魇残声-BossXibi难度5解锁",
    },
    "2006": {
        id: 2006,
        logic: "OR",
        map: {
            DungeonComplete: [[50105, 1, 1]],
            HardBossComplete: [[1005, 1]],
        },
        remark: "梦魇残声-BossXibi难度6解锁",
    },
    "2011": {
        id: 2011,
        logic: "AND",
        map: {
            QuestChain: [200104],
        },
        remark: "梦魇残声-BossShijingzhe难度1解锁",
    },
    "2012": {
        id: 2012,
        logic: "OR",
        map: {
            DungeonComplete: [[50201, 1, 1]],
            HardBossComplete: [[1011, 1]],
        },
        remark: "梦魇残声-BossShijingzhe难度2解锁",
    },
    "2013": {
        id: 2013,
        logic: "OR",
        map: {
            DungeonComplete: [[50202, 1, 1]],
            HardBossComplete: [[1012, 1]],
        },
        remark: "梦魇残声-BossShijingzhe难度3解锁",
    },
    "2014": {
        id: 2014,
        logic: "OR",
        map: {
            DungeonComplete: [[50203, 1, 1]],
            HardBossComplete: [[1013, 1]],
        },
        remark: "梦魇残声-BossShijingzhe难度4解锁",
    },
    "2015": {
        id: 2015,
        logic: "OR",
        map: {
            DungeonComplete: [[50204, 1, 1]],
            HardBossComplete: [[1014, 1]],
        },
        remark: "梦魇残声-BossShijingzhe难度5解锁",
    },
    "2016": {
        id: 2016,
        logic: "OR",
        map: {
            DungeonComplete: [[50205, 1, 1]],
            HardBossComplete: [[1015, 1]],
        },
        remark: "梦魇残声-BossShijingzhe难度6解锁",
    },
    "2021": {
        id: 2021,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "梦魇残声-BossSaiqi难度1解锁",
    },
    "2022": {
        id: 2022,
        logic: "OR",
        map: {
            DungeonComplete: [[50301, 1, 1]],
            HardBossComplete: [[1021, 1]],
        },
        remark: "梦魇残声-BossSaiqi难度2解锁",
    },
    "2023": {
        id: 2023,
        logic: "OR",
        map: {
            DungeonComplete: [[50302, 1, 1]],
            HardBossComplete: [[1022, 1]],
        },
        remark: "梦魇残声-BossSaiqi难度3解锁",
    },
    "2024": {
        id: 2024,
        logic: "OR",
        map: {
            DungeonComplete: [[50303, 1, 1]],
            HardBossComplete: [[1023, 1]],
        },
        remark: "梦魇残声-BossSaiqi难度4解锁",
    },
    "2025": {
        id: 2025,
        logic: "OR",
        map: {
            DungeonComplete: [[50304, 1, 1]],
            HardBossComplete: [[1024, 1]],
        },
        remark: "梦魇残声-BossSaiqi难度5解锁",
    },
    "2026": {
        id: 2026,
        logic: "OR",
        map: {
            DungeonComplete: [[50305, 1, 1]],
            HardBossComplete: [[1025, 1]],
        },
        remark: "梦魇残声-BossSaiqi难度6解锁",
    },
    "2027": {
        id: 2027,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "梦魇残声系统解锁-赛琪",
    },
    "2031": {
        id: 2031,
        logic: "AND",
        map: {
            QuestChain: [110109],
        },
        remark: "梦魇残声-BossHaier难度1解锁",
    },
    "2032": {
        id: 2032,
        logic: "OR",
        map: {
            DungeonComplete: [[50401, 1, 1]],
            HardBossComplete: [[1031, 1]],
        },
        remark: "梦魇残声-BossHaier难度2解锁",
    },
    "2033": {
        id: 2033,
        logic: "OR",
        map: {
            DungeonComplete: [[50402, 1, 1]],
            HardBossComplete: [[1032, 1]],
        },
        remark: "梦魇残声-BossHaier难度3解锁",
    },
    "2034": {
        id: 2034,
        logic: "OR",
        map: {
            DungeonComplete: [[50403, 1, 1]],
            HardBossComplete: [[1033, 1]],
        },
        remark: "梦魇残声-BossHaier难度4解锁",
    },
    "2035": {
        id: 2035,
        logic: "OR",
        map: {
            DungeonComplete: [[50404, 1, 1]],
            HardBossComplete: [[1034, 1]],
        },
        remark: "梦魇残声-BossHaier难度5解锁",
    },
    "2036": {
        id: 2036,
        logic: "OR",
        map: {
            DungeonComplete: [[50405, 1, 1]],
            HardBossComplete: [[1035, 1]],
        },
        remark: "梦魇残声-BossHaier难度6解锁",
    },
    "2037": {
        id: 2037,
        logic: "AND",
        map: {
            QuestChain: [110109],
        },
        remark: "梦魇残声系统解锁-海尔法",
    },
    "2041": {
        id: 2041,
        logic: "AND",
        map: {
            QuestChain: [100306],
        },
        remark: "梦魇残声-BossLinen难度1解锁",
    },
    "2042": {
        id: 2042,
        logic: "OR",
        map: {
            DungeonComplete: [[50501, 1, 1]],
            HardBossComplete: [[1041, 1]],
        },
        remark: "梦魇残声-BossLinen难度2解锁",
    },
    "2043": {
        id: 2043,
        logic: "OR",
        map: {
            DungeonComplete: [[50502, 1, 1]],
            HardBossComplete: [[1042, 1]],
        },
        remark: "梦魇残声-BossLinen难度3解锁",
    },
    "2044": {
        id: 2044,
        logic: "OR",
        map: {
            DungeonComplete: [[50503, 1, 1]],
            HardBossComplete: [[1043, 1]],
        },
        remark: "梦魇残声-BossLinen难度4解锁",
    },
    "2045": {
        id: 2045,
        logic: "OR",
        map: {
            DungeonComplete: [[50504, 1, 1]],
            HardBossComplete: [[1044, 1]],
        },
        remark: "梦魇残声-BossLinen难度5解锁",
    },
    "2046": {
        id: 2046,
        logic: "OR",
        map: {
            DungeonComplete: [[50505, 1, 1]],
            HardBossComplete: [[1045, 1]],
        },
        remark: "梦魇残声-BossLinen难度6解锁",
    },
    "2047": {
        id: 2047,
        logic: "AND",
        map: {
            QuestChain: [100306],
        },
        remark: "梦魇残声系统解锁-BossLinen",
    },
    "2048": {
        id: 2048,
        logic: "OR",
        map: {
            HardBossComplete: [
                [1001, 1],
                [1011, 1],
                [1021, 1],
                [1031, 1],
                [1041, 1],
                [1051, 1],
            ],
        },
        remark: "梦魇残声-通过任意一次梦魇（埋点用）",
    },
    "2051": {
        id: 2051,
        logic: "AND",
        map: {
            QuestChain: [120206],
        },
        remark: "梦魇残声-BossBailong难度1解锁",
    },
    "2052": {
        id: 2052,
        logic: "OR",
        map: {
            DungeonComplete: [[50601, 1, 1]],
            HardBossComplete: [[1051, 1]],
        },
        remark: "梦魇残声-BossBailong难度2解锁",
    },
    "2053": {
        id: 2053,
        logic: "OR",
        map: {
            DungeonComplete: [[50602, 1, 1]],
            HardBossComplete: [[1052, 1]],
        },
        remark: "梦魇残声-BossBailong难度3解锁",
    },
    "2054": {
        id: 2054,
        logic: "OR",
        map: {
            DungeonComplete: [[50603, 1, 1]],
            HardBossComplete: [[1053, 1]],
        },
        remark: "梦魇残声-BossBailong难度4解锁",
    },
    "2055": {
        id: 2055,
        logic: "OR",
        map: {
            DungeonComplete: [[50604, 1, 1]],
            HardBossComplete: [[1054, 1]],
        },
        remark: "梦魇残声-BossBailong难度5解锁",
    },
    "2056": {
        id: 2056,
        logic: "OR",
        map: {
            DungeonComplete: [[50605, 1, 1]],
            HardBossComplete: [[1055, 1]],
        },
        remark: "梦魇残声-BossBailong难度6解锁",
    },
    "2057": {
        id: 2057,
        logic: "AND",
        map: {
            QuestChain: [120206],
        },
        remark: "梦魇残声系统解锁--BossBailong",
    },
    "2061": {
        id: 2061,
        logic: "AND",
        map: {
            QuestChain: [100405],
        },
        remark: "梦魇残声-BossLieche难度1解锁",
    },
    "2062": {
        id: 2062,
        logic: "OR",
        map: {
            DungeonComplete: [[50701, 1, 1]],
            HardBossComplete: [[1061, 1]],
        },
        remark: "梦魇残声-BossLieche难度2解锁",
    },
    "2063": {
        id: 2063,
        logic: "OR",
        map: {
            DungeonComplete: [[50702, 1, 1]],
            HardBossComplete: [[1062, 1]],
        },
        remark: "梦魇残声-BossLieche难度3解锁",
    },
    "2064": {
        id: 2064,
        logic: "OR",
        map: {
            DungeonComplete: [[50703, 1, 1]],
            HardBossComplete: [[1063, 1]],
        },
        remark: "梦魇残声-BossLieche难度4解锁",
    },
    "2065": {
        id: 2065,
        logic: "OR",
        map: {
            DungeonComplete: [[50704, 1, 1]],
            HardBossComplete: [[1064, 1]],
        },
        remark: "梦魇残声-BossLieche难度5解锁",
    },
    "2066": {
        id: 2066,
        logic: "OR",
        map: {
            DungeonComplete: [[50705, 1, 1]],
            HardBossComplete: [[1065, 1]],
        },
        remark: "梦魇残声-BossLieche难度6解锁",
    },
    "2067": {
        id: 2067,
        logic: "AND",
        map: {
            QuestChain: [100405],
        },
        remark: "梦魇残声系统解锁-BossLieche",
    },
    "2071": {
        id: 2071,
        logic: "AND",
        map: {
            QuestChain: [110232],
        },
        remark: "梦魇残声-Boss艾达难度1解锁",
    },
    "2072": {
        id: 2072,
        logic: "OR",
        map: {
            DungeonComplete: [[50801, 1, 1]],
            HardBossComplete: [[1071, 1]],
        },
        remark: "梦魇残声-Boss艾达难度2解锁",
    },
    "2073": {
        id: 2073,
        logic: "OR",
        map: {
            DungeonComplete: [[50802, 1, 1]],
            HardBossComplete: [[1072, 1]],
        },
        remark: "梦魇残声-Boss艾达难度3解锁",
    },
    "2074": {
        id: 2074,
        logic: "OR",
        map: {
            DungeonComplete: [[50803, 1, 1]],
            HardBossComplete: [[1073, 1]],
        },
        remark: "梦魇残声-Boss艾达难度4解锁",
    },
    "2075": {
        id: 2075,
        logic: "OR",
        map: {
            DungeonComplete: [[50804, 1, 1]],
            HardBossComplete: [[1074, 1]],
        },
        remark: "梦魇残声-Boss艾达难度5解锁",
    },
    "2076": {
        id: 2076,
        logic: "OR",
        map: {
            DungeonComplete: [[50805, 1, 1]],
            HardBossComplete: [[1075, 1]],
        },
        remark: "梦魇残声-Boss艾达难度6解锁",
    },
    "2077": {
        id: 2077,
        logic: "AND",
        map: {
            QuestChain: [110232],
        },
        remark: "梦魇残声系统解锁-Boss艾达",
    },
    "3001": {
        id: 3001,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100203],
        },
        remark: "高级副本入口解锁条件",
    },
    "3002": {
        id: 3002,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100203],
        },
        remark: "中级副本入口解锁条件",
    },
    "3003": {
        id: 3003,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100202],
        },
        remark: "低级副本入口解锁条件",
    },
    "3004": {
        id: 3004,
        logic: "AND",
        map: {
            TimeArrived: ["2026-08-18 10:00:00"],
        },
        remark: "钢铁防御入口解锁条件",
    },
    "3011": {
        id: 3011,
        logic: "AND",
        map: {
            DungeonComplete: [[90102, 1, 1]],
        },
        remark: "副本-扼守·无尽30级解锁条件",
    },
    "3012": {
        id: 3012,
        logic: "AND",
        map: {
            DungeonComplete: [[90104, 1, 1]],
        },
        remark: "副本-扼守·无尽40级解锁条件",
    },
    "3013": {
        id: 3013,
        logic: "AND",
        map: {
            DungeonComplete: [[90106, 1, 1]],
        },
        remark: "副本-扼守·无尽50级解锁条件",
    },
    "3014": {
        id: 3014,
        logic: "AND",
        map: {
            DungeonComplete: [[90108, 1, 1]],
        },
        remark: "副本-扼守·无尽60级解锁条件",
    },
    "3015": {
        id: 3015,
        logic: "AND",
        map: {
            DungeonComplete: [[90110, 1, 1]],
        },
        remark: "副本-扼守·无尽70级解锁条件",
    },
    "3016": {
        id: 3016,
        logic: "AND",
        map: {
            DungeonComplete: [[90112, 1, 1]],
        },
        remark: "副本-扼守·无尽80级解锁条件",
    },
    "3021": {
        id: 3021,
        logic: "AND",
        map: {
            DungeonComplete: [[90103, 1, 1]],
        },
        remark: "副本-扼守50级解锁条件",
    },
    "3031": {
        id: 3031,
        logic: "AND",
        map: {
            DungeonComplete: [[90201, 1, 1]],
        },
        remark: "副本-勘探·无尽20级解锁条件",
    },
    "3032": {
        id: 3032,
        logic: "AND",
        map: {
            DungeonComplete: [[90202, 1, 1]],
        },
        remark: "副本-勘探·无尽30级解锁条件",
    },
    "3033": {
        id: 3033,
        logic: "AND",
        map: {
            DungeonComplete: [[90203, 1, 1]],
        },
        remark: "副本-勘探·无尽40级解锁条件",
    },
    "3034": {
        id: 3034,
        logic: "AND",
        map: {
            DungeonComplete: [[90204, 1, 1]],
        },
        remark: "副本-勘探·无尽50级解锁条件",
    },
    "3035": {
        id: 3035,
        logic: "AND",
        map: {
            DungeonComplete: [[90205, 1, 1]],
        },
        remark: "副本-勘探·无尽60级解锁条件",
    },
    "3036": {
        id: 3036,
        logic: "AND",
        map: {
            DungeonComplete: [[90206, 1, 1]],
        },
        remark: "副本-勘探·无尽70级解锁条件",
    },
    "3041": {
        id: 3041,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90301, 1, 1],
                [90302, 1, 1],
                [90303, 1, 1],
                [90304, 1, 1],
                [90305, 1, 1],
            ],
        },
        remark: "副本-追缉20级解锁条件",
    },
    "3042": {
        id: 3042,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90306, 1, 1],
                [90307, 1, 1],
            ],
        },
        remark: "副本-追缉30级解锁条件",
    },
    "3051": {
        id: 3051,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90401, 1, 1],
                [90402, 1, 1],
                [90403, 1, 1],
                [90404, 1, 1],
                [90405, 1, 1],
                [90406, 1, 1],
            ],
        },
        remark: "副本-探险20级解锁条件",
    },
    "3052": {
        id: 3052,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90407, 1, 1],
                [90408, 1, 1],
                [90409, 1, 1],
                [90410, 1, 1],
                [90411, 1, 1],
                [90412, 1, 1],
            ],
        },
        remark: "副本-探险30级解锁条件",
    },
    "3053": {
        id: 3053,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90413, 1, 1],
                [90414, 1, 1],
                [90415, 1, 1],
                [90416, 1, 1],
                [90417, 1, 1],
                [90418, 1, 1],
            ],
        },
        remark: "副本-探险40级解锁条件",
    },
    "3054": {
        id: 3054,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90419, 1, 1],
                [90420, 1, 1],
                [90421, 1, 1],
                [90422, 1, 1],
                [90423, 1, 1],
                [90424, 1, 1],
            ],
        },
        remark: "副本-探险50级解锁条件",
    },
    "3055": {
        id: 3055,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90425, 1, 1],
                [90426, 1, 1],
                [90427, 1, 1],
                [90428, 1, 1],
                [90429, 1, 1],
                [90430, 1, 1],
            ],
        },
        remark: "副本-探险60级解锁条件",
    },
    "3056": {
        id: 3056,
        logic: "OR",
        map: {
            DungeonComplete: [
                [90431, 1, 1],
                [90432, 1, 1],
                [90433, 1, 1],
                [90434, 1, 1],
                [90435, 1, 1],
                [90436, 1, 1],
            ],
        },
        remark: "副本-探险70级解锁条件",
    },
    "3061": {
        id: 3061,
        logic: "AND",
        map: {
            DungeonComplete: [[90501, 1, 1]],
        },
        remark: "副本-调停30级解锁条件",
    },
    "3062": {
        id: 3062,
        logic: "AND",
        map: {
            DungeonComplete: [[90502, 1, 1]],
        },
        remark: "副本-调停40级解锁条件",
    },
    "3063": {
        id: 3063,
        logic: "AND",
        map: {
            DungeonComplete: [[90503, 1, 1]],
        },
        remark: "副本-调停50级解锁条件",
    },
    "3064": {
        id: 3064,
        logic: "AND",
        map: {
            DungeonComplete: [[90504, 1, 1]],
        },
        remark: "副本-调停60级解锁条件",
    },
    "3065": {
        id: 3065,
        logic: "AND",
        map: {
            DungeonComplete: [[90505, 1, 1]],
        },
        remark: "副本-调停70级解锁条件",
    },
    "3066": {
        id: 3066,
        logic: "AND",
        map: {
            DungeonComplete: [[90506, 1, 1]],
        },
        remark: "副本-调停80级解锁条件",
    },
    "3071": {
        id: 3071,
        logic: "AND",
        map: {
            DungeonComplete: [[90601, 1, 1]],
        },
        remark: "副本-避险20级解锁条件",
    },
    "3072": {
        id: 3072,
        logic: "AND",
        map: {
            DungeonComplete: [[90602, 1, 1]],
        },
        remark: "副本-避险35级解锁条件",
    },
    "3073": {
        id: 3073,
        logic: "AND",
        map: {
            DungeonComplete: [[90603, 1, 1]],
        },
        remark: "副本-避险50级解锁条件",
    },
    "3074": {
        id: 3074,
        logic: "AND",
        map: {
            DungeonComplete: [[90604, 1, 1]],
        },
        remark: "副本-避险60级解锁条件",
    },
    "3075": {
        id: 3075,
        logic: "AND",
        map: {
            DungeonComplete: [[90605, 1, 1]],
        },
        remark: "副本-避险70级解锁条件",
    },
    "3076": {
        id: 3076,
        logic: "AND",
        map: {
            DungeonComplete: [[90606, 1, 1]],
        },
        remark: "副本-避险80级解锁条件",
    },
    "3100": {
        id: 3100,
        logic: "AND",
        map: {
            DungeonComplete: [[90305, 1, 1]],
        },
        remark: "副本-追缉30级解锁条件",
    },
    "3101": {
        id: 3101,
        logic: "AND",
        map: {
            DungeonComplete: [[90306, 1, 1]],
        },
        remark: "副本-追缉40级解锁条件",
    },
    "3102": {
        id: 3102,
        logic: "AND",
        map: {
            DungeonComplete: [[90307, 1, 1]],
        },
        remark: "副本-追缉50级解锁条件",
    },
    "3103": {
        id: 3103,
        logic: "AND",
        map: {
            DungeonComplete: [[90308, 1, 1]],
        },
        remark: "副本-追缉60级解锁条件",
    },
    "3104": {
        id: 3104,
        logic: "AND",
        map: {
            DungeonComplete: [[90309, 1, 1]],
        },
        remark: "副本-追缉70级解锁条件",
    },
    "3105": {
        id: 3105,
        logic: "AND",
        map: {
            DungeonComplete: [[90310, 1, 1]],
        },
        remark: "副本-追缉80级解锁条件",
    },
    "3110": {
        id: 3110,
        logic: "AND",
        map: {
            DungeonComplete: [[90101, 1, 1]],
        },
        remark: "副本-防御2时间-30级解锁条件",
    },
    "3111": {
        id: 3111,
        logic: "AND",
        map: {
            DungeonComplete: [[90103, 1, 1]],
        },
        remark: "副本-防御2时间-40级解锁条件",
    },
    "3112": {
        id: 3112,
        logic: "AND",
        map: {
            DungeonComplete: [[90105, 1, 1]],
        },
        remark: "副本-防御2时间-50级解锁条件",
    },
    "3113": {
        id: 3113,
        logic: "AND",
        map: {
            DungeonComplete: [[90107, 1, 1]],
        },
        remark: "副本-防御2时间-60级解锁条件",
    },
    "3114": {
        id: 3114,
        logic: "AND",
        map: {
            DungeonComplete: [[90109, 1, 1]],
        },
        remark: "副本-防御2时间-70级解锁条件",
    },
    "3115": {
        id: 3115,
        logic: "AND",
        map: {
            DungeonComplete: [[90111, 1, 1]],
        },
        remark: "副本-防御2时间-80级解锁条件",
    },
    "3120": {
        id: 3120,
        logic: "AND",
        map: {
            DungeonComplete: [[91001, 1, 1]],
        },
        remark: "副本-圣殿30级解锁条件",
    },
    "3121": {
        id: 3121,
        logic: "AND",
        map: {
            DungeonComplete: [[91002, 1, 1]],
        },
        remark: "副本-圣殿40级解锁条件",
    },
    "3122": {
        id: 3122,
        logic: "AND",
        map: {
            DungeonComplete: [[91003, 1, 1]],
        },
        remark: "副本-圣殿50级解锁条件",
    },
    "3123": {
        id: 3123,
        logic: "AND",
        map: {
            DungeonComplete: [[91004, 1, 1]],
        },
        remark: "副本-圣殿60级解锁条件",
    },
    "3124": {
        id: 3124,
        logic: "AND",
        map: {
            DungeonComplete: [[91005, 1, 1]],
        },
        remark: "副本-圣殿70级解锁条件",
    },
    "3125": {
        id: 3125,
        logic: "AND",
        map: {
            DungeonComplete: [[91006, 1, 1]],
        },
        remark: "副本-圣殿80级解锁条件",
    },
    "3130": {
        id: 3130,
        logic: "AND",
        map: {
            DungeonComplete: [[90901, 1, 1]],
        },
        remark: "副本-搜救30级解锁条件",
    },
    "3131": {
        id: 3131,
        logic: "AND",
        map: {
            DungeonComplete: [[90902, 1, 1]],
        },
        remark: "副本-搜救40级解锁条件",
    },
    "3132": {
        id: 3132,
        logic: "AND",
        map: {
            DungeonComplete: [[90903, 1, 1]],
        },
        remark: "副本-搜救50级解锁条件",
    },
    "3133": {
        id: 3133,
        logic: "AND",
        map: {
            DungeonComplete: [[90904, 1, 1]],
        },
        remark: "副本-搜救60级解锁条件",
    },
    "3134": {
        id: 3134,
        logic: "AND",
        map: {
            DungeonComplete: [[90905, 1, 1]],
        },
        remark: "副本-搜救70级解锁条件",
    },
    "3135": {
        id: 3135,
        logic: "AND",
        map: {
            DungeonComplete: [[90906, 1, 1]],
        },
        remark: "副本-搜救80级解锁条件",
    },
    "3140": {
        id: 3140,
        logic: "AND",
        map: {
            DungeonComplete: [[90701, 1, 1]],
        },
        remark: "副本-推车30级解锁条件",
    },
    "3141": {
        id: 3141,
        logic: "AND",
        map: {
            DungeonComplete: [[90702, 1, 1]],
        },
        remark: "副本-推车40级解锁条件",
    },
    "3142": {
        id: 3142,
        logic: "AND",
        map: {
            DungeonComplete: [[90703, 1, 1]],
        },
        remark: "副本-推车50级解锁条件",
    },
    "3143": {
        id: 3143,
        logic: "AND",
        map: {
            DungeonComplete: [[90704, 1, 1]],
        },
        remark: "副本-推车60级解锁条件",
    },
    "3144": {
        id: 3144,
        logic: "AND",
        map: {
            DungeonComplete: [[90705, 1, 1]],
        },
        remark: "副本-推车70级解锁条件",
    },
    "3145": {
        id: 3145,
        logic: "AND",
        map: {
            DungeonComplete: [[90706, 1, 1]],
        },
        remark: "副本-推车80级解锁条件",
    },
    "3150": {
        id: 3150,
        logic: "AND",
        map: {
            DungeonComplete: [[90801, 1, 1]],
        },
        remark: "副本-歼灭30级解锁条件",
    },
    "3151": {
        id: 3151,
        logic: "AND",
        map: {
            DungeonComplete: [[90802, 1, 1]],
        },
        remark: "副本-歼灭40级解锁条件",
    },
    "3152": {
        id: 3152,
        logic: "AND",
        map: {
            DungeonComplete: [[90803, 1, 1]],
        },
        remark: "副本-歼灭50级解锁条件",
    },
    "3153": {
        id: 3153,
        logic: "AND",
        map: {
            DungeonComplete: [[90804, 1, 1]],
        },
        remark: "副本-歼灭60级解锁条件",
    },
    "3154": {
        id: 3154,
        logic: "AND",
        map: {
            DungeonComplete: [[90805, 1, 1]],
        },
        remark: "副本-歼灭70级解锁条件",
    },
    "3155": {
        id: 3155,
        logic: "AND",
        map: {
            DungeonComplete: [[90806, 1, 1]],
        },
        remark: "副本-歼灭80级解锁条件",
    },
    "4010": {
        id: 4010,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10010209],
        },
        remark: "背包解锁条件",
    },
    "4020": {
        id: 4020,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10010308],
        },
        remark: "军械库解锁条件",
    },
    "4021": {
        id: 4021,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10010212],
        },
        remark: "技能解锁条件",
    },
    "4030": {
        id: 4030,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020101],
        },
        remark: "商城解锁条件",
    },
    "4040": {
        id: 4040,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020101],
        },
        remark: "抽卡系统解锁条件",
    },
    "4041": {
        id: 4041,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020101],
        },
        remark: "全部卡池解锁条件",
    },
    "4050": {
        id: 4050,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10010106],
        },
        remark: "大地图与传送解锁条件",
    },
    "4060": {
        id: 4060,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "看板娘解锁条件",
    },
    "4070": {
        id: 4070,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
        },
        remark: "成就系统解锁条件",
    },
    "4080": {
        id: 4080,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [20010103],
        },
        remark: "锻造系统解锁条件",
    },
    "4090": {
        id: 4090,
        logic: "AND",
        map: {
            EquipPetId: [-1],
        },
        remark: "宠物系统解锁条件",
    },
    "4100": {
        id: 4100,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "邮箱解锁条件",
    },
    "4110": {
        id: 4110,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "玩法入口解锁条件",
    },
    "4120": {
        id: 4120,
        logic: "AND",
        map: {
            QuestChain: [200104],
        },
        remark: "梦魇残声系统解锁-仅限前三个boss",
    },
    "4130": {
        id: 4130,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100201],
        },
        remark: "任务系统解锁条件",
    },
    "4140": {
        id: 4140,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [200101],
        },
        remark: "战斗轮盘解锁条件",
    },
    "4150": {
        id: 4150,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "公告解锁条件",
    },
    "4160": {
        id: 4160,
        logic: "AND",
        map: {
            PlayerLevelMin: [9],
            QuestChain: [100202],
        },
        remark: "MOD解锁条件",
    },
    "4170": {
        id: 4170,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100208],
        },
        remark: "肉鸽解锁条件",
    },
    "4180": {
        id: 4180,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10010106],
        },
        remark: "教学手册解锁条件",
    },
    "4190": {
        id: 4190,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "好友系统解锁",
    },
    "4191": {
        id: 4191,
        logic: "AND",
        map: {
            PlayerLevelMin: [30],
            QuestChain: [100208],
        },
        remark: "公会系统解锁",
    },
    "4192": {
        id: 4192,
        logic: "AND",
        map: {
            InGuild: [0],
        },
        remark: "玩家在公会中",
    },
    "4200": {
        id: 4200,
        logic: "AND",
        map: {
            Quest: [10020608],
        },
        remark: "相机系统解锁",
    },
    "4210": {
        id: 4210,
        logic: "AND",
        map: {
            PlayerLevelMin: [25],
            QuestChain: [100208],
        },
        remark: "极化系统解锁",
    },
    "4220": {
        id: 4220,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020101],
        },
        remark: "活动系统解锁",
    },
    "4221": {
        id: 4221,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
            QuestChain: [200103],
        },
        remark: "无由生打怪活动系统解锁",
    },
    "4230": {
        id: 4230,
        logic: "AND",
        map: {
            QuestChain: [100205],
        },
        remark: "神庙入口UI解锁",
    },
    "4240": {
        id: 4240,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "委托匹配解锁条件",
    },
    "4250": {
        id: 4250,
        logic: "AND",
        map: {
            QuestChain: [100208],
            SubRegionType: ["home"],
        },
        remark: "邀约解锁条件",
    },
    "4260": {
        id: 4260,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "聊天解锁条件",
    },
    "4261": {
        id: 4261,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "组队大厅解锁条件",
    },
    "4270": {
        id: 4270,
        logic: "AND",
        map: {
            EquipPetId: [-1],
        },
        remark: "换主角解锁条件",
    },
    "4280": {
        id: 4280,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "返回据点跳转功能解锁",
    },
    "4290": {
        id: 4290,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
        },
        remark: "百科词条解锁条件",
    },
    "4300": {
        id: 4300,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
        },
        remark: "陈列室解锁条件",
    },
    "4310": {
        id: 4310,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "战令解锁条件",
    },
    "4311": {
        id: 4311,
        logic: "AND",
        map: {
            PlayerInBattlePass: [0],
        },
        remark: "是否在战令周期内",
    },
    "4320": {
        id: 4320,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100202],
        },
        remark: "每日任务解锁条件",
    },
    "4330": {
        id: 4330,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [110109],
        },
        remark: "派遣系统解锁",
    },
    "4340": {
        id: 4340,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [200103],
        },
        remark: "委托密函系统解锁",
    },
    "4341": {
        id: 4341,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [200236],
        },
        remark: "委托密函分解系统解锁",
    },
    "4350": {
        id: 4350,
        logic: "AND",
        map: {
            PlayerLevelMin: [9],
            QuestChain: [100202],
        },
        remark: "魔之楔手册解锁",
    },
    "4360": {
        id: 4360,
        logic: "AND",
        map: {
            PlayerLevelMin: [9],
            QuestChain: [100202],
        },
        remark: "魔之楔委托/夜航手册解锁",
    },
    "4370": {
        id: 4370,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "新手任务解锁",
    },
    "4380": {
        id: 4380,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "今日行程解锁",
    },
    "4390": {
        id: 4390,
        logic: "AND",
        map: {
            PlayerLevelMin: [30],
            QuestChain: [100202],
        },
        remark: "预设队伍设置解锁",
    },
    "4400": {
        id: 4400,
        logic: "AND",
        map: {
            PlayerLevelMin: [30],
            QuestChain: [120106],
        },
        remark: "时间设置解锁",
    },
    "4410": {
        id: 4410,
        logic: "AND",
        map: {
            UnlockMountId: [-1],
        },
        remark: "坐骑系统解锁条件",
    },
    "4420": {
        id: 4420,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "区域声望入口解锁条件",
    },
    "4430": {
        id: 4430,
        logic: "AND",
        map: {
            PlayerLevelMin: [60],
            QuestChain: [200237],
        },
        remark: "灵化武器解锁条件",
    },
    "4431": {
        id: 4431,
        logic: "AND",
        map: {
            PlayerLevelMin: [60],
            QuestChain: [200237],
        },
        remark: "钢铁探险解锁条件",
    },
    "4432": {
        id: 4432,
        logic: "AND",
        map: {
            HyperCardLevel: [[-1, 0]],
        },
        remark: "灵化武器引导解锁条件",
    },
    "4440": {
        id: 4440,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020108],
        },
        remark: "外观系统解锁条件",
    },
    "4450": {
        id: 4450,
        logic: "OR",
        map: {
            OwnCharIdAndLevel: [
                [1201, 1],
                [120101, 1],
            ],
        },
        remark: "暗主角解锁",
    },
    "4460": {
        id: 4460,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10020101],
        },
        remark: "月签到解锁",
    },
    "4470": {
        id: 4470,
        logic: "AND",
        map: {
            QuestChain: [100208],
            SubRegionType: ["home"],
        },
        remark: "过场动画回顾解锁条件",
    },
    "4480": {
        id: 4480,
        logic: "AND",
        map: {
            QuestChain: [120307],
        },
        remark: "常驻搜打撤解锁",
    },
    "4490": {
        id: 4490,
        logic: "AND",
        map: {
            Quest: [10020102],
        },
        remark: "自动召唤魅影解锁",
    },
    "5001": {
        id: 5001,
        logic: "AND",
        map: {
            RougeLikePreAward: [
                ["Blessing", 101],
                ["Blessing", 102],
            ],
        },
        remark: "拥有祝福101与102",
    },
    "5002": {
        id: 5002,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 2, 3]],
        },
        remark: "拥有祝福2组3枚",
    },
    "5003": {
        id: 5003,
        logic: "OR",
        map: {
            RougeLikePreAward: [
                ["Blessing", 601],
                ["Blessing", 602],
                ["Blessing", 603],
            ],
        },
        remark: "拥有祝福601或602或603",
    },
    "5004": {
        id: 5004,
        logic: "AND",
        map: {
            RougeLikePreAward: [["Blessing", 602]],
        },
        remark: "拥有祝福602",
    },
    "5005": {
        id: 5005,
        logic: "AND",
        map: {
            RougeLikePreAward: [["Blessing", 603]],
        },
        remark: "拥有祝福603",
    },
    "5006": {
        id: 5006,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 6, 3]],
        },
        remark: "拥有祝福6组3枚",
    },
    "5007": {
        id: 5007,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 6, 5]],
        },
        remark: "拥有祝福6组5枚",
    },
    "5008": {
        id: 5008,
        logic: "OR",
        map: {
            RougeLikeGroupMin: [
                ["Blessing", 4, 3],
                ["Blessing", 6, 3],
            ],
        },
        remark: "4组或6组已拿到大于等于三个",
    },
    "5009": {
        id: 5009,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [
                ["Blessing", 4, 12],
                ["Blessing", 6, 12],
            ],
        },
        remark: "祝福4组与6组都剩余大于三个",
    },
    "5010": {
        id: 5010,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[103, "T"]],
            RougeLikePassRoom: [4],
        },
        remark: "肉鸽难度3且大于等于4层",
    },
    "5011": {
        id: 5011,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[103, "T"]],
            RougeLikePassRoom: [8],
        },
        remark: "肉鸽难度3且大于等于8层",
    },
    "5012": {
        id: 5012,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[104, "T"]],
            RougeLikePassRoom: [4],
        },
        remark: "肉鸽难度4且大于等于4层",
    },
    "5013": {
        id: 5013,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[104, "T"]],
            RougeLikePassRoom: [12],
        },
        remark: "肉鸽难度4且大于等于12层",
    },
    "5014": {
        id: 5014,
        logic: "AND",
        map: {
            RougeLikePassRoom: [3],
        },
        remark: "肉鸽大于等于3层",
    },
    "5015": {
        id: 5015,
        logic: "OR",
        map: {
            RougeLikeGroupMin: [
                ["Blessing", 1, 3],
                ["Blessing", 2, 3],
            ],
        },
        remark: "1组或2组已拿到大于等于三个",
    },
    "5016": {
        id: 5016,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [
                ["Blessing", 1, 12],
                ["Blessing", 2, 12],
            ],
        },
        remark: "祝福1组与2组都剩余大于三个",
    },
    "5017": {
        id: 5017,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[105, "T"]],
            RougeLikePassRoom: [4],
        },
        remark: "肉鸽难度5且大于等于4层",
    },
    "5018": {
        id: 5018,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[105, "T"]],
            RougeLikePassRoom: [12],
        },
        remark: "肉鸽难度5且大于等于12层",
    },
    "5019": {
        id: 5019,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[101, "T"]],
        },
        remark: "肉鸽难度1",
    },
    "5020": {
        id: 5020,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[102, "T"]],
        },
        remark: "肉鸽难度2",
    },
    "5021": {
        id: 5021,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[103, "T"]],
        },
        remark: "肉鸽难度3",
    },
    "5022": {
        id: 5022,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[104, "T"]],
        },
        remark: "肉鸽难度4",
    },
    "5023": {
        id: 5023,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[105, "T"]],
        },
        remark: "肉鸽难度5",
    },
    "5024": {
        id: 5024,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 1, 3]],
        },
        remark: "拥有祝福1组3枚",
    },
    "5025": {
        id: 5025,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 2, 3]],
        },
        remark: "拥有祝福2组3枚",
    },
    "5026": {
        id: 5026,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 5, 3]],
        },
        remark: "拥有祝福5组3枚",
    },
    "5027": {
        id: 5027,
        logic: "OR",
        map: {
            RougeLikePreAward: [
                ["Blessing", 506],
                ["Blessing", 509],
            ],
        },
        remark: "拥有祝福506或509",
    },
    "5028": {
        id: 5028,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 7, 3]],
        },
        remark: "拥有祝福7组3枚",
    },
    "5029": {
        id: 5029,
        logic: "AND",
        map: {
            RougeLikePassRoom: [2],
        },
        remark: "肉鸽大于等于2层",
    },
    "5030": {
        id: 5030,
        logic: "AND",
        map: {
            RougeLikePassRoom: [5],
        },
        remark: "肉鸽大于等于5层",
    },
    "5031": {
        id: 5031,
        logic: "AND",
        map: {
            RougeLikePassRoom: [8],
        },
        remark: "肉鸽大于等于8层",
    },
    "5032": {
        id: 5032,
        logic: "AND",
        map: {
            RougeLikePassRoom: [11],
        },
        remark: "肉鸽大于等于11层",
    },
    "5033": {
        id: 5033,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 3, 3]],
        },
        remark: "拥有祝福3组3枚",
    },
    "5034": {
        id: 5034,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 3, 6]],
        },
        remark: "拥有祝福3组6枚",
    },
    "5035": {
        id: 5035,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 3, 9]],
        },
        remark: "拥有祝福3组9枚",
    },
    "5036": {
        id: 5036,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 4, 3]],
        },
        remark: "拥有祝福4组3枚",
    },
    "5037": {
        id: 5037,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 4, 6]],
        },
        remark: "拥有祝福4组6枚",
    },
    "5038": {
        id: 5038,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 4, 9]],
        },
        remark: "拥有祝福4组9枚",
    },
    "5039": {
        id: 5039,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 5, 6]],
        },
        remark: "拥有祝福5组6枚",
    },
    "5040": {
        id: 5040,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 5, 9]],
        },
        remark: "拥有祝福5组9枚",
    },
    "5041": {
        id: 5041,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 1, 2]],
        },
        remark: "至少拥有祝福组1炉心炎2枚",
    },
    "5042": {
        id: 5042,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 1, 5]],
        },
        remark: "至少拥有祝福组1炉心炎5枚",
    },
    "5043": {
        id: 5043,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 1, 8]],
        },
        remark: "至少拥有祝福组1炉心炎8枚",
    },
    "5044": {
        id: 5044,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Blessing", 1, 11]],
        },
        remark: "拥有祝福1组12枚以内",
    },
    "5045": {
        id: 5045,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Blessing", 2, 11]],
        },
        remark: "拥有祝福2组12枚以内",
    },
    "5046": {
        id: 5046,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Blessing", 3, 11]],
        },
        remark: "拥有祝福3组12枚以内",
    },
    "5047": {
        id: 5047,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Blessing", 4, 11]],
        },
        remark: "拥有祝福4组12枚以内",
    },
    "5048": {
        id: 5048,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Blessing", 5, 11]],
        },
        remark: "拥有祝福5组12枚以内",
    },
    "5049": {
        id: 5049,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Blessing", 6, 11]],
        },
        remark: "拥有祝福6组12枚以内",
    },
    "5050": {
        id: 5050,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Blessing", 7, 11]],
        },
        remark: "拥有祝福7组12枚以内",
    },
    "5051": {
        id: 5051,
        logic: "AND",
        map: {
            PlayerLevelMin: [15],
        },
        remark: "肉鸽解锁条件-达到历练15级",
    },
    "5052": {
        id: 5052,
        logic: "AND",
        map: {
            PlayerLevelMin: [25],
        },
        remark: "肉鸽解锁条件-达到历练25级",
    },
    "5053": {
        id: 5053,
        logic: "AND",
        map: {
            PlayerLevelMin: [35],
        },
        remark: "肉鸽解锁条件-达到历练35级",
    },
    "5054": {
        id: 5054,
        logic: "AND",
        map: {
            PlayerLevelMin: [45],
        },
        remark: "肉鸽解锁条件-达到历练45级",
    },
    "5055": {
        id: 5055,
        logic: "AND",
        map: {
            PlayerLevelMin: [55],
        },
        remark: "肉鸽解锁条件-达到历练55级",
    },
    "5056": {
        id: 5056,
        logic: "AND",
        map: {
            PlayerLevelMin: [60],
        },
        remark: "肉鸽解锁条件-达到历练60级",
    },
    "5057": {
        id: 5057,
        logic: "AND",
        map: {
            RougeLikeComplete: [101],
        },
        remark: "肉鸽解锁条件-完成难度1",
    },
    "5058": {
        id: 5058,
        logic: "AND",
        map: {
            RougeLikeComplete: [102],
        },
        remark: "肉鸽解锁条件-完成难度2",
    },
    "5059": {
        id: 5059,
        logic: "AND",
        map: {
            RougeLikeComplete: [103],
        },
        remark: "肉鸽解锁条件-完成难度3",
    },
    "5060": {
        id: 5060,
        logic: "AND",
        map: {
            RougeLikeComplete: [104],
        },
        remark: "肉鸽解锁条件-完成难度4",
    },
    "5061": {
        id: 5061,
        logic: "AND",
        map: {
            RougeLikePassRoom: [14],
        },
        remark: "肉鸽大于等于14层",
    },
    "5062": {
        id: 5062,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 7, 6]],
        },
        remark: "拥有祝福7组6枚",
    },
    "5063": {
        id: 5063,
        logic: "AND",
        map: {
            RougeLikeGroupMin: [["Blessing", 2, 6]],
        },
        remark: "拥有祝福2组6枚",
    },
    "5064": {
        id: 5064,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[101, "T"]],
        },
        isNot: true,
        remark: "肉鸽难度大于1",
    },
    "5065": {
        id: 5065,
        logic: "OR",
        map: {
            RougeLikeDifficulty: [
                [101, "T"],
                [102, "T"],
            ],
        },
        isNot: true,
        remark: "肉鸽难度大于2",
    },
    "5066": {
        id: 5066,
        logic: "OR",
        map: {
            RougeLikeDifficulty: [
                [101, "T"],
                [102, "T"],
                [103, "T"],
            ],
        },
        isNot: true,
        remark: "肉鸽难度大于3",
    },
    "5067": {
        id: 5067,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[106, "T"]],
            RougeLikePassRoom: [4],
        },
        remark: "肉鸽难度6且大于等于4层",
    },
    "5068": {
        id: 5068,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[106, "T"]],
            RougeLikePassRoom: [12],
        },
        remark: "肉鸽难度6且大于等于12层",
    },
    "5069": {
        id: 5069,
        logic: "AND",
        map: {
            RougeLikeComplete: [105],
        },
        remark: "肉鸽解锁条件-完成难度5",
    },
    "5070": {
        id: 5070,
        logic: "AND",
        map: {
            RougeLikeComplete: [106],
        },
        remark: "肉鸽解锁条件-完成难度6",
    },
    "5071": {
        id: 5071,
        logic: "AND",
        map: {
            RougeLikeDifficulty: [[106, "T"]],
        },
        remark: "肉鸽难度6",
    },
    "5072": {
        id: 5072,
        logic: "AND",
        map: {
            PlayerLevelMin: [55],
        },
        remark: "肉鸽解锁条件-达到历练55级",
    },
    "5073": {
        id: 5073,
        logic: "OR",
        map: {
            RougeLikeGroupMin: [
                ["Blessing", 3, 3],
                ["Blessing", 5, 3],
                ["Blessing", 7, 3],
            ],
        },
        remark: "3、5或7组已拿到大于等于三个",
    },
    "5074": {
        id: 5074,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [
                ["Blessing", 3, 12],
                ["Blessing", 5, 12],
                ["Blessing", 7, 12],
            ],
        },
        remark: "3、5与7组都剩余大于三个",
    },
    "5075": {
        id: 5075,
        logic: "AND",
        map: {
            RougeLikePassRoom: [3],
        },
        isNot: true,
        remark: "（剧情事件用）肉鸽尚未通过第3层",
    },
    "5076": {
        id: 5076,
        logic: "AND",
        map: {
            RougeLikePassRoom: [7],
        },
        isNot: true,
        remark: "（剧情事件用）肉鸽尚未通过第7层",
    },
    "5077": {
        id: 5077,
        logic: "AND",
        map: {
            RougeLikePassRoom: [11],
        },
        isNot: true,
        remark: "（剧情事件用）肉鸽尚未通过第11层",
    },
    "5078": {
        id: 5078,
        logic: "AND",
        map: {
            RougeLikePassRoom: [9],
        },
        isNot: true,
        remark: "（剧情事件用）肉鸽尚未通过第9层",
    },
    "5079": {
        id: 5079,
        logic: "AND",
        map: {
            RougeLikePassRoom: [15],
        },
        isNot: true,
        remark: "（剧情事件用）肉鸽尚未通过第15层",
    },
    "5080": {
        id: 5080,
        logic: "AND",
        map: {
            RougeLikePassRoom: [12],
        },
        isNot: true,
        remark: "（剧情事件用）肉鸽尚未通过第12层",
    },
    "5081": {
        id: 5081,
        logic: "AND",
        map: {
            RougeLikePassRoom: [21],
        },
        isNot: true,
        remark: "（剧情事件用）肉鸽尚未通过第21层",
    },
    "5082": {
        id: 5082,
        logic: "OR",
        map: {
            RougeLikeComplete: [101, 102, 103, 104, 105, 106],
        },
        remark: "通关任意肉鸽难度",
    },
    "5101": {
        id: 5101,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 1, "T"]],
        },
        remark: "已解锁剧情图鉴1",
    },
    "5102": {
        id: 5102,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 2, "T"]],
        },
        remark: "已解锁剧情图鉴2",
    },
    "5103": {
        id: 5103,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000501, "T"]],
        },
        remark: "已解锁剧情图鉴20000501",
    },
    "5104": {
        id: 5104,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000601, "T"]],
        },
        remark: "已解锁剧情图鉴20000601",
    },
    "5105": {
        id: 5105,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000602, "T"]],
        },
        remark: "已解锁剧情图鉴20000602",
    },
    "5106": {
        id: 5106,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 6, "T"]],
        },
        remark: "已解锁剧情图鉴6",
    },
    "5107": {
        id: 5107,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 7, "T"]],
        },
        remark: "已解锁剧情图鉴7",
    },
    "5108": {
        id: 5108,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 8, "T"]],
        },
        remark: "已解锁剧情图鉴8",
    },
    "5151": {
        id: 5151,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000201, "F"]],
        },
        remark: "未解锁剧情图鉴20000201",
    },
    "5152": {
        id: 5152,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000301, "F"]],
        },
        remark: "未解锁剧情图鉴20000301",
    },
    "5153": {
        id: 5153,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000501, "F"]],
        },
        remark: "未解锁剧情图鉴20000501",
    },
    "5154": {
        id: 5154,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000601, "F"]],
        },
        remark: "未解锁剧情图鉴20000601",
    },
    "5155": {
        id: 5155,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000602, "F"]],
        },
        remark: "未解锁剧情图鉴20000602",
    },
    "5156": {
        id: 5156,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000502, "F"]],
        },
        remark: "未解锁剧情图鉴20000502",
    },
    "5157": {
        id: 5157,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 7, "F"]],
        },
        remark: "未解锁剧情图鉴7",
    },
    "5158": {
        id: 5158,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 8, "F"]],
        },
        remark: "未解锁剧情图鉴8",
    },
    "5159": {
        id: 5159,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Treasure", 103, 3]],
        },
        remark: "拥有宝物103组4枚以内",
    },
    "5160": {
        id: 5160,
        logic: "AND",
        map: {
            RougeLikeGroupMax: [["Treasure", 10108, 5]],
        },
        remark: "拥有宝物10108组6枚以内",
    },
    "5161": {
        id: 5161,
        logic: "AND",
        map: {
            RougeLikePreRoom: [101],
        },
        remark: "通过101房间后解锁",
    },
    "5162": {
        id: 5162,
        logic: "AND",
        map: {
            RougeLikePreRoom: [101],
        },
        isNot: true,
        remark: "通过101房间后上锁",
    },
    "5163": {
        id: 5163,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000401, "T"]],
        },
        remark: "已解锁商人事件1",
    },
    "5164": {
        id: 5164,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000401, "F"]],
        },
        remark: "未解锁商人事件1（房间421）",
    },
    "5165": {
        id: 5165,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000402, "F"]],
        },
        remark: "未解锁商人事件2（房间422）",
    },
    "5166": {
        id: 5166,
        logic: "AND",
        map: {
            RougeLikePreRoom: [421],
        },
        isNot: true,
        remark: "通过商人事件1房间后上锁",
    },
    "5167": {
        id: 5167,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000101, "F"]],
        },
        remark: "未解锁赛季1初见",
    },
    "5168": {
        id: 5168,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000101, "F"]],
        },
        remark: "未解锁赛季1新一局开始（暂废弃）",
    },
    "5169": {
        id: 5169,
        logic: "AND",
        map: {
            RougeLikePassRoom: [6],
        },
        remark: "刷怪2阶段-肉鸽已通过6层",
    },
    "5170": {
        id: 5170,
        logic: "AND",
        map: {
            RougeLikePassRoom: [6],
        },
        isNot: true,
        remark: "刷怪2阶段-肉鸽未通过6层",
    },
    "5171": {
        id: 5171,
        logic: "AND",
        map: {
            RougeLikePassRoom: [13],
        },
        remark: "刷怪3阶段-肉鸽已通过13层",
    },
    "5172": {
        id: 5172,
        logic: "AND",
        map: {
            RougeLikePassRoom: [13],
        },
        isNot: true,
        remark: "刷怪3阶段-肉鸽未通过13层",
    },
    "5173": {
        id: 5173,
        logic: "AND",
        map: {
            RougeLikeManual: [[100003, 10001001, "T"]],
        },
        remark: "肉鸽已通过永恒诗篇事件",
    },
    "5174": {
        id: 5174,
        logic: "AND",
        map: {
            RougeLikeManual: [[100003, 10001101, "T"]],
        },
        remark: "肉鸽已通过荆棘之书事件",
    },
    "5175": {
        id: 5175,
        logic: "AND",
        map: {
            RougeLikeManual: [[100003, 10001201, "T"]],
        },
        remark: "肉鸽已通过被遗忘的事件",
    },
    "5176": {
        id: 5176,
        logic: "AND",
        map: {
            RougeLikeManual: [[100003, 10001301, "T"]],
        },
        remark: "肉鸽已通过火焰不息事件",
    },
    "5177": {
        id: 5177,
        logic: "AND",
        map: {
            RougeLikeManual: [[100003, 10001601, "T"]],
        },
        remark: "肉鸽已通过诅咒之血事件",
    },
    "5178": {
        id: 5178,
        logic: "AND",
        map: {
            RougeLikeManual: [[100003, 10001801, "T"]],
        },
        remark: "肉鸽已通过月之盈事件",
    },
    "5179": {
        id: 5179,
        logic: "AND",
        map: {
            RougeLikeManual: [[100003, 10000801, "T"]],
        },
        remark: "肉鸽已通过花容依旧事件",
    },
    "5180": {
        id: 5180,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000403, "F"]],
        },
        remark: "未解锁商人事件3（房间423）",
    },
    "5181": {
        id: 5181,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000402, "T"]],
        },
        remark: "已解锁商人事件2",
    },
    "5182": {
        id: 5182,
        logic: "AND",
        map: {
            RougeLikePreRoom: [422],
        },
        isNot: true,
        remark: "通过商人事件2房间后上锁",
    },
    "5183": {
        id: 5183,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000404, "F"]],
        },
        remark: "未解锁商人事件4（房间424）",
    },
    "5184": {
        id: 5184,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000403, "T"]],
        },
        remark: "已解锁商人事件3",
    },
    "5185": {
        id: 5185,
        logic: "AND",
        map: {
            RougeLikePreRoom: [423],
        },
        isNot: true,
        remark: "通过商人事件3房间后上锁",
    },
    "5186": {
        id: 5186,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000405, "F"]],
        },
        remark: "未解锁商人事件5（房间425）",
    },
    "5187": {
        id: 5187,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000404, "T"]],
        },
        remark: "已解锁商人事件4",
    },
    "5188": {
        id: 5188,
        logic: "AND",
        map: {
            RougeLikePreRoom: [424],
        },
        isNot: true,
        remark: "通过商人事件4房间后上锁",
    },
    "5189": {
        id: 5189,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000406, "F"]],
        },
        remark: "未解锁商人事件6（房间426）",
    },
    "5190": {
        id: 5190,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000405, "T"]],
        },
        remark: "已解锁商人事件5",
    },
    "5191": {
        id: 5191,
        logic: "AND",
        map: {
            RougeLikePreRoom: [425],
        },
        isNot: true,
        remark: "通过商人事件5房间后上锁",
    },
    "5192": {
        id: 5192,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000407, "F"]],
        },
        remark: "未解锁商人事件7（房间427）",
    },
    "5193": {
        id: 5193,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000406, "T"]],
        },
        remark: "已解锁商人事件6",
    },
    "5194": {
        id: 5194,
        logic: "AND",
        map: {
            RougeLikePreRoom: [426],
        },
        isNot: true,
        remark: "通过商人事件6房间后上锁",
    },
    "5195": {
        id: 5195,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000702, "F"]],
        },
        remark: "未解锁剧情2C",
    },
    "5196": {
        id: 5196,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000502, "T"]],
        },
        remark: "已解锁剧情2A",
    },
    "5197": {
        id: 5197,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000701, "T"]],
        },
        remark: "已解锁剧情2B",
    },
    "5198": {
        id: 5198,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000901, "F"]],
        },
        remark: "未解锁剧情3D",
    },
    "5199": {
        id: 5199,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000503, "T"]],
        },
        remark: "已解锁剧情3A",
    },
    "5200": {
        id: 5200,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000801, "T"]],
        },
        remark: "已解锁剧情3B",
    },
    "5201": {
        id: 5201,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000802, "T"]],
        },
        remark: "已解锁剧情3C",
    },
    "5202": {
        id: 5202,
        logic: "AND",
        map: {
            RougeLikeManual: [[100004, 20000702, "T"]],
        },
        remark: "已解锁剧情2C",
    },
    "6001": {
        id: 6001,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100202],
        },
        remark: "MOD引导任务解锁条件",
    },
    "6002": {
        id: 6002,
        logic: "AND",
        map: {
            CharEquipRarityLevelModCount: [[2, 3, 1]],
        },
        remark: "至少装备1个绿色3级MOD",
    },
    "6003": {
        id: 6003,
        logic: "AND",
        map: {
            CharEquipRarityLevelModCount: [[2, 3, 2]],
        },
        remark: "至少装备2个绿色3级MOD",
    },
    "6004": {
        id: 6004,
        logic: "AND",
        map: {
            PhaseQuestEnd: [[104001, 3]],
        },
        remark: "MOD引导任务结束条件",
    },
    "6005": {
        id: 6005,
        logic: "AND",
        map: {
            PhaseQuestEnd: [[102001, 1009]],
        },
        remark: "新手任务结束条件",
    },
    "6006": {
        id: 6006,
        logic: "AND",
        map: {
            DailyLoginEnd: [[101001]],
        },
        remark: "常驻每日签到结束条件",
    },
    "6007": {
        id: 6007,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[3301, 1]],
        },
        remark: "玛尔洁抽卡语音解锁条件",
    },
    "6008": {
        id: 6008,
        logic: "AND",
        map: {
            CharEquipRarityLevelModCount: [[3, 5, 1]],
        },
        remark: "至少装备1个蓝色5级MOD",
    },
    "6009": {
        id: 6009,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100205],
        },
        remark: "送奥哥活动下架条件",
    },
    "6010": {
        id: 6010,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [110107],
        },
        remark: "送达芙涅活动下架条件",
    },
    "6011": {
        id: 6011,
        logic: "AND",
        map: {
            CharEquipRarityLevelModCount: [[2, 3, 4]],
        },
        remark: "至少装备4个白色3级MOD",
    },
    "6012": {
        id: 6012,
        logic: "AND",
        map: {
            PlayerLvEventEnd: [106001],
        },
        remark: "历练等级活动结束条件",
    },
    "6013": {
        id: 6013,
        logic: "OR",
        map: {
            InDungeon: [20101, 20102, 20201],
        },
        remark: "大秘境局内引导显示条件",
    },
    "6014": {
        id: 6014,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
        },
        remark: "公测十连活动领奖条件",
    },
    "6015": {
        id: 6015,
        logic: "AND",
        map: {
            DualTerminalLogin: ["pc", "mobile"],
        },
        remark: "双端登录领奖条件",
    },
    "6016": {
        id: 6016,
        logic: "AND",
        map: {
            ConditionalRewardEventEnd: [107001],
        },
        remark: "公测十连下架条件",
    },
    "6017": {
        id: 6017,
        logic: "AND",
        map: {
            ConditionalRewardEventEnd: [107002],
        },
        remark: "双端登录下架条件",
    },
    "6018": {
        id: 6018,
        logic: "AND",
        map: {
            HaveResourceSType: [["Fish", 1]],
        },
        remark: "SDK获得一条鱼条件",
    },
    "6019": {
        id: 6019,
        logic: "AND",
        map: {
            RougeLikeComplete: [106],
        },
        remark: "小暴怒活动下架条件-完成难度6",
    },
    "6020": {
        id: 6020,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [200236],
        },
        remark: "送松露活动下架条件",
    },
    "6021": {
        id: 6021,
        logic: "AND",
        map: {
            ConditionalRewardEventEnd: [107003],
        },
        remark: "区域联机解锁通知活动下架条件",
    },
    "6022": {
        id: 6022,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100208],
        },
        remark: "区域联机解锁活动领奖条件",
    },
    "6023": {
        id: 6023,
        logic: "OR",
        map: {
            InDungeon: [21001, 21002, 21003],
        },
        remark: "单人公会战分组赛引导条件",
    },
    "6024": {
        id: 6024,
        logic: "OR",
        map: {
            InDungeon: [21011, 21012, 21013],
        },
        remark: "单人公会战巅峰排名引导条件",
    },
    "6025": {
        id: 6025,
        logic: "AND",
        map: {
            GuildBossTrialFinishedCount: [1],
        },
        remark: "公会试炼破除1个",
    },
    "6026": {
        id: 6026,
        logic: "AND",
        map: {
            GuildBossTrialFinishedCount: [2],
        },
        remark: "公会试炼破除2个",
    },
    "6027": {
        id: 6027,
        logic: "AND",
        map: {
            GuildBossTrialFinishedCount: [3],
        },
        remark: "公会试炼破除3个",
    },
    "6028": {
        id: 6028,
        logic: "AND",
        map: {
            Quest: [11010101],
        },
        remark: "提前解锁任务功能条件",
    },
    "7000": {
        id: 7000,
        logic: "AND",
        map: {
            LoginDay: [1],
        },
        remark: "累计登录1天及以上",
    },
    "7001": {
        id: 7001,
        logic: "AND",
        map: {
            LoginDay: [2],
        },
        remark: "累计登录2天及以上",
    },
    "7002": {
        id: 7002,
        logic: "AND",
        map: {
            LoginDay: [3],
        },
        remark: "累计登录3天及以上",
    },
    "7003": {
        id: 7003,
        logic: "AND",
        map: {
            LoginDay: [4],
        },
        remark: "累计登录4天及以上",
    },
    "7004": {
        id: 7004,
        logic: "AND",
        map: {
            LoginDay: [5],
        },
        remark: "累计登录5天及以上",
    },
    "7005": {
        id: 7005,
        logic: "AND",
        map: {
            LoginDay: [6],
        },
        remark: "累计登录6天及以上",
    },
    "7006": {
        id: 7006,
        logic: "AND",
        map: {
            LoginDay: [7],
        },
        remark: "累计登录7天及以上",
    },
    "8001": {
        id: 8001,
        logic: "AND",
        map: {
            QuestChain: [100307, 120001, 120002],
        },
        remark: "活动--止流活动前置任务",
    },
    "8002": {
        id: 8002,
        logic: "AND",
        map: {
            QuestChain: [110109, 200227],
        },
        remark: "活动--大秘境前置任务",
    },
    "8003": {
        id: 8003,
        logic: "AND",
        map: {
            DailyFreeTicketAmount: [1],
        },
        remark: "魔之楔掉落活动中连战剩余次数大于等于1",
    },
    "8011": {
        id: 8011,
        logic: "AND",
        map: {
            Quest: [40011106],
            TimeArrived: ["2025-12-25 10:00:00"],
        },
        remark: "活动--剧院联机活动开启",
    },
    "8012": {
        id: 8012,
        logic: "AND",
        map: {
            Quest: [40011106],
            TimeArrived: ["2026-01-20 05:00:00"],
        },
        remark: "活动--剧院联机活动结束",
    },
    "8013": {
        id: 8013,
        logic: "AND",
        map: {
            Quest: [12011105],
        },
        remark: "菲娜活动第一天关卡开启",
    },
    "8014": {
        id: 8014,
        logic: "AND",
        map: {
            Quest: [12011203],
        },
        remark: "菲娜活动第二天关卡开启",
    },
    "8015": {
        id: 8015,
        logic: "AND",
        map: {
            Quest: [12011305],
        },
        remark: "菲娜活动第三天关卡开启",
    },
    "8016": {
        id: 8016,
        logic: "AND",
        map: {
            Quest: [12011410],
        },
        remark: "菲娜活动第四天关卡开启",
    },
    "8017": {
        id: 8017,
        logic: "AND",
        map: {
            FollowCommunityComplete: [-1],
        },
        remark: "社区关注活动全部奖励领完",
    },
    "8028": {
        id: 8028,
        logic: "AND",
        map: {
            DungeonType: ["FeinaEvent"],
        },
        isNot: true,
        remark: "菲娜活动关卡 屏蔽UI（不在菲娜活动取反）",
    },
    "8029": {
        id: 8029,
        logic: "AND",
        map: {
            QuestChain: [400111],
            TimeArrived: ["2025-12-25 10:00:00"],
        },
        remark: "活动--剧院联机活动匹配玩法报名NPC显示条件【临时】",
    },
    "8030": {
        id: 8030,
        logic: "AND",
        map: {
            TimeArrived: ["2026-01-20 05:00:00"],
        },
        remark: "活动--剧院联机活动匹配玩法报名NPC隐藏条件【临时】",
    },
    "8031": {
        id: 8031,
        logic: "AND",
        map: {
            QuestChain: [400111],
            TimeArrived: ["2025-12-25 10:00:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC显示条件1【临时】",
    },
    "8032": {
        id: 8032,
        logic: "AND",
        map: {
            TimeArrived: ["2025-12-30 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC隐藏条件1【临时】",
    },
    "8033": {
        id: 8033,
        logic: "AND",
        map: {
            QuestChain: [400111],
            TimeArrived: ["2025-12-30 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC显示条件2【临时】",
    },
    "8034": {
        id: 8034,
        logic: "AND",
        map: {
            TimeArrived: ["2026-01-04 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC隐藏条件2【临时】",
    },
    "8035": {
        id: 8035,
        logic: "AND",
        map: {
            QuestChain: [400111],
            TimeArrived: ["2026-01-04 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC显示条件3【临时】",
    },
    "8036": {
        id: 8036,
        logic: "AND",
        map: {
            TimeArrived: ["2026-01-09 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC隐藏条件3【临时】",
    },
    "8037": {
        id: 8037,
        logic: "AND",
        map: {
            QuestChain: [400111],
            TimeArrived: ["2026-01-09 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC显示条件4【临时】",
    },
    "8038": {
        id: 8038,
        logic: "AND",
        map: {
            TimeArrived: ["2026-01-14 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC隐藏条件4【临时】",
    },
    "8039": {
        id: 8039,
        logic: "AND",
        map: {
            QuestChain: [400111],
            TimeArrived: ["2026-01-14 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC显示条件5【临时】",
    },
    "8040": {
        id: 8040,
        logic: "AND",
        map: {
            TimeArrived: ["2026-01-19 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC隐藏条件5【临时】",
    },
    "8041": {
        id: 8041,
        logic: "AND",
        map: {
            QuestChain: [400111],
            TimeArrived: ["2026-01-19 04:55:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC显示条件6【临时】",
    },
    "8042": {
        id: 8042,
        logic: "AND",
        map: {
            TimeArrived: ["2026-01-20 05:00:00"],
        },
        remark: "活动--剧院联机活动匹配玩法表演NPC隐藏条件6【临时】",
    },
    "8043": {
        id: 8043,
        logic: "AND",
        map: {
            TimeArrived: ["2027-01-20 05:00:00"],
        },
        remark: "活动--拍照活动结束",
    },
    "8044": {
        id: 8044,
        logic: "AND",
        map: {
            Quest: [10040103],
            TimeArrived: ["2026-06-04 10:00:00"],
        },
        remark: "活动--火车站联机活动NPC显示条件",
    },
    "8045": {
        id: 8045,
        logic: "AND",
        map: {
            TimeArrived: ["2026-06-25 05:00:00"],
        },
        remark: "活动--火车站联机活动NPC隐藏条件",
    },
    "8046": {
        id: 8046,
        logic: "AND",
        map: {
            AvatarStatus: [["InSpecialQuest", "T"]],
        },
        remark: "活动--火车站联机活动NPC隐藏条件【已弃用】",
    },
    "8047": {
        id: 8047,
        logic: "AND",
        map: {
            ModArchiveReward: [1, 2, 3, 4, 5],
        },
        isNot: true,
        remark: "魔之楔手册任务1-5阶段奖励未领取完",
    },
    "8048": {
        id: 8048,
        logic: "AND",
        map: {
            ModArchiveReward: [1, 2, 3, 4, 5],
        },
        remark: "魔之楔手册任务1-5阶段奖励领取完",
    },
    "9001": {
        id: 9001,
        logic: "AND",
        map: {
            TimeArrived: ["2025-11-11 12:00:00"],
        },
        remark: "test",
    },
    "70000": {
        id: 70000,
        logic: "AND",
        map: {
            HaveResource: [[20500, 1]],
        },
        remark: "探索序章-钥匙交互条件A",
    },
    "70001": {
        id: 70001,
        logic: "AND",
        map: {
            HaveResource: [[20501, 1]],
        },
        remark: "探索序章-布鲁内托的钥匙",
    },
    "70006": {
        id: 70006,
        logic: "AND",
        map: {
            HaveResource: [[20510, 1]],
        },
        remark: "探索序章-祈福",
    },
    "70007": {
        id: 70007,
        logic: "AND",
        map: {
            HaveResource: [[20511, 1]],
        },
        remark: "探索第一章-锻造",
    },
    "80001": {
        id: 80001,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80002": {
        id: 80002,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80003": {
        id: 80003,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80004": {
        id: 80004,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80005": {
        id: 80005,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80006": {
        id: 80006,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80007": {
        id: 80007,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80008": {
        id: 80008,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100204],
        },
        remark: "动态事件解锁",
    },
    "80009": {
        id: 80009,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80010": {
        id: 80010,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80011": {
        id: 80011,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80012": {
        id: 80012,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100205, 200216],
        },
        remark: "动态事件解锁",
    },
    "80013": {
        id: 80013,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80014": {
        id: 80014,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100203],
        },
        remark: "动态事件解锁",
    },
    "80015": {
        id: 80015,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80016": {
        id: 80016,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80017": {
        id: 80017,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80018": {
        id: 80018,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80020": {
        id: 80020,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80021": {
        id: 80021,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80022": {
        id: 80022,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80023": {
        id: 80023,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80024": {
        id: 80024,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [200225],
        },
        remark: "动态事件解锁",
    },
    "80025": {
        id: 80025,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100206],
        },
        remark: "动态事件解锁",
    },
    "80026": {
        id: 80026,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80027": {
        id: 80027,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80028": {
        id: 80028,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80029": {
        id: 80029,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80030": {
        id: 80030,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80031": {
        id: 80031,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80032": {
        id: 80032,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80033": {
        id: 80033,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80034": {
        id: 80034,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109],
        },
        remark: "动态事件解锁",
    },
    "80035": {
        id: 80035,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109],
        },
        remark: "动态事件解锁",
    },
    "80037": {
        id: 80037,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80038": {
        id: 80038,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100208, 200103],
        },
        remark: "动态事件解锁",
    },
    "80040": {
        id: 80040,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80044": {
        id: 80044,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80045": {
        id: 80045,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80046": {
        id: 80046,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109],
        },
        remark: "动态事件解锁",
    },
    "80047": {
        id: 80047,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80048": {
        id: 80048,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109],
        },
        remark: "动态事件解锁",
    },
    "80050": {
        id: 80050,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80051": {
        id: 80051,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80052": {
        id: 80052,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80053": {
        id: 80053,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103, 200103],
        },
        remark: "动态事件解锁",
    },
    "80054": {
        id: 80054,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103],
        },
        remark: "动态事件解锁",
    },
    "80055": {
        id: 80055,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109, 200103],
        },
        remark: "动态事件解锁",
    },
    "80056": {
        id: 80056,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109],
        },
        remark: "动态事件解锁",
    },
    "80057": {
        id: 80057,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109],
        },
        remark: "动态事件解锁",
    },
    "80058": {
        id: 80058,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110109],
        },
        remark: "动态事件解锁",
    },
    "80059": {
        id: 80059,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80060": {
        id: 80060,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80061": {
        id: 80061,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100208, 200103],
        },
        remark: "动态事件解锁",
    },
    "80062": {
        id: 80062,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80063": {
        id: 80063,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100103, 200215],
        },
        remark: "动态事件解锁",
    },
    "80064": {
        id: 80064,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80065": {
        id: 80065,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80066": {
        id: 80066,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80067": {
        id: 80067,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80068": {
        id: 80068,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202, 200103],
        },
        remark: "动态事件解锁",
    },
    "80069": {
        id: 80069,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80070": {
        id: 80070,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100202],
        },
        remark: "动态事件解锁",
    },
    "80071": {
        id: 80071,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100203, 200103],
        },
        remark: "动态事件解锁",
    },
    "80072": {
        id: 80072,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100203],
        },
        remark: "动态事件解锁",
    },
    "80073": {
        id: 80073,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100203],
        },
        remark: "动态事件解锁",
    },
    "80074": {
        id: 80074,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100203, 200103],
        },
        remark: "动态事件解锁",
    },
    "80075": {
        id: 80075,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100307, 200103],
        },
        remark: "动态事件解锁",
    },
    "80076": {
        id: 80076,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100203],
        },
        remark: "动态事件解锁",
    },
    "80077": {
        id: 80077,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [200215],
        },
        remark: "动态事件解锁",
    },
    "80078": {
        id: 80078,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [200215],
        },
        remark: "动态事件解锁",
    },
    "80079": {
        id: 80079,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100306],
        },
        remark: "动态事件解锁",
    },
    "80080": {
        id: 80080,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100306],
        },
        remark: "动态事件解锁",
    },
    "80081": {
        id: 80081,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100306],
        },
        remark: "动态事件解锁",
    },
    "80082": {
        id: 80082,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80083": {
        id: 80083,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80084": {
        id: 80084,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80085": {
        id: 80085,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80086": {
        id: 80086,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80087": {
        id: 80087,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80088": {
        id: 80088,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80089": {
        id: 80089,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80090": {
        id: 80090,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80091": {
        id: 80091,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80092": {
        id: 80092,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80093": {
        id: 80093,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80094": {
        id: 80094,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80095": {
        id: 80095,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80096": {
        id: 80096,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80097": {
        id: 80097,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80098": {
        id: 80098,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80099": {
        id: 80099,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80100": {
        id: 80100,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80101": {
        id: 80101,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120206],
        },
        remark: "动态事件解锁",
    },
    "80102": {
        id: 80102,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80103": {
        id: 80103,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [120106],
        },
        remark: "动态事件解锁",
    },
    "80104": {
        id: 80104,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100405],
        },
        remark: "动态事件解锁",
    },
    "80105": {
        id: 80105,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100405],
        },
        remark: "动态事件解锁",
    },
    "80106": {
        id: 80106,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100405],
        },
        remark: "动态事件解锁",
    },
    "80107": {
        id: 80107,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100405],
        },
        remark: "动态事件解锁",
    },
    "80108": {
        id: 80108,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [100405],
        },
        remark: "动态事件解锁",
    },
    "80109": {
        id: 80109,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110232],
        },
        remark: "动态事件解锁",
    },
    "80110": {
        id: 80110,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110232],
        },
        remark: "动态事件解锁",
    },
    "80111": {
        id: 80111,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110232],
        },
        remark: "动态事件解锁",
    },
    "80112": {
        id: 80112,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110232],
        },
        remark: "动态事件解锁",
    },
    "80113": {
        id: 80113,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            QuestChain: [110232],
        },
        remark: "动态事件解锁",
    },
    "81001": {
        id: 81001,
        logic: "AND",
        map: {
            QuestChain: [100103, 200103],
        },
        remark: "序章完成且宠物支线完成",
    },
    "81002": {
        id: 81002,
        logic: "AND",
        map: {
            QuestChain: [100202, 200103],
        },
        remark: "下水道完成且宠物支线完成",
    },
    "81003": {
        id: 81003,
        logic: "AND",
        map: {
            QuestChain: [100203, 200103],
        },
        remark: "矿坑完成且宠物支线完成",
    },
    "81004": {
        id: 81004,
        logic: "AND",
        map: {
            QuestChain: [100208, 200103],
        },
        remark: "冰湖城第一章完成且宠物支线完成",
    },
    "81005": {
        id: 81005,
        logic: "AND",
        map: {
            QuestChain: [110109, 200103],
        },
        remark: "EX01完成且宠物支线完成",
    },
    "81006": {
        id: 81006,
        logic: "AND",
        map: {
            QuestChain: [100307, 200103],
        },
        remark: "第二章完成且宠物支线完成",
    },
    "82001": {
        id: 82001,
        logic: "AND",
        map: {
            QuestChain: [200215],
        },
        remark: "钓鱼支线完成",
    },
    "89001": {
        id: 89001,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [100101, 1],
                [100102, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89002": {
        id: 89002,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [100203, 1],
                [100204, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89003": {
        id: 89003,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [100301, 1],
                [100302, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89004": {
        id: 89004,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [100401, 1],
                [100402, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89005": {
        id: 89005,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [100501, 1],
                [100502, 1],
                [100503, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89006": {
        id: 89006,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [100641, 1],
                [100621, 1],
                [100642, 1],
                [100622, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89007": {
        id: 89007,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [200701, 1],
                [200702, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89008": {
        id: 89008,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [200801, 1],
                [200802, 1],
                [200803, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89009": {
        id: 89009,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [100951, 1],
                [100921, 1],
                [100952, 1],
                [100922, 1],
                [100953, 1],
                [100923, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89010": {
        id: 89010,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [201051, 1],
                [201031, 1],
                [201052, 1],
                [201032, 1],
                [201053, 1],
                [201033, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89011": {
        id: 89011,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[101104, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89012": {
        id: 89012,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [101241, 1],
                [101211, 1],
                [101242, 1],
                [101212, 1],
                [101243, 1],
                [101213, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89013": {
        id: 89013,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [101313, 1],
                [101323, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89014": {
        id: 89014,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[101405, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89015": {
        id: 89015,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [201503, 1],
                [201504, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89017": {
        id: 89017,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[101705, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89018": {
        id: 89018,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [301802, 1],
                [301803, 1],
                [301804, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89020": {
        id: 89020,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[102005, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89021": {
        id: 89021,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [202143, 1],
                [202123, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89022": {
        id: 89022,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[102205, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89023": {
        id: 89023,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[102305, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89024": {
        id: 89024,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[202405, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89025": {
        id: 89025,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [102524, 1],
                [102534, 1],
                [102525, 1],
                [102535, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89026": {
        id: 89026,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[302605, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89027": {
        id: 89027,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[302705, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89028": {
        id: 89028,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [302802, 1],
                [302803, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89029": {
        id: 89029,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[102905, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89030": {
        id: 89030,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [303003, 1],
                [303004, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89031": {
        id: 89031,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [303103, 1],
                [303104, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89032": {
        id: 89032,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[203205, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89033": {
        id: 89033,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[203305, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89034": {
        id: 89034,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [303402, 1],
                [303403, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89035": {
        id: 89035,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [303502, 1],
                [303503, 1],
                [303504, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89037": {
        id: 89037,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [203704, 1],
                [203705, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89038": {
        id: 89038,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[303805, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89039": {
        id: 89039,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[303905, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89040": {
        id: 89040,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[104004, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89044": {
        id: 89044,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[204405, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89045": {
        id: 89045,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [104554, 1],
                [104524, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89046": {
        id: 89046,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[304604, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89047": {
        id: 89047,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[304705, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89048": {
        id: 89048,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[104804, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89050": {
        id: 89050,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[105004, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89051": {
        id: 89051,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[205105, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89052": {
        id: 89052,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [105203, 1],
                [105204, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89053": {
        id: 89053,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[305304, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89054": {
        id: 89054,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[205405, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89055": {
        id: 89055,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[305503, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89056": {
        id: 89056,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [305604, 1],
                [305605, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89057": {
        id: 89057,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[205705, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89058": {
        id: 89058,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [305804, 1],
                [305805, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89059": {
        id: 89059,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [105904, 1],
                [105905, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89060": {
        id: 89060,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [206004, 1],
                [206005, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89061": {
        id: 89061,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[306105, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89062": {
        id: 89062,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [306204, 1],
                [306205, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89063": {
        id: 89063,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [306304, 1],
                [306305, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89064": {
        id: 89064,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [206444, 1],
                [206434, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89065": {
        id: 89065,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [106543, 1],
                [106553, 1],
                [106544, 1],
                [106554, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89066": {
        id: 89066,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [106635, 1],
                [106655, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89067": {
        id: 89067,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [206711, 1],
                [206731, 1],
                [206712, 1],
                [206732, 1],
                [206713, 1],
                [206733, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89068": {
        id: 89068,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[306802, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89069": {
        id: 89069,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[206905, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89070": {
        id: 89070,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[207005, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89071": {
        id: 89071,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[307105, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89072": {
        id: 89072,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [207233, 1],
                [207213, 1],
                [207234, 1],
                [207214, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89073": {
        id: 89073,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [207345, 1],
                [207315, 1],
                [207355, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89074": {
        id: 89074,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [307402, 1],
                [307403, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89075": {
        id: 89075,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [307504, 1],
                [307505, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89076": {
        id: 89076,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [207614, 1],
                [207654, 1],
                [207615, 1],
                [207655, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89077": {
        id: 89077,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [207704, 1],
                [207705, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89078": {
        id: 89078,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [207804, 1],
                [207805, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89079": {
        id: 89079,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[207903, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89080": {
        id: 89080,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[308005, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89081": {
        id: 89081,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[108103, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89082": {
        id: 89082,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [108203, 1],
                [108204, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89083": {
        id: 89083,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [308314, 1],
                [308334, 1],
                [308315, 1],
                [308335, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89084": {
        id: 89084,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [308404, 1],
                [308405, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89085": {
        id: 89085,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [208503, 1],
                [208504, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89086": {
        id: 89086,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [208604, 1],
                [208605, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89087": {
        id: 89087,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [208723, 1],
                [208733, 1],
                [208753, 1],
                [208724, 1],
                [208734, 1],
                [208754, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89088": {
        id: 89088,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [208804, 1],
                [208805, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89089": {
        id: 89089,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [108923, 1],
                [108943, 1],
                [108924, 1],
                [108944, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89090": {
        id: 89090,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [109044, 1],
                [109054, 1],
                [109045, 1],
                [109055, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89091": {
        id: 89091,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [109113, 1],
                [109123, 1],
                [109114, 1],
                [109124, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89092": {
        id: 89092,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [109204, 1],
                [109205, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89093": {
        id: 89093,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [209304, 1],
                [209305, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89094": {
        id: 89094,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [309404, 1],
                [309405, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89095": {
        id: 89095,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [209504, 1],
                [209505, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89096": {
        id: 89096,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [209614, 1],
                [209624, 1],
                [209654, 1],
                [209615, 1],
                [209625, 1],
                [209655, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89097": {
        id: 89097,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [209714, 1],
                [209724, 1],
                [209744, 1],
                [209715, 1],
                [209725, 1],
                [209745, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89098": {
        id: 89098,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [109834, 1],
                [109844, 1],
                [109835, 1],
                [109845, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89099": {
        id: 89099,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [209934, 1],
                [209954, 1],
                [209935, 1],
                [209955, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89100": {
        id: 89100,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [110004, 1],
                [110005, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89101": {
        id: 89101,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [110104, 1],
                [110105, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89102": {
        id: 89102,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[210205, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89103": {
        id: 89103,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [[310305, 1]],
        },
        remark: "可派遣前置条件",
    },
    "89104": {
        id: 89104,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [310404, 1],
                [310405, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89105": {
        id: 89105,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [210504, 1],
                [210505, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89106": {
        id: 89106,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [210604, 1],
                [210605, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89107": {
        id: 89107,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [310704, 1],
                [310705, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89108": {
        id: 89108,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [210804, 1],
                [210805, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89109": {
        id: 89109,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [210904, 1],
                [210905, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89110": {
        id: 89110,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [311004, 1],
                [311005, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89111": {
        id: 89111,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [211104, 1],
                [211105, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89112": {
        id: 89112,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [211204, 1],
                [211205, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "89113": {
        id: 89113,
        logic: "OR",
        map: {
            DynamicEventCompleteTimes: [
                [211304, 1],
                [211305, 1],
            ],
        },
        remark: "可派遣前置条件",
    },
    "100101": {
        id: 100101,
        logic: "AND",
        map: {
            QuestChain: [100101],
        },
        remark: "序章任务完成",
    },
    "100102": {
        id: 100102,
        logic: "AND",
        map: {
            QuestChain: [100102],
        },
        remark: "序章任务完成",
    },
    "100103": {
        id: 100103,
        logic: "AND",
        map: {
            QuestChain: [100103],
        },
        remark: "序章任务完成",
    },
    "100201": {
        id: 100201,
        logic: "AND",
        map: {
            TrueQuestChain: [100201],
        },
        remark: "第一章任务完成",
    },
    "100202": {
        id: 100202,
        logic: "AND",
        map: {
            TrueQuestChain: [100202],
        },
        remark: "第一章任务完成",
    },
    "100203": {
        id: 100203,
        logic: "AND",
        map: {
            TrueQuestChain: [100203],
        },
        remark: "第一章任务完成",
    },
    "100204": {
        id: 100204,
        logic: "AND",
        map: {
            TrueQuestChain: [100204],
        },
        remark: "第一章任务完成",
    },
    "100205": {
        id: 100205,
        logic: "AND",
        map: {
            TrueQuestChain: [100205],
        },
        remark: "第一章任务完成",
    },
    "100206": {
        id: 100206,
        logic: "AND",
        map: {
            TrueQuestChain: [100206],
        },
        remark: "第一章任务完成",
    },
    "100207": {
        id: 100207,
        logic: "AND",
        map: {
            TrueQuestChain: [100207],
        },
        remark: "第一章任务完成",
    },
    "100208": {
        id: 100208,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "第一章任务完成",
    },
    "100212": {
        id: 100212,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "第一章任务完成",
    },
    "100300": {
        id: 100300,
        logic: "AND",
        map: {
            QuestChain: [100300],
        },
        remark: "第二章启动器测试",
    },
    "100301": {
        id: 100301,
        logic: "AND",
        map: {
            QuestChain: [100301],
        },
        remark: "第二章任务完成",
    },
    "100302": {
        id: 100302,
        logic: "AND",
        map: {
            QuestChain: [100302],
        },
        remark: "第二章任务完成",
    },
    "100303": {
        id: 100303,
        logic: "AND",
        map: {
            QuestChain: [100303],
        },
        remark: "第二章任务完成",
    },
    "100304": {
        id: 100304,
        logic: "AND",
        map: {
            QuestChain: [100304],
        },
        remark: "第二章任务完成",
    },
    "100305": {
        id: 100305,
        logic: "AND",
        map: {
            QuestChain: [100305],
        },
        remark: "第二章任务完成",
    },
    "100306": {
        id: 100306,
        logic: "AND",
        map: {
            QuestChain: [100306],
        },
        remark: "第二章任务完成",
    },
    "100307": {
        id: 100307,
        logic: "AND",
        map: {
            QuestChain: [100307],
        },
        remark: "第二章任务完成",
    },
    "100401": {
        id: 100401,
        logic: "AND",
        map: {
            QuestChain: [100401],
        },
        remark: "第三章任务链1完成",
    },
    "100402": {
        id: 100402,
        logic: "AND",
        map: {
            QuestChain: [100402],
        },
        remark: "第三章任务链2完成",
    },
    "100403": {
        id: 100403,
        logic: "AND",
        map: {
            QuestChain: [100403],
        },
        remark: "第三章任务链3完成",
    },
    "100404": {
        id: 100404,
        logic: "AND",
        map: {
            QuestChain: [100404],
        },
        remark: "第三章任务链4完成",
    },
    "100405": {
        id: 100405,
        logic: "AND",
        map: {
            QuestChain: [100405],
        },
        remark: "第三章任务链5完成",
    },
    "101009": {
        id: 101009,
        logic: "AND",
        map: {
            LoginEventFinish: [101009],
        },
        remark: "预热签到1.3完成",
    },
    "101010": {
        id: 101010,
        logic: "AND",
        map: {
            LoginEventFinish: [101010],
        },
        remark: "签到活动（1.3上半苏乙）完成",
    },
    "101011": {
        id: 101011,
        logic: "AND",
        map: {
            LoginEventFinish: [101011],
        },
        remark: "签到活动（1.3下半卡米拉）完成",
    },
    "101012": {
        id: 101012,
        logic: "AND",
        map: {
            LoginEventFinish: [101012],
        },
        remark: "签到活动（1.4上半芙罗拉）完成",
    },
    "101013": {
        id: 101013,
        logic: "AND",
        map: {
            LoginEventFinish: [101013],
        },
        remark: "签到活动（1.4下半希尔妲）完成",
    },
    "101014": {
        id: 101014,
        logic: "AND",
        map: {
            LoginEventFinish: [101014],
        },
        remark: "十四日签到完成",
    },
    "101015": {
        id: 101015,
        logic: "AND",
        map: {
            LoginEventFinish: [101015],
        },
        remark: "预热签到1.4完成",
    },
    "101016": {
        id: 101016,
        logic: "AND",
        map: {
            LoginEventFinish: [101016],
        },
        remark: "预热签到1.5完成",
    },
    "101017": {
        id: 101017,
        logic: "AND",
        map: {
            LoginEventFinish: [101017],
        },
        remark: "签到活动（1.5伊薇）完成",
    },
    "101018": {
        id: 101018,
        logic: "AND",
        map: {
            LoginEventFinish: [101018],
        },
        remark: "签到活动（1.6法露）完成",
    },
    "101019": {
        id: 101019,
        logic: "AND",
        map: {
            LoginEventFinish: [101019],
        },
        remark: "预热签到1.6完成",
    },
    "101103": {
        id: 101103,
        logic: "AND",
        map: {
            QuestChain: [100101],
            TeleportIsUnlock: [1011],
        },
        remark: "蛋皎商店地图标点解锁条件",
    },
    "102003": {
        id: 102003,
        logic: "AND",
        map: {
            QuestChain: [100405, 200401, 200402],
        },
        remark: "1.5探索活动解锁条件",
    },
    "102004": {
        id: 102004,
        logic: "AND",
        map: {
            TimeArrived: ["2026-08-06 10:00:00"],
        },
        remark: "1.5魔灵赛跑竞彩NPC显示条件",
    },
    "102005": {
        id: 102005,
        logic: "AND",
        map: {
            TimeArrived: ["2026-08-18 05:00:00"],
        },
        remark: "1.5魔灵赛跑竞彩NPC隐藏条件",
    },
    "103014": {
        id: 103014,
        logic: "AND",
        map: {
            DungeonComplete: [[41801, 1, 1]],
        },
        remark: "搜打撤活动跳转按钮解锁条件",
    },
    "103022": {
        id: 103022,
        logic: "AND",
        map: {
            PermRewardCollectionFinish: [103022],
        },
        remark: "常驻奖励汇总活动完成",
    },
    "110101": {
        id: 110101,
        logic: "AND",
        map: {
            QuestChain: [110101],
        },
        remark: "EX01任务完成",
    },
    "110103": {
        id: 110103,
        logic: "AND",
        map: {
            QuestChain: [110103],
        },
        remark: "EX01任务完成",
    },
    "110105": {
        id: 110105,
        logic: "AND",
        map: {
            QuestChain: [110105],
        },
        remark: "EX01任务完成",
    },
    "110107": {
        id: 110107,
        logic: "AND",
        map: {
            QuestChain: [110107],
        },
        remark: "EX01任务完成",
    },
    "110108": {
        id: 110108,
        logic: "AND",
        map: {
            QuestChain: [110108],
        },
        remark: "EX01任务完成",
    },
    "110109": {
        id: 110109,
        logic: "AND",
        map: {
            QuestChain: [110109],
        },
        remark: "EX01任务完成",
    },
    "110180": {
        id: 110180,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[1101, 80]],
        },
        remark: "获得80级贝蕾妮卡",
    },
    "110201": {
        id: 110201,
        logic: "AND",
        map: {
            QuestChain: [110201],
        },
        remark: "ex02_完成第一条任务链",
    },
    "110202": {
        id: 110202,
        logic: "AND",
        map: {
            QuestChain: [110202],
        },
        remark: "ex02_完成第二条任务链",
    },
    "110203": {
        id: 110203,
        logic: "AND",
        map: {
            QuestChain: [110203],
        },
        remark: "ex02_完成第三条任务链",
    },
    "110211": {
        id: 110211,
        logic: "AND",
        map: {
            QuestChain: [110211],
        },
        remark: "ex02_平台期1支线1",
    },
    "110212": {
        id: 110212,
        logic: "AND",
        map: {
            QuestChain: [110212],
        },
        remark: "ex02_平台期1支线2",
    },
    "110213": {
        id: 110213,
        logic: "AND",
        map: {
            QuestChain: [110213],
        },
        remark: "ex02_平台期1支线3",
    },
    "110214": {
        id: 110214,
        logic: "AND",
        map: {
            QuestChain: [110214],
        },
        remark: "ex02_平台期1支线4",
    },
    "110215": {
        id: 110215,
        logic: "AND",
        map: {
            QuestChain: [110215],
        },
        remark: "ex02_平台期1支线5",
    },
    "110220": {
        id: 110220,
        logic: "AND",
        map: {
            QuestChain: [110220],
        },
        remark: "ex02_完成第一天晚宴",
    },
    "110221": {
        id: 110221,
        logic: "AND",
        map: {
            QuestChain: [110221],
        },
        remark: "ex02_平台期2支线1",
    },
    "110222": {
        id: 110222,
        logic: "AND",
        map: {
            QuestChain: [110222],
        },
        remark: "ex02_平台期2支线2",
    },
    "110231": {
        id: 110231,
        logic: "AND",
        map: {
            QuestChain: [110231],
        },
        remark: "ex02_完成第二天晚宴",
    },
    "110232": {
        id: 110232,
        logic: "AND",
        map: {
            QuestChain: [110232],
        },
        remark: "完成EX02主线任务，解锁隐最终支线",
    },
    "110233": {
        id: 110233,
        logic: "AND",
        map: {
            QuestChain: [110233],
        },
        remark: "ex02_完成隐藏支线",
    },
    "112001": {
        id: 112001,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            QuestChain: [100208],
        },
        remark: "累计联机时长活动解锁跳转按钮",
    },
    "112005": {
        id: 112005,
        logic: "AND",
        map: {
            Quest: [10020105],
        },
        remark: "累计联机时长活动解锁跳转按钮（1.6及以后）",
    },
    "120001": {
        id: 120001,
        logic: "AND",
        map: {
            QuestChain: [120001],
        },
        remark: "东国引入任务1完成",
    },
    "120002": {
        id: 120002,
        logic: "AND",
        map: {
            QuestChain: [120002],
        },
        remark: "东国引入任务2完成",
    },
    "120003": {
        id: 120003,
        logic: "AND",
        map: {
            QuestChain: [120003],
        },
        remark: "东国引入任务3完成",
    },
    "120100": {
        id: 120100,
        logic: "AND",
        map: {
            QuestChain: [120003],
        },
        remark: "东国一期的解锁条件",
    },
    "120101": {
        id: 120101,
        logic: "AND",
        map: {
            QuestChain: [120101],
        },
        remark: "东国一期任务完成",
    },
    "120102": {
        id: 120102,
        logic: "AND",
        map: {
            QuestChain: [120102],
        },
        remark: "东国一期任务完成",
    },
    "120103": {
        id: 120103,
        logic: "AND",
        map: {
            QuestChain: [120103],
        },
        remark: "东国一期任务完成",
    },
    "120104": {
        id: 120104,
        logic: "AND",
        map: {
            QuestChain: [120104],
        },
        remark: "东国一期任务完成",
    },
    "120105": {
        id: 120105,
        logic: "AND",
        map: {
            QuestChain: [120105],
        },
        remark: "东国一期任务完成",
    },
    "120106": {
        id: 120106,
        logic: "AND",
        map: {
            QuestChain: [120106],
        },
        remark: "东国一期任务全部完成",
    },
    "120110": {
        id: 120110,
        logic: "AND",
        map: {
            QuestChain: [100208],
        },
        remark: "菲娜活动任务解锁",
    },
    "120111": {
        id: 120111,
        logic: "AND",
        map: {
            QuestChain: [120111],
        },
        remark: "菲娜活动任务1完成",
    },
    "120112": {
        id: 120112,
        logic: "AND",
        map: {
            QuestChain: [120112],
        },
        remark: "菲娜活动任务2完成",
    },
    "120113": {
        id: 120113,
        logic: "AND",
        map: {
            QuestChain: [120113],
        },
        remark: "菲娜活动任务3完成",
    },
    "120114": {
        id: 120114,
        logic: "AND",
        map: {
            QuestChain: [120114],
        },
        remark: "菲娜活动任务4完成",
    },
    "120201": {
        id: 120201,
        logic: "AND",
        map: {
            QuestChain: [120201],
        },
        remark: "东国二期任务1完成",
    },
    "120202": {
        id: 120202,
        logic: "AND",
        map: {
            QuestChain: [120202],
        },
        remark: "东国二期任务2完成",
    },
    "120203": {
        id: 120203,
        logic: "AND",
        map: {
            QuestChain: [120203],
        },
        remark: "东国二期任务3完成",
    },
    "120204": {
        id: 120204,
        logic: "AND",
        map: {
            QuestChain: [120204],
        },
        remark: "东国二期任务4完成",
    },
    "120205": {
        id: 120205,
        logic: "AND",
        map: {
            QuestChain: [120205],
        },
        remark: "东国二期任务5完成",
    },
    "120206": {
        id: 120206,
        logic: "AND",
        map: {
            QuestChain: [120206],
        },
        remark: "东国二期任务6完成",
    },
    "120301": {
        id: 120301,
        logic: "AND",
        map: {
            QuestChain: [120301],
        },
        remark: "奉香大典任务1完成",
    },
    "120302": {
        id: 120302,
        logic: "AND",
        map: {
            QuestChain: [120302],
        },
        remark: "奉香大典任务2完成",
    },
    "120303": {
        id: 120303,
        logic: "AND",
        map: {
            QuestChain: [120303],
        },
        remark: "奉香大典任务3完成",
    },
    "120304": {
        id: 120304,
        logic: "AND",
        map: {
            QuestChain: [120304],
        },
        remark: "奉香大典任务4完成",
    },
    "120305": {
        id: 120305,
        logic: "AND",
        map: {
            QuestChain: [120305],
        },
        remark: "奉香大典任务5完成",
    },
    "120306": {
        id: 120306,
        logic: "AND",
        map: {
            QuestChain: [120306],
        },
        remark: "奉香大典任务6完成",
    },
    "120307": {
        id: 120307,
        logic: "AND",
        map: {
            QuestChain: [120307],
        },
        remark: "奉香大典任务7完成",
    },
    "120308": {
        id: 120308,
        logic: "AND",
        map: {
            QuestChain: [120308],
        },
        remark: "奉香大典任务8完成",
    },
    "150180": {
        id: 150180,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[1501, 80]],
        },
        remark: "获得80级莉兹贝尔",
    },
    "200101": {
        id: 200101,
        logic: "AND",
        map: {
            TrueQuestChain: [200101],
        },
        remark: "支线任务完成",
    },
    "200102": {
        id: 200102,
        logic: "AND",
        map: {
            QuestChain: [200102],
        },
        remark: "支线任务完成",
    },
    "200104": {
        id: 200104,
        logic: "AND",
        map: {
            QuestChain: [200104],
        },
        remark: "魔灵支线下完成",
    },
    "200202": {
        id: 200202,
        logic: "AND",
        map: {
            QuestChain: [200202],
        },
        remark: "支线任务完成",
    },
    "200207": {
        id: 200207,
        logic: "AND",
        map: {
            QuestChain: [200207],
        },
        remark: "支线任务完成",
    },
    "200208": {
        id: 200208,
        logic: "AND",
        map: {
            QuestChain: [200208],
        },
        remark: "支线任务完成",
    },
    "200209": {
        id: 200209,
        logic: "AND",
        map: {
            QuestChain: [200209],
        },
        remark: "支线任务完成",
    },
    "200213": {
        id: 200213,
        logic: "AND",
        map: {
            QuestChain: [200213],
        },
        remark: "玛尔洁支线任务完成",
    },
    "200215": {
        id: 200215,
        logic: "AND",
        map: {
            TrueQuestChain: [200215],
        },
        remark: "马库斯任务完成",
    },
    "200219": {
        id: 200219,
        logic: "AND",
        map: {
            QuestChain: [200219],
        },
        remark: "支线任务完成",
    },
    "200223": {
        id: 200223,
        logic: "AND",
        map: {
            TrueQuestChain: [200223],
        },
        remark: "小小研究者一阶段结束",
    },
    "200224": {
        id: 200224,
        logic: "AND",
        map: {
            TrueQuestChain: [200224],
        },
        remark: "小小研究者二阶段结束",
    },
    "200225": {
        id: 200225,
        logic: "AND",
        map: {
            QuestChain: [200225],
        },
        remark: "小小研究者三阶段结束",
    },
    "200237": {
        id: 200237,
        logic: "AND",
        map: {
            QuestChain: [200237],
        },
        remark: "【灵化武器】任务一完成",
    },
    "200238": {
        id: 200238,
        logic: "AND",
        map: {
            QuestChain: [200238],
        },
        remark: "【灵化武器】任务二完成",
    },
    "200239": {
        id: 200239,
        logic: "AND",
        map: {
            QuestChain: [200239],
        },
        remark: "【灵化武器】任务三完成",
    },
    "200240": {
        id: 200240,
        logic: "AND",
        map: {
            QuestChain: [200240],
        },
        remark: "【灵化武器】任务四完成",
    },
    "200314": {
        id: 200314,
        logic: "AND",
        map: {
            QuestChain: [200314],
        },
        remark: "完成狴犴坐骑支线",
    },
    "200401": {
        id: 200401,
        logic: "AND",
        map: {
            QuestChain: [200401],
        },
        remark: "螺丝刀支线1解锁条件完成黑面包支线",
    },
    "200402": {
        id: 200402,
        logic: "AND",
        map: {
            QuestChain: [200402],
        },
        remark: "解锁条件",
    },
    "200404": {
        id: 200404,
        logic: "AND",
        map: {
            QuestChain: [200404],
        },
        remark: "前置支线【螺丝刀支线1】完成",
    },
    "200406": {
        id: 200406,
        logic: "AND",
        map: {
            QuestChain: [200406],
        },
        remark: "解锁条件",
    },
    "200407": {
        id: 200407,
        logic: "AND",
        map: {
            QuestChain: [200407, 200405],
        },
        remark: "收束线解锁条件：沙龙2+螺丝刀2完成（ai配置）",
    },
    "200700": {
        id: 200700,
        logic: "AND",
        map: {
            IsCurrentCharEquipMod: ["T"],
        },
        remark: "当前角色装备了魔之楔",
    },
    "210100": {
        id: 210100,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[2101, 1]],
        },
        remark: "获得1级水母（解锁水母）",
    },
    "210180": {
        id: 210180,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[2101, 80]],
        },
        remark: "获得80级水母",
    },
    "310101": {
        id: 310101,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[3101, 1]],
        },
        remark: "获得1级琳恩（解锁琳恩）",
    },
    "320180": {
        id: 320180,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[3201, 80]],
        },
        remark: "获得80级海尔法",
    },
    "320280": {
        id: 320280,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[3202, 80]],
        },
        remark: "获得80级卡米拉",
    },
    "443000": {
        id: 443000,
        logic: "AND",
        map: {
            ForgeLevel: [0],
        },
        remark: "灵化武器熔炉等级0",
    },
    "443001": {
        id: 443001,
        logic: "AND",
        map: {
            ForgeLevel: [1],
        },
        remark: "灵化武器熔炉等级1",
    },
    "443002": {
        id: 443002,
        logic: "AND",
        map: {
            ForgeLevel: [2],
        },
        remark: "灵化武器熔炉等级2",
    },
    "443003": {
        id: 443003,
        logic: "AND",
        map: {
            ForgeLevel: [3],
        },
        remark: "灵化武器熔炉等级3",
    },
    "443004": {
        id: 443004,
        logic: "AND",
        map: {
            ForgeLevel: [4],
        },
        remark: "灵化武器熔炉等级4",
    },
    "443005": {
        id: 443005,
        logic: "AND",
        map: {
            ForgeLevel: [5],
        },
        remark: "灵化武器熔炉等级5",
    },
    "451001": {
        id: 451001,
        logic: "AND",
        map: {
            GuildLevelMin: [1],
        },
        remark: "公会1级解锁（需要有公会）",
    },
    "451002": {
        id: 451002,
        logic: "AND",
        map: {
            GuildLevelMin: [2],
        },
        remark: "公会2级解锁",
    },
    "451003": {
        id: 451003,
        logic: "AND",
        map: {
            GuildLevelMin: [3],
        },
        remark: "公会3级解锁",
    },
    "451004": {
        id: 451004,
        logic: "AND",
        map: {
            GuildLevelMin: [4],
        },
        remark: "公会4级解锁",
    },
    "451005": {
        id: 451005,
        logic: "AND",
        map: {
            GuildLevelMin: [5],
        },
        remark: "公会5级解锁",
    },
    "451006": {
        id: 451006,
        logic: "AND",
        map: {
            GuildLevelMin: [6],
        },
        remark: "公会6级解锁",
    },
    "465456": {
        id: 465456,
        logic: "AND",
        map: {
            EquipPetId: [401],
        },
        remark: "宠物测试用",
    },
    "511564": {
        id: 511564,
        logic: "AND",
        map: {
            InteractTriggerFinished: [511564],
        },
        remark: "完成511564获得奖励后",
    },
    "700001": {
        id: 700001,
        logic: "AND",
        map: {
            CurrentCharId: [1101],
        },
        remark: "【动态事件】黑桃的回忆",
    },
    "800061": {
        id: 800061,
        logic: "AND",
        map: {
            DynamicEventCompleteTimes: [[100600, 3]],
            PlayerLevelMin: [12],
        },
        remark: "喂猫常驻动态事件解锁-完成猫的报恩定制动态事件",
    },
    "990101": {
        id: 990101,
        logic: "AND",
        map: {
            QuestChain: [990101],
        },
        remark: "任务测试用",
    },
    "990102": {
        id: 990102,
        logic: "AND",
        map: {
            QuestChain: [990102],
        },
        remark: "任务测试用",
    },
    "990103": {
        id: 990103,
        logic: "AND",
        map: {
            QuestChain: [990103],
        },
        remark: "任务测试用",
    },
    "990104": {
        id: 990104,
        logic: "AND",
        map: {
            QuestChain: [990104],
        },
        remark: "任务测试用",
    },
    "990106": {
        id: 990106,
        logic: "AND",
        map: {
            QuestChain: [990106],
        },
        remark: "任务测试用",
    },
    "999992": {
        id: 999992,
        logic: "AND",
        map: {
            CurrentCharId: [1101],
        },
        isNot: true,
        remark: "程序动态事件测试用",
    },
    "999993": {
        id: 999993,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[3101, 5]],
        },
        remark: "程序动态事件测试用",
    },
    "999994": {
        id: 999994,
        logic: "AND",
        map: {
            DynamicEventCompleteTimes: [[1, 1]],
        },
        remark: "程序动态事件测试用",
    },
    "999995": {
        id: 999995,
        logic: "OR",
        map: {
            RougeLikeComplete: [101],
        },
        remark: "程序测试用",
    },
    "999996": {
        id: 999996,
        logic: "AND",
        map: {
            TestClientCon: [1, 2, 3],
        },
        remark: "程序测试用",
    },
    "999997": {
        id: 999997,
        logic: "OR",
        map: {
            SubRegionType: ["home"],
        },
        remark: "程序测试用",
    },
    "999998": {
        id: 999998,
        logic: "AND",
        map: {
            RougeLikePreRoom: [101],
        },
        isNot: true,
        remark: "程序测试用",
    },
    "999999": {
        id: 999999,
        logic: "AND",
        map: {
            HaveResource: [
                [999, 999],
                [998, 998],
            ],
            Impression: [[1, 1]],
            MechanismState: [[1, 1, 1]],
            PlayerLevelMax: [9999],
            PlayerLevelMin: [60],
            Quest: [99999],
            QuestChain: [999999],
        },
        remark: "程序测试用",
    },
    "1000001": {
        id: 1000001,
        logic: "AND",
        map: {
            AvatarStatus: [["InTrainingGround", "F"]],
        },
        remark: "成就-不在训练场",
    },
    "1000002": {
        id: 1000002,
        logic: "AND",
        map: {
            AvatarStatus: [["InTrainingGround", "T"]],
        },
        remark: "成就-在训练场",
    },
    "1000003": {
        id: 1000003,
        logic: "AND",
        map: {
            AvatarStatus: [["InBigWorld", "F"]],
        },
        remark: "成就-不在大世界",
    },
    "1000004": {
        id: 1000004,
        logic: "AND",
        map: {
            AvatarStatus: [["InBigWorld", "T"]],
        },
        remark: "成就-在大世界",
    },
    "1000005": {
        id: 1000005,
        logic: "AND",
        map: {
            AvatarStatus: [["InSingleDungeon", "F"]],
        },
        remark: "成就-不在单机副本",
    },
    "1000006": {
        id: 1000006,
        logic: "AND",
        map: {
            AvatarStatus: [["InSingleDungeon", "T"]],
        },
        remark: "成就-在单机副本",
    },
    "1000007": {
        id: 1000007,
        logic: "AND",
        map: {
            AvatarStatus: [["InMultiDungeon", "F"]],
        },
        remark: "成就-不在联机副本",
    },
    "1000008": {
        id: 1000008,
        logic: "AND",
        map: {
            AvatarStatus: [["InMultiDungeon", "T"]],
        },
        remark: "成就-在联机副本",
    },
    "1000009": {
        id: 1000009,
        logic: "AND",
        map: {
            AvatarStatus: [["InHardBoss", "F"]],
        },
        remark: "成就-不在梦魇残声",
    },
    "1000010": {
        id: 1000010,
        logic: "AND",
        map: {
            AvatarStatus: [["InHardBoss", "T"]],
        },
        remark: "成就-在梦魇残声",
    },
    "1000011": {
        id: 1000011,
        logic: "AND",
        map: {
            AvatarStatus: [["InRougeLike", "F"]],
        },
        remark: "成就-不在肉鸽",
    },
    "1000012": {
        id: 1000012,
        logic: "AND",
        map: {
            AvatarStatus: [["InRougeLike", "T"]],
        },
        remark: "成就-在肉鸽",
    },
    "1000051": {
        id: 1000051,
        logic: "OR",
        map: {
            AvatarStatus: [
                ["InBigWorld", "T"],
                ["InSingleDungeon", "T"],
                ["InMultiDungeon", "T"],
            ],
        },
        remark: "成就-组合条件-大世界+单机副本+联机副本",
    },
    "1000052": {
        id: 1000052,
        logic: "OR",
        map: {
            AvatarStatus: [
                ["InSingleDungeon", "T"],
                ["InMultiDungeon", "T"],
            ],
        },
        remark: "组合条件-单机副本+联机副本",
    },
    "1000053": {
        id: 1000053,
        logic: "OR",
        map: {
            AvatarStatus: [
                ["InSingleDungeon", "T"],
                ["InBigWorld", "T"],
            ],
        },
        remark: "组合条件-单机副本+大世界",
    },
    "1000054": {
        id: 1000054,
        logic: "OR",
        map: {
            AvatarStatus: [
                ["InBigWorld", "T"],
                ["InSingleDungeon", "T"],
                ["InMultiDungeon", "T"],
                ["InRougeLike", "T"],
                ["InHardBoss", "T"],
            ],
        },
        remark: "成就-组合条件-大世界+单机副本+联机副本+肉鸽+梦魇",
    },
    "1000101": {
        id: 1000101,
        logic: "OR",
        map: {
            InHardBossDifficulty: [1001, 1002, 1003, 1004, 1005, 1006],
        },
        remark: "成就-在任意难度梦魇西比中",
    },
    "1000102": {
        id: 1000102,
        logic: "OR",
        map: {
            InHardBossDifficulty: [1011, 1012, 1013, 1014, 1015, 1016],
        },
        remark: "成就-在任意难度梦魇嗜晶者中",
    },
    "1000103": {
        id: 1000103,
        logic: "OR",
        map: {
            InHardBossDifficulty: [1021, 1022, 1023, 1024, 1025, 1026],
        },
        remark: "成就-在任意难度梦魇赛琪中",
    },
    "1000104": {
        id: 1000104,
        logic: "OR",
        map: {
            InHardBossDifficulty: [1031, 1032, 1033, 1034, 1035, 1036],
        },
        remark: "成就-在任意难度梦魇海尔法中",
    },
    "1000105": {
        id: 1000105,
        logic: "OR",
        map: {
            InHardBossDifficulty: [1041, 1042, 1043, 1044, 1045, 1046],
        },
        remark: "成就-在任意难度梦魇琳恩中",
    },
    "1000151": {
        id: 1000151,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1006],
        },
        remark: "成就-在最高难度梦魇西比中",
    },
    "1000152": {
        id: 1000152,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1016],
        },
        remark: "成就-在最高难度梦魇嗜晶者中",
    },
    "1000153": {
        id: 1000153,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1026],
        },
        remark: "成就-在最高难度梦魇赛琪中",
    },
    "1000154": {
        id: 1000154,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1036],
        },
        remark: "成就-在最高难度梦魇海尔法中",
    },
    "1000155": {
        id: 1000155,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1046],
        },
        remark: "成就-在最高难度梦魇琳恩中",
    },
    "1000181": {
        id: 1000181,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1003],
        },
        remark: "成就-在50级梦魇西比中",
    },
    "1000182": {
        id: 1000182,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1013],
        },
        remark: "成就-在50级梦魇嗜晶者中",
    },
    "1000183": {
        id: 1000183,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1023],
        },
        remark: "成就-在50级梦魇赛琪中",
    },
    "1000184": {
        id: 1000184,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1033],
        },
        remark: "成就-在50级梦魇海尔法中",
    },
    "1000185": {
        id: 1000185,
        logic: "AND",
        map: {
            InHardBossDifficulty: [1043],
        },
        remark: "成就-在50级梦魇琳恩中",
    },
    "1000201": {
        id: 1000201,
        logic: "OR",
        map: {
            DungeonType: ["Survival"],
        },
        remark: "成就-在任意难度探险",
    },
    "1000202": {
        id: 1000202,
        logic: "OR",
        map: {
            DungeonType: ["SurvivalPro"],
        },
        remark: "成就-在任意难度探险无尽",
    },
    "1000203": {
        id: 1000203,
        logic: "OR",
        map: {
            DungeonType: ["DefencePro"],
        },
        remark: "成就-在任意难度扼守",
    },
    "1000204": {
        id: 1000204,
        logic: "OR",
        map: {
            DungeonType: ["Defence"],
        },
        remark: "成就-在任意难度扼守无尽",
    },
    "1000205": {
        id: 1000205,
        logic: "OR",
        map: {
            DungeonType: ["Capture"],
        },
        remark: "成就-在任意难度追缉",
    },
    "1000206": {
        id: 1000206,
        logic: "OR",
        map: {
            DungeonType: ["Sabotage"],
        },
        remark: "成就-在任意难度调停",
    },
    "1000207": {
        id: 1000207,
        logic: "OR",
        map: {
            DungeonType: ["Exterminate"],
        },
        remark: "成就-在任意难度驱逐",
    },
    "1000208": {
        id: 1000208,
        logic: "OR",
        map: {
            DungeonType: ["Rescue"],
        },
        remark: "成就-在任意难度护送",
    },
    "1000209": {
        id: 1000209,
        logic: "OR",
        map: {
            DungeonType: ["Hijack"],
        },
        remark: "成就-在任意难度迁移",
    },
    "1000210": {
        id: 1000210,
        logic: "OR",
        map: {
            DungeonType: ["ExtermPro"],
        },
        remark: "成就-在任意难度驱离",
    },
    "1000301": {
        id: 1000301,
        logic: "OR",
        map: {
            InDungeon: [90607],
        },
        remark: "成就-在最高难度探险",
    },
    "1000302": {
        id: 1000302,
        logic: "OR",
        map: {
            InDungeon: [90437, 90438, 90439, 90440, 90441, 90442],
        },
        remark: "成就-在最高难度探险无尽",
    },
    "1000303": {
        id: 1000303,
        logic: "OR",
        map: {
            InDungeon: [90113],
        },
        remark: "成就-在最高难度扼守",
    },
    "1000304": {
        id: 1000304,
        logic: "OR",
        map: {
            InDungeon: [90114],
        },
        remark: "成就-在最高难度扼守无尽",
    },
    "1000305": {
        id: 1000305,
        logic: "OR",
        map: {
            InDungeon: [90311],
        },
        remark: "成就-在最高难度追缉",
    },
    "1000306": {
        id: 1000306,
        logic: "OR",
        map: {
            InDungeon: [90507],
        },
        remark: "成就-在最高难度调停",
    },
    "1000307": {
        id: 1000307,
        logic: "OR",
        map: {
            InDungeon: [90807],
        },
        remark: "成就-在最高难度驱逐",
    },
    "1000308": {
        id: 1000308,
        logic: "OR",
        map: {
            InDungeon: [90907],
        },
        remark: "成就-在最高难度护送",
    },
    "1000309": {
        id: 1000309,
        logic: "OR",
        map: {
            InDungeon: [90707],
        },
        remark: "成就-在最高难度迁移",
    },
    "1000310": {
        id: 1000310,
        logic: "OR",
        map: {
            InDungeon: [91007],
        },
        remark: "成就-在最高难度驱离",
    },
    "1000401": {
        id: 1000401,
        logic: "AND",
        map: {
            AvatarStatus: [["InSpecialQuest", "F"]],
            QuestChain: [100201],
        },
        remark: "组合条件-到达据点且不在特殊任务中（采集特殊怪使用）",
    },
    "1000501": {
        id: 1000501,
        logic: "AND",
        map: {
            VarEqual: {
                Name: "PhotoTalk110105",
                Value: 1,
            },
        },
        remark: "成就-旗帜（显示变量）",
    },
    "1000502": {
        id: 1000502,
        logic: "AND",
        map: {
            VarEqual: {
                Name: "KajiaTalkEnd110105",
                Value: 1,
            },
        },
        remark: "成就-来吧，甜蜜的死亡（显示变量）",
    },
    "1000601": {
        id: 1000601,
        logic: "OR",
        map: {
            Quest: [10030197],
        },
        remark: "第一次推理小游戏结束后",
    },
    "1000602": {
        id: 1000602,
        logic: "OR",
        map: {
            Quest: [10030206],
        },
        remark: "第一次下水道战斗后",
    },
    "1000603": {
        id: 1000603,
        logic: "OR",
        map: {
            Quest: [10030394],
        },
        remark: "第一次调查完秘密基地后",
    },
    "1000604": {
        id: 1000604,
        logic: "OR",
        map: {
            Quest: [10030498],
        },
        remark: "钓鱼完成后",
    },
    "1000605": {
        id: 1000605,
        logic: "OR",
        map: {
            Quest: [10030499],
        },
        remark: "下水道小剧场boss战后",
    },
    "1000606": {
        id: 1000606,
        logic: "OR",
        map: {
            Quest: [10030405],
        },
        remark: "幻景扮做的布鲁斯与黎瑟相遇后，炼金院剧情前",
    },
    "1000607": {
        id: 1000607,
        logic: "OR",
        map: {
            Quest: [10030508],
        },
        remark: "逃出炼金院后",
    },
    "1000608": {
        id: 1000608,
        logic: "OR",
        map: {
            Quest: [10030601],
        },
        remark: "完成琳恩boss战后",
    },
    "1000609": {
        id: 1000609,
        logic: "AND",
        map: {
            MechanismState: [[2080099, 0, 701001]],
        },
        remark: "机枢支线宝箱C未开启",
    },
    "1002121": {
        id: 1002121,
        logic: "AND",
        map: {
            PlayerLevelMin: [20],
            QuestChain: [100208],
        },
        remark: "第一章任务完成",
    },
    "1203021": {
        id: 1203021,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 20000]],
            QuestChain: [120302],
        },
        remark: "奉香大典任务3解锁",
    },
    "1203031": {
        id: 1203031,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 50000]],
            QuestChain: [120303],
        },
        remark: "奉香大典任务4解锁",
    },
    "1203051": {
        id: 1203051,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 80000]],
            QuestChain: [120305],
        },
        remark: "奉香大典任务6解锁",
    },
    "1203061": {
        id: 1203061,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 120000]],
            QuestChain: [120306],
        },
        remark: "奉香大典任务7解锁",
    },
    "4030001": {
        id: 4030001,
        logic: "AND",
        map: {
            HaveItem: [["Skin", 410201, 1]],
        },
        remark: "获得止流皮肤",
    },
    "4030002": {
        id: 4030002,
        logic: "AND",
        map: {
            BuyGoods: [[140269, 1]],
        },
        remark: "购买龙坐骑",
    },
    "4030003": {
        id: 4030003,
        logic: "OR",
        map: {
            HaveItem: [
                ["Resource", 41014, 1],
                ["Resource", 41017, 1],
                ["Resource", 41018, 1],
                ["Resource", 41020, 1],
                ["Resource", 41021, 1],
                ["Resource", 41022, 1],
                ["Resource", 41032, 1],
                ["Resource", 41040, 1],
                ["Resource", 41041, 1],
            ],
        },
        remark: "获得截至1.2的任一红色轮盘动作",
    },
    "4030004": {
        id: 4030004,
        logic: "AND",
        map: {
            HaveItem: [
                ["WeaponSkin", 3010205, 1],
                ["WeaponSkin", 3010406, 1],
                ["WeaponSkin", 3010108, 1],
                ["WeaponSkin", 3010707, 1],
                ["WeaponSkin", 3010804, 1],
                ["WeaponSkin", 3010607, 1],
            ],
        },
        remark: "获得1.2所有6个糖葫芦武器皮肤",
    },
    "4030005": {
        id: 4030005,
        logic: "AND",
        map: {
            HaveItem: [
                ["Mount", 1004, 1],
                ["Mount", 1007, 1],
                ["Mount", 1006, 1],
            ],
        },
        remark: "获得3把飞剑坐骑的皮肤",
    },
    "4030006": {
        id: 4030006,
        logic: "OR",
        map: {
            HaveItem: [
                ["Resource", 41051, 1],
                ["Resource", 41054, 1],
                ["Resource", 41055, 1],
            ],
        },
        remark: "获得1.3任意苏乙红色轮盘动作",
    },
    "4030007": {
        id: 4030007,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41051, 1]],
        },
        remark: "获得机枢幻想·涅白",
    },
    "4030008": {
        id: 4030008,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41054, 1]],
        },
        remark: "获得机枢幻想·锈红",
    },
    "4030009": {
        id: 4030009,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41055, 1]],
        },
        remark: "获得机枢幻想·墨玉",
    },
    "4030010": {
        id: 4030010,
        logic: "AND",
        map: {
            HaveItem: [["Mount", 1005, 1]],
        },
        remark: "获得飞剑原皮",
    },
    "4030011": {
        id: 4030011,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41014, 1]],
        },
        remark: "获得极速定格·本色",
    },
    "4030012": {
        id: 4030012,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41018, 1]],
        },
        remark: "获得极速定格·鎏金",
    },
    "4030013": {
        id: 4030013,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41017, 1]],
        },
        remark: "获得极速定格·白樱",
    },
    "4030014": {
        id: 4030014,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41058, 1]],
        },
        remark: "获得罪壤·锈红",
    },
    "4030015": {
        id: 4030015,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41062, 1]],
        },
        remark: "获得罪壤·鎏金",
    },
    "4030016": {
        id: 4030016,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41063, 1]],
        },
        remark: "获得罪壤·晴蓝",
    },
    "4030017": {
        id: 4030017,
        logic: "OR",
        map: {
            HaveItem: [
                ["Resource", 41014, 1],
                ["Resource", 41017, 1],
                ["Resource", 41018, 1],
                ["Resource", 41020, 1],
                ["Resource", 41021, 1],
                ["Resource", 41022, 1],
                ["Resource", 41032, 1],
                ["Resource", 41040, 1],
                ["Resource", 41041, 1],
            ],
        },
        remark: "获得赛琪、扶疏、止流任意红色轮盘动作",
    },
    "4030018": {
        id: 4030018,
        logic: "OR",
        map: {
            HaveItem: [
                ["Resource", 41058, 1],
                ["Resource", 41062, 1],
                ["Resource", 41063, 1],
            ],
        },
        remark: "获得1.4任意芙罗拉红色轮盘动作",
    },
    "4030019": {
        id: 4030019,
        logic: "AND",
        map: {
            HaveItem: [["Skin", 110201, 1]],
        },
        remark: "获得芙罗拉皮肤赦罪者",
    },
    "4030020": {
        id: 4030020,
        logic: "AND",
        map: {
            HaveItem: [["Mount", 1009, 1]],
        },
        remark: "获得马坐骑",
    },
    "4030021": {
        id: 4030021,
        logic: "AND",
        map: {
            HaveItem: [["Mount", 1010, 1]],
        },
        remark: "获得马车坐骑",
    },
    "4030022": {
        id: 4030022,
        logic: "AND",
        map: {
            HaveItem: [
                ["WeaponSkin", 3010505, 1],
                ["WeaponSkin", 3011103, 1],
                ["WeaponSkin", 3010307, 1],
                ["WeaponSkin", 3010903, 1],
                ["WeaponSkin", 3011205, 1],
                ["WeaponSkin", 3011004, 1],
                ["WeaponSkin", 3010306, 1],
            ],
        },
        remark: "获得1.4所有呐喊武器皮肤",
    },
    "4030023": {
        id: 4030023,
        logic: "AND",
        map: {
            GachaCount: [[9007, 60]],
        },
        remark: "伊薇池抽卡60次",
    },
    "4030024": {
        id: 4030024,
        logic: "AND",
        map: {
            GachaCount: [[9007, 120]],
        },
        remark: "伊薇池抽卡120次",
    },
    "4030025": {
        id: 4030025,
        logic: "AND",
        map: {
            GachaCount: [[9007, 180]],
        },
        remark: "伊薇池抽卡180次",
    },
    "4030026": {
        id: 4030026,
        logic: "AND",
        map: {
            GachaCount: [[9001, 9]],
        },
        remark: "常驻池抽卡9次-测试用",
    },
    "4030027": {
        id: 4030027,
        logic: "AND",
        map: {
            GachaCount: [[9002, 1]],
        },
        remark: "赛琪池抽卡1次-测试用",
    },
    "4030028": {
        id: 4030028,
        logic: "AND",
        map: {
            GachaCount: [[9002, 20]],
        },
        remark: "赛琪池抽卡20次-测试用",
    },
    "4030029": {
        id: 4030029,
        logic: "AND",
        map: {
            GachaCount: [[90021, 1]],
        },
        remark: "芙罗拉池抽卡1次-测试用",
    },
    "4030030": {
        id: 4030030,
        logic: "AND",
        map: {
            GachaCount: [[90021, 20]],
        },
        remark: "芙罗拉池抽卡20次-测试用",
    },
    "4030031": {
        id: 4030031,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41064, 1]],
        },
        remark: "获得初雪小夜曲·涅白",
    },
    "4030032": {
        id: 4030032,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41067, 1]],
        },
        remark: "获得初雪小夜曲·白樱",
    },
    "4030033": {
        id: 4030033,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41068, 1]],
        },
        remark: "获得初雪小夜曲·晴蓝",
    },
    "4030034": {
        id: 4030034,
        logic: "OR",
        map: {
            HaveItem: [
                ["Resource", 41064, 1],
                ["Resource", 41067, 1],
                ["Resource", 41068, 1],
            ],
        },
        remark: "获得1.5任意伊薇红色轮盘动作",
    },
    "4030035": {
        id: 4030035,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41021, 1]],
        },
        remark: "获得悠游水岸·白樱",
    },
    "4030036": {
        id: 4030036,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41020, 1]],
        },
        remark: "获得悠游水岸·本色",
    },
    "4030037": {
        id: 4030037,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41022, 1]],
        },
        remark: "获得悠游水岸·绛紫",
    },
    "4030038": {
        id: 4030038,
        logic: "AND",
        map: {
            HaveItem: [["Skin", 210201, 1]],
        },
        remark: "获得伊薇皮肤逐光追雪",
    },
    "4030039": {
        id: 4030039,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41069, 1]],
        },
        remark: "获得地狱01（法露茜红皮轮盘头像1解锁）",
    },
    "4030040": {
        id: 4030040,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41070, 1]],
        },
        remark: "获得地狱02（法露茜红皮轮盘头像2解锁）",
    },
    "4030041": {
        id: 4030041,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 41071, 1]],
        },
        remark: "获得地狱03（法露茜红皮轮盘头像3解锁）",
    },
    "4030042": {
        id: 4030042,
        logic: "AND",
        map: {
            HaveItem: [["Mount", 1014, 1]],
        },
        remark: "获得黑龙坐骑",
    },
    "4030043": {
        id: 4030043,
        logic: "OR",
        map: {
            HaveItem: [
                ["Resource", 41069, 1],
                ["Resource", 41070, 1],
                ["Resource", 41071, 1],
            ],
        },
        remark: "获得任意地狱咆哮展示动作",
    },
    "4030044": {
        id: 4030044,
        logic: "AND",
        map: {
            HaveItem: [["Skin", 310401, 1]],
        },
        remark: "获得法露茜皮肤",
    },
    "4030045": {
        id: 4030045,
        logic: "AND",
        map: {
            HaveItem: [["CharAccessory", 30070, 1]],
        },
        remark: "获得外观收集1.6第一档外观奖励",
    },
    "4030046": {
        id: 4030046,
        logic: "AND",
        map: {
            GachaCount: [[9008, 60]],
        },
        remark: "伊薇池抽卡60次",
    },
    "4030047": {
        id: 4030047,
        logic: "AND",
        map: {
            GachaCount: [[9008, 120]],
        },
        remark: "伊薇池抽卡120次",
    },
    "4030048": {
        id: 4030048,
        logic: "AND",
        map: {
            GachaCount: [[9008, 180]],
        },
        remark: "伊薇池抽卡180次",
    },
    "4030049": {
        id: 4030049,
        logic: "AND",
        map: {
            HaveItem: [["Mount", 1001, 1]],
        },
        remark: "获得龙坐骑",
    },
    "4030050": {
        id: 4030050,
        logic: "AND",
        map: {
            HaveItem: [
                ["WeaponSkin", 3010110, 1],
                ["WeaponSkin", 3010611, 1],
                ["WeaponSkin", 3010409, 1],
                ["WeaponSkin", 3010209, 1],
                ["WeaponSkin", 3010715, 1],
                ["WeaponSkin", 3010807, 1],
            ],
        },
        remark: "获得1.6所有呐喊武器皮肤",
    },
    "7072038": {
        id: 7072038,
        logic: "AND",
        map: {
            ExploreGroup: [7072038],
        },
        remark: "琴声支线探索组完成条件",
    },
    "10007126": {
        id: 10007126,
        logic: "AND",
        map: {
            DungeonComplete: [[41809, 1, 1]],
        },
        remark: "搜打撤活动铜币本门票解锁条件",
    },
    "10020105": {
        id: 10020105,
        logic: "AND",
        map: {
            Quest: [10020105],
        },
        remark: "联机提前解锁",
    },
    "10020106": {
        id: 10020106,
        logic: "AND",
        map: {
            Quest: [10020106],
        },
        remark: "┗ 支线解锁",
    },
    "10020201": {
        id: 10020201,
        logic: "AND",
        map: {
            PlayerLevelMin: [12],
            TrueQuestChain: [100202, 200103],
        },
        remark: "嗜晶者任务解锁条件",
    },
    "10020202": {
        id: 10020202,
        logic: "AND",
        map: {
            QuestChain: [100202],
        },
        remark: "第一章任务假完成",
    },
    "10020501": {
        id: 10020501,
        logic: "AND",
        map: {
            TrueQuestChain: [100205, 200102],
        },
        remark: "挖土和冰湖狩猎都完成",
    },
    "10020502": {
        id: 10020502,
        logic: "AND",
        map: {
            Quest: [10020501],
        },
        remark: "完成调停委托",
    },
    "10020601": {
        id: 10020601,
        logic: "AND",
        map: {
            PlayerLevelMin: [19],
            TrueQuestChain: [100206, 200215],
        },
        remark: "在广场等赛琪的解锁条件",
    },
    "10020801": {
        id: 10020801,
        logic: "AND",
        map: {
            PlayerLevelMin: [24],
            QuestChain: [100208],
        },
        remark: "EX01主线的解锁条件（废弃）",
    },
    "10020802": {
        id: 10020802,
        logic: "AND",
        map: {
            TrueQuestChain: [100208],
        },
        remark: "第一章任务真完成",
    },
    "10020803": {
        id: 10020803,
        logic: "AND",
        map: {
            QuestChain: [100208],
            TrueQuestChain: [200103],
        },
        remark: "魔灵支线下解锁条件",
    },
    "10030498": {
        id: 10030498,
        logic: "AND",
        map: {
            Quest: [10030498],
        },
        remark: "第二章任务完成",
    },
    "10030701": {
        id: 10030701,
        logic: "AND",
        map: {
            PlayerLevelMin: [37],
            QuestChain: [100307],
        },
        remark: "东国引入的解锁条件",
    },
    "10040101": {
        id: 10040101,
        logic: "AND",
        map: {
            PlayerLevelMin: [47],
            QuestChain: [120206],
        },
        remark: "第三章解锁条件",
    },
    "10040102": {
        id: 10040102,
        logic: "AND",
        map: {
            InStoryMode: ["F"],
            Quest: [10040116],
        },
        remark: "火车站传送点解锁",
    },
    "10040209": {
        id: 10040209,
        logic: "AND",
        map: {
            Quest: [10040209],
        },
        remark: "火车站医务室传送点开启",
    },
    "10040501": {
        id: 10040501,
        logic: "AND",
        map: {
            PlayerLevelMin: [50],
            QuestChain: [100405],
        },
        remark: "ex02_完成第三章任务",
    },
    "10100101": {
        id: 10100101,
        logic: "AND",
        map: {
            PlayerLevelMin: [57],
        },
        remark: "百科词条解锁条件-测试1",
    },
    "10100102": {
        id: 10100102,
        logic: "AND",
        map: {
            PlayerLevelMin: [58],
        },
        remark: "百科词条解锁条件-测试2",
    },
    "10100103": {
        id: 10100103,
        logic: "AND",
        map: {
            PlayerLevelMin: [59],
        },
        remark: "百科词条解锁条件-测试3",
    },
    "10100201": {
        id: 10100201,
        logic: "AND",
        map: {
            PlayerLevelMin: [60],
        },
        remark: "百科词条解锁条件-测试4",
    },
    "10100301": {
        id: 10100301,
        logic: "OR",
        map: {
            DialogueHasRead: [10100201],
        },
        remark: "海伯利亚帝国",
    },
    "10100401": {
        id: 10100401,
        logic: "OR",
        map: {
            DialogueHasRead: [10100601],
        },
        remark: "神弃者同盟",
    },
    "10100402": {
        id: 10100402,
        logic: "OR",
        map: {
            DialogueHasRead: [11010401],
        },
        remark: "神弃者同盟（追加1）",
    },
    "10100403": {
        id: 10100403,
        logic: "OR",
        map: {
            DialogueHasRead: [11011901],
        },
        remark: "神弃者同盟（追加2）",
    },
    "10100501": {
        id: 10100501,
        logic: "OR",
        map: {
            DialogueHasRead: [10100801],
        },
        remark: "海伯利亚军团",
    },
    "10100601": {
        id: 10100601,
        logic: "OR",
        map: {
            DialogueHasRead: [10101901],
        },
        remark: "卫戍部队",
    },
    "10100602": {
        id: 10100602,
        logic: "OR",
        map: {
            DialogueHasRead: [10102401],
        },
        remark: "卫戍部队（追加1）",
    },
    "10100701": {
        id: 10100701,
        logic: "OR",
        map: {
            DialogueHasRead: [11010501],
        },
        remark: "海伯利亚炼金院",
    },
    "10100801": {
        id: 10100801,
        logic: "OR",
        map: {
            DialogueHasRead: [11018819],
            Quest: [11010704],
        },
        remark: "海伯利亚枢密院",
    },
    "10100901": {
        id: 10100901,
        logic: "OR",
        map: {
            DialogueHasRead: [20000501],
        },
        remark: "艾利西安",
    },
    "10101001": {
        id: 10101001,
        logic: "OR",
        map: {
            QuestChain: [200220],
        },
        remark: "夜航者",
    },
    "10200401": {
        id: 10200401,
        logic: "AND",
        map: {
            QuestChain: [100405],
        },
        remark: "1.6探索活动解锁条件",
    },
    "10300101": {
        id: 10300101,
        logic: "OR",
        map: {
            DialogueHasRead: [12042911],
        },
        remark: "飘零人",
    },
    "10300102": {
        id: 10300102,
        logic: "OR",
        map: {
            DialogueHasRead: [12061709],
        },
        remark: "飘零人（追加1）",
    },
    "10301401": {
        id: 10301401,
        logic: "AND",
        map: {
            DungeonComplete: [[41801, 1, 1]],
        },
        remark: "搜打撤活动关1解锁条件",
    },
    "10301402": {
        id: 10301402,
        logic: "AND",
        map: {
            DungeonComplete: [[41803, 1, 1]],
        },
        remark: "搜打撤活动关2解锁条件",
    },
    "10301403": {
        id: 10301403,
        logic: "AND",
        map: {
            DungeonComplete: [[41805, 1, 1]],
        },
        remark: "搜打撤活动关3解锁条件",
    },
    "10301404": {
        id: 10301404,
        logic: "AND",
        map: {
            DungeonComplete: [[41809, 1, 1]],
        },
        remark: "搜打撤活动关4解锁条件",
    },
    "10301411": {
        id: 10301411,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
        },
        remark: "搜打撤阶段1条件",
    },
    "10301412": {
        id: 10301412,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 50000]],
        },
        remark: "搜打撤阶段2条件",
    },
    "10301413": {
        id: 10301413,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 90000]],
        },
        remark: "搜打撤阶段3条件",
    },
    "10301414": {
        id: 10301414,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 120000]],
        },
        remark: "搜打撤阶段4条件",
    },
    "10301415": {
        id: 10301415,
        logic: "AND",
        map: {
            HaveGotSoloTreasureScore: [[103014, 200000]],
        },
        remark: "搜打撤阶段5条件",
    },
    "10301416": {
        id: 10301416,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000041, 1]],
        },
        remark: "搜打撤背包1解锁条件",
    },
    "10301417": {
        id: 10301417,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000042, 1]],
        },
        remark: "搜打撤背包2解锁条件",
    },
    "10301418": {
        id: 10301418,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000043, 1]],
        },
        remark: "搜打撤背包3解锁条件",
    },
    "10301419": {
        id: 10301419,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000044, 1]],
        },
        remark: "搜打撤背包4解锁条件",
    },
    "10301420": {
        id: 10301420,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000045, 1]],
        },
        remark: "搜打撤背包5解锁条件",
    },
    "10301421": {
        id: 10301421,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000046, 1]],
        },
        remark: "搜打撤背包6解锁条件",
    },
    "10301422": {
        id: 10301422,
        logic: "AND",
        map: {
            Quest: [12030201],
        },
        remark: "搜打撤剧情关1解锁条件",
    },
    "10301423": {
        id: 10301423,
        logic: "AND",
        map: {
            Quest: [12030301],
        },
        remark: "搜打撤剧情关2解锁条件",
    },
    "10301424": {
        id: 10301424,
        logic: "AND",
        map: {
            Quest: [12030401],
        },
        remark: "搜打撤剧情关3解锁条件",
    },
    "10301425": {
        id: 10301425,
        logic: "AND",
        map: {
            Quest: [12030601],
        },
        remark: "搜打撤剧情关4解锁条件",
    },
    "10301426": {
        id: 10301426,
        logic: "AND",
        map: {
            Quest: [12030701],
        },
        remark: "搜打撤剧情关5解锁条件",
    },
    "10301427": {
        id: 10301427,
        logic: "AND",
        map: {
            DungeonComplete: [[41801, 1, 1]],
        },
        remark: "搜打撤剧情关1完成",
    },
    "10301428": {
        id: 10301428,
        logic: "AND",
        map: {
            DungeonComplete: [[41803, 1, 1]],
        },
        remark: "搜打撤剧情关2完成",
    },
    "10301429": {
        id: 10301429,
        logic: "AND",
        map: {
            DungeonComplete: [[41805, 1, 1]],
        },
        remark: "搜打撤剧情关3完成",
    },
    "10301430": {
        id: 10301430,
        logic: "AND",
        map: {
            DungeonComplete: [[41807, 1, 1]],
        },
        remark: "搜打撤剧情关4完成",
    },
    "10301431": {
        id: 10301431,
        logic: "AND",
        map: {
            DungeonComplete: [[41809, 1, 1]],
        },
        remark: "搜打撤剧情关5完成",
    },
    "10302103": {
        id: 10302103,
        logic: "AND",
        map: {
            HaveItem: [
                ["Skin", 530102, 1],
                ["Skin", 110101, 1],
            ],
        },
        remark: "有限奖池获得2个皮肤",
    },
    "10302208": {
        id: 10302208,
        logic: "AND",
        map: {
            StarterQuestFinish: [1009],
        },
        remark: "新手任务领取所有奖励",
    },
    "10302716": {
        id: 10302716,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000051, 1]],
        },
        remark: "常驻搜打撤背包1解锁条件",
    },
    "10302717": {
        id: 10302717,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000052, 1]],
        },
        remark: "常驻搜打撤背包2解锁条件",
    },
    "10302718": {
        id: 10302718,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000053, 1]],
        },
        remark: "常驻搜打撤背包3解锁条件",
    },
    "10302719": {
        id: 10302719,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000054, 1]],
        },
        remark: "常驻搜打撤背包4解锁条件",
    },
    "10302720": {
        id: 10302720,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000055, 1]],
        },
        remark: "常驻搜打撤背包5解锁条件",
    },
    "10302721": {
        id: 10302721,
        logic: "AND",
        map: {
            HaveItem: [["Resource", 60000056, 1]],
        },
        remark: "常驻搜打撤背包6解锁条件",
    },
    "10500101": {
        id: 10500101,
        logic: "OR",
        map: {
            DialogueHasRead: [10042205],
        },
        remark: "伊瑟尔自由邦",
    },
    "11010103": {
        id: 11010103,
        logic: "AND",
        map: {
            Quest: [11010103],
        },
        remark: "解锁EX01地图",
    },
    "11010306": {
        id: 11010306,
        logic: "AND",
        map: {
            Quest: [11010306],
        },
        remark: "EX01动力室下层完成",
    },
    "11010513": {
        id: 11010513,
        logic: "AND",
        map: {
            Quest: [11010513],
        },
        remark: "EX01炮台完成",
    },
    "11010804": {
        id: 11010804,
        logic: "AND",
        map: {
            Quest: [11010804],
        },
        remark: "EX01表白心迹",
    },
    "11010901": {
        id: 11010901,
        logic: "AND",
        map: {
            PlayerLevelMin: [33],
            QuestChain: [110109, 200227],
        },
        remark: "第二章主线解锁条件",
    },
    "11010903": {
        id: 11010903,
        logic: "AND",
        map: {
            Quest: [11010903],
        },
        remark: "EX01典狱长boss战",
    },
    "11020101": {
        id: 11020101,
        logic: "AND",
        map: {
            Quest: [11020101],
        },
        remark: "ex02_11020101",
    },
    "11020102": {
        id: 11020102,
        logic: "AND",
        map: {
            Quest: [11020102],
        },
        remark: "ex02_11020102",
    },
    "11020103": {
        id: 11020103,
        logic: "AND",
        map: {
            Quest: [11020103],
        },
        remark: "ex02_11020103",
    },
    "11020104": {
        id: 11020104,
        logic: "AND",
        map: {
            Quest: [11020104],
        },
        remark: "ex02_11020104",
    },
    "11020201": {
        id: 11020201,
        logic: "AND",
        map: {
            Quest: [11020201],
        },
        remark: "ex02_11020201",
    },
    "11020202": {
        id: 11020202,
        logic: "AND",
        map: {
            Quest: [11020202],
        },
        remark: "ex02_11020202",
    },
    "11020301": {
        id: 11020301,
        logic: "AND",
        map: {
            Quest: [11020301],
        },
        remark: "ex02_11020301",
    },
    "11020302": {
        id: 11020302,
        logic: "AND",
        map: {
            Quest: [11020302],
        },
        remark: "ex02_11020302",
    },
    "11020306": {
        id: 11020306,
        logic: "AND",
        map: {
            Quest: [11020302],
        },
        remark: "ex02_11020306",
    },
    "11022000": {
        id: 11022000,
        logic: "AND",
        map: {
            QuestChain: [110211, 110212, 110213, 110214, 110215],
        },
        remark: "ex02_完成平台期1所有支线",
    },
    "11022001": {
        id: 11022001,
        logic: "AND",
        map: {
            Quest: [11022001],
        },
        remark: "ex02_11022001",
    },
    "11022002": {
        id: 11022002,
        logic: "AND",
        map: {
            Quest: [11022002],
        },
        remark: "ex02_11022002",
    },
    "11022101": {
        id: 11022101,
        logic: "AND",
        map: {
            Quest: [11022101],
        },
        remark: "ex02_11022101",
    },
    "11023100": {
        id: 11023100,
        logic: "AND",
        map: {
            QuestChain: [110221, 110222],
        },
        remark: "ex02_完成平台期2所有支线",
    },
    "11023101": {
        id: 11023101,
        logic: "AND",
        map: {
            Quest: [11023101],
        },
        remark: "ex02_11023101",
    },
    "11023102": {
        id: 11023102,
        logic: "AND",
        map: {
            Quest: [11023102],
        },
        remark: "ex02_11023102",
    },
    "11023103": {
        id: 11023103,
        logic: "AND",
        map: {
            Quest: [11023103],
        },
        remark: "ex02_11023103",
    },
    "11023104": {
        id: 11023104,
        logic: "AND",
        map: {
            Quest: [11023104],
        },
        remark: "ex02_11023104",
    },
    "11023201": {
        id: 11023201,
        logic: "AND",
        map: {
            Quest: [11023201],
        },
        remark: "ex02_11023201",
    },
    "11023202": {
        id: 11023202,
        logic: "AND",
        map: {
            Quest: [11023202],
        },
        remark: "ex02_11023202",
    },
    "11023203": {
        id: 11023203,
        logic: "AND",
        map: {
            Quest: [11023203],
        },
        remark: "ex02_11023203",
    },
    "11023204": {
        id: 11023204,
        logic: "AND",
        map: {
            Quest: [11023204],
        },
        remark: "ex02_11023204",
    },
    "11023205": {
        id: 11023205,
        logic: "AND",
        map: {
            Quest: [11023205],
        },
        remark: "ex02_11023205",
    },
    "11023206": {
        id: 11023206,
        logic: "AND",
        map: {
            Quest: [11023206],
        },
        remark: "ex02_11023206",
    },
    "12000201": {
        id: 12000201,
        logic: "AND",
        map: {
            PlayerLevelMin: [42],
            QuestChain: [120002],
        },
        remark: "东国引入任务2完成+42级",
    },
    "12010001": {
        id: 12010001,
        logic: "AND",
        map: {
            PlayerLevelMin: [42],
            QuestChain: [120003],
        },
        remark: "东国一期的解锁条件42级",
    },
    "12010101": {
        id: 12010101,
        logic: "AND",
        map: {
            Quest: [12010101],
        },
        remark: "东国印象商店解锁条件",
    },
    "12010203": {
        id: 12010203,
        logic: "AND",
        map: {
            Quest: [12010203],
        },
        remark: "东国一期解锁锦鲤商店",
    },
    "12010301": {
        id: 12010301,
        logic: "OR",
        map: {
            Quest: [12010317],
            QuestChain: [120105],
        },
        remark: "东国一期（扶疏线）",
    },
    "12010302": {
        id: 12010302,
        logic: "OR",
        map: {
            Quest: [12010318],
            QuestChain: [120104],
        },
        remark: "东国一期（虬先生）",
    },
    "12010303": {
        id: 12010303,
        logic: "OR",
        map: {
            Quest: [12010319],
            QuestChain: [120103],
        },
        remark: "东国一期（煜明）",
    },
    "12010306": {
        id: 12010306,
        logic: "AND",
        map: {
            Quest: [12010306],
        },
        remark: "东国一期获得牵机方枢",
    },
    "12010351": {
        id: 12010351,
        logic: "AND",
        map: {
            ActivePropEffectId: [42002],
        },
        remark: "东国一期招出牵机方枢",
    },
    "12010418": {
        id: 12010418,
        logic: "AND",
        map: {
            ExploreGroup: [7060002],
        },
        remark: "东国一期-某关卡节点",
    },
    "12010601": {
        id: 12010601,
        logic: "AND",
        map: {
            QuestChain: [120104, 120105],
        },
        remark: "东国一期扶疏线、古战场线完成",
    },
    "12010602": {
        id: 12010602,
        logic: "AND",
        map: {
            PlayerLevelMin: [45],
            QuestChain: [120106],
        },
        remark: "东国二期解锁条件-45+东一",
    },
    "12011106": {
        id: 12011106,
        logic: "AND",
        map: {
            DungeonComplete: [[60001, 1, 1]],
        },
        remark: "菲娜活动副本1-1完成",
    },
    "12011204": {
        id: 12011204,
        logic: "AND",
        map: {
            DungeonComplete: [[60002, 1, 1]],
        },
        remark: "菲娜活动副本2-1完成",
    },
    "12011306": {
        id: 12011306,
        logic: "AND",
        map: {
            DungeonComplete: [[60004, 1, 1]],
        },
        remark: "菲娜活动副本3-2完成",
    },
    "12011413": {
        id: 12011413,
        logic: "AND",
        map: {
            DungeonComplete: [[60006, 1, 1]],
        },
        remark: "菲娜活动任务4-2完成",
    },
    "12020101": {
        id: 12020101,
        logic: "AND",
        map: {
            Quest: [12020101],
        },
        remark: "东国二期12020101任务完成",
    },
    "12020210": {
        id: 12020210,
        logic: "AND",
        map: {
            Quest: [12020210],
        },
        remark: "东国二期12020210任务完成",
    },
    "12020214": {
        id: 12020214,
        logic: "AND",
        map: {
            Quest: [12020214],
        },
        remark: "东国二期12020214任务完成",
    },
    "12020306": {
        id: 12020306,
        logic: "AND",
        map: {
            Quest: [12020306],
        },
        remark: "东国二期12020306任务完成",
    },
    "12020309": {
        id: 12020309,
        logic: "AND",
        map: {
            Quest: [12020309],
        },
        remark: "东国二期12020309任务完成",
    },
    "12020406": {
        id: 12020406,
        logic: "AND",
        map: {
            Quest: [12020406],
        },
        remark: "东国二期12020406任务完成-巨阙打完",
    },
    "12020407": {
        id: 12020407,
        logic: "AND",
        map: {
            Quest: [12020407],
        },
        remark: "东国二期12020407任务完成-双狴犴打完",
    },
    "12020410": {
        id: 12020410,
        logic: "AND",
        map: {
            Quest: [12020410],
        },
        remark: "东国二期12020410任务完成-煜明打完",
    },
    "12020505": {
        id: 12020505,
        logic: "AND",
        map: {
            Quest: [12020505],
        },
        remark: "东国二期12020505任务完成",
    },
    "12020512": {
        id: 12020512,
        logic: "AND",
        map: {
            Quest: [12020512],
        },
        remark: "东国二期12020512任务完成",
    },
    "12020612": {
        id: 12020612,
        logic: "AND",
        map: {
            Quest: [12020612],
        },
        remark: "东国二期12020612任务完成",
    },
    "12020619": {
        id: 12020619,
        logic: "AND",
        map: {
            Quest: [12020619],
        },
        remark: "东国二期12020619任务完成-双龙打完",
    },
    "12020628": {
        id: 12020628,
        logic: "AND",
        map: {
            Quest: [12020628],
        },
        remark: "东国二期12020628任务完成",
    },
    "12030101": {
        id: 12030101,
        logic: "AND",
        map: {
            Quest: [12030101],
        },
        remark: "奉香大典任务1-1完成",
    },
    "20010104": {
        id: 20010104,
        logic: "OR",
        map: {
            VarEqual: [
                ["ForgePenhuo", 1],
                ["ForgeDanyao", 1],
            ],
        },
        remark: "锻造一次",
    },
    "20010305": {
        id: 20010305,
        logic: "AND",
        map: {
            RegionCapturePet: [1241181],
        },
        remark: "魔灵支线1-抓捕魔灵",
    },
    "20010401": {
        id: 20010401,
        logic: "AND",
        map: {
            PlayerLevelMin: [24],
            QuestChain: [200104, 100208],
        },
        remark: "EX01主线的解锁条件",
    },
    "20010410": {
        id: 20010410,
        logic: "AND",
        map: {
            RegionCapturePet: [1730280],
        },
        remark: "魔灵支线2-抓捕魔灵",
    },
    "20020801": {
        id: 20020801,
        logic: "AND",
        map: {
            Quest: [20021301],
            QuestChain: [100208],
        },
        remark: "莱娜支线解锁条件",
    },
    "20021007": {
        id: 20021007,
        logic: "AND",
        map: {
            Quest: [20021007],
        },
        remark: "支线任务完成【敲门】",
    },
    "20021200": {
        id: 20021200,
        logic: "AND",
        map: {
            Quest: [20021200],
        },
        remark: "拉里支线任务接取",
    },
    "20021301": {
        id: 20021301,
        logic: "AND",
        map: {
            TrueQuest: [20021301],
        },
        remark: "玛尔洁支线任务一阶段完成",
    },
    "20021501": {
        id: 20021501,
        logic: "AND",
        map: {
            Quest: [20021501],
        },
        remark: "马库斯第一环任务完成",
    },
    "20021502": {
        id: 20021502,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1001],
        },
        remark: "马库斯第一环任务完成且村庄传送点解锁",
    },
    "20021503": {
        id: 20021503,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1017],
        },
        remark: "马库斯第一环任务完成且冰湖传送点解锁",
    },
    "20021504": {
        id: 20021504,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1032],
        },
        remark: "马库斯第一环任务完成且下水道传送点解锁",
    },
    "20021505": {
        id: 20021505,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1100],
        },
        remark: "马库斯第一环任务完成且浮星埠传送点解锁",
    },
    "20021506": {
        id: 20021506,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1102],
        },
        remark: "马库斯第一环任务完成且百年春传送点解锁",
    },
    "20021507": {
        id: 20021507,
        logic: "AND",
        map: {
            Quest: [20021501],
            QuestChain: [120102],
            TeleportIsUnlock: [1104],
        },
        remark: "马库斯第一环任务完成且潮声岩穴传送点解锁，且完成主线120102（进钓鱼区域的机关门在主线里打开，防止没完成主线就传进去）",
    },
    "20021508": {
        id: 20021508,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1110],
        },
        remark: "马库斯第一环任务完成且枯荣阁传送点解锁",
    },
    "20021509": {
        id: 20021509,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1105],
        },
        remark: "马库斯第一环任务完成且微茫市传送点解锁",
    },
    "20021510": {
        id: 20021510,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1212],
        },
        remark: "马库斯第一环任务完成且东郊野外传送点解锁",
    },
    "20021511": {
        id: 20021511,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1205],
        },
        remark: "马库斯第一环任务完成且城西区传送点解锁",
    },
    "20021512": {
        id: 20021512,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1500],
        },
        remark: "马库斯第一环任务完成且由来巷传送点解锁",
    },
    "20021513": {
        id: 20021513,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1600],
        },
        remark: "马库斯第一环任务完成且车站传送点解锁",
    },
    "20021514": {
        id: 20021514,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1700],
        },
        remark: "马库斯第一环任务完成且乐园镇解锁",
    },
    "20021515": {
        id: 20021515,
        logic: "AND",
        map: {
            Quest: [20021501],
            TeleportIsUnlock: [1702],
        },
        remark: "马库斯第一环任务完成且阿尔卡诺山裂隙传送点解锁",
    },
    "20021602": {
        id: 20021602,
        logic: "AND",
        map: {
            TrueQuestChain: [100203],
        },
        remark: "帝国三兄弟任务显示条件",
    },
    "20022200": {
        id: 20022200,
        logic: "AND",
        map: {
            Quest: [20022200],
        },
        remark: "达顿支线任务接取",
    },
    "20022301": {
        id: 20022301,
        logic: "AND",
        map: {
            TrueQuestChain: [200223, 100203],
        },
        remark: "小小研究者二阶段解锁",
    },
    "20022401": {
        id: 20022401,
        logic: "AND",
        map: {
            TrueQuestChain: [200224, 100208],
        },
        remark: "小小研究者三阶段解锁",
    },
    "20023001": {
        id: 20023001,
        logic: "AND",
        map: {
            MechanismState: [[1191512, 0, 602]],
        },
        remark: "火灾案支线1-调频机关",
    },
    "20023300": {
        id: 20023300,
        logic: "AND",
        map: {
            QuestChain: [200230, 200231, 200232],
        },
        remark: "于无眠之夜远航任务接取",
    },
    "20023600": {
        id: 20023600,
        logic: "AND",
        map: {
            OwnCharIdAndLevel: [[5101, 1]],
        },
        remark: "委托密函任务-获得松露",
    },
    "20023701": {
        id: 20023701,
        logic: "AND",
        map: {
            PlayerLevelMin: [60],
        },
        remark: "【灵化武器】任务一解锁条件",
    },
    "20023702": {
        id: 20023702,
        logic: "AND",
        map: {
            FinishAbyss: [[3, 12]],
            PlayerLevelMin: [60],
        },
        remark: "【灵化武器】任务一目标一",
    },
    "20023703": {
        id: 20023703,
        logic: "AND",
        map: {
            HasModLevel: [[-1, 10, 1]],
            PlayerLevelMin: [60],
        },
        remark: "【灵化武器】任务一目标二",
    },
    "20023801": {
        id: 20023801,
        logic: "AND",
        map: {
            HyperCardLevel: [[-1, 0]],
            PlayerLevelMin: [60],
        },
        remark: "【灵化武器】任务二解锁条件",
    },
    "20023901": {
        id: 20023901,
        logic: "AND",
        map: {
            HyperCardLevel: [[-1, 2]],
            PlayerLevelMin: [60],
        },
        remark: "【灵化武器】任务三解锁条件",
    },
    "20024001": {
        id: 20024001,
        logic: "AND",
        map: {
            HyperCardLevel: [[-1, 4]],
            PlayerLevelMin: [60],
        },
        remark: "【灵化武器】任务四解锁条件",
    },
    "20030401": {
        id: 20030401,
        logic: "AND",
        map: {
            QuestChain: [120105],
        },
        remark: "煜明支线任务接取",
    },
    "20030803": {
        id: 20030803,
        logic: "AND",
        map: {
            RegionCapturePet: [2110350],
        },
        remark: "闹鬼妙妙香-抓捕魔灵",
    },
    "20031702": {
        id: 20031702,
        logic: "AND",
        map: {
            VarEqual: [["Fish200317", 1]],
        },
        remark: "琴声支线钓鱼任务开始",
    },
    "20100101": {
        id: 20100101,
        logic: "OR",
        map: {
            DialogueHasRead: [10010101],
        },
        remark: "贝蕾妮卡",
    },
    "20100102": {
        id: 20100102,
        logic: "OR",
        map: {
            DialogueHasRead: [10100201],
        },
        remark: "贝蕾妮卡（追加1）",
    },
    "20100201": {
        id: 20100201,
        logic: "OR",
        map: {
            DialogueHasRead: [10010204],
            Quest: [10010306],
        },
        remark: "西比尔",
    },
    "20100301": {
        id: 20100301,
        logic: "OR",
        map: {
            DialogueHasRead: [10011701],
        },
        remark: "兰迪",
    },
    "20100401": {
        id: 20100401,
        logic: "OR",
        map: {
            DialogueHasRead: [10100201],
        },
        remark: "卡米拉",
    },
    "20100501": {
        id: 20100501,
        logic: "OR",
        map: {
            DialogueHasRead: [10100201],
        },
        remark: "白",
    },
    "20100502": {
        id: 20100502,
        logic: "OR",
        map: {
            DialogueHasRead: [20000601],
        },
        remark: "白（追加1）",
    },
    "20100601": {
        id: 20100601,
        logic: "OR",
        map: {
            DialogueHasRead: [10101301],
        },
        remark: "恩里克",
    },
    "20100602": {
        id: 20100602,
        logic: "OR",
        map: {
            DialogueHasRead: [10110201],
        },
        remark: "恩里克（追加1）",
    },
    "20100603": {
        id: 20100603,
        logic: "OR",
        map: {
            DialogueHasRead: [10110801],
        },
        remark: "恩里克（追加2）",
    },
    "20100701": {
        id: 20100701,
        logic: "OR",
        map: {
            DialogueHasRead: [10101601],
        },
        remark: "赛琪",
    },
    "20100702": {
        id: 20100702,
        logic: "OR",
        map: {
            DialogueHasRead: [10109401],
        },
        remark: "赛琪（追加1）",
    },
    "20100703": {
        id: 20100703,
        logic: "OR",
        map: {
            DialogueHasRead: [10112901],
        },
        remark: "赛琪（追加2）",
    },
    "20100801": {
        id: 20100801,
        logic: "OR",
        map: {
            DialogueHasRead: [10102601],
        },
        remark: "玛尔洁",
    },
    "20100901": {
        id: 20100901,
        logic: "OR",
        map: {
            DialogueHasRead: [10105401],
        },
        remark: "奥特赛德",
    },
    "20101001": {
        id: 20101001,
        logic: "OR",
        map: {
            DialogueHasRead: [10106101],
        },
        remark: "菲娜",
    },
    "20101002": {
        id: 20101002,
        logic: "OR",
        map: {
            Quest: [12011414],
        },
        remark: "菲娜（追加1）",
    },
    "20101101": {
        id: 20101101,
        logic: "OR",
        map: {
            DialogueHasRead: [10130601],
            Quest: [10020806],
        },
        remark: "黎瑟",
    },
    "20101102": {
        id: 20101102,
        logic: "OR",
        map: {
            Quest: [10030107],
        },
        remark: "黎瑟（追加1）",
    },
    "20101103": {
        id: 20101103,
        logic: "OR",
        map: {
            DialogueHasRead: [10033953],
        },
        remark: "黎瑟（追加2）",
    },
    "20101104": {
        id: 20101104,
        logic: "OR",
        map: {
            Quest: [10030395],
        },
        remark: "黎瑟（追加3）",
    },
    "20101105": {
        id: 20101105,
        logic: "OR",
        map: {
            DialogueHasRead: [10035231],
            Quest: [10030401],
        },
        remark: "黎瑟（追加4）",
    },
    "20101106": {
        id: 20101106,
        logic: "OR",
        map: {
            Quest: [10030701],
        },
        remark: "黎瑟（追加5）",
    },
    "20101201": {
        id: 20101201,
        logic: "OR",
        map: {
            DialogueHasRead: [11010301],
        },
        remark: "达芙涅",
    },
    "20101202": {
        id: 20101202,
        logic: "OR",
        map: {
            DialogueHasRead: [11015133],
            Quest: [11010804],
        },
        remark: "达芙涅（追加1）",
    },
    "20101301": {
        id: 20101301,
        logic: "OR",
        map: {
            Quest: [11010108],
        },
        remark: "阿瓦尔",
    },
    "20101302": {
        id: 20101302,
        logic: "OR",
        map: {
            DialogueHasRead: [11012811],
        },
        remark: "阿瓦尔（追加1）",
    },
    "20101303": {
        id: 20101303,
        logic: "OR",
        map: {
            DialogueHasRead: [11013701],
        },
        remark: "阿瓦尔（追加2）",
    },
    "20101304": {
        id: 20101304,
        logic: "OR",
        map: {
            Quest: [11010904],
        },
        remark: "阿瓦尔（追加3）",
    },
    "20101305": {
        id: 20101305,
        logic: "OR",
        map: {
            DialogueHasRead: [11117911],
        },
        remark: "阿瓦尔（追加4）",
    },
    "20101401": {
        id: 20101401,
        logic: "OR",
        map: {
            Quest: [11010303],
        },
        remark: "富尔维斯",
    },
    "20101402": {
        id: 20101402,
        logic: "OR",
        map: {
            DialogueHasRead: [11013614],
            Quest: [11010704],
        },
        remark: "富尔维斯（追加1）",
    },
    "20101403": {
        id: 20101403,
        logic: "OR",
        map: {
            DialogueHasRead: [11111019],
        },
        remark: "富尔维斯（追加2）",
    },
    "20101404": {
        id: 20101404,
        logic: "OR",
        map: {
            DialogueHasRead: [11117502],
        },
        remark: "富尔维斯（追加3）",
    },
    "20101405": {
        id: 20101405,
        logic: "OR",
        map: {
            DialogueHasRead: [11120338],
        },
        remark: "富尔维斯（追加4）",
    },
    "20101406": {
        id: 20101406,
        logic: "OR",
        map: {
            DialogueHasRead: [11120819],
        },
        remark: "富尔维斯（追加5）",
    },
    "20101501": {
        id: 20101501,
        logic: "OR",
        map: {
            DialogueHasRead: [11011802],
            Quest: [11010509],
        },
        remark: "卡嘉",
    },
    "20101502": {
        id: 20101502,
        logic: "OR",
        map: {
            DialogueHasRead: [11012427],
            Quest: [11010516],
        },
        remark: "卡嘉（追加1）",
    },
    "20101503": {
        id: 20101503,
        logic: "OR",
        map: {
            DialogueHasRead: [10047901],
        },
        remark: "卡嘉（追加2）",
    },
    "20101504": {
        id: 20101504,
        logic: "OR",
        map: {
            DialogueHasRead: [10049302],
        },
        remark: "卡嘉（追加3）",
    },
    "20101601": {
        id: 20101601,
        logic: "OR",
        map: {
            DialogueHasRead: [11018819],
            Quest: [11010704],
        },
        remark: "法露茜",
    },
    "20101602": {
        id: 20101602,
        logic: "OR",
        map: {
            DialogueHasRead: [11017001],
            Quest: [11010906],
        },
        remark: "法露茜（追加1）",
    },
    "20101603": {
        id: 20101603,
        logic: "OR",
        map: {
            DialogueHasRead: [11102821],
        },
        remark: "法露茜（追加2）",
    },
    "20101604": {
        id: 20101604,
        logic: "OR",
        map: {
            DialogueHasRead: [11111043],
        },
        remark: "法露茜（追加3）",
    },
    "20101605": {
        id: 20101605,
        logic: "OR",
        map: {
            DialogueHasRead: [11121011],
        },
        remark: "法露茜（追加4）",
    },
    "20101701": {
        id: 20101701,
        logic: "OR",
        map: {
            DialogueHasRead: [11018819],
            Quest: [11010704],
        },
        remark: "塞维乌斯公爵",
    },
    "20101801": {
        id: 20101801,
        logic: "OR",
        map: {
            DialogueHasRead: [11015131],
        },
        remark: "尤里乌斯一世",
    },
    "20101901": {
        id: 20101901,
        logic: "OR",
        map: {
            DialogueHasRead: [11015301],
        },
        remark: "海尔法",
    },
    "20101902": {
        id: 20101902,
        logic: "OR",
        map: {
            Quest: [11010902],
        },
        remark: "海尔法（追加1）",
    },
    "20101903": {
        id: 20101903,
        logic: "OR",
        map: {
            DialogueHasRead: [11016701],
            Quest: [11010904],
        },
        remark: "海尔法（追加2）",
    },
    "20102001": {
        id: 20102001,
        logic: "OR",
        map: {
            DialogueHasRead: [11017001],
            Quest: [11010906],
        },
        remark: "维吉尔",
    },
    "20102002": {
        id: 20102002,
        logic: "OR",
        map: {
            DialogueHasRead: [11019107],
        },
        remark: "维吉尔（追加1）",
    },
    "20102101": {
        id: 20102101,
        logic: "OR",
        map: {
            DialogueHasRead: [11011501],
        },
        remark: "迪斯一世",
    },
    "20102102": {
        id: 20102102,
        logic: "OR",
        map: {
            DialogueHasRead: [10033914],
        },
        remark: "迪斯一世（追加1）",
    },
    "20102201": {
        id: 20102201,
        logic: "OR",
        map: {
            DialogueHasRead: [10032101],
        },
        remark: "普奇",
    },
    "20102301": {
        id: 20102301,
        logic: "OR",
        map: {
            DialogueHasRead: [10032301],
        },
        remark: "薇奥莱塔",
    },
    "20102302": {
        id: 20102302,
        logic: "OR",
        map: {
            QuestChain: [200233],
        },
        remark: "薇奥莱塔（追加1）",
    },
    "20102401": {
        id: 20102401,
        logic: "OR",
        map: {
            DialogueHasRead: [10033953],
        },
        remark: "布鲁斯",
    },
    "20102402": {
        id: 20102402,
        logic: "OR",
        map: {
            DialogueHasRead: [10036801],
        },
        remark: "布鲁斯（追加1）",
    },
    "20102501": {
        id: 20102501,
        logic: "OR",
        map: {
            DialogueHasRead: [10034301],
        },
        remark: "琳恩",
    },
    "20102601": {
        id: 20102601,
        logic: "OR",
        map: {
            DialogueHasRead: [10036801],
        },
        remark: "幻景",
    },
    "20102602": {
        id: 20102602,
        logic: "OR",
        map: {
            Quest: [10030512],
        },
        remark: "幻景（追加1）",
    },
    "20102701": {
        id: 20102701,
        logic: "OR",
        map: {
            Quest: [12011414],
        },
        remark: "卡珊德拉",
    },
    "20102801": {
        id: 20102801,
        logic: "OR",
        map: {
            Quest: [12011414],
        },
        remark: "塞维欧",
    },
    "20102901": {
        id: 20102901,
        logic: "OR",
        map: {
            DialogueHasRead: [12060502],
        },
        remark: "塔比瑟",
    },
    "20103001": {
        id: 20103001,
        logic: "OR",
        map: {
            DialogueHasRead: [10040145],
        },
        remark: "艾森巴恩",
    },
    "20103002": {
        id: 20103002,
        logic: "OR",
        map: {
            DialogueHasRead: [10042632],
        },
        remark: "艾森巴恩（追加1）",
    },
    "20103101": {
        id: 20103101,
        logic: "OR",
        map: {
            DialogueHasRead: [10042007],
        },
        remark: "希尔妲",
    },
    "20103102": {
        id: 20103102,
        logic: "OR",
        map: {
            DialogueHasRead: [10045137],
        },
        remark: "希尔妲（追加1）",
    },
    "20103201": {
        id: 20103201,
        logic: "OR",
        map: {
            DialogueHasRead: [10044702],
        },
        remark: "哈洛吉",
    },
    "20103301": {
        id: 20103301,
        logic: "OR",
        map: {
            DialogueHasRead: [10045117],
        },
        remark: "芙罗拉",
    },
    "20103401": {
        id: 20103401,
        logic: "OR",
        map: {
            DialogueHasRead: [11100221],
        },
        remark: "「战车」维克托",
    },
    "20103402": {
        id: 20103402,
        logic: "OR",
        map: {
            DialogueHasRead: [11117212],
        },
        remark: "「战车」维克托（追加1）",
    },
    "20103501": {
        id: 20103501,
        logic: "OR",
        map: {
            DialogueHasRead: [11100406],
        },
        remark: "「女祭司」艾达",
    },
    "20103502": {
        id: 20103502,
        logic: "OR",
        map: {
            DialogueHasRead: [11105834],
        },
        remark: "「女祭司」艾达（追加1）",
    },
    "20103503": {
        id: 20103503,
        logic: "OR",
        map: {
            DialogueHasRead: [11118623],
        },
        remark: "「女祭司」艾达（追加2）",
    },
    "20103504": {
        id: 20103504,
        logic: "OR",
        map: {
            QuestChain: [110232],
        },
        remark: "「女祭司」艾达（追加3）",
    },
    "20103601": {
        id: 20103601,
        logic: "OR",
        map: {
            DialogueHasRead: [11101101],
        },
        remark: "“兔妈妈”",
    },
    "20103602": {
        id: 20103602,
        logic: "OR",
        map: {
            DialogueHasRead: [11111034],
        },
        remark: "“兔妈妈”（追加1）",
    },
    "20103603": {
        id: 20103603,
        logic: "OR",
        map: {
            DialogueHasRead: [11120305],
        },
        remark: "“兔妈妈”（追加2）",
    },
    "20103604": {
        id: 20103604,
        logic: "OR",
        map: {
            DialogueHasRead: [11120815],
        },
        remark: "“兔妈妈”（追加3）",
    },
    "20300101": {
        id: 20300101,
        logic: "OR",
        map: {
            DialogueHasRead: [12001123],
            Quest: [12000308],
        },
        remark: "止流",
    },
    "20300102": {
        id: 20300102,
        logic: "OR",
        map: {
            Quest: [12000308],
        },
        remark: "止流（追加1）",
    },
    "20300103": {
        id: 20300103,
        logic: "OR",
        map: {
            DialogueHasRead: [12010124],
            Quest: [12010104],
        },
        remark: "止流（追加2）",
    },
    "20300104": {
        id: 20300104,
        logic: "OR",
        map: {
            DialogueHasRead: [12010801],
        },
        remark: "止流（追加3）",
    },
    "20300105": {
        id: 20300105,
        logic: "OR",
        map: {
            DialogueHasRead: [12022209],
        },
        remark: "止流（追加4）",
    },
    "20300106": {
        id: 20300106,
        logic: "OR",
        map: {
            DialogueHasRead: [12045110],
        },
        remark: "止流（追加5）",
    },
    "20300107": {
        id: 20300107,
        logic: "OR",
        map: {
            DialogueHasRead: [12046301],
        },
        remark: "止流（追加6）",
    },
    "20300108": {
        id: 20300108,
        logic: "OR",
        map: {
            DialogueHasRead: [12046813],
        },
        remark: "止流（追加7）",
    },
    "20300201": {
        id: 20300201,
        logic: "OR",
        map: {
            DialogueHasRead: [12010201],
        },
        remark: "锦鲤皎皎",
    },
    "20300301": {
        id: 20300301,
        logic: "OR",
        map: {
            DialogueHasRead: [12010429],
        },
        remark: "飏",
    },
    "20300302": {
        id: 20300302,
        logic: "OR",
        map: {
            DialogueHasRead: [12045618],
        },
        remark: "飏（追加1）",
    },
    "20300401": {
        id: 20300401,
        logic: "OR",
        map: {
            DialogueHasRead: [12012001],
        },
        remark: "煜明",
    },
    "20300402": {
        id: 20300402,
        logic: "OR",
        map: {
            DialogueHasRead: [12020501],
        },
        remark: "煜明（追加1）",
    },
    "20300403": {
        id: 20300403,
        logic: "OR",
        map: {
            DialogueHasRead: [12045728],
        },
        remark: "煜明（追加2）",
    },
    "20300501": {
        id: 20300501,
        logic: "OR",
        map: {
            DialogueHasRead: [12012609],
        },
        remark: "虬先生",
    },
    "20300502": {
        id: 20300502,
        logic: "OR",
        map: {
            DialogueHasRead: [12013501],
        },
        remark: "虬先生（追加1）",
    },
    "20300601": {
        id: 20300601,
        logic: "OR",
        map: {
            DialogueHasRead: [12013101],
        },
        remark: "扶疏",
    },
    "20300602": {
        id: 20300602,
        logic: "OR",
        map: {
            DialogueHasRead: [12015513],
            Quest: [12010412],
        },
        remark: "扶疏（追加1）",
    },
    "20300701": {
        id: 20300701,
        logic: "OR",
        map: {
            DialogueHasRead: [12019301],
        },
        remark: "刻舟",
    },
    "20300702": {
        id: 20300702,
        logic: "OR",
        map: {
            DialogueHasRead: [12042802],
        },
        remark: "刻舟（追加1）",
    },
    "20300703": {
        id: 20300703,
        logic: "OR",
        map: {
            DialogueHasRead: [12046303],
        },
        remark: "刻舟（追加2）",
    },
    "20300801": {
        id: 20300801,
        logic: "OR",
        map: {
            DialogueHasRead: [12040903],
        },
        remark: "逍遥生",
    },
    "20300901": {
        id: 20300901,
        logic: "OR",
        map: {
            DialogueHasRead: [12043323],
        },
        remark: "苏乙",
    },
    "20300902": {
        id: 20300902,
        logic: "OR",
        map: {
            DialogueHasRead: [12043505],
        },
        remark: "苏乙（追加1）",
    },
    "20300903": {
        id: 20300903,
        logic: "OR",
        map: {
            DialogueHasRead: [12061444],
        },
        remark: "苏乙（追加2）",
    },
    "20301001": {
        id: 20301001,
        logic: "OR",
        map: {
            DialogueHasRead: [12045617],
        },
        remark: "矩",
    },
    "20301101": {
        id: 20301101,
        logic: "OR",
        map: {
            DialogueHasRead: [12045727],
        },
        remark: "不夏",
    },
    "20301201": {
        id: 20301201,
        logic: "OR",
        map: {
            DialogueHasRead: [12046205],
        },
        remark: "静渊",
    },
    "20301301": {
        id: 20301301,
        logic: "OR",
        map: {
            DialogueHasRead: [12061009],
        },
        remark: "飘零四杰",
    },
    "20301401": {
        id: 20301401,
        logic: "OR",
        map: {
            DialogueHasRead: [12061105],
        },
        remark: "苏幕鹧",
    },
    "20301402": {
        id: 20301402,
        logic: "OR",
        map: {
            DialogueHasRead: [12062620],
        },
        remark: "苏幕鹧（追加1）",
    },
    "20400101": {
        id: 20400101,
        logic: "OR",
        map: {
            Quest: [10010102],
        },
        remark: "梦中的{性别2：少年|少女}",
    },
    "20400102": {
        id: 20400102,
        logic: "OR",
        map: {
            Quest: [10010306],
        },
        remark: "梦中的{性别2：少年|少女}（追加1）",
    },
    "20400103": {
        id: 20400103,
        logic: "OR",
        map: {
            DialogueHasRead: [11010101],
        },
        remark: "梦中的{性别2：少年|少女}（追加2）",
    },
    "20400104": {
        id: 20400104,
        logic: "OR",
        map: {
            DialogueHasRead: [11011501],
        },
        remark: "梦中的{性别2：少年|少女}（追加3）",
    },
    "20400105": {
        id: 20400105,
        logic: "OR",
        map: {
            DialogueHasRead: [11012430],
            Quest: [11010516],
        },
        remark: "梦中的{性别2：少年|少女}（追加4）",
    },
    "20400106": {
        id: 20400106,
        logic: "OR",
        map: {
            DialogueHasRead: [11121116],
        },
        remark: "梦中的{性别2：少年|少女}（追加5）",
    },
    "20400107": {
        id: 20400107,
        logic: "OR",
        map: {
            DialogueHasRead: [11121403],
        },
        remark: "梦中的{性别2：少年|少女}（追加6）",
    },
    "20400201": {
        id: 20400201,
        logic: "OR",
        map: {
            DialogueHasRead: [10100801],
        },
        remark: "白衣神秘人",
    },
    "20400301": {
        id: 20400301,
        logic: "OR",
        map: {
            DialogueHasRead: [20000501],
        },
        remark: "铁匠皎皎",
    },
    "20400401": {
        id: 20400401,
        logic: "OR",
        map: {
            Quest: [10020808],
        },
        remark: "妮弗尔夫人",
    },
    "30100101": {
        id: 30100101,
        logic: "AND",
        map: {
            PlayerLevelMin: [1],
            Quest: [10010210],
        },
        remark: "阿特拉西亚 默认解锁",
    },
    "30100201": {
        id: 30100201,
        logic: "OR",
        map: {
            DialogueHasRead: [10104303],
            Quest: [10020305],
        },
        remark: "维德弗尼尔山脉",
    },
    "30100301": {
        id: 30100301,
        logic: "OR",
        map: {
            DialogueHasRead: [10100401],
        },
        remark: "天之树",
    },
    "30100401": {
        id: 30100401,
        logic: "OR",
        map: {
            DialogueHasRead: [10104001],
        },
        remark: "群星绮晶",
    },
    "30100402": {
        id: 30100402,
        logic: "OR",
        map: {
            DialogueHasRead: [10106310],
            Quest: [10020403],
        },
        remark: "群星绮晶（追加1）",
    },
    "30100403": {
        id: 30100403,
        logic: "OR",
        map: {
            DialogueHasRead: [80080301],
        },
        remark: "群星绮晶（追加2）",
    },
    "30100501": {
        id: 30100501,
        logic: "OR",
        map: {
            DialogueHasRead: [10101601],
        },
        remark: "泪湖",
    },
    "30100601": {
        id: 30100601,
        logic: "OR",
        map: {
            DialogueHasRead: [10100401],
        },
        remark: "月石",
    },
    "30100701": {
        id: 30100701,
        logic: "OR",
        map: {
            DialogueHasRead: [12010801],
        },
        remark: "尘漠石海",
    },
    "30100801": {
        id: 30100801,
        logic: "OR",
        map: {
            DialogueHasRead: [12013420],
            Quest: [12010310],
        },
        remark: "尘漠",
    },
    "30100901": {
        id: 30100901,
        logic: "OR",
        map: {
            DialogueHasRead: [12014001],
        },
        remark: "忘忧草",
    },
    "30300101": {
        id: 30300101,
        logic: "OR",
        map: {
            Quest: [10010107],
        },
        remark: "秽兽",
    },
    "30300201": {
        id: 30300201,
        logic: "OR",
        map: {
            DialogueHasRead: [10100601],
        },
        remark: "皎皎之民",
    },
    "30300202": {
        id: 30300202,
        logic: "OR",
        map: {
            DialogueHasRead: [20000601],
        },
        remark: "皎皎之民（追加1）",
    },
    "30300301": {
        id: 30300301,
        logic: "OR",
        map: {
            DialogueHasRead: [10100201],
        },
        remark: "卡戎之民",
    },
    "30300302": {
        id: 30300302,
        logic: "OR",
        map: {
            DialogueHasRead: [10102401],
        },
        remark: "卡戎之民（追加1）",
    },
    "30300303": {
        id: 30300303,
        logic: "OR",
        map: {
            DialogueHasRead: [10105401],
        },
        remark: "卡戎之民（追加2）",
    },
    "30300304": {
        id: 30300304,
        logic: "OR",
        map: {
            DialogueHasRead: [10110201],
        },
        remark: "卡戎之民（追加3）",
    },
    "30300305": {
        id: 30300305,
        logic: "OR",
        map: {
            DialogueHasRead: [10033914],
        },
        remark: "卡戎之民（追加4）",
    },
    "30300401": {
        id: 30300401,
        logic: "OR",
        map: {
            Quest: [10020313],
        },
        remark: "嗜晶者",
    },
    "30300402": {
        id: 30300402,
        logic: "OR",
        map: {
            HaveResource: [[2000019, 1]],
        },
        remark: "嗜晶者（追加1）",
    },
    "30300501": {
        id: 30300501,
        logic: "OR",
        map: {
            DialogueHasRead: [10105401],
        },
        remark: "骸",
    },
    "30300601": {
        id: 30300601,
        logic: "OR",
        map: {
            DialogueHasRead: [10110201],
        },
        remark: "秽蚀",
    },
    "30300701": {
        id: 30300701,
        logic: "OR",
        map: {
            DialogueHasRead: [10102401],
        },
        remark: "索拉之民",
    },
    "30300801": {
        id: 30300801,
        logic: "OR",
        map: {
            DialogueHasRead: [12010201],
        },
        remark: "太皓",
    },
    "30300901": {
        id: 30300901,
        logic: "OR",
        map: {
            DialogueHasRead: [12010227],
        },
        remark: "狴犴",
    },
    "30300902": {
        id: 30300902,
        logic: "OR",
        map: {
            DialogueHasRead: [12010401],
        },
        remark: "狴犴（追加1）",
    },
    "30301001": {
        id: 30301001,
        logic: "OR",
        map: {
            DialogueHasRead: [12010508],
        },
        remark: "玄色狴犴",
    },
    "30301101": {
        id: 30301101,
        logic: "OR",
        map: {
            DialogueHasRead: [12010801],
        },
        remark: "烛阴",
    },
    "30301102": {
        id: 30301102,
        logic: "OR",
        map: {
            DialogueHasRead: [12022001],
        },
        remark: "烛阴（追加2）",
    },
    "30301103": {
        id: 30301103,
        logic: "OR",
        map: {
            DialogueHasRead: [12022008],
            Quest: [12010605],
        },
        remark: "烛阴（追加3）",
    },
    "30301201": {
        id: 30301201,
        logic: "OR",
        map: {
            DialogueHasRead: [12014001],
        },
        remark: "无由生",
    },
    "30301202": {
        id: 30301202,
        logic: "OR",
        map: {
            DialogueHasRead: [12014401],
        },
        remark: "无由生（追加1）",
    },
    "30400101": {
        id: 30400101,
        logic: "OR",
        map: {
            Quest: [10010102],
        },
        remark: "沙海之梦",
    },
    "30400201": {
        id: 30400201,
        logic: "OR",
        map: {
            Quest: [10010306],
        },
        remark: "和鸣之力",
    },
    "30400202": {
        id: 30400202,
        logic: "OR",
        map: {
            DialogueHasRead: [10108001],
        },
        remark: "和鸣之力（追加1）",
    },
    "30400203": {
        id: 30400203,
        logic: "OR",
        map: {
            DialogueHasRead: [10113101],
        },
        remark: "和鸣之力（追加2）",
    },
    "30400204": {
        id: 30400204,
        logic: "OR",
        map: {
            DialogueHasRead: [12045117],
        },
        remark: "和鸣之力（追加3）",
    },
    "30400301": {
        id: 30400301,
        logic: "OR",
        map: {
            DialogueHasRead: [12010227],
        },
        remark: "大风九章",
    },
    "30400302": {
        id: 30400302,
        logic: "OR",
        map: {
            DialogueHasRead: [12010429],
        },
        remark: "大风九章（追加1）",
    },
    "30400303": {
        id: 30400303,
        logic: "OR",
        map: {
            DialogueHasRead: [12012315],
            Quest: [12010303],
        },
        remark: "大风九章（追加2）",
    },
    "30400304": {
        id: 30400304,
        logic: "OR",
        map: {
            DialogueHasRead: [12045622],
        },
        remark: "大风九章（追加3）",
    },
    "30400305": {
        id: 30400305,
        logic: "OR",
        map: {
            DialogueHasRead: [12046923],
        },
        remark: "大风九章（追加4）",
    },
    "30400306": {
        id: 30400306,
        logic: "OR",
        map: {
            DialogueHasRead: [12048005],
        },
        remark: "大风九章（追加5）",
    },
    "30400401": {
        id: 30400401,
        logic: "OR",
        map: {
            DialogueHasRead: [12010301],
        },
        remark: "烛阴之灾",
    },
    "30400501": {
        id: 30400501,
        logic: "OR",
        map: {
            DialogueHasRead: [12013101],
        },
        remark: "枯荣之法",
    },
    "30400502": {
        id: 30400502,
        logic: "OR",
        map: {
            DialogueHasRead: [12013201],
        },
        remark: "枯荣之法（追加1）",
    },
    "30400601": {
        id: 30400601,
        logic: "OR",
        map: {
            DialogueHasRead: [12013418],
            Quest: [12010310],
        },
        remark: "太虚",
    },
    "30400701": {
        id: 30400701,
        logic: "OR",
        map: {
            DialogueHasRead: [12013419],
            Quest: [12010310],
        },
        remark: "太虚符文",
    },
    "30400801": {
        id: 30400801,
        logic: "OR",
        map: {
            DialogueHasRead: [12015901],
        },
        remark: "往隙",
    },
    "30400901": {
        id: 30400901,
        logic: "OR",
        map: {
            DialogueHasRead: [12045209],
        },
        remark: "魂契",
    },
    "40012101": {
        id: 40012101,
        logic: "AND",
        map: {
            QuestChain: [400128],
        },
        remark: "1.3-拍照活动支线-Day1接取",
    },
    "40012201": {
        id: 40012201,
        logic: "AND",
        map: {
            QuestChain: [400128, 100208],
        },
        remark: "1.3-拍照活动支线-Day2接取",
    },
    "40012301": {
        id: 40012301,
        logic: "AND",
        map: {
            QuestChain: [400128, 100208],
        },
        remark: "1.3-拍照活动支线-Day3接取",
    },
    "40012401": {
        id: 40012401,
        logic: "AND",
        map: {
            QuestChain: [400128, 100307],
        },
        remark: "1.3-拍照活动支线-Day4接取",
    },
    "40012501": {
        id: 40012501,
        logic: "AND",
        map: {
            QuestChain: [400128, 100307],
        },
        remark: "1.3-拍照活动支线-Day5接取",
    },
    "40012601": {
        id: 40012601,
        logic: "AND",
        map: {
            QuestChain: [400128, 120106],
        },
        remark: "1.3-拍照活动支线-Day6接取",
    },
    "40012701": {
        id: 40012701,
        logic: "AND",
        map: {
            QuestChain: [400128, 120206],
        },
        remark: "1.3-拍照活动支线-Day7接取",
    },
    "40012801": {
        id: 40012801,
        logic: "AND",
        map: {
            QuestChain: [100307, 200101],
        },
        remark: "1.3-拍照活动支线-引入接取",
    },
    "40012901": {
        id: 40012901,
        logic: "AND",
        map: {
            QuestChain: [400121, 400122, 400123, 400124, 400125, 400126, 400127],
        },
        remark: "1.3-拍照活动支线-尾声接取",
    },
    "40013001": {
        id: 40013001,
        logic: "AND",
        map: {
            QuestChain: [100401],
        },
        remark: "1.6-拍照活动支线-Day1接取",
    },
    "40013101": {
        id: 40013101,
        logic: "AND",
        map: {
            QuestChain: [100401],
        },
        remark: "1.6-拍照活动支线-Day2接取",
    },
    "40013201": {
        id: 40013201,
        logic: "AND",
        map: {
            QuestChain: [100401],
        },
        remark: "1.6-拍照活动支线-Day3接取",
    },
    "40013301": {
        id: 40013301,
        logic: "AND",
        map: {
            QuestChain: [110201],
        },
        remark: "1.6-拍照活动支线-Day4接取",
    },
    "40013401": {
        id: 40013401,
        logic: "AND",
        map: {
            QuestChain: [110203],
        },
        remark: "1.6-拍照活动支线-Day5接取",
    },
    "40013501": {
        id: 40013501,
        logic: "AND",
        map: {
            QuestChain: [110203],
        },
        remark: "1.6-拍照活动支线-Day6接取",
    },
    "40013601": {
        id: 40013601,
        logic: "AND",
        map: {
            QuestChain: [110203],
        },
        remark: "1.6-拍照活动支线-Day7接取",
    },
    "40100101": {
        id: 40100101,
        logic: "OR",
        map: {
            DialogueHasRead: [10011101],
        },
        remark: "命运女神神庙",
    },
    "40100201": {
        id: 40100201,
        logic: "OR",
        map: {
            DialogueHasRead: [10033914],
        },
        remark: "泪湖之夜",
    },
    "40100301": {
        id: 40100301,
        logic: "OR",
        map: {
            DialogueHasRead: [12022901],
        },
        remark: "黍离之战",
    },
    "40100302": {
        id: 40100302,
        logic: "OR",
        map: {
            DialogueHasRead: [12044813],
        },
        remark: "黍离之战（追加1）",
    },
    "40100401": {
        id: 40100401,
        logic: "OR",
        map: {
            DialogueHasRead: [12015501],
        },
        remark: "大疫",
    },
    "40100501": {
        id: 40100501,
        logic: "OR",
        map: {
            DialogueHasRead: [12043214],
        },
        remark: "止流的卦象",
    },
    "40100502": {
        id: 40100502,
        logic: "OR",
        map: {
            DialogueHasRead: [12043309],
        },
        remark: "止流的卦象（追加1）",
    },
    "40100503": {
        id: 40100503,
        logic: "OR",
        map: {
            DialogueHasRead: [12045102],
        },
        remark: "止流的卦象（追加2）",
    },
    "40100504": {
        id: 40100504,
        logic: "OR",
        map: {
            DialogueHasRead: [12046418],
        },
        remark: "止流的卦象（追加3）",
    },
    "40100601": {
        id: 40100601,
        logic: "OR",
        map: {
            DialogueHasRead: [10047006],
        },
        remark: "帝国南方的叛乱",
    },
    "40200101": {
        id: 40200101,
        logic: "OR",
        map: {
            DialogueHasRead: [10125901],
        },
        remark: "雾海",
    },
    "40200201": {
        id: 40200201,
        logic: "OR",
        map: {
            DialogueHasRead: [51010322],
            Impression: [[510103, 1]],
        },
        remark: "茵布拉与埃斯刻",
    },
    "40300101": {
        id: 40300101,
        logic: "OR",
        map: {
            Quest: [10010205],
        },
        remark: "追忆的残影",
    },
    "40300201": {
        id: 40300201,
        logic: "OR",
        map: {
            DialogueHasRead: [10110801],
        },
        remark: "恩里克的研究",
    },
    "40300301": {
        id: 40300301,
        logic: "OR",
        map: {
            DialogueHasRead: [11018819],
            Quest: [11010704],
        },
        remark: "“第二新枝”计划",
    },
    "40300302": {
        id: 40300302,
        logic: "OR",
        map: {
            DialogueHasRead: [11106555],
        },
        remark: "“第二新枝”计划（追加1）",
    },
    "40300303": {
        id: 40300303,
        logic: "OR",
        map: {
            DialogueHasRead: [11120334],
        },
        remark: "“第二新枝”计划（追加2）",
    },
    "40300401": {
        id: 40300401,
        logic: "OR",
        map: {
            Quest: [10030502],
        },
        remark: "第六军团的秘密实验",
    },
    "40300402": {
        id: 40300402,
        logic: "OR",
        map: {
            DialogueHasRead: [10037623],
        },
        remark: "第六军团的秘密实验（追加1）",
    },
    "40300501": {
        id: 40300501,
        logic: "OR",
        map: {
            DialogueHasRead: [12010113],
        },
        remark: "香",
    },
    "40300502": {
        id: 40300502,
        logic: "OR",
        map: {
            DialogueHasRead: [12010508],
        },
        remark: "香（追加1）",
    },
    "40300503": {
        id: 40300503,
        logic: "OR",
        map: {
            DialogueHasRead: [12010601],
        },
        remark: "香（追加2）",
    },
    "40300601": {
        id: 40300601,
        logic: "OR",
        map: {
            DialogueHasRead: [12012701],
        },
        remark: "牵机方枢",
    },
    "40300701": {
        id: 40300701,
        logic: "OR",
        map: {
            DialogueHasRead: [12018901],
        },
        remark: "千枢狩阵",
    },
    "40300801": {
        id: 40300801,
        logic: "OR",
        map: {
            DialogueHasRead: [12044012],
        },
        remark: "天罗拒风仪",
    },
    "40300901": {
        id: 40300901,
        logic: "OR",
        map: {
            DialogueHasRead: [12060325],
        },
        remark: "青鸾贰型",
    },
    "40300902": {
        id: 40300902,
        logic: "OR",
        map: {
            DialogueHasRead: [12062328],
        },
        remark: "青鸾贰型（追加1）",
    },
    "40300903": {
        id: 40300903,
        logic: "OR",
        map: {
            DialogueHasRead: [12062502],
        },
        remark: "青鸾贰型（追加2）",
    },
    "40301001": {
        id: 40301001,
        logic: "OR",
        map: {
            DialogueHasRead: [10040109],
        },
        remark: "火车",
    },
    "40301101": {
        id: 40301101,
        logic: "OR",
        map: {
            DialogueHasRead: [10041904],
        },
        remark: "寒鸦号",
    },
    "40301201": {
        id: 40301201,
        logic: "OR",
        map: {
            DialogueHasRead: [10043501],
        },
        remark: "炸弹",
    },
    "40301301": {
        id: 40301301,
        logic: "OR",
        map: {
            DialogueHasRead: [10048201],
        },
        remark: "飞艇",
    },
    "40301401": {
        id: 40301401,
        logic: "OR",
        map: {
            DialogueHasRead: [10048506],
        },
        remark: "列车主炮",
    },
    "40400101": {
        id: 40400101,
        logic: "OR",
        map: {
            DialogueHasRead: [10032101],
        },
        remark: "魔笛剧团",
    },
    "40400201": {
        id: 40400201,
        logic: "OR",
        map: {
            DialogueHasRead: [10032801],
        },
        remark: "《雪国的孩子》",
    },
    "40400202": {
        id: 40400202,
        logic: "OR",
        map: {
            Quest: [10030404],
        },
        remark: "《雪国的孩子》（追加1）",
    },
    "40400203": {
        id: 40400203,
        logic: "OR",
        map: {
            Quest: [10030512],
        },
        remark: "《雪国的孩子》（追加2）",
    },
    "40500101": {
        id: 40500101,
        logic: "OR",
        map: {
            DialogueHasRead: [10101601],
        },
        remark: "休憩之所",
    },
    "40500201": {
        id: 40500201,
        logic: "OR",
        map: {
            Quest: [10020106],
        },
        remark: "修普诺斯之家",
    },
    "40500202": {
        id: 40500202,
        logic: "OR",
        map: {
            DialogueHasRead: [10106314],
            Quest: [10020403],
        },
        remark: "修普诺斯之家（追加1）",
    },
    "40500203": {
        id: 40500203,
        logic: "OR",
        map: {
            DialogueHasRead: [10107101],
        },
        remark: "修普诺斯之家（追加2）",
    },
    "40500204": {
        id: 40500204,
        logic: "OR",
        map: {
            DialogueHasRead: [10110818],
            Quest: [10020704],
        },
        remark: "修普诺斯之家（追加3）",
    },
    "40500205": {
        id: 40500205,
        logic: "OR",
        map: {
            Quest: [10020704],
        },
        remark: "恩里克之死",
    },
    "40500301": {
        id: 40500301,
        logic: "OR",
        map: {
            DialogueHasRead: [10101901],
        },
        remark: "水仙平原",
    },
    "40500401": {
        id: 40500401,
        logic: "OR",
        map: {
            DialogueHasRead: [10102601],
        },
        remark: "狩月人",
    },
    "40500501": {
        id: 40500501,
        logic: "OR",
        map: {
            DialogueHasRead: [10030801],
        },
        remark: "卡戎狩猎",
    },
    "40500502": {
        id: 40500502,
        logic: "OR",
        map: {
            Quest: [10030115],
        },
        remark: "卡戎狩猎（追加1）",
    },
    "40500503": {
        id: 40500503,
        logic: "OR",
        map: {
            Quest: [10030209],
        },
        remark: "卡戎狩猎（追加2）",
    },
    "40500504": {
        id: 40500504,
        logic: "OR",
        map: {
            DialogueHasRead: [10034518, 10034527],
        },
        remark: "卡戎狩猎（追加3）",
    },
    "40500505": {
        id: 40500505,
        logic: "OR",
        map: {
            DialogueHasRead: [10036329],
        },
        remark: "卡戎狩猎（追加4）",
    },
    "40500506": {
        id: 40500506,
        logic: "OR",
        map: {
            Quest: [10030512],
        },
        remark: "卡戎狩猎（追加5）",
    },
    "40500601": {
        id: 40500601,
        logic: "OR",
        map: {
            DialogueHasRead: [10031210],
        },
        remark: "银烛狂欢庆典",
    },
    "40500701": {
        id: 40500701,
        logic: "OR",
        map: {
            DialogueHasRead: [12010001],
        },
        remark: "织星客",
    },
    "40500801": {
        id: 40500801,
        logic: "OR",
        map: {
            DialogueHasRead: [12010113],
        },
        remark: "有龙氏",
    },
    "40500901": {
        id: 40500901,
        logic: "OR",
        map: {
            DialogueHasRead: [12010401],
        },
        remark: "诫碑",
    },
    "40500902": {
        id: 40500902,
        logic: "OR",
        map: {
            DialogueHasRead: [12010429],
        },
        remark: "诫碑（追加1）",
    },
    "40501001": {
        id: 40501001,
        logic: "OR",
        map: {
            DialogueHasRead: [12010401],
        },
        remark: "应天尉",
    },
    "40501002": {
        id: 40501002,
        logic: "OR",
        map: {
            DialogueHasRead: [12012001],
        },
        remark: "应天尉（追加1）",
    },
    "40501101": {
        id: 40501101,
        logic: "OR",
        map: {
            DialogueHasRead: [12010508],
        },
        remark: "白龙祠堂",
    },
    "40501201": {
        id: 40501201,
        logic: "OR",
        map: {
            DialogueHasRead: [12013101],
        },
        remark: "祝由",
    },
    "40501301": {
        id: 40501301,
        logic: "OR",
        map: {
            DialogueHasRead: [12013201],
        },
        remark: "枯荣阁",
    },
    "40501401": {
        id: 40501401,
        logic: "OR",
        map: {
            DialogueHasRead: [12040201],
        },
        remark: "奉香大典",
    },
    "40501501": {
        id: 40501501,
        logic: "OR",
        map: {
            DialogueHasRead: [12040511],
        },
        remark: "奉香群英试",
    },
    "40501502": {
        id: 40501502,
        logic: "OR",
        map: {
            DialogueHasRead: [12060733],
        },
        remark: "奉香群英试（追加1）",
    },
    "40501601": {
        id: 40501601,
        logic: "OR",
        map: {
            DialogueHasRead: [12044503],
        },
        remark: "钧天铁卫",
    },
    "40501701": {
        id: 40501701,
        logic: "OR",
        map: {
            DialogueHasRead: [10046107],
        },
        remark: "“老鼠罐头”",
    },
    "40501801": {
        id: 40501801,
        logic: "OR",
        map: {
            DialogueHasRead: [10046205],
        },
        remark: "普通车厢",
    },
    "40501901": {
        id: 40501901,
        logic: "OR",
        map: {
            DialogueHasRead: [10046513],
        },
        remark: "守卫车厢",
    },
    "40502001": {
        id: 40502001,
        logic: "OR",
        map: {
            DialogueHasRead: [10046513],
        },
        remark: "仆从车厢",
    },
    "40502101": {
        id: 40502101,
        logic: "OR",
        map: {
            DialogueHasRead: [10046513],
        },
        remark: "头等车厢",
    },
    "40502201": {
        id: 40502201,
        logic: "OR",
        map: {
            QuestChain: [200402],
        },
        remark: "汽笛沙龙",
    },
    "40502301": {
        id: 40502301,
        logic: "OR",
        map: {
            DialogueHasRead: [11100230],
        },
        remark: "乐园巡游",
    },
    "40502302": {
        id: 40502302,
        logic: "OR",
        map: {
            DialogueHasRead: [11100804],
        },
        remark: "乐园巡游（追加1）",
    },
    "40502303": {
        id: 40502303,
        logic: "OR",
        map: {
            DialogueHasRead: [11115503],
        },
        remark: "乐园巡游（追加2）",
    },
    "40502401": {
        id: 40502401,
        logic: "OR",
        map: {
            DialogueHasRead: [11101619],
        },
        remark: "名牌",
    },
    "40600101": {
        id: 40600101,
        logic: "OR",
        map: {
            DialogueHasRead: [10104001],
        },
        remark: "格雷姆矿坑",
    },
    "40600201": {
        id: 40600201,
        logic: "OR",
        map: {
            DialogueHasRead: [10031210],
        },
        remark: "盖雷亚剧院",
    },
    "40600301": {
        id: 40600301,
        logic: "OR",
        map: {
            DialogueHasRead: [10032501],
        },
        remark: "冰湖城渔业协会",
    },
    "40600401": {
        id: 40600401,
        logic: "OR",
        map: {
            DialogueHasRead: [12010301],
        },
        remark: "百年春",
    },
    "40600501": {
        id: 40600501,
        logic: "OR",
        map: {
            DialogueHasRead: [12013501],
        },
        remark: "格林威治考古协会",
    },
    "40600601": {
        id: 40600601,
        logic: "OR",
        map: {
            DialogueHasRead: [12040248],
        },
        remark: "泽生阁",
    },
    "40600701": {
        id: 40600701,
        logic: "OR",
        map: {
            DialogueHasRead: [10040814],
        },
        remark: "锻铁厂",
    },
    "40600801": {
        id: 40600801,
        logic: "OR",
        map: {
            DialogueHasRead: [10041106],
        },
        remark: "钢架清理工",
    },
    "40600901": {
        id: 40600901,
        logic: "OR",
        map: {
            QuestChain: [200401],
        },
        remark: "螺丝刀行会",
    },
    "40700101": {
        id: 40700101,
        logic: "OR",
        map: {
            DialogueHasRead: [11011302],
            Quest: [11010312],
        },
        remark: "海伯利亚皇家军事学院",
    },
    "40700201": {
        id: 40700201,
        logic: "OR",
        map: {
            DialogueHasRead: [11015301],
        },
        remark: "树刑",
    },
    "40700301": {
        id: 40700301,
        logic: "OR",
        map: {
            DialogueHasRead: [11012811],
        },
        remark: "桂冠卡戎",
    },
    "40700401": {
        id: 40700401,
        logic: "OR",
        map: {
            DialogueHasRead: [10032701],
        },
        remark: "《海伯利亚刑事法典》",
    },
    "40700501": {
        id: 40700501,
        logic: "OR",
        map: {
            DialogueHasRead: [12010113],
        },
        remark: "龙渊上卿",
    },
    "40700601": {
        id: 40700601,
        logic: "OR",
        map: {
            DialogueHasRead: [12010601],
        },
        remark: "悬衡派",
    },
    "40700701": {
        id: 40700701,
        logic: "OR",
        map: {
            DialogueHasRead: [12010709],
        },
        remark: "禁行令",
    },
    "40700801": {
        id: 40700801,
        logic: "OR",
        map: {
            DialogueHasRead: [12013410],
            Quest: [12010310],
        },
        remark: "机枢派",
    },
    "40700901": {
        id: 40700901,
        logic: "OR",
        map: {
            DialogueHasRead: [12040513],
        },
        remark: "执律阁",
    },
    "40701001": {
        id: 40701001,
        logic: "OR",
        map: {
            DialogueHasRead: [12040522],
        },
        remark: "天禄司",
    },
    "40701101": {
        id: 40701101,
        logic: "OR",
        map: {
            DialogueHasRead: [12040603],
        },
        remark: "祀烟阁",
    },
    "40701201": {
        id: 40701201,
        logic: "OR",
        map: {
            DialogueHasRead: [12040603],
        },
        remark: "匠矩阁",
    },
    "40701301": {
        id: 40701301,
        logic: "OR",
        map: {
            DialogueHasRead: [12041710],
        },
        remark: "辩法",
    },
    "40701401": {
        id: 40701401,
        logic: "OR",
        map: {
            DialogueHasRead: [12043732],
        },
        remark: "无穷藏派",
    },
    "40701501": {
        id: 40701501,
        logic: "OR",
        map: {
            DialogueHasRead: [12046916],
        },
        remark: "钧天玉律",
    },
    "40701601": {
        id: 40701601,
        logic: "OR",
        map: {
            DialogueHasRead: [10049302],
        },
        remark: "“牲王”",
    },
    "40800101": {
        id: 40800101,
        logic: "OR",
        map: {
            DialogueHasRead: [10025701],
        },
        remark: "净界岛",
    },
    "40800201": {
        id: 40800201,
        logic: "OR",
        map: {
            DialogueHasRead: [10019401],
            Quest: [10010308],
        },
        remark: "科赛托斯行省",
    },
    "40800301": {
        id: 40800301,
        logic: "OR",
        map: {
            DialogueHasRead: [10100201],
        },
        remark: "冰湖城",
    },
    "40800302": {
        id: 40800302,
        logic: "OR",
        map: {
            Quest: [10020305],
        },
        remark: "冰湖城（追加1）",
    },
    "40800303": {
        id: 40800303,
        logic: "OR",
        map: {
            DialogueHasRead: [10106322],
            Quest: [10020403],
        },
        remark: "冰湖城（追加2）",
    },
    "40800304": {
        id: 40800304,
        logic: "OR",
        map: {
            DialogueHasRead: [10031101],
        },
        remark: "冰湖城（追加3）",
    },
    "40800305": {
        id: 40800305,
        logic: "OR",
        map: {
            Quest: [10030206],
        },
        remark: "冰湖城（追加4）",
    },
    "40800401": {
        id: 40800401,
        logic: "OR",
        map: {
            DialogueHasRead: [10100801],
        },
        remark: "迪斯玛尼亚",
    },
    "40800501": {
        id: 40800501,
        logic: "OR",
        map: {
            DialogueHasRead: [10106301],
        },
        remark: "弗莱格桑行省",
    },
    "40800601": {
        id: 40800601,
        logic: "OR",
        map: {
            DialogueHasRead: [10110201],
        },
        remark: "红溪城",
    },
    "40800701": {
        id: 40800701,
        logic: "OR",
        map: {
            DialogueHasRead: [11011101],
        },
        remark: "龙莎要塞",
    },
    "40800801": {
        id: 40800801,
        logic: "OR",
        map: {
            DialogueHasRead: [11017101],
        },
        remark: "凯旋大道",
    },
    "40800901": {
        id: 40800901,
        logic: "OR",
        map: {
            DialogueHasRead: [11017101],
        },
        remark: "絮语河",
    },
    "40801001": {
        id: 40801001,
        logic: "OR",
        map: {
            Quest: [12000308],
        },
        remark: "华胥",
    },
    "40801002": {
        id: 40801002,
        logic: "OR",
        map: {
            DialogueHasRead: [12010014],
            Quest: [12010101],
        },
        remark: "华胥（追加1）",
    },
    "40801101": {
        id: 40801101,
        logic: "OR",
        map: {
            DialogueHasRead: [12010001],
        },
        remark: "烟津渡",
    },
    "40801201": {
        id: 40801201,
        logic: "OR",
        map: {
            DialogueHasRead: [12010901],
        },
        remark: "微茫市",
    },
    "40801301": {
        id: 40801301,
        logic: "OR",
        map: {
            DialogueHasRead: [12014001],
        },
        remark: "虞泉",
    },
    "40801401": {
        id: 40801401,
        logic: "OR",
        map: {
            DialogueHasRead: [12018601],
        },
        remark: "听鸦原",
    },
    "40801501": {
        id: 40801501,
        logic: "OR",
        map: {
            DialogueHasRead: [12020701],
        },
        remark: "烛阴祭坛",
    },
    "40801601": {
        id: 40801601,
        logic: "OR",
        map: {
            DialogueHasRead: [12040202],
        },
        remark: "皓京",
    },
    "40801701": {
        id: 40801701,
        logic: "OR",
        map: {
            DialogueHasRead: [12040603],
        },
        remark: "参商港",
    },
    "40801801": {
        id: 40801801,
        logic: "OR",
        map: {
            DialogueHasRead: [12043315],
        },
        remark: "山外山",
    },
    "40801901": {
        id: 40801901,
        logic: "OR",
        map: {
            DialogueHasRead: [12044508],
        },
        remark: "偃隐宫",
    },
    "40802001": {
        id: 40802001,
        logic: "OR",
        map: {
            DialogueHasRead: [12045811],
        },
        remark: "椒兰村",
    },
    "40802101": {
        id: 40802101,
        logic: "OR",
        map: {
            DialogueHasRead: [12046411],
        },
        remark: "太虚陵",
    },
    "40802201": {
        id: 40802201,
        logic: "OR",
        map: {
            DialogueHasRead: [10040211],
        },
        remark: "百花车站",
    },
    "40802301": {
        id: 40802301,
        logic: "OR",
        map: {
            DialogueHasRead: [11100001],
        },
        remark: "阿尔卡诺山",
    },
    "40802302": {
        id: 40802302,
        logic: "OR",
        map: {
            DialogueHasRead: [11103704],
        },
        remark: "阿尔卡诺山（追加1）",
    },
    "40802401": {
        id: 40802401,
        logic: "OR",
        map: {
            DialogueHasRead: [11100003],
        },
        remark: "阿尔卡诺镇",
    },
    "40802402": {
        id: 40802402,
        logic: "OR",
        map: {
            DialogueHasRead: [11106517],
        },
        remark: "阿尔卡诺镇（追加1）",
    },
    "40802403": {
        id: 40802403,
        logic: "OR",
        map: {
            DialogueHasRead: [11110709],
        },
        remark: "阿尔卡诺镇（追加2）",
    },
    "40802404": {
        id: 40802404,
        logic: "OR",
        map: {
            DialogueHasRead: [11117237],
        },
        remark: "阿尔卡诺镇（追加3）",
    },
    "40900101": {
        id: 40900101,
        logic: "OR",
        map: {
            QuestChain: [100103],
        },
        remark: "涉过沙海的你",
    },
    "40900201": {
        id: 40900201,
        logic: "OR",
        map: {
            QuestChain: [100208],
        },
        remark: "黑铁·白花",
    },
    "40900301": {
        id: 40900301,
        logic: "OR",
        map: {
            QuestChain: [100307],
        },
        remark: "雪国的孩子",
    },
    "40900401": {
        id: 40900401,
        logic: "OR",
        map: {
            QuestChain: [110109],
        },
        remark: "俯瞰者的游戏",
    },
    "40900501": {
        id: 40900501,
        logic: "OR",
        map: {
            QuestChain: [120114],
        },
        remark: "夜莺飞往彩色的梦",
    },
    "40900601": {
        id: 40900601,
        logic: "OR",
        map: {
            QuestChain: [120106],
        },
        remark: "烟津掠影蔽香尘",
    },
    "40900701": {
        id: 40900701,
        logic: "OR",
        map: {
            QuestChain: [120206],
        },
        remark: "大风起处问皓苍",
    },
    "40900801": {
        id: 40900801,
        logic: "OR",
        map: {
            QuestChain: [100405],
        },
        remark: "银星奔流",
    },
    "40900901": {
        id: 40900901,
        logic: "OR",
        map: {
            QuestChain: [110232],
        },
        remark: "第22只乐园的白兔",
    },
    "51001601": {
        id: 51001601,
        logic: "AND",
        map: {
            DialogueHasRead: [51001601],
        },
        remark: "读过51001601台本",
    },
    "77000008": {
        id: 77000008,
        logic: "AND",
        map: {
            InteractTriggerFinished: [77000008],
        },
        remark: "完成77000008",
    },
    "103021001": {
        id: 103021001,
        logic: "AND",
        map: {
            HaveItem: [
                ["Skin", 410101, 1],
                ["Skin", 180101, 1],
            ],
        },
        remark: "有限奖池活动1的结束条件",
    },
    "103021002": {
        id: 103021002,
        logic: "AND",
        map: {
            HaveItem: [
                ["Skin", 150201, 1],
                ["Skin", 310101, 1],
            ],
        },
        remark: "有限奖池活动2的结束条件",
    },
    "103021003": {
        id: 103021003,
        logic: "AND",
        map: {
            HaveItem: [
                ["Skin", 310201, 1],
                ["Skin", 320201, 1],
            ],
        },
        remark: "有限奖池活动3的结束条件",
    },
    "103021004": {
        id: 103021004,
        logic: "AND",
        map: {
            HaveItem: [
                ["Skin", 530102, 1],
                ["Skin", 110101, 1],
            ],
        },
        remark: "有限奖池活动4的结束条件",
    },
    "105101018": {
        id: 105101018,
        logic: "AND",
        map: {
            TrialEventFinish: [105102018],
        },
        remark: "苏乙试玩活动完成",
    },
    "105101019": {
        id: 105101019,
        logic: "AND",
        map: {
            TrialEventFinish: [105102019],
        },
        remark: "卡米拉试玩活动完成",
    },
    "105101020": {
        id: 105101020,
        logic: "AND",
        map: {
            TrialEventFinish: [105101020],
        },
        remark: "角色试玩活动（1.4上半芙罗拉）完成",
    },
    "105101021": {
        id: 105101021,
        logic: "AND",
        map: {
            TrialEventFinish: [105101021],
        },
        remark: "角色试玩活动（1.4下半希尔妲）完成",
    },
    "105101022": {
        id: 105101022,
        logic: "AND",
        map: {
            TrialEventFinish: [105101022],
        },
        remark: "角色试玩活动（1.5伊薇）完成",
    },
    "105101023": {
        id: 105101023,
        logic: "AND",
        map: {
            TrialEventFinish: [105101023],
        },
        remark: "角色试玩活动（1.6法露）完成",
    },
    "105102016": {
        id: 105102016,
        logic: "AND",
        map: {
            TrialEventFinish: [105102016],
        },
        remark: "苏乙皮肤试玩完成",
    },
    "105102022": {
        id: 105102022,
        logic: "AND",
        map: {
            TrialEventFinish: [105102022],
        },
        remark: "皮肤试玩活动（1.4上半芙罗拉）完成",
    },
    "105102023": {
        id: 105102023,
        logic: "AND",
        map: {
            TrialEventFinish: [105102023],
        },
        remark: "皮肤试玩活动（1.4上半水母婚纱）完成",
    },
    "105102024": {
        id: 105102024,
        logic: "AND",
        map: {
            TrialEventFinish: [105102024],
        },
        remark: "伊薇皮肤试玩完成",
    },
    "105102025": {
        id: 105102025,
        logic: "AND",
        map: {
            TrialEventFinish: [105102025],
        },
        remark: "法露皮肤试玩完成",
    },
    "110201024": {
        id: 110201024,
        logic: "AND",
        map: {
            VarEqual: [["ex02_11020102", 4]],
        },
        remark: "ex02_完成第一次悬崖边的观察者模式",
    },
    "110201032": {
        id: 110201032,
        logic: "AND",
        map: {
            VarEqual: [["ex02_11020103", 2]],
        },
        remark: "ex02_游玩一次打靶游戏",
    },
    "110201033": {
        id: 110201033,
        logic: "AND",
        map: {
            VarEqual: [["ex02_11020103", 3]],
        },
        remark: "ex02_游玩一次旋转茶杯",
    },
    "114001030": {
        id: 114001030,
        logic: "AND",
        map: {
            ComeBackEventScore: [30],
        },
        remark: "回归活动任务30点数",
    },
    "114001100": {
        id: 114001100,
        logic: "AND",
        map: {
            ComeBackEventScore: [100],
        },
        remark: "回归活动任务100点数",
    },
    "114001200": {
        id: 114001200,
        logic: "AND",
        map: {
            ComeBackEventScore: [200],
        },
        remark: "回归活动任务200点数",
    },
    "114001300": {
        id: 114001300,
        logic: "AND",
        map: {
            ComeBackEventScore: [300],
        },
        remark: "回归活动任务300点数",
    },
    "114001400": {
        id: 114001400,
        logic: "AND",
        map: {
            ComeBackEventScore: [400],
        },
        remark: "回归活动任务400点数",
    },
    "114001500": {
        id: 114001500,
        logic: "AND",
        map: {
            ComeBackEventScore: [500],
        },
        remark: "回归活动任务500点数",
    },
    "1004010201": {
        id: 1004010201,
        logic: "AND",
        map: {
            QuestChain: [120206],
        },
        remark: "火车站地图解锁",
    },
    "1004020401": {
        id: 1004020401,
        logic: "AND",
        map: {
            HaveItem: [["Skin", 3000019, 1]],
        },
        remark: "【第三章】拥有止痛药",
    },
    "1004030501": {
        id: 1004030501,
        logic: "AND",
        map: {
            HaveResource: [[3000023, 1]],
        },
        remark: "【第三章】拥有私酒酒壶",
    },
    "1004030502": {
        id: 1004030502,
        logic: "AND",
        map: {
            HaveResource: [[3000024, 1]],
        },
        remark: "【第三章】拥有走私棉衣",
    },
    "1004030503": {
        id: 1004030503,
        logic: "AND",
        map: {
            HaveResource: [[3000025, 1]],
        },
        remark: "【第三章】拥有酸性炼金药剂",
    },
    "1004040406": {
        id: 1004040406,
        logic: "AND",
        map: {
            HaveResource: [[3000018, 1]],
        },
        remark: "【第三章】拥有颜料",
    },
    "1101051101": {
        id: 1101051101,
        logic: "AND",
        map: {
            ExploreGroup: [7031001],
        },
        remark: "EX01回复能源",
    },
    "1101051301": {
        id: 1101051301,
        logic: "AND",
        map: {
            VarEqual: [["KajiaTalkEnd110105", 1]],
        },
        remark: "EX01卡嘉假结局",
    },
    "1101051302": {
        id: 1101051302,
        logic: "AND",
        map: {
            VarEqual: [["PhotoTalk110105", 1]],
        },
        remark: "EX01归还相片",
    },
    "1102200101": {
        id: 1102200101,
        logic: "AND",
        map: {
            VarEqual: [["ex02_11022001_FirstDay", 1]],
        },
        remark: "ex02_完成晚宴阶段1",
    },
    "1201035101": {
        id: 1201035101,
        logic: "AND",
        map: {
            ExploreGroup: [7050024],
        },
        remark: "东国一期主线-尘漠1完成",
    },
    "1201035102": {
        id: 1201035102,
        logic: "AND",
        map: {
            ExploreGroup: [7050017],
        },
        remark: "东国一期主线-尘漠2完成",
    },
    "1201035103": {
        id: 1201035103,
        logic: "AND",
        map: {
            ExploreGroup: [7050018],
        },
        remark: "东国一期主线-尘漠3完成",
    },
    "1201035104": {
        id: 1201035104,
        logic: "AND",
        map: {
            ExploreGroup: [7050026],
        },
        remark: "东国一期-风扇宝箱完成",
    },
    "1201040501": {
        id: 1201040501,
        logic: "AND",
        map: {
            ExploreGroup: [7049002],
        },
        remark: "东国一期-调香亭1",
    },
    "1201040502": {
        id: 1201040502,
        logic: "AND",
        map: {
            ExploreGroup: [7049003],
        },
        remark: "东国一期-调香亭2",
    },
    "1201041701": {
        id: 1201041701,
        logic: "AND",
        map: {
            ExploreGroup: [7043002],
        },
        remark: "东国一期-小船1",
    },
    "1201041702": {
        id: 1201041702,
        logic: "AND",
        map: {
            ExploreGroup: [7044007],
        },
        remark: "东国一期-小船2",
    },
}
