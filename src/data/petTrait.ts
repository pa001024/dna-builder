import type { CharBuild } from "./CharBuild"
import { buffMap, petMap } from "./d"
import { type PetEntry, petEntrys } from "./d/pet.data"
import { registerDataPackHydrationCallback } from "./data-pack-bridge"
import type { Buff } from "./data-types"
import { LeveledBuff } from "./leveled/LeveledBuff"
import { PET_SKILL_LEVEL_INDEX_MAX } from "./leveled/LeveledPet"

/**
 * 魔灵潜质（构筑页文案：魔灵潜质）目录与魔灵 BUFF 组装。
 *
 * 游戏数据里潜质只有一份来源：失活魔灵的潜质表 `petEntrys`（每个基础潜质 1~3 个稀有度档位，
 * 声明在 `src/data/d/pet.data.ts`）。会走角色属性结算的潜质，其数值以 `魔灵潜质:<潜质名>` 的 BUFF
 * 形式登记在 `src/data/d/buff.data.ts`（满级数值 + a/b 曲线），本模块按「潜质名 → 同名前缀 BUFF」
 * 的约定把两者关联起来，复用 BUFF 的等级曲线与收益计算，不再重复维护一份数值表。
 *
 * 潜质等级与稀有度一一对应：r3/r4/r5 → 1/2/3 级（BUFF 的 lx=1、mx=3，1 级即 r3 数值）。
 * 槽位只存 `[潜质 id, 等级]`，其余（名称/图标/描述/属性）都由本模块现算。
 *
 * 魔灵自身的 BUFF 也在这里组装：被动物以魔灵名登记，主动技以 `魔灵名(主动)` 登记，
 * 主动 BUFF 按用户设置的覆盖率计入构筑。
 */

/** 潜质关联 BUFF 的名称前缀（与 buff.data.ts 中潜质条目的命名保持一致；BUFF 列表据此排除潜质） */
export const TRAIT_BUFF_NAME_PREFIX = "魔灵潜质:"

/** 构筑页的潜质槽位数量（4 个，槽位间互不相同） */
export const TRAIT_SLOT_COUNT = 4

/** 潜质等级上限（r5 对应 3 级） */
export const TRAIT_MAX_LEVEL = 3

/**
 * 魔灵技能等级的展示偏移：数据源的 `值[x]` 与技能 BUFF 等级都用「值索引」（= 突破等级 0-3 + 潜质加成），
 * 而游戏内展示的技能等级 = 值索引 + 1（突破 0 → Lv.1，突破 3 → Lv.4，突破 3 + 「老道」→ 值索引 4 → Lv.5）。
 */
export const PET_SKILL_LEVEL_OFFSET = 1

/** 魔灵主动技 BUFF 的命名后缀（与 buff.data.ts 的艾尔芙条目一致） */
const PET_ACTIVE_BUFF_SUFFIX = "(主动)"

/**
 * 潜质对魔灵自身（而非角色属性）的效果：基础潜质 id → 魔灵支援/被动技能等级加成。
 * 这类潜质没有对应的属性 BUFF（无法用属性表表达「技能等级+1」），由构筑页在计算魔灵技能等级时叠加。
 */
const TRAIT_PET_LEVEL_BONUS: Record<number, number> = {
    // 老道：魔灵支援和被动等级+1
    1030: 1,
}

/**
 * 单个潜质档位（一个稀有度即为一条潜质条目）。
 */
export interface PetTrait {
    /** 潜质条目 id（如 10103 表示 凶猛 r5） */
    id: number
    /** 基础潜质 id（同一潜质的不同稀有度共用，如 1010 表示 凶猛） */
    bid: number
    /** 潜质名（如「凶猛」） */
    name: string
    /** 稀有度：3/4/5 */
    r: number
    /** 潜质等级（= r - 2，即 1/2/3），同时是魔灵潜质 BUFF 的等级 */
    level: number
    /** 面板展示图标路径 */
    url: string
    /** 该档位的效果描述（数据源原文，如「攻击+8%」；不参与属性结算的潜质为玩法描述） */
    desc: string
    /** 关联的魔灵潜质 BUFF 名称；不参与角色属性结算的潜质为 null */
    buffName: string | null
    /** 对魔灵支援/被动技能等级的加成（如「老道」+1），无此效果时为 0 */
    petSkillLevelBonus: number
}

