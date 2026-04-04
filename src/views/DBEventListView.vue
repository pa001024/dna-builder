<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { computed, watch } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { eventData } from "@/data"
import { getVersionByTime } from "@/data/time.data"
import { getCurrentVersionLimit } from "@/data/versionGate"
import { matchPinyin } from "@/utils/pinyin-utils"
import { formatDateTime, formatTimeRange } from "@/utils/time"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedEventId = useSearchParam<number>("id", 0)
const selectedTimePointIndex = useSearchParam<number>("ti", 0)
const showVersionFilter = useLocalStorage("event.showVersionFilter", true)
const showTimeFilter = useLocalStorage("event.showTimeFilter", true)
const diffOnlyEnabled = useSearchParam("td", false)
const selectedVersion = useSearchParam<string>("ver", "")

/**
 * 生成活动可切换的离散时间点。
 * @returns 按时间升序排列的时间戳列表
 */
const eventTimePoints = computed(() => {
    return Array.from(
        new Set(
            eventData.flatMap(item => {
                const points = [item.startTime]
                if (typeof item.endTime === "number") {
                    points.push(item.endTime)
                }
                return points
            })
        )
    ).sort((a, b) => a - b)
})

/**
 * 计算当前应高亮的时间点索引。
 * @returns 当前时间点索引
 */
const currentTimePointIndex = computed(() => {
    if (eventTimePoints.value.length === 0) {
        return 0
    }

    const now = Math.floor(Date.now() / 1000)
    const firstFutureIndex = eventTimePoints.value.findIndex(timestamp => timestamp > now)
    if (firstFutureIndex === -1) {
        return eventTimePoints.value.length - 1
    }
    if (firstFutureIndex === 0) {
        return 0
    }
    return firstFutureIndex - 1
})

/**
 * 当前选中的离散时间点。
 * @returns 当前时间点时间戳
 */
const selectedTimePoint = computed(() => {
    if (eventTimePoints.value.length === 0) {
        return null
    }

    const index = Math.max(0, Math.min(selectedTimePointIndex.value, eventTimePoints.value.length - 1))
    return eventTimePoints.value[index] ?? null
})

/**
 * 当前选中时间点的上一个离散时间点。
 * @returns 上一个时间点
 */
const previousSelectedTimePoint = computed(() => {
    if (selectedTimePointIndex.value <= 0 || eventTimePoints.value.length === 0) {
        return null
    }

    return eventTimePoints.value[selectedTimePointIndex.value - 1] ?? null
})

/**
 * 当前时间点是否有效。
 * @returns 是否存在可用时间点
 */
const hasTimePoints = computed(() => eventTimePoints.value.length > 0)

/**
 * 判断版本是否在当前安全模式允许范围内。
 * @param version 版本号
 * @returns 是否允许显示
 */
function isVersionAllowed(version: string): boolean {
    const parsedVersion = Number(version)
    if (!Number.isFinite(parsedVersion)) {
        return true
    }
    return parsedVersion <= getCurrentVersionLimit()
}

/**
 * 生成活动版本列表。
 * @returns 版本列表
 */
const eventVersions = computed(() => {
    const versionSet = new Set<string>()
    eventData.forEach(item => {
        const version = getVersionByTime(item.startTime)
        if (version && isVersionAllowed(version)) {
            versionSet.add(version)
        }
    })
    return Array.from(versionSet).sort()
})

/**
 * 当前时间点下、未受搜索条件影响的可见活动数量。
 * @returns 活动数量
 */
const visibleEventCount = computed(() => {
    const timestamp = selectedTimePoint.value
    if (timestamp == null) {
        return 0
    }

    return eventData.filter(item => {
        const eventVersion = getVersionByTime(item.startTime)
        if (!isVersionAllowed(eventVersion)) {
            return false
        }

        return isEventAvailableAtTime(item, timestamp)
    }).length
})

/**
 * 当前时间点对应的活动数量。
 * @returns 活动数量
 */
