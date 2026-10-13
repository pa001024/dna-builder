const ELEMENT_ORDER = ["光", "暗", "水", "火", "雷", "风"] as const

export type ElementName = (typeof ELEMENT_ORDER)[number]

/**
 * 根据元素属性返回图像区淡渐变背景。
 * @param element 元素属性（光/暗/水/火/雷/风）
 * @returns Tailwind 渐变类名，未知元素时返回空串
 */
export function getElementSoftBgClass(element: string): string {
    const elementMap: Record<string, string> = {
        光: "bg-linear-to-b from-yellow-500/25 to-yellow-100/10",
        暗: "bg-linear-to-b from-gray-600/25 to-gray-200/10",
        水: "bg-linear-to-b from-blue-500/25 to-blue-100/10",
        火: "bg-linear-to-b from-red-500/25 to-red-100/10",
        雷: "bg-linear-to-b from-violet-500/25 to-violet-100/10",
        风: "bg-linear-to-b from-emerald-500/25 to-emerald-100/10",
    }
    return elementMap[element] || ""
}

/**
 * 根据元素属性返回强调色（色点/描边等小面积点缀用）。
 * @param element 元素属性（光/暗/水/火/雷/风）
 * @returns hex 颜色，未知元素时返回 undefined
 */
export function getElementAccentColor(element: string): string | undefined {
    const colorMap: Record<string, string> = {
        光: "#f59e0b",
        暗: "#6b7280",
        水: "#3b82f6",
        火: "#ef4444",
        雷: "#8b5cf6",
        风: "#10b981",
    }
    return colorMap[element]
}

/**
 * 根据元素属性返回悬停渐变色（卡片顶部色条显现用）。
 * @param element 元素属性（光/暗/水/火/雷/风）
 * @returns Tailwind 渐变类名，未知元素时回退为灰色
 */
export function getElementGradientClass(element: string): string {
    const gradientMap: Record<string, string> = {
        光: "from-yellow-400 to-yellow-600",
        暗: "from-gray-400 to-gray-700",
        水: "from-blue-400 to-blue-600",
        火: "from-red-400 to-red-600",
        雷: "from-purple-400 to-purple-600",
        风: "from-green-400 to-green-600",
    }
    return gradientMap[element] || "from-gray-400 to-gray-600"
}

/**
 * 根据元素属性返回卡片悬停边框色。
 * @param element 元素属性（光/暗/水/火/雷/风）
 * @returns Tailwind hover 边框类名，未知元素时回退为中性边框
 */
export function getElementHoverBorderClass(element: string): string {
    const borderMap: Record<string, string> = {
        光: "hover:border-yellow-500/70",
        暗: "hover:border-gray-500/70",
        水: "hover:border-blue-500/70",
        火: "hover:border-red-500/70",
        雷: "hover:border-purple-500/70",
        风: "hover:border-green-500/70",
    }
    return borderMap[element] || "hover:border-base-content/40"
}

/**
 * 根据元素属性返回英文徽记（卡片装饰性等宽大写徽记用）。
 * @param element 元素属性（光/暗/水/火/雷/风）
 * @returns 英文名，未知元素时返回空串
 */
export function getElementDisplayName(element: string): string {
    const nameMap: Record<string, string> = {
        光: "Light",
        暗: "Dark",
        水: "Water",
        火: "Fire",
        雷: "Thunder",
        风: "Wind",
    }
    return nameMap[element] || ""
}
