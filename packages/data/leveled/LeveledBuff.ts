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
 * 解析原始数据键对应的实例属性名。
 * 特效数据中以 `@` 前缀声明的键表示该属性归属 BUFF 层（区别于 MOD 自身属性），
 * 物化为 BUFF 属性时剥离前缀，否则属性名无法与任何属性查询匹配（如 `@近战增伤` → `近战增伤`）。
 * @param property 原始数据键
 * @returns 实例属性名
 */
function resolveBuffPropertyName(property: string) {
    return property.startsWith("@") ? property.slice(1) : property
}

/**
 * 给槽位属性记录套一层零值兜底视图。
 * 槽位记录只包含该槽位实际提供的词条，动态 BUFF 的 code 直接对属性做算术时（如 `1 + charMods.攻击`），
 * 未配置的词条读出 undefined 会把结果污染成 NaN，`NaN > 0` 之类的判断静默失败导致整段计算失效；
 * 兜底后未配置词条按 0 参与运算，与「该槽位无此加成」语义一致。
 * @param record 槽位属性记录（惰性求值结果）
 * @returns 未命中键返回 0 的视图，键集合与遍历行为保持与记录一致
 */
function createZeroFilledRecord(record: Record<string, number>) {
    return new Proxy(record, {
        get(target, property, receiver) {
            if (typeof property === "string" && !(property in target)) return 0
            return Reflect.get(target, property, receiver)
        },
    })
}

/**
 * LeveledBuff类 - 继承Buff接口，添加等级属性和动态属性计算
 */
export class LeveledBuff implements Buff {
    // 基础Buff属性（显式元信息：数值一律进 values 表，不再动态挂载实例键）
    id?: number
    名称: string
    描述: string
    限定?: string | number
    a?: number
    b?: number
    dx?: number
    lx?: number
    mx?: number
    code?: string
    技能?: string
    tag?: string[]
    禁用?: number[]
    display?: Record<string, string>
    /** 来源挂载点（MOD/武器特效挂载时写入） */
    pid?: number
    pt?: string
    isMinus?: boolean
    /**
     * 当前数值表：静态等级缩放值与动态 attr 求值结果的合并视图。
     * 展示层（BuffCell/buff-editor 等）直接渲染此表，不再枚举实例键。
     */
    readonly values: Record<string, number> = {}

    // 等级属性
    _等级: number = 1
    // 原始Buff对象
    _originalBuffData: Buff

    // 武器精炼数值
    _ratio = 1

    /**
     * BUFF 数值属性的版本号（全实例共享的单调计数）。
     *
     * 改写入口只有 `updatePropertiesByLevel`（等级 / ratio / coverage 变更）与 `applyAttr`（动态属性刷新），
     * 两处都会推进本计数，供上层属性汇总表判断派生快照是否过期。
     */
    static propertiesRevision = 0

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

        // 复制基础属性（仅元信息；数值保留在原始 attr 表中，按等级/上下文物化进 values）
        this.名称 = buffData.名称
        this.描述 = buffData.描述 ?? ""
        if (buffData.id !== undefined) this.id = buffData.id
        if (buffData.限定 !== undefined) this.限定 = buffData.限定
        if (buffData.display !== undefined) this.display = buffData.display
        if (buffData.a !== undefined && buffData.a !== 1) this.a = buffData.a
        if (buffData.b !== undefined && buffData.b !== 1) this.b = buffData.b
        if (buffData.lx !== undefined) {
            this.lx = buffData.lx
        }
        if (buffData.mx !== undefined) {
            this.mx = buffData.mx
            this.dx = buffData.dx ?? buffData.mx
        }
        if (buffData.code !== undefined) this.code = buffData.code
        if (buffData.技能) this.技能 = buffData.技能
        if (buffData.tag) this.tag = [...buffData.tag]
        if (buffData.禁用?.length) this.禁用 = [...buffData.禁用]

