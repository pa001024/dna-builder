<script lang="ts" setup>
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, ref, watch } from "vue"

interface DanmakuComment {
    /** 弹幕出现时间（秒，相对视频起点） */
    time: number
    /** 弹幕文本 */
    text: string
    /** 弹幕颜色（CSS 颜色值，默认白色） */
    color?: string
    /** 弹幕滚动模式：scroll 从右向左滚动，top 顶部停留，bottom 底部停留 */
    mode?: "scroll" | "top" | "bottom"
}

interface ActiveDanmaku extends DanmakuComment {
    id: number
    /** 弹幕纵向位置百分比（滚动弹幕使用） */
    topPercent?: number
}

const props = withDefaults(
    defineProps<{
        /** 视频地址（CDN 直链） */
        src: string
        /** 封面图 */
        poster?: string
        /** 播放器标题 */
        title?: string
        /** 初始弹幕列表（可后续由数据字段提供） */
        danmaku?: DanmakuComment[]
        /** 是否自动播放（部分浏览器需静音策略配合） */
        autoPlay?: boolean
        /** 是否开启本地弹幕发送（默认关闭，发送仅回显到当前画面） */
        sendable?: boolean
    }>(),
    {
        poster: "",
        title: "",
        danmaku: () => [],
        autoPlay: false,
        sendable: false,
    }
)

const emit = defineEmits<{
    (event: "danmaku-send", text: string): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const playerRef = ref<HTMLDivElement | null>(null)
const danmakuLayerRef = ref<HTMLDivElement | null>(null)
const isPlaying = ref(false)
const isLoading = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const isMuted = ref(false)
const volume = ref(1)
const playbackRate = ref(1)
const isFullscreen = ref(false)
const errorMessage = ref("")
const showDanmaku = ref(true)
const danmakuInput = ref("")
const activeDanmakuList = ref<ActiveDanmaku[]>([])
let danmakuIdSeed = 0
let scheduleTimer: ReturnType<typeof setInterval> | null = null
let danmakuSpawnCursor = 0

const progress = computed(() => (duration.value > 0 ? (currentTime.value / duration.value) * 1000 : 0))
const hasDuration = computed(() => Number.isFinite(duration.value) && duration.value > 0)
const playedDanmakuIndex = ref(0)

/**
 * 将秒数格式化为播放器时间文本。
 * @param seconds 秒数
 * @returns 分秒格式时间
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
 * 切换视频播放/暂停状态。
 */
async function togglePlayback(): Promise<void> {
    const video = videoRef.value
    if (!video) {
        return
    }

    errorMessage.value = ""
    if (video.paused) {
        try {
            await video.play()
        } catch (error) {
            isPlaying.value = false
            errorMessage.value = "视频无法播放"
            console.error("视频播放失败:", error)
        }
        return
    }

    video.pause()
}

/**
 * 根据进度条定位视频播放位置。
 * @param event 进度条输入事件
 */
function seekVideo(event: Event): void {
    const video = videoRef.value
    const value = Number((event.target as HTMLInputElement).value)
    if (!video || !hasDuration.value || !Number.isFinite(value)) {
        return
    }

    const nextTime = (value / 1000) * duration.value
    video.currentTime = nextTime
    currentTime.value = nextTime
}

/**
 * 切换静音状态。
 */
function toggleMuted(): void {
    const video = videoRef.value
    if (!video) {
        return
    }
    isMuted.value = !isMuted.value
    video.muted = isMuted.value
}

/**
 * 调整音量。
 * @param event 音量滑条输入事件
 */
function changeVolume(event: Event): void {
    const video = videoRef.value
    const value = Number((event.target as HTMLInputElement).value)
    if (!video || !Number.isFinite(value)) {
        return
    }
    volume.value = value
    video.volume = value
    isMuted.value = value === 0
    video.muted = isMuted.value
}

/**
 * 调整播放倍速。
 * @param event 倍速选择事件
 */
function changePlaybackRate(event: Event): void {
    const video = videoRef.value
    const value = Number((event.target as HTMLSelectElement).value)
    if (!video || !Number.isFinite(value)) {
        return
    }
    playbackRate.value = value
    video.playbackRate = value
}

/**
 * 切换全屏显示。
 */
async function toggleFullscreen(): Promise<void> {
    const player = playerRef.value
    if (!player) {
        return
    }

    if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
    }

    try {
        await player.requestFullscreen()
    } catch (error) {
        console.error("全屏切换失败:", error)
    }
}

