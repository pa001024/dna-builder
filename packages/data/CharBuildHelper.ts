import { CharBuild, CharBuildTimeline } from "./CharBuild"
import {
    type CharSettings,
    type CharSkillLevels,
    createDefaultInlineActions,
    getModVariantAura,
    getModVariantSlots,
    normalizeCharSkillLevels,
} from "./charSettings"
import { buffMap, charMap, weaponMap } from "./d"
import type { Buff, Weapon } from "./data-types"
import { getModBuffLvFromSetting, getWBuffLvFromSetting } from "./effectLv"
import { toExprIdentifier } from "./expr-name"
import { LeveledBuff } from "./leveled/LeveledBuff"
import {
    type CharBuildInvSnapshot,
    getBuffLvFromSnapshot,
    getWBuffLvFromSnapshot,
    LeveledBuffHelper,
    LeveledCharHelper,
    LeveledModHelper,
    LeveledWeaponHelper,
} from "./leveled/LeveledHelpers"
import { collectPetBuffs, collectTraitBuffs, getEffectivePetLevel, getPetBaseCd, resolvePetCoverage } from "./petTrait"
import { resolveEffectiveSkillLevels, SKILL_LEVEL_ATTR_KEYS } from "./skillLevels"
import { type AssistSide, createTeamResolver, type TeamRole } from "./teamResolver"
import {
    applyTraceBuffOverrides,
    collectTraceEffects,
    isOwnLegacyTraceBuff,
    resolveTraceSkillLevelBonus,
    type TraceBuffOverride,
    type TraceSettingsSource,
} from "./traceEffects"
import {
    buildTranscendTeamSides,
    collectTranscendEffects,
    resolveTranscendSkillLevelAttrs,
    type TranscendEffects,
    type TranscendGearSuppress,
    type TranscendTeamSideContext,
} from "./transcend"
import type { TranscendSlotGroup } from "./transcendSettings"

/**
 * 按角色配置构建 CharBuild，查表逻辑集中在 Helper 侧以保持 CharBuild 计算类可用于 worker。
 * @param charId 角色 id
 * @param charSettings 角色配置
 * @param inv 背包快照
 * @param timeline 时间线
 * @returns 构筑实例
 */
/** 创建构筑的入参：技能等级兼容老格式单个数字（视为三项相同），运行期统一归一化；升华配置可缺失 / 局部 */
export type CharBuildSettingsInput = Omit<CharSettings, "charSkillLevel" | "transcend" | "traceLevel" | "traceOffRoots" | "traceStacks"> & {
    charSkillLevel?: CharSettings["charSkillLevel"] | number | readonly number[]
    /** 溯级：缺省按该角色最大溯级（与存档归一化口径一致）；只用于迁移为关闭根源 */
    traceLevel?: number
    /** 关闭的根源：缺省全部激活（旧溯级缺省按满溯迁移） */
    traceOffRoots?: number[]
    /** 溯源层数 / 覆盖率：缺省全部按 mx 满层、覆盖率 1 */
    traceStacks?: CharSettings["traceStacks"]
    /** 升华配置：缺省视为关闭；局部形状由 `collectTranscendEffects` 容错读取 */
    transcend?: Partial<CharSettings["transcend"]> | null
}

/** 升华 + 溯源效果集：附带规则产出的字段覆盖（不并入持久化设置） */
export type ResolvedCharEffects = TranscendEffects & { buffOverrides: TraceBuffOverride[] }

/**
 * 把溯源效果并入升华效果：溯源 BUFF 排在升华 BUFF 之前（手动 → 潜质 → 魔灵 → 溯源 → 升华）。
 * 技能等级已随各自合成 BUFF 进入标准属性池，不再单独合并三元组；规则覆盖随结果透传。
 * @param effects 升华效果
 * @param trace 溯源效果
 * @returns 合并后的效果集
 */
function mergeTraceEffects(effects: TranscendEffects, trace: ReturnType<typeof collectTraceEffects>): ResolvedCharEffects {
    if (!trace.buffs.length && !trace.buffOverrides.length) {
        return { ...effects, buffOverrides: [] }
    }
    return {
        buffs: [...trace.buffs, ...effects.buffs],
        skillReplacements: effects.skillReplacements,
        modelingNotes: effects.modelingNotes,
        warnings: [...effects.warnings, ...trace.warnings],
        buffOverrides: trace.buffOverrides,
    }
}

