import type { GameState } from "../types"
import { SkillType } from "../systems/SkillSystem"
import { CollisionSystem } from "../systems/CollisionSystem"
import { SkillBase } from "./SkillBase"
import { CharBuild } from "../../data"

export class SageSkillE extends SkillBase {
    name = "抽茧成梦"
    type = SkillType.AREA
    cooldown = 0.5
    range = 6

    private isDreamState = true // true=抽茧成梦, false=逐光
    private slowDuration = 3000 // 移动速度降低持续时间（毫秒）
    private slowAmount = 0.2 // 移动速度降低20%
    private markDuration = 10000 // 鳞粉印记持续时间（毫秒）

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        // 初始化印记系统
        const playerState = state.player as any
        if (!playerState.scalePowderMarks) {
            playerState.scalePowderMarks = new Map()
        }
    }

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        // 从LeveledSkill获取神智消耗
        const sanityCost = this.getSanityCost()

        // 消耗神智
        this.consumeSanity(state, sanityCost)

        // 根据状态执行不同技能
        if (this.isDreamState) {
            this.performDreamCocoon(state, playerPosition)
        } else {
            this.performChasingLight(state, playerPosition)
        }

        // 切换状态
        this.isDreamState = !this.isDreamState
    }

    update(_dt: number, _state: GameState): boolean {
        return false
    }

    // 抽茧成梦：释放幻象，造成范围伤害并降低移动速度
    private performDreamCocoon(state: GameState, center: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        const damage = this.calculateDreamDamage()
        const element = state.player.charData.属性

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, center, this.range!)

        if (hitEnemies.length === 0) return

        // 对范围内的敌人造成伤害
        const damages = hitEnemies.map(() => damage)
        CollisionSystem.applyDamageToEnemies(state, hitEnemies, damages, element)

        // 降低移动速度
        for (const enemy of hitEnemies) {
            this.applySlowEffect(state, enemy)
        }
    }

    // 逐光：释放浮光鳞粉，造成伤害并附加鳞粉印记
    private performChasingLight(state: GameState, playerPosition: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        const damage = this.calculateLightDamage()
        const element = state.player.charData.属性

        // 逐光范围更大
        const lightRange = this.range! * 2

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, playerPosition, lightRange)

        if (hitEnemies.length === 0) return

        // 对范围内的敌人造成伤害
        const damages = hitEnemies.map(() => damage)
        CollisionSystem.applyDamageToEnemies(state, hitEnemies, damages, element)

        // 附加鳞粉印记
        for (const enemy of hitEnemies) {
            this.applyScalePowderMark(state, enemy)
        }
    }

    private calculateDreamDamage(): number {
        if (!this.charBuild) return 2000
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取幻象伤害倍率
        const dreamField = leveledSkill.字段.find((field) => field.名称.includes("幻象伤害"))
        const damageMultiplier = (dreamField?.值 || 130) / 100

        return baseDamage * damageMultiplier
    }

    private calculateLightDamage(): number {
        if (!this.charBuild) return 1500
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取浮光鳞粉伤害倍率
        const lightField = leveledSkill.字段.find((field) => field.名称.includes("浮光鳞粉伤害"))
        const damageMultiplier = (lightField?.值 || 90) / 100

        return baseDamage * damageMultiplier
    }

    private applySlowEffect(_state: GameState, target: any): void {
        const enemyState = target as any
        enemyState.slowEndTime = Date.now() + this.slowDuration
        enemyState.slowAmount = this.slowAmount
    }

    private applyScalePowderMark(state: GameState, target: any): void {
        const playerState = state.player as any
        const damage = this.getMarkDamage()

        playerState.scalePowderMarks.set(target, {
            target,
            endTime: Date.now() + this.markDuration,
            damage,
        })
    }

    private getMarkDamage(): number {
        if (!this.charBuild) return 800
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取鳞粉印记触发伤害
        const markField = leveledSkill.字段.find((field) => field.名称.includes("[鳞粉印记]触发伤害"))
        const damageMultiplier = (markField?.值 || 40) / 100

        return baseDamage * damageMultiplier
    }
}

export class SageSkillQ extends SkillBase {
    name = "腐草为萤"
    type = SkillType.CHANNEL
    cooldown = 1
    range = 50
    duration = 5
    tickRate = 1

    private lastTickTime = 0
    private totalTicks = 0
    private lifeDrainPercent = 0.05 // 每秒流失5%最大生命
    private shieldConversionRate = 1.5 // 超限护盾转化比例150%

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        this.lastTickTime = Date.now()
        this.totalTicks = 0

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

            // 消耗生命值
            this.consumeLife(state)

            // 执行射击
            this.performShot(state, state.player.position)

