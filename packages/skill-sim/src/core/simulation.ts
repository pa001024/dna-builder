/**
 * 确定性无头模拟内核。
 *
 * 输入是通用命令序列（`SimCommand`），输出是事件流 `SimEvent[]` + 逐帧采样 `FrameSample[]`
 * + 汇总 `SimSummary`。时间推进规则见 `clock.ts`：网格采样 ∪ 事件边界插入。
 *
 * 不解释技能 IR（U5）、不做渲染（U6）、不重算 CharBuild（数值经 `DamageOracle` 注入）。
 */

import type { ApplyBuffOutcome } from "./buffs"
import { applyBuffInstance, removeBuffInstance } from "./buffs"
import { EventQueue, SimClock, sameTime, TIME_EPS } from "./clock"
import type { DamageOracle } from "./oracle"
import { MissingDamageOracle, snapshotActor, snapshotTarget } from "./oracle"
import type { Rng } from "./rng"
import { createRng } from "./rng"
import type { TargetingContext } from "./targeting"
import { resolveTargetRef, selectTargets } from "./targeting"
import type {
    ActorConfig,
    ActorState,
    ApplyBuffCommand,
    BuffHolder,
    BuffPolicy,
    DamageCommand,
    EnemyConfig,
    EntityKind,
    EntityRef,
    FrameSample,
    RemoveBuffCommand,
    ResourcePool,
    SelectTargetsCommand,
    SimCommand,
    SimConfig,
    SimEvent,
    SimResult,
    SimSummary,
    TargetState,
} from "./types"
import { DEFAULT_BUFF_POLICY } from "./types"

export const DEFAULT_DT = 1 / 60

export function createSimulation(config: SimConfig): Simulation {
    return new Simulation(config)
}

export class Simulation {
    readonly config: SimConfig
    readonly clock: SimClock
    readonly rng: Rng
    readonly actors: ActorState[] = []
    readonly targets: TargetState[] = []
    readonly events: SimEvent[] = []
    readonly frames: FrameSample[] = []

    private readonly queue = new EventQueue<() => void>()
    private readonly actorIndex = new Map<string, ActorState>()
    private readonly targetIndex = new Map<string, TargetState>()
    private readonly stores = new Map<string, string[]>()
    private readonly oracle: DamageOracle
    private readonly buffPolicies: Record<string, BuffPolicy>
    private readonly maxStacks: Record<string, number>
    /** 配置在构造时快照：运行期修改入参对象不影响已开始的模拟 */
    private readonly duration: number
    private readonly primaryTargetId: string | undefined

    private nextEventSeq = 0
    private nextBuffInstanceId = 1
    private started = false
    private finished = false

    private readonly frameDamageByActor = new Map<string, number>()
    private readonly frameDamageByTarget = new Map<string, number>()
    private damageTotal = 0
    private damageEventCount = 0
    private readonly damageBySkill = new Map<string, number>()
    private readonly damageByActor = new Map<string, number>()
    private readonly damageByTarget = new Map<string, number>()

    constructor(config: SimConfig) {
        validateConfig(config)
        this.config = config
        this.duration = config.duration
        this.primaryTargetId = config.primaryTargetId
        this.clock = new SimClock(config.duration, config.dt ?? DEFAULT_DT)
        this.rng = createRng(config.seed)
        this.oracle = config.oracle ?? new MissingDamageOracle()
        this.buffPolicies = config.buffPolicies ?? {}
        this.maxStacks = config.maxStacks ?? {}

        for (const actorConfig of config.actors) this.addActor(actorConfig)
        for (const enemyConfig of config.enemies ?? []) this.addTarget(enemyConfig)

        for (const step of config.rotation ?? []) {
            const commands = Array.isArray(step.command) ? step.command : [step.command]
            for (const command of commands) this.schedule(step.at, command)
        }
    }

    get now(): number {
        return this.clock.now
    }

    get isFinished(): boolean {
        return this.finished
    }

    getActor(id: string): ActorState | undefined {
        return this.actorIndex.get(id)
    }

