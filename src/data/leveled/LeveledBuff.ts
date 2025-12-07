import { buffMap } from "."
import { Buff } from "../data-types"

/**
 * LeveledBuff类 - 继承Buff接口，添加等级属性和动态属性计算
 */
export class LeveledBuff implements Buff {
    // 基础Buff属性
    名称: string
    描述: string
    a?: number
    b?: number
    dx?: number
    lx?: number
    mx?: number

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
        this.等级 = this.dx || 1
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
        const lx = this.lx || 1
        const x = this._等级

        LeveledBuff.properties.forEach((prop) => {
            const maxValue = (this._originalBuffData as any)[prop]
            if (maxValue !== undefined) {
                // 属性值 = 满级属性/a*(1+1/b*(x-lx))
                const currentValue = (maxValue / a) * (1 + (1 / b) * (x - lx))
                ;(this as any)[prop] = currentValue
            }
        })
    }

    /**
     * 获取Buff的完整属性信息
     */
    getFullProperties(): Buff & { 等级: number } {
        return {
            ...this,
            等级: this._等级,
        }
    }
}
