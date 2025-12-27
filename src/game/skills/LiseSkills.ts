import type { GameState } from "../types"
import { SkillType } from "../systems/SkillSystem"
import { CollisionSystem } from "../systems/CollisionSystem"
import { SkillBase } from "./SkillBase"
import { CharBuild } from "../../data"

export class LiseSkillE extends SkillBase {
    name = "快速出击"
    type = SkillType.DASH
    cooldown = 0.5
    range = 10
    private electricEnergyCost = 30 // 电能消耗
    private damageBoostDuration = 9000 // 造成伤害提高效果持续时间（毫秒）
    private damageBoostAmount = 0.9 // 造成伤害提高90%

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(_state: GameState, _playerPosition: { x: number; y: number }): void {}

    onCast(state: GameState, _playerPosition: { x: number; y: number }): void {
        // 从LeveledSkill获取神智消耗
        const energyCost = this.getSanityCost()
        // 检查是否有足够的电能
        const playerState = state.player as any
        const hasElectricEnergy = (playerState.electricEnergy || 0) >= this.electricEnergyCost

        // 消耗神智
        this.consumeSanity(state, energyCost)

        if (hasElectricEnergy) {
            // 消耗电能并增强效果
            this.consumeElectricEnergy(state, this.electricEnergyCost)
            this.applyDamageBoost(state)
            // this.dealDamage(state, playerPosition, true) // 增强伤害
        } else {
            // this.dealDamage(state, playerPosition, false) // 普通伤害
        }
    }

    update(_dt: number, _state: GameState): boolean {
        return false
    }

    private consumeElectricEnergy(state: GameState, amount: number): void {
        const playerState = state.player as any
        const currentElectricEnergy = playerState.electricEnergy || 0
        const newElectricEnergy = Math.max(0, currentElectricEnergy - amount)
        playerState.electricEnergy = newElectricEnergy
    }

    private applyDamageBoost(state: GameState): void {
        const playerState = state.player as any
        playerState.damageBoostEndTime = Date.now() + this.damageBoostDuration
        playerState.damageBoostAmount = this.damageBoostAmount
    }
}

export class LiseSkillQ extends SkillBase {
    constructor(charBuild: CharBuild) {
        super(charBuild)
    }
    name = "涡旋电场"
    type = SkillType.CHANNEL
    cooldown = 1
    range = 50
    // 持续时间：直到神智归零或手动关闭技能，不设置固定 duration
    tickRate = 1

    private lastTickTime = 0
    private totalTicks = 0
    private electricFieldRadius = 50 // 电场爆发效果半径
    private chargeRadius = 20 // 电荷效果半径
    private chargeDuration = 6000 // 电荷持续时间（毫秒）
    private movementSpeedBoost = 0.25 // 移动速度提高25%

    // 电荷系统
    private enemiesWithCharges = new Map<any, { type: "positive" | "negative"; endTime: number }>()
    private lastChargeType: "positive" | "negative" = "positive"

    // 检查当前神智是否为0
    private isSanityZero(state: GameState): boolean {
        const attrs = this.charBuild.calculateAttributes()
        const maxSanity = attrs.神智 || 150
        const playerState = state.player as any
        const currentSanity = playerState.currentSanity ?? maxSanity
        return currentSanity <= 0
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        this.lastTickTime = Date.now()
        this.totalTicks = 0

        // 从LeveledSkill获取初始神智消耗
        const sanityCost = this.getSanityCost()

        // 消耗初始神智
        this.consumeSanity(state, sanityCost)

        // 进入电场爆发状态
        this.enterElectricFieldBurst(state)

        // 清空之前的电荷
        this.enemiesWithCharges.clear()
    }

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        // 初始AOE伤害
        this.dealAoeDamage(state, playerPosition)

        // 选择一个敌人附加电荷
        this.applyChargeToRandomEnemy(state)

