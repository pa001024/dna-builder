/**
 * sim core 的状态 / 命令 / 事件 / trace 形状。
 *
 * 分层约定：
 * - **命令**（`SimCommand`）是唯一输入，由 U5 的技能 IR 解释器或 U7 的迁移脚本构造；
 * - **事件**（`SimEvent`）是唯一输出流，U6 只渲染事件与帧采样；
 * - 核心不认识技能 IR / CharBuild / montage，只认识这些通用结构。
 */

import type { TargetFilter } from "../schema/ir"
import type { DamageOracle } from "./oracle"

export interface Vec2 {
    x: number
    y: number
}

export const ORIGIN: Vec2 = { x: 0, y: 0 }

export type Team = "ally" | "enemy"

export interface ResourcePool {
    current: number
    max: number
}

export interface ResourceInit {
    current?: number
    max: number
}

export type BuffPolicy = "stack" | "refresh" | "replace" | "extend"
export const BUFF_POLICIES = ["stack", "refresh", "replace", "extend"] as const
export const DEFAULT_BUFF_POLICY: BuffPolicy = "refresh"

export interface BuffInstance {
    /** 每次新实例单调递增；刷新/叠层沿用原 id */
    instanceId: number
    buffId: number | string
    sourceId: string
    stacks: number
    level?: number
    appliedAt: number
    /** 绝对模拟时刻；永久增益为 Infinity */
    expiresAt: number
    /** Infinity 表示永久 */
    duration: number
    policy: BuffPolicy
}

export interface BuffSnapshot {
    buffId: number | string
    sourceId: string
    stacks: number
    level?: number
    appliedAt: number
    expiresAt: number
}

/** 可持有 buff 的实体（actor / target 的最小交集） */
export interface BuffHolder {
    buffs: BuffInstance[]
}

export interface ActorState extends BuffHolder {
    id: string
    characterId: number
    team: Team
    position: Vec2
    resources: Record<string, ResourcePool>
    /** 技能键 → 可再次施放的绝对时刻 */
    cooldowns: Record<string, number>
    buffs: BuffInstance[]
    alive: boolean
    /** 调用方透传的外部上下文（如 U7 的 CharBuild 引用），core 不解释 */
    meta?: Record<string, unknown>
}

export interface TargetState extends BuffHolder {
    id: string
    level: number
    hp: number
    maxHp: number
    shield: number
    def: number
    resist: number
    position: Vec2
    buffs: BuffInstance[]
    alive: boolean
    meta?: Record<string, unknown>
}

export interface ActorConfig {
    id: string
    characterId: number
    team?: Team
    position?: Vec2
    resources?: Record<string, ResourceInit>
    /** 初始冷却（剩余秒数），运行开始即 readyAt = 该值 */
    cooldowns?: Record<string, number>
    meta?: Record<string, unknown>
}

