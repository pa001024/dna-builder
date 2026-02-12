import { t as translate } from "i18next"
import type { CharAttr } from "../CharBuild"
import { effectMap, modMap } from "../d"
import { type Mod, Quality, type WeaponSkill } from "../data-types"
import { LeveledBuff } from "."

/**
 * LeveledMod类 - 继承Mod接口，添加等级属性和动态属性计算
 */
export class LeveledMod implements Mod {
    static fullName(mod: Mod, t: (key: string) => string = translate) {
        return `${t(mod.属性 || "")}${t(mod.系列)}${t(mod.名称)}(${mod.品质})`
    }

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
    类型: string
    极性?: "D" | "O" | "V" | "A"
    技能替换?: Record<string, WeaponSkill>
    // MOD效果
    buff?: LeveledBuff;
    [key: string]: any
    // 等级属性
    private _等级: number
    // 原始MOD对象
    private _originalModData: Mod
    // 等级上限
    maxLevel: number

    static from(id: number, level: number, bufLv?: number) {
        const modData = modMap.get(id)
        if (!modData) {
            return null
        }
        return new LeveledMod(modData, level, bufLv)
    }

    /**
     * 判断是否存在指定ID的MOD
     * @param id MOD的ID
     * @returns 如果存在则返回true，否则返回false
     */
    static fromDNA(dnaMod: import("dna-api").DNAModesBean) {
        if (modMap.has(+dnaMod.id)) {
            return new LeveledMod(+dnaMod.id, dnaMod.level)
        }
        if (+dnaMod.id === -1) return null
        return new LeveledMod({
            id: +dnaMod.id,
            名称: dnaMod.name || "?",
            系列: "?",
            品质: (dnaMod.quality && ["白", "绿", "蓝", "紫", "金"][dnaMod.quality - 1]) || "白",
            耐受: 1,
            类型: "?",
        })
    }

