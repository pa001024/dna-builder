/**
 * 万华（皮肤抽卡）卡池定义。
 */
export interface SkinGacha {
    id: number
    name: string
    desc: string
    warning: string
    coreDes: string
    coreDesColor: number
    type: string
    subTabId: number
    tabId: number
    sequence: number
    gachaTimes: number
    displayType: number
    historyType: number
    hideCountdown?: boolean | null
    cost: {
        /** 消耗资源列表（按优先级依次消耗） */
        res: number[]
        /** 十连消耗数量 */
        num10: number
        /** 展示用资源列表 */
        displayRes: number[]
    }
    probabilityId: number
    conditionId: number
    star3ItemId: number
    star4ItemId: number
    star5ItemId: number
    startTime?: number | null
    endTime?: number | null
}

/**
 * 万华卡池奖励条目。
 */
export interface SkinGachaReward {
    /** 道具 id */
    id: number
    /** 道具类型（部分条目缺失，需要按 id 回退解析） */
    t?: string
    /** 权重，-1 表示等权 */
    p: number
    /** 数量 */
    c: number
    /** 名称（部分条目缺失，需要按 id 回退解析） */
    n?: string
}

/**
 * 万华星级奖池（按品质分池）。
 */
export interface SkinGachaItemPool {
    id: number
    rewards: SkinGachaReward[]
}

/**
 * 万华页签（卡池 Banner）。
 */
export interface SkinGachaTab {
    tabId: number
    name: string
    icon: string
    reddotNode: string
    sequence: number
    gachaIds: number[]
}

/**
 * 万华卡池类型。
 */
export interface SkinGachaType {
    type: string
    name: string
    subTabId: number
}

/**
 * 万华累计抽数奖励道具。
 */
export interface SkinGachaCumulativeItem {
    id: number
    t?: string
    c: number
    n?: string
}

/**
 * 万华累计抽数奖励档位。
 */
export interface SkinGachaCumulativeReward {
    rewardId: number
    target: number
    items: SkinGachaCumulativeItem[]
    mode: string
}

/**
 * 万华累计抽数奖励（按卡池）。
 */
export interface SkinGachaCumulative {
    gachaId: number
    rewards: SkinGachaCumulativeReward[]
}

/**
 * 万华抽卡概率配置（万分比）。
 */
export interface GachaProbability {
    ProbabilityId: number
    /** 金色品质基础概率（万分比） */
    ProbabilityGold: number
    /** 紫色品质基础概率（万分比） */
    ProbabilityPurple: number
    /** 金色品质保底次数 */
    ShowGetStar5Times?: number
}

