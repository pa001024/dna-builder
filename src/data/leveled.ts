import { Char, Elem, MeleeType, Mod, Buff, Quality, Weapon, Skill } from "./data-types"
import gameData from "./data.json"

// 将静态表转换为Map，提高查找效率
const charMap = new Map<string, Char>()
gameData.char.forEach((char) => {
    charMap.set(char.名称, char as Char)
})

// 将mod数据转换为Map
const modMap = new Map<number, Mod>()
gameData.mod.forEach((mod) => {
    if (mod.id) {
        modMap.set(mod.id, mod as Mod)
    }
})

// 将buff数据转换为Map
const buffMap = new Map<string, Buff>()
gameData.buff.forEach((buff) => {
    buffMap.set(buff.名称, buff as Buff)
})

// 将所有武器数据转换为统一的Map
const weaponMap = new Map<string, Weapon>()

// 添加近战武器到weaponMap
gameData.weapon.forEach((weapon: any) => {
    if (weapon.名称) {
        weaponMap.set(weapon.名称, weapon as Weapon)
    }
})

// 将技能数据转换为Map，按技能名称分组存储1级和10级数据
const skillMap = new Map<string, { level1: Skill; level10: Skill }>()

// 首先将所有技能按名称和等级存储
gameData.skill.forEach((skill) => {
    if (skill.名称 && (skill.等级 === 1 || skill.等级 === 10)) {
        const key = skill.名称
        if (!skillMap.has(key)) {
            skillMap.set(key, { level1: {} as Skill, level10: {} as Skill })
        }
        if (skill.等级 === 1) {
            skillMap.get(key)!.level1 = skill as Skill
        } else {
            skillMap.get(key)!.level10 = skill as Skill
        }
    }
})

// MOD品质对应的等级上限
const modQualityMaxLevel: Record<string, number> = {
    [Quality.金]: 10,
    [Quality.紫]: 5,
    [Quality.蓝]: 5,
    [Quality.绿]: 3,
    [Quality.白]: 3,
}

/**
 * LeveledChar类 - 继承Char接口，添加等级属性和动态属性计算
 */
export class LeveledChar implements Char {
    // 基础Char属性
    名称: string
    属性: Elem
    近战: string
    远程: string
    同律武器?: string
    基础攻击: number
    基础生命: number
    基础护盾: number
    基础防御: number
    基础神智: number
    范围?: number
    攻击?: number
    耐久?: number
    生命?: number
    威力?: number
    背水?: number
    防御?: number
    效益?: number
    昂扬?: number

    // 等级属性
    private _等级: number | undefined
    // 80级时的基准属性值
    private _base80Attack: number
    private _base80Life: number
    private _base80Shield: number
    private _base80Defense: number

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
        this.名称 = charData.名称
        this.属性 = charData.属性
        this.近战 = charData.近战
        this.远程 = charData.远程
        this.同律武器 = charData.同律武器
        this.基础攻击 = charData.基础攻击
        this.基础生命 = charData.基础生命
        this.基础护盾 = charData.基础护盾
        this.基础防御 = charData.基础防御
        this.基础神智 = charData.基础神智
        this.范围 = charData.范围
        this.攻击 = charData.攻击
        this.耐久 = charData.耐久
        this.生命 = charData.生命
        this.威力 = charData.威力
        this.背水 = charData.背水
        this.防御 = charData.防御
        this.效益 = charData.效益
        this.昂扬 = charData.昂扬

        // 保存80级的基准属性值（当前导入的数据是80级的数据）
        this._base80Attack = charData.基础攻击
        this._base80Life = charData.基础生命
        this._base80Shield = charData.基础护盾
        this._base80Defense = charData.基础防御

