import { charMap, weaponMap } from "./d"
import type { Buff } from "./data-types"

/**
 * BUFF 在前端呈现时的过滤上下文。
 */
export interface BuffSelectContext {
    /** 当前主控角色属性（元素） */
    charElm: string
    /** 当前主控角色 id + 当前角色装备武器 id（角色与武器 id 空间不冲突） */
    mainIds: Set<number>
    /** 助战角色 id + 助战武器 id（同一集合） */
    phantomIds: Set<number>
}

/**
 * 从当前角色与助战配置构建 BUFF 过滤上下文。
 * @param options 主控与助战 id 集合
 * @returns 过滤上下文
 */
export function createBuffSelectContext(options: {
    /** 当前主控角色属性（元素） */
    charElm: string
    /** 当前主控角色 id + 当前角色装备武器 id */
    mainIds: number[]
    /** 助战角色 id + 助战武器 id */
    phantomIds: number[]
}): BuffSelectContext {
    return {
        charElm: options.charElm,
        mainIds: new Set(options.mainIds),
        phantomIds: new Set(options.phantomIds),
    }
}

/**
 * 判断 BUFF 是否应在当前构筑中可选（前端呈现过滤）。
 *
 * 规则：
 * 1. 「限定」按 id 匹配当前主控角色（原有限定行为不变，助战不生效）；旧格式角色名/属性兜底。
 * 2. 无来源 id 的通用 BUFF 始终可选。
 * 3. 角色来源（id 属于角色表）：当前主控角色 或 助战角色。
 * 4. 武器来源（id 属于武器表）：
 *    - 「5熔」（武器熔炼）BUFF：只看当前角色装备的武器；
 *    - 「(队友)」等其余武器 BUFF：只看助战武器。
 *
 * @param buff BUFF 数据
 * @param ctx 过滤上下文
 * @returns 是否可选
 */
export function isBuffSelectable(buff: Buff, ctx: BuffSelectContext): boolean {
    // 1. 限定行为不变：仅过滤当前角色（限定已是角色 id）
    if (buff.限定) {
        if (typeof buff.限定 === "number") return ctx.mainIds.has(buff.限定)
        // 旧格式兜底：角色名 → 主控角色；属性 → 主控元素
        const char = charMap.get(buff.限定)
        if (char) return ctx.mainIds.has(char.id)
        return buff.限定 === ctx.charElm
    }
    // 2. 无来源 id 的通用 BUFF 始终可选
    if (buff.id === undefined) return true
    // 3. 角色来源：当前角色 或 助战角色
    if (charMap.has(buff.id)) {
        return ctx.mainIds.has(buff.id) || ctx.phantomIds.has(buff.id)
    }
    // 4. 武器来源：5熔看当前角色武器；(队友)等看助战武器
    if (weaponMap.has(buff.id)) {
        if (buff.名称.endsWith("5熔")) return ctx.mainIds.has(buff.id)
        return ctx.phantomIds.has(buff.id)
    }
    // 未知来源 id：仅在助战集合中才显示
    return ctx.phantomIds.has(buff.id)
}
