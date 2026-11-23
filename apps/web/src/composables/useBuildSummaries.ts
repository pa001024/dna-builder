import { shallowRef } from "vue"
import { requestBuildTargetValues, type SharedTargetValueItem } from "@/composables/useBuildIncomeWorker"
import { charMap, LeveledChar, LeveledWeapon, weaponMap } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { type CharSettings, normalizeCharSettings } from "@/data/charSettings"
import { isTranscendBuildEnabled } from "@/data/transcendSettings"

/** 构筑类型：普通 / 升华 */
export type BuildType = "normal" | "transcend"

/** 构筑里的一把武器 */
export interface BuildSummaryWeapon {
    id: number
    name: string
    icon: string
    /** 按构筑里的等级/精炼构造的实例：供悬停卡片（WeaponTooltip）直接取属性 */
    weapon: LeveledWeapon
}

/** 构筑里的一名协战角色 */
export interface BuildSummaryChar {
    id: number
    name: string
    icon: string
    /** 按构筑里的角色等级构造的实例：供悬停卡片（CharTooltip）直接取属性 */
    char: LeveledChar
    /** 协战角色的武器；未配置或本地数据包缺条目时为 null */
    weapon: BuildSummaryWeapon | null
}

/** 构筑概要：目标函数值 + 所用武器 + 协战角色 */
export interface BuildSummary {
    /** 构筑类型（普通 / 升华）：优先后端 info，旧服务端由 charSettings 本地解析 */
    buildType: BuildType
    /** 目标函数计算结果；配置损坏或本地数据包缺条目时为 null */
    targetValue: number | null
    /** 构筑的计算技能名（与目标函数一起说明这个值是什么） */
    baseName: string
    /** 构筑的目标函数表达式 */
    targetFunction: string
    melee: BuildSummaryWeapon | null
    ranged: BuildSummaryWeapon | null
    team: BuildSummaryChar[]
}

/** 待解析的构筑来源（列表接口返回的原始字段） */
export interface BuildSummarySource {
    key: string
    charId: number
    charSettings: string
    /** 后端构筑类型；旧服务端 / 无 info 时缺省，由本地 charSettings 解析 */
    buildType?: BuildType
}

/**
 * 读取武器展示信息。
 * @param id 武器 id
 * @param level 构筑里的武器等级
 * @param refine 构筑里的精炼等级
 * @returns 展示信息；id 非法或本地数据包没有该武器时为 null
 */
function readWeapon(id: unknown, level: unknown, refine: unknown): BuildSummaryWeapon | null {
    if (typeof id !== "number" || id <= 0) return null
    if (!weaponMap.has(id)) return null
    try {
        const weapon = new LeveledWeapon(id, typeof refine === "number" ? refine : undefined, typeof level === "number" ? level : undefined)
        return { id: weapon.id, name: weapon.名称, icon: weapon.url, weapon }
    } catch (error) {
        console.error("构造武器展示实例失败", id, error)
        return null
    }
}

/** 协战在列表概要里展示的等级：优先读 `assistN`，旧存档缺协战 loadout 时回退主控等级 */
interface AssistSummaryLevels {
    charLevel: number
    weaponLevel: number
}

/**
 * 读取协战角色展示信息。
 * @param id 角色 id（未配置时为 "-"）
 * @param levels 角色等级与单武器等级
 * @param weaponId 协战角色的武器 id（未配置时为 "-"）
 * @returns 展示信息；未配置或本地数据包没有该角色时为 null
 */
function readChar(id: unknown, levels: AssistSummaryLevels, weaponId: unknown): BuildSummaryChar | null {
    if (typeof id !== "number" || id <= 0) return null
    const char = charMap.get(id)
    if (!char) return null
    try {
        const leveled = new LeveledChar(char, levels.charLevel)
        return {
            id: leveled.id,
            name: leveled.名称,
            icon: leveled.url,
            char: leveled,
            weapon: readWeapon(weaponId, levels.weaponLevel, undefined),
        }
    } catch (error) {
        console.error("构造角色展示实例失败", id, error)
        return null
    }
}

/**
 * 读取协战概要等级：原始配置里存在 `assistN` 时用其（已归一化的）角色等级与武器等级，
 * 旧存档 / 未配置协战 loadout 时沿用列表原有口径回退主控等级。
 * @param settings 归一化后的角色配置
 * @param raw 原始配置对象（用于判断协战 loadout 是否保存过）
 * @param side 协战位
 * @returns 角色等级与单武器等级
 */
