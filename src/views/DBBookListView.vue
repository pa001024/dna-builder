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
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                </div>

                <div class="p-2 border-b border-base-200 space-y-2">
                    <label class="flex items-center gap-2 text-xs text-base-content/70 cursor-pointer select-none">
                        <input v-model="showFullTextSearch" type="checkbox" class="checkbox checkbox-xs" />
                        <span>启用正文检索（不支持拼音）</span>
                    </label>

                    <div class="flex flex-wrap gap-1">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200"
                            :class="selectedRegionId === 0 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedRegionId = 0"
                        >
                            全部地区
                        </button>
                        <button
                            v-for="region in allRegions"
                            :key="region.id"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all duration-200 cursor-pointer"
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
                    <div class="p-2 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                        <div
                            v-for="book in filteredBooks"
                            :key="book.id"
                            class="relative min-h-40 p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300 overflow-hidden"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedBookId === book.id }"
                            @click="selectBook(book)"
                        >
                            <div class="flex h-full flex-col items-center justify-center gap-2 text-center pb-10">
                                <ImageFallback
                                    :src="`/imgs/res/${book.icon}.webp`"
                                    :alt="book.name"
                                    class="size-24 rounded shrink-0 object-cover"
                                >
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="book.name" class="size-24 rounded shrink-0" />
                                </ImageFallback>
                            </div>
                            <div class="absolute inset-x-2 bottom-2 text-center">
                                <div class="font-medium text-sm leading-tight whitespace-normal wrap-break-word">{{ book.name }}</div>
                                <div class="text-xs opacity-70 mt-1">
                                    <span> ID: {{ book.id }} </span>
                                    <span> x{{ book.res.length }} </span>
                                </div>
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
