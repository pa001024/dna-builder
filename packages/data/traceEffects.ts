import type { CharSettings, CharSkillLevels } from "./charSettings"
import { normalizeCharSkillLevels } from "./charSettings"
import { buffMap, charMap } from "./d"
import type { Buff } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { resolveEffectiveSkillLevels, SKILL_LEVEL_ATTR_KEYS } from "./skillLevels"
import type { TranscendTeamSideContext } from "./transcend"
import type { TranscendSlotGroup } from "./transcendSettings"

/**
 * 角色溯源（U99d/U113/U116）：把原先 52 条手写 `*溯` BUFF 拆成「角色 × 根源」的结构化效果表。
 *
 * 口径：
 * - 每侧以 `traceOffRoots`（关闭的根源序号）决定哪些根源生效，缺省全部激活；旧档的 `traceLevel`
 *   字段只用于迁移（`off = traceLevel+1..max`，显式 0 表示全部关闭）。
 * - `self` 只注入来源侧；`all-teammates` 注入全队（含自身）；`other-teammates` 只注入队友。
 * - `requiresBuff` 只在该侧手动选中了对应 BUFF 时注入（如 1 溯穿透要求持有 `菲娜Q` 追加伤害）。
 * - 属性值支持 `{层数}` / `{元素数}` / `{额外触发数}` / `{溯级}` 占位符；纯数字算术在收集期求值，
 *   其余表达（引用技能字段）原样交给引擎求值。
 * - 有 `mx` 的效果按每侧 `traceStacks`（`[根源, 等级, 覆盖率?]`）缩放：缺省等级 = mx、覆盖率 1；
 *   数值属性 × 等级 × 覆盖率，技能等级与层数上限语义不受缩放（U115）。
 * - 溯源效果以派生 BUFF（`pt = Trace`）注入构筑，不写回 `settings.buffs`，避免双计。
 * - 同一来源侧 + 同一根源的数值效果合并为一条派生 BUFF，名称为 `<角色名><N>溯`（U116）。
 * - 规则（`TraceBuffRule`）按数值条件覆盖受益侧同名手动 BUFF 的字段，不再产生额外增量 BUFF（U116）。
 * - 非菲娜角色的根源原文（`char.溯源[n-1]`）按保守口径解析 `[技能名]等级+N`，并入派生表（U114）。
 */

/** 溯源派生 BUFF 的挂载类型（`LeveledBuff.pt`） */
export const TRACE_BUFF_SOURCE = "Trace"

/** 溯级上限（角色数据决定实际最大值，6/7） */
export const TRACE_LEVEL_MAX = 7

/** 技能等级上限（源数据 `DataConst.MaxSkillLevel`） */
const TRACE_SKILL_LEVEL_MAX = 30

/** 归一化期的等级上限（收集期再按角色实际 `mx` 钳制） */
const TRACE_STACK_LEVEL_MAX = 99

/** 单条溯源层数设置：`[根源序号, 等级, 覆盖率?]`；缺省（无条目）= 该根源按层数上限满层、覆盖率 1 */
export type TraceStack = [number, number, number?]

/** 溯源作用目标 */
export type TraceTarget = "self" | "all-teammates" | "other-teammates" | "heal-target" | "enemy"

/** 溯源提供的技能等级增量（经 `getSkillLevelIndex` 映射到 E/Q/P 槽位） */
export interface TraceSkillLevel {
    skillId: number
    add: number
}

/** 层数上限定义：默认层数 + 指定溯级后的层数 */
export interface TraceLayerDef {
    default: number
    withGrade?: { grade: number; layers: number }[]
}

/** 单条溯源效果 */
export interface TraceEffect {
    charId: number
    grade: number
    /** 展示名（游戏原文或本地建模名） */
    name: string
    target: TraceTarget
    /** 属性表：数字为绝对值；字符串支持占位符或技能字段表达式 */
    attrs?: Record<string, number | string>
    /** 技能等级增量（只对来源侧自身生效） */
    skillLevel?: TraceSkillLevel[]
    /** 层数定义（如 2 溯把梦笔生花上限 30→45） */
    layers?: TraceLayerDef
    /** 可叠加层数上限（等级输入范围 1..mx）；缺省 1 表示无等级控件 */
    mx?: number
    /** 目标侧必须持有该手动 BUFF 时才注入 */
    requiresBuff?: string
    /** `{额外触发数}` 的取值（6 溯，默认沿用旧手写 BUFF 的 5 层口径） */
    stacks?: number
    /** 数值条件规则：命中后覆盖受益侧同名手动 BUFF 的字段（不产生增量 BUFF） */
    rules?: TraceBuffRule[]
    note?: string
    /** 明确未建模的子效果 */
    unmodeled?: boolean
}

/** 规则判定来源：来源侧溯源等级 / 有效技能等级；`attr` 预留给属性值（当前不支持） */
export type TraceConditionSource =
    | { kind: "traceLevel" }
    | { kind: "skillLevel"; slot: 0 | 1 | 2 }
    | { kind: "attr"; key: string; side: "source" | "target" }

/** 单条数值条件 */
export interface TraceCondition {
    source: TraceConditionSource
    op: ">=" | ">" | "<=" | "<" | "==" | "!="
    value: number
}

/** 规则判定上下文（来源侧） */
export interface TraceConditionContext {
    /** 来源侧最高生效根源（0..max） */
    traceLevel: number
    /** 来源侧有效技能等级 `[E, Q, P]`（基础 + 升华 + 溯源增量，钳 1-30） */
    skillLevel: CharSkillLevels
}

/**
 * 溯源规则：条件全部命中且该侧持有 `target` 手动 BUFF 时，用 `attrs` 覆盖其同名字段。
 * 规则归属 `grade`：该根源关闭时整条失效。
 */
export interface TraceBuffRule {
    charId: number
    /** 规则归属根源（关闭时整条失效） */
    grade: number
    /** 目标手动 BUFF 名称（按受益侧查找，如 `菲娜被动(团队)`） */
    target: string
    /** 命中后覆盖目标 BUFF 的同名字段（数字或技能字段表达式） */
    attrs: Record<string, number | string>
    when: TraceCondition[]
    /** 规则作用范围（同 `TraceEffect.target`），缺省 `all-teammates` */
    scope?: TraceTarget
    note?: string
}

/** 一条生效的字段覆盖（由规则求值产出，TS 与 wasm 请求副本共用） */
export interface TraceBuffOverride {
    /** 目标 BUFF 名称 */
    target: string
    /** 覆盖字段 */
    attrs: Record<string, number | string>
    /** 规则来源角色 / 根源 / 构筑位（排查与展示用） */
    charId?: number
    grade?: number
    ownerSide?: TranscendSlotGroup
    note?: string
}

/** 溯源注入结果（与 `TranscendEffects` 同构的可并集子集） */
export interface TraceEffects {
    buffs: LeveledBuff[]
    warnings: string[]
    /** 命中条件的字段覆盖（按受益侧收集） */
    buffOverrides: TraceBuffOverride[]
}

/** 溯源收集所需的设置投影（兼容 `CharSettings` 与升华构筑设置） */
export interface TraceSideSettings {
    /** 旧溯级：只用于迁移为 `traceOffRoots`（缺省视作满溯） */
    traceLevel?: number
    /** 关闭的根源序号（1..该角色最大根源）；缺省 = 全部激活 */
    traceOffRoots?: number[]
    /** 层数 / 覆盖率设置；缺省 = 全部按 `mx` 满层、覆盖率 1 */
    traceStacks?: TraceStack[]
    /** 基础技能等级（规则判定 `skillLevel` 条件用；缺省按默认 10 级） */
    charSkillLevel?: CharSkillLevels | number | readonly number[]
    enabled?: boolean
    buffs?: readonly [string, number, number?][]
}

export interface TraceSettingsSource {
    /** 旧溯级：只用于迁移为 `traceOffRoots`（缺省视作满溯） */
    traceLevel?: number
    /** 关闭的根源序号（1..该角色最大根源）；缺省 = 全部激活 */
    traceOffRoots?: number[]
    /** 层数 / 覆盖率设置；缺省 = 全部按 `mx` 满层、覆盖率 1 */
    traceStacks?: TraceStack[]
    /** 主控基础技能等级（规则判定 `skillLevel` 条件用） */
    charSkillLevel?: CharSkillLevels | number | readonly number[]
    /** 升华配置（规则判定使用其技能等级增量） */
    transcend?: Partial<CharSettings["transcend"]> | null
    buffs?: readonly [string, number, number?][]
    main?: {
        traceLevel?: number
        traceOffRoots?: number[]
        traceStacks?: TraceStack[]
        charSkillLevel?: CharSkillLevels | number | readonly number[]
    } | null
    team1?: string | number
    team2?: string | number
    assist1?: TraceSideSettings | null
    assist2?: TraceSideSettings | null
}

