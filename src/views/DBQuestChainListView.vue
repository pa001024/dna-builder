<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import Fuse, { type FuseResultMatch } from "fuse.js"
import { computed, ref, watch } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import type { QuestItem, QuestStory } from "@/data/d/quest.data"
import questChainData, { type QuestChain } from "@/data/d/questchain.data"
import { getLocalizedQuestDataByLanguage } from "@/data/d/story-locale"
import { useSettingStore } from "@/store/setting"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getQuestTypeDisplay } from "@/utils/quest-utils"

interface QuestChainSnippetSegment {
    text: string
    highlighted: boolean
}

interface QuestChainSearchSnippet {
    prefixEllipsis: boolean
    suffixEllipsis: boolean
    segments: QuestChainSnippetSegment[]
}

interface QuestChainSearchResult {
    questChain: QuestChain
    snippet: QuestChainSearchSnippet | null
}

interface QuestChainFullTextEntry {
    questChain: QuestChain
    chainId: string
    chainName: string
    chapter: string
    episode: string
    snippets: string[]
    searchText: string
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedQuestChainId = useSearchParam<number>("id", 0)
const showImprCheckOnly = useSearchParam<boolean>("ico", false)
const showImprIncreaseOnly = useSearchParam<boolean>("iio", false)
const showFullTextSearch = useSearchParam<boolean>("fts", false)
const selectedVersion = useSearchParam<string>("ver", "")
const selectedType = useSearchParam<number>("tp", 0)
const settingStore = useSettingStore()
const localizedQuestData = ref<QuestStory[]>([])
const showVersionFilter = useLocalStorage("questchain.showVersionFilter", false)
const showTypeFilter = useLocalStorage("questchain.showTypeFilter", false)

interface QuestTypeFilterOption {
    value: number
    rawTypes: number[]
    display: ReturnType<typeof getQuestTypeDisplay>
}

const QUEST_TYPE_GROUP_MAP: Record<number, number> = {
    1: 1,
    2: 1,
    3: 3,
    4: 3,
    5: 5,
    6: 6,
}

/**
 * 异步加载当前语言任务剧情数据，并忽略过期结果。
 * @param language 设置语言代码
 */
async function loadLocalizedQuestData(language: string): Promise<void> {
    const data = await getLocalizedQuestDataByLanguage(language)
    if (settingStore.lang !== language) {
        return
    }
    localizedQuestData.value = data
}

watch(
    () => settingStore.lang,
    async language => {
        await loadLocalizedQuestData(language)
    },
    { immediate: true }
)

/**
 * 构建任务详情映射，便于按任务 ID 快速读取对话数据。
 * @param questStories 任务剧情集合
 * @returns 任务详情映射
 */
function buildQuestItemMap(questStories: QuestStory[]): Map<number, QuestItem> {
    const map = new Map<number, QuestItem>()

    for (const questStory of questStories) {
        for (const questItem of questStory.quests) {
            map.set(questItem.id, questItem)
        }
    }

    return map
}

/**
 * 清洗搜索片段，去除空文本并去重。
 * @param snippets 原始片段
 * @returns 清洗后的片段
 */
function cleanSnippets(snippets: string[]): string[] {
    return Array.from(new Set(snippets.map(snippet => snippet.trim()).filter(Boolean)))
}

/**
 * 收集任务链可用于全文搜索的文本片段。
 * @param questChain 任务链
 * @param itemMap 任务详情映射
 * @returns 文本片段
 */
function collectQuestChainSnippets(questChain: QuestChain, itemMap: Map<number, QuestItem>): string[] {
    const snippets: string[] = []

    for (const quest of questChain.quests) {
        const questItem = itemMap.get(quest.id)
        if (!questItem) {
            continue
        }

        if (questItem.name) {
            snippets.push(questItem.name)
        }
        if (questItem.desc) {
            snippets.push(questItem.desc)
        }

        for (const node of questItem.nodes ?? []) {
            if (node.name) {
                snippets.push(node.name)
            }

            for (const dialogue of node.dialogues ?? []) {
                if (dialogue.content) {
                    snippets.push(dialogue.content)
                }

                for (const option of dialogue.options ?? []) {
                    if (option.content) {
                        snippets.push(option.content)
                    }
                }
            }
        }
    }

    return cleanSnippets(snippets)
}

/**
 * 构建任务链全文检索索引。
 * @param itemMap 任务详情映射
 * @returns 全文检索索引
 */
function buildQuestChainFullTextEntries(itemMap: Map<number, QuestItem>): QuestChainFullTextEntry[] {
    return questChainData.map(questChain => {
        const snippets = collectQuestChainSnippets(questChain, itemMap)
        const chapterText = `${questChain.chapterName} ${questChain.chapterNumber || ""}`.trim()
        const searchText = [questChain.id, questChain.name, chapterText, questChain.episode, questChain.type, questChain.main, ...snippets]
            .filter(v => v !== undefined && v !== null && `${v}`.trim() !== "")
            .join(" ")

        return {
            questChain,
            chainId: `${questChain.id}`,
            chainName: questChain.name,
            chapter: chapterText,
            episode: questChain.episode,
            snippets,
            searchText,
        }
    })
}

/**
 * 创建任务链全文搜索引擎。
 * @param entries 全文检索索引
 * @returns Fuse 搜索实例
 */
function createQuestChainFullTextFuse(entries: QuestChainFullTextEntry[]): Fuse<QuestChainFullTextEntry> {
    return new Fuse(entries, {
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 1,
        includeMatches: true,
        keys: [
            { name: "chainName", weight: 2.4 },
            { name: "chainId", weight: 2.0 },
            { name: "chapter", weight: 1.2 },
            { name: "episode", weight: 1.0 },
            { name: "snippets", weight: 1.8 },
            { name: "searchText", weight: 1.4 },
        ],
    })
}

/**
 * 构建包含印象检定选项的任务 ID 集合。
 * @param questStories 任务剧情集合
 * @returns 任务 ID 集合
 */
function buildQuestImprCheckIdSet(questStories: QuestStory[]): Set<number> {
    const questIdSet = new Set<number>()

    for (const questStory of questStories) {
        for (const questItem of questStory.quests) {
            const hasImprCheck = (questItem.nodes ?? []).some(node => {
                return node.dialogues?.some(dialogue => dialogue.options?.some(option => !!option.imprCheck))
            })

            if (hasImprCheck) {
                questIdSet.add(questItem.id)
            }
        }
    }

    return questIdSet
}

/**
 * 构建包含印象增加选项的任务 ID 集合。
 * @param questStories 任务剧情集合
 * @returns 任务 ID 集合
 */
function buildQuestImprIncreaseIdSet(questStories: QuestStory[]): Set<number> {
    const questIdSet = new Set<number>()

    for (const questStory of questStories) {
        for (const questItem of questStory.quests) {
            const hasImprIncrease = (questItem.nodes ?? []).some(node => {
                return node.dialogues?.some(dialogue => {
                    return dialogue.options?.some(option => {
                        return !!option.impr && option.impr[2] > 0
                    })
                })
            })

            if (hasImprIncrease) {
                questIdSet.add(questItem.id)
            }
        }
    }

    return questIdSet
}

/**
 * 构建任务链 ID 集合。
 * @param questIdSet 任务 ID 集合
 * @returns 任务链 ID 集合
 */
function buildQuestChainIdSetByQuestIds(questIdSet: Set<number>): Set<number> {
    const questChainIdSet = new Set<number>()

    for (const questChain of questChainData) {
        const hasMatchedQuest = questChain.quests.some(quest => questIdSet.has(quest.id))
        if (hasMatchedQuest) {
            questChainIdSet.add(questChain.id)
        }
    }

    return questChainIdSet
}

/**
 * 汇总任务链类型列表。
 * @returns 类型列表
 */
const questTypeOptions = computed<QuestTypeFilterOption[]>(() => {
    const groupedTypes = new Map<number, number[]>()

    for (const questChain of questChainData) {
        if (!questChain.type) {
            continue
        }

        const groupType = QUEST_TYPE_GROUP_MAP[questChain.type] || questChain.type
        const current = groupedTypes.get(groupType) || []
        if (!current.includes(questChain.type)) {
            current.push(questChain.type)
        }
        groupedTypes.set(groupType, current)
    }

    return Array.from(groupedTypes.entries())
        .sort(([left], [right]) => left - right)
        .map(([value, rawTypes]) => ({
            value,
            rawTypes,
            display: getQuestTypeDisplay(value),
        }))
})

/**
 * 解析当前选中的任务类型组。
 * @returns 当前类型组
 */
const selectedTypeGroup = computed<number>({
    get() {
        return QUEST_TYPE_GROUP_MAP[selectedType.value] || selectedType.value
    },
    set(value) {
        selectedType.value = value
    },
})

/**
 * 当前语言对应的任务详情映射。
 */
const questItemMap = computed(() => {
    return buildQuestItemMap(localizedQuestData.value)
})

/**
 * 当前语言的任务链全文搜索索引。
 */
const questChainFullTextEntries = computed(() => {
    return buildQuestChainFullTextEntries(questItemMap.value)
})

/**
 * 当前语言的任务链全文搜索引擎。
 */
const questChainFullTextFuse = computed(() => {
    return createQuestChainFullTextFuse(questChainFullTextEntries.value)
})

/**
 * 当前语言包含印象检定的任务 ID 集合。
 */
const questImprCheckIdSet = computed(() => {
    return buildQuestImprCheckIdSet(localizedQuestData.value)
})

/**
 * 当前语言包含印象增加的任务 ID 集合。
 */
const questImprIncreaseIdSet = computed(() => {
    return buildQuestImprIncreaseIdSet(localizedQuestData.value)
})

/**
 * 当前语言包含印象检定的任务链 ID 集合。
 */
const questChainImprCheckIdSet = computed(() => {
    return buildQuestChainIdSetByQuestIds(questImprCheckIdSet.value)
})

/**
 * 当前语言包含印象增加的任务链 ID 集合。
 */
const questChainImprIncreaseIdSet = computed(() => {
    return buildQuestChainIdSetByQuestIds(questImprIncreaseIdSet.value)
})

/**
 * 根据 ID 获取选中的任务链。
 */
const selectedQuestChain = computed(() => {
    return selectedQuestChainId.value ? questChainData.find(questChain => questChain.id === selectedQuestChainId.value) || null : null
})

/**
 * 判断任务链是否包含印象检定。
 * @param questChainId 任务链 ID
 * @returns 是否包含印象检定
 */
function hasQuestChainImprCheck(questChainId: number): boolean {
    return questChainImprCheckIdSet.value.has(questChainId)
}

/**
 * 判断任务链是否包含印象增加。
 * @param questChainId 任务链 ID
 * @returns 是否包含印象增加
 */
function hasQuestChainImprIncrease(questChainId: number): boolean {
    return questChainImprIncreaseIdSet.value.has(questChainId)
}

/**
 * 判断任务链是否满足顶部筛选开关条件。
 * @param questChain 任务链
 * @returns 是否满足条件
 */
function passesQuestChainSwitchFilters(questChain: QuestChain): boolean {
    if (selectedTypeGroup.value !== 0) {
        const currentOption = questTypeOptions.value.find(option => option.value === selectedTypeGroup.value)
        if (!currentOption || !currentOption.rawTypes.includes(questChain.type)) {
            return false
        }
    }

    if (showImprCheckOnly.value && !hasQuestChainImprCheck(questChain.id)) {
        return false
    }

    if (showImprIncreaseOnly.value && !hasQuestChainImprIncrease(questChain.id)) {
        return false
    }

    if (selectedVersion.value && (questChain.版本 || "") !== selectedVersion.value) {
        return false
    }

    return true
}

/**
 * 处理筛选项显示开关变化。
 * @param filterName 筛选项名称
 * @param show 是否显示
 */
function toggleFilter(filterName: "type", show: boolean) {
    if (!show) {
        if (filterName === "type") {
            selectedType.value = 0
        }
    }
}

/**
 * 切换类型筛选行显示状态；收起时清空类型筛选值，避免隐藏后筛选仍生效。
 */
function toggleTypeFilterRow() {
    showTypeFilter.value = !showTypeFilter.value
    toggleFilter("type", showTypeFilter.value)
}

/**
 * 合并命中区间，避免相邻高亮块重复渲染。
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
function buildHighlightedSnippet(text: string, indices: ReadonlyArray<readonly [number, number]>): QuestChainSearchSnippet | null {
    const mergedIndices = mergeMatchIndices(indices)
    if (!mergedIndices.length) {
        return null
    }

    const firstMatch = mergedIndices[0]
    const contextSize = 16
    const maxSnippetLength = 120
    let snippetStart = Math.max(0, firstMatch[0] - contextSize)
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

    const segments: QuestChainSnippetSegment[] = []
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
 * 从精确命中的文本片段中提取最合适的对话高亮摘要。
 * @param snippets 可搜索片段
 * @param keyword 搜索关键词
 * @returns 对话高亮摘要
 */
function getQuestChainSearchSnippet(snippets: readonly string[], keyword: string): QuestChainSearchSnippet | null {
    for (const snippet of snippets) {
        const indices = findKeywordMatchIndices(snippet, keyword)
        if (indices.length) {
            return buildHighlightedSnippet(snippet, indices)
        }
    }

    return null
}

/**
 * 从模糊匹配结果中提取最合适的对话高亮摘要。
 * @param matches Fuse 匹配信息
 * @returns 对话高亮摘要
 */
function getQuestChainFuzzySnippet(matches: readonly FuseResultMatch[] | undefined): QuestChainSearchSnippet | null {
    if (!matches) {
        return null
    }

    const snippetMatch = matches.find(match => match.key === "snippets" && typeof match.value === "string" && match.indices.length > 0)
    if (!snippetMatch || typeof snippetMatch.value !== "string") {
        return null
    }

    return buildHighlightedSnippet(snippetMatch.value, snippetMatch.indices)
}

/**
 * 按关键词与筛选条件过滤任务链。
 */
const filteredQuestChains = computed<QuestChainSearchResult[]>(() => {
    if (showFullTextSearch.value) {
        const keyword = searchKeyword.value.trim()
        if (keyword === "") {
            return questChainData.filter(passesQuestChainSwitchFilters).map(questChain => ({
                questChain,
                snippet: null,
            }))
        }

        const reorderedResults = questChainFullTextFuse.value
            .search(keyword, { limit: 300 })
            .filter(result => passesQuestChainSwitchFilters(result.item.questChain))
        const exactResults = reorderedResults
            .filter(result => result.item.searchText.includes(keyword))
            .map(result => ({
                questChain: result.item.questChain,
                snippet: getQuestChainSearchSnippet(result.item.snippets, keyword) ?? getQuestChainFuzzySnippet(result.matches),
            }))
        const fuzzyResults = reorderedResults
            .filter(result => !result.item.searchText.includes(keyword))
            .map(result => ({
                questChain: result.item.questChain,
                snippet: getQuestChainFuzzySnippet(result.matches),
            }))

        return [...exactResults, ...fuzzyResults]
    }

    return questChainData
        .filter(questChain => {
            if (!passesQuestChainSwitchFilters(questChain)) {
                return false
            }

            if (searchKeyword.value === "") {
                return true
            }

            const keyword = searchKeyword.value
            if (`${questChain.id}`.includes(keyword) || questChain.name.includes(keyword)) {
                return true
            }

            return matchPinyin(questChain.name, keyword).match
        })
        .map(questChain => ({
            questChain,
            snippet: null,
        }))
})

/**
 * 获取可用版本列表。
 */
const versionOptions = computed(() => {
    const versionSet = new Set<string>()
    for (const questChain of questChainData) {
        const version = questChain.版本 || ""
        if (version) {
            versionSet.add(version)
        }
    }
    return Array.from(versionSet).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
})

/**
 * 选中任务链。
 * @param questChain 任务链
 */
function selectQuestChain(questChain: QuestChain | null) {
    selectedQuestChainId.value = questChain?.id || 0
}

/**
 * 获取任务链类型显示信息。
 * @param questChain 任务链
 * @returns 类型显示信息
 */
function getQuestChainTypeDisplay(questChain: QuestChain) {
    return getQuestTypeDisplay(questChain.type)
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbq-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedQuestChain }"
            >
                <!-- 检索带：下划线搜索 + 计数 + 过滤器开关方章 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="showFullTextSearch ? '全文搜索任务/对话内容（不支持拼音）...' : '搜索任务 ID/名称（支持拼音）...'"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredQuestChains.length }}
                        </span>
                    </div>

                    <!-- 过滤器开关方章 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showTypeFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleTypeFilterRow()"
                        >
                            类型
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showImprCheckOnly
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="showImprCheckOnly = !showImprCheckOnly"
                        >
                            印象检定
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showImprIncreaseOnly
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="showImprIncreaseOnly = !showImprIncreaseOnly"
                        >
                            印象增加
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showFullTextSearch
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="showFullTextSearch = !showFullTextSearch"
                        >
                            全文搜索
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showVersionFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="showVersionFilter = !showVersionFilter"
                        >
                            {{ $t("char-build.version") }}
                        </button>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div
                    v-show="showTypeFilter || showVersionFilter"
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <!-- 类型筛选 -->
                    <div v-show="showTypeFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">TYPE</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedTypeGroup === 0
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedTypeGroup = 0"
                        >
                            全部
                        </button>
                        <button
                            v-for="type in questTypeOptions"
                            :key="type.value"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedTypeGroup === type.value
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedTypeGroup = type.value"
                        >
                            {{ type.display.name }}
                        </button>
                    </div>

                    <!-- 版本筛选 -->
                    <div v-show="showVersionFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">VERSION</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="version in versionOptions"
                            :key="version"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === version
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = version"
                        >
                            {{ version }}
                        </button>
                    </div>
                </div>

                <!-- 任务链列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <div class="space-y-2">
                            <article
                                v-for="(questChainResult, index) in filteredQuestChains"
                                :key="questChainResult.questChain.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedQuestChainId === questChainResult.questChain.id
                                        ? 'dbq-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectQuestChain(questChainResult.questChain)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedQuestChainId === questChainResult.questChain.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <img
                                        :src="`/imgs/tp/${getQuestChainTypeDisplay(questChainResult.questChain).icon}.webp`"
                                        :alt="getQuestChainTypeDisplay(questChainResult.questChain).name"
                                        class="size-12 shrink-0 rounded-xs object-contain"
                                        loading="lazy"
                                    />

                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：名称 + 幽灵 ID -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedQuestChainId === questChainResult.questChain.id }"
                                            >
                                                {{ $t(questChainResult.questChain.name) }}
                                            </h3>
                                            <CopyID :id="questChainResult.questChain.id" class="ml-auto shrink-0" />
                                        </div>

                                        <!-- 元信息行：章节 / 集数 / 类型 / 版本 / 印象标记 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span
                                                >{{ $t(questChainResult.questChain.chapterName) }}
                                                {{ $t(questChainResult.questChain.chapterNumber || "") }}</span
                                            >
                                            <span>{{ $t(questChainResult.questChain.episode) }}</span>
                                            <span v-if="questChainResult.questChain.type" class="inline-flex items-center gap-1">
                                                <span>{{ getQuestChainTypeDisplay(questChainResult.questChain).name }}</span>
                                            </span>
                                            <span v-if="questChainResult.questChain.版本" class="font-mono tabular-nums">v{{ questChainResult.questChain.版本 }}</span>
                                            <span
                                                v-if="hasQuestChainImprCheck(questChainResult.questChain.id)"
                                                class="rounded-xs border border-secondary/40 bg-secondary/10 px-1 text-[10px] leading-4 tracking-wide text-secondary"
                                            >
                                                印象检定
                                            </span>
                                            <span
                                                v-if="hasQuestChainImprIncrease(questChainResult.questChain.id)"
                                                class="rounded-xs border border-success/40 bg-success/10 px-1 text-[10px] leading-4 tracking-wide text-success"
                                            >
                                                印象增加
                                            </span>
                                        </div>

                                        <!-- 全文搜索命中摘要 -->
                                        <div
                                            v-if="showFullTextSearch && searchKeyword.trim() && questChainResult.snippet"
                                            class="mt-2 text-xs leading-relaxed text-base-content/70"
                                        >
                                            <span class="text-base-content/45">匹配：</span>
                                            <span v-if="questChainResult.snippet.prefixEllipsis">...</span>
                                            <template
                                                v-for="(segment, index) in questChainResult.snippet.segments"
                                                :key="`${questChainResult.questChain.id}-${index}`"
                                            >
                                                <span
                                                    :class="
                                                        segment.highlighted
                                                            ? selectedQuestChainId === questChainResult.questChain.id
                                                                ? 'rounded-xs bg-base-100/45 px-0.5 font-semibold text-primary-content underline decoration-primary-content/80 decoration-2 underline-offset-2'
                                                                : 'rounded-xs bg-primary/20 px-0.5 font-semibold text-base-content underline decoration-primary/80 decoration-2 underline-offset-2'
                                                            : ''
                                                    "
                                                >
                                                    {{ segment.text }}
                                                </span>
                                            </template>
                                            <span v-if="questChainResult.snippet.suffixEllipsis">...</span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredQuestChains.length }}</b> 个任务
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedQuestChain"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectQuestChain(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedQuestChain" :key="selectedQuestChain.id" class="min-w-0 flex-2">
                <DBQuestDetailItem :key="selectedQuestChainId" :quest-chain="selectedQuestChain" :search-keyword="showFullTextSearch ? searchKeyword.trim() : ''" />
            </ScrollArea>
        </div>
    </div>
</template>
