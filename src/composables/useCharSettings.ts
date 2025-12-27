import { useLocalStorage } from "@vueuse/core"
import { computed, Ref } from "vue"

export const defaultCharSettings = {
    charLevel: 80,
    baseName: "",
    hpPercent: 1,
    resonanceGain: 3,
    enemyDef: 130,
    enemyLevel: 80,
    enemyResistance: 0,
    enemyHpType: "生命",
    targetFunction: "伤害",
    charSkillLevel: 10,
    meleeWeapon: "枯朽",
    meleeWeaponLevel: 80,
    meleeWeaponRefine: 5,
    rangedWeapon: "剥离",
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
}
export const useCharSettings = (charNameRef: Ref<string>) => {
    const charSettingsKey = computed(() => `build.${charNameRef.value}`)
    const charSettings = useLocalStorage(charSettingsKey, defaultCharSettings)
    Object.keys(defaultCharSettings).forEach((key) => {
        const keyType = key as keyof typeof defaultCharSettings
        if (!(keyType in charSettings.value)) {
            // @ts-ignore
            charSettings.value[keyType] = defaultCharSettings[keyType]
        }
    })
    return charSettings
}