function readAssistLevels(settings: CharSettings, raw: Record<string, unknown>, side: "assist1" | "assist2"): AssistSummaryLevels {
    const fallback: AssistSummaryLevels = { charLevel: settings.charLevel, weaponLevel: settings.charLevel }
    const value = raw[side]
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallback
    const assist = settings[side]
    return { charLevel: assist.charLevel, weaponLevel: assist.weaponLevel }
}

/**
 * 解析单份构筑的配置：静态部分（武器 / 协战）当场可读，目标值需要 worker 计算，
 * 因此同时产出一份 worker 快照（用当前数据包组装，保证与配装页同口径）。
 * @param source 构筑来源
 * @returns 概要（目标值先置空）与快照（解析失败时为 null）
 */
function parseSummary(source: BuildSummarySource): { summary: BuildSummary; snapshot: SharedTargetValueItem | null } {
    // 后端 info 优先：解析失败提前返回时也必须保留，不能丢成 normal
    const summary: BuildSummary = {
        buildType: source.buildType ?? "normal",
        targetValue: null,
        baseName: "",
        targetFunction: "",
        melee: null,
        ranged: null,
        team: [],
    }
    let settings: CharSettings
    let rawSettings: Record<string, unknown> = {}
    try {
        const parsed = JSON.parse(source.charSettings)
        rawSettings = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
        settings = normalizeCharSettings(parsed)
    } catch (error) {
        console.error("解析构筑配置失败", source.key, error)
        return { summary, snapshot: null }
    }

    // 后端 info 已判定时以它为准；旧服务端没有 info，按与服务器同一口径（transcend.enabled）本地回退
    summary.buildType = source.buildType ?? (isTranscendBuildEnabled(settings.transcend) ? "transcend" : "normal")
    summary.baseName = settings.baseName
    summary.targetFunction = settings.targetFunction
    summary.melee = readWeapon(settings.meleeWeapon, settings.meleeWeaponLevel, settings.meleeWeaponRefine)
    summary.ranged = readWeapon(settings.rangedWeapon, settings.rangedWeaponLevel, settings.rangedWeaponRefine)
    summary.team = [
        readChar(settings.team1, readAssistLevels(settings, rawSettings, "assist1"), settings.team1Weapon),
        readChar(settings.team2, readAssistLevels(settings, rawSettings, "assist2"), settings.team2Weapon),
    ].filter((char): char is BuildSummaryChar => char !== null)

    try {
        const build = createCharBuildFromSettings(source.charId, settings)
        return { summary, snapshot: { key: source.key, build: createWorkerSnapshot(build) } }
    } catch (error) {
        // 构筑可能引用已下线的 BUFF / 武器，或配置本身损坏：只丢目标值，不影响其他条目
        console.error("组装构筑快照失败", source.key, error)
        return { summary, snapshot: null }
    }
}

/**
 * 构筑列表概要客户端：静态信息在主线程读出，目标值交给共享构筑 worker 批量求解。
 * `summaries` 以构筑 id 为键累积，分页追加时只需刷新新增条目。
 */
export function useBuildSummaries() {
    const summaries = shallowRef<Record<string, BuildSummary>>({})

    /**
     * 解析并补齐一批构筑的概要，目标值算完后合并进 `summaries`。
     * @param sources 构筑来源
     */
    async function refresh(sources: BuildSummarySource[]) {
        const parsed = sources.map(source => ({ source, ...parseSummary(source) }))
        const merged: Record<string, BuildSummary> = { ...summaries.value }
        const pending: SharedTargetValueItem[] = []
        for (const item of parsed) {
            merged[item.source.key] = item.summary
            if (item.snapshot) pending.push(item.snapshot)
        }
        summaries.value = merged
        if (pending.length === 0) return

        const issued = summaries.value
        try {
            const values = await requestBuildTargetValues(pending)
            // 等待期间被重新解析过的条目（如刚编辑完）已换成新对象，丢弃这批旧值
            const next = { ...summaries.value }
            for (const [key, value] of Object.entries(values)) {
                const current = next[key]
                if (!current || current !== issued[key]) continue
                next[key] = { ...current, targetValue: value }
            }
            summaries.value = next
        } catch (error) {
            console.error("构筑目标值计算失败", error)
        }
    }

    return { summaries, refresh }
}
