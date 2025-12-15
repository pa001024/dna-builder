import { useLocalStorage } from "@vueuse/core"
import { computed, Ref } from "vue"

export const useCharSettings = (charNameRef: Ref<string>) => {
    const defaultCharSettings = {
        charLevel: 80,
        baseName: "",
        hpPercent: 1,
        resonanceGain: 0,
        enemyType: "small",
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
        imbalance: true,
        charMods: Array(8).fill(null) as ([number, number] | null)[],
        meleeMods: Array(8).fill(null) as ([number, number] | null)[],
        rangedMods: Array(8).fill(null) as ([number, number] | null)[],
        skillWeaponMods: Array(4).fill(null) as ([number, number] | null)[],
        buffs: [] as [string, number][],
    }
    const charSettingsKey = computed(() => `build.${charNameRef.value}`)
    const charSettings = useLocalStorage(charSettingsKey, defaultCharSettings)
    return charSettings
}
