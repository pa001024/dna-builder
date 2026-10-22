import { describe, expect, it } from "vitest"
import { AFK_DROP_GRAVITY, AFK_DROP_MAX_BOUNCES, afkDropsAtRest, createAfkDrop, stepAfkDrop } from "./afk-drop"

describe("掉落贴图物理", () => {
    const spawn = () => createAfkDrop({ key: 1, icon: "a.webp", x: 100, y: 40, size: 20, groundY: 80, random: () => 0.5 })

    it("生成时从爆出点上方起步并带初始速度", () => {
        const drop = spawn()
        expect(drop.x).toBe(90)
        expect(drop.y).toBe(30)
        expect(drop.vy).toBeLessThan(0)
        expect(drop.resting).toBe(false)
    })

    it("落地后弹跳，弹够次数停在地上", () => {
        const drop = spawn()
        let bounces = 0
        let guard = 0
        let lastVy = drop.vy
        while (!drop.resting && guard++ < 1000) {
            stepAfkDrop(drop, 1 / 60, 366)
            if (drop.vy < 0 && lastVy > 0) bounces++
            lastVy = drop.vy
        }
        expect(drop.resting).toBe(true)
        expect(drop.y).toBe(80)
        expect(bounces).toBeGreaterThanOrEqual(1)
        expect(drop.bounces).toBeLessThanOrEqual(AFK_DROP_MAX_BOUNCES)
    })

    it("重力让自由落体的速度按 g 增长", () => {
        const drop = spawn()
        const before = drop.vy
        stepAfkDrop(drop, 0.1, 366)
        expect(drop.vy - before).toBeCloseTo(AFK_DROP_GRAVITY * 0.1, 5)
    })

    it("左右边界把人弹回来，不会飞出画布", () => {
        const drop = spawn()
        drop.x = -5
        drop.vx = -100
        stepAfkDrop(drop, 1 / 60, 366)
        expect(drop.x).toBe(0)
        expect(drop.vx).toBeGreaterThan(0)
    })

    it("全部停住时返回 true", () => {
        const drop = spawn()
        drop.resting = true
        expect(afkDropsAtRest([drop])).toBe(true)
        drop.resting = false
        expect(afkDropsAtRest([drop])).toBe(false)
    })
})
