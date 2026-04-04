import { charMap, petMap, weaponMap } from "@/data"

export interface AbyssBestTimeVo1 {
    charIcon?: string
    closeWeaponIcon?: string
    langRangeWeaponIcon?: string
    petIcon?: string
    phantomCharIcon1?: string
    phantomCharIcon2?: string
    phantomWeaponIcon1?: string
    phantomWeaponIcon2?: string
}

export interface AbyssBestTimeIds {
    charId: number | null
    meleeId: number | null
    rangedId: number | null
    petId: number | null
    support1: number | null
    supportWeapon1: number | null
    support2: number | null
    supportWeapon2: number | null
}

interface SupportSlot {
    charId: number | null
    weaponId: number | null
}

/**
 * 从深渊头像 URL 中提取资源标识。
 * @param url 图片 URL
 * @returns 资源标识
 */
function extractAbyssIconName(url?: string): string {
    if (!url) {
        return ""
    }

    const match = url.match(/Head_(.+?)\.png(?:\?.*)?$/i)
    if (!match?.[1]) {
        return ""
    }

    let icon = match[1].replace(/^Pet_/, "")
    if (icon === "Bow_Lieyan") {
        icon = "Bow_Shashi"
    } else if (icon === "Bow_hugaung") {
        icon = "Bow_Huguang"
    }

    return icon
}

/**
 * 按数据表中的 icon 字段生成反查表。
 * @param items 可迭代数据项
 * @returns icon 到 id 的映射
 */
function buildIconIdMap<T extends { id: number; icon?: string }>(items: Iterable<T>): Map<string, number> {
    const map = new Map<string, number>()
    for (const item of items) {
        if (!item.icon) {
            continue
        }
        map.set(item.icon, item.id)
    }
    map.set("Nanzhu", 160101)
    return map
}

const charIconIdMap = buildIconIdMap(charMap.values())
const weaponIconIdMap = buildIconIdMap(weaponMap.values())
const petIconIdMap = buildIconIdMap(petMap.values())

/**
 * 反查深渊最佳阵容图片 URL 对应的上传 ID。
 * @param bestTimeVo1 深渊最佳阵容图标对象
 * @returns 可直接上传的结构化 ID 数据
 */
export function parseAbyssBestTimeVo1(bestTimeVo1?: AbyssBestTimeVo1 | null): AbyssBestTimeIds {
    const supportSlots: SupportSlot[] = [
        {
            charId: charIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomCharIcon1)) ?? null,
            weaponId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomWeaponIcon1)) ?? null,
        },
        {
            charId: charIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomCharIcon2)) ?? null,
            weaponId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomWeaponIcon2)) ?? null,
        },
    ]

    supportSlots.sort((left, right) => {
        const leftChar = left.charId ?? Number.POSITIVE_INFINITY
        const rightChar = right.charId ?? Number.POSITIVE_INFINITY
        if (leftChar !== rightChar) {
            return leftChar - rightChar
        }

        const leftWeapon = left.weaponId ?? Number.POSITIVE_INFINITY
        const rightWeapon = right.weaponId ?? Number.POSITIVE_INFINITY
        return leftWeapon - rightWeapon
    })

    return {
        charId: charIconIdMap.get(extractAbyssIconName(bestTimeVo1?.charIcon)) ?? null,
        meleeId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.closeWeaponIcon)) ?? null,
        rangedId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.langRangeWeaponIcon)) ?? null,
        petId: petIconIdMap.get(extractAbyssIconName(bestTimeVo1?.petIcon)) ?? null,
        support1: supportSlots[0]?.charId ?? null,
        supportWeapon1: supportSlots[0]?.weaponId ?? null,
        support2: supportSlots[1]?.charId ?? null,
        supportWeapon2: supportSlots[1]?.weaponId ?? null,
    }
}
