// 获取副本类型信息
export function getDungeonType(type: string): { t: string; label: string; color: string } {
    const typeMap: Record<string, { t: string; label: string; color: string }> = {
        Capture: { t: "Capture", label: "追缉", color: "bg-red-500" },
        Defence: { t: "Defence", label: "扼守", color: "bg-blue-500" },
        DefenceMove: { t: "DefenceMove", label: "扼守M", color: "bg-blue-500" },
        DefencePro: { t: "DefencePro", label: "扼守+", color: "bg-blue-500" },
        Excavation: { t: "Excavation", label: "勘察", color: "bg-green-500" },
        ExtermPro: { t: "ExtermPro", label: "驱离", color: "bg-orange-600" },
        Exterminate: { t: "Exterminate", label: "驱逐", color: "bg-red-600" },
        Hijack: { t: "Hijack", label: "迁移", color: "bg-pink-500" },
        Rescue: { t: "Rescue", label: "护送", color: "bg-cyan-500" },
        Sabotage: { t: "Sabotage", label: "调停", color: "bg-teal-500" },
        SabotagePro: { t: "SabotagePro", label: "拆解", color: "bg-emerald-600" },
        SoloRaid: { t: "SoloRaid", label: "单人", color: "bg-indigo-500" },
        Survival: { t: "Survival", label: "探险", color: "bg-lime-500" },
        SurvivalMini: { t: "SurvivalMini", label: "探险M", color: "bg-lime-500" },
        SurvivalMiniPro: { t: "SurvivalMiniPro", label: "探险M+", color: "bg-lime-500" },
        SurvivalPro: { t: "SurvivalPro", label: "探险+", color: "bg-lime-500" },
        Synthesis: { t: "Synthesis", label: "竞逐", color: "bg-violet-500" },
    }
    return typeMap[type] || { t: type, label: type, color: "bg-gray-500" }
}
