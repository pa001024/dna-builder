<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Music, type MusicScore, musicData, musicScoreData } from "@/data/d/music.data"
import { matchPinyin } from "@/utils/pinyin-utils"

interface MusicScoreGroup {
    score: MusicScore
    music: Music[]
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedSheetId = useSearchParam<number>("id", 0)

/** 当前选中的乐谱。 */
const selectedSheet = computed(() => musicData.find(sheet => sheet.id === selectedSheetId.value) || null)

/** 按专辑分组的搜索结果。 */
const filteredScoreGroups = computed<MusicScoreGroup[]>(() => {
    const keyword = searchKeyword.value.trim()

    return musicScoreData
        .map(score => {
            const music = musicData.filter(sheet => sheet.scoreId === score.id)
            if (!keyword || matchesMusicScoreKeyword(score, keyword)) {
                return { score, music }
            }

            return { score, music: music.filter(sheet => matchesMusicKeyword(sheet, keyword)) }
        })
        .filter(group => group.music.length > 0)
})

/**
 * 判断专辑是否命中关键词。
 * @param score 待匹配的专辑。
 * @param keyword 搜索关键词。
 * @returns 是否命中。
 */
function matchesMusicScoreKeyword(score: MusicScore, keyword: string): boolean {
    return `${score.id}`.includes(keyword) || score.name.includes(keyword) || matchPinyin(score.name, keyword).match
}

/**
 * 判断乐谱是否命中关键词。
 * @param sheet 待匹配的乐谱。
 * @param keyword 搜索关键词。
 * @returns 是否命中。
 */
function matchesMusicKeyword(sheet: Music, keyword: string): boolean {
    const values = [`${sheet.id}`, sheet.name, sheet.desc]
    return values.some(value => value.includes(keyword) || matchPinyin(value, keyword).match)
}

/** 收起乐谱详情面板。 */
function closeSelectedSheet(): void {
    selectedSheetId.value = 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbmu-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedSheet }"
            >
                <!-- 检索带：下划线搜索 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索乐谱或专辑"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                    </div>
                </div>

                <!-- 乐谱列表（按专辑分组） -->
                <ScrollArea class="flex-1">
                    <div class="space-y-4 p-3">
                        <section
                            v-for="group in filteredScoreGroups"
                            :key="group.score.id"
                            class="stagger-rise space-y-2"
                        >
                            <!-- 专辑头 -->
                            <div class="flex items-center gap-3 border-b border-base-content/10 pb-2">
                                <img
                                    :src="`/imgs/music/${group.score.icon}.webp`"
                                    :alt="group.score.name"
                                    class="h-12 shrink-0 rounded-xs border border-base-content/10 object-cover"
                                />
                                <div class="min-w-0">
                                    <div class="text-sm font-semibold wrap-break-word">{{ $t(group.score.name) }}</div>
                                    <CopyID :id="group.score.id" />
                                </div>
                            </div>

                            <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                                <button
                                    v-for="(sheet, index) in group.music"
                                    :key="sheet.id"
                                    type="button"
                                    class="relative cursor-pointer overflow-hidden rounded-xs border p-3 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                    :class="
                                        selectedSheetId === sheet.id
                                            ? 'dbmu-item-active border-primary/70 bg-primary/10'
                                            : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                    "
                                    :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                    @click="selectedSheetId = sheet.id"
                                >
                                    <!-- 左侧主色强调条：选中时显现 -->
                                    <span
                                        class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                        :class="selectedSheetId === sheet.id ? 'opacity-100' : 'opacity-0'"
                                        aria-hidden="true"
                                    />
                                    <span
                                        class="block text-sm font-medium wrap-break-word transition-colors duration-200"
                                        :class="{ 'text-primary': selectedSheetId === sheet.id }"
                                    >
                                        {{ $t(sheet.name) }}
                                    </span>
                                </button>
                            </div>
                        </section>
                    </div>
                </ScrollArea>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedSheet"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                aria-label="关闭乐谱详情"
                @click="closeSelectedSheet"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedSheet" class="min-w-0 flex-1">
                <DBMusicDetailItem :key="selectedSheetId" :music="selectedSheet" class="flex-1" />
            </ScrollArea>
        </div>
    </div>
</template>
