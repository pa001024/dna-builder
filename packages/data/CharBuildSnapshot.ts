import { CharBuild, type CharBuildOptions, type DotFrequencySettings } from "./CharBuild"
import { type CharSettings, type CharSkillLevels, normalizeCharSkillLevels } from "./charSettings"
import type { Buff, Char, Mod, Weapon } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { LeveledChar } from "./leveled/LeveledChar"
import { LeveledMod } from "./leveled/LeveledMod"
import type { Monster } from "./leveled/LeveledMonster"
import { LeveledMonster } from "./leveled/LeveledMonster"
import { LeveledWeapon } from "./leveled/LeveledWeapon"
import { normalizeSkillLevelBonus, SKILL_LEVEL_ATTR_KEYS } from "./skillLevels"
import { normalizeTraceStacks, resolveHighestActiveRoot, resolveTraceOffRoots } from "./traceEffects"
import { normalizeTranscendSettings } from "./transcendSettings"
import type { TranscendSkillReplacement } from "./transcendSkills"

/** 旧快照技能等级加成迁移 BUFF 名称（不与数据 BUFF / 用户可选名称冲突） */
const LEGACY_SKILL_LEVEL_BUFF = "旧快照技能等级加成"

export type ModSnapshot = {
    data: Mod
    level: number
    buffLv?: number
    effect?: Buff
} | null

export type WeaponSnapshot = {
    data: Weapon
    refine: number
    level: number
    effectLv?: number
    effect?: Buff
    forgeEffective: boolean
}

export interface CharBuildWorkerSnapshot {
    char: {
        data: Char
        level: number
    }
    /** 基础技能等级 `[E, Q, 被动]`：兼容老快照的单个数字；缺省时按旧快照反推 */
    baseSkillLevel?: CharSkillLevels | number
    /** 有效技能等级 `[E, Q, 被动]`：外部读数兼容（新快照仍写最终值） */
    skillLevel?: CharSkillLevels | number
    /** 旧快照的技能等级加成（已废弃）：仅在缺 `baseSkillLevel` 时用于反推基础值 */
    skillLevelBonus?: CharSkillLevels
    hpPercent: number
    resonanceGain: number
    auraMod?: ModSnapshot
    charMods: ModSnapshot[]
    meleeMods: ModSnapshot[]
    rangedMods: ModSnapshot[]
    skillMods: ModSnapshot[]
    buffs: {
        data: Buff
        level: number
        /** 覆盖率（0-1，默认1表示100%） */
        coverage?: number
    }[]
    melee: WeaponSnapshot
    ranged: WeaponSnapshot
    baseName: string
    imbalance: boolean
    enemy: {
        data: Monster
        level: number
        isRouge: boolean
        hpMultiplier: number
    }
    enemyId: number
    enemyLevel: number
    enemyResistance: number
    targetFunction: string
    customVariables: [string, string][]
    timelineDPS: boolean
    teamWeaponCategories: string[]
    /** 额外精通武器类型（如 "长柄"） */
    extraMastery: string
    /** DOT 频率设置（每种来源每秒造成伤害的次数） */
    dotSettings: DotFrequencySettings
    /** 所选魔灵主动技的原始冷却（秒）：角色属性「魔灵CD」的基数 */
    petBaseCd?: number
    /** 生成构筑的原始配置：收益 / 目标值请求据此走 wasm（缺失时回退 TS 快照） */
    settings?: CharSettings
    /** 升华词条技能替换（原技能 id → 载荷）：收益 worker 重建构筑时必须保留 */
    skillReplacements?: Record<number, TranscendSkillReplacement>
}

/**
 * 快照跨线程前先过一遍 JSON，把响应式代理读成裸数据。
 *
 * 构筑实例里嵌着配装页设置的引用（customVariables 等按引用存入），深层代理的数组
 * 直接 structuredClone 会抛 DataCloneError；JSON 读取能穿透代理，回来的是保证可克隆的
 * 纯数据。undefined 字段会被丢弃，重建侧一律按缺省处理，与之前保持一致。
 * @param snapshot 快照原文
 * @returns 可安全跨线程的纯数据快照
 */
function toCloneableSnapshot(snapshot: CharBuildWorkerSnapshot): CharBuildWorkerSnapshot {
    return JSON.parse(
        JSON.stringify(snapshot, (_key, value) => {
            if (typeof value === "function" || typeof value === "symbol") {
                return undefined
            }
            if (typeof value === "bigint") {
                return Number(value)
            }
            return value
        })
    ) as CharBuildWorkerSnapshot
}

