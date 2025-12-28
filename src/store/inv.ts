import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { LeveledModWithCount, LeveledWeapon, modData, modMap, ModTypeKey, ModTypeMap, weaponData } from "../data"

export const useInvStore = defineStore("inv", {
    state: () => {
        return {
            meleeWeapons: useLocalStorage("inv.meleeWeapons", {} as Record<string, number>),
            rangedWeapons: useLocalStorage("inv.rangedWeapons", {} as Record<string, number>),
            enableWeapons: useLocalStorage("inv.enableWeapon", {
                近战: false,
                远程: false,
            }),
            mods: useLocalStorage("inv.mods", {} as Record<number, [number, number]>),
            enableMods: useLocalStorage("inv.enableMod", {
                金: false,
                紫: false,
                蓝: false,
                绿: false,
                白: false,
            }),
            buffLv: useLocalStorage("inv.buffLv", {} as Record<number | string, number>),
        }
    },
    getters: {
        weapons: (state) => ({
            ...state.meleeWeapons,
            ...state.rangedWeapons,
        }),
    },
    actions: {
        setWeaponRefineLv(weaponName: string, lv: number) {
            if (weaponName in this.meleeWeapons) this.meleeWeapons[weaponName] = lv
            else if (weaponName in this.rangedWeapons) this.rangedWeapons[weaponName] = lv
        },
        getBuffLv(modId: number | string) {
            if (typeof modId === "number") modId = modMap.get(modId)?.名称 || modId
            if (!(modId in this.buffLv)) return 0
            return this.buffLv[modId] || 0
        },
        setBuffLv(modId: number | string, lv: number) {
            if (typeof modId === "number") modId = modMap.get(modId)?.名称 || modId
            if (lv <= 0) delete this.buffLv[modId]
            else this.buffLv[modId] = lv
        },
        getModLv(modId: number, quality?: string) {
            if (!quality) quality = modMap.get(modId)?.品质 || "白"
            if (!this.enableMods[quality as keyof typeof this.enableMods]) return undefined
            return this.mods[modId]?.[0] || undefined
        },
        getModCount(modId: number, quality?: string) {
            if (!quality) quality = modMap.get(modId)?.品质 || "白"
            if (!this.enableMods[quality as keyof typeof this.enableMods]) return 8
            return this.mods[modId]?.[1] || 0
        },
        getModsWithCount(useInv: boolean, includeTypes: ModTypeKey[]) {
            const types = new Set(includeTypes.map((type) => ModTypeMap[type] as string))
            const all = modData.filter((mod) => types.has(mod.类型.substring(0, 2)))
            const noInv = useInv ? all.filter((mod) => !this.enableMods[mod.品质 as keyof typeof this.enableMods]) : all

            const invMods = useInv
                ? (Object.entries(this.mods)
                      .map(([modId, [lv, count]]) => {
                          try {
                              const mc = new LeveledModWithCount(Number(modId), lv, this.getBuffLv(Number(modId)), count)
                              return mc
                          } catch (error) {
                              return undefined
                          }
                      })
                      .filter((mod) => mod && this.enableMods[mod.品质 as keyof typeof this.enableMods]) as LeveledModWithCount[])
                : []

            return [...noInv.map((mod) => new LeveledModWithCount(mod, undefined, this.getBuffLv(mod.id), 8)), ...invMods]
        },
        getMeleeWeapons(useInv: boolean) {
            return useInv && this.enableWeapons.近战
                ? Object.entries(this.meleeWeapons).map(([name, level]) => new LeveledWeapon(name, level, undefined, this.getBuffLv(name)))
                : weaponData
                      .filter((weapon) => weapon.类型 === "近战")
                      .map((weapon) => new LeveledWeapon(weapon.名称, undefined, undefined, this.getBuffLv(weapon.名称)))
        },
        getRangedWeapons(useInv: boolean) {
            return useInv && this.enableWeapons.远程
                ? Object.entries(this.rangedWeapons).map(([name, level]) => new LeveledWeapon(name, level, undefined, this.getBuffLv(name)))
                : weaponData
                      .filter((weapon) => weapon.类型 === "远程")
                      .map((weapon) => new LeveledWeapon(weapon.名称, undefined, undefined, this.getBuffLv(weapon.名称)))
        },
    },
})
