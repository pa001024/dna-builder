import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { applyMaterial } from "../api/app"

export const useSettingStore = defineStore("setting", {
    state: () => {
        return {
            theme: useLocalStorage("setting_theme", "light"),
            uiScale: useLocalStorage("setting_ui_scale", 1),
            winMaterial: useLocalStorage("setting_win_material", "Unset"),
            windowTrasnparent: useLocalStorage("setting_window_trasnparent", true),
            // AI大模型设置
            aiBaseUrl: useLocalStorage("ai_base_url", "https://open.bigmodel.cn/api/paas/v4/"),
            aiApiKey: useLocalStorage("ai_api_key", ""),
            aiModelName: useLocalStorage("ai_model_name", "glm-4.6v-flash"),
            aiMaxTokens: useLocalStorage("ai_max_tokens", 1024),
            aiTemperature: useLocalStorage("ai_temperature", 0.6),
        }
    },
    getters: {},
    actions: {
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
    },
})
