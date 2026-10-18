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
import { AI_CONTEXT_WINDOW_STORAGE_KEY, migrateLegacyAiMaxTokens, resolveAiContextWindow, resolveAiMaxTokens } from "@/utils/ai-config"
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
import { heartbeatFastStarted, retryAfterHeartbeatReady } from "@/utils/heartbeat"
import { createDefaultScreenBarConfig, parseScreenBarConfig, SCREEN_BAR_STORAGE_KEY, type ScreenBarConfig } from "@/utils/screen-bar"
import {
    createDefaultSkillCdOverlaySettings,
    type FloatWindowKeyBinding,
    normalizeKeyBindings,
    SKILL_CD_OVERLAY_STORAGE_KEY,
    type SkillCdOverlayStoredSettings,
} from "@/utils/skill-cd-overlay"
import { readCustomWallpaper, removeCustomWallpaper, writeCustomWallpaper } from "@/utils/wallpaper-storage"
import { type DNAUser, db } from "./db"

let apiCache: DNAAPI | null = null
/** apiCache 对应的 dnaUsers 行主键（db id）：同一 uid 重新登录会产生新行，必须按行吊销旧对象 */
let apiCacheKey = ""
let signInterval: number | null = null
let apiInitPromise: Promise<DNAAPI | undefined> | null = null
/** 进行中的初始化对应的 dnaUsers 行主键：切号后不再复用旧初始化 */
let apiInitKey = ""
/** 缓存代际：invalidateDNAAPI 时递增，迟到的初始化结果不得覆盖新代际 */
let apiGeneration = 0
/** 最近一次心跳完整握手的 promise：快速路径超时后，后续请求失败时等它 resolve 再重试。 */
let heartbeatReadyPromise: Promise<boolean> | null = null

