/**
 * IR 运行时（U5）的公共形状：选项 / 施法结果 / 激活技能 / 诊断。
 *
 * 运行时只消费 `SkillBehaviorDoc`（U3 契约）与 U4 的 `Simulation`：不读导出器 JSON、
 * 不加载 `packages/data`、不渲染。所有「不能执行」的东西都进 `RuntimeDiagnostic`，不静默。
 *
 * 时间口径：`cast(skillId, at)` 的 `at` 是模拟起点起的绝对秒数；`Phase.at` / `Phase.until`
 * 相对施法开始（IR 契约），运行时负责换算成绝对时刻。
 */

import type { Rng } from "../core/rng"
import type { Simulation } from "../core/simulation"
import type { SimResult } from "../core/types"
import type { ResourceCost, SkillBehaviorDoc } from "../schema/ir"

/** 重复施放已激活技能时的策略；`toggle-off` 用于开关型技能（黎瑟 Q），默认 fail */
export type RecastPolicy = "fail" | "toggle-off"

export interface SkillRuntimeOptions {
    simulation: Simulation
    doc: SkillBehaviorDoc
    actorId: string
    /** 缺省从 `simulation.rng` 按 actor fork（同 seed 恒定） */
    rng?: Rng
    onDiagnostic?: (diagnostic: RuntimeDiagnostic) => void
    /** 缺省 "fail" */
    recastPolicy?: RecastPolicy
}

export type CastFailureReason = "unknown-skill" | "actor-dead" | "cooldown" | "resource" | "active" | "time"

export interface MissingResource {
    resource: string
    required: number
    available: number
}

export interface CastResult {
    ok: boolean
    skillId: number | string
    /** 施法开始时刻（绝对秒） */
    at: number
    reason?: CastFailureReason
    message?: string
    /** reason="cooldown" 时可再次施放时刻 */
    readyAt?: number
    /** reason="resource" 时缺口的资源池 */
    missing?: MissingResource[]
    /** 排程的动作调用数（相位 × tick 展开后的次数） */
    invocations: number
    /** 前摇结束时刻（at + cast.time） */
    castEndAt: number
    /** 最后一个动作调用时刻；无相位时等于 castEndAt */
    endsAt: number
    /** `cast.costs` 中 `perSecond` 的部分：运行时不扣，由 IR 的 tick 相位建模 */
    sustained: ResourceCost[]
    /** at > 当前时钟：校验与排程延后到该时刻（失败走 `cast-failed` 诊断） */
    deferred?: boolean
    /** recastPolicy="toggle-off" 且关闭了已激活实例 */
    toggledOff?: boolean
}

/** montage / authored 时间窗（IR 未提供时为空，不臆造） */
export interface SkillWindow {
    kind: "cancel" | "combo" | "move"
    begin: number
    end: number
}

export interface ActiveSkill {
    skillId: number
    castAt: number
    castEndAt: number
    endsAt: number
    canMove: boolean
    /** `provenance.inertNotifies` 里有取消 notify */
    cancelable: boolean
    /** `provenance.inertNotifies` 里有连段 notify */
    combo: boolean
    cancelled: boolean
    /** 已排程的动作调用数 */
    invocations: number
    windows: SkillWindow[]
}

export type RuntimeDiagnosticSeverity = "info" | "warn" | "error"

interface DiagnosticBase {
    skillId: number | string
    /** 触发时刻（绝对秒）；施法前诊断缺省 */
    at?: number
    severity: RuntimeDiagnosticSeverity
    message: string
    /** 同一诊断去重后的出现次数（默认 1，由 `diagnostics()` 补齐） */
    occurrences?: number
}

/** 不可执行、仅溯源的调用（未知或已知但不建模的 native） */
export interface NativeDiagnostic extends DiagnosticBase {
    kind: "native"
    fn: string
    args: unknown[]
    /** `provenance.nativeCalls` 是否登记；缺省视为未知 */
    known: boolean
    mapped: boolean
}

/** 条件无法解释：相位被跳过 / 分支两侧都不执行 */
export interface OpaqueConditionDiagnostic extends DiagnosticBase {
    kind: "opaque-condition"
    ref: string
    where: "phase" | "branch"
}

/** IR 无法表达的行为（如 self 作为伤害目标、召唤物 AI、死亡传递） */
export interface UnsupportedDiagnostic extends DiagnosticBase {
    kind: "unsupported"
    feature: string
    detail?: string
}

/** `cast.costs` 的 perSecond 项：运行时不扣，需要 IR tick 相位建模 */
export interface SustainedCostDiagnostic extends DiagnosticBase {
    kind: "sustained-cost"
    resource: string
    amount: number
}

/** 召唤只创建占位实体（id/owner/duration），不模拟 AI / 属性 / 阵营 */
export interface SummonDiagnostic extends DiagnosticBase {
    kind: "summon"
    creatureId: number
    targetId: string
    placeholder: true
}

/** 调用时刻落在模拟时长之外，被裁剪 */
export interface ClippedDiagnostic extends DiagnosticBase {
    kind: "phase-clipped"
    detail: string
}

export interface UnknownSkillDiagnostic extends DiagnosticBase {
    kind: "unknown-skill"
}

/** 延后施法在实际时刻校验失败（资源/冷却/已激活） */
export interface CastFailedDiagnostic extends DiagnosticBase {
    kind: "cast-failed"
    reason: CastFailureReason
}

export type RuntimeDiagnostic =
    | NativeDiagnostic
    | OpaqueConditionDiagnostic
    | UnsupportedDiagnostic
    | SustainedCostDiagnostic
    | SummonDiagnostic
    | ClippedDiagnostic
    | UnknownSkillDiagnostic
    | CastFailedDiagnostic

export const RUNTIME_DIAGNOSTIC_KINDS = [
    "native",
    "opaque-condition",
    "unsupported",
    "sustained-cost",
    "summon",
    "phase-clipped",
    "unknown-skill",
    "cast-failed",
] as const
export type RuntimeDiagnosticKind = (typeof RUNTIME_DIAGNOSTIC_KINDS)[number]

export interface SkillRuntime {
    readonly simulation: Simulation
    /** 校验（资源 / 冷却 / 已激活）并排程；`at` 缺省 = 当前时钟 */
    cast(skillId: number | string, at?: number): CastResult
    /** 当前激活（未取消、未结束）的技能 */
    active(): ActiveSkill[]
    diagnostics(): RuntimeDiagnostic[]
    /** 便利：推进一帧（回调在 core 的事件队列内执行，无需 pump） */
    step(): boolean
    /** 便利：跑到结束并返回 SimResult */
    run(): SimResult
    /** 尚未执行的动作调用数（调试 / 断言用） */
    pending(): number
}
