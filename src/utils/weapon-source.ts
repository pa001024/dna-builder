import { draftMap, weaponMap } from "../data/d"
import { getHardBossDetail, hardBossMap } from "../data/d/hardboss.data"
import type { ShopItem } from "../data/d/shop.data"
import shopData from "../data/d/shop.data"
import { walnutMap } from "../data/d/walnut.data"
import type { Weapon } from "../data/data-types"
import { LeveledWeapon } from "../data/leveled/LeveledWeapon"
import type { RewardItem } from "./reward-utils"
import { getRewardDetails } from "./reward-utils"

export type WeaponSourceType = "hardboss" | "shop"

export interface ShopSourceInfo {
    key: string
    itemId: number
    shopId: string
    subTabId: number
    detail: string
    shopName: string
    price: number
    priceName: string
    num: number
    limit?: number
    timeStart?: number
    timeEnd?: number
}

export interface WeaponHardbossSourceInfo {
    key: string
    type: "hardboss"
    timeStart: number
    timeEnd?: number
    hardbossName?: string
    hardbossLv?: number
    walnutId?: number
    hardbossId?: number
}

export interface WeaponShopSourceInfo extends ShopSourceInfo {
    type: "shop"
    walnutId?: number
    mainTabId?: number
    mainTabName?: string
    subTabName?: string
    shopIcon?: string
}

export type WeaponSourceInfo = WeaponHardbossSourceInfo | WeaponShopSourceInfo

const walnutWeaponMap = new Map<number, number[]>()
walnutMap.forEach(walnut => {
    walnut.奖励.forEach(reward => {
        if (reward.type !== "Weapon") {
            return
        }

        const ids = walnutWeaponMap.get(reward.id) ?? []
        ids.push(walnut.id)
        walnutWeaponMap.set(reward.id, ids)
    })
})

/**
 * 判断奖励树中是否包含指定目标。
 * @param reward 奖励树节点
 * @param targetId 目标 ID
 * @param targetName 目标名称
 * @returns 是否匹配
 */
function rewardTreeContainsTarget(reward: RewardItem | null, targetId: number, targetName?: string): boolean {
    if (!reward) {
        return false
    }

    if (reward.t !== "Reward" && reward.id === targetId && (targetName === undefined || reward.n === targetName)) {
        return true
    }

    return reward.child?.some(child => rewardTreeContainsTarget(child, targetId, targetName)) ?? false
}

/**
 * 通过武器 ID 获取对应的密函 ID 列表。
 * @param weaponId 武器 ID
 * @returns 密函 ID 列表
 */
function findWalnutIdsByWeaponId(weaponId: number): number[] {
    return walnutWeaponMap.get(weaponId) ?? []
}

/**
 * 通过图纸 ID 获取对应的武器 ID。
 * @param draftId 图纸 ID
 * @returns 武器 ID；若图纸不是武器图纸则返回 null
 */
function findWeaponIdByDraftId(draftId: number): number | null {
    const draft = draftMap.get(draftId)
    if (draft?.t !== "Weapon" || typeof draft.p !== "number") {
        return null
    }

    return draft.p
}

/**
 * 获取单个商品对应的密函 ID。
 * @param item 商品
 * @param weapon 当前武器
 * @returns 密函 ID；若无法归一则返回 undefined
 */
function getItemWalnutId(item: ShopItem, weapon: Weapon): number | undefined {
    if (item.itemType === "Walnut") {
        const walnut = walnutMap.get(item.typeId)
        return walnut?.奖励?.some(reward => reward.id === weapon.id) ? item.typeId : undefined
    }

    if (item.itemType === "Weapon") {
        return item.typeId === weapon.id ? findWalnutIdsByWeaponId(item.typeId)[0] : undefined
    }

    if (item.itemType === "Draft") {
        const weaponId = findWeaponIdByDraftId(item.typeId)
        if (weaponId !== weapon.id) {
            return undefined
        }
        return findWalnutIdsByWeaponId(weaponId)[0]
    }

    return undefined
}

/**
 * 获取商店来源图标。
 * @param walnutId 密函 ID
 * @returns 图标路径
 */
function getShopSourceIcon(walnutId?: number): string {
    if (!walnutId) {
        return "/imgs/webp/T_Head_Empty.webp"
    }

    const walnut = walnutMap.get(walnutId)
    const weaponReward = walnut?.奖励?.find(reward => reward.type === "Weapon")
    if (!weaponReward) {
        return "/imgs/webp/T_Head_Empty.webp"
    }

    return LeveledWeapon.url(weaponMap.get(weaponReward.id)?.icon)
}

/**
 * 找出同一链条下的根商品。
 * @param item 当前商品
 * @param itemMap 商品映射
 * @returns 根商品
 */
function getRootShopItem(item: ShopItem, itemMap: Map<number, ShopItem>): ShopItem {
    const visited = new Set<number>()
    let current = item

    while (typeof current.require === "number") {
        if (visited.has(current.id)) {
            break
        }
        visited.add(current.id)

        const parent = itemMap.get(current.require)
        if (!parent) {
            break
        }
        current = parent
    }

    return current
}

