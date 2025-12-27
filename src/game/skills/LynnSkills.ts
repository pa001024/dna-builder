import type { GameState } from "../types"
import { SkillType } from "../systems/SkillSystem"
import { CollisionSystem } from "../systems/CollisionSystem"
import { SkillBase } from "./SkillBase"
import { CharBuild } from "../../data"

export class LynnSkillE extends SkillBase {
    name = "致命绽放"
    type = SkillType.AREA
    cooldown = 0.5
    range = 20

    private bleedDuration = 8000 // 裂伤持续时间（毫秒）
    private maxBleedStacks = 10 // 裂伤最大层数

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(_state: GameState, _playerPosition: { x: number; y: number }): void {}

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        // 从LeveledSkill获取神智消耗
        const sanityCost = this.getSanityCost()

        // 消耗神智
        this.consumeSanity(state, sanityCost)

        // 造成范围伤害并附加裂伤
        this.dealAoeDamageAndApplyBleed(state, playerPosition)
    }

    update(_dt: number, _state: GameState): boolean {
        return false
    }

    private dealAoeDamageAndApplyBleed(state: GameState, center: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, center, this.range!)

        if (hitEnemies.length === 0) return

        const damage = this.calculateDamage()
        const element = state.player.charData.属性

        // 对范围内的敌人造成伤害
        const damages = hitEnemies.map(() => damage)
        CollisionSystem.applyDamageToEnemies(state, hitEnemies, damages, element)

        // 附加裂伤效果
        for (const enemy of hitEnemies) {
            this.applyBleedWound(state, enemy)
        }
    }

    private calculateDamage(): number {
        if (!this.charBuild) return 3000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取伤害倍率
        const damageField = leveledSkill.字段.find((field) => field.名称 === "伤害")
        const damageMultiplier = (damageField?.值 || 388) / 100

        return baseDamage * damageMultiplier
    }

    private applyBleedWound(state: GameState, target: any): void {
        const playerState = state.player as any
        if (!playerState.bleedWounds) {
            playerState.bleedWounds = new Map()
        }

        const existingWound = playerState.bleedWounds.get(target)
        const baseDamage = this.getBleedBaseDamage()
        const duration = this.bleedDuration

        if (existingWound && Date.now() < existingWound.endTime) {
            // 刷新持续时间，增加层数
            existingWound.endTime = Date.now() + duration
            existingWound.stackCount = Math.min(existingWound.stackCount + 1, this.maxBleedStacks)
        } else {
            // 新建裂伤
            playerState.bleedWounds.set(target, {
                target,
                endTime: Date.now() + duration,
                stackCount: 1,
                baseDamage,
            })
        }
    }

    private getBleedBaseDamage(): number {
        if (!this.charBuild) return 1000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取裂伤基础伤害
        const bleedField = leveledSkill.字段.find((field) => field.名称.includes("[裂伤]基础伤害"))
        const damageMultiplier = (bleedField?.值 || 130) / 100

        return baseDamage * damageMultiplier
    }
}

export class LynnSkillQ extends SkillBase {
    name = "火药酬宾"
    type = SkillType.CHANNEL
    cooldown = 1
    range = 50
    duration = 5
    tickRate = 1

    private lastTickTime = 0
    private totalTicks = 0
    private firepowerStacks = 0 // 射击层数

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        this.lastTickTime = Date.now()
        this.totalTicks = 0
        this.firepowerStacks = 0

        // 从LeveledSkill获取初始神智消耗
        const sanityCost = this.getSanityCost()

