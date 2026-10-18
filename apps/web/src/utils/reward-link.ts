import { draftMap, iconticketMap, petMap, resourceMap, skinMap, walnutMap } from "@/data/d"
import { charAccessoryData, hairData, headFrameData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { titleData } from "@/data/d/title.data"
import { titleFrameData } from "@/data/d/titleframe.data"

/** 可生成资料库详情链接的奖励类型（与 ResourceCostItem / RewardItem 的分支口径一致） */
export type RewardLinkType =
    | "Mod"
    | "Draft"
    | "Pack"
    | "Weapon"
    | "Char"
    | "CharAccessory"
    | "WeaponAccessory"
    | "Walnut"
    | "Resource"
    | "IronTicket"
    | "Skin"
    | "HeadSculpture"
    | "HeadFrame"
    | "Hair"
    | "Title"
    | "TitleFrame"
    | "WeaponSkin"
    | "Pet"

/** 称号 id → 称号数据（与 ResourceCostItem 内联的 titleMap 口径一致） */
const titleLinkMap = new Map(titleData.map(title => [title.id, title]))

/**
 * 归一化条目 id。
 * @param id 原始 id
 * @returns 数值 id；非法时返回 NaN
 */
function normalizeLinkId(id: number | string): number {
    return Number(id)
}

/**
 * 通过设计稿 ID 或产物 ID 查找设计稿。
 * @param draftId 设计稿 ID 或产物 ID
 * @returns 设计稿数据；查不到时返回 undefined
 */
function findDraftByIdOrProductId(draftId: number | string) {
    const normalizedId = normalizeLinkId(draftId)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }
    return draftMap.get(normalizedId) ?? [...draftMap.values()].find(draft => draft.p === normalizedId)
}

/**
 * 通过资源 ID 查找资源信息。
 * @param id 资源 ID
 * @returns 资源数据；查不到时返回 undefined
 */
function findResourceById(id: number | string) {
    const direct = resourceMap.get(id as number)
    if (direct) {
        return direct
    }
    const normalizedId = normalizeLinkId(id)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }
    return [...resourceMap.values()].find(item => item.id === normalizedId)
}

/**
 * 检查时装类条目是否存在（饰品 / 皮肤 / 头像 / 发型 / 武器皮肤 / 称号框）。
 * @param type 时装类型
 * @param id 条目 ID
 * @returns 是否存在
 */
function hasFashionEntry(type: string, id: number | string): boolean {
    const normalizedId = normalizeLinkId(id)
    if (!Number.isFinite(normalizedId)) {
        return false
    }
    if (type === "Skin") {
        return skinMap.has(normalizedId)
    }
    if (type === "HeadSculpture") {
        return headSculptureData.some(entry => entry.id === normalizedId)
    }
    if (type === "HeadFrame") {
        return headFrameData.some(entry => entry.id === normalizedId)
    }
    if (type === "Hair") {
        return hairData.some(entry => entry.id === normalizedId)
    }
    if (type === "WeaponSkin") {
        return weaponSkinData.some(entry => entry.id === normalizedId)
    }
    if (type === "TitleFrame") {
        return titleFrameData.some(entry => entry.id === normalizedId)
    }
    return false
}

/**
 * 获取奖励条目的资料库详情链接（原 ResourceCostItem 内联规则的公共版本）。
 *
 * 映射口径与 ResourceCostItem 模板分支一一对应：Mod / Weapon / Char 恒返回详情页；
 * 其余类型先校验条目存在才返回链接，查不到时返回空串表示无链接。
 * @param type 奖励类型
 * @param id 条目 ID
 * @returns 详情页路由；无对应页面时返回空串
 */
export function getRewardDetailLink(type: RewardLinkType | string, id: number | string): string {
    const normalizedId = normalizeLinkId(id)
    if (type === "Mod") {
        return Number.isFinite(normalizedId) ? `/db/mod/${normalizedId}` : ""
    }
    if (type === "Weapon") {
        return Number.isFinite(normalizedId) ? `/db/weapon/${normalizedId}` : ""
    }
    if (type === "Char") {
        return Number.isFinite(normalizedId) || typeof id === "string" ? `/db/char/${id}` : ""
    }
    if (type === "Draft") {
        const draft = findDraftByIdOrProductId(id)
        return draft ? `/db/draft/${draft.id}` : ""
    }
    if (type === "Walnut") {
        return walnutMap.get(normalizedId) ? `/db/walnut/${normalizedId}` : ""
    }
    if (type === "Resource" || type === "Pack") {
        const resource = findResourceById(id)
        return resource ? `/db/resource/${resource.id}` : ""
    }
    if (type === "IronTicket") {
        return iconticketMap.get(normalizedId) ? `/db/iron-ticket/${normalizedId}` : ""
    }
    if (type === "Title") {
        return titleLinkMap.get(normalizedId) ? `/db/title/${normalizedId}` : ""
    }
    if (type === "Skin") {
        return hasFashionEntry("Skin", id) ? `/db/accessory/skin/${normalizedId}` : ""
    }
    if (type === "HeadSculpture") {
        return hasFashionEntry("HeadSculpture", id) ? `/db/accessory/head/${normalizedId}` : ""
    }
    if (type === "HeadFrame") {
        return hasFashionEntry("HeadFrame", id) ? `/db/accessory/headframe/${normalizedId}` : ""
    }
    if (type === "Hair") {
        return hasFashionEntry("Hair", id) ? `/db/accessory/hair/${normalizedId}` : ""
    }
    if (type === "WeaponSkin") {
        return hasFashionEntry("WeaponSkin", id) ? `/db/accessory/weaponskin/${normalizedId}` : ""
    }
    if (type === "TitleFrame") {
        return hasFashionEntry("TitleFrame", id) ? `/db/accessory/titleframe/${normalizedId}` : ""
    }
    if (type === "CharAccessory") {
        const exists = charAccessoryData.some(entry => entry.id === normalizedId)
        return exists ? `/db/accessory/char/${normalizedId}` : ""
    }
    if (type === "WeaponAccessory") {
        const exists = weaponAccessoryData.some(entry => entry.id === normalizedId)
        return exists ? `/db/accessory/weapon/${normalizedId}` : ""
    }
    if (type === "Pet") {
        return petMap.get(normalizedId) ? `/db/pet/${normalizedId}` : ""
    }
    return ""
}