    getTarget(id: string): TargetState | undefined {
        return this.targetIndex.get(id)
    }

    getStoredTargets(store: string): readonly string[] {
        return this.stores.get(store) ?? []
    }

    /** 调度一条命令；`at` 超出 [0, duration] 直接报错（内部 buff 到期不受此限） */
    schedule(at: number, command: SimCommand): void {
        if (this.finished) throw new Error(`模拟已结束，不能再调度命令（at=${at}）`)
        if (!Number.isFinite(at) || at < 0) throw new Error(`命令时刻非法：${at}`)
        if (at > this.clock.duration + TIME_EPS) {
            throw new Error(`命令时刻 ${at} 超出模拟时长 ${this.clock.duration}`)
        }
        if (at < this.clock.now - TIME_EPS) {
            throw new Error(`命令时刻 ${at} 早于当前时钟 ${this.clock.now}`)
        }
        this.queue.push(at, () => this.execute(command))
    }

    scheduleCommands(at: number, commands: readonly SimCommand[]): void {
        for (const command of commands) this.schedule(at, command)
    }

    /**
     * 在精确时刻执行回调（U5 additive 扩展）。
     *
     * 与 `schedule` 走同一事件队列与时间校验，因此回调在 `drainAt` 内执行：**先于该时刻的帧采样**，
     * 回调内 `schedule` 的命令同刻立即执行。U5 用它做「执行时刻求值」的条件相位与分支。
     */
    scheduleCallback(at: number, callback: () => void, priority = 0): void {
        if (this.finished) throw new Error(`模拟已结束，不能再调度回调（at=${at}）`)
        if (!Number.isFinite(at) || at < 0) throw new Error(`回调时刻非法：${at}`)
        if (at > this.clock.duration + TIME_EPS) {
            throw new Error(`回调时刻 ${at} 超出模拟时长 ${this.clock.duration}`)
        }
        if (at < this.clock.now - TIME_EPS) {
            throw new Error(`回调时刻 ${at} 早于当前时钟 ${this.clock.now}`)
        }
        this.queue.push(at, callback, priority)
    }

    /** 单步推进（暂停 = 停止调用；返回是否还有后续步） */
    step(): boolean {
        if (this.finished) return false
        if (!this.started) {
            this.started = true
            this.clock.advanceTo(0)
            this.drainAt(0)
            this.recordFrame(0)
            return !this.finished
        }

        const grid = this.clock.peekGridTime()
        const nextEvent = this.queue.peekTime()
        const rawNext = Math.min(grid, nextEvent)

        if (!Number.isFinite(rawNext) || rawNext > this.clock.duration + TIME_EPS) {
            this.clock.advanceTo(this.clock.duration)
            this.drainAt(this.clock.duration)
            this.recordFrame(this.clock.duration)
            this.finished = true
            return false
        }

        // 网格点由 index * dt 计算，可能比 duration 多出 1e-14；收口到 duration 避免末帧漂移
        const next = sameTime(rawNext, this.clock.duration) ? this.clock.duration : rawNext
        if (sameTime(next, grid)) this.clock.consumeGrid()
        this.clock.advanceTo(next)
        this.drainAt(next)
        this.recordFrame(next)

        if (sameTime(this.clock.now, this.clock.duration) && this.queue.peekTime() > this.clock.duration + TIME_EPS) {
            this.finished = true
        }
        return !this.finished
    }

    run(): SimResult {
        while (!this.finished) this.step()
        return this.result()
    }

    result(): SimResult {
        const duration = this.duration
        const summary: SimSummary = {
            duration,
            totalDamage: this.damageTotal,
            dps: duration > 0 ? this.damageTotal / duration : 0,
            perSkill: mapToRecord(this.damageBySkill),
            perActor: mapToRecord(this.damageByActor),
            perTarget: mapToRecord(this.damageByTarget),
            damageEvents: this.damageEventCount,
            events: this.events.length,
            frames: this.frames.length,
        }
        return {
            seed: this.rng.seed,
            duration,
            dt: this.clock.dt,
            frames: this.frames.slice(),
            events: this.events.slice(),
            summary,
        }
    }