/** 收集选项 */
export interface TraceCollectOptions {
    /** 主控角色 id（无 `teamSides` 时用于主控侧） */
    charId?: number
    /** 三侧团队上下文：缺省时按 settings 的 team1/team2 推断 */
    teamSides?: readonly TranscendTeamSideContext[]
    /** 覆盖某侧的手动 BUFF 名称来源（升华构筑设置为全局 BUFF 列表） */
    buffNames?: Partial<Record<TranscendSlotGroup, readonly string[]>>
    /** 各来源侧的升华技能等级增量（规则判定 `skillLevel` 条件时按需取值；缺省按 0） */
    transcendSkillLevelBonus?: (side: TranscendSlotGroup) => CharSkillLevels
    /** 额外规则（测试注入 / 外部扩展）：与效果表内规则同口径求值，仅作用于 `charId` 相同的来源侧 */
    extraRules?: readonly TraceBuffRule[]
}

const FEINA_ID = 1801

/** 菲娜被动（团队）BUFF：2 溯源规则把增伤覆盖为 45 层 */
export const FEINA_PASSIVE_TEAM_BUFF = "菲娜被动(团队)"

/** 菲娜被动（自身）BUFF：2 溯源规则把光追伤覆盖为 45 层 */
export const FEINA_PASSIVE_SELF_BUFF = "菲娜被动(自身)"

/** 旧手写 `菲娜被动+1溯`（旧档迁移：拆成 1、2 根源 + `菲娜被动(团队)`） */
const FEINA_LEGACY_PASSIVE_TRACE = "菲娜被动+1溯"

/** 已删除数据行的旧存档兼容载体：载入时直接丢弃，数值由 1、2 溯源规则提供 */
const LEGACY_COMPAT_REMNANT_BUFFS: ReadonlySet<string> = new Set(["菲娜被动(团队·旧)", "菲娜1溯(旧)"])

/** 菲娜 2 溯源规则：被动层数 30→45 的字段覆盖 */
const FEINA_PASSIVE_45_RULES: TraceBuffRule[] = [
    {
        charId: FEINA_ID,
        grade: 2,
        target: FEINA_PASSIVE_TEAM_BUFF,
        scope: "all-teammates",
        when: [{ source: { kind: "traceLevel" }, op: ">=", value: 2 }],
        attrs: { 增伤: 0.45 },
        note: "2 溯源：梦笔生花 30→45 层，团队增伤 45%",
    },
    {
        charId: FEINA_ID,
        grade: 2,
        target: FEINA_PASSIVE_SELF_BUFF,
        scope: "self",
        when: [{ source: { kind: "traceLevel" }, op: ">=", value: 2 }],
        attrs: { 光属性追伤: "(坏巫师最怕阳光了::永续追加伤害倍率 + 45*坏巫师最怕阳光了::[梦笔生花]每层追加伤害倍率)" },
        note: "2 溯源：梦笔生花 30→45 层，自身光追伤按 45 层",
    },
]

/** 菲娜精确建模的溯源（研究 §5） */
const FEINA_TRACE_EFFECTS: TraceEffect[] = [
    {
        charId: FEINA_ID,
        grade: 1,
        name: "全属性穿透",
        target: "all-teammates",
        requiresBuff: "菲娜Q",
        attrs: { 属性穿透: "0.06*{元素数}" },
        note: "按目标持有的 Q 追加伤害元素种数（最多 4）计算；无 Q 追加伤害时为 0",
    },
    {
        charId: FEINA_ID,
        grade: 2,
        name: "梦笔生花层数上限 30→45",
        target: "self",
        layers: { default: 30, withGrade: [{ grade: 2, layers: 45 }] },
        note: "层数上限提高；影响 4 溯与被动公式（未建模：E 额外叠层 / 领域每秒叠层）",
        unmodeled: true,
    },
    {
        charId: FEINA_ID,
        grade: 2,
        name: "被动层数联动（数值条件覆盖）",
        target: "self",
        rules: FEINA_PASSIVE_45_RULES,
        note: "2 溯源时覆盖持有侧的 `菲娜被动(团队)` 增伤与 `菲娜被动(自身)` 光追伤，不产生增量 BUFF",
    },
    {
        charId: FEINA_ID,
        grade: 3,
        name: "E 等级 +2 / 被动等级 +1",
        target: "self",
        skillLevel: [
            { skillId: 180101, add: 2 },
            { skillId: 180103, add: 1 },
        ],
    },
    {
        charId: FEINA_ID,
        grade: 4,
        name: "每层技能威力 +2% / 技能范围 +1%",
        target: "self",
        attrs: { 技能威力: "0.02*{层数}", 技能范围: "0.01*{层数}" },
        note: "层数由 2 溯决定（默认 30 / 2 溯 45）",
    },
    {
        charId: FEINA_ID,
        grade: 5,
        name: "Q 等级 +2 / 被动等级 +1",
        target: "self",
        skillLevel: [
            { skillId: 180102, add: 2 },
            { skillId: 180103, add: 1 },
        ],
    },
    {
        charId: FEINA_ID,
        grade: 6,
        name: "属性额外触发·暴击",
        target: "self",
        stacks: 5,
        attrs: { 暴击: "0.24*{额外触发数}" },
        note: "每个属性额外触发效果 +24% 暴击；数量沿用旧手写 BUFF 的 5 层口径，上限未建模；弱点转换未建模",
        unmodeled: true,
    },
]

/** 菲娜精确建模条目的旧名称（不再从通用 `*溯` 表推导） */
const FEINA_EXPLICIT_LEGACY_NAMES = new Set(["菲娜4溯", "菲娜6溯", FEINA_LEGACY_PASSIVE_TRACE])

/** 旧 `*溯` 名称解析 */
const LEGACY_TRACE_NAME = /^(.*?)(\d+)溯$/

/** 无法从名称推导归属的旧条目后缀（多效果合并 / 变体 / 被动升级） */
const LEGACY_UNMAPPED_PATTERN = /[()+±]/

/** 派生溯源表缓存（数据包换入会清空重建 Map，按表体量失效） */
let derivedCache: { key: string; effects: Map<number, TraceEffect[]>; names: Set<string> } | null = null

/**
 * 角色最大溯级：由角色数据 `溯源` 条数推导（6/7）；角色未知或没有溯源时为 0。
 * @param charId 角色 id
 * @returns 最大溯级
 */
export function getMaxTraceLevel(charId: number | undefined): number {
    if (typeof charId !== "number" || !Number.isFinite(charId)) return 0
    const char = charMap.get(charId > 9999 ? Math.trunc(charId / 100) : charId)
    return Math.min(TRACE_LEVEL_MAX, char?.溯源?.length ?? 0)
}

/**
 * 归一化溯级：缺省取该角色最大溯级，钳制 0..max。
 * @param value 原始溯级
 * @param charId 角色 id（决定上限；未知角色按通用上限钳制）
 * @returns 生效溯级
 */
export function clampTraceLevel(value: unknown, charId?: number): number {
    const max = typeof charId === "number" && charId > 0 ? getMaxTraceLevel(charId) : TRACE_LEVEL_MAX
    if (!Number.isFinite(value)) return max
    return Math.max(0, Math.min(max, Math.round(value as number)))
}

/**
 * 归一化关闭的根源列表：整数、去重、升序，只保留 1..该角色最大根源（未知角色按通用上限）。
 * @param value 原始关闭列表
 * @param charId 角色 id（决定上限）
 * @returns 关闭的根源序号
 */
export function normalizeTraceOffRoots(value: unknown, charId?: number): number[] {
    const limit = resolveRootLimit(charId)
    if (!Array.isArray(value)) return []
    const roots = new Set<number>()
    for (const entry of value) {
        if (!Number.isFinite(entry)) continue
        const root = Math.round(entry as number)
        if (root >= 1 && root <= limit) roots.add(root)
    }
    return [...roots].sort((left, right) => left - right)
}

/**
 * 解析一侧的关闭根源列表：字段缺失时按旧 `traceLevel` 迁移（`off = traceLevel+1..max`）。
 * @param offRoots 新版字段（关闭的根源序号）
 * @param traceLevel 旧溯级（1..N 生效；缺省视作满溯，显式 0 表示全部关闭）
 * @param charId 角色 id（决定上限）
 * @returns 关闭的根源序号
 */
export function resolveTraceOffRoots(offRoots: unknown, traceLevel: unknown, charId?: number): number[] {
    if (Array.isArray(offRoots)) return normalizeTraceOffRoots(offRoots, charId)
    const knownMax = resolveKnownMax(charId)
    const limit = knownMax > 0 ? knownMax : TRACE_LEVEL_MAX
    const grade = clampTraceLevel(traceLevel, knownMax > 0 ? charId : undefined)
    const off: number[] = []
    for (let root = grade + 1; root <= limit; root++) off.push(root)
    return off
}

