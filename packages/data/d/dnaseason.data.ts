/** 升华旅程任务：desc 已在导入期解析为文案，目标与奖励保留裸 id。 */
export interface DnaSeasonQuest {
    id: number
    desc: string
    target: number
    targetIds: number[]
    rewardIds: number[]
    jumpUiId?: number
}

export interface DnaSeasonQuestPhase {
    phaseId: number
    index: number
    coreQuestId: number
    quests: DnaSeasonQuest[]
}

/** 委托副本引用：只保留 id 与界面图，名称/描述由 dungeonMap 运行期 join。 */
export interface DnaSeasonCommission {
    dungeonId: number
    ruleId: number
    sort: number
    image: string
}

export interface DnaSeason {
    id: number
    startTime: number
    endTime: number
    phaseCount: number
    phaseDuration: number[]
    eventId: number
    image: string
    questPhases: DnaSeasonQuestPhase[]
    commissions: DnaSeasonCommission[]
}

export interface DnaSeasonTierDropBonus {
    id: number
    rate: number
}

export interface DnaSeasonTier {
    id: number
    tierLevel: number
    name: string
    nameTier: string
    tips?: string
    monsterLevel: number
    unlockCondition?: number
    unlockText?: string
    dropBonus?: DnaSeasonTierDropBonus[]
}

export interface DnaSeasonBuffType {
    id: string
    desc: string
    icon: string
    smallIcon: string
}

export interface DnaSeasonBuffLevel {
    id: number
    seasonId: number
    type: string
    level: number
    cost: Record<string, number>
    dropBonusId: number
    dropBonusRate: number
}

export interface DnaSeasonDropBonus {
    id: number
    type: string
    params: number[]
}

export interface DnaSeasonResourceTab {
    id: number
    name: string
    resources: number[]
}

export interface DnaSeasonBagTab {
    id: number
    name: string
    maxItemNum: number
    fullToast?: string
}

export interface DnaSeasonStashTab {
    id: number
    name: string
    maxItemNum: number
    unlockCost?: Record<string, number>
}

export interface DnaSeasonCommissionTierItem {
    tierId: number
    dropRewards?: Record<string, number>
    dungeonRewards?: number[]
    dungeonRewardView: number
}

export interface DnaSeasonCommissionTier {
    ruleId: number
    tiers: DnaSeasonCommissionTierItem[]
}

/** 梦魇迷境 Boss：dungeonId / keyId / seasonDifficulty 均为裸 id，由 DB 运行期 join。 */
export interface DnaSeasonNestBoss {
    dungeonId: number
    keyId: number
    seasonDifficulty: number
}

export interface DnaSeasonEquipConstant {
    seasonId: number
    baseAffixReduce: number
    randomAffixReduce: number
}

export interface DnaSeasonGlobalConstants {
    DNASeasonSiftId: number
    DNASeasonTempBagMaxslot: number
    TalentTreeMobileVerticalOffset: number
    TalentTreeVerticalOffset: number
}

const rawSeasons: DnaSeason[] = [
    {
        id: 1,
        startTime: 1793498400,
        endTime: 1799658000,
        phaseCount: 1,
        phaseDuration: [2160],
        eventId: 102006,
        image: "T_Season_01_ImageQuest",
        questPhases: [
            {
                phaseId: 10200601,
                index: 1,
                coreQuestId: 1020060101,
                quests: [
                    {
                        id: 1020060101,
                        desc: "同时装备<H>4</>件<H>蓝色</>或以上品质的升华装备",
                        target: 1,
                        targetIds: [1020060028],
                        rewardIds: [1020060101],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060102,
                        desc: "在<H>“简单Ⅰ”</>或以上难度下完成<H>5</>次“驱离”或“避险”委托",
                        target: 5,
                        targetIds: [1020060001],
                        rewardIds: [1020060102],
                        jumpUiId: 164,
                    },
                    {
                        id: 1020060103,
                        desc: "升华等级达到<H>20</>级",
                        target: 1,
                        targetIds: [1020060006],
                        rewardIds: [1020060103],
                    },
                    {
                        id: 1020060104,
                        desc: "分解<H>20</>件<H>蓝色</>或以上品质的升华装备",
                        target: 20,
                        targetIds: [1020060011],
                        rewardIds: [1020060104],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060105,
                        desc: "为<H>蓝色</>及以上品质的升华装备镶嵌<H>1</>颗宝石",
                        target: 1,
                        targetIds: [1020060013],
                        rewardIds: [1020060105],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060106,
                        desc: "将<H>1</>件升华装备<H>精锻</>至<H>1</>级",
                        target: 1,
                        targetIds: [1020060016],
                        rewardIds: [1020060106],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060107,
                        desc: "通关“丰饶的迷境”<H>30</>层",
                        target: 1,
                        targetIds: [1020060018],
                        rewardIds: [1020060107],
                        jumpUiId: 169,
                    },
                    {
                        id: 1020060108,
                        desc: "累计消耗<H>4</>份旅程记录，提升旅程增益",
                        target: 4,
                        targetIds: [1020060044],
                        rewardIds: [1020060108],
                    },
                ],
            },
            {
                phaseId: 10200602,
                index: 2,
                coreQuestId: 1020060201,
                quests: [
                    {
                        id: 1020060201,
                        desc: "在梦魇迷境中击败<H>“困难Ⅱ”</>或以上难度的<H>炼火的典狱长</>",
                        target: 1,
                        targetIds: [1020060033],
                        rewardIds: [1020060201],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060202,
                        desc: "在<H>“普通Ⅰ”</>或以上难度下完成<H>5</>次“驱离”或“避险”委托",
                        target: 5,
                        targetIds: [1020060002],
                        rewardIds: [1020060202],
                        jumpUiId: 164,
                    },
                    {
                        id: 1020060203,
                        desc: "获得<H>3</>颗<H>二级</>宝石",
                        target: 3,
                        targetIds: [1020060040],
                        rewardIds: [1020060203],
                        jumpUiId: 167,
                    },
                    {
                        id: 1020060204,
                        desc: "升华等级达到<H>45</>级",
                        target: 1,
                        targetIds: [1020060007],
                        rewardIds: [1020060204],
                    },
                    {
                        id: 1020060205,
                        desc: "在梦魇迷境中击败<H>“困难Ⅰ”</>或以上难度的<H>西比尔</>",
                        target: 1,
                        targetIds: [1020060032],
                        rewardIds: [1020060205],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060206,
                        desc: "通关“丰饶的迷境”<H>60</>层",
                        target: 1,
                        targetIds: [1020060019],
                        rewardIds: [1020060206],
                        jumpUiId: 169,
                    },
                    {
                        id: 1020060207,
                        desc: "同时装备<H>7</>件<H>蓝色</>或以上品质的升华装备",
                        target: 1,
                        targetIds: [1020060029],
                        rewardIds: [1020060207],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060208,
                        desc: "分解<H>60</>件<H>蓝色</>或以上品质的升华装备",
                        target: 60,
                        targetIds: [1020060011],
                        rewardIds: [1020060208],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060209,
                        desc: "镶嵌<H>3</>颗宝石",
                        target: 3,
                        targetIds: [1020060013],
                        rewardIds: [1020060209],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060210,
                        desc: "淬炼<H>1</>次升华装备",
                        target: 1,
                        targetIds: [1020060024],
                        rewardIds: [1020060210],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060211,
                        desc: "附魔<H>2</>次升华装备",
                        target: 2,
                        targetIds: [1020060026],
                        rewardIds: [1020060211],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060212,
                        desc: "累计消耗<H>8</>份旅程记录，提升旅程增益",
                        target: 8,
                        targetIds: [1020060045],
                        rewardIds: [1020060212],
                    },
                ],
            },
            {
                phaseId: 10200603,
                index: 3,
                coreQuestId: 1020060301,
                quests: [
                    {
                        id: 1020060301,
                        desc: "在梦魇迷境中击败<H>“挑战Ⅲ”</>或以上难度的<H>雪国的野兽</>",
                        target: 1,
                        targetIds: [1020060035],
                        rewardIds: [1020060301],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060302,
                        desc: "在<H>“困难Ⅰ”</>或以上难度下完成<H>10</>次“驱离”或“避险”委托",
                        target: 10,
                        targetIds: [1020060003],
                        rewardIds: [1020060302],
                        jumpUiId: 164,
                    },
                    {
                        id: 1020060303,
                        desc: "获得<H>3</>颗任意<H>三级</>宝石",
                        target: 3,
                        targetIds: [1020060041],
                        rewardIds: [1020060303],
                        jumpUiId: 167,
                    },
                    {
                        id: 1020060304,
                        desc: "升华等级达到<H>60</>级",
                        target: 1,
                        targetIds: [1020060008],
                        rewardIds: [1020060304],
                    },
                    {
                        id: 1020060305,
                        desc: "在梦魇迷境中击败<H>“挑战Ⅱ”</>或以上难度的<H>羽化者</>",
                        target: 1,
                        targetIds: [1020060034],
                        rewardIds: [1020060305],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060306,
                        desc: "同时装备<H>7</>件<H>金色</>或以上品质的升华装备",
                        target: 1,
                        targetIds: [1020060030],
                        rewardIds: [1020060306],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060307,
                        desc: "将<H>5</>件升华装备<H>精锻</>至<H>5</>级",
                        target: 5,
                        targetIds: [1020060017],
                        rewardIds: [1020060307],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060308,
                        desc: "淬炼<H>2</>次<H>金色</>或以上品质的升华装备",
                        target: 2,
                        targetIds: [1020060025],
                        rewardIds: [1020060308],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060309,
                        desc: "附魔<H>4</>次<H>金色</>或以上品质的升华装备",
                        target: 4,
                        targetIds: [1020060027],
                        rewardIds: [1020060309],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060310,
                        desc: "为<H>金色</>及以上品质的升华装备镶嵌<H>6</>颗<H>二级</>或以上等级的宝石",
                        target: 6,
                        targetIds: [1020060014],
                        rewardIds: [1020060310],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060311,
                        desc: "通关“丰饶的迷境”<H>100</>层",
                        target: 1,
                        targetIds: [1020060020],
                        rewardIds: [1020060311],
                        jumpUiId: 169,
                    },
                    {
                        id: 1020060312,
                        desc: "通关“荣耀的迷境”<H>100</>层",
                        target: 1,
                        targetIds: [1020060021],
                        rewardIds: [1020060312],
                        jumpUiId: 169,
                    },
                    {
                        id: 1020060313,
                        desc: "累计消耗<H>12</>份旅程记录，提升旅程增益",
                        target: 12,
                        targetIds: [1020060046],
                        rewardIds: [1020060313],
                    },
                ],
            },
            {
                phaseId: 10200604,
                index: 4,
                coreQuestId: 1020060401,
                quests: [
                    {
                        id: 1020060401,
                        desc: "通关“荣耀的迷境”<H>110</>层",
                        target: 1,
                        targetIds: [1020060022],
                        rewardIds: [1020060401],
                        jumpUiId: 169,
                    },
                    {
                        id: 1020060402,
                        desc: "在<H>“挑战Ⅳ”</>或以上难度下完成<H>10</>次“驱离”或“避险”委托",
                        target: 10,
                        targetIds: [1020060004],
                        rewardIds: [1020060402],
                        jumpUiId: 164,
                    },
                    {
                        id: 1020060403,
                        desc: "获得<H>1</>颗任意<H>四级</>宝石",
                        target: 1,
                        targetIds: [1020060042],
                        rewardIds: [1020060403],
                        jumpUiId: 167,
                    },
                    {
                        id: 1020060404,
                        desc: "升华等级达到<H>70</>级",
                        target: 1,
                        targetIds: [1020060009],
                        rewardIds: [1020060404],
                    },
                    {
                        id: 1020060405,
                        desc: "在梦魇迷境中击败<H>“挑战Ⅴ”</>或以上难度的<H>神秘怪物</>",
                        target: 1,
                        targetIds: [1020060036],
                        rewardIds: [1020060405],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060406,
                        desc: "在梦魇迷境中击败<H>“挑战Ⅴ”</>或以上难度的<H>「审判」兔妈妈</>",
                        target: 1,
                        targetIds: [1020060037],
                        rewardIds: [1020060406],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060407,
                        desc: "装备<H>1</>件<H>暗金</>品质的升华装备",
                        target: 1,
                        targetIds: [1020060031],
                        rewardIds: [1020060407],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060408,
                        desc: "淬炼<H>3</>次<H>金色</>或以上品质的升华装备",
                        target: 3,
                        targetIds: [1020060025],
                        rewardIds: [1020060408],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060409,
                        desc: "附魔<H>6</>次<H>金色</>或以上品质的升华装备",
                        target: 6,
                        targetIds: [1020060027],
                        rewardIds: [1020060409],
                        jumpUiId: 170,
                    },
                ],
            },
            {
                phaseId: 10200605,
                index: 5,
                coreQuestId: 1020060501,
                quests: [
                    {
                        id: 1020060501,
                        desc: "通关“荣耀的迷境”<H>120</>层",
                        target: 1,
                        targetIds: [1020060023],
                        rewardIds: [1020060501],
                        jumpUiId: 169,
                    },
                    {
                        id: 1020060502,
                        desc: "在<H>“挑战Ⅵ”</>或以上难度下完成<H>50</>次“驱离”或“避险”委托",
                        target: 50,
                        targetIds: [1020060005],
                        rewardIds: [1020060502],
                        jumpUiId: 164,
                    },
                    {
                        id: 1020060503,
                        desc: "获得<H>1</>颗<H>五级</>宝石",
                        target: 1,
                        targetIds: [1020060043],
                        rewardIds: [1020060503],
                        jumpUiId: 167,
                    },
                    {
                        id: 1020060504,
                        desc: "在梦魇迷境中击败<H>“挑战Ⅷ”</>或以上难度的<H>西比尔</>",
                        target: 1,
                        targetIds: [1020060038],
                        rewardIds: [1020060504],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060505,
                        desc: "在梦魇迷境中击败<H>“挑战Ⅷ”</>或以上难度的<H>雪国的野兽</>",
                        target: 1,
                        targetIds: [1020060039],
                        rewardIds: [1020060505],
                        jumpUiId: 165,
                    },
                    {
                        id: 1020060506,
                        desc: "为<H>蓝色</>及以上品质的升华装备镶嵌<H>10</>次<H>四级</>或以上等级的宝石",
                        target: 10,
                        targetIds: [1020060015],
                        rewardIds: [1020060506],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060507,
                        desc: "淬炼<H>4</>次<H>金色</>或以上品质的升华装备",
                        target: 4,
                        targetIds: [1020060025],
                        rewardIds: [1020060507],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060508,
                        desc: "附魔<H>8</>次<H>金色</>或以上品质的升华装备",
                        target: 8,
                        targetIds: [1020060027],
                        rewardIds: [1020060508],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060509,
                        desc: "分解<H>200</>件<H>金色</>或以上品质的升华装备",
                        target: 200,
                        targetIds: [1020060012],
                        rewardIds: [1020060509],
                        jumpUiId: 170,
                    },
                    {
                        id: 1020060510,
                        desc: "升华等级达到<H>85</>级",
                        target: 1,
                        targetIds: [1020060010],
                        rewardIds: [1020060510],
                    },
                ],
            },
        ],
        commissions: [
            {
                dungeonId: 24101,
                ruleId: 1,
                sort: 1,
                image: "T_Season_Depute_01",
            },
            {
                dungeonId: 24102,
                ruleId: 2,
                sort: 2,
                image: "T_Season_Depute_03",
            },
            {
                dungeonId: 24103,
                ruleId: 3,
                sort: 3,
                image: "T_Season_Depute_04",
            },
            {
                dungeonId: 24104,
                ruleId: 4,
                sort: 4,
                image: "T_Season_Depute_02",
            },
        ],
    },
]

