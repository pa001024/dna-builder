/**
 * 米家旧规则 → 自动化规则的一次性迁移。
 *
 * 老键 `setting_mihome_*`（及其历史前缀 `setting_mijia_*`）只读不删，回滚时改回即可；
 * `setting_automation_migrated` 标记保证只跑一次。目标键与未来 automation store
 * 共用 `setting_automation_rules`，形状与 `AutomationRule` 一致。
 */

/** 自动化规则持久化键（与 automation store 共用）。 */
export const AUTOMATION_RULES_KEY = "setting_automation_rules"
/** 迁移已执行标记。 */
export const AUTOMATION_MIGRATED_KEY = "setting_automation_migrated"

import type { AutomationRule, MatchCond, Matcher, MatchOp } from "@/automation/types"

export type { AutomationRule }
/** 条件比较符（复用 engine 口径）。 */
export type AutomationConditionOp = MatchOp
/** 一条匹配条件（复用 engine 的 MatchCond）。 */
export type AutomationCondition = MatchCond
/** 规则匹配口径（复用 engine 的 Matcher）。 */
export type AutomationMatch = Matcher

/** 新规则预设：快捷按钮填充 kind + when 用（engine 落库后由面板接管）。 */
export interface AutomationRulePreset {
    name?: string
    kind?: string
    when?: MatchCond[]
    actionConfig?: Record<string, unknown>
}

/** 米家手动场景动作 id（engine 的 action registry 注册此 id 后直接复用）。 */
export const MIHOME_RUN_SCENE_ACTION_ID = "mihome.run-scene"

/** AFK 事件类型全集 + 委托刷新（规则编辑器 kind 单选的固定选项）。 */
export const AFK_KINDS = [
    "dungeon",
    "reward",
    "craft",
    "character",
    "monster",
    "chat",
    "language",
    "control",
    "commission_refresh",
] as const

/** 旧米家规则三种形状。 */
export type LegacyMiHomeRuleKind = "dungeon_complete" | "item_drop" | "craft_complete"

/** 旧米家规则（`setting_mihome_rules` 数组元素）。 */
export interface LegacyMiHomeRule {
    id: string
    enabled: boolean
    kind: LegacyMiHomeRuleKind
    dungeonId: string
    itemName: string
    minRarity: number
    sceneId: string
    homeId: string
    sceneName: string
}

const LEGACY_KINDS: readonly string[] = ["dungeon_complete", "item_drop", "craft_complete"]

/**
 * 安全读 localStorage（隐私模式等不可写环境返回 null）。
 * @param key 键
 * @returns 原始字符串或 null
 */
function readStorage(key: string): string | null {
    try {
        if (typeof localStorage === "undefined") return null
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

/**
 * 按新老两个键读值（新键优先，历史 `mijia` 键兜底）。
 * @param fresh 新键
 * @param legacy 老键
 * @returns 命中的原始字符串或 null
 */
function readWithFallback(fresh: string, legacy: string): string | null {
    return readStorage(fresh) ?? readStorage(legacy)
}

/**
 * 解析旧规则数组：非数组/脏元素直接丢弃，不抛错。
 * @param raw localStorage 原始字符串
 * @returns 合法的旧规则
 */
export function parseLegacyMiHomeRules(raw: string | null): LegacyMiHomeRule[] {
    if (!raw) return []
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (item): item is LegacyMiHomeRule =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as LegacyMiHomeRule).id === "string" &&
                LEGACY_KINDS.includes((item as LegacyMiHomeRule).kind)
        )
    } catch {
        return []
    }
}

/**
 * 读布尔开关（vueuse useLocalStorage 存的是 JSON `true`/`false`，缺省给默认值）。
 * @param raw 原始字符串
 * @param fallback 缺省值
 * @returns 开关值
 */
function parseLegacyFlag(raw: string | null, fallback: boolean): boolean {
    if (raw === null) return fallback
    if (raw === "true") return true
    if (raw === "false") return false
    try {
        const parsed: unknown = JSON.parse(raw)
        return typeof parsed === "boolean" ? parsed : fallback
    } catch {
        return fallback
    }
}

function clampRarity(n: unknown): number {
    const v = typeof n === "number" ? Math.round(n) : 1
    return Math.min(5, Math.max(1, v))
}

