import { createApp } from "vue"
import "./style.css"
import { registerSW } from "virtual:pwa-register"
import i18next from "i18next"
import I18NextVue from "i18next-vue"
import packageJson from "../package.json"
// prevent rightclicks
// window.addEventListener(
//   "contextmenu",
//   (e) => {
//     const ele = e.target as HTMLElement;
//     if (ele.nodeName !== "INPUT" && ele.nodeName !== "TEXTAREA") {
//       e.preventDefault();
//       return false;
//     }
//   },
//   false
// );

initI18n(localStorage.getItem("setting_lang") || navigator.language)

import App from "./App.vue"
import { initI18n } from "./i18n"
import { createPinia } from "pinia"
import { router } from "./router"
import { env } from "./env"
import "@globalhive/vuejs-tour/dist/style.css"
const app = createApp(App)
app.use(createPinia()).use(I18NextVue, { i18next }).use(router)

// Sentry 初始化 - 必须在 app.use 之后
import * as Sentry from "@sentry/vue"
if (import.meta.env.PROD) {
    Sentry.init({
        app,
        dsn: "https://797cb2155c06501ec466bc020bcfb2ca@o4510704299868160.ingest.us.sentry.io/4510704307470336",
        environment: import.meta.env.MODE || "production",
        release: packageJson.version,
        integrations: [Sentry.browserTracingIntegration({ router }), Sentry.replayIntegration()],
        tracesSampleRate: 0.1, // 生产环境 10% 的性能采样率
        replaysSessionSampleRate: 0.1, // 10% 的会话录制
        replaysOnErrorSampleRate: 1.0, // 错误时 100% 录制
    })
}

app.directive("h-resize-for", (el, { value: { el: target, min, max } }) => {
    const onPointerDown = (e: PointerEvent) => {
        const rect = target.getBoundingClientRect()
        const y = e.clientY
        const h = rect.height
        el.setPointerCapture(e.pointerId)
        const drag = (e: MouseEvent) => {
            const dy = y - e.clientY
            target.style.height = `${Math.max(min, Math.min(max, h + dy))}px`
        }
        const stopDrag = () => {
            el.releasePointerCapture(e.pointerId)
            el.removeEventListener("pointermove", drag)
        }
        el.addEventListener("pointermove", drag)
        el.addEventListener("pointerup", stopDrag)
    }

    el.onpointerdown = onPointerDown
})
app.mount("#app")

// 仅在非应用环境下注册 Service Worker
if (!env.isApp) {
    // Register Service Worker for offline support
    registerSW({
        immediate: true,
    })
}