/**
 * 已收集效果 BUFF 的三键技能等级增量：合成 BUFF 的数值即装备 / 溯源给出的加成，
 * 供 `等级来源` 预解析与引擎最终聚合保持同值。
 * @param effects 升华 + 溯源效果集
 * @returns 三键加成 `[E, Q, P]`
 */
function collectEffectsSkillLevelAttrs(effects: TranscendEffects): CharSkillLevels {
    const attrs: CharSkillLevels = [0, 0, 0]
    for (const buff of effects.buffs) {
        for (let index = 0; index < 3; index++) {
            const value = buff.values[SKILL_LEVEL_ATTR_KEYS[index]]
            if (typeof value === "number" && Number.isFinite(value)) attrs[index] += value
        }
    }
    return attrs
}

/** 手动 BUFF 设置条目（名称 / 等级 / 覆盖率） */
type SettingsBuffEntry = readonly [string, number, number?]

/**
 * 手动 / 自定义 BUFF 的静态技能等级三键（预解析用）：只合并非条件 BUFF
 * （无 `技能` / `tag` 字段限定）的数值三键，字符串表达式不驱动等级（与引擎同口径）。
 * 数值按 `LeveledBuff` 的等级公式物化（a / b / lx / mx / 覆盖率）。边界：引擎还会按已装配 MOD
 * 跳过 `禁用` BUFF，本预解析不建模该层（现有数据无三键条目，MOD / 武器效果层表达式三键同理）。
 * @param buffs 该侧手动 BUFF 列表
 * @param customBuff 该侧自定义 BUFF 属性列表（`自定义BUFF` 条目的字段来源）
 * @returns 三键加成 `[E, Q, P]`
 */
function collectSettingsBuffSkillLevelAttrs(
    buffs: readonly SettingsBuffEntry[] | undefined,
    customBuff: readonly [string, number][] | undefined
): CharSkillLevels {
    const attrs: CharSkillLevels = [0, 0, 0]
    const customAttr = Array.isArray(customBuff) ? Object.fromEntries(customBuff) : undefined
    for (const entry of Array.isArray(buffs) ? buffs : []) {
        if (!Array.isArray(entry)) continue
        const [name, storedLevel, storedCoverage] = entry
        const data: Buff | undefined = name === "自定义BUFF" && customAttr ? { 名称: name, attr: customAttr } : buffMap.get(name)
        if (!data?.attr) continue
        // 条件 BUFF 只作用于命中字段的上下文，不进入全局属性池（引擎同口径）
        if (typeof data.技能 === "string" || (Array.isArray(data.tag) && data.tag.length > 0)) continue
        const coverage = typeof storedCoverage === "number" ? storedCoverage : 1
        const level = typeof storedLevel === "number" && Number.isFinite(storedLevel) ? storedLevel : 1
        const a = data.a || 1
        const b = data.b || 1
        const lx = data.lx ?? 1
        const x = Math.min(data.mx || 1, Math.max(lx, level))
        for (let index = 0; index < 3; index++) {
            const raw = data.attr[SKILL_LEVEL_ATTR_KEYS[index]]
            if (typeof raw === "number") {
                attrs[index] += (raw / a) * (1 + (x - lx) / b) * coverage
            } else if (Array.isArray(raw)) {
                const value = raw[Math.min(x, raw.length) - lx]
                if (typeof value === "number") attrs[index] += value * coverage
            }
        }
    }
    return attrs
}

/**
 * 某侧升华技能等级增量（溯源规则判定 `skillLevel` 条件时按需调用）：
 * 本次构筑位取已收集的效果集，其余已配置侧按装备解析（协战不吃天赋，与 `collectTranscendEffects` 同口径）。
 * @param settings 角色配置
 * @param ownerSide 本次构筑位
 * @param own 该构筑位已收集的升华效果
 * @param teamSides 三侧团队上下文
 * @param side 待取值的构筑位
 * @returns 技能等级增量
 */
function resolveSideTranscendSkillLevelBonus(
    settings: (Pick<CharBuildSettingsInput, "transcend"> & Partial<TraceSettingsSource>) | null | undefined,
    ownerSide: TranscendSlotGroup,
    own: TranscendEffects,
    teamSides: readonly TranscendTeamSideContext[] | undefined,
    side: TranscendSlotGroup
): CharSkillLevels {
    if (side === ownerSide) return collectEffectsSkillLevelAttrs(own)
    const context = teamSides?.find(item => item.side === side)
    if (context?.charId === undefined) return [0, 0, 0]
    return resolveTranscendSkillLevelAttrs(settings?.transcend as CharSettings["transcend"] | null | undefined, side, {
        charId: context.charId,
        charElement: context.charElement,
    })
}

