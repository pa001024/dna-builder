export function getRarityName(rarity: number): string {
    return (
        {
            1: "白",
            2: "绿",
            3: "蓝",
            4: "紫",
            5: "金",
            6: "红",
        }[rarity] || "白"
    )
}

export function getRarityValue(rarity: string): number {
    return (
        {
            白: 1,
            绿: 2,
            蓝: 3,
            紫: 4,
            金: 5,
            红: 6,
        }[rarity] || 0
    )
}

/**
 * 根据稀有度返回背景渐变色。
 * @param rarity 稀有度（1~6 或中文名）
 * @returns Tailwind 渐变类名
 */
export function getRarityGradientClass(rarity: number | string): string {
    const rarityMap: Record<number, string> = {
        1: "from-gray-900/80 to-gray-100/80",
        2: "from-green-900/80 to-green-100/80",
        3: "from-blue-900/80 to-blue-100/80",
        4: "from-purple-900/80 to-purple-100/80",
        5: "from-yellow-900/80 to-yellow-100/80",
        6: "from-red-900/80 to-red-100/80",
    }
    return rarityMap[typeof rarity === "string" ? getRarityValue(rarity) : rarity] || rarityMap[1]
}

/**
 * 根据稀有度返回统一的色块类名。
 *
 * 界面**只用颜色**表示稀有度，不显示文字：稀有度在数据里是「白/绿/蓝/紫/金/红」这类单字简写，
 * 它们同时也是游戏原文（剧情人物「白」、道具与场景名等），拿简写当翻译键会把同名文本一起翻错。
 * 返回值包含完整形状（内联块 / 尺寸 / 圆角 / 边框），调用处无需再补形状类。
 * @param rarity 稀有度（1~6 或中文名"白绿蓝紫金红"）
 * @returns 完整色块类名，可直接绑定到 :class
 */
export function getRaritySwatchClass(rarity: number | string): string {
    const colorMap: Record<number, string> = {
        1: "border-gray-400/50 bg-gray-400/80",
        2: "border-green-500/50 bg-green-500/80",
        3: "border-blue-500/50 bg-blue-500/80",
        4: "border-purple-500/50 bg-purple-500/80",
        5: "border-yellow-500/50 bg-yellow-500/80",
        6: "border-red-500/50 bg-red-500/80",
    }
    const key = typeof rarity === "string" ? getRarityValue(rarity) : rarity
    const color = colorMap[key] || colorMap[1]
    return `inline-block size-2.5 shrink-0 rounded-xs border ${color}`
}