        this.totalTicks++
        this.lastTickTime = Date.now()
    }

    update(_dt: number, state: GameState): boolean {
        const now = Date.now()
        const timeSinceLastTick = (now - this.lastTickTime) / 1000

        // 从LeveledSkill获取每秒神智消耗
        const sanityDrainPerSecond = this.getSanityDrainPerSecond()

        // 检查神智是否归零
        if (this.isSanityZero(state)) {
            return false // 神智归零，结束技能
        }

        // 检查神智是否足够消耗下一秒
        if (!this.hasEnoughSanity(state, sanityDrainPerSecond)) {
            return false // 神智不足，结束技能
        }

        if (timeSinceLastTick >= this.tickRate) {
            // 消耗神智
            this.consumeSanity(state, sanityDrainPerSecond)

            // 每秒选择一个敌人造成伤害并附加电荷
            this.applyChargeToRandomEnemy(state)
            this.dealElectricFieldDamage(state, state.player.position)

            // 处理电荷相互作用
            this.processChargeInteractions(state)

            this.totalTicks++
            this.lastTickTime = now
        }

        return true
    }

    onEnd(state: GameState): void {
        console.log(`黎瑟Q技能结束,共造成 ${this.totalTicks} 次伤害`)

        // 退出电场爆发状态
        this.exitElectricFieldBurst(state)

        // 清理电荷
        this.enemiesWithCharges.clear()
    }

    private enterElectricFieldBurst(state: GameState): void {
        const playerState = state.player as any
        playerState.electricFieldBurst = true
        playerState.movementSpeedBoost = this.movementSpeedBoost
    }

    private exitElectricFieldBurst(state: GameState): void {
        const playerState = state.player as any
        playerState.electricFieldBurst = false
        playerState.movementSpeedBoost = 0
    }

    private applyChargeToRandomEnemy(state: GameState): void {
        if (state.enemies.length === 0) return

        // 筛选在电场范围内的敌人
        const enemiesInRange = state.enemies.filter(
            (enemy) =>
                Math.hypot(enemy.position.x - state.player.position.x, enemy.position.y - state.player.position.y) <=
                this.electricFieldRadius * 50,
        )

        if (enemiesInRange.length === 0) return

        // 随机选择一个敌人
        const randomIndex = Math.floor(Math.random() * enemiesInRange.length)
        const selectedEnemy = enemiesInRange[randomIndex]

        const chargeType = this.lastChargeType
        this.lastChargeType = chargeType === "positive" ? "negative" : "positive"

        const endTime = Date.now() + this.chargeDuration
        this.enemiesWithCharges.set(selectedEnemy, { type: chargeType, endTime })

        // 造成电场爆发伤害
        const damage = this.calculateElectricFieldDamage()
        const element = state.player.charData.属性

        CollisionSystem.applyDamageToEnemies(state, [selectedEnemy], [damage], element)
    }

    private processChargeInteractions(state: GameState): void {
        const now = Date.now()

        // 清理过期的电荷
        for (const [enemy, charge] of this.enemiesWithCharges.entries()) {
            if (now > charge.endTime) {
                this.enemiesWithCharges.delete(enemy)
            }
        }

        // 处理电荷相互作用
        const positiveCharges = Array.from(this.enemiesWithCharges.entries()).filter(([_, charge]) => charge.type === "positive")
        const negativeCharges = Array.from(this.enemiesWithCharges.entries()).filter(([_, charge]) => charge.type === "negative")

        for (const [positiveEnemy, _] of positiveCharges) {
            for (const [negativeEnemy, _] of negativeCharges) {
                const dist = Math.hypot(
                    positiveEnemy.position.x - negativeEnemy.position.x,
                    positiveEnemy.position.y - negativeEnemy.position.y,
                )

                if (dist <= this.chargeRadius * 50) {
                    // 造成电荷伤害
                    this.dealChargeDamage(state, positiveEnemy, negativeEnemy)
                }
            }
        }
    }

    private dealChargeDamage(state: GameState, enemy1: any, enemy2: any): void {
        const damage1 = this.calculateChargeDamage()
        const damage2 = this.calculateChargeDamage()
        const element = state.player.charData.属性

        // 对第一个敌人造成伤害
        CollisionSystem.applyDamageToEnemies(state, [enemy1], [damage1], element)

        // 对第二个敌人造成伤害
        CollisionSystem.applyDamageToEnemies(state, [enemy2], [damage2], element)

        // 吸聚效果（这里简化处理，实际可能需要物理系统）
        const midpoint = {
            x: (enemy1.position.x + enemy2.position.x) / 2,
            y: (enemy1.position.y + enemy2.position.y) / 2,
        }

        // 向中点移动（简化实现）
        enemy1.position.x += (midpoint.x - enemy1.position.x) * 0.1
        enemy1.position.y += (midpoint.y - enemy1.position.y) * 0.1
        enemy2.position.x += (midpoint.x - enemy2.position.x) * 0.1
        enemy2.position.y += (midpoint.y - enemy2.position.y) * 0.1
    }

    private dealAoeDamage(state: GameState, center: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, center, this.range!)

        if (hitEnemies.length === 0) return

        const damages = hitEnemies.map(() => this.calculateDamage())
        const element = state.player.charData.属性

        // 对范围内的敌人造成伤害
        CollisionSystem.applyDamageToEnemies(state, hitEnemies, damages, element)
    }

    private dealElectricFieldDamage(state: GameState, center: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, center, this.electricFieldRadius)

        if (hitEnemies.length === 0) return

        const damage = this.calculateElectricFieldDamage()
        const element = state.player.charData.属性
        const randomEnemy = hitEnemies[Math.floor(Math.random() * hitEnemies.length)]

        // 对范围内的敌人造成伤害
        CollisionSystem.applyDamageToEnemies(state, [randomEnemy], [damage], element)
    }

    private calculateDamage(): number {
        if (!this.charBuild) return 3000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        return baseDamage
    }

    private calculateElectricFieldDamage(): number {
        if (!this.charBuild) return 1000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name + "[电场爆发]")
        return baseDamage
    }

    private calculateChargeDamage(): number {
        if (!this.charBuild) return 5000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name + "[电荷]")
        return baseDamage
    }

    getElapsedTime(): number {
        const skill = (globalThis as any).activeSkills?.get("q")
        if (!skill) return 0
        return (Date.now() - skill.startTime) / 1000
    }

    getRemainingTime(): number {
        // 技能持续直到神智归零或手动关闭，没有固定剩余时间
        // 返回基于当前神智的估算时间
        const skill = (globalThis as any).activeSkills?.get("q")
        if (!skill) return 0

        const sanityDrainPerSecond = this.getSanityDrainPerSecond()
        if (sanityDrainPerSecond <= 0) return Infinity

        // 从全局游戏状态获取当前神智
        const gameState = (globalThis as any).gameState
        if (!gameState) return 0

        const attrs = this.charBuild.calculateAttributes()
        const currentSanity = (gameState.player as any).sanity ?? (attrs.神智 || 150)

        return currentSanity / sanityDrainPerSecond
    }
}

