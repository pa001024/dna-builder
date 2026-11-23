import type { CharBuild } from "./CharBuild"
import { createCharBuildFromSettings } from "./CharBuildHelper"
import {
    type CharSettings,
    type CharSettingsInput,
    createDefaultCharSettings,
    getModVariantIndex,
    normalizeCharSettings,
    normalizeModVariantLetter,
    resolveModVariantLetter,
} from "./charSettings"
import { charMap, weaponMap } from "./d"
import type { AssistSide } from "./teamResolver"

/**
 * 协战构筑合成：优先复用关联的服务器构筑（完整配置），失败时退化为最小合成配置。
 *
 * 口径（PLAN 4.4 / R6）：
 * - 链接构筑会应用所选 MOD 变体、清空协战递归字段与魔灵，敌人环境沿用主控；
 * - 任何加载失败都不抛异常，返回 synthesized 并提供 warning。
 */

/** 服务器构筑查询结果（`build` 查询的子集） */
export interface TeamBuildQueryResult {
    charId: number
    /** 服务器存的 JSON 字符串或已解析对象 */
    charSettings: string | CharSettingsInput | null
    title?: string
}

/** 协战构筑查询函数（由调用方注入 `buildQuery`，数据层不依赖 GraphQL 客户端） */
export type TeamBuildQuery = (id: string) => Promise<TeamBuildQueryResult | null>

/** 已解析的链接构筑 */
export interface ResolvedLinkedBuild {
    charId: number
    settings: CharSettings
}

/** 链接构筑缓存：同一 buildQuery 只解析一次 */
export interface TeamBuildCache {
    resolved: Map<string, Promise<ResolvedLinkedBuild | null>>
}

/**
 * 创建一份空的协战构筑缓存。
 * @returns 空的缓存对象
 */
export function createTeamBuildCache(): TeamBuildCache {
    return { resolved: new Map() }
}

/** 模块级默认缓存：无缓存参数时复用，避免重复拉取同一构筑 */
const defaultCache = createTeamBuildCache()

/**
 * 清空默认缓存（构筑内容更新后由 UI 调用）。
 */
export function clearTeamBuildCache(): void {
    defaultCache.resolved.clear()
}

/** 协战构筑请求 */
export interface AssistBuildRequest {
    /** 协战位：1 / 2 */
    slot: 1 | 2
    /** 主控配置（提供协战角色、武器与链接构筑） */
    mainSettings: CharSettings
    /** 服务器构筑查询函数（缺省时按合成口径计算） */
    query?: TeamBuildQuery
    /** 缓存（缺省使用模块级缓存） */
    cache?: TeamBuildCache
}

/** 协战构筑结果 */
export interface AssistBuildResult {
    charId: number
    source: "linked" | "synthesized"
    build: CharBuild
    settings: CharSettings
    warnings: string[]
}

/** 读取协战位对应的字段 */
function slotFields(settings: CharSettings, slot: 1 | 2) {
    return slot === 1
        ? { charId: settings.team1, weaponId: settings.team1Weapon, buildId: settings.team1Build, variant: settings.team1BuildVariant }
        : { charId: settings.team2, weaponId: settings.team2Weapon, buildId: settings.team2Build, variant: settings.team2BuildVariant }
}

/**
 * 读取协战武器 id（"-" 或非法值返回 0）。
 * @param value 协战武器字段
 * @returns 武器 id；未配置时为 0
 */
function resolveWeaponId(value: number | "-"): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/**
 * 读取武器的战斗类型（近战 / 远程）。
 * @param weaponId 武器 id
 * @returns 类型；武器不存在时为 undefined
 */
function weaponTypeOf(weaponId: number): string | undefined {
    return weaponMap.get(weaponId)?.类型?.[0]
}

/**
 * 深拷贝一份配置，避免缓存里的链接构筑被某次调用的就地修改污染（同一次调用里的变体、
 * 递归字段、敌人环境与武器都会改写配置）。
 * @param settings 已归一化的配置
 * @returns 独立的配置副本
 */