    // ------------------------------------------------------------------
    // 实体
    // ------------------------------------------------------------------

    private addActor(config: ActorConfig): void {
        if (this.actorIndex.has(config.id)) throw new Error(`重复的 actor id：${config.id}`)
        const resources: Record<string, ResourcePool> = {}
        for (const [key, init] of Object.entries(config.resources ?? {})) {
            resources[key] = { current: clamp(init.current ?? init.max, 0, init.max), max: init.max }
        }
        const cooldowns: Record<string, number> = {}
        for (const [key, remaining] of Object.entries(config.cooldowns ?? {})) cooldowns[key] = Math.max(0, remaining)
        const actor: ActorState = {
            id: config.id,
            characterId: config.characterId,
            team: config.team ?? "ally",
            position: { ...(config.position ?? { x: 0, y: 0 }) },
            resources,
            cooldowns,
            buffs: [],
            alive: true,
            meta: config.meta,
        }
        this.actors.push(actor)
        this.actorIndex.set(actor.id, actor)
    }

    private addTarget(config: EnemyConfig, allowRename = false): TargetState {
        let id = config.id
        if (this.targetIndex.has(id)) {
            if (!allowRename) throw new Error(`重复的 enemy id：${id}`)
            let suffix = 2
            while (this.targetIndex.has(`${config.id}#${suffix}`)) suffix++
            id = `${config.id}#${suffix}`
        }
        const target: TargetState = {
            id,
            level: config.level ?? 1,
            hp: Math.max(0, config.hp),
            maxHp: Math.max(0, config.hp),
            shield: Math.max(0, config.shield ?? 0),
            def: config.def ?? 0,
            resist: config.resist ?? 0,
            position: { ...(config.position ?? { x: 0, y: 0 }) },
            buffs: [],
            alive: config.hp > 0,
            meta: config.meta,
        }
        this.targets.push(target)
        this.targetIndex.set(target.id, target)
        return target
    }

    private ctx(actor: ActorState): TargetingContext<TargetState> {
        return {
            actor,
            targets: this.targets,
            primaryTargetId: this.primaryTargetId,
            stored: this.stores,
        }
    }

    private resolveEntity(ref: EntityRef, actor: ActorState): { kind: EntityKind; holder: BuffHolder; id: string } | undefined {
        if (ref.kind === "self") return { kind: "actor", holder: actor, id: actor.id }
        if (ref.kind === "actor") {
            const target = this.actorIndex.get(ref.id)
            return target ? { kind: "actor", holder: target, id: target.id } : undefined
        }
        const [target] = resolveTargetRef(ref, this.ctx(actor))
        return target ? { kind: "target", holder: target, id: target.id } : undefined
    }

    // ------------------------------------------------------------------
    // 调度
    // ------------------------------------------------------------------

    private drainAt(time: number): void {
        while (true) {
            const entry = this.queue.peek()
            if (!entry || entry.at > time + TIME_EPS) break
            this.queue.pop()
            entry.payload()
        }
    }

    private emit(event: SimEvent): void {
        this.events.push(event)
    }

    private emitBase(): { at: number; seq: number } {
        return { at: this.clock.now, seq: this.nextEventSeq++ }
    }

    private scheduleBuffExpiry(entityKind: EntityKind, holder: BuffHolder, entityId: string, instanceId: number, expiresAt: number): void {
        if (!Number.isFinite(expiresAt)) return
        // 同刻用户命令（refresh）优先于内部到期，避免“到期后再刷新”的瞬断
        this.queue.push(expiresAt, () => this.onBuffExpiry(entityKind, holder, entityId, instanceId, expiresAt), 1)
    }

    private onBuffExpiry(entityKind: EntityKind, holder: BuffHolder, entityId: string, instanceId: number, expiresAt: number): void {
        const index = holder.buffs.findIndex(buff => buff.instanceId === instanceId)
        if (index < 0) return
        const instance = holder.buffs[index]
        // 刷新后旧定时器过期：expiresAt 已变化，忽略
        if (!sameTime(instance.expiresAt, expiresAt)) return
        holder.buffs.splice(index, 1)
        this.emit({
            ...this.emitBase(),
            kind: "buff-expire",
            entityKind,
            entityId,
            buffId: instance.buffId,
            instanceId: instance.instanceId,
            stacks: instance.stacks,
            reason: "expired",
        })
    }

