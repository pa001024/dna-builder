<script lang="ts" setup>
import { computed } from "vue"
import { monsterMap } from "@/data"
import type { HardBoss, HardBossDetail } from "@/data/d/hardboss.data"
import { getHardBossDetail } from "@/data/d/hardboss.data"
import { useSearchParam } from "@/composables/useSearchParam"
import { getDropModeText, getRewardDetails } from "@/utils/reward-utils"

interface DynamicRewardEntry {
    DynamicRewardId: number
    EndTime: number
    Index: number
    RewardId: number
    RewardView: number
    StartTime: number
}

type HardbossRewardDiffState = "added" | "removed"

interface DynamicRewardEntryWithDiff extends DynamicRewardEntry {
    diffState?: HardbossRewardDiffState
}

interface HardbossDiffView {
    id: number
    lv: number
    rewards: DynamicRewardEntryWithDiff[]
    activeRewardCount: number
    changedRewardCount: number
}

interface HardbossTimePoint {
    timestamp: number
    label: string
    shortLabel: string
    activeRewardCount: number
    isCurrent: boolean
}

const props = defineProps<{
    boss: HardBoss
}>()

const nowTimestamp = Math.floor(Date.now() / 1000)
const timeFilterEnabled = useSearchParam("tf", false)
const selectedTimePointIndex = useSearchParam("ti", 0)
const diffOnlyEnabled = useSearchParam("td", false)

// 获取Boss详情（包含动态奖励）
const bossDetail = computed<HardBossDetail | undefined>(() => {
    return getHardBossDetail(props.boss.id)
})

// 获取怪物数据
const monster = computed(() => monsterMap.get(props.boss.mid))

/**
 * 拉平全部动态奖励。
 * @returns 当前 Boss 的全部动态奖励
 */
const allDynamicRewards = computed<DynamicRewardEntry[]>(() => {
    return bossDetail.value?.diff.flatMap(diff => diff.dr) ?? []
})

/**
 * 生成当前 Boss 的离散时间点。
 * @returns 按时间升序排列的离散时间戳
 */
const hardbossTimeTimestamps = computed(() => {
    return Array.from(
        new Set(
            allDynamicRewards.value.flatMap(reward => {
                const points = [] as number[]
                points.push(reward.StartTime)
                points.push(reward.EndTime)
                return points
            })
        )
    ).sort((a, b) => a - b)
})

/**
 * 计算默认应选中的当前时间点索引。
 * @returns 当前时间点索引
 */
const currentTimePointIndex = computed(() => {
    if (hardbossTimeTimestamps.value.length === 0) {
        return 0
    }

    const firstFutureIndex = hardbossTimeTimestamps.value.findIndex(timestamp => timestamp > nowTimestamp)
    if (firstFutureIndex === -1) {
        return hardbossTimeTimestamps.value.length - 1
    }
    if (firstFutureIndex === 0) {
        return 0
    }
    return firstFutureIndex - 1
})

/**
 * 当前时间所在的离散时间点时间戳。
 * @returns 当前时间点时间戳
 */
const currentTimePointTimestamp = computed(() => {
    return hardbossTimeTimestamps.value[currentTimePointIndex.value] ?? null
})

/**
 * 生成当前 Boss 全部离散时间点视图。
 * @returns 按时间升序排列的离散时间点
 */
const hardbossTimePoints = computed<HardbossTimePoint[]>(() => {
    return hardbossTimeTimestamps.value.map(timestamp => ({
        timestamp,
        label: formatTimestamp(timestamp),
        shortLabel: formatShortTimestamp(timestamp),
        activeRewardCount: allDynamicRewards.value.filter(reward => isRewardAvailableAtTime(reward, timestamp)).length,
        isCurrent: timestamp === currentTimePointTimestamp.value,
    }))
})

/**
 * 当前选中的离散时间点。
 * @returns 当前选中的时间点
 */
const selectedTimePoint = computed(() => {
    if (hardbossTimePoints.value.length === 0) {
        return null
    }
    return hardbossTimePoints.value[selectedTimePointIndex.value] ?? hardbossTimePoints.value[currentTimePointIndex.value] ?? null
})

/**
 * 当前选中时间点的上一个离散时间点。
 * @returns 上一个时间点；不存在则返回 null
 */
const previousSelectedTimePoint = computed(() => {
    if (selectedTimePointIndex.value <= 0 || hardbossTimePoints.value.length === 0) {
        return null
    }
    return hardbossTimePoints.value[selectedTimePointIndex.value - 1] ?? null
})

/**
 * 当前时间过滤使用的时间戳。
 * @returns 生效中的时间戳；未启用时返回 null
 */
const activeFilterTimestamp = computed(() => {
    if (!timeFilterEnabled.value) {
        return null
    }
    return selectedTimePoint.value?.timestamp ?? null
})

/**
 * 当前 Boss 的过滤后奖励视图。
 * @returns 各等级奖励的过滤后视图
 */