    toString() {
        return `[${this.id}]${this.系列}之${this.名称}(${this.品质}) Lv.${this.等级}`
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
        public buffLv?: number
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
        if (modData.消耗) this.消耗 = modData.消耗
        if (modData.技能替换) this.技能替换 = modData.技能替换
        if (effectMap.has(this.名称)) {
            const effect = effectMap.get(this.名称)!
            if (!effect.品质 || effect.品质 === this.品质) {
                this.buff = new LeveledBuff(effect, buffLv)
                this.buff.pid = this.id
                this.buff.pt = "Mod"
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

    get excludeSeries() {
        if (this.系列 === "囚狼" && this.id > 100000) return ["囚狼1"]
        if (this.系列 === "换生灵" || this.系列 === "海妖") {
            return ["换生灵", "海妖"]
        }
        return [this.系列]
    }

    get isPrime() {
        return this.系列 === "换生灵" || (this.系列 === "海妖" && this.名称.split("·").length > 2)
    }

    /**
     * 等级属性的getter和setter
     */
    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        this._等级 = Math.max(0, Math.min(this.maxLevel, value))

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
            if (this.id > 200000) {
                this.效果 = this._originalModData.效果?.replace(/200\.0%/g, () => `${+(this._等级 * 10 + 100).toFixed(1)}%`)
            }
        } else {
            this.耐受 = this._originalModData.耐受 - this.maxLevel + this._等级
        }
        const lv = this._等级

        if (this._originalModData.技能替换) {
            const ratio = this.getSkillReplaceScaleRatio()
            this.技能替换 = this.scaleSkillReplaceByRatio(this._originalModData.技能替换, ratio)
        }

        if (this._originalModData.生效) {
            const maxValue = this._originalModData.生效
            const keys = Object.keys(maxValue).filter(v => v !== "条件")
            const vals: number[] = []
            this.生效 = keys.reduce(
                (acc, key) => {
                    delete this[key]
                    const mv = maxValue[key] as number | number[]
                    if (Array.isArray(mv)) {
                        const mv1 = mv[0]
                        const mv2 = mv[1]
                        const currentValue1 = (mv1 / (this.maxLevel + 1)) * (lv + 1)
                        const currentValue2 = (mv2 / (this.maxLevel + 1)) * (lv + 1)
                        acc[key] = [currentValue1, currentValue2]
                        vals.push(...acc[key])
                    } else {
                        let currentValue = (mv / (this.maxLevel + 1)) * (lv + 1)
                        if (key === "神智回复" || key === "最大耐受") currentValue = Math.ceil(currentValue)
                        acc[key] = currentValue
                        vals.push(currentValue)
                    }
                    return acc
                },
                {
                    条件: maxValue.条件,
                } as Record<string, any>
            )
            if (this._originalModData.效果) {
                let i = 0
                this.效果 = this._originalModData.效果.replace(/{%}/g, () => `${+(vals[i++] * 100).toFixed(1)}%`)
            }
        }
        this.baseProperties.forEach(prop => {
            let lv = this._等级
            if ((this.系列 === "换生灵" || this.系列 === "海妖") && prop === "减伤") lv = this.maxLevel
            // 架势MOD属性不受等级变化
            if (this.id > 100000) lv = this.maxLevel
            const maxValue = this._originalModData[prop] || 0
            if (maxValue) {
                let currentValue = (maxValue / (this.maxLevel + 1)) * (lv + 1)
                if (prop === "神智回复" || prop === "最大耐受") currentValue = Math.ceil(currentValue)
                this[prop] = currentValue
            }
        })
        this.buff?.properties.forEach(prop => {
            const lv = this._等级
            const buff = this.buff!
            const maxValue = buff[prop] || 0
            let currentValue = (maxValue / (10 + 1)) * (lv + 1)
            if (prop === "神智回复" || prop === "最大耐受") currentValue = Math.ceil(currentValue)
            this[prop] = this[prop] ? this[prop] + currentValue : currentValue
            if (buff.描述.includes(`{%}`)) {
                buff.描述 = buff._originalBuffData.描述.replace(`{%}`, `${(buff.baseValue * 100).toFixed(1)}%`)
            }
        })
    }

    /**
     * 获取技能替换的数值缩放比例
     * 规则：100% 为基准（1.0），200% 时提高 50%（1.5）
     */
    private getSkillReplaceScaleRatio() {
        if (this.id <= 200000) return 1
        const effectPercent = this._等级 * 10 + 100
        return 1 + (effectPercent - 100) / 200
    }

    /**
     * 对技能替换中的字段数值按比例缩放
     * @param skillReplace 原始技能替换数据
     * @param ratio 缩放比例
     * @returns 缩放后的技能替换数据（深拷贝）
     */
    private scaleSkillReplaceByRatio(skillReplace: Record<string, WeaponSkill>, ratio: number) {
        if (ratio === 1) return skillReplace
        return Object.fromEntries(
            Object.entries(skillReplace).map(([skillId, skill]) => [
                skillId,
                {
                    ...skill,
                    字段: skill.字段?.map(field => ({
                        ...field,
                        值: this.scaleFieldValue(field.值, ratio),
                        值2: this.scaleFieldValue(field.值2, ratio),
                    })),
                },
            ])
        ) as Record<string, WeaponSkill>
    }

    /**
     * 缩放技能字段中的数值类型
     * @param value 原始值
     * @param ratio 缩放比例
     * @returns 缩放后的值
     */
    private scaleFieldValue(value: number | number[] | undefined, ratio: number) {
        if (value === undefined) return undefined
        if (Array.isArray(value)) {
            return value.map(v => +((v || 0) * ratio).toFixed(4))
        }
        return +((value || 0) * ratio).toFixed(4)
    }

    checkCondition(attrs: CharAttr, charMods: LeveledMod[]): { isEffective: boolean; props: Record<string, any> } | undefined {
        if (!this.生效?.条件?.length) return undefined
        const poTable = charMods.reduce(
            (acc, mod) => {
                if (mod.极性) acc[mod.极性] = (acc[mod.极性] || 0) + 1
                return acc
            },
            {} as Record<string, number>
        )
        // if (this.极性) poTable[this.极性] = (poTable[this.极性] || 0) + 1
        const isEffective: boolean = this.生效.条件.every(([attr, op, value]: [string, string, number]) => {
            const attrValue = poTable[attr.slice(0, 1)] || attrs[attr as keyof CharAttr]
            if (op === "*") return true
            if (op === "=") return attrValue === value
            if (op === ">") return attrValue > value
            if (op === ">=") return attrValue >= value
            if (op === "<") return attrValue < value
            if (op === "<=") return attrValue <= value
            return false
        })
        const { 条件: _, ...rest } = this.生效
        return { isEffective, props: rest }
    }

    /** 检查单卡是否生效 */
    getCondition() {
        if (!this.生效?.条件?.length) return undefined
        const attrs: CharAttr = {
            攻击: 0,
            生命: 0,
            护盾: 0,
            防御: 0,
            神智: 0,
            技能威力: 1,
            技能耐久: 1,
            技能效益: 1,
            技能范围: 1,
            昂扬: 0,
            背水: 0,
            增伤: 0,
            武器伤害: 0,
            技能伤害: 0,
            独立增伤: 0,
            属性穿透: 0,
            无视防御: 0,
            技能无视防御: 0,
            技能速度: 0,
            失衡易伤: 0,
            技能倍率加数: 0,
            技能倍率乘数: 1,
            技能倍率赋值: 0,
            召唤物攻击速度: 0,
            召唤物范围: 0,
            减伤: 0,
            有效生命: 0,
        }
        Object.keys(this.getProperties()).forEach(prop => {
            if (prop in attrs) attrs[prop as keyof CharAttr] += this[prop]
        })
        const isEffective: boolean = this.生效.条件.every(([attr, op, value]: [string, string, number]) => {
            const attrValue = attrs[attr as keyof CharAttr]
            if (op === "*") return true
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

    /**
     * 应用MOD条件 (mutable)
     */
    applyCondition(attrs: CharAttr, charMods: LeveledMod[]) {
        const condition = this.checkCondition(attrs, charMods)
        if (!condition) return false
        let changed = false
        Object.keys(condition.props).forEach(key => {
            if (condition.isEffective) {
                if (Array.isArray(condition.props[key])) {
                    const [v1, v2] = condition.props[key]
                    const cond = this.生效!.条件![0][0] as keyof CharAttr
                    const finalValue = Math.min(attrs[cond] * v1, v2)
                    if (this[key] !== finalValue) {
                        this[key] = finalValue
                        changed = true
                    }
                } else if (this[key] !== condition.props[key]) {
                    this[key] = condition.props[key]
                    changed = true
                }
            } else if (this[key]) {
                delete this[key]
                changed = true
            }
        })
        return changed
    }

    /**
     * 获取MOD的属性信息
     */

    getProperties(): Partial<Mod> {
        const properties: Partial<Mod> = {}
        this.properties.forEach(prop => {
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
        "消耗",
        "技能替换",
        "_等级",
        "_originalModData",
        "buff",
        "buffLv",
        "maxLevel",
        "生效",
        "效果",
        "code",
        "count",
        "icon",
        "版本",
    ])
    get properties(): string[] {
        return Object.keys(this).filter(prop => !LeveledMod._exclude_properties.has(prop))
    }
    get baseProperties(): string[] {
        return Object.keys(this._originalModData).filter(prop => !LeveledMod._exclude_properties.has(prop))
    }

    get url() {
        return LeveledMod.url(this._originalModData.icon!)
    }

    static url(icon?: string) {
        return icon ? `/imgs/webp/T_Mod_${icon}.webp` : ""
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

    public clone(): LeveledMod {
        const mod = new LeveledMod(this._originalModData, this._等级, this.buffLv)
        this.properties.forEach(prop => {
            mod[prop] = this[prop]
        })
        return mod
    }
    equals(mod: LeveledMod) {
        return this.id === mod.id && this.等级 === mod.等级
    }

    get attrType() {
        return this.类型 as "角色" | "近战" | "远程" | "同律近战" | "同律远程"
    }
    get addAttr(): Record<string, number> {
        const r: Record<string, number> = {}
        this.properties.forEach(prop => {
            r[prop] = this[prop]
        })
        return r
    }
    get minusAttr() {
        const r: Record<string, any> = this.clone()
        this.properties.forEach(prop => {
            r[prop] = -this[prop]
        })
        r.极性 = ""
        r.isMinus = true
        return r as LeveledMod
    }
}

export class LeveledModWithCount extends LeveledMod {
    count: number
    constructor(modid: number | Mod, 等级?: number, buffLv?: number, count?: number) {
        super(modid, 等级, buffLv)
        this.count = count || 0
    }
}
