import type { Char, CommonAttr, SkillWeapon } from "../data-types"
import { CommonLevelUp } from "./CommonLevelUp"
import { LeveledSkill } from "./LeveledSkill"

export type LeveledCharResolver = (id: string | number) => Char | undefined

let leveledCharResolver: LeveledCharResolver | undefined

export function setLeveledCharResolver(resolver: LeveledCharResolver) {
    leveledCharResolver = resolver
}

/**
 * LeveledChar类 - 继承Char接口，添加等级属性和动态属性计算
 */
export class LeveledChar {
    id: number
    // 基础Char属性
    icon: string
    名称: string
    属性: string
    精通: string[]
    溯源?: string[]
    同律武器?: SkillWeapon[]
    基础攻击: number
    基础生命: number
    基础护盾: number
    基础防御: number
    基础神智: number
    加成?: CommonAttr
    阵营?: string
    别名?: string
    技能: LeveledSkill[] = []

    // 等级属性
    _等级: number = 1
    // 80级时的基准属性值
    _baseATK: number
    _baseHP: number
    _baseShield: number
    _originalCharData: Char

    /**
     * 构造函数
     * @param id 角色的名称
     * @param 等级 可选的角色等级
     */
    constructor(id: string | number | Char, 等级?: number) {
        const charData = typeof id === "string" || typeof id === "number" ? leveledCharResolver?.(id) : id
        if (!charData) {
            throw new Error(typeof id === "string" || typeof id === "number" ? `角色 "${id}" 未在静态表中找到` : "角色数据不能为空")
        }

        this._originalCharData = charData

        // 复制基础属性
        this.id = charData.id
        this.icon = charData.icon || ""
        this.名称 = charData.名称
        this.属性 = charData.属性
        this.精通 = charData.精通
        this.溯源 = charData.溯源
        this.基础攻击 = charData.基础攻击
        this.基础生命 = charData.基础生命
        this.基础护盾 = charData.基础护盾
        this.基础防御 = charData.基础防御
        this.基础神智 = charData.基础神智
        if (charData.别名) this.别名 = charData.别名
        if (charData.阵营) this.阵营 = charData.阵营
        if (charData.加成) this.加成 = charData.加成
        if (charData.同律武器) this.同律武器 = charData.同律武器
        this.技能 = charData.技能.map(skill => new LeveledSkill(skill))

        // 保存80级的基准属性值（当前导入的数据是80级的数据）
        this._baseATK = charData.基础攻击
        this._baseHP = charData.基础生命
        this._baseShield = charData.基础护盾

        this.等级 = 等级 ?? 80
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
    updatePropertiesByLevel(level: number): void {
        // 确保等级在1-80之间
        const clampedLevel = Math.max(1, Math.min(80, level))

        // 找到当前等级对应的倍数
        const multiplier = CommonLevelUp[clampedLevel - 1]

        // 更新属性（基础神智不受等级影响）
        this.基础攻击 = Math.round(this._baseATK * multiplier * 100) / 100
        this.基础生命 = Math.round(this._baseHP * multiplier)
        this.基础护盾 = Math.round(this._baseShield * multiplier)
    }

    static properties = [
        "基础攻击",
        "基础生命",
        "基础护盾",
        "基础防御",
        "基础神智",
        "技能范围",
        "攻击",
        "技能耐久",
        "生命",
        "技能威力",
        "背水",
        "防御",
        "技能效益",
        "昂扬",
    ] as const

    getProperties(): Record<string, number> {
        const properties: Record<string, number> = {}
        for (const prop of LeveledChar.properties) {
            const value = this.加成?.[prop]
            if (value !== undefined) {
                properties[prop] = value
            }
        }
        return properties
    }

    get url() {
        return LeveledChar.url(this.icon)
    }
    static url(icon?: string) {
        return icon ? `/imgs/webp/T_Head_${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
    get elementUrl() {
        return LeveledChar.elementUrl(this.属性)
    }
    static elementUrl(element: string) {
        const map: Record<string, string> = {
            光: "Light",
            暗: "Dark",
            水: "Water",
            火: "Fire",
            风: "Wind",
            雷: "Thunder",
        }
        return `/imgs/webp/T_Armory_${map[element]}.webp`
    }

    get bg() {
        return `https://herobox-img.yingxiong.com/role/config/character/illustration_1/${bgMap[this.名称]}`
    }

    public clone() {
        return new LeveledChar(this._originalCharData, this._等级)
    }
}

const bgMap = {
    妮弗尔夫人: "nifuerfuren.png",
    莉兹贝尔: "lizibeier.png",
    丽蓓卡: "libeika.png",
    扶疏: "fushu.png",
    琳恩: "linen.png",
    黎瑟: "lise.png",
    赛琪: "saiqi.png",
    菲娜: "feina.png",
    松露与榛子: "songlu.png",
    贝蕾妮卡: "beileinika.png",
    幻景: "huanjing.png",
    "女主-光": "nvzhuguang.png",
    塔比瑟: "tabise.png",
    玛尔洁: "maerjie.png",
    兰迪: "landi.png",
    西比尔: "xibier.png",
    奥特赛德: "aotesaide.png",
    达芙涅: "dafunie.png",
    耶尔与奥利弗: "yeer.png",
    海尔法: "haierfa.png",
    止流: "zhiliu.png",
    煜明: "yuming.png",
} as Record<string, string>
