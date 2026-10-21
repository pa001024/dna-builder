import type { CharAttr, WeaponAttr } from "../CharBuild"
import { isMultiplicativeAttr } from "./minusAttr"

export enum SkillType {
    伤害 = "伤害",
    召唤 = "召唤",
    增益 = "增益",
    治疗 = "治疗",
    被动 = "被动",
    防御 = "防御",
}

export enum WeaponSkillType {
    普通攻击 = "普通攻击",
    蓄力攻击 = "蓄力攻击",
    下落攻击 = "下落攻击",
    滑行攻击 = "滑行攻击",
    射击 = "射击",
}

export enum HpType {
    生命 = "生命",
    护盾 = "护盾",
    战姿 = "战姿",
}

export enum DmgType {
    切割 = "切割",
    贯穿 = "贯穿",
    震荡 = "震荡",
    灾厄 = "灾厄",
}

export enum BulletType {
    弹道 = "弹道",
    非弹道 = "非弹道",
}

export interface SkillField {
    名称: string
    影响?: string
    伤害类型?: keyof typeof DmgType
    值: number[] | number
    格式?: string
    值2?: number[] | number
    削韧?: number[] | number
    Boss削韧?: number[] | number
    延迟?: number[] | number
    卡肉?: number[] | number
    取消?: number[] | number
    连段?: number[] | number
    段数?: number
    /** 伤害类型标签（如 ["充盈"]）：命中该标签的伤害字段按对应类型结算 */
    tag?: string[]
}

export interface SkillSummon {
    名称: string
    攻击延迟: number
    攻击间隔: number
}

export interface SkillCreatureShape {
    类型?: "Sphere" | "Box" | "Capsule"
    BoxHeight?: number
    BoxLength?: number
    BoxWidth?: number
    SphereRadius?: number
    CapsuleRadius?: number
    CapsuleHeight?: number
    Radius?: number
}

export interface SkillCreature {
    id?: number
    形状?: SkillCreatureShape
    时长?: number
    速度?: number
    射击间隔?: number
    特效循环间隔?: number
    Vars?: Record<string, number | string | boolean>
    标签?: string[]
}

export interface ShapeInfo {
    st: "Sphere" | "Box" | "Capsule"
    r?: number // 半径 Sphere
    h?: number // 高度 Box
    l?: number // 长度 Box
    w?: number // 宽度 Box
    cr?: number // 胶囊体半径
    ch?: number // 胶囊体高度
}

export interface WeaponSkill {
    id?: number
    名称: string
    类型: string
    武器?: string
    描述?: string
    字段?: SkillField[]
    削韧?: number[]
    延迟?: number[]
    卡肉?: number[]
    实体?: SkillCreature[]
}

export interface SkillWeapon {
    id: number
    名称: string
    icon?: string
    类型: string[]
    伤害类型?: keyof typeof DmgType
    攻击?: number
    暴击?: number
    暴伤?: number
    触发?: number
    攻速?: number
    技能?: Skill[]
    skill?: number[]
    filter?: string
    inherit?: "melee" | "ranged"
    atk?: "melee" | "ranged" | "all"
    视为?: string
}

export interface BuffAttr {
    k: string
    v: number[] | number
    t?: string
    z?: string
}

export interface BuffDot {
    d?: number // DotDelay
    it: number // Interval
    t: string
    v?: number // Value
    asi?: 1 // AllowSkillIntensity
    dg?: string[] // DamageTag
    dt?: string // DamageType
    im?: number // Immediately
    r?: number[] | number // Rate
    c?: number // Condition
    h?: number
    EffectId?: number
    PlaySe?: number
    Stackable?: 1
}

export interface BuffAura {
    id: number
    t: BuffBody
    range: number
    camp: string
}

export interface BuffBody {
    fn: string
    dot?: BuffDot[]
    t?: BuffAttr[]
    aura?: BuffAura[]
}

export interface SkillBuff {
    id: number
    t: BuffBody[]
}

export interface SkillPassive {
    id: number
    v?: Record<string, number | number[]>
}

export interface AttrRates {
    EnmityValue: number
    StrongValue: number
    ATK?: number
    DEF?: number
    MaxHp?: number | string
    SkillEfficiency?: number
    SkillIntensity?: number
    SkillRange?: number
    SkillSustain?: number
    ES?: number
    MaxES?: number
}

