import { WebView } from "bun"

export type RenderFormat = "png" | "jpeg" | "webp"

export interface RenderClip {
    x: number
    y: number
    width: number
    height: number
    scale?: number
}

export interface RenderOptions {
    type?: RenderFormat
    quality?: number
    fullPage?: boolean
    omitBackground?: boolean
    clip?: RenderClip
    deviceScaleFactor?: number
    width?: number
    height?: number
    timeout?: number
}

export interface RendererConfig {
    backend?: "chrome" | "webkit"
    chromePath?: string
}

const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 600
const DEFAULT_TIMEOUT = 30000
const MAX_VIEWPORT = 16384
const DATA_URL_LIMIT = 8_000_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
    })
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer)
    })
}

function escapeKey(key: string): string {
    return key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export class HtmlToImageRenderer {
    private readonly backend?: "chrome" | "webkit"
    private readonly chromePath?: string
    private warmView: WebView | null = null

    constructor(config: RendererConfig = {}) {
        this.backend = config.backend
        this.chromePath = config.chromePath
    }

    private resolveBackend(): WebView.Backend | undefined {
        if (this.chromePath) {
            return { type: "chrome", path: this.chromePath }
        }
        return this.backend
    }

    private createView(width: number, height: number): WebView {
        return new WebView({
            width,
            height,
            backend: this.resolveBackend(),
        })
    }

    async init(): Promise<void> {
        if (this.warmView) {
            return
        }
        const view = this.createView(1, 1)
        await view.navigate("about:blank")
        this.warmView = view
    }

    async close(): Promise<void> {
        if (this.warmView) {
            this.warmView.close()
            this.warmView = null
        }
    }

    private async loadHtml(view: WebView, html: string, timeout: number): Promise<void> {
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
        if (dataUrl.length <= DATA_URL_LIMIT) {
            await withTimeout(view.navigate(dataUrl), timeout, "渲染 HTML 超时")
            return
        }
        const script = `(function(){document.open();document.write(${JSON.stringify(html)});document.close();return true})()`
        await withTimeout(view.evaluate(script), timeout, "写入 HTML 超时")
    }

    private async waitForAssets(view: WebView): Promise<void> {
        const script = `(function(){
            const pending = []
            if (document.fonts && document.fonts.ready) pending.push(document.fonts.ready)
            for (const img of Array.from(document.images)) {
                if (img.complete) continue
                pending.push(new Promise(resolve => {
                    img.addEventListener("load", resolve, { once: true })
                    img.addEventListener("error", resolve, { once: true })
                }))
            }
            if (document.readyState !== "complete") {
                pending.push(new Promise(resolve => window.addEventListener("load", resolve, { once: true })))
            }
            return Promise.all(pending).then(() => true)
        })()`
        await view.evaluate(script)
    }

    private async applyDeviceScaleFactor(view: WebView, width: number, height: number, scale: number): Promise<void> {
        try {
            await view.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false })
        } catch {}
    }

    private async waitForPaint(view: WebView): Promise<void> {
        await view.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))")
    }

    private async applyTransparentBackground(view: WebView): Promise<void> {
        try {
            await view.cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } })
        } catch {}
    }

    private async captureWithCdp(
        view: WebView,
        format: RenderFormat,
        quality: number | undefined,
        fullPage: boolean,
        clip: RenderClip | undefined
    ): Promise<Buffer | null> {
        try {
            const params: Record<string, unknown> = {
                format,
                fromSurface: true,
                captureBeyondViewport: fullPage || Boolean(clip),
            }
            if (format !== "png" && quality !== undefined) {
                params.quality = quality
            }
            if (clip) {
                params.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: clip.scale ?? 1 }
            }
            const result = await view.cdp<{ data: string }>("Page.captureScreenshot", params)
            return Buffer.from(result.data, "base64")
        } catch {
            return null
        }
    }

    private async captureFromViewport(
        view: WebView,
        format: RenderFormat,
        quality: number | undefined,
        fullPage: boolean
    ): Promise<Buffer> {
        if (fullPage) {
            const size = await view.evaluate<{ width: number; height: number }>(
                "(function(){return {width: Math.ceil(document.documentElement.scrollWidth), height: Math.ceil(document.documentElement.scrollHeight)}})()"
            )
            const width = Math.min(MAX_VIEWPORT, Math.max(1, size.width))
            const height = Math.min(MAX_VIEWPORT, Math.max(1, size.height))
            await view.resize(width, height)
            await this.waitForPaint(view)
        }
        return view.screenshot({ encoding: "buffer", format, quality })
    }

    async renderHtmlToImage(html: string, options: RenderOptions = {}): Promise<Buffer> {
        const width = options.width ?? DEFAULT_WIDTH
        const height = options.height ?? DEFAULT_HEIGHT
        const timeout = options.timeout ?? DEFAULT_TIMEOUT
        const format = options.type ?? "png"
        const fullPage = options.fullPage ?? true
        const view = this.createView(width, height)

        try {
            await withTimeout(view.navigate("about:blank"), timeout, "初始化渲染视图超时")
            await view.resize(width, height)
            if (options.deviceScaleFactor && options.deviceScaleFactor !== 1) {
                await this.applyDeviceScaleFactor(view, width, height, options.deviceScaleFactor)
            }
            await this.loadHtml(view, html, timeout)
            await this.waitForAssets(view)
            if (options.omitBackground) {
                await this.applyTransparentBackground(view)
            }
            const cdp = await this.captureWithCdp(view, format, options.quality, fullPage, options.clip)
            if (cdp) {
                return cdp
            }
            if (options.clip) {
                throw new Error("clip 截图需要 Chrome 后端（Bun.WebView 的 CDP 能力）")
            }
            return await this.captureFromViewport(view, format, options.quality, fullPage)
        } finally {
            view.close()
        }
    }

    async renderTemplateWithData(template: string, data: Record<string, unknown>, options?: RenderOptions): Promise<Buffer> {
        let html = template
        for (const [key, value] of Object.entries(data)) {
            html = html.replace(new RegExp(`{{${escapeKey(key)}}}`, "g"), () => String(value))
        }
        return this.renderHtmlToImage(html, options)
    }
}

let renderer: HtmlToImageRenderer | null = null

export const getRenderer = async (config?: RendererConfig): Promise<HtmlToImageRenderer> => {
    if (!renderer) {
        renderer = new HtmlToImageRenderer(config)
        await renderer.init()
    }
    return renderer
}
