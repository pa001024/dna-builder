import { useLocalStorage } from "@vueuse/core"
import { computed } from "vue"
import type { CharLevelUpConfig, ModLevelUpConfig, WeaponLevelUpConfig } from "@/utils/LevelUpCalculator"

/** 角色养成计划项（localStorage lvup.chars 的单条结构） */
export interface CharPlanItem {
    id: number
    config: CharLevelUpConfig
}

/** 武器养成计划项（localStorage lvup.weapons 的单条结构） */
export interface WeaponPlanItem {
    id: number
    config: WeaponLevelUpConfig
}

/** 魔之楔养成计划项（localStorage lvup.mods 的单条结构） */
export interface ModPlanItem {
    id: number
    config: ModLevelUpConfig
}

/** 养成目标种类：角色 / 武器 / 魔之楔 */
export type LevelUpPlanKind = "char" | "weapon" | "mod"

/** 模块级单例：同一页内所有引用方共享同一 ref，按钮写入后计算器即时可见 */
const chars = useLocalStorage<CharPlanItem[]>("lvup.chars", [])
const weapons = useLocalStorage<WeaponPlanItem[]>("lvup.weapons", [])
const mods = useLocalStorage<ModPlanItem[]>("lvup.mods", [])

/**
 * 角色默认养成配置：1→80 级，技能 1→10。
 * @returns 角色默认配置
 */
export function createDefaultCharConfig(): CharLevelUpConfig {
    return {
        currentLevel: 1,
        targetLevel: 80,
        extraMastery: [],
        skills: [
            { currentLevel: 1, targetLevel: 10 },
            { currentLevel: 1, targetLevel: 10 },
            { currentLevel: 1, targetLevel: 10 },
        ],
    }
}

/**
 * 武器默认养成配置：1→80 级，熔炼 0→5。
 * @returns 武器默认配置
 */
export function createDefaultWeaponConfig(): WeaponLevelUpConfig {
    return {
        currentLevel: 1,
        targetLevel: 80,
        currentRefine: 0,
        targetRefine: 5,
    }
}

/**
 * 魔之楔默认养成配置：1→10 级。
 * @param count 件数
 * @returns 魔之楔默认配置
 */
export function createDefaultModConfig(count = 1): ModLevelUpConfig {
    return {
        currentLevel: 1,
        targetLevel: 10,
        count,
    }
}

/**
 * 养成计划共享状态：与养成计算器同 key，直接读写同一份 localStorage。
 * @returns 计划列表、判重与增删方法
 */
export function useLevelUpPlan() {
    const totalCount = computed(() => chars.value.length + weapons.value.length + mods.value.length)

    function hasChar(id: number) {
        return chars.value.some(item => item.id === id)
    }

    function hasWeapon(id: number) {
        return weapons.value.some(item => item.id === id)
    }

    function hasMod(id: number) {
        return mods.value.some(item => item.id === id)
    }

    /**
     * 添加角色到养成计划，已存在时不重复添加。
     * @param id 角色 id
     * @returns 是否新添加
     */
    function addChar(id: number) {
        if (hasChar(id)) return false
        chars.value.push({ id, config: createDefaultCharConfig() })
        return true
    }

    /**
     * 添加武器到养成计划，已存在时不重复添加。
     * @param id 武器 id
     * @returns 是否新添加
     */
    function addWeapon(id: number) {
        if (hasWeapon(id)) return false
        weapons.value.push({ id, config: createDefaultWeaponConfig() })
        return true
    }

    /**
     * 添加魔之楔到养成计划，已存在时不重复添加。
     * @param id 魔之楔 id
     * @param count 件数
     * @returns 是否新添加
     */
    function addMod(id: number, count = 1) {
        if (hasMod(id)) return false
        mods.value.push({ id, config: createDefaultModConfig(count) })
        return true
    }

    /**
     * 按种类与 id 通用添加。
     * @param kind 目标种类
     * @param id 数据 id
     * @param count 魔之楔件数
     * @returns 是否新添加
     */
    function add(kind: LevelUpPlanKind, id: number, count = 1) {
        if (kind === "char") return addChar(id)
        if (kind === "weapon") return addWeapon(id)
        return addMod(id, count)
    }

    /**
     * 按种类与 id 通用判重。
     * @param kind 目标种类
     * @param id 数据 id
     * @returns 是否已在计划中
     */
    function has(kind: LevelUpPlanKind, id: number) {
        if (kind === "char") return hasChar(id)
        if (kind === "weapon") return hasWeapon(id)
        return hasMod(id)
    }

    /**
     * 从养成计划移除角色。
     * @param id 角色 id
     * @returns 是否确实移除了一项
     */
    function removeChar(id: number) {
        const index = chars.value.findIndex(item => item.id === id)
        if (index < 0) return false
        chars.value.splice(index, 1)
        return true
    }

    /**
     * 从养成计划移除武器。
     * @param id 武器 id
     * @returns 是否确实移除了一项
     */
    function removeWeapon(id: number) {
        const index = weapons.value.findIndex(item => item.id === id)
        if (index < 0) return false
        weapons.value.splice(index, 1)
        return true
    }

    /**
     * 从养成计划移除魔之楔。
     * @param id 魔之楔 id
     * @returns 是否确实移除了一项
     */
    function removeMod(id: number) {
        const index = mods.value.findIndex(item => item.id === id)
        if (index < 0) return false
        mods.value.splice(index, 1)
        return true
    }

    /**
     * 按种类与 id 通用移除。
     * @param kind 目标种类
     * @param id 数据 id
     * @returns 是否确实移除了一项
     */
    function remove(kind: LevelUpPlanKind, id: number) {
        if (kind === "char") return removeChar(id)
        if (kind === "weapon") return removeWeapon(id)
        return removeMod(id)
    }

    return {
        add,
        addChar,
        addMod,
        addWeapon,
        chars,
        has,
        hasChar,
        hasMod,
        hasWeapon,
        mods,
        remove,
        removeChar,
        removeMod,
        removeWeapon,
        totalCount,
        weapons,
    }
}