const rawTiers: DnaSeasonTier[] = [
    {
        id: 1,
        tierLevel: 1,
        name: "简单",
        nameTier: "Ⅰ",
        tips: "·获取升华装备强度上限 <Highlight>5</>",
        monsterLevel: 100,
    },
    {
        id: 2,
        tierLevel: 1,
        name: "简单",
        nameTier: "Ⅱ",
        tips: "·获取升华装备强度上限 <Highlight>10</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 115,
    },
    {
        id: 3,
        tierLevel: 2,
        name: "普通",
        nameTier: "Ⅰ",
        tips: "·获取升华装备强度上限 <Highlight>15</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 130,
        unlockCondition: 29002,
        unlockText: "通关任意螺旋迷镜30层",
    },
    {
        id: 4,
        tierLevel: 2,
        name: "普通",
        nameTier: "Ⅱ",
        tips: "·获取升华装备强度上限 <Highlight>25</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 145,
        unlockCondition: 29003,
        unlockText: "通关任意螺旋迷镜45层",
    },
    {
        id: 5,
        tierLevel: 3,
        name: "困难",
        nameTier: "Ⅰ",
        tips: "·获取升华装备强度上限 <Highlight>35</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 165,
        unlockCondition: 29004,
        unlockText: "通关任意螺旋迷镜60层",
    },
    {
        id: 6,
        tierLevel: 3,
        name: "困难",
        nameTier: "Ⅱ",
        tips: "·获取升华装备强度上限 <Highlight>45</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 180,
        unlockCondition: 29005,
        unlockText: "通关任意螺旋迷镜80层",
    },
    {
        id: 7,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅰ",
        tips: "·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+40%</>\n·迷境古币获取量 <Highlight>+30%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+20%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 200,
        unlockCondition: 29006,
        unlockText: "通关任意螺旋迷镜100层",
        dropBonus: [
            {
                id: 2,
                rate: 3000,
            },
            {
                id: 3,
                rate: 4000,
            },
            {
                id: 4,
                rate: 2000,
            },
        ],
    },
    {
        id: 8,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅱ",
        tips: "富有挑战的难度，推荐对升华装备进行<Qua0>「精锻」</>\n推荐开始升级升华天赋中的<Qua0>高级节点</>\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+80%</>\n·迷境古币获取量 <Highlight>+60%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+40%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 208,
        unlockCondition: 29007,
        unlockText: "通关任意螺旋迷镜104层",
        dropBonus: [
            {
                id: 2,
                rate: 6000,
            },
            {
                id: 3,
                rate: 8000,
            },
            {
                id: 4,
                rate: 4000,
            },
        ],
    },
    {
        id: 9,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅲ",
        tips: "富有挑战的难度，推荐对升华装备进行<Qua0>「精锻」</>\n推荐开始升级升华天赋中的<Qua0>高级节点</>\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+120%</>\n·迷境古币获取量 <Highlight>+90%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+60%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 216,
        unlockCondition: 29008,
        unlockText: "通关任意螺旋迷镜108层",
        dropBonus: [
            {
                id: 2,
                rate: 9000,
            },
            {
                id: 3,
                rate: 12000,
            },
            {
                id: 4,
                rate: 6000,
            },
        ],
    },
    {
        id: 10,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅳ",
        tips: "富有挑战的难度，推荐对升华装备进行<Qua0>「精锻」</>\n推荐开始升级升华天赋中的<Qua0>高级节点</>\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+160%</>\n·迷境古币获取量 <Highlight>+120%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+80%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 224,
        unlockCondition: 29009,
        unlockText: "通关任意螺旋迷镜112层",
        dropBonus: [
            {
                id: 2,
                rate: 12000,
            },
            {
                id: 3,
                rate: 16000,
            },
            {
                id: 4,
                rate: 8000,
            },
        ],
    },
    {
        id: 11,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅴ",
        tips: "富有挑战的难度，推荐对升华装备进行<Qua0>「精锻」</>\n推荐开始升级升华天赋中的<Qua0>高级节点</>\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+200%</>\n·迷境古币获取量 <Highlight>+150%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+100%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 232,
        unlockCondition: 29010,
        unlockText: "通关任意螺旋迷镜116层",
        dropBonus: [
            {
                id: 2,
                rate: 15000,
            },
            {
                id: 3,
                rate: 20000,
            },
            {
                id: 4,
                rate: 10000,
            },
        ],
    },
    {
        id: 12,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅵ",
        tips: "极其富有挑战的难度，推荐对升华装备进行<Qua0>「淬炼」「精锻」</>和<Qua0>「镶嵌」</>\n推荐进一步升级升华天赋中的<Qua0>高级节点</>\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+240%</>\n·迷境古币获取量 <Highlight>+180%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+120%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 240,
        unlockCondition: 29011,
        unlockText: "通关任意螺旋迷镜120层",
        dropBonus: [
            {
                id: 2,
                rate: 18000,
            },
            {
                id: 3,
                rate: 24000,
            },
            {
                id: 4,
                rate: 12000,
            },
        ],
    },
    {
        id: 13,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅶ",
        tips: "极其富有挑战的难度，推荐对升华装备进行<Qua0>「淬炼」「精锻」</>和<Qua0>「镶嵌」</>\n推荐进一步升级升华天赋中的<Qua0>高级节点</>\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+280%</>\n·迷境古币获取量 <Highlight>+210%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+140%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 256,
        unlockCondition: 29012,
        unlockText: "通关任意螺旋迷镜124层",
        dropBonus: [
            {
                id: 2,
                rate: 21000,
            },
            {
                id: 3,
                rate: 28000,
            },
            {
                id: 4,
                rate: 14000,
            },
        ],
    },
    {
        id: 14,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅷ",
        tips: "极其富有挑战的难度，推荐对升华装备进行<Qua0>「淬炼」「精锻」</>和<Qua0>「镶嵌」</>\n推荐进一步升级升华天赋中的<Qua0>高级节点</>\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+320%</>\n·迷境古币获取量 <Highlight>+240%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+160%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 272,
        unlockCondition: 29013,
        unlockText: "通关任意螺旋迷镜128层",
        dropBonus: [
            {
                id: 2,
                rate: 24000,
            },
            {
                id: 3,
                rate: 32000,
            },
            {
                id: 4,
                rate: 16000,
            },
        ],
    },
    {
        id: 15,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅸ",
        tips: "几乎无法挑战的难度，推荐对升华装备进行<Qua0>「淬炼」「精锻」</>和<Qua0>「镶嵌」</>\n推荐进一步升级升华天赋中的<Qua0>高级节点</>\n推荐拥有数件<Qua0>升华词缀装备</>后尝试\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+360%</>\n·迷境古币获取量 <Highlight>+270%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+180%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 288,
        unlockCondition: 29014,
        unlockText: "通关任意螺旋迷镜132层",
        dropBonus: [
            {
                id: 2,
                rate: 27000,
            },
            {
                id: 3,
                rate: 36000,
            },
            {
                id: 4,
                rate: 18000,
            },
        ],
    },
    {
        id: 16,
        tierLevel: 4,
        name: "挑战",
        nameTier: "Ⅹ",
        tips: "完全无法挑战的难度，推荐对升华装备进行<Qua0>「淬炼」、最终「精锻」</>和<Qua0>「镶嵌」</>\n推荐完整升级升华天赋中的<Qua0>高级节点</>\n推荐拥有数件<Qua0>升华词缀装备</>后尝试\n·获取升华装备强度上限 <Highlight>50</>\n·升华经验获取量 <Highlight>+400%</>\n·迷境古币获取量 <Highlight>+300%</>\n·升华材料、精锻材料及流光之楔获取量 <Highlight>+200%</>\n·<Qua2>高品质装备</>掉落几率提升",
        monsterLevel: 304,
        unlockCondition: 29015,
        unlockText: "通关任意螺旋迷镜136层",
        dropBonus: [
            {
                id: 2,
                rate: 30000,
            },
            {
                id: 3,
                rate: 40000,
            },
            {
                id: 4,
                rate: 20000,
            },
        ],
    },
]

