export function getMonsterType(type: "Rescue_Elite_Monster" | "Elite_Monster" | "Boss") {
    const typeMap: Record<string, { t: string; label: string; color: string }> = {
        Boss: { t: "Boss", label: "首领", color: "bg-red-500" },
        Elite_Monster: { t: "Elite_Monster", label: "精英", color: "bg-blue-500" },
    }
    return typeMap[type] || { t: type, label: type, color: "bg-gray-500" }
}
