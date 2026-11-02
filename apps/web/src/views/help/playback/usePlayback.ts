import { computed, onBeforeUnmount, type Ref, ref, watch } from "vue"
import type { Scene, Tutorial } from "../content/types"

export interface SceneTiming {
    scene: Scene
    index: number
    start: number
    end: number
    duration: number
}

/**
 * 帮助中心的时间线播放器：绝对时间驱动分镜，支持暂停、拖拽进度、跳章与倍速。
 * @param tutorial 当前教程（null 表示在目录页）
 * @param options 选项：是否在教程切换时自动播放
 */
export function usePlayback(tutorial: Ref<Tutorial | null>, options: { autoplay?: boolean } = {}) {
    const autoplay = options.autoplay ?? true
    const elapsed = ref(0)
    const playing = ref(false)
    const ended = ref(false)
    const speed = ref(1)
    let frame: number | null = null
    let lastStamp = 0

    const timings = computed<SceneTiming[]>(() => {
        let cursor = 0
        return (tutorial.value?.scenes ?? []).map((scene, index) => {
            const start = cursor
            cursor += scene.duration
            return { scene, index, start, end: cursor, duration: scene.duration }
        })
    })

    const totalDuration = computed(() => timings.value.at(-1)?.end ?? 0)

    const activeIndex = computed(() => {
        if (!timings.value.length) return -1
        const found = timings.value.findIndex(item => elapsed.value < item.end)
        return found < 0 ? timings.value.length - 1 : found
    })

    const activeScene = computed<SceneTiming | null>(() => timings.value[activeIndex.value] ?? null)
    const sceneTime = computed(() => (activeScene.value ? Math.max(0, elapsed.value - activeScene.value.start) : 0))
    const progress = computed(() => (totalDuration.value > 0 ? elapsed.value / totalDuration.value : 0))

    function stopFrame() {
        if (frame !== null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(frame)
        frame = null
        lastStamp = 0
    }

    function tick(stamp: number) {
        frame = null
        if (!playing.value) return
        if (!lastStamp) lastStamp = stamp
        const delta = Math.min((stamp - lastStamp) / 1000, 0.25)
        lastStamp = stamp
        elapsed.value = Math.min(totalDuration.value, elapsed.value + delta * speed.value)
        if (elapsed.value >= totalDuration.value) {
            playing.value = false
            ended.value = true
            lastStamp = 0
            return
        }
        if (typeof requestAnimationFrame !== "undefined") frame = requestAnimationFrame(tick)
    }

    function play() {
        if (!tutorial.value || totalDuration.value <= 0) return
        if (ended.value) {
            elapsed.value = 0
            ended.value = false
        }
        playing.value = true
        lastStamp = 0
        if (frame === null && typeof requestAnimationFrame !== "undefined") frame = requestAnimationFrame(tick)
    }

    function pause() {
        playing.value = false
        stopFrame()
    }

    function toggle() {
        if (playing.value) pause()
        else play()
    }

    function seek(seconds: number) {
        const value = Math.max(0, Math.min(totalDuration.value, seconds))
        elapsed.value = value
        ended.value = value >= totalDuration.value
        if (playing.value && frame === null) {
            lastStamp = 0
            if (typeof requestAnimationFrame !== "undefined") frame = requestAnimationFrame(tick)
        }
    }

    function seekScene(index: number, resume = true) {
        const target = timings.value[index]
        if (!target) return
        seek(target.start + 0.001)
        if (resume) play()
    }

    function nextScene() {
        if (activeIndex.value < 0) return
        seekScene(Math.min(timings.value.length - 1, activeIndex.value + 1))
    }

    function prevScene() {
        if (activeIndex.value <= 0) return seek(0)
        seekScene(activeIndex.value - 1)
    }

    function restart() {
        seek(0)
        play()
    }

    watch(
        tutorial,
        () => {
            pause()
            elapsed.value = 0
            ended.value = false
            if (tutorial.value && autoplay) play()
        },
        { immediate: true }
    )

    onBeforeUnmount(stopFrame)

    return {
        elapsed,
        playing,
        ended,
        speed,
        timings,
        totalDuration,
        activeIndex,
        activeScene,
        sceneTime,
        progress,
        play,
        pause,
        toggle,
        seek,
        seekScene,
        nextScene,
        prevScene,
        restart,
    }
}