        // 消耗初始神智
        this.consumeSanity(state, sanityCost)
    }

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        // 初始射击
        this.performShot(state, playerPosition)
        this.totalTicks++
    }

    update(_dt: number, state: GameState): boolean {
        const now = Date.now()
        const timeSinceLastTick = (now - this.lastTickTime) / 1000

        // 从LeveledSkill获取每秒神智消耗
        const sanityDrainPerSecond = this.getSanityDrainPerSecond()

        // 检查神智是否足够
        if (!this.hasEnoughSanity(state, sanityDrainPerSecond)) {
            return false // 神智不足，结束技能
        }

        if (timeSinceLastTick >= this.tickRate!) {
            // 消耗神智
            this.consumeSanity(state, sanityDrainPerSecond)

            // 执行射击
            this.performShot(state, state.player.position)

            // 增加层数
            this.firepowerStacks++

            this.totalTicks++
            this.lastTickTime = now
        }

        return true
    }

    onEnd(_state: GameState): void {
        console.log(`琳恩Q技能结束,共射击 ${this.totalTicks} 次,最终层数 ${this.firepowerStacks}`)
    }

    private performShot(state: GameState, playerPosition: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        // 范围随层数增加
        const dynamicRange = this.calculateDynamicRange()

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, playerPosition, dynamicRange)

        if (hitEnemies.length === 0) return

        // 对范围内的敌人造成伤害
        const damages = hitEnemies.map((enemy) => {
            const dist = Math.hypot(enemy.position.x - playerPosition.x, enemy.position.y - playerPosition.y)
            return this.calculateShotDamage(dist, dynamicRange)
        })
        CollisionSystem.applyDamageToEnemies(state, hitEnemies, damages, state.player.charData.属性)
    }

    private calculateDynamicRange(): number {
        const baseRange = 10
        const maxRange = this.range!

        // 根据层数计算范围，层数越多范围越大
        const rangeIncrease = Math.min(this.firepowerStacks * 2, maxRange - baseRange)
        return baseRange + rangeIncrease
    }

    private calculateShotDamage(distance: number, range: number): number {
        if (!this.charBuild) return 2000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取射击伤害倍率
        const shotField = leveledSkill.字段.find((field) => field.名称.includes("射击伤害"))
        const damageMultiplier = (shotField?.值 || 200) / 100

        // 根据距离计算伤害衰减
        const distanceMultiplier = Math.max(0.3, 1 - (distance / range) * 0.7)

        return baseDamage * damageMultiplier * distanceMultiplier
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

// 战术速射被动技能
export class LynnSkillPassive extends SkillBase {
    name = "战术速射"
    type = SkillType.PASSIVE
    cooldown = 0
    range = 0

    private suppressionDuration = 6000 // 火力压制持续时间（毫秒）
    private damagePerStack = 0.051 // 每层伤害提高5.1%

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        // 初始化层数系统
        const playerState = state.player as any
        if (!playerState.firepowerStacks) {
            playerState.firepowerStacks = 0
        }

        // 从LeveledSkill获取每层伤害提高
        const leveledSkill = this.getLeveledSkill()
        if (leveledSkill) {
            const damageField = leveledSkill.字段.find((field) => field.名称.includes("每层的伤害提高"))
            this.damagePerStack = (damageField?.值 || 5.1) / 100
        }
    }

    onCast(_state: GameState, _playerPosition: { x: number; y: number }): void {
        // 被动技能不需要主动施放
    }

    update(_dt: number, _state: GameState): boolean {
        return false // 被动技能不需要持续更新
    }

    // 计算层数带来的伤害加成
    calculateDamageBonus(stackCount: number): number {
        return stackCount * this.damagePerStack
    }

    // 检查是否进入火力压制状态
    checkSuppressionState(state: GameState, stackCount: number): boolean {
        const playerState = state.player as any

        // 假设5层进入火力压制
        if (stackCount >= 5) {
            playerState.inSuppressionState = true
            playerState.suppressionEndTime = Date.now() + this.suppressionDuration
            return true
        }

        return false
    }

    // 检查火力压制状态是否过期
    checkSuppressionExpired(state: GameState): boolean {
        const playerState = state.player as any
        if (!playerState.inSuppressionState) return false

        if (Date.now() > (playerState.suppressionEndTime || 0)) {
            playerState.inSuppressionState = false
            return true
        }

        return false
    }
}