/**
 * 解析某一构筑位的升华 + 溯源效果：主控 = 天赋 + 主控装备，协战只吃自己组装备（不吃天赋）。
 * 溯源效果按每侧关闭根源 / 激活集合生成（缺省全部激活），队友限定效果跨侧注入。
 * 工厂、页面主控与节点编辑器共用同一口径，避免 `collectTranscendEffects` 的调用参数散落。
 * @param settings 角色配置（可缺失/未归一化）
 * @param side 构筑位
 * @param options 角色 id 与元素（元素专属词条用）；`suppress` 仅收益快照专用
 * @returns 可并入 `CharBuild` 的升华与溯源效果；升华总开关关闭时仍可能带溯源效果
 */
export function resolveTranscendEffectsForSettings(
    settings: (Pick<CharBuildSettingsInput, "transcend"> & Partial<TraceSettingsSource>) | null | undefined,
    side: TranscendSlotGroup,
    options: {
        charId?: number
        charElement?: string
        teamSides?: readonly TranscendTeamSideContext[]
        suppress?: TranscendGearSuppress
    } = {}
): ResolvedCharEffects {
    const transcend = collectTranscendEffects(settings?.transcend as CharSettings["transcend"] | null | undefined, side, options)
    const trace = collectTraceEffects(settings as TraceSettingsSource | null | undefined, side, {
        charId: options.charId,
        teamSides: options.teamSides,
        transcendSkillLevelBonus: targetSide =>
            resolveSideTranscendSkillLevelBonus(settings, side, transcend, options.teamSides, targetSide),
    })
    return mergeTraceEffects(transcend, trace)
}

