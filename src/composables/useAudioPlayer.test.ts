import { afterEach, describe, expect, it, vi } from "vitest"
import { effectScope, ref } from "vue"
import { useAudioPlayer } from "@/composables/useAudioPlayer"

/**
 * 构造够用的假音频元素。
 * 只覆盖播放器实际读写的字段与方法，避免引入真实媒体解码依赖。
 * @returns 假音频元素
 */
function createFakeAudio() {
    const audio = {
        paused: true,
        currentTime: 0,
        duration: Number.NaN,
        pauseCalls: 0,
        loadCalls: 0,
        pause() {
            audio.paused = true
            audio.pauseCalls += 1
        },
        play() {
            audio.paused = false
            return Promise.resolve()
        },
        load() {
            audio.loadCalls += 1
        },
        removeAttribute() {},
    }

    return audio
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe("useAudioPlayer", () => {
    it("格式化时间并按占比计算进度", () => {
        const scope = effectScope()
        const audio = createFakeAudio()
        const player = scope.run(() => useAudioPlayer({ src: () => "/a.mp3", audio: ref(audio as unknown as HTMLAudioElement) }))
        expect(player).toBeTruthy()
        if (!player) {
            return
        }

        expect(player.formatTime(-1)).toBe("0:00")
        expect(player.formatTime(75.6)).toBe("1:15")
        expect(player.formatTime(605)).toBe("10:05")

        expect(player.hasDuration.value).toBe(false)
        expect(player.progressRatio.value).toBe(0)

        audio.duration = 100
        player.handleLoadedMetadata()
        expect(player.hasDuration.value).toBe(true)

        player.seekToTime(150)
        expect(audio.currentTime).toBe(100)
        expect(player.progressRatio.value).toBe(1)

        player.seekToRatio(0.25)
        expect(audio.currentTime).toBe(25)
        expect(player.progressRatio.value).toBeCloseTo(0.25)

        scope.stop()
    })

    it("独占播放通道：后播放的播放器会停掉前一个", () => {
        const firstScope = effectScope()
        const secondScope = effectScope()
        const firstAudio = createFakeAudio()
        const secondAudio = createFakeAudio()

        const first = firstScope.run(() =>
            useAudioPlayer({ src: () => "/first.mp3", audio: ref(firstAudio as unknown as HTMLAudioElement) })
        )
        const second = secondScope.run(() =>
            useAudioPlayer({ src: () => "/second.mp3", audio: ref(secondAudio as unknown as HTMLAudioElement) })
        )
        if (!first || !second) {
            throw new Error("播放器初始化失败")
        }

        first.handlePlay()
        expect(first.isPlaying.value).toBe(true)

        // 状态由媒体事件回流驱动，这里手动补一次 `pause` 事件
        second.handlePlay()
        expect(firstAudio.paused).toBe(true)
        first.handlePause()
        expect(first.isPlaying.value).toBe(false)
        expect(second.isPlaying.value).toBe(true)

        second.handlePause()
        expect(second.isPlaying.value).toBe(false)

        firstScope.stop()
        secondScope.stop()
    })

    it("play 被拒绝时置为播放失败态", async () => {
        const scope = effectScope()
        const audio = createFakeAudio()
        audio.play = () => Promise.reject(new Error("autoplay blocked"))
        vi.spyOn(console, "error").mockImplementation(() => {})

        const player = scope.run(() => useAudioPlayer({ src: () => "/a.mp3", audio: ref(audio as unknown as HTMLAudioElement) }))
        if (!player) {
            throw new Error("播放器初始化失败")
        }

        await player.togglePlayback()
        expect(player.error.value).toBe("play-failed")
        expect(player.isPlaying.value).toBe(false)

        player.handleError()
        expect(player.error.value).toBe("load-failed")

        scope.stop()
    })

    it("卸载时暂停并释放音频资源", () => {
        const scope = effectScope()
        const audio = createFakeAudio()

        const player = scope.run(() => useAudioPlayer({ src: () => "/a.mp3", audio: ref(audio as unknown as HTMLAudioElement) }))
        if (!player) {
            throw new Error("播放器初始化失败")
        }

        player.handlePlay()
        scope.stop()

        expect(audio.pauseCalls).toBeGreaterThan(0)
        expect(audio.paused).toBe(true)
        expect(audio.loadCalls).toBeGreaterThan(0)
    })
})
