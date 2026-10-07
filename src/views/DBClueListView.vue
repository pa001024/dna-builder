<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Clue, clueData } from "@/data/d/clue.data"
import { matchPinyin } from "@/utils/pinyin-utils"

/** 线索板里的一个条目：把「页类型 → 页 → 线索」三层摊平成列表可用的扁平结构 */
export interface ClueEntry {
    tabType: string
    tabName: string
    pageId: string
    pageName: string
    /** 所属页的解锁条件 id（对应 Condition 表） */
    pageUnlock?: number
    clue: Clue
}

const { gt } = useGameText()

const searchKeyword = useSearchParam<string>("kw", "")
const selectedClueId = useSearchParam<number>("id", 0)
const selectedTabType = useSearchParam<string>("tab", "")

/** 全量线索（按页类型 → 页 → 线索的顺序摊平） */
const allClues = computed<ClueEntry[]>(() => {
    const list: ClueEntry[] = []

    for (const tab of clueData) {
        for (const page of tab.pages) {
            for (const clue of page.clues) {
                list.push({ tabType: tab.type, tabName: tab.name, pageId: page.id, pageName: page.name, pageUnlock: page.unlock, clue })
            }
        }
    }

    return list
})

/** 页类型筛选项（全部 + 各页类型） */
const tabOptions = computed(() => clueData.map(tab => ({ type: tab.type, name: tab.name })))

/**
 * 按关键词与页类型筛选线索。
 */
const filteredClues = computed(() => {
    return allClues.value.filter(entry => {
        if (selectedTabType.value && entry.tabType !== selectedTabType.value) {
            return false
        }

        return matchesClueKeyword(entry, searchKeyword.value.trim())
    })
})

/** 当前选中的线索条目 */
const selectedEntry = computed(() => {
    return selectedClueId.value ? allClues.value.find(entry => entry.clue.id === selectedClueId.value) || null : null
})

/**
 * 判断线索条目是否命中关键词。
 * @param entry 线索条目
 * @param keyword 关键词
 * @returns 是否命中
 */
function matchesClueKeyword(entry: ClueEntry, keyword: string): boolean {
    if (keyword === "") {
        return true
    }

    const { clue, pageName, tabName } = entry

    if (`${clue.id}`.includes(keyword) || clue.name.includes(keyword) || pageName.includes(keyword) || tabName.includes(keyword)) {
        return true
    }

    if (matchPinyin(clue.name, keyword).match || matchPinyin(pageName, keyword).match) {
        return true
    }

    return clue.contents.some(content => {
        if (`${content.id}`.includes(keyword) || content.text.includes(keyword)) {
            return true
        }

        return matchPinyin(content.text, keyword).match
    })
}

/**
 * 选中线索。
 * @param entry 线索条目
 */
function selectClue(entry: ClueEntry | null): void {
    selectedClueId.value = entry?.clue.id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbc-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 3" :detail-open="Boolean(selectedEntry)" @collapse="selectClue(null)">
            <template #master>
                <!-- 左侧列表面板 -->
                <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedEntry }">
                    <!-- 检索带：下划线搜索 + 计数 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <div class="relative">
                            <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                            <input
                                v-model="searchKeyword"
                                type="text"
                                :placeholder="$t('clue-list.searchPlaceholder')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                            />
                            <span
                                class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                            >
                                {{ filteredClues.length }}
                            </span>
                        </div>
                    </div>

                    <!-- 筛选带：页类型方章 -->
                    <div class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">CATEGORY</span>
                            <button
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedTabType === ''
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedTabType = ''"
                            >
                                {{ $t("clue-list.allCategories") }}
                            </button>
                            <button
                                v-for="tab in tabOptions"
                                :key="tab.type"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedTabType === tab.type
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedTabType = tab.type"
                            >
                                {{ gt(tab.name) }}
                            </button>
                        </div>
                    </div>

                    <!-- 线索列表 -->
                    <ScrollArea class="flex-1">
                        <div class="space-y-2 p-3">
                            <article
                                v-for="(entry, index) in filteredClues"
                                :key="entry.clue.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedClueId === entry.clue.id
                                        ? 'dbc-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectClue(entry)"
                            >
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedClueId === entry.clue.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-center gap-3 p-3">
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="text-sm font-medium leading-tight whitespace-normal wrap-break-word transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedClueId === entry.clue.id }"
                                        >
                                            {{ gt(entry.clue.name) }}
                                        </div>
                                        <div class="mt-1 truncate text-[11px] text-base-content/50">{{ gt(entry.pageName) }}</div>
                                    </div>
                                    <div class="flex shrink-0 flex-col items-end gap-1">
                                        <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] tracking-wide text-base-content/50">
                                            {{ gt(entry.tabName) }}
                                        </span>
                                        <span class="font-mono text-[10px] tabular-nums text-base-content/40">x{{ entry.clue.contents.length }}</span>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("clue-list.totalCount", { count: filteredClues.length }) }}
                        </p>
                    </div>
                </div>
            </template>

            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedEntry" class="min-h-0 min-w-0 flex-2">
                    <DBClueDetailItem :key="selectedClueId" :entry="selectedEntry" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>