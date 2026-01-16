<script lang="ts" setup>
import { computed, ref } from "vue"
import { LeveledMod } from "../data"
import modData from "../data/d/mod.data"
import type { Mod } from "../data/data-types"
import { formatProp } from "../util"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = ref("")
const selectedMod = ref<Mod | null>(null)
const selectedType = ref<string | "">("")
const selectedSeries = ref<string | "">("")
const selectedQuality = ref<string | "">("")

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
        return matchKeyword && matchType && matchSeries && matchQuality
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
                <div class="p-2 border-b border-base-200 space-y-2">
                    <!-- 类型筛选 -->
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">类型</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedType === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedType = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="type in types"
                                :key="type"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="selectedType === type ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedType = type"
                            >
                                {{ type }}
                            </button>
                        </div>
                    </div>

                    <!-- 系列筛选 -->
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">系列</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedSeries === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedSeries = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="s in series"
                                :key="s"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="selectedSeries === s ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedSeries = s"
                            >
                                {{ s }}
                            </button>
                        </div>
                    </div>

                    <!-- 品质筛选 -->
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">品质</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="
                                    selectedQuality === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedQuality = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="quality in qualities"
                                :key="quality"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="
                                    selectedQuality === quality
                                        ? 'bg-primary text-white'
                                        : `bg-base-200 text-base-content hover:bg-base-300`
                                "
                                @click="selectedQuality = quality"
                            >
                                {{ $t(quality) }}
                            </button>
                        </div>
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
            <div v-if="selectedMod" class="flex-1 overflow-hidden">
                <DBModDetailItem :mod="selectedMod" />
            </div>
        </div>
    </div>
</template>