export function createCharBuildFromSettings(
    charId: number,
    charSettings: CharBuildSettingsInput,
    inv?: CharBuildInvSnapshot,
    timeline?: CharBuildTimeline,
    teamRole?: TeamRole,
    teamSides?: readonly TranscendTeamSideContext[],
    options?: { transcendSuppress?: TranscendGearSuppress }
) {
    const char = LeveledCharHelper.fromId(charId, charSettings.charLevel)
    const hydratedTimeline = timeline ? hydrateCharBuildTimeline(timeline) : undefined
    // 升华效果按构筑位注入：主控带天赋 + 主控装备，协战只带自己组装备；队友限定 BUFF 按三侧上下文跨位注入。
    // 协战 build 由 createAssistBuildFromSettings 显式传入上下文（清空 team 字段后无法再派生）。
    const resolvedTeamSides = teamSides ?? buildTranscendTeamSides(charSettings, (teamRole ?? "main") === "main" ? charId : undefined)
    const transcendEffects = resolveTranscendEffectsForSettings(charSettings, teamRole ?? "main", {
        charId,
        charElement: char.属性,
        teamSides: resolvedTeamSides,
        // 仅收益快照路径传入：抑制只作用于本次解析，不随设置 / 快照持久化
        suppress: options?.transcendSuppress,
    })
    const useGlobal = charSettings.useGlobal
    const effectConfig = charSettings.effectConfig || {}
    const getBuffLv = (modId: number) => (useGlobal ? getBuffLvFromSnapshot(inv, modId) : getModBuffLvFromSetting(effectConfig, modId))
    const getWBuffLv = (weaponId: number) =>
        useGlobal ? getWBuffLvFromSnapshot(inv, weaponId, char.属性) : getWBuffLvFromSetting(effectConfig, weaponId, char.属性)
    // 中枢魔之楔 id 为 0 表示未装备（节点编辑器新建 MOD 节点的默认态）
    const auraModId = getModVariantAura(charSettings as CharSettings)
    // 防御性归一化：调用方可能绕过 normalizeCharSettings 直接传老格式数字；
    // 引擎只收基础等级，三键加成随 `transcendEffects.buffs` 注入后由 CharBuild 二次解析
    const baseSkillLevel = normalizeCharSkillLevels(charSettings.charSkillLevel)
    // 等级来源 BUFF：等级取来源侧（本侧技能或表达式引用的队友技能）的有效等级；数值仍由表达式按技能等级求值。
    // 预解析 = 本侧升华 / 溯源效果 BUFF + 手动 / 自定义 BUFF 的静态三键（与引擎聚合同口径）
    const resolveBuffLevel = createBuffLevelResolver(
        charSettings,
        teamRole ?? "main",
        charId,
        resolveEffectiveSkillLevels(
            baseSkillLevel,
            collectEffectsSkillLevelAttrs(transcendEffects),
            collectSettingsBuffSkillLevelAttrs(charSettings.buffs, charSettings.customBuff)
        )
    )
    // 手动 BUFF 先按配置构造，再应用溯源规则的同名覆盖（名称 / 身份 / 等级不变，只改字段）
    const manualBuffs = applyTraceBuffOverrides(
        charSettings.buffs
            // 已迁入结构化溯源、且属于本侧角色的旧 `*溯` 条目不再注入（溯源区自动生成，避免双计）；
            // 其他角色的旧条目保留手选能力（历史构筑允许跨角色借用溯源数值）
            .filter(([name]) => !isOwnLegacyTraceBuff(name, charId))
            .map(v => {
                try {
                    return createBuffFromSettings(v[0], v[1], charSettings.customBuff, v[2], resolveBuffLevel)
                } catch (error) {
                    console.error(error)
                    return null
                }
            })
            .filter((b): b is LeveledBuff => b !== null),
        transcendEffects.buffOverrides
    )
    return new CharBuild({
        char,
        auraMod: auraModId > 0 ? LeveledModHelper.fromId(auraModId) : undefined,
        // MOD 一律取当前激活的变体（A/B/C）：分享构筑时上传的多份配置各自独立
        charMods: getModVariantSlots(charSettings as CharSettings, "角色")
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        meleeMods: getModVariantSlots(charSettings as CharSettings, "近战")
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        rangedMods: getModVariantSlots(charSettings as CharSettings, "远程")
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        skillMods: getModVariantSlots(charSettings as CharSettings, "同律")
            .filter(mod => mod !== null)
            .map(v => LeveledModHelper.fromId(v[0], v[1], getBuffLv(v[0]))),
        // 防御性归一化：调用方可能绕过 normalizeCharSettings 直接传老格式数字；
        // 只传基础等级，最终等级由 CharBuild 聚合 BUFF 三键后二次解析
        skillLevel: baseSkillLevel,
        // 魔灵与魔灵潜质以 BUFF 形式附加：与 BUFF 列表共用同一套加成汇总、收益与来源展示逻辑；
        // 溯源由每侧激活集合自动生成、排在升华之前（手动 BUFF → 潜质 → 魔灵 → 溯源 → 升华）
        buffs: [
            ...manualBuffs,
            ...collectTraitBuffs(charSettings.traits),
            ...collectPetBuffs(
                charSettings.petId,
                getEffectivePetLevel(charSettings.petLevel, charSettings.traits),
                resolvePetCoverage(
                    charSettings.petId,
                    getEffectivePetLevel(charSettings.petLevel, charSettings.traits),
                    charSettings.traits,
                    charSettings.petCoverage,
                    charSettings.petAutoCoverage
                )
            ),
            ...transcendEffects.buffs,
        ],
        customBuff: charSettings.customBuff,
        // 角色属性「魔灵CD」按所选魔灵主动技的原始冷却折算成秒
        petBaseCd: getPetBaseCd(charSettings.petId),
        melee: LeveledWeaponHelper.fromId(
            charSettings.meleeWeapon,
            charSettings.meleeWeaponRefine,
            charSettings.meleeWeaponLevel,
            getWBuffLv(charSettings.meleeWeapon)
        ),
        ranged: LeveledWeaponHelper.fromId(
            charSettings.rangedWeapon,
            charSettings.rangedWeaponRefine,
            charSettings.rangedWeaponLevel,
            getWBuffLv(charSettings.rangedWeapon)
        ),
        baseName: charSettings.baseName,
        imbalance: charSettings.imbalance,
        hpPercent: charSettings.hpPercent,
        resonanceGain: charSettings.resonanceGain,
        enemyId: charSettings.enemyId,
        enemyLevel: charSettings.enemyLevel,
        enemyResistance: charSettings.enemyResistance,
        targetFunction: charSettings.targetFunction,
        customVariables: charSettings.customVariables,
        timeline: hydratedTimeline,
        timelineDPS: charSettings.timelineDPS,
        extraMastery: charSettings.extraMastery,
        dotSettings: charSettings.dotSettings,
        // 只传武器 id：类别由 CharBuild 构造函数统一派生，页面 `new CharBuild` 与工厂同源
        teamWeapons: [charSettings.team1Weapon, charSettings.team2Weapon],
        // 保留来源配置：worker 的 wasm 收益路径直接用同一份配置复现构筑
        settings: charSettings,
        // 升华词条派生的技能替换随构筑透传：角色技能与同律武器共用
        skillReplacements: transcendEffects.skillReplacements,
        // 角色位随配置透传：协战 build 派生 restricted 解析器，主控派生完整解析器
        teamRole,
    })
}

