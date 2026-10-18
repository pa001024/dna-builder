export function getMonsterType(type: "Rescue_Elite_Monster" | "Elite_Monster" | "Boss" | undefined) {
    const typeMap: Record<string, { t: string; label: string; color: string }> = {
        Rescue_Elite_Monster: { t: "Rescue_Elite_Monster", label: "精英", color: "bg-blue-500" },
        Boss: { t: "Boss", label: "首领", color: "bg-red-500" },
        Elite_Monster: { t: "Elite_Monster", label: "精英", color: "bg-blue-500" },
    }
    if (!type) {
        return { t: "", label: "普通", color: "bg-gray-500" }
    }

    return typeMap[type] || { t: type, label: type, color: "bg-gray-500" }
}

/**
 * 根据怪物类型返回列表背景使用的稀有度。
 * @param type 怪物类型
 * @returns 稀有度值
 */
export function getMonsterListRarity(type: "Rescue_Elite_Monster" | "Elite_Monster" | "Boss" | undefined): number {
    if (type === "Boss") {
        return 5
    }

    if (type === "Elite_Monster" || type === "Rescue_Elite_Monster") {
        return 4
    }

    return 3
}
