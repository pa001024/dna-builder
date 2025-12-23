import { uniq } from "lodash-es"
import { Skill } from "../data-types"
import { CharAttr, WeaponAttr } from "../CharBuild"

export interface LeveledSkillField {
    名称: string
    属性影响?: string
    值: number
    格式?: string
    基础?: string
    额外?: number
}

/**
 * LeveledSkill类 - 继承Skill接口，添加等级属性和动态属性计算
 */
export class LeveledSkill implements Skill {
    // 基础Skill属性
    名称: string
    类型: string
    字段: LeveledSkillField[]

    // 内部私有属性
    private _level = 10
    子技能: string[] = []

    /**
     * 构造函数
     * @param 技能名称 技能的名称
     * @param 等级 技能等级（可选，默认为10）
     */
    constructor(
        public skillData: Skill,
        等级?: number,
        public 子技能名?: string,
    ) {
        // 设置基础属性
        this.名称 = skillData.名称
        this.类型 = skillData.类型
        // 设置技能等级（如果提供），否则设为10
        this.等级 = 等级 || 10
        this.字段 = []
        this.子技能 = uniq(this.skillData.字段.map((field) => field.名称.match(/\[(.+?)\]/)?.[1] || "")).filter(
            (name) => name !== "" && this.skillData.字段.some((field) => field.名称.includes(name) && field.名称.endsWith("伤害")),
        )

        // 更新属性
        this.updateProperties()
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

    get 神智消耗() {
        return (
            this.字段.find(
                (field) =>
                    field.名称.includes(this.子技能名 || "") && !field.名称.includes("每秒神智消耗") && field.名称.includes("神智消耗"),
            ) || this.字段.find((field) => !field.名称.includes("每秒神智消耗") && field.名称.includes("神智消耗"))
        )
    }
    get 神智消耗值(): number {
        return this.神智消耗?.值 || 0
    }

    get 每秒神智消耗() {
        return (
            this.字段.find((field) => field.名称.includes(this.子技能名 || "") && field.名称.includes("每秒神智消耗")) ||
            this.字段.find((field) => field.名称.includes("每秒神智消耗"))
        )
    }

    get 每秒神智消耗值(): number {
        return this.每秒神智消耗?.值 || 0
    }

    get 伤害() {
        return this.字段.find((field) => field.名称.includes(this.子技能名 || "") && field.名称.includes("伤害"))
    }

    get 伤害值(): number {
        return this.伤害?.值 || 0
    }

    get 召唤物() {
        return this.skillData.召唤物
    }

    get 召唤物持续时间() {
        const field = this.字段.find((field) => /召唤物.*持续时间/.test(field.名称))
        return field ? { 值: field.值 || 0, 属性影响: field.属性影响 || "" } : undefined
    }

    /**
     * 根据技能等级更新技能属性
     */
    private updateProperties(): void {
        this.字段 = this.skillData.字段.map((field) => ({
            ...field,
            值: Array.isArray(field.值) ? field.值[this._level - 1] : field.值,
            额外: Array.isArray(field.额外) ? field.额外[this._level - 1] : field.额外,
        }))
    }

    getFieldsWithAttr(attrs: CharAttr & { weapon?: WeaponAttr }) {
        const tt = {
            威力: attrs.威力,
            耐久: attrs.耐久,
            效益: attrs.效益,
            范围: attrs.范围,
        }
        const normalFields = this.字段.map((field) => {
            if (field.属性影响) {
                let val = field.值
                let propSet = new Set(field.属性影响.split(","))
                if (propSet.has("范围")) {
                    val = field.值 * tt["范围"]
                }
                if (propSet.has("威力")) {
                    val = field.值 * tt["威力"]
                }
                if (propSet.has("耐久")) {
                    if (field.名称.includes("每秒神智消耗")) {
                        val = field.值 / tt["耐久"]
                    } else {
                        val = field.值 * tt["耐久"]
                    }
                }
                if (propSet.has("效益")) {
                    if (propSet.has("耐久")) {
                        // 耐久和效益共同影响下仍有175%最大上限
                        val = field.值 * Math.max(0.25, (2 - tt["效益"]) / tt["耐久"])
                    } else {
                        val = field.值 * (2 - tt["效益"])
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

    getSummonAttrsMap(attrs: CharAttr & { weapon?: WeaponAttr }) {
        if (this.召唤物) {
            const summon = this.召唤物
            const atkspd = ((attrs.weapon?.攻速 || 1) - 1) * attrs.召唤物攻击速度
            const df = this.召唤物持续时间
            const duration = df ? (df.属性影响?.includes("耐久") ? df.值 * attrs.耐久 : df.值) : 0
            return {
                name: summon.名称,
                delay: summon.攻击延迟,
                interval: summon.攻击间隔 / (1 + atkspd),
                attackSpeed: atkspd,
                duration,
                attackTimes: Math.floor((duration * attrs.耐久 - summon.攻击延迟) / (summon.攻击间隔 / (1 + atkspd))),
                range: Math.min(2.8, attrs.范围 * (1 + attrs.召唤物范围)),
            }
        }
    }

    getSummonAttrs(attrs: CharAttr & { weapon?: WeaponAttr }) {
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
            ] satisfies LeveledSkillField[]
        }
        return []
    }
}