/**
 * 当前时间过滤使用的时间戳。
 * 未显示时间筛选时返回 null。
 */
const activeFilterTimestamp = computed(() => {
    if (!showTimeFilter.value) {
        return null
    }
    return selectedTimePoint.value
})

/**
 * 按时间和差异模式过滤活动列表。
 */
const filteredEvents = computed(() => {
    const timestamp = activeFilterTimestamp.value
    const previousTimestamp = previousSelectedTimePoint.value
    return eventData
        .filter(item => {
            const eventVersion = getVersionByTime(item.startTime)
            if (!isVersionAllowed(eventVersion)) {
                return false
            }

            if (selectedVersion.value !== "" && eventVersion !== selectedVersion.value) {
                return false
            }

            if (timestamp == null) {
                return true
            }

            if (!diffOnlyEnabled.value) {
                return isEventAvailableAtTime(item, timestamp)
            }

            const currentAvailable = isEventAvailableAtTime(item, timestamp)
            const previousAvailable = previousTimestamp == null ? false : isEventAvailableAtTime(item, previousTimestamp)
            return currentAvailable !== previousAvailable
        })
        .filter(item => {
            if (searchKeyword.value === "") {
                return true
            }

            const query = searchKeyword.value
            if (`${item.id}`.includes(query) || item.name.includes(query) || item.desc.includes(query)) {
                return true
            }

            return matchPinyin(item.name, query).match || matchPinyin(item.desc, query).match
        })
})

watch(
    eventVersions,
    versions => {
        if (selectedVersion.value !== "" && !versions.includes(selectedVersion.value)) {
            selectedVersion.value = ""
        }
    },
    { immediate: true }
)

/**
 * 关闭版本筛选时清空版本条件。
 */
watch(
    showVersionFilter,
    show => {
        if (!show) {
            selectedVersion.value = ""
        }
    },
    { immediate: true }
)

/**
 * 关闭时间筛选时关闭差异模式。
 */
watch(
    showTimeFilter,
    show => {
        if (!show) {
            diffOnlyEnabled.value = false
        }
    },
    { immediate: true }
)

const selectedEvent = computed(() => {
    return selectedEventId.value ? filteredEvents.value.find(item => item.id === selectedEventId.value) || null : null
})

/**
 * 判断活动在指定时间点是否处于可展示状态。
 * @param item 活动项
 * @param timestamp 时间点
 * @returns 是否生效
 */
function isEventAvailableAtTime(item: (typeof eventData)[number], timestamp: number): boolean {
    return item.startTime <= timestamp && (item.endTime == null || timestamp < item.endTime)
}

/**
 * 重置时间滑块到当前时间点。
 */
function resetToCurrentTimePoint(): void {
    selectedTimePointIndex.value = currentTimePointIndex.value
}

/**
 * 格式化离散时间点显示文本。
 * @param timestamp 时间戳
 * @returns 时间文本
 */
function formatEventTimePoint(timestamp: number | null): string {
    return timestamp == null ? "-" : formatDateTime(timestamp)
}

watch(
    eventTimePoints,
    () => {
        if (eventTimePoints.value.length === 0) {
            selectedTimePointIndex.value = 0
            return
        }

        if (selectedTimePointIndex.value < 0 || selectedTimePointIndex.value >= eventTimePoints.value.length) {
            selectedTimePointIndex.value = currentTimePointIndex.value
        }
    },
    { immediate: true }
)

watch(
    currentTimePointIndex,
    index => {
        if (showTimeFilter.value && selectedTimePointIndex.value !== index) {
            selectedTimePointIndex.value = index
        }
    },
    { immediate: true }
)

