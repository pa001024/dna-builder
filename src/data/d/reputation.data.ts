/** 声名 */
export interface Reputation {
    id: number
    name: string
    icon: string
    refreshCost: Record<string, number> // 刷新成本
    weekLimit: number // 每周经验上限
    levels: ReputationLevel[]
    entrusts: ReputationEntrust[]
}

/** 声名委托 */
export interface ReputationEntrust {
    id: number
    name: string
    desc: string
    icon: string
    exp: number
    weight: number
    items: [string, number, number][]
}

/** 声名等级 */
export interface ReputationLevel {
    lv: number
    exp: number
    reward: number // 等级奖励
}

const reputationData: Reputation[] = [
    {
        id: 1001,
        name: "海伯利亚",
        icon: "T_Tab_IceLake",
        refreshCost: {
            铜币: 10000,
        },
        weekLimit: 1500,
        levels: [
            {
                lv: 1,
                exp: 100,
                reward: 111001,
            },
            {
                lv: 2,
                exp: 100,
                reward: 111002,
            },
            {
                lv: 3,
                exp: 100,
                reward: 111003,
            },
            {
                lv: 4,
                exp: 100,
                reward: 111004,
            },
            {
                lv: 5,
                exp: 100,
                reward: 111005,
            },
            {
                lv: 6,
                exp: 200,
                reward: 111006,
            },
            {
                lv: 7,
                exp: 200,
                reward: 111007,
            },
            {
                lv: 8,
                exp: 200,
                reward: 111008,
            },
            {
                lv: 9,
                exp: 200,
                reward: 111009,
            },
            {
                lv: 10,
                exp: 200,
                reward: 111010,
            },
            {
                lv: 11,
                exp: 300,
                reward: 111011,
            },
            {
                lv: 12,
                exp: 300,
                reward: 111012,
            },
            {
                lv: 13,
                exp: 300,
                reward: 111013,
            },
            {
                lv: 14,
                exp: 300,
                reward: 111014,
            },
            {
                lv: 15,
                exp: 300,
                reward: 111015,
            },
            {
                lv: 16,
                exp: 400,
                reward: 111016,
            },
            {
                lv: 17,
                exp: 400,
                reward: 111017,
            },
            {
                lv: 18,
                exp: 400,
                reward: 111018,
            },
            {
                lv: 19,
                exp: 400,
                reward: 111019,
            },
            {
                lv: 20,
                exp: 400,
                reward: 111020,
            },
            {
                lv: 21,
                exp: 500,
                reward: 111021,
            },
            {
                lv: 22,
                exp: 500,
                reward: 111022,
            },
            {
                lv: 23,
                exp: 500,
                reward: 111023,
            },
            {
                lv: 24,
                exp: 500,
                reward: 111024,
            },
            {
                lv: 25,
                exp: 500,
                reward: 111025,
            },
            {
                lv: 26,
                exp: 600,
                reward: 111026,
            },
            {
                lv: 27,
                exp: 600,
                reward: 111027,
            },
            {
                lv: 28,
                exp: 600,
                reward: 111028,
            },
            {
                lv: 29,
                exp: 600,
                reward: 111029,
            },
            {
                lv: 30,
                exp: 600,
                reward: 111030,
            },
        ],
        entrusts: [
            {
                id: 10001,
                name: "外送皎皎的采集物收集",
                desc: "“你经常在外面闯荡，一定攒了不少好东西吧，能不能卖给咱一些？咱最近正在琢磨搞点副业……”",
                icon: "T_Head_WaimaiJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010011, 10],
                    ["Resource", 4010010, 10],
                ],
            },
            {
                id: 10002,
                name: "外送皎皎的采集物收集",
                desc: "“你经常在外面闯荡，一定攒了不少好东西吧，能不能卖给咱一些？咱最近正在琢磨搞点副业……”",
                icon: "T_Head_WaimaiJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010011, 10],
                    ["Resource", 4010005, 10],
                ],
            },
            {
                id: 10003,
                name: "外送皎皎的采集物收集",
                desc: "“你经常在外面闯荡，一定攒了不少好东西吧，能不能卖给咱一些？咱最近正在琢磨搞点副业……”",
                icon: "T_Head_WaimaiJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010011, 10],
                    ["Resource", 4020003, 10],
                ],
            },
            {
                id: 10004,
                name: "外送皎皎的采集物收集",
                desc: "“你经常在外面闯荡，一定攒了不少好东西吧，能不能卖给咱一些？咱最近正在琢磨搞点副业……”",
                icon: "T_Head_WaimaiJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010010, 10],
                    ["Resource", 4010008, 10],
                ],
            },
            {
                id: 10005,
                name: "外送皎皎的采集物收集",
                desc: "“你经常在外面闯荡，一定攒了不少好东西吧，能不能卖给咱一些？咱最近正在琢磨搞点副业……”",
                icon: "T_Head_WaimaiJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010010, 10],
                    ["Resource", 4010004, 10],
                ],
            },
            {
                id: 10006,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20001, 100],
                    ["Resource", 20012, 400],
                ],
            },
            {
                id: 10007,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20003, 100],
                    ["Resource", 20005, 400],
                ],
            },
            {
                id: 10008,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20004, 100],
                    ["Resource", 20011, 400],
                ],
            },
            {
                id: 10009,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20009, 400],
                    ["Resource", 20014, 50],
                ],
            },
            {
                id: 10010,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20002, 400],
                    ["Resource", 20019, 50],
                ],
            },
            {
                id: 10011,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20012, 400],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 10012,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20006, 10],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 10013,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20022, 10],
                    ["Resource", 20020, 50],
                ],
            },
            {
                id: 10014,
                name: "卡米拉的素材收集",
                desc: "“有位狩月人要和你打赌，说你绝对搞不来这些。你要应下这个赌吗？”",
                icon: "T_Head_Kami",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 20018, 50],
                ],
            },
            {
                id: 10015,
                name: "玛尔洁的物资收集",
                desc: "“什么什么？！我听说这里有真诚许愿就会满足我的垃圾桶精灵~开玩笑的，但我的确需要这批物资！”",
                icon: "T_Head_Maer",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20004, 100],
                    ["Resource", 4010011, 10],
                ],
            },
            {
                id: 10016,
                name: "玛尔洁的物资收集",
                desc: "“什么什么？！我听说这里有真诚许愿就会满足我的垃圾桶精灵~开玩笑的，但我的确需要这批物资！”",
                icon: "T_Head_Maer",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20015, 100],
                    ["Resource", 4010010, 10],
                ],
            },
            {
                id: 10017,
                name: "玛尔洁的物资收集",
                desc: "“什么什么？！我听说这里有真诚许愿就会满足我的垃圾桶精灵~开玩笑的，但我的确需要这批物资！”",
                icon: "T_Head_Maer",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20016, 100],
                    ["Resource", 4010004, 10],
                ],
            },
            {
                id: 10018,
                name: "玛尔洁的物资收集",
                desc: "“什么什么？！我听说这里有真诚许愿就会满足我的垃圾桶精灵~开玩笑的，但我的确需要这批物资！”",
                icon: "T_Head_Maer",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 4010005, 10],
                ],
            },
            {
                id: 10019,
                name: "玛尔洁的物资收集",
                desc: "“什么什么？！我听说这里有真诚许愿就会满足我的垃圾桶精灵~开玩笑的，但我的确需要这批物资！”",
                icon: "T_Head_Maer",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20025, 10],
                    ["Resource", 4020003, 10],
                ],
            },
            {
                id: 10020,
                name: "玛尔洁的物资收集",
                desc: "“什么什么？！我听说这里有真诚许愿就会满足我的垃圾桶精灵~开玩笑的，但我的确需要这批物资！”",
                icon: "T_Head_Maer",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20026, 10],
                    ["Resource", 4010008, 10],
                ],
            },
        ],
    },
    {
        id: 1002,
        name: "华胥",
        icon: "T_Tab_East_Season01",
        refreshCost: {
            铜币: 10000,
        },
        weekLimit: 1500,
        levels: [
            {
                lv: 1,
                exp: 100,
                reward: 111031,
            },
            {
                lv: 2,
                exp: 100,
                reward: 111032,
            },
            {
                lv: 3,
                exp: 100,
                reward: 111033,
            },
            {
                lv: 4,
                exp: 100,
                reward: 111034,
            },
            {
                lv: 5,
                exp: 100,
                reward: 111035,
            },
            {
                lv: 6,
                exp: 200,
                reward: 111036,
            },
            {
                lv: 7,
                exp: 200,
                reward: 111037,
            },
            {
                lv: 8,
                exp: 200,
                reward: 111038,
            },
            {
                lv: 9,
                exp: 200,
                reward: 111039,
            },
            {
                lv: 10,
                exp: 200,
                reward: 111040,
            },
            {
                lv: 11,
                exp: 300,
                reward: 111041,
            },
            {
                lv: 12,
                exp: 300,
                reward: 111042,
            },
            {
                lv: 13,
                exp: 300,
                reward: 111043,
            },
            {
                lv: 14,
                exp: 300,
                reward: 111044,
            },
            {
                lv: 15,
                exp: 300,
                reward: 111045,
            },
            {
                lv: 16,
                exp: 400,
                reward: 111046,
            },
            {
                lv: 17,
                exp: 400,
                reward: 111047,
            },
            {
                lv: 18,
                exp: 400,
                reward: 111048,
            },
            {
                lv: 19,
                exp: 400,
                reward: 111049,
            },
            {
                lv: 20,
                exp: 400,
                reward: 111050,
            },
            {
                lv: 21,
                exp: 500,
                reward: 111051,
            },
            {
                lv: 22,
                exp: 500,
                reward: 111052,
            },
            {
                lv: 23,
                exp: 500,
                reward: 111053,
            },
            {
                lv: 24,
                exp: 500,
                reward: 111054,
            },
            {
                lv: 25,
                exp: 500,
                reward: 111055,
            },
            {
                lv: 26,
                exp: 600,
                reward: 111056,
            },
            {
                lv: 27,
                exp: 600,
                reward: 111057,
            },
            {
                lv: 28,
                exp: 600,
                reward: 111058,
            },
            {
                lv: 29,
                exp: 600,
                reward: 111059,
            },
            {
                lv: 30,
                exp: 600,
                reward: 111060,
            },
        ],
        entrusts: [
            {
                id: 11001,
                name: "锦鲤皎皎的采集物收集",
                desc: "“白说你们在冒险的过程中经常会捡到这些东西，很多都没用，可以的话，能分给我一些吗？”",
                icon: "T_Head_JinliJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010018, 10],
                    ["Resource", 4010019, 10],
                ],
            },
            {
                id: 11002,
                name: "锦鲤皎皎的采集物收集",
                desc: "“白说你们在冒险的过程中经常会捡到这些东西，很多都没用，可以的话，能分给我一些吗？”",
                icon: "T_Head_JinliJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010018, 10],
                    ["Resource", 4010015, 10],
                ],
            },
            {
                id: 11003,
                name: "锦鲤皎皎的采集物收集",
                desc: "“白说你们在冒险的过程中经常会捡到这些东西，很多都没用，可以的话，能分给我一些吗？”",
                icon: "T_Head_JinliJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010018, 10],
                    ["Resource", 4020006, 10],
                ],
            },
            {
                id: 11004,
                name: "锦鲤皎皎的采集物收集",
                desc: "“白说你们在冒险的过程中经常会捡到这些东西，很多都没用，可以的话，能分给我一些吗？”",
                icon: "T_Head_JinliJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010019, 10],
                    ["Resource", 4010016, 10],
                ],
            },
            {
                id: 11005,
                name: "锦鲤皎皎的采集物收集",
                desc: "“白说你们在冒险的过程中经常会捡到这些东西，很多都没用，可以的话，能分给我一些吗？”",
                icon: "T_Head_JinliJJ",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 4010019, 10],
                    ["Resource", 4010017, 10],
                ],
            },
            {
                id: 11006,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20001, 100],
                    ["Resource", 20012, 400],
                ],
            },
            {
                id: 11007,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20003, 100],
                    ["Resource", 20005, 400],
                ],
            },
            {
                id: 11008,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20004, 100],
                    ["Resource", 20011, 400],
                ],
            },
            {
                id: 11009,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20009, 400],
                    ["Resource", 20014, 50],
                ],
            },
            {
                id: 11010,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20002, 400],
                    ["Resource", 20019, 50],
                ],
            },
            {
                id: 11011,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20012, 400],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 11012,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20006, 10],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 11013,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20022, 10],
                    ["Resource", 20020, 50],
                ],
            },
            {
                id: 11014,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 20018, 50],
                ],
            },
            {
                id: 11015,
                name: "织星客的素材收集",
                desc: "“这些货物很受欢迎，只是最近玄色狴犴在商路肆虐，进货困难。如果你愿意帮忙，我们非常感激。”",
                icon: "T_Head_FameCommon",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20004, 100],
                    ["Resource", 4010018, 10],
                ],
            },
            {
                id: 11016,
                name: "虬先生的物资收集",
                desc: "“不必紧张，若你此时相助，他日定有我回报你之时。”",
                icon: "T_Head_Qiu",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20015, 100],
                    ["Resource", 4010019, 10],
                ],
            },
            {
                id: 11017,
                name: "虬先生的物资收集",
                desc: "“不必紧张，若你此时相助，他日定有我回报你之时。”",
                icon: "T_Head_Qiu",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20016, 100],
                    ["Resource", 4010017, 10],
                ],
            },
            {
                id: 11018,
                name: "虬先生的物资收集",
                desc: "“不必紧张，若你此时相助，他日定有我回报你之时。”",
                icon: "T_Head_Qiu",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 4010015, 10],
                ],
            },
            {
                id: 11019,
                name: "虬先生的物资收集",
                desc: "“不必紧张，若你此时相助，他日定有我回报你之时。”",
                icon: "T_Head_Qiu",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20025, 10],
                    ["Resource", 4020006, 10],
                ],
            },
            {
                id: 11020,
                name: "虬先生的物资收集",
                desc: "“不必紧张，若你此时相助，他日定有我回报你之时。”",
                icon: "T_Head_Qiu",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20026, 10],
                    ["Resource", 4010016, 10],
                ],
            },
        ],
    },
]

export default reputationData
