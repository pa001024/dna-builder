<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Book, booksData } from "@/data/d/book.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedBookId = useSearchParam<number>("id", 0)
const selectedRegionId = useSearchParam<number>("rg", 0)
const showFullTextSearch = useSearchParam<boolean>("fts", false)

/**
 * 根据 ID 获取当前选中的读物。
 */
const selectedBook = computed(() => {
    return selectedBookId.value ? booksData.find(book => book.id === selectedBookId.value) || null : null
})

/**
 * 资料库中的所有地区筛选项。
 */
const allRegions = computed(() => {
    const regionIdSet = new Set<number>()

    for (const book of booksData) {
        for (const regionId of getBookRegionIds(book)) {
            regionIdSet.add(regionId)
        }
    }

    return Array.from(regionIdSet)
        .sort((a, b) => a - b)
        .map(regionId => ({
            id: regionId,
            name: regionMap.get(regionId)?.name || `地区${regionId}`,
        }))
})

/**
 * 按关键词和地区筛选读物。
 */
const filteredBooks = computed(() => {
    return booksData.filter(book => {
        if (!passesRegionFilter(book)) {
            return false
        }

        return matchesBookKeyword(book, searchKeyword.value.trim())
    })
})

/**
 * 获取读物覆盖的地区 ID 列表。
 * @param book 读物
 * @returns 地区 ID 列表
 */
function getBookRegionIds(book: Book): number[] {
    const regionIdSet = new Set<number>()

    for (const resource of book.res) {
        if (!resource.srId) continue
        const subRegion = subRegionMap.get(resource.srId)
        if (subRegion) {
            regionIdSet.add(subRegion.rid)
        }
    }

    return Array.from(regionIdSet).sort((a, b) => a - b)
}

/**
 * 判断读物是否符合当前地区筛选条件。
 * @param book 读物
 * @returns 是否通过筛选
 */
function passesRegionFilter(book: Book): boolean {
    if (selectedRegionId.value === 0) {
        return true
    }

    return getBookRegionIds(book).includes(selectedRegionId.value)
}

/**
 * 判断读物是否命中关键词。
 * @param book 读物
 * @param keyword 关键词
 * @returns 是否命中
 */
function matchesBookKeyword(book: Book, keyword: string): boolean {
    if (keyword === "") {
        return true
    }

    if (`${book.id}`.includes(keyword) || book.name.includes(keyword) || book.desc.includes(keyword)) {
        return true
    }

    if (matchPinyin(book.name, keyword).match || matchPinyin(book.desc, keyword).match) {
        return true
    }

    return book.res.some(resource => {
        if (`${resource.id}`.includes(keyword)) {
            return true
        }

        const resourceName = resource.name || ""
        const resourceDesc = resource.desc || ""
        if (resourceName.includes(keyword) || resourceDesc.includes(keyword)) {
            return true
        }

        if (matchPinyin(resourceName, keyword).match || matchPinyin(resourceDesc, keyword).match) {
            return true
        }

        if (showFullTextSearch.value && resource.text.includes(keyword)) {
            return true
        }

        return false
    })
}

/**
 * 选中读物。
 * @param book 读物
 */
function selectBook(book: Book | null): void {
    selectedBookId.value = book?.id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbb-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedBook }"
            >
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="showFullTextSearch ? $t('book-list.searchPlaceholder') : $t('book-list.searchPlaceholderPinyin')"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredBooks.length }}
                        </span>
                    </div>
                </div>

                <!-- 筛选带：全文检索开关 + 地区方章 -->
                <div
                    class="flex-none space-y-2.5 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <label class="flex cursor-pointer select-none items-center gap-2 text-[11px] text-base-content/55">
                        <input v-model="showFullTextSearch" type="checkbox" class="checkbox checkbox-xs" />
                        <span>{{ $t("book-list.enableFullTextSearch") }}</span>
                    </label>

                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">REGION</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRegionId === 0
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedRegionId = 0"
                        >
                            {{ $t("book-list.allRegions") }}
                        </button>
                        <button
                            v-for="region in allRegions"
                            :key="region.id"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRegionId === region.id
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedRegionId = region.id"
                        >
                            {{ region.name }}
                        </button>
                    </div>
                </div>

                <!-- 读物列表 -->
                <ScrollArea class="flex-1">
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-3">
                        <article
                            v-for="(book, index) in filteredBooks"
                            :key="book.id"
                            class="group relative min-h-40 cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                            :class="
                                selectedBookId === book.id
                                    ? 'dbb-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                            :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectBook(book)"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedBookId === book.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex h-full flex-col items-center justify-center gap-2 pt-3 pb-10 text-center">
                                <ImageFallback :src="`/imgs/res/${book.icon}.webp`" :alt="book.name" class="size-24 shrink-0 rounded-xs object-cover">
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="book.name" class="size-24 shrink-0 rounded-xs" />
                                </ImageFallback>
                            </div>
                            <div class="absolute inset-x-2 bottom-2 text-center">
                                <div
                                    class="text-sm font-medium leading-tight whitespace-normal wrap-break-word transition-colors duration-200 group-hover:text-primary"
                                    :class="{ 'text-primary': selectedBookId === book.id }"
                                >
                                    {{ $t(book.name) }}
                                </div>
                                <div class="mt-1 flex items-center justify-center gap-2 font-mono text-[10px] tabular-nums text-base-content/40">
                                    <span>ID: {{ book.id }}</span>
                                    <span>x{{ book.res.length }}</span>
                                </div>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        {{ $t("book-list.totalCount", { count: filteredBooks.length }) }}
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedBook"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectBook(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedBook" class="min-w-0 flex-2">
                <DBBookDetailItem :key="selectedBookId" :book="selectedBook" />
            </ScrollArea>
        </div>
    </div>
</template>