/**
 * 将构筑实例转换为 worker 可结构化克隆的快照。
 * @param charBuild 构筑实例
 * @returns worker 构筑快照
 */
export function createWorkerSnapshot(charBuild: CharBuild): CharBuildWorkerSnapshot {
    const createModSnapshot = (mod: CharBuild["charMods"][number]) =>
        mod
            ? {
                  data: mod.originalModData,
                  level: mod.等级,
                  buffLv: mod.buffLv,
                  effect: mod.buff?._originalBuffData,
              }
            : null
    const createWeaponSnapshot = (weapon: CharBuild["meleeWeapon"]) => ({
        data: weapon._originalWeaponData,
        refine: weapon.精炼,
        level: weapon.等级,
        effectLv: weapon.effectLv,
        effect: weapon.buff?._originalBuffData,
        forgeEffective: weapon.forgeEffective,
    })

    // 关闭的根源随快照带到 worker；旧配置缺字段时按溯级迁移，溯级同步为最高激活根源
    const traceOffRoots = charBuild.settings
        ? resolveTraceOffRoots(charBuild.settings.traceOffRoots, charBuild.settings.traceLevel, charBuild.char.id)
        : undefined

    const snapshot: CharBuildWorkerSnapshot = {
        char: {
            data: charBuild.char._originalCharData,
            level: charBuild.char.等级,
        },
        baseSkillLevel: [...charBuild.baseSkillLevel] as CharSkillLevels,
        // 兼容读数取 getSkillLevel 的有效值（触发二次解析，避免原地改 BUFF 后写出陈旧值）；
        // 新读取方只用 `baseSkillLevel + buffs` 重建
        skillLevel: [charBuild.getSkillLevel(0), charBuild.getSkillLevel(1), charBuild.getSkillLevel(2)] as CharSkillLevels,
        hpPercent: charBuild.hpPercent,
        resonanceGain: charBuild.resonanceGain,
        auraMod: createModSnapshot(charBuild.auraMod || null),
        charMods: charBuild.charMods.map(createModSnapshot),
        meleeMods: charBuild.meleeMods.map(createModSnapshot),
        rangedMods: charBuild.rangedMods.map(createModSnapshot),
        skillMods: charBuild.skillMods.map(createModSnapshot),
        // 复合BUFF（code+普通属性）同一实例同时位于普通槽位与code槽位，按引用去重避免快照重复
        buffs: [...new Set([...charBuild.buffs, ...charBuild.dynamicBuffs])].map(buff => ({
            data: buff._originalBuffData,
            level: buff.等级,
            coverage: buff.coverage !== 1 ? buff.coverage : undefined,
        })),
        melee: createWeaponSnapshot(charBuild.meleeWeapon),
        ranged: createWeaponSnapshot(charBuild.rangedWeapon),
        baseName: charBuild.baseName,
        imbalance: charBuild.imbalance,
        enemy: {
            data: charBuild.enemy._baseData,
            level: charBuild.enemy.等级,
            isRouge: charBuild.enemy.isRouge,
            hpMultiplier: charBuild.enemy.hpMultiplier,
        },
        enemyId: charBuild.enemyId,
        enemyLevel: charBuild.enemyLevel,
        enemyResistance: charBuild.enemyResistance,
        targetFunction: charBuild.targetFunction,
        customVariables: charBuild.customVariables,
        timelineDPS: charBuild.timelineDPS,
        teamWeaponCategories: charBuild.teamWeaponCategories,
        extraMastery: charBuild.extraMastery,
        dotSettings: { ...charBuild.dotSettings },
        petBaseCd: charBuild.petBaseCd,
        // 原始配置随快照带到 worker：收益请求据此走 wasm，技能等级统一为三项数组；
        // 升华配置补齐为完整结构（缺省 = 关闭），wasm 门控与 TS 回退读同一份
        settings: charBuild.settings
            ? {
                  ...charBuild.settings,
                  charSkillLevel: normalizeCharSkillLevels(charBuild.settings.charSkillLevel),
                  // 溯级同步为最高激活根源；具体角色上限由 `collectTraceEffects` 在装配时钳制
                  traceLevel: resolveHighestActiveRoot(traceOffRoots ?? [], charBuild.char.id),
                  // 关闭的根源随快照带到 worker；旧配置缺字段时按溯级迁移
                  traceOffRoots,
                  // 溯源层数 / 覆盖率随快照带到 worker：按主控角色上限归一化，收集期再按 mx 钳制
                  traceStacks: normalizeTraceStacks(charBuild.settings.traceStacks, charBuild.char.id),
                  transcend: normalizeTranscendSettings(charBuild.settings.transcend),
              }
            : undefined,
        // 空表不下发；JSON 洗消后仍是纯数据，worker 据此重建替换后的技能
        skillReplacements: Object.keys(charBuild.skillReplacements).length > 0 ? charBuild.skillReplacements : undefined,
    }

    return toCloneableSnapshot(snapshot)
}

