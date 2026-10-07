/**
 * 调查墙线索板：页类型（重点 / 地区 / 人物）→ 页 → 线索 → 内容条目。
 *
 * 由 `tools/import-i18n-data.ts` 从 i18n 导出的 Clue.json 生成，请勿手动修改；
 * 数据更新请运行 `bun tools/import-i18n-data.ts -f Clue`。
 * 文本只有简体中文一套，界面显示时经 `gt()` 走译文对照表。
 */

/** 内容条目的解锁触发源：对应一段对话或一份资源 */
export interface ClueContentTrigger {
    type: "Dialogue" | "Resource"
    id: number
}

/** 线索下的一条内容条目（一条线索板上的文字记录） */
export interface ClueContent {
    id: number
    text: string
    trigger?: ClueContentTrigger
}

/** 一条线索（调查墙上的一张卡） */
export interface Clue {
    id: number
    name: string
    contents: ClueContent[]
    pic1?: string
    pic2?: string
    type?: number
}

/** 线索板的一页（一个调查对象） */
export interface CluePage {
    id: string
    name: string
    clues: Clue[]
    unlock?: number
}

/** 线索板的一个页类型（重点 / 地区 / 人物等分类） */
export interface ClueTabType {
    type: string
    name: string
    priority: number
    pages: CluePage[]
}

