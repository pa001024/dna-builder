<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import { formatDuration, useHelpText } from "../content/locale"
import { HELP_CATEGORIES, HELP_TUTORIALS } from "../content/registry"
import { L, type Tutorial } from "../content/types"
import TutorialCard from "./catalog/TutorialCard.vue"
import PlatformTags from "./PlatformTags.vue"

const emit = defineEmits<{ (event: "play", id: string): void }>()
const { t } = useTranslation()
const tr = useHelpText()

const query = ref("")

function durationOf(tutorial: Tutorial): number {
    return tutorial.scenes.reduce((sum, scene) => sum + scene.duration, 0)
}

const totalDuration = computed(() => HELP_TUTORIALS.reduce((sum, tutorial) => sum + durationOf(tutorial), 0))

const filtered = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    if (!keyword) return HELP_TUTORIALS
    return HELP_TUTORIALS.filter(tutorial => {
        const haystack = [tr(tutorial.title), tr(tutorial.subtitle), tr(tutorial.summary), tr(HELP_CATEGORIES.find(c => c.id === tutorial.category)?.title ?? tutorial.title)]
            .join(" ")
            .toLowerCase()
        return haystack.includes(keyword)
    })
})

const featured = computed(() => filtered.value[0] ?? null)

const visibleCategories = computed(() =>
    HELP_CATEGORIES.map(category => ({
        category,
        tutorials: filtered.value.filter(tutorial => tutorial.category === category.id),
    })).filter(group => group.tutorials.length > 0)
)

function play(id: string) {
    emit("play", id)
}
</script>

