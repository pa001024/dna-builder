import type { Vector2D } from "../types"

/**
 * 投射物实体类
 */
export class ProjectileEntity {
    position: Vector2D
    velocity: Vector2D
    damage: number
    element: string
    radius: number
    isPlayerOwned: boolean
    markedForDeletion: boolean

    constructor(position: Vector2D, direction: Vector2D, speed: number, damage: number, element: string, isPlayerOwned: boolean = true) {
        this.position = { ...position }
        this.velocity = {
            x: direction.x * speed,
            y: direction.y * speed,
        }
        this.damage = damage
        this.element = element
        this.radius = 5
        this.isPlayerOwned = isPlayerOwned
        this.markedForDeletion = false
    }

    /**
     * 更新投射物位置
     * @returns 是否越界(需要删除)
     */
    update(dt: number, canvasWidth: number, canvasHeight: number): boolean {
        this.position.x += this.velocity.x * dt
        this.position.y += this.velocity.y * dt

        // 检查是否越界
        return this.position.x < -50 || this.position.x > canvasWidth + 50 || this.position.y < -50 || this.position.y > canvasHeight + 50
    }

    /**
     * 绘制投射物
     */
    draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = this.getDamageColor()
        ctx.beginPath()
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2)
        ctx.fill()

        // 绘制发光效果
        ctx.shadowColor = this.getDamageColor()
        ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
    }

    /**
     * 获取伤害颜色
     */
    getDamageColor(): string {
        const colorMap: Record<string, string> = {
            光: "#ffff00", // 黄色
            暗: "#808080", // 灰色
            水: "#0000ff", // 蓝色
            火: "#ff0000", // 红色
            雷: "#800080", // 紫色
            风: "#00ff00", // 绿色
        }
        return colorMap[this.element] || "#ffffff"
    }
}
