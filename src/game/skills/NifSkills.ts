import type { GameState } from "../types"
import { SkillType } from "../systems/SkillSystem"
import { CollisionSystem } from "../systems/CollisionSystem"
import { SkillBase } from "./SkillBase"
import { CharBuild } from "../../data"

export class NifSkillE extends SkillBase {
    name = "日食"
    type = SkillType.AREA
    cooldown = 0.5
    range = 3

    private isDayMode = true // true=日食状态, false=月猎状态
    private debuffDuration = 3000 // 减益效果持续时间（毫秒）
    private attackDebuffAmount = 0.25 // 攻击降低25%
    private moveSpeedDebuffAmount = 0.3 // 移动速度降低30%

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        // 初始化状态系统
        const playerState = state.player as any
        if (!playerState.isDayMode) {
            playerState.isDayMode = true
        }
    }

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        // 从LeveledSkill获取神智消耗
        const sanityCost = this.getSanityCost()

        // 消耗神智
        this.consumeSanity(state, sanityCost)

        // 根据状态执行不同技能
        if (this.isDayMode) {
            this.performSolarEclipse(state, playerPosition)
        } else {
            this.performMoonHunt(state, playerPosition)
        }

        // 切换状态
        this.isDayMode = !this.isDayMode
        const playerState = state.player as any
        playerState.isDayMode = this.isDayMode
    }

    update(_dt: number, _state: GameState): boolean {
        return false
    }

    // 日食状态：对周围敌人造成伤害，降低攻击力
    private performSolarEclipse(state: GameState, center: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, center, this.range!)

        if (hitEnemies.length === 0) return

        const damage = this.calculateSolarDamage()
        const element = state.player.charData.属性

        // 对范围内的敌人造成伤害
        const damages = hitEnemies.map(() => damage)
        CollisionSystem.applyDamageToEnemies(state, hitEnemies, damages, element)

        // 降低攻击力
        for (const enemy of hitEnemies) {
            this.applyAttackDebuff(state, enemy)
        }
    }

    // 月猎状态：对远处敌人造成伤害，降低移动速度
    private performMoonHunt(state: GameState, playerPosition: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        const damage = this.calculateMoonDamage()
        const element = state.player.charData.属性

        // 月猎范围更大
        const moonRange = this.range! * 3

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, playerPosition, moonRange)

        if (hitEnemies.length === 0) return

        // 对范围内的敌人造成伤害
        const damages = hitEnemies.map(() => damage)
        CollisionSystem.applyDamageToEnemies(state, hitEnemies, damages, element)

        // 降低移动速度
        for (const enemy of hitEnemies) {
            this.applyMoveSpeedDebuff(state, enemy)
        }
    }

    private calculateSolarDamage(): number {
        if (!this.charBuild) return 2000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取日食伤害倍率
        const solarField = leveledSkill.字段.find((field) => field.名称.includes("[日食]伤害"))
        const damageMultiplier = (solarField?.值 || 150) / 100

        return baseDamage * damageMultiplier
    }

    private calculateMoonDamage(): number {
        if (!this.charBuild) return 1800
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取月猎伤害倍率
        const moonField = leveledSkill.字段.find((field) => field.名称.includes("[月猎]伤害"))
        const damageMultiplier = (moonField?.值 || 130) / 100

        return baseDamage * damageMultiplier
    }

    private applyAttackDebuff(_state: GameState, target: any): void {
        const enemyState = target as any
        enemyState.attackDebuffEndTime = Date.now() + this.debuffDuration
        enemyState.attackDebuffAmount = this.attackDebuffAmount
    }

    private applyMoveSpeedDebuff(_state: GameState, target: any): void {
        const enemyState = target as any
        enemyState.moveSpeedDebuffEndTime = Date.now() + this.debuffDuration
        enemyState.moveSpeedDebuffAmount = this.moveSpeedDebuffAmount
    }
}

export class NifSkillQ extends SkillBase {
    name = "雾海安魂"
    type = SkillType.BUFF
    cooldown = 1
    range = 0
    duration = 12