/**
 * 旧快照迁移：`skillLevel` 已是最终值、`skillLevelBonus` 是加成，
 * 反推基础值并补一条三键合成 BUFF，保证等级与面板读数不变。
 * @param snapshot 旧快照
 * @returns 基础等级与补齐后的 BUFF 列表
 */
function migrateLegacySkillLevel(snapshot: CharBuildWorkerSnapshot): {
    baseSkillLevel: CharSkillLevels
    buffs: CharBuildWorkerSnapshot["buffs"]
} {
    const final = normalizeCharSkillLevels(snapshot.skillLevel ?? 10)
    const bonus = normalizeSkillLevelBonus(snapshot.skillLevelBonus)
    if (!bonus.some(Boolean)) return { baseSkillLevel: final, buffs: snapshot.buffs }
    const base = final.map((value, index) => value - bonus[index]) as CharSkillLevels
    const name = snapshot.buffs.some(buff => buff.data.名称 === LEGACY_SKILL_LEVEL_BUFF)
        ? `${LEGACY_SKILL_LEVEL_BUFF}·迁移`
        : LEGACY_SKILL_LEVEL_BUFF
    const attr = Object.fromEntries(SKILL_LEVEL_ATTR_KEYS.map((key, index) => [key, bonus[index]]).filter(([, value]) => value !== 0))
    return {
        baseSkillLevel: base,
        buffs: [...snapshot.buffs, { data: { 名称: name, 描述: "旧快照技能等级加成迁移", attr }, level: 1 }],
    }
}

/**
 * 从可结构化克隆的快照恢复构筑实例。
 * @param snapshot 构筑快照
 * @returns 构筑实例
 */
export function createBuildFromSnapshot(snapshot: CharBuildWorkerSnapshot) {
    const createMod = (mod: ModSnapshot) => (mod ? new LeveledMod(mod.data, mod.level, mod.buffLv, mod.effect) : null)
    const createWeapon = (weapon: WeaponSnapshot) => {
        const leveled = new LeveledWeapon(weapon.data, weapon.refine, weapon.level, weapon.effectLv, weapon.effect)
        leveled.setForgeEffective(weapon.forgeEffective)
        return leveled
    }
    // 新快照写基础值；旧快照只有最终值 + 加成，需反推并补合成 BUFF（避免双计 / 掉等级）
    const restored =
        snapshot.baseSkillLevel === undefined
            ? migrateLegacySkillLevel(snapshot)
            : { baseSkillLevel: normalizeCharSkillLevels(snapshot.baseSkillLevel), buffs: snapshot.buffs }
    const options: CharBuildOptions = {
        char: new LeveledChar(snapshot.char.data, snapshot.char.level),
        skillLevel: restored.baseSkillLevel,
        hpPercent: snapshot.hpPercent,
        resonanceGain: snapshot.resonanceGain,
        auraMod: createMod(snapshot.auraMod || null) || undefined,
        charMods: snapshot.charMods.map(createMod),
        meleeMods: snapshot.meleeMods.map(createMod),
        rangedMods: snapshot.rangedMods.map(createMod),
        skillMods: snapshot.skillMods.map(createMod),
        buffs: restored.buffs.map(buff => {
            const leveled = new LeveledBuff(buff.data, buff.level)
            if (buff.coverage !== undefined) {
                leveled.coverage = buff.coverage
            }
            return leveled
        }),
        melee: createWeapon(snapshot.melee),
        ranged: createWeapon(snapshot.ranged),
        baseName: snapshot.baseName,
        imbalance: snapshot.imbalance,
        enemy: new LeveledMonster(snapshot.enemy.data, snapshot.enemy.level, snapshot.enemy.isRouge, snapshot.enemy.hpMultiplier),
        enemyId: snapshot.enemyId,
        enemyLevel: snapshot.enemyLevel,
        enemyResistance: snapshot.enemyResistance,
        targetFunction: snapshot.targetFunction,
        customVariables: snapshot.customVariables,
        timelineDPS: snapshot.timelineDPS,
        teamWeaponCategories: snapshot.teamWeaponCategories,
        extraMastery: snapshot.extraMastery,
        dotSettings: snapshot.dotSettings,
        petBaseCd: snapshot.petBaseCd,
        settings: snapshot.settings,
        skillReplacements: snapshot.skillReplacements,
    }
    return new CharBuild(options)
}
