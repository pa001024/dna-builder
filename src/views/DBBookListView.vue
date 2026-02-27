<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Book, booksData } from "@/data/d/book.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("book.searchKeyword", "")
const selectedBookId = useSearchParam<number>("book.selectedBook", 0)
const selectedRegionId = useSearchParam<number>("book.selectedRegion", 0)
const showFullTextSearch = useSearchParam<boolean>("book.showFullTextSearch", false)

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
        const subRegion = subRegionMap.get(resource.srId)
        if (subRegion) {
            regionIdSet.add(subRegion.rid)
        }
    }

    return Array.from(regionIdSet).sort((a, b) => a - b)
}

/**
 * 获取读物覆盖的地区名称列表。
 * @param book 读物
 * @returns 地区名称
 */
function getBookRegionNames(book: Book): string[] {
    return getBookRegionIds(book).map(regionId => regionMap.get(regionId)?.name || `地区${regionId}`)
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

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedBook }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        :placeholder="showFullTextSearch ? '搜索读物ID/名称/描述/正文...' : '搜索读物ID/名称/描述（支持拼音）...'"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <div class="p-2 border-b border-base-200 space-y-2">
                    <label class="flex items-center gap-2 text-xs text-base-content/70 cursor-pointer select-none">
                        <input v-model="showFullTextSearch" type="checkbox" class="checkbox checkbox-xs" />
                        <span>启用正文检索（不支持拼音）</span>
                    </label>

                    <div class="flex flex-wrap gap-1">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedRegionId === 0 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedRegionId = 0"
                        >
                            全部地区
                        </button>
                        <button
                            v-for="region in allRegions"
                            :key="region.id"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="
                                selectedRegionId === region.id ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedRegionId = region.id"
                        >
                            {{ region.name }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="book in filteredBooks"
                            :key="book.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedBookId === book.id }"
                            @click="selectBook(book)"
                        >
                            <div class="flex items-start justify-between gap-2">
                                <div class="flex-1 min-w-0">
                                    <div class="font-medium wrap-break-word">{{ book.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">ID: {{ book.id }} | 条目 {{ book.res.length }} 条</div>
                                </div>
                            </div>

                            <div class="flex flex-wrap gap-1 mt-2">
                                <span
                                    v-for="regionName in getBookRegionNames(book)"
                                    :key="`${book.id}-${regionName}`"
                                    class="px-1.5 py-0.5 text-xs rounded bg-base-300/80"
                                >
                                    {{ regionName }}
                                </span>
                            </div>

                            <div class="text-xs opacity-70 mt-2 line-clamp-2">
                                {{ book.desc }}
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredBooks.length }} 本读物
                </div>
            </div>

            <div
                v-if="selectedBook"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectBook(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedBook" class="flex-2">
                <DBBookDetailItem :book="selectedBook" />
            </ScrollArea>
        </div>
    </div>
</template>