// 战术节能被动技能
export class LiseSkillPassive extends SkillBase {
    name = "战术节能"
    type = SkillType.PASSIVE
    cooldown = 0
    range = 0

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        // 初始化电能系统
        const playerState = state.player as any
        if (!playerState.electricEnergy) {
            // 从CharBuild.calculateAttributes获取最大神智
            const attrs = this.charBuild.calculateAttributes()
            const maxSanity = attrs.神智 || 150
            playerState.electricEnergy = 0
            playerState.maxElectricEnergy = maxSanity
            playerState.maxSanity = maxSanity
        }

        // 监听神智消耗事件
        this.setupSanityConsumptionListener(state)
    }

    onCast(_state: GameState, _playerPosition: { x: number; y: number }): void {
        // 被动技能不需要主动施放
    }

    update(_dt: number, _state: GameState): boolean {
        return false // 被动技能不需要持续更新
    }

    private setupSanityConsumptionListener(state: GameState): void {
        // 保存原始的消耗神智方法
        const playerState = state.player as any
        const originalConsumeSanity = playerState.consumeSanity

        // 重写消耗神智方法以添加电能转换
        playerState.consumeSanity = (amount: number) => {
            // 调用原始方法
            if (originalConsumeSanity) {
                originalConsumeSanity(amount)
            }

            // 转换一定比例的神智为电能
            const conversionRate = this.getConversionRate()
            const electricEnergyGained = Math.floor(amount * conversionRate)

            const currentElectricEnergy = playerState.electricEnergy || 0
            const attrs = this.charBuild.calculateAttributes()
            const maxElectricEnergy = attrs.神智 || 150
            const newElectricEnergy = Math.min(maxElectricEnergy, currentElectricEnergy + electricEnergyGained)

            playerState.electricEnergy = newElectricEnergy
        }
    }

    private getConversionRate(): number {
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return 0.37 // 默认1级转换比例

        // 从LeveledSkill获取转换比例
        const conversionField = leveledSkill.字段.find((field) => field.名称 === "转换比例")
        return (conversionField?.值 || 37) / 100
    }
}