watch(
    [showTimeFilter, diffOnlyEnabled, selectedTimePointIndex, eventTimePoints],
    ([timeFilter, diffOnly, currentIndex, timePoints]) => {
        if (!diffOnly) {
            return
        }
        if (!timeFilter || timePoints.length === 0 || currentIndex <= 0) {
            diffOnlyEnabled.value = false
        }
    },
    { immediate: true }
)

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedEvent }">
                <div class="p-3 border-b border-base-200 space-y-3">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索活动ID/名称/描述（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />

                    <div class="flex flex-wrap gap-2">
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input v-model="showVersionFilter" type="checkbox" class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">版本</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input v-model="showTimeFilter" type="checkbox" class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">时间点</span>
                        </label>
                    </div>

                    <div v-show="showVersionFilter" class="flex flex-wrap gap-1">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200"
                            :class="selectedVersion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedVersion = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="version in eventVersions"
                            :key="version"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="
                                selectedVersion === version ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedVersion = version"
                        >
                            {{ version }}
                        </button>
                    </div>

                    <div v-if="hasTimePoints" v-show="showTimeFilter" class="rounded-lg border border-base-200 bg-base-100 p-3 space-y-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <button type="button" class="btn btn-xs btn-ghost" @click="resetToCurrentTimePoint">重置到当前</button>
                            <label class="label cursor-pointer gap-2 p-0">
                                <span class="text-sm">仅显示差异</span>
                                <input v-model="diffOnlyEnabled" type="checkbox" class="checkbox checkbox-success checkbox-sm" />
                            </label>
                        </div>

                            <div class="flex items-center gap-3">
                                <span class="w-12 shrink-0 text-[11px] text-base-content/60">{{
                                    formatEventTimePoint(eventTimePoints[0] ?? null)
                                }}</span>
                                <input
                                    v-model.number="selectedTimePointIndex"
                                    type="range"
                                    class="range range-primary range-xs grow"
                                    :min="0"
                                    :max="Math.max(eventTimePoints.length - 1, 0)"
                                    step="1"
                                />
                                <span class="w-12 shrink-0 text-right text-[11px] text-base-content/60">{{
                                    formatEventTimePoint(eventTimePoints.at(-1) ?? null)
                                }}</span>
                            </div>
                            <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/70">
                                <span>当前时间点：{{ formatEventTimePoint(eventTimePoints[currentTimePointIndex] ?? null) }}</span>
                                <span v-if="selectedTimePoint">选中时间点：{{ formatEventTimePoint(selectedTimePoint) }}</span>
                                <span v-if="diffOnlyEnabled && previousSelectedTimePoint"
                                    >对比上一时间点：{{ formatEventTimePoint(previousSelectedTimePoint) }}</span
                                >
                                <span class="badge badge-ghost badge-sm">{{ eventTimePoints.length }} 个时间点</span>
                                <span class="badge badge-primary badge-sm">{{ visibleEventCount }} 个活动</span>
                            </div>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-if="filteredEvents.length === 0" class="p-4 text-center text-sm text-base-content/60">
                            {{ diffOnlyEnabled ? "与上一时间点相比没有变化活动" : "当前时间点没有符合条件的活动" }}
                        </div>
                        <div
                            v-for="item in filteredEvents"
                            :key="item.id"
                            class="p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedEventId === item.id }"
                            @click="selectedEventId = item.id"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="font-medium truncate">{{ item.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        {{ formatTimeRange(item.startTime, item.endTime) }}
                                        <span v-if="getVersionByTime(item.startTime)" class="ml-2"
                                            >v{{ getVersionByTime(item.startTime) }}</span
                                        >
                                    </div>
                                </div>
                                <div class="text-xs text-right opacity-70 whitespace-nowrap">ID: {{ item.id }}</div>
                            </div>
                            <div class="text-xs opacity-70 mt-2 line-clamp-2 whitespace-pre-wrap break-all">
                                {{ item.desc }}
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredEvents.length }} 个活动
                </div>
            </div>

            <div v-if="selectedEvent" class="flex-1 overflow-hidden">
                <ScrollArea class="h-full">
                    <DBEventDetailItem :event="selectedEvent" class="flex-1" />
                </ScrollArea>
            </div>
        </div>
    </div>
</template>
