export interface RaceLotteryPlayer {
    playerId: number
    modelId: string
    icon: string
    defaultSpeed: number
    name: string
}

export interface RaceLotteryMaxStake {
    EventDay: number
    MaxStake: number
}

export interface RaceLotteryOutsideBuff {
    rumorId: number
    buffMap: string
    pValueEffect: number
    randomWeight: number
    bannedWhenValueHigherThan?: number
    bannedWhenValueLowerThan?: number
    name: string
}

export interface RaceLotteryInsideBuff {
    insideBuffId: number
    unlockDay: number
    effect: number
    effectPath?: string
    randomWeight: number
    name: string
    description: string
}

export interface RaceLotteryRewardRate {
    RewardRate: number
    TargetHitNum: number
}

export interface RaceLotteryRumorFee {
    RumorInquireFee: number
    RumorInquireTime: number
}

export interface RaceLotteryData {
    players: RaceLotteryPlayer[]
    maxStakes: RaceLotteryMaxStake[]
    outsideBuffs: RaceLotteryOutsideBuff[]
    insideBuffs: RaceLotteryInsideBuff[]
    constants: Record<string, number | string>
    rewardRates: RaceLotteryRewardRate[]
    rumorFees: RaceLotteryRumorFee[]
}

export const raceLotteryPlayersOrder = [
    4033, 4163, 4133, 4073, 4043, 4013, 4143, 4113, 4083, 4053, 4023, 4153, 4931, 4923, 4913, 4093, 4123, 4063,
]

export const raceLotteryPlayers: RaceLotteryPlayer[] = [
    {
        playerId: 4013,
        modelId: "64013",
        icon: "T_Head_Pet_Zisha01",
        defaultSpeed: 1,
        name: "暗黑风暴",
    },
    {
        playerId: 4023,
        modelId: "64023",
        icon: "T_Head_Pet_Yuyi03",
        defaultSpeed: 1,
        name: "透明糖衣",
    },
    {
        playerId: 4033,
        modelId: "64033",
        icon: "T_Head_Pet_Dahuo03",
        defaultSpeed: 1,
        name: "漂亮朋友",
    },
    {
        playerId: 4043,
        modelId: "64043",
        icon: "T_Head_Pet_Zhamao03",
        defaultSpeed: 1,
        name: "蒙面歌王",
    },
    {
        playerId: 4053,
        modelId: "64053",
        icon: "T_Head_Pet_Yaoye03",
        defaultSpeed: 1,
        name: "灵感菇力",
    },
    {
        playerId: 4063,
        modelId: "64063",
        icon: "T_Head_Pet_Shanling03",
        defaultSpeed: 1,
        name: "铃机移动",
    },
    {
        playerId: 4073,
        modelId: "64073",
        icon: "T_Head_Pet_Nihao03",
        defaultSpeed: 1,
        name: "一路箱北",
    },
    {
        playerId: 4083,
        modelId: "64083",
        icon: "T_Head_Pet_Zhenzhu03",
        defaultSpeed: 1,
        name: "兔兔冲击",
    },
    {
        playerId: 4093,
        modelId: "64093",
        icon: "T_Head_Pet_Haomeng03",
        defaultSpeed: 1,
        name: "无忧安眠",
    },
    {
        playerId: 4113,
        modelId: "64113",
        icon: "T_Head_Pet_Fuyou03",
        defaultSpeed: 1,
        name: "鱿与思",
    },
    {
        playerId: 4123,
        modelId: "64123",
        icon: "T_Head_Pet_Tangshuang03",
        defaultSpeed: 1,
        name: "奶盖冰砖",
    },
    {
        playerId: 4133,
        modelId: "64133",
        icon: "T_Head_Pet_YYHW03",
        defaultSpeed: 1,
        name: "左右焚原",
    },
    {
        playerId: 4143,
        modelId: "64143",
        icon: "T_Head_Pet_Pipa02",
        defaultSpeed: 1,
        name: "猫头乐",
    },
    {
        playerId: 4153,
        modelId: "64153",
        icon: "T_Head_Pet_Mianmian03",
        defaultSpeed: 1,
        name: "风吹盛夏",
    },
    {
        playerId: 4163,
        modelId: "64163",
        icon: "T_Head_Pet_Qiuqiu03",
        defaultSpeed: 1,
        name: "旋风冲蜂",
    },
    {
        playerId: 4913,
        modelId: "64913",
        icon: "T_Head_Pet_HealRobot03",
        defaultSpeed: 1,
        name: "赤色十字",
    },
    {
        playerId: 4923,
        modelId: "64923",
        icon: "T_Head_Pet_BlastRobot03",
        defaultSpeed: 1,
        name: "球形闪电",
    },
    {
        playerId: 4931,
        modelId: "64931",
        icon: "T_Head_Pet_YYD01",
        defaultSpeed: 1,
        name: "我也要赛吗",
    },
]

