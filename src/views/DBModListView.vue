<script lang="ts" setup>
import { useLocalStorage, useSessionStorage } from "@vueuse/core"
import { computed } from "vue"
import { LeveledMod } from "../data"
import modData from "../data/d/mod.data"
import type { Mod } from "../data/data-types"
import { formatProp } from "../util"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = useSessionStorage<string>("mod.searchKeyword", "")
const selectedMod = useSessionStorage<Mod | null>("mod.selectedMod", null)
const selectedType = useSessionStorage<string>("mod.selectedType", "")
const selectedSeries = useSessionStorage<string>("mod.selectedSeries", "")
const selectedQuality = useSessionStorage<string>("mod.selectedQuality", "")
const selectedElem = useSessionStorage<string>("mod.selectedElem", "")
const selectedVersion = useSessionStorage<string>("mod.selectedVersion", "")

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

// 根据品质获取颜色
function getQualityColor(quality: string): string {
    const colorMap: Record<string, string> = {
        白: "bg-gray-200 text-gray-800",
        绿: "bg-green-200 text-green-800",
        蓝: "bg-blue-200 text-blue-800",
        紫: "bg-purple-200 text-purple-800",
        金: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[quality] || "bg-base-200 text-base-content"
}

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
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedMod }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索魔之楔名称/系列（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 筛选条件 -->
                <div class="p-2 border-b border-base-200">
                    <!-- Checkbox 行 -->
                    <div class="flex flex-wrap gap-2 mb-2">
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                v-model="showTypeFilter"
                                @change="toggleFilter('type', showTypeFilter)"
                                class="checkbox checkbox-xs"
                            />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.enemy_type") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                v-model="showSeriesFilter"
                                @change="toggleFilter('series', showSeriesFilter)"
                                class="checkbox checkbox-xs"
                            />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.series") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                v-model="showQualityFilter"
                                @change="toggleFilter('quality', showQualityFilter)"
                                class="checkbox checkbox-xs"
                            />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.quality") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                v-model="showElemFilter"
                                @change="toggleFilter('elem', showElemFilter)"
                                class="checkbox checkbox-xs"
                            />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.elem") }}</span>
                        </label>
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                v-model="showVersionFilter"
                                @change="toggleFilter('version', showVersionFilter)"
                                class="checkbox checkbox-xs"
                            />
                            <span class="text-xs text-base-content/70">{{ $t("char-build.version") }}</span>
                        </label>
                    </div>

                    <!-- 类型筛选 -->
                    <div v-show="showTypeFilter" class="flex flex-wrap gap-1 mb-2">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedType === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="type in types"
                            :key="type"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedType === type ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = type"
                        >
                            {{ $t(type) }}
                        </button>
                    </div>

                    <!-- 系列筛选 -->
                    <div v-show="showSeriesFilter" class="flex flex-wrap gap-1 mb-2">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedSeries === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedSeries = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="s in series"
                            :key="s"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedSeries === s ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedSeries = s"
                        >
                            {{ $t(s) }}
                        </button>
                    </div>

                    <!-- 品质筛选 -->
                    <div v-show="showQualityFilter" class="flex flex-wrap gap-1 mb-2">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedQuality === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedQuality = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="quality in qualities"
                            :key="quality"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="
                                selectedQuality === quality ? 'bg-primary text-white' : `bg-base-200 text-base-content hover:bg-base-300`
                            "
                            @click="selectedQuality = quality"
                        >
                            {{ $t(quality) }}
                        </button>
                    </div>

                    <!-- 元素筛选 -->
                    <div v-show="showElemFilter" class="flex flex-wrap gap-1 mb-2">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedElem === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedElem = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="elem in elems"
                            :key="elem"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="selectedElem === elem ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedElem = elem"
                        >
                            {{ $t(`${elem}属性`) }}
                        </button>
                    </div>

                    <!-- 版本筛选 -->
                    <div v-show="showVersionFilter" class="flex flex-wrap gap-1">
                        <button
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                            :class="selectedVersion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedVersion = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="version in versions"
                            :key="version"
                            class="px-2 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="
                                selectedVersion === version ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedVersion = version"
                        >
                            {{ version }}
                        </button>
                    </div>
                </div>

                <!-- 魔之楔列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="mod in filteredMods"
                            :key="mod.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedMod?.id === mod.id }"
                            @click="selectedMod = mod"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex items-center gap-2">
                                    <div class="w-8 h-8 overflow-hidden rounded-full">
                                        <img :src="LeveledMod.url(mod.icon)" class="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <div class="font-medium flex gap-2 items-center">
                                            {{ $t(mod.系列) }}{{ $t(mod.名称) }}
                                            <span class="text-xs px-2 py-0.5 rounded" :class="getQualityColor(mod.品质)">
                                                {{ $t(mod.品质) }}
                                            </span>
                                            <span class="text-xs opacity-70">ID: {{ mod.id }}</span>
                                        </div>
                                        <div class="text-xs opacity-70 mt-1 flex gap-2">
                                            <span>{{ $t(mod.类型) }}</span>
                                            <span v-if="mod.属性">{{ $t(`${mod.属性}属性`) }}</span>
                                            <span v-if="mod.限定">{{ $t(mod.限定) }}</span>
                                            <span v-if="mod.版本">v{{ mod.版本 }}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span
                                        v-if="mod.极性 || mod.耐受"
                                        class="flex gap-1 items-center text-xs px-2 py-0.5 rounded bg-base-300 text-base-content"
                                    >
                                        {{ mod.耐受 }}
                                        <Icon v-if="mod.极性" :icon="`po-${mod.极性}`" />
                                    </span>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2 mt-2 text-xs opacity-70">
                                <div
                                    v-for="[key, attr] in Object.entries(new LeveledMod(mod).getProperties()).filter(([_, v]) => v)"
                                    :key="key"
                                    class="flex justify-between items-center gap-2"
                                >
                                    <span>{{ $t(key) }}</span>
                                    <span class="font-medium text-primary">{{ formatProp(key, attr) }}</span>
                                </div>
                                <div
                                    v-for="key in Object.keys(mod.生效).filter(key => key !== '条件')"
                                    v-if="mod.生效"
                                    :key="key"
                                    class="flex justify-between items-center gap-2"
                                >
                                    <span>{{ $t(key) }}</span>
                                    <span class="font-medium text-primary">{{ formatProp(key, mod.生效[key]) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredMods.length }} 个魔之楔
                </div>
            </div>
            <div
                v-if="selectedMod"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedMod = null"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedMod" class="flex-1">
                <DBModDetailItem :mod="selectedMod" />
            </ScrollArea>
        </div>
    </div>
</template>
