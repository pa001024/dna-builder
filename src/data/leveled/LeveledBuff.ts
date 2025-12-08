import { buffMap, LeveledChar, LeveledSkillWeapon, LeveledWeapon } from "."
import { CharAttr, WeaponAttr } from "../CharBuild"
import { Buff } from "../data-types"

/**
 * LeveledBuff类 - 继承Buff接口，添加等级属性和动态属性计算
 */
export class LeveledBuff implements Buff {
    // 基础Buff属性
    名称: string
    描述: string;
    [key: string]: any

    // 等级属性
    private _等级: number = 1
    // 原始Buff对象
    private _originalBuffData: Buff

    static properties = [
        "攻击",
        "生命",
        "护盾",
        "防御",
        "神智",
        "威力",
        "耐久",
        "效益",
        "范围",
        "昂扬",
        "背水",
        "增伤",
        "独立增伤",
        "武器伤害",
        "技能伤害",
        "神智回复",
        "暴击",
        "暴伤",
        "攻速",
        "多重",
        "追加伤害",
        "属性伤",
        "MOD属性",
        "属性穿透",
        "异常数量",
        "无视防御",
        "固定攻击",
        "技能速度",
        "召唤物范围",
        "召唤物攻速",
        "召唤物攻击",
        "召唤物伤害",
        "失衡易伤",
        "近战攻击",
        "近战暴击",
        "近战暴伤",
        "近战触发",
        "近战攻速",
        "近战范围",
        "近战增伤",
        "远程攻击",
        "远程攻速",
        "远程暴击",
        "远程暴伤",
        "远程触发",
        "远程多重",
        "远程增伤",
    ]
    /**
     * 构造函数
     * @param 名称 buff的名称
     * @param 等级 可选的buff等级
     */
    constructor(名称: string, 等级?: number) {
        // 从Map中获取对应的Buff对象
        const buffData = buffMap.get(名称)
        if (!buffData) {
            throw new Error(`Buff "${名称}" 未在静态表中找到`)
        }

        // 保存原始Buff对象
        this._originalBuffData = buffData

        // 复制基础属性
        this.名称 = buffData.名称
        this.描述 = buffData.描述
        if (buffData.a !== undefined) this.a = buffData.a
        if (buffData.b !== undefined) this.b = buffData.b
        if (buffData.dx !== undefined) this.dx = buffData.dx
        if (buffData.lx !== undefined) this.lx = buffData.lx
        if (buffData.mx !== undefined) this.mx = buffData.mx

        // 设置等级（如果提供），否则使用默认等级dx
        this.等级 = 等级 || this.dx || 1

        // 检查动态属性代码
        if (this._originalBuffData.code) {
            this.code = this._originalBuffData.code
        }
    }

    /**
     * 应用动态属性
     * @param char 角色
     * @param attrs 角色属性
     * @param weapon 武器
     * @param weaponAttrs 武器属性
     */
    applyDynamicAttr(char: LeveledChar, attrs: CharAttr, weapon?: LeveledWeapon | LeveledSkillWeapon, wAttr?: WeaponAttr) {
        const sandbox = {
            ...attrs,
            char: { attack: char.基础攻击, health: char.基础生命, shield: char.基础护盾, defense: char.基础防御, sanity: char.基础神智 },
            weapon: weapon
                ? {
                      attack: weapon.基础攻击,
                      critRate: weapon.基础暴击,
                      critDamage: weapon.基础暴伤,
                      triggerRate: weapon.基础触发,
                  }
                : undefined,
            weaponAttr: wAttr,
        } as any
        const func = new Function("attr", `with(attr){${this.code};return attr}`)
        let result = null
        try {
            result = func(sandbox)
        } catch (error) {
            console.error("动态属性代码执行错误", error)
        }
        if (result) {
            const { char, weapon, weaponAttr, ...attrs } = result
            return { ...attrs, weaponAttr }
        }
    }

    /**
     * 等级属性的getter和setter
     */
    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        // 确保等级在lx到mx之间，如果有设置的话
        let level = value
        if (this.lx !== undefined) {
            level = Math.max(this.lx, level)
        }
        if (this.mx !== undefined) {
            level = Math.min(this.mx, level)
        }

        this._等级 = level

        // 更新属性
        this.updatePropertiesByLevel()
    }

    /**
     * 根据等级更新Buff属性
     * 属性值 = 满级属性/a*(1+1/b*(x-lx))
     */
    private updatePropertiesByLevel(): void {
        const a = this.a || 1
        const b = this.b || 1
        const lx = this.lx !== undefined ? this.lx : 1
        const x = this._等级

        LeveledBuff.properties.forEach((prop) => {
            const maxValue = (this._originalBuffData as any)[prop]
            if (maxValue !== undefined) {
                // 属性值 = 满级属性/a*(1+1/b*(x-lx))
                let currentValue = (maxValue / a) * (1 + (1 / b) * (x - lx))
                if (prop === "神智回复") currentValue = Math.round(currentValue)
                ;(this as any)[prop] = currentValue
            }
        })
    }

    /**
     * 获取Buff的属性信息
     */
    getProperties(): Partial<Buff> {
        const properties: Partial<Buff> = {}
        LeveledBuff.properties.forEach((prop) => {
            if ((this as any)[prop]) properties[prop] = (this as any)[prop]
        })
        return properties
    }
}
