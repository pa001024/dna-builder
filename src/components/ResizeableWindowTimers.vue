<script setup lang="ts">
import { ref } from "vue"
import { charMap, weaponMap } from "@/data/d"
import { getHardBossDetail, type HardBossDetail, hardBossMap } from "@/data/d/hardboss.data"
import type { Walnut } from "@/data/d/walnut.data"
import { walnutMap } from "@/data/d/walnut.data"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { timeStr, useGameTimer } from "@/util"
import { getRewardDetails } from "@/utils/reward-utils"

interface WeeklyHardbossRewardInfo {
    id: number
    name: string
    type: "Char" | "Weapon"
}

interface WeeklyHardbossRewardItem {
    key: string
    name: string
    value: [string, number, "Char" | "Weapon"]
    diffState?: "added"
}

interface WeeklyHardbossRewardSlot {
    key: string
    currentItem: WeeklyHardbossRewardItem | null
    nextItem: WeeklyHardbossRewardItem | null
}

interface WeeklyHardbossRewardSection {
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

const ui = useUIStore()
const showWeeklyHardbossModal = ref(false)
const weeklyCurrentSections = ref<WeeklyHardbossRewardSection[]>([])

/**
 * 获取周本图标路径。
 * @param icon 图标名
 * @returns 图标路径
 */
function getHardbossIcon(icon: string): string {
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
function buildWeeklyHardbossSections(timestamp: number): WeeklyHardbossRewardSection[] {
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

/**
 * 打开周本奖励弹窗并刷新内容。
 */
function openWeeklyHardbossModal() {
    const nowTimestamp = Math.floor(Date.now() / 1000)
    weeklyCurrentSections.value = buildWeeklyHardbossSections(nowTimestamp)
    showWeeklyHardbossModal.value = true
}

const { mihan, moling, zhouben } = useGameTimer()
</script>
<template>
    <div class="flex ml-4 gap-8 items-center text-xs text-base-content/80">
        <div class="inline-block text-center min-w-16 cursor-pointer" @click="ui.mihanVisible = true">
            <div class="whitespace-nowrap">
                {{ $t("resizeableWindow.mihan") }}
            </div>
            <div class="font-orbitron">
                {{ timeStr(mihan) }}
            </div>
        </div>
        <div class="text-center min-w-16" :class="[env.isApp ? 'hidden sm:inline-block' : 'inline-block']">
            <div class="whitespace-nowrap">
                {{ $t("resizeableWindow.moling") }}
            </div>
            <div class="font-orbitron">
                {{ timeStr(moling) }}
            </div>
        </div>
        <button type="button" class="hidden sm:inline-block text-center min-w-16 cursor-pointer" @click="openWeeklyHardbossModal">
            <div class="whitespace-nowrap">
                {{ $t("resizeableWindow.zhouben") }}
            </div>
            <div class="font-orbitron">
                {{ timeStr(zhouben) }}
            </div>
        </button>
    </div>
    <dialog class="modal" :class="{ 'modal-open': ui.mihanVisible }">
        <div class="modal-box bg-base-300 text-md">
            <div class="text-lg font-bold flex justify-between items-center pb-2">
                {{ $t("resizeableWindow.mihanTitle") }}

                <form class="flex justify-end gap-2" method="dialog">
                    <button class="btn btn-ghost btn-sm btn-square" @click="ui.mihanVisible = false">
                        <Icon bold icon="codicon:chrome-close" />
                    </button>
                </form>
            </div>
            <DNAMihan />
        </div>

        <div class="modal-backdrop" @click="ui.mihanVisible = false" />
    </dialog>
    <DialogModel v-model="showWeeklyHardbossModal" class="w-[min(92vw,56rem)]">
        <div class="space-y-5 p-4">
            <div v-if="weeklyCurrentSections.length" class="space-y-3">
                <div class="space-y-3">
                    <div
                        v-for="section in weeklyCurrentSections"
                        :key="section.key"
                        class="space-y-3 rounded-lg border border-base-200 bg-base-100 p-3"
                    >
                        <div class="flex items-start gap-3">
                            <img :src="getHardbossIcon(section.bossIcon)" :alt="section.bossName" class="size-10 rounded-lg shrink-0" />
                            <div class="min-w-0">
                                <SRouterLink :to="`/db/hardboss/${section.bossId}`" class="font-medium hover:underline">
                                    {{ section.bossName }}
                                </SRouterLink>
                                <div v-if="section.nextRotationTime" class="text-xs text-base-content/60">
                                    下次轮换：{{ new Date(section.nextRotationTime * 1000).toLocaleString("zh-CN") }}
                                </div>
                                <div v-else class="text-xs text-base-content/60">暂无下次轮换时间</div>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <div v-for="slot in section.slots" :key="slot.key" class="w-16 shrink-0 flex flex-col items-center gap-1">
                                <div class="relative">
                                    <ResourceCostItem v-if="slot.currentItem" :name="slot.currentItem.name" :value="slot.currentItem.value" mini />
                                    <div v-else class="h-8 w-8" />
                                </div>
                                <div v-if="section.nextRotationTime && slot.nextItem && slot.nextItem.key !== slot.currentItem?.key" class="relative">
                                    <span
                                        v-if="slot.nextItem.diffState === 'added'"
                                        class="absolute -left-1 -top-1 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded bg-success px-1 text-[10px] font-bold text-success-content"
                                    >
                                        NEW
                                    </span>
                                    <ResourceCostItem :name="slot.nextItem.name" :value="slot.nextItem.value" mini />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="!weeklyCurrentSections.length" class="rounded-lg border border-base-200 bg-base-100 p-6 text-center text-sm text-base-content/60">
                暂无数据
            </div>
        </div>
    </DialogModel>
</template>
