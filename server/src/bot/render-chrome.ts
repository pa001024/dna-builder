import { existsSync } from "node:fs"
import puppeteer, { type Browser, type ScreenshotOptions } from "puppeteer-core"
import { renderReactToString } from "./ssr"

export class HtmlToImageRenderer {
    private browser: Browser | null = null
    private chromePath?: string

    constructor(chromePath?: string) {
        // 尝试从环境变量或默认路径获取Chrome路径
        this.chromePath = chromePath || this.getDefaultChromePath()
    }

    /**
     * 获取默认Chrome路径
     */
    private getDefaultChromePath() {
        const platform = process.platform
        const commonPaths: Record<string, string[]> = {
            win32: [
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
            ],
            darwin: [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
            ],
            linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
        }

        for (const chromePath of commonPaths[platform] || []) {
            if (existsSync(chromePath)) {
                return chromePath
            }
        }

        // 返回空字符串，让puppeteer自己查找
        return undefined
    }

    /**
     * 初始化浏览器实例
     */
    async initBrowser(): Promise<void> {
        if (this.browser) {
            return
        }

        this.browser = await puppeteer.launch({
            executablePath: this.chromePath,
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
                "--single-process",
            ],
        })

        this.browser.on("disconnected", () => {
            console.warn("浏览器连接已断开")
            this.browser = null
        })
    }

    /**
     * 关闭浏览器实例
     */
    async closeBrowser(): Promise<void> {
        if (this.browser) {
            await this.browser.close()
            this.browser = null
        }
    }

    /**
     * 将HTML字符串转换为图片
     */
    async renderHtmlToImage(html: string, options?: ScreenshotOptions): Promise<Buffer> {
        if (!this.browser) {
            await this.initBrowser()
        }

        const page = await this.browser!.newPage()

        try {
            // 设置页面内容
            await page.setContent(html, {
                waitUntil: "networkidle0",
                timeout: 30000, // 30秒超时
            })

            // 等待页面完全加载
            await page.evaluate(() => {
                return new Promise(resolve => {
                    if (document.readyState === "complete") {
                        resolve(undefined)
                    } else {
                        window.addEventListener("load", () => resolve(undefined))
                    }
                })
            })

            // 截图选项设置
            const screenshotOpts = {
                type: options?.type || "png",
                ...(options?.quality !== undefined && { quality: options.quality }),
                fullPage: options?.fullPage !== undefined ? options.fullPage : true,
                omitBackground: options?.omitBackground || false,
                ...(options?.clip && { clip: options.clip }),
            }

            // 执行截图
            const imageBuffer = await page.screenshot(screenshotOpts)

            return imageBuffer as Buffer
        } finally {
            if (page && !page.isClosed()) {
                await page.close()
            }
        }
    }

    /**
     * 将HTML模板与数据结合后渲染为图片
     */
    async renderTemplateWithData(template: string, data: Record<string, any>, options?: ScreenshotOptions): Promise<Buffer> {
        // 使用简单的模板替换机制
        let html = template

        for (const [key, value] of Object.entries(data)) {
            const placeholder = new RegExp(`{{${key}}}`, "g")
            html = html.replace(placeholder, String(value))
        }

        return await this.renderHtmlToImage(html, options)
    }

    /**
     * 将React组件渲染为图片
     * @param data React组件渲染数据
     * @param options 截图选项
     * @param renderOptions 渲染选项
     * @returns 图片Buffer
     */
    async renderReactToImage(
        data: Record<string, any>,
        options?: ScreenshotOptions,
        renderOptions?: {
            /**
             * 布局名称
             */
            layout?: string
            /**
             * 页面名称
             */
            page?: string
            /**
             * 页面标题
             */
            title?: string
        }
    ): Promise<Buffer> {
        // 使用React SSR生成HTML
        const html = renderReactToString({
            data,
            layout: renderOptions?.layout,
            page: renderOptions?.page,
            title: renderOptions?.title,
        })

        // 渲染为图片
        return await this.renderHtmlToImage(html, options)
    }
}

let renderer: HtmlToImageRenderer

export const getRenderer = async () => {
    if (!renderer) {
        renderer = new HtmlToImageRenderer()
        await renderer.initBrowser()
    }
    return renderer
}
