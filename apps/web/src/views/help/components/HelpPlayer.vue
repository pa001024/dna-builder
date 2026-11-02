<script setup lang="ts">
import { useElementSize } from "@vueuse/core"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { formatDuration, useHelpText } from "../content/locale"
import { L, type Tutorial } from "../content/types"
import { usePlayback } from "../playback/usePlayback"
import PlatformTags from "./PlatformTags.vue"
import HelpControls from "./player/HelpControls.vue"
import HelpStage from "./player/HelpStage.vue"
import { clamp } from "./shots/motion"

const props = defineProps<{ tutorial: Tutorial }>()
const emit = defineEmits<{ (event: "close"): void }>()

const tr = useHelpText()
const router = useRouter()
const playback = usePlayback(computed(() => props.tutorial))
const {
    elapsed,
    playing,
    ended,
    speed,
    timings,
    totalDuration,
    activeIndex,
    activeScene,
    sceneTime,
    toggle,
    seek,
    seekScene,
    nextScene,
    prevScene,
    restart,
} = playback

const frameWrap = ref<HTMLElement | null>(null)
const { width, height } = useElementSize(frameWrap)
const scale = computed(() => {
    if (!width.value) return 1
    const availableHeight = height.value || (width.value * 9) / 16
    return Math.min(width.value / 1280, availableHeight / 720)
})
const stageOffset = computed(() => {
    const availableHeight = height.value || (width.value * 9) / 16
    return {
        left: Math.max(0, (width.value - 1280 * scale.value) / 2),
        top: Math.max(0, (availableHeight - 720 * scale.value) / 2),
    }
})

const fullscreen = ref(false)
const showEndActions = computed(() => ended.value)

const mobileCaption = computed(() => {
    const scene = activeScene.value?.scene
    if (!scene) return null
    let caption = null
    for (const cue of scene.captions ?? []) {
        if (sceneTime.value >= cue.at) caption = cue.text
    }
    return caption
})

function close() {
    playback.pause()
    emit("close")
}

async function toggleFullscreen() {
    const target = frameWrap.value
    if (!target) return
    if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
    }
    await target.requestFullscreen().catch(error => console.error("Fullscreen failed", error))
}

function onFullscreenChange() {
    fullscreen.value = Boolean(document.fullscreenElement)
}

function goRoute() {
    if (props.tutorial.route) void router.push(props.tutorial.route)
}

function setSpeed(value: number) {
    speed.value = value
}

function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return

    if (event.code === "Space") {
        event.preventDefault()
        toggle()
        return
    }
    if (event.key === "ArrowLeft") {
        event.preventDefault()
        seek(clamp(elapsed.value - 5, 0, totalDuration.value))
        return
    }
    if (event.key === "ArrowRight") {
        event.preventDefault()
        seek(clamp(elapsed.value + 5, 0, totalDuration.value))
        return
    }
    if (event.key === "Escape") {
        if (document.fullscreenElement) void document.exitFullscreen()
        else close()
        return
    }
    if (event.key === "f" || event.key === "F") void toggleFullscreen()
    if (event.key === "r" || event.key === "R") restart()
}

onMounted(() => {
    document.addEventListener("fullscreenchange", onFullscreenChange)
    window.addEventListener("keydown", onKeydown)
})

onBeforeUnmount(() => {
    document.removeEventListener("fullscreenchange", onFullscreenChange)
    window.removeEventListener("keydown", onKeydown)
})
</script>

