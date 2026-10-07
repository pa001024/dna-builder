/**
 * 剧情回顾：页 → 列（时间轴列）→ 主线 / 支线条目。
 *
 * 由 `tools/import-i18n-data.ts` 从 i18n 导出的 Review.json 生成，请勿手动修改；
 * 数据更新请运行 `bun tools/import-i18n-data.ts -f Review`。
 * 文本只有简体中文一套，界面显示时经 `gt()` 走译文对照表。
 */

/** 一条剧情回顾条目（时间轴上的一次经历） */
export interface Review {
    id: number
    name: string
    content?: string
    pic1?: string
    pic2?: string
    type?: number
    questChainId?: number
    unlock?: number
    finish?: number
}

/** 回顾页的一列：同一时间节点上的主线与支线条目 */
export interface ReviewChain {
    id: number
    column: number
    main: Review[]
    side: Review[]
    firstShow?: number
    prev?: number
}

/** 回顾页（一章剧情） */
export interface ReviewPage {
    id: number
    episodeName?: string
    chains: ReviewChain[]
}

export const reviewData: ReviewPage[] = [
    {
        id: 1,
        episodeName: "第22只乐园的白兔",
        chains: [
            {
                id: 110201,
                column: 0,
                main: [
                    {
                        id: 1001,
                        name: "猎人与白兔",
                        content:
                            "来到阿尔卡诺山不久我便遇到了山中小镇的居民艾达与伯纳德，他们告诉我阿尔卡诺山就是我的故乡，我真正的名字则是「战车」维克托。\n虽然没有关于这里与维克托的记忆，但也许到了镇上我能想起些什么。现在先跟着艾达回到阿尔卡诺镇，收集富尔维斯与触媒的情报之后再做下一步打算把。",
                        pic2: "T_StringBoard_Main_0050",
                        type: 1,
                        questChainId: 110201,
                        unlock: 11020101,
                        finish: 11020102,
                    },
                ],
                side: [],
                firstShow: 11020101,
            },
            {
                id: 110202,
                column: 1,
                main: [
                    {
                        id: 1002,
                        name: "阿尔卡诺镇废墟",
                        content:
                            "进山之后我开始感到一阵一阵的头晕，艾达看出了我的不适，带我来到一座废弃的游乐园休息了一会儿。从她的口中得知，这座游乐园便是过去的阿尔卡诺镇，如今已经很少有人会来这里游玩，大都生活在兔妈妈重建后的新阿尔卡诺镇之中。\n在出发前往这座新的阿尔卡诺镇之前，我们听到废墟中传来了几声枪响。",
                        pic2: "T_StringBoard_Main_0051",
                        type: 1,
                        questChainId: 110201,
                        unlock: 11020102,
                        finish: 11020104,
                    },
                ],
                side: [],
                prev: 110201,
            },
            {
                id: 110203,
                column: 2,
                main: [
                    {
                        id: 1003,
                        name: "废墟中的枪响",
                        content: "枪声是一场策划好的伏击，虽然受了些伤，但总算制服了伏击者法露茜。保险起见，不能让她脱离我的视线。",
                        pic2: "T_StringBoard_Main_0052",
                        type: 1,
                        questChainId: 110201,
                        unlock: 11020104,
                        finish: 11020104,
                    },
                ],
                side: [],
                prev: 110202,
            },
            {
                id: 110204,
                column: 3,
                main: [
                    {
                        id: 1004,
                        name: "阿尔卡诺山裂隙",
                        content:
                            "山中的裂隙遍布秽兽与污染的湖水，好在法露茜找到了还能使用的军团炮台，大大减轻了来自秽兽的压力。借着艾达修好的过山车轨道，我们总算能渡过湖泊。\n秽兽从轨道旁发起了偷袭，将法露茜扑进了湖里。\n她还不能死在这里。",
                        pic2: "T_StringBoard_Main_0053",
                        type: 1,
                        questChainId: 110202,
                        unlock: 11020104,
                        finish: 11020201,
                    },
                ],
                side: [
                    {
                        id: 1005,
                        name: "奇怪的梦",
                        content:
                            "我做了一个梦，梦中的艾达完全不像白天的样子，看起来危险而诡异。法露茜苏醒后与我交换了一些情报，最后告诉我艾达十分可疑——法露茜曾亲眼看到艾达杀人。难道刚才的梦是在预示着什么吗……",
                        pic2: "T_StringBoard_Main_0054",
                        type: 1,
                        questChainId: 110203,
                        unlock: 11020301,
                        finish: 11020301,
                    },
                ],
                prev: 110203,
            },
            {
                id: 110205,
                column: 4,
                main: [
                    {
                        id: 1006,
                        name: "乐园镇",
                        content:
                            "我们终于跟着艾达来到了重建后的阿尔卡诺镇。这里的居民十分热情，并且都在为明日举行的“乐园巡游”庆典做准备。\n“乐园巡游”是什么，小镇是如何在短短几年重建成这样的规模？触媒藏在哪里，以及——这里真的是我的故乡吗？\n情报还是太少了，在镇子上四处转转，多了解一下这里吧。",
                        pic2: "T_StringBoard_Main_0055",
                        type: 1,
                        questChainId: 110203,
                        unlock: 11020301,
                        finish: 11020302,
                    },
                ],
                side: [],
                prev: 110204,
            },
            {
                id: 110206,
                column: 5,
                main: [
                    {
                        id: 1007,
                        name: "胡桃夹子",
                        content:
                            "我们在镇上遇到了一些损坏的玩具，和它们的制作者「魔术师」莫甘娜。她似乎是我曾经的老师之一，教过我怎么制作这些名叫胡桃夹子的玩具。我对这些事还是没什么印象，但胡桃夹子的耳朵还是蛮可爱的。",
                        pic1: "T_StringBoard_Main_0056",
                        pic2: "T_StringBoard_Main_0057",
                        type: 1,
                        questChainId: 110211,
                        unlock: 11020302,
                        finish: 110211,
                    },
                    {
                        id: 1008,
                        name: "记忆片段",
                        content:
                            "在阿尔卡诺山，我的头痛更加频繁，甚至看到了一些走马灯幻觉。\n我不仅看到了富尔维斯的幻影，还看到了一些我过去生活在这里的片段——那便是我还是“维克托”之时的记忆吗？",
                        pic1: "T_StringBoard_Main_0058",
                        pic2: "T_StringBoard_Main_0059",
                        type: 1,
                        questChainId: 110212,
                        unlock: 11020302,
                        finish: 110212,
                    },
                    {
                        id: 1009,
                        name: "阿尔卡诺镇仓库",
                        content:
                            "在乐园镇的仓库附近，我遇到了「月亮」赛琳娜、「太阳」艾利欧与「星星」斯黛拉，并与这三个孩子一起玩了名叫贪吃鬼的游戏。\n我跟他们分享了一些这些年在学校和军团的经历，他们反倒关心起我来，兴许是我讲的故事过于沉重。\n另外法露茜在仓库里发现了很多一模一样的复制品，很可能都是触媒的造物。除此之外没什么值得注意的东西了。",
                        pic1: "T_StringBoard_Main_0020",
                        pic2: "T_StringBoard_Main_0021",
                        type: 1,
                        questChainId: 110213,
                        unlock: 11020302,
                        finish: 110213,
                    },
                    {
                        id: 1010,
                        name: "艾达的异常",
                        content:
                            "「教皇」桑克图斯委托我和艾达去阿尔卡诺山的林子中拿一下装饰，这个过程并不复杂，但艾达非要在中途与我们玩一个游戏。\n游戏结束，艾达看起来有些伤感，似乎这里的人因为某些缘故很难离开阿尔卡诺山。",
                        pic1: "T_StringBoard_Main_0024",
                        pic2: "T_StringBoard_Main_0063",
                        type: 1,
                        questChainId: 110214,
                        unlock: 11020302,
                        finish: 110214,
                    },
                    {
                        id: 1011,
                        name: "俯瞰小镇",
                        content:
                            "为了了解乐园镇的全貌，我们坐上了镇里的摩天轮，从高处俯瞰小镇，能更加清晰地感受到整个小镇的安宁与和谐，人们彼此互帮互助，共同为了明天的庆典而奔走，这是军团生活中很难看到的温馨景象。",
                        pic1: "T_StringBoard_Main_0064",
                        pic2: "T_StringBoard_Main_0065_2",
                        type: 1,
                        questChainId: 110215,
                        unlock: 11020302,
                        finish: 110215,
                    },
                ],
                side: [],
                prev: 110205,
            },
            {
                id: 110207,
                column: 6,
                main: [
                    {
                        id: 1014,
                        name: "乐园的盛宴",
                        content:
                            "加斯图斯领着我们回到镇子吃晚饭。镇长切萨雷给了我几张过去在阿尔卡诺镇生活的照片，随后我便被热情的人群簇拥到了桌前，受到了大家热情的欢迎……\n后来发生了什么，我便记不太清了。",
                        pic2: "T_StringBoard_Main_0068",
                        type: 1,
                        questChainId: 110220,
                        unlock: 11022000,
                        finish: 11022001,
                    },
                ],
                side: [
                    {
                        id: 1013,
                        name: "无法靠近的房间",
                        content:
                            "「女皇」特蕾莎拜托我们给「正义」加斯图斯送几瓶酒过去，最终我们在酣梦池附近碰到了加斯图斯，但加斯图斯看到我们的反应却十分古怪，他大声斥责艾达为什么要把我带到酣梦池附近，又让艾达背诵小镇的规则。\n没有镇长允许，任何人都不能靠近酣梦池吗？这座建筑内部隐藏着什么？有机会的话再来调查一下吧。",
                        pic2: "T_StringBoard_Main_0067",
                        type: 1,
                        questChainId: 110220,
                        unlock: 1102200101,
                        finish: 1102200101,
                    },
                ],
                prev: 110206,
            },
            {
                id: 110208,
                column: 7,
                main: [
                    {
                        id: 1012,
                        name: "熟悉而陌生的房间",
                        content:
                            "据镇长切萨雷所说，这里就是我曾经的家。虽然各种物品堆放得有些杂乱，但仍能看出有人帮我用心打扫过的痕迹，他们一直都在等着我回到小镇的这一天吗？",
                        pic2: "T_StringBoard_Main_0066",
                        type: 1,
                        questChainId: 110220,
                        unlock: 11022001,
                        finish: 11022002,
                    },
                ],
                side: [],
                prev: 110207,
            },
            {
                id: 110209,
                column: 8,
                main: [
                    {
                        id: 1015,
                        name: "战争的痕迹",
                        content:
                            "与法露茜交换了一下手中的情报之后，我们决定再去昨天没去过的地方调查一番。在通过吊桥之后的森林中，我们发现了四年前迫降在此的军团飞艇，并在不远处的山洞中找到了当年飞艇中两名幸存者的痕迹。",
                        pic1: "T_StringBoard_Main_0069",
                        pic2: "T_StringBoard_Main_0025",
                        type: 1,
                        questChainId: 110221,
                        unlock: 11022002,
                        finish: 110221,
                    },
                    {
                        id: 1016,
                        name: "回收武器",
                        content:
                            "我们调查了当年的交战地点。在我找到一些闪光弹的时候，法露茜不小心踩到了未引爆的榴弹陷入了昏迷。好在那些榴弹的直接杀伤力不高，法露茜看起来只是受了些轻伤，对之后的行动应该不会产生太多影响。",
                        pic1: "T_StringBoard_Main_0071",
                        pic2: "T_StringBoard_Main_0072",
                        type: 1,
                        questChainId: 110222,
                        unlock: 11022002,
                        finish: 110222,
                    },
                ],
                side: [],
                prev: 110208,
            },
            {
                id: 110210,
                column: 9,
                main: [
                    {
                        id: 1017,
                        name: "乐园巡游",
                        content:
                            "所谓的“乐园巡游”比起庆典，更像是一场针对违反乐园规则之人的审判仪式。在庆典途中，我们意外看到了我们正在找的富尔维斯，但镇民都说他是镇上的原住民——「愚者」乔伊。富尔维斯看起来也与我之前熟知的他大不相同。\n法露茜试图向富尔维斯复仇，但她在强大的“兔妈妈”面前毫无还手之力。在兔妈妈和镇长的保护和监视下，我暂时无法对富尔维斯下手。\n法露茜被关押在酣梦池里，即将被镇长处决。法露茜是龙莎案的关键人证，她不能不明不白地死在这里。在这一关键时刻，艾达为我创造了前往酣梦池营救法露茜的机会。",
                        pic2: "T_StringBoard_Main_0073",
                        type: 1,
                        questChainId: 110231,
                        unlock: 11023100,
                        finish: 11023101,
                    },
                ],
                side: [],
                prev: 110209,
            },
            {
                id: 110211,
                column: 10,
                main: [
                    {
                        id: 1018,
                        name: "乐园的真相",
                        content:
                            "有了乔伊丢来的钥匙，我终于从酣梦池中救下了法露茜。带着法露茜离开时，我们闯进了一座墓园，而在墓园的墓碑上，我清晰地看到了属于所有镇民的墓碑，而维克托的墓碑也赫然在列。我并不是维克托，真正的维克托已经死在了四年前的战争中。\n此时镇长切萨雷与乔伊也来到了墓园。我得知了乐园的真相：原来所有镇民都被他和兔妈妈困在了阿尔卡诺镇，不得不陪他们进行一场扮演已死之人的游戏。\n在切萨雷要对我们动手的最后关头，乔伊——也就是失去记忆的富尔维斯站了出来，挡住了切萨雷的枪口。",
                        pic2: "T_StringBoard_Main_0074",
                        type: 1,
                        questChainId: 110231,
                        unlock: 11023101,
                        finish: 11023102,
                    },
                ],
                side: [],
                prev: 110210,
            },
            {
                id: 110212,
                column: 11,
                main: [
                    {
                        id: 1019,
                        name: "逃离乐园",
                        content:
                            "经过这些天的连续变故，法露茜身上的伤越来越重了。必须带着她活着离开这里。\n艾达为我们断后，她向我们保证，因为某种特殊的原因，兔妈妈绝不会伤害她。",
                        pic2: "T_StringBoard_Main_0075",
                        type: 1,
                        questChainId: 110231,
                        unlock: 11023102,
                        finish: 11023104,
                    },
                ],
                side: [],
                prev: 110211,
            },
            {
                id: 110213,
                column: 12,
                main: [
                    {
                        id: 1020,
                        name: "重回乐园",
                        content: "安顿好法露茜之后，该回去营救艾达，结束这场荒谬的游戏了。",
                        pic2: "T_StringBoard_Main_0076",
                        type: 1,
                        questChainId: 110232,
                        unlock: 11023104,
                        finish: 11023201,
                    },
                ],
                side: [],
                prev: 110212,
            },
            {
                id: 110214,
                column: 13,
                main: [
                    {
                        id: 1021,
                        name: "伊薇与艾达",
                        content:
                            "不愿再度屈服的艾达挺身反抗兔妈妈，并为自己取了全新的名字——伊薇。\n在打败兔妈妈、成功救下伊薇，并帮助其他镇民逃出乐园镇后，我看到了兔妈妈面具下，那张与伊薇一模一样的脸……原来兔妈妈才是真正的艾达，而伊薇则是她的复制体。",
                        pic2: "T_StringBoard_Main_0077",
                        type: 1,
                        questChainId: 110232,
                        unlock: 11023201,
                        finish: 11023203,
                    },
                ],
                side: [],
                prev: 110213,
            },
            {
                id: 110215,
                column: 14,
                main: [
                    {
                        id: 1022,
                        name: "富尔维斯",
                        content:
                            "富尔维斯一直在假装失忆。他将计就计伪装成乔伊，暗中帮助我，七亩地正是希望我与兔妈妈拼得两败俱伤，好让他能轻松控制兔妈妈，得到真正的触媒。\n但是在此之前，我便已经和维吉尔商定好了对策。",
                        pic2: "T_StringBoard_Main_0078",
                        type: 1,
                        questChainId: 110232,
                        unlock: 11023203,
                        finish: 11023204,
                    },
                ],
                side: [],
                prev: 110214,
            },
            {
                id: 110216,
                column: 15,
                main: [
                    {
                        id: 1023,
                        name: "乐园的终结",
                        content: "富尔维斯的阴谋被挫败，兔妈妈也和镇长一起走入了废墟深处……阿尔卡诺山的乐园就此闭幕。",
                        pic2: "T_StringBoard_Main_0079",
                        type: 3,
                        questChainId: 110232,
                        unlock: 11023204,
                        finish: 11023205,
                    },
                ],
                side: [
                    {
                        id: 1024,
                        name: "乐园的过去",
                        content:
                            "我打开了之前在酣梦池看到的无法开启的箱子，找到了镇长切萨雷留下的一些物品，他在日记中清楚地记下了他所经历的战争，以及乐园镇的由来。",
                        pic2: "T_StringBoard_Main_0080",
                        type: 2,
                        questChainId: 110233,
                        unlock: 11023205,
                        finish: 110233,
                    },
                ],
                prev: 110215,
            },
        ],
    },
]