export const raceLotteryMaxStakeData: RaceLotteryMaxStake[] = [
    {
        EventDay: 1,
        MaxStake: 100000,
    },
    {
        EventDay: 2,
        MaxStake: 300000,
    },
    {
        EventDay: 3,
        MaxStake: 300000,
    },
    {
        EventDay: 4,
        MaxStake: 300000,
    },
    {
        EventDay: 5,
        MaxStake: 300000,
    },
    {
        EventDay: 6,
        MaxStake: 300000,
    },
    {
        EventDay: 7,
        MaxStake: 300000,
    },
    {
        EventDay: 8,
        MaxStake: 300000,
    },
]

export const raceLotteryOutsideBuffs: RaceLotteryOutsideBuff[] = [
    {
        rumorId: 1001,
        buffMap: "+",
        pValueEffect: 1.05,
        randomWeight: 50,
        bannedWhenValueHigherThan: 1.4,
        name: "完美热身",
    },
    {
        rumorId: 1002,
        buffMap: "+",
        pValueEffect: 1.1,
        randomWeight: 50,
        bannedWhenValueHigherThan: 1.33,
        name: "赛前特供餐",
    },
    {
        rumorId: 1003,
        buffMap: "+",
        pValueEffect: 1.15,
        randomWeight: 50,
        bannedWhenValueHigherThan: 1.26,
        name: "注意力集中",
    },
    {
        rumorId: 1004,
        buffMap: "++",
        pValueEffect: 1.2,
        randomWeight: 30,
        bannedWhenValueHigherThan: 1.19,
        name: "全新装备",
    },
    {
        rumorId: 1005,
        buffMap: "++",
        pValueEffect: 1.3,
        randomWeight: 30,
        bannedWhenValueHigherThan: 1.12,
        name: "全身心投入",
    },
    {
        rumorId: 1006,
        buffMap: "+++",
        pValueEffect: 2,
        randomWeight: 10,
        bannedWhenValueHigherThan: 1.05,
        name: "大师特训",
    },
    {
        rumorId: 2001,
        buffMap: "-",
        pValueEffect: 0.95,
        randomWeight: 50,
        bannedWhenValueLowerThan: 0.6,
        name: "小有压力",
    },
    {
        rumorId: 2002,
        buffMap: "-",
        pValueEffect: 0.91,
        randomWeight: 50,
        bannedWhenValueLowerThan: 0.67,
        name: "习惯性崴脚",
    },
    {
        rumorId: 2003,
        buffMap: "-",
        pValueEffect: 0.87,
        randomWeight: 50,
        bannedWhenValueLowerThan: 0.74,
        name: "紧张焦虑",
    },
    {
        rumorId: 2004,
        buffMap: "--",
        pValueEffect: 0.83,
        randomWeight: 30,
        bannedWhenValueLowerThan: 0.81,
        name: "浴室误滑倒",
    },
    {
        rumorId: 2005,
        buffMap: "--",
        pValueEffect: 0.77,
        randomWeight: 30,
        bannedWhenValueLowerThan: 0.88,
        name: "错食过期罐",
    },
    {
        rumorId: 2006,
        buffMap: "---",
        pValueEffect: 0.5,
        randomWeight: 10,
        bannedWhenValueLowerThan: 0.95,
        name: "情绪失控",
    },
]

export const raceLotteryInsideBuffs: RaceLotteryInsideBuff[] = [
    {
        insideBuffId: 1001,
        unlockDay: 1,
        effect: 1,
        randomWeight: 120,
        name: "匀速",
        description: "<H>%s</>使用了<H>匀速</>，稳扎稳打向前跑去。",
    },
    {
        insideBuffId: 2001,
        unlockDay: 1,
        effect: 0,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Puase.NS_Pet_Race_Speed_Puase'",
        randomWeight: 15,
        name: "躺平",
        description: "<H>%s</>使用了<H>躺平</>，原地停下了！",
    },
    {
        insideBuffId: 2002,
        unlockDay: 2,
        effect: 0,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Puase.NS_Pet_Race_Speed_Puase'",
        randomWeight: 15,
        name: "躺平",
        description: "<H>%s</>使用了<H>躺平</>，原地停下了！",
    },
    {
        insideBuffId: 3001,
        unlockDay: 1,
        effect: 1.2,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Buff.NS_Pet_Race_Speed_Buff'",
        randomWeight: 40,
        name: "调息",
        description: "<H>%s</>使用了<H>调息</>，整理好气息，方能一鼓作气。",
    },
    {
        insideBuffId: 3002,
        unlockDay: 1,
        effect: 2,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Buff.NS_Pet_Race_Speed_Buff'",
        randomWeight: 0,
        name: "冲刺",
        description: "<H>%s</>使用了<H>冲刺</>，朝着终点线飞奔而去。",
    },
    {
        insideBuffId: 3003,
        unlockDay: 2,
        effect: 2,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Buff.NS_Pet_Race_Speed_Buff'",
        randomWeight: 20,
        name: "呐喊",
        description: "<H>%s</>使用了<H>呐喊</>，大叫一声给自己加油鼓劲。",
    },
    {
        insideBuffId: 4001,
        unlockDay: 1,
        effect: 0.83,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Debuff.NS_Pet_Race_Speed_Debuff'",
        randomWeight: 40,
        name: "搭讪",
        description: "<H>%s</>使用了<H>搭讪</>，慢下来和隔壁魔灵搭话。",
    },
    {
        insideBuffId: 4002,
        unlockDay: 2,
        effect: 0.5,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Debuff.NS_Pet_Race_Speed_Debuff'",
        randomWeight: 20,
        name: "幻想",
        description: "<H>%s</>使用了<H>幻想</>，还没比完就开始思考赛后吃什么。",
    },
    {
        insideBuffId: 5001,
        unlockDay: 1,
        effect: -1,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Stun.NS_Pet_Race_Speed_Stun'",
        randomWeight: 10,
        name: "迷路",
        description: "<H>%s</>使用了<H>迷路</>，一阵晕头转向后，竟往起点跑去了。",
    },
    {
        insideBuffId: 5002,
        unlockDay: 2,
        effect: -1,
        effectPath: "NiagaraSystem'/Game/Asset/Effect/Niagara/GamePlay/NS_Pet_Race_Speed_Stun.NS_Pet_Race_Speed_Stun'",
        randomWeight: 20,
        name: "迷路",
        description: "<H>%s</>使用了<H>迷路</>，一阵晕头转向后，竟往起点跑去了。",
    },
]

