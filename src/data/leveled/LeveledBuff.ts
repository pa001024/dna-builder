import { buffMap, LeveledChar, LeveledSkillWeapon, LeveledWeapon } from "."
import { CharAttr, CharBuild, WeaponAttr } from "../CharBuild"
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
    _等级: number = 1
    // 原始Buff对象
    _originalBuffData: Buff

    /**
     * 构造函数
     * @param 名称 buff的名称
     * @param 等级 可选的buff等级
     */
    constructor(名称: string | Buff, 等级?: number) {
        // 从Map中获取对应的Buff对象
        const buffData = typeof 名称 === "string" ? buffMap.get(名称) : 名称
        if (!buffData) {
            throw new Error(`Buff "${名称}" 未在静态表中找到`)
        }

        // 保存原始Buff对象
        this._originalBuffData = buffData

        // 复制基础属性
        this.名称 = buffData.名称
        this.描述 = buffData.描述
        if (buffData.a !== undefined && buffData.a != 1) this.a = buffData.a
        if (buffData.b !== undefined && buffData.b != 1) this.b = buffData.b
        if (buffData.lx !== undefined) {
            this.lx = buffData.lx
        }
        if (buffData.mx !== undefined) {
            this.mx = buffData.mx
            this.dx = buffData.dx ?? buffData.mx
        }

        // 设置等级（如果提供），否则使用默认等级dx
        this.等级 = 等级 !== undefined && 等级 >= 0 ? 等级 : this.dx || this.mx || 1

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
    applyDynamicAttr(
        char: LeveledChar,
        attrs: CharAttr,
        weapons: (LeveledWeapon | LeveledSkillWeapon | undefined)[],
        wAttrs?: (WeaponAttr | undefined)[],
    ): ReturnType<CharBuild["calculateWeaponAttributes"]> {
        const [weapon, meleeWeapon, rangedWeapon, skillWeapon] = weapons
        const [weaponAttr, meleeWeaponAttr, rangedWeaponAttr, skillWeaponAttr] = wAttrs || []
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
            meleeWeapon: meleeWeapon
                ? {
                      attack: meleeWeapon.基础攻击,
                      critRate: meleeWeapon.基础暴击,
                      critDamage: meleeWeapon.基础暴伤,
                      triggerRate: meleeWeapon.基础触发,
                  }
                : undefined,
            rangedWeapon: rangedWeapon
                ? {
                      attack: rangedWeapon.基础攻击,
                      critRate: rangedWeapon.基础暴击,
                      critDamage: rangedWeapon.基础暴伤,
                      triggerRate: rangedWeapon.基础触发,
                  }
                : undefined,
            skillWeapon: skillWeapon
                ? {
                      attack: skillWeapon.基础攻击,
                      critRate: skillWeapon.基础暴击,
                      critDamage: skillWeapon.基础暴伤,
                      triggerRate: skillWeapon.基础触发,
                  }
                : undefined,
            weaponAttr,
            meleeWeaponAttr,
            rangedWeaponAttr,
            skillWeaponAttr,
        } as any
        const func = new Function("attr", `with(attr){${this.code};return attr}`)
        let result = null
        try {
            result = func(sandbox)
        } catch (error) {
            console.error("动态属性代码执行错误", error)
        }
        if (result) {
            const {
                char,
                weapon,
                meleeWeapon,
                rangedWeapon,
                skillWeapon,
                weaponAttr,
                meleeWeaponAttr,
                rangedWeaponAttr,
                skillWeaponAttr,
                ...attrs
            } = result
            return { ...attrs, weapon: weaponAttr }
        } else return { ...attrs, weapon: weaponAttr }
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

    get baseValue(): number {
        const a = this.a || 1
        const b = this.b || 1
        const lx = this.lx ?? 1
        const x = 1
        let val = 0
        this.properties.forEach((prop) => {
            const maxValue = this._originalBuffData[prop]
            if (maxValue !== undefined && typeof maxValue === "number") {
                // 属性值 = 满级属性/a*(1+(x-1)/b)
                let currentValue = (maxValue / a) * (1 + (x - lx) / b)
                if (prop === "神智回复") currentValue = Math.round(currentValue)
                val = currentValue
            } else if (Array.isArray(maxValue)) {
                val = maxValue[x - 1]
            }
        })
        return val
    }
    /**
     * 根据等级更新Buff属性
     * 属性值 = 满级属性/a*(1+(x-1)/b)
     * 举例: 对技能来说, 如果满级属性为10级数值
     * a = 10级数值/1级数值
     * b = 1级数值/(10级数值-1级数值)*9
     */
    private updatePropertiesByLevel(): void {
        const a = this.a || 1
        const b = this.b || 1
        const lx = this.lx ?? 1
        const x = this._等级

        this.baseProperties.forEach((prop) => {
            const maxValue = this._originalBuffData[prop]
            if (maxValue !== undefined) {
                if (Array.isArray(maxValue)) {
                    this[prop] = maxValue[x - 1]
                } else if (typeof maxValue === "number") {
                    // 属性值 = 满级属性/a*(1+(x-1)/b)
                    let currentValue = (maxValue / a) * (1 + (x - lx) / b)
                    if (prop === "神智回复") currentValue = Math.round(currentValue)
                    this[prop] = currentValue
                }
            }
        })
    }

    /**
     * 获取Buff的属性信息
     */
    getProperties(): Partial<Buff> {
        const properties: Partial<Buff> = {}
        this.properties.forEach((prop) => {
            properties[prop] = this[prop]
        })
        return properties
    }
    static _exclude_properties = new Set([
        "名称",
        "描述",
        "限定",
        "品质",
        "_等级",
        "_originalBuffData",
        "a",
        "b",
        "lx",
        "bx",
        "mx",
        "dx",
        "pid",
        "code",
    ])
    get properties(): string[] {
        return Object.keys(this).filter((prop) => !LeveledBuff._exclude_properties.has(prop))
    }
    get baseProperties(): string[] {
        return Object.keys(this._originalBuffData).filter((prop) => !LeveledBuff._exclude_properties.has(prop))
    }

    public clone() {
        const buff = new LeveledBuff(this._originalBuffData, this._等级)
        buff.描述 = this.描述
        if (this.pid) buff.pid = this.pid
        return buff
    }

    setLv(lv: number) {
        this.等级 = lv
        this.updatePropertiesByLevel()
        return this
    }
}