/** 潜质槽位：[基础潜质 id, 等级]，null 表示空槽 */
export type TraitSlot = [number, number] | null

/**
 * 潜质图标路径。
 * @param icon 图标基名（如 World_Blue）
 * @returns 图标 URL
 */
export function traitIconUrl(icon: string): string {
    return `/imgs/webp/T_Armory_Pet_Attr_${icon}.webp`
}

/**
 * 将潜质条目转换为潜质档位：按名称前缀关联到已有 BUFF，关联不到即视为「无属性潜质」。
 * @param entry 潜质条目
 * @returns 潜质档位
 */
function toTrait(entry: PetEntry): PetTrait {
    const buffName = `${TRAIT_BUFF_NAME_PREFIX}${entry.name}`
    return {
        id: entry.id,
        bid: entry.bid,
        name: entry.name,
        r: entry.r,
        level: entry.r - 2,
        url: traitIconUrl(entry.icon),
        desc: entry.desc,
        buffName: buffMap.has(buffName) ? buffName : null,
        petSkillLevelBonus: TRAIT_PET_LEVEL_BONUS[entry.bid] ?? 0,
    }
}

/** 潜质目录缓存（数据包换入后失效，见下方 registerDataPackHydrationCallback） */
let traitCatalog: {
    traits: PetTrait[]
    byId: Map<number, PetTrait>
    byLevel: Map<number, Map<number, PetTrait>>
} | null = null

/**
 * 构建潜质目录（按数据源顺序：基础潜质从小到大，等级从低到高）。
 * 数据包是分批换入的（换入后 buffMap/petMap 会重建），因此目录惰性构建并缓存，换包时失效重建。
 * @returns 潜质目录
 */
function getTraitCatalog() {
    if (traitCatalog) return traitCatalog
    const traits = petEntrys.map(toTrait)
    const byId = new Map<number, PetTrait>(traits.map(trait => [trait.id, trait]))
    const byLevel = new Map<number, Map<number, PetTrait>>()
    for (const trait of traits) {
        const levels = byLevel.get(trait.bid) ?? new Map<number, PetTrait>()
        levels.set(trait.level, trait)
        byLevel.set(trait.bid, levels)
    }
    traitCatalog = { traits, byId, byLevel }
    return traitCatalog
}

/**
 * 全部潜质档位。
 * @returns 潜质档位列表
 */
export function getPetTraits(): PetTrait[] {
    return getTraitCatalog().traits
}

/** 全部魔灵 BUFF 名称缓存（被动物用魔灵名、主动技用「魔灵名(主动)」） */
let petBuffNames: Set<string> | null = null

/**
 * 全部魔灵相关 BUFF 名称（被动物用魔灵名、主动技用「魔灵名(主动)」）。
 * @returns 名称集合
 */
function getPetBuffNames(): Set<string> {
    if (!petBuffNames) {
        petBuffNames = new Set<string>()
        for (const pet of petMap.values()) {
            petBuffNames.add(pet.名称)
            petBuffNames.add(`${pet.名称}${PET_ACTIVE_BUFF_SUFFIX}`)
        }
    }
    return petBuffNames
}

// 数据包换入会重建 buffMap/petMap：失效目录与名称缓存，避免用到换包前的快照
registerDataPackHydrationCallback(() => {
    traitCatalog = null
    petBuffNames = null
})

/**
 * 按条目 id 读取潜质档位。
 * @param id 潜质条目 id
 * @returns 潜质档位，未找到时为 undefined
 */
export function getPetTrait(id: number): PetTrait | undefined {
    return getTraitCatalog().byId.get(id)
}

/**
 * 按基础潜质 id 与等级读取潜质档位。
 * @param bid 基础潜质 id
 * @param level 潜质等级（1/2/3）
 * @returns 潜质档位，该等级不存在时为 undefined
 */
export function getPetTraitByLevel(bid: number, level: number): PetTrait | undefined {
    return getTraitCatalog().byLevel.get(bid)?.get(level)
}

