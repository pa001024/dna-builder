import { uniq } from "lodash-es"
import { Skill } from "../data-types"

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
    constructor(public skillData: Skill, 等级?: number, public 子技能名?: string) {
        // 设置基础属性
        this.名称 = skillData.名称
        this.类型 = skillData.类型

        // 设置技能等级（如果提供），否则设为10
        this.等级 = 等级 || 10
        this.字段 = []
        this.子技能 = uniq(this.skillData.字段.map((field) => field.名称.match(/\[(.+?)\]/)?.[1] || "").filter((name) => name !== ""))

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

    get 神智消耗(): number {
        return this.字段.find((field) => field.名称.includes(this.子技能名 || "") && field.名称 === "神智消耗")?.值 || 0
    }

    get 每秒神智消耗(): number {
        return this.字段.find((field) => field.名称.includes(this.子技能名 || "") && field.名称 === "每秒神智消耗")?.值 || 0
    }

    get 伤害() {
        return this.字段.find((field) => field.名称.includes(this.子技能名 || "") && field.名称.includes("伤害"))
    }

    /**
     * 根据技能等级更新技能属性
     * 使用公式：最终技能数据 = 10级技能数据 / (1 + (10级技能数据/1级技能数据-1)/9 * (10-技能等级))
     */
    private updateProperties(): void {
        this.字段 = this.skillData.字段.map((field) => ({
            ...field,
            值: Array.isArray(field.值) ? field.值[this._level - 1] : field.值,
            额外: Array.isArray(field.额外) ? field.额外[this._level - 1] : field.额外,
        }))
    }

    /**
     * 获取技能的完整属性信息
     */
    getFullProperties(): Skill & { 等级: number } {
        return {
            ...this,
            等级: this._level,
        }
    }
}
