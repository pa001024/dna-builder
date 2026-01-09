import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { applyMaterial, tauriFetch } from "../api/app"
import { db } from "./db"
import { DNAAPI } from "dna-api"
import i18next from "i18next"
import { env } from "../env"

export const useSettingStore = defineStore("setting", {
    state: () => {
        // const isDarkMode = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        return {
            theme: useLocalStorage("setting_theme", "dark"),
            uiScale: useLocalStorage("setting_ui_scale", 1),
            winMaterial: useLocalStorage("setting_win_material", "Unset"),
            windowTrasnparent: useLocalStorage("setting_window_trasnparent", true),
            lang: useLocalStorage("setting_lang", navigator.language),
            // AI大模型设置
            aiBaseUrl: useLocalStorage("ai_base_url", "https://open.bigmodel.cn/api/paas/v4/"),
            aiApiKey: useLocalStorage("ai_api_key", ""),
            aiModelName: useLocalStorage("ai_model_name", "glm-4.6v-flash"),
            aiMaxTokens: useLocalStorage("ai_max_tokens", 1024),
            aiTemperature: useLocalStorage("ai_temperature", 0.6),
            // 皎皎角
            dnaUserId: useLocalStorage("setting_user_id", 0),
            showAIChat: useLocalStorage("setting_show_ai_chat", false),
            // 身份验证
            jwtToken: useLocalStorage("jwt_token", ""),
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
            if (!user) return undefined
            const api = new DNAAPI({
                dev_code: user.dev_code,
                token: user.token,
                fetchFn: tauriFetch,
            })
            return api
        },
        async autoLoginDNA() {
            if (this.jwtToken) return { success: true }
            const user = await this.getCurrentUser()
            if (!user) return { success: false, error: "未登录 DNA" }

            try {
                const qrResponse = await fetch(`${env.endpoint}/api/auth/dna/qr`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dnaUid: user.uid }),
                })

                const qrResult = await qrResponse.json()
                if (!qrResult.success) {
                    return { success: false, error: qrResult.error || "获取验证码失败" }
                }

                const api = await this.getDNAAPI()
                if (!api) {
                    return { success: false, error: "DNA API 初始化失败" }
                }

                const imageResponse = await fetch(`${env.endpoint}${qrResult.imageUrl}`)
                const blob = await imageResponse.blob()
                const file = new File([blob], "verify.png", { type: "image/png" })

                const uploadRes = await api.uploadImage(file)
                if (!uploadRes.is_success || !uploadRes.data || uploadRes.data.length === 0) {
                    return { success: false, error: "上传验证码失败" }
                }

                const imageUrl = uploadRes.data[0]

                const verifyResponse = await fetch(`${env.endpoint}/api/auth/dna/verify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: qrResult.sessionId, imageUrl }),
                })

                const verifyResult = await verifyResponse.json()
                if (verifyResult.success) {
                    this.jwtToken = verifyResult.token
                    return { success: true }
                } else {
                    return { success: false, error: verifyResult.error || "验证失败" }
                }
            } catch (error) {
                console.error("DNA OAuth 登录失败:", error)
                return { success: false, error: "登录失败" }
            }
        },
    },
})