export const skinGachaData: SkinGacha[] = [
    {
        id: 9001,
        name: "星光回旋曲",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>常驻万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n踏浪舞曲：<highlight>0.427%%</>\n唤日急板：<highlight>0.427%%</>\n纱幕与耳语：<highlight>0.285%%</>\n阳光磨坊：<highlight>0.285%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取已拥有的外观，将转化为水色棱镜；重复金色品质角色形象将转化为水色棱镜*<highlight>60</>，重复金色品质武器形象将转化为水色棱镜*<highlight>40</>，重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>星光回旋曲</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "常驻",
        subTabId: 1403,
        tabId: 1,
        sequence: 1,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: true,
        cost: {
            res: [1001],
            num10: 10,
            displayRes: [99, 100, 1001],
        },
        probabilityId: 9999,
        conditionId: 4041,
        star3ItemId: 99993,
        star4ItemId: 99992,
        star5ItemId: 99991,
    },
    {
        id: 9002,
        name: "夏梦纷飞集",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>活动限定万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n梦中的舞会：<highlight>0.641%%</>\n虹色棱镜*25：<highlight>0.641%%</>\n虹色棱镜*50：<highlight>0.142%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取金色品质形象梦中的舞会，将转化为虹色棱镜*<highlight>25</>。\n如果重复获取其余已拥有的外观，将转化为水色棱镜；重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>夏梦纷飞集</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "限时复刻",
        subTabId: 1402,
        tabId: 2,
        sequence: 2,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: null,
        startTime: 1780279200,
        endTime: 1785142800,
        cost: {
            res: [1004, 1003],
            num10: 10,
            displayRes: [99, 1004, 1003],
        },
        probabilityId: 1001,
        conditionId: 4041,
        star3ItemId: 99983,
        star4ItemId: 99982,
        star5ItemId: 99981,
    },
    {
        id: 9003,
        name: "潮音起天末",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>活动限定万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n素浪濯心：<highlight>0.641%%</>\n虹色棱镜*25：<highlight>0.641%%</>\n虹色棱镜*50：<highlight>0.142%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取金色品质形象素浪濯心，将转化为虹色棱镜*<highlight>25</>。\n如果重复获取其余已拥有的外观，将转化为水色棱镜；重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>潮音起天末</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "限时复刻",
        subTabId: 1401,
        tabId: 3,
        sequence: 3,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: null,
        startTime: 1785117600,
        endTime: 1788771600,
        cost: {
            res: [1004, 1003],
            num10: 10,
            displayRes: [99, 1004, 1003],
        },
        probabilityId: 1001,
        conditionId: 4041,
        star3ItemId: 99973,
        star4ItemId: 99972,
        star5ItemId: 99971,
    },
    {
        id: 9004,
        name: "宴夜诉平生",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>活动限定万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n携金宴夜：<highlight>0.641%%</>\n虹色棱镜*25：<highlight>0.641%%</>\n虹色棱镜*50：<highlight>0.142%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取金色品质形象携金宴夜，将转化为虹色棱镜*<highlight>25</>。\n如果重复获取其余已拥有的外观，将转化为水色棱镜；重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>宴夜诉平生</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "限时复刻",
        subTabId: 1401,
        tabId: 4,
        sequence: 4,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: null,
        startTime: 1788746400,
        endTime: 1792400400,
        cost: {
            res: [1004, 1003],
            num10: 10,
            displayRes: [99, 1004, 1003],
        },
        probabilityId: 1001,
        conditionId: 4041,
        star3ItemId: 99963,
        star4ItemId: 99962,
        star5ItemId: 99961,
    },
    {
        id: 9005,
        name: "执羽叩青空",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>活动限定万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n青羽天巡：<highlight>0.641%%</>\n虹色棱镜*25：<highlight>0.641%%</>\n虹色棱镜*50：<highlight>0.142%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取金色品质形象青羽天巡，将转化为虹色棱镜*<highlight>25</>。\n如果重复获取其余已拥有的外观，将转化为水色棱镜；重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>执羽叩青空</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "活动限定",
        subTabId: 1401,
        tabId: 5,
        sequence: 5,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: null,
        startTime: 1775440800,
        endTime: 1780304400,
        cost: {
            res: [1004, 1003],
            num10: 10,
            displayRes: [99, 1004, 1003],
        },
        probabilityId: 1001,
        conditionId: 4041,
        star3ItemId: 99953,
        star4ItemId: 99952,
        star5ItemId: 99951,
    },
    {
        id: 9007,
        name: "夜色与雪色",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>活动限定万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n逐光追雪：<highlight>0.641%%</>\n虹色棱镜*25：<highlight>0.641%%</>\n虹色棱镜*50：<highlight>0.142%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取金色品质形象逐光追雪，将转化为虹色棱镜*<highlight>25</>。\n如果重复获取其余已拥有的外观，将转化为水色棱镜；重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>夜色与雪色</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "活动限定",
        subTabId: 1401,
        tabId: 7,
        sequence: 7,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: null,
        startTime: 1785117600,
        endTime: 1788771600,
        cost: {
            res: [1004, 1003],
            num10: 10,
            displayRes: [99, 1004, 1003],
        },
        probabilityId: 1001,
        conditionId: 4041,
        star3ItemId: 99933,
        star4ItemId: 99932,
        star5ItemId: 99931,
    },
    {
        id: 9008,
        name: "长路何所向",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>活动限定万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n缄默猎手：<highlight>0.641%%</>\n虹色棱镜*25：<highlight>0.641%%</>\n虹色棱镜*50：<highlight>0.142%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取金色品质形象缄默猎手，将转化为虹色棱镜*<highlight>25</>。\n如果重复获取其余已拥有的外观，将转化为水色棱镜；重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>长路何所向</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "活动限定",
        subTabId: 1401,
        tabId: 8,
        sequence: 8,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: null,
        startTime: 1788746400,
        endTime: 1792400400,
        cost: {
            res: [1004, 1003],
            num10: 10,
            displayRes: [99, 1004, 1003],
        },
        probabilityId: 1001,
        conditionId: 4041,
        star3ItemId: 99923,
        star4ItemId: 99922,
        star5ItemId: 99921,
    },
    {
        id: 90021,
        name: "宽赦这良夜",
        desc: "每<highlight>10</>次寻觅必定获取紫色或紫色以上品质道具，至多<highlight>90</>次寻觅必定获取金色品质道具。",
        warning:
            "<Title>必定获取金色品质道具</>\n正在进行的寻觅 <highlight>%d</>/90\n\n<Title>活动限定万华概率说明</>\n经由寻觅获取金色品质道具的基础概率为<highlight>0.3%%</>，综合概率（含保底）为<highlight>1.42%%</>，至多<highlight>90</>次寻觅必定获取金色品质道具，其中各道具概率如下：\n赦罪者：<highlight>0.641%%</>\n虹色棱镜*25：<highlight>0.641%%</>\n虹色棱镜*50：<highlight>0.142%%</>\n经由寻觅获取紫色品质道具的基础概率为<highlight>5.1%%</>，综合概率（含保底）为<highlight>12.46%%</>，至多<highlight>10</>次寻觅必定获取紫色品质道具；\n通过保底获取紫色品质道具的概率为<highlight>99.7%%</>，获取金色品质道具的概率为<highlight>0.3%%</>。\n当触发概率提升、保底等情况时的概率，请以具体规则为准。\n\n<Title>重复获取说明</>\n如果重复获取金色品质形象赦罪者，将转化为虹色棱镜*<highlight>25</>。\n如果重复获取其余已拥有的外观，将转化为水色棱镜；重复紫色品质外观将转化为水色棱镜*<highlight>4</>，重复蓝色品质外观将转化为水色棱镜*<highlight>1</>。\n\n<Title>万华继承说明</>\n在<highlight>宽赦这良夜</>中的寻觅次数将独立计算，不与其他活动万华合并计算。",
        coreDes: "流光形象",
        coreDesColor: 5,
        type: "活动限定",
        subTabId: 1401,
        tabId: 6,
        sequence: 6,
        gachaTimes: 1,
        displayType: 1,
        historyType: 2,
        hideCountdown: null,
        startTime: 1780279200,
        endTime: 1785142800,
        cost: {
            res: [1004, 1003],
            num10: 10,
            displayRes: [99, 1004, 1003],
        },
        probabilityId: 1001,
        conditionId: 4041,
        star3ItemId: 99943,
        star4ItemId: 99942,
        star5ItemId: 99941,
    },
]

