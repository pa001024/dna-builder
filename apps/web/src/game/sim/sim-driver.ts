/**
 * 视图 ↔ 模拟的唯一桥：固定步长推进 `Simulation`，把输入映射成 `SkillRuntime.cast` / 通用命令。
 *
 * 约定：
 * - 战斗状态（HP / 护盾 / 资源 / 冷却 / 增益 / 选敌）全部由 core 持有，视图只读 `frames` / `events`；
 * - 视图态（玩家移动、怪物 AI 走位）通过 `move` 命令同步给模拟，不直接改 core 实体；
 * - rAF 的真实 dt 只用于累加目标时间，模拟始终按自己的 `dt` 网格推进（不把可变 dt 灌进战斗）。
 */

import {
    createSimulation,
    type DamageOracle,
    type EnemyConfig,
    type FrameSample,
    type ResourceInit,
    type SimEvent,
    type Simulation,
    TIME_EPS,
    type Vec2,
} from "dna-builder-skill-sim/core"
import {
    type CastResult,
    createSkillRuntime,
    type RecastPolicy,
    type RuntimeDiagnostic,
    type SkillRuntime,
} from "dna-builder-skill-sim/runtime"
import type { SkillBehavior, SkillSlot } from "dna-builder-skill-sim/schema"
import type { CharBuild } from "@/data"
import { CharBuildDamager } from "./char-build-oracle"
import { type CompiledManifest, skillForId, skillForSlot } from "./manifest-loader"

export const DEFAULT_SIM_DT = 1 / 60
/** 单次会话时长：到点后由视图调用 `restart()`（避免 frames / events 无限增长） */
export const DEFAULT_SESSION_SECONDS = 600
const MAX_REAL_DT = 0.25
const MAX_STEPS_PER_ADVANCE = 120
const POSITION_SYNC_INTERVAL = 0.1
const POSITION_EPSILON = 0.05

export interface SimDriverOptions {
    manifest: CompiledManifest
    characterId: number
    charBuild?: CharBuild
    /** 覆盖默认资源池（测试 / 无 CharBuild 时使用） */
    resources?: Record<string, ResourceInit>
    /** 覆盖伤害 oracle（测试） */
    oracle?: DamageOracle
    actorId?: string
    seed?: number
    duration?: number
    dt?: number
    /** 每技能重施策略；缺省 `defaultRecastPolicy`（持续型 toggle-off，瞬时型 fail） */
    recastPolicy?: (skill: SkillBehavior) => RecastPolicy
    /** 视图设置的热更读取器：神智自然回复 */
    regen?: () => { amount: number; interval: number } | undefined
    onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void
}

export interface SimEnemyInit {
    id: string
    level: number
    hp: number
    shield?: number
    def?: number
    resist?: number
    position?: Vec2
    meta?: Record<string, unknown>
}

export interface CastOutcome {
    ok: boolean
    skillId?: number | string
    slot?: SkillSlot
    reason?: string
    message?: string
    /** `toggle-off` 技能再次施放时关闭了已激活实例 */
    toggledOff?: boolean
}

/**
 * 每技能重施策略：有 tick / until 的持续型技能（黎瑟 Q、赛琪 Q）再按关闭，
 * 瞬时技能拒绝重复施放（core 的 `cast` 不会排队）。
 */
export function defaultRecastPolicy(skill: SkillBehavior): RecastPolicy {
    return skill.phases.some(phase => phase.tick !== undefined || phase.until !== undefined) ? "toggle-off" : "fail"
}

export class SimDriver {
    readonly actorId: string
    readonly characterId: number
    readonly duration: number
    readonly seed: number

    private readonly sessionDt: number
    private _simulation: Simulation
    /** 每个技能一个 runtime：重施策略（toggle-off / fail）按技能而非全局生效 */
    private readonly runtimes = new Map<string, SkillRuntime>()
    private readonly oracle?: DamageOracle
    private readonly manifest: CompiledManifest
    private readonly damager?: CharBuildDamager
    private readonly policyFor: (skill: SkillBehavior) => RecastPolicy
    private readonly regen?: () => { amount: number; interval: number } | undefined
    private readonly onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void
    private readonly resourceInit: Record<string, ResourceInit>
    private readonly diagnostics: RuntimeDiagnostic[] = []

    private timeTarget = 0
    private eventCursor = 0
    private lastPositionSync = Number.NEGATIVE_INFINITY
    private pendingActor?: Vec2
    private pendingEnemies: { id: string; position: Vec2 }[] = []

