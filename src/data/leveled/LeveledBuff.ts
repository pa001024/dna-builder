import type { CharAttr, CharBuild, WeaponAttr } from "../CharBuild"
import type { Buff } from "../data-types"
import type { LeveledChar } from "./LeveledChar"
import type { LeveledMonster } from "./LeveledMonster"
import type { LeveledSkillWeapon } from "./LeveledSkillWeapon"
import type { LeveledWeapon } from "./LeveledWeapon"
import { getMinusAttrValue } from "./minusAttr"

export type LeveledBuffResolver = (name: string) => Buff | undefined

let leveledBuffResolver: LeveledBuffResolver | undefined

export function setLeveledBuffResolver(resolver: LeveledBuffResolver) {
    leveledBuffResolver = resolver
}

/**
 * 安全归一化动态属性计算结果。
 * @param value 表达式计算值
 * @returns 有效数值，不合法时返回0
 */
function normalizeDynamicAttrValue(value: number) {
    return Number.isFinite(value) ? value : 0
}

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

    // 武器精炼数值
    _ratio = 1

    get ratio() {
        return this._ratio
    }
    set ratio(value: number) {
        this._ratio = value
        this.updatePropertiesByLevel()
    }

    // 覆盖率（0-1），用于按覆盖率缩放BUFF数值，默认1表示100%
    _coverage = 1

    get coverage() {
        return this._coverage
    }
    set coverage(value: number) {
        this._coverage = value
        this.updatePropertiesByLevel()
    }

    /**
     * 构造函数
     * @param 名称 buff的名称
     * @param 等级 可选的buff等级
     */
    constructor(名称: string | Buff, 等级?: number) {
        const buffData = typeof 名称 === "string" ? leveledBuffResolver?.(名称) : 名称
        if (!buffData) {
            throw new Error(typeof 名称 === "string" ? `Buff "${名称}" 未在静态表中找到` : "Buff 数据不能为空")
        }

        // 保存原始Buff对象
        this._originalBuffData = buffData

        // 复制基础属性
        this.名称 = buffData.名称
        this.描述 = buffData.描述
        if (buffData.a !== undefined && buffData.a !== 1) this.a = buffData.a
        if (buffData.b !== undefined && buffData.b !== 1) this.b = buffData.b
        if (buffData.lx !== undefined) {
            this.lx = buffData.lx
        }
        if (buffData.mx !== undefined) {
            this.mx = buffData.mx
            this.dx = buffData.dx ?? buffData.mx
        }
        if (buffData.技能) this.技能 = buffData.技能

        // 设置等级（如果提供），否则使用默认等级dx
        this.等级 = 等级 !== undefined && 等级 >= 0 ? 等级 : this.dx || this.mx || 1

        // 检查动态属性代码
        if (this._originalBuffData.code) {
            this.code = this._originalBuffData.code
        }
        if (this._originalBuffData.attr) {
            this.attr = this._originalBuffData.attr
        }
    }

    /**
     * 应用动态属性
     * @param char 角色
     * @param attrs 角色属性
     * @param weapon 武器
     * @param weaponAttrs 武器属性
     * @param enemy 目标怪物
     * @param modAttrs 各槽位 MOD 原始属性总和（读取原始 MOD 效果，不受 BUFF 影响）
     */
    applyDynamicAttr(
        char: LeveledChar,
        attrs: CharAttr,
        weapons: (LeveledWeapon | LeveledSkillWeapon | undefined)[],
        wAttrs?: (WeaponAttr | undefined)[],
        enemy?: LeveledMonster,
        modAttrs?: Record<string, Record<string, number>>
    ): ReturnType<CharBuild["calculateWeaponAttributes"]> {
        const [weapon, meleeWeapon, rangedWeapon, skillWeapon] = weapons
        const [weaponAttr, meleeWeaponAttr, rangedWeaponAttr, skillWeaponAttr] = wAttrs || []
        const sandbox: Record<string, any> = {
            ...attrs,
            char: {
                基础攻击: char.基础攻击,
                基础生命: char.基础生命,
                基础护盾: char.基础护盾,
                基础防御: char.基础防御,
                基础神智: char.基础神智,
            },
            weapon: weapon
                ? {
                      基础攻击: weapon.基础攻击,
                      基础暴击: weapon.基础暴击,
                      基础暴伤: weapon.基础暴伤,
                      基础触发: weapon.基础触发,
                  }
                : undefined,
            meleeWeapon: meleeWeapon
                ? {
                      基础攻击: meleeWeapon.基础攻击,
                      基础暴击: meleeWeapon.基础暴击,
                      基础暴伤: meleeWeapon.基础暴伤,
                      基础触发: meleeWeapon.基础触发,
                  }
                : undefined,
            rangedWeapon: rangedWeapon
                ? {
                      基础攻击: rangedWeapon.基础攻击,
                      基础暴击: rangedWeapon.基础暴击,
                      基础暴伤: rangedWeapon.基础暴伤,
                      基础触发: rangedWeapon.基础触发,
                  }
                : undefined,
            skillWeapon: skillWeapon
                ? {
                      基础攻击: skillWeapon.基础攻击,
                      基础暴击: skillWeapon.基础暴击,
                      基础暴伤: skillWeapon.基础暴伤,
                      基础触发: skillWeapon.基础触发,
                  }
                : undefined,
            weaponAttr,
            meleeWeaponAttr,
            rangedWeaponAttr,
            skillWeaponAttr,
            enemy,
        }
        // 惰性注入各槽位 MOD 原始属性总和：accessor 不可枚举，仅当 code 实际访问（如 meleeMods.暴击）时才触发计算
        if (modAttrs) {
            Object.defineProperties(sandbox, Object.getOwnPropertyDescriptors(modAttrs))
        }
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
                enemy,
                ...attrs
            } = result
            return { ...attrs, weapon: weaponAttr }
        } else return { ...attrs, weapon: weaponAttr }
    }

    /**
     * 根据当前属性上下文刷新attr字段生成的BUFF属性。
     * @param attrs 当前角色属性
     * @param evaluateAttr 表达式求值函数
     * @returns 是否发生字段变更
     */
    applyAttr(attrs: CharAttr, evaluateAttr: (expression: string, attrs: CharAttr) => number) {
        if (!this.attr) return false
        let changed = false
        Object.entries(this.attr as Record<string, string>).forEach(([key, expression]) => {
            const value = normalizeDynamicAttrValue(evaluateAttr(expression, attrs)) * this._coverage
            if (this[key] !== value) {
                this[key] = value
                changed = true
            }
        })
        return changed
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
        level = Math.min(this.mx || 1, level)

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
        this.properties.forEach(prop => {
            const maxValue = this._originalBuffData[prop]
            if (maxValue !== undefined && typeof maxValue === "number") {
                // 属性值 = 满级属性/a*(1+(x-1)/b)
                let currentValue = (maxValue / a) * (1 + (x - lx) / b)
                if (prop === "神智回复") currentValue = Math.round(currentValue)
                val = currentValue
            } else if (Array.isArray(maxValue)) {
                val = maxValue[x - (this.lx ?? 1)]
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
    updatePropertiesByLevel(): void {
        const a = this.a || 1
        const b = this.b || 1
        const lx = this.lx ?? 1
        const x = this._等级

        this.baseProperties.forEach(prop => {
            const maxValue = this._originalBuffData[prop]
            if (maxValue !== undefined) {
                if (Array.isArray(maxValue)) {
                    this[prop] = maxValue[Math.min(x, maxValue.length) - (this.lx ?? 1)] * this._ratio * this._coverage
                } else if (typeof maxValue === "number") {
                    // 属性值 = 满级属性/a*(1+(x-1)/b)
                    let currentValue = (maxValue / a) * (1 + (x - lx) / b) * this._ratio * this._coverage
                    if (prop === "神智回复") currentValue = Math.round(currentValue)
                    this[prop] = currentValue
                }
            }
        })
    }

    /**
     * 获取Buff的属性信息
     */
    getProperties(): Record<string, number> {
        const properties: Record<string, number> = {}
        this.properties.forEach(prop => {
            properties[prop] = this[prop]
        })
        return properties
    }
    static _exclude_properties = new Set([
        "id",
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
        "pt",
        "code",
        "attr",
        "_ratio",
        "_coverage",
    ])
    get properties(): string[] {
        return Object.keys(this).filter(prop => !LeveledBuff._exclude_properties.has(prop))
    }
    get baseProperties(): string[] {
        return Object.keys(this._originalBuffData).filter(prop => !LeveledBuff._exclude_properties.has(prop))
    }

    public clone() {
        const buff = new LeveledBuff(this._originalBuffData, this._等级)
        buff.描述 = this.描述
        buff.ratio = this._ratio
        buff.coverage = this._coverage
        if (this.pid) buff.pid = this.pid
        if (this.pt) buff.pt = this.pt
        return buff
    }

    setLv(lv: number) {
        this.等级 = lv
        this.updatePropertiesByLevel()
        return this
    }

    get minusAttr() {
        const r: Record<string, any> = this.clone()
        this.properties.forEach(prop => {
            r[prop] = getMinusAttrValue(prop, this[prop])
        })
        r.isMinus = true
        return r as LeveledBuff
    }
}
