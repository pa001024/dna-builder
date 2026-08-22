<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import Fuse, { type FuseResultMatch } from "fuse.js"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { execScript } from "@/api/app"
import DBImprDetailItem from "@/components/DBImprDetailItem.vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { getImprEntryKey, getLocalizedImprEntriesByLanguage, type ImprEntry } from "@/data/d/impr"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { useSettingStore } from "@/store/setting"
import { getImprType } from "@/utils/quest-utils"

interface ImprSnippetSegment {
    text: string
    highlighted: boolean
}

interface ImprSearchSnippet {
    prefixEllipsis: boolean
    suffixEllipsis: boolean
    segments: ImprSnippetSegment[]
}

interface ImprResultItem {
    entry: ImprEntry
    snippet: ImprSearchSnippet | null
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedRegionId = useSearchParam<string>("rg", "")
const selectedSubRegionId = useSearchParam<string>("srg", "")
const selectedValueType = useSearchParam<string>("tp", "")
const selectedSourceType = useSearchParam<string>("st", "")
const selectedEntryKey = useSearchParam<string>("id", "")
const showFullTextSearch = true
const showRegionFilter = useLocalStorage("dbimpr.showRegionFilter", true)
const showSourceFilter = useLocalStorage("dbimpr.showSourceFilter", true)
const showValueFilter = useLocalStorage("dbimpr.showValueFilter", true)
const settingStore = useSettingStore()
const imprEntries = ref<ImprEntry[]>([])
const ocrResultText = ref("")
const ocrRunning = ref(false)
const realtimeOcrEnabled = ref(false)
let realtimeOcrTimer: ReturnType<typeof setInterval> | null = null

const IMPRESSION_TYPES = ["Empathy", "Chaos", "Morality", "Wisdom", "Benefit"] as const
const sourceTypeOptions = [
    { value: "npc", label: "NPC" },
    { value: "dynquest", label: "派遣委托" },
    { value: "questchain", label: "任务" },
] as const
const searchKeywords = computed(() => splitSearchKeywords(searchKeyword.value))

/**
 * 按条目键构建条目映射。
 */
const imprEntryMap = computed(() => {
    const map = new Map<string, ImprEntry>()
    for (const entry of imprEntries.value) {
        map.set(getImprEntryKey(entry), entry)
    }
    return map
})

/**
 * 获取地区名称。
 * @param regionId 地区 ID
 * @returns 地区名称
 */
function getRegionName(regionId: number): string {
    return regionMap.get(regionId)?.name || `地区${regionId}`
}

/**
 * 获取子区域名称。
 * @param subRegionId 子区域 ID
 * @returns 子区域名称
 */
function getSubRegionName(subRegionId: number): string {
    return subRegionMap.get(subRegionId)?.name || `子区域${subRegionId}`
}

/**
 * 获取所有地区筛选项。
 */
const regionOptions = computed(() => {
    const regionIds = new Set<number>()
    for (const entry of imprEntries.value) {
        regionIds.add(entry.regionId)
    }

    return Array.from(regionIds)
        .sort((left, right) => left - right)
        .map(regionId => ({
            value: `${regionId}`,
            label: getRegionName(regionId),
        }))
})

/**
 * 获取当前地区下的子区域筛选项。
 */
const subRegionOptions = computed(() => {
    const regionId = selectedRegionId.value ? Number(selectedRegionId.value) : 0
    const subRegionIds = new Set<number>()

    for (const entry of imprEntries.value) {
        if (selectedRegionId.value && entry.regionId !== regionId) {
            continue
        }
        if (entry.sourceSubRegionId) {
            subRegionIds.add(entry.sourceSubRegionId)
        }
    }

    return Array.from(subRegionIds)
        .sort((left, right) => left - right)
        .map(subRegionId => ({
            value: `${subRegionId}`,
            label: getSubRegionName(subRegionId),
        }))
})

/**
 * 加载当前语言的印象条目。
 * @param language 语言代码
 */
async function loadImprEntries(language: string): Promise<void> {
    imprEntries.value = await getLocalizedImprEntriesByLanguage(language)
}

watch(
    () => settingStore.lang,
    async language => {
        await loadImprEntries(language)
    },
    { immediate: true }
)

/**
 * 创建全文搜索引擎。
 */
const imprFuse = computed(() => {
    return new Fuse(imprEntries.value, {
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 1,
        includeMatches: true,
        keys: [
            { name: "displayText", weight: 2.0 },
            { name: "searchText", weight: 2.0 },
        ],
    })
})

/**
 * 构建高亮片段。
 * @param text 原始文本
 * @param indices 命中区间
 * @returns 高亮摘要
 */
function buildHighlightedSnippet(text: string, indices: ReadonlyArray<readonly [number, number]>): ImprSearchSnippet | null {
    if (!indices.length) {
        return null
    }

    const sorted = [...indices].sort((left, right) => left[0] - right[0])
    const merged: [number, number][] = []
    for (const [start, end] of sorted) {
        const current = merged[merged.length - 1]
        if (!current || start > current[1] + 1) {
            merged.push([start, end])
            continue
        }
        current[1] = Math.max(current[1], end)
    }

    const firstMatch = merged[0]
    const contextSize = 18
    const snippetStart = Math.max(0, firstMatch[0] - contextSize)
    let snippetEnd = Math.min(text.length, firstMatch[1] + 1 + contextSize)
    if (snippetEnd - snippetStart > 120) {
        snippetEnd = snippetStart + 120
    }

    const snippetText = text.slice(snippetStart, snippetEnd)
    const localIndices = merged
        .map(([start, end]) => [Math.max(start, snippetStart), Math.min(end, snippetEnd - 1)] as [number, number])
        .filter(([start, end]) => start <= end)
        .map(([start, end]) => [start - snippetStart, end - snippetStart] as [number, number])

    const segments: ImprSnippetSegment[] = []
    let cursor = 0
    for (const [start, end] of localIndices) {
        if (start > cursor) {
            segments.push({ text: snippetText.slice(cursor, start), highlighted: false })
        }
        segments.push({ text: snippetText.slice(start, end + 1), highlighted: true })
        cursor = end + 1
    }
    if (cursor < snippetText.length) {
        segments.push({ text: snippetText.slice(cursor), highlighted: false })
    }

    return {
        prefixEllipsis: snippetStart > 0,
        suffixEllipsis: snippetEnd < text.length,
        segments: segments.filter(segment => segment.text !== ""),
    }
}

/**
 * 提取精确关键词命中区间。
 * @param text 原始文本
 * @param keyword 搜索关键词
 * @returns 命中区间
 */
function findKeywordMatchIndices(text: string, keyword: string): [number, number][] {
    if (!keyword) {
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
 * 从 Fuse 命中提取摘要。
 * @param matches Fuse 匹配信息
 * @returns 高亮摘要
 */
function getFuzzySnippet(matches: readonly FuseResultMatch[] | undefined): ImprSearchSnippet | null {
    const match = matches?.find(item => item.key === "displayText" && typeof item.value === "string" && item.indices.length > 0)
    if (!match || typeof match.value !== "string") {
        return null
    }
    return buildHighlightedSnippet(match.value, match.indices)
}

/**
 * 拆分搜索关键词为多行。
 * @param keyword 原始关键词
 * @returns 分句后的关键词列表
 */
function splitSearchKeywords(keyword: string): string[] {
    return keyword
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
}

/**
 * 处理来源类型筛选。
 * @param value 来源类型
 */
function selectSourceType(value: string) {
    selectedSourceType.value = value
}

/**
 * 切换来源筛选显示状态。
 * @param enabled 是否显示
 */
function toggleSourceFilter(enabled: boolean) {
    if (!enabled) {
        selectedSourceType.value = ""
    }
}

/**
 * 处理地区筛选。
 * @param value 地区 ID
 */
function selectRegion(value: string) {
    selectedRegionId.value = value
    selectedSubRegionId.value = ""
}

/**
 * 切换地区筛选显示状态。
 * @param enabled 是否显示
 */
function toggleRegionFilter(enabled: boolean) {
    if (!enabled) {
        selectedRegionId.value = ""
        selectedSubRegionId.value = ""
    }
}

/**
 * 处理子区域筛选。
 * @param value 子区域 ID
 */
function selectSubRegion(value: string) {
    selectedSubRegionId.value = value
}

/**
 * 处理五维筛选。
 * @param value 五维类型
 */
function selectValueType(value: string) {
    selectedValueType.value = value
}

/**
 * 切换五维筛选显示状态。
 * @param enabled 是否显示
 */
function toggleValueFilter(enabled: boolean) {
    if (!enabled) {
        selectedValueType.value = ""
    }
}

/**
 * 切换地区筛选行显示状态（方章开关）。
 */
function toggleRegionFilterRow() {
    showRegionFilter.value = !showRegionFilter.value
    toggleRegionFilter(showRegionFilter.value)
}

/**
 * 切换来源筛选行显示状态（方章开关）。
 */
function toggleSourceFilterRow() {
    showSourceFilter.value = !showSourceFilter.value
    toggleSourceFilter(showSourceFilter.value)
}

/**
 * 切换五维筛选行显示状态（方章开关）。
 */
function toggleValueFilterRow() {
    showValueFilter.value = !showValueFilter.value
    toggleValueFilter(showValueFilter.value)
}

/**
 * 判断是否满足筛选条件。
 * @param entry 印象条目
 * @returns 是否匹配
 */
function passesFilters(entry: ImprEntry): boolean {
    if (selectedRegionId.value && `${entry.regionId}` !== selectedRegionId.value) {
        return false
    }
    if (selectedSubRegionId.value && `${entry.sourceSubRegionId ?? ""}` !== selectedSubRegionId.value) {
        return false
    }
    if (selectedValueType.value && entry.valueType !== selectedValueType.value) {
        return false
    }
    if (selectedSourceType.value && entry.sourceType !== selectedSourceType.value) {
        return false
    }
    return true
}

/**
 * 过滤后的结果。
 */
const filteredEntries = computed<ImprResultItem[]>(() => {
    const keywords = searchKeywords.value
    const baseEntries = imprEntries.value.filter(passesFilters)

    if (!keywords.length) {
        return baseEntries.map(entry => ({ entry, snippet: null }))
    }

    const baseEntryMap = new Map<string, ImprEntry>()
    for (const entry of baseEntries) {
        baseEntryMap.set(getImprEntryKey(entry), entry)
    }

    const resultMap = new Map<string, ImprResultItem & { exactCount: number }>()

    for (const entry of baseEntries) {
        const key = getImprEntryKey(entry)
        let exactCount = 0
        let snippet: ImprSearchSnippet | null = null

        for (const keyword of keywords) {
            const exactIndices = findKeywordMatchIndices(entry.displayText, keyword)
            if (!exactIndices.length) {
                continue
            }

            exactCount += 1
            if (!snippet) {
                snippet = buildHighlightedSnippet(entry.displayText, exactIndices)
            }
        }

        if (exactCount > 0) {
            resultMap.set(key, {
                entry,
                snippet,
                exactCount,
            })
        }
    }

    for (const keyword of keywords) {
        const fuzzyResults = imprFuse.value.search(keyword)
        for (const result of fuzzyResults) {
            const key = getImprEntryKey(result.item)
            if (!baseEntryMap.has(key) || resultMap.has(key)) {
                continue
            }

            resultMap.set(key, {
                entry: result.item,
                snippet: getFuzzySnippet(result.matches),
                exactCount: 0,
            })
        }
    }

    return Array.from(resultMap.values())
        .sort((left, right) => right.exactCount - left.exactCount)
        .map(({ exactCount: _exactCount, ...item }) => item)
})

/**
 * 生成印象条目持久化键。
 * @param entry 印象条目
 * @returns 持久化键
 */
/**
 * 选中条目。
 * @param entry 条目
 */
function selectEntry(entry: ImprEntry) {
    selectedEntryKey.value = getImprEntryKey(entry)
}

/**
 * 判断条目是否为当前选中项。
 * @param entry 印象条目
 * @returns 是否选中
 */
function isSelectedEntry(entry: ImprEntry): boolean {
    return selectedEntryKey.value === getImprEntryKey(entry)
}

/**
 * 当前选中条目。
 */
const selectedEntry = computed<ImprEntry | null>({
    get: () => {
        if (!selectedEntryKey.value) {
            return null
        }

        return imprEntryMap.value.get(selectedEntryKey.value) ?? null
    },
    set: value => {
        selectedEntryKey.value = value ? getImprEntryKey(value) : ""
    },
})

/**
 * 构建 OCR 脚本内容。
 * @returns 脚本源码
 */
function buildOcrScript(): string {
    return `const hwnd = getWindowByProcessName("EM-Win64-Shipping.exe")
if (!hwnd) throw new Error("未找到游戏窗口")
initOcr()
const rect = winGetClientPos(hwnd)
if (!rect) throw new Error("未找到客户区")
const [clientX, clientY, clientW, clientH] = rect
const baseW = 1600
const baseH = 900
const TITLE_BAR_HEIGHT = 30
const frame = captureWindow(
    hwnd,
    Math.round(1000 * clientW / baseW),
    TITLE_BAR_HEIGHT+ Math.round(535 * clientH / (baseH+TITLE_BAR_HEIGHT)),
    Math.round(452 * clientW / baseW),
    TITLE_BAR_HEIGHT+ Math.round(183 * clientH / (baseH+TITLE_BAR_HEIGHT)),
)
ocrText(frame)
`
}

/**
 * 执行一次 OCR 并更新搜索词。
 */
async function runOcrSearch(): Promise<void> {
    if (ocrRunning.value) {
        return
    }

    ocrRunning.value = true
    try {
        const resultText = (await execScript(buildOcrScript(), "__db_impr_ocr__", 30e3)).trim()
        if (resultText) {
            ocrResultText.value = resultText
            searchKeyword.value = resultText
        }
    } finally {
        ocrRunning.value = false
    }
}

watch(
    realtimeOcrEnabled,
    enabled => {
        if (realtimeOcrTimer) {
            clearInterval(realtimeOcrTimer)
            realtimeOcrTimer = null
        }
        if (!enabled) {
            return
        }

        realtimeOcrTimer = setInterval(() => {
            void runOcrSearch()
        }, 1000)
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    if (realtimeOcrTimer) {
        clearInterval(realtimeOcrTimer)
    }
})

useInitialScrollToSelectedItem({
    selectedSelector: ".dbim-item-active",
})
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedEntry }">
                <!-- 检索带：下划线搜索 + OCR + 过滤器开关方章 -->
                <div class="flex-none space-y-3 border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <!-- 下划线搜索框 + OCR -->
                    <div class="flex items-center gap-2">
                        <div class="relative min-w-0 flex-1">
                            <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                            <input
                                v-model="searchKeyword"
                                type="text"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                                placeholder="搜索印象条目"
                            />
                            <span
                                class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                            >
                                {{ filteredEntries.length }}
                            </span>
                        </div>
                        <button class="btn btn-sm btn-primary" :disabled="ocrRunning" @click="runOcrSearch">OCR</button>
                        <label class="flex cursor-pointer select-none items-center gap-1 whitespace-nowrap">
                            <input v-model="realtimeOcrEnabled" type="checkbox" class="toggle toggle-xs" />
                            <span class="text-xs text-base-content/60">实时</span>
                        </label>
                    </div>

                    <!-- 过滤器开关方章 -->
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showRegionFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleRegionFilterRow()"
                        >
                            地区
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showSourceFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleSourceFilterRow()"
                        >
                            来源
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showValueFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleValueFilterRow()"
                        >
                            五维
                        </button>
                    </div>

                    <!-- OCR 识别结果 -->
                    <div
                        v-if="ocrResultText"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 text-xs wrap-break-word text-base-content/70"
                    >
                        {{ ocrResultText }}
                    </div>

                    <!-- 来源筛选 -->
                    <div v-show="showSourceFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">来源</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSourceType === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectSourceType('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="option in sourceTypeOptions"
                            :key="option.value"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSourceType === option.value
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectSourceType(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>

                    <!-- 地区筛选 -->
                    <div v-show="showRegionFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">地区</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRegionId === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectRegion('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="region in regionOptions"
                            :key="region.value"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRegionId === region.value
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectRegion(region.value)"
                        >
                            {{ region.label }}
                        </button>
                    </div>

                    <!-- 子区域筛选 -->
                    <div v-show="showRegionFilter && selectedRegionId" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">子区域</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSubRegionId === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectSubRegion('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="subRegion in subRegionOptions"
                            :key="subRegion.value"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSubRegionId === subRegion.value
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectSubRegion(subRegion.value)"
                        >
                            {{ $t(subRegion.label) }}
                        </button>
                    </div>

                    <!-- 五维筛选 -->
                    <div v-show="showValueFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">五维</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedValueType === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectValueType('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="type in IMPRESSION_TYPES"
                            :key="type"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedValueType === type
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectValueType(type)"
                        >
                            {{ $t(getImprType(type)) }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="space-y-2 p-3">
                        <article
                            v-for="(item, index) in filteredEntries"
                            :key="getImprEntryKey(item.entry)"
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                isSelectedEntry(item.entry)
                                    ? 'dbim-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectEntry(item.entry)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="isSelectedEntry(item.entry) ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex items-start justify-between gap-3 p-3">
                                <div class="min-w-0 flex-1">
                                    <!-- 来源徽记 + 名称 + ID -->
                                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span
                                            class="shrink-0 rounded-xs border border-base-content/15 px-1.5 text-[10px] leading-4 tracking-wide text-base-content/55"
                                        >
                                            {{ $t(`database.${item.entry.sourceType}`) }}
                                        </span>
                                        <span
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': isSelectedEntry(item.entry) }"
                                        >
                                            {{ item.entry.sourceName }}
                                        </span>
                                        <CopyID :id="item.entry.sourceId" />
                                    </div>
                                    <div class="mt-1.5 text-xs leading-relaxed wrap-break-word text-base-content/70">
                                        {{ item.entry.displayText }}
                                    </div>
                                    <!-- 搜索命中摘要 -->
                                    <div
                                        v-if="item.snippet && searchKeyword.trim() && showFullTextSearch"
                                        class="mt-2 text-xs leading-relaxed wrap-break-word text-base-content/55"
                                    >
                                        <span>匹配：</span>
                                        <span v-if="item.snippet.prefixEllipsis">...</span>
                                        <template
                                            v-for="(segment, segIndex) in item.snippet.segments"
                                            :key="`${item.entry.sourceId}-${segIndex}`"
                                        >
                                            <span
                                                :class="
                                                    segment.highlighted
                                                        ? 'rounded-xs bg-primary/20 px-0.5 font-semibold text-primary underline decoration-primary/80 decoration-2 underline-offset-2'
                                                        : ''
                                                "
                                            >
                                                {{ segment.text }}
                                            </span>
                                        </template>
                                        <span v-if="item.snippet.suffixEllipsis">...</span>
                                    </div>
                                </div>
                                <!-- 地区 + 五维数值 -->
                                <div class="flex shrink-0 flex-col items-end gap-1">
                                    <span
                                        class="rounded-xs border border-base-content/15 px-1.5 text-[10px] leading-4 tracking-wide text-base-content/55"
                                    >
                                        {{ item.entry.regionLabel }}
                                    </span>
                                    <span class="text-right text-[11px] leading-5 text-base-content/55">
                                        {{ $t(getImprType(item.entry.valueType)) }}
                                        <b class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                            {{ item.entry.value > 0 ? `+${item.entry.value}` : item.entry.value }}
                                        </b>
                                    </span>
                                </div>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-center text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredEntries.length }}</b> 条印象
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedEntry"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedEntry = null"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <div v-if="selectedEntry" class="flex-1 overflow-hidden">
                <ScrollArea class="h-full">
                    <DBImprDetailItem :key="selectedEntryKey" :entry="selectedEntry" />
                </ScrollArea>
            </div>
        </div>
    </div>
</template>