const rawBuffTypes: DnaSeasonBuffType[] = [
    {
        id: "EquipMaterial",
        desc: "装备材料及流光之楔获取量提升",
        icon: "T_Season_DropBuff_02",
        smallIcon: "T_Season_MiniDropBuff_02",
    },
    {
        id: "GemPiece",
        desc: "宝石碎片获取量提升",
        icon: "T_Season_DropBuff_01",
        smallIcon: "T_Season_MiniDropBuff_01",
    },
    {
        id: "SeasonCoin",
        desc: "迷境古币获取量提升",
        icon: "T_Season_DropBuff_05",
        smallIcon: "T_Season_MiniDropBuff_05",
    },
    {
        id: "SeasonExp",
        desc: "升华经验获取量提升",
        icon: "T_Season_DropBuff_03",
        smallIcon: "T_Season_MiniDropBuff_03",
    },
]

const rawBuffLevels: DnaSeasonBuffLevel[] = [
    {
        id: 101,
        seasonId: 1,
        type: "GemPiece",
        level: 1,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 1,
        dropBonusRate: 1500,
    },
    {
        id: 102,
        seasonId: 1,
        type: "GemPiece",
        level: 2,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 1,
        dropBonusRate: 3000,
    },
    {
        id: 103,
        seasonId: 1,
        type: "GemPiece",
        level: 3,
        cost: {
            "7000005": 2,
        },
        dropBonusId: 1,
        dropBonusRate: 4500,
    },
    {
        id: 104,
        seasonId: 1,
        type: "GemPiece",
        level: 4,
        cost: {
            "7000005": 3,
        },
        dropBonusId: 1,
        dropBonusRate: 6000,
    },
    {
        id: 111,
        seasonId: 1,
        type: "SeasonCoin",
        level: 1,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 2,
        dropBonusRate: 2000,
    },
    {
        id: 112,
        seasonId: 1,
        type: "SeasonCoin",
        level: 2,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 2,
        dropBonusRate: 4000,
    },
    {
        id: 113,
        seasonId: 1,
        type: "SeasonCoin",
        level: 3,
        cost: {
            "7000005": 2,
        },
        dropBonusId: 2,
        dropBonusRate: 6000,
    },
    {
        id: 114,
        seasonId: 1,
        type: "SeasonCoin",
        level: 4,
        cost: {
            "7000005": 3,
        },
        dropBonusId: 2,
        dropBonusRate: 8000,
    },
    {
        id: 121,
        seasonId: 1,
        type: "SeasonExp",
        level: 1,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 3,
        dropBonusRate: 2500,
    },
    {
        id: 122,
        seasonId: 1,
        type: "SeasonExp",
        level: 2,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 3,
        dropBonusRate: 5000,
    },
    {
        id: 123,
        seasonId: 1,
        type: "SeasonExp",
        level: 3,
        cost: {
            "7000005": 2,
        },
        dropBonusId: 3,
        dropBonusRate: 7500,
    },
    {
        id: 124,
        seasonId: 1,
        type: "SeasonExp",
        level: 4,
        cost: {
            "7000005": 3,
        },
        dropBonusId: 3,
        dropBonusRate: 10000,
    },
    {
        id: 131,
        seasonId: 1,
        type: "EquipMaterial",
        level: 1,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 4,
        dropBonusRate: 1500,
    },
    {
        id: 132,
        seasonId: 1,
        type: "EquipMaterial",
        level: 2,
        cost: {
            "7000005": 1,
        },
        dropBonusId: 4,
        dropBonusRate: 3000,
    },
    {
        id: 133,
        seasonId: 1,
        type: "EquipMaterial",
        level: 3,
        cost: {
            "7000005": 2,
        },
        dropBonusId: 4,
        dropBonusRate: 4500,
    },
    {
        id: 134,
        seasonId: 1,
        type: "EquipMaterial",
        level: 4,
        cost: {
            "7000005": 3,
        },
        dropBonusId: 4,
        dropBonusRate: 6000,
    },
]

const rawDropBonuses: DnaSeasonDropBonus[] = [
    {
        id: 1,
        type: "ResourceId",
        params: [7001001],
    },
    {
        id: 2,
        type: "ResourceId",
        params: [7000101],
    },
    {
        id: 3,
        type: "ResourceId",
        params: [7000000],
    },
    {
        id: 4,
        type: "ResourceId",
        params: [7000104, 7000105, 7000102, 7000103, 7000106],
    },
]

const rawResources: number[] = [
    5001, 5002, 5003, 7000000, 7000001, 7000002, 7000003, 7000004, 7000005, 7000101, 7000102, 7000103, 7000104, 7000105, 7000106, 7001001,
    7001101, 7001102, 7001103, 7001104, 7001105, 7001201, 7001202, 7001203, 7001204, 7001205, 7001301, 7001302, 7001303, 7001304, 7001305,
    7001401, 7001402, 7001403, 7001404, 7001405, 7001501, 7001502, 7001503, 7001504, 7001505, 7001601, 7001602, 7001603, 7001604, 7001605,
]

const rawResourceTabs: DnaSeasonResourceTab[] = [
    {
        id: 1,
        name: "基础材料",
        resources: [7000101, 7000002, 7000003, 7000004],
    },
    {
        id: 2,
        name: "精锻材料",
        resources: [7000102, 7000103, 7000104, 7000105],
    },
    {
        id: 3,
        name: "镶嵌物材料",
        resources: [7001001],
    },
]

const rawBagTabs: DnaSeasonBagTab[] = [
    {
        id: 1,
        name: "升华装备",
        maxItemNum: 30,
        fullToast: "升华装备已满",
    },
    {
        id: 2,
        name: "协战升华装备",
        maxItemNum: 30,
        fullToast: "协战升华装备已满",
    },
    {
        id: 3,
        name: "镶嵌物",
        maxItemNum: 30,
        fullToast: "镶嵌物已满",
    },
    {
        id: 4,
        name: "消耗品",
        maxItemNum: 30,
        fullToast: "消耗品已满",
    },
]

const rawStashTabs: DnaSeasonStashTab[] = [
    {
        id: 1,
        name: "仓库 ",
        maxItemNum: 50,
    },
    {
        id: 2,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 10000,
        },
    },
    {
        id: 3,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 40000,
        },
    },
    {
        id: 4,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 100000,
        },
    },
    {
        id: 5,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 250000,
        },
    },
    {
        id: 6,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 500000,
        },
    },
    {
        id: 7,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 1000000,
        },
    },
    {
        id: 8,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 2000000,
        },
    },
    {
        id: 9,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 5000000,
        },
    },
    {
        id: 10,
        name: "仓库 ",
        maxItemNum: 50,
        unlockCost: {
            "7000101": 10000000,
        },
    },
]

