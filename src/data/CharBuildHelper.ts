import type { CharSettings } from "../composables/useCharSettings"
import { CharBuild, CharBuildTimeline } from "./CharBuild"
import {
    type CharBuildInvSnapshot,
    getBuffLvFromSnapshot,
    getWBuffLvFromSnapshot,
    LeveledBuffHelper,
    LeveledCharHelper,
    LeveledModHelper,
    LeveledWeaponHelper,
} from "./leveled/LeveledHelpers"

/**
 * 按角色配置构建 CharBuild，查表逻辑集中在 Helper 侧以保持 CharBuild 计算类可用于 worker。
 * @param selectedChar 角色名
 * @param charSettings 角色配置
 * @param inv 背包快照
 * @param timeline 时间线
 * @returns 构筑实例
 */
export function createCharBuildFromSettings(
    selectedChar: string,
    charSettings: CharSettings,
    inv?: CharBuildInvSnapshot,
    timeline?: CharBuildTimeline
) {
    const char = LeveledCharHelper.fromId(selectedChar, charSettings.charLevel)
    const hydratedTimeline = timeline ? hydrateCharBuildTimeline(timeline) : undefined
    return new CharBuild({
        char,
        auraMod: LeveledModHelper.fromId(charSettings.auraMod),
        charMods: charSettings.charMods
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLvFromSnapshot(inv, v[0]))),
        meleeMods: charSettings.meleeMods
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLvFromSnapshot(inv, v[0]))),
        rangedMods: charSettings.rangedMods
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLvFromSnapshot(inv, v[0]))),
        skillMods: charSettings.skillWeaponMods
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLvFromSnapshot(inv, v[0]))),
        skillLevel: charSettings.charSkillLevel,
        buffs: charSettings.buffs.map(v => LeveledBuffHelper.fromName(v[0], v[1])),
        melee: LeveledWeaponHelper.fromId(
            charSettings.meleeWeapon,
            charSettings.meleeWeaponRefine,
            charSettings.meleeWeaponLevel,
            getWBuffLvFromSnapshot(inv, charSettings.meleeWeapon, char.属性)
        ),
        ranged: LeveledWeaponHelper.fromId(
            charSettings.rangedWeapon,
            charSettings.rangedWeaponRefine,
            charSettings.rangedWeaponLevel,
            getWBuffLvFromSnapshot(inv, charSettings.rangedWeapon, char.属性)
        ),
        baseName: charSettings.baseName,
        imbalance: charSettings.imbalance,
        hpPercent: charSettings.hpPercent,
        resonanceGain: charSettings.resonanceGain,
        enemyId: charSettings.enemyId,
        enemyLevel: charSettings.enemyLevel,
        enemyResistance: charSettings.enemyResistance,
        targetFunction: charSettings.targetFunction,
        customVariables: charSettings.customVariables,
        timeline: hydratedTimeline,
        timelineDPS: charSettings.timelineDPS,
        teamWeaponCategories: [charSettings.team1Weapon, charSettings.team2Weapon]
            .filter((weapon): weapon is number => typeof weapon === "number")
            .map(weapon => LeveledWeaponHelper.getCategory(weapon)),
    })
}

;(CharBuild as typeof CharBuild & { fromCharSetting?: typeof createCharBuildFromSettings }).fromCharSetting = createCharBuildFromSettings

/**
 * 预构建时间线中的 BUFF 实例，避免 CharBuild 计算类直接依赖静态 BUFF 表。
 * @param timeline 原时间线
 * @returns 已补齐 BUFF 实例的时间线
 */
export function hydrateCharBuildTimeline(timeline: CharBuildTimeline) {
    return new CharBuildTimeline(
        timeline.name,
        timeline.items.map(item => ({
            ...item,
            buff: item.lv ? item.buff || LeveledBuffHelper.fromName(item.name, item.lv) : undefined,
        })),
        timeline.hp
    )
}
