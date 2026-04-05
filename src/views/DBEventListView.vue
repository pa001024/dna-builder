<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import Fuse, { type FuseResultMatch } from "fuse.js"
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
const showFullTextSearch = useSearchParam<boolean>("fts", false)
const showVersionFilter = useLocalStorage("event.showVersionFilter", true)
const showTimeFilter = useLocalStorage("event.showTimeFilter", true)
const diffOnlyEnabled = useSearchParam("td", false)
const selectedVersion = useSearchParam<string>("ver", "")

interface EventSnippetSegment {
    text: string
    highlighted: boolean
}

interface EventSearchSnippet {
    prefixEllipsis: boolean
    suffixEllipsis: boolean
    segments: EventSnippetSegment[]
}

interface EventSearchResult {
    event: (typeof eventData)[number]
    snippet: EventSearchSnippet | null
}

interface EventFullTextEntry {
    event: (typeof eventData)[number]
    eventId: string
    eventName: string
    searchText: string
    snippets: string[]
}

const eventFullTextEntries = buildEventFullTextEntries()
const eventFullTextFuse = createEventFullTextFuse(eventFullTextEntries)

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
 * 清洗全文搜索片段。
 * @param snippets 原始片段
 * @returns 清洗后的片段
 */
function cleanEventSnippets(snippets: string[]): string[] {
    return Array.from(new Set(snippets.map(snippet => snippet.trim()).filter(Boolean)))
}

/**
 * 收集活动可用于全文搜索的文本片段。
 * @param item 活动项
 * @returns 文本片段
 */
function collectEventSnippets(item: (typeof eventData)[number]): string[] {
    const snippets: string[] = []

    snippets.push(item.name)
    snippets.push(item.desc)

    if (item.rule) {
        snippets.push(item.rule)
    }

    return cleanEventSnippets(snippets)
}

/**
 * 构建活动全文搜索索引。
 * @returns 全文检索索引
 */
function buildEventFullTextEntries(): EventFullTextEntry[] {
    return eventData.map(event => {
        const snippets = collectEventSnippets(event)
        const searchText = [event.id, event.name, event.desc, event.rule, ...snippets]
            .filter(v => v !== undefined && v !== null && `${v}`.trim() !== "")
            .join(" ")

        return {
            event,
            eventId: `${event.id}`,
            eventName: event.name,
            searchText,
            snippets,
        }
    })
}

/**
 * 创建活动全文搜索引擎。
 * @param entries 全文检索索引
 * @returns Fuse 搜索实例
 */
function createEventFullTextFuse(entries: EventFullTextEntry[]): Fuse<EventFullTextEntry> {
    return new Fuse(entries, {
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 1,
        includeMatches: true,
        keys: [
            { name: "eventName", weight: 2.4 },
            { name: "eventId", weight: 2.0 },
            { name: "snippets", weight: 1.8 },
            { name: "searchText", weight: 1.4 },
        ],
    })
}

/**
 * 合并命中区间。
 * @param indices 原始命中区间
 * @returns 合并后的命中区间
 */
function mergeMatchIndices(indices: ReadonlyArray<readonly [number, number]>): [number, number][] {
    if (!indices.length) {
        return []
    }

    const sortedIndices = [...indices].sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []

    for (const [start, end] of sortedIndices) {
        const current = merged[merged.length - 1]
        if (!current || start > current[1] + 1) {
            merged.push([start, end])
            continue
        }

        current[1] = Math.max(current[1], end)
    }

    return merged
}

/**
 * 将命中信息裁剪为摘要并转换为高亮片段。
 * @param text 命中文本
 * @param indices 命中区间
 * @returns 搜索摘要
 */
function buildHighlightedEventSnippet(text: string, indices: ReadonlyArray<readonly [number, number]>): EventSearchSnippet | null {
    const mergedIndices = mergeMatchIndices(indices)
    if (!mergedIndices.length) {
        return null
    }

    const firstMatch = mergedIndices[0]
    const contextSize = 16
    const maxSnippetLength = 120
    const snippetStart = Math.max(0, firstMatch[0] - contextSize)
    let snippetEnd = Math.min(text.length, firstMatch[1] + 1 + contextSize)

    if (snippetEnd - snippetStart > maxSnippetLength) {
        snippetEnd = snippetStart + maxSnippetLength
    }

    const snippetText = text.slice(snippetStart, snippetEnd)
    const localIndices = mergedIndices
        .map(([start, end]) => [Math.max(start, snippetStart), Math.min(end, snippetEnd - 1)] as [number, number])
        .filter(([start, end]) => start <= end)
        .map(([start, end]) => [start - snippetStart, end - snippetStart] as [number, number])

    if (!localIndices.length) {
        return null
    }

    const segments: EventSnippetSegment[] = []
    let cursor = 0

    for (const [start, end] of localIndices) {
        if (start > cursor) {
            segments.push({
                text: snippetText.slice(cursor, start),
                highlighted: false,
            })
        }

        segments.push({
            text: snippetText.slice(start, end + 1),
            highlighted: true,
        })
        cursor = end + 1
    }

    if (cursor < snippetText.length) {
        segments.push({
            text: snippetText.slice(cursor),
            highlighted: false,
        })
    }

    return {
        prefixEllipsis: snippetStart > 0,
        suffixEllipsis: snippetEnd < text.length,
        segments: segments.filter(segment => segment.text !== ""),
    }
}

/**
 * 获取关键词在文本中的全部精确命中区间。
 * @param text 原始文本
 * @param keyword 搜索关键词
 * @returns 命中区间
 */
