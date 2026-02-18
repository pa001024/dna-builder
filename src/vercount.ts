import { env } from "./env"

const VERCOUT_ENDPOINT = "https://events.vercount.one/api/v2/log"
const VERCOUT_TIMEOUT_MS = 5000
const FIXED_REPORT_HOST = "dna-builder.cn"

export interface VisitorCountData {
    site_uv: number
    site_pv: number
    page_pv: number
}

interface VercountPayload {
    status?: "success" | "error"
    message?: string
    data?: VisitorCountData
}

/**
 * 判断对象是否为有效统计数据结构。
 * @param payload 待判断对象
 * @returns 是否为有效统计数据
 */
function isVisitorCountData(payload: unknown): payload is VisitorCountData {
    if (!payload || typeof payload !== "object") return false
    const data = payload as Record<string, unknown>
    return typeof data.site_uv === "number" && typeof data.site_pv === "number" && typeof data.page_pv === "number"
}

/**
 * 在桌面端 hash 路由下，将 `#/path?query` 转为 history 格式路径。
 * @param url 当前 URL 对象
 */
function convertAppHashToHistory(url: URL) {
    if (!env.isApp) return
    if (!url.hash.startsWith("#/")) return
    const hashPath = url.hash.slice(1)
    const parsedHashUrl = new URL(hashPath, "https://dna-builder.cn")
    url.pathname = parsedHashUrl.pathname
    url.search = parsedHashUrl.search
    url.hash = parsedHashUrl.hash
}

/**
 * 将当前地址转换为固定域名的统计地址，保留路径、查询和哈希。
 * @param href 原始地址
 * @returns 转换后的地址
 */
function buildFixedDomainHref(href: string = window.location.href): string | null {
    try {
        const url = new URL(href)
        convertAppHashToHistory(url)
        url.protocol = "https:"
        url.hostname = FIXED_REPORT_HOST
        url.port = ""
        return url.toString()
    } catch (error) {
        console.warn("Invalid href for visitor count:", error)
        return null
    }
}

/**
 * 规范化统计接口返回值。
 * @param payload 接口返回值
 * @returns 规范化后的统计数据
 */
function normalizeVercountPayload(payload: VercountPayload | null | undefined): VisitorCountData {
    if (payload?.status === "success" && payload.data) {
        return payload.data
    }
    if (payload?.status === "error") {
        console.warn("Vercount API error:", payload.message)
        return payload.data || { site_uv: 0, site_pv: 0, page_pv: 0 }
    }
    if (isVisitorCountData(payload)) {
        return payload
    }
    return { site_uv: 0, site_pv: 0, page_pv: 0 }
}

/**
 * 发送访问统计 POST 请求。
 * @param href 当前页面地址
 * @returns 统计结果
 */
export async function postVisitorCount(href: string = window.location.href): Promise<VisitorCountData | null> {
    const reportUrl = buildFixedDomainHref(href)
    if (!reportUrl) return null

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), VERCOUT_TIMEOUT_MS)
    try {
        const response = await fetch(VERCOUT_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: reportUrl }),
            signal: controller.signal,
        })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }
        const payload = (await response.json()) as VercountPayload
        console.debug(`${reportUrl} TPV: ${payload.data?.page_pv} PV:${payload.data?.site_pv} UV:${payload.data?.site_uv}`)
        return normalizeVercountPayload(payload)
    } catch (error) {
        const err = error as Error & { name?: string }
        if (err?.name === "AbortError") {
            console.warn("Vercount request timeout")
        } else {
            console.warn("Vercount request failed:", err?.message || err)
        }
        return null
    } finally {
        clearTimeout(timeoutId)
    }
}