/**
 * 激活集合中的最高根源（旧 `traceLevel` 口径：0 表示全部关闭）。
 * @param offRoots 关闭的根源序号
 * @param charId 角色 id（决定上限）
 * @returns 最高激活根源
 */
export function resolveHighestActiveRoot(offRoots: readonly number[], charId?: number): number {
    const limit = resolveRootLimit(charId)
    const off = new Set(offRoots)
    let grade = 0
    for (let root = 1; root <= limit; root++) {
        if (!off.has(root)) grade = root
    }
    return grade
}

/**
 * 翻转一侧某根源的激活状态，返回新的关闭列表（不改入参）。
 * @param target 该侧设置（读 `traceOffRoots` / 旧 `traceLevel`）
 * @param root 根源序号
 * @param active 目标激活状态
 * @param charId 角色 id（决定上限）
 * @returns 新的关闭根源列表
 */
export function setTraceRootActive(
    target: { traceOffRoots?: number[]; traceLevel?: number } | null | undefined,
    root: number,
    active: boolean,
    charId?: number
): number[] {
    const off = new Set(resolveTraceOffRoots(target?.traceOffRoots, target?.traceLevel, charId))
    if (active) off.delete(root)
    else off.add(root)
    return normalizeTraceOffRoots([...off], charId)
}

/**
 * 归一化层数 / 覆盖率设置：根源取整数并按角色根源上限过滤，等级钳 1..99，
 * 覆盖率钳 0..1 且保留 6 位小数（1 时省略第三项）；同根源去重取最后一条，按根源升序。
 * 非法项（非数组 / 根源或等级非有限数 / 越界根源）直接丢弃。
 * @param value 原始设置
 * @param charId 角色 id（决定根源上限；未知角色按通用上限 7）
 * @returns 归一化后的层数设置
 */
export function normalizeTraceStacks(value: unknown, charId?: number): TraceStack[] {
    const limit = resolveRootLimit(charId)
    if (!Array.isArray(value)) return []
    const entries = new Map<number, TraceStack>()
    for (const entry of value) {
        if (!Array.isArray(entry)) continue
        const [rawRoot, rawLevel, rawCoverage] = entry as unknown[]
        if (!Number.isFinite(rawRoot) || !Number.isFinite(rawLevel)) continue
        const root = Math.round(rawRoot as number)
        if (root < 1 || root > limit) continue
        const level = Math.max(1, Math.min(TRACE_STACK_LEVEL_MAX, Math.round(rawLevel as number)))
        const coverage =
            typeof rawCoverage === "number" && Number.isFinite(rawCoverage) ? Math.max(0, Math.min(1, Number(rawCoverage.toFixed(6)))) : 1
        entries.set(root, coverage >= 1 ? [root, level] : [root, level, coverage])
    }
    return [...entries.values()].sort((left, right) => left[0] - right[0])
}

/**
 * 读取某根源的生效等级与覆盖率：缺省等级 = `mx`（无 mx 恒 1），等级钳 1..mx，覆盖率钳 0..1。
 * @param stacks 该侧的层数设置
 * @param root 根源序号
 * @param mx 该效果的层数上限
 * @returns 生效等级与覆盖率
 */
export function resolveTraceStackValue(
    stacks: readonly TraceStack[] | undefined,
    root: number,
    mx?: number
): { level: number; coverage: number } {
    const maxLevel = typeof mx === "number" && Number.isFinite(mx) && mx > 1 ? Math.round(mx) : 1
    let entry: TraceStack | undefined
    for (const item of stacks ?? []) {
        if (Array.isArray(item) && item[0] === root) entry = item
    }
    const level = entry && Number.isFinite(entry[1]) ? Math.max(1, Math.min(maxLevel, Math.round(entry[1] as number))) : maxLevel
    const coverage = entry && typeof entry[2] === "number" && Number.isFinite(entry[2]) ? Math.max(0, Math.min(1, entry[2])) : 1
    return { level, coverage }
}

/**
 * 某根源的默认等级（该根源各效果的 `mx` 最大值；无 mx 为 1）。
 * @param charId 角色 id
 * @param root 根源序号
 * @returns 默认等级
 */
export function resolveDefaultTraceStackLevel(charId: number | undefined, root: number): number {
    if (typeof charId !== "number" || charId <= 0) return 1
    let mx = 1
    for (const effect of getTraceEffects(charId)) {
        if (effect.grade === root) mx = Math.max(mx, Math.round(effect.mx ?? 1))
    }
    return Math.max(1, mx)
}

/**
 * 写入某侧某根源的等级（保留既有覆盖率），返回新的层数设置（不改入参）。
 * @param target 该侧设置
 * @param root 根源序号
 * @param level 目标等级（归一化期钳 1..99，收集期再按 mx 钳制）
 * @param charId 角色 id（决定根源上限）
 * @returns 新的层数设置
 */
export function setTraceStackLevel(
    target: { traceStacks?: TraceStack[] } | null | undefined,
    root: number,
    level: number,
    charId?: number
): TraceStack[] {
    const stacks = normalizeTraceStacks(target?.traceStacks, charId)
    const entry = stacks.find(item => item[0] === root)
    const next = stacks.filter(item => item[0] !== root)
    const merged: TraceStack = entry && entry[2] !== undefined ? [root, level, entry[2]] : [root, level]
    next.push(merged)
    return normalizeTraceStacks(next, charId)
}

/**
 * 写入某侧某根源的覆盖率（保留既有等级；缺省条目按该根源默认等级 `mx` 建档），
 * 返回新的层数设置（不改入参）。
 * @param target 该侧设置
 * @param root 根源序号
 * @param coverage 覆盖率 0-1
 * @param charId 角色 id（决定根源上限与默认等级）
 * @returns 新的层数设置
 */
export function setTraceStackCoverage(
    target: { traceStacks?: TraceStack[] } | null | undefined,
    root: number,
    coverage: number,
    charId?: number
): TraceStack[] {
    const stacks = normalizeTraceStacks(target?.traceStacks, charId)
    const entry = stacks.find(item => item[0] === root)
    const level = entry?.[1] ?? resolveDefaultTraceStackLevel(charId, root)
    const next = stacks.filter(item => item[0] !== root)
    next.push([root, level, coverage])
    return normalizeTraceStacks(next, charId)
}

function resolveKnownMax(charId?: number): number {
    return typeof charId === "number" && charId > 0 ? getMaxTraceLevel(charId) : 0
}

/** 根源序号上限：已知角色取其数据上限，否则按通用上限 7 */
function resolveRootLimit(charId?: number): number {
    const max = resolveKnownMax(charId)
    return max > 0 ? max : TRACE_LEVEL_MAX
}

/**
 * 从旧 `*溯` 名称解析「角色 + 溯级」。
 * @param name BUFF 名称
 * @returns 溯级；不符合 `名称+数字+溯` 或属于多变体 / 合并且无法映射时为 undefined
 */
function parseLegacyTraceGrade(name: string): number | undefined {
    if (LEGACY_UNMAPPED_PATTERN.test(name)) return undefined
    const match = LEGACY_TRACE_NAME.exec(name)
    if (!match) return undefined
    const grade = Number(match[2])
    return Number.isInteger(grade) && grade >= 1 ? grade : undefined
}

/** 技能等级条款：整段必须精确为 `[技能名]等级+N`（可前后空白） */
const TRACE_SKILL_LEVEL_CLAUSE = /^\[([^[\]]+)\]等级\+(\d+)$/

/** 技能等级条款的句末分隔符：同句含条件 / 附加描述时整句跳过 */
const TRACE_SENTENCE_DELIMITERS: ReadonlySet<string> = new Set(["。", "；", "\n"])

/** 技能等级条款的句内并列分隔符 */
const TRACE_PIECE_DELIMITERS: ReadonlySet<string> = new Set(["，", "、"])

/** 溯源原文技能等级解析结果 */
export interface TraceSkillLevelParse {
    skillLevel: TraceSkillLevel[]
    /** 无法映射到角色技能树的技能名（去重） */
    unresolved: string[]
}

/**
 * 括号归一化：`「」` / `【】` 统一为 `[]`。
 * @param text 溯源原文
 * @returns 归一化文本
 */
function normalizeTraceBrackets(text: string): string {
    return text.replace(/[「【]/g, "[").replace(/[」】]/g, "]")
}

/**
 * 按分隔符切分，括号内（技能名）的分隔符不切分，如 `[你好，世界]`。
 * @param text 归一化原文
 * @param delimiters 分隔符集合
 * @returns 切分后的段落
 */
