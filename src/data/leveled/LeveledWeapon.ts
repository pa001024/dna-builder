import { CommonLevelUp, LeveledBuff, LeveledSkill } from "."
import { effectMap, weaponMap, weaponNameMap } from "../d"
import { DmgType, Skill, SkillField, Weapon } from "../data-types"

/**
 * LeveledWeapon类 - 继承Weapon接口，添加等级和精炼属性和动态属性计算
 */
export class LeveledWeapon {
    // 基础Weapon属性
    id: number
    名称: string
    类型: string
    类别: string
    伤害类型: keyof typeof DmgType
    基础攻击: number
    基础暴击: number
    基础暴伤: number
    基础触发: number
    弹道类型?: string;
    [key: string]: any
    buff?: LeveledBuff
    buffProps: Record<string, number> = {}
    // 新增属性
    倍率 = 1
    弹片数?: number
    射速?: number
    基础装填?: number
    基础弹匣?: number
    段数?: number
    技能?: LeveledSkill[]

    // 等级和精炼属性
    _等级: number = 80 // 武器等级，默认80级
    _精炼: number = 5 // 武器精炼等级，默认5级
    // 原始武器对象
    _originalWeaponData: Weapon
    // 精炼等级上限（目前武器精炼等级上限固定为5）
    static _maxRefineLevel: number = 5

    static get emptyWeapon(): LeveledWeapon {
        return new LeveledWeapon({
            id: 0,
            名称: "空武器",
            类型: ["近战", "长柄"],
            伤害类型: "切割",
            攻击: 0,
            暴击: 0,
            暴伤: 0,
            触发: 0,
            描述: "",
            加成: {},
            熔炼: [],
            技能: [],
        })
    }

