<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { parseNumberOrEmptySearchParam, useSearchParam } from "@/composables/useSearchParam"
import achievementData from "@/data/d/achievement.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedAchievementId = useSearchParam<number>("id", 0)
const selectedCategory = useSearchParam<string | "">("cat", "")
const selectedVersion = useSearchParam<string | "">("ver", "")
const selectedQuality = useSearchParam<number | "">("ql", "", { parse: parseNumberOrEmptySearchParam })

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

useInitialScrollToSelectedItem({ selectedSelector: ".dbac-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedAchievement }"
            >
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索成就 ID/名称/描述（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredAchievements.length }}
                        </span>
                    </div>
                </div>

                <!-- 筛选条件：方章 chip -->
                <div class="flex-none space-y-2.5 border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                    <div>
                        <div class="mb-1 text-[10px] text-base-content/40">分类</div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedCategory === ''
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedCategory = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="category in categoryOptions"
                                :key="category"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedCategory === category
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedCategory = category"
                            >
                                {{ $t(category) }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="mb-1 text-[10px] text-base-content/40">版本</div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedVersion === ''
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedVersion = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="version in versionOptions"
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

                    <div>
                        <div class="mb-1 text-[10px] text-base-content/40">品质</div>
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedQuality === ''
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedQuality = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="quality in qualityOptions"
                                :key="quality"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedQuality === quality
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectedQuality = quality"
                            >
                                {{ getQualityLabel(quality) }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 成就列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div
                            v-if="filteredAchievements.length === 0"
                            class="flex flex-col items-center justify-center py-20 text-base-content/45"
                        >
                            <Icon icon="ri:search-line" class="mb-4 h-12 w-12 opacity-40" />
                            <p class="text-sm">未找到匹配的成就</p>
                        </div>

                        <div v-else class="space-y-2">
                            <article
                                v-for="(achievement, index) in filteredAchievements"
                                :key="achievement.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedAchievementId === achievement.id
                                        ? 'dbac-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectAchievement(achievement.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedAchievementId === achievement.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start justify-between gap-2 p-3">
                                    <div class="min-w-0 flex-1">
                                        <h3
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedAchievementId === achievement.id }"
                                        >
                                            {{ $t(achievement.名称) }}
                                        </h3>
                                        <p class="mt-1 truncate text-xs text-base-content/55">{{ $t(achievement.描述) }}</p>
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span>{{ $t(achievement.分类) }}</span>
                                            <span class="font-mono tabular-nums">v{{ achievement.版本 }}</span>
                                        </div>
                                    </div>
                                    <div class="flex shrink-0 flex-col items-end gap-1">
                                        <img
                                            v-if="achievement.品质"
                                            :src="`/imgs/webp/Icon_Achievement_${['Copper', 'Silver', 'Gold'][achievement.品质 - 1]}.webp`"
                                            alt="品质"
                                            class="h-5 w-5"
                                        />
                                        <img v-if="getAchievementIcon(achievement.分类)" :src="getAchievementIcon(achievement.分类)" alt="分类" class="h-6 w-6" />
                                        <CopyID :id="achievement.id" />
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-center text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredAchievements.length }}</b> 个成就
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedAchievement"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedAchievementId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedAchievement" class="min-w-0 flex-1">
                <DBAchievementDetailItem :key="selectedAchievementId" :achievement="selectedAchievement" />
            </ScrollArea>
        </div>
    </div>
</template>
