/**
 * SkillRuntime：把 `SkillBehaviorDoc` 的 phase / tick / hit 解释成 U4 的 `SimCommand`。
 *
 * 执行模型：
 * - 施法本身走 core 的 `cast` 命令（资源扣除 / 冷却 / `cast` 事件由 U4 记录）；
 * - 每个相位调用在一个**事件队列回调**里执行（`Simulation.scheduleCallback`，additive 扩展），
 *   因此条件 / 分支 / 选敌都在「动作执行时刻」求值，且先于该时刻的帧采样；
 * - 同一次调用内的动作按顺序串成回调链：前一个动作排入的命令在同刻 drain 完，后一个动作才看到状态；
 * - 未知 native / opaque 条件 / 无法表达的目标只产生 `RuntimeDiagnostic`，绝不假装执行。
 */

import { TIME_EPS } from "../core/clock"
import type { Rng } from "../core/rng"
import type { Simulation } from "../core/simulation"
import { resolveTargetRef } from "../core/targeting"
import type { ActorState, EntityRef, SimResult, TargetRef } from "../core/types"
import type {
    Action,
    ApplyBuffAction,
    BranchAction,
    DamageAction,
    RemoveBuffAction,
    ResourceAction,
    SelectAction,
    SkillBehavior,
    SkillBehaviorDoc,
    SummonAction,
    TargetSpec,
} from "../schema/ir"
import { evaluateBranch, evaluateCondition } from "./conditions"
import { hitTimes, planSkill, type SkillPlan } from "./planner"
import type { ActiveSkill, CastResult, RuntimeDiagnostic, SkillRuntime, SkillRuntimeOptions, SkillWindow } from "./types"

const CANCEL_NOTIFIES = ["BP_SkillCancel_C", "BP_SkillCancel"]
const COMBO_NOTIFIES = ["BP_NextCombo_C", "BP_NextCombo"]

interface ActiveRecord {
    skillId: number
    castAt: number
    castEndAt: number
    endsAt: number
    canMove: boolean
    cancelable: boolean
    combo: boolean
    cancelled: boolean
    invocations: number
    windows: SkillWindow[]
}

export function createSkillRuntime(options: SkillRuntimeOptions): SkillRuntime {
    return new SkillRuntimeImpl(options)
}

class SkillRuntimeImpl implements SkillRuntime {
    readonly simulation: Simulation

    private readonly doc: SkillBehaviorDoc
    private readonly actorId: string
    private readonly rng: Rng
    private readonly onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void
    private readonly recastPolicy: "fail" | "toggle-off"

    private readonly diagnosticList: RuntimeDiagnostic[] = []
    private readonly diagnosticIndex = new Map<string, RuntimeDiagnostic>()
    private activeRecords: ActiveRecord[] = []
    private pendingCallbacks = 0
    private summonCounter = 0

    constructor(options: SkillRuntimeOptions) {
        this.simulation = options.simulation
        if (!options.simulation.getActor(options.actorId)) throw new Error(`actor 不存在：${options.actorId}`)
        this.doc = options.doc
        this.actorId = options.actorId
        this.rng = options.rng ?? options.simulation.rng.fork(`skill-runtime:${options.actorId}`)
        this.onDiagnostic = options.onDiagnostic
        this.recastPolicy = options.recastPolicy ?? "fail"
    }

    // ------------------------------------------------------------------
    // 公开 API
    // ------------------------------------------------------------------