    /** 死亡 / 移除时清空 buff，并补发 expire 事件，保证 apply / expire 成对 */
    private clearBuffs(entityKind: EntityKind, holder: BuffHolder, entityId: string): void {
        if (holder.buffs.length === 0) return
        const removed = holder.buffs.splice(0, holder.buffs.length)
        for (const instance of removed) {
            this.emit({
                ...this.emitBase(),
                kind: "buff-expire",
                entityKind,
                entityId,
                buffId: instance.buffId,
                instanceId: instance.instanceId,
                stacks: instance.stacks,
                reason: "removed",
            })
        }
    }

    // ------------------------------------------------------------------
    // 命令执行
    // ------------------------------------------------------------------

    private execute(command: SimCommand): void {
        switch (command.kind) {
            case "damage":
                this.executeDamage(command)
                break
            case "applyBuff":
                this.executeApplyBuff(command)
                break
            case "removeBuff":
                this.executeRemoveBuff(command)
                break
            case "resource":
                this.executeResource(command.actorId, command.resource, command.delta)
                break
            case "selectTargets":
                this.executeSelectTargets(command)
                break
            case "spawn": {
                const target = this.addTarget(command.enemy, true)
                this.emit({ ...this.emitBase(), kind: "spawn", targetId: target.id })
                break
            }
            case "despawn": {
                const target = this.targetIndex.get(command.targetId)
                if (!target?.alive) break
                target.alive = false
                target.hp = 0
                this.emit({
                    ...this.emitBase(),
                    kind: "despawn",
                    targetId: target.id,
                    reason: command.reason ?? "despawn",
                })
                this.clearBuffs("target", target, target.id)
                break
            }
            case "move": {
                const entity = command.entity === "actor" ? this.actorIndex.get(command.id) : this.targetIndex.get(command.id)
                if (!entity) break
                entity.position = { ...command.position }
                this.emit({
                    ...this.emitBase(),
                    kind: "move",
                    entityKind: command.entity,
                    entityId: command.id,
                    position: { ...command.position },
                })
                break
            }
            case "cast":
                this.executeCast(command.actorId, command.skillId, command.cooldown ?? 0, command.costs ?? [])
                break
        }
    }

    private executeDamage(command: DamageCommand): void {
        const actor = this.actorIndex.get(command.actorId)
        if (!actor?.alive) return
        const targets = resolveTargetRef(command.target, this.ctx(actor))
        if (targets.length === 0) return
        const tag = command.tag ?? ""
        for (const target of targets) {
            const result =
                command.amount !== undefined
                    ? { damage: Math.max(0, command.amount), kind: "raw" }
                    : this.oracle.apply({
                          skillField: command.skillField,
                          tag,
                          actor: snapshotActor(actor, this.clock.now),
                          target: snapshotTarget(target, this.clock.now),
                          at: this.clock.now,
                      })
            this.applyDamage(actor, target, command.skillField, tag, result.damage, result.kind)
        }
    }

