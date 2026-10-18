import { skinData } from "@/data/d/accessory.data"
import { skinGachaItems } from "@/data/d/skingacha.data"

/**
 * 万华（皮肤抽卡）中引用的角色皮肤 id 集合。
 * 依据 SkinGacha 奖池奖励中命中角色皮肤数据（skinData）的条目自动推导，
 * 用于为角色皮肤自动标注“通过万华获得”来源。
 */
const WANHUA_SKIN_ID_SET: ReadonlySet<number> = new Set(
    skinGachaItems.flatMap(pool => pool.rewards.filter(reward => skinData.some(skin => skin.id === reward.id)).map(reward => reward.id))
)

/**
 * 判断角色皮肤 id 是否为万华皮肤（在 SkinGacha 奖池中被引用）。
 * @param skinId 皮肤 id
 * @returns 是否为万华皮肤
 */
export function isWanhuaSkinId(skinId: number): boolean {
    return WANHUA_SKIN_ID_SET.has(skinId)
}

/**
 * 获取角色皮肤自动填充的万华来源文本；非万华皮肤返回空字符串。
 * @param skinId 皮肤 id
 * @returns “通过万华获得”或空字符串
 */
export function getWanhuaSkinUnlock(skinId: number): string {
    return isWanhuaSkinId(skinId) ? "通过万华获得" : ""
}

/**
 * 归一化饰品获取方式，用于列表筛选与文案展示。
 * 规则：
 * 1. 将“通过XX获得”统一成“XX”；
 * 2. 所有礼箱类来源统一归并为“礼箱”；
 * 3. 其余来源保持原样。
 * @param unlock 原始获取方式
 * @returns 归一化后的获取方式
 */
export function normalizeAccessoryUnlock(unlock: string): string {
    if (!unlock) {
        return ""
    }

    const trimmedUnlock = unlock.trim()
    const matchResult = trimmedUnlock.match(/^通过(.+)获得$/)
    const normalizedUnlock = matchResult?.[1]?.trim() || trimmedUnlock

    if (normalizedUnlock.includes("礼箱")) {
        return "礼箱"
    }

    return normalizedUnlock
}

const ACCESSORY_UNLOCK_LABEL_KEY_MAP: Record<string, string> = {
    商店: "accessory.unlockMethods.shop",
    万华: "accessory.unlockMethods.wanhua",
    棱镜兑换: "accessory.unlockMethods.prismExchange",
    蛋皎的印象商店: "accessory.unlockMethods.eggShop",
    活动: "accessory.unlockMethods.event",
    任务: "accessory.unlockMethods.quest",
    礼箱: "accessory.unlockMethods.giftBox",
}

/**
 * 获取归一化获取方式对应的国际化键。
 * @param normalizedUnlock 归一化后的获取方式
 * @returns 国际化键（无映射时返回原始值）
 */
export function getAccessoryUnlockLabelKey(normalizedUnlock: string): string {
    return ACCESSORY_UNLOCK_LABEL_KEY_MAP[normalizedUnlock] || normalizedUnlock
}

/**
 * 根据资源前缀解析皮肤图标地址。
 * 规则：
 * 1. `T_Fashion_` / `T_Skin_` 开头的图标走 `/imgs/fashion/`
 * 2. 其他图标默认走 `/imgs/webp/`
 * 3. 空值回退到默认头像占位图
 * @param icon 图标资源名
 * @returns 图标 URL
 */
export function resolveSkinIconUrl(icon: string): string {
    if (!icon) {
        return "/imgs/webp/T_Head_Empty.webp"
    }

    const targetDir = icon.startsWith("T_Head_") ? "webp" : "fashion"
    return `/imgs/${targetDir}/${icon}.webp`
}