const filteredDiffs = computed<HardbossDiffView[]>(() => {
    return (
        bossDetail.value?.diff.map(diff => ({
            id: diff.id,
            lv: diff.lv,
            rewards: filterRewardsByMode(
                diff.dr,
                activeFilterTimestamp.value,
                previousSelectedTimePoint.value?.timestamp ?? null,
                diffOnlyEnabled.value
            ),
            activeRewardCount: countActiveRewardsByTimestamp(diff.dr, activeFilterTimestamp.value),
            changedRewardCount: countChangedRewardsByTimestamp(
                diff.dr,
                activeFilterTimestamp.value,
                previousSelectedTimePoint.value?.timestamp ?? null
            ),
        })) ?? []
    )
})

/**
 * 判断动态奖励在指定时间点是否生效。
 * @param reward 动态奖励
 * @param timestamp 指定时间戳
 * @returns 是否生效
 */
function isRewardAvailableAtTime(reward: DynamicRewardEntry, timestamp: number): boolean {
    return reward.StartTime <= timestamp && timestamp <= reward.EndTime
}

/**
 * 根据当前模式过滤动态奖励。
 * @param rewards 动态奖励列表
 * @param timestamp 当前时间戳
 * @param previousTimestamp 上一个时间戳
 * @param diffOnly 是否只显示差异
 * @returns 过滤后的动态奖励列表
 */
function filterRewardsByMode(
    rewards: DynamicRewardEntry[],
    timestamp: number | null,
    previousTimestamp: number | null,
    diffOnly: boolean
): DynamicRewardEntryWithDiff[] {
    if (timestamp == null) {
        return rewards.map(reward => ({ ...reward }))
    }

    if (!diffOnly) {
        return rewards.filter(reward => isRewardAvailableAtTime(reward, timestamp)).map(reward => ({ ...reward }))
    }

    return rewards.flatMap(reward => {
        const isCurrentActive = isRewardAvailableAtTime(reward, timestamp)
        const wasPreviousActive = previousTimestamp == null ? false : isRewardAvailableAtTime(reward, previousTimestamp)
        if (isCurrentActive === wasPreviousActive) {
            return []
        }

        return [
            {
                ...reward,
                diffState: isCurrentActive ? "added" : "removed",
            },
        ]
    })
}

/**
 * 统计指定时间点下真实生效的动态奖励数量。
 * @param rewards 动态奖励列表
 * @param timestamp 过滤时间戳
 * @returns 生效的动态奖励数量
 */
function countActiveRewardsByTimestamp(rewards: DynamicRewardEntry[], timestamp: number | null): number {
    if (timestamp == null) {
        return rewards.length
    }
    return rewards.filter(reward => isRewardAvailableAtTime(reward, timestamp)).length
}

/**
 * 统计指定时间点与上一个时间点之间的变化奖励数量。
 * @param rewards 动态奖励列表
 * @param timestamp 当前时间戳
 * @param previousTimestamp 上一个时间戳
 * @returns 差异奖励数量
 */
function countChangedRewardsByTimestamp(rewards: DynamicRewardEntry[], timestamp: number | null, previousTimestamp: number | null): number {
    if (timestamp == null) {
        return 0
    }

    return rewards.filter(reward => {
        const isCurrentActive = isRewardAvailableAtTime(reward, timestamp)
        const wasPreviousActive = previousTimestamp == null ? false : isRewardAvailableAtTime(reward, previousTimestamp)
        return isCurrentActive !== wasPreviousActive
    }).length
}

/**
 * 将滑块重置到当前时间点。
 */
function resetToCurrentTimePoint(): void {
    selectedTimePointIndex.value = currentTimePointIndex.value
}

// 格式化时间戳为日期字符串
function formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

/**
 * 格式化短时间文本。
 * @param timestamp 时间戳
 * @returns 短时间文本
 */
function formatShortTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
    })
}

// 获取奖励状态文本
function getRewardStatusText(startTime: number, endTime: number): { text: string; color: string } {
    const now = Math.floor(Date.now() / 1000)
    if (now < startTime) {
        return { text: "未开始", color: "text-base-content/50" }
    } else if (now > endTime) {
        return { text: "已结束", color: "text-base-content/50" }
    } else {
        return { text: "进行中", color: "text-success" }
    }
}
</script>

