<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { parseNumberOrEmptySearchParam, useSearchParam } from "@/composables/useSearchParam"
import { draftMap } from "@/data/d"
import draftData from "@/data/d/draft.data"
import { getRewardTypeText } from "@/utils/i18n-utils"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedDraftId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<string | "">("tp", "")
const selectedRarity = useSearchParam<number | "">("rar", "", { parse: parseNumberOrEmptySearchParam })

// 根据 ID 获取选中的设计稿
const selectedDraft = computed(() => {
    return selectedDraftId.value ? draftMap.get(selectedDraftId.value) || null : null
})

// 获取所有可用类型
const types = computed(() => {
    const typeSet = new Set<string>()
    draftData.forEach(d => {
        typeSet.add(d.t)
    })
    return Array.from(typeSet).sort()
})

// 获取所有可用稀有度
const rarities = computed(() => {
    const raritySet = new Set<number>()
    draftData.forEach(d => {
        raritySet.add(d.r)
    })
    return Array.from(raritySet).sort((a, b) => b - a)
})

// 过滤设计稿列表
const filteredDrafts = computed(() => {
    return draftData.filter(d => {
        // 搜索筛选
        let matchKeyword = false
        if (searchKeyword.value === "") {
            matchKeyword = true
        } else {
            const q = searchKeyword.value
            // 直接中文匹配
            if (d.n.includes(q)) {
                matchKeyword = true
            } else {
                // 拼音匹配（全拼/首字母）
                matchKeyword = matchPinyin(d.n, q).match
            }
        }

        const matchType = selectedType.value === "" || d.t === selectedType.value
        const matchRarity = selectedRarity.value === "" || d.r === selectedRarity.value
        return matchKeyword && matchType && matchRarity
    })
})

// 将分钟数转换为00:00格式
function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbd-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedDraft }">
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索设计稿名称（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredDrafts.length }}
                        </span>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <!-- 类型筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">类型</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="type in types"
                            :key="type"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === type
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = type"
                        >
                            {{ $t(getRewardTypeText(type)) }}
                        </button>
                    </div>

                    <!-- 稀有度筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">稀有度</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRarity === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedRarity = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="rarity in rarities"
                            :key="rarity"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedRarity === rarity
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedRarity = rarity"
                        >
                            {{ ["", "白", "绿", "蓝", "紫", "金"][rarity] }}
                        </button>
                    </div>
                </div>

                <!-- 设计稿列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <div class="space-y-2">
                            <article
                                v-for="(draft, index) in filteredDrafts"
                                :key="draft.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedDraftId === draft.id
                                        ? 'dbd-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedDraftId = draft.id"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedDraftId === draft.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="p-3">
                                    <div class="flex items-start justify-between gap-3">
                                        <div class="min-w-0">
                                            <!-- 名称行：名称 + 稀有度徽记 -->
                                            <div class="flex items-baseline gap-2">
                                                <h3
                                                    class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                    :class="{ 'text-primary': selectedDraftId === draft.id }"
                                                >
                                                    {{ $t(draft.n) }}
                                                </h3>
                                                <span :class="getRarityBadgeClass(draft.r)">
                                                    {{ getRarityName(draft.r) }}
                                                </span>
                                            </div>
                                            <!-- 元信息行：类型 / 版本 / 制造时长 -->
                                            <div
                                                class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55"
                                            >
                                                <span>{{ $t(getRewardTypeText(draft.t)) }}</span>
                                                <span v-if="draft.v" class="font-mono tabular-nums">v{{ draft.v }}</span>
                                                <span
                                                    class="inline-flex items-center rounded-xs border border-base-content/15 bg-base-content/3 px-1.5 py-0.5 font-mono tabular-nums"
                                                >
                                                    {{ formatDuration(draft.d) }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- 属性行：产物数量 / 批量 / 无限 / 隐藏 / ID -->
                                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                        <span
                                            >产物数量: <span class="font-medium tabular-nums">{{ draft.c }}</span></span
                                        >
                                        <span v-if="draft.b">批量制造</span>
                                        <span v-if="draft.i">无限制造</span>
                                        <span v-if="!draft.s">隐藏</span>
                                        <span class="ml-auto shrink-0 font-mono tabular-nums text-base-content/35">ID: {{ draft.id }}</span>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredDrafts.length }}</b> 个设计稿
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedDraft"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedDraftId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedDraft" class="min-w-0 flex-1">
                <DBDraftDetailItem :key="selectedDraftId" :draft="selectedDraft" />
            </ScrollArea>
        </div>
    </div>
</template>
