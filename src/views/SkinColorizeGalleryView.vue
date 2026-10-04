<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import type { DyePlan } from "@/api/gen/api-types"
import { dyePlansQuery } from "@/api/graphql"
import { LeveledChar } from "@/data"
import { skinData } from "@/data/d/accessory.data"
import charData from "@/data/d/char.data"
import { skinColorizeSwatches } from "@/data/d/skin-colorize.data"
import { useUIStore } from "@/store/ui"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import { formatSkinColorizeRgb } from "@/utils/skin-colorize"
import { formatRelativeTime } from "@/utils/time"

const router = useRouter()
const ui = useUIStore()
/** i18n 实例（代理访问会登记语言切换重渲染依赖，保证相对时间随语言刷新）。 */
const { i18next } = useTranslation()

const plans = ref<DyePlan[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const offset = ref(0)
const hasMore = ref(true)
/** 排序方式：最新 / 最热 / 最多浏览。 */
const sortBy = ref<"latest" | "likes" | "views">("latest")
/** 角色筛选。 */
const filterCharId = ref<number>()
/** 皮肤系列筛选（同一主题皮肤同名，如「叛逆风尚」）。 */
const filterSeries = ref<string>()
const PAGE_SIZE = 24

/** 拥有可染色皮肤的角色列表。 */
const characters = computed(() => {
    const charIds = new Set(skinData.filter(skin => skin.id !== skin.charId).map(skin => skin.charId))
    return charData.filter(character => charIds.has(character.id))
})

/** 皮肤系列列表（按名称聚合可染色皮肤，仅保留数量 > 1 的主题系列，附带代表皮肤图标）。 */
const seriesList = computed(() => {
    const counts = new Map<string, number>()
    for (const skin of skinData) {
        if (skin.id === skin.charId) continue
        counts.set(skin.name, (counts.get(skin.name) || 0) + 1)
    }
    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([name, count]) => {
            const firstSkin = skinData.find(skin => skin.name === name && skin.id !== skin.charId)
            return { name, count, icon: firstSkin?.icon || "" }
        })
        .sort((left, right) => right.count - left.count)
})

/** 当前筛选命中的皮肤 ID 列表，未筛选时返回 undefined（查全部）。 */
const filterSkinIds = computed(() => {
    if (filterCharId.value) {
        return skinData.filter(skin => skin.charId === filterCharId.value && skin.id !== skin.charId).map(skin => skin.id)
    }
    if (filterSeries.value) {
        return skinData.filter(skin => skin.name === filterSeries.value && skin.id !== skin.charId).map(skin => skin.id)
    }
    return undefined
})

/**
 * @description 获取方案对应皮肤的本地数据，用于卡片展示角色名与图标兜底。
 * @param plan 染色方案。
 * @returns 皮肤数据。
 */
function getSkin(plan: DyePlan) {
    return skinData.find(item => item.id === plan.skinId)
}

/**
 * @description 生成无预览图卡片时的兜底背景色（取方案第一个色板的 RGB）。
 * @param plan 染色方案。
 * @returns CSS 颜色字符串。
 */
function getFallbackColor(plan: DyePlan) {
    const colorId = plan.colorIds?.find(id => id !== 0)
    const swatch = skinColorizeSwatches.find(item => item.id === colorId)
    return swatch ? formatSkinColorizeRgb(swatch.rgb) : "transparent"
}

/**
 * @description 加载染色方案列表，reset 为 true 时从第一页重新加载。
 * @param reset 是否重置分页。
 */
async function loadPlans(reset = false) {
    if (reset) {
        offset.value = 0
        plans.value = []
        hasMore.value = true
    }
    if (loading.value || loadingMore.value || !hasMore.value) return
    if (reset) {
        loading.value = true
    } else {
        loadingMore.value = true
    }
    try {
        const result = await dyePlansQuery({
            skinIds: filterSkinIds.value,
            limit: PAGE_SIZE,
            offset: offset.value,
            sortBy: sortBy.value,
        })
        const list = result || []
        plans.value = reset ? list : [...plans.value, ...list]
        offset.value += list.length
        hasMore.value = list.length >= PAGE_SIZE
    } catch (error) {
        console.error("加载染色方案列表失败:", error)
        ui.showErrorMessage("加载染色方案列表失败")
    } finally {
        loading.value = false
        loadingMore.value = false
    }
}

/** 切换筛选条件并重新加载列表。 */
function toggleFilter(type: "char" | "series", value: string) {
    if (type === "char") {
        const charId = Number(value)
        filterCharId.value = filterCharId.value === charId ? undefined : charId
        filterSeries.value = undefined
    } else {
        filterSeries.value = filterSeries.value === value ? undefined : value
        filterCharId.value = undefined
    }
    void loadPlans(true)
}

/** 清除全部筛选。 */
function clearFilter() {
    filterCharId.value = undefined
    filterSeries.value = undefined
    void loadPlans(true)
}

