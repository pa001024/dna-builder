<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { parseNumberOrEmptySearchParam, useSearchParam } from "@/composables/useSearchParam"
import achievementData from "@/data/d/achievement.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("achievement.searchKeyword", "")
const selectedAchievementId = useSearchParam<number>("achievement.selectedAchievement", 0)
const selectedCategory = useSearchParam<string | "">("achievement.selectedCategory", "")
const selectedVersion = useSearchParam<string | "">("achievement.selectedVersion", "")
const selectedQuality = useSearchParam<number | "">("achievement.selectedQuality", "", { parse: parseNumberOrEmptySearchParam })

const selectedAchievement = computed(() => {
    return selectedAchievementId.value ? achievementData.find(v => v.id === selectedAchievementId.value) || null : null
})

const categoryOptions = computed(() => {
    const categories = new Set<string>()
    achievementData.forEach(v => categories.add(v.分类))
    return Array.from(categories)
})

const versionOptions = computed(() => {
    const versions = new Set<string>()
    achievementData.forEach(v => versions.add(v.版本))
    return Array.from(versions).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
})

const qualityOptions = computed(() => {
    const qualities = new Set<number>()
    achievementData.forEach(v => qualities.add(v.品质))
    return Array.from(qualities).sort((a, b) => a - b)
})

const filteredAchievements = computed(() => {
    return achievementData.filter(achievement => {
        const categoryMatch = selectedCategory.value === "" || achievement.分类 === selectedCategory.value
        const versionMatch = selectedVersion.value === "" || achievement.版本 === selectedVersion.value
        const qualityMatch = selectedQuality.value === "" || achievement.品质 === selectedQuality.value

        let keywordMatch = true
        const query = searchKeyword.value.trim()
        if (query) {
            if (`${achievement.id}`.includes(query) || achievement.名称.includes(query) || achievement.描述.includes(query)) {
                keywordMatch = true
            } else {
                const nameMatch = matchPinyin(achievement.名称, query).match
                const descMatch = matchPinyin(achievement.描述, query).match
                keywordMatch = nameMatch || descMatch
            }
        }

        return categoryMatch && versionMatch && qualityMatch && keywordMatch
    })
})

/**
 * 选择成就并在右侧展示详情。
 */
function selectAchievement(id: number): void {
    selectedAchievementId.value = id
}

/**
 * 将品质数字转成显示名称。
 */
function getQualityLabel(quality: number): string {
    return ["", "铜", "银", "金"][quality] || `${quality}`
}

/**
 * 生成成就分类图标路径。
 */
function getAchievementIcon(category: string): string {
    const categoryMap: Record<string, number> = {
        "此岸×彼岸": 2,
        欢乐时日: 3,
        "你好，世界": 5,
        友人成行: 10,
        美妙的一瞬: 4,
        "我来，我见，我征服": 7,
        完美主义: 6,
        不止是数字: 1,
        英雄的诞生: 9,
        愿望清单: 11,
        向最高处: 8,
        迷宫花园: 12,
    }
    const iconId = categoryMap[category]
    if (!iconId) {
        return ""
    }
    return `/imgs/webp/T_Achievement_${iconId > 9 ? iconId : `0${iconId}`}.webp`
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden"
                :class="{ 'border-r border-base-200': selectedAchievement }">
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text" placeholder="搜索成就 ID/名称/描述（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <div class="p-2 border-b border-base-200 space-y-2">
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">分类</div>
                        <div class="flex flex-wrap gap-1">
                            <button class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all" :class="selectedCategory === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectedCategory = ''">
                                全部
                            </button>
                            <button v-for="category in categoryOptions" :key="category"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="selectedCategory === category
                                    ? 'bg-primary text-white'
                                    : 'bg-base-200 text-base-content hover:bg-base-300'
                                    " @click="selectedCategory = category">
                                {{ $t(category) }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="text-xs text-base-content/70 mb-1">版本</div>
                        <div class="flex flex-wrap gap-1">
                            <button class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all" :class="selectedVersion === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectedVersion = ''">
                                全部
                            </button>
                            <button v-for="version in versionOptions" :key="version"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="selectedVersion === version
                                    ? 'bg-primary text-white'
                                    : 'bg-base-200 text-base-content hover:bg-base-300'
                                    " @click="selectedVersion = version">
                                {{ version }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="text-xs text-base-content/70 mb-1">品质</div>
                        <div class="flex flex-wrap gap-1">
                            <button class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all" :class="selectedQuality === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                " @click="selectedQuality = ''">
                                全部
                            </button>
                            <button v-for="quality in qualityOptions" :key="quality"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="selectedQuality === quality
                                    ? 'bg-primary text-white'
                                    : 'bg-base-200 text-base-content hover:bg-base-300'
                                    " @click="selectedQuality = quality">
                                {{ getQualityLabel(quality) }}
                            </button>
                        </div>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="achievement in filteredAchievements" :key="achievement.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedAchievementId === achievement.id }"
                            @click="selectAchievement(achievement.id)">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0 flex-1">
                                    <div class="font-medium truncate">{{ $t(achievement.名称) }}</div>
                                    <div class="text-xs opacity-70 mt-1 truncate">{{ $t(achievement.描述) }}</div>
                                    <div class="text-xs opacity-70 mt-1 flex gap-2">
                                        <span>{{ $t(achievement.分类) }}</span>
                                        <span>v{{ achievement.版本 }}</span>
                                    </div>
                                </div>
                                <div class="shrink-0 flex flex-col items-end gap-1">
                                    <img v-if="achievement.品质"
                                        :src="`/imgs/webp/Icon_Achievement_${['Copper', 'Silver', 'Gold'][achievement.品质 - 1]}.webp`"
                                        alt="品质" class="w-5 h-5" />
                                    <img v-if="getAchievementIcon(achievement.分类)"
                                        :src="getAchievementIcon(achievement.分类)" alt="分类" class="w-6 h-6" />
                                    <span class="text-xs opacity-70">ID: {{ achievement.id }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredAchievements.length }} 个成就
                </div>
            </div>

            <div v-if="selectedAchievement"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedAchievementId = 0">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedAchievement" class="flex-1">
                <DBAchievementDetailItem :achievement="selectedAchievement" />
            </ScrollArea>
        </div>
    </div>
</template>
