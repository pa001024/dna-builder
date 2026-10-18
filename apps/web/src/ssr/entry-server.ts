import fs from "node:fs"
import path from "node:path"
import i18next from "i18next"
import I18NextVue from "i18next-vue"
import { createPinia } from "pinia"
import { createSSRApp } from "vue"
import { renderToString } from "vue/server-renderer"
import { createMemoryHistory, createRouter } from "vue-router"
import App from "@/App.vue"
import { routes } from "@/router"

/**
 * SSG 预渲染入口：在 Node 侧渲染指定路由的组件树，产出静态 HTML。
 *
 * 只服务于构建期（tools/ssg.mjs 通过 Vite 的 ssrLoadModule 加载本模块）。
 * 客户端不做 hydration —— 预渲染的标记只是给爬虫与首屏看的，主应用启动时会照常
 * 挂载并整体替换 #app 的内容，因此这里不需要与客户端产物逐字节一致。
 */

/** 预渲染选项 */
export interface SsrRenderOptions {
    /** 渲染语言，默认 zh-CN（站点默认语言，也是 search engine 抓取到的版本） */
    language?: string
    /** 站点根目录，用于读取 public/i18n 下的文案；默认 process.cwd() */
    rootDir?: string
}

/** i18n 是否已初始化（同一进程内渲染多个路由时只初始化一次） */
let i18nReady = false

/**
 * 用本地语言包同步初始化 i18next。
 *
 * 客户端走的是 i18next-http-backend（浏览器里 fetch /i18n/xx/translation.json），
 * 预渲染时直接读磁盘，避免依赖网络且保证渲染结果里就是真实文案。
 * @param options 预渲染选项
 */
export function initSsrI18n(options: SsrRenderOptions = {}): void {
    if (i18nReady) {
        return
    }

    const rootDir = options.rootDir ?? process.cwd()
    const language = options.language ?? "zh-CN"
    const translationPath = path.join(rootDir, "public", "i18n", language, "translation.json")
    const resources: Record<string, { translation: Record<string, unknown> }> = {}

    try {
        resources[language] = { translation: JSON.parse(fs.readFileSync(translationPath, "utf8")) }
    } catch (error) {
        console.warn(`[ssg] 读取语言包失败，将回退为键名显示：${translationPath}`, error)
    }

    void i18next.init({
        lng: language,
        fallbackLng: "zh-CN",
        supportedLngs: [language, "zh-CN"],
        resources,
        interpolation: { escapeValue: false },
        showSupportNotice: false,
        initImmediate: false,
    })

    i18nReady = true
}

/**
 * 渲染单个路由为 HTML 片段。
 * @param url 路由地址（如 "/download"）
 * @param options 预渲染选项
 * @returns 应用渲染出的 HTML
 */
export async function renderRoute(url: string, options: SsrRenderOptions = {}): Promise<string> {
    initSsrI18n(options)

    const app = createSSRApp(App)
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [...routes],
    })

    await router.push(url)
    await router.isReady()

    app.use(createPinia()).use(I18NextVue, { i18next }).use(router)
    // 主应用注册的窗口尺寸指令在预渲染时无需生效，占位即可（否则会产生解析警告）
    app.directive("h-resize-for", { getSSRProps: () => ({}) })

    return await renderToString(app)
}
