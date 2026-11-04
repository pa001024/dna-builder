import { describe, expect, it } from "vitest"
import type { DiagnosticsInfo } from "@/api/diagnostics"
import { buildDiagnosticsWarnings, formatBytes, formatDisplayMode, formatGpuId, webview2Major } from "@/api/diagnostics"

/**
 * @description 造一个健康环境的诊断快照，测试再按需覆盖单个字段。
 * @param patch 需要覆盖的字段
 * @returns 诊断快照
 */
function createInfo(patch: Partial<DiagnosticsInfo> = {}): DiagnosticsInfo {
    return {
        appVersion: "1.0.0",
        platform: "windows",
        osName: "Windows 11 Pro",
        osVersion: "11",
        osBuild: "22631",
        osArch: "x86_64",
        processArch: "x86_64",
        locale: "zh-CN",
        elevated: false,
        cpuBrand: "AMD Ryzen 7 5800X",
        cpuVendor: "AuthenticAMD",
        cpuPhysicalCores: 8,
        cpuLogicalCores: 16,
        cpuFrequencyMhz: 3800,
        totalMemory: 32 * 1024 ** 3,
        availableMemory: 16 * 1024 ** 3,
        gpus: [
            {
                name: "NVIDIA GeForce RTX 3070",
                vendorId: 0x10de,
                deviceId: 0x2484,
                dedicatedVideoMemory: 8 * 1024 ** 3,
                sharedSystemMemory: 16 * 1024 ** 3,
                driverVersion: "32.0.15.6094",
                software: false,
            },
        ],
        gpusError: null,
        displays: [
            { adapterName: "NVIDIA GeForce RTX 3070", width: 2560, height: 1440, refreshRateHz: 165, bitsPerPixel: 32, primary: true },
        ],
        webview2Version: "138.0.3351.121",
        webview2Error: null,
        ...patch,
    }
}

describe("webview2Major", () => {
    it("取版本号首段", () => {
        expect(webview2Major("138.0.3351.121")).toBe(138)
        expect(webview2Major("100.0.0.0")).toBe(100)
    })

    it("缺失或无法解析时返回 null", () => {
        expect(webview2Major(null)).toBeNull()
        expect(webview2Major("")).toBeNull()
        expect(webview2Major("unknown")).toBeNull()
    })
})

describe("formatBytes", () => {
    it("按 GB / MB 换算", () => {
        expect(formatBytes(32 * 1024 ** 3)).toBe("32.0 GB")
        expect(formatBytes(512 * 1024 ** 2)).toBe("512 MB")
    })

    it("非正数回退为 0 MB", () => {
        expect(formatBytes(0)).toBe("0 MB")
        expect(formatBytes(Number.NaN)).toBe("0 MB")
    })
})

describe("formatDisplayMode / formatGpuId", () => {
    it("拼接分辨率、刷新率与色深", () => {
        const display = {
            adapterName: "GPU",
            width: 1920,
            height: 1080,
            refreshRateHz: 60,
            bitsPerPixel: 32,
            primary: false,
        }
        expect(formatDisplayMode(display)).toBe("1920×1080 · 60Hz · 32bpp")
    })

    it("刷新率缺失时不输出该段", () => {
        const display = { adapterName: "GPU", width: 1920, height: 1080, refreshRateHz: null, bitsPerPixel: null, primary: false }
        expect(formatDisplayMode(display)).toBe("1920×1080")
    })

    it("显卡 ID 输出大写十六进制", () => {
        const gpu = {
            name: "GPU",
            vendorId: 0x10de,
            deviceId: 0x2484,
            dedicatedVideoMemory: 0,
            sharedSystemMemory: 0,
            driverVersion: null,
            software: false,
        }
        expect(formatGpuId(gpu)).toBe("0x10DE / 0x2484")
    })
})

describe("buildDiagnosticsWarnings", () => {
    it("健康环境不产生提示", () => {
        expect(buildDiagnosticsWarnings(createInfo())).toEqual([])
    })

    it("缺少 WebView2 视为错误", () => {
        const warnings = buildDiagnosticsWarnings(createInfo({ webview2Version: null, webview2Error: "not found" }))
        expect(warnings).toContainEqual({ code: "webview2-missing", level: "error" })
    })

    it("WebView2 主版本过低给出更新提示", () => {
        const warnings = buildDiagnosticsWarnings(createInfo({ webview2Version: "95.0.1020.44" }))
        expect(warnings).toContainEqual({
            code: "webview2-outdated",
            level: "warning",
            version: "95.0.1020.44",
            minVersion: "100.0.0.0",
        })
    })

    it("全部为软件渲染时提示无硬件显卡", () => {
        const info = createInfo()
        info.gpus = info.gpus.map(gpu => ({ ...gpu, software: true }))
        expect(buildDiagnosticsWarnings(info).map(warning => warning.code)).toContain("no-hardware-gpu")
    })

    it("DXGI 枚举失败时不误报无硬件显卡", () => {
        const codes = buildDiagnosticsWarnings(createInfo({ gpus: [], gpusError: "DXGI 初始化失败" })).map(warning => warning.code)
        expect(codes).not.toContain("no-hardware-gpu")
    })

    it("非 Windows 平台不产生显卡与系统 build 提示", () => {
        const codes = buildDiagnosticsWarnings(createInfo({ platform: "linux", gpus: [], osBuild: "6.8.0" })).map(warning => warning.code)
        expect(codes).not.toContain("no-hardware-gpu")
        expect(codes).not.toContain("old-os-build")
    })

    it("内存不足与系统版本过旧给出提示", () => {
        const codes = buildDiagnosticsWarnings(createInfo({ totalMemory: 4 * 1024 ** 3, osBuild: "18363" })).map(warning => warning.code)
        expect(codes).toEqual(expect.arrayContaining(["low-memory", "old-os-build"]))
    })

    it("提示顺序固定：WebView2 问题排在最前", () => {
        const codes = buildDiagnosticsWarnings(createInfo({ webview2Version: null, totalMemory: 4 * 1024 ** 3, osBuild: "19044" })).map(
            warning => warning.code
        )
        expect(codes[0]).toBe("webview2-missing")
    })
})