export interface EnemyConfig {
    id: string
    level?: number
    hp: number
    shield?: number
    def?: number
    resist?: number
    position?: Vec2
    meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// 命令（输入）
// ---------------------------------------------------------------------------

export type TargetRef =
    | { kind: "primary" }
    | { kind: "stored"; ref: string }
    | { kind: "nearest"; count?: number; radius?: number }
    | { kind: "id"; id: string }

export type EntityRef = { kind: "self" } | { kind: "actor"; id: string } | TargetRef

export interface DamageCommand {
    kind: "damage"
    actorId: string
    /** packages/data 技能字段名，oracle 据此取倍率 */
    skillField: string
    /** 伤害 tag；缺省空串 */
    tag?: string
    target: TargetRef
    /** 直接给定伤害（跳过 oracle），用于无 CharBuild 的测试 / 固定伤害 */
    amount?: number
}

export interface ApplyBuffCommand {
    kind: "applyBuff"
    /** 施加者 */
    actorId: string
    target: EntityRef
    buffId: number | string
    stacks?: number
    level?: number
    /** 缺省为永久（Infinity） */
    duration?: number
    policy?: BuffPolicy
}

export interface RemoveBuffCommand {
    kind: "removeBuff"
    actorId: string
    target: EntityRef
    buffId: number | string
}

export interface ResourceCommand {
    kind: "resource"
    actorId: string
    resource: string
    /** 正数回复、负数消耗；结果 clamp 到 [0, max] */
    delta: number
}

export interface SelectTargetsCommand {
    kind: "selectTargets"
    actorId: string
    /** 结果写入的存储键，后续 TargetRef.stored 引用 */
    store: string
    filter: TargetFilter
    /** 覆盖 filter 自带的 count */
    count?: number
}

export interface SpawnCommand {
    kind: "spawn"
    enemy: EnemyConfig
}

export interface DespawnCommand {
    kind: "despawn"
    targetId: string
    reason?: string
}

export interface MoveCommand {
    kind: "move"
    entity: "actor" | "target"
    id: string
    position: Vec2
}

export interface CastCommand {
    kind: "cast"
    actorId: string
    skillId: number | string
    /** 施法后冷却秒数 */
    cooldown?: number
    costs?: { resource: string; amount: number }[]
}

export type SimCommand =
    | DamageCommand
    | ApplyBuffCommand
    | RemoveBuffCommand
    | ResourceCommand
    | SelectTargetsCommand
    | SpawnCommand
    | DespawnCommand
    | MoveCommand
    | CastCommand

export const COMMAND_KINDS = ["damage", "applyBuff", "removeBuff", "resource", "selectTargets", "spawn", "despawn", "move", "cast"] as const
export type CommandKind = (typeof COMMAND_KINDS)[number]

export interface RotationStep {
    at: number
    command: SimCommand | SimCommand[]
    /** 溯源：产生这些命令的技能 id（core 不解释，仅随配置保留） */
    skillId?: number
}

export interface SimConfig {
    duration: number
    /** 默认 1/60 */
    dt?: number
    seed: number
    actors: ActorConfig[]
    enemies?: EnemyConfig[]
    /** 时间 → 纯命令序列（U5 也可直接调用 `sim.schedule`） */
    rotation?: RotationStep[]
    /** 主目标；缺省取第一个存活敌人 */
    primaryTargetId?: string
    /** 伤害 oracle；带 `amount` 的伤害命令不需要 */
    oracle?: DamageOracle
    /** buffId → 默认刷新策略（缺省 refresh） */
    buffPolicies?: Record<string, BuffPolicy>
    /** buffId → 最大叠层（缺省不限） */
    maxStacks?: Record<string, number>
}

// ---------------------------------------------------------------------------
// 事件（输出）
// ---------------------------------------------------------------------------

export type EntityKind = "actor" | "target"

export interface SimEventBase {
    at: number
    /** 全局单调事件序号 */
    seq: number
}

export interface DamageEvent extends SimEventBase {
    kind: "damage"
    actorId: string
    targetId: string
    skillField: string
    tag: string
    /** oracle 原始伤害 */
    raw: number
    /** 实际造成（护盾吸收 + 扣血） */
    effective: number
    shieldAbsorb: number
    hpLoss: number
    overkill: number
    hpAfter: number
    shieldAfter: number
    /** oracle 返回的伤害类型（normal / crit / dot / ...） */
    damageKind: string
}

export interface BuffApplyEvent extends SimEventBase {
    kind: "buff-apply"
    entityKind: EntityKind
    entityId: string
    sourceId: string
    buffId: number | string
    instanceId: number
    stacks: number
    duration: number
    expiresAt: number
    policy: BuffPolicy
    /** replace 策略下被替换的旧层数 */
    replaced: boolean
}

export interface BuffExpireEvent extends SimEventBase {
    kind: "buff-expire"
    entityKind: EntityKind
    entityId: string
    buffId: number | string
    instanceId: number
    stacks: number
    reason: "expired" | "removed" | "replaced"
}

export interface ResourceEvent extends SimEventBase {
    kind: "resource"
    actorId: string
    resource: string
    /** 实际变化量（clamp 后） */
    delta: number
    /** 请求的变化量 */
    requested: number
    before: number
    after: number
}

export interface CastEvent extends SimEventBase {
    kind: "cast"
    actorId: string
    skillId: number | string
    cooldown: number
    readyAt: number
    costs: { resource: string; amount: number }[]
}

export interface DeathEvent extends SimEventBase {
    kind: "death"
    targetId: string
    killerId: string
    skillField: string
}

export interface TargetSelectEvent extends SimEventBase {
    kind: "target-select"
    actorId: string
    store: string
    filter: TargetFilter["kind"]
    targetIds: string[]
}

export interface SpawnEvent extends SimEventBase {
    kind: "spawn"
    targetId: string
}

export interface DespawnEvent extends SimEventBase {
    kind: "despawn"
    targetId: string
    reason: string
}

export interface MoveEvent extends SimEventBase {
    kind: "move"
    entityKind: EntityKind
    entityId: string
    position: Vec2
}

export type SimEvent =
    | DamageEvent
    | BuffApplyEvent
    | BuffExpireEvent
    | ResourceEvent
    | CastEvent
    | DeathEvent
    | TargetSelectEvent
    | SpawnEvent
    | DespawnEvent
    | MoveEvent

export const SIM_EVENT_KINDS = [
    "damage",
    "buff-apply",
    "buff-expire",
    "resource",
    "cast",
    "death",
    "target-select",
    "spawn",
    "despawn",
    "move",
] as const
export type SimEventKind = (typeof SIM_EVENT_KINDS)[number]

// ---------------------------------------------------------------------------
// trace / summary
// ---------------------------------------------------------------------------

export interface ActorFrameSample {
    actorId: string
    /** 自上一采样点以来该 actor 造成的有效伤害 */
    damageDelta: number
    resources: Record<string, ResourcePool>
    buffCount: number
    /** 冷却剩余秒数 */
    cooldowns: Record<string, number>
    alive: boolean
}

export interface TargetFrameSample {
    targetId: string
    hp: number
    maxHp: number
    shield: number
    /** 自上一采样点以来该 target 受到的有效伤害 */
    damageDelta: number
    buffCount: number
    alive: boolean
}

export interface FrameSample {
    t: number
    actors: ActorFrameSample[]
    targets: TargetFrameSample[]
}

export interface SimSummary {
    duration: number
    totalDamage: number
    dps: number
    perSkill: Record<string, number>
    perActor: Record<string, number>
    perTarget: Record<string, number>
    damageEvents: number
    events: number
    frames: number
}

export interface SimResult {
    seed: number
    duration: number
    dt: number
    frames: FrameSample[]
    events: SimEvent[]
    summary: SimSummary
}