    cast(skillId: number | string, at: number = this.simulation.now): CastResult {
        const skill = this.doc.skills[String(skillId)]
        const now = this.simulation.now
        const duration = this.simulation.clock.duration
        const empty: CastResult = { ok: false, skillId, at, invocations: 0, castEndAt: at, endsAt: at, sustained: [] }

        if (!Number.isFinite(at) || at < -TIME_EPS) return { ...empty, reason: "time", message: `施法时刻非法：${at}` }
        if (at < now - TIME_EPS) return { ...empty, reason: "time", message: `施法时刻 ${at} 早于当前时钟 ${now}` }
        if (at > duration + TIME_EPS) return { ...empty, reason: "time", message: `施法时刻 ${at} 超出模拟时长 ${duration}` }
        if (this.simulation.isFinished) return { ...empty, reason: "time", message: "模拟已结束" }
        if (!skill) {
            this.emit({
                kind: "unknown-skill",
                skillId,
                at,
                severity: "error",
                message: `技能 ${skillId} 不在 SkillBehaviorDoc 中`,
            })
            return { ...empty, reason: "unknown-skill", message: `未知技能 ${skillId}` }
        }

        const actor = this.simulation.getActor(this.actorId)
        if (!actor?.alive) return { ...empty, reason: "actor-dead", message: `actor ${this.actorId} 不可用` }

        const plan = planSkill(skill, at, duration)
        const sustained = skill.cast.costs.filter(cost => cost.perSecond)
        const base: CastResult = {
            ok: true,
            skillId: skill.id,
            at,
            invocations: plan.count,
            castEndAt: plan.castEndAt,
            endsAt: plan.endsAt,
            sustained,
        }

        if (at > now + TIME_EPS) {
            this.scheduleCallback(at, () => {
                const result = this.commitCast(skill, at, plan, true)
                if (!result.ok) {
                    this.emit({
                        kind: "cast-failed",
                        skillId: skill.id,
                        at,
                        severity: "warn",
                        message: `延后施法在 ${at}s 被拒绝：${result.message ?? result.reason}`,
                        reason: result.reason ?? "time",
                    })
                }
            })
            return { ...base, deferred: true }
        }

        return this.commitCast(skill, at, plan, false)
    }

    active(): ActiveSkill[] {
        const now = this.simulation.now
        return this.activeRecords
            .filter(record => !record.cancelled && now <= record.endsAt + TIME_EPS)
            .map(record => ({
                skillId: record.skillId,
                castAt: record.castAt,
                castEndAt: record.castEndAt,
                endsAt: record.endsAt,
                canMove: record.canMove,
                cancelable: record.cancelable,
                combo: record.combo,
                cancelled: record.cancelled,
                invocations: record.invocations,
                windows: record.windows.map(window => ({ ...window })),
            }))
    }

    diagnostics(): RuntimeDiagnostic[] {
        return this.diagnosticList.map(diagnostic => ({ ...diagnostic }))
    }

    step(): boolean {
        return this.simulation.step()
    }

    run(): SimResult {
        return this.simulation.run()
    }

    pending(): number {
        return this.pendingCallbacks
    }

    // ------------------------------------------------------------------
    // 施法
    // ------------------------------------------------------------------

