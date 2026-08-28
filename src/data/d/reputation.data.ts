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
                name: "日常的委托",
                desc: "你就是……狩月人？是这样的，我想收购一些当地特产，但我很忙，没空一个个去买，所以他们推荐我来找你，报酬的事情都好说，但这批货我一定要搞到。",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010011, 6],
                    ["Resource", 4010010, 10],
                ],
            },
            {
                id: 10002,
                name: "日常的委托",
                desc: "妈妈每次路过商店都说会买给我，上次说是一天做两份工，这次说是好好照顾妹妹，可是一次都没有兑现，好想要啊……如果有人能送给我就好了。",
                icon: "T_Fame_Head01",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010011, 6],
                    ["Resource", 4010005, 10],
                ],
            },
            {
                id: 10003,
                name: "日常的委托",
                desc: "丈夫吗？前几年出门了，可能是被秽兽袭击，也可能是人，总之，再也没回来。我不是想说这些来博取你的同情，只是在等物资的时候随便和你聊聊天罢了。",
                icon: "T_Fame_Head03",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010011, 6],
                    ["Resource", 4020003, 10],
                ],
            },
            {
                id: 10004,
                name: "日常的委托",
                desc: "那些东西很奇妙，是吧？你不这么觉得吗？我花了大半辈子去研究它们，现在哪怕闭着眼、只是闻到味道，我都能说出你带给我的东西是什么。",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010010, 10],
                    ["Resource", 4010008, 10],
                ],
            },
            {
                id: 10005,
                name: "日常的委托",
                desc: "华丽的首饰珠宝我已经看厌了，我的生活需要一些新鲜玩意，我同时委托了异国来的商人，流浪的吟游诗人以及你，希望你们都能给我带来更多的惊喜。",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010010, 10],
                    ["Resource", 4010004, 10],
                ],
            },
            {
                id: 10006,
                name: "日常的委托",
                desc: "我一直在工厂里工作，说什么累不累的，日子也得照过。听说狩月人这份工作挺赚钱的，就是有点危险，所以你呢，你为什么成为狩月人？你又怎么证明你是个厉害的狩月人？",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20001, 100],
                    ["Resource", 20012, 400],
                ],
            },
            {
                id: 10007,
                name: "日常的委托",
                desc: "这个、这个、还有这个！我全都要！钱？记在账上找我爸爸要就好了~总之那些东西你得给我找到！",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20003, 100],
                    ["Resource", 20005, 400],
                ],
            },
            {
                id: 10008,
                name: "日常的委托",
                desc: "唔……我没醉！我以前啊，也是名头响当当的狩月人！你说你也是？切~我不信~如果你能在……唔……三个小时内搞到这批材料，我就认可你的能力！",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20004, 100],
                    ["Resource", 20011, 400],
                ],
            },
            {
                id: 10009,
                name: "日常的委托",
                desc: "咳咳~我宣布，我要制作一个排名榜单，然后邀请学校里所有的朋友一起投票选出冰湖城里最厉害的狩月人！你想参与吗？去找些东西证明你的能力怎么样？我会在大家投票的时候多说你的好话哦~",
                icon: "T_Fame_Head03",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20009, 400],
                    ["Resource", 20014, 50],
                ],
            },
            {
                id: 10010,
                name: "紧要的委托",
                desc: "冰湖城最近深夜的冷风总是来势汹汹，温室里的花也显得垂头丧气，这样会让来取货的夫人们不满意的，如果可以的话，能不能麻烦您去野外取些新鲜的花束，我再把它们和店里的花包在一起给他们送过去。",
                icon: "T_Fame_Head03",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20002, 600],
                    ["Resource", 20019, 50],
                ],
            },
            {
                id: 10011,
                name: "紧要的委托",
                desc: "我至今还是没能忘记那迷人的身影……我想给她送去一些独特的东西，不是出自我的果园，而是更加野生的特产之类的，你们狩月人应该有办法吧，希望她会喜欢……",
                icon: "T_Fame_Head02",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20012, 600],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 10012,
                name: "紧要的委托",
                desc: "啊……好想睡觉……但是那些商户们总在给我出难题，说要在店里卖什么当地特产之类的，我怎么知道在哪里可以搞到？你有办法吗？",
                icon: "T_Fame_Head04",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20006, 10],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 10013,
                name: "紧要的委托",
                desc: "最近修普诺斯之家又收留了一些可怜的孩子，需要操心的地方也更多了，有的孩子想和我一起出去走走，趁着还没倒下之前多看看外面的世界，可我实在分身乏力。所以我想，可以请你帮我带一些外面的东西回来吗？或许会让孩子们的心里好受些。",
                icon: "T_Fame_Head03",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20022, 10],
                    ["Resource", 20020, 50],
                ],
            },
            {
                id: 10014,
                name: "紧要的委托",
                desc: "我失去了灵感！像鱼儿失去了水！像花朵失去了芬芳！像恋人之间失去了爱！像死敌无法举起刀！所以！我拜托你！去带来一些更有新鲜感的东西吧！让我再度拾起自己的灵感，再度找回自己的创作能力！",
                icon: "T_Fame_Head01",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 20018, 50],
                ],
            },
            {
                id: 10015,
                name: "友人的委托",
                desc: "那些卖假酒的家伙就像苍蝇一样，赶走一批总会再来另外一批……你说你可以帮我？不必，这些不入流的家伙交给我就好。如果你真的想帮我做点什么……除了带好白，这件事交给你会比较妥当。",
                icon: "T_Head_Kami",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20004, 150],
                    ["Resource", 4010011, 10],
                ],
            },
            {
                id: 10016,
                name: "友人的委托",
                desc: "呃啊……山姆大叔的手又在淘垃圾桶的时候被划破了，早说了让他记得戴手套了！没办法啦，这件事只能来委托你帮忙了，拜托拜托，没有你真的不知道该交给谁做了~~~",
                icon: "T_Head_Maer",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20015, 150],
                    ["Resource", 4010010, 10],
                ],
            },
            {
                id: 10017,
                name: "友人的委托",
                desc: "你好呀，独角兽{性别：先生|小姐}，菲娜最近在画一本新的童话绘本，其中就有你的故事哦~不过在动笔之前，菲娜还有一件没有做完的事情……独角兽{性别：先生|小姐}，可以帮助菲娜吗？",
                icon: "T_Head_Feina",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20016, 150],
                    ["Resource", 4010004, 10],
                ],
            },
            {
                id: 10018,
                name: "友人的委托",
                desc: "奥特赛德明明答应过菲娜，下趟出门要带上菲娜的……骗子，独角兽{性别：先生|小姐}，菲娜可以和你一起出去吗？一定不会给你添麻烦的。",
                icon: "T_Head_Feina",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 4010005, 10],
                ],
            },
            {
                id: 10019,
                name: "友人的委托",
                desc: "你最近有看到威尔斯吗？他接了一个委托，但迟迟没有完成，人也不见了，我猜他大概是在哪间房子里喝晕过去了，现在委托人几次来催……算了，既然如此，不如你去把这份委托做完吧。",
                icon: "T_Head_Kami",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20025, 10],
                    ["Resource", 4020003, 10],
                ],
            },
            {
                id: 10020,
                name: "友人的委托",
                desc: "你最近有看到威尔斯吗？他接了一个委托，但迟迟没有完成，人也不见了，我猜他大概是在哪间房子里喝晕过去了，现在委托人几次来催……算了，既然如此，不如你去把这份委托做完吧。",
                icon: "T_Head_Kami",
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
                name: "日常的委托",
                desc: "年纪大了，腿脚不好，不知道有没有好心的后生仔帮我的忙，带些东西回来。",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010018, 6],
                    ["Resource", 4010019, 10],
                ],
            },
            {
                id: 11002,
                name: "日常的委托",
                desc: "娘不让我自己出去玩，说外面会有黑色的狴犴大人咬我，可是狴犴大人不都是好的吗？没办法啦，只能找找有没有大哥哥大姐姐能把东西带回来啦~",
                icon: "T_Fame_Head01",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010018, 6],
                    ["Resource", 4010015, 10],
                ],
            },
            {
                id: 11003,
                name: "日常的委托",
                desc: "香道，以材为本，以技制胜，可若是材料的选取上就出现空缺，纵有再强大的技艺也无法制出好香啊。",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010018, 6],
                    ["Resource", 4020006, 10],
                ],
            },
            {
                id: 11004,
                name: "日常的委托",
                desc: "没办法嘛，那批货全都被玄色狴犴掀了，下一批货出来还要等上几个月，客人那边催得又急，诶呀，只能麻烦你帮忙找点替代用的东西啦！",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010019, 10],
                    ["Resource", 4010016, 10],
                ],
            },
            {
                id: 11005,
                name: "日常的委托",
                desc: "咪咪喵喵，喵喵喵，咪咪……（似乎在说，给我东西！）",
                icon: "T_Head_Cat",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 4010019, 10],
                    ["Resource", 4010017, 10],
                ],
            },
            {
                id: 11006,
                name: "日常的委托",
                desc: "我想造个大家伙，要兼具华胥特色的同时，还要有我们机枢派密不外传的独特手艺，但是呢——我差点材料，嘿嘿~能不能麻烦你……",
                icon: "T_Fame_Head01",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20001, 100],
                    ["Resource", 20012, 400],
                ],
            },
            {
                id: 11007,
                name: "日常的委托",
                desc: "负责这些物资的织星客出海后迟迟没有归来，我们不知道他是出了什么意外还是其他原因，但需要这批物资的各家各户等不了了，如果你方便的话，能不能帮我们找一些回来？",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20003, 100],
                    ["Resource", 20005, 400],
                ],
            },
            {
                id: 11008,
                name: "日常的委托",
                desc: "连日山雨，地湿泥泞，机傀生锈，需要额外购入一批维修器材。",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20004, 100],
                    ["Resource", 20011, 400],
                ],
            },
            {
                id: 11009,
                name: "日常的委托",
                desc: "雇一名专业寻宝人需要不少银子呢，那还不如少花点钱找些稀奇玩意，转头卖给那些没见过市面的家伙。",
                icon: "T_Fame_Head02",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20009, 400],
                    ["Resource", 20014, 50],
                ],
            },
            {
                id: 11010,
                name: "日常的委托",
                desc: "山有木兮木有枝，心悦君兮……唔！没有没有，那批委托是我给自己下的，才不是要送给他……",
                icon: "T_Fame_Head03",
                exp: 20,
                weight: 20,
                items: [
                    ["Resource", 20002, 400],
                    ["Resource", 20019, 50],
                ],
            },
            {
                id: 11011,
                name: "紧要的委托",
                desc: "听闻氤园外的香料也别有一番特色，此次出访便是为了寻求一些新的栽培灵感，如果你能提供一些帮助，比如带来一些新东西那就最好了。",
                icon: "T_Fame_Head03",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20012, 450],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 11012,
                name: "紧要的委托",
                desc: "逍遥天地游，平生我自知，别问小生如何联系到你，且先为小生寻些宝物来吧！",
                icon: "T_Fame_Head02",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20006, 10],
                    ["Resource", 20017, 50],
                ],
            },
            {
                id: 11013,
                name: "紧要的委托",
                desc: "出了趟远门，回华胥后伙计们告诉我仓库里的香料少了大半，说是闹鬼了？不知全貌不予置评，不过少了的东西还是需要补上的，所以特意来此求助。",
                icon: "T_Fame_Head02",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20022, 10],
                    ["Resource", 20020, 50],
                ],
            },
            {
                id: 11014,
                name: "紧要的委托",
                desc: "有位外来的乘船客说，他们那边会在游船上卖东西呢，听着十分新鲜，我和哥哥弟弟三人商量了一下，便决定来买些好东西，也在船上买卖。",
                icon: "T_Fame_Head02",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 20018, 50],
                ],
            },
            {
                id: 11015,
                name: "紧要的委托",
                desc: "最近同福酒家的生意好得一塌糊涂啊！多亏了新出的菜品，但因着定价高了些，也收到了不少食客的差评，不管啦，要是价格低便要用上些劣质材料，那还不如多花些钱，用真材实料，你说是不是？",
                icon: "T_Fame_Head02",
                exp: 30,
                weight: 10,
                items: [
                    ["Resource", 20004, 100],
                    ["Resource", 4010018, 10],
                ],
            },
            {
                id: 11016,
                name: "友人的委托",
                desc: "此前虽然已经麻烦你许多，但华胥百废待兴，各方面还需要我出面操劳，有些事我不放心交给别人，只好来问问你，放心，百年春家大业大，不会在报酬上亏待你。",
                icon: "T_Head_Zhiliu",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20015, 150],
                    ["Resource", 4010019, 10],
                ],
            },
            {
                id: 11017,
                name: "友人的委托",
                desc: "小友，怎得看到我就急匆匆回避，难不成我是什么猛虎走兽？这次来寻你是有一特殊委托，若是你不出手，我倒是找不到可以帮忙的得力之人，酬劳吗？办完必定奉上。",
                icon: "T_Head_Qiu",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20016, 150],
                    ["Resource", 4010017, 10],
                ],
            },
            {
                id: 11018,
                name: "友人的委托",
                desc: "前几日回山外山，看到一名有趣的孩子，古板练武的样子和小时候的我有些相似，我想给他买些东西，奈何公务繁忙，脱不开身，可否麻烦你……若是你不愿，我便不叨扰了。",
                icon: "T_Head_Yuming",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20007, 10],
                    ["Resource", 4010015, 10],
                ],
            },
            {
                id: 11019,
                name: "友人的委托",
                desc: "哟！前几天不小心喝多了，在姑奶奶存放机傀的仓库里睡着了，谁知酒盖子没盖紧，酒水把那些木头块泡发了！姑奶奶现在正要找我麻烦呢，在被她逮到之前，只能来麻烦你了！",
                icon: "T_Head_Kezhou",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20025, 10],
                    ["Resource", 4020006, 10],
                ],
            },
            {
                id: 11020,
                name: "友人的委托",
                desc: "虽说大风九章改制，华胥民众也在逐步重拾兵刃，但疏武许久，除了少部分应天尉及飘零人外，擅武之人还不多。我想，若你可以帮忙，露两手教教他们，或许比我亲自过去更为合适。",
                icon: "T_Head_Zhiliu",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20026, 10],
                    ["Resource", 4010016, 10],
                ],
            },
            {
                id: 11021,
                name: "友人的委托",
                desc: "唐叔又带着山外山的孩子们做一些危险的机傀实验，这次炸伤的是他自己，下次呢？我实在不放心他，但山外山又没有几个正经做事的，上次让刻舟去看着，他居然跑去喝酒了，如果你可以来帮忙的话……",
                icon: "T_Head_Suyi",
                exp: 40,
                weight: 5,
                items: [
                    ["Resource", 20015, 100],
                    ["Resource", 4010019, 10],
                ],
            },
        ],
    },
]

export default reputationData
