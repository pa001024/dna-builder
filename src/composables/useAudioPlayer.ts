import { computed, type MaybeRefOrGetter, nextTick, onScopeDispose, type Ref, ref, toValue, watch } from "vue"

/** 键盘定位步长（秒） */
export const AUDIO_SEEK_STEP_SECONDS = 5

/**
 * 播放器错误类型。
 * - `play-failed`：`play()` 被拒绝（自动播放策略、解码失败等）
 * - `load-failed`：资源加载失败
 */
export type AudioPlayerError = "play-failed" | "load-failed" | null

/**
 * 独占播放通道的当前持有者（停声回调）。
 *
 * 全站同一时刻只允许一个播放器发声：乐谱试听、剧情 BGM 试听都是「点一个停一个」。
 * 由开始播放的一方调用上一个持有者的停声回调，实现跨组件互斥。
 */
let exclusiveStop: (() => void) | null = null

/** 播放器配置。 */
export interface UseAudioPlayerOptions {
    /** 音频地址；变化时停止播放并重置状态 */
    src: MaybeRefOrGetter<string>
    /** 模板中 `<audio>` 元素的 ref */
    audio: Ref<HTMLAudioElement | null>
    /** 是否独占播放通道：开始播放时停掉上一个播放器，默认开启 */
    exclusive?: boolean
}

/**
 * 音频播放器状态机：播放/暂停、进度定位、时长与错误状态。
 *
 * 播放状态一律由媒体事件（`play`/`pause`/`ended`/`waiting`…）驱动，
 * 不在 `play()` 调用处乐观置位，避免被自动播放策略拒绝后状态卡在「播放中」。
 * @param options 播放器配置
 * @returns 播放器状态与事件处理函数
 */
export function useAudioPlayer(options: UseAudioPlayerOptions) {
    const { audio: audioRef, exclusive = true } = options

    const currentTime = ref(0)
    const duration = ref(0)
    const isPlaying = ref(false)
    const isLoading = ref(false)
    const error = ref<AudioPlayerError>(null)

    /** 是否存在可定位的有效时长 */
    const hasDuration = computed(() => Number.isFinite(duration.value) && duration.value > 0)

    /** 播放进度占比（0~1） */
    const progressRatio = computed(() => {
        if (!hasDuration.value) {
            return 0
        }

        return Math.min(1, Math.max(0, currentTime.value / duration.value))
    })

    /**
     * 停止本播放器发声。
     * 供独占通道回调使用：只调 `pause()`，状态由随后的 `pause` 事件同步。
     */
    function stopSound(): void {
        audioRef.value?.pause()
    }

    /** 让出独占通道（仅在本播放器仍是持有者时生效）。 */
    function releaseExclusive(): void {
        if (exclusiveStop === stopSound) {
            exclusiveStop = null
        }
    }

    /** 占用独占通道：停掉上一个正在发声的播放器。 */
    function claimExclusive(): void {
        if (!exclusive) {
            return
        }

        if (exclusiveStop && exclusiveStop !== stopSound) {
            exclusiveStop()
        }
        exclusiveStop = stopSound
    }

    /**
     * 将秒数格式化为播放器时间文本。
     * @param seconds 秒数
     * @returns 分秒格式的时间文本
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

    /** 在切换音源时停止并重置播放器状态。 */
    async function resetAudio(): Promise<void> {
        const audio = audioRef.value
        if (!audio) {
            return
        }

        audio.pause()
        releaseExclusive()
        currentTime.value = 0
        duration.value = 0
        isPlaying.value = false
        isLoading.value = false
        error.value = null
        await nextTick()
        audio.load()
    }

    /** 切换音频播放状态。 */
    async function togglePlayback(): Promise<void> {
        const audio = audioRef.value
        if (!audio) {
            return
        }

        if (audio.paused) {
            error.value = null
            try {
                await audio.play()
            } catch (playError) {
                isPlaying.value = false
                error.value = "play-failed"
                console.error("音频播放失败:", playError)
            }
            return
        }

        audio.pause()
    }

    /**
     * 定位到指定播放时刻。
     * @param seconds 目标秒数
     */
    function seekToTime(seconds: number): void {
        const audio = audioRef.value
        if (!audio || !hasDuration.value || !Number.isFinite(seconds)) {
            return
        }

        const nextTime = Math.min(duration.value, Math.max(0, seconds))
        audio.currentTime = nextTime
        currentTime.value = nextTime
    }

    /**
     * 按进度占比定位播放位置。
     * @param ratio 进度占比（0~1）
     */
    function seekToRatio(ratio: number): void {
        if (!Number.isFinite(ratio)) {
            return
        }

        seekToTime(ratio * duration.value)
    }

    /** 处理音频元数据加载完成事件。 */
    function handleLoadedMetadata(): void {
        const audio = audioRef.value
        if (!audio) {
            return
        }

        duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
        currentTime.value = audio.currentTime
    }

    /** 同步音频时长变更。 */
    function handleDurationChange(): void {
        const audio = audioRef.value
        if (!audio) {
            return
        }

        duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
    }

    /** 同步音频当前播放位置。 */
    function handleTimeUpdate(): void {
        const audio = audioRef.value
        if (audio) {
            currentTime.value = audio.currentTime
        }
    }

    /** 标记音频进入播放状态，并占用独占通道。 */
    function handlePlay(): void {
        isPlaying.value = true
        isLoading.value = false
        claimExclusive()
    }

    /** 标记音频暂停，并让出独占通道。 */
    function handlePause(): void {
        isPlaying.value = false
        releaseExclusive()
    }

    /** 标记音频等待数据。 */
    function handleWaiting(): void {
        isLoading.value = true
    }

    /** 标记音频已可继续播放。 */
    function handleCanPlay(): void {
        isLoading.value = false
    }

    /** 处理音频资源加载失败。 */
    function handleError(): void {
        isPlaying.value = false
        isLoading.value = false
        error.value = "load-failed"
        releaseExclusive()
    }

    /** 在音频播放结束后重置播放位置。 */
    function handleEnded(): void {
        isPlaying.value = false
        currentTime.value = 0
        releaseExclusive()
    }

    watch(() => toValue(options.src), resetAudio)

    onScopeDispose(() => {
        releaseExclusive()
        const audio = audioRef.value
        if (!audio) {
            return
        }

        audio.pause()
        audio.removeAttribute("src")
        audio.load()
    })

    return {
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
    }
}
