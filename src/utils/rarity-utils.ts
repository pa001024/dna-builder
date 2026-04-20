export function getRarityName(rarity: number): string {
    return (
        {
            1: "金",
            2: "紫",
            3: "蓝",
            4: "绿",
            5: "白",
        }[rarity] || "白"
    )
}

export function getRarityValue(rarity: string): number {
    return (
        {
            金: 5,
            紫: 4,
            蓝: 3,
            绿: 2,
            白: 1,
        }[rarity] || 0
    )
}

/**
 * 根据稀有度返回背景渐变色。
 * @param rarity 稀有度（1~5）
 * @returns Tailwind 渐变类名
 */
export function getRarityGradientClass(rarity: number | string): string {
    const rarityMap: Record<number, string> = {
        1: "from-gray-900/80 to-gray-100/80",
        2: "from-green-900/80 to-green-100/80",
        3: "from-blue-900/80 to-blue-100/80",
        4: "from-purple-900/80 to-purple-100/80",
        5: "from-yellow-900/80 to-yellow-100/80",
    }
    return rarityMap[typeof rarity === "string" ? getRarityValue(rarity) : rarity] || rarityMap[1]
}

/**
 * 根据稀有度返回徽章颜色。
 * @param rarity 稀有度（1~5）
 * @returns Tailwind 颜色类名
 */
export function getRarityBadgeClass(rarity: number): string {
    const rarityMap: Record<number, string> = {
        1: "bg-gray-200 text-gray-800",
        2: "bg-green-200 text-green-800",
        3: "bg-blue-200 text-blue-800",
        4: "bg-purple-200 text-purple-800",
        5: "bg-yellow-200 text-yellow-800",
    }

    return rarityMap[rarity] || "bg-base-200 text-base-content"
}
