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
    id: number
    名称: string
    系列?: string
    品质: string
    极性?: string
    耐受: number
    类型: string
    属性?: string
    限定?: string
    效果?: string

    // 浮动属性
    威力?: number
    耐久?: number
    效益?: number
    范围?: number
    攻击?: number
    生命?: number
    护盾?: number
    防御?: number
    神智?: number
    属性伤?: number
    减伤?: number
    增伤?: number
    武器伤害?: number
    技能伤害?: number
    独立增伤?: number
    昂扬?: number
    背水?: number
    追加伤害?: number
    固定攻击?: number
    技能速度?: number
    召唤物范围?: number
    召唤物攻速?: number
    失衡易伤?: number
    神智回复?: number
    暴击?: number
    暴伤?: number
    触发?: number
    物理?: number
    攻速?: number
    多重?: number
    攻击范围?: number
    滑行伤害?: number
    滑行速度?: number
    下落伤害?: number
    下落速度?: number
    蓄力速度?: number
    弹药?: number
    弹匣?: number
    装填?: number
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
        this.极性 = modData.极性
        this.耐受 = modData.耐受
        this.类型 = modData.类型
        this.属性 = modData.属性
        this.限定 = modData.限定
        this.效果 = modData.效果

        // 获取该品质MOD的等级上限
        this._maxLevel = LeveledMod.modQualityMaxLevel[this.品质] || 1

        // 设置等级（如果提供），否则设为等级上限
        this._等级 = 等级 !== undefined ? Math.max(0, Math.min(this._maxLevel, 等级)) : this._maxLevel

        // 更新属性
        this.updateProperties()
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

    static properties = [
        "威力",
        "耐久",
        "效益",
        "范围",
        "攻击",
        "生命",
        "护盾",
        "防御",
        "神智",
        "属性伤",
        "减伤",
        "增伤",
        "武器伤害",
        "技能伤害",
        "独立增伤",
        "昂扬",
        "背水",
        "追加伤害",
        "固定攻击",
        "技能速度",
        "召唤物范围",
        "召唤物攻速",
        "失衡易伤",
        "神智回复",
        "暴击",
        "暴伤",
        "触发",
        "物理",
        "攻速",
        "多重",
        "攻击范围",
        "滑行伤害",
        "滑行速度",
        "下落伤害",
        "下落速度",
        "蓄力速度",
        "弹药",
        "弹匣",
        "装填",
        "弹转",
        "触发倍率",
    ] as const
    /**
     * 根据等级更新MOD属性
     */
    private updateProperties(): void {
        // 属性值 = 满级属性/(等级上限+1)*(等级+1)
        // 架势MOD属性耐受等级越高越低
        if (this.id > 100000) {
            this.耐受 = (this._originalModData as any).耐受 + this._maxLevel - this._等级
        } else {
            this.耐受 = (this._originalModData as any).耐受 - this._maxLevel + this._等级
        }

        LeveledMod.properties.forEach((prop) => {
            let lv = this._等级
            // 架势MOD属性不受等级变化
            if (this.id > 100000) lv = this._maxLevel
            const maxValue = (this._originalModData as any)[prop]
            if (maxValue !== undefined) {
                let currentValue = (maxValue / (this._maxLevel + 1)) * (lv + 1)
                if (prop === "神智回复") currentValue = Math.round(currentValue)
                ;(this as any)[prop] = currentValue
            }
        })
    }

    /**
     * 获取MOD的属性信息
     */
    getProperties(): Partial<Mod> {
        const properties: Partial<Mod> = {}
        LeveledMod.properties.forEach((prop) => {
            if ((this as any)[prop]) properties[prop] = (this as any)[prop]
        })
        return properties
    }

    get url() {
        if (this.系列 && ["狮鹫", "百首", "契约者"].includes(this.系列)) return `/imgs/${this.属性}${this.系列}.png`
        return `/imgs/${this.系列}系列.png`
    }
}