function splitTraceClauses(text: string, delimiters: ReadonlySet<string>): string[] {
    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let index = 0; index < text.length; index++) {
        const char = text[index]
        if (char === "[") depth++
        else if (char === "]") depth = Math.max(0, depth - 1)
        else if (depth === 0 && delimiters.has(char)) {
            parts.push(text.slice(start, index))
            start = index + 1
        }
    }
    parts.push(text.slice(start))
    return parts
}

/** 技能树节点（含子技能）的最小结构 */
interface TraceSkillNode {
    id?: number
    名称?: string
    子技能?: readonly TraceSkillNode[]
}

/**
 * 角色技能树名称索引：顶层优先，子技能补缺（与 `resolveSkillSlotIndex` 的槽位口径一致）。
 * @param charId 角色 id
 * @returns 技能名 → 技能 id
 */
function buildSkillNameIndex(charId: number): Map<string, number> {
    const index = new Map<string, number>()
    const skills = charMap.get(charId)?.技能 as readonly TraceSkillNode[] | undefined
    const add = (node: TraceSkillNode) => {
        if (typeof node.名称 === "string" && typeof node.id === "number" && !index.has(node.名称)) index.set(node.名称, node.id)
    }
    for (const node of skills ?? []) add(node)
    const visit = (nodes: readonly TraceSkillNode[] | undefined) => {
        for (const node of nodes ?? []) {
            add(node)
            visit(node.子技能)
        }
    }
    for (const node of skills ?? []) visit(node.子技能)
    return index
}

/**
 * 解析一条溯源原文里的技能等级条款（保守口径）：按句切分，句中每段都必须是
 * `[技能名]等级+N` 才采纳；含条件 / 附加描述（`释放X时`、`同时` 等）的整句跳过。
 * @param charId 角色 id（决定技能名索引）
 * @param text 溯源原文
 * @returns 技能等级增量与无法映射的技能名
 */
export function parseTraceSkillLevelText(charId: number, text: string): TraceSkillLevelParse {
    const result: TraceSkillLevelParse = { skillLevel: [], unresolved: [] }
    if (!text) return result
    const index = buildSkillNameIndex(charId)
    for (const sentence of splitTraceClauses(normalizeTraceBrackets(text), TRACE_SENTENCE_DELIMITERS)) {
        if (!sentence.includes("等级")) continue
        const pieces = splitTraceClauses(sentence, TRACE_PIECE_DELIMITERS)
            .map(piece => piece.trim())
            .filter(piece => piece.length > 0)
        const names: { name: string; add: number }[] = []
        let clean = true
        for (const piece of pieces) {
            const match = TRACE_SKILL_LEVEL_CLAUSE.exec(piece)
            const add = match ? Number(match[2]) : Number.NaN
            if (!match || !Number.isInteger(add) || add <= 0) {
                clean = false
                break
            }
            names.push({ name: match[1].trim(), add })
        }
        if (!clean) continue
        for (const entry of names) {
            const skillId = index.get(entry.name)
            if (skillId === undefined) {
                if (!result.unresolved.includes(entry.name)) result.unresolved.push(entry.name)
                continue
            }
            if (result.skillLevel.some(item => item.skillId === skillId && item.add === entry.add)) continue
            result.skillLevel.push({ skillId, add: entry.add })
        }
    }
    return result
}

/**
 * 从一条溯源原文解析技能等级增量（同一根源内按 `skillId + add` 去重）。
 * @param charId 角色 id
 * @param text 溯源原文
 * @returns 技能等级增量
 */
export function deriveSkillLevelFromTraceText(charId: number, text: string): TraceSkillLevel[] {
    return parseTraceSkillLevelText(charId, text).skillLevel
}

/**
 * 把解析出的技能等级并入效果：同技能不同增量累加，完全相同的 `skillId + add` 去重。
 * @param effect 目标效果
 * @param incoming 解析出的技能等级
 */
function mergeTraceSkillLevels(effect: TraceEffect, incoming: readonly TraceSkillLevel[]): void {
    const list = effect.skillLevel ?? []
    for (const entry of incoming) {
        const existing = list.find(item => item.skillId === entry.skillId)
        if (!existing) {
            list.push({ ...entry })
            continue
        }
        if (existing.add !== entry.add) existing.add += entry.add
    }
    effect.skillLevel = list
}

/**
 * 把角色溯源原文里的技能等级并入派生表：已有该根源的派生效果则合并，
 * 否则新建仅 `skillLevel` 的条目；菲娜走精确表，不参与派生。
 * @param effects 派生溯源表（原地修改）
 */
function mergeDerivedTraceSkillLevels(effects: Map<number, TraceEffect[]>): void {
    const visited = new Set<number>()
    for (const char of charMap.values()) {
        if (typeof char?.id !== "number" || visited.has(char.id)) continue
        visited.add(char.id)
        if (char.id === FEINA_ID || !char.溯源?.length) continue
        for (const [index, text] of char.溯源.entries()) {
            const root = index + 1
            const { skillLevel } = parseTraceSkillLevelText(char.id, text)
            if (!skillLevel.length) continue
            const list = effects.get(char.id) ?? []
            const target = list.find(effect => effect.grade === root)
            if (target) {
                mergeTraceSkillLevels(target, skillLevel)
                continue
            }
            list.push({
                charId: char.id,
                grade: root,
                name: `第${root}根源`,
                target: "self",
                skillLevel,
                note: "由角色溯源原文解析",
            })
            effects.set(char.id, list)
        }
    }
}

/**
 * 从旧 `*溯` 手写 BUFF 推导溯源表：数值取该 BUFF 1 级（每层）物化值并保留 `mx`，默认满层与旧行为一致；
 * 表达式 / 多变体 / 合并条目保持 legacy 手选（见报告）。
 * 另将角色溯源原文中的技能等级条款并入（U114，菲娜除外）。
 * @returns charId → 溯源效果；以及可迁移的旧 BUFF 名称集合
 */
function getDerivedTraceTable(): { effects: Map<number, TraceEffect[]>; names: Set<string> } {
    const key = `${buffMap.size}:${charMap.size}`
    if (derivedCache?.key === key) return derivedCache
    const effects = new Map<number, TraceEffect[]>()
    const names = new Set<string>()
    for (const buff of buffMap.values()) {
        if (FEINA_EXPLICIT_LEGACY_NAMES.has(buff.名称)) continue
        const grade = parseLegacyTraceGrade(buff.名称)
        if (grade === undefined) continue
        if (typeof buff.id !== "number" || !charMap.has(buff.id)) continue
        if (grade > getMaxTraceLevel(buff.id)) continue
        const attr = buff.attr
        if (!attr || !Object.keys(attr).length) continue
        // 含技能字段表达式 / 纯展示行的条目无法固化为溯源数值：保持 legacy 手选
        if (Object.values(attr).some(value => typeof value === "string")) continue
        // 每层数值取 1 级物化结果；层数上限随 `mx` 带入，默认等级 = mx（与旧默认满层表现一致）
        const leveled = new LeveledBuff(buff, 1)
        const attrs: Record<string, number> = {}
        for (const [property, value] of Object.entries(leveled.getProperties())) {
            if (Number.isFinite(value) && value !== 0) attrs[property] = value
        }
        if (!Object.keys(attrs).length) continue
        const mx = typeof buff.mx === "number" && buff.mx > 1 ? Math.round(buff.mx) : undefined
        const effect: TraceEffect = {
            charId: buff.id,
            grade,
            name: buff.名称,
            target: "self",
            attrs,
            ...(mx !== undefined ? { mx } : {}),
            note: "由旧 *溯 手写 BUFF 迁移：数值取旧条目每层值，等级上限取旧条目 mx（默认满层）",
        }
        const list = effects.get(buff.id) ?? []
        list.push(effect)
        effects.set(buff.id, list)
        names.add(buff.名称)
    }
    mergeDerivedTraceSkillLevels(effects)
    for (const list of effects.values()) list.sort((left, right) => left.grade - right.grade)
    derivedCache = { key, effects, names }
    return derivedCache
}

/**
 * 读取某角色的全部溯源效果（精确建模 + 旧手写 BUFF 迁移），按溯级升序。
 * @param charId 角色 id
 * @returns 溯源效果列表；无溯源时为空
 */
export function getTraceEffects(charId: number): TraceEffect[] {
    const derived = charId === FEINA_ID ? [] : (getDerivedTraceTable().effects.get(charId) ?? [])
    const explicit = charId === FEINA_ID ? FEINA_TRACE_EFFECTS : []
    return [...explicit, ...derived].sort((left, right) => left.grade - right.grade)
}

/**
 * 是否为已迁移进溯源表的旧 `*溯` BUFF（选择器隐藏 / 注入跳过 / 存档迁移）。
 * 注意：无法映射的旧条目（多变体、表达式、合并条目）仍保持 legacy 可选，不在本集合内。
 * @param name BUFF 名称
 * @returns 是否已迁移
 */
