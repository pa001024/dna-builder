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
import { formatSkinColorizeRgb } from "@/data/skin-colorize"
import { useUIStore } from "@/store/ui"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
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
    const colorId = plan.colorIds.find(id => id !== 0)
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
        <aside class="hidden w-64 shrink-0 flex-col border-r border-base-200 bg-base-100 md:flex">
            <div class="shrink-0 p-4 pb-3">
                <button
                    class="w-full rounded-lg px-3 py-2 text-left text-sm font-medium"
                    :class="!filterCharId && !filterSeries ? 'bg-primary text-primary-content' : 'hover:bg-base-200'"
                    type="button"
                    @click="clearFilter"
                >
                    全部方案
                </button>
            </div>
            <ScrollArea class="min-h-0 flex-1">
                <div class="flex flex-col gap-5 px-4 pb-4">
                    <div class="flex flex-col gap-1.5">
                        <div class="mb-1 text-xs font-medium opacity-60">按角色</div>
                        <div class="grid grid-cols-2 gap-1.5">
                            <button
                                v-for="character in characters"
                                :key="character.id"
                                class="group relative h-16 overflow-hidden rounded-lg text-left transition-all"
                                :class="filterCharId === character.id ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-base-300'"
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
                        <div class="mb-1 text-xs font-medium opacity-60">按皮肤系列</div>
                        <div v-if="!seriesList.length" class="text-xs opacity-50">暂无系列</div>
                        <div v-else class="grid grid-cols-2 gap-1.5">
                            <button
                                v-for="series in seriesList"
                                :key="series.name"
                                class="group relative h-16 overflow-hidden rounded-lg text-left transition-all"
                                :class="filterSeries === series.name ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-base-300'"
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
                                <div v-else class="flex h-full w-full items-center justify-center bg-base-200 text-[10px] opacity-60">
                                    暂无图标
                                </div>
                                <span
                                    class="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/75 to-transparent px-1.5 pb-0.5 pt-3 text-[10px] font-medium text-white"
                                >
                                    {{ series.name }}
                                </span>
                                <span class="absolute right-1 top-1 rounded bg-black/60 px-1 text-[9px] leading-4 text-white"
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
                <div class="flex items-center gap-1 rounded-full bg-base-200 p-1">
                    <button
                        v-for="tab in [
                            { key: 'latest', label: '最新' },
                            { key: 'likes', label: '最热' },
                            { key: 'views', label: '最多浏览' },
                        ]"
                        :key="tab.key"
                        class="rounded-full px-3 py-1 text-sm"
                        :class="sortBy === tab.key ? 'bg-base-100 font-medium shadow' : 'opacity-60'"
                        type="button"
                        @click="switchSort(tab.key as 'latest' | 'likes' | 'views')"
                    >
                        {{ tab.label }}
                    </button>
                </div>
                <button class="btn btn-primary btn-sm" type="button" @click="goCreate">发布染色方案</button>
            </div>

            <div v-if="loading" class="flex flex-1 items-center justify-center">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="!plans.length" class="flex flex-1 flex-col items-center justify-center gap-3 text-sm opacity-60">
                <span>还没有染色方案</span>
                <button class="btn btn-outline btn-sm" type="button" @click="loadPlans(true)">刷新</button>
            </div>

            <template v-else>
                <div class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                    <div
                        v-for="plan in plans"
                        :key="plan.id"
                        class="group cursor-pointer overflow-hidden rounded border border-base-200 bg-base-100 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                        @click="router.push(`/skin-colorize/${plan.id}`)"
                    >
                        <div class="relative aspect-4/3 overflow-hidden bg-base-200">
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
                                    class="h-16 w-16 rounded-lg object-cover shadow"
                                />
                                <span v-if="!plan.colorIds.some(id => id !== 0)" class="text-xs opacity-70">默认配色</span>
                            </div>
                            <span
                                class="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur"
                                :class="plan.isOriginal ? 'bg-success/80 text-success-content' : 'bg-warning/80 text-warning-content'"
                            >
                                {{ plan.isOriginal ? "原创" : "转载" }}
                            </span>
                            <span
                                v-if="plan.hairCode"
                                class="absolute right-2 top-2 rounded bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-primary-content backdrop-blur"
                            >
                                含发型
                            </span>
                        </div>

                        <div class="flex flex-col gap-2 p-3">
                            <div class="line-clamp-2 text-sm font-medium leading-snug">{{ plan.title }}</div>
                            <div class="flex items-center gap-2">
                                <QQAvatar class="w-5" :qq="plan.user?.qq" />
                                <span class="min-w-0 flex-1 truncate text-xs opacity-70">{{ plan.user?.name || "匿名" }}</span>
                                <span class="shrink-0 text-[10px] opacity-50">{{
                                    formatRelativeTime(plan.createdAt, i18next.language)
                                }}</span>
                            </div>
                            <div class="flex items-center gap-3 text-[11px] opacity-60">
                                <span class="flex items-center gap-1"><Icon icon="ri:heart-line" />{{ plan.likes }}</span>
                                <span class="flex items-center gap-1"><Icon icon="ri:message-2-line" />{{ plan.commentsCount }}</span>
                                <span class="ml-auto flex items-center gap-1"><Icon icon="ri:eye-line" />{{ plan.views }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mt-4 flex justify-center">
                    <button v-if="hasMore" class="btn btn-outline btn-sm" type="button" :disabled="loadingMore" @click="loadPlans(false)">
                        {{ loadingMore ? "加载中..." : "加载更多" }}
                    </button>
                    <span v-else class="text-xs opacity-50">已经到底啦～</span>
                </div>
            </template>
        </main>
    </div>
</template>