function cloneSettings(settings: CharSettings): CharSettings {
    try {
        if (typeof structuredClone === "function") return structuredClone(settings)
    } catch {
        // 代理对象等不可结构化克隆时走 JSON 兜底
    }
    return normalizeCharSettings(JSON.parse(JSON.stringify(settings)))
}

/**
 * 清理协战构筑里会导致递归或口径不一致的字段：
 * 协战自身的队伍关联、以及不参与协战伤害的魔灵 / 潜质。
 * @param settings 协战配置（原地修改）
 */
function clearAssistRecursion(settings: CharSettings): void {
    settings.team1 = "-"
    settings.team1Weapon = "-"
    settings.team1Build = "-"
    settings.team1BuildVariant = "A"
    settings.team2 = "-"
    settings.team2Weapon = "-"
    settings.team2Build = "-"
    settings.team2BuildVariant = "A"
    settings.petId = 0
    settings.petLevel = 0
    settings.petCoverage = 1
    settings.petAutoCoverage = true
    settings.traits = [null, null, null, null]
}

/**
 * 继承主控的敌人环境与血量口径（合计口径要求三份构筑在同一目标下比较）。
 * @param settings 目标配置（原地修改）
 * @param mainSettings 主控配置
 */
function inheritEnvironment(settings: CharSettings, mainSettings: CharSettings): void {
    settings.enemyId = mainSettings.enemyId
    settings.enemyLevel = mainSettings.enemyLevel
    settings.enemyResistance = mainSettings.enemyResistance
    settings.hpPercent = mainSettings.hpPercent
    settings.resonanceGain = mainSettings.resonanceGain
    settings.imbalance = mainSettings.imbalance
}

/**
 * 拉取并解析关联构筑（同一 id 只拉取一次；失败不缓存，允许后续重试）。
 * @param buildId 服务器构筑 id
 * @param query 查询函数
 * @param cache 缓存
 * @returns 解析后的构筑；失败时为 null（不抛异常）
 */
async function resolveLinkedBuild(buildId: string, query: TeamBuildQuery, cache: TeamBuildCache): Promise<ResolvedLinkedBuild | null> {
    let pending = cache.resolved.get(buildId)
    if (!pending) {
        pending = query(buildId)
            .then(result => {
                if (!result?.charSettings) return null
                const raw = typeof result.charSettings === "string" ? JSON.parse(result.charSettings) : result.charSettings
                return { charId: result.charId, settings: normalizeCharSettings(raw) }
            })
            .catch(error => {
                console.warn("协战构筑加载失败", error)
                return null
            })
        cache.resolved.set(buildId, pending)
    }
    const resolved = await pending
    if (!resolved) cache.resolved.delete(buildId)
    return resolved
}

/**
 * 按主控配置合成协战构筑（无链接或链接失败时的兜底）。
 * 只保留该协战武器，清空 MOD / BUFF / 魔灵，继承主控等级与敌人环境。
 * @param charId 协战角色 id
 * @param weaponId 协战武器 id（0 表示未配置）
 * @param mainSettings 主控配置
 * @param warnings 警告收集
 * @returns 合成配置
 */
function synthesizeAssistSettings(charId: number, weaponId: number, mainSettings: CharSettings, warnings: string[]): CharSettings {
    const settings = createDefaultCharSettings()
    settings.charLevel = mainSettings.charLevel
    // 没有链接构筑时用角色首个技能作为伤害口径（与构筑页默认选中行为一致）
    settings.baseName = charMap.get(charId)?.技能?.[0]?.名称 ?? ""
    settings.auraMod = 0
    settings.petId = 0
    settings.petLevel = 0
    settings.petCoverage = 1
    settings.traits = [null, null, null, null]
    settings.buffs = []
    settings.customBuff = []
    inheritEnvironment(settings, mainSettings)
    applyAssistWeapon(settings, weaponId, warnings)
    if (!weaponId) warnings.push(`协战角色 ${charId} 未配置武器，仅按角色基础属性计算`)
    return settings
}

/**
 * 把协战武器放入对应槽位（另一槽置空）。
 * @param settings 协战配置（原地修改）
 * @param weaponId 武器 id（0 表示未配置）
 * @param warnings 警告收集
 */