export function isMappedLegacyTraceBuff(name: string): boolean {
    if (FEINA_EXPLICIT_LEGACY_NAMES.has(name)) return true
    if (parseLegacyTraceGrade(name) === undefined) return false
    return getDerivedTraceTable().names.has(name)
}

/**
 * 是否为无法映射、需保留手选的旧 `*溯` 条目（用于一次提示）。
 * @param name BUFF 名称
 * @returns 是否无法映射
 */
export function isUnmappedLegacyTraceBuff(name: string): boolean {
    if (!name.endsWith("溯")) return false
    return !isMappedLegacyTraceBuff(name) && name !== FEINA_LEGACY_PASSIVE_TRACE
}

/**
 * 是否从通用 BUFF 选择器隐藏：已迁入结构化溯源表的旧条目由溯源区与存档迁移生成。
 * @param name BUFF 名称
 * @returns 是否隐藏
 */
export function isHiddenLegacyTraceBuff(name: string): boolean {
    return isMappedLegacyTraceBuff(name)
}

/**
 * 是否为「已由溯源区接管」的条目的本侧副本：属于本侧角色时构筑工厂不再注入，避免双计。
 * 其他角色的旧条目仍可手选（历史构筑允许跨角色借用溯源数值）。
 * @param name BUFF 名称
 * @param charId 本侧角色 id
 * @returns 是否跳过注入
 */
export function isOwnLegacyTraceBuff(name: string, charId: number | undefined): boolean {
    if (!isHiddenLegacyTraceBuff(name)) return false
    const ownerId = buffMap.get(name)?.id
    return typeof charId === "number" && charId > 0 && ownerId === charId
}

/** 旧条目提示去重（每个名称每进程提示一次） */
const warnedLegacyTraceNames = new Set<string>()

/**
 * 对无法映射的旧 `*溯` 条目提示一次，避免静默丢弃 / 隐藏构筑能力。
 * @param names 条目名称
 */
export function warnUnmappedLegacyTraceBuffs(names: readonly string[]): void {
    for (const name of names) {
        if (warnedLegacyTraceNames.has(name)) continue
        warnedLegacyTraceNames.add(name)
        console.warn(`[trace] 无法映射的旧溯源条目保持手选：${name}`)
    }
}

/** 旧 BUFF 迁移结果 */
export interface LegacyTraceMigration {
    buffs: [string, number, number?][]
    /** 迁移出的最高溯级（0 表示没有迁移任何条目） */
    grade: number
    /** 是否由 `菲娜被动+1溯` 拆出团队增伤条目 */
    passiveTeam: boolean
    /** 无法映射、原样保留的条目 */
    unmapped: string[]
}

/**
 * 迁移一侧的旧 `*溯` BUFF：能映射到本侧角色的写入溯级并从 BUFF 列表移除；
 * `菲娜被动+1溯` 与已删除的 `*旧` 载体拆成 `菲娜被动(团队)` 并启用 1、2 根源；
 * 无法映射 / 属于其他角色的条目保留并返回供提示。
 * 主控在归一化期没有角色 id（`charId` 缺省）：只累计溯级、不删除条目，
 * 改由构筑工厂按「条目 id === 本侧角色 id」跳过注入，避免双计的同时保留跨角色借用的历史构筑。
 * 数据表未就绪（安全模式 / 缺包）时原样返回，等下次载入重试。
 * @param list 该侧手动 BUFF 列表
 * @param charId 该侧角色 id；缺省（主控在归一化期未知）时保留全部条目
 * @returns 迁移结果
 */
export function migrateLegacyTraceBuffs(list: readonly [string, number, number?][], charId?: number): LegacyTraceMigration {
    if (!list.length || buffMap.size === 0 || charMap.size === 0) {
        return { buffs: [...list], grade: 0, passiveTeam: false, unmapped: [] }
    }
    const ownId = typeof charId === "number" && charId > 0 ? charId : undefined
    /** 条目是否属于本侧角色（主控未知时视为可能属于，仅用于累计溯级） */
    const belongsToSide = (name: string) => {
        const ownerId = buffMap.get(name)?.id
        return ownId === undefined || ownerId === ownId
    }
    const buffs: [string, number, number?][] = []
    const unmapped: string[] = []
    let grade = 0
    let passiveTeam = false
    for (const entry of list) {
        const name = entry[0]
        if (name === FEINA_LEGACY_PASSIVE_TRACE || LEGACY_COMPAT_REMNANT_BUFFS.has(name)) {
            passiveTeam = true
            // `菲娜被动+1溯` / `*旧` 载体 = 1 溯穿透 + 2 溯被动层数：迁移后启用 1、2 根源
            grade = Math.max(grade, 2)
            continue
        }
        if (isHiddenLegacyTraceBuff(name) && belongsToSide(name)) {
            const parsed = parseLegacyTraceGrade(name)
            if (parsed !== undefined) grade = Math.max(grade, parsed)
            // 主控未知角色时保留条目：构筑工厂按 id 精确跳过，不能在这里抹掉其他角色的借用条目
            if (ownId !== undefined) continue
        }
        if (isUnmappedLegacyTraceBuff(name)) unmapped.push(name)
        buffs.push([...entry] as [string, number, number?])
    }
    if (passiveTeam) {
        // 只补团队增伤载体：45% / 24% 由溯源规则与 1 溯源效果提供，不再生成旧存档兼容条目
        if (!buffs.some(entry => entry[0] === FEINA_PASSIVE_TEAM_BUFF)) buffs.push([FEINA_PASSIVE_TEAM_BUFF, 1])
    }
    return { buffs, grade, passiveTeam, unmapped }
}

/** 数值占位符上下文 */
interface TraceValueContext {
    层数: number
    元素数: number
    额外触发数: number
    溯级: number
}

/**
 * 安全求值纯数字四则运算（+ - * / 括号），用于把 `0.02*45` 这类模板固化为数字。
 * @param expression 纯数字表达式
 * @returns 结果；非法时为 NaN
 */
function evaluateArithmetic(expression: string): number {
    let index = 0
    const source = expression.replace(/\s+/g, "")
    const peek = () => source[index]
    const parseFactor = (): number => {
        if (peek() === "(") {
            index++
            const value = parseExpr()
            if (peek() === ")") index++
            return value
        }
        if (peek() === "-") {
            index++
            return -parseFactor()
        }
        if (peek() === "+") {
            index++
            return parseFactor()
        }
        const start = index
        while (index < source.length && /[\d.]/.test(source[index])) index++
        return start === index ? Number.NaN : Number(source.slice(start, index))
    }
    const parseTerm = (): number => {
        let value = parseFactor()
        while (peek() === "*" || peek() === "/") {
            const operator = source[index++]
            const right = parseFactor()
            value = operator === "*" ? value * right : value / right
        }
        return value
    }
    const parseExpr = (): number => {
        let value = parseTerm()
        while (peek() === "+" || peek() === "-") {
            const operator = source[index++]
            const right = parseTerm()
            value = operator === "+" ? value + right : value - right
        }
        return value
    }
    const result = parseExpr()
    return index === source.length ? result : Number.NaN
}

/**
 * 解析单条溯源属性：数字原样；含占位符的字符串先替换，纯数字算术固化为数字，
 * 其余（引用技能字段的表达式）原样下发。
 * @param value 属性值
 * @param context 占位符上下文
 * @returns 数字或表达式字符串
 */
export function resolveTraceAttrValue(value: number | string, context: TraceValueContext): number | string {
    if (typeof value === "number") return value
    const substituted = value.replace(/\{([^{}]+)\}/g, (_, key: string) => {
        const resolved = (context as unknown as Record<string, number>)[key]
        return String(Number.isFinite(resolved) ? resolved : 0)
    })
    if (/^[\d.\s+\-*/()]+$/.test(substituted)) {
        const result = evaluateArithmetic(substituted)
        return Number.isFinite(result) ? result : 0
    }
    return substituted
}

/**
 * 单条数值条件的判定值：溯源等级 / 有效技能等级；`attr` 来源暂不支持，返回 undefined。
 * @param source 判定来源
 * @param context 来源侧上下文
 * @returns 判定值；不支持的来源为 undefined
 */
function resolveTraceConditionValue(source: TraceConditionSource, context: TraceConditionContext): number | undefined {
    switch (source.kind) {
        case "traceLevel":
            return context.traceLevel
        case "skillLevel":
            return context.skillLevel[source.slot]
        default:
            return undefined
    }
}

/**
 * 比较运算符求值（`==` / `!=` 按数值严格相等，条件值通常为整数等级）。
 * @param actual 实际值
 * @param op 运算符
 * @param expected 期望值
 * @returns 是否命中
 */
