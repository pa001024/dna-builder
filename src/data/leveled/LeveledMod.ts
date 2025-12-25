import { LeveledBuff, effectMap, modMap } from "."
import { CharAttr, CharBuild } from "../CharBuild"
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
    系列: string
    品质: string
    耐受: number
    类型: string;
    [key: string]: any
    // MOD效果
    buff?: LeveledBuff

    // 等级属性
    private _等级: number
    // 原始MOD对象
    private _originalModData: Mod
    // 等级上限
    maxLevel: number

    /**
     * 判断是否存在指定ID的MOD
     * @param id MOD的ID
     * @returns 如果存在则返回true，否则返回false
     */
    static fromDNA(dnaMod: import("dna-api").DNARoleMod) {
        if (modMap.has(dnaMod.id)) {
            return new LeveledMod(dnaMod.id)
        }
        if (dnaMod.id == -1) return null
        return new LeveledMod({
            id: dnaMod.id,
            名称: dnaMod.name || "?",
            系列: "?",
            品质: (dnaMod.quality && ["白", "绿", "蓝", "紫", "金"][dnaMod.quality - 1]) || "白",
            耐受: 1,
            类型: "?",
        })
    }

    /**
     * 构造函数
     * @param modid mod的id|Mod对象
     * @param modLv 可选的mod等级
     * @param buffLv 可选的buff等级
     */
    constructor(
        modid: number | Mod,
        modLv?: number,
        public buffLv?: number,
    ) {
        // 从Map中获取对应的Mod对象
        const modData = typeof modid === "number" ? modMap.get(modid) : modid
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
        this.类型 = modData.类型
        if (modData.极性) this.极性 = modData.极性
        if (modData.属性) this.属性 = modData.属性
        if (modData.限定) this.限定 = modData.限定
        if (modData.效果) this.效果 = modData.效果
        if (effectMap.has(this.名称)) {
            const effect = effectMap.get(this.名称)!
            if (!effect.品质 || effect.品质 === this.品质) {
                this.buff = new LeveledBuff(effect, buffLv)
                this.buff.pid = this.名称
            }
        }

        // 获取该品质MOD的等级上限
        this.maxLevel = LeveledMod.modQualityMaxLevel[this.品质] || 1

        // 设置等级（如果提供），否则设为等级上限
        this._等级 = modLv !== undefined ? Math.max(0, Math.min(this.maxLevel, modLv)) : this.maxLevel

        // 更新属性
        this.updateProperties()
    }

    get fullName(): string {
        return `${this.系列}之${this.名称}`
    }

    get excludeNames() {
        if (this.系列 === "换生灵") {
            // 换生灵之决断, 海妖之羽翼·鼓舞·决断
            return [this.fullName, "海妖之羽翼·鼓舞·" + this.名称]
        }
        if (this.系列 === "海妖" && this.名称.split("·").length > 2) {
            // 海妖之羽翼·鼓舞, 换生灵之决断
            return [`${this.系列}之${this.名称.split("·").slice(0, -1).join("·")}`, "换生灵之" + this.名称.split("·").at(-1)]
        }
        return [this.fullName]
    }

    get isPrime() {
        return this.系列 === "换生灵" || (this.系列 === "海妖" && this.名称.split("·").length > 2)
    }

    get types() {
        return `${this.类型}${this.属性 ? `,${this.属性}属性` : ""}${this.限定 ? `,${this.限定}` : ""}`
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
        // 架势MOD属性耐受等级越高越低
        if (this.id > 100000) {
            this.耐受 = this._originalModData.耐受 + this.maxLevel - this._等级
        } else {
            this.耐受 = this._originalModData.耐受 - this.maxLevel + this._等级
        }
        let lv = this._等级

        if (this._originalModData.生效) {
            const maxValue = this._originalModData.生效
            const keys = Object.keys(maxValue).filter((v) => v !== "条件")
            const vals: number[] = []
            this.生效 = keys.reduce(
                (acc, key) => {
                    let currentValue = (maxValue[key] / (this.maxLevel + 1)) * (lv + 1)
                    if (key === "神智回复" || key === "最大耐受") currentValue = Math.round(currentValue)
                    acc[key] = currentValue
                    vals.push(currentValue)
                    return acc
                },
                {
                    条件: maxValue.条件,
                } as Record<string, any>,
            )
            if (this._originalModData.效果) {
                let i = 0
                this.效果 = this._originalModData.效果.replace(/{%}/g, () => `${+(vals[i++] * 100).toFixed(1)}%`)
            }
        }
        this.baseProperties.forEach((prop) => {
            let lv = this._等级
            if ((this.系列 === "换生灵" || this.系列 === "海妖") && prop === "减伤") lv = this.maxLevel
            // 架势MOD属性不受等级变化
            if (this.id > 100000) lv = this.maxLevel
            const maxValue = this._originalModData[prop] || 0
            if (maxValue) {
                let currentValue = (maxValue / (this.maxLevel + 1)) * (lv + 1)
                if (prop === "神智回复" || prop === "最大耐受") currentValue = Math.round(currentValue)
                this[prop] = currentValue
            }
        })
        this.buff?.properties.forEach((prop) => {
            let lv = this._等级
            const buff = this.buff!
            const maxValue = buff[prop] || 0
            let currentValue = (maxValue / (10 + 1)) * (lv + 1)
            if (prop === "神智回复" || prop === "最大耐受") currentValue = Math.round(currentValue)
            this[prop] = this[prop] ? this[prop] + currentValue : currentValue
            if (buff.描述.includes(`{%}`)) {
                buff.描述 = buff._originalBuffData.描述.replace(`{%}`, `${(buff.baseValue * 100).toFixed(1)}%`)
            }
        })
    }

    checkCondition(attrs: CharAttr, charMods: LeveledMod[]): { isEffective: boolean; props: Record<string, any> } | undefined {
        if (!this.生效?.条件?.length) return undefined
        const poTable = charMods.reduce(
            (acc, mod) => {
                acc[mod.极性] = (acc[mod.极性] || 0) + 1
                return acc
            },
            {} as Record<string, number>,
        )
        if (this.极性) poTable[this.极性] = (poTable[this.极性] || 0) + 1
        const isEffective: boolean = this.生效.条件.every(([attr, op, value]: [string, string, number]) => {
            const attrValue = poTable[attr.slice(0, 1)] || attrs[attr as keyof CharAttr]
            if (op === "=") return attrValue === value
            if (op === ">") return attrValue > value
            if (op === ">=") return attrValue >= value
            if (op === "<") return attrValue < value
            if (op === "<=") return attrValue <= value
            return false
        })
        const { 条件, ...rest } = this.生效
        return { isEffective, props: rest }
    }

    getCondition() {
        if (!this.生效?.条件?.length) return undefined
        const attrs: CharAttr = {
            攻击: 0,
            生命: 0,
            护盾: 0,
            防御: 0,
            神智: 0,
            威力: 1,
            耐久: 1,
            效益: 1,
            范围: 1,
            昂扬: 0,
            背水: 0,
            增伤: 0,
            武器伤害: 0,
            技能伤害: 0,
            独立增伤: 0,
            属性穿透: 0,
            无视防御: 0,
            技能速度: 0,
            失衡易伤: 0,
            技能倍率加数: 0,
            召唤物攻击速度: 0,
            召唤物范围: 0,
            减伤: 0,
        }
        Object.keys(this.getProperties()).forEach((prop) => {
            if (prop in attrs) attrs[prop as keyof CharAttr] += this[prop]
        })
        const isEffective: boolean = this.生效.条件.every(([attr, op, value]: [string, string, number]) => {
            const attrValue = attrs[attr as keyof CharAttr]
            if (op === "=") return attrValue === value
            if (op === ">") return attrValue > value
            if (op === ">=") return attrValue >= value
            if (op === "<") return attrValue < value
            if (op === "<=") return attrValue <= value
            return false
        })
        const { 条件, ...rest } = this.生效
        return { isEffective, props: rest }
    }

    applyCondition(attrs: CharAttr, charMods: LeveledMod[]): CharAttr {
        const condition = this.checkCondition(attrs, charMods)
        if (!condition || !condition.isEffective) return attrs
        Object.keys(condition.props).forEach((key) => {
            attrs[key as keyof CharAttr] += condition.props[key]
        })
        return attrs
    }

    /**
     * 获取MOD的属性信息
     */

    getProperties(): Partial<Mod> {
        const properties: Partial<Mod> = {}
        this.properties.forEach((prop) => {
            properties[prop] = this[prop]
        })
        return properties
    }
    static _exclude_properties = new Set([
        "id",
        "系列",
        "品质",
        "耐受",
        "类型",
        "名称",
        "描述",
        "限定",
        "极性",
        "属性",
        "_等级",
        "_originalModData",
        "buff",
        "buffLv",
        "maxLevel",
        "生效",
        "效果",
        "code",
        "count",
    ])
    get properties(): string[] {
        return Object.keys(this).filter((prop) => !LeveledMod._exclude_properties.has(prop))
    }
    get baseProperties(): string[] {
        return Object.keys(this._originalModData).filter((prop) => !LeveledMod._exclude_properties.has(prop))
    }

    get url() {
        if (this.系列 === "海妖" && this.名称.split("·").length > 2) return `/imgs/海妖Prime.png`
        if (this.系列 && CharBuild.elmSeries.includes(this.系列)) return `/imgs/${this.属性}${this.系列}.png`
        return `/imgs/${this.系列}系列.png`
    }

    static getUrl(modId: number) {
        const mod = new LeveledMod(modId)
        return mod.url
    }

    static getQuality(id: number): Quality {
        return (modMap.get(id)?.品质 as Quality) || "紫"
    }

    static getMaxLevel(quality: string) {
        return LeveledMod.modQualityMaxLevel[quality] || 1
    }

    equals(mod: LeveledMod) {
        return this.id === mod.id && this.等级 === mod.等级
    }
}

export class LeveledModWithCount extends LeveledMod {
    count: number
    constructor(modid: number | Mod, 等级?: number, buffLv?: number, count?: number) {
        super(modid, 等级, buffLv)
        this.count = count || 0
    }
}
