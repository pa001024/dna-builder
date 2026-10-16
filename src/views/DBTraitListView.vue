<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { charTraitEntries, getCharTraitGroupName, getCharTraitIconUrl, getCharTraitStyle } from "@/utils/char-trait"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedTraitName = useSearchParam<string>("id", "")
const selectedGroup = useSearchParam<string>("grp", "")

const selectedTrait = computed(() => {
    if (!selectedTraitName.value) return null
    return charTraitEntries.find(entry => entry.name === selectedTraitName.value) || null
})

/** 配色分组筛选项（与游戏分组对齐 + 未知兜底） */
const groups = ["Red", "Blue", "Green", "Special", "Other"]

const filteredTraits = computed(() => {
    const keyword = searchKeyword.value.trim()
    return charTraitEntries.filter(entry => {
        if (selectedGroup.value && getCharTraitGroupName(entry.tag) !== selectedGroup.value) return false
        if (!keyword) return true
        if (entry.name.includes(keyword) || entry.desc.includes(keyword) || entry.tag.toLowerCase().includes(keyword.toLowerCase())) {
            return true
        }
        return matchPinyin(entry.name, keyword).match || matchPinyin(entry.desc, keyword).match
    })
})

/**
 * 取条目的图标配色。
 * @param tag 标签 key
 * @returns 配色
 */
function styleOf(tag: string) {
    return getCharTraitStyle(tag)
}

function selectTrait(name: string | null) {
    selectedTraitName.value = name || ""
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbtr-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedTrait)" @collapse="selectTrait(null)">
            <template #master>
                <!-- 左侧列表面板 -->
                <div
                    class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                    :class="{ 'sm:border-r border-base-content/10': selectedTrait }"
                >
                    <!-- 检索带：下划线搜索 + 计数 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-trait-list.search_placeholder')"
                            :count="filteredTraits.length"
                        />
                    </div>

                    <!-- 分组筛选方章 -->
                    <div class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">GROUP</span>
                            <button
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedGroup === ''
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedGroup = ''"
                            >
                                {{ $t("common.all") }}
                            </button>
                            <button
                                v-for="group in groups"
                                :key="group"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedGroup === group
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedGroup = group"
                            >
                                {{ $t(`db-trait-list.group_${group.toLowerCase()}`) }}
                            </button>
                        </div>
                    </div>

                    <!-- 特质列表 -->
                    <ScrollArea class="flex-1">
                        <div class="space-y-2 p-3">
                            <article
                                v-for="(entry, index) in filteredTraits"
                                :key="entry.name"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedTraitName === entry.name
                                        ? 'dbtr-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectTrait(entry.name)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedTraitName === entry.name ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-2.5 p-3">
                                    <div
                                        class="relative size-10 shrink-0 overflow-hidden rounded-xs"
                                        :style="{ background: styleOf(entry.tag).plate }"
                                    >
                                        <span
                                            class="absolute inset-0"
                                            :style="{
                                                backgroundColor: styleOf(entry.tag).glyph,
                                                mask: `url(${getCharTraitIconUrl(entry.icon)}) no-repeat center/64%`,
                                            }"
                                            aria-hidden="true"
                                        />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-start justify-between gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedTraitName === entry.name }"
                                            >
                                                {{ $t(entry.name) }}
                                            </h3>
                                            <span
                                                class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 tracking-wide text-base-content/55"
                                            >
                                                {{ entry.tag }}
                                            </span>
                                        </div>
                                        <p class="mt-1 line-clamp-2 break-all text-[11px] leading-relaxed text-base-content/45">
                                            {{ $t(entry.desc) }}
                                        </p>
                                        <div class="mt-1.5 flex items-center gap-2">
                                            <span class="font-orbitron text-[11px] font-semibold text-primary tabular-nums">
                                                {{ entry.owners.length }}
                                            </span>
                                            <span class="text-[11px] text-base-content/45">{{ $t("db-trait-list.owner_count") }}</span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredTraits.length }}</b>
                            {{ $t("db-trait-list.trait_count") }}
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedTrait" class="min-h-0 min-w-0 flex-1">
                    <DBTraitDetailItem :key="selectedTraitName" :trait="selectedTrait" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
