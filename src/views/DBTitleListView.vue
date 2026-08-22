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
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedTitle }"
            >
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索称号ID/名称/来源（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredTitles.length }}
                        </span>
                    </div>
                </div>

                <!-- 类型筛选方章 -->
                <div class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">TYPE</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 0
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 0"
                        >
                            全部
                        </button>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 1
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 1"
                        >
                            前缀
                        </button>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 2
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 2"
                        >
                            后缀
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
                                    {{ title.src || "暂无来源说明" }}
                                </p>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredTitles.length }}</b> 个称号
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedTitle"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectTitle(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedTitle" class="min-w-0 flex-1">
                <DBTitleDetailItem :key="selectedTitleId" :title="selectedTitle" />
            </ScrollArea>
        </div>
    </div>
</template>
