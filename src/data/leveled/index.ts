/**
 * 角色/武器等级升级倍率表
 * 1-80级对应的倍数
 */
export const CommonLevelUp = [
    1, 1.0422, 1.086, 1.1305, 1.1774, 1.3988, 1.4474, 1.5012, 1.5589, 1.6157, 1.8331, 1.8921, 1.9527, 2.0162, 2.0813, 2.3128, 2.3809,
    2.4505, 2.5186, 2.5897, 2.8339, 2.9053, 2.9795, 3.0538, 3.1288, 3.3098, 3.5538, 3.6327, 3.7117, 3.7921, 4.1028, 4.1842, 4.2765, 4.3725,
    4.4705, 4.8047, 4.9053, 5.0059, 5.1021, 5.1933, 5.5294, 5.621, 5.7141, 5.8079, 5.9032, 6.2508, 6.348, 6.4451, 6.5437, 6.6416, 6.8191,
    7.1079, 7.2107, 7.3127, 7.4155, 7.7876, 7.8938, 7.9999, 8.1061, 8.5685, 8.6863, 8.803, 8.9214, 9.0424, 9.7101, 9.7488, 9.8684, 9.9916,
    10.1107, 10.2122, 11.236, 11.3504, 11.459, 11.5667, 11.9809, 12.093, 12.2051, 12.3222, 12.4372, 12.5522,
]

// 导出各种映射表供其他模块使用

// 导出LeveledChar、LeveledMod、LeveledBuff、LeveledWeapon、LeveledSkill类
export { LeveledChar } from "./LeveledChar"
export { LeveledMod, LeveledModWithCount } from "./LeveledMod"
export { LeveledBuff } from "./LeveledBuff"
export { LeveledWeapon } from "./LeveledWeapon"
export { LeveledSkillWeapon } from "./LeveledSkillWeapon"
export { LeveledSkill } from "./LeveledSkill"
export type { LeveledSkillField } from "./LeveledSkill"
export { LeveledMonster } from "./LeveledMonster"
export { LeveledPet } from "./LeveledPet"
