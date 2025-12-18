import { uniq } from "lodash-es"
import { baseMap, effectMap, LeveledBuff, weaponMap } from "."
import { Weapon, WeaponBase } from "../data-types"

/**
 * LeveledWeapon类 - 继承Weapon接口，添加等级和精炼属性和动态属性计算
 */
export class LeveledWeapon implements Weapon {
    // 基础Weapon属性
    id?: number
    名称: string
    类型: string
    类别: string
    伤害类型: string
    基础攻击: number
    基础暴击: number
    基础暴伤: number
    基础触发: number
    弹道类型?: string;
    [key: string]: any
    buff?: LeveledBuff
    // 新增属性
    倍率 = 1
    弹片数?: number
    射速?: number
    段数?: number
    private _倍率名称?: string

    // 等级和精炼属性
    private _等级: number = 80 // 武器等级，默认80级
    private _精炼: number = 5 // 武器精炼等级，默认5级
    // 原始武器对象
    private _originalWeaponData: Weapon
    // 精炼等级上限（目前武器精炼等级上限固定为5）
    private static _maxRefineLevel: number = 5
    // 武器等级对应的基础攻击倍数（1,10,20,30,40,50,60,70,80级）
    private static _levelAttackMultipliers: number[] = [
        0.079666848, 0.206300923, 0.302118414, 0.413724425, 0.529132718, 0.682636248, 0.813579576, 1,
    ]

    static get emptyWeapon(): LeveledWeapon {
        return new LeveledWeapon({
            名称: "空武器",
            类别: "近战",
            类型: "长柄",
            伤害类型: "切割",
            基础攻击: 0,
            基础暴击: 0,
            基础暴伤: 0,
            基础触发: 0,
        })
    }

