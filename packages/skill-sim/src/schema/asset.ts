/**
 * SkillAssetDoc —— 导出器产物（PLAN §2.1，跨仓库契约）。
 *
 * 导出器只写“证据 + 规范化原始结构”，不写游戏语义；本类型刻意全部字段可选/宽松：
 * U2 的最终字段可能与 PLAN 草案有出入，ingest 负责别名归一，build 负责语义。
 * 未知字段不报错（只给 warn），保证导出器可以先行加字段。
 */

import type { Phase, ResourceCost } from "./ir"

export interface SkillAssetDoc {
    schemaVersion: 1
    exporter?: SkillAssetExporterInfo
    characters?: SkillAssetCharacter[]
    skills: Record<string, SkillAssetSkill>
    buffs?: Record<string, SkillAssetBuff>
    /** 导出器侧覆盖率提示（不参与本仓库门禁） */
    coverage?: Record<string, unknown>
}

export interface SkillAssetExporterInfo {
    gitCommit?: string
    parserVersion?: number
    gameVersion?: string
    generatedAt?: string
}

export interface SkillAssetCharacter {
    id: number
    nameKey?: string
    skills?: number[]
}

export interface SkillAssetSkill {
    id?: number
    characterId?: number
    /** "E" | "Q" | "P" | ... 导出器可留空，build 会按数据顺序补 */
    slot?: string
    lua?: SkillAssetLua
    sources?: SkillAssetSources
    montage?: SkillAssetMontage
    sequences?: SkillAssetSequence[]
    blueprint?: SkillAssetBlueprint
    animBP?: SkillAssetAnimBP
    /** 人工语义覆盖（U7）；导出器不写，fixture / overrides 文件使用 */
    authored?: AuthoredBehavior
}

export interface SkillAssetSources {
    montage?: string
    bpPackages?: string[]
    animBPs?: string[]
}

export interface SkillAssetLua {
    behavior?: string
    /** 原始 Skill.json 字段（名称/影响/值/tag/…） */
    fields?: SkillAssetField[]
    /** 原始 SkillEffects.json 条目 */
    effects?: SkillAssetEffect[]
    buffIds?: (number | string)[]
    [key: string]: unknown
}

export interface SkillAssetField {
    名称: string
    影响?: string
    值: number | number[]
    格式?: string
    值2?: number | number[]
    段数?: number
    tag?: string[]
}

export interface SkillAssetEffect {
    TaskId?: number
    NotifyName?: string[]
    TargetFilter?: string
    TaskEffects?: SkillAssetTaskEffect[]
    [key: string]: unknown
}

/** SkillEffects.json 的 TaskEffects 联合（保留原始 Function 名以便登记表匹配） */
export interface SkillAssetTaskEffect {
    Function: string
    BuffId?: number
    LastTime?: number
    BaseAttr?: string
    DamageTag?: string[]
    Rate?: number | string
    Value?: number
    BossValue?: number
    CreatureId?: number
    UnitId?: number
    AttrName?: string
    [key: string]: unknown
}

export interface SkillAssetMontage {
    length?: number
    sections?: SkillAssetMontageSection[]
    segments?: SkillAssetMontageSegment[]
    notifies?: SkillAssetNotify[]
    branchingPoints?: SkillAssetBranchingPoint[]
}

export interface SkillAssetMontageSection {
    name: string
    begin: number
    length: number
    next?: string | null
}

export interface SkillAssetMontageSegment {
    sequence: string
    start: number
    end: number
    rate?: number
}

export interface SkillAssetNotify {
    name: string
    time: number
    duration?: number
    payload?: Record<string, unknown>
    [key: string]: unknown
}

export interface SkillAssetBranchingPoint {
    notifyIndex?: number
    time: number
    type: string
}

export interface SkillAssetSequence {
    name: string
    length?: number
    frames?: number
    fps?: number
}

/** U1 `bytecode` 命令的表达式节点：opcode tag + 调用参数 */
export interface SkillAssetBytecodeNode {
    op: string
    fn?: string
    args?: SkillAssetBytecodeNode[]
    /** 字面量（IntConst/FloatConst/StringConst）或嵌套表达式 */
    value?: SkillAssetBytecodeNode | number | string | boolean | null
    target?: string
    [key: string]: unknown
}

export interface SkillAssetBytecodeFunction {
    name: string
    flags?: string[]
    params?: SkillAssetBlueprintParam[]
    locals?: SkillAssetBlueprintParam[]
    body?: SkillAssetBytecodeNode[]
    [key: string]: unknown
}

export interface SkillAssetBlueprintParam {
    name: string
    type?: string
    out?: boolean
}

export interface SkillAssetBlueprintEvent {
    name: string
    /** 事件分发目标函数（U2：通常为 `ExecuteUbergraph_X`） */
    target?: string
    /** ExecuteUbergraph_X(IntConst offset) 的入口偏移 */
    entryOffset?: number
}

export interface SkillAssetBlueprintVariable {
    name: string
    type?: string
    default?: unknown
}

export interface SkillAssetBlueprint {
    events?: SkillAssetBlueprintEvent[]
    functions?: SkillAssetBytecodeFunction[]
    variables?: SkillAssetBlueprintVariable[]
}

export interface SkillAssetAnimBP {
    stateMachines?: Record<string, unknown>[]
    graph?: Record<string, unknown>[]
}

export interface SkillAssetBuff {
    id?: number | string
    name?: string
    lua?: Record<string, unknown>
    /** 原始 Buff.json 条目（DotDatas / LastTime / ActivateSkills …） */
    props?: Record<string, unknown>
    bpPackages?: string[]
}

/**
 * 人工语义（U7）：导出器永远不写。
 * `phases` 一旦出现就**整体替换**派生相位（provenance 仍保留全部证据）；
 * `cast` 按字段覆盖。
 */
export interface AuthoredBehavior {
    note?: string
    cast?: Partial<{
        time: number
        cooldown: number
        canMove: boolean
        costs: ResourceCost[]
    }>
    phases?: Phase[]
}

/** `--overrides` 文件：技能 id → 人工语义 */
export interface SkillAuthoredOverridesDoc {
    schemaVersion: 1
    skills: Record<string, AuthoredBehavior>
}
