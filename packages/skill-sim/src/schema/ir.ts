/**
 * SkillBehaviorIR —— 可运行的行为契约（PLAN §2.2）。
 *
 * 定位：由 `pipeline/build` 把「导出器证据 + packages/data」归一成的时间轴，
 * 运行时（U4/U5）只解释本契约，不再读字节码 / montage / lua 原文。
 * 所有字段语义以秒为单位；`phase.at` 相对施法开始。
 */

export const SKILL_SLOTS = ["E", "Q", "P", "A", "T", "R", "S", "unknown"] as const
export type SkillSlot = (typeof SKILL_SLOTS)[number]

/**
 * 行为来源：
 * - `montage`：montage notify / branching point / segment 时间轴；
 * - `blueprint`：蓝图字节码（含事件入口与 CallMath 调用）；
 * - `lua`：导出器的 Lua `行为` / `SkillEffects` / `Buff` 证据；
 * - `manual`：authored override（人工语义，U7 的复杂机制）；
 * - `hybrid`：以上多路合并后的标记（只在 `sources` 里出现）。
 */
export const BEHAVIOR_SOURCES = ["montage", "blueprint", "lua", "manual", "hybrid"] as const
export type BehaviorSource = (typeof BEHAVIOR_SOURCES)[number]

export interface SkillBehaviorDoc {
    schemaVersion: 1
    /** 导出器记录的游戏版本（仅溯源，不参与计算） */
    gameVersion: string
    exporter?: SkillDocExporterInfo
    characters: CharacterBehavior[]
    skills: Record<string, SkillBehavior>
    buffs: Record<string, BuffBehavior>
    coverage: CoverageReport
}

export interface SkillDocExporterInfo {
    gitCommit?: string
    parserVersion?: number
    gameVersion?: string
}

export interface CharacterBehavior {
    id: number
    /** 导出器的 i18n key 或角色名，仅用于展示 */
    nameKey: string
    skills: number[]
}

export interface ResourceCost {
    resource: string
    amount: number
    /** 施法期间每秒持续消耗（如「每秒神智消耗」） */
    perSecond?: boolean
}

export interface CastSpec {
    /** 施法前摇（秒）：来自 montage 首个有效 notify 或 authored */
    time: number
    cooldown: number
    costs: ResourceCost[]
    canMove: boolean
}

export interface SkillBehavior {
    id: number
    /** 武器 / MOD 技能为 0（不绑定角色） */
    characterId: number
    slot: SkillSlot
    cast: CastSpec
    /** 按 at 升序；tick 相位由运行时展开为重复事件 */
    phases: Phase[]
    sources: BehaviorSource[]
    provenance?: BehaviorProvenance
}

export interface BehaviorProvenance {
    bpPackages: string[]
    nativeCalls: NativeCall[]
    unmatchedNotify: string[]
    /** 已识别但无对应 IR 动作的 notify（取消 / 连段窗口等） */
    inertNotifies?: string[]
    /** montage 总时长（秒） */
    montageLength?: number
    branchingPoints?: BranchingPoint[]
    /** 无法解析成动作的 Lua 语句原文（不静默丢弃） */
    unparsedLua?: string[]
}

export interface BranchingPoint {
    time: number
    type: string
}

export interface NativeCall {
    fn: string
    args: unknown[]
    /** 是否在 native-map 注册表里登记 */
    known: boolean
    /** 是否已翻译成 IR 动作 */
    mapped: boolean
    source: "blueprint" | "lua"
}

export interface Phase {
    at: number
    until?: number
    tick?: TickSpec
    condition?: Condition
    actions: Action[]
    source?: BehaviorSource
    /** 溯源标签，如 `notify:BP_SkillEffect_C@1.3`、`lua:附加增益(410111)`、`authored` */
    origin?: string
}

export interface TickSpec {
    interval: number
    count?: number
}

interface ActionMeta {
    source?: BehaviorSource
    origin?: string
}

export interface DamageAction extends ActionMeta {
    kind: "damage"
    /** packages/data 技能字段名（CharBuild DamageOracle 按此取倍率） */
    field: string
    /** 伤害标签（与 packages/data 字段 tag 同口径；未知时为空串） */
    tag: string
    hits: HitSpec
    target: TargetSpec
}

export interface ApplyBuffAction extends ActionMeta {
    kind: "applyBuff"
    buffId: number | string
    level?: number
    duration?: number
    stacks?: number
    target: TargetSpec
}

/** IR 扩展：PLAN §2.2 的 Action 未覆盖移除增益，但 Lua/Buff 证据里必然出现 */
export interface RemoveBuffAction extends ActionMeta {
    kind: "removeBuff"
    buffId: number | string
    target: TargetSpec
}