    constructor(options: SimDriverOptions) {
        this.manifest = options.manifest
        this.characterId = options.characterId
        this.actorId = options.actorId ?? `actor:${options.characterId}`
        this.duration = options.duration ?? DEFAULT_SESSION_SECONDS
        this.seed = options.seed ?? 1
        this.regen = options.regen
        this.onDiagnostic = options.onDiagnostic
        this.policyFor = options.recastPolicy ?? defaultRecastPolicy
        this.resourceInit = options.resources ?? defaultResources(options.charBuild)

        if (options.charBuild) {
            this.damager = new CharBuildDamager({
                charBuild: options.charBuild,
                doc: options.manifest.doc,
                onError: (error, request) => {
                    this.report({
                        kind: "unsupported",
                        skillId: request.skillField,
                        at: request.at,
                        severity: "error",
                        message: `CharBuild 结算失败：${error instanceof Error ? error.message : String(error)}`,
                        feature: "damage-oracle-error",
                    })
                },
            })
        }

        this.oracle = options.oracle ?? this.damager?.oracle
        this.sessionDt = options.dt ?? DEFAULT_SIM_DT
        this._simulation = this.createSession()
        this.scheduleRegen(0)
    }

    get simulation(): Simulation {
        return this._simulation
    }

    /** 该技能的运行时（懒创建：策略按技能决定，且未使用的技能不占调度） */
    runtimeFor(skillId: number | string): SkillRuntime | undefined {
        const skill = skillForId(this.manifest, skillId)
        return skill ? this.ensureRuntime(skill) : undefined
    }

    get now(): number {
        return this._simulation.now
    }

    get finished(): boolean {
        return this._simulation.isFinished
    }

    get steps(): number {
        return this._simulation.frames.length
    }

    getDiagnostics(): readonly RuntimeDiagnostic[] {
        return this.diagnostics
    }

    /** 视图态位置：每帧调用；内部按 0.1s / 0.05m 节流成 `move` 命令 */
    syncPositions(actor: Vec2, enemies: readonly { id: string; position: Vec2 }[]): void {
        this.pendingActor = { ...actor }
        this.pendingEnemies = enemies.map(enemy => ({ id: enemy.id, position: { ...enemy.position } }))
    }

    /** 按固定 dt 网格推进到累计目标时间；返回实际调用 `step()` 的次数 */
    advance(realDt: number): number {
        if (this._simulation.isFinished) return 0
        const dt = Number.isFinite(realDt) ? Math.min(Math.max(realDt, 0), MAX_REAL_DT) : 0
        this.timeTarget = Math.min(this.timeTarget + dt, this.duration)

        let steps = 0
        while (!this._simulation.isFinished && this._simulation.now < this.timeTarget - TIME_EPS && steps < MAX_STEPS_PER_ADVANCE) {
            this.flushPositions()
            this._simulation.step()
            this.refreshSkillContext()
            steps++
        }
        return steps
    }

    drainEvents(): SimEvent[] {
        if (this.eventCursor >= this._simulation.events.length) return []
        const events = this._simulation.events.slice(this.eventCursor)
        this.eventCursor = this._simulation.events.length
        return events
    }

    latestFrame(): FrameSample | undefined {
        return this._simulation.frames[this._simulation.frames.length - 1]
    }

    castSlot(slot: SkillSlot): CastOutcome {
        const skill = skillForSlot(this.manifest, this.characterId, slot)
        if (!skill) {
            return {
                ok: false,
                slot,
                reason: "unknown-skill",
                message: `角色 ${this.characterId} 的 ${slot} 技能不在 manifest 中`,
            }
        }
        return this.castSkill(skill)
    }

    castSkill(skillOrId: SkillBehavior | number | string): CastOutcome {
        const skill = typeof skillOrId === "object" ? skillOrId : skillForId(this.manifest, skillOrId)
        const skillId = typeof skillOrId === "object" ? skillOrId.id : skillOrId
        if (!skill) {
            return { ok: false, skillId, reason: "unknown-skill", message: `技能 ${skillId} 不在 manifest 中` }
        }
        this.damager?.setActiveSkill(skill.id)
        const result: CastResult = this.ensureRuntime(skill).cast(skill.id)
        if (!result.ok) return { ok: false, skillId: skill.id, slot: skill.slot, reason: result.reason, message: result.message }
        return { ok: true, skillId: skill.id, slot: skill.slot, toggledOff: result.toggledOff }
    }

    /** 普通攻击 / 射击等通用伤害入口：`skillName` 是 packages/data 的技能（武器）基名 */
    dealDamage(skillName: string, targetIds: readonly string[], field = "伤害"): void {
        if (this._simulation.isFinished) return
        const skillField = `${skillName}::${field}`
        for (const id of targetIds) {
            const target = this._simulation.getTarget(id)
            if (!target?.alive) continue
            this._simulation.schedule(this._simulation.now, {
                kind: "damage",
                actorId: this.actorId,
                skillField,
                tag: "",
                target: { kind: "id", id },
            })
        }
    }

    /** 怪物对玩家的伤害：先扣护盾再扣生命，走 sim 的 resource 命令（UI 从帧采样读取） */
    damagePlayer(amount: number): void {
        if (this._simulation.isFinished || !Number.isFinite(amount) || amount <= 0) return
        const actor = this._simulation.getActor(this.actorId)
        if (!actor) return
        let remaining = amount
        const shield = actor.resources["护盾"]?.current ?? 0
        if (shield > 0) {
            const absorbed = Math.min(shield, remaining)
            this._simulation.schedule(this._simulation.now, {
                kind: "resource",
                actorId: this.actorId,
                resource: "护盾",
                delta: -absorbed,
            })
            remaining -= absorbed
        }
        if (remaining > 0) {
            this._simulation.schedule(this._simulation.now, {
                kind: "resource",
                actorId: this.actorId,
                resource: "生命",
                delta: -remaining,
            })
        }
    }