            this.totalTicks++
            this.lastTickTime = now
        }

        return true
    }

    onEnd(_state: GameState): void {
        console.log(`赛琪Q技能结束,共射击 ${this.totalTicks} 次`)
    }

    private performShot(state: GameState, playerPosition: { x: number; y: number }): void {
        if (state.enemies.length === 0) return

        // 使用 checkSkillHit 获取范围内的敌人
        const hitEnemies = CollisionSystem.checkSkillHit(state, playerPosition, this.range!)

        if (hitEnemies.length === 0) return

        // 对范围内的敌人造成伤害
        for (const enemy of hitEnemies) {
            const damage = this.calculateShotDamage(state)
            const element = state.player.charData.属性

            CollisionSystem.applyDamageToEnemies(state, [enemy], [damage], element)
        }
    }

    private calculateShotDamage(state: GameState): number {
        if (!this.charBuild) return 1500
        const baseDamage = this.charBuild.calculateRandomDamage(this.name)
        const leveledSkill = this.getLeveledSkill()

        if (!leveledSkill) return baseDamage

        // 从LeveledSkill获取射击伤害倍率
        const shotField = leveledSkill.字段.find((field) => field.名称.includes("射击伤害"))
        const damageMultiplier = (shotField?.值 || 130) / 100

        // 检查是否超限护盾
        const playerState = state.player as any
        const currentShield = playerState.shield || 0
        const maxShield = playerState.maxShield || 0

        let finalDamage = baseDamage * damageMultiplier

        // 超限护盾转化
        if (currentShield >= maxShield) {
            finalDamage *= 1 + this.shieldConversionRate
        }

        return finalDamage
    }

    private consumeLife(state: GameState): void {
        const playerState = state.player as any
        const maxLife = playerState.maxLife || 1000
        const drainAmount = maxLife * this.lifeDrainPercent

        const currentLife = playerState.life || maxLife
        const newLife = Math.max(0, currentLife - drainAmount)
        playerState.life = newLife
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

// 萤烛微光被动技能
export class SageSkillPassive extends SkillBase {
    name = "萤烛微光"
    type = SkillType.PASSIVE
    cooldown = 0
    range = 0

    private buffDuration = 10000 // 增益效果持续时间（毫秒）
    private baseAttackBonus = 0.079 // 基础攻击提高7.9%
    private basePowerBonus = 0.079 // 基础技能威力提高7.9%
    private baseBackwaterBonus = 0.037 // 基础背水提高3.7%
    private buffBonusPerBuff = 0.012 // 每个增益效果伤害提高1.2%

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }

    initialize(state: GameState, _playerPosition: { x: number; y: number }): void {
        // 初始化增益效果系统
        const playerState = state.player as any
        if (!playerState.activeBuffs) {
            playerState.activeBuffs = []
        }

        // 从LeveledSkill获取基础属性提升
        const leveledSkill = this.getLeveledSkill()
        if (leveledSkill) {
            const attackField = leveledSkill.字段.find((field) => field.名称.includes("攻击提高"))
            this.baseAttackBonus = (attackField?.值 || 7.9) / 100

            const powerField = leveledSkill.字段.find((field) => field.名称.includes("技能威力提高"))
            this.basePowerBonus = (powerField?.值 || 7.9) / 100

            const backwaterField = leveledSkill.字段.find((field) => field.名称.includes("背水提高"))
            this.baseBackwaterBonus = (backwaterField?.值 || 3.7) / 100

            const buffBonusField = leveledSkill.字段.find((field) => field.名称.includes("每个增益效果令造成的伤害提高"))
            this.buffBonusPerBuff = (buffBonusField?.值 || 1.2) / 100
        }
    }

    onCast(_state: GameState, _playerPosition: { x: number; y: number }): void {
        // 被动技能不需要主动施放
    }

    update(_dt: number, _state: GameState): boolean {
        return false // 被动技能不需要持续更新
    }

    // 计算增益效果数量
    calculateBuffCount(state: GameState): number {
        const playerState = state.player as any
        const buffs = playerState.activeBuffs || []
        return buffs.length
    }

    // 计算属性加成
    calculateAttributeBonus(state: GameState): { attack: number; power: number; backwater: number } {
        const buffCount = this.calculateBuffCount(state)

        return {
            attack: this.baseAttackBonus + buffCount * this.buffBonusPerBuff,
            power: this.basePowerBonus + buffCount * this.buffBonusPerBuff,
            backwater: this.baseBackwaterBonus,
        }
    }

    // 检查是否进入[破茧]状态
    checkCocoonBreakState(state: GameState): boolean {
        const playerState = state.player as any
        const buffCount = this.calculateBuffCount(state)

        // 假设3个增益效果进入破茧状态
        if (buffCount >= 3) {
            playerState.inCocoonBreakState = true
            playerState.cocoonBreakEndTime = Date.now() + this.buffDuration
            return true
        }

        return false
    }

    // 检查破茧状态是否过期
    checkCocoonBreakExpired(state: GameState): boolean {
        const playerState = state.player as any
        if (!playerState.inCocoonBreakState) return false

        if (Date.now() > (playerState.cocoonBreakEndTime || 0)) {
            playerState.inCocoonBreakState = false
            return true
        }

        return false
    }
}
