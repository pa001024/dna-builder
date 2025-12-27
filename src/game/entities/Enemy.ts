import type { Vector2D } from "../types"
import type { LeveledMonster } from "../../data"

/**
 * 敌人实体类
 */
export class Enemy {
    position: Vector2D
    rotation: number
    radius: number
    currentHealth: number
    maxHealth: number
    currentShield: number
    maxShield: number

    constructor(
        public data: LeveledMonster,
        position: Vector2D,
        currentHealth?: number,
        currentShield?: number,
    ) {
        this.position = { ...position }
        this.rotation = 0
        this.radius = 30

        this.maxHealth = data.生命
        this.currentHealth = currentHealth ?? data.生命
        this.maxShield = data.护盾 || 0
        this.currentShield = currentShield ?? (data.护盾 || 0)
    }

    clone(position?: Vector2D) {
        return new Enemy(this.data, position || this.position, this.currentHealth, this.currentShield)
    }

    /**
     * 受到伤害
     * @returns 敌人是否死亡
     */
    takeDamage(damage: number): boolean {
        // 护盾优先承受伤害
        if (this.currentShield > 0) {
            const shieldDamage = Math.min(this.currentShield, damage)
            this.currentShield -= shieldDamage
            damage -= shieldDamage
        }

        this.currentHealth = Math.max(0, this.currentHealth - damage)
        return this.currentHealth === 0
    }

    /**
     * 绘制敌人
     */
    draw(ctx: CanvasRenderingContext2D, isDead?: boolean, deathTime?: number, deathAnimationDuration?: number) {
        ctx.save()
        ctx.translate(this.position.x, this.position.y)

        // 死亡动画效果
        if (isDead && deathTime && deathAnimationDuration) {
            const now = Date.now()
            const elapsed = now - deathTime
            const progress = Math.min(1, elapsed / deathAnimationDuration)

            // 淡出效果
            ctx.globalAlpha = 1 - progress

            // 缩小效果
            const scale = 1 - progress * 0.5
            ctx.scale(scale, scale)

            // 向下移动效果
            ctx.translate(0, progress * 20)

            // 旋转效果
            ctx.rotate(progress * Math.PI)
        }

        // 绘制护盾指示器
        if (this.currentShield > 0 && !isDead) {
            ctx.strokeStyle = "#3b82f6"
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2)
            ctx.stroke()
        }

        // 绘制敌人主体(红色圆形)
        ctx.fillStyle = isDead ? "#991b1b" : "#ef4444"
        ctx.beginPath()
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
        ctx.fill()

        // 绘制边框
        ctx.strokeStyle = isDead ? "#450a0a" : "#7f1d1d"
        ctx.lineWidth = 2
        ctx.stroke()

        // 绘制敌人名称
        ctx.fillStyle = "#ffffff"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(this.data.名称, 0, -this.radius - 25)

        // 绘制血条背景
        const barWidth = 60
        const barHeight = 8
        const barY = -this.radius - 15

        if (!isDead) {
            ctx.fillStyle = "#1f2937"
            ctx.fillRect(-barWidth / 2, barY, barWidth, barHeight)

            // 绘制护盾条
            if (this.maxShield > 0) {
                const shieldPercent = this.currentShield / this.maxShield
                ctx.fillStyle = "#3b82f6"
                ctx.fillRect(-barWidth / 2, barY, barWidth * shieldPercent, barHeight)
            }

            // 绘制血条
            const healthPercent = this.currentHealth / this.maxHealth
            ctx.fillStyle = healthPercent > 0.3 ? "#10b981" : "#ef4444"
            ctx.fillRect(-barWidth / 2, barY, barWidth * healthPercent, barHeight)
        }

        ctx.restore()
    }
}