    spawnEnemy(init: SimEnemyInit): boolean {
        if (this._simulation.isFinished) return false
        if (this._simulation.getTarget(init.id)) return false
        const enemy: EnemyConfig = {
            id: init.id,
            level: init.level,
            hp: init.hp,
            shield: init.shield,
            def: init.def,
            resist: init.resist,
            position: init.position,
            meta: init.meta,
        }
        this._simulation.schedule(this._simulation.now, { kind: "spawn", enemy })
        return true
    }

    despawnEnemy(id: string): void {
        if (this._simulation.isFinished) return
        if (!this._simulation.getTarget(id)?.alive) return
        this._simulation.schedule(this._simulation.now, { kind: "despawn", targetId: id, reason: "view" })
    }

    /** 会话到点后重建：保留当前视图中的敌人（按满状态重新入场） */
    restart(enemies: readonly SimEnemyInit[] = []): void {
        this._simulation = this.createSession()
        this.runtimes.clear()
        this.timeTarget = 0
        this.eventCursor = 0
        this.lastPositionSync = Number.NEGATIVE_INFINITY
        this.scheduleRegen(0)
        for (const enemy of enemies) this.spawnEnemy(enemy)
    }

    private createSession(): Simulation {
        return createSimulation({
            duration: this.duration,
            dt: this.sessionDt,
            seed: this.seed,
            actors: [{ id: this.actorId, characterId: this.characterId, resources: this.resourceInit }],
            enemies: [],
            oracle: this.oracle,
        })
    }

    private ensureRuntime(skill: SkillBehavior): SkillRuntime {
        const key = String(skill.id)
        let runtime = this.runtimes.get(key)
        if (!runtime) {
            runtime = createSkillRuntime({
                simulation: this._simulation,
                doc: this.manifest.doc,
                actorId: this.actorId,
                // 每个技能独立 RNG 子流：同 seed 仍逐位复现，不同技能之间不相关
                rng: this._simulation.rng.fork(`skill-runtime:${this.actorId}:${skill.id}`),
                recastPolicy: this.policyFor(skill),
                onDiagnostic: diagnostic => this.report(diagnostic),
            })
            this.runtimes.set(key, runtime)
        }
        return runtime
    }

    private report(diagnostic: RuntimeDiagnostic): void {
        this.diagnostics.push(diagnostic)
        this.onDiagnostic?.(diagnostic)
    }

    private scheduleRegen(at: number): void {
        const config = this.regen?.()
        if (!config || !(config.interval > 0) || config.amount <= 0) return
        if (at > this._simulation.clock.duration + TIME_EPS) return
        this._simulation.scheduleCallback(at, () => {
            this._simulation.schedule(this._simulation.now, {
                kind: "resource",
                actorId: this.actorId,
                resource: "神智",
                delta: config.amount,
            })
            this.scheduleRegen(at + config.interval)
        })
    }

    private flushPositions(): void {
        if (this._simulation.isFinished) return
        const now = this._simulation.now
        if (now - this.lastPositionSync < POSITION_SYNC_INTERVAL - TIME_EPS) return
        this.lastPositionSync = now
        if (this.pendingActor) {
            this._simulation.schedule(now, { kind: "move", entity: "actor", id: this.actorId, position: { ...this.pendingActor } })
        }
        for (const enemy of this.pendingEnemies) {
            const target = this._simulation.getTarget(enemy.id)
            if (!target?.alive) continue
            if (
                Math.abs(target.position.x - enemy.position.x) < POSITION_EPSILON &&
                Math.abs(target.position.y - enemy.position.y) < POSITION_EPSILON
            ) {
                continue
            }
            this._simulation.schedule(now, { kind: "move", entity: "target", id: enemy.id, position: { ...enemy.position } })
        }
    }

    private refreshSkillContext(): void {
        if (!this.damager) return
        const active = [...this.runtimes.values()].flatMap(runtime => runtime.active())
        if (active.length === 0) return
        const latest = active.reduce((left, right) => (left.castAt >= right.castAt ? left : right))
        this.damager.setActiveSkill(latest.skillId)
    }
}

function defaultResources(charBuild?: CharBuild): Record<string, ResourceInit> {
    const attrs = charBuild?.attrs
    if (!attrs) return {}
    return {
        生命: { max: Math.max(1, attrs.生命), current: attrs.生命 },
        护盾: { max: Math.max(0, attrs.护盾), current: attrs.护盾 },
        神智: { max: Math.max(1, attrs.神智), current: attrs.神智 },
        电能量: { max: 100, current: 0 },
    }
}