export const skinGachaItems: SkinGachaItemPool[] = [
    {
        id: 99921,
        rewards: [
            {
                id: 310401,
                t: "Skin",
                p: 4500,
                c: 1,
                n: "缄默猎手",
            },
            {
                id: 111,
                t: "Resource",
                p: 4500,
                c: 25,
                n: "虹色棱镜",
            },
            {
                id: 111,
                t: "Resource",
                p: 1000,
                c: 50,
                n: "虹色棱镜",
            },
        ],
    },
    {
        id: 99922,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
        ],
    },
    {
        id: 99923,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
    {
        id: 99931,
        rewards: [
            {
                id: 210201,
                t: "Skin",
                p: 4500,
                c: 1,
                n: "逐光追雪",
            },
            {
                id: 111,
                t: "Resource",
                p: 4500,
                c: 25,
                n: "虹色棱镜",
            },
            {
                id: 111,
                t: "Resource",
                p: 1000,
                c: 50,
                n: "虹色棱镜",
            },
        ],
    },
    {
        id: 99932,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
        ],
    },
    {
        id: 99933,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
    {
        id: 99941,
        rewards: [
            {
                id: 110201,
                t: "Skin",
                p: 4500,
                c: 1,
                n: "赦罪者",
            },
            {
                id: 111,
                t: "Resource",
                p: 4500,
                c: 25,
                n: "虹色棱镜",
            },
            {
                id: 111,
                t: "Resource",
                p: 1000,
                c: 50,
                n: "虹色棱镜",
            },
        ],
    },
    {
        id: 99942,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
            {
                id: 50004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "永恒石碑",
            },
        ],
    },
    {
        id: 99943,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
    {
        id: 99951,
        rewards: [
            {
                id: 150401,
                t: "Skin",
                p: 4500,
                c: 1,
                n: "青羽天巡",
            },
            {
                id: 111,
                t: "Resource",
                p: 4500,
                c: 25,
                n: "虹色棱镜",
            },
            {
                id: 111,
                t: "Resource",
                p: 1000,
                c: 50,
                n: "虹色棱镜",
            },
        ],
    },
    {
        id: 99952,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
            {
                id: 60003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "闪耀舞台",
            },
        ],
    },
    {
        id: 99953,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
    {
        id: 99961,
        rewards: [
            {
                id: 410201,
                t: "Skin",
                p: 4500,
                c: 1,
                n: "携金宴夜",
            },
            {
                id: 111,
                t: "Resource",
                p: 4500,
                c: 25,
                n: "虹色棱镜",
            },
            {
                id: 111,
                t: "Resource",
                p: 1000,
                c: 50,
                n: "虹色棱镜",
            },
        ],
    },
    {
        id: 99962,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
            {
                id: 50003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "银烛玩偶",
            },
        ],
    },
    {
        id: 99963,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
    {
        id: 99971,
        rewards: [
            {
                id: 240101,
                t: "Skin",
                p: 4500,
                c: 1,
                n: "素浪濯心",
            },
            {
                id: 111,
                t: "Resource",
                p: 4500,
                c: 25,
                n: "虹色棱镜",
            },
            {
                id: 111,
                t: "Resource",
                p: 1000,
                c: 50,
                n: "虹色棱镜",
            },
        ],
    },
    {
        id: 99972,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
            {
                id: 60002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "星云幻境",
            },
        ],
    },
    {
        id: 99973,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
    {
        id: 99981,
        rewards: [
            {
                id: 530101,
                t: "Skin",
                p: 4500,
                c: 1,
                n: "梦中的舞会",
            },
            {
                id: 111,
                t: "Resource",
                p: 4500,
                c: 25,
                n: "虹色棱镜",
            },
            {
                id: 111,
                t: "Resource",
                p: 1000,
                c: 50,
                n: "虹色棱镜",
            },
        ],
    },
    {
        id: 99982,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
            {
                id: 50002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "银烛焰火",
            },
        ],
    },
    {
        id: 99983,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
    {
        id: 99991,
        rewards: [
            {
                id: 3010402,
                p: 3000,
                c: 1,
            },
            {
                id: 3010301,
                p: 3000,
                c: 1,
            },
            {
                id: 210102,
                t: "Skin",
                p: 2000,
                c: 1,
                n: "纱幕与耳语",
            },
            {
                id: 510101,
                t: "Skin",
                p: 2000,
                c: 1,
                n: "阳光磨坊",
            },
        ],
    },
    {
        id: 99992,
        rewards: [
            {
                id: 10001,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·本色",
            },
            {
                id: 10002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·涅白",
            },
            {
                id: 10003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·焦糖",
            },
            {
                id: 10004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "小鸡啾啾·黛蓝",
            },
            {
                id: 10023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "天穗覆面",
            },
            {
                id: 10022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·铅灰",
            },
            {
                id: 10021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "开天英魂·鎏金",
            },
            {
                id: 10032,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "长尾蝴蝶结",
            },
            {
                id: 20012,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·本色",
            },
            {
                id: 20013,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·薄荷",
            },
            {
                id: 20014,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·锈红",
            },
            {
                id: 20015,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "雾蝶·铅灰",
            },
            {
                id: 20008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·本色",
            },
            {
                id: 20009,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·晴蓝",
            },
            {
                id: 20010,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·白樱",
            },
            {
                id: 20011,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "弧光蝶·铅灰",
            },
            {
                id: 20002,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·锈红",
            },
            {
                id: 20003,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·铅灰",
            },
            {
                id: 20004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "圆框眼镜·焦糖",
            },
            {
                id: 20024,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "铁匠皎皎的胡须",
            },
            {
                id: 20023,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "正位魔术花·涅白",
            },
            {
                id: 20022,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "逆位魔术花·锈红",
            },
            {
                id: 20021,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽",
            },
            {
                id: 20035,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "眺望飞羽·涅白",
            },
        ],
    },
    {
        id: 99993,
        rewards: [
            {
                id: 30004,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "罐装月髓液",
            },
            {
                id: 10005,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·本色",
            },
            {
                id: 10006,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·鎏金",
            },
            {
                id: 10007,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·晴蓝",
            },
            {
                id: 10008,
                t: "CharAccessory",
                p: -1,
                c: 1,
                n: "荫荫草苗·锈红",
            },
        ],
    },
]

