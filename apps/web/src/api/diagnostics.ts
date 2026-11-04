import { invoke } from "@tauri-apps/api/core"

/** 显卡适配器信息（DXGI）。 */
export interface GpuInfo {
    name: string
    vendorId: number
    deviceId: number
    /** 专用显存（字节） */
    dedicatedVideoMemory: number
    /** 共享系统内存（字节） */
    sharedSystemMemory: number
    /** 用户态驱动版本，如 32.0.15.6094 */
    driverVersion: string | null
    /** 软件渲染适配器（Microsoft Basic Render Driver 等） */
    software: boolean
}

/** 显示器当前模式。 */
export interface DisplayInfo {
    adapterName: string
    width: number
    height: number
    refreshRateHz: number | null
    bitsPerPixel: number | null
    primary: boolean
}

/** 后端采集的完整运行环境快照。 */
export interface DiagnosticsInfo {
    appVersion: string
    /** 运行平台标识（windows / macos / linux） */
    platform: string
    osName: string
    osVersion: string
    osBuild: string
    /** 系统原生架构（x86_64 / arm64 / x86） */
    osArch: string
    /** 当前进程架构 */
    processArch: string
    locale: string | null
    elevated: boolean
    cpuBrand: string
    cpuVendor: string
    cpuPhysicalCores: number
    cpuLogicalCores: number
    /** 当前主频（MHz） */
    cpuFrequencyMhz: number
    totalMemory: number
    availableMemory: number
    gpus: GpuInfo[]
    /** DXGI 枚举失败原因；失败时 gpus 为空，不能据此判断「无硬件显卡」 */
    gpusError: string | null
    displays: DisplayInfo[]
    webview2Version: string | null
    webview2Error: string | null
}

/** 建议更新的最低 WebView2 主版本：更低属于 2022 年 4 月前的运行时，Chromium 内核明显落后。 */
export const MIN_WEBVIEW2_MAJOR = 100

/** Windows 10 2004（build 19041）是当前仍受支持的下限。 */
const MIN_WINDOWS_BUILD = 19041

/** 低于该物理内存时提示（字节）。 */
const LOW_MEMORY_BYTES = 8 * 1024 ** 3

export type DiagnosticsWarningCode = "webview2-missing" | "webview2-outdated" | "no-hardware-gpu" | "low-memory" | "old-os-build"

export interface DiagnosticsWarning {
    code: DiagnosticsWarningCode
    level: "error" | "warning" | "info"
    /** webview2-outdated 时为当前版本 */
    version?: string
    /** webview2-outdated 时为建议的最低版本 */
    minVersion?: string
    /** old-os-build 时为当前 build 号 */
    build?: number
}

/** 采集运行环境信息。 */
export async function getDiagnostics(): Promise<DiagnosticsInfo> {
    return await invoke<DiagnosticsInfo>("get_diagnostics")
}

/**
 * 下载并静默安装微软官方 WebView2 引导安装器。
 * @returns 安装后检测到的运行时版本（安装完成但未检测到时为 null）
 */
export async function installWebView2(): Promise<string | null> {
    return await invoke<string | null>("install_webview2")
}

/** 取版本号首段，无法解析时返回 null。 */
export function webview2Major(version: string | null): number | null {
    if (!version) {
        return null
    }
    const major = Number.parseInt(version.split(".")[0] ?? "", 10)
    return Number.isFinite(major) ? major : null
}

/**
 * 按内存量给出便于阅读的容量文本。
 * @param bytes 字节数
 * @param fractionDigits 保留小数位（GB 口径）
 */
export function formatBytes(bytes: number, fractionDigits = 1): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 MB"
    }
    const gib = bytes / 1024 ** 3
    if (gib >= 1) {
        return `${gib.toFixed(fractionDigits)} GB`
    }
    return `${Math.round(bytes / 1024 ** 2)} MB`
}

/** 显示器当前模式文本，如 `1920×1080 · 60Hz · 32bpp`。 */
export function formatDisplayMode(display: DisplayInfo): string {
    const parts: string[] = []
    if (display.width > 0 && display.height > 0) {
        parts.push(`${display.width}×${display.height}`)
    }
    if (display.refreshRateHz) {
        parts.push(`${display.refreshRateHz}Hz`)
    }
    if (display.bitsPerPixel) {
        parts.push(`${display.bitsPerPixel}bpp`)
    }
    return parts.join(" · ")
}

/** 显卡厂商 / 设备 ID 文本，如 `0x10DE / 0x1D12`。 */
export function formatGpuId(gpu: GpuInfo): string {
    const hex = (value: number) => `0x${value.toString(16).toUpperCase()}`
    return `${hex(gpu.vendorId)} / ${hex(gpu.deviceId)}`
}

/**
 * 由原始信息推导卡顿相关建议，顺序固定（越靠前越值得先处理）。
 * @param info 诊断快照
 */
export function buildDiagnosticsWarnings(info: DiagnosticsInfo): DiagnosticsWarning[] {
    const warnings: DiagnosticsWarning[] = []

    if (!info.webview2Version) {
        warnings.push({ code: "webview2-missing", level: "error" })
    } else {
        const major = webview2Major(info.webview2Version)
        if (major !== null && major < MIN_WEBVIEW2_MAJOR) {
            warnings.push({
                code: "webview2-outdated",
                level: "warning",
                version: info.webview2Version,
                minVersion: `${MIN_WEBVIEW2_MAJOR}.0.0.0`,
            })
        }
    }

    // 显卡与系统 build 的判定只在 Windows 上成立：其它平台的 gpus 恒为空、kernel 版本不是 build 号
    const isWindows = info.platform === "windows"
    if (isWindows && !info.gpusError && !info.gpus.some(gpu => !gpu.software)) {
        warnings.push({ code: "no-hardware-gpu", level: "warning" })
    }

    if (info.totalMemory > 0 && info.totalMemory < LOW_MEMORY_BYTES) {
        warnings.push({ code: "low-memory", level: "info" })
    }

    const build = Number.parseInt(info.osBuild, 10)
    if (isWindows && Number.isFinite(build) && build > 0 && build < MIN_WINDOWS_BUILD) {
        warnings.push({ code: "old-os-build", level: "info", build })
    }

    return warnings
}