// 迁移必须在建立 store 之前完成：useLocalStorage 会先把存储里的旧默认值读进 state
migrateLegacyAiMaxTokens()

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
            aiBaseUrl: useLocalStorage("ai_base_url", "", { writeDefaults: false }),
            aiApiKey: useLocalStorage("ai_api_key", "", { writeDefaults: false }),
            aiModelName: useLocalStorage("ai_model_name", "", { writeDefaults: false }),
            aiMaxTokens: useLocalStorage<number | string | null>("ai_max_tokens", null, { writeDefaults: false }),
            aiContextWindow: useLocalStorage<number | string | null>(AI_CONTEXT_WINDOW_STORAGE_KEY, null, { writeDefaults: false }),
            aiCustomModel: useLocalStorage("ai_custom_model", false, { writeDefaults: false }),
            // 皎皎角
            dnaUserId: useLocalStorage("setting_user_id", 0, { writeDefaults: false }),
            dnaUserUID: useLocalStorage("setting_user_uid", "", { writeDefaults: false }),
            showAIChat: useLocalStorage("setting_show_ai_chat", false, { writeDefaults: false }),
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
            // ===== 游戏技能 CD 倒计时浮窗(独立设置页:src/views/SkillCdOverlayView.vue) =====
            // 整组配置统一持久化在单个 localStorage 键里(一个大对象),字段与后端
            // float_window_set 的载荷一一对应;mergeDefaults 让后续新增字段在旧数据上自动取默认值。
            skillCdOverlay: useLocalStorage<SkillCdOverlayStoredSettings>(
                SKILL_CD_OVERLAY_STORAGE_KEY,
                createDefaultSkillCdOverlaySettings(),
                { mergeDefaults: true }
            ),
            // 后端浮窗实际运行状态(会话内瞬态,不持久化)
            skillCdOverlayRunning: false,
            // ===== 屏幕信息条:顶部通用浮窗(独立 WebviewWindow:src/views/ScreenBarView.vue) =====
            // 与技能 CD 浮窗同一套存储策略:整组配置放单个 localStorage 键。读取端交给 parseScreenBarConfig
            // 而不是 mergeDefaults —— 后者只在对象这一层补字段,补不进条目数组内部的新字段。
            screenBar: useLocalStorage<ScreenBarConfig>(SCREEN_BAR_STORAGE_KEY, createDefaultScreenBarConfig(), {
                serializer: {
                    read: raw => parseScreenBarConfig(raw),
                    write: value => JSON.stringify(value),
                },
            }),
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
         * 归一化技能 CD 浮窗的按键绑定,并写回同一个持久化对象。
         *
         * 空列表会补一条默认的 E 键绑定;同时剔除非法键码/重复键、钳制 CD 秒数,
         * 保证设置页与后端拿到的都是干净数据。
         * @returns 归一化后的按键绑定列表
         */
        ensureSkillCdOverlayKeys(): FloatWindowKeyBinding[] {
            const current = this.skillCdOverlay.keys
            const normalized = normalizeKeyBindings(current)
            if (JSON.stringify(normalized) !== JSON.stringify(current)) {
                this.skillCdOverlay.keys = normalized
            }
            return normalized
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
                default_max_tokens: resolveAiMaxTokens(this.aiMaxTokens),
                default_context_window: resolveAiContextWindow(this.aiContextWindow),
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
        setAiMaxTokens(maxTokens: number | string | null) {
            this.aiMaxTokens = maxTokens
        },
        setAiContextWindow(contextWindow: number | string | null) {
            this.aiContextWindow = contextWindow
        },
        resetAiSettings() {
            this.aiBaseUrl = ""
            this.aiApiKey = ""
            this.aiModelName = ""
            this.aiMaxTokens = null
            this.aiContextWindow = null
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
            const cacheKey = String(user.id)

            // 同一账号行：复用旧对象，但必须把 DB 里最新凭证同步进去。
            // 重新登录/refreshToken/局域网同步只换 token 不换行时走这里，否则旧对象会一直拿着过期 token 请求。
            if (apiCache && apiCacheKey === cacheKey) {
                this.syncDNAAPICredentials(apiCache, user)
                return apiCache
            }

            // 已有初始化在进行：同行直接复用；不同行则等它结束再建自己的，避免并发 loginLog 互相干扰
            if (apiInitPromise) {
                if (apiInitKey === cacheKey) {
                    const genBefore = apiGeneration
                    const existing = await apiInitPromise
                    if (existing || apiGeneration === genBefore) return existing
                    // 初始化期间缓存被吊销：继续走下面的新建流程
                } else {
                    try {
                        await apiInitPromise
                    } catch {
                        // 忽略旧初始化的错误，走自己的初始化
                    }
                    if (apiCache && apiCacheKey === cacheKey) {
                        this.syncDNAAPICredentials(apiCache, user)
                        return apiCache
                    }
                }
            }

            // 创建新的初始化Promise
            const generation = apiGeneration
            const initKey = cacheKey
            const promise = (async () => {
                try {
                    const lang = this.lang === "zh-CN" ? "zh-Hans" : this.lang === "zh-TW" ? "zh-Hant" : this.lang
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
                            if (heartbeatReadyPromise) {
                                void this.startHeartbeat(user.uid, refreshRes.data.token).catch(() => undefined)
                            }
                        } else {
                            // refreshToken 也已过期：旧对象继续留着只会让前端显示 token 无效，直接吊销并按未登录处理
                            this.invalidateDNAAPI()
                            return undefined
                        }
                    }

                    // 初始化期间账号被切换/缓存被吊销：丢弃本次结果，下次调用重建
                    if (generation !== apiGeneration || this.dnaUserId !== user.id) {
                        return undefined
                    }

                    // 替换旧对象：旧心跳持有旧 token，由新会话按需重建，这里先停掉（直接调 Rust 层，不走国际服直接返回的 store 封装）
                    if (apiCache && heartbeatReadyPromise) {
                        heartbeatReadyPromise = null
                        void stopHeartbeat().catch(() => undefined)
                    }

                    // 更新缓存
                    this.dnaUserUID = user.uid
                    apiCache = api
                    ;(window as any).DNAAPI = api
                    apiCacheKey = initKey

                    return api
                } catch (error) {
                    console.error("获取DNAAPI失败:", error)
                    return undefined
                } finally {
                    // 只清除属于自己的初始化标记（key 被后来的初始化覆盖则不动），允许下次重新初始化
                    if (apiInitKey === initKey) {
                        apiInitPromise = null
                        apiInitKey = ""
                    }
                }
            })()
            apiInitPromise = promise
            apiInitKey = initKey

            return await promise
        },
        /**
         * 把数据库里最新的凭证同步到已缓存的 DNAAPI 对象上（原地修改，不断开调用方持有的引用）。
         * 重新登录/refreshToken/局域网同步都只写 DB 不换对象，靠每次 getDNAAPI 命中时同步来消除旧 token。
         * @param api 已缓存的 DNAAPI 对象
         * @param user 数据库中的账号行
         */
        syncDNAAPICredentials(api: DNAAPI, user: DNAUser) {
            const lang = this.lang === "zh-CN" ? "zh-Hans" : this.lang === "zh-TW" ? "zh-Hant" : this.lang
            const tokenRotated = api.token !== user.token
            api.token = user.token
            api.kf_token = user.kf_token || ""
            api.dev_code = user.dev_code
            if (api.server !== (user.server || "cn")) api.server = user.server || "cn"
            if (api.lang !== lang) api.lang = lang
            ;(window as any).DNAAPI = api
            // token 已轮换而 Rust 心跳还拿着旧 token：重建心跳，否则心跳持续用无效身份
            if (tokenRotated && heartbeatReadyPromise) {
                void this.startHeartbeat(user.uid, user.token).catch(() => undefined)
            }
        },
        /**
         * 吊销 DNAAPI 缓存对象：切号/删号/重新登录/refreshToken 失效后调用。
         * 旧对象不再被任何后续 getDNAAPI 返回；Rust 心跳无条件停掉（它持有旧 token，不能走国际服直接返回的 store 封装）。
         */
        invalidateDNAAPI() {
            apiGeneration++
            apiCache = null
            apiCacheKey = ""
            heartbeatReadyPromise = null
            if (typeof window !== "undefined") (window as any).DNAAPI = undefined
            void stopHeartbeat().catch(() => undefined)
        },

        // 启动心跳计时器（快速路径：最多等待 500ms 即返回，握手在后台继续；
        // 若后续请求因心跳未就绪失败，由 runWithHeartbeatRetry 等完全就绪后重试）
        async startHeartbeat(userId?: string, token?: string) {
            if (!userId || !token) {
                const user = await this.getCurrentUser()
                if (!user) return false
                userId = user.uid
                token = user.token
                if (user.server === "global") {
                    heartbeatReadyPromise = Promise.resolve(true)
                    return true
                }
            }
            try {
                // 完整握手（Rust 建连，首帧即就绪；与 dob-app 一致，不再额外 sleep）在后台推进
                const handshake = (async (): Promise<boolean> => {
                    // 调用Rust实现的心跳功能
                    const res = await startHeartbeat("wss://dnabbs-api.yingxiong.com:8180/ws-community-websocket", token, userId)
                    if (res.includes("成功")) {
                        console.log("心跳已启动")
                        return true
                    }
                    await stopHeartbeat()
                    return false
                })()
                heartbeatReadyPromise = handshake
                // 快速路径：握手 500ms 内没完成则乐观返回，不阻塞后续请求
                return await heartbeatFastStarted(handshake)
            } catch (error) {
                console.error("启动心跳失败:", error)
            }
            return false
        },
        /**
         * 在心跳快速启动后执行请求；失败则等心跳完全就绪后重试一次。
         * @param task 请求函数（应为无副作用的读操作，可安全重试）
         * @returns 请求结果
         */
        async runWithHeartbeatRetry<T>(task: () => Promise<T>): Promise<T> {
            return retryAfterHeartbeatReady(heartbeatReadyPromise, task)
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
            if (apiCache && apiCacheKey === String(user.id)) {
                apiCache.kf_token = token
            }
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
