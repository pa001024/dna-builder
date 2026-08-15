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

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedSheet }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索乐谱或专辑"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                </div>

                <ScrollArea class="flex-1">
                    <div class="space-y-4 p-3">
                        <section v-for="group in filteredScoreGroups" :key="group.score.id" class="space-y-2">
                            <div class="flex items-center gap-3">
                                <img
                                    :src="`/imgs/music/${group.score.icon}.webp`"
                                    :alt="group.score.name"
                                    class="h-12 shrink-0 rounded bg-base-200 object-cover"
                                />
                                <div class="min-w-0">
                                    <div class="font-semibold wrap-break-word">{{ $t(group.score.name) }}</div>
                                    <CopyID :id="group.score.id" />
                                </div>
                            </div>

                            <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                                <button
                                    v-for="sheet in group.music"
                                    :key="sheet.id"
                                    type="button"
                                    class="p-3 rounded text-left cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                                    :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedSheetId === sheet.id }"
                                    @click="selectedSheetId = sheet.id"
                                >
                                    <div class="font-medium wrap-break-word">{{ $t(sheet.name) }}</div>
                                </button>
                            </div>
                        </section>
                    </div>
                </ScrollArea>
            </div>

            <button
                v-if="selectedSheet"
                type="button"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                aria-label="关闭乐谱详情"
                @click="closeSelectedSheet"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </button>

            <ScrollArea v-if="selectedSheet" class="flex-1">
                <DBMusicDetailItem :music="selectedSheet" class="flex-1" />
            </ScrollArea>
        </div>
    </div>
</template>
