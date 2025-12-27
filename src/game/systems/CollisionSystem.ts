import type { GameState, EnemyState } from "../types"
import { Enemy } from "../entities/Enemy"
import { DamageNumberEntity } from "../entities/DamageNumber"
import { DPSMeter } from "./DPSMeter"
import { LeveledMonster } from "../../data"

/**
 * 碰撞检测系统
 */
export class CollisionSystem {
    /**
     * 检测所有碰撞
     */
    static checkCollisions(state: GameState) {
        const { enemies, projectiles } = state

        if (!enemies.length) return

        for (const enemy of enemies) {
            // 跳过已死亡的敌人
            if (enemy.isDead) continue

            // 投射物与敌人碰撞检测
            projectiles.forEach((proj) => {
                if (!proj.isPlayerOwned || proj.markedForDeletion) return

                const dist = Math.hypot(proj.position.x - enemy.position.x, proj.position.y - enemy.position.y)

                if (dist < proj.radius + enemy.radius) {
                    // 碰撞发生
                    const isDead = this.applyDamage(state, proj.damage)

                    // 创建伤害数字
                    state.damageNumbers.push(new DamageNumberEntity(enemy.position, proj.damage, proj.element))

                    // 标记投射物为待删除
                    proj.markedForDeletion = true

                    // 如果敌人死亡,可以选择重新生成
                    if (isDead) {
                        // 暂时不处理死亡,因为是伤害模拟程序
                        // 可以选择重置敌人血量
                    }
                }
            })
        }
        // 移除已标记的投射物
        state.projectiles = state.projectiles.filter((p) => !p.markedForDeletion)
    }

    /**
     * 应用伤害到敌人
     * @returns 被命中的敌人列表
     */
    static applyDamage(state: GameState, damage: number): EnemyState[] {
        if (state.enemies.length === 0) return []

        const hitEnemies: EnemyState[] = []

        // 对每个敌人应用伤害
        for (const enemyState of state.enemies) {
            // 记录伤害到DPS统计
            DPSMeter.recordDamage(damage)

            // 创建临时的Enemy对象来使用takeDamage方法
            const enemy = new Enemy(new LeveledMonster(enemyState.data.id, enemyState.level), enemyState.position)
            enemy.currentHealth = enemyState.currentHealth
            enemy.currentShield = enemyState.currentShield

            enemy.takeDamage(damage)

            // 更新状态
            enemyState.currentHealth = enemy.currentHealth
            enemyState.currentShield = enemy.currentShield

            hitEnemies.push(enemyState)
        }

        return hitEnemies
    }

    /**
     * 应用伤害到指定的敌人列表
     * @param state 游戏状态
     * @param enemies 敌人列表
     * @param damages 伤害数组，每个敌人对应一个伤害值
     * @param element 元素类型（可选）
     * @returns 被命中的敌人列表
     */
    static applyDamageToEnemies(state: GameState, enemies: EnemyState[], damages: number[], element?: string): EnemyState[] {
        if (enemies.length === 0) return []

        const hitEnemies: EnemyState[] = []

        // 对指定的敌人应用伤害
        for (const [index, enemyState] of enemies.entries()) {
            // 跳过已死亡的敌人
            if (enemyState.isDead) continue

            const damage = damages[index] || 0

            // 记录伤害到DPS统计
            DPSMeter.recordDamage(damage)

            // 创建临时的Enemy对象来使用takeDamage方法
            const enemy = new Enemy(new LeveledMonster(enemyState.data.id, enemyState.level), enemyState.position)
            enemy.currentHealth = enemyState.currentHealth
            enemy.currentShield = enemyState.currentShield

            const isDead = enemy.takeDamage(damage)

            // 更新状态
            enemyState.currentHealth = enemy.currentHealth
            enemyState.currentShield = enemy.currentShield

            // 如果敌人死亡，设置死亡状态
            if (isDead) {
                enemyState.isDead = true
                enemyState.deathTime = Date.now()
                enemyState.deathAnimationDuration = 1000 // 1秒死亡动画
            }

            // 创建伤害数字（如果提供了元素类型）
            if (element) {
                // 添加随机偏移避免伤害数字重叠
                const offset = {
                    x: enemyState.position.x + (Math.random() - 0.5) * 30,
                    y: enemyState.position.y + (Math.random() - 0.5) * 30,
                }
                state.damageNumbers.push(new DamageNumberEntity(offset, damage, element))
            }

            hitEnemies.push(enemyState)
        }

        return hitEnemies
    }

    /**
     * 检测近战攻击范围内的敌人
     * @returns 在攻击范围内的敌人列表
     */
    static checkMeleeHit(state: GameState, attackPosition: { x: number; y: number }, attackRange: number): EnemyState[] {
        if (state.enemies.length === 0) return []

        const hitEnemies: EnemyState[] = []

        for (const enemy of state.enemies) {
            // 跳过已死亡的敌人
            if (enemy.isDead) continue

            const dist = Math.hypot(attackPosition.x - enemy.position.x, attackPosition.y - enemy.position.y)

            if (dist < attackRange + enemy.radius) {
                hitEnemies.push(enemy)
            }
        }

        return hitEnemies
    }

    /**
     * 检测技能范围内的敌人
     * @returns 在技能范围内的敌人列表
     */
    static checkSkillHit(state: GameState, skillCenter: { x: number; y: number }, skillRadius: number): EnemyState[] {
        if (state.enemies.length === 0) return []

        const hitEnemies: EnemyState[] = []

        for (const enemy of state.enemies) {
            // 跳过已死亡的敌人
            if (enemy.isDead) continue

            const dist = Math.hypot(skillCenter.x - enemy.position.x, skillCenter.y - enemy.position.y)

            if (dist < skillRadius * 50) {
                hitEnemies.push(enemy)
            }
        }

        return hitEnemies
    }
}