    private commitCast(skill: SkillBehavior, at: number, plan: SkillPlan, deferred: boolean): CastResult {
        void deferred
        const key = String(skill.id)
        const actor = this.simulation.getActor(this.actorId)
        const duration = this.simulation.clock.duration
        const fail = (reason: CastResult["reason"], message: string, extra: Partial<CastResult> = {}): CastResult => ({
            ok: false,
            skillId: skill.id,
            at,
            reason,
            message,
            invocations: 0,
            castEndAt: at,
            endsAt: at,
            sustained: [],
            ...extra,
        })
        if (!actor?.alive) return fail("actor-dead", `actor ${this.actorId} 不可用`)

        this.pruneActive()

        const active = this.activeRecords.find(record => record.skillId === skill.id && !record.cancelled)
        if (active) {
            if (this.recastPolicy === "toggle-off") {
                active.cancelled = true
                this.emit({
                    kind: "unsupported",
                    skillId: skill.id,
                    at,
                    severity: "info",
                    message: "toggle-off：取消后续相位；IR 无「取消时回收增益」动作，已施加的 buff 保持到自身到期",
                    feature: "toggle-off-buff-cleanup",
                })
                return {
                    ok: true,
                    skillId: skill.id,
                    at,
                    invocations: 0,
                    castEndAt: at,
                    endsAt: at,
                    sustained: [],
                    toggledOff: true,
                }
            }
            return fail("active", `技能 ${skill.id} 已在激活中（endsAt=${active.endsAt}）`)
        }

        const readyAt = actor.cooldowns[key] ?? 0
        if (at < readyAt - TIME_EPS) return fail("cooldown", `技能 ${skill.id} 冷却中，${readyAt}s 后可再次施放`, { readyAt })

        const upfront = skill.cast.costs.filter(cost => !cost.perSecond)
        const missing: { resource: string; required: number; available: number }[] = []
        for (const cost of upfront) {
            const pool = actor.resources[cost.resource]
            if (!pool) {
                this.emit({
                    kind: "unsupported",
                    skillId: skill.id,
                    at,
                    severity: "warn",
                    message: `施法消耗引用了不存在的资源池「${cost.resource}」；core 会忽略该消耗`,
                    feature: "missing-resource-pool",
                    detail: cost.resource,
                })
                continue
            }
            const required = Math.abs(cost.amount)
            if (pool.current + TIME_EPS < required) missing.push({ resource: cost.resource, required, available: pool.current })
        }
        if (missing.length > 0) {
            return fail("resource", `资源不足：${missing.map(item => `${item.resource} ${item.available}/${item.required}`).join("，")}`, {
                missing,
            })
        }
        for (const cost of skill.cast.costs) {
            if (!cost.perSecond) continue
            this.emit({
                kind: "sustained-cost",
                skillId: skill.id,
                at,
                severity: "info",
                message: `持续消耗「${cost.resource} ${cost.amount}/秒」运行时不自动扣除，需由 IR tick 相位建模`,
                resource: cost.resource,
                amount: cost.amount,
            })
        }
        if (plan.clipped > 0) {
            this.emit({
                kind: "phase-clipped",
                skillId: skill.id,
                at,
                severity: "info",
                message: `${plan.clipped} 个相位调用超出模拟时长 ${duration}s 被裁剪`,
                detail: `clipped=${plan.clipped}`,
            })
        }
        if (plan.truncated > 0) {
            this.emit({
                kind: "phase-clipped",
                skillId: skill.id,
                at,
                severity: "warn",
                message: `${plan.truncated} 个相位调用超过展开上限（tick.interval 过小？）被截断`,
                detail: `truncated=${plan.truncated}`,
            })
        }

        const record = this.createRecord(skill, at, plan)
        this.activeRecords.push(record)

        // 施法事件与资源扣除交给 core；随后用同刻回调确认它真的执行了（否则不排后续相位）
        const mark = this.simulation.events.length
        this.simulation.schedule(at, {
            kind: "cast",
            actorId: this.actorId,
            skillId: skill.id,
            cooldown: skill.cast.cooldown,
            costs: upfront.map(cost => ({ resource: cost.resource, amount: Math.abs(cost.amount) })),
        })
        this.scheduleCallback(at, () => this.afterCast(record, skill, plan, mark))

        return {
            ok: true,
            skillId: skill.id,
            at,
            invocations: plan.count,
            castEndAt: plan.castEndAt,
            endsAt: plan.endsAt,
            sustained: skill.cast.costs.filter(cost => cost.perSecond),
        }
    }

    private createRecord(skill: SkillBehavior, castAt: number, plan: SkillPlan): ActiveRecord {
        const inert = skill.provenance?.inertNotifies ?? []
        const canMove = skill.cast.canMove
        const windows: SkillWindow[] = canMove ? [{ kind: "move", begin: plan.castEndAt, end: plan.endsAt }] : []
        return {
            skillId: skill.id,
            castAt,
            castEndAt: plan.castEndAt,
            endsAt: plan.endsAt,
            canMove,
            cancelable: inert.some(name => CANCEL_NOTIFIES.includes(name)),
            combo: inert.some(name => COMBO_NOTIFIES.includes(name)),
            cancelled: false,
            invocations: plan.count,
            windows,
        }
    }

    private afterCast(record: ActiveRecord, skill: SkillBehavior, plan: SkillPlan, mark: number): void {
        const executed = this.simulation.events
            .slice(mark)
            .some(event => event.kind === "cast" && event.actorId === this.actorId && String(event.skillId) === String(skill.id))
        if (!executed) {
            record.cancelled = true
            this.emit({
                kind: "cast-failed",
                skillId: skill.id,
                at: this.simulation.now,
                severity: "warn",
                message: `core 拒绝施法（冷却 / 资源在同刻被其它命令改变），后续相位不执行`,
                reason: "resource",
            })
            return
        }
        this.runInvocationAt(record, skill, plan, 0)
    }

