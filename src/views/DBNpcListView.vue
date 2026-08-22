<script lang="ts" setup>
import Fuse, { type FuseResultMatch } from "fuse.js"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledCharHelper } from "@/data"
import npcData, { type NPC, npcMap } from "@/data/d/npc.data"
import { matchPinyin } from "@/utils/pinyin-utils"

interface NpcSnippetSegment {
    text: string
    highlighted: boolean
}

interface NpcSearchSnippet {
    prefixEllipsis: boolean
    suffixEllipsis: boolean
    segments: NpcSnippetSegment[]
}

interface NpcSearchResult {
    npc: NPC
    snippet: NpcSearchSnippet | null
}

interface NpcFullTextEntry {
    npc: NPC
    npcId: string
    npcName: string
    snippets: string[]
    searchText: string
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedNpcId = useSearchParam<number>("id", 0)
const showImprCheckOnly = useSearchParam<boolean>("ico", false)
const showImprIncreaseOnly = useSearchParam<boolean>("iio", false)
const showFullTextSearch = useSearchParam<boolean>("fts", false)
const showDialogueOnly = useSearchParam<boolean>("dio", false)

/**
 * 判断 NPC 是否包含印象检定。
 * @param npc NPC 数据
 * @returns 是否包含印象检定
 */
function hasNpcImprCheck(npc: NPC): boolean {
    return !!npc.talks?.some(dialogue => dialogue.options?.some(option => !!option.imprCheck))
}

/**
 * 判断 NPC 是否包含印象增加。
 * @param npc NPC 数据
 * @returns 是否包含印象增加
 */
function hasNpcImprIncrease(npc: NPC): boolean {
    return !!npc.talks?.some(dialogue => {
        return dialogue.options?.some(option => {
            return !!option.impr && option.impr[2] > 0
        })
    })
}

/**
 * 判断 NPC 是否包含可显示的对话。
 * @param npc NPC 数据
 * @returns 是否包含对话
 */
function hasNpcDialogue(npc: NPC): boolean {
    return !!npc.talks?.length
}

/**
 * 收集 NPC 可用于全文搜索的文本片段。
 * @param npc NPC 数据
 * @returns 搜索片段
 */
function collectNpcSnippets(npc: NPC): string[] {
    const snippets = new Set<string>()

    for (const dialogue of npc.talks ?? []) {
        if (dialogue.content?.trim()) {
            snippets.add(dialogue.content.trim())
        }

        for (const option of dialogue.options ?? []) {
            if (option.content?.trim()) {
                snippets.add(option.content.trim())
            }
        }
    }

    return Array.from(snippets)
}

/**
 * 构建 NPC 全文搜索索引。
 * @returns 全文搜索索引
 */
function buildNpcFullTextEntries(): NpcFullTextEntry[] {
    return npcData.map(npc => {
        const snippets = collectNpcSnippets(npc)
        const searchText = [npc.id, npc.name, npc.camp, npc.type, ...snippets]
            .filter(v => v !== undefined && v !== null && `${v}`.trim() !== "")
            .join(" ")

        return {
            npc,
            npcId: `${npc.id}`,
            npcName: npc.name || "",
            snippets,
            searchText,
        }
    })
}

/**
 * 创建 NPC 全文搜索引擎。
 * @param entries 全文搜索索引
 * @returns Fuse 搜索实例
 */
function createNpcFullTextFuse(entries: NpcFullTextEntry[]): Fuse<NpcFullTextEntry> {
    return new Fuse(entries, {
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 1,
        includeMatches: true,
        keys: [
            { name: "npcName", weight: 2.4 },
            { name: "npcId", weight: 2.0 },
            { name: "snippets", weight: 1.8 },
            { name: "searchText", weight: 1.4 },
        ],
    })
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
function buildHighlightedSnippet(text: string, indices: ReadonlyArray<readonly [number, number]>): NpcSearchSnippet | null {
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

    const segments: NpcSnippetSegment[] = []
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
function getNpcSearchSnippet(snippets: readonly string[], keyword: string): NpcSearchSnippet | null {
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
function getNpcFuzzySnippet(matches: readonly FuseResultMatch[] | undefined): NpcSearchSnippet | null {
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
 * 判断 NPC 是否满足顶部筛选开关条件。
 * @param npc NPC 数据
 * @returns 是否满足条件
 */
function passesNpcSwitchFilters(npc: NPC): boolean {
    if (showImprCheckOnly.value && !hasNpcImprCheck(npc)) {
        return false
    }

    if (showImprIncreaseOnly.value && !hasNpcImprIncrease(npc)) {
        return false
    }

    if (showDialogueOnly.value && !hasNpcDialogue(npc)) {
        return false
    }

    return true
}

/**
 * 获取 NPC 角色头像地址。
 * @param npc NPC 数据
 * @returns 头像地址
 */
function getNpcCharIconUrl(npc: NPC): string {
    return npc.charId ? LeveledCharHelper.idToUrl(npc.charId) : ""
}

/**
 * 当前 NPC 全文搜索索引。
 */
const npcFullTextEntries = computed(() => {
    return buildNpcFullTextEntries()
})

/**
 * 当前 NPC 全文搜索引擎。
 */
const npcFullTextFuse = computed(() => {
    return createNpcFullTextFuse(npcFullTextEntries.value)
})

/**
 * 根据 ID 获取选中的 NPC。
 */
const selectedNpc = computed(() => {
    return selectedNpcId.value ? npcMap.get(selectedNpcId.value) || null : null
})

/**
 * 按关键词和筛选条件过滤 NPC。
 */
const filteredNpcs = computed<NpcSearchResult[]>(() => {
    if (showFullTextSearch.value) {
        const keyword = searchKeyword.value.trim()
        if (keyword === "") {
            return npcData.filter(passesNpcSwitchFilters).map(npc => ({
                npc,
                snippet: null,
            }))
        }

        const reorderedResults = npcFullTextFuse.value
            .search(keyword, { limit: 300 })
            .filter(result => passesNpcSwitchFilters(result.item.npc))
        const exactResults = reorderedResults
            .filter(result => result.item.searchText.includes(keyword))
            .map(result => ({
                npc: result.item.npc,
                snippet: getNpcSearchSnippet(result.item.snippets, keyword) ?? getNpcFuzzySnippet(result.matches),
            }))
        const fuzzyResults = reorderedResults
            .filter(result => !result.item.searchText.includes(keyword))
            .map(result => ({
                npc: result.item.npc,
                snippet: getNpcFuzzySnippet(result.matches),
            }))

        return [...exactResults, ...fuzzyResults]
    }

    return npcData
        .filter(npc => {
            if (!passesNpcSwitchFilters(npc)) {
                return false
            }

            if (searchKeyword.value === "") {
                return true
            }

            const keyword = searchKeyword.value
            if (`${npc.id}`.includes(keyword) || (npc.name && npc.name.includes(keyword))) {
                return true
            }

            if (!npc.name) {
                return false
            }

            return matchPinyin(npc.name, keyword).match
        })
        .map(npc => ({
            npc,
            snippet: null,
        }))
})

/**
 * 选中 NPC。
 * @param npc NPC 数据
 */
function selectNpc(npc: NPC | null) {
    selectedNpcId.value = npc?.id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbn-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedNpc }">
                <!-- 检索带：下划线搜索 + 计数 + 过滤器开关方章 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="showFullTextSearch ? '全文搜索 NPC/对话内容（不支持拼音）...' : '搜索 NPC ID/名称（支持拼音）...'"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredNpcs.length }}
                        </span>
                    </div>

                    <!-- 过滤器开关方章 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
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
                                showDialogueOnly
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="showDialogueOnly = !showDialogueOnly"
                        >
                            仅对话
                        </button>
                    </div>
                </div>

                <!-- 列表 -->
                <ScrollArea class="flex-1">
                    <div class="space-y-2 p-3">
                        <!-- 空状态 -->
                        <div v-if="filteredNpcs.length === 0" class="flex flex-col items-center justify-center py-20 text-base-content/45">
                            <Icon icon="ri:user-search-line" class="mb-4 h-12 w-12 opacity-40" />
                            <p class="text-sm">未找到匹配的 NPC</p>
                        </div>
                        <article
                            v-for="(npcResult, index) in filteredNpcs"
                            :key="npcResult.npc.id"
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                selectedNpcId === npcResult.npc.id
                                    ? 'dbn-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectNpc(npcResult.npc)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedNpcId === npcResult.npc.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex items-start gap-3 p-3">
                                <img
                                    v-if="npcResult.npc.charId"
                                    :src="getNpcCharIconUrl(npcResult.npc)"
                                    :alt="npcResult.npc.name || `NPC ${npcResult.npc.id}`"
                                    class="size-11 shrink-0 rounded-xs object-cover"
                                />

                                <div class="min-w-0 flex-1">
                                    <div class="flex items-start justify-between gap-3">
                                        <div class="min-w-0 flex-1">
                                            <div
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedNpcId === npcResult.npc.id }"
                                            >
                                                {{ $t(npcResult.npc.name || `NPC ${npcResult.npc.id}`) }}
                                            </div>

                                            <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                                <span v-if="npcResult.npc.camp">{{ npcResult.npc.camp }}</span>
                                                <span v-if="npcResult.npc.type">{{ npcResult.npc.type }}</span>
                                                <span
                                                    v-if="hasNpcImprCheck(npcResult.npc)"
                                                    class="rounded-xs border border-secondary/30 bg-secondary/10 px-1 py-0.5 text-[10px] leading-4 tracking-wide text-secondary"
                                                >
                                                    印象检定
                                                </span>
                                                <span
                                                    v-if="hasNpcImprIncrease(npcResult.npc)"
                                                    class="rounded-xs border border-success/30 bg-success/10 px-1 py-0.5 text-[10px] leading-4 tracking-wide text-success"
                                                >
                                                    印象增加
                                                </span>
                                                <span v-if="npcResult.npc.talks?.length">{{ npcResult.npc.talks.length }} 条对话</span>
                                            </div>
                                        </div>

                                        <div class="flex shrink-0 flex-col items-end gap-1">
                                            <span
                                                v-if="npcResult.npc.icon"
                                                class="rounded-xs border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-primary"
                                            >
                                                {{ npcResult.npc.icon }}
                                            </span>
                                            <span class="font-mono text-[10px] tabular-nums text-base-content/35">ID: {{ npcResult.npc.id }}</span>
                                        </div>
                                    </div>

                                    <div
                                        v-if="showFullTextSearch && searchKeyword.trim() && npcResult.snippet"
                                        class="mt-2 text-xs leading-relaxed text-base-content/70"
                                    >
                                        <span class="text-base-content/45">匹配：</span>
                                        <span v-if="npcResult.snippet.prefixEllipsis">...</span>
                                        <template
                                            v-for="(segment, index) in npcResult.snippet.segments"
                                            :key="`${npcResult.npc.id}-${index}`"
                                        >
                                            <span
                                                :class="
                                                    segment.highlighted
                                                        ? selectedNpcId === npcResult.npc.id
                                                            ? 'rounded-xs bg-base-100/45 px-0.5 font-semibold text-primary-content underline decoration-primary-content/80 decoration-2 underline-offset-2'
                                                            : 'rounded-xs bg-primary/20 px-0.5 font-semibold text-base-content underline decoration-primary/80 decoration-2 underline-offset-2'
                                                        : ''
                                                "
                                            >
                                                {{ segment.text }}
                                            </span>
                                        </template>
                                        <span v-if="npcResult.snippet.suffixEllipsis">...</span>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-center text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredNpcs.length }}</b> 个 NPC
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedNpc"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectNpc(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedNpc" class="min-w-0 flex-2">
                <DBNpcDetailItem :key="selectedNpc.id" :npc="selectedNpc" />
            </ScrollArea>
        </div>
    </div>
</template>
