import type { CharBuild } from "@/data/CharBuild"
import { createAssistBuildFromSettings, resolveSideEffectiveSkillLevels } from "@/data/CharBuildHelper"
import {
    type AssistCharSettings,
    type CharSettings,
    type CharSettingsInput,
    type CharSkillLevels,
    createDefaultAssistSideSettings,
    MOD_SLOT_TYPES,
    type ModSlot,
    type ModVariant,
    normalizeAssistSideSettings,
    normalizeCharSettings,
    normalizeCharSkillLevels,
    resolveCharSkillLevel,
} from "@/data/charSettings"
import { charMap, weaponMap } from "@/data/d"
import { LeveledSkill } from "@/data/leveled"
import type { AssistSide } from "@/data/teamResolver"
import { clampTraceLevel, normalizeTraceOffRoots, normalizeTraceStacks, resolveTraceOffRoots } from "@/data/traceEffects"
import type { TranscendSideLoadout } from "@/data/transcendBuild"

// 协战 facade：teamN / teamNWeapon 是 id 真源，assistN 只存本位配置；面板读写都经过这里，纯函数、不改入参。

const TEAM_KEYS: Record<AssistSide, "team1" | "team2"> = { assist1: "team1", assist2: "team2" }
const TEAM_WEAPON_KEYS: Record<AssistSide, "team1Weapon" | "team2Weapon"> = {
    assist1: "team1Weapon",
    assist2: "team2Weapon",
}

/** `"-"` / 0 / 非法值统一视为未选择 */
function toId(value: unknown): number {
    const id = Number(value)
    return Number.isFinite(id) && id > 0 ? Math.round(id) : 0
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback
    return Math.max(min, Math.min(max, Math.round(value)))
}

/** 与 `resolveSingleWeaponSelection` 同口径：按武器类型决定单槽落位 */
function isMeleeWeapon(weaponId: number): boolean {
    return weaponMap.get(weaponId)?.类型.includes("近战") ?? false
}

/**
 * 读取已归一化的协战配置。
 * `useCharSettings` 换键时会短暂换入原始存档（缺 `charSkillLevel` 等字段），
 * 这里统一走 `normalizeAssistSideSettings`，保证面板与 facade 不会因脏数据崩溃。
 */
function readAssist(settings: CharSettings, side: AssistSide): AssistCharSettings {
    return normalizeAssistSideSettings(settings[side], settings[TEAM_KEYS[side]], createDefaultAssistSideSettings())
}

/** 单武器按类型放入近战 / 远程槽，另一槽为 0 */
export function getAssistFacade(settings: CharSettings, side: AssistSide): TranscendSideLoadout {
    const assist = readAssist(settings, side)
    const charId = toId(settings[TEAM_KEYS[side]])
    const weaponId = toId(settings[TEAM_WEAPON_KEYS[side]])
    const melee = weaponId > 0 && isMeleeWeapon(weaponId)
    return {
        charId,
        charLevel: assist.charLevel,
        charSkillLevel: [...assist.charSkillLevel] as CharSkillLevels,
        traceLevel: assist.traceLevel,
        traceOffRoots: [...resolveTraceOffRoots(assist.traceOffRoots, assist.traceLevel, charId)],
        traceStacks: normalizeTraceStacks(assist.traceStacks, charId),
        meleeWeapon: melee ? weaponId : 0,
        meleeWeaponLevel: assist.weaponLevel,
        meleeWeaponRefine: assist.weaponRefine,
        rangedWeapon: melee ? 0 : weaponId,
        rangedWeaponLevel: assist.weaponLevel,
        rangedWeaponRefine: assist.weaponRefine,
        extraMastery: assist.extraMastery,
        baseName: assist.baseName,
        targetFunction: assist.targetFunction,
        customVariables: assist.customVariables.map(variable => [variable[0], variable[1]]),
        dotSettings: { ...assist.dotSettings },
        enabled: assist.enabled,
    }
}

/** facade 补丁映射结果 */
export interface AssistPatchMapping {
    /** 需要写回 `teamN` 的角色 id；0 表示清空 */
    teamId?: number
    /** 需要写回 `teamNWeapon` 的武器 id；0 表示清空 */
    weaponId?: number
    /** 需要写回 `assistN` 的本位字段 */
    assist: Partial<AssistCharSettings>
}

