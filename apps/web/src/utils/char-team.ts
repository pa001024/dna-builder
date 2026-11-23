/**
 * 原版构筑页的三人目标函数快照：主控 + 两名协战的状态、构筑实例、伤害与合计。
 * 输入只有完整 `CharSettings`（协战 build 由 `assist1/assist2` 重建），口径与升华页 `computeTranscendTeamSnapshot` 一致；
 * 目标面板所需的三侧状态由 `createMainTargetSide` / `createAssistTargetSide` 投影，写回走 `applyCharTargetPatch`。
 */
import type { TargetSideState } from "@/components/transcend-build/TranscendTargetPanel.vue"
import {
    type AssistSide,
    type CharBuild,
    type CharBuildInvSnapshot,
    type CharSettings,
    normalizeCharSettings,
    type TranscendSlotGroup,
} from "@/data"
import { createAssistBuildFromSettings } from "@/data/CharBuildHelper"
import type { TranscendSideState } from "@/utils/transcend-build"

/** 目标面板单侧的状态副本：逐条复制变量，避免与设置对象共享数组 */
function cloneVariables(variables: readonly [string, string][]): [string, string][] {
    return variables.map(variable => [...variable] as [string, string])
}

/** 单个构筑位的计算状态 */
export interface CharTeamSideStatus {
    side: TranscendSlotGroup
    charId: number
    state: TranscendSideState
}

/** 单段构筑的计算结果：未启用 / 无角色 / 失败时为 null */
export interface CharTeamSideResult {
    side: TranscendSlotGroup
    charId: number
    build: CharBuild
    damage: number | null
    /** 目标表达式在该段上的校验错误 */
    error: string | null
}

/** 计算快照的入参 */
export interface CharTeamSnapshotArgs {
    /** 完整角色配置（可含脏数据，内部先归一化） */
    settings: CharSettings
    /** 主控角色 id（`CharSettings` 不存主控 id） */
    charId: number
    /** 主控构筑实例；未选角色 / 未构建时为空 */
    mainBuild: CharBuild | null
    /** 背包快照（协战特效等级按全局背包取值时使用） */
    inv?: CharBuildInvSnapshot
}

/** 三人快照 */
export interface CharTeamSnapshot {
    /** 目标面板读写的三侧字段（`TargetSideState`） */
    settings: Record<TranscendSlotGroup, TargetSideState>
    /** 每段的状态（含未启用 / 无角色与失败原因） */
    sideStates: Record<TranscendSlotGroup, CharTeamSideStatus>
    /** 各侧构筑实例（目标面板做表达式校验 / 高亮；与下方结果共用同一实例，未构建时 null） */
    builds: Record<TranscendSlotGroup, CharBuild | null>
    main: CharTeamSideResult | null
    assist1: CharTeamSideResult | null
    assist2: CharTeamSideResult | null
    /** 参与段伤害之和；参与段里存在错误 / 失败或无有效段时为 null */
    total: number | null
    /** 合计不可用的原因（表达式错误优先） */
    totalError: string | null
}

/** 单段求值结果与状态 */
interface SideEvaluation {
    result: CharTeamSideResult | null
    status: CharTeamSideStatus
}

/**
 * 取协战角色 id：`teamN` 是唯一 id 真源，"-" 视为未配置。
 * @param settings 已归一化的角色配置
 * @param side 协战位
 * @returns 角色 id；未配置时为 0
 */
function resolveTeamCharId(settings: CharSettings, side: AssistSide): number {
    const raw = side === "assist1" ? settings.team1 : settings.team2
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0
}

/**
 * 主控的目标面板状态（只读投影，返回独立副本；写回用 `applyCharTargetPatch`）：
 * 角色 id 由页面传入（`CharSettings` 不存主控 id），启用位取 `mainTargetEnabled`。
 * @param settings 完整角色配置
 * @param charId 当前页面角色 id
 * @returns 目标面板主控位状态
 */
