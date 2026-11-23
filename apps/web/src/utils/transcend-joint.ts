import { type Ref, reactive } from "vue"
import { getTranscendExtraMasteryOptions, type TranscendBuildSettings, weaponMap } from "@/data"
import type { ModVariantLetter } from "@/data/charSettings"
import { PET_BREAKTHROUGH_MAX_LEVEL } from "@/data/leveled/LeveledPet"
import { TRAIT_SLOT_COUNT, type TraitSlot } from "@/data/petTrait"

/**
 * 升华页的 joint facade：把 `TranscendBuildSettings` 投影成原构筑页组件（TeamEditor / PetEditor /
 * CustomBuffEditor）可直接读写的形状。
 *
 * - 读写共用同一份设置：属性是访问器，读走 `settings.value`，写回同一字段，天然没有回环；
 * - 协战 `teamN/teamNWeapon` ↔ `assistN` 的 `charId` 与单武器槽（武器类型决定写入近战 / 远程槽，另一槽清空）；
 * - `teamNBuild/teamNBuildVariant` 只在 facade 内保留（TeamEditor 的服务器构筑关联），不进入计算、不持久化；
 * - 魔灵 / 潜质 / 自定义 BUFF 直接映射 joint 字段（只挂主控，由数据层注入）。
 */

/** TeamEditor 的未选择占位值（与 `CharSettings.team1` 同形） */
export type TranscendTeamFacadeValue = number | "-"

/** TeamEditor 需要的队伍字段投影 */
export interface TranscendTeamFacade {
    team1: TranscendTeamFacadeValue
    team1Weapon: TranscendTeamFacadeValue
    team1Build: string
    team1BuildVariant: ModVariantLetter
    team2: TranscendTeamFacadeValue
    team2Weapon: TranscendTeamFacadeValue
    team2Build: string
    team2BuildVariant: ModVariantLetter
}

/** 升华页共享给原版 buff 区组件的完整 facade */
export interface TranscendJointFacade extends TranscendTeamFacade {
    petId: number
    petLevel: number
    petCoverage: number
    petAutoCoverage: boolean
    traits: TraitSlot[]
    customBuff: [string, number][]
}

export interface TranscendJointFacadeOptions {
    /** 任何会改变持久化设置的写入（角色 / 武器 / 魔灵 / 自定义 BUFF），用于标记已编辑 */
    onChange?: () => void
}

/** 协战位与 facade 槽位的对应关系 */
const TEAM_SIDES = ["assist1", "assist2"] as const
type TeamSide = (typeof TEAM_SIDES)[number]

/**
 * 归一化 facade 传入的角色 / 武器选择：正整数取整，"-" 与非法值按未选择（0）。
 * @param value 原始值
 * @returns 角色 / 武器 id
 */
function toOptionalId(value: unknown): number {
    const id = Number(value)
    return Number.isFinite(id) && id > 0 ? Math.round(id) : 0
}

/**
 * 判断武器是否属于近战类型（与 `resolveSingleWeaponSelection` 同口径）。
 * @param weaponId 武器 id
 * @returns 近战武器为 true
 */
function isMeleeWeapon(weaponId: number): boolean {
    return weaponMap.get(weaponId)?.类型.includes("近战") ?? false
}

/**
 * 创建升华页 joint facade。
 * @param settings 升华构筑设置引用（页面唯一真源）
 * @param options 变更回调
 * @returns 可直接传给 TeamEditor / PetEditor / CustomBuffEditor 的 facade
 */
