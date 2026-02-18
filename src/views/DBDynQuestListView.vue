<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import Fuse, { type FuseResultMatch } from "fuse.js"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import dynQuestData, { type DynQuest } from "@/data/d/dynquest.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { matchPinyin } from "@/utils/pinyin-utils"

interface DynQuestSnippetSegment {
    text: string
    highlighted: boolean
}

interface DynQuestSearchSnippet {
    prefixEllipsis: boolean
    suffixEllipsis: boolean
    segments: DynQuestSnippetSegment[]
}

interface DynQuestSearchResult {
    quest: DynQuest
    snippet: DynQuestSearchSnippet | null
}

interface DynQuestFullTextEntry {
    quest: DynQuest
    questId: string
    questName: string
    regionName: string
    subRegionName: string
    snippets: string[]
    searchText: string
}

const searchKeyword = useSearchParam<string>("dynquest.searchKeyword", "")
const selectedQuestId = useSearchParam<number>("dynquest.selectedQuest", 0)
const selectedRegion = useSearchParam<string>("dynquest.selectedRegion", "")
const selectedSubRegion = useSearchParam<string>("dynquest.selectedSubRegion", "")
const selectedLevel = useSearchParam<string>("dynquest.selectedLevel", "")
const showFullTextSearch = useSearchParam<boolean>("dynquest.showFullTextSearch", false)
const showRegionFilter = useLocalStorage("dynquest.showRegionFilter", true)
const showSubRegionFilter = useLocalStorage("dynquest.showSubRegionFilter", true)
const showLevelFilter = useLocalStorage("dynquest.showLevelFilter", true)

const dynQuestFullTextEntries = buildDynQuestFullTextEntries()
const dynQuestFullTextFuse = createDynQuestFullTextFuse(dynQuestFullTextEntries)

/**
 * 根据 ID 获取选中的委托。
 */
const selectedQuest = computed(() => {
    return selectedQuestId.value ? dynQuestData.find(quest => quest.id === selectedQuestId.value) || null : null
})

/**
 * 获取区域名称。
 * @param regionId 区域 ID
 * @returns 区域名称
 */
function getRegionName(regionId: number): string {
    const region = regionMap.get(regionId)
    return region ? region.name : `区域${regionId}`
}

/**
 * 获取子区域名称。
 * @param subRegionId 子区域 ID
 * @returns 子区域名称
 */
function getSubRegionName(subRegionId: number): string {
    const subRegion = subRegionMap.get(subRegionId)
    return subRegion ? subRegion.name : `子区域${subRegionId}`
}

/**
 * 获取委托等级范围筛选键。
 * @param quest 委托数据
 * @returns 等级范围键
 */
function getQuestLevelKey(quest: DynQuest): string {
    if (!quest.level.length) {
        return "unknown"
    }

    const minLevel = quest.level[0]
    const maxLevel = quest.level[1]
    return `${minLevel}-${maxLevel ?? ""}`
}

/**
 * 根据筛选键生成等级范围显示文本。
 * @param levelKey 等级范围键
 * @returns 显示文本
 */
