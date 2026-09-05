import { useLocalStorage } from "@vueuse/core"
import { DNAAPI } from "dna-api"
import { defineStore } from "pinia"
import {
    applyMaterial,
    isLaunchAtStartupEnabled,
    listSystemFonts,
    setLaunchAtStartupEnabled,
    startHeartbeat,
    stopHeartbeat,
    tauriFetch,
} from "@/api/app"
import { executeSignFlow } from "@/api/dna-sign"
import { isSafeModeClosed } from "@/data/versionGate"
import { env } from "@/env"
import { applyLanguageFontClass, changeLanguage } from "@/i18n"
import { sleep } from "@/util"
import type { CustomTheme } from "@/utils/customTheme"
import { DEFAULT_CUSTOM_THEME } from "@/utils/customTheme"
import type { CustomFontMeta } from "@/utils/font-storage"
import {
    customFontCssFamily,
    listCustomFonts,
    registerCustomFontFace,
    removeCustomFont as removeCustomFontFromOpfs,
    saveCustomFont,
} from "@/utils/font-storage"
import { readCustomWallpaper, removeCustomWallpaper, writeCustomWallpaper } from "@/utils/wallpaper-storage"
import { db } from "./db"

let apiCache: DNAAPI | null = null
let apiCacheKey = ""
let signInterval: number | null = null
let apiInitPromise: Promise<DNAAPI | undefined> | null = null

