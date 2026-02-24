<script lang="ts" setup>
import Fuse, { type FuseResultMatch } from "fuse.js"
import { computed, ref, watch } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import type { QuestItem, QuestStory } from "@/data/d/quest.data"
import questChainData, { type QuestChain } from "@/data/d/questchain.data"
import { getLocalizedQuestDataByLanguage } from "@/data/d/story-locale"
import { useSettingStore } from "@/store/setting"
import { matchPinyin } from "@/utils/pinyin-utils"

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

const searchKeyword = useSearchParam<string>("questchain.searchKeyword", "")
const selectedQuestChainId = useSearchParam<number>("questchain.selectedQuestChain", 0)
const showImprCheckOnly = useSearchParam<boolean>("questchain.showImprCheckOnly", false)
const showImprIncreaseOnly = useSearchParam<boolean>("questchain.showImprIncreaseOnly", false)
const showFullTextSearch = useSearchParam<boolean>("questchain.showFullTextSearch", false)
const settingStore = useSettingStore()
const localizedQuestData = ref<QuestStory[]>([])

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

        for (const node of questItem.nodes) {
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
            const hasImprCheck = questItem.nodes.some(node => {
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
            const hasImprIncrease = questItem.nodes.some(node => {
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
    if (showImprCheckOnly.value && !hasQuestChainImprCheck(questChain.id)) {
        return false
    }

    if (showImprIncreaseOnly.value && !hasQuestChainImprIncrease(questChain.id)) {
        return false
    }

    return true
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
 * 从 Fuse 匹配结果中提取最合适的对话高亮摘要。
 * @param matches Fuse 匹配信息
 * @returns 对话高亮摘要
 */
function getQuestChainSearchSnippet(matches: readonly FuseResultMatch[] | undefined): QuestChainSearchSnippet | null {
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

        return questChainFullTextFuse.value
            .search(keyword, { limit: 300 })
            .filter(result => passesQuestChainSwitchFilters(result.item.questChain))
            .map(result => ({
                questChain: result.item.questChain,
                snippet: getQuestChainSearchSnippet(result.matches),
            }))
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
 * 选中任务链。
 * @param questChain 任务链
 */
function selectQuestChain(questChain: QuestChain | null) {
    selectedQuestChainId.value = questChain?.id || 0
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedQuestChain }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        :placeholder="showFullTextSearch ? '全文搜索任务/对话内容（不支持拼音）...' : '搜索任务 ID/名称（支持拼音）...'"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />

                    <div class="mt-2 flex items-center gap-4 text-xs text-base-content/80 flex-wrap">
                        <label class="flex items-center gap-2 select-none cursor-pointer">
                            <input v-model="showImprCheckOnly" type="checkbox" class="checkbox checkbox-xs" />
                            <span>仅显示含印象检定</span>
                        </label>

                        <label class="flex items-center gap-2 select-none cursor-pointer">
                            <input v-model="showImprIncreaseOnly" type="checkbox" class="checkbox checkbox-xs" />
                            <span>仅显示印象增加</span>
                        </label>

                        <label class="flex items-center gap-2 select-none cursor-pointer">
                            <input v-model="showFullTextSearch" type="checkbox" class="checkbox checkbox-xs" />
                            <span>对话全文搜索</span>
                        </label>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="questChainResult in filteredQuestChains"
                            :key="questChainResult.questChain.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{
                                'bg-primary/90 text-primary-content hover:bg-primary':
                                    selectedQuestChainId === questChainResult.questChain.id,
                            }"
                            @click="selectQuestChain(questChainResult.questChain)"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ $t(questChainResult.questChain.name) }}</div>

                                    <div class="text-xs opacity-70 mt-1 flex flex-wrap items-center gap-2">
                                        <span
                                            >{{ $t(questChainResult.questChain.chapterName) }}
                                            {{ $t(questChainResult.questChain.chapterNumber || "") }}</span
                                        >
                                        <span
                                            v-if="questChainResult.questChain.main"
                                            class="px-1.5 py-0.5 rounded bg-info text-info-content"
                                            >主线</span
                                        >
                                        <span
                                            v-if="hasQuestChainImprCheck(questChainResult.questChain.id)"
                                            class="px-1.5 py-0.5 rounded bg-secondary text-secondary-content"
                                        >
                                            印象检定
                                        </span>
                                        <span
                                            v-if="hasQuestChainImprIncrease(questChainResult.questChain.id)"
                                            class="px-1.5 py-0.5 rounded bg-success text-success-content"
                                        >
                                            印象增加
                                        </span>
                                    </div>
                                </div>

                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs opacity-70">ID: {{ questChainResult.questChain.id }}</span>
                                </div>
                            </div>

                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>{{ $t(questChainResult.questChain.episode) }}</span>
                                <span v-if="questChainResult.questChain.type">类型: {{ questChainResult.questChain.type }}</span>
                            </div>

                            <div
                                v-if="showFullTextSearch && searchKeyword.trim() && questChainResult.snippet"
                                class="mt-2 text-xs leading-relaxed opacity-85"
                            >
                                <span class="opacity-65">匹配：</span>
                                <span v-if="questChainResult.snippet.prefixEllipsis">...</span>
                                <template
                                    v-for="(segment, index) in questChainResult.snippet.segments"
                                    :key="`${questChainResult.questChain.id}-${index}`"
                                >
                                    <span
                                        :class="
                                            segment.highlighted
                                                ? selectedQuestChainId === questChainResult.questChain.id
                                                    ? 'bg-base-100/45 text-primary-content font-semibold px-0.5 rounded underline decoration-primary-content/80 decoration-2 underline-offset-2'
                                                    : 'bg-primary/20 text-base-content font-semibold px-0.5 rounded underline decoration-primary/80 decoration-2 underline-offset-2'
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
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredQuestChains.length }} 个任务
                </div>
            </div>

            <div
                v-if="selectedQuestChain"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectQuestChain(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedQuestChain" :key="selectedQuestChain.id" class="flex-2">
                <DBQuestDetailItem :questChain="selectedQuestChain" />
            </ScrollArea>
        </div>
    </div>
</template>