        // 设置等级（如果提供）
        if (等级) {
            this.等级 = 等级
        }
    }

    /**
     * 等级属性的getter和setter
     */
    get 等级(): number | undefined {
        return this._等级
    }

    set 等级(value: number | undefined) {
        // 确保等级在1-80之间
        if (value !== undefined) {
            const _new = Math.max(1, Math.min(80, value))
            if (this._等级 !== _new) {
                this._等级 = _new
                this.updatePropertiesByLevel(_new)
            }
        } else {
            this._等级 = value
        }
    }

    /**
     * 根据等级更新角色属性
     * @param level 角色等级
     */
    private updatePropertiesByLevel(level: number): void {
        // 根据AI.md中的等级公式，不同等级对应的80级属性倍数
        const levelMultipliers: Record<number, number> = {
            1: 0.079666848,
            10: 0.206300923,
            20: 0.302118414,
            30: 0.413724425,
            40: 0.529132718,
            50: 0.682636248,
            60: 0.813579576,
            70: 0.894757631, // 假设70级是80级的0.894757631倍（根据插值计算）
            80: 1,
        }

        // 确保等级在1-80之间
        const clampedLevel = Math.max(1, Math.min(80, level))

        // 找到当前等级对应的倍数，如果没有精确匹配则线性插值
        let multiplier: number
        if (levelMultipliers[clampedLevel] !== undefined) {
            multiplier = levelMultipliers[clampedLevel]
        } else {
            // 找到当前等级的前后两个关键点
            const sortedLevels = Object.keys(levelMultipliers)
                .map(Number)
                .sort((a, b) => a - b)
            let lowerLevel = 1
            let upperLevel = 80

            for (const l of sortedLevels) {
                if (l < clampedLevel && l > lowerLevel) lowerLevel = l
                if (l > clampedLevel && l < upperLevel) upperLevel = l
            }

            // 线性插值计算倍数
            const lowerMultiplier = levelMultipliers[lowerLevel]
            const upperMultiplier = levelMultipliers[upperLevel]
            const ratio = (clampedLevel - lowerLevel) / (upperLevel - lowerLevel)
            multiplier = lowerMultiplier + (upperMultiplier - lowerMultiplier) * ratio
        }

        // 更新属性（根据AI.md，基础神智不受等级影响）
        this.基础攻击 = Math.round(this._base80Attack * multiplier)
        this.基础生命 = Math.round(this._base80Life * multiplier)
        this.基础护盾 = Math.round(this._base80Shield * multiplier)
        this.基础防御 = Math.round(this._base80Defense * multiplier)
    }

    /**
     * 获取角色的完整属性信息
     */
    getFullProperties(): Char & { 等级?: number } {
        return {
            名称: this.名称,
            属性: this.属性,
            近战: this.近战,
            远程: this.远程,
            同律武器: this.同律武器,
            基础攻击: this.基础攻击,
            基础生命: this.基础生命,
            基础护盾: this.基础护盾,
            基础防御: this.基础防御,
            基础神智: this.基础神智,
            范围: this.范围,
            攻击: this.攻击,
            耐久: this.耐久,
            生命: this.生命,
            威力: this.威力,
            背水: this.背水,
            防御: this.防御,
            效益: this.效益,
            昂扬: this.昂扬,
            等级: this.等级,
        }
    }
}

/**
 * LeveledMod类 - 继承Mod接口，添加等级属性和动态属性计算
 */
export class LeveledMod implements Mod {
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
        this._maxLevel = modQualityMaxLevel[this.品质] || 1

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
}

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

/**
 * LeveledSkill类 - 继承Skill接口，添加等级属性和动态属性计算
 */
export class LeveledSkill implements Skill {
    // 基础Skill属性
    名称: string
    角色: string
    伤害类型: string
    攻击倍率?: number
    固定范围?: number
    技能持续?: number
    神智消耗?: number
    持续消耗?: number
    技能范围?: number
    生命倍率?: number
    固定伤害?: number
    固定持续?: number
    防御倍率?: number

    // 内部私有属性
    private _level: number
    private _skillData: { level1: Skill; level10: Skill }

