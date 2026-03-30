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
