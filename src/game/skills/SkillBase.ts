import { CharBuild, LeveledSkill } from "../../data"
import { SkillBehavior, SkillType } from "../systems/SkillSystem"
import { GameState } from "../types"

export abstract class SkillBase implements SkillBehavior {
    abstract name: string
    abstract type: SkillType
    abstract cooldown: number
    range?: number
    duration?: number
    tickRate?: number

    protected skillData?: LeveledSkill = undefined
    constructor(protected charBuild: CharBuild) {
        this.skillData = charBuild.skills?.find((s: any) => s.名称 === this.name)
    }

    initialize?(state: GameState, playerPosition: { x: number; y: number }): void
    onCast?(state: GameState, playerPosition: { x: number; y: number }): void
    update?(dt: number, state: GameState): boolean
    onEnd?(state: GameState): void
}
