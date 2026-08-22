<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledMod } from "@/data"
import { modMap } from "@/data/d"
import { modConvertData } from "@/data/d/convert.data"
import modData from "@/data/d/mod.data"
import { formatProp } from "@/util"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedModId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<string>("tp", "")
const selectedSeries = useSearchParam<string>("ser", "")
const selectedQuality = useSearchParam<string>("ql", "")
const selectedElem = useSearchParam<string>("el", "")
const selectedVersion = useSearchParam<string>("ver", "")

// 根据 ID 获取选中的魔之楔
const selectedMod = computed(() => {
    return selectedModId.value ? modMap.get(selectedModId.value) || null : null
})

// 过滤选项显示控制
const showTypeFilter = useLocalStorage("mod.showTypeFilter", false)
const showSeriesFilter = useLocalStorage("mod.showSeriesFilter", false)
const showQualityFilter = useLocalStorage("mod.showQualityFilter", false)
const showElemFilter = useLocalStorage("mod.showElemFilter", false)
const showVersionFilter = useLocalStorage("mod.showVersionFilter", false)

// 获取所有可用类型
const types = computed(() => {
    const typeSet = new Set<string>()
    modData.forEach(m => {
        typeSet.add(m.类型)
    })
    return Array.from(typeSet).sort()
})

// 获取所有可用系列
const series = computed(() => {
    const seriesSet = new Set<string>()
    modData.forEach(m => {
        seriesSet.add(m.系列)
    })
    return Array.from(seriesSet).sort()
})

// 获取所有可用品质
const qualities = computed(() => {
    const qualitySet = new Set<string>()
    modData.forEach(m => {
        qualitySet.add(m.品质)
    })
    return Array.from(qualitySet).sort()
})

// 获取所有可用版本
const versions = computed(() => {
    const versionSet = new Set<string>()
    modData.forEach(m => {
        if (m.版本) {
            versionSet.add(m.版本)
        }
    })
    return Array.from(versionSet).sort()
})

const elems = ["火", "水", "雷", "风", "暗", "光"]
const modConvertIdSet = new Set<number>(modConvertData.flatMap(pool => pool.ModId))

/**
 * 判断魔之楔是否可通过同品质转换获得
 * @param modId 魔之楔ID
 * @returns 是否可转换
 */
function isModConvertible(modId: number): boolean {
    return modConvertIdSet.has(modId)
}

// 过滤魔之楔列表
const filteredMods = computed(() => {
    return modData.filter(m => {
        // 搜索筛选
        let matchKeyword = false
        if (searchKeyword.value === "") {
            matchKeyword = true
        } else {
            const q = searchKeyword.value
            // 直接中文匹配
            if (m.名称.includes(q)) {
                matchKeyword = true
            } else {
                // 拼音匹配（全拼/首字母）
                const nameMatch = matchPinyin(m.名称, q).match
                if (nameMatch) {
                    matchKeyword = true
                } else {
                    // 尝试匹配系列
                    const seriesMatch = matchPinyin(m.系列, q).match
                    matchKeyword = seriesMatch
                }
            }
        }

        const matchType = selectedType.value === "" || m.类型 === selectedType.value
        const matchSeries = selectedSeries.value === "" || m.系列 === selectedSeries.value
        const matchQuality = selectedQuality.value === "" || m.品质 === selectedQuality.value
        const matchElem = selectedElem.value === "" || m.属性 === selectedElem.value
        const matchVersion = selectedVersion.value === "" || m.版本 === selectedVersion.value
        return matchKeyword && matchType && matchSeries && matchQuality && matchElem && matchVersion
    })
})

// 切换过滤选项显示
function toggleFilter(filterName: string, show: boolean) {
    if (!show) {
        // 取消勾选时清空对应的过滤
        if (filterName === "type") selectedType.value = ""
        if (filterName === "series") selectedSeries.value = ""
        if (filterName === "quality") selectedQuality.value = ""
        if (filterName === "elem") selectedElem.value = ""
        if (filterName === "version") selectedVersion.value = ""
    }
}

/**
 * 过滤器名称。
 */
type FilterName = "type" | "series" | "quality" | "elem" | "version"

/**
 * 切换过滤行显示状态；收起时清空对应筛选值，避免隐藏后筛选仍生效。
 * @param name 过滤器名称
 */
