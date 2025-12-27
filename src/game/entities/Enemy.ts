import type { Vector2D } from "../types"
import type { Monster } from "../../data/data-types"

/**
 * 敌人实体类
 */
export class Enemy {
    position: Vector2D
    rotation: number
    radius: number
    data: Monster
    currentHealth: number
    maxHealth: number
    currentShield: number
    maxShield: number

    constructor(data: Monster, position: Vector2D) {
        this.data = data
        this.position = { ...position }
        this.rotation = 0
        this.radius = 30

        this.maxHealth = data.生命
        this.currentHealth = data.生命
        this.maxShield = data.护盾 || 0
        this.currentShield = data.护盾 || 0
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
    draw(ctx: CanvasRenderingContext2D) {
        ctx.save()
        ctx.translate(this.position.x, this.position.y)

        // 绘制护盾指示器
        if (this.currentShield > 0) {
            ctx.strokeStyle = "#3b82f6"
            ctx.lineWidth = 3
            ctx.beginPath()
            ctx.arc(0, 0, this.radius + 5, 0, Math.PI * 2)
            ctx.stroke()
        }

        // 绘制敌人主体(红色圆形)
        ctx.fillStyle = "#ef4444"
        ctx.beginPath()
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
        ctx.fill()

        // 绘制边框
        ctx.strokeStyle = "#7f1d1d"
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

        ctx.restore()
    }
}
