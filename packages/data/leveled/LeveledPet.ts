import type { PetSkill } from "../d/pet.data"
import type { Pet } from "../data-types"

/** 魔灵突破等级上限（突破 0-3，共 4 档） */
export const PET_BREAKTHROUGH_MAX_LEVEL = 3

/**
 * 魔灵技能数值索引上限（0-4，共 5 档，对应 pet.data.ts 每项技能 5 个数值）。
 * 突破等级（0-3）即该索引，潜质加成（如「老道」+1）可把索引顶到 4，对应游戏内 Lv.5。
 */
export const PET_SKILL_LEVEL_INDEX_MAX = 4

export type LeveledPetResolver = (id: number) => Pet | undefined

let leveledPetResolver: LeveledPetResolver | undefined

export function setLeveledPetResolver(resolver: LeveledPetResolver) {
    leveledPetResolver = resolver
}

/** 技能数值占位符：`{%}` 取百分比，`{}` 取原值，两者按出现顺序依次对应 `值` 的第 n 项 */
const SKILL_VALUE_PLACEHOLDER_RE = /\{%\}|\{\}/g

/**
 * 把魔灵技能数值代入文案模板。
 *
 * 模板是**简体中文原文**，同时也是翻译对照表的键，所以界面必须按
 * 「**先翻译模板、再代入数值**」的顺序求值：顺序反了会得到
 * 「…主角色攻击6000%的伤害…」这类已实例化文本，永远查不到译文。
 * @param template 含 `{%}` / `{}` 占位符的文案模板（已按当前语言翻译）
 * @param values 当前档位的数值，按占位符出现顺序对应
 * @returns 代入数值后的文本
 */
export function formatPetSkillText(template: string, values: number[]): string {
    let valueIndex = 0

    return template.replace(SKILL_VALUE_PLACEHOLDER_RE, placeholder => {
        if (valueIndex >= values.length) {
            return placeholder
        }

        const value = values[valueIndex]
        valueIndex++

        // 按占位符类型格式化当前顺序对应的数值，确保严格按出现顺序替换。
        if (placeholder === "{%}") {
            return `${+(value * 100).toFixed(2)}%`
        }

        return `${+value.toFixed(2)}`
    })
}

export class LeveledPet implements Pet {
    id: number
    uid: number
    名称: string
    描述: string
    异化?: number
    icon: string
    品质: number
    类型: number
    最大等级: number
    捕获经验: number
    经验: number = 0
    主动?: PetSkill
    被动?: PetSkill
    /** 当前档位的主动技能文案模板（简体中文原文、含占位符），供界面翻译后代入数值 */
    主动模板?: string
    /** 与主动技能模板占位符按出现顺序一一对应的当前档位数值 */
    主动值: number[] = []
    /** 当前档位的被动技能文案模板（简体中文原文、含占位符） */
    被动模板?: string
    /** 与被动技能模板占位符按出现顺序一一对应的当前档位数值 */
    被动值: number[] = []

    private _等级: number = 0
    private _originalPetData: Pet

    constructor(petid: number | Pet, level?: number) {
        const petData = typeof petid === "number" ? leveledPetResolver?.(petid) : petid
        if (!petData) {
            throw new Error(typeof petid === "number" ? `魔灵 ID "${petid}" 未在静态表中找到` : "魔灵数据不能为空")
        }

        this._originalPetData = petData

        this.id = petData.id
        this.uid = petData.uid || 0
        this.名称 = petData.名称
        this.icon = petData.icon
        this.品质 = petData.品质
        this.类型 = petData.类型
        this.最大等级 = petData.最大等级
        this.捕获经验 = petData.捕获经验
        this.异化 = petData.异化
        this.描述 = petData.描述

        this._等级 = level !== undefined ? Math.max(0, Math.min(PET_SKILL_LEVEL_INDEX_MAX, level)) : 0

        this.updateProperties()
    }

    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        this._等级 = Math.max(0, Math.min(PET_SKILL_LEVEL_INDEX_MAX, value))
        this.updateProperties()
    }

    private updateProperties(): void {
        this.经验 = Math.floor(50 * this._等级)

        if (this._originalPetData.主动) {
            const activeValues = this.calculateSkillValues(this._originalPetData.主动)
            this.主动模板 = this._originalPetData.主动.描述
            this.主动值 = activeValues
            this.主动 = {
                id: this._originalPetData.主动.id,
                描述: formatPetSkillText(this.主动模板, activeValues),
                值: this._originalPetData.主动.值,
                cd: this._originalPetData.主动.cd,
            }
        }

        if (this._originalPetData.被动) {
            const passiveValues = this.calculateSkillValues(this._originalPetData.被动)
            this.被动模板 = this._originalPetData.被动.描述
            this.被动值 = passiveValues
            this.被动 = {
                描述: formatPetSkillText(this.被动模板, passiveValues),
                值: this._originalPetData.被动.值,
            }
        }
    }

    private calculateSkillValues(skill: PetSkill): number[] {
        return skill.值.map(val => {
            return val[this._等级]
        })
    }

    getProperties(): Partial<Pet> {
        return {
            名称: this.名称,
            主动: this.主动,
            被动: this.被动,
        }
    }

    public clone(): LeveledPet {
        return new LeveledPet(this._originalPetData, this._等级)
    }

    equals(pet: LeveledPet): boolean {
        return this.id === pet.id && this.等级 === pet.等级
    }

    get url(): string {
        return LeveledPet.url(this.icon)
    }
    static url(icon?: string): string {
        return icon ? `/imgs/webp/T_Head_Pet_${icon}.webp` : ""
    }
}