export const clueData: ClueTabType[] = [
    {
        type: "Ex02_Core",
        name: "重点",
        priority: 55,
        pages: [
            {
                id: "Ex02_MainStory_1001",
                name: "富尔维斯",
                clues: [
                    {
                        id: 100101,
                        name: "富尔维斯的行踪",
                        contents: [
                            {
                                id: 10010101,
                                text: "富尔维斯已经来到了弗莱格桑省，当前行动暂不明。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100001,
                                },
                            },
                            {
                                id: 10010102,
                                text: "据「力量」伯纳德所说，最近五天没看到类似富尔维斯的身影出现在阿尔卡诺山。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100241,
                                },
                            },
                            {
                                id: 10010103,
                                text: "「女祭司」艾达也没见过除我以外的军团成员，看来阿尔卡诺镇的镇民基本都没见过军官富尔维斯这个人。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11101617,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0005",
                        pic2: "T_StringBoard_Main_0005",
                        type: 1,
                    },
                    {
                        id: 100102,
                        name: "富尔维斯的行动",
                        contents: [
                            {
                                id: 10010201,
                                text: "富尔维斯无法确认法露茜的生死，因此派出密探寻找法露茜的踪迹，试图灭口。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11105822,
                                },
                            },
                            {
                                id: 10010202,
                                text: "富尔维斯的手下被分为两队，驻扎在阿尔卡诺山附近，并没有深入阿尔卡诺山。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11111019,
                                },
                            },
                            {
                                id: 10010203,
                                text: "富尔维斯并没有失忆，他一直在伪装成「愚者」乔伊，暗中激化我与乐园镇的矛盾，只为在双方两败俱伤之时，成功夺取触媒。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11120338,
                                },
                            },
                            {
                                id: 10010204,
                                text: "我看透了富尔维斯的伪装，早早调换了富尔维斯的通讯器，成功粉碎了他的阴谋。意识到彻底没有翻盘希望之后，富尔维斯引爆了自己的作战载具，将阿尔卡诺镇化为一片火海，想要跟我们同归于尽。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11120622,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0006",
                        type: 1,
                    },
                ],
                unlock: 11020101,
            },
            {
                id: "Ex02_MainStory_1002",
                name: "触媒",
                clues: [
                    {
                        id: 100201,
                        name: "触媒",
                        contents: [
                            {
                                id: 10020101,
                                text: "借助触媒，人们可以以一个原型为蓝图，不断创造出原型的复制品。触媒极有可能保存在乐园镇的主人“兔妈妈”手中。只是没人知道它具体以什么形式存在。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100001,
                                },
                            },
                            {
                                id: 10020102,
                                text: "触媒可以复制已经存在的事物，包括人类。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11120305,
                                },
                            },
                            {
                                id: 10020103,
                                text: "第二新枝计划所需要的关键触媒，正是蕴含在艾达血脉之中的复制能力。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11120334,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0007",
                        type: 1,
                    },
                ],
                unlock: 11020101,
            },
            {
                id: "Ex02_MainStory_1003",
                name: "阿尔卡诺山",
                clues: [
                    {
                        id: 100301,
                        name: "阿尔卡诺镇的生活",
                        contents: [
                            {
                                id: 10030101,
                                text: "阿尔卡诺镇的每一位居民都有一个独一无二的名牌，比如艾达的「女祭司」，我的「战车」，总共21个，这些名牌寓意着名牌持有者都是乐园的一家人。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11101619,
                                },
                            },
                            {
                                id: 10030102,
                                text: "乐园镇有着所有人都必须遵守的规则。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106524,
                                },
                            },
                            {
                                id: 10030103,
                                text: "乐园镇的生活十分和谐，如果彼此之间出现分歧，他们只会通过游戏进行调解，而不是一味地争吵或者诉诸暴力。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11108404,
                                },
                            },
                            {
                                id: 10030104,
                                text: "无论是索拉还是卡戎，都能在乐园镇平等而幸福地生活在一起。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11111057,
                                },
                            },
                            {
                                id: 10030105,
                                text: "乐园镇有一种叫胡桃夹子的玩具，做工精致，造型可爱。它是镇民日常生活中的好帮手，据莫甘娜所说，我小时候也跟她学过如何制作这种玩具。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106804,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0008",
                        type: 1,
                    },
                    {
                        id: 100302,
                        name: "乐园巡游",
                        contents: [
                            {
                                id: 10030201,
                                text: "乐园镇每月会举行一次特别的庆典，其名叫乐园巡游，兔妈妈会在乐园巡游之夜驾临。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100902,
                                },
                            },
                            {
                                id: 10030202,
                                text: "人们会在乐园巡游时进行一场游戏，在游戏投票环节最高得票者将被判出局。\n乐园巡游本质上是“兔妈妈”对乐园居民进行的一场服从性测试，违反乐园规则的玩家会遭到处决。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11115049,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0009",
                        type: 1,
                    },
                    {
                        id: 100303,
                        name: "山中异样",
                        contents: [
                            {
                                id: 10030301,
                                text: "不知为何，进山之后我经常会突然地感到头晕。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100406,
                                },
                            },
                            {
                                id: 10030302,
                                text: "阿尔卡诺镇原本的居民大多已死于战争，如今乐园镇的居民都是被镇长和“兔妈妈”胁迫，不得不去扮演死亡居民的外来者。那些违反规则、不好好扮演的人，都会被镇长处死，埋葬在酣梦池下方的墓园之中。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11117210,
                                },
                            },
                            {
                                id: 10030303,
                                text: "阿尔卡诺山的水被切萨雷混入了炼金院的药剂，这种药剂本是用来安抚士兵，使他们保持镇定的存在。但过量使用后则会影响人们的精神，让人只会服从命令。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11117225,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0010",
                        type: 1,
                    },
                    {
                        id: 100304,
                        name: "阿尔卡诺镇的规则·其一",
                        contents: [
                            {
                                id: 10030401,
                                text: "第一条 阿尔卡诺山是我们的乐园，我们都是兔妈妈的白兔。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030402,
                                text: "第二条 全体白兔必须相亲相爱，禁止对白兔使用暴力。彼此之间若有矛盾，可以通过游戏的方式解决。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030403,
                                text: "第三条 兔子有很多种颜色。白色兔子是我们的朋友，红色兔子是危险的。如果看到红色兔子，请立刻报告镇长。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030404,
                                text: "第四条 乐园巡游是阿尔卡诺镇的盛事，在乐园巡游庆典上，需要完成一局游戏。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030405,
                                text: "第五条 阿尔卡诺山的玩具是我们友好的同伴，可以接受它们的护卫与帮助。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0011",
                        type: 1,
                    },
                    {
                        id: 100305,
                        name: "阿尔卡诺镇的规则·其二",
                        contents: [
                            {
                                id: 10030406,
                                text: "第六条 请所有白兔牢记我们的名牌，它代表着我们的本质。不得违反我们的本质。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030407,
                                text: "第七条 天上的巨大铁皮人是乐园的敌人。如果见到巨大铁皮人，请立即放下手上的一切，前往酣梦池。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030408,
                                text: "第八条 如果触犯规则，酣梦池能帮我们找回内心的宁静。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030409,
                                text: "第九条 没有巨大铁皮人的情况下，未经镇长允许，禁止靠近酣梦池。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                            {
                                id: 10030410,
                                text: "第十条 为了我们的生活不被外界的纷扰所打破，任何白兔不得轻易离开我们的乐园。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114213,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0012",
                        type: 1,
                    },
                ],
                unlock: 11020101,
            },
        ],
    },
    {
        type: "Ex02_Region",
        name: "地区",
        priority: 45,
        pages: [
            {
                id: "Ex02_Region_1101",
                name: "阿尔卡诺镇废墟",
                clues: [
                    {
                        id: 110101,
                        name: "概况",
                        contents: [
                            {
                                id: 11010101,
                                text: "四年前被战争摧毁的阿尔卡诺镇，罕有人迹，只剩下几台设施能勉强运行，也是我与艾达曾经生活过的故乡。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11101102,
                                },
                            },
                            {
                                id: 11010102,
                                text: "四年前，去往前线突袭的军团飞艇部队在进攻受挫后紧急迫降在了阿尔卡诺山，幸存士兵接到命令原地进行坚守，尽可能拖住艾利西安传颂会的地面部队。最终军团调来了大规模的空中火力，成功在阿尔卡诺山挡住了传颂会的进攻，阿尔卡诺镇也在这场轰炸中被完全摧毁。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000128,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0013",
                        pic2: "T_StringBoard_Main_0014",
                        type: 2,
                    },
                ],
                unlock: 11020102,
            },
            {
                id: "Ex02_Region_1102",
                name: "阿尔卡诺山裂隙",
                clues: [
                    {
                        id: 110201,
                        name: "概况",
                        contents: [
                            {
                                id: 11020101,
                                text: "被轰炸的传颂会士兵撤到了阿尔卡诺山裂隙中，为了延缓军团士兵的追击速度，他们一边撤退一边沿途布设了大量地雷。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000129,
                                },
                            },
                            {
                                id: 11020102,
                                text: "四年前，军团榴弹携带的有毒物质渗进了周围土地与溪流，形成了面前这滩颜色诡异的湖水，这水极其危险，哪怕是秽兽也无法在其中生存。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11114002,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0015",
                        pic2: "T_StringBoard_Main_0016",
                        type: 2,
                    },
                ],
                unlock: 11020104,
            },
            {
                id: "Ex02_Region_1103",
                name: "阿尔卡诺镇",
                clues: [
                    {
                        id: 110301,
                        name: "军团记录",
                        contents: [
                            {
                                id: 11030101,
                                text: "阿尔卡诺镇位于阿尔卡诺山的山间台地，与阿尔卡诺山同名。起初它的规模很小，随着镇民完成了镇内游乐园的建设，大量观光客涌入了阿尔卡诺镇，小镇也因此得到了扩建，成为一座繁华的旅游城镇。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100001,
                                },
                            },
                            {
                                id: 11030102,
                                text: "四年前的战争中，阿尔卡诺镇曾短暂成为边境军团的众多补给点之一。但随着战争愈演愈烈，很多原本安全的城镇也被卷入了战火，阿尔卡诺镇正是这些被战争摧毁的城镇之一。\n根据战争幸存者的记录，阿尔卡诺镇大部分居民都在当年的战争中死亡，阿尔卡诺镇也就此成为历史。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100001,
                                },
                            },
                            {
                                id: 11030103,
                                text: "四年前的战争在阿尔卡诺山中留下了不可挽回的影响。山间的阿尔卡诺镇被摧毁，村民全部遇难，大量区域变得不适合人类生存。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100001,
                                },
                            },
                            {
                                id: 11030104,
                                text: "此外，传颂会士兵撤退时，为了延缓帝国追兵的进军速度，在山中铺设了大量地雷。诸多因素叠加在一起，让帝国在这些年始终没有对阿尔卡诺山及阿尔卡诺镇进行收复与重建。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100001,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0017",
                        type: 2,
                    },
                    {
                        id: 110302,
                        name: "乐园镇",
                        contents: [
                            {
                                id: 11030201,
                                text: "兔妈妈以一己之力，在饱受战火摧残的阿尔卡诺山重建起了阿尔卡诺镇，并将其更名为乐园镇。幸存者在乐园镇中过上了闲适幸福的生活。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11101610,
                                },
                            },
                            {
                                id: 11030202,
                                text: "一般情况下，吊桥是乐园镇唯一的出入口，需要有人在镇子内侧持续拉着开关才能启动。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11110403,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0018",
                        pic2: "T_StringBoard_Main_0019",
                        type: 2,
                    },
                    {
                        id: 110303,
                        name: "仓库",
                        contents: [
                            {
                                id: 11030301,
                                text: "乐园镇的仓库中整齐摆放着各种食物原料、玩具、服装和装饰品，它们造型完全一致，连破损都一模一样，很可能是触媒的造物。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11108813,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0019",
                        pic2: "T_StringBoard_Main_0021",
                        type: 2,
                    },
                    {
                        id: 110304,
                        name: "酣梦池",
                        contents: [
                            {
                                id: 11030401,
                                text: "法露茜独自调查了酣梦池，那里什么人都没有，看起来更像是一座监牢。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11111047,
                                },
                            },
                            {
                                id: 11030402,
                                text: "酣梦池的下方是一座墓园，墓园中埋葬着所有阿尔卡诺镇的镇民。其中也包括“我”——维克托的墓。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11117201,
                                },
                            },
                            {
                                id: 11030403,
                                text: "在墓穴发现的无法打开的箱子，等尘埃落定之后再来看看吧。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11116801,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0022",
                        pic2: "T_StringBoard_Main_0023",
                        type: 2,
                    },
                    {
                        id: 110305,
                        name: "山林的发现",
                        contents: [
                            {
                                id: 11030501,
                                text: "四年前，一架军团飞艇迫降在此，两名幸存者在与大部队会合之前就遭遇了传颂会的先遣部队，双方在林中展开了枪战。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11112301,
                                },
                            },
                            {
                                id: 11030502,
                                text: "我们找到了其中一位士兵幸存者的墓碑，另一位像是军官的幸存者则下落不明。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11112701,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0069",
                        pic2: "T_StringBoard_Main_0025",
                        type: 2,
                    },
                ],
                unlock: 11020101,
            },
        ],
    },
    {
        type: "Ex02_Character",
        name: "人物",
        priority: 30,
        pages: [
            {
                id: "Ex02_Character_1201",
                name: "法露茜",
                clues: [
                    {
                        id: 120101,
                        name: "法露茜",
                        contents: [
                            {
                                id: 12010101,
                                text: "富尔维斯利用龙莎要塞的爆炸来灭法露茜的口，但法露茜还是在爆炸中活了下来，并一路追到了阿尔卡诺山。可惜的是她手中的录音设备已在爆炸中损毁，可以用来扳倒富尔维斯的证据又少了一个，至少我要带着法露茜这个人证回去。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11102821,
                                },
                            },
                            {
                                id: 12010102,
                                text: "法露茜自龙莎要塞的爆炸中活下来之后，一心想着杀死富尔维斯完成复仇，从她身上那些还没痊愈的伤口来看，她在来到阿尔卡诺山的这一路上，已经与富尔维斯的密探进行过不少血腥的厮杀。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11105822,
                                },
                            },
                            {
                                id: 12010103,
                                text: "为了寻找那份记录着龙莎要塞真相的录音文件，法露茜一个人踏入了火海，下落不明。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11121012,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0026",
                        type: 3,
                    },
                ],
                unlock: 11020104,
            },
            {
                id: "Ex02_Character_1202",
                name: "阿尔卡诺镇的镇民·其一",
                clues: [
                    {
                        id: 120204,
                        name: "「审判」兔妈妈",
                        contents: [
                            {
                                id: 12020401,
                                text: "“兔妈妈”是一位神秘而强大的“骸”，也是“第二新枝”计划的关键“触媒”的持有者。根据阿瓦尔老师的情报，无论发生什么，哪怕是带着触媒与敌人同归于尽，她也不会将触媒交出去。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100001,
                                },
                            },
                            {
                                id: 12020402,
                                text: "兔妈妈在阿尔卡诺镇的地位极高，似乎还是主持阿尔卡诺镇重建工作的工程师。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11101610,
                                },
                            },
                            {
                                id: 12020403,
                                text: "兔妈妈是四年前的战争中，阿尔卡诺镇唯一的幸存者，也就是真正的艾达。她拥有罕见的复制魔法。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11120305,
                                },
                            },
                            {
                                id: 12020404,
                                text: "艾达用最后的能力帮我们逃离了正在化为火海的阿尔卡诺镇废墟，随后被镇长背着走入了火焰，消失在火中，至今下落不明。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11120823,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0031",
                        pic2: "T_StringBoard_Main_0032",
                        type: 3,
                    },
                    {
                        id: 120201,
                        name: "「力量」伯纳德",
                        contents: [
                            {
                                id: 12020101,
                                text: "阿尔卡诺镇的猎人，热情、亲切，经常在山中活动，他在前天看到一个陌生的女性身影从林中闪过。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100241,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0027",
                        type: 3,
                    },
                    {
                        id: 120202,
                        name: "「女祭司」艾达",
                        contents: [
                            {
                                id: 12020201,
                                text: "阿尔卡诺镇的镇民之一，看起来性格单纯，思维有一些跳跃。据她本人说，她是维克托的童年玩伴。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100414,
                                },
                            },
                            {
                                id: 12020202,
                                text: "法露茜看到了艾达冷漠地杀死了其他镇民。艾达似乎远没有看上去那么单纯无辜。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11105834,
                                },
                            },
                            {
                                id: 12020203,
                                text: "艾达喜欢玩游戏，喜欢游戏里多种多样的身份。她说自己只能一辈子待在深山里，这是为什么？",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11103808,
                                },
                            },
                            {
                                id: 12020204,
                                text: "艾达对兔妈妈来说是不一样的。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11115516,
                                },
                            },
                            {
                                id: 12020205,
                                text: "在“兔妈妈”的审判中，艾达舍弃了“兔妈妈”赐予的名字“艾达”，为自己取了新的名字“伊薇”。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11118623,
                                },
                            },
                            {
                                id: 12020206,
                                text: "实际上是“兔妈妈”，也就是真正的艾达以自己为原型复制出的造物。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11120305,
                                },
                            },
                            {
                                id: 12020207,
                                text: "逃离阿尔卡诺山之后，伊薇踏上了独自一人的旅途，现在，她终于可以亲眼看看外面的世界了。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11121420,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0028",
                        pic2: "T_StringBoard_Main_0029",
                        type: 3,
                    },
                    {
                        id: 120203,
                        name: "「战车」维克托",
                        contents: [
                            {
                                id: 12020301,
                                text: "这里的居民都叫我「战车」维克托，四年前离开了故乡阿尔卡诺镇，加入了军团。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11100225,
                                },
                            },
                            {
                                id: 12020302,
                                text: "小时候，维克托会跟艾达一起捉虫子，一起在阿尔卡诺镇游玩，还会跟伯纳德打猎。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106802,
                                },
                            },
                            {
                                id: 12020303,
                                text: "镇民似乎不能完全确定我现在的长相，我加入军团之后的变化有这么大吗？",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106537,
                                },
                            },
                            {
                                id: 12020304,
                                text: "恍惚中，我看到了一些零碎的记忆片段，似乎是我作为维克托与镇民们共同生活的回忆。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11108302,
                                },
                            },
                            {
                                id: 12020305,
                                text: "我并不是维克托，一切都是阿尔卡诺镇镇民的谎言。真正的维克托是阿尔卡诺镇的居民，已于四年前的战争中身故。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11117210,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0030",
                        type: 3,
                    },
                    {
                        id: 120205,
                        name: "「皇帝」切萨雷",
                        contents: [
                            {
                                id: 12020501,
                                text: "阿尔卡诺镇的镇长，他给了艾达一种神秘的药剂，这种药剂缓解了我与法露茜的伤势。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11105405,
                                },
                            },
                            {
                                id: 12020502,
                                text: "切萨雷给艾达的神秘药剂正是四年前，炼金院发给高级军官的强心剂，切萨雷跟军团有什么关系？",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11115524,
                                },
                            },
                            {
                                id: 12020503,
                                text: "切萨雷正是当年那架迫降飞艇的另一名军官幸存者，他在阿尔卡诺镇的废墟中救下了奄奄一息的艾达。而艾达，对他来说就成了战争中唯一的救赎。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11123840,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0033",
                        type: 3,
                    },
                    {
                        id: 120206,
                        name: "「星星」斯黛拉",
                        contents: [
                            {
                                id: 12020601,
                                text: "胆小、爱哭、喜欢担心的小姑娘。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12020602,
                                text: "斯黛拉心里藏着一个令她恐惧的秘密，这也是她经常哭泣的理由之一。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11108949,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0034",
                        type: 3,
                    },
                    {
                        id: 120207,
                        name: "「太阳」艾利欧",
                        contents: [
                            {
                                id: 12020701,
                                text: "活泼的小男孩，对我的军团生活充满好奇。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0035",
                        type: 3,
                    },
                ],
                unlock: 11020101,
            },
            {
                id: "Ex02_Character_1203",
                name: "阿尔卡诺镇的镇民·其二",
                clues: [
                    {
                        id: 120208,
                        name: "「月亮」赛琳娜",
                        contents: [
                            {
                                id: 12020801,
                                text: "乖巧懂事的小姑娘，总是与斯黛拉和艾利欧一起行动。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0036",
                        type: 3,
                    },
                    {
                        id: 120209,
                        name: "「女皇」特蕾莎",
                        contents: [
                            {
                                id: 12020901,
                                text: "温柔的妇人，擅长各种家务，厨艺高超。不仅在自己的院子里种了菜，还在家中养了一些鸽子。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12020902,
                                text: "特蕾莎在“乐园巡游”的游戏中出局后，自杀身亡。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11116601,
                                },
                            },
                            {
                                id: 12020903,
                                text: "特蕾莎本是一位家庭主妇，追寻失踪的丈夫弗里德来到了阿尔卡诺山。她早就受不了乐园镇的生活，终于在近日下定决心，将求救信绑在自己养的鸽子腿上向外求助，可惜她的鸽子被山中的猛禽捕食，直到最后，也没将求救信送出去。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000134,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0037",
                        type: 3,
                    },
                    {
                        id: 120210,
                        name: "「魔鬼」亚蒙",
                        contents: [
                            {
                                id: 12021001,
                                text: "严厉的老人，语气虽然凶狠，但言语中还是透露着对他人的关心。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0038",
                        type: 3,
                    },
                    {
                        id: 120211,
                        name: "「恋人」维娜",
                        contents: [
                            {
                                id: 12021101,
                                text: "妩媚的少女，好奇我与法露茜的关系。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0039",
                        type: 3,
                    },
                    {
                        id: 120212,
                        name: "「魔术师」莫甘娜",
                        contents: [
                            {
                                id: 12021201,
                                text: "擅长手工与机械的年轻女子，心灵手巧。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12021202,
                                text: "在“乐园巡游”的游戏中怀疑特蕾莎，致使其出局。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11115003,
                                },
                            },
                            {
                                id: 12021203,
                                text: "本名凯瑟琳，是民俗学者伍德维尔的学生。她早就摆脱了药剂的影响，但还是用心扮演着「魔术师」莫甘娜，只为寻得一个最稳妥，最安全的逃跑时机。此前将怀疑方向引向特蕾莎，应是出于保护老师的缘故。为了自己与老师的安全，她冷静到甚至有些冷血。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000135,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0040",
                        type: 3,
                    },
                    {
                        id: 120213,
                        name: "「教皇」桑克图斯",
                        contents: [
                            {
                                id: 12021301,
                                text: "虔诚的中年男子，将兔妈妈视作神明。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12021302,
                                text: "桑克图斯在外面受尽了索拉之民的压迫，最终在乐园获得了唯一的容身之处，因此对兔妈妈无比忠诚，甚至愿意为了她付出生命。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11118913,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0041",
                        type: 3,
                    },
                    {
                        id: 120214,
                        name: "「命运之轮」卡尔玛",
                        contents: [
                            {
                                id: 12021401,
                                text: "神神叨叨的青年，总是说着一些让人听不懂的话。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12021402,
                                text: "卡尔玛本是一位一无所有的流浪汉，他也早就受够了「命运之轮」高深莫测、神神秘秘的说话方式。逃离兔妈妈的掌控后，他的情绪得到了彻底的爆发。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000138,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0042",
                        type: 3,
                    },
                ],
                unlock: 11020302,
            },
            {
                id: "Ex02_Character_1204",
                name: "阿尔卡诺镇的镇民·其三",
                clues: [
                    {
                        id: 120215,
                        name: "「正义」加斯图斯",
                        contents: [
                            {
                                id: 12021501,
                                text: "严厉的中年男子，反复强调着乐园镇的规则。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12021502,
                                text: "加斯图斯曾是一位受雇于人的杀手，在外界失去了立足之处，最终在乐园重获新生。无论如何，他都不会背叛兔妈妈。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11118917,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0043",
                        type: 3,
                    },
                    {
                        id: 120216,
                        name: "「倒吊人」伊萨克",
                        contents: [
                            {
                                id: 12021601,
                                text: "热情的老人，并不负责阿尔卡诺镇的什么事物，看起来总是十分悠闲。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12021602,
                                text: "本名伍德维尔，是伊瑟尔的一位民俗学者。他带着自己的学生凯瑟琳来到阿尔卡诺山进行考察，却被兔妈妈囚禁，只得在乐园镇中扮演「倒吊人」。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000135,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0044",
                        type: 3,
                    },
                    {
                        id: 120217,
                        name: "「塔」安比修",
                        contents: [
                            {
                                id: 12021701,
                                text: "看上去有些呆傻的青年，衣服上还带有神弃者同盟的标志，不知道他与神弃者同盟是什么关系。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12021702,
                                text: "经过审问，军团初步判断他确实是神弃者同盟的成员之一，只是由于切萨雷的药物而彻底失去了记忆。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000137,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0045",
                        type: 3,
                    },
                    {
                        id: 120218,
                        name: "「隐士」塔西",
                        contents: [
                            {
                                id: 12021801,
                                text: "沉默的老妇人，很难沟通。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12021802,
                                text: "塔西原名珍妮，几年前因为与他人斗气打赌，而来到了阿尔卡诺山。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000139,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0046",
                        type: 3,
                    },
                    {
                        id: 120219,
                        name: "「死神」菲尼斯",
                        contents: [
                            {
                                id: 12021901,
                                text: "我只听到过这个名字，并未在阿尔卡诺镇见过他。想来他就是法露茜看到的，被艾达无情杀死的镇民。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11121420,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0047",
                        type: 3,
                    },
                    {
                        id: 120220,
                        name: "「节制」门苏拉",
                        contents: [
                            {
                                id: 12022001,
                                text: "一丝不苟的中年妇女，有些强迫行为。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11106506,
                                },
                            },
                            {
                                id: 12022002,
                                text: "经过审问，她受切萨雷的药物影响十分严重，已经完全失去了进入阿尔卡诺山之前的记忆。",
                                trigger: {
                                    type: "Resource",
                                    id: 2000136,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0048",
                        type: 3,
                    },
                    {
                        id: 120221,
                        name: "「愚者」乔伊",
                        contents: [
                            {
                                id: 12022101,
                                text: "乐园巡游的游戏中，富尔维斯突然跟着兔妈妈现身在庆典现场。但所有人都说他不是富尔维斯，而是一直生活在乐园镇的「愚者」乔伊。他看到我与法露茜之后的反应与行动也确实不像我印象中的富尔维斯。",
                                trigger: {
                                    type: "Dialogue",
                                    id: 11115209,
                                },
                            },
                        ],
                        pic1: "T_StringBoard_Main_0004",
                        pic2: "T_StringBoard_Main_0049",
                        type: 3,
                    },
                ],
                unlock: 11020302,
            },
        ],
    },
]
