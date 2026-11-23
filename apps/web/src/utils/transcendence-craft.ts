export interface CraftSummaryText {
    title: string
    label: string
    desc: string
}

export interface CraftGrowthInfo {
    /** 数据字段 `enchantGrowthFactor`：每次在基础费用上追加的倍率 */
    factor: number
    /** 数据字段 `enchantGrowthMaxCount`：追加倍率的封顶步数（不是附魔次数上限） */
    maxSteps: number
    /** 首次费用倍率（公式第 1 次为 1× 基础费用） */
    firstMultiplier: number
    /** 封顶倍率 = 1 + 封顶步数 × 递增倍率 */
    capMultiplier: number
    /** 达到封顶倍率的附魔次数 = 封顶步数 + 1 */
    capAt: number
}

/**
 * 概览 CRAFT 摘要卡的标题取舍。
 *
 * 官方标题（数据包 `crafts[].title`）优先；与界面标签同字时只保留一份。
 * 不同字时两者并列展示——标签承担原有语义（如「最终精锻」「添加」），
 * 标题仍是游戏原文。官方标题缺失时回退标签，避免空白卡片。
 * @param officialTitle 官方标题（已按当前语言解析）
 * @param label 界面标签（已按当前语言解析）
 * @returns title 为主标题；label 为需要并列展示的界面标签（空串表示不展示）
 */
export function resolveCraftHeadings(officialTitle: string, label: string): { title: string; label: string } {
    const title = officialTitle.trim()
    const text = label.trim()

    return {
        title: title || text,
        label: title && title !== text ? text : "",
    }
}

/**
 * 概览 CRAFT 摘要卡的全部展示文案：标题回退规则 + 说明去首尾空白。
 *
 * 纯空白说明视为缺失（返回空串，模板不渲染段落）；
 * 官方标题与标签同时缺失时主标题为空，调用方不再渲染链接。
 * @param craft 数据包中的官方文案（已按当前语言解析，字段可缺失）
 * @param label 界面标签（已按当前语言解析）
 * @returns 主标题、次要标签与说明
 */
export function resolveCraftSummaryText(craft: { title?: string; desc?: string }, label: string): CraftSummaryText {
    return {
        ...resolveCraftHeadings(craft.title ?? "", label),
        desc: (craft.desc ?? "").trim(),
    }
}

/**
 * 附魔费用成长（数据推导，非官方文案）。
 *
 * 上游公式：`ceil(base × (1 + min(max(Times - 1, 0), EnchantGrowthMaxCount) × EnchantGrowthFactor))`。
 * 封顶步数只限制费用倍率的成长，不限制附魔次数；`Times` 超出封顶后费用倍率保持不变。
 * @param factor 数据字段 `enchantGrowthFactor`（缺失或 ≤0 视为无成长）
 * @param maxCount 数据字段 `enchantGrowthMaxCount`（缺失时按上游默认 1）
 * @returns 展示所需倍率；无成长时返回 null
 */
export function resolveCraftGrowth(factor?: number, maxCount?: number): CraftGrowthInfo | null {
    if (factor === undefined || !Number.isFinite(factor) || factor <= 0) return null

    const steps = Math.floor(maxCount ?? 1)
    if (!Number.isFinite(steps) || steps < 1) return null

    return {
        factor: roundCraftNumber(factor),
        maxSteps: steps,
        firstMultiplier: 1,
        capMultiplier: roundCraftNumber(1 + steps * factor),
        capAt: steps + 1,
    }
}

/**
 * 去除浮点尾差，保留最多 3 位小数。
 * @param value 原始数值
 * @returns 用于文案渲染的数值
 */
function roundCraftNumber(value: number): number {
    return Number(value.toFixed(3))
}
