import { resolveBuffSkillLevel, resolveSideEffectiveSkillLevels, resolveTranscendEffectsForSettings } from "./CharBuildHelper"
import type { CharSettings, CharSkillLevels } from "./charSettings"
import { buffMap, charMap } from "./d"
import type { Buff } from "./data-types"
import { isOwnLegacyTraceBuff } from "./traceEffects"
import { buildTranscendTeamSides, type TranscendTeamSideContext } from "./transcend"
import type { TranscendSlotGroup } from "./transcendSettings"
import type { TranscendSkillReplacement } from "./transcendSkills"

/**
 * 升华效果的 wasm 载荷：映射仍由 TS `collectTranscendEffects` 单一实现，
 * Rust 只负责把载荷应用到装配结果（合成 BUFF / 技能等级增量 / 技能替换）。
 */

/** 单条合成 BUFF：原始记录 + 等级 / 覆盖率（对齐 TS `new LeveledBuff(data, 1)`） */
export interface WasmTranscendBuff {
    data: Buff
    level: number
    coverage?: number
}

/** 单个构筑位的升华效果集（主控 = 天赋 + 装备；协战 = 本组装备） */
export interface WasmTranscendEffectSet {
    /**
     * 合成 BUFF（含三键 `E/Q/P技能等级`）：Rust 汇总属性池后按标准属性二次装配技能等级。
     * 不再有独立技能等级字段（U126b）。
     */
    buffs: WasmTranscendBuff[]
    /** 技能替换（源技能 id → 载荷）：角色技能与武器技能共用 */
    skillReplacements: Record<number, TranscendSkillReplacement>
}

/** 三侧载荷：随 settings 进入 wasm 请求，不写入持久化 `CharSettings` */
export interface WasmTranscendPayload {
    main: WasmTranscendEffectSet
    assist1?: WasmTranscendEffectSet
    assist2?: WasmTranscendEffectSet
}

export type TranscendWasmSide = TranscendSlotGroup

/** 携带升华载荷的请求配置（仅 wasm 请求期字段） */
export type WasmCharSettings = CharSettings & {
    transcendEffects?: WasmTranscendPayload
    transcendSide?: TranscendWasmSide
}

/**
 * 角色元素：与 `LeveledCharHelper.fromId` 同口径（6 位 id 右移两位），缺失时返回 undefined。
 * @param charId 角色 id
 * @returns 角色元素（如「水」）；未配置 / 查表失败时 undefined
 */
function charElementOf(charId: number | undefined): string | undefined {
    if (typeof charId !== "number" || !Number.isFinite(charId)) return undefined
    const id = charId > 9999 ? Math.trunc(charId / 100) : charId
    return charMap.get(id)?.属性
}

/**
 * 协战 id 归一化：与 `createAssistBuildFromSettings` 同序（先取整再判正数）。
 * `0.4` / 负数 / 非有限数一律视为未配置，避免生成不会被装配的侧载荷。
 * @param value `team1` / `team2` 原始值
 * @returns 有效角色 id；未配置时 undefined
 */
function sideCharId(value: string | number | undefined): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined
    const id = Math.round(value)
    return id > 0 ? id : undefined
}

/**
 * 生成单个构筑位的升华效果集（含溯源规则覆盖后的合成 BUFF）。
 * @param settings 完整角色配置
 * @param side 构筑位
 * @param charId 该侧角色 id（元素专属词条用）
 * @param teamSides 三侧团队上下文（缺省时不跨侧收集队友限定 BUFF）
 * @param mainCharId 主控角色 id（等级来源解析用；缺省按该侧 id）
 * @returns 可序列化的效果集
 */
export function buildWasmTranscendEffectSet(
    settings: CharSettings,
    side: TranscendSlotGroup,
    charId?: number,
    teamSides?: readonly TranscendTeamSideContext[],
    mainCharId?: number
): WasmTranscendEffectSet {
    return toWasmEffectSet(buildWasmSidePlan(settings, side, charId, mainCharId ?? charId, teamSides))
}

/** 单个构筑位的 wasm 请求计划：效果集 + 手动 BUFF 副本 + 规则覆盖后的合成 BUFF */
interface WasmSidePlan {
    side: TranscendWasmSide
    effects: ReturnType<typeof resolveTranscendEffectsForSettings>
    /** 请求副本中的手动 BUFF（已剔除本侧旧 `*溯` 与被规则覆盖的条目） */
    buffs: CharSettings["buffs"]
    /** 规则覆盖后的合成 BUFF（同名 + 覆盖后字段，进入该侧载荷） */
    overrides: WasmTranscendBuff[]
    changed: boolean
}