function compareTraceValue(actual: number, op: TraceCondition["op"], expected: number): boolean {
    switch (op) {
        case ">=":
            return actual >= expected
        case ">":
            return actual > expected
        case "<=":
            return actual <= expected
        case "<":
            return actual < expected
        case "==":
            return actual === expected
        case "!=":
            return actual !== expected
        default:
            return false
    }
}

/**
 * 判定一组数值条件（全部命中才为 true）；不支持的来源（`attr`）按未命中处理。
 * @param conditions 条件列表（空列表恒为 true）
 * @param context 来源侧上下文
 * @returns 是否全部命中
 */
export function evaluateTraceConditions(conditions: readonly TraceCondition[], context: TraceConditionContext): boolean {
    for (const condition of conditions) {
        const actual = resolveTraceConditionValue(condition.source, context)
        if (actual === undefined || !compareTraceValue(actual, condition.op, condition.value)) return false
    }
    return true
}

/**
 * 把规则产出的字段覆盖应用到同名手动 BUFF（名称 / 身份 / 等级 / 覆盖率不变，只覆盖字段）。
 * 同一目标的多条规则按收集顺序叠加（后者覆盖同名字段），不修改入参。
 * @param buffs 已构造的手动 BUFF 列表
 * @param overrides 生效的字段覆盖
 * @returns 覆盖后的 BUFF 列表（无覆盖时原样返回）
 */
export function applyTraceBuffOverrides(buffs: readonly LeveledBuff[], overrides: readonly TraceBuffOverride[]): LeveledBuff[] {
    if (!overrides.length) return buffs as LeveledBuff[]
    const merged = new Map<string, Record<string, number | string>>()
    for (const override of overrides) {
        merged.set(override.target, { ...(merged.get(override.target) ?? {}), ...override.attrs })
    }
    return buffs.map(buff => {
        const attrs = merged.get(buff.名称)
        if (!attrs) return buff
        const data = buff._originalBuffData
        const next = new LeveledBuff({ ...data, attr: { ...(data.attr ?? {}), ...attrs } }, buff.等级)
        next.coverage = buff.coverage
        // 挂载点（特效 BUFF 的金 / 紫同名区分）不随字段覆盖变化
        next.pt = buff.pt
        next.pid = buff.pid
        return next
    })
}

/**
 * 解析某角色在指定溯级下的层数（如菲娜梦笔生花 30 / 2 溯 45）。
 * 默认层数始终生效；按溯级提升的档位只在该档位所属根源激活时生效。
 * @param charId 角色 id
 * @param grade 生效溯级
 * @param isRootActive 根源是否激活（关闭的根源不参与层数上限）；缺省全部激活
 * @returns 层数；该角色未定义层数时为 0
 */
export function resolveTraceLayers(charId: number, grade: number, isRootActive?: (root: number) => boolean): number {
    let hasLayers = false
    let layers = 0
    for (const effect of getTraceEffects(charId)) {
        if (!effect.layers) continue
        hasLayers = true
        let value = effect.layers.default
        let applied = -1
        for (const step of effect.layers.withGrade ?? []) {
            if (step.grade > grade || step.grade <= applied) continue
            if (isRootActive && !isRootActive(step.grade)) continue
            applied = step.grade
            value = step.layers
        }
        layers = Math.max(layers, value)
    }
    return hasLayers ? layers : 0
}

/** 目标侧持有的 Q 追加伤害元素种数（菲娜 Q 四个元素键） */
function countQDamageElements(buffNames: ReadonlySet<string>): number {
    if (!buffNames.has("菲娜Q")) return 0
    const attr = buffMap.get("菲娜Q")?.attr ?? {}
    return Object.keys(attr).filter(name => name.endsWith("属性追伤")).length
}

/** 一侧溯源上下文 */
interface TraceSideState {
    side: TranscendSlotGroup
    charId?: number
    active: boolean
    traceLevel?: number
    offRoots: number[]
    traceStacks: TraceStack[]
    buffNames: ReadonlySet<string>
    /** 基础技能等级（规则判定 `skillLevel` 条件用） */
    baseSkillLevels: CharSkillLevels
}

/** 团队角色 id 归一化（与 `CharSettings` 的 teamN 口径一致） */
function toCharId(value: unknown): number | undefined {
    const id = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN
    if (!Number.isFinite(id) || id <= 0) return undefined
    const rounded = Math.round(id)
    return rounded > 9999 ? Math.trunc(rounded / 100) : rounded
}

/** 从设置读取一侧的溯级 / 关闭根源 / 层数设置与 BUFF 名称 */
function readSideSettings(settings: TraceSettingsSource, side: TranscendSlotGroup) {
    if (side === "main") {
        return {
            traceLevel: settings.main?.traceLevel ?? settings.traceLevel,
            traceOffRoots: settings.main?.traceOffRoots ?? settings.traceOffRoots,
            traceStacks: settings.main?.traceStacks ?? settings.traceStacks,
            charSkillLevel: settings.main?.charSkillLevel ?? settings.charSkillLevel,
            buffs: settings.buffs,
        }
    }
    const assist = side === "assist1" ? settings.assist1 : settings.assist2
    return {
        traceLevel: assist?.traceLevel,
        traceOffRoots: assist?.traceOffRoots,
        traceStacks: assist?.traceStacks,
        charSkillLevel: assist?.charSkillLevel,
        buffs: assist?.buffs,
        enabled: assist?.enabled,
    }
}

/**
 * 构造三侧溯源上下文（角色 id / 启用位优先取 `teamSides`，溯级与 BUFF 名称取设置）。
 * @param settings 设置投影
 * @param options 收集选项
 * @returns 三侧上下文（main → assist1 → assist2）
 */
function buildTraceSides(settings: TraceSettingsSource, options: TraceCollectOptions): TraceSideState[] {
    const teamSides = options.teamSides
    const sideOf = (side: TranscendSlotGroup) => teamSides?.find(context => context.side === side)
    const mainId = toCharId(sideOf("main")?.charId ?? options.charId)
    const assist1Id = toCharId(sideOf("assist1")?.charId ?? settings.team1)
    const assist2Id = toCharId(sideOf("assist2")?.charId ?? settings.team2)
    const make = (side: TranscendSlotGroup, charId: number | undefined): TraceSideState => {
        const sideSettings = readSideSettings(settings, side)
        const names = new Set<string>(options.buffNames?.[side] ?? sideSettings.buffs?.map(entry => entry[0]) ?? [])
        const contextActive = sideOf(side)?.active
        return {
            side,
            charId,
            active: contextActive ?? (charId !== undefined && sideSettings.enabled !== false),
            traceLevel: sideSettings.traceLevel,
            offRoots: resolveTraceOffRoots(sideSettings.traceOffRoots, sideSettings.traceLevel, charId),
            traceStacks: normalizeTraceStacks(sideSettings.traceStacks, charId),
            buffNames: names,
            baseSkillLevels: normalizeCharSkillLevels(sideSettings.charSkillLevel),
        }
    }
    return [make("main", mainId), make("assist1", assist1Id), make("assist2", assist2Id)]
}

/**
 * 该侧生效的根源序号与最高根源。
 * @param state 一侧上下文
 * @returns `off` 关闭集合、`grade` 最高激活根源（全部关闭为 0）
 */
function resolveActiveRoots(state: TraceSideState) {
    const off = new Set(state.offRoots)
    const max = getMaxTraceLevel(state.charId)
    let grade = 0
    for (let root = 1; root <= max; root++) {
        if (!off.has(root)) grade = root
    }
    return { off, grade }
}

/** 溯源效果注入的稳定去重 key（同一来源侧 + 同一根源合并为一条） */
function traceStackKey(source: TraceSideState, grade: number): string {
    return `trace:${source.side}:${source.charId}:${grade}`
}

/**
 * 派生 BUFF 名称：保留「角色名 + N溯」口径（`贝蕾妮卡2溯` / `菲娜4溯`），便于辨认归属。
 * @param charId 来源角色 id
 * @param grade 根源序号
 * @returns 派生 BUFF 名称
 */
function traceRootBuffName(charId: number | undefined, grade: number): string {
    const name = typeof charId === "number" ? charMap.get(charId)?.名称 : undefined
    return `${name ?? "溯源"}${grade}溯`
}

/**
 * 构造一条溯源派生 BUFF：数值在收集期固化（数字或技能字段表达式），等级恒为 1。
 * @param source 来源侧
 * @param grade 根源序号
 * @param attrs 合并后的属性表
 * @returns 带来源标识的等级化 BUFF
 */
function createTraceBuff(source: TraceSideState, grade: number, attrs: Record<string, number | string>): LeveledBuff {
    const description = charMap.get(source.charId as number)?.溯源?.[grade - 1] ?? ""
    const data: Buff = {
        id: source.charId,
        名称: traceRootBuffName(source.charId, grade),
        描述: description,
        attr: attrs,
        source: {
            kind: "trace",
            id: source.charId as number,
            grade,
            ownerSide: source.side,
            stackKey: traceStackKey(source, grade),
        },
    }
    const buff = new LeveledBuff(data, 1)
    buff.pt = TRACE_BUFF_SOURCE
    return buff
}