/**
 * 同步视频当前播放位置。
 */
function handleTimeUpdate(): void {
    const video = videoRef.value
    if (video) {
        currentTime.value = video.currentTime
    }
}

/**
 * 同步视频时长。
 */
function handleLoadedMetadata(): void {
    const video = videoRef.value
    if (!video) {
        return
    }
    duration.value = Number.isFinite(video.duration) ? video.duration : 0
    currentTime.value = video.currentTime
}

/**
 * 标记视频进入播放状态并启动弹幕调度。
 */
function handlePlay(): void {
    isPlaying.value = true
    isLoading.value = false
    startDanmakuSchedule()
}

/**
 * 标记视频暂停并暂停弹幕调度。
 */
function handlePause(): void {
    isPlaying.value = false
    stopDanmakuSchedule()
}

/**
 * 标记视频等待数据。
 */
function handleWaiting(): void {
    isLoading.value = true
}

/**
 * 标记视频已可继续播放。
 */
function handleCanPlay(): void {
    isLoading.value = false
}

/**
 * 处理视频资源加载失败。
 */
function handleError(): void {
    isPlaying.value = false
    isLoading.value = false
    errorMessage.value = "视频加载失败"
}

/**
 * 视频播放结束后的清理。
 */
function handleEnded(): void {
    isPlaying.value = false
    stopDanmakuSchedule()
}

/**
 * 计算滚动弹幕的纵向位置，按弹幕序号轮转至若干轨道避免重叠。
 * @returns 纵向百分比
 */
function pickDanmakuTrack(): number {
    const track = danmakuSpawnCursor % 6
    danmakuSpawnCursor += 1
    return 10 + track * 13
}

/**
 * 发送本地弹幕（仅回显到当前画面，并通知父组件）。
 */
function sendDanmaku(): void {
    const text = danmakuInput.value.trim()
    if (!text) {
        return
    }

    activeDanmakuList.value.push({
        id: danmakuIdSeed++,
        time: currentTime.value,
        text,
        mode: "scroll",
        topPercent: pickDanmakuTrack(),
    })
    emit("danmaku-send", text)
    danmakuInput.value = ""
}

/**
 * 开始调度：定时检查是否到达弹幕出现时间。
 */
function startDanmakuSchedule(): void {
    if (scheduleTimer !== null || !showDanmaku.value) {
        return
    }

    scheduleTimer = setInterval(() => {
        const video = videoRef.value
        if (!video || video.paused) {
            return
        }

        const time = video.currentTime
        while (playedDanmakuIndex.value < props.danmaku.length) {
            const comment = props.danmaku[playedDanmakuIndex.value]
            if (comment.time > time + 0.5) {
                break
            }

            const isScroll = (comment.mode ?? "scroll") === "scroll"
            activeDanmakuList.value.push({
                ...comment,
                id: danmakuIdSeed++,
                topPercent: isScroll ? pickDanmakuTrack() : undefined,
            })
            playedDanmakuIndex.value += 1
        }
    }, 200)
}

/**
 * 弹幕开关变化处理：关闭时清空画面并停止调度，打开后按当前播放状态重启调度。
 */
watch(showDanmaku, enabled => {
    if (!enabled) {
        activeDanmakuList.value = []
        stopDanmakuSchedule()
        return
    }

    if (isPlaying.value) {
        startDanmakuSchedule()
    }
})

/**
 * 停止弹幕调度。
 */
function stopDanmakuSchedule(): void {
    if (scheduleTimer !== null) {
        clearInterval(scheduleTimer)
        scheduleTimer = null
    }
}

/**
 * 移除已完成播放的弹幕。
 * @param id 弹幕 ID
 */
