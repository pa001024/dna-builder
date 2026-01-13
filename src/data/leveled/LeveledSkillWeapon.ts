import { CommonLevelUp, LeveledSkill } from "."
import { DmgType, SkillWeapon } from "../data-types"

/**
 * LeveledSkillWeapon类 - 继承Weapon接口，添加等级和技能等级和动态属性计算
 */
export class LeveledSkillWeapon {
    // 基础Weapon属性
    id?: number
    名称: string
    类型: string
    类别: string
    伤害类型: keyof typeof DmgType
    基础攻击: number
    基础暴击: number
    基础暴伤: number
    基础触发: number
    弹道类型?: string
    // 新增属性
    倍率 = 1
    弹片数?: number
    射速?: number
    段数?: number
    基础装填 = 0
    基础弹匣?: number
    技能?: LeveledSkill[]
    inherit?: "melee" | "ranged"

    // 等级和精炼属性
    _等级: number = 80 // 武器等级，默认80级
    _技能等级: number = 10 // 武器技能等级，默认10级
    // 原始武器对象
    _originalWeaponData: SkillWeapon
    // 技能等级上限
    _maxSkillLevel: number = 12

    /**
     * 构造函数
     * @param weaponName 武器的名称
     * @param 精炼 可选的武器精炼等级
     * @param 等级 可选的武器等级
     * @param 倍率名称 可选的倍率名称
     */
    constructor(weaponData: SkillWeapon, 技能等级?: number, 等级?: number) {
        // 保存原始武器对象和类型
        this._originalWeaponData = weaponData

        // 复制基础属性
        this.id = weaponData.id
        this.名称 = weaponData.名称
        this.类型 = weaponData.类型[0] + weaponData.类型[1]
        this.类别 = weaponData.类型[2]
        this.伤害类型 = weaponData.伤害类型 || "切割"
        this.基础攻击 = weaponData.攻击 || 0
        this.基础暴击 = weaponData.暴击 || 0
        this.基础暴伤 = weaponData.暴伤 || 0
        this.基础触发 = weaponData.触发 || 0

        // 设置技能等级等级（如果提供），否则设为10
        this._技能等级 = Math.max(1, Math.min(this._maxSkillLevel, 技能等级 ?? 10))

        if (weaponData.技能)
            this.技能 = weaponData.技能.map(skill => new LeveledSkill({ ...skill, 武器: this.类型 }, this._技能等级, weaponData.名称))

        if (weaponData.inherit) this.inherit = weaponData.inherit

        // 初始化倍率相关属性为undefined
        this.弹片数 = undefined
        this.射速 = weaponData.攻速 || 1
        this.段数 = undefined

        // 设置武器等级（如果提供），否则设为80
        this._等级 = Math.max(1, Math.min(80, 等级 ?? 80))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 等级属性的getter和setter
     */
    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        // 确保等级在1到80之间
        this._等级 = Math.max(1, Math.min(80, value))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 精炼属性的getter和setter
     */
    get 技能等级(): number {
        return this._技能等级
    }

    set 技能等级(value: number) {
        // 确保技能等级等级在0到技能等级上限之间
        this._技能等级 = Math.max(0, Math.min(this._maxSkillLevel, value))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 根据等级和精炼更新武器属性
     * 基础攻击受等级影响，其他属性受精炼影响
     */
    updateProperties(): void {
        // 重置所有属性为原始值
        this.基础攻击 = this._originalWeaponData.攻击 || 0

        // 根据武器等级调整基础攻击
        const clampedLevel = Math.max(1, Math.min(80, this._等级))
        this.基础攻击 *= CommonLevelUp[clampedLevel - 1]
    }

    /**
     * 获取武器的完整属性信息
     */
    getProperties() {
        return {
            伤害类型: this.伤害类型,
            基础攻击: this.基础攻击,
            基础暴击: this.基础暴击,
            基础暴伤: this.基础暴伤,
            基础触发: this.基础触发,
        }
    }

    get url() {
        return LeveledSkillWeapon.url(this._originalWeaponData.icon || "")
    }

    static url(icon?: string) {
        return icon ? `/imgs/webp/T_Head_${icon}.webp` : "/imgs/webp/_.webp"
    }
}
