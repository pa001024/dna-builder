import { createApp } from "vue"
import "./style.css"
import i18next from "i18next"
import I18NextVue from "i18next-vue"
import App from "./views/DNALogin.vue"
import { createPinia } from "pinia"
import { initI18n } from "./i18n"

initI18n(navigator.language)

const app = createApp(App)
app.use(createPinia()).use(I18NextVue, { i18next }).mount("#app")