/**
 * 把效果集转换为可序列化载荷：溯源 / 升华 BUFF + 规则覆盖合成 BUFF。
 * 技能等级三键随 BUFF 原样下发（U126b 起由 Rust 标准属性管线二次装配等级）。
 */
function toWasmEffectSet(plan: WasmSidePlan): WasmTranscendEffectSet {
    const buffs: WasmTranscendBuff[] = []
    for (const buff of plan.effects.buffs) {
        const entry: WasmTranscendBuff = { data: buff._originalBuffData, level: buff.等级 }
        if (buff.coverage !== 1) entry.coverage = buff.coverage
        buffs.push(entry)
    }
    for (const entry of plan.overrides) buffs.push(entry)
    return {
        buffs,
        skillReplacements: plan.effects.skillReplacements,
    }
}

/** 某构筑位配置里的手动 BUFF 列表 */
function ownerBuffsOf(settings: CharSettings, side: TranscendWasmSide): CharSettings["buffs"] {
    if (side === "main") return settings.buffs ?? []
    return (side === "assist1" ? settings.assist1?.buffs : settings.assist2?.buffs) ?? []
}

/**
 * 构造某构筑位的 wasm 请求计划（不改存档）：
 * 1. `等级来源` BUFF 的等级取来源侧有效技能等级（数值仍由各自引擎按表达式求值）；
 * 2. 本侧角色已由溯源区接管的旧 `*溯` 条目剔除；
 * 3. 被溯源规则覆盖的手动 BUFF 从副本移除，并把覆盖后的合成 BUFF 加入该侧载荷（TS 同值）。
 * @param settings 完整角色配置
 * @param side 构筑位
 * @param charId 该侧角色 id
 * @param mainCharId 主控角色 id（等级来源跨侧解析用）
 * @param teamSides 三侧团队上下文
 * @returns 请求计划
 */
function buildWasmSidePlan(
    settings: CharSettings,
    side: TranscendWasmSide,
    charId: number | undefined,
    mainCharId: number | undefined,
    teamSides?: readonly TranscendTeamSideContext[]
): WasmSidePlan {
    const effects = resolveTranscendEffectsForSettings(settings, side, {
        charId,
        charElement: charElementOf(charId),
        teamSides,
    })
    const ownerBuffs = ownerBuffsOf(settings, side)
    const buffs: CharSettings["buffs"] = []
    const overrides: WasmTranscendBuff[] = []
    if (!ownerBuffs.length) return { side, effects, buffs, overrides, changed: false }
    // 规则覆盖目标 → 字段（同一目标多规则按收集顺序合并，与 `applyTraceBuffOverrides` 同口径）
    const overrideAttrs = new Map<string, Record<string, number | string>>()
    for (const override of effects.buffOverrides) {
        overrideAttrs.set(override.target, { ...(overrideAttrs.get(override.target) ?? {}), ...override.attrs })
    }
    const sideLevels = new Map<TranscendWasmSide, CharSkillLevels>()
    const levelsOf = (target: TranscendWasmSide): CharSkillLevels => {
        let levels = sideLevels.get(target)
        if (!levels) {
            const targetCharId =
                target === "main" ? mainCharId : target === "assist1" ? normalizeCharId(settings.team1) : normalizeCharId(settings.team2)
            levels = resolveSideEffectiveSkillLevels(settings, target, targetCharId)
            sideLevels.set(target, levels)
        }
        return levels
    }
    const ownerLevels = levelsOf(side)
    let changed = false
    for (const entry of ownerBuffs) {
        const [name, storedLevel, coverage] = entry
        // 本侧角色已由溯源区接管的旧 `*溯` 条目：TS 工厂不注入，wasm 请求副本同样剔除（其他角色条目保留）
        if (isOwnLegacyTraceBuff(name, charId)) {
            changed = true
            continue
        }
        const data = buffMap.get(name)
        const attrs = overrideAttrs.get(name)
        if (attrs) {
            // 覆盖：移除手动条目，改为向该侧载荷注入同名 + 覆盖后字段的合成 BUFF
            if (data) {
                const level = resolveBuffSkillLevel(data, settings, side, charId ?? 0, ownerLevels, sideLevels) ?? storedLevel
                const entryBuff: WasmTranscendBuff = {
                    data: { ...data, attr: { ...(data.attr ?? {}), ...attrs } },
                    level,
                }
                if (coverage !== undefined && coverage !== 1) entryBuff.coverage = coverage
                overrides.push(entryBuff)
            }
            changed = true
            continue
        }
        if (!data?.等级来源) {
            buffs.push(entry)
            continue
        }
        const level = resolveBuffSkillLevel(data, settings, side, charId ?? 0, ownerLevels, sideLevels) ?? storedLevel
        if (level === storedLevel) {
            buffs.push(entry)
            continue
        }
        buffs.push([name, level, coverage] as CharSettings["buffs"][number])
        changed = true
    }
    return { side, effects, buffs, overrides, changed }
}

