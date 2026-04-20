interface QuestTypeDisplay {
    icon: string
    name: string
}

const QUEST_TYPE_DISPLAY_MAP: Record<number, QuestTypeDisplay> = {
    1: {
        icon: "T_Gp_MainMission",
        name: "主线任务",
    },
    2: {
        icon: "T_Gp_MainMission",
        name: "主线任务",
    },
    3: {
        icon: "T_Gp_SideMission",
        name: "支线任务",
    },
    4: {
        icon: "T_Gp_SideMission",
        name: "支线任务",
    },
    5: {
        icon: "T_Gp_LTMission",
        name: "限时任务",
    },
    6: {
        icon: "T_Gp_EventMainMission",
        name: "活动任务",
    },
}

/**
 * 获取任务类型的图标与名称。
 * @param type 任务类型
 * @returns 类型显示信息
 */
export function getQuestTypeDisplay(type: number): QuestTypeDisplay {
    return (
        QUEST_TYPE_DISPLAY_MAP[type] ?? {
            icon: "T_Gp_MainMission",
            name: `类型${type}`,
        }
    )
}

/**
 * 获取任务类型图标名称。
 * @param type 任务类型
 * @returns 图标名称
 */
export function getQuestIcon(type: number) {
    return getQuestTypeDisplay(type).icon
}

/**
 * 获取任务类型名称。
 * @param type 任务类型
 * @returns 类型名称
 */
export function getQuestName(type: number) {
    return getQuestTypeDisplay(type).name
}
