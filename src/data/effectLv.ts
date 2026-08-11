import { effectMap, modMap, weaponMap } from "./d"

/**
 * 从构筑本地配置读取 MOD 特殊效果等级。
 * 优先使用 effectConfig，缺省时返回效果最大值（榜单等场景默认全部最大）。
 * @param effectConfig 构筑本地特效等级配置
 * @param modId MOD ID
 * @returns 特效等级；效果不存在时按 1 处理（与"全部最大"一致）
 */
export function getModBuffLvFromSetting(effectConfig: Record<string, number> | undefined, modId: number) {
    if (effectConfig?.[`m:${modId}`] !== undefined) return effectConfig[`m:${modId}`]
    const mod = modMap.get(modId)
    const buff = mod?.名称 ? effectMap.get(mod.名称) : undefined
    return buff?.mx || 1
}

/**
 * 从构筑本地配置读取武器特殊效果等级。
 * 优先使用 effectConfig，缺省时返回效果最大值；限定元素不匹配时返回 0。
 * @param effectConfig 构筑本地特效等级配置
 * @param weaponId 武器 ID
 * @param elm 当前角色属性
 * @returns 特效等级；效果不存在时按 1 处理（与"全部最大"一致）
 */
export function getWBuffLvFromSetting(effectConfig: Record<string, number> | undefined, weaponId: number, elm = "any") {
    const weapon = weaponMap.get(weaponId)
    const buff = weapon?.名称 ? effectMap.get(weapon.名称) : undefined
    if (buff?.限定 && buff.限定 !== elm && elm !== "any") return 0
    if (effectConfig?.[`w:${weaponId}`] !== undefined) return effectConfig[`w:${weaponId}`]
    return buff?.mx || 1
}
