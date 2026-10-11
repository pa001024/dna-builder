import { LeveledChar, LeveledCharHelper, LeveledModHelper, LeveledPetHelper, LeveledWeaponHelper } from "@/data"
import { charMap, draftMap, iconticketMap, modMap, petMap, resourceMap, skinMap, walnutMap } from "@/data/d"
import { charAccessoryData, hairData, headFrameData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { titleFrameData } from "@/data/d/titleframe.data"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { getWalnutRewardName } from "@/utils/walnut-product"

/** 奖励图标缺省图（原 RewardItem / ResourceCostItem 两处硬编码一致） */
export const EMPTY_REWARD_ICON = "/imgs/webp/T_Head_Empty.webp"

/** 无对应品质时的图标底色（原 RewardItem 默认分支） */
const DEFAULT_REWARD_BACKGROUND = "from-gray-900/80 to-gray-100/80"

/**
 * 归一化条目 id。
 * @param id 原始 id
 * @returns 数值 id；非法时返回 NaN
 */
function normalizeIconId(id: number | string): number {
    return Number(id)
}

/**
 * 通过设计稿 ID 或产物 ID 查找设计稿（与 reward-link.ts 同口径）。
 * @param draftId 设计稿 ID 或产物 ID
 * @returns 设计稿数据；查不到时返回 undefined
 */
function findDraftByIdOrProductId(draftId: number | string) {
    const normalizedId = normalizeIconId(draftId)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }
    return draftMap.get(normalizedId) ?? [...draftMap.values()].find(draft => draft.p === normalizedId)
}

/**
 * 通过资源 ID 或名称查找资源（与 reward-link.ts 同口径）。
 * @param id 资源 ID 或名称
 * @returns 资源数据；查不到时返回 undefined
 */
function findResourceByIdOrName(id: number | string) {
    const direct = resourceMap.get(id as number)
    if (direct) {
        return direct
    }
    const normalizedId = normalizeIconId(id)
    if (!Number.isFinite(normalizedId)) {
        return undefined
    }
    const byNumericKey = resourceMap.get(normalizedId)
    if (byNumericKey) {
        return byNumericKey
    }
    return [...resourceMap.values()].find(item => item.id === normalizedId)
}

/**
 * 获取角色碎片资源对应的角色头像（原两组件实现一致，收敛到此）。
 * @param name 资源名
 * @returns 角色头像路径；非碎片资源时返回空串
 */
export function getCharacterFragmentIcon(name?: string): string {
    const fragmentPrefix = "思绪片段·"
    if (!name?.startsWith(fragmentPrefix)) {
        return ""
    }
    const char = charMap.get(name.slice(fragmentPrefix.length))
    return char?.icon ? LeveledChar.url(char.icon) : ""
}

/**
 * 获取资源条目的展示图标（含碎片反查）。
 * @param id 资源 ID 或名称
 * @returns 图标路径
 */
function getResourceIconByIdOrName(id: number | string): string {
    const resource = findResourceByIdOrName(id)
    if (!resource) {
        return EMPTY_REWARD_ICON
    }
    return getCharacterFragmentIcon(resource.name) || (resource.icon ? `/imgs/res/${resource.icon}.webp` : EMPTY_REWARD_ICON)
}

/**
 * 获取奖励条目的展示图标（原 RewardItem / ResourceCostItem / LimitedPrizeSimulator 三处分支的公共版本）。
 *
 * 口径取三处并集：Mod 不存在时不再抛错而是回缺省图；设计稿支持按产物 id 反查；
 * 密函按首个产物递归解析；Hair / HeadSculpture / HeadFrame / WeaponSkin 等旧 RewardItem 缺失分支予以补齐。
 * @param type 奖励类型
 * @param id 条目 ID
 * @returns 图标路径；查不到时返回缺省图
 */
