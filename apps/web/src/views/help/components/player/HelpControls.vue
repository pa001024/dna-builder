<script setup lang="ts">
import { computed, ref } from "vue"
import { formatDuration, useHelpText } from "../../content/locale"
import { L } from "../../content/types"
import type { SceneTiming } from "../../playback/usePlayback"
import { clamp } from "../shots/motion"

const props = defineProps<{
    elapsed: number
    total: number
    playing: boolean
    ended: boolean
    speed: number
    timings: SceneTiming[]
    activeIndex: number
    fullscreen: boolean
}>()

const emit = defineEmits<{
    (event: "toggle"): void
    (event: "restart"): void
    (event: "seek", seconds: number): void
    (event: "seek-scene", index: number): void
    (event: "prev"): void
    (event: "next"): void
    (event: "speed", value: number): void
    (event: "fullscreen"): void
}>()

const tr = useHelpText()
const track = ref<HTMLElement | null>(null)
const dragging = ref(false)

const progress = computed(() => (props.total > 0 ? props.elapsed / props.total : 0))
const currentChapter = computed(() => props.timings[props.activeIndex]?.scene.chapter)
const speeds = [0.75, 1, 1.25, 1.5, 2]

function ratioFromEvent(event: PointerEvent): number {
    const rect = track.value?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    return clamp((event.clientX - rect.left) / rect.width, 0, 1)
}

function onPointerDown(event: PointerEvent) {
    if (!props.total) return
    dragging.value = true
    track.value?.setPointerCapture(event.pointerId)
    emit("seek", ratioFromEvent(event) * props.total)
}

function onPointerMove(event: PointerEvent) {
    if (!dragging.value) return
    emit("seek", ratioFromEvent(event) * props.total)
}

function onPointerUp(event: PointerEvent) {
    if (!dragging.value) return
    dragging.value = false
    track.value?.releasePointerCapture(event.pointerId)
}

function cycleSpeed() {
    const index = speeds.indexOf(props.speed)
    emit("speed", speeds[(index + 1) % speeds.length] ?? 1)
}
</script>

<template>
    <div class="mt-3 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2.5 backdrop-blur-sm">
        <div class="mb-1.5 flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
                <span class="font-orbitron text-[10px] tracking-[0.18em] text-primary/80">NOW</span>
                <span class="truncate text-xs font-medium">{{ currentChapter ? tr(currentChapter) : "" }}</span>
            </div>
            <span class="shrink-0 font-orbitron text-[11px] tabular-nums text-base-content/55">
                {{ formatDuration(elapsed) }} / {{ formatDuration(total) }}
            </span>
        </div>

        <div
            ref="track"
            class="help-progress-track"
            :style="{ '--progress-accent': 'var(--color-primary)' }"
            role="slider"
            :aria-valuemin="0"
            :aria-valuemax="total"
            :aria-valuenow="elapsed"
            :aria-label="tr(L('播放进度', '播放進度', 'Playback progress', '再生位置', '재생 위치', 'Progression'))"
            tabindex="0"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
        >
            <div class="help-progress-rail">
                <div class="help-progress-fill" :style="{ width: `${progress * 100}%` }" />
            </div>
            <span
                v-for="timing in timings.slice(1)"
                :key="timing.index"
                class="help-progress-segment"
                :style="{ left: `${(timing.start / Math.max(0.001, total)) * 100}%` }"
            />
            <span class="help-progress-knob" :style="{ left: `${progress * 100}%` }" />
        </div>

        <div class="mt-1 flex items-center gap-2">
            <button type="button" class="btn btn-circle btn-primary btn-sm" :aria-label="playing ? 'Pause' : 'Play'" @click="emit('toggle')">
                <Icon :icon="ended ? 'ri:restart-line' : playing ? 'ri:pause-fill' : 'ri:play-fill'" class="size-4" />
            </button>
            <button type="button" class="btn btn-circle btn-ghost btn-sm" :aria-label="tr(L('重新播放', '重新播放', 'Replay', '最初から', '다시 재생', 'Rejouer'))" @click="emit('restart')">
                <Icon icon="ri:restart-line" class="size-4" />
            </button>
            <div class="mx-1 h-4 w-px bg-base-content/10" />
            <button type="button" class="btn btn-circle btn-ghost btn-sm" :aria-label="tr(L('上一章', '上一章', 'Previous chapter', '前の章', '이전 장', 'Chapitre précédent'))" @click="emit('prev')">
                <Icon icon="ri:arrow-left-s-line" class="size-4" />
            </button>
            <button type="button" class="btn btn-circle btn-ghost btn-sm" :aria-label="tr(L('下一章', '下一章', 'Next chapter', '次の章', '다음 장', 'Chapitre suivant'))" @click="emit('next')">
                <Icon icon="ri:arrow-right-s-line" class="size-4" />
            </button>

            <div class="flex-1" />

            <div class="hidden items-center gap-1 sm:flex">
                <button
                    v-for="timing in timings"
                    :key="timing.index"
                    type="button"
                    class="h-1.5 w-5 rounded-full transition-all"
                    :class="timing.index <= activeIndex ? 'bg-primary/80' : 'bg-base-content/15 hover:bg-base-content/30'"
                    :aria-label="tr(timing.scene.chapter)"
                    @click="emit('seek-scene', timing.index)"
                />
            </div>

            <button type="button" class="btn btn-ghost btn-xs font-orbitron text-[11px]" :aria-label="tr(L('播放速度', '播放速度', 'Playback speed', '再生速度', '재생 속도', 'Vitesse'))" @click="cycleSpeed">
                {{ speed }}×
            </button>
            <button type="button" class="btn btn-circle btn-ghost btn-sm" :aria-label="tr(L('全屏', '全螢幕', 'Fullscreen', '全画面', '전체 화면', 'Plein écran'))" @click="emit('fullscreen')">
                <Icon :icon="fullscreen ? 'codicon:chrome-restore' : 'codicon:chrome-maximize'" class="size-4" />
            </button>
        </div>
    </div>
</template>
