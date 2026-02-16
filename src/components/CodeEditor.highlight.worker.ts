interface HighlightRequestMessage {
    id: number
    code: string
}

interface HighlightResponseMessage {
    id: number
    html?: string
    error?: string
}

let prismModule: Promise<typeof import("prismjs")["default"]> | null = null

/**
 * 懒加载 Prism 并禁用其默认 Worker 消息处理器
 * @returns Prism 实例
 */
async function getPrism() {
    if (!prismModule) {
        const globalScope = self as typeof self & {
            Prism?: {
                manual?: boolean
                disableWorkerMessageHandler?: boolean
            }
        }
        globalScope.Prism = {
            manual: true,
            disableWorkerMessageHandler: true,
        }
        prismModule = import("prismjs").then(module => module.default)
    }

    return prismModule
}

/**
 * 处理主线程发来的高亮请求
 */
self.onmessage = async (event: MessageEvent<HighlightRequestMessage>) => {
    const { id, code } = event.data

    try {
        const Prism = await getPrism()
        const html = Prism.highlight(code, Prism.languages.javascript, "javascript")
        const response: HighlightResponseMessage = { id, html }
        self.postMessage(response)
    } catch (error) {
        const response: HighlightResponseMessage = {
            id,
            error: error instanceof Error ? error.message : String(error),
        }
        self.postMessage(response)
    }
}
