<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Review, reviewData } from "@/data/d/review.data"
import { matchPinyin } from "@/utils/pinyin-utils"

/** 剧情回顾里的一个条目：把「页 → 列 → 主线/支线」三层摊平成列表可用的扁平结构 */
export interface ReviewEntry {
    pageId: number
    episodeName: string
    chainId: number
    column: number
    /** 是否为该列的主线条目（否则为支线） */
    isMain: boolean
    review: Review
}

const { gt } = useGameText()

const searchKeyword = useSearchParam<string>("kw", "")
const selectedReviewId = useSearchParam<number>("id", 0)

/** 全量回顾条目（按页 → 列 → 主线/支线顺序摊平） */
const allEntries = computed<ReviewEntry[]>(() => {
    const list: ReviewEntry[] = []

    for (const page of reviewData) {
        for (const chain of page.chains) {
            for (const review of chain.main) {
                list.push({
                    pageId: page.id,
                    episodeName: page.episodeName || "",
                    chainId: chain.id,
                    column: chain.column,
                    isMain: true,
                    review,
                })
            }

            for (const review of chain.side) {
                list.push({
                    pageId: page.id,
                    episodeName: page.episodeName || "",
                    chainId: chain.id,
                    column: chain.column,
                    isMain: false,
                    review,
                })
            }
        }
    }

    return list
})

/** 按关键词筛选回顾条目 */
const filteredEntries = computed(() => allEntries.value.filter(entry => matchesEntryKeyword(entry, searchKeyword.value.trim())))

/** 当前选中的回顾条目 */
const selectedEntry = computed(() => {
    return selectedReviewId.value ? allEntries.value.find(entry => entry.review.id === selectedReviewId.value) || null : null
})

/**
 * 判断回顾条目是否命中关键词。
 * @param entry 回顾条目
 * @param keyword 关键词
 * @returns 是否命中
 */
function matchesEntryKeyword(entry: ReviewEntry, keyword: string): boolean {
    if (keyword === "") {
        return true
    }

    const { review, episodeName } = entry

    if (`${review.id}`.includes(keyword) || review.name.includes(keyword) || episodeName.includes(keyword)) {
        return true
    }

    if (matchPinyin(review.name, keyword).match || matchPinyin(episodeName, keyword).match) {
        return true
    }

    const content = review.content || ""

    if (content.includes(keyword)) {
        return true
    }

    return matchPinyin(content, keyword).match
}

/**
 * 选中回顾条目。
 * @param entry 回顾条目
 */
function selectEntry(entry: ReviewEntry | null): void {
    selectedReviewId.value = entry?.review.id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbrv-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 3" :detail-open="Boolean(selectedEntry)" @collapse="selectEntry(null)">
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
                                :placeholder="$t('review-list.searchPlaceholder')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                            />
                            <span
                                class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                            >
                                {{ filteredEntries.length }}
                            </span>
                        </div>
                    </div>

                    <!-- 回顾列表 -->
                    <ScrollArea class="flex-1">
                        <div class="space-y-2 p-3">
                            <article
                                v-for="(entry, index) in filteredEntries"
                                :key="entry.review.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedReviewId === entry.review.id
                                        ? 'dbrv-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectEntry(entry)"
                            >
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedReviewId === entry.review.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-center gap-3 p-3">
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="text-sm font-medium leading-tight whitespace-normal wrap-break-word transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedReviewId === entry.review.id }"
                                        >
                                            {{ gt(entry.review.name) }}
                                        </div>
                                        <div class="mt-1 truncate text-[11px] text-base-content/50">{{ gt(entry.episodeName) }}</div>
                                    </div>
                                    <div class="flex shrink-0 flex-col items-end gap-1">
                                        <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] tracking-wide text-base-content/50">
                                            {{ entry.isMain ? $t("review-detail.main") : $t("review-detail.side") }}
                                        </span>
                                        <span
                                            class="rounded-xs border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-orbitron text-[10px] font-bold tabular-nums text-primary"
                                        >
                                            #{{ entry.column }}
                                        </span>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("review-list.totalCount", { count: filteredEntries.length }) }}
                        </p>
                    </div>
                </div>
            </template>

            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedEntry" class="min-h-0 min-w-0 flex-2">
                    <DBReviewDetailItem :key="selectedReviewId" :entry="selectedEntry" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>