/**
 * 递归解析商品链对应的密函 ID。
 * @param item 当前商品
 * @param childrenMap 子项映射
 * @param weapon 当前武器
 * @param visited 当前路径上已访问的商品 ID
 * @returns 密函 ID；若链条不命中则返回 undefined
 */
function resolveChainWalnutId(
    item: ShopItem,
    childrenMap: Map<number, ShopItem[]>,
    weapon: Weapon,
    visited: Set<number> = new Set()
): number | undefined {
    if (visited.has(item.id)) {
        return undefined
    }

    visited.add(item.id)
    const ownWalnutId = getItemWalnutId(item, weapon)
    if (ownWalnutId !== undefined) {
        visited.delete(item.id)
        return ownWalnutId
    }

    const children = childrenMap.get(item.id) ?? []
    for (const child of children) {
        const resolvedWalnutId = resolveChainWalnutId(child, childrenMap, weapon, visited)
        if (resolvedWalnutId !== undefined) {
            visited.delete(item.id)
            return resolvedWalnutId
        }
    }

    visited.delete(item.id)
    return undefined
}

/**
 * 收集武器来源信息。
 * @param weapon 武器数据
 * @returns 来源列表
 */
export function collectWeaponSources(weapon: Weapon): WeaponSourceInfo[] {
    const sources: WeaponSourceInfo[] = []
    const sourceKeySet = new Set<string>()
    const walnutIds = findWalnutIdsByWeaponId(weapon.id)

    hardBossMap.forEach(boss => {
        const bossDetail = getHardBossDetail(boss.id)
        if (!bossDetail) {
            return
        }

        bossDetail.diff.forEach(diff => {
            diff.dr.forEach(dr => {
                const reward = getRewardDetails(dr.RewardView)
                const matchedWalnutId = walnutIds.find(walnutId => rewardTreeContainsTarget(reward, walnutId))
                if (matchedWalnutId === undefined) {
                    return
                }

                walnutIds.forEach(walnutId => {
                    const key = `hardboss-${boss.id}-${diff.id}-${dr.DynamicRewardId}-${dr.Index}-${walnutId}`
                    if (sourceKeySet.has(key)) {
                        return
                    }

                    sourceKeySet.add(key)
                    sources.push({
                        key,
                        type: "hardboss",
                        timeStart: dr.StartTime,
                        timeEnd: dr.EndTime,
                        hardbossName: boss.name,
                        hardbossLv: diff.lv,
                        walnutId,
                        hardbossId: boss.id,
                    })
                })
            })
        })
    })

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                const itemMap = new Map(subTab.items.map(item => [item.id, item]))
                const childrenMap = new Map<number, ShopItem[]>()

                subTab.items.forEach(item => {
                    if (item.require === undefined) {
                        return
                    }

                    const children = childrenMap.get(item.require) ?? []
                    children.push(item)
                    childrenMap.set(item.require, children)
                })

                const rootItems = new Map<number, ShopItem>()
                subTab.items.forEach(item => {
                    const rootItem = getRootShopItem(item, itemMap)
                    if (!rootItems.has(rootItem.id)) {
                        rootItems.set(rootItem.id, rootItem)
                    }
                })

                rootItems.forEach(item => {
                    const walnutId = resolveChainWalnutId(item, childrenMap, weapon)
                    if (walnutId === undefined) {
                        return
                    }
                    if (typeof item.startTime !== "number") {
                        return
                    }

                    const key = `shop-${shop.id}-${mainTab.id}-${subTab.id}-${item.id}-${walnutId}`
                    if (sourceKeySet.has(key)) {
                        return
                    }

                    sourceKeySet.add(key)
                    sources.push({
                        key,
                        type: "shop",
                        timeStart: item.startTime,
                        timeEnd: item.endTime,
                        detail: `${mainTab.name} -> ${subTab.name}`,
                        walnutId,
                        itemId: item.id,
                        shopId: shop.id,
                        shopName: shop.name,
                        mainTabId: mainTab.id,
                        mainTabName: mainTab.name,
                        subTabId: subTab.id,
                        subTabName: subTab.name,
                        price: item.price,
                        priceName: item.priceName,
                        num: item.num,
                        limit: item.limit,
                        shopIcon: getShopSourceIcon(walnutId),
                    })
                })
            })
        })
    })

    return sources.sort((left, right) => {
        if (left.timeStart !== right.timeStart) {
            return (left.timeStart ?? 0) - (right.timeStart ?? 0)
        }

        if (left.type !== right.type) {
            return left.type === "hardboss" ? -1 : 1
        }

        const leftName = left.type === "shop" ? left.detail : (left.hardbossName ?? "")
        const rightName = right.type === "shop" ? right.detail : (right.hardbossName ?? "")
        return leftName.localeCompare(rightName, "zh-CN")
    })
}

/**
 * 格式化武器来源时间范围。
 * @param source 来源信息
 * @param untilNowText “至今”对应文案
 * @returns 时间范围文本
 */
export function formatWeaponSourceTimeRange(source: WeaponSourceInfo, untilNowText = "至今"): string {
    const formatTime = (timestamp: number) =>
        new Date(timestamp * 1000).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        })

    return `${formatTime(source.timeStart ?? 0)}~${source.timeEnd ? formatTime(source.timeEnd) : untilNowText}`
}