export const skinGachaTabs: SkinGachaTab[] = [
    {
        tabId: 1,
        name: "常驻",
        icon: "T_Gacha_PoolBanner_Normal01",
        reddotNode: "Gacha_Normal",
        sequence: 99,
        gachaIds: [9001],
    },
    {
        tabId: 2,
        name: "限时复刻",
        icon: "T_Gacha_PoolBanner_Saiqi01",
        reddotNode: "Gacha_ReSpecial_1",
        sequence: 2,
        gachaIds: [9002],
    },
    {
        tabId: 3,
        name: "限时复刻",
        icon: "T_Gacha_PoolBanner_Baiheng01",
        reddotNode: "Gacha_ReSpecial_2",
        sequence: 2,
        gachaIds: [9003],
    },
    {
        tabId: 4,
        name: "限时复刻",
        icon: "T_Gacha_PoolBanner_Zhiliu01",
        reddotNode: "Gacha_ReSpecial_3",
        sequence: 2,
        gachaIds: [9004],
    },
    {
        tabId: 5,
        name: "活动限定",
        icon: "T_Gacha_PoolBanner_Suyi01",
        reddotNode: "Gacha_Special_4",
        sequence: 1,
        gachaIds: [9005],
    },
    {
        tabId: 6,
        name: "活动限定",
        icon: "T_Gacha_PoolBanner_Fuluo01",
        reddotNode: "Gacha_Special_5",
        sequence: 1,
        gachaIds: [90021],
    },
    {
        tabId: 7,
        name: "活动限定",
        icon: "T_Gacha_PoolBanner_Eve01",
        reddotNode: "Gacha_Special_6",
        sequence: 1,
        gachaIds: [9007],
    },
    {
        tabId: 8,
        name: "活动限定",
        icon: "T_Gacha_PoolBanner_Falu01",
        reddotNode: "Gacha_Special_7",
        sequence: 1,
        gachaIds: [9008],
    },
]