function removeDanmaku(id: number): void {
    activeDanmakuList.value = activeDanmakuList.value.filter(item => item.id !== id)
}

/**
 * 监听全屏状态变化。
 */
function handleFullscreenChange(): void {
    isFullscreen.value = Boolean(document.fullscreenElement)
}

/**
 * 视频源切换时重置播放器状态（元素 src 交由 Vue 重新绑定，这里仅清理状态）。
 */
function resetPlayer(): void {
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    isLoading.value = false
    errorMessage.value = ""
    activeDanmakuList.value = []
    playedDanmakuIndex.value = 0
    danmakuSpawnCursor = 0
    stopDanmakuSchedule()
}

watch(() => props.src, resetPlayer)

onBeforeUnmount(() => {
    stopDanmakuSchedule()
    const video = videoRef.value
    if (video) {
        video.pause()
        video.removeAttribute("src")
        video.load()
    }
    if (typeof document !== "undefined") {
        document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
})

/**
 * 在弹幕 DOM 挂载后驱动其从右侧向左滑入。
 * @param element 弹幕元素（含组件实例类型，运行时仅处理原生元素）
 */
function animateDanmaku(element: Element | ComponentPublicInstance | null): void {
    if (!(element instanceof HTMLElement)) {
        return
    }

    const layerWidth = danmakuLayerRef.value?.clientWidth ?? 800
    const isScroll = element.dataset.mode !== "top" && element.dataset.mode !== "bottom"
    if (isScroll) {
        // 滚动弹幕从容器右侧外进入，向左滑过整个容器后出画
        const distance = layerWidth + element.offsetWidth
        element.style.left = "100%"
        element.animate([{ transform: "translateX(0)" }, { transform: `translateX(-${distance}px)` }], {
            duration: 8000,
            easing: "linear",
        }).onfinish = () => {
            if (element.dataset.danmakuId) {
                removeDanmaku(Number(element.dataset.danmakuId))
            }
        }
        return
    }

    // 顶部/底部停留弹幕：淡入后淡出
    element.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], {
        duration: 4200,
        easing: "linear",
    }).onfinish = () => {
        if (element.dataset.danmakuId) {
            removeDanmaku(Number(element.dataset.danmakuId))
        }
    }
}

/**
 * 初始化：绑定全屏监听并支持自动播放。
 */
