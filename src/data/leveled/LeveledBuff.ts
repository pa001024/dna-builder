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
    攻击?: number
    增伤?: number
    武器伤害?: number
    威力?: number
    范围?: number
    暴击?: number
    追加伤害?: number
    属性穿透?: number
    异常数量?: number
    技能伤害?: number
    背水?: number
    固定攻击?: number
    防御?: number
    效益?: number
    昂扬?: number
    生命?: number
    属性伤?: number
    MOD属性?: number
    多重?: number
    失衡易伤?: number
    神智回复?: number
    独立增伤?: number
    暴伤?: number
    护盾?: number
    神智?: number
    耐久?: number
    攻速?: number
    近战增伤?: number
    无视防御?: number

    // 等级属性
    private _等级: number = 1
    // 原始Buff对象
    private _originalBuffData: Buff

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
        this.a = buffData.a
        this.b = buffData.b
        this.dx = buffData.dx
        this.lx = buffData.lx
        this.mx = buffData.mx
        this.攻击 = buffData.攻击
        this.增伤 = buffData.增伤
        this.武器伤害 = buffData.武器伤害
        this.威力 = buffData.威力
        this.范围 = buffData.范围
        this.暴击 = buffData.暴击
        this.追加伤害 = buffData.追加伤害
        this.属性穿透 = buffData.属性穿透
        this.异常数量 = buffData.异常数量
        this.技能伤害 = buffData.技能伤害
        this.背水 = buffData.背水
        this.固定攻击 = buffData.固定攻击
        this.防御 = buffData.防御
        this.效益 = buffData.效益
        this.昂扬 = buffData.昂扬
        this.生命 = buffData.生命
        this.属性伤 = buffData.属性伤
        this.MOD属性 = buffData.MOD属性
        this.多重 = buffData.多重
        this.失衡易伤 = buffData.失衡易伤
        this.神智回复 = buffData.神智回复
        this.独立增伤 = buffData.独立增伤
        this.暴伤 = buffData.暴伤
        this.护盾 = buffData.护盾
        this.神智 = buffData.神智
        this.耐久 = buffData.耐久
        this.攻速 = buffData.攻速
        this.近战增伤 = buffData.近战增伤
        this.无视防御 = buffData.无视防御

        // 设置等级（如果提供），否则使用默认等级dx
        this._等级 = this.dx || 1
        if (等级 !== undefined && 等级 !== this._等级) {
            this.等级 = 等级
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
        const lx = this.lx || 1
        const x = this._等级

        const properties = [
            "攻击",
            "增伤",
            "武器伤害",
            "威力",
            "范围",
            "暴击",
            "追加伤害",
            "属性穿透",
            "异常数量",
            "技能伤害",
            "背水",
            "固定攻击",
            "防御",
            "效益",
            "昂扬",
            "生命",
            "属性伤",
            "MOD属性",
            "多重",
            "失衡易伤",
            "神智回复",
            "独立增伤",
            "暴伤",
            "护盾",
            "神智",
            "耐久",
            "攻速",
            "近战增伤",
            "无视防御",
        ]

        properties.forEach((prop) => {
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