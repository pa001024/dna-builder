import { charMap, CommonLevelUp, LeveledSkill } from "."
import { Char } from "../data-types"

/**
 * LeveledChar类 - 继承Char接口，添加等级属性和动态属性计算
 */
export class LeveledChar implements Char {
    id?: number
    // 基础Char属性
    名称: string
    属性: string
    近战: string
    远程: string
    同律武器?: string
    基础攻击: number
    基础生命: number
    基础护盾: number
    基础防御: number
    基础神智: number;
    [key: string]: any
    技能: LeveledSkill[] = []

    // 等级属性
    private _等级: number = 80
    // 80级时的基准属性值
    private _base80Attack: number
    private _base80Life: number
    private _base80Shield: number

    /**
     * 构造函数
     * @param 角色名 角色的名称
     * @param 等级 可选的角色等级
     */
    constructor(角色名: string, 等级?: number) {
        // 从Map中获取对应的Char对象
        const charData = charMap.get(角色名)
        if (!charData) {
            throw new Error(`角色 "${角色名}" 未在静态表中找到`)
        }

        // 复制基础属性
        this.id = charData.id
        this.名称 = charData.名称
        this.属性 = charData.属性
        this.近战 = charData.近战
        this.远程 = charData.远程
        this.基础攻击 = charData.基础攻击
        this.基础生命 = charData.基础生命
        this.基础护盾 = charData.基础护盾
        this.基础防御 = charData.基础防御
        this.基础神智 = charData.基础神智
        if (charData.同律武器) this.同律武器 = charData.同律武器
        if (charData.范围) this.范围 = charData.范围
        if (charData.攻击) this.攻击 = charData.攻击
        if (charData.耐久) this.耐久 = charData.耐久
        if (charData.生命) this.生命 = charData.生命
        if (charData.威力) this.威力 = charData.威力
        if (charData.背水) this.背水 = charData.背水
        if (charData.防御) this.防御 = charData.防御
        if (charData.效益) this.效益 = charData.效益
        if (charData.昂扬) this.昂扬 = charData.昂扬
        this.技能 = charData.技能.map((skill) => new LeveledSkill(skill))

        // 保存80级的基准属性值（当前导入的数据是80级的数据）
        this._base80Attack = charData.基础攻击
        this._base80Life = charData.基础生命
        this._base80Shield = charData.基础护盾

        // 设置等级（如果提供）
        if (等级) {
            this.等级 = 等级
        }
    }

    static getSkillNames(角色名: string) {
        return charMap.get(角色名)?.技能.map((skill) => skill.名称) || []
    }
    static getSkillNamesWithSub(角色名: string) {
        const skills = charMap.get(角色名)?.技能.map((skill) => new LeveledSkill(skill)) || []
        // 拼接主技能和子技能
        return skills.flatMap((skill) => [skill.名称, ...skill.子技能.map((subSkill) => `${skill.名称}[${subSkill}]`)])
    }

    /**
     * 等级属性的getter和setter
     */
    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        // 确保等级在1-80之间
        if (value !== undefined) {
            const _new = Math.max(1, Math.min(80, value))
            if (this._等级 !== _new) {
                this._等级 = _new
                this.updatePropertiesByLevel(_new)
            }
        }
    }

    /**
     * 根据等级更新角色属性
     * @param level 角色等级
     */
    private updatePropertiesByLevel(level: number): void {
        // 确保等级在1-80之间
        const clampedLevel = Math.max(1, Math.min(80, level))

        // 找到当前等级对应的倍数
        let multiplier = CommonLevelUp[clampedLevel - 1] / CommonLevelUp.at(-1)!

        // 更新属性（基础神智不受等级影响）
        this.基础攻击 = Math.round(this._base80Attack * multiplier)
        this.基础生命 = Math.round(this._base80Life * multiplier)
        this.基础护盾 = Math.round(this._base80Shield * multiplier)
    }

    static properties = [
        "基础攻击",
        "基础生命",
        "基础护盾",
        "基础防御",
        "基础神智",
        "范围",
        "攻击",
        "耐久",
        "生命",
        "威力",
        "背水",
        "防御",
        "效益",
        "昂扬",
    ] as const

    getProperties(): Partial<Char> {
        const properties: Partial<Char> = {}
        LeveledChar.properties.forEach((prop) => {
            if ((this as any)[prop]) properties[prop] = (this as any)[prop]
        })
        return properties
    }

    get url() {
        return `/imgs/${this.名称}.png`
    }
    get urlFull() {
        return `/imgs/${this.名称}角色立绘.png`
    }
}
