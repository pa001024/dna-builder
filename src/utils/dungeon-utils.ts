// 获取副本类型信息
export function getDungeonType(type: string): { label: string; color: string } {
    const typeMap: Record<string, { label: string; color: string }> = {
        Capture: { label: "追缉", color: "bg-red-500" },
        Defence: { label: "扼守", color: "bg-blue-500" },
        DefenceMove: { label: "扼守M", color: "bg-purple-500" },
        DefencePro: { label: "扼守+", color: "bg-blue-600" },
        Excavation: { label: "勘察", color: "bg-green-500" },
        ExtermPro: { label: "驱离+", color: "bg-orange-600" },
        Exterminate: { label: "驱逐", color: "bg-red-600" },
        Hijack: { label: "迁移", color: "bg-pink-500" },
        Paotai: { label: "炮台", color: "bg-yellow-500" },
        Rescue: { label: "护送", color: "bg-cyan-500" },
        Sabotage: { label: "调停", color: "bg-teal-500" },
        SabotagePro: { label: "拆解", color: "bg-emerald-600" },
        SoloRaid: { label: "单人副本", color: "bg-indigo-500" },
        Survival: { label: "探险", color: "bg-lime-500" },
        SurvivalMini: { label: "探险小", color: "bg-lime-400" },
        SurvivalMiniPro: { label: "探险小+", color: "bg-lime-600" },
        SurvivalPro: { label: "探险+", color: "bg-green-600" },
        Synthesis: { label: "竟逐", color: "bg-violet-500" },
    }
    return typeMap[type] || { label: type, color: "bg-gray-500" }
}
