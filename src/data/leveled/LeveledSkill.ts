import { skillMap } from "."
import { Skill } from "../data-types"

/**
 * LeveledSkill类 - 继承Skill接口，添加等级属性和动态属性计算
 */
export class LeveledSkill implements Skill {
    // 基础Skill属性
    名称: string
    角色: string
    伤害类型: string
    攻击倍率?: number
    固定范围?: number
    技能持续?: number
    神智消耗?: number
    持续消耗?: number
    技能范围?: number
    生命倍率?: number
    固定伤害?: number
    固定持续?: number
    防御倍率?: number

    // 内部私有属性
    private _level: number
    private _skillData: { level1: Skill; level10: Skill }

    /**
     * 构造函数
     * @param 技能名称 技能的名称
     * @param 等级 技能等级（可选，默认为10）
     */
    constructor(技能名称: string, 等级?: number) {
        // 获取技能基础数据
        const skillData = skillMap.get(技能名称)
        if (!skillData || !skillData.level1 || !skillData.level10) {
            // 处理技能不存在的情况
            console.error(`技能 ${技能名称} 不存在或数据不完整`)
            // 创建一个默认技能对象
            this.名称 = 技能名称
            this.角色 = "未知"
            this.等级 = 1
            this.伤害类型 = "未知"
            this._skillData = { level1: this as Skill, level10: this as Skill }
        } else {
            // 设置基础属性
            this.名称 = skillData.level1.名称
            this.角色 = skillData.level1.角色
            this.伤害类型 = skillData.level1.伤害类型
            this._skillData = skillData
        }

        // 设置技能等级（如果提供），否则设为10
        this._level = 等级 || 10
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
        // 确保等级在1到10之间
        this._level = Math.max(1, Math.min(10, value))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 根据技能等级更新技能属性
     * 使用公式：最终技能数据 = 10级技能数据 / (1 + (10级技能数据/1级技能数据-1)/9 * (10-技能等级))
     */
    private updateProperties(): void {
        // 需要计算的技能属性列表
        const skillProperties = [
            "攻击倍率",
            "固定范围",
            "技能持续",
            "神智消耗",
            "持续消耗",
            "技能范围",
            "生命倍率",
            "固定伤害",
            "固定持续",
            "防御倍率",
        ]

        skillProperties.forEach((prop) => {
            const level1Value = (this._skillData.level1 as any)[prop]
            const level10Value = (this._skillData.level10 as any)[prop]

            if (level1Value !== undefined && level10Value !== undefined) {
                let finalValue: number

                // 应用技能等级变化公式
                if (level1Value === 0 || level10Value === 0) {
                    // 处理特殊情况，避免除以零
                    finalValue = level1Value + (level10Value - level1Value) * ((this._level - 1) / 9)
                } else {
                    const ratio = level10Value / level1Value
                    finalValue = level10Value / (1 + ((ratio - 1) / 9) * (10 - this._level))
                }

                // 设置计算后的值
                ;(this as any)[prop] = finalValue
            }
        })
    }

    /**
     * 获取技能的完整属性信息
     */
    getFullProperties(): Skill & { 技能等级: number } {
        return {
            ...this,
            技能等级: this._level,
        }
    }
}