async function initPlayer(): Promise<void> {
    const video = videoRef.value
    if (!video) {
        return
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    if (props.autoPlay) {
        try {
            await video.play()
        } catch (error) {
            console.error("视频自动播放失败（可能需要静音策略）:", error)
        }
    }
}

nextTick(initPlayer)
</script>

<template>
    <div
        ref="playerRef"
        class="group relative aspect-video w-full overflow-hidden bg-black/90 rounded-xs border border-base-content/15 select-none"
    >
        <video
            ref="videoRef"
            class="h-full w-full object-contain"
            :src="src"
            :poster="poster || undefined"
            preload="metadata"
            playsinline
            @canplay="handleCanPlay"
            @click="togglePlayback"
            @ended="handleEnded"
            @error="handleError"
            @loadedmetadata="handleLoadedMetadata"
            @pause="handlePause"
            @play="handlePlay"
            @timeupdate="handleTimeUpdate"
            @waiting="handleWaiting"
        />

        <!-- 弹幕层 -->
        <div v-show="showDanmaku" ref="danmakuLayerRef" class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <template v-for="item in activeDanmakuList" :key="item.id">
                <span
                    v-if="item.mode === 'top' || item.mode === 'bottom'"
                    class="absolute left-1/2 -translate-x-1/2 text-sm font-medium whitespace-nowrap"
                    :class="item.mode === 'top' ? 'top-[8%]' : 'bottom-[14%]'"
                    :style="{ color: item.color || 'rgba(255,255,255,0.95)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }"
                    :data-mode="item.mode"
                    :data-danmaku-id="item.id"
                    :ref="animateDanmaku"
                >
                    {{ item.text }}
                </span>
                <span
                    v-else
                    class="absolute text-sm font-medium whitespace-nowrap"
                    :style="{
                        top: `${item.topPercent ?? 20}%`,
                        color: item.color || 'rgba(255,255,255,0.95)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    }"
                    data-mode="scroll"
                    :data-danmaku-id="item.id"
                    :ref="animateDanmaku"
                >
                    {{ item.text }}
                </span>
            </template>
        </div>

        <!-- 中央播放按钮 -->
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none" :class="isPlaying ? 'opacity-0' : 'opacity-100'">
            <button
                v-if="!isPlaying"
                type="button"
                class="btn btn-circle btn-ghost pointer-events-auto text-white/90 transition-transform duration-200 hover:scale-110"
                aria-label="播放"
                @click="togglePlayback"
            >
                <Icon icon="ri:play-fill" class="size-10" />
            </button>
        </div>

        <!-- 顶部标题 -->
        <div
            v-if="title"
            class="pointer-events-none absolute inset-x-0 top-0 p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
            <span class="truncate rounded-xs bg-black/55 px-2 py-1 text-xs text-white/90 backdrop-blur-sm">{{ title }}</span>
        </div>

        <!-- 底部控制条 -->
        <div
            class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 transition-opacity duration-200"
            :class="isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'"
        >
            <div class="flex items-center gap-2 text-white/95">
                <button
                    type="button"
                    class="btn btn-circle btn-ghost btn-xs"
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
                    class="range range-primary range-xs flex-1"
                    @input="seekVideo"
                />

                <span class="shrink-0 font-mono text-[10px] tabular-nums text-white/85">
                    {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                </span>

                <button
                    type="button"
                    class="btn btn-circle btn-ghost btn-xs"
                    :aria-label="isMuted ? '取消静音' : '静音'"
                    @click="toggleMuted"
                >
                    <Icon :icon="'ri:volume-up-line'" class="size-3.5" :class="{ 'opacity-40': isMuted || volume === 0 }" />
                </button>

                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    :value="isMuted ? 0 : volume"
                    aria-label="音量"
                    class="range range-primary range-xs w-16"
                    @input="changeVolume"
                />

                <select
                    :value="playbackRate"
                    aria-label="播放倍速"
                    class="select select-ghost select-xs w-14 bg-black/40 text-[10px] text-white/90"
                    @change="changePlaybackRate"
                >
                    <option v-for="rate in [0.5, 0.75, 1, 1.25, 1.5, 2]" :key="rate" :value="rate">x{{ rate }}</option>
                </select>

                <button
                    type="button"
                    class="btn btn-circle btn-ghost btn-xs"
                    :class="showDanmaku ? 'text-primary' : 'text-white/60'"
                    aria-label="弹幕开关"
                    title="弹幕"
                    @click="showDanmaku = !showDanmaku"
                >
                    <Icon icon="ri:message-2-line" />
                </button>

                <button
                    type="button"
                    class="btn btn-circle btn-ghost btn-xs"
                    :aria-label="isFullscreen ? '退出全屏' : '全屏'"
                    @click="toggleFullscreen"
                >
                    <Icon :icon="isFullscreen ? 'codicon:chrome-restore' : 'codicon:chrome-maximize'" />
                </button>
            </div>

            <!-- 弹幕发送框 -->
            <div v-if="sendable && showDanmaku" class="flex items-center gap-1.5 pt-1.5">
                <input
                    v-model="danmakuInput"
                    type="text"
                    maxlength="120"
                    placeholder="发一条友善的弹幕见证当下"
                    class="h-6 min-w-0 flex-1 rounded-xs border border-white/25 bg-black/45 px-2 text-xs text-white/95 placeholder:text-white/45 focus:border-primary"
                    @keydown.enter="sendDanmaku"
                />
                <button type="button" class="btn btn-ghost btn-xs text-white/85" @click="sendDanmaku">
                    <Icon icon="ri:send-plane-line" />
                </button>
            </div>
        </div>

        <!-- 加载/错误提示 -->
        <div v-if="isLoading" class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white/70">
            正在加载视频
        </div>
        <div v-else-if="errorMessage" class="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-error">
            {{ errorMessage }}
        </div>
    </div>
</template>
