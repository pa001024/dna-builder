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
    },
})