function applyAssistWeapon(settings: CharSettings, weaponId: number, warnings: string[]): void {
    if (!weaponId) {
        settings.meleeWeapon = 0
        settings.rangedWeapon = 0
        return
    }
    const type = weaponTypeOf(weaponId)
    if (!type) {
        warnings.push(`协战武器 ${weaponId} 不存在，已忽略`)
        settings.meleeWeapon = 0
        settings.rangedWeapon = 0
        return
    }
    if (type === "近战") {
        settings.meleeWeapon = weaponId
        settings.rangedWeapon = 0
    } else {
        settings.meleeWeapon = 0
        settings.rangedWeapon = weaponId
    }
}

/**
 * 合成协战构筑。
 *
 * - 有链接构筑：拉取 → 归一化 → 应用所选变体 → 清空递归字段 / 魔灵 → 覆盖武器；
 * - 无链接或加载失败：合成最小配置（主控等级 + 协战武器 + 空 MOD/BUFF/魔灵）。
 *
 * 返回 null 表示该协战位未配置角色；任何加载失败都不抛异常。
 * @param request 协战构筑请求
 * @returns 协战构筑结果
 */
export async function buildAssistBuild(request: AssistBuildRequest): Promise<AssistBuildResult | null> {
    const slot: 1 | 2 = request.slot === 2 ? 2 : 1
    const side: AssistSide = slot === 2 ? "assist2" : "assist1"
    const mainSettings = normalizeCharSettings(request.mainSettings)
    const fields = slotFields(mainSettings, slot)
    const teamCharId = typeof fields.charId === "number" && Number.isFinite(fields.charId) ? Math.round(fields.charId) : 0
    if (!teamCharId) return null

    const weaponId = resolveWeaponId(fields.weaponId)
    const variantLetter = normalizeModVariantLetter(fields.variant)
    const warnings: string[] = []

    let linked: ResolvedLinkedBuild | null = null
    const buildId = typeof fields.buildId === "string" ? fields.buildId.trim() : ""
    if (buildId && buildId !== "-" && request.query) {
        linked = await resolveLinkedBuild(buildId, request.query, request.cache ?? defaultCache)
        if (!linked) warnings.push(`关联构筑 ${buildId} 加载失败，已按合成口径计算`)
    } else if (buildId && buildId !== "-") {
        warnings.push(`关联构筑 ${buildId} 缺少查询函数，已按合成口径计算`)
    }

    let settings: CharSettings
    let source: "linked" | "synthesized"
    if (linked) {
        source = "linked"
        // 每次调用都基于缓存配置的副本做改写：重复调用与两槽共用同一构筑都不能互相污染
        settings = cloneSettings(linked.settings)
        const variant = resolveModVariantLetter(settings, variantLetter)
        if (variant !== variantLetter) warnings.push(`关联构筑没有变体 ${variantLetter}，已回落到配置 ${variant}`)
        settings.modVariantIndex = getModVariantIndex(variant)
        clearAssistRecursion(settings)
        inheritEnvironment(settings, mainSettings)
        if (weaponId) applyAssistWeapon(settings, weaponId, warnings)
    } else {
        source = "synthesized"
        settings = synthesizeAssistSettings(teamCharId, weaponId, mainSettings, warnings)
    }

    const charId = linked?.charId || teamCharId
    // 升华配置一律以当前页为准：linked 构筑自带的 transcend 不采纳（装备组仍按当前协战位读取）
    settings.transcend = mainSettings.transcend
    const build = createCharBuildFromSettings(charId, settings, undefined, undefined, side)
    return { charId, source, build, settings, warnings }
}

/**
 * 合计伤害：主控 + 协战 1 + 协战 2 各自 `calculate()` 之和。
 * 未配置 / 计算失败的构筑不参与合计。
 * @param builds 构筑列表（可含 null）
 * @returns 合计伤害
 */
export function calculateTeamTotal(builds: readonly (CharBuild | null | undefined)[]): number {
    let total = 0
    for (const build of builds) {
        if (!build) continue
        try {
            const value = build.calculate()
            if (Number.isFinite(value)) total += value
        } catch (error) {
            console.warn("协战构筑计算失败", error)
        }
    }
    return total
}
