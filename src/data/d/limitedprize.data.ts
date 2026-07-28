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
    BigPrizeBPPath?: string
    BigPrizeMobileBPPath?: string
    HistoryBPPath?: string
    ProcessBPPath?: string
    ProcessMobileBPPath?: string
    ResultBPPath?: string
    ResultMobileBPPath?: string
    RoundBPPath?: string
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
}

/** 限时奖池活动映射表，由 importdata 从 out 自动写入。 */
export const limitedPrizePools: Record<number, LimitedPrizePool> = {
    "103021": {
        BigPrizeBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/WBP_LimitedPrizePool_SelectPrize_P.WBP_LimitedPrizePool_SelectPrize_P'",
        BigPrizeMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/WBP_LimitedPrizePool_SelectPrize_M.WBP_LimitedPrizePool_SelectPrize_M'",
        EventId: 103021,
        HistoryBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Widget/LimitedPrizePool/History/WBP_LimitedPrizePool_DetailHistoryContent.WBP_LimitedPrizePool_DetailHistoryContent'",
        LimitedPrizePoolId: [1001, 1002],
        ProcessBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/WBP_LimitedPrizePool_Gacha_P.WBP_LimitedPrizePool_Gacha_P'",
        ProcessMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/WBP_LimitedPrizePool_Gacha_M.WBP_LimitedPrizePool_Gacha_M'",
        ResultBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/WBP_LimitedPrizePool_GetReward_P.WBP_LimitedPrizePool_GetReward_P'",
        ResultMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/WBP_LimitedPrizePool_GetReward_M.WBP_LimitedPrizePool_GetReward_M'",
        RoundBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Widget/LimitedPrizePool/WBP_LimitedPrizePool_RewardSwitchTip.WBP_LimitedPrizePool_RewardSwitchTip'",
    },
    "10302101": {
        BigPrizeBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/Nun/WBP_LimitedPrizePool_SelectPrize_Nun_P.WBP_LimitedPrizePool_SelectPrize_Nun_P'",
        BigPrizeMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/Nun/WBP_LimitedPrizePool_SelectPrize_Nun_M.WBP_LimitedPrizePool_SelectPrize_Nun_M'",
        EventId: 10302101,
        HistoryBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Widget/LimitedPrizePool/Nun/History/WBP_LimitedPrizePool_DetailHistoryContent_Nun.WBP_LimitedPrizePool_DetailHistoryContent_Nun'",
        LimitedPrizePoolId: [1003, 1004],
        ProcessBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/Nun/WBP_LimitedPrizePool_Gacha_Nun_P.WBP_LimitedPrizePool_Gacha_Nun_P'",
        ProcessMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/Nun/WBP_LimitedPrizePool_Gacha_Nun_M.WBP_LimitedPrizePool_Gacha_Nun_M'",
        ResultBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/Nun/WBP_LimitedPrizePool_GetReward_Nun_P.WBP_LimitedPrizePool_GetReward_Nun_P'",
        ResultMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/Nun/WBP_LimitedPrizePool_GetReward_Nun_M.WBP_LimitedPrizePool_GetReward_Nun_M'",
        RoundBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Widget/LimitedPrizePool/Nun/WBP_LimitedPrizePool_RewardSwitchTip_Nun.WBP_LimitedPrizePool_RewardSwitchTip_Nun'",
    },
    "10302102": {
        BigPrizeBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/Succubus/WBP_LimitedPrizePool_SelectPrize_Succubus_P.WBP_LimitedPrizePool_SelectPrize_Succubus_P'",
        BigPrizeMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/Succubus/WBP_LimitedPrizePool_SelectPrize_Succubus_M.WBP_LimitedPrizePool_SelectPrize_Succubus_M'",
        BigPrizeSoundEffects: "event:/ui/activity/limit_gift_pool_sub_page_in_lingren",
        BigPrizeVideoPath:
            "FileMediaSource'/Game/Asset/UIVideo/SystemShow/Activity/Activity_LimitedPrizePool_BG01.Activity_LimitedPrizePool_BG01'",
        EventId: 10302102,
        HistoryBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Widget/LimitedPrizePool/Succubus/History/WBP_LimitedPrizePool_DetailHistoryContent_Succubus.WBP_LimitedPrizePool_DetailHistoryContent_Succubus'",
        LimitedPrizePoolId: [1005, 1006],
        ProcessBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/Succubus/WBP_LimitedPrizePool_Gacha_Succubus_P.WBP_LimitedPrizePool_Gacha_Succubus_P'",
        ProcessMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/Succubus/WBP_LimitedPrizePool_Gacha_Succubus_M.WBP_LimitedPrizePool_Gacha_Succubus_M'",
        ProcessSoundEffects: "event:/ui/activity/limit_gift_pool_gacha_show_lingren",
        ResultBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/PC/LimitedPrizePool/Succubus/WBP_LimitedPrizePool_GetReward_Succubus_P.WBP_LimitedPrizePool_GetReward_Succubus_P'",
        ResultMobileBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Mobile/LimitedPrizePool/Succubus/WBP_LimitedPrizePool_GetReward_Succubus_M.WBP_LimitedPrizePool_GetReward_Succubus_M'",
        RoundBPPath:
            "WidgetBlueprint'/Game/UI/WBP/Activity/Widget/LimitedPrizePool/Succubus/WBP_LimitedPrizePool_RewardSwitchTip_Succubus.WBP_LimitedPrizePool_RewardSwitchTip_Succubus'",
    },
}
