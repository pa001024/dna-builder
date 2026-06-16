import { createApp, type VNode } from "vue"
import "./style.css"
import { registerSW } from "virtual:pwa-register"
import * as Sentry from "@sentry/vue"
import i18next from "i18next"
import I18NextVue from "i18next-vue"
import packageJson from "../package.json"
import { dataPackBootstrapLoading } from "./data/data-pack-bridge"
import { bootstrapDataPack } from "./data/data-pack-runtime"
import { DNA_SAFE_VERSION_LIMIT, setCurrentVersionLimit } from "./data/versionGate"

import { env } from "./env"
import { applyLanguageFontClass, initI18n } from "./i18n"
import { router } from "./router"
import "@globalhive/vuejs-tour/dist/style.css"
import { createPinia } from "pinia"

initI18n(localStorage.getItem("setting_lang") || navigator.language)
setCurrentVersionLimit(localStorage.getItem("setting_safe_mode") === "false" ? Number.POSITIVE_INFINITY : DNA_SAFE_VERSION_LIMIT)

/**
 * 启动主应用。
 */
async function bootstrap() {
    if (env.isApp) {
        document.documentElement.classList.add("is-app-font")
    }
    applyLanguageFontClass(localStorage.getItem("setting_lang") || navigator.language)

    const [{ default: App }, { router }] = await Promise.all([import("./App.vue"), import("./router")])
    const app = createApp(App)
    app.use(createPinia()).use(I18NextVue, { i18next }).use(router)

    if (import.meta.env.PROD) {
        Sentry.init({
            app,
            dsn: "https://797cb2155c06501ec466bc020bcfb2ca@o4510704299868160.ingest.us.sentry.io/4510704307470336",
            environment: import.meta.env.MODE || "production",
            release: packageJson.version,
            integrations: [Sentry.browserTracingIntegration({ router }), Sentry.replayIntegration()],
            tracesSampleRate: 0.1,
            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1.0,
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

    dataPackBootstrapLoading.value = true
    app.mount("#app")
    requestAnimationFrame(() => {
        void bootstrapDataPack().finally(() => {
            dataPackBootstrapLoading.value = false
        })
    })
}

export function renderVueNode(vnode: VNode, container: HTMLElement) {
    const appInstance = createApp(vnode)
    appInstance.use(createPinia()).use(I18NextVue, { i18next }).use(router)
    appInstance.mount(container)
    return appInstance
}

if (!env.isApp) {
    registerSW({
        immediate: true,
    })
}

void bootstrap()
