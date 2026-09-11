import type { CharSettings } from "../composables/useCharSettings"
import { CharBuild, CharBuildTimeline } from "./CharBuild"
import type { Weapon } from "./data-types"
import { getModBuffLvFromSetting, getWBuffLvFromSetting } from "./effectLv"
import { LeveledBuff } from "./leveled/LeveledBuff"
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
 * @param charId 角色 id
 * @param charSettings 角色配置
 * @param inv 背包快照
 * @param timeline 时间线
 * @returns 构筑实例
 */
export function createCharBuildFromSettings(
    charId: number,
    charSettings: CharSettings,
    inv?: CharBuildInvSnapshot,
    timeline?: CharBuildTimeline
) {
    const char = LeveledCharHelper.fromId(charId, charSettings.charLevel)
    const hydratedTimeline = timeline ? hydrateCharBuildTimeline(timeline) : undefined
    const useGlobal = charSettings.useGlobal
    const effectConfig = charSettings.effectConfig || {}
    const getBuffLv = (modId: number) => (useGlobal ? getBuffLvFromSnapshot(inv, modId) : getModBuffLvFromSetting(effectConfig, modId))
    const getWBuffLv = (weaponId: number) =>
        useGlobal ? getWBuffLvFromSnapshot(inv, weaponId, char.属性) : getWBuffLvFromSetting(effectConfig, weaponId, char.属性)
    return new CharBuild({
        char,
        auraMod: LeveledModHelper.fromId(charSettings.auraMod),
        charMods: charSettings.charMods.filter(mod => mod !== null).map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        meleeMods: charSettings.meleeMods.filter(mod => mod !== null).map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        rangedMods: charSettings.rangedMods.filter(mod => mod !== null).map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        skillMods: charSettings.skillWeaponMods.filter(mod => mod !== null).map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        skillLevel: charSettings.charSkillLevel,
        buffs: charSettings.buffs
            .map(v => {
                try {
                    return createBuffFromSettings(v[0], v[1], charSettings.customBuff, v[2])
                } catch (error) {
                    console.error(error)
                    return null
                }
            })
            .filter(b => b !== null),
        customBuff: charSettings.customBuff,
        melee: LeveledWeaponHelper.fromId(
            charSettings.meleeWeapon,
            charSettings.meleeWeaponRefine,
            charSettings.meleeWeaponLevel,
            getWBuffLv(charSettings.meleeWeapon)
        ),
        ranged: LeveledWeaponHelper.fromId(
            charSettings.rangedWeapon,
            charSettings.rangedWeaponRefine,
            charSettings.rangedWeaponLevel,
            getWBuffLv(charSettings.rangedWeapon)
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
        extraMastery: charSettings.extraMastery,
        dotSettings: charSettings.dotSettings,
        teamWeaponCategories: [charSettings.team1Weapon, charSettings.team2Weapon]
            .filter((weapon): weapon is number => typeof weapon === "number")
            .map(weapon => LeveledWeaponHelper.getCategory(weapon)),
    })
}

/**
 * 计算候选武器逐把替换进对应槽位后的收益（替换后总伤害 / 当前总伤害 - 1）。
 * 与 `CharBuild.calcIncome` 的差别有两点：
 * 1. 候选武器一律整槽替换后重算，避免槽位类型与当前技能不匹配时被当作附加 MOD 处理；
 * 2. 候选武器经 `LeveledWeaponHelper.fromData` 构造并同步熔炼潜能生效判定，
 *    确保武器特效与潜能被真实计入，避免已装备武器因漏配特效而算出负收益。
 * 候选武器的精炼/等级沿用列表既有语义（默认最大值），不读取槽位当前值。
 * @param charBuild 当前构筑（不会被修改）
 * @param weapons 候选武器数据列表
 * @param getEffectLv 读取单把武器特效等级的回调
 * @returns 武器 id → 收益；当前总伤害为 0 时全部返回 0
 */
export function calcWeaponReplacementIncomes(
    charBuild: CharBuild,
    weapons: Weapon[],
    getEffectLv: (weapon: Weapon) => number
): Map<number, number> {
    const incomes = new Map<number, number>()
    if (!weapons.length) return incomes

    // 全程在克隆构筑上替换并重算，避免污染实时构筑
    const clone = charBuild.clone()
    const currentTotal = clone.calculate()
    if (!currentTotal) {
        weapons.forEach(weapon => incomes.set(weapon.id, 0))
        return incomes
    }

    for (const weapon of weapons) {
        const candidate = LeveledWeaponHelper.fromData(weapon, undefined, undefined, getEffectLv(weapon))
        // 与构筑内保持一致的熔炼潜能生效判定：角色未精通该武器类别时潜能与特效均不生效
        candidate.setForgeEffective(charBuild.isWeaponCategoryMastered(candidate))
        const isMelee = weapon.类型[0] === "近战"
        const previous = isMelee ? clone.meleeWeapon : clone.rangedWeapon
        if (isMelee) clone.meleeWeapon = candidate
        else clone.rangedWeapon = candidate
        const newTotal = clone.calculate()
        if (isMelee) clone.meleeWeapon = previous
        else clone.rangedWeapon = previous
        incomes.set(weapon.id, newTotal / currentTotal - 1)
    }
    return incomes
}

/**
 * 按当前配置构造实例内独立的自定义 BUFF。
 * @param customBuff 自定义 BUFF 属性列表
 * @param level 自定义 BUFF 等级
 * @param coverage 覆盖率（0-1，默认1表示100%）
 * @returns 自定义 BUFF 实例
 */
export function createCustomBuff(customBuff: [string, number][], level?: number, coverage = 1) {
    const buffData = {
        名称: "自定义BUFF",
        描述: "自行填写",
    } as Record<string, string | number>
    customBuff.forEach(([property, value]) => {
        buffData[property] = value
    })
    const buff = new LeveledBuff(buffData as never, level)
    if (coverage !== 1) {
        buff.coverage = coverage
    }
    return buff
}

/**
 * 按当前配置构造 BUFF 实例，支持自定义 BUFF 直接从配置内生成。
 * @param name BUFF 名称
 * @param level BUFF 等级
 * @param customBuff 自定义 BUFF 配置
 * @param coverage 覆盖率（0-1，默认1表示100%）
 * @returns BUFF 实例
 */
export function createBuffFromSettings(name: string, level: number, customBuff: [string, number][], coverage = 1) {
    const buff = name === "自定义BUFF" ? createCustomBuff(customBuff, level, coverage) : LeveledBuffHelper.fromName(name, level)
    if (coverage !== 1) {
        buff.coverage = coverage
    }
    return buff
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