/**
 * 单条旧规则 → 自动化规则（三种旧形状分别展开为 kind + when）。
 * @param rule 旧规则
 * @param fireOnce 旧全局仅一次（下沉为单规则 fireOnce）
 * @param globalEnabled 旧全局总开关（与单规则 enabled 取与，保住“关了就不触发”）
 * @returns 自动化规则
 */
export function migrateMiHomeRule(rule: LegacyMiHomeRule, fireOnce: boolean, globalEnabled: boolean): AutomationRule {
    const when: AutomationCondition[] = []
    let kind: string
    if (rule.kind === "dungeon_complete") {
        kind = "dungeon"
        when.push({ field: "status", op: "eq", value: "complete" })
        if (rule.dungeonId) when.push({ field: "id", op: "eq", value: rule.dungeonId })
    } else if (rule.kind === "item_drop") {
        kind = "reward"
        const name = (rule.itemName ?? "").trim()
        if (name) when.push({ field: "name", op: "contains", value: name })
        const rarity = clampRarity(rule.minRarity)
        if (rarity > 1) when.push({ field: "rarity", op: "gte", value: rarity })
    } else {
        kind = "craft"
        const name = (rule.itemName ?? "").trim()
        if (name) when.push({ field: "name", op: "contains", value: name })
    }
    return {
        id: rule.id,
        enabled: (rule.enabled ?? true) && globalEnabled,
        name: (rule.sceneName ?? "").trim() || rule.kind,
        fireOnce,
        match: { kind, when },
        actionId: MIHOME_RUN_SCENE_ACTION_ID,
        actionConfig: {
            scene_id: rule.sceneId ?? "",
            home_id: rule.homeId ?? "",
            sceneName: rule.sceneName ?? "",
        },
    }
}

/**
 * 解析已持久化的自动化规则（脏数据丢弃）。
 * 兼容旧版多选 kinds 存量：取首个为 kind（旧多选本就只在单 kind 下有意义）。
 * @param raw 原始字符串
 * @returns 规则数组
 */
export function parseAutomationRules(raw: string | null): AutomationRule[] {
    if (!raw) return []
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        const out: AutomationRule[] = []
        for (const item of parsed) {
            if (
                typeof item !== "object" ||
                item === null ||
                typeof (item as AutomationRule).id !== "string" ||
                typeof (item as AutomationRule).actionId !== "string" ||
                typeof (item as AutomationRule).match !== "object"
            ) {
                continue
            }
            const rule = item as AutomationRule
            const legacy = rule.match as { kind?: string; kinds?: string[] }
            if (legacy.kind === undefined && Array.isArray(legacy.kinds)) {
                rule.match = { ...rule.match, kind: legacy.kinds[0] }
                delete legacy.kinds
            }
            out.push(rule)
        }
        return out
    } catch {
        return []
    }
}

/**
 * 一次性迁移：旧米家规则 → 自动化规则。标记已存在直接跳过；旧键一律保留。
 * @returns 是否执行及迁入条数
 */
export function migrateLegacyAutomation(): { migrated: boolean; count: number } {
    try {
        if (typeof localStorage === "undefined") return { migrated: false, count: 0 }
        if (localStorage.getItem(AUTOMATION_MIGRATED_KEY) !== null) return { migrated: false, count: 0 }
        const legacyRules = parseLegacyMiHomeRules(readWithFallback("setting_mihome_rules", "setting_mijia_rules"))
        const globalEnabled = parseLegacyFlag(readWithFallback("setting_mihome_enabled", "setting_mijia_enabled"), false)
        const fireOnce = parseLegacyFlag(readWithFallback("setting_mihome_fire_once", "setting_mijia_fire_once"), true)
        const migrated = legacyRules.map(rule => migrateMiHomeRule(rule, fireOnce, globalEnabled))
        if (migrated.length > 0) {
            const existing = parseAutomationRules(localStorage.getItem(AUTOMATION_RULES_KEY))
            const seen = new Set(existing.map(item => item.id))
            for (const rule of migrated) {
                if (!seen.has(rule.id)) {
                    existing.push(rule)
                    seen.add(rule.id)
                }
            }
            localStorage.setItem(AUTOMATION_RULES_KEY, JSON.stringify(existing))
        }
        localStorage.setItem(AUTOMATION_MIGRATED_KEY, "1")
        return { migrated: true, count: migrated.length }
    } catch {
        return { migrated: false, count: 0 }
    }
}