function toggleFilterRow(name: FilterName) {
    let visible: boolean
    switch (name) {
        case "type":
            showTypeFilter.value = !showTypeFilter.value
            visible = showTypeFilter.value
            break
        case "series":
            showSeriesFilter.value = !showSeriesFilter.value
            visible = showSeriesFilter.value
            break
        case "quality":
            showQualityFilter.value = !showQualityFilter.value
            visible = showQualityFilter.value
            break
        case "elem":
            showElemFilter.value = !showElemFilter.value
            visible = showElemFilter.value
            break
        default:
            showVersionFilter.value = !showVersionFilter.value
            visible = showVersionFilter.value
            break
    }
    toggleFilter(name, visible)
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbm-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedMod }">
                <!-- 检索带：下划线搜索 + 计数 + 过滤器开关方章 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索魔之楔名称/系列（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredMods.length }}
                        </span>
                    </div>

                    <!-- 过滤器开关方章 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showTypeFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('type')"
                        >
                            {{ $t("char-build.enemy_type") }}
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showSeriesFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('series')"
                        >
                            {{ $t("char-build.series") }}
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showQualityFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('quality')"
                        >
                            {{ $t("char-build.quality") }}
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showElemFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('elem')"
                        >
                            {{ $t("char-build.elem") }}
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showVersionFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleFilterRow('version')"
                        >
                            {{ $t("char-build.version") }}
                        </button>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div
                    v-show="showTypeFilter || showSeriesFilter || showQualityFilter || showElemFilter || showVersionFilter"
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <!-- 类型筛选 -->
                    <div v-show="showTypeFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.enemy_type") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = ''"
                        >
                            {{ $t("全部") }}
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
                            {{ $t(type) }}
                        </button>
                    </div>

                    <!-- 系列筛选 -->
                    <div v-show="showSeriesFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.series") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSeries === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedSeries = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="s in series"
                            :key="s"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSeries === s
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedSeries = s"
                        >
                            {{ $t(s) }}
                        </button>
                    </div>

                    <!-- 品质筛选 -->
                    <div v-show="showQualityFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.quality") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedQuality === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedQuality = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="quality in qualities"
                            :key="quality"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedQuality === quality
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedQuality = quality"
                        >
                            {{ $t(quality) }}
                        </button>
                    </div>

                    <!-- 元素筛选 -->
                    <div v-show="showElemFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.elem") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedElem === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedElem = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="elem in elems"
                            :key="elem"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedElem === elem
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedElem = elem"
                        >
                            {{ $t(`${elem}属性`) }}
                        </button>
                    </div>

                    <!-- 版本筛选 -->
                    <div v-show="showVersionFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">
                            {{ $t("char-build.version") }}
                        </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="version in versions"
                            :key="version"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedVersion === version
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedVersion = version"
                        >
                            {{ version }}
                        </button>
                    </div>
                </div>

                <!-- 魔之楔列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <div class="space-y-2">
                            <article
                                v-for="(mod, index) in filteredMods"
                                :key="mod.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedModId === mod.id
                                        ? 'dbm-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedModId = mod.id"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedModId === mod.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <!-- 魔之楔图标（稀有度渐变底） -->
                                    <img
                                        :src="LeveledMod.url(mod.icon)"
                                        alt="魔之楔图标"
                                        class="size-12 shrink-0 overflow-hidden rounded-xs object-cover bg-linear-15"
                                        :class="getRarityGradientClass(mod.品质)"
                                    />
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：系列+名称 / 可转换徽记 -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedModId === mod.id }"
                                            >
                                                {{ $t(mod.系列) }}{{ $t(mod.名称) }}
                                            </h3>
                                            <span
                                                v-if="isModConvertible(mod.id)"
                                                class="shrink-0 rounded-xs border border-success/40 bg-success/10 px-1 text-[10px] leading-4 font-medium text-success"
                                            >
                                                可转换
                                            </span>
                                            <span class="ml-auto shrink-0"><CopyID :id="mod.id" /></span>
                                        </div>
                                        <!-- 元信息行：类型 / 属性 / 限定 / 版本 / 极性耐受 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span>{{ $t(mod.类型) }}</span>
                                            <span v-if="mod.属性">{{ $t(`${mod.属性}属性`) }}</span>
                                            <span v-if="mod.限定">{{ $t(mod.限定) }}</span>
                                            <span v-if="mod.版本" class="font-mono tabular-nums">v{{ mod.版本 }}</span>
                                            <span
                                                v-if="mod.极性 || mod.耐受"
                                                class="inline-flex items-center gap-1 rounded-xs border border-base-content/15 bg-base-content/3 px-1.5 py-0.5 font-mono tabular-nums"
                                            >
                                                {{ mod.耐受 }}
                                                <Icon v-if="mod.极性" :icon="`po-${mod.极性}`" />
                                            </span>
                                        </div>
                                        <!-- 数值行：基础属性 / 生效属性 / 技能替换数 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-content/55">
                                            <template
                                                v-for="[key, attr] in Object.entries(new LeveledMod(mod).getProperties()).filter(
                                                    ([_, v]) => v
                                                )"
                                                :key="key"
                                            >
                                                <span class="inline-flex items-center gap-1">
                                                    {{ $t(key) }}
                                                    <span
                                                        class="font-medium tabular-nums"
                                                        :class="{ 'text-primary': selectedMod?.id !== mod.id }"
                                                        >{{ formatProp(key, attr) }}</span
                                                    >
                                                </span>
                                            </template>
                                            <template v-if="mod.生效">
                                                <span
                                                    v-for="key in Object.keys(mod.生效).filter(key => key !== '条件')"
                                                    :key="key"
                                                    class="inline-flex items-center gap-1"
                                                >
                                                    {{ $t(key) }}
                                                    <span
                                                        class="font-medium tabular-nums"
                                                        :class="{ 'text-primary': selectedMod?.id !== mod.id }"
                                                        >{{ formatProp(key, mod.生效[key]) }}</span
                                                    >
                                                </span>
                                            </template>
                                            <span v-if="mod.技能替换" class="inline-flex items-center gap-1">
                                                {{ $t("技能替换") }}
                                                <span
                                                    class="font-medium tabular-nums"
                                                    :class="{ 'text-primary': selectedMod?.id !== mod.id }"
                                                    >{{ Object.keys(mod.技能替换).length }}</span
                                                >
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredMods.length }}</b> 个魔之楔
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedMod"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedModId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedMod" class="min-w-0 flex-1">
                <DBModDetailItem :key="selectedModId" :mod="selectedMod" />
            </ScrollArea>
        </div>
    </div>
</template>