/** 换角色时清空 baseName / extraMastery，由 `resetAssistForChar` 再回填首个技能与启用位 */
export function mapAssistPatch(settings: CharSettings, side: AssistSide, patch: Partial<TranscendSideLoadout>): AssistPatchMapping {
    const current = readAssist(settings, side)
    const assist: Partial<AssistCharSettings> = {}
    const mapping: AssistPatchMapping = { assist }

    if (patch.charId !== undefined) {
        const nextCharId = toId(patch.charId)
        mapping.teamId = nextCharId
        if (nextCharId !== toId(settings[TEAM_KEYS[side]])) {
            assist.baseName = ""
            assist.extraMastery = ""
        }
    }

    if (patch.meleeWeapon !== undefined || patch.rangedWeapon !== undefined) {
        // 单槽语义：只看本次补丁给出的槽位（UI 已按 resolveSingleWeaponSelection 只留一个非 0）
        const melee = toId(patch.meleeWeapon)
        const ranged = toId(patch.rangedWeapon)
        mapping.weaponId = melee > 0 ? melee : ranged > 0 ? ranged : 0
    }

    if (patch.charLevel !== undefined) {
        assist.charLevel = clampInt(patch.charLevel, 1, 80, current.charLevel)
    }
    if (patch.charSkillLevel !== undefined) {
        assist.charSkillLevel = normalizeCharSkillLevels(patch.charSkillLevel)
    }
    if (patch.traceLevel !== undefined) {
        assist.traceLevel = clampTraceLevel(patch.traceLevel, toId(settings[TEAM_KEYS[side]]))
        // 旧字段显式写入时清空关闭列表，保证迁移生效
        assist.traceOffRoots = undefined
    }
    if (patch.traceOffRoots !== undefined) {
        assist.traceOffRoots = normalizeTraceOffRoots(patch.traceOffRoots, toId(settings[TEAM_KEYS[side]]))
    }
    if (patch.traceStacks !== undefined) {
        assist.traceStacks = normalizeTraceStacks(patch.traceStacks, toId(settings[TEAM_KEYS[side]]))
    }
    if (patch.baseName !== undefined) assist.baseName = patch.baseName
    if (patch.extraMastery !== undefined) assist.extraMastery = patch.extraMastery
    if (patch.targetFunction !== undefined) assist.targetFunction = patch.targetFunction
    if (patch.customVariables !== undefined) {
        assist.customVariables = patch.customVariables.map(variable => [variable[0], variable[1]])
    }
    if (patch.dotSettings !== undefined) assist.dotSettings = { ...patch.dotSettings }
    if (patch.enabled !== undefined) assist.enabled = patch.enabled

    const level = patch.meleeWeaponLevel ?? patch.rangedWeaponLevel
    if (level !== undefined) assist.weaponLevel = clampInt(level, 1, 80, current.weaponLevel)
    const refine = patch.meleeWeaponRefine ?? patch.rangedWeaponRefine
    if (refine !== undefined) assist.weaponRefine = clampInt(refine, 0, 5, current.weaponRefine)

    return mapping
}

/** 换角色后的复位：baseName 回填该角色首个技能，按角色有效性设置启用位 */
export function resetAssistForChar(settings: CharSettings, side: AssistSide): Partial<AssistCharSettings> {
    const charId = toId(settings[TEAM_KEYS[side]])
    const char = charId > 0 ? charMap.get(charId) : undefined
    return {
        baseName: char?.技能?.[0]?.名称 ?? "",
        extraMastery: "",
        enabled: Boolean(char),
    }
}

/** 与 `CharBuild.charSkills` 同口径：只暴露 E / Q / 被动三项；等级经单一预解析层叠加协战装备与溯源 attrs */
export function getAssistCharSkills(settings: CharSettings, side: AssistSide): LeveledSkill[] {
    const charId = toId(settings[TEAM_KEYS[side]])
    const char = charId > 0 ? charMap.get(charId) : undefined
    if (!char) return []
    const effective = resolveSideEffectiveSkillLevels(settings, side, charId)
    return char.技能.slice(0, 3).map((skill, index) => new LeveledSkill(skill, resolveCharSkillLevel(effective, index)))
}

/** 与计算路径同一构造入口；角色 / 武器未配置或构造异常时返回 null */
export function createAssistPanelBuild(settings: CharSettings, side: AssistSide, mainCharId?: number): CharBuild | null {
    try {
        return createAssistBuildFromSettings(normalizeCharSettings(settings), side, undefined, { mainCharId }) ?? null
    } catch (error) {
        console.error(error)
        return null
    }
}

/** 顶层构筑导入内嵌协战的结果 */
export interface AssistImportResult {
    /** 归一化后的协战配置（深拷贝，与来源相互独立） */
    assist: AssistCharSettings
    /** 解析后的单武器 id：已有武器保持不变，空武器时按来源推荐（无可用武器为 0） */
    weaponId: number
    /** 来源计算技能不在协战角色技能表内，已回退为首个技能 */
    baseNameFallback: boolean
}