    /** 相位调用串行推进：前一次调用的动作全部执行完，才排下一次（同刻相位保持 IR 顺序） */
    private runInvocationAt(record: ActiveRecord, skill: SkillBehavior, plan: SkillPlan, index: number): void {
        if (record.cancelled || index >= plan.invocations.length) return
        const invocation = plan.invocations[index]
        this.scheduleCallback(invocation.at, () => {
            this.runInvocation(record, skill, invocation.phaseIndex, () => this.runInvocationAt(record, skill, plan, index + 1))
        })
    }

    private pruneActive(): void {
        const now = this.simulation.now
        this.activeRecords = this.activeRecords.filter(record => !record.cancelled && now <= record.endsAt + TIME_EPS)
    }

    // ------------------------------------------------------------------
    // 相位 / 动作执行
    // ------------------------------------------------------------------

    private runInvocation(record: ActiveRecord, skill: SkillBehavior, phaseIndex: number, done: () => void): void {
        if (record.cancelled) {
            done()
            return
        }
        const actor = this.simulation.getActor(this.actorId)
        if (!actor?.alive) {
            done()
            return
        }
        const phase = skill.phases[phaseIndex]
        const context = { actor, targets: this.simulation.targets, rng: this.rng }
        if (phase.condition) {
            const evaluation = evaluateCondition(phase.condition, context)
            if (!evaluation.ok) {
                this.emit({
                    kind: "opaque-condition",
                    skillId: skill.id,
                    at: this.simulation.now,
                    severity: "warn",
                    message: `无法解释的相位条件「${evaluation.ref}」，跳过本次调用`,
                    ref: evaluation.ref,
                    where: "phase",
                })
                done()
                return
            }
            if (!evaluation.value) {
                done()
                return
            }
        }
        this.runActions(record, skill, phase.actions, this.simulation.now, done)
    }

    /**
     * 按顺序执行动作列表：每个动作单独占一个同刻回调，保证前一个动作排入 core 的命令先被 drain，
     * 后一个动作（及分支条件）看到的是更新后的状态。
     */
    private runActions(record: ActiveRecord, skill: SkillBehavior, actions: readonly Action[], at: number, done: () => void): void {
        const step = (index: number): void => {
            if (record.cancelled || index >= actions.length) {
                done()
                return
            }
            this.scheduleCallback(at, () => {
                if (record.cancelled) {
                    done()
                    return
                }
                const actor = this.simulation.getActor(this.actorId)
                if (!actor?.alive) {
                    done()
                    return
                }
                const action = actions[index]
                if (action.kind === "branch") {
                    this.runBranch(record, skill, action, actor, () => step(index + 1))
                    return
                }
                this.executeAction(skill, action, actor, at)
                step(index + 1)
            })
        }
        step(0)
    }

    private runBranch(record: ActiveRecord, skill: SkillBehavior, action: BranchAction, actor: ActorState, done: () => void): void {
        const evaluation = evaluateBranch(action.on, { actor, targets: this.simulation.targets, rng: this.rng })
        if (!evaluation.ok) {
            this.emit({
                kind: "opaque-condition",
                skillId: skill.id,
                at: this.simulation.now,
                severity: "warn",
                message: `无法解释的分支谓词「${evaluation.ref}」，then / else 都不执行`,
                ref: evaluation.ref,
                where: "branch",
            })
            done()
            return
        }
        const chosen = evaluation.value ? action.then : (action.else ?? [])
        this.runActions(record, skill, chosen, this.simulation.now, done)
    }

    private executeAction(skill: SkillBehavior, action: Action, actor: ActorState, at: number): void {
        switch (action.kind) {
            case "damage":
                this.executeDamage(skill, action, at)
                break
            case "applyBuff":
                this.executeApplyBuff(skill, action, actor, at)
                break
            case "removeBuff":
                this.executeRemoveBuff(skill, action, actor, at)
                break
            case "resource":
                this.executeResource(action)
                break
            case "select":
                this.executeSelect(action)
                break
            case "summon":
                this.executeSummon(skill, action, actor, at)
                break
            case "native":
                this.executeNative(skill, action)
                break
            case "branch":
                // runActions 已把 branch 拆出去；此处只可能出现在非法嵌套（IR 校验阻止）
                this.emit({
                    kind: "unsupported",
                    skillId: skill.id,
                    at,
                    severity: "error",
                    message: "branch 不能直接执行（运行时缺陷）",
                    feature: "branch-execute",
                })
                break
        }
    }