<template>
    <div class="h-full overflow-y-auto">
        <div class="mx-auto w-full max-w-390 px-3 py-4 sm:px-5 lg:px-8">
            <div class="mb-3 flex items-center gap-3">
                <button type="button" class="btn btn-ghost btn-sm shrink-0" @click="close">
                    <Icon icon="ri:arrow-left-line" class="size-4" />
                    <span class="hidden sm:inline">{{ tr(L("返回目录", "返回目錄", "Catalog", "目次へ", "목차", "Catalogue")) }}</span>
                </button>
                <div class="min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="font-orbitron text-[10px] tracking-[0.18em] text-primary">EP {{ tutorial.number }}</span>
                        <h1 class="truncate text-lg font-semibold leading-tight">{{ tr(tutorial.title) }}</h1>
                    </div>
                    <p class="truncate text-xs text-base-content/50">{{ tr(tutorial.subtitle) }}</p>
                </div>
                <div class="ml-auto hidden shrink-0 sm:block">
                    <PlatformTags :platforms="tutorial.platforms" />
                </div>
            </div>

            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
                <div class="min-w-0">
                    <div ref="frameWrap" class="help-player-frame">
                        <div
                            v-if="activeScene"
                            class="help-player-stage"
                            :style="{
                                left: `${stageOffset.left}px`,
                                top: `${stageOffset.top}px`,
                                transform: `scale(${scale})`,
                            }"
                        >
                            <HelpStage
                                :tutorial="tutorial"
                                :scene="activeScene.scene"
                                :scene-index="activeScene.index"
                                :scene-time="sceneTime"
                            />
                        </div>

                        <div v-if="showEndActions" class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/85 via-black/45 to-transparent px-5 pb-5 pt-16">
                            <div class="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                                <button type="button" class="btn btn-primary btn-sm" @click="restart">
                                    <Icon icon="ri:restart-line" class="size-4" />
                                    {{ tr(L("重播", "重播", "Replay", "もう一度", "다시 보기", "Rejouer")) }}
                                </button>
                                <button type="button" class="btn btn-sm" @click="close">
                                    {{ tr(L("返回目录", "返回目錄", "Back to catalog", "目次へ戻る", "목차로", "Retour")) }}
                                </button>
                                <button v-if="tutorial.route" type="button" class="btn btn-sm" @click="goRoute">
                                    {{ tr(tutorial.routeLabel ?? L("去试试", "去試試", "Try it", "試してみる", "사용해 보기", "Essayer")) }}
                                    <Icon icon="ri:arrow-right-up-line" class="size-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <HelpControls
                        :elapsed="elapsed"
                        :total="totalDuration"
                        :playing="playing"
                        :ended="ended"
                        :speed="speed"
                        :timings="timings"
                        :active-index="activeIndex"
                        :fullscreen="fullscreen"
                        @toggle="toggle"
                        @restart="restart"
                        @seek="seek"
                        @seek-scene="seekScene"
                        @prev="prevScene"
                        @next="nextScene"
                        @speed="setSpeed"
                        @fullscreen="toggleFullscreen"
                    />

                    <div v-if="mobileCaption" class="mt-2 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2 text-sm leading-relaxed sm:hidden">
                        {{ tr(mobileCaption) }}
                    </div>

                    <p class="mt-2 text-[10px] text-base-content/35">
                        {{ tr(L("空格 播放/暂停 · ← → 快退/快进 · F 全屏 · R 重播", "空格 播放/暫停 · ← → 快退/快進 · F 全螢幕 · R 重播", "Space play/pause · ← → seek · F fullscreen · R replay", "Space 再生/一時停止 · ← → シーク · F 全画面 · R 再生", "Space 재생/일시정지 · ← → 이동 · F 전체 화면 · R 다시 재생", "Espace lecture/pause · ← → navigation · F plein écran · R rejouer")) }}
                    </p>
                </div>

                <aside class="min-w-0">
                    <div class="sticky top-2 space-y-3">
                        <div class="rounded-xs border border-base-content/10 bg-base-100/60 p-3.5 backdrop-blur-sm">
                            <div class="flex items-center justify-between">
                                <span class="font-orbitron text-[10px] tracking-[0.18em] text-base-content/40">EPISODE</span>
                                <span class="font-orbitron text-[10px] text-base-content/40">{{ formatDuration(totalDuration) }}</span>
                            </div>
                            <p class="mt-2 text-xs leading-relaxed text-base-content/60">{{ tr(tutorial.summary) }}</p>
                            <div class="mt-3 sm:hidden">
                                <PlatformTags :platforms="tutorial.platforms" />
                            </div>
                            <button v-if="tutorial.route" type="button" class="btn btn-primary btn-sm mt-3 w-full" @click="goRoute">
                                {{ tr(tutorial.routeLabel ?? L("去试试", "去試試", "Try it", "試してみる", "사용해 보기", "Essayer")) }}
                                <Icon icon="ri:arrow-right-up-line" class="size-4" />
                            </button>
                        </div>

                        <div class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <div class="mb-2 flex items-center justify-between">
                                <span class="text-xs font-semibold">{{ tr(L("本集目录", "本集目錄", "Chapters", "この回の目次", "이번 편 목차", "Chapitres")) }}</span>
                                <span class="font-orbitron text-[10px] text-base-content/35">{{ timings.length }}</span>
                            </div>
                            <button
                                v-for="timing in timings"
                                :key="timing.index"
                                type="button"
                                class="flex w-full items-center gap-2 rounded-xs border-l-2 px-2 py-1.5 text-left transition-colors"
                                :class="timing.index === activeIndex
                                    ? 'border-primary bg-primary/10 text-base-content'
                                    : 'border-transparent text-base-content/55 hover:bg-base-content/4'"
                                @click="seekScene(timing.index)"
                            >
                                <span class="w-5 shrink-0 font-orbitron text-[10px] text-base-content/35">{{ String(timing.index + 1).padStart(2, "0") }}</span>
                                <span class="min-w-0 flex-1 truncate text-[11px]">{{ tr(timing.scene.chapter) }}</span>
                                <span class="shrink-0 font-orbitron text-[9px] text-base-content/30">{{ formatDuration(timing.duration) }}</span>
                                <Icon v-if="timing.index < activeIndex || ended" icon="ri:check-line" class="size-3 shrink-0 text-primary/70" />
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    </div>
</template>
