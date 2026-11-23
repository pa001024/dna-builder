import { ADDITIONAL_DAMAGE_KEYS } from "@/data/leveled/additionalDamage"

/**
 * 武器追伤乘区的纯计算口径（U101c / U112）。
 *
 * 武器池口径：七分量直接相加后整体乘算（与属性穿透算法类似但不同乘区），
 * 不随抗性 / 元素弱点 / 元素增伤变化；`追加伤害` 只是七分量的只读聚合，不直接作为输入。
 * 页面乘区即为引擎武器池口径：`追加伤害乘区 = 1 + Σ 七分量`。
 */

/** 追伤七分量键（六元素 + 自属性） */
export type AdditionalDamageComponentKey = (typeof ADDITIONAL_DAMAGE_KEYS)[number]

/** 追伤七分量数值（键为属性名，缺失按 0 处理） */
export type AdditionalDamageComponents = Record<AdditionalDamageComponentKey, number>

/**
 * 读取有限数值，其余类型按 0 处理。
 * @param value 原始值
 * @returns 有限数值
 */
function finiteNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * 创建全零七分量，作为默认输入与解析起点。
 * @returns 七分量记录
 */
export function createAdditionalDamageComponents(): AdditionalDamageComponents {
    const components = {} as AdditionalDamageComponents
    for (const key of ADDITIONAL_DAMAGE_KEYS) components[key] = 0
    return components
}

/**
 * 从武器面板（或任意属性记录）取追伤七分量；缺失与非有限值按 0。
 * @param panel 武器面板 / 属性记录
 * @returns 七分量记录
 */
export function resolveAdditionalDamageComponents(panel: object | undefined | null): AdditionalDamageComponents {
    const values = (panel ?? {}) as Record<string, unknown>
    const components = createAdditionalDamageComponents()
    for (const key of ADDITIONAL_DAMAGE_KEYS) components[key] = finiteNumber(values[key])
    return components
}

/**
 * 计算追加伤害乘区（七分量直接相加后整体乘算）= 1 + Σ 七分量；非有限分量按 0。
 * @param components 追伤七分量（可只给部分键）
 * @returns 乘区因子
 */
export function additionalDamageZone(components: Partial<AdditionalDamageComponents>): number {
    let sum = 0
    for (const key of ADDITIONAL_DAMAGE_KEYS) sum += finiteNumber(components[key])
    return 1 + sum
}