    private executeDamage(skill: SkillBehavior, action: DamageAction, at: number): void {
        const target = toTargetRef(action.target)
        if (!target) {
            this.emit({
                kind: "unsupported",
                skillId: skill.id,
                at,
                severity: "warn",
                message: "damage 的 target 为 self，core 的伤害目标只接受 target 实体；跳过",
                feature: "damage-self-target",
            })
            return
        }
        const duration = this.simulation.clock.duration
        const tag = action.hits.tag ?? action.tag ?? ""
        for (const time of hitTimes(action.hits, at)) {
            if (time > duration + TIME_EPS) {
                this.emit({
                    kind: "phase-clipped",
                    skillId: skill.id,
                    at: this.simulation.now,
                    severity: "info",
                    message: `多段命中第 ${time}s 段超出模拟时长被裁剪`,
                    detail: `hit@${time}`,
                })
                break
            }
            this.simulation.schedule(time, {
                kind: "damage",
                actorId: this.actorId,
                skillField: action.field,
                tag,
                target,
            })
        }
    }

    private executeApplyBuff(skill: SkillBehavior, action: ApplyBuffAction, actor: ActorState, at: number): void {
        const entity = toEntityRef(action.target)
        if (!entity) {
            this.emitUnsupportedTarget(skill, "applyBuff", action.target, at)
            return
        }
        if (action.target.kind === "nearest" && (action.target.count ?? 1) > 1) {
            this.emit({
                kind: "unsupported",
                skillId: skill.id,
                at,
                severity: "warn",
                message: `applyBuff 的 nearest.count=${action.target.count} 只会作用于最近 1 个目标（core 的 EntityRef 单目标）`,
                feature: "multi-target-buff",
            })
        }
        const buffDoc = this.doc.buffs[String(action.buffId)]
        const duration = action.duration ?? (typeof buffDoc?.duration === "number" ? buffDoc.duration : undefined)
        this.simulation.schedule(at, {
            kind: "applyBuff",
            actorId: actor.id,
            target: entity,
            buffId: action.buffId,
            stacks: action.stacks,
            level: action.level,
            duration,
        })
    }

    private executeRemoveBuff(skill: SkillBehavior, action: RemoveBuffAction, actor: ActorState, at: number): void {
        const entity = toEntityRef(action.target)
        if (!entity) {
            this.emitUnsupportedTarget(skill, "removeBuff", action.target, at)
            return
        }
        this.simulation.schedule(at, { kind: "removeBuff", actorId: actor.id, target: entity, buffId: action.buffId })
    }

    private executeResource(action: ResourceAction): void {
        this.simulation.schedule(this.simulation.now, {
            kind: "resource",
            actorId: this.actorId,
            resource: action.resource,
            delta: action.delta,
        })
    }

    private executeSelect(action: SelectAction): void {
        this.simulation.schedule(this.simulation.now, {
            kind: "selectTargets",
            actorId: this.actorId,
            store: action.store,
            filter: action.filter,
            count: action.count,
        })
    }

    private executeSummon(skill: SkillBehavior, action: SummonAction, actor: ActorState, at: number): void {
        const duration = this.simulation.clock.duration
        this.summonCounter++
        const targetId = `summon:${action.creatureId}:${this.summonCounter}`
        const position = this.resolveSummonPosition(action.target, actor)
        this.simulation.schedule(at, {
            kind: "spawn",
            enemy: {
                id: targetId,
                level: 1,
                hp: 1,
                position,
                meta: { kind: "summon", ownerId: this.actorId, creatureId: action.creatureId, placeholder: true },
            },
        })
        if (action.duration !== undefined && at + action.duration <= duration + TIME_EPS) {
            this.simulation.schedule(at + action.duration, { kind: "despawn", targetId, reason: "summon-expired" })
        }
        this.emit({
            kind: "summon",
            skillId: skill.id,
            at,
            severity: "info",
            message: `召唤 ${action.creatureId}：只创建占位实体（无 AI / 属性 / 阵营）`,
            creatureId: action.creatureId,
            targetId,
            placeholder: true,
        })
    }

