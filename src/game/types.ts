import { CharAttr } from "../data"
import type { Char, Weapon, Skill, Monster } from "../data/data-types"

/**
 * 2D向量类型
 */
export interface Vector2D {
    x: number
    y: number
}

/**
 * 输入状态
 */
export interface InputState {
    keys: Record<string, boolean>
    mousePosition: Vector2D
    isMouseDown: {
        left: boolean
        right: boolean
    }
}

/**
 * 玩家状态
 */
export interface PlayerState {
    position: Vector2D
    rotation: number
    speed: number
    radius: number

    // 角色数据
    charData: Char
    meleeWeapon: Weapon
    rangedWeapon: Weapon
    skills: Skill[]

    // 技能冷却(秒)
    cooldowns: {
        e: number
        q: number
    }

    // 最后使用时间
    lastMeleeAttack: number
    lastRangedAttack: number
    lastSkillE: number
    lastSkillQ: number

    // 神智系统
    sanity?: number
    maxSanity?: number
    sanityRegenRate?: number // 每秒神智回复量
    lastSanityRegenTime?: number // 上次神智回复时间

    // 冲刺状态
    isDashing?: boolean
    dashDirection?: Vector2D
    dashDistance?: number
    dashSpeed?: number
    dashDistanceTraveled?: number
    dashDamage?: number
    dashElement?: string
    dashHitEnemies?: Set<any> // 本次冲刺已命中的敌人
}

/**
 * 敌人状态
 */
export interface EnemyState {
    position: Vector2D
    rotation: number
    radius: number
    data: Monster
    level: number
    currentHealth: number
    maxHealth: number
    currentShield: number
    maxShield: number
    isDead?: boolean // 是否死亡
    deathTime?: number // 死亡时间
    deathAnimationDuration?: number // 死亡动画持续时间（毫秒）
}

/**
 * 多敌人配置
 */
export interface EnemySpawnConfig {
    mobId: number
    level: number
    count: number
}

/**
 * 投射物
 */
export interface Projectile {
    position: Vector2D
    velocity: Vector2D
    damage: number
    element: string
    radius: number
    isPlayerOwned: boolean
    markedForDeletion: boolean
}

/**
 * 伤害数字
 */
export interface DamageNumber {
    position: Vector2D
    value: number
    element: string
    lifetime: number
    age: number
    velocity: Vector2D
}

/**
 * 游戏状态
 */
export interface GameState {
    player: PlayerState
    attrs: CharAttr
    enemies: EnemyState[]
    projectiles: Projectile[]
    damageNumbers: DamageNumber[]
    input: InputState
    isPaused: boolean
    isInitialized: boolean
}
