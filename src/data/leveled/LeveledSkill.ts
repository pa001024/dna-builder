import { Skill, SkillField } from "../data-types"
import { CharAttr, WeaponAttr } from "../CharBuild"

export interface LeveledSkillField {
    名称: string
    影响?: string
    值: number
    格式?: string
    基础?: string
    值2?: number
    段数?: number
    safeName: string
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
        this.名称 = skillData.名称
        this.类型 = skillData.类型
        this.描述 = skillData.描述
        if (skillData.武器) this.武器 = skillData.武器
        this.术语解释 = skillData.术语解释
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
                if (obj.段数) {
                    obj.段数 = Array.isArray(fo.段数) ? fo.段数[this._level - 1] : fo.段数
                }
                if (obj.格式) {
                    const m = obj.格式.match(/生命|防御/g)
                    if (m) obj.基础 = m[0]
                }
                return obj
            })
        }
    }

    getFieldsWithAttr(attrs?: CharAttr & { weapon?: WeaponAttr }) {
        const tt = {
            技能威力: attrs?.技能威力 || 1,
            技能耐久: attrs?.技能耐久 || 1,
            技能效益: attrs?.技能效益 || 1,
            技能范围: attrs?.技能范围 || 1,
        }
        const normalFields = this.字段.map(field => {
            if (attrs?.技能倍率赋值 && field.名称.includes("伤害")) {
                return {
                    ...field,
                    值: attrs.技能倍率赋值 + attrs.技能倍率加数,
                }
            }
            if (field.影响) {
                let val = field.值
                if (field.名称.includes("伤害")) {
                    val += attrs?.技能倍率加数 || 0
                }
                const propSet = new Set(field.影响.split(","))
                if (propSet.has("技能范围")) {
                    val = val * tt["技能范围"]
                }
                if (propSet.has("技能威力")) {
                    val = val * tt["技能威力"]
                }
                if (propSet.has("技能耐久")) {
                    if (field.名称.includes("每秒神智消耗")) {
                        val = val / tt["技能耐久"]
                    } else {
                        val = val * tt["技能耐久"]
                    }
                }
                if (propSet.has("技能效益")) {
                    if (propSet.has("技能耐久")) {
                        // 耐久和效益共同影响下仍有175%最大上限
                        val = field.值 * Math.max(0.25, (2 - tt["技能效益"]) / tt["技能耐久"])
                    } else {
                        val = field.值 * (2 - tt["技能效益"])
                    }
                }
                if (field.名称.includes("神智消耗")) {
                    val = Math.ceil(val)
                }
                return {
                    ...field,
                    值: val,
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
            const atkspd = ((attrs?.weapon?.攻速 || 1) - 1) * (attrs?.召唤物攻击速度 || 1)
            const df = this.召唤物持续时间
            const duration = df ? (df.属性影响?.includes("技能耐久") ? df.值 * (attrs?.技能耐久 || 1) : df.值) : 0
            return {
                name: summon.名称,
                delay: summon.攻击延迟,
                interval: summon.攻击间隔 / (1 + atkspd),
                attackSpeed: atkspd,
                duration,
                attackTimes: Math.floor((duration * (attrs?.技能耐久 || 1) - summon.攻击延迟) / (summon.攻击间隔 / (1 + atkspd))),
                range: Math.min(2.8, (attrs?.技能范围 || 1) * (1 + (attrs?.召唤物范围 || 0))),
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