    private funeralDuration = 12000 // 送葬状态持续时间（毫秒）
    private rangeConversionRate = 1.0 // 技能范围转化比例100%
    private triggerBonus = 0.6 // 触发概率提高60%

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        // 从LeveledSkill获取神智消耗
        const sanityCost = this.getSanityCost()

        // 消耗神智
        this.consumeSanity(state, sanityCost)

        // 进入送葬状态
        this.enterFuneralState(state)
    }

    onCast(_state: GameState, _playerPosition: { x: number; y: number }): void {
        // 增益技能在initialize中处理
    }

    update(_dt: number, _state: GameState): boolean {
        return false // 增益技能不需要持续更新
    }

    onEnd(state: GameState): void {
        // 退出送葬状态
        this.exitFuneralState(state)
    }

    private enterFuneralState(state: GameState): void {
        const playerState = state.player as any
        playerState.inFuneralState = true
        playerState.funeralEndTime = Date.now() + this.funeralDuration
        playerState.triggerBonus = this.triggerBonus
    }

    private exitFuneralState(state: GameState): void {
        const playerState = state.player as any
        playerState.inFuneralState = false
        playerState.triggerBonus = 0
    }

    // 计算送葬状态下的强化范围
    calculateEnhancedRange(state: GameState, baseRange: number, _isDayMode: boolean): number {
        const playerState = state.player as any
        if (!playerState.inFuneralState) return baseRange

        const conversionRate = this.rangeConversionRate
        return baseRange * (1 + conversionRate)
    }

    // 计算送葬状态下的强化伤害
    calculateEnhancedDamage(state: GameState, baseDamage: number): number {
        const playerState = state.player as any
        if (!playerState.inFuneralState) return baseDamage

        // 送葬状态下伤害大幅提升
        return baseDamage * 1.5
    }

    getElapsedTime(): number {
        const skill = (globalThis as any).activeSkills?.get("q")
        if (!skill) return 0
        return (Date.now() - skill.startTime) / 1000
    }

    getRemainingTime(): number {
        return Math.max(0, this.duration! - this.getElapsedTime())
    }
}

// 啼鸣交织被动技能
export class NifSkillPassive extends SkillBase {
    name = "啼鸣交织"
    type = SkillType.PASSIVE
    cooldown = 0
    range = 0

    private baseTriggerChance = 0.14 // 基础触发概率14%
    private maxTriggerChance = 0.5 // 最大触发概率50%

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(_state: GameState, _playerPosition: { x: number; y: number }): void {
        // 从LeveledSkill获取触发概率
        const leveledSkill = this.getLeveledSkill()
        if (leveledSkill) {
            const triggerField = leveledSkill.字段.find((field) => field.名称.includes("触发概率"))
            this.baseTriggerChance = Math.min((triggerField?.值 || 14) / 100, this.maxTriggerChance)
        }
    }

    onCast(_state: GameState, _playerPosition: { x: number; y: number }): void {
        // 被动技能不需要主动施放
    }

    update(_dt: number, _state: GameState): boolean {
        return false // 被动技能不需要持续更新
    }

    // 检查是否触发被动效果
    checkTrigger(): boolean {
        const leveledSkill = this.getLeveledSkill()
        let triggerChance = this.baseTriggerChance

        if (leveledSkill) {
            const triggerField = leveledSkill.字段.find((field) => field.名称.includes("触发概率"))
            triggerChance = Math.min((triggerField?.值 || 14) / 100, this.maxTriggerChance)
        }

        return Math.random() < triggerChance
    }

    // 获取当前触发概率
    getTriggerChance(): number {
        const leveledSkill = this.getLeveledSkill()
        let triggerChance = this.baseTriggerChance

        if (leveledSkill) {
            const triggerField = leveledSkill.字段.find((field) => field.名称.includes("触发概率"))
            triggerChance = Math.min((triggerField?.值 || 14) / 100, this.maxTriggerChance)
        }

        return triggerChance
    }
}