    private resolveSummonPosition(target: TargetSpec | undefined, actor: ActorState): { x: number; y: number } {
        const ref = target ? toTargetRef(target) : undefined
        if (!ref) return { ...actor.position }
        const stored = new Map<string, readonly string[]>()
        if (ref.kind === "stored") stored.set(ref.ref, this.simulation.getStoredTargets(ref.ref))
        const [resolved] = resolveTargetRef(ref, {
            actor,
            targets: this.simulation.targets,
            primaryTargetId: this.simulation.config.primaryTargetId,
            stored,
        })
        return resolved ? { ...resolved.position } : { ...actor.position }
    }

    private executeNative(skill: SkillBehavior, action: Extract<Action, { kind: "native" }>): void {
        const call = skill.provenance?.nativeCalls.find(item => item.fn === action.fn)
        this.emit({
            kind: "native",
            skillId: skill.id,
            at: this.simulation.now,
            severity: call?.known ? "info" : "warn",
            message: `native 调用「${action.fn}」不执行，仅溯源${call?.mapped ? "（已映射为其它动作）" : ""}`,
            fn: action.fn,
            args: action.args,
            known: call?.known ?? false,
            mapped: call?.mapped ?? false,
        })
    }

    private emitUnsupportedTarget(skill: SkillBehavior, what: string, target: TargetSpec, at: number): void {
        this.emit({
            kind: "unsupported",
            skillId: skill.id,
            at,
            severity: "warn",
            message: `${what} 的 target「${target.kind}」无法解析为 core 的 EntityRef`,
            feature: `${what}-target-${target.kind}`,
        })
    }

    // ------------------------------------------------------------------
    // 调度 / 诊断
    // ------------------------------------------------------------------

    private scheduleCallback(at: number, run: () => void): void {
        const duration = this.simulation.clock.duration
        if (this.simulation.isFinished || at > duration + TIME_EPS || at < this.simulation.now - TIME_EPS) {
            // 超出模拟时长 / 已结束：不排程，也不算 pending
            return
        }
        this.pendingCallbacks++
        this.simulation.scheduleCallback(at, () => {
            this.pendingCallbacks--
            run()
        })
    }

    private emit(diagnostic: RuntimeDiagnostic): void {
        const key = diagnosticKey(diagnostic)
        const existing = this.diagnosticIndex.get(key)
        if (existing) {
            existing.occurrences = (existing.occurrences ?? 1) + 1
            return
        }
        const stored: RuntimeDiagnostic = { ...diagnostic, occurrences: diagnostic.occurrences ?? 1 }
        this.diagnosticIndex.set(key, stored)
        this.diagnosticList.push(stored)
        this.onDiagnostic?.(stored)
    }
}

function diagnosticKey(diagnostic: RuntimeDiagnostic): string {
    switch (diagnostic.kind) {
        case "native":
            return `${diagnostic.kind}|${diagnostic.skillId}|${diagnostic.fn}`
        case "opaque-condition":
            return `${diagnostic.kind}|${diagnostic.skillId}|${diagnostic.where}|${diagnostic.ref}`
        case "unsupported":
            return `${diagnostic.kind}|${diagnostic.skillId}|${diagnostic.feature}`
        case "sustained-cost":
            return `${diagnostic.kind}|${diagnostic.skillId}|${diagnostic.resource}`
        case "summon":
            return `${diagnostic.kind}|${diagnostic.skillId}|${diagnostic.creatureId}`
        case "phase-clipped":
            return `${diagnostic.kind}|${diagnostic.skillId}|${diagnostic.detail}`
        case "unknown-skill":
            return `${diagnostic.kind}|${String(diagnostic.skillId)}`
        case "cast-failed":
            return `${diagnostic.kind}|${diagnostic.skillId}|${diagnostic.reason}`
    }
}

function toTargetRef(spec: TargetSpec): TargetRef | undefined {
    switch (spec.kind) {
        case "primary":
            return { kind: "primary" }
        case "stored":
            return { kind: "stored", ref: spec.ref }
        case "nearest":
            return { kind: "nearest", count: spec.count, radius: spec.radius }
        case "self":
            return undefined
    }
}

function toEntityRef(spec: TargetSpec): EntityRef | undefined {
    if (spec.kind === "self") return { kind: "self" }
    return toTargetRef(spec)
}

/** 供测试 / 消费方把 IR TargetSpec 转成 core 引用（self 返回 undefined） */
export { toEntityRef, toTargetRef }