/**
 * 计算候选武器逐把替换进对应槽位后的收益（替换后总伤害 / 当前总伤害 - 1）。
 * 与 `CharBuild.calcIncome` 的差别有两点：
 * 1. 候选武器一律整槽替换后重算，避免槽位类型与当前技能不匹配时被当作附加 MOD 处理；
 * 2. 候选武器经 `LeveledWeaponHelper.fromData` 构造并同步熔炼潜能生效判定，
 *    确保武器特效与潜能被真实计入，避免已装备武器因漏配特效而算出负收益。
 * 候选武器的精炼/等级沿用列表既有语义（默认最大值），不读取槽位当前值。
 * @param charBuild 当前构筑（不会被修改）
 * @param weapons 候选武器数据列表
 * @param getEffectLv 读取单把武器特效等级的回调
 * @returns 武器 id → 收益；当前总伤害为 0 时全部返回 0
 */
export function calcWeaponReplacementIncomes(
    charBuild: CharBuild,
    weapons: Weapon[],
    getEffectLv: (weapon: Weapon) => number
): Map<number, number> {
    const incomes = new Map<number, number>()
    if (!weapons.length) return incomes

    // 全程在克隆构筑上替换并重算，避免污染实时构筑
    const clone = charBuild.clone()
    const currentTotal = clone.calculate()
    if (!currentTotal) {
        weapons.forEach(weapon => incomes.set(weapon.id, 0))
        return incomes
    }

    for (const weapon of weapons) {
        const candidate = LeveledWeaponHelper.fromData(weapon, undefined, undefined, getEffectLv(weapon))
        // 与构筑内保持一致的熔炼潜能生效判定：角色未精通该武器类别时潜能与特效均不生效
        candidate.setForgeEffective(charBuild.isWeaponCategoryMastered(candidate))
        const isMelee = weapon.类型[0] === "近战"
        const previous = isMelee ? clone.meleeWeapon : clone.rangedWeapon
        if (isMelee) clone.meleeWeapon = candidate
        else clone.rangedWeapon = candidate
        const newTotal = clone.calculate()
        if (isMelee) clone.meleeWeapon = previous
        else clone.rangedWeapon = previous
        incomes.set(weapon.id, newTotal / currentTotal - 1)
    }
    return incomes
}

/**
 * 按当前配置构造实例内独立的自定义 BUFF。
 * @param customBuff 自定义 BUFF 属性列表
 * @param level 自定义 BUFF 等级
 * @param coverage 覆盖率（0-1，默认1表示100%）
 * @returns 自定义 BUFF 实例
 */
export function createCustomBuff(customBuff: [string, number][], level?: number, coverage = 1) {
    const buffData: Buff = {
        名称: "自定义BUFF",
        描述: "自行填写",
        attr: Object.fromEntries(customBuff),
    }
    const buff = new LeveledBuff(buffData, level)
    if (coverage !== 1) {
        buff.coverage = coverage
    }
    return buff
}

/**
 * 按当前配置构造 BUFF 实例，支持自定义 BUFF 直接从配置内生成。
 * @param name BUFF 名称
 * @param level BUFF 等级
 * @param customBuff 自定义 BUFF 配置
 * @param coverage 覆盖率（0-1，默认1表示100%）
 * @returns BUFF 实例
 */
export function createBuffFromSettings(
    name: string,
    level: number,
    customBuff: [string, number][],
    coverage = 1,
    resolveLevel?: (buff: LeveledBuff) => number | undefined
) {
    const buff = name === "自定义BUFF" ? createCustomBuff(customBuff, level, coverage) : LeveledBuffHelper.fromName(name, level)
    const resolvedLevel = resolveLevel?.(buff)
    if (resolvedLevel !== undefined) buff.等级 = resolvedLevel
    if (coverage !== 1) {
        buff.coverage = coverage
    }
    return buff
}