/**
 * 判断 BUFF 是否属于魔灵（魔灵潜质 / 魔灵被动物 / 魔灵主动技）。
 * 这些 BUFF 由魔灵面板与潜质槽位接管，不再出现在 BUFF 列表中，避免重复叠加。
 * @param name BUFF 名称
 * @returns 是否为魔灵相关 BUFF
 */
export function isPetRelatedBuffName(name: string): boolean {
    return name.startsWith(TRAIT_BUFF_NAME_PREFIX) || getPetBuffNames().has(name)
}

/**
 * 将潜质档位构造为可参与构筑结算的 BUFF。
 * @param trait 潜质档位
 * @returns 等级化 BUFF；无属性潜质返回 null
 */
export function createTraitBuff(trait: PetTrait | null | undefined): LeveledBuff | null {
    if (!trait?.buffName) return null
    const buffData = buffMap.get(trait.buffName)
    if (!buffData) {
        console.error(`潜质 "${trait.name}" 关联的 BUFF "${trait.buffName}" 未在静态表中找到`)
        return null
    }
    return new LeveledBuff(buffData, trait.level)
}

/**
 * 将潜质槽位批量构造为构筑 BUFF（空槽与无属性潜质会被跳过，仅用于注入构筑）。
 * @param slots 潜质槽位
 * @returns 可参与构筑结算的 BUFF 列表
 */
export function collectTraitBuffs(slots: readonly unknown[] | undefined | null): LeveledBuff[] {
    const buffs: LeveledBuff[] = []
    for (const slot of slots ?? []) {
        if (!Array.isArray(slot)) continue
        const [bid, level] = slot as unknown[]
        if (typeof bid !== "number" || typeof level !== "number") continue
        const buff = createTraitBuff(getPetTraitByLevel(bid, level))
        if (buff) buffs.push(buff)
    }
    return buffs
}

/**
 * 归一化潜质槽位：固定 TRAIT_SLOT_COUNT 槽、剔除非法/重复槽位（同一基础潜质只保留第一个），
 * 并把有效槽位压紧到前列（空槽补 null）。
 * 去重按基础潜质：同一潜质的两个等级档位共用同一条魔灵潜质 BUFF，同时装备会让「按名称移除该 BUFF」
 * 的收益计算把两槽一起摘掉。
 * @param slots 待归一化的槽位
 * @returns 结构完整的潜质槽位
 */
/**
 * 归一化潜质槽位：固定 TRAIT_SLOT_COUNT 槽、剔除非法/重复槽位（同一基础潜质只保留第一个），
 * 并把有效槽位压紧到前列（空槽补 null）。
 * 去重按基础潜质：同一潜质的两个等级档位共用同一条魔灵潜质 BUFF，同时装备会让「按名称移除该 BUFF」
 * 的收益计算把两槽一起摘掉。
 *
 * 入参可能是历史版本写入的任意形状（例如早期把潜质条目 id 直接存成数字），
 * 因此逐槽做形状校验而不是直接解构——存档脏数据只会被丢弃，不会让构筑页初始化抛错。
 * @param slots 待归一化的槽位
 * @returns 结构完整的潜质槽位
 */
export function normalizeTraitSlots(slots: readonly unknown[] | undefined | null): TraitSlot[] {
    const usedBids = new Set<number>()
    const picked: TraitSlot[] = []
    for (const slot of slots || []) {
        if (!Array.isArray(slot)) continue
        const [bid, level] = slot as unknown[]
        if (typeof bid !== "number" || typeof level !== "number") continue
        if (usedBids.has(bid) || !getPetTraitByLevel(bid, level)) continue
        usedBids.add(bid)
        picked.push([bid, level])
    }
    return Array.from({ length: TRAIT_SLOT_COUNT }, (_, index) => picked[index] ?? null)
}

/**
 * 取潜质档位的 BUFF 属性数值（如 凶猛 r5 → `{ 攻击: 0.24 }`），无属性潜质返回空对象。
 * @param trait 潜质档位
 * @returns BUFF 属性数值
 */
export function getTraitProperties(trait: PetTrait): Record<string, number> {
    return createTraitBuff(trait)?.getProperties() ?? {}
}