function findKeywordMatchIndices(text: string, keyword: string): [number, number][] {
    if (keyword === "") {
        return []
    }

    const indices: [number, number][] = []
    let startIndex = 0

    while (startIndex < text.length) {
        const matchIndex = text.indexOf(keyword, startIndex)
        if (matchIndex === -1) {
            break
        }

        indices.push([matchIndex, matchIndex + keyword.length - 1])
        startIndex = matchIndex + keyword.length
    }

    return indices
}

/**
 * 从精确命中的文本片段中提取摘要。
 * @param snippets 可搜索片段
 * @param keyword 搜索关键词
 * @returns 高亮摘要
 */
function getEventSearchSnippet(snippets: readonly string[], keyword: string): EventSearchSnippet | null {
    for (const snippet of snippets) {
        const indices = findKeywordMatchIndices(snippet, keyword)
        if (indices.length) {
            return buildHighlightedEventSnippet(snippet, indices)
        }
    }

    return null
}

/**
 * 从模糊匹配结果中提取摘要。
 * @param matches Fuse 匹配信息
 * @returns 高亮摘要
 */
function getEventFuzzySnippet(matches: readonly FuseResultMatch[] | undefined): EventSearchSnippet | null {
    if (!matches) {
        return null
    }

    const snippetMatch = matches.find(match => match.key === "snippets" && typeof match.value === "string" && match.indices.length > 0)
    if (!snippetMatch || typeof snippetMatch.value !== "string") {
        return null
    }

    return buildHighlightedEventSnippet(snippetMatch.value, snippetMatch.indices)
}

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
 * 当前关键词下的活动全文搜索结果。
 * @returns 搜索结果列表
 */
const eventSearchResults = computed<EventSearchResult[]>(() => {
    const keyword = searchKeyword.value.trim()
    const filtered = eventData.filter(item => {
        const eventVersion = getVersionByTime(item.startTime)
        if (!isVersionAllowed(eventVersion)) {
            return false
        }

        if (selectedVersion.value !== "" && eventVersion !== selectedVersion.value) {
            return false
        }

        if (activeFilterTimestamp.value == null) {
            return true
        }

        if (!diffOnlyEnabled.value) {
            return isEventAvailableAtTime(item, activeFilterTimestamp.value)
        }

        const previousTimestamp = previousSelectedTimePoint.value
        const currentAvailable = isEventAvailableAtTime(item, activeFilterTimestamp.value)
        const previousAvailable = previousTimestamp == null ? false : isEventAvailableAtTime(item, previousTimestamp)
        return currentAvailable !== previousAvailable
    })

    if (keyword === "") {
        return filtered.map(event => ({
            event,
            snippet: null,
        }))
    }

    if (showFullTextSearch.value) {
        return eventFullTextFuse.search(keyword).flatMap(result => {
            if (!filtered.some(item => item.id === result.item.event.id)) {
                return []
            }

            return [
                {
                    event: result.item.event,
                    snippet: getEventFuzzySnippet(result.matches) ?? getEventSearchSnippet(result.item.snippets, keyword),
                },
            ]
        })
    }

    return filtered
        .filter(item => {
            if (`${item.id}`.includes(keyword) || item.name.includes(keyword) || item.desc.includes(keyword)) {
                return true
            }

            return matchPinyin(item.name, keyword).match || matchPinyin(item.desc, keyword).match
        })
        .map(event => ({
            event,
            snippet: getEventSearchSnippet(collectEventSnippets(event), keyword),
        }))
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
const filteredEvents = computed(() => eventSearchResults.value.map(result => result.event))

/**
 * 获取活动对应的全文搜索结果。
 * @param event 活动项
 * @returns 搜索结果
 */
function getEventSearchResult(event: (typeof eventData)[number]): EventSearchResult | null {
    return eventSearchResults.value.find(result => result.event.id === event.id) || null
}

/**
 * 获取活动的匹配片段。
 * @param event 活动项
 * @returns 匹配片段
 */
function getEventSnippet(event: (typeof eventData)[number]): EventSearchSnippet | null {
    return getEventSearchResult(event)?.snippet || null
}

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
 * 收起活动详情面板。
 */
function closeSelectedEvent(): void {
    selectedEventId.value = 0
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
                        :placeholder="
                            showFullTextSearch ? '全文搜索活动名称/描述/规则（不支持拼音）...' : '搜索活动ID/名称/描述（支持拼音）...'
                        "
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
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input v-model="showFullTextSearch" type="checkbox" class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">全文搜索</span>
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
                            <div
                                v-if="showFullTextSearch && searchKeyword.trim() && getEventSnippet(item)?.segments?.length"
                                class="mt-2 text-xs leading-relaxed opacity-85"
                            >
                                <span class="opacity-65">匹配：</span>
                                <span v-if="getEventSnippet(item)?.prefixEllipsis">...</span>
                                <template v-for="(segment, index) in getEventSnippet(item)?.segments || []" :key="`${item.id}-${index}`">
                                    <span
                                        :class="
                                            segment.highlighted
                                                ? selectedEventId === item.id
                                                    ? 'bg-base-100/45 text-primary-content font-semibold px-0.5 rounded underline decoration-primary-content/80 decoration-2 underline-offset-2'
                                                    : 'bg-primary/20 text-base-content font-semibold px-0.5 rounded underline decoration-primary/80 decoration-2 underline-offset-2'
                                                : ''
                                        "
                                    >
                                        {{ segment.text }}
                                    </span>
                                </template>
                                <span v-if="getEventSnippet(item)?.suffixEllipsis">...</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredEvents.length }} 个活动
                </div>
            </div>

            <div
                v-if="selectedEvent"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="closeSelectedEvent"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedEvent" class="flex-2">
                <DBEventDetailItem :event="selectedEvent" class="flex-1" />
            </ScrollArea>
        </div>
    </div>
</template>
