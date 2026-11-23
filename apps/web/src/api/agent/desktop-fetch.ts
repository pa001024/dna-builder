/**
 * 桌面端 Agent 上游的 HTTP 通道。
 *
 * WebView 的浏览器 fetch 会被 CORS 挡住（本机 magpie / Ollama 等网关尤其常见），
 * 桌面端统一改用 Tauri HTTP 插件：请求由 Rust 发出，支持流式响应与 AbortSignal。
 * 插件需要在 `src-tauri/capabilities/default.json` 的 `http:default` 里放行目标 URL。
 */

import { fetch as tauriHttpFetch } from "@tauri-apps/plugin-http"
import { env } from "@/env"

/**
 * @description 解析当前环境应使用的 fetch 实现。
 * @returns 桌面端返回 Tauri HTTP 插件的 fetch；网页端返回 undefined，由调用方回落到全局 fetch
 */
export function resolveAgentFetch(): typeof fetch | undefined {
    if (!env.isApp) {
        return undefined
    }

    return tauriHttpFetch as unknown as typeof fetch
}