export const useSettingStore = defineStore("setting", {
    state: () => {
        // const isDarkMode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        return {
            theme: useLocalStorage("setting_theme", "dark"),
            uiScale: useLocalStorage("setting_ui_scale", 1),
            winMaterial: useLocalStorage("setting_win_material", "Unset"),
            windowTrasnparent: useLocalStorage("setting_window_trasnparent", false),
            lang: useLocalStorage("setting_lang", navigator.language),
            // AI大模型设置
            aiBaseUrl: useLocalStorage("ai_base_url", "https://open.bigmodel.cn/api/paas/v4/"),
            aiApiKey: useLocalStorage("ai_api_key", ""),
            aiModelName: useLocalStorage("ai_model_name", "glm-4.6v-flash"),
            aiMaxTokens: useLocalStorage("ai_max_tokens", 1024),
            aiTemperature: useLocalStorage("ai_temperature", 0.6),
            // 皎皎角
            dnaUserId: useLocalStorage("setting_user_id", 0),
            dnaUserUID: useLocalStorage("setting_user_uid", ""),
            showAIChat: useLocalStorage("setting_show_ai_chat", false),
            // 上次刷新时间（秒）
            lastCapInterval: useLocalStorage("last_cap_interval", 0),
            // 自动签到设置
            autoSign: useLocalStorage("setting_auto_sign", false),
            launchAtStartup: useLocalStorage("setting_launch_at_startup", false),
            initScriptHotkeysAtStartup: useLocalStorage("setting_init_script_hotkeys_at_startup", true),
            // 隐藏全局 CopyID 组件（开启后所有页面不再显示 ID 复制按钮）
            hideID: useLocalStorage("setting_hide_id", false),
            nextSignCheckTime: useLocalStorage("setting_next_sign_check_time", 0),
            // 剧情文本替换设置
            protagonistName1: useLocalStorage("story_protagonist_name_1", "维塔"),
            protagonistName2: useLocalStorage("story_protagonist_name_2", "墨斯"),
            protagonistGender: useLocalStorage<"male" | "female">("story_protagonist_gender", "female"),
            protagonistGender2: useLocalStorage<"male" | "female">("story_protagonist_gender_2", "female"),
            safeMode: !isSafeModeClosed(),
            lastHeartbeatTime: 0,
            // 自定义底图（图片 data URL；空字符串表示未设置），持久化在 OPFS 中，启动时通过 initCustomWallpaper 加载
            customWallpaper: "",
            // 自定义底图透明度（0~1，1 为完全不透明），与窗口透明叠加使用，弱化为背景
            customWallpaperOpacity: useLocalStorage("setting_custom_wallpaper_opacity", 1),
            // 自定义底图模糊度（像素，0 为不模糊），对底图做高斯模糊营造景深
            customWallpaperBlur: useLocalStorage("setting_custom_wallpaper_blur", 0),
            // 自定义主题（设置页主题设计器），缺失字段时用默认值合并兜底
            customTheme: useLocalStorage<CustomTheme>("setting_custom_theme", structuredClone(DEFAULT_CUSTOM_THEME), {
                mergeDefaults: true,
            }),
            // 自定义外观字体（CSS font-family 值，带引号的字体名；空字符串表示使用默认字体栈）
            appFontFamily: useLocalStorage("setting_app_font_family", ""),
            // 已上传的自定义字体（运行时从 OPFS 枚举）
            customFonts: [] as CustomFontMeta[],
            // 系统已安装字体列表（懒加载缓存）
            systemFonts: [] as string[],
            systemFontsLoading: false,
            // ===== 游戏技能 CD 倒计时浮窗 =====
            // 是否启用 E 技能 CD 倒计时浮窗
            skillCdOverlayEnabled: useLocalStorage("setting_skill_cd_overlay_enabled", false),
            // 浮窗左上角 X/Y(物理像素,默认近右下角)
            skillCdOverlayX: useLocalStorage("setting_skill_cd_overlay_x", 1480),
            skillCdOverlayY: useLocalStorage("setting_skill_cd_overlay_y", 560),
            // 浮窗缩放系数(0.5~3)
            skillCdOverlayScale: useLocalStorage("setting_skill_cd_overlay_scale", 1),
            // E 技能完整冷却秒数
            skillCdOverlayCdSeconds: useLocalStorage("setting_skill_cd_overlay_cd_seconds", 8),
            // 冷却归零(就绪)后隐藏浮窗条目
            skillCdOverlayHideWhenReady: useLocalStorage("setting_skill_cd_overlay_hide_when_ready", false),
            // 仅游戏窗口在前台时才响应按键触发
            skillCdOverlayGameOnly: useLocalStorage("setting_skill_cd_overlay_game_only", true),
            // 后端浮窗实际运行状态(会话内瞬态,不持久化)
            skillCdOverlayRunning: false,
        }
    },
    getters: {},
    actions: {
        setLang(lang: string) {
            this.lang = lang
            changeLanguage(lang)
            applyLanguageFontClass(lang)
        },
        setTheme(theme: string) {
            this.theme = theme
        },
        /**
         * 整体替换自定义主题（用于重置/导入）。
         * @param theme 新的自定义主题
         */
        setCustomTheme(theme: CustomTheme) {
            this.customTheme = theme
        },
        /**
         * 启动时从 OPFS 加载自定义底图到内存状态。
         * @returns 当前底图 data URL（未设置为空字符串）
         */
        async initCustomWallpaper() {
            this.customWallpaper = await readCustomWallpaper()
            return this.customWallpaper
        },
        /**
         * 更新自定义底图并持久化到 OPFS。
         * @param dataUrl 底图 data URL；空字符串等价于清除
         */
        async setCustomWallpaper(dataUrl: string) {
            if (!dataUrl) {
                await this.clearCustomWallpaper()
                return
            }
            await writeCustomWallpaper(dataUrl)
            this.customWallpaper = dataUrl
        },
        /**
         * 清除自定义底图：删除 OPFS 中的文件并重置内存状态。
         */
        async clearCustomWallpaper() {
            await removeCustomWallpaper()
            this.customWallpaper = ""
        },
        /**
         * 将所选外观字体写入根元素 CSS 变量（置于默认字体栈之前，缺失字形时逐级回退）。
         */
        applyAppFont() {
            if (typeof document === "undefined") {
                return
            }
            const style = document.documentElement.style
            if (!this.appFontFamily) {
                style.removeProperty("--app-user-font")
                return
            }
            style.setProperty("--app-user-font", `${this.appFontFamily}, var(--app-font-fallback)`)
        },
        /**
         * 设置外观字体并立即应用。
         * @param family 带引号的 CSS 字体族名；空字符串表示恢复默认
         */
        setAppFontFamily(family: string) {
            this.appFontFamily = family
            this.applyAppFont()
        },
        /**
         * 启动时初始化自定义字体：从 OPFS 枚举并注册 FontFace，再应用已保存的选择。
         */
        async initAppFont() {
            try {
                this.customFonts = await listCustomFonts()
                for (const meta of this.customFonts) {
                    await registerCustomFontFace(meta)
                }
            } catch (error) {
                console.error("加载自定义字体失败", error)
            }
            this.applyAppFont()
        },
        /**
         * 上传字体文件到 OPFS，注册成功后自动启用。
         * @param file 字体文件（ttf/otf/woff/woff2）
         */
        async uploadCustomFont(file: File) {
            const meta = await saveCustomFont(file)
            const registered = await registerCustomFontFace(meta)
            if (!registered) {
                // 解析失败时清理已落盘的文件
                await removeCustomFontFromOpfs(meta.fileName)
                throw new Error("无法解析该字体文件")
            }
            await this.refreshCustomFonts()
            this.setAppFontFamily(customFontCssFamily(meta))
        },
        /**
         * 删除已上传的自定义字体；若正在使用则回退默认字体。
         * @param fileName 存储文件名
         */
        async deleteCustomFont(fileName: string) {
            const removed = this.customFonts.find(meta => meta.fileName === fileName)
            await removeCustomFontFromOpfs(fileName)
            if (removed && this.appFontFamily === customFontCssFamily(removed)) {
                this.setAppFontFamily("")
            }
            await this.refreshCustomFonts()
        },
        /**
         * 重新从 OPFS 枚举自定义字体列表。
         */
        async refreshCustomFonts() {
            this.customFonts = await listCustomFonts()
        },
        /**
         * 加载系统字体列表：桌面端走 Tauri 注册表枚举；
         * Web 端尝试 Local Font Access API（需要用户手势与浏览器权限）。
         * @param force 是否强制刷新缓存
         */
        async loadSystemFonts(force = false) {
            if (this.systemFontsLoading || (!force && this.systemFonts.length)) {
                return
            }
            this.systemFontsLoading = true
            try {
                if (env.isApp) {
                    this.systemFonts = await listSystemFonts()
                } else if ("queryLocalFonts" in window) {
                    const fonts = await (window as any).queryLocalFonts()
                    this.systemFonts = [...new Set<string>(fonts.map((font: { family: string }) => font.family))].sort((a, b) =>
                        a.localeCompare(b, "zh-CN")
                    )
                } else {
                    this.systemFonts = []
                }
            } catch (error) {
                console.warn("获取系统字体列表失败", error)
                this.systemFonts = []
            } finally {
                this.systemFontsLoading = false
            }
        },
        /**
         * 同步桌面端开机启动状态，避免本地缓存与系统真实状态不一致。
         */
        async syncLaunchAtStartup() {
            this.launchAtStartup = await isLaunchAtStartupEnabled()
            return this.launchAtStartup
        },
        /**
         * 更新开机启动设置，并以系统返回结果为准写回本地状态。
         * @param enabled 是否启用开机启动
         */
        async setLaunchAtStartup(enabled: boolean) {
            const nextState = await setLaunchAtStartupEnabled(enabled)
            this.launchAtStartup = nextState
            return nextState
        },
        setWinMaterial(mat: string) {
            this.winMaterial = mat
            applyMaterial(this.winMaterial as any)
        },
        resetWinMaterial() {
            applyMaterial(this.winMaterial as any)
        },
        // AI设置相关方法
        getOpenAIConfig() {
            return {
                api_key: this.aiApiKey,
                base_url: this.aiBaseUrl,
                default_model: this.aiModelName,
                default_temperature: this.aiTemperature,
                default_max_tokens: this.aiMaxTokens,
            }
        },
        setAiBaseUrl(baseUrl: string) {
            this.aiBaseUrl = baseUrl
        },
        setAiApiKey(apiKey: string) {
            this.aiApiKey = apiKey
        },
        setAiModelName(modelName: string) {
            this.aiModelName = modelName
        },
        setAiMaxTokens(maxTokens: number) {
            this.aiMaxTokens = maxTokens
        },
        setAiTemperature(temperature: number) {
            this.aiTemperature = temperature
        },
        resetAiSettings() {
            this.aiBaseUrl = "https://open.bigmodel.cn/api/paas/v4/"
            this.aiApiKey = ""
            this.aiModelName = "glm-4.6v-flash"
            this.aiMaxTokens = 1024
            this.aiTemperature = 0.6
        },
        async getCurrentUser() {
            const user = await db.dnaUsers.get(this.dnaUserId)
            return user
        },
        async getDNAAPI() {
            const user = await this.getCurrentUser()
            if (!user) {
                this.stopHeartbeat()
                return undefined
            }

            // 检查缓存是否有效
            if (apiCache && apiCacheKey === user.uid) {
                return apiCache
            }

            // 如果已有初始化Promise，直接返回
            if (apiInitPromise) {
                return await apiInitPromise
            }

            // 创建新的初始化Promise
            apiInitPromise = (async () => {
                try {
                    const lang = this.lang === "zh-CN" ? "zh-Hans" : this.lang === "zh-TW" ? "zh-Hant" : this.lang
                    this.dnaUserUID = user.uid
                    const api = new DNAAPI({
                        dev_code: user.dev_code,
                        token: user.token,
                        kf_token: user.kf_token,
                        debug: import.meta.env.DEV,
                        mode: "android",
                        server: user.server || "cn",
                        lang,
                        fetchFn: tauriFetch,
                    })
                    const res = await api.loginLog()
                    if (res.msg.includes("失效") || res.msg.includes("过期")) {
                        const refreshRes = await api.refreshToken(user.refreshToken)
                        if (refreshRes.is_success && refreshRes.data?.token) {
                            api.token = refreshRes.data.token
                            await db.dnaUsers.update(user.id, { token: refreshRes.data.token })
                        }
                    }

                    // 更新缓存
                    apiCache = api
                    ;(window as any).DNAAPI = api
                    apiCacheKey = user.uid

                    return api
                } catch (error) {
                    console.error("获取DNAAPI失败:", error)
                    return undefined
                } finally {
                    // 清除初始化Promise，允许下次重新初始化
                    apiInitPromise = null
                }
            })()

            return await apiInitPromise
        },

        // 启动心跳计时器
        async startHeartbeat(userId?: string, token?: string) {
            if (!userId || !token) {
                const user = await this.getCurrentUser()
                if (!user) return false
                userId = user.uid
                token = user.token
                if (user.server === "global") return true
            }
            try {
                // 调用Rust实现的心跳功能
                const res = await startHeartbeat("wss://dnabbs-api.yingxiong.com:8180/ws-community-websocket", token, userId)
                if (this.lastHeartbeatTime + 1000 * 10 < Date.now()) {
                    this.lastHeartbeatTime = Date.now()
                    await sleep(1000) // 确保API有值
                }
                if (res.includes("成功")) {
                    console.log("心跳已启动")
                    return true
                } else {
                    await stopHeartbeat()
                }
            } catch (error) {
                console.error("启动心跳失败:", error)
            }
            return false
        },

        // 停止心跳计时器
        async stopHeartbeat() {
            try {
                const user = await this.getCurrentUser()
                if (!user) return false
                if (user.server === "global") return true
                // 调用Rust实现的停止心跳功能
                await stopHeartbeat()
                console.log("心跳已停止")
            } catch (error) {
                console.error("停止心跳失败:", error)
            }
        },
        async saveKFToken(token: string) {
            const user = await this.getCurrentUser()
            if (!user) return
            await db.dnaUsers.update(user.id, { kf_token: token })
            // apiCache = null
        },

        /**
         * 设置自动签到开关
         */
        setAutoSign(enabled: boolean) {
            this.autoSign = enabled
            if (enabled) {
                console.log("自动签到已启用")
                this.startAutoSign()
            } else {
                console.log("自动签到已禁用")
                this.stopAutoSign()
            }
        },

        /**
         * 开始自动签到定时任务
         */
        startAutoSign() {
            // 清除现有的定时器
            this.stopAutoSign()

            // 立即执行一次签到检查
            this.checkAutoSign()

            // 设置定时器，每分钟检查一次
            signInterval = window.setInterval(() => {
                this.checkAutoSign()
            }, 60 * 1000)
        },

        /**
         * 停止自动签到定时任务
         */
        stopAutoSign() {
            if (signInterval !== null) {
                clearInterval(signInterval)
                signInterval = null
            }
        },

        /**
         * 检查是否需要执行自动签到
         */
        async checkAutoSign() {
            const now = Date.now()
            // 如果当前时间小于下次检查时间，则不需要执行
            if (now < this.nextSignCheckTime) {
                return
            }

            // 获取API实例
            const api = await this.getDNAAPI()
            if (!api) {
                // API获取失败，1小时后重试
                this.setNextCheckTime(60 * 60 * 1000)
                return
            }

            // 执行签到流程
            const success = await executeSignFlow(api)
            if (success) {
                // 签到成功，设置下次检查时间为明天1点
                this.setNextCheckTimeToTomorrow()
            } else {
                // 签到失败，1小时后重试
                this.setNextCheckTime(60 * 60 * 1000)
            }
        },

        /**
         * 设置下次检查时间
         * @param delay 延迟时间（毫秒）
         */
        setNextCheckTime(delay: number) {
            this.nextSignCheckTime = Date.now() + delay
        },

        /**
         * 设置下次检查时间为明天1点
         */
        setNextCheckTimeToTomorrow() {
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(1, 0, 0, 0)
            this.nextSignCheckTime = tomorrow.getTime()
        },
    },
})
