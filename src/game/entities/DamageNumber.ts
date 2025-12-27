import type { Vector2D } from "../types"

/**
 * 伤害数字实体类
 */
export class DamageNumberEntity {
    position: Vector2D
    value: number
    element: string
    lifetime: number
    age: number
    velocity: Vector2D

    constructor(position: Vector2D, value: number, element: string) {
        this.position = { ...position }
        this.value = Math.round(value)
        this.element = element
        this.lifetime = 1.0 // 秒
        this.age = 0
        // 向上飘动并随机横向偏移
        this.velocity = {
            x: (Math.random() - 0.5) * 50,
            y: -100,
        }
    }

    /**
     * 更新伤害数字
     * @returns 是否存活(未过期)
     */
    update(dt: number): boolean {
        this.age += dt
        this.position.x += this.velocity.x * dt
        this.position.y += this.velocity.y * dt
        return this.age < this.lifetime
    }

    /**
     * 绘制伤害数字
     */
    draw(ctx: CanvasRenderingContext2D) {
        const alpha = 1 - this.age / this.lifetime
        const scale = 1 + (this.age / this.lifetime) * 0.3

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(this.position.x, this.position.y)
        ctx.scale(scale, scale)

        // 绘制阴影
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
        ctx.font = "bold 20px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(this.value.toString(), 2, 2)

        // 绘制伤害数字
        ctx.fillStyle = this.getDamageColor()
        ctx.font = "bold 20px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(this.value.toString(), 0, 0)

        ctx.restore()
    }

    /**
     * 获取伤害颜色
     */
    private getDamageColor(): string {
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
