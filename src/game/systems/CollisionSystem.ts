import type { GameState } from "../types"
import { Enemy } from "../entities/Enemy"
import { DamageNumberEntity } from "../entities/DamageNumber"
import { DPSMeter } from "./DPSMeter"

/**
 * 碰撞检测系统
 */
export class CollisionSystem {
    /**
     * 检测所有碰撞
     */
    static checkCollisions(state: GameState) {
        const { enemy, projectiles } = state

        if (!enemy) return

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

        // 移除已标记的投射物
        state.projectiles = state.projectiles.filter((p) => !p.markedForDeletion)
    }

    /**
     * 应用伤害到敌人
     * @returns 敌人是否死亡
     */
    static applyDamage(state: GameState, damage: number): boolean {
        if (!state.enemy) return false

        // 记录伤害到DPS统计
        DPSMeter.recordDamage(damage)

        // 创建临时的Enemy对象来使用takeDamage方法
        const enemy = new Enemy(state.enemy.data, state.enemy.position)
        enemy.currentHealth = state.enemy.currentHealth
        enemy.currentShield = state.enemy.currentShield

        const isDead = enemy.takeDamage(damage)

        // 更新状态
        state.enemy.currentHealth = enemy.currentHealth
        state.enemy.currentShield = enemy.currentShield

        return isDead
    }

    /**
     * 检测近战攻击范围内的敌人
     */
    static checkMeleeHit(state: GameState, attackPosition: { x: number; y: number }, attackRange: number): boolean {
        if (!state.enemy) return false

        const dist = Math.hypot(attackPosition.x - state.enemy.position.x, attackPosition.y - state.enemy.position.y)

        return dist < attackRange + state.enemy.radius
    }

    /**
     * 检测技能范围内的敌人
     */
    static checkSkillHit(state: GameState, skillCenter: { x: number; y: number }, skillRadius: number): boolean {
        if (!state.enemy) return false

        const dist = Math.hypot(skillCenter.x - state.enemy.position.x, skillCenter.y - state.enemy.position.y)

        return dist < skillRadius
    }
}