export interface PassiveEffect {
    Grade1MspOnHit?: number
    Grade4ExtraRate?: number
    MarkAddMsp?: number
    MarkAddSp?: number
    MarkDamageRate?: number[]
    MspOnHit?: number
    Skill1Msp1?: number
    Skill1Msp2?: number
    Skill2Msp?: number
    Skill2SpCost?: number
    Grade1BuffNum?: number
    Grade6CritRate?: number
    PassiveLastTime?: number
    Skill1BuffNum?: number
    Skill01MaxTarget?: number
    Skill02Time?: number
    SkillIntensityRate?: number[]
    DropEnergyLayer?: number
    Grade1PropReturn?: number
    Grade6DamageRate?: number
    Grade6LastTime?: number
    Level1Layer?: number
    Level2Layer?: number
    Level3Layer?: number
    Skill01AddRate?: number
    Skill01Num?: number
    DemageAddRate?: number | number[]
    Grade1LastTime?: number
    Grade2Rate?: number
    Skill02BuffTime?: number
    Skill02BuffTimeMax?: number
    Skill02BuffTimePerNum?: number
    Skill02HpValue?: number
    Skill03CD?: number
}

export interface EffectAttr {
    ba?: string
    fn?: string
    r?: number[] | number // Rate
    v?: number[] | number // Value
    co?: number // Condition
    Dilation?: number
    Duration?: number
    t?: BuffAttr[]
    cid?: number // CreatureId
    si?: ShapeInfo // CreateSkillCreature
    sp?: number // Speed
    tg?: string[] // Tags
    pe?: PassiveEffect
    Delay?: number
    dt?: string
    tp?: number | string // TriggerProbability
    ai?: number // AllowSkillIntensity
    as?: number // AllowSkillSustain
    bc?: string
    os?: number
    BuffType?: number
    IsExpand?: boolean
    LastTimeValue?: number
    FixLocation?: boolean
    FormationId?: number
    LifeTime?: number
    MaxSummonCount?: number
    SingleSummonCount?: number
    UnitId?: number
    UnitType?: string
    RefreshRule?: string
    Key?: string
    AttrRates?: AttrRates // CreateUnit
    aura?: BuffAura[]
    AutoAttach?: number
    cr?: boolean
    Camp?: string
    dot?: BuffDot[]
}

export interface SkillEffect {
    id: number
    t: EffectAttr[]
}

export interface Skill {
    id?: number
    名称?: string
    类型: string
    武器?: string
    升级?: Record<string, number>[]
    描述?: string
    icon?: string
    字段?: SkillField[]
    术语解释?: Record<string, string>
    召唤物?: SkillSummon
    实体?: SkillCreature[]
    cd?: number
    e?: SkillEffect[]
    b?: SkillBuff[]
    p?: SkillPassive[]
    子技能?: SubSkill[]
    行为?: string
}

export interface SubSkill {
    id?: number
    名称?: string
    类型: string
    武器?: string
    升级?: Record<string, number>[]
    描述?: string
    icon?: string
    字段?: SkillField[]
    术语解释?: Record<string, string>
    召唤物?: SkillSummon
    实体?: SkillCreature[]
    cd?: number
    e?: SkillEffect[]
    b?: SkillBuff[]
    p?: SkillPassive[]
    行为?: string
}

export interface LeveledSkillField {
    名称: string
    影响?: string
    伤害类型?: SkillField["伤害类型"]
    值: number
    格式?: string
    基础?: string
    值2?: number
    safeName: string
    /** 伤害类型标签（如 ["充盈"]）：命中该标签的伤害字段按对应类型结算 */
    tag?: string[]
}

/** 条件BUFF的字段级属性增量：带 `技能` 时字段名匹配（支持 "|" 交替多技能）命中，带 `tag` 时字段标签命中（如 ["充盈"]），两者都有时需同时命中；命中后把 props 合并进该字段的求值上下文 */
export interface BuffFieldConditional {
    技能?: string
    /** 预编译的技能名匹配模式（无技能限定时缺省） */
    pattern?: RegExp
    /** 字段标签限定（命中任一标签即满足标签条件） */
    tag?: string[]
    props: Record<string, number>
}

/**
 * LeveledSkill类 - 继承Skill接口，添加等级属性和动态属性计算
 */
export class LeveledSkill {
    // 基础Skill属性
    id: number
    名称: string
    描述?: string
    武器?: string
    术语解释?: Record<string, string>
    类型: string
    字段: LeveledSkillField[]

    // 内部私有属性
    _level = 10
    子技能: string[] = []