export function getRewardIconUrl(type: string, id: number | string): string {
    const normalizedId = normalizeIconId(id)
    if (type === "Mod") {
        if (!Number.isFinite(normalizedId) || !modMap.has(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        try {
            return LeveledModHelper.getUrl(normalizedId) || EMPTY_REWARD_ICON
        } catch {
            return EMPTY_REWARD_ICON
        }
    }
    if (type === "Weapon") {
        return LeveledWeaponHelper.idToUrl(normalizedId) || EMPTY_REWARD_ICON
    }
    if (type === "Char") {
        return LeveledCharHelper.idToUrl(normalizedId)
    }
    if (type === "Pet") {
        return LeveledPetHelper.idToUrl(normalizedId) || EMPTY_REWARD_ICON
    }
    if (type === "Skin") {
        if (!Number.isFinite(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        const skin = skinMap.get(normalizedId)
        return skin?.icon ? resolveSkinIconUrl(skin.icon) : EMPTY_REWARD_ICON
    }
    if (type === "CharAccessory" || type === "WeaponAccessory" || type === "WeaponSkin") {
        if (!Number.isFinite(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        const accessory =
            type === "CharAccessory"
                ? charAccessoryData.find(item => item.id === normalizedId)
                : type === "WeaponAccessory"
                  ? weaponAccessoryData.find(item => item.id === normalizedId)
                  : weaponSkinData.find(item => item.id === normalizedId)
        return accessory?.icon ? resolveSkinIconUrl(accessory.icon) : EMPTY_REWARD_ICON
    }
    if (type === "Hair") {
        if (!Number.isFinite(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        const hair = hairData.find(item => item.id === normalizedId)
        return hair?.icon ? resolveSkinIconUrl(hair.icon) : EMPTY_REWARD_ICON
    }
    if (type === "HeadFrame") {
        if (!Number.isFinite(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        const headFrame = headFrameData.find(item => item.id === normalizedId)
        return headFrame?.icon ? `/imgs/headframe/${headFrame.icon}.webp` : EMPTY_REWARD_ICON
    }
    if (type === "HeadSculpture") {
        if (!Number.isFinite(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        const head = headSculptureData.find(item => item.id === normalizedId)
        return head?.icon ? `/imgs/webp/${head.icon}.webp` : EMPTY_REWARD_ICON
    }
    if (type === "Title") {
        return "/imgs/webp/T_Icon_Random_Title.webp"
    }
    if (type === "TitleFrame") {
        if (!Number.isFinite(normalizedId)) {
            return "/imgs/webp/T_Icon_Random_TitleFrame.webp"
        }
        const frame = titleFrameData.find(item => item.id === normalizedId)
        return frame?.icon ? `/imgs/webp/${frame.icon}.webp` : "/imgs/webp/T_Icon_Random_TitleFrame.webp"
    }
    if (type === "Draft") {
        const draft = findDraftByIdOrProductId(id)
        if (!draft) {
            return EMPTY_REWARD_ICON
        }
        if (draft.t === "Mod") {
            return getRewardIconUrl("Mod", draft.p)
        }
        if (draft.t === "Weapon") {
            return getRewardIconUrl("Weapon", draft.p)
        }
        return getResourceIconByIdOrName(draft.n)
    }
    if (type === "Resource" || type === "Pack") {
        return getResourceIconByIdOrName(id)
    }
    if (type === "Walnut") {
        if (!Number.isFinite(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        const walnut = walnutMap.get(normalizedId)
        const reward = walnut?.奖励?.[0]
        if (!reward) {
            return EMPTY_REWARD_ICON
        }
        // 无名产物（如魔之楔密函成品）先按展示名做碎片反查，再递归常规解析
        return getCharacterFragmentIcon(getWalnutRewardName(reward)) || getRewardIconUrl(reward.type, reward.id)
    }
    if (type === "IronTicket") {
        if (!Number.isFinite(normalizedId)) {
            return EMPTY_REWARD_ICON
        }
        const ticket = iconticketMap.get(normalizedId)
        return ticket?.icon ? `/imgs/res/${ticket.icon}.webp` : EMPTY_REWARD_ICON
    }
    return EMPTY_REWARD_ICON
}

/**
 * 获取奖励图标的品质底色（原两组件背景分支的公共版本）。
 *
 * 口径取并集：Hair 取自身稀有度；TitleFrame 与 Title / HeadFrame 同按 4 处理；
 * 设计稿按实际品质（魔之楔取产物表品质）而非固定黄色。
 * @param type 奖励类型
 * @param id 条目 ID
 * @returns 底色类名
 */
export function getRewardIconBackground(type: string, id: number | string): string {
    const normalizedId = normalizeIconId(id)
    if (type === "Resource" || type === "Pack") {
        return getRarityGradientClass(findResourceByIdOrName(id)?.rarity || 1)
    }
    if (type === "IronTicket") {
        return getRarityGradientClass(iconticketMap.get(normalizedId)?.rarity || 1)
    }
    if (type === "Skin") {
        return getRarityGradientClass(skinMap.get(normalizedId)?.rarity || 1)
    }
    if (type === "WeaponSkin") {
        return getRarityGradientClass(weaponSkinData.find(entry => entry.id === normalizedId)?.rarity || 1)
    }
    if (type === "CharAccessory") {
        return getRarityGradientClass(charAccessoryData.find(entry => entry.id === normalizedId)?.rarity || 1)
    }
    if (type === "WeaponAccessory") {
        return getRarityGradientClass(weaponAccessoryData.find(entry => entry.id === normalizedId)?.rarity || 1)
    }
    if (type === "Hair") {
        return getRarityGradientClass(hairData.find(entry => entry.id === normalizedId)?.rarity || 1)
    }
    if (type === "HeadFrame" || type === "Title" || type === "TitleFrame") {
        return getRarityGradientClass(4)
    }
    if (type === "HeadSculpture") {
        return getRarityGradientClass(5)
    }
    if (type === "Mod") {
        return getRarityGradientClass(modMap.get(normalizedId)?.品质 ?? "金")
    }
    if (type === "Pet") {
        return getRarityGradientClass(petMap.get(normalizedId)?.品质 ?? "金")
    }
    if (type === "Weapon" || type === "Char" || type === "Walnut") {
        return getRarityGradientClass(5)
    }
    if (type === "Draft") {
        const draft = findDraftByIdOrProductId(id)
        if (!draft) {
            return getRarityGradientClass(1)
        }
        if (draft.t === "Mod") {
            return getRarityGradientClass(modMap.get(draft.p)?.品质 || draft.r)
        }
        return getRarityGradientClass(draft.r)
    }
    return DEFAULT_REWARD_BACKGROUND
}
