import { env } from "@/env"
import { buildCdnUrl, fetchWithCdnFallback } from "@/utils/cdn"

/** Android 安装包发布清单（由 tools/app-upload.ts 上传到 CDN，主源失败时读兜底源） */
export const APK_MANIFEST_URL = buildCdnUrl("apk/latest.json")

/** 桌面端（Windows）安装包下载入口：服务端 302 到最新的 MSI */
export const DESKTOP_DOWNLOAD_URL = `${env.endpoint}/api/download`

/** 下载页自身地址：二维码固定指向生产域名，本地预览时扫码也能落到线上页面 */
export const DOWNLOAD_PAGE_URL = `${env.endpoint}/download`

/** 自动下载的倒计时秒数 */
export const AUTO_DOWNLOAD_SECONDS = 3

/** 访问端类型 */
export type ClientPlatform = "desktop" | "android" | "ios" | "mobile"

/** APK 发布信息 */
export interface ApkReleaseInfo {
    /** 版本号 */
    version: string
    /** 文件名 */
    fileName: string
    /** 下载地址 */
    url: string
    /** 字节数 */
    size: number
    /** sha256 */
    sha256: string
    /** 发布时间（ISO 8601） */
    builtAt: string
    /** 更新说明 */
    notes?: string
}

/**
 * 读取当前访问端类型。
 * iPadOS 13 起 Safari 会把自己伪装成 macOS，需要靠触摸点数区分。
 * @param userAgent 浏览器 UA
 * @param maxTouchPoints 触摸点数
 * @returns 端类型
 */
export function detectClientPlatform(userAgent: string, maxTouchPoints = 0): ClientPlatform {
    const ua = userAgent.toLowerCase()
    if (/iphone|ipad|ipod/.test(ua)) {
        return "ios"
    }
    if (/macintosh/.test(ua) && maxTouchPoints > 1) {
        return "ios"
    }
    if (/android|harmony|windows phone/.test(ua)) {
        return "android"
    }
    if (/mobile|mobi/.test(ua)) {
        return "mobile"
    }
    return "desktop"
}

/**
 * 判断是否在微信内置浏览器中打开。
 * 微信内置浏览器不允许直接下载 APK，需要引导用户改用系统浏览器。
 * @param userAgent 浏览器 UA
 * @returns 是否微信内置浏览器
 */
export function isWeChatBrowser(userAgent: string): boolean {
    return /micromessenger/i.test(userAgent)
}

/**
 * 判断该端是否可以直接安装 APK。
 * @param platform 端类型
 * @returns 是否可安装
 */
export function canInstallApk(platform: ClientPlatform): boolean {
    return platform === "android" || platform === "mobile"
}

/**
 * 格式化文件体积。
 * @param bytes 字节数
 * @returns 形如 "86.4 MB"
 */
export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "-"
    }
    if (bytes < 1024) {
        return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 格式化发布时间为本地日期。
 * @param iso ISO 8601 时间
 * @returns 形如 "2026-09-27"
 */
export function formatReleaseDate(iso: string): string {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) {
        return "-"
    }
    const pad = (value: number) => String(value).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 校验并归一化发布清单内容。
 * @param payload 清单原始内容
 * @returns 发布信息
 * @throws 字段缺失时抛错
 */
function normalizeRelease(payload: unknown): ApkReleaseInfo {
    if (typeof payload !== "object" || payload === null) {
        throw new Error("安装包清单格式不正确")
    }

    const record = payload as Record<string, unknown>
    const version = typeof record.version === "string" ? record.version : ""
    const url = typeof record.url === "string" ? record.url : ""
    if (!version || !url) {
        throw new Error("安装包清单缺少版本号或下载地址")
    }

    return {
        version,
        url,
        fileName: typeof record.fileName === "string" ? record.fileName : `v${version}.apk`,
        size: typeof record.size === "number" ? record.size : 0,
        sha256: typeof record.sha256 === "string" ? record.sha256 : "",
        builtAt: typeof record.builtAt === "string" ? record.builtAt : "",
        notes: typeof record.notes === "string" ? record.notes : undefined,
    }
}

/**
 * 拉取最新的 Android 安装包信息。
 * @param options.timeoutMs 超时时间（毫秒）
 * @returns 发布信息
 * @throws 网络异常、超时或清单非法时抛错
 */
export async function fetchApkRelease(options: { timeoutMs?: number } = {}): Promise<ApkReleaseInfo> {
    const timeoutMs = options.timeoutMs ?? 10000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        // 主源失败（网络异常或非 2xx）时自动读兜底源
        const response = await fetchWithCdnFallback("apk/latest.json", { signal: controller.signal, cache: "no-cache" })
        if (!response.ok) {
            throw new Error(`安装包清单请求失败：HTTP ${response.status}`)
        }
        return normalizeRelease(await response.json())
    } finally {
        clearTimeout(timer)
    }
}

/**
 * 触发浏览器下载。
 * 跨域地址上的 `download` 属性会被忽略，这里用一次隐藏链接点击交给浏览器自行处理。
 * @param url 下载地址
 */
export function triggerApkDownload(url: string): void {
    if (typeof document === "undefined" || !url) {
        return
    }

    const anchor = document.createElement("a")
    anchor.href = url
    anchor.rel = "noopener"
    anchor.target = "_self"
    anchor.style.display = "none"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
}
