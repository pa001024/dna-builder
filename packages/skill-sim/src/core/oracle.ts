/**
 * 伤害 oracle —— 数值权威在外部（生产环境是 packages/data 的 CharBuild），
 * core 只负责「何时、对谁、用哪个字段/tag 结算」。
 *
 * 依赖方向：本文件不 import `packages/data` / `pipeline/data-index`。
 * 生产接线由 U5/U7 完成，例如：
 *
 * ```ts
 * const oracle = new CharBuildDamageOracle(req => {
 *     const ctx = charBuildContextFor(req.actor.meta?.build)   // 事件快照，不逐 tick calculate()
 *     return { damage: ctx.damageFor(req.skillField, req.tag), kind: "normal" }
 * })
 * ```
 *
 * 默认是**期望值模式**（与 `CharBuild.calculate()` 一致，不掷暴击骰）；
 * 需要随机暴击时由注入的 `damageFn` 自己持有显式 RNG，core 不隐式随机。
 */

import type { ActorState, BuffSnapshot, TargetState, Vec2 } from "./types"

export interface ActorSnapshot {
    entityKind: "actor"
    id: string
    characterId: number
    team: string
    position: Vec2
    resources: Readonly<Record<string, { current: number; max: number }>>
    buffs: readonly BuffSnapshot[]
    /** 外部上下文（CharBuild 引用等），按引用透传，oracle 不得修改 */
    meta?: Record<string, unknown>
    at: number
}

export interface TargetSnapshot {
    entityKind: "target"
    id: string
    level: number
    hp: number
    maxHp: number
    shield: number
    def: number
    resist: number
    buffs: readonly BuffSnapshot[]
    meta?: Record<string, unknown>
    at: number
}

export interface DamageRequest {
    skillField: string
    tag: string
    actor: ActorSnapshot
    target: TargetSnapshot
    at: number
}

export interface DamageResult {
    damage: number
    /** 伤害类型（normal / crit / dot / ...），仅溯源 */
    kind: string
}

export interface DamageOracle {
    apply(req: DamageRequest): DamageResult
    /** 可选：清空内部缓存（跨构筑复用同一 oracle 时调用） */
    reset?(): void
}

export type DamageFn = (req: DamageRequest) => DamageResult | number

/** 与 CharBuild 同名方法对齐的最小接口；U7 用适配器实现 */
export interface CharBuildLike {
    calculateDamage(req: DamageRequest): DamageResult | number
}

export interface CharBuildDamageOracleOptions {
    /** 结果缓存条数；0 关闭缓存。默认 4096 */
    cacheSize?: number
}

function snapshotBuffs(holder: {
    buffs: readonly { buffId: number | string; sourceId: string; stacks: number; level?: number; appliedAt: number; expiresAt: number }[]
}): readonly BuffSnapshot[] {
    return holder.buffs.map(buff =>
        Object.freeze({
            buffId: buff.buffId,
            sourceId: buff.sourceId,
            stacks: buff.stacks,
            level: buff.level,
            appliedAt: buff.appliedAt,
            expiresAt: buff.expiresAt,
        })
    )
}

export function snapshotActor(actor: ActorState, at: number): ActorSnapshot {
    const resources: Record<string, { current: number; max: number }> = {}
    for (const [key, pool] of Object.entries(actor.resources)) resources[key] = Object.freeze({ current: pool.current, max: pool.max })
    return Object.freeze({
        entityKind: "actor",
        id: actor.id,
        characterId: actor.characterId,
        team: actor.team,
        position: { ...actor.position },
        resources: Object.freeze(resources),
        buffs: Object.freeze(snapshotBuffs(actor)),
        meta: actor.meta,
        at,
    })
}

export function snapshotTarget(target: TargetState, at: number): TargetSnapshot {
    return Object.freeze({
        entityKind: "target",
        id: target.id,
        level: target.level,
        hp: target.hp,
        maxHp: target.maxHp,
        shield: target.shield,
        def: target.def,
        resist: target.resist,
        buffs: Object.freeze(snapshotBuffs(target)),
        meta: target.meta,
        at,
    })
}

