import type { GameState } from "../types"

/**
 * 技能类型枚举
 */
export enum SkillType {
    INSTANT = "instant", // 瞬发伤害
    CHANNEL = "channel", // 持续引导
    DASH = "dash", // 冲刺
    AREA = "area", // 范围伤害
    PROJECTILE = "projectile", // 投射物
    BUFF = "buff", // 增益
}

/**
 * 技能行为接口
 */
export interface SkillBehavior {
    /**
     * 技能类型
     */
    type: SkillType

    /**
     * 技能名称
     */
    name: string

    /**
     * 冷却时间(秒)
     */
    cooldown: number

    /**
     * 技能范围(像素)
     */
    range?: number

    /**
     * 技能持续时间(秒),用于channel型技能
     */
    duration?: number

    /**
     * 技能伤害间隔(秒),用于持续伤害技能
     */
    tickRate?: number

    /**
     * 初始化技能
     */
    initialize?(state: GameState, playerPosition: { x: number; y: number }): void

    /**
     * 技能释放时触发一次
     */
    onCast?(state: GameState, playerPosition: { x: number; y: number }): void

    /**
     * 每帧更新技能
     * @param dt 增量时间(秒)
     * @returns 技能是否仍然活跃
     */
    update?(dt: number, state: GameState): boolean

    /**
     * 技能结束时清理
     */
    onEnd?(state: GameState): void
}

/**
 * 活跃技能实例
 */
export interface ActiveSkill {
    behavior: SkillBehavior
    startTime: number
    playerPosition: { x: number; y: number }
    isActive: boolean
}

/**
 * 技能管理器
 */
export class SkillSystem {
    private static activeSkills: Map<string, ActiveSkill> = new Map()

    /**
     * 注册并释放技能
     */
    static castSkill(skillKey: string, behavior: SkillBehavior, state: GameState): boolean {
        const now = Date.now()
        const player = state.player

        // 检查冷却
        const lastUse = player[`lastSkill${skillKey.toUpperCase()}` as keyof typeof player] as number
        const cooldownMs = behavior.cooldown * 1000

        if (now - lastUse < cooldownMs) {
            return false // 冷却中
        }

        // 更新最后使用时间
        ;(player[`lastSkill${skillKey.toUpperCase()}` as keyof typeof player] as number) = now

        // 初始化技能
        behavior.initialize?.(state, player.position)

        // 触发释放效果
        behavior.onCast?.(state, player.position)

        // 如果是持续型技能,添加到活跃列表
        if (behavior.type === SkillType.CHANNEL || behavior.duration) {
            this.activeSkills.set(skillKey, {
                behavior,
                startTime: now,
                playerPosition: { ...player.position },
                isActive: true,
            })
        }

        return true
    }

    /**
     * 更新所有活跃技能
     */
    static updateActiveSkills(dt: number, state: GameState): void {
        const now = Date.now()

        this.activeSkills.forEach((activeSkill, key) => {
            if (!activeSkill.isActive) return

            // 检查持续时间
            if (activeSkill.behavior.duration) {
                const elapsed = (now - activeSkill.startTime) / 1000
                if (elapsed >= activeSkill.behavior.duration) {
                    this.endSkill(key, state)
                    return
                }
            }

            // 更新技能
            if (activeSkill.behavior.update) {
                const stillActive = activeSkill.behavior.update(dt, state)
                if (!stillActive) {
                    this.endSkill(key, state)
                }
            }
        })
    }

    /**
     * 结束技能
     */
    static endSkill(skillKey: string, state: GameState): void {
        const skill = this.activeSkills.get(skillKey)
        if (skill) {
            skill.isActive = false
            skill.behavior.onEnd?.(state)
            this.activeSkills.delete(skillKey)
        }
    }

    /**
     * 获取技能剩余持续时间
     */
    static getSkillRemainingTime(skillKey: string): number {
        const skill = this.activeSkills.get(skillKey)
        if (!skill || !skill.behavior.duration) return 0

        const elapsed = (Date.now() - skill.startTime) / 1000
        return Math.max(0, skill.behavior.duration - elapsed)
    }

    /**
     * 清理所有技能
     */
    static clear(): void {
        this.activeSkills.clear()
    }
}
