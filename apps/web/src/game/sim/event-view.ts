/**
 * `SimEvent[]` → 视图状态（纯数据，不依赖 Three.js，可直接单测）。
 *
 * 视图只做映射：伤害飘字、增益图标、选敌标记、死亡列表；所有数值都来自事件与帧采样，
 * 不在这里重算伤害 / 冷却 / 资源。下标用 buffId / entityId，不含任何角色或技能 id 分支。
 */

import type { BuffApplyEvent, DamageEvent, SimEvent } from "dna-builder-skill-sim/core"

export interface BuffDisplay {
    buffId: string
    label: string
    color: string
    stacks: number
    appliedAt: number
    expiresAt: number
    duration: number
}

export type FloatingAnchor = { kind: "actor" } | { kind: "target"; id: string }

export interface FloatingSpec {
    key: number
    anchor: FloatingAnchor
    text: string
    color: string
}

export interface EventViewOptions {
    buffName?: (buffId: number | string) => string | undefined
    damageColor?: (event: DamageEvent) => string
    /** 选敌标记持续秒数，默认 2 */
    markerDuration?: number
}

export interface EventViewState {
    playerBuffs: BuffDisplay[]
    targetBuffs: Record<string, BuffDisplay[]>
    /** targetId → 失效时刻（模拟秒） */
    markers: Record<string, number>
    damageTotal: number
    perSkill: Record<string, number>
    lastCast?: { skillId: number | string; at: number }
}

const BUFF_COLORS = ["#8b5cf6", "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#ec4899"] as const
const DEFAULT_DAMAGE_COLOR = "#f87171"
const SHIELD_DAMAGE_COLOR = "#60a5fa"
const MARKER_COLOR = "#facc15"
const MARKER_TEXT = "◎"

export class EventView {
    readonly state: EventViewState = {
        playerBuffs: [],
        targetBuffs: {},
        markers: {},
        damageTotal: 0,
        perSkill: {},
    }

    private readonly options: EventViewOptions
    private nextFloatKey = 1
    private deathQueue: string[] = []

    constructor(options: EventViewOptions = {}) {
        this.options = options
    }

    consume(events: readonly SimEvent[]): FloatingSpec[] {
        const floats: FloatingSpec[] = []
        for (const event of events) {
            switch (event.kind) {
                case "damage":
                    this.onDamage(event, floats)
                    break
                case "buff-apply":
                    this.onBuffApply(event, floats)
                    break
                case "buff-expire":
                    this.removeBuff(event.entityKind, event.entityId, event.buffId)
                    break
                case "cast":
                    this.state.lastCast = { skillId: event.skillId, at: event.at }
                    break
                case "target-select":
                    this.onTargetSelect(event.at, event.targetIds, floats)
                    break
                case "death":
                    this.deathQueue.push(event.targetId)
                    delete this.state.targetBuffs[event.targetId]
                    delete this.state.markers[event.targetId]
                    break
                default:
                    break
            }
        }
        return floats
    }

    takeDeaths(): string[] {
        const deaths = this.deathQueue
        this.deathQueue = []
        return deaths
    }

    buffsOf(entityId: string): BuffDisplay[] {
        return this.state.targetBuffs[entityId] ?? []
    }

    activeMarkers(now: number): string[] {
        return Object.entries(this.state.markers)
            .filter(([, expiresAt]) => expiresAt >= now)
            .map(([targetId]) => targetId)
    }

    reset(): void {
        this.state.playerBuffs = []
        this.state.targetBuffs = {}
        this.state.markers = {}
        this.state.damageTotal = 0
        this.state.perSkill = {}
        this.state.lastCast = undefined
        this.deathQueue = []
    }

    private onDamage(event: DamageEvent, floats: FloatingSpec[]): void {
        this.state.damageTotal += event.effective
        this.state.perSkill[event.skillField] = (this.state.perSkill[event.skillField] ?? 0) + event.effective
        if (event.effective <= 0) return
        const color =
            this.options.damageColor?.(event) ?? (event.shieldAbsorb > 0 && event.hpLoss === 0 ? SHIELD_DAMAGE_COLOR : DEFAULT_DAMAGE_COLOR)
        floats.push({
            key: this.nextFloatKey++,
            anchor: { kind: "target", id: event.targetId },
            text: String(Math.floor(event.effective)),
            color,
        })
    }

    private onBuffApply(event: BuffApplyEvent, floats: FloatingSpec[]): void {
        const name = this.options.buffName?.(event.buffId) ?? String(event.buffId)
        const display: BuffDisplay = {
            buffId: String(event.buffId),
            label: name.slice(0, 1),
            color: BUFF_COLORS[hashString(String(event.buffId)) % BUFF_COLORS.length],
            stacks: event.stacks,
            appliedAt: event.at,
            expiresAt: event.expiresAt,
            duration: event.duration,
        }
        if (event.entityKind === "actor") {
            this.state.playerBuffs = upsert(this.state.playerBuffs, display)
            return
        }
        const list = this.state.targetBuffs[event.entityId] ?? []
        this.state.targetBuffs[event.entityId] = upsert(list, display)
        floats.push({ key: this.nextFloatKey++, anchor: { kind: "target", id: event.entityId }, text: display.label, color: display.color })
    }

    private removeBuff(entityKind: "actor" | "target", entityId: string, buffId: number | string): void {
        const key = String(buffId)
        if (entityKind === "actor") {
            this.state.playerBuffs = this.state.playerBuffs.filter(buff => buff.buffId !== key)
            return
        }
        const list = this.state.targetBuffs[entityId]
        if (!list) return
        const remaining = list.filter(buff => buff.buffId !== key)
        if (remaining.length > 0) this.state.targetBuffs[entityId] = remaining
        else delete this.state.targetBuffs[entityId]
    }

    private onTargetSelect(at: number, targetIds: readonly string[], floats: FloatingSpec[]): void {
        const until = at + (this.options.markerDuration ?? 2)
        for (const targetId of targetIds) {
            this.state.markers[targetId] = until
            floats.push({ key: this.nextFloatKey++, anchor: { kind: "target", id: targetId }, text: MARKER_TEXT, color: MARKER_COLOR })
        }
    }
}

function upsert(list: BuffDisplay[], display: BuffDisplay): BuffDisplay[] {
    const index = list.findIndex(buff => buff.buffId === display.buffId)
    if (index < 0) return [...list, display]
    const next = list.slice()
    next[index] = display
    return next
}

function hashString(value: string): number {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}
