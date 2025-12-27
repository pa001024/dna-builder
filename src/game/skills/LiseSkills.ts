import type { GameState } from "../types"
import { SkillType } from "../systems/SkillSystem"
import { DamageNumberEntity } from "../entities/DamageNumber"
import { CollisionSystem } from "../systems/CollisionSystem"
import { SkillBase } from "./SkillBase"
import { CharBuild } from "../../data"

export class LiseSkillE extends SkillBase {
    name = "快速出击"
    type = SkillType.DASH
    cooldown = 0.5
    range = 100

    constructor(charBuild: CharBuild) {
        super(charBuild)
    }
    initialize(_state: GameState, _playerPosition: { x: number; y: number }): void {}

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        const dx = state.input.mousePosition.x - playerPosition.x
        const dy = state.input.mousePosition.y - playerPosition.y
        const length = Math.hypot(dx, dy)
        const direction = { x: dx / length, y: dy / length }

        ;(this as any).direction = direction
        ;(this as any).startPos = { ...playerPosition }

        this.dealDamage(state, playerPosition)
    }

    update(_dt: number, _state: GameState): boolean {
        return false
    }

    private dealDamage(state: GameState, playerPosition: { x: number; y: number }): void {
        if (!state.enemy) return

        const dist = Math.hypot(state.enemy.position.x - playerPosition.x, state.enemy.position.y - playerPosition.y)

        if (dist < this.range!) {
            const damage = this.calculateDamage()
            const element = state.player.charData.属性

            CollisionSystem.applyDamage(state, damage)
            state.damageNumbers.push(new DamageNumberEntity(state.enemy.position, damage, element))
        }
    }

    private calculateDamage(): number {
        return this.charBuild.calculateRandomDamage(this.name)
    }
}

export class LiseSkillQ extends SkillBase {
    constructor(charBuild: CharBuild) {
        super(charBuild)
        const attrs = charBuild.calculateAttributes()
        this.range = attrs.范围 * 50
    }
    name = "涡旋电场"
    type = SkillType.CHANNEL
    cooldown = 1
    range = 150
    duration = 5
    tickRate = 1

    private lastTickTime = 0
    private totalTicks = 0

    initialize(_state: GameState, _playerPosition: { x: number; y: number }): void {
        this.lastTickTime = Date.now()
        this.totalTicks = 0
    }

    onCast(state: GameState, playerPosition: { x: number; y: number }): void {
        this.dealAoeDamage(state, playerPosition)
        this.totalTicks++
        this.lastTickTime = Date.now()
    }

    update(_dt: number, state: GameState): boolean {
        const now = Date.now()
        const timeSinceLastTick = (now - this.lastTickTime) / 1000

        if (timeSinceLastTick >= this.tickRate!) {
            this.dealAoeDamage(state, state.player.position)
            this.totalTicks++
            this.lastTickTime = now
        }

        return true
    }

    onEnd(_state: GameState): void {
        console.log(`黎瑟Q技能结束,共造成 ${this.totalTicks} 次伤害`)
    }

    private dealAoeDamage(state: GameState, center: { x: number; y: number }): void {
        if (!state.enemy) return

        const dist = Math.hypot(state.enemy.position.x - center.x, state.enemy.position.y - center.y)

        if (dist < this.range!) {
            const damage = this.calculateDamage()
            const element = state.player.charData.属性

            CollisionSystem.applyDamage(state, damage)
            state.damageNumbers.push(new DamageNumberEntity(state.enemy.position, damage, element))
        }
    }

    private calculateDamage(): number {
        if (!this.charBuild) return 3000
        return this.charBuild.calculateRandomDamage(this.name)
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
