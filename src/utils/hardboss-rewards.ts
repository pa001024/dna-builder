import { charMap, weaponMap } from "@/data/d"
import { getHardBossDetail, type HardBossDetail, hardBossMap } from "@/data/d/hardboss.data"
import { type Walnut, walnutMap } from "@/data/d/walnut.data"
import { getRewardDetails } from "@/utils/reward-utils"

/**
 * 周本奖励信息（角色或武器）。
 */
export interface WeeklyHardbossRewardInfo {
    id: number
    name: string
    type: "Char" | "Weapon"
}

/**
 * 周本奖励条目（当前生效或下次轮换生效）。
 */
export interface WeeklyHardbossRewardItem {
    key: string
    name: string
    value: [string, number, "Char" | "Weapon"]
    diffState?: "added"
}

/**
 * 周本奖励槽位：当前与下次轮换对齐后的成对条目。
 */
export interface WeeklyHardbossRewardSlot {
    key: string
    currentItem: WeeklyHardbossRewardItem | null
    nextItem: WeeklyHardbossRewardItem | null
}

/**
 * 单个 Boss 的周本奖励分组。
 */
export interface WeeklyHardbossRewardSection {
    key: string
    bossId: number
    bossName: string
    bossIcon: string
    nextRotationTime: number | null
    slots: WeeklyHardbossRewardSlot[]
}

interface HardbossDynamicReward {
    DynamicRewardId: number
    EndTime: number
    Index: number
    RewardId: number
    RewardView: number
    StartTime: number
}

/**
 * 获取周本图标路径。
 * @param icon 图标名
 * @returns 图标路径
 */
export function getHardbossIcon(icon: string): string {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 从密函数据中提取可展示的角色或武器奖励。
 * @param walnut 密函数据
 * @returns 奖励信息；无法解析时返回 null
 */
function getWalnutRewardInfo(walnut: Walnut): WeeklyHardbossRewardInfo | null {
    const reward = walnut.奖励[0]
    if (!reward) {
        return null
    }

    if (walnut.类型 === 1) {
        const charName = reward.name.replace(/^思绪片段·/, "")
        const char = charMap.get(charName)
        if (!char) {
            return null
        }

        return {
            id: char.id,
            name: char.名称,
            type: "Char",
        }
    }

    if (walnut.类型 === 2) {
        const weapon = weaponMap.get(reward.id)
        if (!weapon) {
            return null
        }

        return {
            id: weapon.id,
            name: weapon.名称,
            type: "Weapon",
        }
    }

    return null
}

/**
 * 判断动态奖励在指定时间点是否生效。
 * @param reward 动态奖励
 * @param timestamp 秒级时间戳
 * @returns 是否生效
 */
function isRewardAvailableAtTime(reward: HardbossDynamicReward, timestamp: number): boolean {
    return reward.StartTime <= timestamp && timestamp < reward.EndTime
}

/**
 * 收集某个时间点某个等级生效的周本奖励。
 * @param diff 等级配置
 * @param timestamp 秒级时间戳
 * @returns 周本奖励列表
 */
function collectWeeklyHardbossRewardItems(diff: HardBossDetail["diff"][number], timestamp: number): WeeklyHardbossRewardItem[] {
    const items: WeeklyHardbossRewardItem[] = []
    const seen = new Set<string>()

    diff.dr.forEach(dr => {
        if (!isRewardAvailableAtTime(dr as HardbossDynamicReward, timestamp)) {
            return
        }

        const rewardTree = getRewardDetails(dr.RewardView)
        rewardTree?.child?.forEach(item => {
            if (item.t !== "Walnut") {
                return
            }

            const walnut = walnutMap.get(item.id)
            if (!walnut) {
                return
            }

            const rewardInfo = getWalnutRewardInfo(walnut)
            if (!rewardInfo) {
                return
            }

            const key = `${diff.id}-${dr.DynamicRewardId}-${dr.Index}-${item.id}-${rewardInfo.type}-${rewardInfo.id}`
            if (seen.has(key)) {
                return
            }
            seen.add(key)

            items.push({
                key,
                name: rewardInfo.name,
                value: [`Lv.${diff.lv}`, rewardInfo.id, rewardInfo.type],
            })
        })
    })

    return items
}

/**
 * 获取某个 Boss 的下次轮换时间。
 * @param detail Boss 详情
 * @param timestamp 参考时间戳
 * @returns 下次轮换时间；不存在时返回 null
 */
function getWeeklyHardbossNextRotationTime(detail: HardBossDetail, timestamp: number): number | null {
    let nextRotationTime: number | null = null

    detail.diff.forEach(diff => {
        diff.dr.forEach(dr => {
            if (dr.StartTime <= timestamp) {
                return
            }

            nextRotationTime = nextRotationTime == null ? dr.StartTime : Math.min(nextRotationTime, dr.StartTime)
        })
    })

    return nextRotationTime
}

/**
 * 构造某个等级在当前与下次轮换时刻的对齐槽位。
 * @param diff 等级配置
 * @param currentTimestamp 当前时间戳
 * @param nextTimestamp 下次轮换时间戳；不存在时返回空行
 * @returns 对齐后的槽位列表
 */
function buildWeeklyHardbossSlotsForDiff(
    diff: HardBossDetail["diff"][number],
    currentTimestamp: number,
    nextTimestamp: number | null
): WeeklyHardbossRewardSlot[] {
    const currentItems = collectWeeklyHardbossRewardItems(diff, currentTimestamp)
    const nextItems = nextTimestamp == null ? [] : collectWeeklyHardbossRewardItems(diff, nextTimestamp)
    const slotCount = Math.max(currentItems.length, nextItems.length)

    if (slotCount === 0) {
        return []
    }

    const slots: WeeklyHardbossRewardSlot[] = []

    for (let index = 0; index < slotCount; index += 1) {
        const currentItem = currentItems[index] ?? null
        const nextItem = nextItems[index] ?? null

        if ((!currentItem && nextItem) || (currentItem && nextItem && currentItem.key !== nextItem.key)) {
            nextItem.diffState = "added"
        }

        slots.push({
            key: `${diff.id}-${index}`,
            currentItem,
            nextItem,
        })
    }

    return slots
}

/**
 * 收集某个时间点生效的周本奖励。
 * @param timestamp 秒级时间戳
 * @returns 周本奖励分组
 */
export function buildWeeklyHardbossSections(timestamp: number): WeeklyHardbossRewardSection[] {
    const sections: WeeklyHardbossRewardSection[] = []

    hardBossMap.forEach(boss => {
        const detail = getHardBossDetail(boss.id)
        if (!detail) {
            return
        }

        const nextRotationTime = getWeeklyHardbossNextRotationTime(detail, timestamp)
        const slots = detail.diff.flatMap(diff => buildWeeklyHardbossSlotsForDiff(diff, timestamp, nextRotationTime))

        if (slots.length === 0) {
            return
        }

        sections.push({
            key: String(boss.id),
            bossId: boss.id,
            bossName: boss.name,
            bossIcon: boss.icon,
            nextRotationTime,
            slots,
        })
    })

    return sections
}
