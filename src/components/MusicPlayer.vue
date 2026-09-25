<script lang="ts" setup>
import { computed, ref } from "vue"
import { AUDIO_SEEK_STEP_SECONDS, useAudioPlayer } from "@/composables/useAudioPlayer"

const props = withDefaults(
    defineProps<{
        src: string
        /** 预加载策略：列表/多节点场景传 `none`，避免一次性拉取全部音频元数据 */
        preload?: "none" | "metadata" | "auto"
        /** 是否独占播放通道：开始播放时停掉其它播放器 */
        exclusive?: boolean
    }>(),
    {
        preload: "metadata",
        exclusive: true,
    }
)

const audioRef = ref<HTMLAudioElement | null>(null)
const trackRef = ref<HTMLElement | null>(null)
/** 是否正在拖动进度条 */
const isSeeking = ref(false)

const {
    currentTime,
    duration,
    isPlaying,
    isLoading,
    error,
    progressRatio,
    hasDuration,
    formatTime,
    togglePlayback,
    seekToTime,
    seekToRatio,
    handleLoadedMetadata,
    handleDurationChange,
    handleTimeUpdate,
    handlePlay,
    handlePause,
    handleWaiting,
    handleCanPlay,
    handleError,
    handleEnded,
} = useAudioPlayer({
    src: () => props.src,
    audio: audioRef,
    exclusive: props.exclusive,
})

/** 进度条填充百分比 */
const progressPercent = computed(() => `${(progressRatio.value * 100).toFixed(3)}%`)

/**
 * 按指针横坐标定位播放位置。
 * @param clientX 指针相对视口的横坐标
 */
function seekByClientX(clientX: number): void {
    const track = trackRef.value
    if (!track) {
        return
    }

    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) {
        return
    }

    seekToRatio((clientX - rect.left) / rect.width)
}

/**
 * 开始拖动进度条。
 * @param event 指针事件
 */
function handleTrackPointerDown(event: PointerEvent): void {
    if (!hasDuration.value || event.button !== 0) {
        return
    }

    trackRef.value?.setPointerCapture(event.pointerId)
    isSeeking.value = true
    seekByClientX(event.clientX)
}

/**
 * 拖动中持续定位。
 * @param event 指针事件
 */
function handleTrackPointerMove(event: PointerEvent): void {
    if (!isSeeking.value) {
        return
    }

    seekByClientX(event.clientX)
}

/**
 * 结束拖动进度条。
 * @param event 指针事件
 */
function handleTrackPointerUp(event: PointerEvent): void {
    if (!isSeeking.value) {
        return
    }

    isSeeking.value = false
    trackRef.value?.releasePointerCapture(event.pointerId)
}

/**
 * 键盘定位进度条（方向键按固定步长跳转）。
 * @param event 键盘事件
 */
function handleTrackKeydown(event: KeyboardEvent): void {
    if (!hasDuration.value) {
        return
    }

    const backwardKeys = ["ArrowLeft", "ArrowDown"]
    const forwardKeys = ["ArrowRight", "ArrowUp"]
    if (!backwardKeys.includes(event.key) && !forwardKeys.includes(event.key)) {
        return
    }

    event.preventDefault()
    const step = backwardKeys.includes(event.key) ? -AUDIO_SEEK_STEP_SECONDS : AUDIO_SEEK_STEP_SECONDS
    seekToTime(currentTime.value + step)
}
</script>

<template>
    <div class="space-y-1">
        <div class="flex items-center gap-2.5">
            <!-- 播放/暂停方章 -->
            <button
                type="button"
                class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xs border transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                :class="
                    isPlaying
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-base-content/20 text-base-content/65 hover:border-primary/60 hover:text-primary disabled:hover:border-base-content/20 disabled:hover:text-base-content/65'
                "
                :aria-label="isPlaying ? $t('music-player.pause') : $t('music-player.play')"
                :disabled="isLoading || !src"
                @click="togglePlayback"
            >
                <Icon :icon="isPlaying ? 'ri:pause-line' : 'ri:play-fill'" class="size-3.5" />
            </button>

            <!-- 进度条：hairline 轨道 + primary 播放头，支持拖动与方向键定位 -->
            <div
                ref="trackRef"
                class="relative h-4 min-w-0 flex-1 touch-none select-none"
                :class="hasDuration ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'"
                role="slider"
                :tabindex="hasDuration ? 0 : -1"
                :aria-label="$t('music-player.playback_progress')"
                aria-valuemin="0"
                :aria-valuemax="Math.floor(duration)"
                :aria-valuenow="Math.floor(currentTime)"
                :aria-valuetext="`${formatTime(currentTime)} / ${formatTime(duration)}`"
                @keydown="handleTrackKeydown"
                @pointercancel="handleTrackPointerUp"
                @pointerdown="handleTrackPointerDown"
                @pointermove="handleTrackPointerMove"
                @pointerup="handleTrackPointerUp"
            >
                <div class="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-base-content/20"></div>
                <div class="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary" :style="{ width: progressPercent }"></div>
                <div
                    v-if="hasDuration"
                    class="absolute top-1/2 h-3 w-0.75 -translate-x-1/2 -translate-y-1/2 bg-primary"
                    :style="{ left: progressPercent }"
                ></div>
            </div>

            <!-- 时长 -->
            <span class="shrink-0 text-[11px] tabular-nums text-base-content/60">
                {{ formatTime(currentTime) }} <span class="text-base-content/35">/</span> {{ formatTime(duration) }}
            </span>
        </div>

        <p v-if="isLoading" class="text-[11px] text-base-content/50">{{ $t('music-player.loading_audio') }}</p>
        <p v-else-if="error" class="text-[11px] text-error">
            {{ $t(error === 'play-failed' ? 'music-player.play_failed' : 'music-player.load_failed') }}
        </p>

        <audio
            ref="audioRef"
            :src="src"
            :preload="preload"
            class="hidden"
            @canplay="handleCanPlay"
            @durationchange="handleDurationChange"
            @ended="handleEnded"
            @error="handleError"
            @loadedmetadata="handleLoadedMetadata"
            @pause="handlePause"
            @play="handlePlay"
            @timeupdate="handleTimeUpdate"
            @waiting="handleWaiting"
        />
    </div>
</template>