export const skinGachaTypes: SkinGachaType[] = [
    {
        type: "GACHA_SKIN_TYPE_NORMAL",
        name: "常驻",
        subTabId: 1403,
    },
    {
        type: "GACHA_SKIN_TYPE_SPECIAL",
        name: "限时复刻",
        subTabId: 1402,
    },
    {
        type: "GACHA_SKIN_TYPE_SPECIAL_2",
        name: "限时复刻",
        subTabId: 1401,
    },
    {
        type: "GACHA_SKIN_TYPE_SPECIAL_3",
        name: "限时复刻",
        subTabId: 1401,
    },
    {
        type: "GACHA_SKIN_TYPE_SPECIAL_4",
        name: "活动限定",
        subTabId: 1401,
    },
    {
        type: "GACHA_SKIN_TYPE_SPECIAL_5",
        name: "活动限定",
        subTabId: 1401,
    },
    {
        type: "GACHA_SKIN_TYPE_SPECIAL_6",
        name: "活动限定",
        subTabId: 1401,
    },
    {
        type: "GACHA_SKIN_TYPE_SPECIAL_7",
        name: "活动限定",
        subTabId: 1401,
    },
]

export const skinGachaCumulative: SkinGachaCumulative[] = [
    {
        gachaId: 9002,
        rewards: [
            {
                rewardId: 7601,
                target: 20,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7602,
                target: 40,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7603,
                target: 60,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7604,
                target: 80,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7605,
                target: 100,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 10,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
        ],
    },
    {
        gachaId: 9003,
        rewards: [
            {
                rewardId: 7601,
                target: 20,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7602,
                target: 40,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7603,
                target: 60,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7604,
                target: 80,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7605,
                target: 100,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 10,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
        ],
    },
    {
        gachaId: 9004,
        rewards: [
            {
                rewardId: 7601,
                target: 20,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7602,
                target: 40,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7603,
                target: 60,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7604,
                target: 80,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7605,
                target: 100,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 10,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
        ],
    },
    {
        gachaId: 9005,
        rewards: [
            {
                rewardId: 7601,
                target: 20,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7602,
                target: 40,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7603,
                target: 60,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7604,
                target: 80,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7605,
                target: 100,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 10,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
        ],
    },
    {
        gachaId: 9007,
        rewards: [
            {
                rewardId: 7601,
                target: 20,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7602,
                target: 40,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7603,
                target: 60,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7604,
                target: 80,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7605,
                target: 100,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 10,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
        ],
    },
    {
        gachaId: 9008,
        rewards: [
            {
                rewardId: 7601,
                target: 20,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7602,
                target: 40,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7603,
                target: 60,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7604,
                target: 80,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7605,
                target: 100,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 10,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
        ],
    },
    {
        gachaId: 90021,
        rewards: [
            {
                rewardId: 7601,
                target: 20,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7602,
                target: 40,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7603,
                target: 60,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7604,
                target: 80,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 5,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
            {
                rewardId: 7605,
                target: 100,
                items: [
                    {
                        id: 1004,
                        t: "Resource",
                        c: 10,
                        n: "华彩沙漏·限时",
                    },
                ],
                mode: "Fixed",
            },
        ],
    },
]

export const gachaProbabilities: Record<string, GachaProbability> = {
    "1001": {
        ProbabilityGold: 30,
        ProbabilityId: 1001,
        ProbabilityPurple: 510,
        ShowGetStar5Times: 90,
    },
    "2001": {
        ProbabilityGold: 60,
        ProbabilityId: 2001,
        ProbabilityPurple: 510,
        ShowGetStar5Times: 90,
    },
    "3001": {
        ProbabilityGold: 80,
        ProbabilityId: 3001,
        ProbabilityPurple: 660,
        ShowGetStar5Times: 80,
    },
    "9996": {
        ProbabilityGold: 80,
        ProbabilityId: 9996,
        ProbabilityPurple: 660,
        ShowGetStar5Times: 80,
    },
    "9997": {
        ProbabilityGold: 60,
        ProbabilityId: 9997,
        ProbabilityPurple: 510,
    },
    "9998": {
        ProbabilityGold: 10000,
        ProbabilityId: 9998,
        ProbabilityPurple: 0,
    },
    "9999": {
        ProbabilityGold: 30,
        ProbabilityId: 9999,
        ProbabilityPurple: 510,
        ShowGetStar5Times: 90,
    },
}