export function targetSnapshotKey(target: TargetSnapshot): string {
    // level 参与 key：同 id / 同层数但等级不同的 buff 可能改变抗性/减伤
    const buffs = target.buffs.map(buff => `${String(buff.buffId)}x${buff.stacks}L${buff.level ?? 0}`).join(",")
    return `${target.id}|${target.level}|${target.hp}|${target.shield}|${target.def}|${target.resist}|${buffs}`
}

const metaIdentity = new WeakMap<object, number>()
let nextMetaIdentity = 1

function metaKey(meta: Record<string, unknown> | undefined): string {
    if (!meta) return "-"
    let id = metaIdentity.get(meta)
    if (id === undefined) {
        id = nextMetaIdentity++
        metaIdentity.set(meta, id)
    }
    return `m${id}`
}

/** actor 侧快照签名：资源 / buff / meta 身份都影响 CharBuild 结算 */
export function actorSnapshotKey(actor: ActorSnapshot): string {
    const resources = Object.entries(actor.resources)
        .map(([key, pool]) => `${key}=${pool.current}/${pool.max}`)
        .join(",")
    const buffs = actor.buffs.map(buff => `${String(buff.buffId)}x${buff.stacks}L${buff.level ?? 0}`).join(",")
    return `${actor.id}|${actor.characterId}|${actor.team}|${resources}|${buffs}|${metaKey(actor.meta)}`
}

function normalizeResult(value: DamageResult | number): DamageResult {
    const result = typeof value === "number" ? { damage: value, kind: "normal" } : value
    if (!Number.isFinite(result.damage)) throw new Error(`damageFn 返回了非有限伤害：${result.damage}`)
    return { damage: Math.max(0, result.damage), kind: result.kind || "normal" }
}

/**
 * 把注入的 `damageFn` / `CharBuildLike` 包成确定性 oracle。
 *
 * 缓存键 = `(actorSnapshotKey, skillField, tag, targetSnapshotKey, at)`：同一时刻的多段命中
 * 只结算一次；缓存的是结算结果（等价于属性快照的结果），避免重复进入 CharBuild。
 * actorSnapshotKey 含 buff / 资源 / `meta` 身份，跨构筑复用同一 oracle 也不会串味。
 */
export class CharBuildDamageOracle implements DamageOracle {
    private readonly source: DamageFn
    private readonly cacheSize: number
    private readonly cache = new Map<string, DamageResult>()
    cacheHits = 0
    cacheMisses = 0

    constructor(source: DamageFn | CharBuildLike, options: CharBuildDamageOracleOptions = {}) {
        this.source = typeof source === "function" ? source : req => source.calculateDamage(req)
        this.cacheSize = Math.max(0, options.cacheSize ?? 4096)
    }

    apply(req: DamageRequest): DamageResult {
        if (this.cacheSize === 0) {
            this.cacheMisses++
            return { ...normalizeResult(this.source(req)) }
        }
        const key = `${actorSnapshotKey(req.actor)}|${req.skillField}|${req.tag}|${targetSnapshotKey(req.target)}|${req.at}`
        const cached = this.cache.get(key)
        if (cached) {
            this.cacheHits++
            return { ...cached }
        }
        this.cacheMisses++
        const result = normalizeResult(this.source(req))
        if (this.cache.size >= this.cacheSize) {
            const oldest = this.cache.keys().next()
            if (!oldest.done) this.cache.delete(oldest.value)
        }
        this.cache.set(key, result)
        return { ...result }
    }

    reset(): void {
        this.cache.clear()
        this.cacheHits = 0
        this.cacheMisses = 0
    }
}

/** 未注入 oracle 却出现无 `amount` 的伤害命令时，明确失败而不是静默 0 伤害 */
export class MissingDamageOracle implements DamageOracle {
    apply(req: DamageRequest): DamageResult {
        throw new Error(`damage 命令需要 amount 或注入 DamageOracle（actor=${req.actor.id} field=${req.skillField} tag=${req.tag}）`)
    }
}

/** 便捷构造：直接包一个函数 */
export function createDamageOracle(fn: DamageFn, options?: CharBuildDamageOracleOptions): CharBuildDamageOracle {
    return new CharBuildDamageOracle(fn, options)
}