/** 切换排序方式并重新加载。 */
function switchSort(value: "latest" | "likes" | "views") {
    if (sortBy.value === value) return
    sortBy.value = value
    void loadPlans(true)
}

/** 前往发布页，将当前筛选（角色或系列）作为 URL 参数传入。 */
function goCreate() {
    router.push({
        path: "/skin-colorize/new",
        query: {
            ...(filterCharId.value ? { charId: String(filterCharId.value) } : {}),
            ...(filterSeries.value ? { series: filterSeries.value } : {}),
        },
    })
}

onMounted(() => {
    void loadPlans(true)
})

watch(filterSkinIds, () => {
    void loadPlans(true)
})
</script>

<template>
    <div class="flex h-full min-h-0 w-full">
        <!-- 左侧筛选栏 -->
        <aside class="hidden w-64 shrink-0 flex-col border-r border-base-content/10 md:flex">
            <div class="shrink-0 p-4 pb-3">
                <button
                    class="w-full cursor-pointer rounded-xs border px-3 py-1.5 text-left text-[13px] transition-colors duration-150 active:scale-[0.98]"
                    :class="
                        !filterCharId && !filterSeries
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    type="button"
                    @click="clearFilter"
                >
                    {{ $t('skin-colorize-gallery.all_schemes') }}
                </button>
            </div>
            <ScrollArea class="min-h-0 flex-1">
                <div class="flex flex-col gap-5 px-4 pb-4">
                    <div class="flex flex-col gap-1.5">
                        <div class="mb-1 text-[11px] tracking-wide text-base-content/55">{{ $t('skin-colorize-gallery.by_character') }}</div>
                        <div class="grid grid-cols-2 gap-1.5">
                            <button
                                v-for="character in characters"
                                :key="character.id"
                                class="group relative h-16 overflow-hidden rounded-xs border text-left transition-colors duration-150 active:scale-[0.98]"
                                :class="
                                    filterCharId === character.id
                                        ? 'dbcg-item-active border-primary'
                                        : 'border-base-content/15 hover:border-primary/50'
                                "
                                type="button"
                                :title="character.名称"
                                @click="toggleFilter('char', String(character.id))"
                            >
                                <img
                                    :src="LeveledChar.url(character.icon)"
                                    :alt="character.名称"
                                    class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                    loading="lazy"
                                />
                                <span
                                    class="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/75 to-transparent px-1.5 pb-0.5 pt-3 text-[10px] font-medium text-white"
                                >
                                    {{ character.名称 }}
                                </span>
                            </button>
                        </div>
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <div class="mb-1 text-[11px] tracking-wide text-base-content/55">{{ $t('skin-colorize-gallery.by_series') }}</div>
                        <div v-if="!seriesList.length" class="text-[11px] text-base-content/45">{{ $t('skin-colorize-gallery.no_series') }}</div>
                        <div v-else class="grid grid-cols-2 gap-1.5">
                            <button
                                v-for="series in seriesList"
                                :key="series.name"
                                class="group relative h-16 overflow-hidden rounded-xs border text-left transition-colors duration-150 active:scale-[0.98]"
                                :class="
                                    filterSeries === series.name
                                        ? 'dbcg-item-active border-primary'
                                        : 'border-base-content/15 hover:border-primary/50'
                                "
                                type="button"
                                :title="`${series.name} ×${series.count}`"
                                @click="toggleFilter('series', series.name)"
                            >
                                <img
                                    v-if="series.icon"
                                    :src="resolveSkinIconUrl(series.icon)"
                                    :alt="series.name"
                                    class="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                    loading="lazy"
                                />
                                <div v-else class="flex h-full w-full items-center justify-center bg-base-content/5 text-[10px] text-base-content/45">
                                    {{ $t('skin-colorize-gallery.no_icon') }}
                                </div>
                                <span
                                    class="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/75 to-transparent px-1.5 pb-0.5 pt-3 text-[10px] font-medium text-white"
                                >
                                    {{ series.name }}
                                </span>
                                <span
                                    class="absolute right-1 top-1 rounded-xs border border-white/20 bg-black/60 px-1 text-[9px] leading-4 tabular-nums text-white backdrop-blur-sm"
                                    >×{{ series.count }}</span
                                >
                            </button>
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </aside>

        <!-- 右侧卡片瀑布 -->
        <main class="flex min-h-0 flex-1 flex-col overflow-auto p-4">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-1.5">
                    <button
                        v-for="tab in [
                            { key: 'latest', label: '最新' },
                            { key: 'likes', label: '最热' },
                            { key: 'views', label: '最多浏览' },
                        ]"
                        :key="tab.key"
                        class="inline-flex h-7 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-xs border px-2.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                        :class="
                            sortBy === tab.key
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        type="button"
                        @click="switchSort(tab.key as 'latest' | 'likes' | 'views')"
                    >
                        {{ tab.label }}
                    </button>
                </div>
                <button
                    class="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-xs border border-primary bg-primary px-3 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 active:scale-[0.98]"
                    type="button"
                    @click="goCreate"
                >
                    {{ $t('skin-colorize-gallery.publish_scheme') }}
                </button>
            </div>

            <div v-if="loading" class="flex flex-1 items-center justify-center">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="!plans.length" class="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-base-content/45">
                <span>{{ $t('skin-colorize-gallery.no_schemes') }}</span>
                <button
                    class="inline-flex h-7 cursor-pointer items-center rounded-xs border border-base-content/20 px-3 text-xs text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.98]"
                    type="button"
                    @click="loadPlans(true)"
                >
                    {{ $t('common.refresh') }}
                </button>
            </div>

            <template v-else>
                <div class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                    <article
                        v-for="(plan, index) in plans"
                        :key="plan.id"
                        class="group animate-ef-rise cursor-pointer overflow-hidden rounded-xs border border-base-content/15 bg-base-100/60 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 active:scale-[0.99] motion-reduce:animate-none"
                        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                        @click="router.push(`/skin-colorize/${plan.id}`)"
                    >
                        <div class="relative aspect-4/3 overflow-hidden bg-base-content/3">
                            <img
                                v-if="plan.imageUrl"
                                :src="plan.imageUrl"
                                :alt="plan.title"
                                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                            />
                            <div
                                v-else
                                class="flex h-full w-full flex-col items-center justify-center gap-2"
                                :style="{ background: getFallbackColor(plan) }"
                            >
                                <img
                                    v-if="getSkin(plan)?.icon"
                                    :src="resolveSkinIconUrl(getSkin(plan)!.icon)"
                                    :alt="plan.title"
                                    class="h-16 w-16 rounded-xs object-cover"
                                />
                                <span v-if="!plan.colorIds?.some(id => id !== 0)" class="text-[11px] text-base-content/55">{{
                                    $t('skin-colorize-gallery.default_colors')
                                }}</span>
                            </div>
                            <span
                                class="absolute left-2 top-2 rounded-xs border px-1.5 py-0.5 text-[10px] font-medium leading-none backdrop-blur-sm"
                                :class="
                                    plan.isOriginal
                                        ? 'border-success/50 bg-success/85 text-success-content'
                                        : 'border-warning/50 bg-warning/85 text-warning-content'
                                "
                            >
                                {{ plan.isOriginal ? "原创" : "转载" }}
                            </span>
                            <span
                                v-if="plan.hairCode"
                                class="absolute right-2 top-2 rounded-xs border border-primary/50 bg-primary/85 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-content backdrop-blur-sm"
                            >
                                {{ $t('skin-colorize-gallery.include_hair') }}
                            </span>
                        </div>

                        <div class="flex flex-col gap-2 p-3">
                            <div class="line-clamp-2 text-[13px] font-medium leading-snug transition-colors duration-150 group-hover:text-primary">
                                {{ plan.title }}
                            </div>
                            <div class="flex items-center gap-2">
                                <QQAvatar class="w-5" :qq="plan.user?.qq" />
                                <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/60">{{ plan.user?.name || "匿名" }}</span>
                                <span class="shrink-0 text-[10px] tabular-nums text-base-content/40">{{
                                    formatRelativeTime(plan.createdAt, i18next.language)
                                }}</span>
                            </div>
                            <div class="flex items-center gap-3 text-[11px] text-base-content/50">
                                <span class="flex items-center gap-1">
                                    <Icon icon="ri:heart-line" class="size-3.5 shrink-0" />
                                    <span class="tabular-nums">{{ plan.likes }}</span>
                                </span>
                                <span class="flex items-center gap-1">
                                    <Icon icon="ri:message-2-line" class="size-3.5 shrink-0" />
                                    <span class="tabular-nums">{{ plan.commentsCount }}</span>
                                </span>
                                <span class="ml-auto flex items-center gap-1">
                                    <Icon icon="ri:eye-line" class="size-3.5 shrink-0" />
                                    <span class="tabular-nums">{{ plan.views }}</span>
                                </span>
                            </div>
                        </div>
                    </article>
                </div>

                <div class="mt-4 flex justify-center">
                    <button
                        v-if="hasMore"
                        class="inline-flex h-7 items-center rounded-xs border px-3 text-xs transition-colors duration-150 active:scale-[0.98]"
                        :class="
                            loadingMore
                                ? 'cursor-not-allowed border-base-content/15 text-base-content/30'
                                : 'cursor-pointer border-base-content/20 text-base-content/70 hover:border-primary/60 hover:text-primary'
                        "
                        type="button"
                        :disabled="loadingMore"
                        @click="loadPlans(false)"
                    >
                        {{ loadingMore ? "加载中..." : "加载更多" }}
                    </button>
                    <span v-else class="text-[11px] tracking-wide text-base-content/45">{{ $t('skin-colorize-gallery.end_of_list') }}</span>
                </div>
            </template>
        </main>
    </div>
</template>