    private applyDamage(
        actor: ActorState,
        target: TargetState,
        skillField: string,
        tag: string,
        rawDamage: number,
        damageKind: string
    ): void {
        if (!target.alive) return
        const raw = Math.max(0, rawDamage)
        const shieldAbsorb = Math.min(target.shield, raw)
        target.shield -= shieldAbsorb
        const afterShield = raw - shieldAbsorb
        const hpLoss = Math.min(target.hp, afterShield)
        target.hp -= hpLoss
        const overkill = afterShield - hpLoss
        const effective = shieldAbsorb + hpLoss

        this.emit({
            ...this.emitBase(),
            kind: "damage",
            actorId: actor.id,
            targetId: target.id,
            skillField,
            tag,
            raw,
            effective,
            shieldAbsorb,
            hpLoss,
            overkill,
            hpAfter: target.hp,
            shieldAfter: target.shield,
            damageKind,
        })

        this.damageTotal += effective
        this.damageEventCount++
        addToMap(this.damageBySkill, skillField, effective)
        addToMap(this.damageByActor, actor.id, effective)
        addToMap(this.damageByTarget, target.id, effective)
        addToMap(this.frameDamageByActor, actor.id, effective)
        addToMap(this.frameDamageByTarget, target.id, effective)

        if (target.hp <= 0) {
            target.hp = 0
            target.alive = false
            this.emit({
                ...this.emitBase(),
                kind: "death",
                targetId: target.id,
                killerId: actor.id,
                skillField,
            })
            this.clearBuffs("target", target, target.id)
        }
    }

    private executeApplyBuff(command: ApplyBuffCommand): void {
        const actor = this.actorIndex.get(command.actorId)
        if (!actor?.alive) return
        const entity = this.resolveEntity(command.target, actor)
        if (!entity) return
        const policy = command.policy ?? this.buffPolicies[String(command.buffId)] ?? DEFAULT_BUFF_POLICY
        const previous = entity.holder.buffs.find(buff => buff.buffId === command.buffId)
        const outcome: ApplyBuffOutcome = applyBuffInstance(entity.holder, {
            buffId: command.buffId,
            sourceId: actor.id,
            now: this.clock.now,
            instanceId: this.nextBuffInstanceId++,
            duration: command.duration,
            stacks: command.stacks,
            level: command.level,
            policy,
            maxStacks: this.maxStacks[String(command.buffId)],
        })
        if (outcome.replaced && previous) {
            this.emit({
                ...this.emitBase(),
                kind: "buff-expire",
                entityKind: entity.kind,
                entityId: entity.id,
                buffId: previous.buffId,
                instanceId: previous.instanceId,
                stacks: previous.stacks,
                reason: "replaced",
            })
        }
        this.emit({
            ...this.emitBase(),
            kind: "buff-apply",
            entityKind: entity.kind,
            entityId: entity.id,
            sourceId: actor.id,
            buffId: command.buffId,
            instanceId: outcome.instance.instanceId,
            stacks: outcome.instance.stacks,
            duration: outcome.instance.duration,
            expiresAt: outcome.instance.expiresAt,
            policy,
            replaced: outcome.replaced,
        })
        this.scheduleBuffExpiry(entity.kind, entity.holder, entity.id, outcome.instance.instanceId, outcome.instance.expiresAt)
    }

    private executeRemoveBuff(command: RemoveBuffCommand): void {
        const actor = this.actorIndex.get(command.actorId)
        if (!actor?.alive) return
        const entity = this.resolveEntity(command.target, actor)
        if (!entity) return
        const removed = removeBuffInstance(entity.holder, command.buffId)
        if (!removed) return
        this.emit({
            ...this.emitBase(),
            kind: "buff-expire",
            entityKind: entity.kind,
            entityId: entity.id,
            buffId: removed.buffId,
            instanceId: removed.instanceId,
            stacks: removed.stacks,
            reason: "removed",
        })
    }

    private executeResource(actorId: string, resource: string, delta: number): void {
        const actor = this.actorIndex.get(actorId)
        if (!actor?.alive) return
        const pool = actor.resources[resource]
        if (!pool) return
        const before = pool.current
        pool.current = clamp(pool.current + delta, 0, pool.max)
        this.emit({
            ...this.emitBase(),
            kind: "resource",
            actorId,
            resource,
            delta: pool.current - before,
            requested: delta,
            before,
            after: pool.current,
        })
    }

    private executeSelectTargets(command: SelectTargetsCommand): void {
        const actor = this.actorIndex.get(command.actorId)
        if (!actor?.alive) return
        const selected = selectTargets(command.filter, this.ctx(actor), this.rng, command.count)
        const ids = selected.map(target => target.id)
        this.stores.set(command.store, ids)
        this.emit({
            ...this.emitBase(),
            kind: "target-select",
            actorId: actor.id,
            store: command.store,
            filter: command.filter.kind,
            targetIds: ids,
        })
    }

