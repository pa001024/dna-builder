import i18next from "i18next"
import { cloneDeep } from "lodash-es"
import {
    type AssistSide,
    type BuffSource,
    type CharBuildInvSnapshot,
    type CharBuildTimeline,
    type CharSettings,
    type CharSettingsInput,
    type CharSkillLevels,
    getTranscendSideGearGroup,
    getTranscendSlotType,
    isEquippedGear,
    type LeveledBuff,
    normalizeCharSettings,
    normalizeCharSkillLevels,
    normalizeTranscendSettings,
    serializeCharSettings,
    TRANSCEND_BUFF_SOURCE,
    type TranscendAffixEffectMeta,
    type TranscendBuildSettings,
    type TranscendEffects,
    type TranscendGearGroup,
    type TranscendSettings,
    type TranscendSideLoadout,
    type TranscendSlotGroup,
    type TranscendTeamSideContext,
    talents,
} from "@/data"
import { createAssistBuildFromSettings, createCharBuildFromSettings, resolveTranscendEffectsForSettings } from "@/data/CharBuildHelper"
import { type CharBuildWorkerSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { applyTraceBuffOverrides, type TraceSettingsSource } from "@/data/traceEffects"
import { getAssistFacade } from "@/utils/char-assist"
import { getAffixEffectMeta, getAffixModeling, getAffixTeammateMeta, getSlotName } from "@/utils/transcendence-gear"
import { getGearDisplayName } from "./catalog"
import { getItemSocketLines } from "./display"
import type { GearGainContext, GearIncomeBuildOptions, GearIncomeSideSnapshot, GearTeamSnapshots } from "./income"

/**
 * U91b 宿主桥接：原构筑页把升华配置并入完整构筑后，
 * 装备相对收益的基准 / 候选快照都按宿主设置（MOD / BUFF / 时间轴 / 队伍）构造；
 * 同时提供载入分享时的合并规则（旧分享没有升华字段时保留本地配置）。
 */

/** 宿主快照来源 */
export interface TranscendGainContextSource {
    /** 宿主完整角色配置 */
    settings: CharSettings
    /** 主控角色 id */
    charId: number
    /** 背包快照（全局特效等级） */
    inv?: CharBuildInvSnapshot
    /** 主控时间线（与页面构筑一致） */
    timeline?: CharBuildTimeline
    /** 数据包水合键（换包后快照必须失效） */
    dataPackKey?: string | number
}

/**
 * 取构筑位在升华配置中对应的装备组字段名。
 * @param side 构筑位
 * @returns 字段名
 */
function gearKeyOf(side: TranscendSlotGroup): "mainGear" | "assist1Gear" | "assist2Gear" {
    return side === "main" ? "mainGear" : side === "assist1" ? "assist1Gear" : "assist2Gear"
}

/**
 * 用宿主设置构造某构筑位的快照：主控走完整工厂（含 MOD / 队伍 / 时间轴），协战走协战工厂。
 * `options.suppress` 仅由收益候选（专属组件隔离）传入，不进设置 / 快照持久结构。
 * @param source 宿主快照来源
 * @param side 构筑位
 * @param gear 该位装备组（缺省 = 当前装备组）
 * @param options 收益专用组装选项
 * @returns 快照；构建失败或目标表达式非法时为 null
 */
function buildHostSnapshot(
    source: TranscendGainContextSource,
    side: TranscendSlotGroup,
    gear?: TranscendGearGroup,
    options?: GearIncomeBuildOptions
): CharBuildWorkerSnapshot | null {
    const next: CharSettings = gear
        ? { ...source.settings, transcend: { ...source.settings.transcend, [gearKeyOf(side)]: gear } }
        : source.settings
    try {
        const build =
            side === "main"
                ? createCharBuildFromSettings(source.charId, next, source.inv, source.timeline, undefined, undefined, {
                      transcendSuppress: options?.suppress,
                  })
                : createAssistBuildFromSettings(next, side, source.inv, {
                      mainCharId: source.charId,
                      transcendSuppress: options?.suppress,
                  })
        if (!build) return null
        // 各构筑位有独立目标表达式：按构造后的构筑校验，非法时该侧收益显示占位而不是 0%
        if (build.validateAST(build.targetFunction ?? "")) return null
        return createWorkerSnapshot(build)
    } catch {
        return null
    }
}

/**
 * 构造团队合计快照（U137）：装备写入 owner side 后，按目标函数卡口径重建所有启用侧
 * （`mainTargetEnabled` / `assistN.enabled`、charId > 0），各自使用本侧目标表达式。
 * 无任何启用侧时回退 owner 侧单侧快照并标记；任一启用侧失败 / 目标非法时返回 null。
 * @param source 宿主快照来源
 * @param ownerSide 装备所属构筑位
 * @param gear 该位装备组（缺省 = 当前装备组）
 * @param options 收益专用组装选项
 * @returns 参与侧快照与口径标记；不可求值时为 null
 */
function buildHostTeamSnapshots(
    source: TranscendGainContextSource,
    normalizedBase: CharSettings,
    ownerSide: TranscendSlotGroup,
    gear?: TranscendGearGroup,
    options?: GearIncomeBuildOptions
): GearTeamSnapshots | null {
    try {
        // 与 `computeCharTeamSnapshot` 同口径：目标面板读到的是归一化后的启用位 / 角色 id。
        // 候选装备在归一化之后写入：收益候选可能带表外的 synthetic 词条，归一化会把它降级 / 丢弃。
        const normalized: CharSettings = gear
            ? { ...normalizedBase, transcend: { ...normalizedBase.transcend, [gearKeyOf(ownerSide)]: gear } }
            : normalizedBase
        const sides: GearIncomeSideSnapshot[] = []
        if (source.charId > 0 && normalized.mainTargetEnabled) {
            const build = createCharBuildFromSettings(source.charId, normalized, source.inv, source.timeline, "main", undefined, {
                transcendSuppress: options?.suppress,
            })
            if (!build || build.validateAST(build.targetFunction ?? "")) return null
            sides.push({ side: "main", build: createWorkerSnapshot(build) })
        }
        for (const side of ["assist1", "assist2"] as const) {
            const rawCharId = side === "assist1" ? normalized.team1 : normalized.team2
            const charId = typeof rawCharId === "number" && Number.isFinite(rawCharId) && rawCharId > 0 ? Math.round(rawCharId) : 0
            if (charId <= 0 || !normalized[side]?.enabled) continue
            const build = createAssistBuildFromSettings(normalized, side, source.inv, {
                mainCharId: source.charId,
                transcendSuppress: options?.suppress,
            })
            if (!build || build.validateAST(build.targetFunction ?? "")) return null
            sides.push({ side, build: createWorkerSnapshot(build) })
        }
        if (!sides.length) {
            // 目标面板此时没有合计可显示：回退装备者自身侧并标记，不冒充团队收益
            const fallback = buildHostSnapshot(source, ownerSide, gear, options)
            return fallback ? { sides: [{ side: ownerSide, build: fallback }], target: "owner" } : null
        }
        return { sides, target: "team" }
    } catch {
        return null
    }
}

/**
 * 团队角色 id（`teamN` 的 "-" / 非正数视为未配置）：缓存键显式段。
 * @param value 配置中的队伍角色 id
 * @returns 归一化 id；未配置为 0
 */
function teamCharIdOf(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/**
 * 稳定序列化纯数据键值：对象按 key 排序、数组保序，保证同一输入的缓存键可复现。
 * @param value 待序列化的值
 * @returns 稳定字符串
 */
function stableKeyOf(value: unknown): string {
    if (value === null || value === undefined) return ""
    if (typeof value !== "object") return String(value)
    if (Array.isArray(value)) return `[${value.map(stableKeyOf).join(",")}]`
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map(key => `${key}:${stableKeyOf(record[key])}`).join(",")}}`
}

/**
 * 背包特效等级指纹（全局特效等级变化会改变页面伤害，收益缓存必须同步失效）。
 * @param inv 背包快照
 * @returns 稳定字符串
 */
function invKeyOf(inv?: CharBuildInvSnapshot): string {
    if (!inv) return ""
    return `${stableKeyOf(inv.buffLv)}|${stableKeyOf(inv.wLv)}`
}

/**
 * 时间线指纹：只取参与计算的轨道 / 名称 / 时间 / 等级与血量曲线，避开 BUFF 实例引用。
 * @param timeline 主控时间线
 * @returns 稳定字符串
 */
function timelineKeyOf(timeline?: CharBuildTimeline): string {
    if (!timeline) return ""
    const items = timeline.items.map(item => `${item.track}:${item.name}:${item.time}:${item.duration}:${item.lv ?? ""}`).join(",")
    return `${timeline.name}|${items}|${stableKeyOf(timeline.hp)}`
}

/**
 * 创建宿主收益上下文：缓存键 = 合计口径版本 + 完整角色配置 + 三侧角色 id + 数据包 + 背包特效等级 + 时间线。
 * `CharSettings` 不存主控 id、背包与时间线又与设置分离，任一变化都必须让槽位 / 候选收益失效；
 * `team-total:v1` 前缀隔离旧的单侧口径结果（同会话 HMR / 长缓存不跨语义复用）。
 * @param source 宿主快照来源
 * @returns 收益上下文（含缓存键与快照工厂）
 */
export function createTranscendGainContext(source: TranscendGainContextSource): GearGainContext {
    // 团队合计与目标面板同口径（归一化后的启用位 / 角色 id）；每个候选只替换装备组，避免逐件重复归一化
    let normalizedBase: CharSettings | undefined
    const baseSettings = (): CharSettings => (normalizedBase ??= normalizeCharSettings(source.settings))
    return {
        key: [
            "team-total:v1",
            serializeCharSettings(source.settings),
            source.charId,
            teamCharIdOf(source.settings.team1),
            teamCharIdOf(source.settings.team2),
            source.dataPackKey ?? "",
            invKeyOf(source.inv),
            timelineKeyOf(source.timeline),
        ].join("\u0000"),
        buildSnapshot: (side, gear, options) => buildHostSnapshot(source, side, gear, options),
        buildTeamSnapshots: (ownerSide, gear, options) => buildHostTeamSnapshots(source, baseSettings(), ownerSide, gear, options),
    }
}

/** 页面主控构筑的升华注入结果 */
export interface MainTranscendInjection {
    /** 基础技能等级（已归一化 / 钳 1-30）：有效等级由 CharBuild 聚合 BUFF 三键后二次解析 */
    skillLevel: CharSkillLevels
    /** 原 BUFF 列表 + 升华 BUFF（顺序：手动 → 潜质 → 魔灵 → 升华），含技能等级合成 BUFF */
    buffs: LeveledBuff[]
    /** 升华词条派生的技能替换 */
    skillReplacements: TranscendEffects["skillReplacements"]
}

/**
 * 页面主控构筑的升华注入（与 `createCharBuildFromSettings` 同序同口径）：
 * 供 `CharBuildView` 的 `new CharBuild` 使用，并由测试直接验证顺序 / 技能等级 / 技能替换。
 * @param args 升华配置、角色上下文、基础技能等级与基础 BUFF（手动 → 潜质 → 魔灵）、三侧团队上下文、
 *             溯源设置投影（缺省时不注入溯源）
 * @returns 可直接写入 `CharBuild` 选项的注入结果
 */
export function resolveMainTranscendInjection(args: {
    transcend: TranscendSettings | null | undefined
    charId: number
    charElement: string
    charSkillLevel: CharSkillLevels
    buffs: LeveledBuff[]
    /** 队友限定 BUFF 的跨侧上下文；缺省时不跨侧收集 */
    teamSides?: readonly TranscendTeamSideContext[]
    /** 溯源设置（每侧关闭的根源 + 手动 BUFF 列表）；缺省时不注入溯源 */
    traceSettings?: TraceSettingsSource | null
}): MainTranscendInjection {
    const effects = resolveTranscendEffectsForSettings({ transcend: args.transcend, ...(args.traceSettings ?? {}) }, "main", {
        charId: args.charId,
        charElement: args.charElement,
        teamSides: args.teamSides,
    })
    // 溯源规则的字段覆盖作用于同名手动 BUFF（与工厂同口径）
    const buffs = applyTraceBuffOverrides(args.buffs, effects.buffOverrides)
    return {
        // 只传基础值：技能等级加成已在合成 BUFF 的三键属性里
        skillLevel: normalizeCharSkillLevels(args.charSkillLevel),
        buffs: [...buffs, ...effects.buffs],
        skillReplacements: effects.skillReplacements,
    }
}

/** buff 栏只读派生条目的来源侧标签键 */
const DERIVED_BUFF_SIDE_LABEL_KEYS: Record<"main" | "assist1" | "assist2", string> = {
    main: "transcend-build.mode_main",
    assist1: "transcend-build.mode_assist1",
    assist2: "transcend-build.mode_assist2",
}

/** 自身装备派生的标签键 */
export const DERIVED_BUFF_GEAR_LABEL_KEY = "char-build.derived_buffs_gear"

/** 天赋派生的标签键（来源名解析失败时的回退） */
export const DERIVED_BUFF_TALENT_LABEL_KEY = "char-build.derived_buffs_talent"

/** 派生条目的单条加成属性（当前数值，已按等级 / 覆盖率缩放） */
export interface DerivedBuffAttribute {
    name: string
    value: number
}

/** buff 栏只读派生条目：由构筑实例反推，不写 `settings.buffs` */
export interface DerivedBuffEntry {
    name: string
    /** 来源侧标签 i18n 键（自身装备派生为 `char-build.derived_buffs_gear`） */
    labelKey: string
    sourceSide?: "main" | "assist1" | "assist2"
    /** 同名同来源的份数（2015 由协战 1 / 2 各提供一份时按来源各一行） */
    stacks: number
    coverage?: number
    /** 来源类型：天赋节点 / 装备（含宝石）/ 溯源（溯源条目由独立溯源区展示，不进本列表） */
    sourceKind?: "talent" | "gear" | "trace"
    /** 天赋节点 id（`source.kind === "talent"`）：节点名可能重名，渲染 key 必须带上它 */
    sourceId?: number
    /** 天赋效果下标：同一节点多条同名效果不合并 */
    effectIndex?: number
    /** 装备词条 id（`source.kind === "gear"`，含宝石词条） */
    affixId?: number
    sourceSlotId?: number
    sourceSocketIndex?: number
    /**
     * 装备词条来源类（`tempering` 单独一类，其余同一类）：
     * 同 id 的随机 / 淬炼双行按它分行，避免合成 ×N 后只显示首行数值。
     */
    affixSourceClass?: "tempering" | "other"
    /** 调用方解析后的本地化来源名（装备名 / `装备 · 宝石` / 天赋节点名+id） */
    sourceName?: string
    /** 当前数值（非零项） */
    attributes: DerivedBuffAttribute[]
    description?: string
    /** 手写建模备注（`UNIQUE_AFFIX_MAP[affixId].note`） */
    note?: string
    effect?: TranscendAffixEffectMeta
    limited?: string | number
    skill?: string
    tags?: string[]
}

/** 派生条目渲染 key 所需的最小来源身份 */
export type DerivedBuffKeySource = Pick<
    DerivedBuffEntry,
    | "name"
    | "sourceSide"
    | "sourceKind"
    | "sourceId"
    | "effectIndex"
    | "affixId"
    | "sourceSlotId"
    | "sourceSocketIndex"
    | "affixSourceClass"
>

/**
 * 派生条目渲染 key：名称 + 来源侧 + 完整来源身份（天赋节点 / 效果下标 / 词条 / 装备位 / 孔位 / 来源类）。
 * 默认全解锁的 100 节点天赋会出现大量同名条目，只有带上节点 id 才能保证 key 唯一。
 * @param entry 派生条目（或视图投影）
 * @returns 唯一 key
 */
export function getDerivedBuffRenderKey(entry: DerivedBuffKeySource): string {
    return [
        entry.name,
        entry.sourceSide ?? "",
        entry.sourceKind ?? "",
        entry.sourceId ?? "",
        entry.effectIndex ?? "",
        entry.affixId ?? "",
        entry.sourceSlotId ?? "",
        entry.sourceSocketIndex ?? "",
        entry.affixSourceClass ?? "",
    ].join(":")
}

/** 派生条目收集选项 */
export interface CollectDerivedBuffOptions {
    /** 解析来源身份的显示名；缺省不解析，视图回退来源标签文案 */
    resolveSourceName?: (source: BuffSource, ownerSide?: DerivedBuffEntry["sourceSide"]) => string | undefined
}

/**
 * 派生条目分组键：名称 + 来源侧 + 来源身份（kind/id/effectIndex/slotId/socketIndex/来源类）。
 * 不同装备 / 宝石 / 天赋节点 / 同节点多效果 / 同 id 的随机与淬炼行的同名 BUFF 分行，同来源叠加仍聚合。
 * @param buff 构筑实例中的派生 BUFF
 * @returns 分组键
 */
function derivedBuffGroupKey(buff: LeveledBuff): string {
    const source = buff.source
    return [
        buff.名称,
        source?.ownerSide ?? "",
        source?.kind ?? "",
        source?.id ?? "",
        source?.effectIndex ?? "",
        source?.slotId ?? "",
        source?.socketIndex ?? "",
        source?.affixSourceClass ?? "",
    ].join("\u0000")
}

/**
 * 提取 BUFF 当前数值表的非零项。
 * @param buff 构筑实例中的派生 BUFF
 * @returns 加成属性列表
 */
function collectBuffAttributes(buff: LeveledBuff): DerivedBuffAttribute[] {
    return Object.entries(buff.values)
        .filter(([, value]) => Number.isFinite(value) && value !== 0)
        .map(([name, value]) => ({ name, value }))
}

/**
 * 读取词条的效果参数：优先直接登记的效果，其次队友限定范式的目标 / 触发 / 持续 / 层数。
 * @param affixId 词条 id
 * @returns 效果参数；未登记时为 undefined
 */
function resolveAffixEffect(affixId: number): TranscendAffixEffectMeta | undefined {
    const effect = getAffixEffectMeta(affixId)
    if (effect) return effect
    const team = getAffixTeammateMeta(affixId)
    return team ? { target: team.target, trigger: team.trigger, duration: team.duration, maxLayers: team.maxStacksPerSource } : undefined
}

/**
 * 从构筑 BUFF 中提取只读派生条目：只认 `pt === TRANSCEND_BUFF_SOURCE`，且手动 BUFF 列表里没有同名项。
 * 名称 + 来源侧 + 来源身份（词条 / 装备位 / 孔位 / 天赋节点）相同才聚合为一行并计份数。
 * @param buffs 构筑实例的 BUFF 列表
 * @param manualNames 用户手动选择的 BUFF 名称
 * @param options 来源名解析等可选钩子
 * @returns 只读派生条目（按出现顺序）
 */
export function collectDerivedBuffEntries(
    buffs: readonly LeveledBuff[],
    manualNames: Iterable<string>,
    options: CollectDerivedBuffOptions = {}
): DerivedBuffEntry[] {
    const manual = new Set(manualNames)
    const grouped = new Map<string, DerivedBuffEntry>()
    for (const buff of buffs) {
        if (buff.pt !== TRANSCEND_BUFF_SOURCE) continue
        if (manual.has(buff.名称)) continue
        const source = buff.source
        const sourceSide = source?.ownerSide
        const key = derivedBuffGroupKey(buff)
        const existing = grouped.get(key)
        if (existing) {
            existing.stacks += 1
            continue
        }
        const sourceKind = source?.kind
        const affixId = sourceKind === "gear" ? source?.id : undefined
        grouped.set(key, {
            name: buff.名称,
            labelKey: sourceSide
                ? DERIVED_BUFF_SIDE_LABEL_KEYS[sourceSide]
                : sourceKind === "talent"
                  ? DERIVED_BUFF_TALENT_LABEL_KEY
                  : DERIVED_BUFF_GEAR_LABEL_KEY,
            sourceSide,
            stacks: 1,
            coverage: buff.coverage,
            sourceKind,
            sourceId: sourceKind === "talent" ? source?.id : undefined,
            effectIndex: sourceKind === "talent" ? source?.effectIndex : undefined,
            affixId,
            sourceSlotId: source?.slotId,
            sourceSocketIndex: source?.socketIndex,
            affixSourceClass: source?.affixSourceClass,
            sourceName: source ? options.resolveSourceName?.(source, sourceSide) : undefined,
            attributes: collectBuffAttributes(buff),
            description: buff.描述 || undefined,
            note: affixId === undefined ? undefined : getAffixModeling(affixId)?.note,
            effect: affixId === undefined ? undefined : resolveAffixEffect(affixId),
            limited: buff.限定,
            skill: buff.技能,
            tags: buff.tag,
        })
    }
    return [...grouped.values()]
}

/**
 * 装备位（1-16）→ 官方槽型名（头盔 / 护胸 / 手套 / …，游戏原文，调用方再过 `gt`）。
 * 展示层用名称而非装备位编号。
 * @param slotId 装备位
 * @returns 槽型名；越界时为空串
 */
export function getDerivedBuffSlotName(slotId: number): string {
    return getSlotName(getTranscendSlotType(slotId))
}

/**
 * 创建派生 BUFF 来源名解析器：装备按 `slotId` 取对应构筑位的物品名（宝石再拼宝石名），
 * 天赋按节点 id 取节点名；解析不到返回 undefined，视图回退来源标签文案。
 * @param settings 宿主完整角色配置（读取 `transcend` 三组装备）
 * @param translate 游戏原文翻译函数
 * @param locale 当前语言（装备前缀拼接顺序）
 * @returns 来源名解析函数
 */
export function createDerivedBuffSourceResolver(
    settings: Pick<CharSettings, "transcend">,
    translate: (text: string | undefined | null) => string,
    locale: string = i18next.language
): (source: BuffSource, ownerSide?: DerivedBuffEntry["sourceSide"]) => string | undefined {
    return (source, ownerSide) => {
        if (source.kind === "talent") {
            const talent = talents.find(item => item.id === source.id)
            return talent ? translate(talent.name) || undefined : undefined
        }
        if (source.slotId === undefined) return undefined
        const slotId = source.slotId
        const side = ownerSide ?? source.ownerSide ?? "main"
        const group = getTranscendSideGearGroup(settings.transcend, side)
        const entry = group.find(item => isEquippedGear(item) && Math.round(item.slotId) === Math.round(slotId))
        // 畸形存档可能带 `item: null`：`isEquippedGear` 只查键存在，这里再兜一层
        if (!entry || !isEquippedGear(entry) || !entry.item || typeof entry.item !== "object") return undefined
        const name = getGearDisplayName(entry.item, translate, locale)
        if (source.socketIndex === undefined) return name || undefined
        const socketLine = getItemSocketLines(entry.item).find(line => line.socketIndex === source.socketIndex)
        const gemName = socketLine ? translate(socketLine.name) : ""
        if (!gemName) return name || undefined
        return name ? `${name} · ${gemName}` : gemName
    }
}

/**
 * 构造装备 / 天赋编辑器的宿主 facade：角色与队伍取当前页面，升华配置取本地存档。
 * 编辑器里的做装 / 附魔 / 库存据此按宿主角色与协战过滤；emit 仍只写 `transcend`。
 * @param settings 宿主完整角色配置
 * @param mainCharId 主控角色 id（`CharSettings` 不存主控 id）
 * @returns 编辑器使用的升华构筑设置
 */
export function createTranscendEditorSettings(settings: CharSettings, mainCharId: number): TranscendBuildSettings {
    /**
     * 协战位 facade：角色 id / 单武器取 `teamN` / `teamNWeapon`，其余 loadout 取 `assistN`。
     * @param side 协战位
     * @returns 该位的完整 loadout
     */
    const assistSide = (side: AssistSide): TranscendSideLoadout => {
        const facade = getAssistFacade(settings, side)
        return {
            ...facade,
            charSkillLevel: [...facade.charSkillLevel] as [number, number, number],
            customVariables: facade.customVariables.map(variable => [variable[0], variable[1]] as [string, string]),
            dotSettings: { ...facade.dotSettings },
            enabled: facade.enabled && facade.charId > 0,
        }
    }
    return {
        main: {
            charId: mainCharId,
            charLevel: settings.charLevel,
            charSkillLevel: [...settings.charSkillLevel] as [number, number, number],
            traceLevel: settings.traceLevel,
            traceOffRoots: [...(settings.traceOffRoots ?? [])],
            traceStacks: [...(settings.traceStacks ?? [])],
            meleeWeapon: settings.meleeWeapon,
            meleeWeaponLevel: settings.meleeWeaponLevel,
            meleeWeaponRefine: settings.meleeWeaponRefine,
            rangedWeapon: settings.rangedWeapon,
            rangedWeaponLevel: settings.rangedWeaponLevel,
            rangedWeaponRefine: settings.rangedWeaponRefine,
            extraMastery: settings.extraMastery,
            baseName: settings.baseName,
            targetFunction: settings.targetFunction,
            customVariables: settings.customVariables.map(variable => [variable[0], variable[1]] as [string, string]),
            dotSettings: { ...settings.dotSettings },
            enabled: true,
        },
        assist1: assistSide("assist1"),
        assist2: assistSide("assist2"),
        transcend: settings.transcend,
        buffs: settings.buffs,
        petId: settings.petId,
        petLevel: settings.petLevel,
        petCoverage: settings.petCoverage,
        petAutoCoverage: settings.petAutoCoverage,
        traits: settings.traits,
        customBuff: settings.customBuff,
        targetFunction: settings.targetFunction,
        customVariables: settings.customVariables,
        enemyId: settings.enemyId,
        enemyLevel: settings.enemyLevel,
        enemyResistance: settings.enemyResistance,
        hpPercent: settings.hpPercent,
        resonanceGain: settings.resonanceGain,
        imbalance: settings.imbalance,
    }
}

/**
 * 合并载入的分享构筑：分享内容带升华配置时按其归一化；
 * 旧分享没有该字段时保留本地升华配置（不因载入他人构筑而清空本地装备 / 天赋）。
 * @param loaded 载入的角色配置（可含脏数据）
 * @param localTranscend 当前本地升华配置
 * @returns 归一化后的新配置
 */
export function mergeSharedCharSettings(
    loaded: CharSettingsInput | null | undefined,
    localTranscend: TranscendSettings | null | undefined
): CharSettings {
    const hasSharedTranscend =
        !!loaded && typeof loaded === "object" && !Array.isArray(loaded) && (loaded as { transcend?: unknown }).transcend != null
    const next = normalizeCharSettings(loaded)
    if (!hasSharedTranscend && localTranscend) next.transcend = normalizeTranscendSettings(cloneDeep(localTranscend))
    return next
}