/** 三侧请求计划（未配置的协战侧缺席） */
function createWasmSidePlans(
    charId: number | undefined,
    settings: CharSettings,
    teamSides: readonly TranscendTeamSideContext[]
): WasmSidePlan[] {
    const assist1Id = sideCharId(settings.team1)
    const assist2Id = sideCharId(settings.team2)
    const plans = [buildWasmSidePlan(settings, "main", charId, charId, teamSides)]
    if (assist1Id !== undefined) plans.push(buildWasmSidePlan(settings, "assist1", assist1Id, charId, teamSides))
    if (assist2Id !== undefined) plans.push(buildWasmSidePlan(settings, "assist2", assist2Id, charId, teamSides))
    return plans
}

/** 由请求计划汇总载荷；三侧都没有效果时返回 undefined */
function toWasmPayload(plans: readonly WasmSidePlan[]): WasmTranscendPayload | undefined {
    const payload: WasmTranscendPayload = { main: toWasmEffectSet(plans[0]) }
    const assist1 = plans.find(plan => plan.side === "assist1")
    if (assist1) payload.assist1 = toWasmEffectSet(assist1)
    const assist2 = plans.find(plan => plan.side === "assist2")
    if (assist2) payload.assist2 = toWasmEffectSet(assist2)
    const hasEffects = (set: WasmTranscendEffectSet | undefined) =>
        !!set && (set.buffs.length > 0 || Object.keys(set.skillReplacements).length > 0)
    if (!hasEffects(payload.main) && !hasEffects(payload.assist1) && !hasEffects(payload.assist2)) return undefined
    return payload
}

/**
 * 生成三侧合成载荷；`resolveTranscendEffectsForSettings` 已并入每侧溯源效果（按每侧关闭根源 / 激活集合），
 * 因此即使升华总开关关闭，只要该侧有溯源效果也要下发——否则 wasm 会缺少溯源 BUFF / 技能等级三键。
 * 规则覆盖后的同名 BUFF 同样作为合成 BUFF 进入载荷（请求副本里的手动条目已被剔除）。
 * 三侧都没有任何效果时返回 undefined（请求不携带空载荷）。
 * 协战侧只读自己组的装备（`collectTranscendEffects` 已保证），未配置协战时该侧缺席。
 * @param charId 主控角色 id（可缺失：缺失时元素专属词条按未命中处理，不抛错）
 * @param settings 完整角色配置
 * @returns 三侧载荷；三侧均为空时为 undefined
 */
export function buildWasmTranscendPayload(charId: number | undefined, settings: CharSettings): WasmTranscendPayload | undefined {
    const teamSides = buildTranscendTeamSides(settings, charId)
    return toWasmPayload(createWasmSidePlans(charId, settings, teamSides))
}

/** 团队角色 id 归一化（与 build 工厂 / 角色表同口径） */
function normalizeCharId(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined
    const id = Math.round(value)
    if (id <= 0) return undefined
    return id > 9999 ? Math.trunc(id / 100) : id
}

/**
 * 给请求配置副本附加升华载荷；`等级来源` 手动 BUFF 的等级按来源侧有效等级写入副本，
 * 被溯源规则覆盖的手动 BUFF 从副本移除并改为载荷里的合成 BUFF（与 TS 构筑同值）。
 * 未启用升华且没有等级需要解析 / 条目需要覆盖时原样返回，避免无谓的克隆。
 * @param charId 本次求值的角色 id
 * @param settings 完整角色配置
 * @param side Rust 装配使用的构筑位：该侧效果集会被应用（默认主控）
 * @returns 带 `transcendEffects` / `transcendSide` 的请求配置
 */
export function withWasmTranscendPayload(
    charId: number | undefined,
    settings: CharSettings,
    side: TranscendWasmSide = "main"
): WasmCharSettings {
    const teamSides = buildTranscendTeamSides(settings, charId)
    const plans = createWasmSidePlans(charId, settings, teamSides)
    const payload = toWasmPayload(plans)
    if (!payload && !plans.some(plan => plan.changed)) return settings
    const mainPlan = plans.find(plan => plan.side === "main")!
    const next: WasmCharSettings = {
        ...settings,
        buffs: mainPlan.buffs,
        ...(payload ? { transcendEffects: payload, transcendSide: side } : {}),
    }
    const assist1 = plans.find(plan => plan.side === "assist1")
    if (assist1 && settings.assist1) next.assist1 = { ...settings.assist1, buffs: assist1.buffs }
    const assist2 = plans.find(plan => plan.side === "assist2")
    if (assist2 && settings.assist2) next.assist2 = { ...settings.assist2, buffs: assist2.buffs }
    return next
}