    get safeName() {
        return this.名称.replace(/\//g, "_")
    }

    /**
     * 构造函数
     * @param 技能名称 技能的名称
     * @param 等级 技能等级（可选，默认为10）
     */
    constructor(
        public skillData: Skill,
        等级?: number,
        public 武器名?: string
    ) {
        // 设置基础属性
        this.id = skillData.id || 0
        this.名称 = skillData.名称 ?? `SKILL${skillData.id}`
        this.类型 = skillData.类型
        this.描述 = skillData.描述
        if (skillData.武器) this.武器 = skillData.武器
        this.术语解释 = skillData.术语解释
        /**
         * 兼容子技能对象结构，优先使用名称，其次使用ID作为展示键
         */
        this.子技能 = (skillData.子技能 || [])
            .map((subSkill, index) => subSkill.名称 || (subSkill.id ? `${subSkill.id}` : `子技能${index + 1}`))
            .filter(Boolean)
        // 设置技能等级（如果提供），否则设为10
        this.等级 = 等级 || 10
        this.字段 = []

        // 更新属性
        this.updateProperties()
    }
    clone(level?: number) {
        return new LeveledSkill(this.skillData, level ?? this._level, this.武器名)
    }
    /**
     * 等级属性的getter和setter
     */
    get 等级(): number {
        return this._level
    }

    set 等级(value: number) {
        // 确保等级在1到12之间
        this._level = Math.max(1, Math.min(12, value))

        // 更新属性
        this.updateProperties()
    }

    get 召唤物() {
        return this.skillData.召唤物
    }

    get 召唤物持续时间() {
        const field = this.字段.find(field => /召唤物.*持续时间/.test(field.名称))
        return field ? { 值: field.值 || 0, 属性影响: field.影响 || "" } : undefined
    }

    /**
     * 根据技能等级更新技能属性
     */
    updateProperties(): void {
        if (this.skillData.字段) {
            const field = this.skillData.字段
            const fieldObj = Array.isArray(field) ? Object.fromEntries(field.map(f => [f.名称, f])) : field
            this.字段 = Object.keys(fieldObj).map(key => {
                const fstr = fieldObj[key]

                const fo = fstr as SkillField
                const obj = {
                    ...fo,
                    safeName: key.replace(/\//g, "_"),
                    值: Array.isArray(fo.值) ? fo.值[this._level - 1] : fo.值,
                } as LeveledSkillField
                if (obj.值2) {
                    obj.值2 = Array.isArray(fo.值2) ? fo.值2[this._level - 1] : fo.值2
                }
                if (obj.格式) {
                    const m = obj.格式.match(/生命|防御/g)
                    if (m) obj.基础 = m[0]
                }
                return obj
            })
        }
    }

    /**
     * 把条件BUFF属性增量合并进属性视图（不改原对象）。
     * 乘法池属性（独立增伤系列等）按 Π(1+v) 乘法叠加，其余按加算。
     * @param base 原属性视图
     * @param props 条件BUFF属性增量
     * @returns 合并后的新属性视图；无增量时原样返回
     */
    /**
     * 判断条件BUFF条目是否命中指定字段。
     * 有 `技能` 时要求字段名匹配模式，有 `tag` 时要求字段标签包含任一限定标签；两者都有时需同时满足。
     * @param c 条件BUFF条目
     * @param fieldName 字段名
     * @param fieldTag 字段标签
     * @returns 是否命中
     */
    static matchesFieldConditional(c: BuffFieldConditional, fieldName: string, fieldTag?: string[]): boolean {
        const hasSkill = typeof c.技能 === "string" && c.技能.length > 0
        const hasTag = !!c.tag?.length
        if (!hasSkill && !hasTag) return false
        if (hasSkill && !c.pattern?.test(fieldName)) return false
        if (hasTag && !c.tag!.some(t => fieldTag?.includes(t))) return false
        return true
    }

    static mergeConditionalProps<T extends object>(base: T, props: Record<string, number>): T {
        const merged = { ...base } as T
        const writable = merged as unknown as Record<string, number | undefined>
        for (const [prop, value] of Object.entries(props)) {
            if (isMultiplicativeAttr(prop)) {
                writable[prop] = (1 + (writable[prop] ?? 0)) * (1 + value) - 1
            } else {
                writable[prop] = (writable[prop] ?? 0) + value
            }
        }
        return merged
    }

    getFieldsWithAttr(
        attrs?: CharAttr & { weapon?: WeaponAttr; rangedWeapon?: WeaponAttr },
        conditionalProps?: BuffFieldConditional[],
        rangedMulti?: number
    ) {
        const tt = {
            技能威力: attrs?.技能威力 || 1,
            技能耐久: attrs?.技能耐久 || 1,
            技能效益: attrs?.技能效益 || 1,
            技能范围: attrs?.技能范围 || 1,
            技能速度: attrs?.技能速度 || 1,
            // 多重（远程武器多重射击，1 开始）：显式参数优先，其次读远程武器面板，最后回退到当前武器面板（兼容无 CharBuild 参与的单机调用）
            多重: rangedMulti ?? attrs?.rangedWeapon?.多重 ?? attrs?.weapon?.多重 ?? 1,
        }
        const normalFields = this.字段.map(field => {
            // 条件BUFF：字段名/tag命中时把属性增量合并进该字段的独立求值上下文
            let fieldAttrs = attrs
            if (attrs && conditionalProps?.length) {
                const matched = conditionalProps.filter(c => LeveledSkill.matchesFieldConditional(c, field.名称, field.tag))
                if (matched.length) {
                    fieldAttrs = matched.reduce((current, c) => LeveledSkill.mergeConditionalProps(current, c.props), attrs)
                }
            }
            if (fieldAttrs?.技能倍率赋值 && field.名称.includes("伤害")) {
                return {
                    ...field,
                    值: fieldAttrs.技能倍率赋值 * (1 + (fieldAttrs.技能倍率乘数 || 0)) + fieldAttrs.技能倍率加数,
                }
            }
            if (field.影响) {
                let val = field.值
                let val2 = field.值2 || 0
                if (field.名称.includes("伤害")) {
                    val = val * (1 + (fieldAttrs?.技能倍率乘数 || 0)) + (fieldAttrs?.技能倍率加数 || 0)
                }
                const propSet = new Set(field.影响.split(","))
                if (propSet.has("技能范围")) {
                    val = val * tt.技能范围
                }
                if (propSet.has("技能威力")) {
                    val = val * tt.技能威力
                    val2 = val2 * tt.技能威力
                }
                if (propSet.has("技能耐久")) {
                    if (field.名称.includes("每秒神智消耗")) {
                        val = val / tt.技能耐久
                    } else {
                        val = val * tt.技能耐久
                    }
                }
                if (propSet.has("技能效益")) {
                    if (propSet.has("技能耐久")) {
                        // 耐久和效益共同影响下仍有175%最大上限
                        val = field.值 * Math.max(0.25, (2 - tt.技能效益) / tt.技能耐久)
                    } else {
                        val = field.值 * (2 - tt.技能效益)
                    }
                }
                if (propSet.has("技能速度")) {
                    val = val / tt.技能速度
                }
                if (propSet.has("多重")) {
                    // 多重影响：读取远程武器多重射击属性（1 开始，无远程武器时为 1，即无加成）
                    val = val * tt.多重
                    val2 = val2 * tt.多重
                }
                if (field.名称.includes("神智消耗")) {
                    val = Math.ceil(val)
                }
                return {
                    ...field,
                    值: val,
                    值2: val2,
                }
            } else {
                return field
            }
        })
        if (this.召唤物) {
            normalFields.push(...this.getSummonAttrs(attrs))
        }
        return normalFields
    }

    getSummonAttrsMap(attrs?: CharAttr & { weapon?: WeaponAttr }) {
        if (this.召唤物) {
            const summon = this.召唤物
            // 召唤物攻击速度（角色属性）已由 calculateWeaponAttributes 按充盈威力范式汇总近战武器攻速 × 召唤物攻击速度转化，
            // 此处直接作为攻速增量（0起始）使用，不再重复乘以武器攻速。
            const atkspd = attrs?.召唤物攻击速度 ?? 0
            const df = this.召唤物持续时间
            const duration = df ? (df.属性影响?.includes("技能耐久") ? df.值 * (attrs?.技能耐久 ?? 1) : df.值) : 0
            const interval = summon.攻击间隔 / (1 + atkspd)
            return {
                name: summon.名称,
                delay: summon.攻击延迟,
                interval,
                attackSpeed: atkspd,
                duration,
                attackTimes: Math.floor((duration - summon.攻击延迟) / interval),
                // 召唤物范围（角色属性）同样已汇总召唤物范围转化，直接作为技能范围的增量比例
                range: Math.min(2.8, (attrs?.技能范围 ?? 1) * (1 + (attrs?.召唤物范围 ?? 0))),
            }
        }
    }

    getSummonAttrs(attrs?: CharAttr & { weapon?: WeaponAttr }) {
        const sattrs = this.getSummonAttrsMap(attrs)
        if (sattrs) {
            return [
                {
                    名称: "召唤物名称",
                    格式: sattrs.name,
                    值: 0,
                },
                {
                    名称: "召唤物攻击延迟",
                    值: sattrs.delay,
                    格式: "{}秒",
                },
                {
                    名称: "召唤物攻击间隔",
                    值: sattrs.interval,
                    格式: "{}秒",
                },
                {
                    名称: "召唤物攻速",
                    值: sattrs.attackSpeed,
                },
                {
                    名称: "召唤物攻击次数",
                    值: sattrs.attackTimes,
                    格式: "{}",
                },
                {
                    名称: "召唤物范围",
                    值: sattrs.range,
                },
            ].map(v => ({ ...v, safeName: v.名称.replace(/\//g, "_") })) satisfies LeveledSkillField[]
        }
        return []
    }

    get url() {
        return LeveledSkill.url(this.skillData.icon || "")
    }
    static url(icon?: string) {
        return icon ? `/imgs/webp/T_Skill_${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
}
