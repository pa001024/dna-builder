import type { Vector2D, InputState } from "../types"

/**
 * 玩家实体类
 */
export class Player {
    position: Vector2D
    rotation: number
    speed: number
    radius: number

    constructor() {
        this.position = { x: 400, y: 300 }
        this.rotation = 0
        this.speed = 250 // 像素/秒
        this.radius = 20
    }

    /**
     * 更新玩家状态
     */
    update(dt: number, input: InputState) {
        // WASD移动
        const moveDir = { x: 0, y: 0 }
        if (input.keys["w"] || input.keys["W"]) moveDir.y -= 1
        if (input.keys["s"] || input.keys["S"]) moveDir.y += 1
        if (input.keys["a"] || input.keys["A"]) moveDir.x -= 1
        if (input.keys["d"] || input.keys["D"]) moveDir.x += 1

        // 归一化对角移动
        const length = Math.sqrt(moveDir.x ** 2 + moveDir.y ** 2)
        if (length > 0) {
            moveDir.x /= length
            moveDir.y /= length
        }

        this.position.x += moveDir.x * this.speed * dt
        this.position.y += moveDir.y * this.speed * dt

        // 面向鼠标旋转
        const dx = input.mousePosition.x - this.position.x
        const dy = input.mousePosition.y - this.position.y
        this.rotation = Math.atan2(dy, dx)

        // 边界限制
        this.position.x = Math.max(this.radius, Math.min(800 - this.radius, this.position.x))
        this.position.y = Math.max(this.radius, Math.min(600 - this.radius, this.position.y))
    }

    /**
     * 绘制玩家
     */
    draw(ctx: CanvasRenderingContext2D, element: string = "物理") {
        ctx.save()
        ctx.translate(this.position.x, this.position.y)
        ctx.rotate(this.rotation)

        // 获取元素颜色
        const color = this.getElementColor(element)

        // 绘制玩家主体(圆形)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
        ctx.fill()

        // 绘制边框
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 2
        ctx.stroke()

        // 绘制方向指示器
        ctx.fillStyle = "#ffffff"
        ctx.beginPath()
        ctx.moveTo(this.radius, 0)
        ctx.lineTo(-5, -5)
        ctx.lineTo(-5, 5)
        ctx.closePath()
        ctx.fill()

        ctx.restore()
    }

    /**
     * 获取元素对应的颜色
     */
    private getElementColor(element: string): string {
        const colorMap: Record<string, string> = {
            光: "#ffff00", // 黄色
            暗: "#808080", // 灰色
            水: "#0000ff", // 蓝色
            火: "#ff0000", // 红色
            雷: "#800080", // 紫色
            风: "#00ff00", // 绿色
        }
        return colorMap[element] || "#ffffff"
    }
}
