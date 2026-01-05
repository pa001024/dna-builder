import { useLocalStorage } from "@vueuse/core"
import { computed, Ref } from "vue"

export const defaultCharSettings = {
    charLevel: 80,
    baseName: "",
    hpPercent: 1,
    resonanceGain: 3,
    enemyId: 1001001,
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
}
export type CharSettings = typeof defaultCharSettings

/**
 * 字段索引映射(用于序列化)
 * 0:charLevel 1:baseName 2:hpPercent 3:resonanceGain 4:enemyId
 * 5:enemyLevel 6:enemyResistance 7:isRouge 8:targetFunction 9:charSkillLevel
 * 10:meleeWeapon 11:meleeWeaponLevel 12:meleeWeaponRefine
 * 13:rangedWeapon 14:rangedWeaponLevel 15:rangedWeaponRefine
 * 16:auraMod 17:imbalance
 * 18:charMods 19:meleeMods 20:rangedMods 21:skillWeaponMods
 * 22:buffs 23:team1 24:team1Weapon 25:team2 26:team2Weapon
 */

/**
 * Base62 编码字符集 (0-9, a-z, A-Z)
 */
const BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

/**
 * 将数字编码为 base62 字符串
 */
function encodeBase62(num: number): string {
    if (num === 0) return "0"
    let result = ""
    let n = Math.abs(num)
    while (n > 0) {
        result = BASE62_CHARS[n % 62] + result
        n = Math.floor(n / 62)
    }
    return num < 0 ? `-${result}` : result
}

/**
 * 将 base62 字符串解码为数字
 */
function decodeBase62(str: string): number {
    const isNegative = str.startsWith("-")
    const s = isNegative ? str.slice(1) : str
    let result = 0
    for (let i = 0; i < s.length; i++) {
        const charIndex = BASE62_CHARS.indexOf(s[i])
        if (charIndex === -1) {
            throw new Error(`Invalid base62 character: ${s[i]}`)
        }
        result = result * 62 + charIndex
    }
    return isNegative ? -result : result
}

/**
 * 将CharSettings序列化为压缩的URL字符串
 * 格式: index1:value1,index2:value2,...
 * 数组: [id1,lv1]_[id2,lv2] (null用_表示)
 * buffs: name1^val1_name2^val2
 */
export function serializeCharSettings(settings: Partial<CharSettings>): string {
    const parts: string[] = []

    // 将设置转为数组以便按索引处理
    const entries: (string | number | boolean | null | any[] | undefined)[] = [
        settings.charLevel,
        settings.baseName,
        settings.hpPercent,
        settings.resonanceGain,
        settings.enemyId,
        settings.enemyLevel,
        settings.enemyResistance,
        settings.isRouge,
        settings.targetFunction,
        settings.charSkillLevel,
        settings.meleeWeapon,
        settings.meleeWeaponLevel,
        settings.meleeWeaponRefine,
        settings.rangedWeapon,
        settings.rangedWeaponLevel,
        settings.rangedWeaponRefine,
        settings.auraMod,
        settings.imbalance,
        settings.charMods,
        settings.meleeMods,
        settings.rangedMods,
        settings.skillWeaponMods,
        settings.buffs,
        settings.team1,
        settings.team1Weapon,
        settings.team2,
        settings.team2Weapon,
    ]

    entries.forEach((val, idx) => {
        if (val === undefined) return

        let encodedVal: string
        if (val === null) {
            encodedVal = "n"
        } else if (typeof val === "boolean") {
            encodedVal = val ? "1" : "0"
        } else if (typeof val === "number") {
            encodedVal = encodeBase62(val)
        } else if (typeof val === "string") {
            encodedVal = val === "" ? "" : encodeURIComponent(val)
        } else if (Array.isArray(val)) {
            // 处理数组
            if (val.length === 0) {
                encodedVal = "e"
            } else {
                encodedVal = val
                    .map((item) => {
                        if (item === null) return "_"
                        if (Array.isArray(item)) {
                            return `${item[0]}.${item[1]}`
                        }
                        return item.toString()
                    })
                    .join("_")
            }
        } else {
            return // 跳过未知类型
        }

        // 使用base62编码索引以节省空间
        parts.push(`${encodeBase62(idx)}:${encodedVal}`)
    })

    return parts.join(",")
}

