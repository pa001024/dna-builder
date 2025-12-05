import { modMap } from "."
import { Mod, Quality } from "../data-types"

/**
 * LeveledMod类 - 继承Mod接口，添加等级属性和动态属性计算
 */
export class LeveledMod implements Mod {
    // MOD品质对应的等级上限
    static modQualityMaxLevel: Record<string, number> = {
        [Quality.金]: 10,
        [Quality.紫]: 5,
        [Quality.蓝]: 5,
        [Quality.绿]: 3,
        [Quality.白]: 3,
    }
    // 基础Mod属性
    id?: number
    名称: string
    系列?: string
    品质: string
    耐受: number
    攻击?: number
    类型: string
    生命?: number
    护盾?: number
    神智?: number
    防御?: number
    属性?: string
    极性?: string
    威力?: number
    耐久?: number
    属性伤?: number
    范围?: number
    昂扬?: number
    背水?: number
    技能伤害?: number
    追加伤害?: number
    神智回复?: number
    效果?: string
    增伤?: number
    效益?: number
    减伤?: number
    失衡易伤?: number
    攻速?: number
    暴击?: number
    暴伤?: number
    触发?: number
    多重?: number
    独立增伤?: number
    弹药?: number
    装填?: number
    弹匣?: number
    滑行伤害?: number
    下落伤害?: number
    下落速度?: number
    蓄力速度?: number
    滑行速度?: number
    弹转?: number
    触发倍率?: number

    // 等级属性
    private _等级: number
    // 原始MOD对象
    private _originalModData: Mod
    // 等级上限
    private _maxLevel: number

    /**
     * 构造函数
     * @param modid mod的id
     * @param 等级 可选的mod等级
     */
    constructor(modid: number, 等级?: number) {
        // 从Map中获取对应的Mod对象
        const modData = modMap.get(modid)
        if (!modData) {
            throw new Error(`MOD ID "${modid}" 未在静态表中找到`)
        }

        // 保存原始MOD对象
        this._originalModData = modData

        // 复制基础属性
        this.id = modData.id
        this.名称 = modData.名称
        this.系列 = modData.系列
        this.品质 = modData.品质
        this.耐受 = modData.耐受
        this.攻击 = modData.攻击
        this.类型 = modData.类型
        this.生命 = modData.生命
        this.护盾 = modData.护盾
        this.神智 = modData.神智
        this.防御 = modData.防御
        this.属性 = modData.属性
        this.极性 = modData.极性
        this.威力 = modData.威力
        this.耐久 = modData.耐久
        this.属性伤 = modData.属性伤
        this.范围 = modData.范围
        this.昂扬 = modData.昂扬
        this.背水 = modData.背水
        this.技能伤害 = modData.技能伤害
        this.追加伤害 = modData.追加伤害
        this.神智回复 = modData.神智回复
        this.效果 = modData.效果
        this.增伤 = modData.增伤
        this.效益 = modData.效益
        this.减伤 = modData.减伤
        this.失衡易伤 = modData.失衡易伤
        this.攻速 = modData.攻速
        this.暴击 = modData.暴击
        this.暴伤 = modData.暴伤
        this.触发 = modData.触发
        this.多重 = modData.多重
        this.独立增伤 = modData.独立增伤
        this.弹药 = modData.弹药
        this.装填 = modData.装填
        this.弹匣 = modData.弹匣
        this.滑行伤害 = modData.滑行伤害
        this.下落伤害 = modData.下落伤害
        this.下落速度 = modData.下落速度
        this.蓄力速度 = modData.蓄力速度
        this.滑行速度 = modData.滑行速度
        this.弹转 = modData.弹转
        this.触发倍率 = modData.触发倍率

        // 获取该品质MOD的等级上限
        this._maxLevel = LeveledMod.modQualityMaxLevel[this.品质] || 1

        // 设置等级（如果提供），否则设为等级上限
        this._等级 = 等级 !== undefined ? Math.max(0, Math.min(this._maxLevel, 等级)) : this._maxLevel

        // 更新属性
        if (this._等级 !== this._maxLevel) this.updateProperties()
    }

    /**
     * 等级属性的getter和setter
     */
    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        // 确保等级在1到80之间
        this._等级 = Math.max(1, Math.min(80, value))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 根据等级更新MOD属性
     */
    private updateProperties(): void {
        // 属性值 = 满级属性/(等级上限+1)*(等级+1)
        const properties = [
            "攻击",
            "生命",
            "护盾",
            "神智",
            "防御",
            "威力",
            "耐久",
            "属性伤",
            "范围",
            "昂扬",
            "背水",
            "技能伤害",
            "追加伤害",
            "神智回复",
            "增伤",
            "效益",
            "减伤",
            "失衡易伤",
            "攻速",
            "近战增伤",
            "无视防御",
            "暴击",
            "暴伤",
            "触发",
            "多重",
            "独立增伤",
            "弹药",
            "装填",
            "弹匣",
            "滑行伤害",
            "下落伤害",
            "下落速度",
            "蓄力速度",
            "滑行速度",
            "弹转",
            "触发倍率",
        ]
        // 架势MOD属性不受等级变化
        if (this.id && this.id > 100000) {
            this.耐受 = (this._originalModData as any).耐受 + this._maxLevel - this._等级
            return
        } else {
            this.耐受 = (this._originalModData as any).耐受 - this._maxLevel + this._等级
        }

        properties.forEach((prop) => {
            const maxValue = (this._originalModData as any)[prop]
            if (maxValue !== undefined) {
                const currentValue = (maxValue / (this._maxLevel + 1)) * (this._等级 + 1)
                ;(this as any)[prop] = currentValue
            }
        })
    }

    /**
     * 获取MOD的完整属性信息
     */
    getFullProperties(): Mod & { 等级: number } {
        return {
            ...this,
            等级: this._等级,
        }
    }

    get url() {
        if (this.系列 && ["狮鹫", "百首", "契约者"].includes(this.系列)) return `/imgs/${this.属性}${this.系列}.png`
        return `/imgs/${this.系列}系列.png`
    }
}