    /**
     * 构造函数
     * @param weaponId 武器的名称
     * @param 精炼 可选的武器精炼等级
     * @param 等级 可选的武器等级
     * @param effectLv 可选的效果等级
     */
    constructor(
        weaponId: number | string | Weapon,
        精炼?: number,
        等级?: number,
        public effectLv?: number
    ) {
        // 从统一的武器Map中获取武器数据
        const weaponData =
            typeof weaponId === "number" ? weaponMap.get(weaponId) : typeof weaponId === "string" ? weaponNameMap.get(weaponId) : weaponId

        if (!weaponData) {
            throw new Error(`武器名称 "${weaponId}" 未在静态表中找到`)
        }
        // 保存原始武器对象和类型
        this._originalWeaponData = weaponData

        // 复制基础属性
        this.id = weaponData.id
        this.名称 = weaponData.名称
        this.描述 = weaponData.描述
        this.类型 = weaponData.类型[0]
        this.类别 = weaponData.类型[1]
        this.伤害类型 = weaponData.伤害类型
        this.基础攻击 = weaponData.攻击
        this.基础暴击 = weaponData.暴击
        this.基础暴伤 = weaponData.暴伤
        this.基础触发 = weaponData.触发
        if (weaponData.技能) {
            const skills = weaponData.技能.map(v => {
                const skill: Skill = {
                    名称: v.名称,
                    武器: this.类型,
                    类型: v.类型,
                }
                if (v.字段) {
                    skill.字段 = Object.keys(v.字段).map(key => {
                        let fstr = v.字段![key] as string | SkillField
                        if (typeof fstr === "string") {
                            const str = fstr
                            fstr = {
                                名称: key,
                                格式: str.replace(/\d+\.\d+%/g, "{%}").replace(/×\d+/g, "×{}"),
                                值: str.match(/\d+\.\d+%/g)?.map(match => parseFloat(match.replace("%", "")) / 100)[0] || 0,
                            } satisfies SkillField
                            fstr.段数 = str.match(/×\d+/g)?.map(match => parseFloat(match.replace("×", "")))[0] || 1
                        }
                        return fstr as SkillField
                    })
                }
                return skill
            })
            this.技能 = skills.map(skill => new LeveledSkill(skill, undefined, weaponData.名称))
            this.弹道类型 = weaponData.技能.some(v => "射线伤害" in v.字段!) ? "非弹道" : "弹道"
        }

        if (effectMap.has(this.名称)) {
            this.buff = new LeveledBuff(effectMap.get(this.名称)!, effectLv)
            this.buff.pid = this.id
            this.buff.pt = "Weapon"
        }

        // 初始化倍率相关属性为undefined
        this.弹片数 = undefined
        this.射速 = undefined
        this.基础装填 = weaponData.装填 || 0
        this.段数 = 1

        // 设置精炼等级（如果提供），否则设为5
        this._精炼 = Math.max(0, Math.min(LeveledWeapon._maxRefineLevel, 精炼 ?? 5))

        // 设置武器等级（如果提供），否则设为80
        this._等级 = Math.max(1, Math.min(80, 等级 ?? 80))

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

    /**
     * 精炼属性的getter和setter
     */
    get 精炼(): number {
        return this._精炼
    }

    set 精炼(value: number) {
        // 确保精炼等级在0到精炼等级上限之间
        this._精炼 = Math.max(0, Math.min(LeveledWeapon._maxRefineLevel, value))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 根据等级和精炼更新武器属性
     * 基础攻击受等级影响，其他属性受精炼影响
     */
    updateProperties(): void {
        // 根据武器等级调整基础攻击
        const clampedLevel = Math.max(1, Math.min(80, this._等级))
        this.基础攻击 = +(this._originalWeaponData.攻击 * CommonLevelUp[clampedLevel - 1]).toFixed(2)

        // 根据精炼等级调整属性
        this.baseProperties.forEach(prop => {
            const originalValue = this._originalWeaponData.加成?.[prop]
            if (originalValue !== undefined) {
                const currentValue = (originalValue / 5) * (this._精炼 + 5)
                this[prop] = currentValue
                this.效果 = this._originalWeaponData.熔炼?.[this._精炼] || ""
                this.效果 = this.效果.replace(/^.+?。/, "")
            }
        })
        if (this.buff) {
            const buff = this.buff
            const props = this.buff.getProperties()
            Object.keys(props).forEach(prop => {
                const maxValue = buff[prop] || 0
                const currentValue = (maxValue / 10) * (this._精炼 + 5)
                const baseValue = (buff.baseValue / 10) * (this._精炼 + 5)
                this[prop] = currentValue
                this.buffProps[prop] = currentValue
                if (buff.描述.includes(`{%}`)) {
                    buff.描述 = buff._originalBuffData.描述.replace(`{%}`, `${(baseValue * 100).toFixed(1)}%`)
                }
            })
        }
    }

    /**
     * 获取武器的属性信息
     */
    getProperties(): Record<string, number> {
        const properties: Record<string, number> = {}
        this.properties.forEach(prop => {
            properties[prop] = this[prop]
        })
        return properties
    }
    getSimpleProperties(): Record<string, number> {
        const properties: Record<string, number> = {}
        this.simpleProperties.forEach(prop => {
            properties[prop] = this[prop]
        })
        return properties
    }
    static _exclude_properties = new Set([
        "id",
        "名称",
        "类型",
        "类别",
        "倍率",
        "弹片数",
        "弹道类型",
        "射速",
        "段数",
        "描述",
        "技能",
        "效果",
        "_精炼",
        "buff",
        "effectLv",
        "_等级",
        "_originalWeaponData",
        "buffProps",
    ])
    static _exclude_simple_properties = new Set([
        "id",
        "名称",
        "类型",
        "类别",
        "伤害类型",
        "基础攻击",
        "基础暴击",
        "基础暴伤",
        "基础触发",
        "基础装填",
        "基础弹匣",
        "技能",
        "倍率",
        "弹片数",
        "弹道类型",
        "射速",
        "描述",
        "效果",
        "段数",
        "_精炼",
        "buff",
        "effectLv",
        "_等级",
        "_originalWeaponData",
        "buffProps",
    ])
    static _exclude_base_properties = new Set([
        "id",
        "名称",
        "类型",
        "类别",
        "伤害类型",
        "基础攻击",
        "基础暴击",
        "基础暴伤",
        "基础触发",
        "倍率",
        "弹片数",
        "弹道类型",
        "射速",
        "段数",
        "buff",
    ])
    get properties(): string[] {
        return Object.keys(this).filter(prop => !LeveledWeapon._exclude_properties.has(prop))
    }
    get simpleProperties(): string[] {
        return Object.keys(this).filter(prop => !LeveledWeapon._exclude_simple_properties.has(prop))
    }
    get baseProperties(): string[] {
        return Object.keys(this._originalWeaponData.加成 || {})
    }

    get url() {
        return `/imgs/${this.名称}.png`
    }

    static getUrl(weaponName: string) {
        return `/imgs/${weaponName}.png`
    }

    public clone(): LeveledWeapon {
        const weapon = new LeveledWeapon(this._originalWeaponData, this._精炼, this._等级, this.effectLv)
        return weapon
    }

    setEffectLv(lv: number) {
        this.effectLv = lv
        this.updatePropertiesByLevel()
        return this
    }

    get attrType() {
        return "角色" as const
    }
    get addAttr(): Record<string, number> {
        const r: Record<string, number> = {}
        this.baseProperties.forEach(prop => {
            r[prop] = this[prop]
        })
        return r
    }
    get minusAttr() {
        const r: Record<string, any> = this.clone()
        this.baseProperties.forEach(prop => {
            r[prop] = -this[prop]
        })
        r.isMinus = true
        return r as LeveledWeapon
    }
}
