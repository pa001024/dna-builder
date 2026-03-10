const MULTIPLICATIVE_ATTRS = new Set(["无视防御", "技能无视防御", "技能倍率乘数"])

/**
 * 计算属性的反向值。
 * 对乘算属性返回乘法逆元对应的增量，避免移除收益时把倍率直接算穿。
 * @param prop 属性名
 * @param value 当前属性值
 * @returns 可用于抵消当前属性的反向值
 */
export function getMinusAttrValue(prop: string, value: number): number {
    if (value === 0) return 0
    if (MULTIPLICATIVE_ATTRS.has(prop) || prop.endsWith("独立增伤")) {
        const denominator = 1 + value
        if (Math.abs(denominator) < Number.EPSILON) {
            return -value
        }
        return -value / denominator
    }
    return -value
}