<template>
    <div v-if="bossDetail" class="p-3 space-y-4">
        <!-- 详情头部 -->
        <div class="flex items-center justify-between">
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2">
                    <SRouterLink :to="`/db/hardboss/${boss.id}`" class="text-lg font-bold link link-primary">
                        {{ boss.name }}
                    </SRouterLink>
                    <span class="text-sm text-base-content/70">ID: {{ boss.id }}</span>
                </div>
                <div class="text-sm text-base-content/70">
                    {{ boss.desc }}
                </div>
            </div>
        </div>

        <!-- 怪物信息 -->
        <div v-if="monster" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">怪物信息</h3>
            <DBMonsterDetailItem :monster="monster" :defaultLevel="80" />
        </div>

        <div v-if="hardbossTimePoints.length > 0" class="rounded-lg border border-base-200 bg-base-100 p-3 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="space-y-1">
                    <div class="font-medium">时间过滤</div>
                    <div class="text-xs text-base-content/70">按离散时间点查看高难 Boss 奖励，也可只看相对上一时间点的变化。</div>
                </div>
                <div class="flex flex-wrap items-center gap-4">
                    <button type="button" class="btn btn-xs btn-ghost" @click="resetToCurrentTimePoint">重置到当前</button>
                    <label class="label cursor-pointer gap-2 p-0">
                        <span class="text-sm">仅显示当前</span>
                        <input v-model="timeFilterEnabled" type="checkbox" class="toggle toggle-primary toggle-sm" />
                    </label>
                    <label class="label cursor-pointer gap-2 p-0">
                        <span class="text-sm">仅显示差异</span>
                        <input
                            v-model="diffOnlyEnabled"
                            type="checkbox"
                            class="toggle toggle-success toggle-sm"
                            :disabled="!timeFilterEnabled"
                        />
                    </label>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/70">
                <span class="rounded bg-base-200 px-2 py-1">{{ hardbossTimePoints.length }} 个时间点</span>
                <span v-if="selectedTimePoint">当前时间点：{{ selectedTimePoint.label }}</span>
                <span v-if="selectedTimePoint">生效奖励 {{ selectedTimePoint.activeRewardCount }} 组</span>
                <span v-if="diffOnlyEnabled && previousSelectedTimePoint">对比上一时间点：{{ previousSelectedTimePoint.label }}</span>
                <span v-if="selectedTimePoint?.isCurrent" class="rounded bg-primary px-2 py-1 text-primary-content">当前</span>
            </div>

            <div class="flex items-center gap-3">
                <span class="w-12 shrink-0 text-[11px] text-base-content/60">{{ hardbossTimePoints[0]?.shortLabel }}</span>
                <input
                    v-model.number="selectedTimePointIndex"
                    type="range"
                    class="range range-primary range-xs grow"
                    :min="0"
                    :max="Math.max(hardbossTimePoints.length - 1, 0)"
                    step="1"
                />
                <span class="w-12 shrink-0 text-right text-[11px] text-base-content/60">{{ hardbossTimePoints.at(-1)?.shortLabel }}</span>
            </div>
        </div>

        <!-- 动态奖励列表 -->
        <div v-for="diff in filteredDiffs" :key="diff.id" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">
                等级奖励
                <span class="text-sm font-normal text-base-content/70 ml-2">Lv.{{ diff.lv }}</span>
                <span v-if="timeFilterEnabled" class="ml-2 text-xs font-normal text-base-content/60">
                    <template v-if="diffOnlyEnabled">{{ diff.changedRewardCount }} 组变化奖励</template>
                    <template v-else>{{ diff.activeRewardCount }} 组当前奖励</template>
                </span>
            </h3>
            <div v-if="diffOnlyEnabled ? diff.changedRewardCount > 0 : !timeFilterEnabled || diff.activeRewardCount > 0" class="space-y-3">
                <div
                    v-for="dr in diff.rewards"
                    :key="`${dr.DynamicRewardId}-${dr.Index}`"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                >
                    <div class="mb-2 flex flex-wrap items-center gap-2 text-xs text-base-content/70">
                        <span
                            v-if="dr.diffState"
                            class="inline-flex h-5 min-w-5 items-center justify-center rounded text-xs font-bold"
                            :class="dr.diffState === 'added' ? 'bg-success text-success-content' : 'bg-error text-error-content'"
                        >
                            {{ dr.diffState === "added" ? "+" : "-" }}
                        </span>
                        <span>{{ formatTimestamp(dr.StartTime) }} - {{ formatTimestamp(dr.EndTime) }}</span>
                    </div>
                    <!-- 使用 RewardItem 组件显示奖励 -->
                    <div v-for="reward in [getRewardDetails(dr.RewardView)].filter(v => !!v)" :key="reward.id" class="pl-2">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs font-medium">奖励组 {{ dr.RewardId }}</span>
                            <span class="text-xs" :class="getRewardStatusText(dr.StartTime, dr.EndTime).color">
                                {{ getRewardStatusText(dr.StartTime, dr.EndTime).text }}
                            </span>
                            <span
                                class="text-xs px-1.5 py-0.5 rounded"
                                :class="
                                    getDropModeText(reward.m || '') === '独立'
                                        ? 'bg-success text-success-content'
                                        : 'bg-warning text-warning-content'
                                "
                            >
                                {{ getDropModeText(reward.m || "") }}
                            </span>
                        </div>
                        <RewardItem :reward="reward" />
                    </div>
                </div>
            </div>
            <div v-else class="rounded bg-base-200 px-3 py-6 text-center text-sm text-base-content/60">
                {{ diffOnlyEnabled ? "与上一时间点相比没有变化奖励" : "当前时间点下没有生效奖励" }}
            </div>
        </div>
    </div>
</template>
