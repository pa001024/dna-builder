import { useLocalStorage } from "@vueuse/core"
import { DNAAPI } from "dna-api"
import i18next from "i18next"
import { defineStore } from "pinia"
import { sleep } from "@/util"
import { applyMaterial, startHeartbeat, stopHeartbeat, tauriFetch } from "../api/app"
import { executeSignFlow } from "../api/dna-sign"
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
            nextSignCheckTime: useLocalStorage("setting_next_sign_check_time", 0),
        }
    },
    getters: {},
    actions: {
        setLang(lang: string) {
            this.lang = lang
            i18next.changeLanguage(lang)
        },
        setTheme(theme: string) {
            this.theme = theme
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
                    this.dnaUserUID = user.uid
                    const api = new DNAAPI({
                        dev_code: user.dev_code,
                        token: user.token,
                        kf_token: user.kf_token,
                        debug: import.meta.env.DEV,
                        mode: "android",
                        server: user.server || "cn",
                        fetchFn: tauriFetch,
                    })
                    const res = await api.loginLog()
                    if (res.msg.includes("失效")) {
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
                if (user.server !== "global") return true
            }
            try {
                // 调用Rust实现的心跳功能
                const res = await startHeartbeat("wss://dnabbs-api.yingxiong.com:8180/ws-community-websocket", token, userId)
                await sleep(1000) // 等待1秒，确保API有值
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
                if (user.server !== "global") return true
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