<template>
    <div class="h-full overflow-y-auto">
        <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <header class="flex flex-col gap-4 border-b border-base-content/10 pb-5 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div class="font-orbitron text-[10px] tracking-[0.3em] text-primary/80">DNA BUILDER · VIDEO GUIDE</div>
                    <h1 class="mt-1 text-3xl font-bold leading-tight">{{ t("help.title") }}</h1>
                    <p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-base-content/55">
                        {{ tr(L("像看剧一样了解每一项功能：选一集，按下播放，跟着镜头把操作走一遍。", "像看劇一樣了解每一項功能：選一集，按下播放，跟著鏡頭把操作走一遍。", "Learn every feature like a series: pick an episode, press play, and follow the camera through the workflow.", "機能をドラマのように学ぶ：エピソードを選び、再生して、カメラと一緒に操作を辿ります。", "기능을 시리즈처럼 배워 보세요: 에피소드를 고르고 재생하면 카메라를 따라 조작을 익힐 수 있습니다.", "Découvrez chaque fonction comme une série : choisissez un épisode, lancez la lecture et suivez la caméra.")) }}
                    </p>
                </div>

                <div class="flex flex-col items-stretch gap-2 sm:items-end">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <span class="rounded-xs border border-base-content/12 bg-base-content/4 px-2 py-1 font-orbitron text-[10px] text-base-content/55">
                            {{ HELP_TUTORIALS.length }} {{ tr(L("集", "集", "EPISODES", "話", "편", "ÉPISODES")) }}
                        </span>
                        <span class="rounded-xs border border-base-content/12 bg-base-content/4 px-2 py-1 font-orbitron text-[10px] text-base-content/55">
                            {{ formatDuration(totalDuration) }} {{ tr(L("总时长", "總時長", "TOTAL", "合計", "총 길이", "TOTAL")) }}
                        </span>
                        <span class="rounded-xs border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] text-primary/80">
                            {{ tr(L("无需数据包", "無需資料包", "No data pack", "データ不要", "데이터 팩 불필요", "Sans pack de données")) }}
                        </span>
                    </div>
                    <label class="flex h-9 w-full items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-2.5 backdrop-blur-sm sm:w-80">
                        <Icon icon="ri:search-line" class="size-4 shrink-0 text-base-content/35" />
                        <input
                            v-model="query"
                            type="search"
                            class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-base-content/30"
                            :placeholder="tr(L('搜索功能或关键词…', '搜尋功能或關鍵字…', 'Search features or keywords…', '機能やキーワードを検索…', '기능 또는 키워드 검색…', 'Rechercher une fonction…'))"
                        />
                        <button v-if="query" type="button" class="btn btn-circle btn-ghost btn-xs" @click="query = ''">
                            <Icon icon="ri:close-line" class="size-3.5" />
                        </button>
                    </label>
                </div>
            </header>

            <div class="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
                <aside class="hidden lg:block">
                    <div class="sticky top-4 space-y-3">
                        <div class="rounded-xs border border-base-content/10 bg-base-100/55 p-3 backdrop-blur-sm">
                            <div class="mb-2 flex items-center justify-between">
                                <span class="text-xs font-semibold">{{ tr(L("目录", "目錄", "CONTENTS", "目次", "목차", "SOMMAIRE")) }}</span>
                                <span class="font-orbitron text-[10px] text-base-content/35">{{ filtered.length }}</span>
                            </div>
                            <div v-for="group in visibleCategories" :key="group.category.id" class="mb-3 last:mb-0">
                                <div class="mb-1 flex items-center gap-1.5 px-1 text-[9px] font-semibold tracking-[0.16em] text-base-content/35">
                                    <Icon :icon="group.category.icon" class="size-3" />
                                    {{ tr(group.category.title) }}
                                </div>
                                <button
                                    v-for="tutorial in group.tutorials"
                                    :key="tutorial.id"
                                    type="button"
                                    class="flex w-full items-center gap-2 rounded-xs border-l-2 border-transparent px-2 py-1.5 text-left transition-colors hover:border-(--row-accent)/50 hover:bg-base-content/4"
                                    :style="{ '--row-accent': tutorial.accent }"
                                    @click="play(tutorial.id)"
                                >
                                    <span class="w-5 shrink-0 font-orbitron text-[9px] text-base-content/30">{{ tutorial.number }}</span>
                                    <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/65">{{ tr(tutorial.title) }}</span>
                                    <span class="shrink-0 font-orbitron text-[8px] text-base-content/25">{{ formatDuration(durationOf(tutorial)) }}</span>
                                </button>
                            </div>
                        </div>

                        <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-3 text-[10px] leading-relaxed text-base-content/40">
                            <div class="mb-1 flex items-center gap-1.5 text-base-content/55">
                                <Icon icon="ri:lightbulb-line" class="size-3.5 text-primary/70" />
                                {{ tr(L("观看提示", "觀看提示", "HOW TO WATCH", "視聴のヒント", "시청 팁", "CONSEIL")) }}
                            </div>
                            {{ tr(L("点任意一集即自动播放；播放器可暂停、拖进度、跳章、倍速与全屏。", "點任意一集即自動播放；播放器可暫停、拖進度、跳章、倍速與全螢幕。", "Pick any episode to auto-play. Pause, scrub, jump chapters, change speed, or go fullscreen.", "エピソードを選ぶと自動再生。一時停止、シーク、章送り、倍速、全画面に対応。", "에피소드를 고르면 자동 재생됩니다. 일시정지, 탐색, 장 이동, 배속, 전체 화면을 지원합니다.", "Choisissez un épisode pour lancer la lecture. Pause, navigation, chapitres, vitesse et plein écran.")) }}
                        </div>
                    </div>
                </aside>

                <div class="min-w-0">
                    <section
                        v-if="featured"
                        class="help-catalog-hero rounded-xs p-5 sm:p-7"
                        :style="{ '--hero-accent': featured.accent }"
                    >
                        <div class="help-catalog-hero__grid" />
                        <div class="help-catalog-hero__glow" />
                        <div class="help-catalog-hero__ghost">{{ featured.number }}</div>

                        <div class="relative grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_290px]">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 font-orbitron text-[9px] tracking-[0.24em] text-white/45">
                                    <span class="size-1.5 bg-(--hero-accent)" />
                                    {{ tr(L("本集推荐", "本集推薦", "FEATURED EPISODE", "おすすめ", "추천 에피소드", "ÉPISODE À LA UNE")) }}
                                    <span class="text-white/25">/ EP {{ featured.number }}</span>
                                </div>
                                <h2 class="mt-3 max-w-xl text-2xl font-bold leading-tight text-white sm:text-3xl">{{ tr(featured.title) }}</h2>
                                <p class="mt-2 max-w-xl text-sm leading-relaxed text-white/55">{{ tr(featured.summary) }}</p>
                                <div class="mt-4 flex flex-wrap items-center gap-2">
                                    <PlatformTags :platforms="featured.platforms" />
                                    <span class="rounded-xs border border-white/15 bg-white/5 px-2 py-0.5 font-orbitron text-[9px] text-white/55">
                                        {{ formatDuration(durationOf(featured)) }}
                                    </span>
                                    <span class="rounded-xs border border-white/15 bg-white/5 px-2 py-0.5 font-orbitron text-[9px] text-white/55">
                                        {{ featured.scenes.length }} {{ tr(L("章", "章", "CH", "章", "장", "CH")) }}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    class="btn btn-sm mt-5 border-0 px-5 text-black"
                                    :style="{ background: `color-mix(in oklch, ${featured.accent} 72%, white)` }"
                                    @click="play(featured.id)"
                                >
                                    <Icon icon="ri:play-fill" class="size-4" />
                                    {{ tr(L("开始播放", "開始播放", "Play episode", "再生する", "재생하기", "Lancer l'épisode")) }}
                                </button>
                            </div>

                            <div class="relative hidden h-44 items-center justify-center md:flex">
                                <div class="help-catalog-hero__screen">
                                    <div class="help-catalog-hero__screen-bar">
                                        <span class="size-1.5 rounded-full bg-white/25" />
                                        <span class="size-1.5 rounded-full bg-white/15" />
                                        <span class="ml-1 h-1.5 w-12 rounded-full bg-white/10" />
                                    </div>
                                    <div class="space-y-2 p-3">
                                        <div class="flex items-center gap-2">
                                            <span class="flex size-8 items-center justify-center border border-white/15" :style="{ background: `color-mix(in oklch, ${featured.accent} 28%, transparent)` }">
                                                <Icon :icon="featured.icon" class="size-4 text-white/80" />
                                            </span>
                                            <span class="h-2 w-20 rounded-full bg-white/20" />
                                        </div>
                                        <div class="help-catalog-hero__screen-line w-full" />
                                        <div class="help-catalog-hero__screen-line w-4/5" />
                                        <div class="help-catalog-hero__screen-line w-2/3" />
                                        <div class="grid grid-cols-3 gap-1.5 pt-2">
                                            <div v-for="index in 3" :key="index" class="h-10 border border-white/10 bg-white/4" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section v-for="group in visibleCategories" :id="`help-cat-${group.category.id}`" :key="group.category.id" class="mt-7">
                        <div class="mb-3 flex items-end justify-between gap-4">
                            <div class="flex items-center gap-2">
                                <span class="flex size-8 items-center justify-center rounded-xs border border-base-content/12 bg-base-content/4 text-base-content/60">
                                    <Icon :icon="group.category.icon" class="size-4" />
                                </span>
                                <div>
                                    <h2 class="text-sm font-semibold">{{ tr(group.category.title) }}</h2>
                                    <p class="text-[10px] text-base-content/40">{{ tr(group.category.desc) }}</p>
                                </div>
                            </div>
                            <span class="font-orbitron text-[10px] text-base-content/30">{{ group.tutorials.length }}</span>
                        </div>
                        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <TutorialCard v-for="tutorial in group.tutorials" :key="tutorial.id" :tutorial="tutorial" @play="play(tutorial.id)" />
                        </div>
                    </section>

                    <div v-if="!filtered.length" class="flex flex-col items-center justify-center gap-3 py-20 text-center">
                        <span class="flex size-14 items-center justify-center rounded-xs border border-base-content/12 bg-base-content/4">
                            <Icon icon="ri:search-line" class="size-6 text-base-content/35" />
                        </span>
                        <div class="text-sm font-medium">{{ tr(L("没有找到相关内容", "沒有找到相關內容", "No matching episodes", "該当する内容がありません", "관련 내용을 찾을 수 없습니다", "Aucun épisode trouvé")) }}</div>
                        <p class="max-w-sm text-xs text-base-content/40">
                            {{ tr(L("换个关键词试试，或直接浏览左侧目录。", "換個關鍵字試試，或直接瀏覽左側目錄。", "Try another keyword, or browse the catalog on the left.", "別のキーワードを試すか、左の目次をご覧ください。", "다른 키워드를 입력하거나 왼쪽 목차를 둘러보세요.", "Essayez un autre mot-clé ou parcourez le sommaire.")) }}
                        </p>
                        <button type="button" class="btn btn-sm" @click="query = ''">{{ tr(L("清空搜索", "清除搜尋", "Clear search", "検索をクリア", "검색 지우기", "Effacer")) }}</button>
                    </div>

                    <footer class="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-base-content/10 pt-4 text-[10px] text-base-content/35">
                        <span>DNA BUILDER · {{ tr(L("使用指南", "使用指南", "Video Guide", "ビデオガイド", "비디오 가이드", "Guide vidéo")) }}</span>
                        <span>{{ tr(L("帮助内容随版本更新", "幫助內容隨版本更新", "Content updated with each release", "内容はバージョンごとに更新", "콘텐츠는 버전에 따라 갱신", "Contenu mis à jour à chaque version")) }}</span>
                    </footer>
                </div>
            </div>
        </div>
    </div>
</template>
