import { TRANSCEND_BUFFS, UNIQUE_AFFIX_MAP } from "./d/transcendbuff.data"
import type { Buff } from "./data-types"

/** 数据本体在 `d/transcendbuff.data.ts`（进数据包），这里重导出以保持既有导入方零改动 */
export { TRANSCEND_BUFFS, UNIQUE_AFFIX_MAP }

/** 手写词条名 → BUFF 的索引（按名称唯一；换包后由 `rebuildTranscendBuffIndex` 就地重建） */
export const TRANSCEND_BUFF_MAP: Map<string, Buff> = new Map()

/**
 * 重建手写词条索引。
 *
 * `TRANSCEND_BUFFS` 是数据包绑定，换包时整体替换，派生 Map 必须跟着重建
 * （与 `rebuildStaticIndexes` 里其余派生索引同批执行）。
 */
export function rebuildTranscendBuffIndex(): void {
    TRANSCEND_BUFF_MAP.clear()
    for (const buff of TRANSCEND_BUFFS) {
        TRANSCEND_BUFF_MAP.set(buff.名称, buff)
    }
}

rebuildTranscendBuffIndex()

/** @deprecated 旧拼写别名，保留向后兼容；新代码请用 `TRANSCEND_BUFFS` */
export { TRANSCEND_BUFFS as TRANSEND_BUFFS }
/** @deprecated 旧拼写别名，保留向后兼容；新代码请用 `TRANSCEND_BUFF_MAP` */
export const TRANSEND_BUFF_MAP = TRANSCEND_BUFF_MAP

/** 展示数值单位：percent 为比例（0.175 = 17.5%），flat 为绝对值 */
export type TranscendAffixValueUnit = "percent" | "flat"

/** 展示数值行的生效范围：技能字段名与 / 或字段标签（游戏原文，展示时过 `gt`） */
export interface TranscendAffixValueScope {
    /** 技能字段名限定（如「星河寥落」） */
    field?: string
    /** 字段标签限定（如「下落攻击」） */
    tag?: string
}

/** 权威展示数值：来自上游 PE/Buff/Affix，独立于本地计算 BUFF；string 为表达式原文 */
export interface TranscendAffixDisplayValue {
    name: string
    /** percent 时为比例（0.175 = 17.5%）；flat 为绝对值 */
    value: number | string
    unit?: TranscendAffixValueUnit
    /** 界面文案键；存在时优先于 name（name 仅作检索/兜底） */
    labelKey?: string
    /** 生效范围标注（只作展示，不参与计算） */
    scope?: TranscendAffixValueScope
}

/** 效果作用目标 */
export type TranscendAffixTarget = "self" | "summon" | "other-teammates" | "all-teammates" | "heal-target" | "enemy"

/** 效果触发事件 */
export type TranscendAffixTrigger =
    | "ultimate"
    | "spiral-leap"
    | "dodge"
    | "skill-hit"
    | "weapon-hit"
    | "heal"
    | "disorder"
    | "combo"
    | "passive"
    | "none"

/** 效果事件参数：目标 / 触发 / 概率 / 持续 / 层数 */
export interface TranscendAffixEffectMeta {
    target?: TranscendAffixTarget
    trigger?: TranscendAffixTrigger
    chance?: number
    /** 秒；-1 = 无限 */
    duration?: number
    maxLayers?: number
}

/** 队友限定增益的目标口径 */
export type TranscendTeammateTarget = "other-teammates" | "all-teammates" | "heal-target"

/** 队友限定增益范式：跨侧注入由 `collectTranscendEffects` 的 `teamSides` 消费 */
export interface TranscendTeammateMeta {
    target: TranscendTeammateTarget
    trigger?: TranscendAffixTrigger
    /** 秒；-1 = 无限 */
    duration?: number
    /** 多来源叠加：per-source = 每个来源侧一份；single = 全队只保留一份 */
    stackScope?: "per-source" | "single"
    maxStacksPerSource?: number
}

/**
 * Plan 4 专属词条的本地建模口径。
 *
 * - `status` 与上游 `affixes[].mappingStatus` 对齐：`exact` 自动映射引擎属性，`handwritten` 手写建模。
 * - `values` 是权威展示数值（来自上游），与本地计算 BUFF 解耦；`effect` / `team` 登记事件事实。
 * - `partial` 表示手写口径只覆盖了效果的一部分，`excluded` 只保留精确的计算缺口。
 * - 带 `addAttrs` 的词条（生命回复）仍由属性映射产出 BUFF，`buffs` 留空，只登记建模口径。
 */
export interface TranscendAffixMapping {
    /** 引用的手写 BUFF 名称（`TRANSCEND_BUFFS`）；属性映射词条为空 */
    buffs: string[]
    status: "exact" | "handwritten"
    /** 权威展示数值（未折算 coverage） */
    values?: TranscendAffixDisplayValue[]
    /** 效果事件参数 */
    effect?: TranscendAffixEffectMeta
    /** 队友限定增益范式 */
    team?: TranscendTeammateMeta
    /** 只覆盖部分效果 */
    partial?: boolean
    /** 已计入的机械可读 token（UI 本地化） */
    included?: string[]
    /** 未计入的机械可读 token（UI 本地化） */
    excluded?: string[]
    /** 计入时的覆盖率（0-1），缺省 1 */
    coverage?: number
    /** 本地建模说明（非官方文案） */
    note?: string
}

export {
    applyTranscendSkillReplacement,
    mergeTranscendSkillReplacement,
    resetSkillReplacementWarnings,
    TRANSCEND_SKILL_REPLACEMENTS,
    type TranscendSkillReplacement,
    warnSkillReplacementConflict,
} from "./transcendSkills"
