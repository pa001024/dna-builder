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

    // 神智系统基础方法
    protected consumeSanity(state: GameState, amount: number): void {
        const playerState = state.player as any
        const maxSanity = state.attrs.神智 || 150
        const currentSanity = playerState.sanity || maxSanity
        const newSanity = Math.max(0, currentSanity - amount)

        playerState.sanity = newSanity
    }

    protected getSanityCost(): number {
        const leveledSkill = this.getLeveledSkill()

        // 获取属性影响
        const attrs = this.charBuild.calculateAttributes()
        const baseCost = leveledSkill?.getFieldsWithAttr(attrs)?.find((f) => f.名称.includes("神智消耗"))?.值 || 20
        // 效益影响: 神智消耗 = 基础值 * (2-效益)
        return baseCost
    }

    protected getSanityDrainPerSecond(): number {
        const leveledSkill = this.getLeveledSkill()

        // 获取属性影响
        const attrs = this.charBuild.calculateAttributes()
        const baseDrain = leveledSkill?.getFieldsWithAttr(attrs)?.find((f) => f.名称.includes("每秒神智消耗"))?.值 || 20

        // 效益影响: 每秒神智消耗值 = 基础值 * Math.max(0.25, (2-效益)/耐久)
        return baseDrain
    }

    // 计算受耐久影响的持续时间
    protected getAdjustedDuration(baseDuration: number): number {
        // 获取属性影响
        const attrs = this.charBuild.calculateAttributes()
        const 耐久 = attrs.技能耐久 || 1

        // 耐久影响: 对持续时间: 乘法
        return baseDuration * 耐久
    }

    protected getLeveledSkill() {
        return this.charBuild.skills?.find((skill) => skill.名称 === this.name)
    }

    protected hasEnoughSanity(state: GameState, amount: number): boolean {
        const playerState = state.player as any
        const currentSanity = playerState.sanity || playerState.maxSanity || 150
        return currentSanity >= amount
    }

    // 神智回复方法
    public regenerateSanity(state: GameState, _dt: number): void {
        const playerState = state.player as any
        const attrs = this.charBuild.calculateAttributes()
        const maxSanity = attrs.神智 || 150

        // 初始化神智回复相关字段
        if (!playerState.maxSanity) {
            playerState.maxSanity = maxSanity
        }
        if (!playerState.sanity) {
            playerState.sanity = maxSanity
        }
        if (!playerState.sanityRegenRate) {
            playerState.sanityRegenRate = this.calculateSanityRegenRate()
        }
        if (!playerState.lastSanityRegenTime) {
            playerState.lastSanityRegenTime = Date.now()
        }

        // 检查神智是否已满
        if (playerState.sanity >= playerState.maxSanity) {
            return
        }

        // 计算神智回复
        const now = Date.now()
        const timeSinceLastRegen = (now - playerState.lastSanityRegenTime) / 1000 // 转换为秒

        // 每秒回复
        if (timeSinceLastRegen >= 1) {
            const regenAmount = playerState.sanityRegenRate * timeSinceLastRegen
            playerState.sanity = Math.min(playerState.maxSanity, playerState.sanity + regenAmount)
            playerState.lastSanityRegenTime = now
        }
    }

    // 计算神智回复速率
    protected calculateSanityRegenRate(): number {
        const attrs = this.charBuild.calculateAttributes()

        // 基础神智回复速率（每秒回复最大神智的1%）
        const maxSanity = attrs.神智 || 150
        let regenRate = maxSanity * 0.01

        // 从BUFF中获取神智回复加成
        const sanityRegenBonus = this.charBuild.getTotalBonus("神智回复") || 0
        regenRate += sanityRegenBonus

        return Math.max(0, regenRate)
    }
}