    private executeCast(actorId: string, skillId: number | string, cooldown: number, costs: { resource: string; amount: number }[]): void {
        const actor = this.actorIndex.get(actorId)
        if (!actor?.alive) return
        const key = String(skillId)
        const readyAt = actor.cooldowns[key] ?? 0
        if (this.clock.now < readyAt - TIME_EPS) return
        // 资源不足时整次施法失败（不扣资源、不进冷却）；不存在的资源池忽略（由配置缺失显式暴露）
        const unaffordable = costs.some(cost => {
            const pool = actor.resources[cost.resource]
            return !!pool && pool.current + TIME_EPS < Math.abs(cost.amount)
        })
        if (unaffordable) return
        for (const cost of costs) this.executeResource(actorId, cost.resource, -Math.abs(cost.amount))
        actor.cooldowns[key] = this.clock.now + Math.max(0, cooldown)
        this.emit({
            ...this.emitBase(),
            kind: "cast",
            actorId,
            skillId,
            cooldown: Math.max(0, cooldown),
            readyAt: actor.cooldowns[key],
            costs: costs.map(cost => ({ resource: cost.resource, amount: Math.abs(cost.amount) })),
        })
    }

    // ------------------------------------------------------------------
    // trace
    // ------------------------------------------------------------------

    private recordFrame(time: number): void {
        const last = this.frames[this.frames.length - 1]
        if (last && sameTime(last.t, time)) return

        const actorSamples = this.actors.map(actor => {
            const resources: Record<string, ResourcePool> = {}
            for (const [key, pool] of Object.entries(actor.resources)) resources[key] = { current: pool.current, max: pool.max }
            const cooldowns: Record<string, number> = {}
            for (const [key, readyAt] of Object.entries(actor.cooldowns)) cooldowns[key] = Math.max(0, readyAt - time)
            return {
                actorId: actor.id,
                damageDelta: this.frameDamageByActor.get(actor.id) ?? 0,
                resources,
                buffCount: actor.buffs.length,
                cooldowns,
                alive: actor.alive,
            }
        })
        const targetSamples = this.targets.map(target => ({
            targetId: target.id,
            hp: target.hp,
            maxHp: target.maxHp,
            shield: target.shield,
            damageDelta: this.frameDamageByTarget.get(target.id) ?? 0,
            buffCount: target.buffs.length,
            alive: target.alive,
        }))
        this.frames.push({ t: time, actors: actorSamples, targets: targetSamples })
        this.frameDamageByActor.clear()
        this.frameDamageByTarget.clear()
    }
}

function validateConfig(config: SimConfig): void {
    if (!config || typeof config !== "object") throw new Error("SimConfig 必须是对象")
    if (!Number.isFinite(config.duration) || config.duration < 0) throw new Error(`duration 非法：${config.duration}`)
    if (!Number.isFinite(config.seed)) throw new Error(`seed 非法：${config.seed}`)
    if (!Array.isArray(config.actors)) throw new Error("actors 必须是数组")
    const actorIds = new Set<string>()
    for (const actor of config.actors) {
        if (!actor.id) throw new Error("actor.id 不能为空")
        if (actorIds.has(actor.id)) throw new Error(`重复的 actor id：${actor.id}`)
        actorIds.add(actor.id)
    }
    const enemyIds = new Set<string>()
    for (const enemy of config.enemies ?? []) {
        if (!enemy.id) throw new Error("enemy.id 不能为空")
        if (enemyIds.has(enemy.id)) throw new Error(`重复的 enemy id：${enemy.id}`)
        enemyIds.add(enemy.id)
    }
}

function clamp(value: number, min: number, max: number): number {
    if (max < min) return min
    return Math.min(max, Math.max(min, value))
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
    map.set(key, (map.get(key) ?? 0) + value)
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
    // fromEntries 走 CreateDataProperty，字段名为 "__proto__" 时也不会丢
    return Object.fromEntries(map)
}