    /**
     * 构造函数
     * @param 技能名称 技能的名称
     * @param 等级 技能等级（可选，默认为10）
     */
    constructor(技能名称: string, 等级?: number) {
        // 获取技能基础数据
        const skillData = skillMap.get(技能名称)
        if (!skillData || !skillData.level1 || !skillData.level10) {
            // 处理技能不存在的情况
            console.error(`技能 ${技能名称} 不存在或数据不完整`)
            // 创建一个默认技能对象
            this.名称 = 技能名称
            this.角色 = "未知"
            this.等级 = 1
            this.伤害类型 = "未知"
            this._skillData = { level1: this as Skill, level10: this as Skill }
        } else {
            // 设置基础属性
            this.名称 = skillData.level1.名称
            this.角色 = skillData.level1.角色
            this.伤害类型 = skillData.level1.伤害类型
            this._skillData = skillData
        }

        // 设置技能等级（如果提供），否则设为10
        this._level = 等级 || 10
        // 更新属性
        this.updateProperties()
    }

    /**
     * 等级属性的getter和setter
     */
    get 等级(): number {
        return this._level
    }

    set 等级(value: number) {
        // 确保等级在1到10之间
        this._level = Math.max(1, Math.min(10, value))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 根据技能等级更新技能属性
     * 使用公式：最终技能数据 = 10级技能数据 / (1 + (10级技能数据/1级技能数据-1)/9 * (10-技能等级))
     */
    private updateProperties(): void {
        // 需要计算的技能属性列表
        const skillProperties = [
            "攻击倍率",
            "固定范围",
            "技能持续",
            "神智消耗",
            "持续消耗",
            "技能范围",
            "生命倍率",
            "固定伤害",
            "固定持续",
            "防御倍率",
        ]

        skillProperties.forEach((prop) => {
            const level1Value = (this._skillData.level1 as any)[prop]
            const level10Value = (this._skillData.level10 as any)[prop]

            if (level1Value !== undefined && level10Value !== undefined) {
                let finalValue: number

                // 应用技能等级变化公式
                if (level1Value === 0 || level10Value === 0) {
                    // 处理特殊情况，避免除以零
                    finalValue = level1Value + (level10Value - level1Value) * ((this._level - 1) / 9)
                } else {
                    const ratio = level10Value / level1Value
                    finalValue = level10Value / (1 + ((ratio - 1) / 9) * (10 - this._level))
                }

                // 设置计算后的值
                ;(this as any)[prop] = finalValue
            }
        })
    }

    /**
     * 获取技能的完整属性信息
     */
    getFullProperties(): Skill & { 技能等级: number } {
        return {
            ...this,
            技能等级: this._level,
        }
    }
}

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
    耐久?: number
    生命?: number
    暴击?: number
    攻速?: number
    暴伤?: number
    范围?: number
    攻击?: number
    背水?: number
    威力?: number
    防御?: number
    触发?: number
    攻击范围?: number
    弹道类型?: string
    技能伤害?: number
    武器伤害?: number
    多重?: number

    // 等级和精炼属性
    private _等级: number = 80 // 武器等级，默认80级
    private _精炼: number = 5 // 武器精炼等级，默认5级
    // 原始武器对象
    private _originalWeaponData: Weapon
    // 精炼等级上限（目前武器精炼等级上限固定为5）
    private _maxRefineLevel: number = 5
    // 武器等级对应的基础攻击倍数（1,10,20,30,40,50,60,70,80级）
    private _levelAttackMultipliers: number[] = [
        0.079666848, 0.206300923, 0.302118414, 0.413724425, 0.529132718, 0.682636248, 0.813579576, 1,
    ]

    /**
     * 构造函数
     * @param weaponName 武器的名称
     * @param 精炼 可选的武器精炼等级
     * @param 等级 可选的武器等级
     */
    constructor(weaponName: string, 精炼?: number, 等级?: number) {
        // 从统一的武器Map中获取武器数据
        const weaponData = weaponMap.get(weaponName)

        if (!weaponData) {
            throw new Error(`武器名称 "${weaponName}" 未在静态表中找到`)
        }

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
        this.耐久 = weaponData.耐久
        this.生命 = weaponData.生命
        this.暴击 = weaponData.暴击
        this.攻速 = weaponData.攻速
        this.暴伤 = weaponData.暴伤
        this.范围 = weaponData.范围
        this.攻击 = weaponData.攻击
        this.背水 = weaponData.背水
        this.威力 = weaponData.威力
        this.防御 = weaponData.防御
        this.触发 = weaponData.触发
        this.攻击范围 = weaponData.攻击范围
        this.弹道类型 = weaponData.弹道类型
        this.技能伤害 = weaponData.技能伤害
        this.武器伤害 = weaponData.武器伤害
        this.多重 = weaponData.多重

        // 设置精炼等级（如果提供），否则设为5
        this._精炼 = Math.max(0, Math.min(this._maxRefineLevel, 精炼 !== undefined ? 精炼 : 5))

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
        this._精炼 = Math.max(0, Math.min(this._maxRefineLevel, value))

        // 更新属性
        this.updateProperties()
    }