export interface ResourceAction extends ActionMeta {
    kind: "resource"
    resource: string
    delta: number
}

export interface SummonAction extends ActionMeta {
    kind: "summon"
    creatureId: number
    duration?: number
    target?: TargetSpec
}

export interface SelectAction extends ActionMeta {
    kind: "select"
    filter: TargetFilter
    /** 运行时目标存储键，后续 TargetSpec.kind === "stored" 引用 */
    store: string
    count?: number
}

export interface BranchAction extends ActionMeta {
    kind: "branch"
    /**
     * 条件谓词键。运行时登记表定义已知键（`random` / `hasBuff:<id>` /
     * `resourceAtLeast:<resource>:<n>` / `targetCountAtLeast:<n>`）；未知键必须显式报错，不得默认走 then。
     */
    on: string
    then: Action[]
    else?: Action[]
}

/** 不可执行、仅溯源的调用（未知 native / 不建模的副作用） */
export interface NativeAction extends ActionMeta {
    kind: "native"
    fn: string
    args: unknown[]
}

export type Action =
    | DamageAction
    | ApplyBuffAction
    | RemoveBuffAction
    | ResourceAction
    | SummonAction
    | SelectAction
    | BranchAction
    | NativeAction

export const ACTION_KINDS = ["damage", "applyBuff", "removeBuff", "resource", "summon", "select", "branch", "native"] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export interface HitSpec {
    count: number
    interval: number
    tag?: string
}

export type TargetSpec =
    | { kind: "self" }
    | { kind: "primary" }
    | { kind: "stored"; ref: string }
    | { kind: "nearest"; count: number; radius: number }

export const TARGET_KINDS = ["self", "primary", "stored", "nearest"] as const
export type TargetKind = (typeof TARGET_KINDS)[number]

export type TargetFilter =
    | { kind: "nearest"; count?: number; radius?: number }
    | { kind: "random"; count?: number; radius?: number; requiresBuff?: number | string; excludesBuff?: number | string }
    | { kind: "all"; radius?: number }
    | { kind: "primary" }

export const TARGET_FILTER_KINDS = ["nearest", "random", "all", "primary"] as const
export type TargetFilterKind = (typeof TARGET_FILTER_KINDS)[number]

export type Condition =
    | { kind: "hasBuff"; buffId: number | string }
    | { kind: "resourceAtLeast"; resource: string; value: number }
    | { kind: "targetCountAtLeast"; value: number }
    /** 字节码条件无法解释时：运行时不得假装成立，需人工补 authored */
    | { kind: "opaque"; ref: string }

export const CONDITION_KINDS = ["hasBuff", "resourceAtLeast", "targetCountAtLeast", "opaque"] as const
export type ConditionKind = (typeof CONDITION_KINDS)[number]

export interface BuffBehavior {
    id: number | string
    name?: string
    /** 导出器原始 lua 证据（`行为` / effects / buffIds） */
    lua?: unknown
    /** 原始 Buff.json 属性（DotDatas / LastTime 等），归一后可推导 dots */
    props?: Record<string, unknown>
    bpPackages?: string[]
    /** 从 DotDatas 推导的持续效果（resource 型） */
    dots?: BuffDotBehavior[]
    duration?: number
    sources: BehaviorSource[]
}

export interface BuffDotBehavior {
    /** 触发延迟（秒） */
    delay?: number
    interval: number
    resource: string
    delta: number
}

export interface CoverageReport {
    charactersTotal: number
    skillsTotal: number
    skillsWithMontage: number
    skillsWithBlueprint: number
    skillsWithAnimBP: number
    skillsWithLua: number
    skillsAuthored: number
    /** 至少有一个 phase 且至少有一个 action 的技能数 */
    skillsWithBehavior: number
    nativeCallsTotal: number
    nativeCallsUnknown: string[]
    /** Lua SkillEffects 里未登记的 Function */
    unknownTaskFunctions: string[]
    /** 无法映射到任何动作的 notify 名 */
    unmatchedNotifies: string[]
}

export function emptyCoverageReport(): CoverageReport {
    return {
        charactersTotal: 0,
        skillsTotal: 0,
        skillsWithMontage: 0,
        skillsWithBlueprint: 0,
        skillsWithAnimBP: 0,
        skillsWithLua: 0,
        skillsAuthored: 0,
        skillsWithBehavior: 0,
        nativeCallsTotal: 0,
        nativeCallsUnknown: [],
        unknownTaskFunctions: [],
        unmatchedNotifies: [],
    }
}