const rawCommissionTiers: DnaSeasonCommissionTier[] = [
    {
        ruleId: 1,
        tiers: [
            {
                tierId: 1,
                dropRewards: {
                    Default: 11001202,
                    "Mon.Advanced": 11001202,
                    "Mon.Boss": 11001202,
                    "Mon.Elite": 11001202,
                    "Mon.Reward.A": 11001202,
                    "Mon.Reward.AA": 11001202,
                    "Mon.Reward.B": 11001202,
                    "Mon.Reward.C": 11001202,
                    "Mon.Reward.D": 11001202,
                    "Mon.Reward.E": 11001202,
                    "Mon.Strong": 11001202,
                },
                dungeonRewards: [11001000],
                dungeonRewardView: 11001000,
            },
            {
                tierId: 2,
                dropRewards: {
                    Default: 11002202,
                    "Mon.Advanced": 11002202,
                    "Mon.Boss": 11002202,
                    "Mon.Elite": 11002202,
                    "Mon.Reward.A": 11002202,
                    "Mon.Reward.AA": 11002202,
                    "Mon.Reward.B": 11002202,
                    "Mon.Reward.C": 11002202,
                    "Mon.Reward.D": 11002202,
                    "Mon.Reward.E": 11002202,
                    "Mon.Strong": 11002202,
                },
                dungeonRewards: [11002000],
                dungeonRewardView: 11002000,
            },
            {
                tierId: 3,
                dropRewards: {
                    Default: 11003202,
                    "Mon.Advanced": 11003202,
                    "Mon.Boss": 11003202,
                    "Mon.Elite": 11003202,
                    "Mon.Reward.A": 11003202,
                    "Mon.Reward.AA": 11003202,
                    "Mon.Reward.B": 11003202,
                    "Mon.Reward.C": 11003202,
                    "Mon.Reward.D": 11003202,
                    "Mon.Reward.E": 11003202,
                    "Mon.Strong": 11003202,
                },
                dungeonRewards: [11003000],
                dungeonRewardView: 11003000,
            },
            {
                tierId: 4,
                dropRewards: {
                    Default: 11004202,
                    "Mon.Advanced": 11004202,
                    "Mon.Boss": 11004202,
                    "Mon.Elite": 11004202,
                    "Mon.Reward.A": 11004202,
                    "Mon.Reward.AA": 11004202,
                    "Mon.Reward.B": 11004202,
                    "Mon.Reward.C": 11004202,
                    "Mon.Reward.D": 11004202,
                    "Mon.Reward.E": 11004202,
                    "Mon.Strong": 11004202,
                },
                dungeonRewards: [11004000],
                dungeonRewardView: 11004000,
            },
            {
                tierId: 5,
                dropRewards: {
                    Default: 11005202,
                    "Mon.Advanced": 11005202,
                    "Mon.Boss": 11005202,
                    "Mon.Elite": 11005202,
                    "Mon.Reward.A": 11005202,
                    "Mon.Reward.AA": 11005202,
                    "Mon.Reward.B": 11005202,
                    "Mon.Reward.C": 11005202,
                    "Mon.Reward.D": 11005202,
                    "Mon.Reward.E": 11005202,
                    "Mon.Strong": 11005202,
                },
                dungeonRewards: [11005000],
                dungeonRewardView: 11005000,
            },
            {
                tierId: 6,
                dropRewards: {
                    Default: 11006202,
                    "Mon.Advanced": 11006202,
                    "Mon.Boss": 11006202,
                    "Mon.Elite": 11006202,
                    "Mon.Reward.A": 11006202,
                    "Mon.Reward.AA": 11006202,
                    "Mon.Reward.B": 11006202,
                    "Mon.Reward.C": 11006202,
                    "Mon.Reward.D": 11006202,
                    "Mon.Reward.E": 11006202,
                    "Mon.Strong": 11006202,
                },
                dungeonRewards: [11006000],
                dungeonRewardView: 11006000,
            },
            {
                tierId: 7,
                dropRewards: {
                    Default: 11007202,
                    "Mon.Advanced": 11007202,
                    "Mon.Boss": 11007202,
                    "Mon.Elite": 11007202,
                    "Mon.Reward.A": 11007202,
                    "Mon.Reward.AA": 11007202,
                    "Mon.Reward.B": 11007202,
                    "Mon.Reward.C": 11007202,
                    "Mon.Reward.D": 11007202,
                    "Mon.Reward.E": 11007202,
                    "Mon.Strong": 11007202,
                },
                dungeonRewards: [11007000],
                dungeonRewardView: 11007000,
            },
            {
                tierId: 8,
                dropRewards: {
                    Default: 11008202,
                    "Mon.Advanced": 11008202,
                    "Mon.Boss": 11008202,
                    "Mon.Elite": 11008202,
                    "Mon.Reward.A": 11008202,
                    "Mon.Reward.AA": 11008202,
                    "Mon.Reward.B": 11008202,
                    "Mon.Reward.C": 11008202,
                    "Mon.Reward.D": 11008202,
                    "Mon.Reward.E": 11008202,
                    "Mon.Strong": 11008202,
                },
                dungeonRewards: [11008000],
                dungeonRewardView: 11008000,
            },
            {
                tierId: 9,
                dropRewards: {
                    Default: 11009202,
                    "Mon.Advanced": 11009202,
                    "Mon.Boss": 11009202,
                    "Mon.Elite": 11009202,
                    "Mon.Reward.A": 11009202,
                    "Mon.Reward.AA": 11009202,
                    "Mon.Reward.B": 11009202,
                    "Mon.Reward.C": 11009202,
                    "Mon.Reward.D": 11009202,
                    "Mon.Reward.E": 11009202,
                    "Mon.Strong": 11009202,
                },
                dungeonRewards: [11009000],
                dungeonRewardView: 11009000,
            },
            {
                tierId: 10,
                dropRewards: {
                    Default: 11010202,
                    "Mon.Advanced": 11010202,
                    "Mon.Boss": 11010202,
                    "Mon.Elite": 11010202,
                    "Mon.Reward.A": 11010202,
                    "Mon.Reward.AA": 11010202,
                    "Mon.Reward.B": 11010202,
                    "Mon.Reward.C": 11010202,
                    "Mon.Reward.D": 11010202,
                    "Mon.Reward.E": 11010202,
                    "Mon.Strong": 11010202,
                },
                dungeonRewards: [11010000],
                dungeonRewardView: 11010000,
            },
            {
                tierId: 11,
                dropRewards: {
                    Default: 11011202,
                    "Mon.Advanced": 11011202,
                    "Mon.Boss": 11011202,
                    "Mon.Elite": 11011202,
                    "Mon.Reward.A": 11011202,
                    "Mon.Reward.AA": 11011202,
                    "Mon.Reward.B": 11011202,
                    "Mon.Reward.C": 11011202,
                    "Mon.Reward.D": 11011202,
                    "Mon.Reward.E": 11011202,
                    "Mon.Strong": 11011202,
                },
                dungeonRewards: [11011000],
                dungeonRewardView: 11011000,
            },
            {
                tierId: 12,
                dropRewards: {
                    Default: 11012202,
                    "Mon.Advanced": 11012202,
                    "Mon.Boss": 11012202,
                    "Mon.Elite": 11012202,
                    "Mon.Reward.A": 11012202,
                    "Mon.Reward.AA": 11012202,
                    "Mon.Reward.B": 11012202,
                    "Mon.Reward.C": 11012202,
                    "Mon.Reward.D": 11012202,
                    "Mon.Reward.E": 11012202,
                    "Mon.Strong": 11012202,
                },
                dungeonRewards: [11012000],
                dungeonRewardView: 11012000,
            },
            {
                tierId: 13,
                dropRewards: {
                    Default: 11013202,
                    "Mon.Advanced": 11013202,
                    "Mon.Boss": 11013202,
                    "Mon.Elite": 11013202,
                    "Mon.Reward.A": 11013202,
                    "Mon.Reward.AA": 11013202,
                    "Mon.Reward.B": 11013202,
                    "Mon.Reward.C": 11013202,
                    "Mon.Reward.D": 11013202,
                    "Mon.Reward.E": 11013202,
                    "Mon.Strong": 11013202,
                },
                dungeonRewards: [11013000],
                dungeonRewardView: 11013000,
            },
            {
                tierId: 14,
                dropRewards: {
                    Default: 11014202,
                    "Mon.Advanced": 11014202,
                    "Mon.Boss": 11014202,
                    "Mon.Elite": 11014202,
                    "Mon.Reward.A": 11014202,
                    "Mon.Reward.AA": 11014202,
                    "Mon.Reward.B": 11014202,
                    "Mon.Reward.C": 11014202,
                    "Mon.Reward.D": 11014202,
                    "Mon.Reward.E": 11014202,
                    "Mon.Strong": 11014202,
                },
                dungeonRewards: [11014000],
                dungeonRewardView: 11014000,
            },
            {
                tierId: 15,
                dropRewards: {
                    Default: 11015202,
                    "Mon.Advanced": 11015202,
                    "Mon.Boss": 11015202,
                    "Mon.Elite": 11015202,
                    "Mon.Reward.A": 11015202,
                    "Mon.Reward.AA": 11015202,
                    "Mon.Reward.B": 11015202,
                    "Mon.Reward.C": 11015202,
                    "Mon.Reward.D": 11015202,
                    "Mon.Reward.E": 11015202,
                    "Mon.Strong": 11015202,
                },
                dungeonRewards: [11015000],
                dungeonRewardView: 11015000,
            },
            {
                tierId: 16,
                dropRewards: {
                    Default: 11016202,
                    "Mon.Advanced": 11016202,
                    "Mon.Boss": 11016202,
                    "Mon.Elite": 11016202,
                    "Mon.Reward.A": 11016202,
                    "Mon.Reward.AA": 11016202,
                    "Mon.Reward.B": 11016202,
                    "Mon.Reward.C": 11016202,
                    "Mon.Reward.D": 11016202,
                    "Mon.Reward.E": 11016202,
                    "Mon.Strong": 11016202,
                },
                dungeonRewards: [11016000],
                dungeonRewardView: 11016000,
            },
        ],
    },
    {
        ruleId: 2,
        tiers: [
            {
                tierId: 1,
                dropRewards: {
                    Default: 11001202,
                    "Mon.Advanced": 11001202,
                    "Mon.Boss": 11001202,
                    "Mon.Elite": 11001202,
                    "Mon.Reward.A": 11001202,
                    "Mon.Reward.AA": 11001202,
                    "Mon.Reward.B": 11001202,
                    "Mon.Reward.C": 11001202,
                    "Mon.Reward.D": 11001202,
                    "Mon.Reward.E": 11001202,
                    "Mon.Strong": 11001202,
                },
                dungeonRewards: [11001001],
                dungeonRewardView: 11001001,
            },
            {
                tierId: 2,
                dropRewards: {
                    Default: 11002202,
                    "Mon.Advanced": 11002202,
                    "Mon.Boss": 11002202,
                    "Mon.Elite": 11002202,
                    "Mon.Reward.A": 11002202,
                    "Mon.Reward.AA": 11002202,
                    "Mon.Reward.B": 11002202,
                    "Mon.Reward.C": 11002202,
                    "Mon.Reward.D": 11002202,
                    "Mon.Reward.E": 11002202,
                    "Mon.Strong": 11002202,
                },
                dungeonRewards: [11002001],
                dungeonRewardView: 11002001,
            },
            {
                tierId: 3,
                dropRewards: {
                    Default: 11003202,
                    "Mon.Advanced": 11003202,
                    "Mon.Boss": 11003202,
                    "Mon.Elite": 11003202,
                    "Mon.Reward.A": 11003202,
                    "Mon.Reward.AA": 11003202,
                    "Mon.Reward.B": 11003202,
                    "Mon.Reward.C": 11003202,
                    "Mon.Reward.D": 11003202,
                    "Mon.Reward.E": 11003202,
                    "Mon.Strong": 11003202,
                },
                dungeonRewards: [11003001],
                dungeonRewardView: 11003001,
            },
            {
                tierId: 4,
                dropRewards: {
                    Default: 11004202,
                    "Mon.Advanced": 11004202,
                    "Mon.Boss": 11004202,
                    "Mon.Elite": 11004202,
                    "Mon.Reward.A": 11004202,
                    "Mon.Reward.AA": 11004202,
                    "Mon.Reward.B": 11004202,
                    "Mon.Reward.C": 11004202,
                    "Mon.Reward.D": 11004202,
                    "Mon.Reward.E": 11004202,
                    "Mon.Strong": 11004202,
                },
                dungeonRewards: [11004001],
                dungeonRewardView: 11004001,
            },
            {
                tierId: 5,
                dropRewards: {
                    Default: 11005202,
                    "Mon.Advanced": 11005202,
                    "Mon.Boss": 11005202,
                    "Mon.Elite": 11005202,
                    "Mon.Reward.A": 11005202,
                    "Mon.Reward.AA": 11005202,
                    "Mon.Reward.B": 11005202,
                    "Mon.Reward.C": 11005202,
                    "Mon.Reward.D": 11005202,
                    "Mon.Reward.E": 11005202,
                    "Mon.Strong": 11005202,
                },
                dungeonRewards: [11005001],
                dungeonRewardView: 11005001,
            },
            {
                tierId: 6,
                dropRewards: {
                    Default: 11006202,
                    "Mon.Advanced": 11006202,
                    "Mon.Boss": 11006202,
                    "Mon.Elite": 11006202,
                    "Mon.Reward.A": 11006202,
                    "Mon.Reward.AA": 11006202,
                    "Mon.Reward.B": 11006202,
                    "Mon.Reward.C": 11006202,
                    "Mon.Reward.D": 11006202,
                    "Mon.Reward.E": 11006202,
                    "Mon.Strong": 11006202,
                },
                dungeonRewards: [11006001],
                dungeonRewardView: 11006001,
            },
            {
                tierId: 7,
                dropRewards: {
                    Default: 11007202,
                    "Mon.Advanced": 11007202,
                    "Mon.Boss": 11007202,
                    "Mon.Elite": 11007202,
                    "Mon.Reward.A": 11007202,
                    "Mon.Reward.AA": 11007202,
                    "Mon.Reward.B": 11007202,
                    "Mon.Reward.C": 11007202,
                    "Mon.Reward.D": 11007202,
                    "Mon.Reward.E": 11007202,
                    "Mon.Strong": 11007202,
                },
                dungeonRewards: [11007001],
                dungeonRewardView: 11007001,
            },
            {
                tierId: 8,
                dropRewards: {
                    Default: 11008202,
                    "Mon.Advanced": 11008202,
                    "Mon.Boss": 11008202,
                    "Mon.Elite": 11008202,
                    "Mon.Reward.A": 11008202,
                    "Mon.Reward.AA": 11008202,
                    "Mon.Reward.B": 11008202,
                    "Mon.Reward.C": 11008202,
                    "Mon.Reward.D": 11008202,
                    "Mon.Reward.E": 11008202,
                    "Mon.Strong": 11008202,
                },
                dungeonRewards: [11008001],
                dungeonRewardView: 11008001,
            },
            {
                tierId: 9,
                dropRewards: {
                    Default: 11009202,
                    "Mon.Advanced": 11009202,
                    "Mon.Boss": 11009202,
                    "Mon.Elite": 11009202,
                    "Mon.Reward.A": 11009202,
                    "Mon.Reward.AA": 11009202,
                    "Mon.Reward.B": 11009202,
                    "Mon.Reward.C": 11009202,
                    "Mon.Reward.D": 11009202,
                    "Mon.Reward.E": 11009202,
                    "Mon.Strong": 11009202,
                },
                dungeonRewards: [11009001],
                dungeonRewardView: 11009001,
            },
            {
                tierId: 10,
                dropRewards: {
                    Default: 11010202,
                    "Mon.Advanced": 11010202,
                    "Mon.Boss": 11010202,
                    "Mon.Elite": 11010202,
                    "Mon.Reward.A": 11010202,
                    "Mon.Reward.AA": 11010202,
                    "Mon.Reward.B": 11010202,
                    "Mon.Reward.C": 11010202,
                    "Mon.Reward.D": 11010202,
                    "Mon.Reward.E": 11010202,
                    "Mon.Strong": 11010202,
                },
                dungeonRewards: [11010001],
                dungeonRewardView: 11010001,
            },
            {
                tierId: 11,
                dropRewards: {
                    Default: 11011202,
                    "Mon.Advanced": 11011202,
                    "Mon.Boss": 11011202,
                    "Mon.Elite": 11011202,
                    "Mon.Reward.A": 11011202,
                    "Mon.Reward.AA": 11011202,
                    "Mon.Reward.B": 11011202,
                    "Mon.Reward.C": 11011202,
                    "Mon.Reward.D": 11011202,
                    "Mon.Reward.E": 11011202,
                    "Mon.Strong": 11011202,
                },
                dungeonRewards: [11011001],
                dungeonRewardView: 11011001,
            },
            {
                tierId: 12,
                dropRewards: {
                    Default: 11012202,
                    "Mon.Advanced": 11012202,
                    "Mon.Boss": 11012202,
                    "Mon.Elite": 11012202,
                    "Mon.Reward.A": 11012202,
                    "Mon.Reward.AA": 11012202,
                    "Mon.Reward.B": 11012202,
                    "Mon.Reward.C": 11012202,
                    "Mon.Reward.D": 11012202,
                    "Mon.Reward.E": 11012202,
                    "Mon.Strong": 11012202,
                },
                dungeonRewards: [11012001],
                dungeonRewardView: 11012001,
            },
            {
                tierId: 13,
                dropRewards: {
                    Default: 11013202,
                    "Mon.Advanced": 11013202,
                    "Mon.Boss": 11013202,
                    "Mon.Elite": 11013202,
                    "Mon.Reward.A": 11013202,
                    "Mon.Reward.AA": 11013202,
                    "Mon.Reward.B": 11013202,
                    "Mon.Reward.C": 11013202,
                    "Mon.Reward.D": 11013202,
                    "Mon.Reward.E": 11013202,
                    "Mon.Strong": 11013202,
                },
                dungeonRewards: [11013001],
                dungeonRewardView: 11013001,
            },
            {
                tierId: 14,
                dropRewards: {
                    Default: 11014202,
                    "Mon.Advanced": 11014202,
                    "Mon.Boss": 11014202,
                    "Mon.Elite": 11014202,
                    "Mon.Reward.A": 11014202,
                    "Mon.Reward.AA": 11014202,
                    "Mon.Reward.B": 11014202,
                    "Mon.Reward.C": 11014202,
                    "Mon.Reward.D": 11014202,
                    "Mon.Reward.E": 11014202,
                    "Mon.Strong": 11014202,
                },
                dungeonRewards: [11014001],
                dungeonRewardView: 11014001,
            },
            {
                tierId: 15,
                dropRewards: {
                    Default: 11015202,
                    "Mon.Advanced": 11015202,
                    "Mon.Boss": 11015202,
                    "Mon.Elite": 11015202,
                    "Mon.Reward.A": 11015202,
                    "Mon.Reward.AA": 11015202,
                    "Mon.Reward.B": 11015202,
                    "Mon.Reward.C": 11015202,
                    "Mon.Reward.D": 11015202,
                    "Mon.Reward.E": 11015202,
                    "Mon.Strong": 11015202,
                },
                dungeonRewards: [11015001],
                dungeonRewardView: 11015001,
            },
            {
                tierId: 16,
                dropRewards: {
                    Default: 11016202,
                    "Mon.Advanced": 11016202,
                    "Mon.Boss": 11016202,
                    "Mon.Elite": 11016202,
                    "Mon.Reward.A": 11016202,
                    "Mon.Reward.AA": 11016202,
                    "Mon.Reward.B": 11016202,
                    "Mon.Reward.C": 11016202,
                    "Mon.Reward.D": 11016202,
                    "Mon.Reward.E": 11016202,
                    "Mon.Strong": 11016202,
                },
                dungeonRewards: [11016001],
                dungeonRewardView: 11016001,
            },
        ],
    },
    {
        ruleId: 3,
        tiers: [
            {
                tierId: 1,
                dropRewards: {
                    Default: 11001302,
                    "Mon.Advanced": 11001302,
                    "Mon.Boss": 11001302,
                    "Mon.Elite": 11001302,
                    "Mon.Reward.A": 11001302,
                    "Mon.Reward.AA": 11001302,
                    "Mon.Reward.B": 11001302,
                    "Mon.Reward.C": 11001302,
                    "Mon.Reward.D": 11001302,
                    "Mon.Reward.E": 11001302,
                    "Mon.Strong": 11001302,
                },
                dungeonRewards: [11001004],
                dungeonRewardView: 11001002,
            },
            {
                tierId: 2,
                dropRewards: {
                    Default: 11002302,
                    "Mon.Advanced": 11002302,
                    "Mon.Boss": 11002302,
                    "Mon.Elite": 11002302,
                    "Mon.Reward.A": 11002302,
                    "Mon.Reward.AA": 11002302,
                    "Mon.Reward.B": 11002302,
                    "Mon.Reward.C": 11002302,
                    "Mon.Reward.D": 11002302,
                    "Mon.Reward.E": 11002302,
                    "Mon.Strong": 11002302,
                },
                dungeonRewards: [11002004],
                dungeonRewardView: 11002002,
            },
            {
                tierId: 3,
                dropRewards: {
                    Default: 11003302,
                    "Mon.Advanced": 11003302,
                    "Mon.Boss": 11003302,
                    "Mon.Elite": 11003302,
                    "Mon.Reward.A": 11003302,
                    "Mon.Reward.AA": 11003302,
                    "Mon.Reward.B": 11003302,
                    "Mon.Reward.C": 11003302,
                    "Mon.Reward.D": 11003302,
                    "Mon.Reward.E": 11003302,
                    "Mon.Strong": 11003302,
                },
                dungeonRewards: [11003002],
                dungeonRewardView: 11003002,
            },
            {
                tierId: 4,
                dropRewards: {
                    Default: 11004302,
                    "Mon.Advanced": 11004302,
                    "Mon.Boss": 11004302,
                    "Mon.Elite": 11004302,
                    "Mon.Reward.A": 11004302,
                    "Mon.Reward.AA": 11004302,
                    "Mon.Reward.B": 11004302,
                    "Mon.Reward.C": 11004302,
                    "Mon.Reward.D": 11004302,
                    "Mon.Reward.E": 11004302,
                    "Mon.Strong": 11004302,
                },
                dungeonRewards: [11004002],
                dungeonRewardView: 11004002,
            },
            {
                tierId: 5,
                dropRewards: {
                    Default: 11005302,
                    "Mon.Advanced": 11005302,
                    "Mon.Boss": 11005302,
                    "Mon.Elite": 11005302,
                    "Mon.Reward.A": 11005302,
                    "Mon.Reward.AA": 11005302,
                    "Mon.Reward.B": 11005302,
                    "Mon.Reward.C": 11005302,
                    "Mon.Reward.D": 11005302,
                    "Mon.Reward.E": 11005302,
                    "Mon.Strong": 11005302,
                },
                dungeonRewards: [11005002],
                dungeonRewardView: 11005002,
            },
            {
                tierId: 6,
                dropRewards: {
                    Default: 11006302,
                    "Mon.Advanced": 11006302,
                    "Mon.Boss": 11006302,
                    "Mon.Elite": 11006302,
                    "Mon.Reward.A": 11006302,
                    "Mon.Reward.AA": 11006302,
                    "Mon.Reward.B": 11006302,
                    "Mon.Reward.C": 11006302,
                    "Mon.Reward.D": 11006302,
                    "Mon.Reward.E": 11006302,
                    "Mon.Strong": 11006302,
                },
                dungeonRewards: [11006002],
                dungeonRewardView: 11006002,
            },
            {
                tierId: 7,
                dropRewards: {
                    Default: 11007302,
                    "Mon.Advanced": 11007302,
                    "Mon.Boss": 11007302,
                    "Mon.Elite": 11007302,
                    "Mon.Reward.A": 11007302,
                    "Mon.Reward.AA": 11007302,
                    "Mon.Reward.B": 11007302,
                    "Mon.Reward.C": 11007302,
                    "Mon.Reward.D": 11007302,
                    "Mon.Reward.E": 11007302,
                    "Mon.Strong": 11007302,
                },
                dungeonRewards: [11007002],
                dungeonRewardView: 11007002,
            },
            {
                tierId: 8,
                dropRewards: {
                    Default: 11008302,
                    "Mon.Advanced": 11008302,
                    "Mon.Boss": 11008302,
                    "Mon.Elite": 11008302,
                    "Mon.Reward.A": 11008302,
                    "Mon.Reward.AA": 11008302,
                    "Mon.Reward.B": 11008302,
                    "Mon.Reward.C": 11008302,
                    "Mon.Reward.D": 11008302,
                    "Mon.Reward.E": 11008302,
                    "Mon.Strong": 11008302,
                },
                dungeonRewards: [11008002],
                dungeonRewardView: 11008002,
            },
            {
                tierId: 9,
                dropRewards: {
                    Default: 11009302,
                    "Mon.Advanced": 11009302,
                    "Mon.Boss": 11009302,
                    "Mon.Elite": 11009302,
                    "Mon.Reward.A": 11009302,
                    "Mon.Reward.AA": 11009302,
                    "Mon.Reward.B": 11009302,
                    "Mon.Reward.C": 11009302,
                    "Mon.Reward.D": 11009302,
                    "Mon.Reward.E": 11009302,
                    "Mon.Strong": 11009302,
                },
                dungeonRewards: [11009002],
                dungeonRewardView: 11009002,
            },
            {
                tierId: 10,
                dropRewards: {
                    Default: 11010302,
                    "Mon.Advanced": 11010302,
                    "Mon.Boss": 11010302,
                    "Mon.Elite": 11010302,
                    "Mon.Reward.A": 11010302,
                    "Mon.Reward.AA": 11010302,
                    "Mon.Reward.B": 11010302,
                    "Mon.Reward.C": 11010302,
                    "Mon.Reward.D": 11010302,
                    "Mon.Reward.E": 11010302,
                    "Mon.Strong": 11010302,
                },
                dungeonRewards: [11010002],
                dungeonRewardView: 11010002,
            },
            {
                tierId: 11,
                dropRewards: {
                    Default: 11011302,
                    "Mon.Advanced": 11011302,
                    "Mon.Boss": 11011302,
                    "Mon.Elite": 11011302,
                    "Mon.Reward.A": 11011302,
                    "Mon.Reward.AA": 11011302,
                    "Mon.Reward.B": 11011302,
                    "Mon.Reward.C": 11011302,
                    "Mon.Reward.D": 11011302,
                    "Mon.Reward.E": 11011302,
                    "Mon.Strong": 11011302,
                },
                dungeonRewards: [11011002],
                dungeonRewardView: 11011002,
            },
            {
                tierId: 12,
                dropRewards: {
                    Default: 11012302,
                    "Mon.Advanced": 11012302,
                    "Mon.Boss": 11012302,
                    "Mon.Elite": 11012302,
                    "Mon.Reward.A": 11012302,
                    "Mon.Reward.AA": 11012302,
                    "Mon.Reward.B": 11012302,
                    "Mon.Reward.C": 11012302,
                    "Mon.Reward.D": 11012302,
                    "Mon.Reward.E": 11012302,
                    "Mon.Strong": 11012302,
                },
                dungeonRewards: [11012002],
                dungeonRewardView: 11012002,
            },
            {
                tierId: 13,
                dropRewards: {
                    Default: 11013302,
                    "Mon.Advanced": 11013302,
                    "Mon.Boss": 11013302,
                    "Mon.Elite": 11013302,
                    "Mon.Reward.A": 11013302,
                    "Mon.Reward.AA": 11013302,
                    "Mon.Reward.B": 11013302,
                    "Mon.Reward.C": 11013302,
                    "Mon.Reward.D": 11013302,
                    "Mon.Reward.E": 11013302,
                    "Mon.Strong": 11013302,
                },
                dungeonRewards: [11013002],
                dungeonRewardView: 11013002,
            },
            {
                tierId: 14,
                dropRewards: {
                    Default: 11014302,
                    "Mon.Advanced": 11014302,
                    "Mon.Boss": 11014302,
                    "Mon.Elite": 11014302,
                    "Mon.Reward.A": 11014302,
                    "Mon.Reward.AA": 11014302,
                    "Mon.Reward.B": 11014302,
                    "Mon.Reward.C": 11014302,
                    "Mon.Reward.D": 11014302,
                    "Mon.Reward.E": 11014302,
                    "Mon.Strong": 11014302,
                },
                dungeonRewards: [11014002],
                dungeonRewardView: 11014002,
            },
            {
                tierId: 15,
                dropRewards: {
                    Default: 11015302,
                    "Mon.Advanced": 11015302,
                    "Mon.Boss": 11015302,
                    "Mon.Elite": 11015302,
                    "Mon.Reward.A": 11015302,
                    "Mon.Reward.AA": 11015302,
                    "Mon.Reward.B": 11015302,
                    "Mon.Reward.C": 11015302,
                    "Mon.Reward.D": 11015302,
                    "Mon.Reward.E": 11015302,
                    "Mon.Strong": 11015302,
                },
                dungeonRewards: [11015002],
                dungeonRewardView: 11015002,
            },
            {
                tierId: 16,
                dropRewards: {
                    Default: 11016302,
                    "Mon.Advanced": 11016302,
                    "Mon.Boss": 11016302,
                    "Mon.Elite": 11016302,
                    "Mon.Reward.A": 11016302,
                    "Mon.Reward.AA": 11016302,
                    "Mon.Reward.B": 11016302,
                    "Mon.Reward.C": 11016302,
                    "Mon.Reward.D": 11016302,
                    "Mon.Reward.E": 11016302,
                    "Mon.Strong": 11016302,
                },
                dungeonRewards: [11016002],
                dungeonRewardView: 11016002,
            },
        ],
    },
    {
        ruleId: 4,
        tiers: [
            {
                tierId: 1,
                dropRewards: {
                    Default: 11001202,
                    "Mon.Advanced": 11001202,
                    "Mon.Boss": 11001202,
                    "Mon.Elite": 11001202,
                    "Mon.Reward.A": 11001202,
                    "Mon.Reward.AA": 11001202,
                    "Mon.Reward.B": 11001202,
                    "Mon.Reward.C": 11001202,
                    "Mon.Reward.D": 11001202,
                    "Mon.Reward.E": 11001202,
                    "Mon.Strong": 11001202,
                },
                dungeonRewards: [11001003],
                dungeonRewardView: 11001003,
            },
            {
                tierId: 2,
                dropRewards: {
                    Default: 11002202,
                    "Mon.Advanced": 11002202,
                    "Mon.Boss": 11002202,
                    "Mon.Elite": 11002202,
                    "Mon.Reward.A": 11002202,
                    "Mon.Reward.AA": 11002202,
                    "Mon.Reward.B": 11002202,
                    "Mon.Reward.C": 11002202,
                    "Mon.Reward.D": 11002202,
                    "Mon.Reward.E": 11002202,
                    "Mon.Strong": 11002202,
                },
                dungeonRewards: [11002003],
                dungeonRewardView: 11002003,
            },
            {
                tierId: 3,
                dropRewards: {
                    Default: 11003202,
                    "Mon.Advanced": 11003202,
                    "Mon.Boss": 11003202,
                    "Mon.Elite": 11003202,
                    "Mon.Reward.A": 11003202,
                    "Mon.Reward.AA": 11003202,
                    "Mon.Reward.B": 11003202,
                    "Mon.Reward.C": 11003202,
                    "Mon.Reward.D": 11003202,
                    "Mon.Reward.E": 11003202,
                    "Mon.Strong": 11003202,
                },
                dungeonRewards: [11003003],
                dungeonRewardView: 11003003,
            },
            {
                tierId: 4,
                dropRewards: {
                    Default: 11004202,
                    "Mon.Advanced": 11004202,
                    "Mon.Boss": 11004202,
                    "Mon.Elite": 11004202,
                    "Mon.Reward.A": 11004202,
                    "Mon.Reward.AA": 11004202,
                    "Mon.Reward.B": 11004202,
                    "Mon.Reward.C": 11004202,
                    "Mon.Reward.D": 11004202,
                    "Mon.Reward.E": 11004202,
                    "Mon.Strong": 11004202,
                },
                dungeonRewards: [11004003],
                dungeonRewardView: 11004003,
            },
            {
                tierId: 5,
                dropRewards: {
                    Default: 11005202,
                    "Mon.Advanced": 11005202,
                    "Mon.Boss": 11005202,
                    "Mon.Elite": 11005202,
                    "Mon.Reward.A": 11005202,
                    "Mon.Reward.AA": 11005202,
                    "Mon.Reward.B": 11005202,
                    "Mon.Reward.C": 11005202,
                    "Mon.Reward.D": 11005202,
                    "Mon.Reward.E": 11005202,
                    "Mon.Strong": 11005202,
                },
                dungeonRewards: [11005003],
                dungeonRewardView: 11005003,
            },
            {
                tierId: 6,
                dropRewards: {
                    Default: 11006202,
                    "Mon.Advanced": 11006202,
                    "Mon.Boss": 11006202,
                    "Mon.Elite": 11006202,
                    "Mon.Reward.A": 11006202,
                    "Mon.Reward.AA": 11006202,
                    "Mon.Reward.B": 11006202,
                    "Mon.Reward.C": 11006202,
                    "Mon.Reward.D": 11006202,
                    "Mon.Reward.E": 11006202,
                    "Mon.Strong": 11006202,
                },
                dungeonRewards: [11006003],
                dungeonRewardView: 11006003,
            },
            {
                tierId: 7,
                dropRewards: {
                    Default: 11007202,
                    "Mon.Advanced": 11007202,
                    "Mon.Boss": 11007202,
                    "Mon.Elite": 11007202,
                    "Mon.Reward.A": 11007202,
                    "Mon.Reward.AA": 11007202,
                    "Mon.Reward.B": 11007202,
                    "Mon.Reward.C": 11007202,
                    "Mon.Reward.D": 11007202,
                    "Mon.Reward.E": 11007202,
                    "Mon.Strong": 11007202,
                },
                dungeonRewards: [11007003],
                dungeonRewardView: 11007003,
            },
            {
                tierId: 8,
                dropRewards: {
                    Default: 11008202,
                    "Mon.Advanced": 11008202,
                    "Mon.Boss": 11008202,
                    "Mon.Elite": 11008202,
                    "Mon.Reward.A": 11008202,
                    "Mon.Reward.AA": 11008202,
                    "Mon.Reward.B": 11008202,
                    "Mon.Reward.C": 11008202,
                    "Mon.Reward.D": 11008202,
                    "Mon.Reward.E": 11008202,
                    "Mon.Strong": 11008202,
                },
                dungeonRewards: [11008003],
                dungeonRewardView: 11008003,
            },
            {
                tierId: 9,
                dropRewards: {
                    Default: 11009202,
                    "Mon.Advanced": 11009202,
                    "Mon.Boss": 11009202,
                    "Mon.Elite": 11009202,
                    "Mon.Reward.A": 11009202,
                    "Mon.Reward.AA": 11009202,
                    "Mon.Reward.B": 11009202,
                    "Mon.Reward.C": 11009202,
                    "Mon.Reward.D": 11009202,
                    "Mon.Reward.E": 11009202,
                    "Mon.Strong": 11009202,
                },
                dungeonRewards: [11009003],
                dungeonRewardView: 11009003,
            },
            {
                tierId: 10,
                dropRewards: {
                    Default: 11010202,
                    "Mon.Advanced": 11010202,
                    "Mon.Boss": 11010202,
                    "Mon.Elite": 11010202,
                    "Mon.Reward.A": 11010202,
                    "Mon.Reward.AA": 11010202,
                    "Mon.Reward.B": 11010202,
                    "Mon.Reward.C": 11010202,
                    "Mon.Reward.D": 11010202,
                    "Mon.Reward.E": 11010202,
                    "Mon.Strong": 11010202,
                },
                dungeonRewards: [11010003],
                dungeonRewardView: 11010003,
            },
            {
                tierId: 11,
                dropRewards: {
                    Default: 11011202,
                    "Mon.Advanced": 11011202,
                    "Mon.Boss": 11011202,
                    "Mon.Elite": 11011202,
                    "Mon.Reward.A": 11011202,
                    "Mon.Reward.AA": 11011202,
                    "Mon.Reward.B": 11011202,
                    "Mon.Reward.C": 11011202,
                    "Mon.Reward.D": 11011202,
                    "Mon.Reward.E": 11011202,
                    "Mon.Strong": 11011202,
                },
                dungeonRewards: [11011003],
                dungeonRewardView: 11011003,
            },
            {
                tierId: 12,
                dropRewards: {
                    Default: 11012202,
                    "Mon.Advanced": 11012202,
                    "Mon.Boss": 11012202,
                    "Mon.Elite": 11012202,
                    "Mon.Reward.A": 11012202,
                    "Mon.Reward.AA": 11012202,
                    "Mon.Reward.B": 11012202,
                    "Mon.Reward.C": 11012202,
                    "Mon.Reward.D": 11012202,
                    "Mon.Reward.E": 11012202,
                    "Mon.Strong": 11012202,
                },
                dungeonRewards: [11012003],
                dungeonRewardView: 11012003,
            },
            {
                tierId: 13,
                dropRewards: {
                    Default: 11013202,
                    "Mon.Advanced": 11013202,
                    "Mon.Boss": 11013202,
                    "Mon.Elite": 11013202,
                    "Mon.Reward.A": 11013202,
                    "Mon.Reward.AA": 11013202,
                    "Mon.Reward.B": 11013202,
                    "Mon.Reward.C": 11013202,
                    "Mon.Reward.D": 11013202,
                    "Mon.Reward.E": 11013202,
                    "Mon.Strong": 11013202,
                },
                dungeonRewards: [11013003],
                dungeonRewardView: 11013003,
            },
            {
                tierId: 14,
                dropRewards: {
                    Default: 11014202,
                    "Mon.Advanced": 11014202,
                    "Mon.Boss": 11014202,
                    "Mon.Elite": 11014202,
                    "Mon.Reward.A": 11014202,
                    "Mon.Reward.AA": 11014202,
                    "Mon.Reward.B": 11014202,
                    "Mon.Reward.C": 11014202,
                    "Mon.Reward.D": 11014202,
                    "Mon.Reward.E": 11014202,
                    "Mon.Strong": 11014202,
                },
                dungeonRewards: [11014003],
                dungeonRewardView: 11014003,
            },
            {
                tierId: 15,
                dropRewards: {
                    Default: 11015202,
                    "Mon.Advanced": 11015202,
                    "Mon.Boss": 11015202,
                    "Mon.Elite": 11015202,
                    "Mon.Reward.A": 11015202,
                    "Mon.Reward.AA": 11015202,
                    "Mon.Reward.B": 11015202,
                    "Mon.Reward.C": 11015202,
                    "Mon.Reward.D": 11015202,
                    "Mon.Reward.E": 11015202,
                    "Mon.Strong": 11015202,
                },
                dungeonRewards: [11015003],
                dungeonRewardView: 11015003,
            },
            {
                tierId: 16,
                dropRewards: {
                    Default: 11016202,
                    "Mon.Advanced": 11016202,
                    "Mon.Boss": 11016202,
                    "Mon.Elite": 11016202,
                    "Mon.Reward.A": 11016202,
                    "Mon.Reward.AA": 11016202,
                    "Mon.Reward.B": 11016202,
                    "Mon.Reward.C": 11016202,
                    "Mon.Reward.D": 11016202,
                    "Mon.Reward.E": 11016202,
                    "Mon.Strong": 11016202,
                },
                dungeonRewards: [11016003],
                dungeonRewardView: 11016003,
            },
        ],
    },
    {
        ruleId: 1001,
        tiers: [
            {
                tierId: 1,
                dungeonRewardView: 20001000,
            },
            {
                tierId: 2,
                dungeonRewardView: 20002000,
            },
            {
                tierId: 3,
                dungeonRewardView: 20003000,
            },
            {
                tierId: 4,
                dungeonRewardView: 20004000,
            },
            {
                tierId: 5,
                dungeonRewardView: 20005000,
            },
            {
                tierId: 6,
                dungeonRewardView: 20006000,
            },
            {
                tierId: 7,
                dungeonRewardView: 20007000,
            },
            {
                tierId: 8,
                dungeonRewardView: 20008000,
            },
            {
                tierId: 9,
                dungeonRewardView: 20009000,
            },
            {
                tierId: 10,
                dungeonRewardView: 20010000,
            },
            {
                tierId: 11,
                dungeonRewardView: 20011000,
            },
            {
                tierId: 12,
                dungeonRewardView: 20012000,
            },
            {
                tierId: 13,
                dungeonRewardView: 20013000,
            },
            {
                tierId: 14,
                dungeonRewardView: 20014000,
            },
            {
                tierId: 15,
                dungeonRewardView: 20015000,
            },
            {
                tierId: 16,
                dungeonRewardView: 20016000,
            },
        ],
    },
    {
        ruleId: 1002,
        tiers: [
            {
                tierId: 1,
                dungeonRewardView: 20001001,
            },
            {
                tierId: 2,
                dungeonRewardView: 20002001,
            },
            {
                tierId: 3,
                dungeonRewardView: 20003001,
            },
            {
                tierId: 4,
                dungeonRewardView: 20004001,
            },
            {
                tierId: 5,
                dungeonRewardView: 20005001,
            },
            {
                tierId: 6,
                dungeonRewardView: 20006001,
            },
            {
                tierId: 7,
                dungeonRewardView: 20007001,
            },
            {
                tierId: 8,
                dungeonRewardView: 20008001,
            },
            {
                tierId: 9,
                dungeonRewardView: 20009001,
            },
            {
                tierId: 10,
                dungeonRewardView: 20010001,
            },
            {
                tierId: 11,
                dungeonRewardView: 20011001,
            },
            {
                tierId: 12,
                dungeonRewardView: 20012001,
            },
            {
                tierId: 13,
                dungeonRewardView: 20013001,
            },
            {
                tierId: 14,
                dungeonRewardView: 20014001,
            },
            {
                tierId: 15,
                dungeonRewardView: 20015001,
            },
            {
                tierId: 16,
                dungeonRewardView: 20016001,
            },
        ],
    },
    {
        ruleId: 1003,
        tiers: [
            {
                tierId: 1,
                dungeonRewardView: 20001002,
            },
            {
                tierId: 2,
                dungeonRewardView: 20002002,
            },
            {
                tierId: 3,
                dungeonRewardView: 20003002,
            },
            {
                tierId: 4,
                dungeonRewardView: 20004002,
            },
            {
                tierId: 5,
                dungeonRewardView: 20005002,
            },
            {
                tierId: 6,
                dungeonRewardView: 20006002,
            },
            {
                tierId: 7,
                dungeonRewardView: 20007002,
            },
            {
                tierId: 8,
                dungeonRewardView: 20008002,
            },
            {
                tierId: 9,
                dungeonRewardView: 20009002,
            },
            {
                tierId: 10,
                dungeonRewardView: 20010002,
            },
            {
                tierId: 11,
                dungeonRewardView: 20011002,
            },
            {
                tierId: 12,
                dungeonRewardView: 20012002,
            },
            {
                tierId: 13,
                dungeonRewardView: 20013002,
            },
            {
                tierId: 14,
                dungeonRewardView: 20014002,
            },
            {
                tierId: 15,
                dungeonRewardView: 20015002,
            },
            {
                tierId: 16,
                dungeonRewardView: 20016002,
            },
        ],
    },
    {
        ruleId: 1004,
        tiers: [
            {
                tierId: 1,
                dungeonRewardView: 20001003,
            },
            {
                tierId: 2,
                dungeonRewardView: 20002003,
            },
            {
                tierId: 3,
                dungeonRewardView: 20003003,
            },
            {
                tierId: 4,
                dungeonRewardView: 20004003,
            },
            {
                tierId: 5,
                dungeonRewardView: 20005003,
            },
            {
                tierId: 6,
                dungeonRewardView: 20006003,
            },
            {
                tierId: 7,
                dungeonRewardView: 20007003,
            },
            {
                tierId: 8,
                dungeonRewardView: 20008003,
            },
            {
                tierId: 9,
                dungeonRewardView: 20009003,
            },
            {
                tierId: 10,
                dungeonRewardView: 20010003,
            },
            {
                tierId: 11,
                dungeonRewardView: 20011003,
            },
            {
                tierId: 12,
                dungeonRewardView: 20012003,
            },
            {
                tierId: 13,
                dungeonRewardView: 20013003,
            },
            {
                tierId: 14,
                dungeonRewardView: 20014003,
            },
            {
                tierId: 15,
                dungeonRewardView: 20015003,
            },
            {
                tierId: 16,
                dungeonRewardView: 20016003,
            },
        ],
    },
    {
        ruleId: 1005,
        tiers: [
            {
                tierId: 1,
                dungeonRewardView: 20001004,
            },
            {
                tierId: 2,
                dungeonRewardView: 20002004,
            },
            {
                tierId: 3,
                dungeonRewardView: 20003004,
            },
            {
                tierId: 4,
                dungeonRewardView: 20004004,
            },
            {
                tierId: 5,
                dungeonRewardView: 20005004,
            },
            {
                tierId: 6,
                dungeonRewardView: 20006004,
            },
            {
                tierId: 7,
                dungeonRewardView: 20007004,
            },
            {
                tierId: 8,
                dungeonRewardView: 20008004,
            },
            {
                tierId: 9,
                dungeonRewardView: 20009004,
            },
            {
                tierId: 10,
                dungeonRewardView: 20010004,
            },
            {
                tierId: 11,
                dungeonRewardView: 20011004,
            },
            {
                tierId: 12,
                dungeonRewardView: 20012004,
            },
            {
                tierId: 13,
                dungeonRewardView: 20013004,
            },
            {
                tierId: 14,
                dungeonRewardView: 20014004,
            },
            {
                tierId: 15,
                dungeonRewardView: 20015004,
            },
            {
                tierId: 16,
                dungeonRewardView: 20016004,
            },
        ],
    },
    {
        ruleId: 1006,
        tiers: [
            {
                tierId: 1,
                dungeonRewardView: 20001005,
            },
            {
                tierId: 2,
                dungeonRewardView: 20002005,
            },
            {
                tierId: 3,
                dungeonRewardView: 20003005,
            },
            {
                tierId: 4,
                dungeonRewardView: 20004005,
            },
            {
                tierId: 5,
                dungeonRewardView: 20005005,
            },
            {
                tierId: 6,
                dungeonRewardView: 20006005,
            },
            {
                tierId: 7,
                dungeonRewardView: 20007005,
            },
            {
                tierId: 8,
                dungeonRewardView: 20008005,
            },
            {
                tierId: 9,
                dungeonRewardView: 20009005,
            },
            {
                tierId: 10,
                dungeonRewardView: 20010005,
            },
            {
                tierId: 11,
                dungeonRewardView: 20011005,
            },
            {
                tierId: 12,
                dungeonRewardView: 20012005,
            },
            {
                tierId: 13,
                dungeonRewardView: 20013005,
            },
            {
                tierId: 14,
                dungeonRewardView: 20014005,
            },
            {
                tierId: 15,
                dungeonRewardView: 20015005,
            },
            {
                tierId: 16,
                dungeonRewardView: 20016005,
            },
        ],
    },
]