/**
 * 潜质槽位带来的魔灵技能等级加成总和（如「老道」+1）。
 * @param slots 潜质槽位
 * @returns 等级加成总和
 */
export function getTraitPetLevelBonus(slots: readonly unknown[] | undefined | null): number {
    let bonus = 0
    for (const slot of slots ?? []) {
        if (!Array.isArray(slot)) continue
        const [bid, level] = slot as unknown[]
        if (typeof bid !== "number" || typeof level !== "number") continue
        bonus += getPetTraitByLevel(bid, level)?.petSkillLevelBonus ?? 0
    }
    return bonus
}

/**
 * 魔灵的生效技能等级 = 突破等级 + 潜质加成（如「老道」），并钳制在 0-4 档。
 * 魔灵主动/被动技能的数值（pet.data.ts 的 `值[x]`）与属性 BUFF 的等级都取该等级。
 * @param petLevel 魔灵突破等级（设置项，默认 3）
 * @param slots 潜质槽位
 * @returns 生效技能等级
 */
export function getEffectivePetLevel(petLevel: number, slots: readonly unknown[] | undefined | null): number {
    const base = Number.isFinite(petLevel) ? petLevel : PET_SKILL_LEVEL_INDEX_MAX
    return Math.max(0, Math.min(PET_SKILL_LEVEL_INDEX_MAX, base + getTraitPetLevelBonus(slots)))
}

/**
 * 读取魔灵主动技的原始冷却（秒）。
 * @param petId 魔灵 id（0 表示未选择）
 * @returns 原始冷却秒数；未选择或该魔灵没有主动技时为 0
 */
export function getPetBaseCd(petId: number): number {
    if (!petId) return 0
    return petMap.get(petId)?.主动?.cd ?? 0
}

/**
 * 读取魔灵主动技的效果持续时间（秒）。
 *
 * 数据源没有独立的持续字段，时长写在描述里（如「持续{}秒」），占位符按出现顺序对应 `主动.值` 的各行：
 * 因此先数出「持续…{}秒」里那个占位符是第几个占位符，再取对应行在指定档位上的数值。
 * @param petId 魔灵 id（0 表示未选择）
 * @param levelIndex 技能数值索引（0-4）
 * @returns 持续时间（秒）；描述里没有可解析的时长占位符时为 0
 */
export function getPetActiveDuration(petId: number, levelIndex: number): number {
    const skill = petId ? petMap.get(petId)?.主动 : undefined
    if (!skill) return 0
    const placeholders = [...skill.描述.matchAll(/\{%?\}/g)]
    const durationPlaceholderIndex = placeholders.findIndex(match => {
        const rest = skill.描述.slice((match.index ?? 0) + match[0].length)
        // 时长占位符形如「{}秒」：百分比占位符（{%}）与后面不是「秒」的都不是时长
        return match[0] === "{}" && rest.startsWith("秒")
    })
    if (durationPlaceholderIndex === -1) return 0
    const row = skill.值[durationPlaceholderIndex]
    const value = row?.[Math.max(0, Math.min(row.length - 1, levelIndex))]
    return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * 已装备潜质提供的魔灵CD缩减总和（如「敏锐」满档 24%）。
 * 自动覆盖率用它折算实际冷却，与构筑属性「魔灵CD缩减」同源（不含自定义 BUFF 等其它来源）。
 * @param slots 潜质槽位
 * @returns 缩减比例
 */
export function getTraitCdReduce(slots: readonly unknown[] | undefined | null): number {
    let reduce = 0
    for (const slot of slots ?? []) {
        if (!Array.isArray(slot)) continue
        const [bid, level] = slot as unknown[]
        if (typeof bid !== "number" || typeof level !== "number") continue
        const buff = createTraitBuff(getPetTraitByLevel(bid, level))
        const value = buff?.["魔灵CD缩减"]
        if (typeof value === "number") reduce += value
    }
    return Math.max(0, Math.min(1, reduce))
}

/**
 * 按给定的魔灵CD缩减解析主动技生效覆盖率。
 * 自动模式按「效果持续时间 / 实际冷却（原始冷却 × (1 - 缩减)）」计算；
 * 无法自动计算（无主动技、无时长占位符、冷却为 0）时退回手动值。
 * @param petId 魔灵 id
 * @param levelIndex 技能数值索引（0-4）
 * @param cdReduce 魔灵CD缩减（0-1）
 * @param manualCoverage 手动覆盖率（0-1）
 * @param auto 是否使用自动覆盖率
 * @returns 生效覆盖率（0-1）
 */
export function getCoverageFromCdReduce(
    petId: number,
    levelIndex: number,
    cdReduce: number,
    manualCoverage: number,
    auto: boolean
): number {
    const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1))
    if (!auto) return clamp(manualCoverage)
    const duration = getPetActiveDuration(petId, levelIndex)
    const cooldown = getPetBaseCd(petId) * (1 - clamp(cdReduce))
    if (!duration || cooldown <= 0) return clamp(manualCoverage)
    return clamp(duration / cooldown)
}

