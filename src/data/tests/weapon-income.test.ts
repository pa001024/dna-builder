import { describe, expect, it } from "vitest"
import { CharBuild } from "../CharBuild"
import { calcWeaponReplacementIncomes } from "../CharBuildHelper"
import { getWBuffLvFromSetting } from "../effectLv"
import { weaponData, weaponEffectMap } from "../index"
import { LeveledChar, LeveledWeapon } from "../leveled"
import { LeveledWeaponHelper } from "../leveled/LeveledHelpers"

/** 带武器特效的近战武器「锥心黑曜镰」：暴伤 +6%/层，最多 25 层（特效等级直接决定收益） */
const 锥心黑曜镰 = 10209

/**
 * 取武器静态数据。
 * @param id 武器 ID
 * @returns 武器数据
 */
function getWeapon(id: number) {
    return weaponData.find(weapon => weapon.id === id)!
}

/**
 * 构造用于武器收益测试的构筑：基础技能使用近战槽位武器的「普通攻击」，
 * 使武器伤害真正参与总伤害计算。
 * @param meleeId 近战槽位武器 ID
 * @param effectLv 近战武器特效等级
 * @returns 构筑实例
 */
function createWeaponIncomeBuild(meleeId = 锥心黑曜镰, effectLv = 25) {
    return new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 0.5,
        resonanceGain: 2,
        melee: LeveledWeaponHelper.fromId(meleeId, 5, 80, effectLv),
        ranged: LeveledWeaponHelper.fromId(20601, 5, 80, 0),
        baseName: "普通攻击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0.5,
        targetFunction: "伤害",
    })
}

describe("武器替换收益计算", () => {
    it("带特效武器作为当前武器时收益应为 0", () => {
        const charBuild = createWeaponIncomeBuild()
        const incomes = calcWeaponReplacementIncomes(charBuild, [getWeapon(锥心黑曜镰)], () => 25)
        expect(charBuild.isMeleeWeapon).toBe(true)
        expect(incomes.get(锥心黑曜镰)).toBe(0)
    })

    it("候选武器缺少武器特效时会算出负收益（回归锚点）", () => {
        const charBuild = createWeaponIncomeBuild()
        const clone = charBuild.clone()
        const currentTotal = clone.calculate()
        // 旧实现直接按武器数据构造候选武器，丢失 weaponEffectMap 中的特效
        const candidate = new LeveledWeapon(getWeapon(锥心黑曜镰), undefined, undefined, 25)
        expect(candidate.buff).toBeUndefined()

        clone.meleeWeapon = candidate
        expect(clone.calculate() / currentTotal - 1).toBeLessThan(0)
    })

    it("武器特效等级应参与收益计算", () => {
        const charBuild = createWeaponIncomeBuild(10301, 0)
        const maxLevel = calcWeaponReplacementIncomes(charBuild, [getWeapon(锥心黑曜镰)], () => 25).get(锥心黑曜镰)!
        const minLevel = calcWeaponReplacementIncomes(charBuild, [getWeapon(锥心黑曜镰)], () => 1).get(锥心黑曜镰)!
        expect(maxLevel).toBeGreaterThan(minLevel)
    })

    it("按角色元素取特效等级：非本元素限定的特效武器收益等于无特效", () => {
        const charBuild = createWeaponIncomeBuild(10301, 0)
        // 黎瑟为雷属性；10107 囚鸟的刺羽限定「暗」，按 effectLv 解析应取 0
        expect(charBuild.char.属性).toBe("雷")
        const byElement = calcWeaponReplacementIncomes(charBuild, [getWeapon(10107)], weapon =>
            getWBuffLvFromSetting(undefined, weapon.id, charBuild.char.属性)
        ).get(10107)
        const withoutEffect = calcWeaponReplacementIncomes(charBuild, [getWeapon(10107)], () => 0).get(10107)
        expect(byElement).toBe(withoutEffect)
    })

    it("替换为空武器时应为负收益", () => {
        const charBuild = createWeaponIncomeBuild()
        const emptyWeapon = LeveledWeapon.emptyWeapon._originalWeaponData
        const incomes = calcWeaponReplacementIncomes(charBuild, [emptyWeapon], () => 0)
        expect(incomes.get(0)).toBeLessThan(0)
    })

    it("当前总伤害为 0 时收益统一为 0", () => {
        const charBuild = createWeaponIncomeBuild()
        charBuild.targetFunction = "不存在的函数"
        const incomes = calcWeaponReplacementIncomes(charBuild, [getWeapon(锥心黑曜镰)], () => 25)
        expect(incomes.get(锥心黑曜镰)).toBe(0)
    })

    it("全部特效武器参与收益计算时不应出现非有限值", () => {
        const charBuild = createWeaponIncomeBuild()
        const effectWeapons = weaponData.filter(weapon => weaponEffectMap.has(weapon.id))
        const incomes = calcWeaponReplacementIncomes(charBuild, effectWeapons, () => 1)
        expect(incomes.size).toBe(effectWeapons.length)
        for (const income of incomes.values()) {
            expect(Number.isFinite(income)).toBe(true)
        }
    })
})
