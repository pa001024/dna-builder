import { createApp } from "vue"
import "./style.css"
import i18next from "i18next"
import I18NextVue from "i18next-vue"
import { createPinia } from "pinia"
import { applyLanguageFontClass, initI18n } from "./i18n"
import App from "./views/DNALogin.vue"

const loginLanguage = localStorage.getItem("setting_lang") || navigator.language
initI18n(loginLanguage)
applyLanguageFontClass(loginLanguage)

const app = createApp(App)
app.use(createPinia()).use(I18NextVue, { i18next }).mount("#app")