export const raceLotteryConstants: Record<string, number | string> = {
    EventId: 103025,
    EventResultJumpId: 120,
    EventShopJumpId: 115,
    PlayerOutsideBuffNum: 3,
    RaceInsideBuffInterval: 2.5,
    RaceLotteryAudienceCoefficient: 10,
    RaceLotteryAudienceRefreshTime: 1,
    RaceLotteryChannelBusyMax: 75,
    RaceLotteryChannelBusyMin: 50,
    RaceLotteryChannelFullMax: 100,
    RaceLotteryChannelFullMin: 80,
    RaceLotteryChannelNormalMax: 20,
    RaceLotteryChannelNormalMin: 10,
    RaceLotteryCurrency: 10302501,
    RaceLotteryEndTime: 0.8333333333333334,
    RaceLotteryRegionOnlineId: 106001,
    RaceLotteryResultTime: 0.8541666666666666,
    RaceLotteryStartTime: 0.20833333333333334,
    RaceLotteryStartpointid: 22,
    RaceLotterySubregionid: 106001,
    RacePlayerNum: 18,
    RaceTimeOutTime: 30,
    RaceTimeOutTimeBuff: 3002,
    RaceTrackLength: 100,
    RaceTrackNumSamples_Max: 200,
    RaceTrackNumSamples_Min: 50,
    RaceTrackRange: 1.2,
    RandomRaceId: 2,
    ShortListedPlayerNum: 6,
}

export const raceLotteryRewardRates: RaceLotteryRewardRate[] = [
    {
        RewardRate: 1.2,
        TargetHitNum: 1,
    },
    {
        RewardRate: 1.5,
        TargetHitNum: 2,
    },
    {
        RewardRate: 3,
        TargetHitNum: 3,
    },
    {
        RewardRate: 6,
        TargetHitNum: 4,
    },
    {
        RewardRate: 10,
        TargetHitNum: 5,
    },
    {
        RewardRate: 20,
        TargetHitNum: 6,
    },
]

export const raceLotteryRumorFees: RaceLotteryRumorFee[] = [
    {
        RumorInquireFee: 500,
        RumorInquireTime: 1,
    },
    {
        RumorInquireFee: 1000,
        RumorInquireTime: 2,
    },
    {
        RumorInquireFee: 1500,
        RumorInquireTime: 3,
    },
    {
        RumorInquireFee: 2000,
        RumorInquireTime: 4,
    },
    {
        RumorInquireFee: 3000,
        RumorInquireTime: 5,
    },
    {
        RumorInquireFee: 5000,
        RumorInquireTime: 6,
    },
    {
        RumorInquireFee: 10000,
        RumorInquireTime: 7,
    },
    {
        RumorInquireFee: 20000,
        RumorInquireTime: 8,
    },
    {
        RumorInquireFee: 40000,
        RumorInquireTime: 9,
    },
    {
        RumorInquireFee: 80000,
        RumorInquireTime: 10,
    },
]

export const raceLotteryData: RaceLotteryData = {
    players: raceLotteryPlayers,
    maxStakes: raceLotteryMaxStakeData,
    outsideBuffs: raceLotteryOutsideBuffs,
    insideBuffs: raceLotteryInsideBuffs,
    constants: raceLotteryConstants,
    rewardRates: raceLotteryRewardRates,
    rumorFees: raceLotteryRumorFees,
}