/**
 * 解析魔灵主动技的生效覆盖率（缩减取自潜质槽位）。
 * @param petId 魔灵 id
 * @param levelIndex 技能数值索引（0-4）
 * @param slots 潜质槽位
 * @param manualCoverage 手动覆盖率（0-1）
 * @param auto 是否使用自动覆盖率
 * @returns 生效覆盖率（0-1）
 */
export function resolvePetCoverage(
    petId: number,
    levelIndex: number,
    slots: readonly unknown[] | undefined | null,
    manualCoverage: number,
    auto: boolean
): number {
    return getCoverageFromCdReduce(petId, levelIndex, getTraitCdReduce(slots), manualCoverage, auto)
}

/**
 * 计算「魔灵主动技覆盖率从 fromCoverage 变为 toCoverage」带来的伤害变化。
 *
 * 「敏锐」这类潜质只提供冷却缩减，缩减本身不影响伤害：只有启用自动覆盖率时，
 * 更短的冷却才会折算成更高的技能覆盖率、从而抬升主动技 BUFF 的贡献，收益才不为 0
 * （手动覆盖率下缩减不改变覆盖率，收益为 0，与实际算法一致）。
 * @param build 当前构筑（不会被修改）
 * @param fromCoverage 不含该加成时的覆盖率（0-1）
 * @param toCoverage 含该加成时的覆盖率（0-1）
 * @returns 相对收益（如 0.05 表示 +5% 伤害）
 */
export function calcPetCoverageIncome(build: CharBuild, fromCoverage: number, toCoverage: number): number {
    if (Math.abs(fromCoverage - toCoverage) < 1e-6) return 0
    const fromValue = calculateAtPetCoverage(build, fromCoverage)
    const toValue = calculateAtPetCoverage(build, toCoverage)
    if (!fromValue || !toValue) return 0
    return toValue / fromValue - 1
}

/**
 * 克隆构筑并把魔灵主动技 BUFF 的覆盖率设为指定值后重算伤害。
 * 只改主动技（被动物没有覆盖率语义），且不改动其它 BUFF。
 * @param build 当前构筑（不会被修改）
 * @param coverage 目标覆盖率（0-1）
 * @returns 该覆盖率下的伤害；构筑内没有魔灵主动技 BUFF 时返回 0
 */
function calculateAtPetCoverage(build: CharBuild, coverage: number): number {
    const copyBuild = build.clone()
    const clamp = Math.max(0, Math.min(1, coverage))
    let touched = false
    for (const buff of copyBuild.buffs) {
        if (!buff.名称.endsWith(PET_ACTIVE_BUFF_SUFFIX)) continue
        buff.coverage = clamp
        touched = true
    }
    return touched ? copyBuild.calculate() : 0
}

/**
 * 读取魔灵在数据源中登记的 BUFF 原始数据：被动物用魔灵名、主动技用「魔灵名(主动)」。
 * 闪亮系列等未登记 BUFF 的魔灵两项均为 null，只有面板展示。
 * @param petId 魔灵 id
 * @returns 被动/主动 BUFF 原始数据
 */
export function getPetBuffData(petId: number): { passive: Buff | null; active: Buff | null } {
    const pet = petId ? petMap.get(petId) : undefined
    if (!pet) return { passive: null, active: null }
    return {
        passive: buffMap.get(pet.名称) ?? null,
        active: buffMap.get(`${pet.名称}${PET_ACTIVE_BUFF_SUFFIX}`) ?? null,
    }
}

