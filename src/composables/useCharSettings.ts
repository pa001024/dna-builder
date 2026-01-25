import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"

export const defaultCharSettings = {
    charLevel: 80,
    baseName: "",
    hpPercent: 1,
    resonanceGain: 3,
    enemyId: 130,
    enemyLevel: 80,
    enemyResistance: 0,
    isRouge: false,
    targetFunction: "",
    charSkillLevel: 10,
    meleeWeapon: 10206, //"枯朽",
    meleeWeaponLevel: 80,
    meleeWeaponRefine: 5,
    rangedWeapon: 20102, //"剥离",
    rangedWeaponLevel: 80,
    rangedWeaponRefine: 5,
    auraMod: 31524, // 警惕
    imbalance: false,
    charMods: Array(8).fill(null) as ([number, number] | null)[],
    meleeMods: Array(8).fill(null) as ([number, number] | null)[],
    rangedMods: Array(8).fill(null) as ([number, number] | null)[],
    skillWeaponMods: Array(4).fill(null) as ([number, number] | null)[],
    buffs: [] as [string, number][],
    team1: "-",
    team1Weapon: "-",
    team2: "-",
    team2Weapon: "-",
    timelineDPS: false,
    actions: {
        enable: false,
        i: [],
        b: [],
        hp: [],
        bgs: [],
    } as InlineActions,
}

export interface NormalActions {
    /** 表达式 */
    s: string
    /** 延迟 */
    d: number
    /** 重复次数 */
    t?: number
    /** buff组索引 */
    b?: number | "-"
}

export interface BackgroundActions {
    /** 表达式 */
    s: string
    /** 间隔 */
    i: number
    /** 重复次数 */
    t?: number
    /** 延迟 */
    d?: number
    /** buff组索引 */
    b?: number | "-"
}
export interface InlineActions {
    /** 是否启用内联动作 */
    enable: boolean
    /** 动作 */
    i: NormalActions[]
    /** 背景动作 */
    b: BackgroundActions[]
    /** 血量 */
    hp: [number, number][]
    /** buff组 */
    bgs: [string, number][][]
}

export type CharSettings = typeof defaultCharSettings

export const useCharSettings = (charNameRef?: Ref<string>) => {
    const charSettingsKey = computed(() => `build.${(charNameRef || useLocalStorage("selectedChar", "赛琪")).value}`)
    const charSettings = useLocalStorage(charSettingsKey, defaultCharSettings)
    Object.keys(defaultCharSettings).forEach(key => {
        const keyType = key as keyof typeof defaultCharSettings

        if (!(keyType in charSettings.value) || typeof charSettings.value[keyType] !== typeof defaultCharSettings[keyType]) {
            // @ts-expect-error 类型“CharSettings”上不存在属性“keyType”
            charSettings.value[keyType] = defaultCharSettings[keyType]
        }
    })
    return charSettings
}
