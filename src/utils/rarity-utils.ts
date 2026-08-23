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
 * 根据稀有度返回统一的稀有度徽章类名。
 * 造型与 CopyID 方章一致：直角细边框 + 半透明底色 + 同色系文字；
 * 返回值包含完整形状（内联弹性盒 / 内边距 / 字号），调用处无需再补形状类。
 * @param rarity 稀有度（1~6 或中文名"白绿蓝紫金红"）
 * @returns 完整徽章类名，可直接绑定到 :class
 */
export function getRarityBadgeClass(rarity: number | string): string {
    const colorMap: Record<number, string> = {
        1: "border-gray-400/40 bg-gray-400/10 text-gray-300",
        2: "border-green-500/40 bg-green-500/10 text-green-400",
        3: "border-blue-500/40 bg-blue-500/10 text-blue-400",
        4: "border-purple-500/40 bg-purple-500/10 text-purple-400",
        5: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
        6: "border-red-500/40 bg-red-500/10 text-red-400",
    }
    const key = typeof rarity === "string" ? getRarityValue(rarity) : rarity
    const color = colorMap[key] || "border-base-content/20 bg-base-content/5 text-base-content/60"
    return `inline-flex shrink-0 items-center rounded-xs border px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide ${color}`
}
