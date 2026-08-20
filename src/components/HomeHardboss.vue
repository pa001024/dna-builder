<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import { charMap, weaponMap } from "@/data/d"
import { LeveledChar } from "@/data/leveled/LeveledChar"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { timeStr, useGameTimer } from "@/util"
import {
    buildWeeklyHardbossSections,
    getHardbossIcon,
    type WeeklyHardbossRewardItem,
    type WeeklyHardbossRewardSection,
    type WeeklyHardbossRewardSlot,
} from "@/utils/hardboss-rewards"

// 周本奖励分组（当前生效 + 下次轮换对照）
const sections = ref<WeeklyHardbossRewardSection[]>([])
// 周本刷新倒计时（每周一 05:00 刷新）
const { zhouben } = useGameTimer()

/**
 * 获取奖励条目的图标 URL。
 * @param item 奖励条目
 * @returns 图标地址；无法解析时返回空字符串
 */
function rewardIcon(item: WeeklyHardbossRewardItem): string {
    if (item.value[2] === "Char") {
        const char = charMap.get(item.value[1])
        return char ? LeveledChar.url(char.icon) : ""
    }
    const weapon = weaponMap.get(item.value[1])
    return weapon ? LeveledWeapon.url(weapon.icon) : ""
}

/**
 * 获取奖励条目的详情页链接。
 * @param item 奖励条目
 * @returns 路由路径；无法解析时返回空字符串
 */
function rewardLink(item: WeeklyHardbossRewardItem): string {
    if (item.value[2] === "Char") {
        return `/db/char/${item.value[1]}`
    }
    return `/db/weapon/${item.value[1]}`
}

/**
 * 格式化轮换时间为紧凑的月/日 时:分。
 * @param timestamp 秒级时间戳
 * @returns 格式化时间字符串
 */
function formatRotationTime(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

/**
 * 判断某个槽位是否需要展示“下次轮换新增”的奖励。
 * @param section 分组
 * @param slot 槽位
 * @returns 是否展示
 */
function hasNextReward(section: WeeklyHardbossRewardSection, slot: WeeklyHardbossRewardSlot): boolean {
    return !!section.nextRotationTime && !!slot.nextItem && slot.nextItem.key !== slot.currentItem?.key
}

/**
 * 判断分组内是否存在“下次轮换新增”的奖励（控制箭头分隔符显隐）。
 * @param section 分组
 * @returns 是否存在
 */
function hasAnyNextReward(section: WeeklyHardbossRewardSection): boolean {
    return section.slots.some(slot => hasNextReward(section, slot))
}

/**
 * 重新构建周本奖励分组（以当前时间为基准）。
 */
function refreshSections() {
    sections.value = buildWeeklyHardbossSections(Math.floor(Date.now() / 1000))
}

/**
 * 页面重新可见时刷新周本奖励分组。
 */
const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
        refreshSections()
    }
}

onMounted(() => {
    refreshSections()
    document.addEventListener("visibilitychange", handleVisibilityChange)
})
onUnmounted(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
})
</script>

<template>
    <div class="space-y-2">
        <!-- 周本刷新倒计时条 -->
        <div class="flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
            <Icon icon="ri:refresh-line" class="h-4 w-4 shrink-0 text-primary" />
            <span class="text-xs whitespace-nowrap text-base-content/70">{{ $t("home.hardbossWeeklyReset") }}</span>
            <span class="ml-auto font-orbitron text-sm font-semibold text-primary tabular-nums">{{ timeStr(zhouben) }}</span>
        </div>

        <!-- Boss 奖励卡片：当前奖励 → 下次轮换新增 -->
        <div v-for="section in sections" :key="section.key" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3">
            <div class="flex items-center gap-2.5">
                <img :src="getHardbossIcon(section.bossIcon)" :alt="section.bossName" class="size-9 shrink-0 rounded-xs bg-base-200 object-cover" />
                <div class="min-w-0 flex-1">
                    <SRouterLink
                        :to="`/db/hardboss/${section.bossId}`"
                        class="block truncate text-[13px] font-semibold text-base-content transition-colors duration-150 hover:text-primary"
                    >
                        {{ section.bossName }}
                    </SRouterLink>
                    <div class="text-[11px] text-base-content/55">
                        <template v-if="section.nextRotationTime">
                            {{ $t("home.hardbossNextRotation") }} {{ formatRotationTime(section.nextRotationTime) }}
                        </template>
                        <template v-else>{{ $t("home.hardbossNoRotation") }}</template>
                    </div>
                </div>
            </div>

            <div class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-2.5">
                <!-- 当前生效奖励 -->
                <div
                    v-for="slot in section.slots"
                    :key="`current-${slot.key}`"
                    class="flex w-11 shrink-0 flex-col items-center gap-0.5"
                >
                    <SRouterLink
                        v-if="slot.currentItem"
                        :to="rewardLink(slot.currentItem)"
                        :title="slot.currentItem.name"
                        class="block"
                    >
                        <img
                            :src="rewardIcon(slot.currentItem)"
                            :alt="slot.currentItem.name"
                            class="size-9 rounded-xs border border-base-content/10 bg-base-200 object-cover transition-colors duration-150 hover:border-primary/60"
                        />
                    </SRouterLink>
                    <div v-else class="size-9 rounded-xs border border-dashed border-base-content/15" />
                    <span v-if="slot.currentItem" class="text-[9px] leading-none text-base-content/55 tabular-nums">
                        {{ slot.currentItem.value[0] }}
                    </span>
                </div>

                <!-- 下次轮换新增奖励 -->
                <template v-if="hasAnyNextReward(section)">
                    <span class="mx-0.5 flex h-9 items-center text-base-content/25" aria-hidden="true">
                        <Icon icon="ri:arrow-right-line" class="h-3.5 w-3.5" />
                    </span>
                    <div
                        v-for="slot in section.slots"
                        :key="`next-${slot.key}`"
                        v-show="hasNextReward(section, slot)"
                        class="flex w-11 shrink-0 flex-col items-center gap-0.5"
                    >
                        <div v-if="slot.nextItem" class="relative">
                            <img
                                :src="rewardIcon(slot.nextItem)"
                                :alt="slot.nextItem.name"
                                :title="slot.nextItem.name"
                                class="size-9 rounded-xs border border-dashed border-primary/40 bg-base-200 object-cover"
                            />
                            <span
                                v-if="slot.nextItem.diffState === 'added'"
                                class="absolute -top-1.5 -right-1.5 z-10 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-xs bg-success px-0.5 text-[8px] font-bold text-success-content"
                            >
                                NEW
                            </span>
                        </div>
                        <span v-if="slot.nextItem" class="text-[9px] leading-none text-base-content/55 tabular-nums">
                            {{ slot.nextItem.value[0] }}
                        </span>
                    </div>
                </template>
            </div>
        </div>

        <!-- 空状态 -->
        <div
            v-if="!sections.length"
            class="flex flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-base-content/15 py-8 text-base-content/45"
        >
            <Icon icon="ri:skull-line" class="h-7 w-7 opacity-50" />
            <span class="text-[13px]">{{ $t("home.hardbossEmpty") }}</span>
        </div>
    </div>
</template>
