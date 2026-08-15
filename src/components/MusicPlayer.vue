<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"

const props = defineProps<{
    src: string
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)
const isLoading = ref(false)
const errorMessage = ref("")

const progress = computed(() => (duration.value > 0 ? (currentTime.value / duration.value) * 1000 : 0))
const hasDuration = computed(() => Number.isFinite(duration.value) && duration.value > 0)

/**
 * 将秒数格式化为播放器时间文本。
 * @param seconds 秒数。
 * @returns 分秒格式的时间文本。
 */
function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00"
    }

    const totalSeconds = Math.floor(seconds)
    const minutes = Math.floor(totalSeconds / 60)
    const remainingSeconds = totalSeconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

/**
 * 在切换乐谱时停止并重置播放器状态。
 */
async function resetAudio(): Promise<void> {
    const audio = audioRef.value
    if (!audio) {
        return
    }

    audio.pause()
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    isLoading.value = false
    errorMessage.value = ""
    await nextTick()
    audio.load()
}

/**
 * 切换音频播放状态。
 */
async function togglePlayback(): Promise<void> {
    const audio = audioRef.value
    if (!audio) {
        return
    }

    if (audio.paused) {
        errorMessage.value = ""
        try {
            await audio.play()
        } catch (error) {
            isPlaying.value = false
            errorMessage.value = "音频无法播放"
            console.error("乐谱音频播放失败:", error)
        }
        return
    }

    audio.pause()
}

/**
 * 根据进度条定位音频播放位置。
 * @param event 进度条输入事件。
 */
function seekAudio(event: Event): void {
    const audio = audioRef.value
    const value = Number((event.target as HTMLInputElement).value)
    if (!audio || !hasDuration.value || !Number.isFinite(value)) {
        return
    }

    const nextTime = (value / 1000) * duration.value
    audio.currentTime = nextTime
    currentTime.value = nextTime
}

/**
 * 处理音频元数据加载完成事件。
 */
function handleLoadedMetadata(): void {
    const audio = audioRef.value
    if (!audio) {
        return
    }

    duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
    currentTime.value = audio.currentTime
}

/**
 * 同步音频时长变更。
 */
function handleDurationChange(): void {
    const audio = audioRef.value
    if (!audio) {
        return
    }

    duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
}

/**
 * 同步音频当前播放位置。
 */
function handleTimeUpdate(): void {
    const audio = audioRef.value
    if (audio) {
        currentTime.value = audio.currentTime
    }
}

/**
 * 标记音频进入播放状态。
 */
function handlePlay(): void {
    isPlaying.value = true
    isLoading.value = false
}

/**
 * 标记音频暂停。
 */
function handlePause(): void {
    isPlaying.value = false
}

/**
 * 标记音频等待数据。
 */
function handleWaiting(): void {
    isLoading.value = true
}

/**
 * 标记音频已可继续播放。
 */
function handleCanPlay(): void {
    isLoading.value = false
}

/**
 * 处理音频资源加载失败。
 */
function handleError(): void {
    isPlaying.value = false
    isLoading.value = false
    errorMessage.value = "音频加载失败"
}

/**
 * 在音频播放结束后重置播放位置。
 */
function handleEnded(): void {
    isPlaying.value = false
    currentTime.value = 0
}

watch(() => props.src, resetAudio)

onBeforeUnmount(() => {
    const audio = audioRef.value
    if (!audio) {
        return
    }

    audio.pause()
    audio.removeAttribute("src")
    audio.load()
})
</script>

<template>
    <div>
        <audio
            ref="audioRef"
            :src="src"
            preload="metadata"
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

        <div class="flex items-center gap-3">
            <button
                type="button"
                class="btn btn-circle btn-ghost btn-sm"
                :aria-label="isPlaying ? '暂停' : '播放'"
                :disabled="isLoading"
                @click="togglePlayback"
            >
                <Icon :icon="isPlaying ? 'ri:pause-circle-line' : 'ri:play-fill'" />
            </button>

            <input
                type="range"
                min="0"
                max="1000"
                step="1"
                :value="progress"
                :disabled="!hasDuration"
                aria-label="播放进度"
                class="range range-xs flex-1"
                @input="seekAudio"
            />

            <span class="shrink-0 font-mono text-xs tabular-nums text-base-content/70">
                {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
            </span>
        </div>

        <div v-if="isLoading" class="text-xs text-base-content/70">正在加载音频</div>
        <div v-else-if="errorMessage" class="text-xs text-error">{{ errorMessage }}</div>
    </div>
</template>
