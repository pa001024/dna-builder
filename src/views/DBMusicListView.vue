<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { type Music, type MusicScore, musicData, musicScoreData } from "@/data/d/music.data"
import { formatSequenceNumber, getMusicAlbumPosition } from "@/utils/music-album"
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

/** 检索结果中的乐谱总数（检索计数与底部统计条共用）。 */
const filteredTrackCount = computed(() => filteredScoreGroups.value.reduce((total, group) => total + group.music.length, 0))

/**
 * 判断专辑内是否包含当前选中的乐谱（用于点亮专辑头）。
 * @param group 专辑分组。
 * @returns 是否包含选中乐谱。
 */
function isGroupActive(group: MusicScoreGroup): boolean {
    return group.music.some(sheet => sheet.id === selectedSheetId.value)
}

/**
 * 取乐谱在所属专辑内的序号文案。
 * @param sheet 乐谱。
 * @returns 两位序号，如 `01`；未收录时返回 `--`。
 */
function trackNumber(sheet: Music): string {
    const position = getMusicAlbumPosition(sheet.id)
    return position ? formatSequenceNumber(position.index) : "--"
}

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
        <SplitView
            :desktop-ratio="1 / 2"
            :detail-open="Boolean(selectedSheet)"
            @collapse="closeSelectedSheet"
        >
            <template #master>

            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedSheet }"
            >
                <!-- 检索带：下划线搜索 + 匹配计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="$t('db-music-list.search_placeholder')"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredTrackCount }}
                        </span>
                    </div>
                </div>

                <!-- 乐谱列表（按专辑分组） -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div v-if="filteredScoreGroups.length === 0" class="flex flex-col items-center justify-center py-20 text-base-content/45">
                            <Icon icon="ri:file-music-line" class="mb-4 h-12 w-12 opacity-40" />
                            <p class="text-sm">{{ $t('db-music-list.no_match') }}</p>
                        </div>

                        <div v-else class="space-y-5">
                            <section v-for="(group, groupIndex) in filteredScoreGroups" :key="group.score.id" class="space-y-2">
                                <!-- 专辑头：封面 + ALBUM 徽记 + 名称 + 曲目计数 -->
                                <div
                                    class="flex items-center gap-3 border-b pb-2 transition-colors duration-200 animate-ef-rise motion-reduce:animate-none"
                                    :class="isGroupActive(group) ? 'border-primary/40' : 'border-base-content/10'"
                                >
                                    <div
                                        class="h-11 w-20 shrink-0 overflow-hidden rounded-xs border bg-base-content/3 transition-colors duration-200"
                                        :class="isGroupActive(group) ? 'border-primary/60' : 'border-base-content/15'"
                                    >
                                        <img
                                            :src="`/imgs/music/${group.score.icon}.webp`"
                                            :alt="$t(group.score.name)"
                                            class="h-full w-full object-cover"
                                        />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <p class="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-base-content/40">
                                            <span class="h-px w-3.5 bg-base-content/25" aria-hidden="true" />
                                            Album {{ formatSequenceNumber(groupIndex + 1) }}
                                        </p>
                                        <div class="flex items-center gap-2">
                                            <h3
                                                class="min-w-0 truncate text-sm font-semibold transition-colors duration-200"
                                                :class="isGroupActive(group) ? 'text-primary' : 'text-base-content'"
                                            >
                                                {{ $t(group.score.name) }}
                                            </h3>
                                            <!-- CopyID 是 fragment 根，布局类需外包一层 -->
                                            <span class="ml-auto shrink-0">
                                                <CopyID :id="group.score.id" />
                                            </span>
                                        </div>
                                    </div>
                                    <span
                                        class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums transition-colors duration-200"
                                        :class="isGroupActive(group) ? 'text-primary' : 'text-base-content/40'"
                                    >
                                        {{ formatSequenceNumber(group.music.length) }}
                                    </span>
                                </div>

                                <!-- 专辑曲目表：序号 + 曲名 -->
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1.5">
                                    <button
                                        v-for="(sheet, index) in group.music"
                                        :key="sheet.id"
                                        type="button"
                                        class="group relative cursor-pointer overflow-hidden rounded-xs border px-2.5 py-2 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
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
                                        <!-- 序号行 + hover 打开箭头 -->
                                        <span class="flex items-center gap-2">
                                            <span
                                                class="font-mono text-[10px] tabular-nums tracking-wider transition-colors duration-200"
                                                :class="selectedSheetId === sheet.id ? 'text-primary' : 'text-base-content/35'"
                                            >
                                                {{ trackNumber(sheet) }}
                                            </span>
                                            <Icon
                                                icon="ri:arrow-right-up-line"
                                                class="ml-auto size-3 shrink-0 -translate-x-1 text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                                            />
                                        </span>
                                        <!-- 曲名 -->
                                        <span
                                            class="mt-0.5 block text-[13px] font-medium leading-tight wrap-break-word transition-colors duration-200"
                                            :class="selectedSheetId === sheet.id ? 'text-primary' : 'text-base-content/85'"
                                        >
                                            {{ $t(sheet.name) }}
                                        </span>
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        {{ $t('common.total_count') }}
                        <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredTrackCount }}</b>
                        {{ $t('db-music-list.track_count') }}
                        <span class="mx-1.5 text-base-content/20" aria-hidden="true">·</span>
                        <b class="font-orbitron text-sm font-semibold text-base-content/70 tabular-nums">{{ filteredScoreGroups.length }}</b>
                        {{ $t('db-music-list.album_count') }}
                    </p>
                </div>
            </div>

                        </template>
            <template #detail>


            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedSheet" class="min-h-0 min-w-0 flex-1">
                <DBMusicDetailItem :key="selectedSheetId" :music="selectedSheet" class="flex-1" />
            </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