/** 魔灵相关 BUFF 的归属：潜质档位，或某个魔灵的被动物/主动技 */
export type PetBuffOrigin = { kind: "trait"; trait: PetTrait } | { kind: "pet"; petId: number; active: boolean }

/**
 * 识别「魔灵相关 BUFF」的归属，用于把旧存档里以 BUFF 形式勾选的魔灵内容迁移到魔灵/潜质字段。
 * @param name BUFF 名称
 * @returns 归属信息；非魔灵相关 BUFF 返回 null
 */
export function resolvePetBuffName(name: string): PetBuffOrigin | null {
    if (name.startsWith(TRAIT_BUFF_NAME_PREFIX)) {
        const traitName = name.slice(TRAIT_BUFF_NAME_PREFIX.length)
        const trait = getTraitCatalog().traits.find(item => item.name === traitName)
        return trait ? { kind: "trait", trait } : null
    }
    for (const pet of petMap.values()) {
        if (pet.名称 === name) return { kind: "pet", petId: pet.id, active: false }
        if (`${pet.名称}${PET_ACTIVE_BUFF_SUFFIX}` === name) return { kind: "pet", petId: pet.id, active: true }
    }
    return null
}

/**
 * 组装所选魔灵在构筑中生效的 BUFF：被动物 + 主动技（按覆盖率缩放），等级取生效技能等级。
 * 数据源中未登记对应 BUFF 的魔灵（如闪亮系列）自然不产生任何属性，只提供面板展示。
 * @param petId 魔灵 id（0 表示未选择）
 * @param level 魔灵生效技能等级（见 getEffectivePetLevel）
 * @param coverage 主动技覆盖率（0-1）
 * @returns 生效的魔灵 BUFF 列表
 */
export function collectPetBuffs(petId: number, level: number, coverage: number): LeveledBuff[] {
    const { passive, active } = getPetBuffData(petId)
    const buffs: LeveledBuff[] = []
    if (passive) buffs.push(new LeveledBuff(passive, level))
    if (active) {
        const leveled = new LeveledBuff(active, level)
        leveled.coverage = Math.max(0, Math.min(1, coverage))
        buffs.push(leveled)
    }
    return buffs
}

/**
 * 计算「魔灵生效技能等级从 fromLevel 变为 toLevel」带来的伤害变化（其它条件不变）。
 *
 * 「老道」这类潜质不改变角色属性，只能靠提升魔灵主动/被动技能数值生效，因此收益必须以
 * 「含该加成」与「不含该加成」两个**等级**为口径，而不是在构筑当前等级上再加一级：
 * 生效等级有 4 级上限（满突破时加成不生效），用等级口径算出来的才是该潜质真正的贡献。
 * 传入相同的两个等级返回 0；魔灵没有登记技能 BUFF 时返回 0。
 *
 * @param build 当前构筑（不会被修改）
 * @param fromLevel 不含该加成时的生效技能等级
 * @param toLevel 含该加成时的生效技能等级
 * @returns 相对收益（如 0.05 表示 +5% 伤害）
 */
export function calcPetBuffLevelIncome(build: CharBuild, fromLevel: number, toLevel: number): number {
    if (fromLevel === toLevel) return 0
    const fromValue = calculateAtPetBuffLevel(build, fromLevel)
    const toValue = calculateAtPetBuffLevel(build, toLevel)
    if (!fromValue || !toValue) return 0
    return toValue / fromValue - 1
}

/**
 * 克隆构筑并把其中的魔灵技能 BUFF 统一设为指定等级后重算伤害。
 * @param build 当前构筑（不会被修改）
 * @param level 目标生效技能等级
 * @returns 该等级下的伤害；构筑内没有魔灵技能 BUFF 时返回 0
 */
function calculateAtPetBuffLevel(build: CharBuild, level: number): number {
    const copyBuild = build.clone()
    const petBuffNameSet = getPetBuffNames()
    let touched = false
    for (const buff of copyBuild.buffs) {
        if (!petBuffNameSet.has(buff.名称)) continue
        buff.等级 = level
        touched = true
    }
    return touched ? copyBuild.calculate() : 0
}