/** 合并同根源数值：数字累加，任一侧为表达式时保留为相加表达式 */
function mergeTraceAttrValue(existing: number | string | undefined, incoming: number | string): number | string {
    if (existing === undefined) return incoming
    if (typeof existing === "number" && typeof incoming === "number") return existing + incoming
    return `(${existing})+(${incoming})`
}

/** 技能 id → 技能等级槽位（0=E / 1=Q / 2+=被动），子技能沿用父槽位（与升华 `getSkillLevelIndex` 同口径） */
function resolveSkillSlotIndex(charId: number, skillId: number): number | undefined {
    const skills = charMap.get(charId)?.技能
    const visit = (
        nodes:
            | readonly { id?: number; 类型?: string; 子技能?: readonly { id?: number; 类型?: string; 子技能?: unknown[] }[] }[]
            | undefined,
        parent?: number
    ): number | undefined => {
        for (const [index, node] of (nodes ?? []).entries()) {
            const slot = parent ?? index
            if (node.id === skillId && node.类型 !== "协战") return Math.min(slot, 2)
            const nested = visit(node.子技能 as typeof nodes, slot)
            if (nested !== undefined) return nested
        }
        return undefined
    }
    return visit(skills)
}

/**
 * 来源侧自身的溯源技能等级增量（3/5 溯 E+2/P+1），用于规则判定有效技能等级。
 * @param source 来源侧
 * @param grade 最高生效根源
 * @param off 关闭的根源
 * @returns 技能等级增量 `[E, Q, P]`
 */
function collectOwnTraceSkillBonus(source: TraceSideState, grade: number, off: ReadonlySet<number>): CharSkillLevels {
    const bonus: CharSkillLevels = [0, 0, 0]
    if (!source.charId) return bonus
    for (const effect of getTraceEffects(source.charId)) {
        if (effect.grade > grade || off.has(effect.grade)) continue
        if (effect.target !== "self" && effect.target !== "all-teammates" && effect.target !== "heal-target") continue
        for (const entry of effect.skillLevel ?? []) {
            const index = resolveSkillSlotIndex(source.charId, entry.skillId)
            if (index === undefined || index > 2) continue
            bonus[index] = Math.min(TRACE_SKILL_LEVEL_MAX, bonus[index] + entry.add)
        }
    }
    return bonus
}

/**
 * 来源侧自身可注入的技能等级三键属性（与旧 `collectTraceEffects` 逐槽累计同口径）：
 * 尊重 `requiresBuff`，每槽钳 `TRACE_SKILL_LEVEL_MAX`；规则判定仍走 `collectOwnTraceSkillBonus`。
 * @param source 来源侧
 * @param grade 最高生效根源
 * @param off 关闭的根源
 * @returns 技能等级加成 `[E, Q, P]`
 */
function accumulateTraceSkillLevelAttrs(source: TraceSideState, grade: number, off: ReadonlySet<number>): CharSkillLevels {
    const bonus: CharSkillLevels = [0, 0, 0]
    if (!source.charId) return bonus
    for (const effect of getTraceEffects(source.charId)) {
        if (effect.grade > grade || off.has(effect.grade)) continue
        if (effect.target !== "self" && effect.target !== "all-teammates" && effect.target !== "heal-target") continue
        if (effect.requiresBuff && !source.buffNames.has(effect.requiresBuff)) continue
        for (const entry of effect.skillLevel ?? []) {
            const index = resolveSkillSlotIndex(source.charId, entry.skillId)
            if (index === undefined || index > 2) continue
            bonus[index] = Math.min(TRACE_SKILL_LEVEL_MAX, bonus[index] + entry.add)
        }
    }
    return bonus
}

/**
 * 侧级合成技能等级 BUFF（`pt = Trace`）：把该侧溯源的技能等级增量作为三键属性注入标准属性池。
 * @param source 来源侧
 * @param attrs 技能等级加成 `[E, Q, P]`（非零项写入 attr）
 * @returns 等级化 BUFF
 */
function createTraceSkillLevelBuff(source: TraceSideState, attrs: CharSkillLevels): LeveledBuff {
    const data: Buff = {
        id: source.charId,
        名称: "溯源技能等级",
        描述: "",
        attr: Object.fromEntries(SKILL_LEVEL_ATTR_KEYS.map((key, index) => [key, attrs[index]]).filter(([, value]) => value !== 0)),
        source: {
            kind: "trace",
            id: source.charId as number,
            ownerSide: source.side,
            stackKey: `trace:${source.side}:${source.charId}:skillLevel`,
        },
    }
    const buff = new LeveledBuff(data, 1)
    buff.pt = TRACE_BUFF_SOURCE
    return buff
}

/**
 * 规则判定上下文：来源侧最高生效根源与有效技能等级（基础 + 升华增量 + 本侧溯源增量，钳 1-30）。
 * @param source 来源侧
 * @param grade 最高生效根源
 * @param off 关闭的根源
 * @param options 收集选项（升华技能等级增量）
 * @returns 判定上下文
 */
function resolveSourceConditionContext(
    source: TraceSideState,
    grade: number,
    off: ReadonlySet<number>,
    options: TraceCollectOptions
): TraceConditionContext {
    const transcendBonus = options.transcendSkillLevelBonus?.(source.side) ?? ([0, 0, 0] as CharSkillLevels)
    const traceBonus = collectOwnTraceSkillBonus(source, grade, off)
    return {
        traceLevel: grade,
        skillLevel: resolveEffectiveSkillLevels(source.baseSkillLevels, transcendBonus, traceBonus),
    }
}

/**
 * 收集某构筑位应注入的溯源效果（与 `collectTranscendEffects` 同构）：
 * 本侧效果留在本侧；`all-teammates` / `other-teammates` 遍历其他已启用侧跨位注入；
 * `skillLevel` 只累加到来源侧自身的有效等级（调用方叠加并钳 1-30）；关闭的根源整条跳过。
 * 同一来源侧 + 同一根源的数值效果合并为一条 `角色N溯` BUFF（数值属性按来源侧 `traceStacks` 缩放）。
 * 规则在条件命中且受益侧持有目标 BUFF 时产出字段覆盖（`buffOverrides`），不产生增量 BUFF。
 * @param settings 设置投影（`CharSettings` / 升华构筑设置）
 * @param side 受益构筑位
 * @param options 角色 id / 三侧上下文 / BUFF 名称覆盖
 * @returns 可并入 `CharBuild` 的溯源 BUFF、技能等级增量、字段覆盖与告警
 */
