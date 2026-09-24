<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { parseNumberOrEmptySearchParam, useSearchParam } from "@/composables/useSearchParam"
import { LeveledMod, LeveledWeapon } from "@/data"
import { draftMap, modMap, resourceMap, weaponMap } from "@/data/d"
import { charAccessoryData } from "@/data/d/accessory.data"
import draftData, { type Draft } from "@/data/d/draft.data"
import { iconticketMap } from "@/data/d/iconticket.data"
import { getRewardTypeText } from "@/utils/i18n-utils"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityBadgeClass, getRarityGradientClass, getRarityName } from "@/utils/rarity-utils"

const { gt } = useGameText()

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

/**
 * 解析设计稿产物的图标地址。
 *
 * 产物分五类，各自落在对应图鉴的图标目录里；查不到数据时返回空串，
 * 交由 ImageFallback 显示占位图。
 * @param draft 设计稿数据
 * @returns 图标地址
 */
function getDraftIconUrl(draft: Draft): string {
    if (draft.t === "Mod") {
        const mod = modMap.get(draft.p)
        return mod ? LeveledMod.url(mod.icon) : ""
    }

    if (draft.t === "Weapon") {
        const weapon = weaponMap.get(draft.p)
        return weapon ? LeveledWeapon.url(weapon.icon) : ""
    }

    if (draft.t === "IronTicket") {
        const ticket = iconticketMap.get(draft.p)
        return ticket ? `/imgs/res/${ticket.icon}.webp` : ""
    }

    if (draft.t === "CharAccessory") {
        const accessory = charAccessoryData.find(item => item.id === draft.p)
        return accessory ? `/imgs/fashion/${accessory.icon}.webp` : ""
    }

    const resource = resourceMap.get(draft.p)
    return resource ? `/imgs/res/${resource.icon}.webp` : ""
}

/**
 * 卡片行高（px）的估算值，取卡片自然高度的下界（窄窗口断点下最矮的一档）；
 * 实际行高由列表按渲染结果校正，卡片靠它拉平。
 */
const DRAFT_CARD_HEIGHT = 86

/** 选中设计稿在过滤结果中的下标；虚拟滚动靠它把选中项滚入视口，未选中为 -1。 */
const selectedDraftIndex = computed(() => filteredDrafts.value.findIndex(draft => draft.id === selectedDraftId.value))
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedDraft)" @collapse="selectedDraftId = 0">
            <template #master>
                <!-- 左侧列表面板 -->
                <div
                    class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                    :class="{ 'sm:border-r border-base-content/10': selectedDraft }"
                >
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
                    <div class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
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
                    <VirtualList
                        class="flex-1"
                        :items="filteredDrafts"
                        :item-height="DRAFT_CARD_HEIGHT"
                        :item-key="draft => draft.id"
                        :active-index="selectedDraftIndex"
                        v-slot="{ item: draft, index, animate, rowHeight }"
                    >
                        <article
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                            :class="[
                                selectedDraftId === draft.id
                                    ? 'dbd-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50',
                                animate ? 'animate-ef-rise motion-reduce:animate-none' : '',
                            ]"
                            :style="{ minHeight: `${rowHeight}px`, animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectedDraftId = draft.id"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedDraftId === draft.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex items-start gap-3 p-3">
                                <!-- 产物图标：底色按稀有度渐变 -->
                                <ImageFallback
                                    :src="getDraftIconUrl(draft)"
                                    :alt="$t(draft.n)"
                                    class="size-12 shrink-0 rounded-xs bg-linear-15"
                                    :class="getRarityGradientClass(draft.r)"
                                >
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="$t(draft.n)" class="size-12 shrink-0 rounded-xs" />
                                </ImageFallback>
                                <div class="min-w-0 flex-1">
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
                                                    {{ gt(getRarityName(draft.r)) }}
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
                            </div>
                        </article>
                    </VirtualList>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            共
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredDrafts.length }}</b>
                            个设计稿
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedDraft" class="min-h-0 min-w-0 flex-1">
                    <DBDraftDetailItem :key="selectedDraftId" :draft="selectedDraft" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