function copyModSlots(slots: ModSlot[]): ModSlot[] {
    return slots.map(slot => (slot ? ([slot[0], slot[1]] as [number, number]) : null))
}

function copyModVariant(variant: ModVariant): ModVariant {
    const copied = { 中枢: variant.中枢 } as ModVariant
    for (const type of MOD_SLOT_TYPES) copied[type] = copyModSlots(variant[type] ?? [])
    return copied
}

/**
 * 按来源构筑推荐单武器：只剩一把时直接用，两把都在时优先匹配计算技能归属，都不匹配回落近战。
 * @param top 归一化后的顶层构筑
 * @returns 推荐的武器 id；来源两把武器都未配置时为 0
 */
export function suggestAssistWeapon(top: CharSettings): number {
    const meleeId = toId(top.meleeWeapon)
    const rangedId = toId(top.rangedWeapon)
    if (meleeId <= 0) return rangedId
    if (rangedId <= 0) return meleeId
    const baseName = top.baseName.trim()
    if (baseName) {
        if ((weaponMap.get(meleeId)?.技能 ?? []).some(skill => skill.名称 === baseName)) return meleeId
        if ((weaponMap.get(rangedId)?.技能 ?? []).some(skill => skill.名称 === baseName)) return rangedId
    }
    return meleeId
}

/**
 * 把顶层角色构筑转换为内嵌协战配置（顶层 setting → 内嵌 setting）。
 *
 * 结构差异：敌人环境 / 血量 / 共振 / 失衡 / 魔灵 / 潜质 / 队伍 / 时间线不属于协战，不导入；
 * 双武器按解析后的单武器类型只取对应槽位的等级与精炼；MOD（含三份变体与激活位）、BUFF、
 * 自定义 BUFF、特效等级、目标函数、自定义变量、DOT 设置整体搬运。
 * @param source 顶层构筑（本地项目 / 分享构筑 / JSON 解析结果，允许未归一化的旧形状）
 * @param teamCharId 协战角色 id（baseName 校验与启用位推断的依据）
 * @param teamWeaponId 当前单武器 id（未配置时按来源推荐并随结果返回）
 * @param currentEnabled 当前启用位；传入时原样保留，不传则按角色有效性推断
 * @returns 归一化后的协战配置与单武器 id
 */
export function convertTopSettingsToAssist(
    source: unknown,
    teamCharId: number | "-",
    teamWeaponId: number | "-",
    currentEnabled?: boolean
): AssistImportResult {
    const top = normalizeCharSettings(source as CharSettingsInput)
    const charId = toId(teamCharId)
    let weaponId = toId(teamWeaponId)
    if (!weaponId) weaponId = suggestAssistWeapon(top)
    const melee = weaponId > 0 ? isMeleeWeapon(weaponId) : true
    const raw: Partial<AssistCharSettings> = {
        charLevel: top.charLevel,
        charSkillLevel: [...top.charSkillLevel],
        traceLevel: top.traceLevel,
        traceOffRoots: [...(top.traceOffRoots ?? [])],
        traceStacks: normalizeTraceStacks(top.traceStacks, charId > 0 ? charId : undefined),
        baseName: top.baseName,
        extraMastery: top.extraMastery,
        weaponLevel: melee ? top.meleeWeaponLevel : top.rangedWeaponLevel,
        weaponRefine: melee ? top.meleeWeaponRefine : top.rangedWeaponRefine,
        targetFunction: top.targetFunction,
        customVariables: top.customVariables.map(variable => [variable[0], variable[1]] as [string, string]),
        dotSettings: { ...top.dotSettings },
        auraMod: top.auraMod,
        charMods: copyModSlots(top.charMods),
        meleeMods: copyModSlots(top.meleeMods),
        rangedMods: copyModSlots(top.rangedMods),
        skillWeaponMods: copyModSlots(top.skillWeaponMods),
        modVariantIndex: top.modVariantIndex,
        modVariants: top.modVariants.map(copyModVariant),
        buffs: top.buffs.map(buff => [...buff] as [string, number, number?]),
        customBuff: top.customBuff.map(entry => [...entry] as [string, number]),
        useGlobal: top.useGlobal,
        effectConfig: { ...top.effectConfig },
    }
    if (typeof currentEnabled === "boolean") raw.enabled = currentEnabled
    const assist = normalizeAssistSideSettings(raw, charId > 0 ? charId : "-", createDefaultAssistSideSettings())
    const sourceBaseName = top.baseName.trim()
    return { assist, weaponId, baseNameFallback: sourceBaseName !== "" && assist.baseName !== sourceBaseName }
}