export function collectTraceEffects(
    settings: TraceSettingsSource | null | undefined,
    side: TranscendSlotGroup,
    options: TraceCollectOptions = {}
): TraceEffects {
    const result: TraceEffects = { buffs: [], warnings: [], buffOverrides: [] }
    if (!settings) return result
    const sides = buildTraceSides(settings, options)
    const target = sides.find(state => state.side === side)
    const targetBuffNames = target?.buffNames ?? new Set<string>()
    /** 每来源侧 + 根源合并后的数值属性 */
    const merged = new Map<string, { source: TraceSideState; grade: number; attrs: Record<string, number | string> }>()
    /** 规则字段覆盖（同名目标按收集顺序叠加） */
    const overrides = new Map<string, TraceBuffOverride>()
    for (const source of sides) {
        if (!source.active || !source.charId) continue
        const { off, grade } = resolveActiveRoots(source)
        if (!grade) continue
        const own = source.side === side
        const layers = resolveTraceLayers(source.charId, grade, root => !off.has(root))
        const effects = getTraceEffects(source.charId)
        // 规则：来源侧条件判定 + 受益侧持有目标 BUFF 时产出字段覆盖
        let conditionContext: TraceConditionContext | undefined
        const applyRule = (rule: TraceBuffRule) => {
            if (rule.grade > grade || off.has(rule.grade)) return
            const scope = rule.scope ?? "all-teammates"
            const reachesSelf = scope === "self" || scope === "all-teammates" || scope === "heal-target"
            const reachesOthers = scope === "all-teammates" || scope === "other-teammates"
            if (own ? !reachesSelf : !reachesOthers) return
            if (!targetBuffNames.has(rule.target)) return
            conditionContext ??= resolveSourceConditionContext(source, grade, off, options)
            if (!evaluateTraceConditions(rule.when, conditionContext)) return
            const context: TraceValueContext = {
                层数: layers,
                元素数: countQDamageElements(targetBuffNames),
                额外触发数: 5,
                溯级: grade,
            }
            const attrs: Record<string, number | string> = {}
            for (const [property, value] of Object.entries(rule.attrs)) {
                attrs[property] = resolveTraceAttrValue(value, context)
            }
            overrides.set(rule.target, {
                target: rule.target,
                attrs: { ...(overrides.get(rule.target)?.attrs ?? {}), ...attrs },
                charId: source.charId,
                grade: rule.grade,
                ownerSide: source.side,
                note: rule.note,
            })
        }
        for (const effect of effects) {
            if (effect.grade > grade || off.has(effect.grade)) continue
            for (const rule of effect.rules ?? []) applyRule(rule)
        }
        for (const rule of options.extraRules ?? []) {
            if (rule.charId === source.charId) applyRule(rule)
        }
        for (const effect of effects) {
            if (effect.grade > grade || off.has(effect.grade)) continue
            const reachesSelf = effect.target === "self" || effect.target === "all-teammates" || effect.target === "heal-target"
            const reachesOthers = effect.target === "all-teammates" || effect.target === "other-teammates"
            if (own ? !reachesSelf : !reachesOthers) continue
            if (effect.requiresBuff && !targetBuffNames.has(effect.requiresBuff)) continue
            const attrEntries = Object.entries(effect.attrs ?? {})
            // 纯技能等级 / 纯规则条目：不生成逐根源空展示 BUFF（卡片按根源展示；技能等级另按侧合成）
            if (!attrEntries.length) continue
            const context: TraceValueContext = {
                层数: layers,
                元素数: countQDamageElements(targetBuffNames),
                额外触发数: effect.stacks ?? 5,
                溯级: grade,
            }
            const stack = resolveTraceStackValue(source.traceStacks, effect.grade, effect.mx)
            const scale = stack.level * stack.coverage
            const key = `${source.side}:${source.charId}:${effect.grade}`
            let bucket = merged.get(key)
            if (!bucket) {
                bucket = { source, grade: effect.grade, attrs: {} }
                merged.set(key, bucket)
            }
            for (const [property, value] of attrEntries) {
                const resolved = resolveTraceAttrValue(value, context)
                const scaled = typeof resolved === "number" && scale !== 1 ? resolved * scale : resolved
                bucket.attrs[property] = mergeTraceAttrValue(bucket.attrs[property], scaled)
            }
        }
    }
    for (const bucket of merged.values()) {
        if (!Object.keys(bucket.attrs).length) continue
        result.buffs.push(createTraceBuff(bucket.source, bucket.grade, bucket.attrs))
    }
    // 本侧溯源技能等级按侧合成一条三键 BUFF（30 上限在累计时已钳制，语义与旧通道一致）
    if (target?.active && target.charId) {
        const { off, grade } = resolveActiveRoots(target)
        const skillAttrs = grade ? accumulateTraceSkillLevelAttrs(target, grade, off) : ([0, 0, 0] as CharSkillLevels)
        if (skillAttrs.some(Boolean)) result.buffs.push(createTraceSkillLevelBuff(target, skillAttrs))
    }
    result.buffOverrides = [...overrides.values()]
    return result
}

/**
 * 只解析某构筑位的溯源技能等级增量（3 溯 E+2/P+1、5 溯 Q+2/P+1）。
 * 预解析专用：直接读 `getTraceEffects`（不构造 BUFF、不走引擎通道），与侧级合成 BUFF 同值，
 * 供 `等级来源` 与规则条件复用。
 * @param settings 设置投影
 * @param side 构筑位
 * @param charId 该侧角色 id
 * @returns 技能等级增量 `[E, Q, P]`
 */
export function resolveTraceSkillLevelBonus(
    settings: TraceSettingsSource | null | undefined,
    side: TranscendSlotGroup,
    charId: number | undefined
): CharSkillLevels {
    if (!settings) return [0, 0, 0]
    const target = buildTraceSides(settings, { charId }).find(state => state.side === side)
    if (!target?.active || !target.charId) return [0, 0, 0]
    const { off, grade } = resolveActiveRoots(target)
    return grade ? accumulateTraceSkillLevelAttrs(target, grade, off) : [0, 0, 0]
}

/** 单张根源卡片的展示数据（只读，不写回设置、不注入构筑） */
export interface TraceRootCard {
    /** 根源序号 1..max */
    root: number
    /** 当前是否激活 */
    active: boolean
    /** 按当前激活根源 / 元素数 / 层数求值的数值属性（脱离构筑无法求值的技能字段表达式不列出；含技能等级三键） */
    attrs: Record<string, number>
    /** 层数上限（该根源各效果 mx 的最大值；无 mx 为 1，不显示等级控件） */
    mx: number
    /** 当前生效等级（缺省 = mx） */
    level: number
    /** 当前覆盖率（0-1，缺省 1） */
    coverage: number
    /** `requiresBuff` 未满足时的条件名 */
    note?: string
    /** `requiresBuff` 是否满足（无条件的根源恒为 true） */
    conditionMet: boolean
    /** 跨侧效果（all / other-teammates）的实际求值受益侧；纯本侧效果为 undefined */
    contextSide?: TranscendSlotGroup
}

/**
 * 构造某侧某角色的根源卡片数据：包含被关闭的根源（卡片需要能重新打开），
 * 数值按当前激活集合与 `traceStacks` 等级 / 覆盖率求值，`requiresBuff` 未满足的效果不产出数值。
 * @param settings 设置投影（`CharSettings` / 升华构筑设置）
 * @param side 构筑位（卡片所属侧）
 * @param options 角色 id / 三侧上下文 / BUFF 名称覆盖
 * @returns 1..该角色最大根源的卡片；该侧未激活或角色无溯源时为空
 */
export function buildTraceRootCards(
    settings: TraceSettingsSource | null | undefined,
    side: TranscendSlotGroup,
    options: TraceCollectOptions = {}
): TraceRootCard[] {
    if (!settings) return []
    const sides = buildTraceSides(settings, options)
    const target = sides.find(state => state.side === side)
    if (!target?.active || !target.charId) return []
    const charId = target.charId
    const max = getMaxTraceLevel(charId)
    if (!max) return []
    const { off, grade } = resolveActiveRoots(target)
    const layers = resolveTraceLayers(charId, grade, root => !off.has(root))
    const mainSide = sides.find(state => state.side === "main")
    const effects = getTraceEffects(charId)
    const cards: TraceRootCard[] = []
    for (let root = 1; root <= max; root++) {
        const attrs: Record<string, number> = {}
        const skillLevelBonus: CharSkillLevels = [0, 0, 0]
        let conditionMet = true
        let note: string | undefined
        let contextSide: TranscendSlotGroup | undefined
        let mx = 1
        for (const effect of effects) {
            if (effect.grade !== root) continue
            mx = Math.max(mx, Math.round(effect.mx ?? 1))
            // 跨侧效果的数值取决于受益侧（主控）的 BUFF 列表与元素数；本侧效果仍按来源侧
            const cross = effect.target === "all-teammates" || effect.target === "other-teammates"
            const beneficiary = cross ? (mainSide ?? target) : target
            if (cross && beneficiary.side !== side) contextSide = beneficiary.side
            if (effect.requiresBuff && !beneficiary.buffNames.has(effect.requiresBuff)) {
                conditionMet = false
                note = effect.requiresBuff
                continue
            }
            for (const entry of effect.skillLevel ?? []) {
                const index = resolveSkillSlotIndex(charId, entry.skillId)
                if (index === undefined || index > 2) continue
                skillLevelBonus[index] = Math.min(TRACE_SKILL_LEVEL_MAX, skillLevelBonus[index] + entry.add)
            }
            const context: TraceValueContext = {
                层数: layers,
                元素数: countQDamageElements(beneficiary.buffNames),
                额外触发数: effect.stacks ?? 5,
                溯级: grade,
            }
            const stack = resolveTraceStackValue(target.traceStacks, root, effect.mx)
            const scale = stack.level * stack.coverage
            for (const [property, value] of Object.entries(effect.attrs ?? {})) {
                const resolved = resolveTraceAttrValue(value, context)
                if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved === 0) continue
                attrs[property] = (attrs[property] ?? 0) + (scale !== 1 ? resolved * scale : resolved)
            }
        }
        // 技能等级三键并入 attrs：卡片与构筑属性面板同源，不再单独字段供 UI 手工合并
        SKILL_LEVEL_ATTR_KEYS.forEach((key, index) => {
            if (skillLevelBonus[index]) attrs[key] = skillLevelBonus[index]
        })
        const stack = resolveTraceStackValue(target.traceStacks, root, mx)
        cards.push({
            root,
            active: !off.has(root),
            attrs,
            mx,
            level: stack.level,
            coverage: stack.coverage,
            note,
            conditionMet,
            ...(contextSide ? { contextSide } : {}),
        })
    }
    return cards
}