const rawNestBosses: DnaSeasonNestBoss[] = [
    {
        dungeonId: 28101,
        keyId: 5001,
        seasonDifficulty: 1001,
    },
    {
        dungeonId: 28102,
        keyId: 5002,
        seasonDifficulty: 1002,
    },
    {
        dungeonId: 28103,
        keyId: 5003,
        seasonDifficulty: 1003,
    },
    {
        dungeonId: 28104,
        keyId: 5001,
        seasonDifficulty: 1004,
    },
    {
        dungeonId: 28105,
        keyId: 5002,
        seasonDifficulty: 1005,
    },
    {
        dungeonId: 28106,
        keyId: 5003,
        seasonDifficulty: 1006,
    },
]

const rawEquipConstants: DnaSeasonEquipConstant[] = [
    {
        seasonId: 1,
        baseAffixReduce: 1,
        randomAffixReduce: 1,
    },
    {
        seasonId: 2,
        baseAffixReduce: 1,
        randomAffixReduce: 1,
    },
    {
        seasonId: 3,
        baseAffixReduce: 1,
        randomAffixReduce: 1,
    },
]

/** 全局常量是标量表。 */
const rawGlobalConstants: DnaSeasonGlobalConstants = {
    DNASeasonSiftId: 1007,
    DNASeasonTempBagMaxslot: 300,
    TalentTreeMobileVerticalOffset: -112.5,
    TalentTreeVerticalOffset: 250,
}

export const seasons = rawSeasons

export const tiers = rawTiers

export const buffTypes = rawBuffTypes

export const buffLevels = rawBuffLevels

export const dropBonuses = rawDropBonuses

export const resourceTabs = rawResourceTabs

export const bagTabs = rawBagTabs

export const stashTabs = rawStashTabs

export const commissionTiers = rawCommissionTiers

export const nestBosses = rawNestBosses

export const equipConstants = rawEquipConstants

export const resources = rawResources

export const globalConstants: DnaSeasonGlobalConstants = rawGlobalConstants