    /**
     * 构造函数
     * @param weaponName 武器的名称
     * @param 精炼 可选的武器精炼等级
     * @param 等级 可选的武器等级
     * @param effectLv 可选的效果等级
     */
    constructor(
        weaponName: string | Weapon,
        精炼?: number,
        等级?: number,
        public effectLv?: number,
    ) {
        // 从统一的武器Map中获取武器数据
        const weaponData = typeof weaponName === "string" ? weaponMap.get(weaponName) : weaponName

        if (!weaponData) {
            throw new Error(`武器名称 "${weaponName}" 未在静态表中找到`)
        }
        // 保存原始武器对象和类型
        this._originalWeaponData = weaponData

        // 复制基础属性
        this.id = weaponData.id
        this.名称 = weaponData.名称
        this.类型 = weaponData.类型
        this.类别 = weaponData.类别
        this.伤害类型 = weaponData.伤害类型
        this.基础攻击 = weaponData.基础攻击
        this.基础暴击 = weaponData.基础暴击
        this.基础暴伤 = weaponData.基础暴伤
        this.基础触发 = weaponData.基础触发
        if (weaponData.弹道类型) this.弹道类型 = weaponData.弹道类型

        if (effectMap.has(this.名称)) {
            this.buff = new LeveledBuff(effectMap.get(this.名称)!, effectLv)
            this.buff.pid = this.名称
        }

        // 初始化倍率相关属性为undefined
        this.弹片数 = undefined
        this.射速 = undefined
        this.段数 = 1
        this._倍率名称 = undefined

        // 设置倍率名称，如果未提供则使用默认倍率
        this.倍率名称 = this.默认倍率名称

        // 设置精炼等级（如果提供），否则设为5
        this._精炼 = Math.max(0, Math.min(LeveledWeapon._maxRefineLevel, 精炼 !== undefined ? 精炼 : 5))

        // 设置武器等级（如果提供），否则设为80
        this._等级 = Math.max(1, Math.min(80, 等级 !== undefined ? 等级 : 80))

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
     * 倍率名称属性的getter和setter
     */
    get 倍率名称(): string | undefined {
        return this._倍率名称
    }

    set 倍率名称(value: string | undefined) {
        this._倍率名称 = value
        if (value) {
            this.updateWeaponBaseData(value)
        }
    }

    get 默认倍率名称(): string | undefined {
        // 获取该武器类型的所有base数据
        const baseDataList = baseMap.get(this.类别)
        if (!baseDataList) {
            // console.warn(`未找到武器类型 "${this.类别}" 的base数据`)
            return undefined
        }

        // 查找第一个匹配的倍率名称作为默认倍率
        for (const base of baseDataList) {
            // 如果没有武器名称字段，则适用于所有该类型武器
            if (!base.武器名称) {
                return base.名称
            } else {
                // 如果有武器名称字段，则检查当前武器名称是否在其中
                const weaponNames = base.武器名称.split(",")
                if (weaponNames.includes(this.名称)) {
                    return base.名称
                }
            }
        }
        return undefined
    }

    static getBases(weaponType: string): WeaponBase[] {
        // 获取该武器类型的所有base数据
        const baseDataList = baseMap.get(weaponType)
        if (!baseDataList) {
            console.warn(`未找到武器类型 "${weaponType}" 的base数据`)
            return []
        }
        return baseDataList
    }
    static getBasesByWeaponName(weaponName: string): WeaponBase[] {
        // 获取该武器类型的所有base数据
        const baseDataList = this.getBases(weaponMap.get(weaponName)?.类别 || "")
        if (!baseDataList.length) {
            return baseDataList
        }
        return baseDataList.filter((base) => !base.武器名称 || base.武器名称.split(",").includes(weaponName))
    }

    static getBaseNames(weaponName: string): string[] {
        return uniq(this.getBasesByWeaponName(weaponName).map((base) => base.名称))
    }

    static getBaseNamesWithName(weaponName: string): string[] {
        return uniq(this.getBasesByWeaponName(weaponName).map((base) => `${weaponName}[${base.名称}]`))
    }

    /**
     * 根据倍率名称从base表中查询并更新武器的倍率、弹片数、射速、段数
     * @param 倍率名称 要查询的倍率名称
     */
    private updateWeaponBaseData(倍率名称: string): void {
        // 获取该武器类型的所有base数据
        const baseDataList = LeveledWeapon.getBasesByWeaponName(this.名称)

        // 查找匹配的base数据
        let matchedBases = baseDataList.filter((base) => base.名称 === 倍率名称)
        let matchedBase = matchedBases[0]
        if (!matchedBases.length) return
        if (matchedBases.length > 1) {
            // 同律武器
            console.warn(`武器 "${this.名称}" 对应类型 "${this.类别}" 下的倍率名称 "${倍率名称}" 存在多个base数据`)
        }

        if (matchedBase) {
            // 更新倍率相关属性
            this.倍率 = matchedBase.倍率
            this.弹片数 = matchedBase.弹片数
            this.射速 = matchedBase.射速
            this.段数 = matchedBase.段数
        } else {
            // console.warn(`未找到武器 "${this.名称}" 对应类型 "${this.类别}" 下的倍率名称 "${倍率名称}" 的base数据`)
            this.倍率 = 0
            this.弹片数 = undefined
            this.射速 = undefined
            this.段数 = undefined
        }
    }
    /**
     * 根据等级和精炼更新武器属性
     * 基础攻击受等级影响，其他属性受精炼影响
     */
    private updateProperties(): void {
        // 重置所有属性为原始值
        this.基础攻击 = this._originalWeaponData.基础攻击

        // 根据武器等级调整基础攻击
        // 1,10,20,30,40,50,60,70,80级对应的倍数
        const levelIndex = Math.min(Math.floor((this._等级 - 1) / 10), 7)
        const levelMultiplier = LeveledWeapon._levelAttackMultipliers[levelIndex]
        this.基础攻击 *= levelMultiplier

        // 根据精炼等级调整属性

        this.baseProperties.forEach((prop) => {
            const originalValue = this._originalWeaponData[prop]
            if (originalValue !== undefined) {
                const currentValue = (originalValue / 10) * (this._精炼 + 5)
                this[prop] = currentValue
            }
        })
        if (this.buff) {
            const buff = this.buff!
            const props = this.buff.getProperties()
            Object.keys(props).forEach((prop) => {
                const maxValue = buff[prop] || 0
                const currentValue = (maxValue / 10) * (this._精炼 + 5)
                const baseValue = (buff.baseValue / 10) * (this._精炼 + 5)
                this[prop] = currentValue
                if (buff.描述.includes(`{%}`)) {
                    buff.描述 = buff._originalBuffData.描述.replace(`{%}`, `${(baseValue * 100).toFixed(1)}%`)
                }
            })
        }
    }

    /**
     * 获取武器的属性信息
     */
    getProperties(): Partial<Weapon> {
        const properties: Partial<Weapon> = {}
        this.properties.forEach((prop) => {
            properties[prop] = this[prop]
        })
        return properties
    }
    getSimpleProperties(): Partial<Weapon> {
        const properties: Partial<Weapon> = {}
        this.simpleProperties.forEach((prop) => {
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
        "_倍率名称",
        "_精炼",
        "buff",
        "effectLv",
        "_等级",
        "_originalWeaponData",
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
        "倍率",
        "弹片数",
        "弹道类型",
        "射速",
        "段数",
        "_倍率名称",
        "_精炼",
        "buff",
        "effectLv",
        "_等级",
        "_originalWeaponData",
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
        return Object.keys(this).filter((prop) => !LeveledWeapon._exclude_properties.has(prop))
    }
    get simpleProperties(): string[] {
        return Object.keys(this).filter((prop) => !LeveledWeapon._exclude_simple_properties.has(prop))
    }
    get baseProperties(): string[] {
        return Object.keys(this._originalWeaponData).filter((prop) => !LeveledWeapon._exclude_base_properties.has(prop))
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
}
