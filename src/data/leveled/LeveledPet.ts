import { Pet } from "../data-types"
import { petMap } from "../d"
import { type PetSkill } from "../d/pet.data"

export class LeveledPet implements Pet {
    id: number
    uid: number
    名称: string
    icon: string
    品质: number
    类型: number
    最大等级: number
    捕获经验: number
    经验: number = 0
    主动?: PetSkill
    被动?: PetSkill

    private _等级: number = 0
    private _originalPetData: Pet

    static from(id: number, level?: number) {
        const petData = petMap.get(id)
        if (!petData) {
            return null
        }
        return new LeveledPet(petData, level)
    }

    constructor(petid: number | Pet, level?: number) {
        const petData = typeof petid === "number" ? petMap.get(petid) : petid
        if (!petData) {
            throw new Error(`魔灵 ID "${petid}" 未在静态表中找到`)
        }

        this._originalPetData = petData

        this.id = petData.id
        this.uid = petData.uid
        this.名称 = petData.名称
        this.icon = petData.icon
        this.品质 = petData.品质
        this.类型 = petData.类型
        this.最大等级 = petData.最大等级
        this.捕获经验 = petData.捕获经验

        this._等级 = level !== undefined ? Math.max(0, Math.min(3, level)) : 0

        this.updateProperties()
    }

    get 等级(): number {
        return this._等级
    }

    set 等级(value: number) {
        this._等级 = Math.max(0, Math.min(3, value))
        this.updateProperties()
    }

    private updateProperties(): void {
        const baseExp = this._originalPetData.经验
        const multiplier = 1 + this._等级 / 3
        this.经验 = Math.floor(baseExp * multiplier)

        if (this._originalPetData.主动) {
            const activeValues = this.calculateSkillValues(this._originalPetData.主动)
            this.主动 = {
                描述: this.formatSkillDescription(this._originalPetData.主动.描述, activeValues),
                值: activeValues,
            }
        }

        if (this._originalPetData.被动) {
            const passiveValues = this.calculateSkillValues(this._originalPetData.被动)
            this.被动 = {
                描述: this.formatSkillDescription(this._originalPetData.被动.描述, passiveValues),
                值: passiveValues,
            }
        }
    }

    private calculateSkillValues(skill: PetSkill): number[] {
        const multiplier = 1 + this._等级 / 3
        return skill.值.map((val, i) => {
            // 对持续时间进行特殊处理，不进行等级提升
            const isDuration = skill.描述.match(/\{%?\}秒?/g)?.[i]?.endsWith("秒")
            return isDuration && val > 2 ? val : val * multiplier
        })
    }

    private formatSkillDescription(description: string, values: number[]): string {
        let formattedDesc = description
        let valueIndex = 0

        while (formattedDesc.includes("{%}") && valueIndex < values.length) {
            const val = values[valueIndex]
            formattedDesc = formattedDesc.replace("{%}", `${+(val * 100).toFixed(2)}%`)
            valueIndex++
        }

        while (formattedDesc.includes("{}") && valueIndex < values.length) {
            formattedDesc = formattedDesc.replace("{}", `${+values[valueIndex].toFixed(2)}`)
            valueIndex++
        }

        return formattedDesc
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