    /**
     * 根据等级和精炼更新武器属性
     * 基础攻击受等级影响，其他属性受精炼影响
     */
    private updateProperties(): void {
        // 重置所有属性为原始值
        this.基础攻击 = this._originalWeaponData.基础攻击
        this.基础暴击 = this._originalWeaponData.基础暴击
        this.基础暴伤 = this._originalWeaponData.基础暴伤
        this.基础触发 = this._originalWeaponData.基础触发
        this.耐久 = this._originalWeaponData.耐久
        this.生命 = this._originalWeaponData.生命
        this.暴击 = this._originalWeaponData.暴击
        this.攻速 = this._originalWeaponData.攻速
        this.暴伤 = this._originalWeaponData.暴伤
        this.范围 = this._originalWeaponData.范围
        this.攻击 = this._originalWeaponData.攻击
        this.背水 = this._originalWeaponData.背水
        this.威力 = this._originalWeaponData.威力
        this.防御 = this._originalWeaponData.防御
        this.触发 = this._originalWeaponData.触发
        this.攻击范围 = this._originalWeaponData.攻击范围
        this.弹道类型 = this._originalWeaponData.弹道类型
        this.技能伤害 = this._originalWeaponData.技能伤害
        this.武器伤害 = this._originalWeaponData.武器伤害
        this.多重 = this._originalWeaponData.多重

        // 根据武器等级调整基础攻击
        // 1,10,20,30,40,50,60,70,80级对应的倍数
        const levelIndex = Math.min(Math.floor((this._等级 - 1) / 10), 7)
        const levelMultiplier = this._levelAttackMultipliers[levelIndex]
        this.基础攻击 *= levelMultiplier

        // 根据精炼等级调整属性
        const refineProperties = [
            "耐久",
            "生命",
            "暴击",
            "攻速",
            "暴伤",
            "范围",
            "攻击",
            "背水",
            "威力",
            "防御",
            "触发",
            "攻击范围",
            "技能伤害",
            "武器伤害",
            "多重",
        ]

        refineProperties.forEach((prop) => {
            const originalValue = (this._originalWeaponData as any)[prop]
            if (originalValue !== undefined) {
                const currentValue = (originalValue / (this._maxRefineLevel + 1)) * (this._精炼 + 1)
                ;(this as any)[prop] = currentValue
            }
        })
    }

    /**
     * 获取武器的完整属性信息
     */
    getFullProperties(): Weapon & { 等级: number; 精炼: number } {
        return {
            ...this,
            等级: this._等级,
            精炼: this._精炼,
        }
    }
}

/*
示例用法：

// 创建一个等级为50的黎瑟角色
const 黎瑟50级 = new LeveledChar('黎瑟', 50);
console.log('50级黎瑟属性:', 黎瑟50级.getFullProperties());

// 创建一个没有指定等级的丽蓓卡角色
const 丽蓓卡 = new LeveledChar('丽蓓卡');
console.log('未指定等级的丽蓓卡属性:', 丽蓓卡.getFullProperties());

// 之后设置等级
丽蓓卡.等级 = 30;
console.log('设置为30级后的丽蓓卡属性:', 丽蓓卡.getFullProperties());

// 创建一个等级为3的MOD
const 炽灼3级 = new LeveledMod(11001, 3);
console.log('3级炽灼MOD属性:', 炽灼3级.getFullProperties());

// 创建一个等级为2的Buff
const 助战50攻2级 = new LeveledBuff('助战50攻', 2);
console.log('2级助战50攻Buff属性:', 助战50攻2级.getFullProperties());
*/
