<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import Fuse, { type FuseResultMatch } from "fuse.js"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { execScript } from "@/api/app"
import DBImprDetailItem from "@/components/DBImprDetailItem.vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { getLocalizedImprEntriesByLanguage, type ImprEntry } from "@/data/d/impr"
import { getImprType } from "@/data/d/quest.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { useSettingStore } from "@/store/setting"

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
        map.set(getEntryKey(entry), entry)
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
        baseEntryMap.set(getEntryKey(entry), entry)
    }

    const resultMap = new Map<string, ImprResultItem & { exactCount: number }>()

    for (const entry of baseEntries) {
        const key = getEntryKey(entry)
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
            const key = getEntryKey(result.item)
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
function getEntryKey(entry: ImprEntry): string {
    return [
        entry.sourceType,
        entry.sourceId,
        entry.regionId,
        entry.sourceSubRegionId ?? "",
        entry.valueType,
    ].join("|")
}

/**
 * 选中条目。
 * @param entry 条目
 */
function selectEntry(entry: ImprEntry) {
    selectedEntryKey.value = getEntryKey(entry)
}

/**
 * 判断条目是否为当前选中项。
 * @param entry 印象条目
 * @returns 是否选中
 */
function isSelectedEntry(entry: ImprEntry): boolean {
    return selectedEntryKey.value === getEntryKey(entry)
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
        selectedEntryKey.value = value ? getEntryKey(value) : ""
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
    selectedSelector: '[data-selected="true"]',
})
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedEntry }">
                <div class="p-3 border-b border-base-200 space-y-3">
                    <div class="flex items-center gap-2">
                        <input
                            v-model="searchKeyword"
                            type="text"
                            class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                            placeholder="搜索印象条目"
                        />
                        <button class="btn btn-sm btn-primary" :disabled="ocrRunning" @click="runOcrSearch">OCR</button>
                        <label class="flex items-center gap-1 cursor-pointer select-none whitespace-nowrap">
                            <input v-model="realtimeOcrEnabled" type="checkbox" class="toggle toggle-xs" />
                            <span class="text-xs text-base-content/70">实时</span>
                        </label>
                    </div>

                    <div class="flex items-center gap-4 overflow-x-auto whitespace-nowrap text-xs text-base-content/80">
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                v-model="showRegionFilter"
                                type="checkbox"
                                class="checkbox checkbox-xs"
                                @change="toggleRegionFilter(showRegionFilter)"
                            />
                            <span>地区</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                v-model="showSourceFilter"
                                type="checkbox"
                                class="checkbox checkbox-xs"
                                @change="toggleSourceFilter(showSourceFilter)"
                            />
                            <span>来源</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                v-model="showValueFilter"
                                type="checkbox"
                                class="checkbox checkbox-xs"
                                @change="toggleValueFilter(showValueFilter)"
                            />
                            <span>五维</span>
                        </label>
                    </div>

                    <div v-if="ocrResultText" class="rounded bg-base-200 px-3 py-2 text-xs wrap-break-word">
                        {{ ocrResultText }}
                    </div>

                    <div v-show="showSourceFilter" class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200"
                            :class="selectedSourceType === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectSourceType('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="option in sourceTypeOptions"
                            :key="option.value"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="
                                selectedSourceType === option.value
                                    ? 'bg-primary text-white'
                                    : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectSourceType(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>

                    <div v-show="showRegionFilter" class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200"
                            :class="selectedRegionId === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectRegion('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="region in regionOptions"
                            :key="region.value"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="
                                selectedRegionId === region.value
                                    ? 'bg-primary text-white'
                                    : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectRegion(region.value)"
                        >
                            {{ region.label }}
                        </button>
                    </div>

                    <div v-show="showRegionFilter && selectedRegionId" class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200"
                            :class="
                                selectedSubRegionId === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectSubRegion('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="subRegion in subRegionOptions"
                            :key="subRegion.value"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="
                                selectedSubRegionId === subRegion.value
                                    ? 'bg-primary text-white'
                                    : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectSubRegion(subRegion.value)"
                        >
                            {{ subRegion.label }}
                        </button>
                    </div>

                    <div v-show="showValueFilter" class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200"
                            :class="selectedValueType === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectValueType('')"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="type in IMPRESSION_TYPES"
                            :key="type"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
                            :class="
                                selectedValueType === type ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectValueType(type)"
                        >
                            {{ $t(getImprType(type)) }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="item in filteredEntries"
                            :key="`${item.entry.sourceType}-${item.entry.sourceId}-${item.entry.displayText}`"
                            :data-selected="isSelectedEntry(item.entry) ? 'true' : 'false'"
                            class="p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': isSelectedEntry(item.entry) }"
                            @click="selectEntry(item.entry)"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="flex-1 min-w-0">
                                    <div class="font-medium wrap-break-word">
                                        <span class="text-xs px-2 py-0.5 rounded bg-primary text-white">
                                            {{ $t(`database.${item.entry.sourceType}`) }}
                                        </span>
                                        {{ item.entry.sourceName }}
                                        <CopyID :id="item.entry.sourceId" />
                                    </div>
                                    <div class="text-xs opacity-70 mt-1 flex flex-wrap items-center gap-1.5">
                                        <span>{{ item.entry.displayText }}</span>
                                    </div>
                                    <div
                                        v-if="item.snippet && searchKeyword.trim() && showFullTextSearch"
                                        class="mt-2 text-xs leading-relaxed opacity-85"
                                    >
                                        <span class="opacity-65">匹配：</span>
                                        <span v-if="item.snippet.prefixEllipsis">...</span>
                                        <template
                                            v-for="(segment, index) in item.snippet.segments"
                                            :key="`${item.entry.sourceId}-${index}`"
                                        >
                                            <span
                                                :class="
                                                    segment.highlighted
                                                        ? isSelectedEntry(item.entry)
                                                            ? 'bg-base-100/45 text-primary-content font-semibold px-0.5 rounded underline decoration-primary-content/80 decoration-2 underline-offset-2'
                                                            : 'bg-primary/20 text-base-content font-semibold px-0.5 rounded underline decoration-primary/80 decoration-2 underline-offset-2'
                                                        : ''
                                                "
                                            >
                                                {{ segment.text }}
                                            </span>
                                        </template>
                                        <span v-if="item.snippet.suffixEllipsis">...</span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-white">
                                        {{ item.entry.regionLabel }}
                                    </span>
                                    <span class="text-xs opacity-70">
                                        {{ $t(getImprType(item.entry.valueType)) }}
                                        {{ item.entry.value > 0 ? `+${item.entry.value}` : item.entry.value }}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredEntries.length }} 条印象
                </div>
            </div>

            <div
                v-if="selectedEntry"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedEntry = null"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <div v-if="selectedEntry" class="flex-1 overflow-hidden">
                <ScrollArea class="h-full">
                    <DBImprDetailItem :entry="selectedEntry" />
                </ScrollArea>
            </div>
        </div>
    </div>
</template>
