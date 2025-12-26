import { createApp } from "vue"
import "./style.css"
// @ts-ignore
import { registerSW } from "virtual:pwa-register"
import i18next from "i18next"
import I18NextVue from "i18next-vue"
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
const app = createApp(App)
app.use(createPinia())
    .use(I18NextVue, { i18next })
    .use(router)
    .directive("h-resize-for", (el, { value: { el: target, min, max } }) => {
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