export function createTranscendJointFacade(
    settings: Ref<TranscendBuildSettings>,
    options: TranscendJointFacadeOptions = {}
): TranscendJointFacade {
    const onChange = () => options.onChange?.()

    /** 协战关联构筑：TeamEditor 的展示字段，不进入计算也不写设置（reactive 让构筑标题 / 变体字母即时刷新） */
    const builds = reactive<Record<TeamSide, { build: string; variant: ModVariantLetter }>>({
        assist1: { build: "-", variant: "A" },
        assist2: { build: "-", variant: "A" },
    })

    /**
     * 写入协战角色：保留等级 / 技能 / 额外精通（角色未变时），换角色重置 baseName 与启用状态，
     * 并清掉对新角色非法的额外精通（与页面 `updateLoadout` 同口径）。
     * @param side 协战位
     * @param value 角色 id（"-" 表示清空）
     */
    function setTeamChar(side: TeamSide, value: TranscendTeamFacadeValue): void {
        const loadout = settings.value[side]
        const charId = toOptionalId(value)
        if (loadout.charId === charId) return
        loadout.charId = charId
        loadout.baseName = ""
        loadout.enabled = charId > 0
        if (loadout.extraMastery && !getTranscendExtraMasteryOptions(charId).includes(loadout.extraMastery)) {
            loadout.extraMastery = ""
        }
        builds[side] = { build: "-", variant: "A" }
        onChange()
    }

    /**
     * 写入协战武器：按武器类型写近战 / 远程槽并清空另一槽；"-" 表示两个槽都清空。
     * 等级 / 精炼沿用该槽当前值（TeamEditor 只选武器类型）。
     * @param side 协战位
     * @param value 武器 id（"-" 表示清空）
     */
    function setTeamWeapon(side: TeamSide, value: TranscendTeamFacadeValue): void {
        const loadout = settings.value[side]
        const weaponId = toOptionalId(value)
        if (weaponId <= 0) {
            if (loadout.meleeWeapon === 0 && loadout.rangedWeapon === 0) return
            loadout.meleeWeapon = 0
            loadout.rangedWeapon = 0
            onChange()
            return
        }
        const melee = isMeleeWeapon(weaponId)
        const nextMelee = melee ? weaponId : 0
        const nextRanged = melee ? 0 : weaponId
        if (loadout.meleeWeapon === nextMelee && loadout.rangedWeapon === nextRanged) return
        loadout.meleeWeapon = nextMelee
        loadout.rangedWeapon = nextRanged
        onChange()
    }

    /**
     * 读取协战单武器槽的当前值（近战优先；两槽都空时为 "-"）。
     * @param side 协战位
     * @returns 武器 id 或 "-"
     */
    function readTeamWeapon(side: TeamSide): TranscendTeamFacadeValue {
        const loadout = settings.value[side]
        const weaponId = loadout.meleeWeapon || loadout.rangedWeapon
        return weaponId > 0 ? weaponId : "-"
    }

    return {
        get team1() {
            return settings.value.assist1.charId || "-"
        },
        set team1(value) {
            setTeamChar("assist1", value)
        },
        get team1Weapon() {
            return readTeamWeapon("assist1")
        },
        set team1Weapon(value) {
            setTeamWeapon("assist1", value)
        },
        get team1Build() {
            return builds.assist1.build
        },
        set team1Build(value) {
            builds.assist1.build = typeof value === "string" && value ? value : "-"
        },
        get team1BuildVariant() {
            return builds.assist1.variant
        },
        set team1BuildVariant(value) {
            builds.assist1.variant = value === "B" || value === "C" ? value : "A"
        },
        get team2() {
            return settings.value.assist2.charId || "-"
        },
        set team2(value) {
            setTeamChar("assist2", value)
        },
        get team2Weapon() {
            return readTeamWeapon("assist2")
        },
        set team2Weapon(value) {
            setTeamWeapon("assist2", value)
        },
        get team2Build() {
            return builds.assist2.build
        },
        set team2Build(value) {
            builds.assist2.build = typeof value === "string" && value ? value : "-"
        },
        get team2BuildVariant() {
            return builds.assist2.variant
        },
        set team2BuildVariant(value) {
            builds.assist2.variant = value === "B" || value === "C" ? value : "A"
        },
        get petId() {
            return settings.value.petId
        },
        set petId(value) {
            const id = toOptionalId(value)
            if (settings.value.petId === id) return
            settings.value.petId = id
            onChange()
        },
        get petLevel() {
            return settings.value.petLevel
        },
        set petLevel(value) {
            const level = Math.max(0, Math.min(PET_BREAKTHROUGH_MAX_LEVEL, Math.round(Number(value) || 0)))
            if (settings.value.petLevel === level) return
            settings.value.petLevel = level
            onChange()
        },
        get petCoverage() {
            return settings.value.petCoverage
        },
        set petCoverage(value) {
            const coverage = Math.max(0, Math.min(1, Number(value) || 0))
            if (settings.value.petCoverage === coverage) return
            settings.value.petCoverage = coverage
            onChange()
        },
        get petAutoCoverage() {
            return settings.value.petAutoCoverage
        },
        set petAutoCoverage(value) {
            const enabled = value !== false
            if (settings.value.petAutoCoverage === enabled) return
            settings.value.petAutoCoverage = enabled
            onChange()
        },
        get traits() {
            return settings.value.traits
        },
        set traits(value) {
            settings.value.traits = Array.from({ length: TRAIT_SLOT_COUNT }, (_, index) => {
                const slot = value?.[index]
                return Array.isArray(slot) ? ([slot[0], slot[1]] as [number, number]) : null
            })
            onChange()
        },
        get customBuff() {
            return settings.value.customBuff
        },
        set customBuff(value) {
            settings.value.customBuff = (Array.isArray(value) ? value : []).map(
                ([property, amount]) => [property, amount] as [string, number]
            )
            onChange()
        },
    }
}
