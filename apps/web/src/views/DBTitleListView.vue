<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import titleData from "@/data/d/title.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedTitleId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<number>("tp", 0)

const selectedTitle = computed(() => {
    if (!selectedTitleId.value) return null
    return titleData.find(title => title.id === selectedTitleId.value) || null
})

const filteredTitles = computed(() => {
    return titleData.filter(title => {
        const matchesType = selectedType.value === 0 || (selectedType.value === 1 ? !title.suf : title.suf)

        if (searchKeyword.value === "") {
            return matchesType
        }

        const keyword = searchKeyword.value
        const idMatch = `${title.id}`.includes(keyword)
        const nameMatch = title.name.includes(keyword) || matchPinyin(title.name, keyword).match
        const srcText = title.src || ""
        const srcMatch = srcText.includes(keyword) || matchPinyin(srcText, keyword).match

        return matchesType && (idMatch || nameMatch || srcMatch)
    })
})

function selectTitle(id: number | null) {
    selectedTitleId.value = id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbt-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedTitle)" @collapse="selectTitle(null)">
            <template #master>
                <!-- 左侧列表面板 -->
                <div
                    class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                    :class="{ 'sm:border-r border-base-content/10': selectedTitle }"
                >
                    <!-- 检索带：下划线搜索 + 计数 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-title-list.search_placeholder')"
                            :count="filteredTitles.length"
                        />
                    </div>

                    <!-- 类型筛选方章 -->
                    <div class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">TYPE</span>
                            <button
                                class="btn btn-xs whitespace-nowrap"
                                :class="
                                selectedType === 0
                                    ? 'btn-primary'
                                    : ''
                            "
                                @click="selectedType = 0"
                            >
                                {{ $t("common.all") }}
                            </button>
                            <button
                                class="btn btn-xs whitespace-nowrap"
                                :class="
                                selectedType === 1
                                    ? 'btn-primary'
                                    : ''
                            "
                                @click="selectedType = 1"
                            >
                                {{ $t("db-title-list.prefix") }}
                            </button>
                            <button
                                class="btn btn-xs whitespace-nowrap"
                                :class="
                                selectedType === 2
                                    ? 'btn-primary'
                                    : ''
                            "
                                @click="selectedType = 2"
                            >
                                {{ $t("db-title-list.suffix") }}
                            </button>
                        </div>
                    </div>

                    <!-- 称号列表 -->
                    <ScrollArea class="flex-1">
                        <div class="p-3 space-y-2">
                            <article
                                v-for="(title, index) in filteredTitles"
                                :key="title.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                selectedTitleId === title.id
                                    ? 'dbt-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                            "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectTitle(title.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedTitleId === title.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="p-3">
                                    <div class="flex items-start justify-between gap-2">
                                        <h3
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedTitleId === title.id }"
                                        >
                                            {{ $t(title.name) }}
                                        </h3>
                                        <span
                                            class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 tracking-wide text-base-content/55"
                                        >
                                            {{ title.suf ? "后缀" : "前缀" }}
                                        </span>
                                    </div>
                                    <div class="mt-1.5 flex items-center gap-2">
                                        <CopyID :id="title.id" />
                                    </div>
                                    <p class="mt-2 line-clamp-2 break-all text-[11px] leading-relaxed text-base-content/45">
                                        {{ $t(title.src || "暂无来源说明") }}
                                    </p>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredTitles.length }}</b>
                            {{ $t("db-title-list.title_count") }}
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedTitle" class="min-h-0 min-w-0 flex-1">
                    <DBTitleDetailItem :key="selectedTitleId" :title="selectedTitle" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