function getLevelLabelByKey(levelKey: string): string {
    if (levelKey === "unknown") {
        return "等级未知"
    }

    const [minLevel, maxLevel] = levelKey.split("-")
    return `等级 ${minLevel} - ${maxLevel || "?"}`
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
 * 收集委托可用于全文搜索的文本片段。
 * @param quest 委托数据
 * @returns 文本片段
 */
function collectDynQuestSnippets(quest: DynQuest): string[] {
    const snippets: string[] = []

    snippets.push(quest.name)
    snippets.push(getRegionName(quest.regionId))
    snippets.push(getSubRegionName(quest.subRegionId))

    for (const node of quest.nodes ?? []) {
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

        for (const question of node.questions ?? []) {
            if (question.name) {
                snippets.push(question.name)
            }
            if (question.tips) {
                snippets.push(question.tips)
            }
        }

        for (const answer of node.answers ?? []) {
            if (answer.name) {
                snippets.push(answer.name)
            }
            if (answer.desc) {
                snippets.push(answer.desc)
            }
        }
    }

    return cleanSnippets(snippets)
}

/**
 * 构建委托全文检索索引。
 * @returns 全文检索索引
 */
function buildDynQuestFullTextEntries(): DynQuestFullTextEntry[] {
    return dynQuestData.map(quest => {
        const snippets = collectDynQuestSnippets(quest)
        const regionName = getRegionName(quest.regionId)
        const subRegionName = getSubRegionName(quest.subRegionId)
        const searchText = [
            quest.id,
            quest.name,
            regionName,
            subRegionName,
            quest.level[0],
            quest.level[1],
            quest.chance,
            ...snippets,
        ]
            .filter(v => v !== undefined && v !== null && `${v}`.trim() !== "")
            .join(" ")

        return {
            quest,
            questId: `${quest.id}`,
            questName: quest.name,
            regionName,
            subRegionName,
            snippets,
            searchText,
        }
    })
}

/**
 * 创建委托全文搜索引擎。
 * @param entries 全文检索索引
 * @returns Fuse 搜索实例
 */
function createDynQuestFullTextFuse(entries: DynQuestFullTextEntry[]): Fuse<DynQuestFullTextEntry> {
    return new Fuse(entries, {
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 1,
        includeMatches: true,
        keys: [
            { name: "questName", weight: 2.4 },
            { name: "questId", weight: 2.0 },
            { name: "regionName", weight: 1.2 },
            { name: "subRegionName", weight: 1.2 },
            { name: "snippets", weight: 1.8 },
            { name: "searchText", weight: 1.4 },
        ],
    })
}

/**
 * 合并 Fuse 命中区间，避免相邻高亮块重复渲染。
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
function buildHighlightedSnippet(text: string, indices: ReadonlyArray<readonly [number, number]>): DynQuestSearchSnippet | null {
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

    const segments: DynQuestSnippetSegment[] = []
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
 * 从 Fuse 匹配结果中提取最合适的剧情高亮摘要。
 * @param matches Fuse 匹配信息
 * @returns 剧情高亮摘要
 */
function getDynQuestSearchSnippet(matches: readonly FuseResultMatch[] | undefined): DynQuestSearchSnippet | null {
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
 * 判断委托是否满足区域筛选条件。
 * @param quest 委托数据
 * @returns 是否满足条件
 */
function passesRegionFilters(quest: DynQuest): boolean {
    const matchesRegion = selectedRegion.value === "" || quest.regionId === Number(selectedRegion.value)
    const matchesSubRegion = selectedSubRegion.value === "" || quest.subRegionId === Number(selectedSubRegion.value)
    const matchesLevel = selectedLevel.value === "" || getQuestLevelKey(quest) === selectedLevel.value
    return matchesRegion && matchesSubRegion && matchesLevel
}

/**
 * 切换筛选器显示状态。
 * @param filterName 筛选器名称
 * @param show 是否显示
 */
function toggleFilter(filterName: "region" | "subRegion" | "level", show: boolean) {
    if (show) {
        return
    }

    if (filterName === "region") {
        selectedRegion.value = ""
        selectedSubRegion.value = ""
    }

    if (filterName === "subRegion") {
        selectedSubRegion.value = ""
    }

    if (filterName === "level") {
        selectedLevel.value = ""
    }
}

/**
 * 获取所有区域。
 */
const allRegions = computed(() => {
    const regions = new Set(dynQuestData.map(q => q.regionId))
    return Array.from(regions).sort((a, b) => a - b)
})

/**
 * 获取当前选中区域的所有子区域。
 */
const subRegions = computed(() => {
    if (!selectedRegion.value) {
        return []
    }

    const subRegionIds = new Set(dynQuestData.filter(q => q.regionId === Number(selectedRegion.value)).map(q => q.subRegionId))
    return Array.from(subRegionIds)
        .map(id => subRegionMap.get(id))
        .filter(r => !!r)
        .sort((a, b) => a.id - b.id)
})

/**
 * 获取所有等级范围筛选项。
 */
const levelRanges = computed(() => {
    const levelRangeSet = new Set<string>()

    for (const quest of dynQuestData) {
        levelRangeSet.add(getQuestLevelKey(quest))
    }

    return Array.from(levelRangeSet)
        .sort((a, b) => {
            if (a === "unknown") {
                return 1
            }
            if (b === "unknown") {
                return -1
            }

            const [aMin] = a.split("-")
            const [bMin] = b.split("-")
            return Number(aMin) - Number(bMin)
        })
        .map(levelKey => ({
            key: levelKey,
            label: getLevelLabelByKey(levelKey),
        }))
})

/**
 * 按关键词和区域筛选委托。
 */
const filteredQuests = computed<DynQuestSearchResult[]>(() => {
    if (showFullTextSearch.value) {
        const keyword = searchKeyword.value.trim()
        if (keyword === "") {
            return dynQuestData.filter(passesRegionFilters).map(quest => ({
                quest,
                snippet: null,
            }))
        }

        return dynQuestFullTextFuse
            .search(keyword, { limit: 400 })
            .filter(result => passesRegionFilters(result.item.quest))
            .map(result => ({
                quest: result.item.quest,
                snippet: getDynQuestSearchSnippet(result.matches),
            }))
    }

    return dynQuestData
        .filter(quest => {
            if (!passesRegionFilters(quest)) {
                return false
            }

            if (searchKeyword.value === "") {
                return true
            }

            const keyword = searchKeyword.value
            if (
                `${quest.id}`.includes(keyword) ||
                quest.name.includes(keyword) ||
                getRegionName(quest.regionId).includes(keyword) ||
                getSubRegionName(quest.subRegionId).includes(keyword)
            ) {
                return true
            }

            return (
                matchPinyin(quest.name, keyword).match ||
                matchPinyin(getRegionName(quest.regionId), keyword).match ||
                matchPinyin(getSubRegionName(quest.subRegionId), keyword).match
            )
        })
        .map(quest => ({
            quest,
            snippet: null,
        }))
})

/**
 * 选中委托。
 * @param quest 委托数据
 */
function selectQuest(quest: DynQuest | null) {
    selectedQuestId.value = quest?.id || 0
}

/**
 * 选择区域。
 * @param regionId 区域 ID
 */
function selectRegion(regionId: string) {
    selectedRegion.value = regionId
    selectedSubRegion.value = ""
}

/**
 * 选择子区域。
 * @param subRegionId 子区域 ID
 */
function selectSubRegion(subRegionId: string) {
    selectedSubRegion.value = subRegionId
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedQuest }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text"
                        :placeholder="showFullTextSearch ? '全文搜索委托/剧情内容（不支持拼音）...' : '搜索委托 ID/名称（支持拼音）...'"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <!-- 区域筛选 -->
                <div class="p-2 border-b border-base-200">
                    <div class="flex items-center gap-4 mb-2 overflow-x-auto whitespace-nowrap">
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input v-model="showFullTextSearch" type="checkbox" class="checkbox checkbox-xs" />
                            <span class="text-xs text-base-content/70">剧情全文搜索</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input v-model="showRegionFilter" type="checkbox" class="checkbox checkbox-xs"
                                @change="toggleFilter('region', showRegionFilter)" />
                            <span class="text-xs text-base-content/70">区域筛选</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input v-model="showSubRegionFilter" type="checkbox" class="checkbox checkbox-xs"
                                @change="toggleFilter('subRegion', showSubRegionFilter)" />
                            <span class="text-xs text-base-content/70">子区域筛选</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input v-model="showLevelFilter" type="checkbox" class="checkbox checkbox-xs"
                                @change="toggleFilter('level', showLevelFilter)" />
                            <span class="text-xs text-base-content/70">等级筛选</span>
                        </label>
                    </div>

                    <div v-show="showRegionFilter" class="flex flex-wrap gap-1 pb-1">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedRegion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectRegion('')">
                            全部区域
                        </button>
                        <button v-for="regionId in allRegions.map(r => String(r))" :key="regionId"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedRegion === regionId ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectRegion(regionId)">
                            {{ getRegionName(Number(regionId)) }}
                        </button>
                    </div>

                    <div v-show="showSubRegionFilter && selectedRegion" class="flex flex-wrap gap-1 pb-1">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedSubRegion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectSubRegion('')">
                            全部子区域
                        </button>
                        <button v-for="subRegion in subRegions" :key="subRegion.id"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedSubRegion === String(subRegion.id)
                                ? 'bg-primary text-white'
                                : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectSubRegion(String(subRegion.id))">
                            {{ subRegion.name }}
                        </button>
                    </div>

                    <div v-show="showLevelFilter" class="flex flex-wrap gap-1 pb-1">
                        <button class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedLevel === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedLevel = ''">
                            全部等级
                        </button>
                        <button v-for="levelRange in levelRanges" :key="levelRange.key"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedLevel === levelRange.key
                                ? 'bg-primary text-white'
                                : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedLevel = levelRange.key">
                            {{ levelRange.label }}
                        </button>
                    </div>
                </div>

                <!-- 委托列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="questResult in filteredQuests" :key="questResult.quest.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedQuestId === questResult.quest.id }"
                            @click="selectQuest(questResult.quest)">
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ questResult.quest.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span>等级: {{ questResult.quest.level[0] }} - {{ questResult.quest.level[1] || "?" }}</span>
                                        <span v-if="questResult.quest.dayLimit"
                                            class="ml-2 px-1.5 py-0.5 rounded bg-warning text-warning-content">每日限制</span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-white">
                                        {{ getRegionName(questResult.quest.regionId) }}
                                    </span>
                                    <span class="text-xs opacity-70">ID: {{ questResult.quest.id }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>{{ getSubRegionName(questResult.quest.subRegionId) }}</span>
                                <span>概率: {{ questResult.quest.chance }}%</span>
                            </div>

                            <div v-if="showFullTextSearch && searchKeyword.trim() && questResult.snippet"
                                class="mt-2 text-xs leading-relaxed opacity-85">
                                <span class="opacity-65">匹配：</span>
                                <span v-if="questResult.snippet.prefixEllipsis">...</span>
                                <template v-for="(segment, index) in questResult.snippet.segments"
                                    :key="`${questResult.quest.id}-${index}`">
                                    <span :class="segment.highlighted
                                        ? selectedQuestId === questResult.quest.id
                                            ? 'bg-base-100/45 text-primary-content font-semibold px-0.5 rounded underline decoration-primary-content/80 decoration-2 underline-offset-2'
                                            : 'bg-primary/20 text-base-content font-semibold px-0.5 rounded underline decoration-primary/80 decoration-2 underline-offset-2'
                                        : ''
                                        ">
                                        {{ segment.text }}
                                    </span>
                                </template>
                                <span v-if="questResult.snippet.suffixEllipsis">...</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredQuests.length }} 个委托
                </div>
            </div>
            <div v-if="selectedQuest"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectQuest(null)">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedQuest" class="flex-1">
                <DBDynQuestDetailItem :quest="selectedQuest" />
            </ScrollArea>
        </div>
    </div>
</template>
