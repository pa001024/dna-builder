import { getCurrentWindow } from "@tauri-apps/api/window"
import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { getGameInstall, isGameRunning, launchExe, pathExists } from "../api/app"
import { env } from "../env"
import { sleep } from "../util"

const GAME_RUNNING_POLL_MS = 1000
const GAME_LIVE_PERSIST_MS = 1000

if (env.isApp && getCurrentWindow().label === "main") {
    setTimeout(async () => {
        const game = useGameStore()
        let stopped = false
        let pendingLiveTotal = 0
        let pendingLiveDiff = 0
        let runtimeLiveTime = game.liveTime || Date.now()
        let lastPersistAt = Date.now()
        let lastObservedPath = game.path

        /**
         * 将累计的在线时长写回持久化状态，降低 localStorage 高频写入压力。
         */
        function flushLiveDuration() {
            if (pendingLiveTotal === 0 && pendingLiveDiff === 0) return
            game.liveTotal += pendingLiveTotal
            game.liveDiff += pendingLiveDiff
            game.liveTime = runtimeLiveTime
            pendingLiveTotal = 0
            pendingLiveDiff = 0
        }

        /**
         * 在窗口关闭时停止轮询，避免后台无意义循环。
         */
        function stopPolling() {
            stopped = true
        }
        window.addEventListener("beforeunload", stopPolling, { once: true })

        if (!game.path) {
            const installPath = await getGameInstall()
            if (installPath) {
                game.path = installPath
            }
        }

        await game.refreshGameInstalled()
        lastObservedPath = game.path

        try {
            while (!stopped) {
                const now = Date.now()

                // 先累计上一个周期的在线时长，确保运行状态切换时不丢时长
                if (game.running) {
                    const delta = now - runtimeLiveTime
                    if (delta > 0) {
                        pendingLiveTotal += delta
                        pendingLiveDiff += delta
                    }
                    runtimeLiveTime = now
                }

                const path = await isGameRunning(game.running)
                const realPath = path?.replace(/EM\\Binaries\\Win64\\EM-Win64-Shipping.exe$/, "EM.exe")
                const running = !!path

                // 只在未配置路径时自动补全，避免把别的服务器路径写回当前配置。
                if (!game.path && realPath) {
                    game.path = realPath
                }
                if (game.path !== lastObservedPath) {
                    await game.refreshGameInstalled()
                    lastObservedPath = game.path
                }
                if (game.running !== running) {
                    game.running = running
                    runtimeLiveTime = now
                    game.liveTime = runtimeLiveTime
                }

                const date = new Date().toLocaleDateString("zh")
                // 新的一天重新计时
                if (date !== game.liveDate) {
                    flushLiveDuration()
                    game.liveDate = date
                    game.liveDiff = 0
                }

                if (!running || now - lastPersistAt >= GAME_LIVE_PERSIST_MS) {
                    flushLiveDuration()
                    lastPersistAt = now
                }
                await sleep(GAME_RUNNING_POLL_MS)
            }
        } finally {
            flushLiveDuration()
            window.removeEventListener("beforeunload", stopPolling)
        }
    }, 1e3)
}

export const useGameStore = defineStore("game", {
    state: () => {
        return {
            dx11Enable: useLocalStorage("game.dx11_enable", false),
            noTitlebar: useLocalStorage("game.no_titlebar", false),
            modEnable: useLocalStorage("game.mod_enable", false),
            modLoader: useLocalStorage("game.mod_loader", "legacy"),
            pathEnable: useLocalStorage("game.path_enable", true),
            beforeGameEnable: useLocalStorage("game.before_enable", false),
            afterGameEnable: useLocalStorage("game.after_enable", false),
            path: useLocalStorage("game.path", ""),
            beforeGame: useLocalStorage("game.before", ""),
            afterGame: useLocalStorage("game.after", ""),
            pathParams: useLocalStorage("game.path_params", ""),
            beforeGameParams: useLocalStorage("game.before_params", ""),
            afterGameParams: useLocalStorage("game.after_params", ""),
            liveDate: useLocalStorage("game.live_date", "1999/1/1"),
            liveTime: useLocalStorage("game.live_time", 0),
            liveDiff: useLocalStorage("game.live_diff", 0),
            liveTotal: useLocalStorage("game.live_total", 0),
            running: false,
            installed: false,
            expend: false,
            lastLaunch: useLocalStorage("game.last_launch", 0),
            likedChars: useLocalStorage("game.liked_chars", [] as string[]),
        }
    },
    getters: {
        gameDir: state => state.path.replace(/EM\.exe$/, ""),
        gameExeExists: state => state.installed,
    },
    actions: {
        async refreshGameInstalled() {
            if (!this.path) {
                this.installed = false
                return
            }
            const gameDir = this.path.replace(/EM\.exe$/, "")
            this.installed =
                (await pathExists(this.path)) &&
                (await pathExists(`${gameDir}BaseVersion.json`)) &&
                !(await pathExists(`${gameDir}.extracting`))
        },
        async launchGame() {
            if (Date.now() > this.lastLaunch && Date.now() - this.lastLaunch < 1000) {
                return
            }
            this.lastLaunch = Date.now()

            if (this.beforeGame && this.beforeGameEnable) {
                console.log("beforeGame")
                await launchExe(this.beforeGame, this.beforeGameParams)
            }
            if (this.path && this.pathEnable) {
                console.log("game start")
                let p = this.pathParams
                if (this.dx11Enable) {
                    p += ` -dx11`
                }
                await launchExe(this.path, p)
                console.log("game exited")
            }
            if (this.afterGame && this.afterGameEnable) {
                console.log("afterGame")
                await launchExe(this.afterGame, this.afterGameParams)
            }
        },
    },
})
