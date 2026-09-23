import type { Mod } from "@/data/data-types"

/** MOD 槽位类型到其承载对象（角色 / 三把武器）的取值口径 */
export type ModLimitSlot = "角色" | "近战" | "远程" | "同律"

/** MOD 限定校验所需的上下文：角色与三把武器的名称、属性、伤害类型、类别 */
export interface ModLimitContext {
    charId: number
    charName: string
    charElement: string
    melee?: { 类别?: string; 伤害类型?: string } | null
    ranged?: { 类别?: string; 伤害类型?: string } | null
    skill?: { 类别?: string; 伤害类型?: string } | null
}

/**
 * 取 MOD 限定的候选匹配值集合（该槽位承载对象上所有可被「限定」命中的字段值）。
 * @param slot 槽位类型
 * @param ctx 校验上下文
 * @returns 候选值集合；槽位无承载对象（未装备武器）时为空集合
 */
function getLimitCandidates(slot: ModLimitSlot, ctx: ModLimitContext): Set<string> {
    const values = new Set<string>()
    if (slot === "角色") {
        values.add(String(ctx.charId))
        values.add(ctx.charName)
        values.add(ctx.charElement)
        return values
    }
    const weapon = slot === "近战" ? ctx.melee : slot === "远程" ? ctx.ranged : ctx.skill
    if (weapon?.类别) values.add(weapon.类别)
    if (weapon?.伤害类型) values.add(weapon.伤害类型)
    return values
}

/**
 * 判断 MOD 是否满足其所处槽位的「限定」要求。
 *
 * 限定口径与选 MOD 列表的过滤条件、CharBuild 的生效判定一致：
 * - 角色槽：数字为角色 id，字符串为角色名或属性；
 * - 武器槽（近战/远程/同律）：字符串为武器伤害类型或武器类别；
 * - 未设置限定视为通用，永远可用；武器槽未装备武器时不承载任何 MOD。
 * @param mod 待校验的 MOD
 * @param slot 槽位类型
 * @param ctx 校验上下文
 * @returns 是否可用
 */
export function isModAllowedInSlot(mod: Mod, slot: ModLimitSlot, ctx: ModLimitContext): boolean {
    if (slot !== "角色" && !getLimitCandidates(slot, ctx).size) return false
    if (!mod.限定) return true
    if (typeof mod.限定 === "number") {
        return slot === "角色" && mod.限定 === ctx.charId
    }
    return getLimitCandidates(slot, ctx).has(mod.限定)
}

/**
 * 取槽位数组下标（槽位序号）转换为展示用的槽位号。
 * @param slotIndex 槽位数组下标
 * @returns 展示用槽位号（从 1 开始）
 */
export function toSlotNumber(slotIndex: number): number {
    return slotIndex + 1
}
