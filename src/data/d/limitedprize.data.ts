export interface LimitedPrizeCostRule {
    CostResCount: number[]
    CostResourceId: number
    CostRuleId: number
    GetBestPrizeNum: number
}

export interface LimitedPrizeItem {
    CostRuleId: number
    Count: number[]
    Id: number[][]
    LimitedPrizePoolId: number
    Probability: number[]
    Type: number[]
}

export interface LimitedPrizePool {
    EventId: number
    LimitedPrizePoolId: number[]
    /**
     * 集齐奖励：奖品档位索引（字符串形式的 1-based 整数，对应当轮 LimitedPrizeItem.Type/Id/Count 的下标，允许稀疏）
     * -> [物品类型索引（ItemUtils.GetItemType：0=Char … 6=Resource 7=HeadFrame 8=HeadSculpture 9=Background）, 物品ID, 数量]。
     * 对齐游戏内集齐奖励 UI（WBP_LimitedPrizePool_Dialog_CollectReward_C / WBP_LimitedPrizePool_CollectReward_Doll_C），
     * 由 importdata 从上游 LimitedPrizePool.ExtraItem 归一化写入（稠密数组收敛为该记录形状）。
     */
    ExtraItem?: Record<string, [number, number, number]>
}

/** 限时奖池成本规则，由 importdata 从 out 自动写入。 */
export const limitedPrizeCostRules: Record<number, LimitedPrizeCostRule> = {
    "1001": {
        CostResCount: [1, 3, 6, 10, 15, 20, 25, 30],
        CostResourceId: 1009,
        CostRuleId: 1001,
        GetBestPrizeNum: 0,
    },
    "1002": {
        CostResCount: [1, 3, 6, 10, 15, 20, 25, 30],
        CostResourceId: 1009,
        CostRuleId: 1002,
        GetBestPrizeNum: 0,
    },
}

/** 限时奖池奖品表，由 importdata 从 out 自动写入。 */
export const limitedPrizeItems: Record<number, LimitedPrizeItem> = {
    "1001": {
        CostRuleId: 1001,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[410101, 180101], [21007, 21006], [40035, 40034], [10098, 10099], [10032, 10033], [30125, 30124], [30112], [208]],
        LimitedPrizePoolId: 1001,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1002": {
        CostRuleId: 1002,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[410101, 180101], [21007, 21006], [40035, 40034], [10098, 10099], [10032, 10033], [30125, 30124], [30112], [208]],
        LimitedPrizePoolId: 1002,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1003": {
        CostRuleId: 1001,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[150201, 310101], [21011, 21012], [13037, 13039], [20082, 20084], [10037, 10038], [20008, 20009], [30112], [208]],
        LimitedPrizePoolId: 1003,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1004": {
        CostRuleId: 1002,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[150201, 310101], [21011, 21012], [13037, 13039], [20082, 20084], [10037, 10038], [20008, 20009], [30112], [208]],
        LimitedPrizePoolId: 1004,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1005": {
        CostRuleId: 1001,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[320201, 310201], [70061, 70006], [40083, 40080], [20095, 20094], [10045, 10044], [20012, 20011], [30112], [208]],
        LimitedPrizePoolId: 1005,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1006": {
        CostRuleId: 1002,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[320201, 310201], [70061, 70006], [40083, 40080], [20095, 20094], [10045, 10044], [20012, 20011], [30112], [208]],
        LimitedPrizePoolId: 1006,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1007": {
        CostRuleId: 1001,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[530102, 110101], [80065, 80064], [13057, 13058], [10159, 10160], [10047, 10048], [20013, 20014], [30112], [208]],
        LimitedPrizePoolId: 1007,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1008": {
        CostRuleId: 1002,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[530102, 110101], [80065, 80064], [13057, 13058], [10159, 10160], [10047, 10048], [20013, 20014], [30112], [208]],
        LimitedPrizePoolId: 1008,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1009": {
        CostRuleId: 1001,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[510102, 150101], [21018, 21017], [40094, 40095], [20110, 20111], [10047, 10048], [30184, 30185], [30112], [208]],
        LimitedPrizePoolId: 1009,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
    "1010": {
        CostRuleId: 1002,
        Count: [1, 1, 1, 1, 1, 1, 3, 6],
        Id: [[510102, 150101], [21018, 21017], [40094, 40095], [20110, 20111], [10047, 10048], [30184, 30185], [30112], [208]],
        LimitedPrizePoolId: 1010,
        Probability: [8, 92, 100, 200, 1300, 1300, 3500, 3500],
        Type: [2, 4, 4, 4, 7, 8, 6, 6],
    },
}

/** 限时奖池活动映射表，由 importdata 从 out 自动写入。 */
export const limitedPrizePools: Record<number, LimitedPrizePool> = {
    "103021": {
        EventId: 103021,
        LimitedPrizePoolId: [1001, 1002],
        ExtraItem: {
            "1": [9, 1006, 1],
            "2": [4, 21019, 1],
            "3": [4, 40037, 1],
            "4": [4, 10101, 1],
        },
    },
    "10302101": {
        EventId: 10302101,
        LimitedPrizePoolId: [1003, 1004],
    },
    "10302102": {
        EventId: 10302102,
        LimitedPrizePoolId: [1005, 1006],
    },
    "10302103": {
        EventId: 10302103,
        LimitedPrizePoolId: [1007, 1008],
        ExtraItem: {
            "2": [4, 80059, 1],
            "3": [4, 13059, 1],
            "4": [4, 10161, 1],
        },
    },
    "10302104": {
        EventId: 10302104,
        LimitedPrizePoolId: [1009, 1010],
        ExtraItem: {
            "1": [9, 1005, 1],
            "2": [4, 21016, 1],
            "3": [4, 40096, 1],
            "4": [4, 20112, 1],
        },
    },
}