export function createMainTargetSide(settings: CharSettings, charId: number): TargetSideState {
    return {
        charId,
        baseName: settings.baseName,
        targetFunction: settings.targetFunction,
        customVariables: cloneVariables(settings.customVariables),
        dotSettings: { ...settings.dotSettings },
        enabled: settings.mainTargetEnabled,
    }
}

/**
 * 协战的目标面板状态（只读投影，返回独立副本；写回用 `applyCharTargetPatch`）：
 * 角色 id 取 `teamN`，其余字段取对应的 `assistN`。
 * @param settings 完整角色配置
 * @param side 协战位
 * @returns 目标面板协战位状态
 */
export function createAssistTargetSide(settings: CharSettings, side: AssistSide): TargetSideState {
    const assist = side === "assist1" ? settings.assist1 : settings.assist2
    return {
        charId: resolveTeamCharId(settings, side),
        baseName: assist.baseName,
        targetFunction: assist.targetFunction,
        customVariables: cloneVariables(assist.customVariables),
        dotSettings: { ...assist.dotSettings },
        enabled: assist.enabled,
    }
}

/**
 * 把目标面板的写回补丁应用到角色配置：主控改顶层字段与 `mainTargetEnabled`，协战改对应 `assistN`。
 * `charId` / `baseName` 不是目标面板的编辑字段（忽略）；`charId` 真源仍是 `teamN`。
 * 原地修改传入对象（持久化由调用方负责），不做额外归一化。
 * @param settings 完整角色配置（响应式对象）
 * @param side 构筑位
 * @param patch 目标面板补丁
 */
export function applyCharTargetPatch(settings: CharSettings, side: TranscendSlotGroup, patch: Partial<TargetSideState>): void {
    const customVariables = patch.customVariables ? cloneVariables(patch.customVariables) : undefined
    const dotSettings = patch.dotSettings ? { ...patch.dotSettings } : undefined
    if (side === "main") {
        if (patch.enabled !== undefined) settings.mainTargetEnabled = patch.enabled
        if (patch.targetFunction !== undefined) settings.targetFunction = patch.targetFunction
        if (customVariables) settings.customVariables = customVariables
        if (dotSettings) settings.dotSettings = dotSettings
        return
    }
    const assist = settings[side]
    if (patch.enabled !== undefined) assist.enabled = patch.enabled
    if (patch.targetFunction !== undefined) assist.targetFunction = patch.targetFunction
    if (customVariables) assist.customVariables = customVariables
    if (dotSettings) assist.dotSettings = dotSettings
}

/**
 * 校验并求值一个已构造的构筑段：表达式错误记 invalid，构建 / 计算异常与非有限结果记 failed。
 * @param side 构筑位
 * @param charId 角色 id
 * @param build 该段构筑实例
 * @param targetFunction 该段目标表达式
 * @returns 单段结果与状态
 */
function evaluateBuiltSide(side: TranscendSlotGroup, charId: number, build: CharBuild, targetFunction: string): SideEvaluation {
    try {
        const error = build.validateAST(targetFunction) || null
        const damage = error ? null : build.calculate()
        if (!error && !Number.isFinite(damage)) {
            return { result: null, status: { side, charId, state: "failed" } }
        }
        return {
            result: { side, charId, build, damage: error ? null : damage, error },
            status: { side, charId, state: error ? "invalid" : "ok" },
        }
    } catch (cause) {
        console.warn(`原版构筑 ${side} 计算失败`, cause)
        return { result: null, status: { side, charId, state: "failed" } }
    }
}

/**
 * 主控段：无角色 → empty，未启用 → disabled，调用方未提供构筑 → failed。
 * @param settings 已归一化的角色配置
 * @param charId 主控角色 id
 * @param mainBuild 主控构筑实例
 * @returns 单段结果与状态
 */
