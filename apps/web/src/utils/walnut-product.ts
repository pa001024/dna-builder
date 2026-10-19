import { formatModName, LeveledChar, LeveledMod, LeveledWeaponHelper } from "@/data"
import { charFragmentMap, modMap, resourceMap, weaponMap } from "@/data/d"
import type { Resource } from "@/data/d/resource.data"
import type { Walnut } from "@/data/d/walnut.data"
import type { Char, Mod, Weapon } from "@/data/data-types"
import { getRarityGradientClass } from "@/utils/rarity-utils"

/** 密函成品类型：魔之楔 / 武器 / 角色 / 资源（兜底） */
export type WalnutProductKind = "Mod" | "Weapon" | "Char" | "Resource"

export interface WalnutProduct {
    kind: WalnutProductKind
    /** 成品图标地址 */
    icon: string
    /** 图标底色：成品品质对应的稀有度渐变（参考魔之楔列表） */
    bg: string
    /** 成品详情页路由，无对应页面时为 null */
    link: string | null
    mod: Mod | null
    weapon: Weapon | null
    char: Char | null
    resource: Resource | null
}

const EMPTY_ICON = "/imgs/webp/T_Head_Empty.webp"

/**
 * 解析密函的首个奖励（成品）：角色密函的思绪片段反查角色，
 * 武器 / 魔之楔密函直接取武器 / 魔之楔表，查不到时退回资源。
 * @param walnut 密函数据
 * @returns 成品信息（含图标、底色、跳转链接）
 */
export function getWalnutProduct(walnut: Walnut): WalnutProduct {
    const reward = walnut.奖励[0]
    if (!reward) {
        return {
            kind: "Resource",
            icon: EMPTY_ICON,
            bg: getRarityGradientClass(1),
            link: null,
            mod: null,
            weapon: null,
            char: null,
            resource: null,
        }
    }

    if (reward.type === "Mod") {
        const mod = modMap.get(reward.id) ?? null
        return {
            kind: "Mod",
            icon: LeveledMod.url(mod?.icon),
            bg: getRarityGradientClass(mod?.品质 ?? 1),
            link: mod ? `/db/mod/${mod.id}` : null,
            mod,
            weapon: null,
            char: null,
            resource: null,
        }
    }

    if (reward.type === "Weapon") {
        const weapon = weaponMap.get(reward.id) ?? null
        return {
            kind: "Weapon",
            icon: LeveledWeaponHelper.idToUrl(weapon?.id ?? reward.id),
            bg: getRarityGradientClass(5),
            link: weapon ? `/db/weapon/${weapon.id}` : null,
            mod: null,
            weapon,
            char: null,
            resource: null,
        }
    }

    if (reward.type === "Resource") {
        // 角色密函的成品是角色本身，用思绪片段 ID 反查
        const char = charFragmentMap.get(reward.id) ?? null
        if (char) {
            return {
                kind: "Char",
                icon: LeveledChar.url(char.icon),
                bg: getRarityGradientClass(5),
                link: `/db/char/${char.id}`,
                mod: null,
                weapon: null,
                char,
                resource: null,
            }
        }
        const resource = resourceMap.get(reward.id) ?? null
        return {
            kind: "Resource",
            icon: resource?.icon ? `/imgs/res/${resource.icon}.webp` : EMPTY_ICON,
            bg: getRarityGradientClass(resource?.rarity ?? 1),
            link: resource ? `/db/resource/${resource.id}` : null,
            mod: null,
            weapon: null,
            char: null,
            resource,
        }
    }

    return {
        kind: "Resource",
        icon: EMPTY_ICON,
        bg: getRarityGradientClass(1),
        link: null,
        mod: null,
        weapon: null,
        char: null,
        resource: null,
    }
}

/**
 * 单个奖励的展示名（游戏原文，未翻译）：自带 name 直接用，缺失时按 id 反查对应表。
 * 密函模拟的计数键与奖励表展示都走它，避免 `undefined` 键与 `endsWith` 崩溃。
 * @param reward 奖励项
 * @returns 游戏原文名，查不到时退回 `#id`
 */
export function getWalnutRewardName(reward: Walnut["奖励"][number]): string {
    if (reward.name) {
        return reward.name
    }

    if (reward.type === "Mod") {
        const mod = modMap.get(reward.id)
        if (mod) {
            return mod.名称
        }
    }

    if (reward.type === "Weapon") {
        const weapon = weaponMap.get(reward.id)
        if (weapon) {
            return weapon.名称
        }
    }

    if (reward.type === "Resource") {
        const resource = resourceMap.get(reward.id)
        if (resource) {
            return resource.name
        }
    }

    return `#${reward.id}`
}

/**
 * 成品展示名（魔之楔走系列+名称口径，其余直接取游戏原文）。
 * @param product 成品信息
 * @param t 翻译函数（模板里直接传 `$t`）
 * @returns 展示名
 */
export function getWalnutProductName(product: WalnutProduct, t: (key: string) => string): string {
    if (product.mod) {
        return formatModName(product.mod.系列, product.mod.名称, t)
    }
    if (product.weapon) {
        return t(product.weapon.名称)
    }
    if (product.char) {
        return t(product.char.名称)
    }
    if (product.resource) {
        return t(product.resource.name)
    }
    return ""
}