        // 设置等级（如果提供），否则使用默认等级dx
        this.等级 = 等级 !== undefined && 等级 >= 0 ? 等级 : this.dx || this.mx || 1
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
        // 惰性注入各槽位 MOD 原始属性总和：accessor 不可枚举，仅当 code 实际访问（如 meleeMods.暴击）时才触发计算；
        // 取到的槽位记录再套零值兜底，未配置的词条按 0 参与算术，避免 undefined 让整段计算变成 NaN
        if (modAttrs) {
            Object.getOwnPropertyNames(modAttrs).forEach(slot => {
                let cached: Record<string, number> | undefined
                Object.defineProperty(sandbox, slot, {
                    enumerable: false,
                    configurable: false,
                    get() {
                        if (!cached) cached = createZeroFilledRecord(modAttrs[slot])
                        return cached
                    },
                })
            })
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

    /** 源数值表中是否含动态表达式（string 值），供收益计算区分静态/动态 BUFF */
    get hasDynamicAttr(): boolean {
        const attr = this._originalBuffData.attr
        if (!attr) return false
        return Object.values(attr).some(v => typeof v === "string")
    }

    /**
     * 根据当前属性上下文刷新attr表中的动态表达式，结果写入 values。
     * 静态值（number/number[]）由 updatePropertiesByLevel 按等级物化，此处只处理 string 表达式。
     * @param attrs 当前角色属性
     * @param evaluateAttr 表达式求值函数
     * @returns 是否发生字段变更
     */
    applyAttr(attrs: CharAttr, evaluateAttr: (expression: string, attrs: CharAttr) => number) {
        const attr = this._originalBuffData.attr
        if (!attr) return false
        let changed = false
        for (const [key, expression] of Object.entries(attr)) {
            if (typeof expression !== "string") continue
            const property = resolveBuffPropertyName(key)
            const value = normalizeDynamicAttrValue(evaluateAttr(expression, attrs)) * this._coverage
            if (this.values[property] !== value) {
                this.values[property] = value
                changed = true
            }
        }
        if (changed) LeveledBuff.propertiesRevision++
        return changed
    }

    /**
     * 读取单个属性的当前数值。
     * @param attribute 属性名
     * @returns 属性数值；该属性不在 values 表中时返回 undefined
     */
    getAttrValue(attribute: string): number | undefined {
        const value = this.values[attribute]
        return typeof value === "number" ? value : undefined
    }

    /**
     * 源数值表中的动态表达式（string 值）原样视图，供展示层在数值旁显示表达式。
     */
    get dynamicAttr(): Record<string, string> {
        const out: Record<string, string> = {}
        for (const [key, value] of Object.entries(this._originalBuffData.attr ?? {})) {
            if (typeof value === "string") out[key] = value
        }
        return out
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

    /**
     * 判断属性是否来自数值表中以 `@` 前缀声明的键。
     * 这类属性归属 BUFF 层（如远程槽 MOD 提供的近战增伤），MOD 汇总时不应归一化到自身。
     * @param property 已剥离前缀的属性名
     * @returns 是否来自 `@` 前缀键
     */
    isBuffLayerProperty(property: string) {
        return `@${property}` in (this._originalBuffData.attr ?? {})
    }
    /**
     * 根据等级更新Buff属性，结果写入 values。
     * 属性值 = 满级属性/a*(1+(x-1)/b)
     * 举例: 对技能来说, 如果满级属性为10级数值
     * a = 10级数值/1级数值
     * b = 1级数值/(10级数值-1级数值)*9
     * 动态表达式（string 值）不在此处求值，由 applyAttr 按属性上下文刷新。
     */
    updatePropertiesByLevel(): void {
        // 属性被改写：推进版本号，让上层的属性汇总表知道自己的快照已过期
        LeveledBuff.propertiesRevision++
        const a = this.a || 1
        const b = this.b || 1
        const lx = this.lx ?? 1
        const x = this._等级

        for (const key of Object.keys(this.values)) delete this.values[key]
        const attr = this._originalBuffData.attr
        if (!attr) return
        for (const [key, maxValue] of Object.entries(attr)) {
            const property = resolveBuffPropertyName(key)
            if (Array.isArray(maxValue)) {
                this.values[property] = maxValue[Math.min(x, maxValue.length) - (this.lx ?? 1)] * this._ratio * this._coverage
            } else if (typeof maxValue === "number") {
                // 属性值 = 满级属性/a*(1+(x-1)/b)
                let currentValue = (maxValue / a) * (1 + (x - lx) / b) * this._ratio * this._coverage
                if (property === "神智回复" || property === "单次神智回复") currentValue = Math.round(currentValue)
                this.values[property] = currentValue
            }
        }
    }

    /**
     * 获取Buff的属性信息：values 表的快照，展示层直接渲染此表。
     */
    getProperties(): Record<string, number> {
        return { ...this.values }
    }
    /** 数值属性键：values 表的键（显式白名单，不再用黑名单枚举实例键） */
    get properties(): string[] {
        return Object.keys(this.values)
    }

    public clone() {
        const buff = new LeveledBuff(this._originalBuffData, this._等级)
        buff.描述 = this.描述
        buff.ratio = this._ratio
        buff.coverage = this._coverage
        for (const [key, value] of Object.entries(this.values)) {
            if (!(key in buff.values)) buff.values[key] = value
        }
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
        const r = this.clone()
        for (const prop of this.properties) {
            const value = this.getAttrValue(prop)
            if (value !== undefined) r.values[prop] = getMinusAttrValue(prop, value)
        }
        r.isMinus = true
        return r
    }
}
