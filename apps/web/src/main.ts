import { createApp, type VNode } from "vue"
import "./style.css"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { initRangeProgress } from "dob-ui/runtime/range"
import i18next from "i18next"
import I18NextVue from "i18next-vue"
import { getCurrentVersionLimit, setCurrentVersionLimit } from "@/data/versionGate"
import { dataPackBootstrapLoading, isDataPackRewriteDisabled } from "@/utils/data-pack/data-pack-bridge"
import packageJson from "../package.json"
import { env } from "./env"
import { applyLanguageFontClass, initI18n } from "./i18n"
import "@globalhive/vuejs-tour/dist/style.css"
import { createPinia } from "pinia"
import type { Router } from "vue-router"
import { probeCdnSpeed } from "./utils/cdn"
import { SCREEN_BAR_WINDOW_LABEL } from "./utils/screen-bar"

let appRouter: Router | null = null

/** 当前窗口是否为屏幕信息条(顶部通用浮窗)：它不需要数据包与图片缓存。 */
const isScreenBarWindow = env.isApp && getCurrentWindow().label === SCREEN_BAR_WINDOW_LABEL

/**
 * 注册 App 端图片服务工作线程（启动时注册，用于 /imgs 缓存）。
 */
async function registerImgsServiceWorker(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
        return
    }

    const registration = await navigator.serviceWorker.register(new URL("/sw-app.js", window.location.origin).toString(), {
        scope: "/",
        updateViaCache: "none",
    })

    const worker = registration.installing || registration.waiting
    if (worker && worker.state !== "activated") {
        await new Promise<void>((resolve, reject) => {
            worker.addEventListener("statechange", () => {
                if (worker.state === "activated") {
                    resolve()
                } else if (worker.state === "redundant") {
                    reject(new Error("图片 Service Worker 激活失败"))
                }
            })
        })
    }

    await navigator.serviceWorker.ready
}

/**
 * 初始化数据包、图片缓存与 App 图片 Service Worker。
 *
 * 重写插件关闭时数据直读源码，不碰数据包存储。
 */
async function bootstrapRuntimeAssets(): Promise<void> {
    // 数据包运行时与游戏文案表都很大（dev 下含完整源数据），动态导入让应用外壳先上屏
    let runtime: typeof import("@/utils/data-pack/data-pack-runtime") | null = null
    try {
        const [runtimeModule, translations] = await Promise.all([
            import("@/utils/data-pack/data-pack-runtime"),
            import("@/utils/data-pack/translations-pack"),
        ])
        runtime = runtimeModule
        // 文案注入不阻塞数据包初始化；数据包换入后 translations-pack 会自行重注
        void translations.applyAllPackTranslations()
        if (!isDataPackRewriteDisabled()) {
            await runtime.bootstrapDataPack()
        }
    } catch (error) {
        console.error("数据包初始化失败", error)
    } finally {
        dataPackBootstrapLoading.value = false
    }

    if (env.isApp && runtime) {
        try {
            const { mountImgsToVirtualPath } = await import("@/utils/data-pack/imgs-runtime")
            const cacheInfo = runtime.getLoadedDataPackImgsCacheInfo()
            await mountImgsToVirtualPath({
                manifest: runtime.getLoadedDataPackImgsManifest(),
                installedVersion: cacheInfo?.installedVersion,
                manifestHash: cacheInfo?.manifestHash,
            })
            await registerImgsServiceWorker()
        } catch (error) {
            console.error("图片资源初始化失败", error)
        }
    }
}

void initI18n(localStorage.getItem("setting_lang") || navigator.language)
setCurrentVersionLimit(getCurrentVersionLimit())

/**
 * 启动主应用。
 */
async function bootstrap() {
    // HMR 会在同页上下文里重执行入口模块（如启动时文件有改动）：#app 已有实例时跳过，
    // 否则重复 mount 会把旧树卸成坏 DOM（nextSibling of null）直接黑屏。
    const host =
        typeof document !== "undefined" ? (document.querySelector("#app") as (HTMLElement & { __vue_app__?: unknown }) | null) : null
    if (host?.__vue_app__) {
        return
    }
    if (env.isApp) {
        document.documentElement.classList.add("is-app-font")
    }
    // 信息条窗口宽度随内容变化,不能套用"窄窗口整机降一档"的根字号规则(见 style.css 的 :root 媒体查询)
    if (isScreenBarWindow) {
        document.documentElement.classList.add("is-screen-bar")
    }
    applyLanguageFontClass(localStorage.getItem("setting_lang") || navigator.language)

    const [{ default: App }, { router }] = await Promise.all([import("./App.vue"), import("./router")])
    appRouter = router
    ;(window as unknown as { __dna_router?: Router }).__dna_router = router
    const app = createApp(App)
    app.use(createPinia()).use(I18NextVue, { i18next }).use(router)

    if (import.meta.env.PROD) {
        // Sentry 体积较大，放到应用挂载后再加载，不阻塞首屏
        void import("@sentry/vue")
            .then(Sentry => {
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
            })
            .catch(error => console.error("Sentry 初始化失败", error))
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
    // dob-ui：滑杆进度由运行时把 value 同步到 --range-progress（纯 CSS 无法读取 value）
    initRangeProgress()

    // CDN 选源测速：尽早发起并与数据包初始化并行，让后续所有资源请求都走实测更快的一端。
    // 不 await：测速完成前资源按主源取，避免为了测速把首屏拖住。
    const cdnProbe = probeCdnSpeed().catch(error => {
        console.error("CDN 测速失败，按主源使用", error)
    })

    if (isScreenBarWindow) {
        // 信息条只读 localStorage 里的配置与密函数据，跳过数据包/图片缓存/外壳预热，
        // 否则窗口要等最重的那段启动开销才能上屏。
        dataPackBootstrapLoading.value = false
        return
    }
    const loadRuntimeAssets = () => {
        // 最多等测速 800ms；超时后按主源继续，避免慢测速拖住数据包加载
        const probeTimeout = new Promise<void>(resolve => window.setTimeout(resolve, 800))
        void Promise.race([cdnProbe, probeTimeout]).then(() => bootstrapRuntimeAssets())
    }
    // 先让应用外壳完成首帧，再把重型数据加载放到下一轮事件循环
    window.setTimeout(loadRuntimeAssets, 250)

    const prefetchDatabaseShell = () => {
        void import("./views/DBViewShell.vue").catch(error => {
            console.error("资料库外壳预热失败", error)
        })
    }

    if (typeof requestIdleCallback === "function") {
        requestIdleCallback(prefetchDatabaseShell, { timeout: 3000 })
    } else {
        window.setTimeout(prefetchDatabaseShell, 1000)
    }

    // 仅在非应用环境下注册 Service Worker
    if (!env.isApp) {
        void import("virtual:pwa-register")
            .then(({ registerSW }) => {
                registerSW({
                    immediate: true,
                })
            })
            .catch(error => {
                console.error("PWA 注册失败", error)
            })
    }
}

export function renderVueNode(vnode: VNode, container: HTMLElement) {
    // HMR 重执行后本模块的 appRouter 会回到 null，用全局兜底的已就绪路由，保证 G6 节点仍可渲染。
    const router = appRouter ?? (window as unknown as { __dna_router?: Router }).__dna_router ?? null
    if (!router) {
        throw new Error("路由尚未初始化")
    }

    const appInstance = createApp(vnode)
    appInstance.use(createPinia()).use(I18NextVue, { i18next }).use(router)
    appInstance.mount(container)
    return appInstance
}

void bootstrap()