/**
 * 从URL字符串反序列化为CharSettings
 */
export function deserializeCharSettings(str: string): Partial<CharSettings> {
    const settings: Partial<CharSettings> = {}

    if (!str) return settings

    const parts = str.split(",")
    for (const part of parts) {
        const [idxStr, val] = part.split(":")
        if (!idxStr || val === undefined) continue

        const idx = decodeBase62(idxStr)

        switch (idx) {
            case 0: // charLevel
                settings.charLevel = decodeBase62(val)
                break
            case 1: // baseName
                settings.baseName = val === "" ? "" : decodeURIComponent(val)
                break
            case 2: // hpPercent
                settings.hpPercent = parseFloat(val)
                break
            case 3: // resonanceGain
                settings.resonanceGain = decodeBase62(val)
                break
            case 4: // enemyId
                settings.enemyId = decodeBase62(val)
                break
            case 5: // enemyLevel
                settings.enemyLevel = decodeBase62(val)
                break
            case 6: // enemyResistance
                settings.enemyResistance = decodeBase62(val)
                break
            case 7: // isRouge
                settings.isRouge = val === "1"
                break
            case 8: // targetFunction
                settings.targetFunction = val === "" ? "" : decodeURIComponent(val)
                break
            case 9: // charSkillLevel
                settings.charSkillLevel = decodeBase62(val)
                break
            case 10: // meleeWeapon
                settings.meleeWeapon = decodeBase62(val)
                break
            case 11: // meleeWeaponLevel
                settings.meleeWeaponLevel = decodeBase62(val)
                break
            case 12: // meleeWeaponRefine
                settings.meleeWeaponRefine = decodeBase62(val)
                break
            case 13: // rangedWeapon
                settings.rangedWeapon = decodeBase62(val)
                break
            case 14: // rangedWeaponLevel
                settings.rangedWeaponLevel = decodeBase62(val)
                break
            case 15: // rangedWeaponRefine
                settings.rangedWeaponRefine = decodeBase62(val)
                break
            case 16: // auraMod
                settings.auraMod = decodeBase62(val)
                break
            case 17: // imbalance
                settings.imbalance = val === "1"
                break
            case 18: // charMods
                settings.charMods =
                    val === "e"
                        ? []
                        : val.split("_").map((v) => {
                              if (v === "_") return null
                              const [id, lv] = v.split(".")
                              return [decodeBase62(id), decodeBase62(lv)] as [number, number]
                          })
                break
            case 19: // meleeMods
                settings.meleeMods =
                    val === "e"
                        ? []
                        : val.split("_").map((v) => {
                              if (v === "_") return null
                              const [id, lv] = v.split(".")
                              return [decodeBase62(id), decodeBase62(lv)] as [number, number]
                          })
                break
            case 20: // rangedMods
                settings.rangedMods =
                    val === "e"
                        ? []
                        : val.split("_").map((v) => {
                              if (v === "_") return null
                              const [id, lv] = v.split(".")
                              return [decodeBase62(id), decodeBase62(lv)] as [number, number]
                          })
                break
            case 21: // skillWeaponMods
                settings.skillWeaponMods =
                    val === "e"
                        ? []
                        : val.split("_").map((v) => {
                              if (v === "_") return null
                              const [id, lv] = v.split(".")
                              return [decodeBase62(id), decodeBase62(lv)] as [number, number]
                          })
                break
            case 22: // buffs
                settings.buffs =
                    val === "e"
                        ? []
                        : val.split("_").map((v) => {
                              const [name, valStr] = v.split("^")
                              return [name, parseFloat(valStr)] as [string, number]
                          })
                break
            case 23: // team1
                settings.team1 = val === "" ? "" : decodeURIComponent(val)
                break
            case 24: // team1Weapon
                settings.team1Weapon = val === "" ? "" : decodeURIComponent(val)
                break
            case 25: // team2
                settings.team2 = val === "" ? "" : decodeURIComponent(val)
                break
            case 26: // team2Weapon
                settings.team2Weapon = val === "" ? "" : decodeURIComponent(val)
                break
        }
    }

    return settings
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