function evaluateMainSide(settings: CharSettings, charId: number, mainBuild: CharBuild | null): SideEvaluation {
    if (charId <= 0) return { result: null, status: { side: "main", charId: 0, state: "empty" } }
    if (!settings.mainTargetEnabled) return { result: null, status: { side: "main", charId, state: "disabled" } }
    if (!mainBuild) return { result: null, status: { side: "main", charId, state: "failed" } }
    return evaluateBuiltSide("main", charId, mainBuild, settings.targetFunction)
}

/**
 * 协战段：无有效角色 → empty，未启用 → disabled，构造成空 / 抛错 → failed。
 * @param settings 已归一化的角色配置
 * @param side 协战位
 * @param inv 背包快照
 * @param mainCharId 主控角色 id（队友限定升华 BUFF 的来源过滤用）
 * @returns 单段结果与状态
 */
function evaluateAssistSide(settings: CharSettings, side: AssistSide, inv?: CharBuildInvSnapshot, mainCharId?: number): SideEvaluation {
    const charId = resolveTeamCharId(settings, side)
    if (charId <= 0) return { result: null, status: { side, charId: 0, state: "empty" } }
    const assist = side === "assist1" ? settings.assist1 : settings.assist2
    if (!assist.enabled) return { result: null, status: { side, charId, state: "disabled" } }
    let build: CharBuild | undefined
    try {
        build = createAssistBuildFromSettings(settings, side, inv, { mainCharId })
    } catch (cause) {
        console.warn(`原版构筑 ${side} 构建失败`, cause)
        return { result: null, status: { side, charId, state: "failed" } }
    }
    if (!build) return { result: null, status: { side, charId, state: "failed" } }
    return evaluateBuiltSide(side, charId, build, assist.targetFunction)
}

/**
 * 计算原版构筑页的主控 + 两条协战快照（主线程，不缓存）。
 * 未选角色 / 已禁用的段不参与合计与错误判定；参与段里任一表达式无效或构建失败时合计为 null，
 * 避免把「缺一段」的伤害当成合计（与升华页同口径）。
 * @param args 完整配置、主控 id、主控构筑与背包快照
 * @returns 三人快照
 */
export function computeCharTeamSnapshot(args: CharTeamSnapshotArgs): CharTeamSnapshot {
    const normalized = normalizeCharSettings(args.settings)
    const mainId = Number.isFinite(args.charId) && args.charId > 0 ? Math.round(args.charId) : 0
    const main = evaluateMainSide(normalized, mainId, args.mainBuild)
    const assist1 = evaluateAssistSide(normalized, "assist1", args.inv, mainId)
    const assist2 = evaluateAssistSide(normalized, "assist2", args.inv, mainId)
    const evaluations = [main, assist1, assist2]
    const activeSides = evaluations.filter(item => item.status.state !== "empty" && item.status.state !== "disabled")
    const activeResults = activeSides.map(item => item.result).filter((result): result is CharTeamSideResult => !!result)
    const firstError = activeResults.find(result => result.error)?.error ?? null
    const blocked = activeSides.some(item => item.status.state === "invalid" || item.status.state === "failed")
    let total: number | null = blocked ? null : activeResults.reduce((sum, result) => sum + (result.damage ?? 0), 0)
    if (!blocked && activeResults.length === 0) total = null
    return {
        settings: {
            main: createMainTargetSide(normalized, mainId),
            assist1: createAssistTargetSide(normalized, "assist1"),
            assist2: createAssistTargetSide(normalized, "assist2"),
        },
        sideStates: { main: main.status, assist1: assist1.status, assist2: assist2.status },
        builds: {
            main: main.result?.build ?? null,
            assist1: assist1.result?.build ?? null,
            assist2: assist2.result?.build ?? null,
        },
        main: main.result,
        assist1: assist1.result,
        assist2: assist2.result,
        total,
        totalError: blocked ? firstError : null,
    }
}