/** 技能等级来源 → `[E, Q, 被动]` 下标 */
const BUFF_LEVEL_SOURCE_INDEX: Record<"E" | "Q" | "P", number> = { E: 0, Q: 1, P: 2 }

/** 表达式中的技能命名空间引用：`技能标识符::`（字段名可含 `[标识符]`） */
const SKILL_NAMESPACE_REFERENCE = /([\p{L}\p{N}_·[\]]+)::/gu

/** 团队角色 id 归一化：非有限 / 非正数视为未配置，6 位 id 按角色表口径右移两位 */
function normalizeTeamCharId(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined
    const id = Math.round(value)
    if (id <= 0) return undefined
    return id > 9999 ? Math.trunc(id / 100) : id
}

/** 技能标识符在该角色技能表中的下标（名称 / safeName / exprName 三种写法） */
function matchCharacterSkillIndex(charId: number | undefined, namespace: string): number | undefined {
    const skills = charId === undefined ? undefined : charMap.get(charId)?.技能
    if (!skills) return undefined
    const index = skills.findIndex(skill => {
        const name = skill.名称
        if (!name) return false
        return name === namespace || name.replace(/\//g, "_") === namespace || toExprIdentifier(name) === namespace
    })
    return index >= 0 ? index : undefined
}

/**
 * 解析某构筑位的有效技能等级：基础等级 + 该侧装备三键 attrs + 该侧溯源预解析（3/5 溯 +2/+1）
 * + 该侧手动 / 自定义 BUFF 的静态三键，钳制 1-30。
 * 只读设置与 attrs（不构建 BUFF、不走引擎通道），供 `等级来源` 与跨侧引用预解析。
 * 边界：条件 BUFF（`技能` / `tag` 限定）不计；字符串表达式三键不驱动等级（与引擎一致）；
 * 引擎按已装配 MOD 跳过的 `禁用` BUFF 与 MOD / 武器效果层表达式三键不在预解析建模（现有数据无此条目）。
 * @param settings 角色配置（主控完整配置；协战位读 `assistN`）
 * @param side 构筑位
 * @param charId 该侧角色 id（元素专属词条用）
 * @returns 有效技能等级三元组
 */
export function resolveSideEffectiveSkillLevels(
    settings: Pick<
        CharBuildSettingsInput,
        "charSkillLevel" | "transcend" | "assist1" | "assist2" | "traceLevel" | "traceOffRoots" | "buffs" | "customBuff" | "team1" | "team2"
    >,
    side: TeamRole,
    charId: number | undefined
): CharSkillLevels {
    const sideSettings = side === "main" ? undefined : side === "assist1" ? settings.assist1 : settings.assist2
    const base = side === "main" ? settings.charSkillLevel : sideSettings?.charSkillLevel
    const buffs = side === "main" ? settings.buffs : sideSettings?.buffs
    const customBuff = side === "main" ? settings.customBuff : sideSettings?.customBuff
    const charElement = charId === undefined ? undefined : charMap.get(charId)?.属性
    return resolveEffectiveSkillLevels(
        normalizeCharSkillLevels(base),
        resolveTranscendSkillLevelAttrs(settings.transcend as CharSettings["transcend"] | null | undefined, side, {
            charId,
            charElement,
        }),
        resolveTraceSkillLevelBonus(settings as TraceSettingsSource, side, charId),
        collectSettingsBuffSkillLevelAttrs(buffs, customBuff)
    )
}

/**
 * BUFF 表达式引用的技能命名空间属于哪个构筑位：主控优先，其次已配置协战；未命中回退 ownerSide。
 * 协战构筑为受限命名空间，只能引用自身技能。
 * @param buff 带表达式数值的 BUFF 数据
 * @param settings 主控完整配置（含 assistN）
 * @param ownerSide 持有该 BUFF 的构筑位
 * @param ownerCharId 持有侧角色 id
 * @returns 技能字段的来源构筑位
 */
function resolveBuffSkillSourceSide(
    buff: Pick<Buff, "attr">,
    settings: CharBuildSettingsInput,
    ownerSide: TeamRole,
    ownerCharId: number
): TeamRole {
    if (ownerSide !== "main") return ownerSide
    const namespaces = new Set<string>()
    for (const value of Object.values(buff.attr ?? {})) {
        if (typeof value !== "string") continue
        for (const match of value.matchAll(SKILL_NAMESPACE_REFERENCE)) namespaces.add(match[1])
    }
    if (!namespaces.size) return ownerSide
    const candidates: { side: TeamRole; charId?: number }[] = [
        { side: "main", charId: normalizeTeamCharId(ownerCharId) },
        { side: "assist1", charId: normalizeTeamCharId(settings.team1) },
        { side: "assist2", charId: normalizeTeamCharId(settings.team2) },
    ]
    for (const candidate of candidates) {
        if (candidate.charId === undefined) continue
        if ([...namespaces].some(namespace => matchCharacterSkillIndex(candidate.charId, namespace) !== undefined)) return candidate.side
    }
    return ownerSide
}

/**
 * 解析 `等级来源` BUFF 的有效等级；表达式引用了其他构筑位的技能时取来源侧等级。
 * @param buff BUFF 数据（需带 `等级来源`）
 * @param settings 主控完整配置
 * @param ownerSide 持有该 BUFF 的构筑位
 * @param ownerCharId 持有侧角色 id
 * @param ownerLevels 持有侧有效技能等级
 * @param cache 跨侧技能等级缓存（同一次构筑构造内复用）
 * @returns 有效等级；无 `等级来源` 时 undefined
 */
export function resolveBuffSkillLevel(
    buff: Pick<Buff, "等级来源" | "attr">,
    settings: CharBuildSettingsInput,
    ownerSide: TeamRole,
    ownerCharId: number,
    ownerLevels: CharSkillLevels,
    cache?: Map<TeamRole, CharSkillLevels>
): number | undefined {
    const source = buff.等级来源
    if (!source) return undefined
    const index = BUFF_LEVEL_SOURCE_INDEX[source]
    const sourceSide = resolveBuffSkillSourceSide(buff, settings, ownerSide, ownerCharId)
    if (sourceSide === ownerSide) return ownerLevels[index]
    let levels = cache?.get(sourceSide)
    if (!levels) {
        const charId = sourceSide === "assist1" ? normalizeTeamCharId(settings.team1) : normalizeTeamCharId(settings.team2)
        levels = resolveSideEffectiveSkillLevels(settings, sourceSide, charId)
        cache?.set(sourceSide, levels)
    }
    return levels[index]
}

/**
 * 构造单次构筑装配用的等级解析器：`等级来源` BUFF 的等级取来源侧有效技能等级。
 * @param settings 主控完整配置
 * @param side 构筑位
 * @param charId 该侧角色 id
 * @param ownerLevels 该侧有效技能等级
 * @returns BUFF → 有效等级（非等级来源返回 undefined）
 */
export function createBuffLevelResolver(
    settings: CharBuildSettingsInput,
    side: TeamRole,
    charId: number,
    ownerLevels: CharSkillLevels
): (buff: LeveledBuff) => number | undefined {
    const cache = new Map<TeamRole, CharSkillLevels>([[side, ownerLevels]])
    return buff => resolveBuffSkillLevel(buff._originalBuffData, settings, side, charId, ownerLevels, cache)
}

/**
 * 从完整主控配置构造单个协战 build。
 *
 * 以主控配置为基底（继承敌人环境 / 血量 / 共振 / 失衡），覆盖为 `assistN` 的完整 loadout；
 * 角色 id 与武器 id 仍取 `teamN` / `teamNWeapon`。构造出的协战配置清空队伍关联、魔灵与时间线，
 * 保留 `assist1/assist2` 供 restricted resolver 识别槽位别名，因此协战内跨角色引用恒为 0。
 *
 * 不变量：peer settings **必须保留** `assistN` —— 它是协战 build 内部 restricted resolver 的存在前提
 * （`teamResolver.ts` 的 `createTeamResolver(role !== "main")` 门控），清空会导致协战失去跨角色命名空间隔离。
 *
 * 查询契约：
 * - **必须有武器才能被查询**：`teamNWeapon` 无效（`"-"` / 0 / 非数）时返回 `undefined`，
 *   `角色名::属性` 命中 resolver 的「已注册但无属性」分支，恒为 0 且不打印命名空间错误；
 * - `assistN.enabled` **不参与**本函数：它只决定该协战是否计入目标函数合计（页面 / 快照汇总），
 *   停用的协战仍可被主控 BUFF / 表达式按 `角色名::属性` 查询到自身面板。
 * @param settings 主控完整配置
 * @param side 协战位
 * @param inv 背包快照
 * @param options 团队上下文：显式 `teamSides` 优先，否则按 `mainCharId` + 完整配置派生
 * @returns 协战构筑；角色或武器未配置时返回 undefined
 */
export function createAssistBuildFromSettings(
    settings: CharBuildSettingsInput,
    side: AssistSide,
    inv?: CharBuildInvSnapshot,
    options: { mainCharId?: number; teamSides?: readonly TranscendTeamSideContext[]; transcendSuppress?: TranscendGearSuppress } = {}
): CharBuild | undefined {
    const rawCharId = side === "assist1" ? settings.team1 : settings.team2
    const charId = typeof rawCharId === "number" && Number.isFinite(rawCharId) && rawCharId > 0 ? Math.round(rawCharId) : 0
    if (!charId) return undefined
    const rawWeaponId = side === "assist1" ? settings.team1Weapon : settings.team2Weapon
    const weaponId = typeof rawWeaponId === "number" && Number.isFinite(rawWeaponId) && rawWeaponId > 0 ? Math.round(rawWeaponId) : 0
    if (!weaponId) return undefined
    const assist = side === "assist1" ? settings.assist1 : settings.assist2
    if (!assist) return undefined
    // 队友限定 BUFF 的上下文必须在清空 team 字段之前取：显式传入优先，否则按完整配置派生
    const teamSides = options.teamSides ?? buildTranscendTeamSides(settings, options.mainCharId)

    // 单武器按类型放入近战 / 远程槽，另一槽置空（与 teamBuild 的协战口径一致）
    const isMelee = weaponMap.get(weaponId)?.类型?.[0] === "近战"
    const peerSettings: CharBuildSettingsInput = {
        ...settings,
        charLevel: assist.charLevel,
        charSkillLevel: assist.charSkillLevel,
        baseName: assist.baseName,
        extraMastery: assist.extraMastery,
        targetFunction: assist.targetFunction,
        customVariables: assist.customVariables,
        dotSettings: assist.dotSettings,
        auraMod: assist.auraMod,
        charMods: assist.charMods,
        meleeMods: assist.meleeMods,
        rangedMods: assist.rangedMods,
        skillWeaponMods: assist.skillWeaponMods,
        modVariantIndex: assist.modVariantIndex,
        modVariants: assist.modVariants,
        buffs: assist.buffs,
        customBuff: assist.customBuff,
        useGlobal: assist.useGlobal,
        effectConfig: assist.effectConfig,
        meleeWeapon: isMelee ? weaponId : 0,
        meleeWeaponLevel: assist.weaponLevel,
        meleeWeaponRefine: assist.weaponRefine,
        rangedWeapon: isMelee ? 0 : weaponId,
        rangedWeaponLevel: assist.weaponLevel,
        rangedWeaponRefine: assist.weaponRefine,
        // 协战不参与队伍 / 魔灵 / 时间线：清空递归字段，避免 peer 内再构造协战
        team1: "-",
        team1Weapon: "-",
        team1Build: "-",
        team1BuildVariant: "A",
        team2: "-",
        team2Weapon: "-",
        team2Build: "-",
        team2BuildVariant: "A",
        petId: 0,
        petLevel: 0,
        petCoverage: 1,
        petAutoCoverage: true,
        traits: [],
        actions: createDefaultInlineActions(),
    }
    return createCharBuildFromSettings(charId, peerSettings, inv, undefined, side, teamSides, {
        transcendSuppress: options.transcendSuppress,
    })
}

;(CharBuild as typeof CharBuild & { fromCharSetting?: typeof createCharBuildFromSettings }).fromCharSetting = createCharBuildFromSettings

// 主控构造时按 settings 懒派生协战属性：协战 build 由同一份配置重放，wasm / worker 无需注入对象
CharBuild.createTeamResolver = (settings, role, mainCharId) =>
    createTeamResolver(settings, role, side =>
        createAssistBuildFromSettings(settings, side, undefined, { mainCharId: role === "main" ? mainCharId : undefined })
    )

/**
 * 预构建时间线中的 BUFF 实例，避免 CharBuild 计算类直接依赖静态 BUFF 表。
 * @param timeline 原时间线
 * @returns 已补齐 BUFF 实例的时间线
 */
export function hydrateCharBuildTimeline(timeline: CharBuildTimeline) {
    return new CharBuildTimeline(
        timeline.name,
        timeline.items.map(item => ({
            ...item,
            buff: item.lv ? item.buff || LeveledBuffHelper.fromName(item.name, item.lv) : undefined,
        })),
        timeline.hp
    )
}
