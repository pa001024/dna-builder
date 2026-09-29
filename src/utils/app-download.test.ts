import { afterEach, describe, expect, it, vi } from "vitest"
import {
    APK_MANIFEST_URL,
    AUTO_DOWNLOAD_SECONDS,
    canInstallApk,
    DESKTOP_DOWNLOAD_URL,
    DOWNLOAD_PAGE_URL,
    detectClientPlatform,
    fetchApkRelease,
    formatFileSize,
    formatReleaseDate,
    isWeChatBrowser,
} from "./app-download"

const UA = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ipad: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    // iPadOS 13 起桌面版 Safari 把自己伪装成 macOS
    macWithTouch: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    android:
        "Mozilla/5.0 (Linux; Android 14; PJD110 Build/UKQ1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
    wechatAndroid:
        "Mozilla/5.0 (Linux; Android 14; PJD110 Build/UKQ1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49.2600(0x2800313D) WeChat/arm64",
    harmony:
        "Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile HuaweiBrowser/5.0.5",
}

describe("detectClientPlatform", () => {
    it("区分手机、平板与桌面端", () => {
        expect(detectClientPlatform(UA.iphone)).toBe("ios")
        expect(detectClientPlatform(UA.ipad)).toBe("ios")
        expect(detectClientPlatform(UA.macWithTouch, 5)).toBe("ios")
        expect(detectClientPlatform(UA.macWithTouch, 0)).toBe("desktop")
        expect(detectClientPlatform(UA.windows)).toBe("desktop")
        expect(detectClientPlatform(UA.android)).toBe("android")
        expect(detectClientPlatform(UA.harmony)).toBe("android")
        expect(detectClientPlatform("")).toBe("desktop")
    })

    it("预渲染（无 UA）时按桌面端处理", () => {
        expect(detectClientPlatform("")).toBe("desktop")
        expect(canInstallApk(detectClientPlatform(""))).toBe(false)
    })

    it("只有移动端可以安装 APK", () => {
        expect(canInstallApk("android")).toBe(true)
        expect(canInstallApk("mobile")).toBe(true)
        expect(canInstallApk("ios")).toBe(false)
        expect(canInstallApk("desktop")).toBe(false)
    })
})

describe("isWeChatBrowser", () => {
    it("识别微信内置浏览器", () => {
        expect(isWeChatBrowser(UA.wechatAndroid)).toBe(true)
        expect(isWeChatBrowser(UA.android)).toBe(false)
        expect(isWeChatBrowser("")).toBe(false)
    })
})

describe("格式化", () => {
    it("体积按量级选择单位", () => {
        expect(formatFileSize(0)).toBe("-")
        expect(formatFileSize(-1)).toBe("-")
        expect(formatFileSize(512)).toBe("512 B")
        expect(formatFileSize(2048)).toBe("2.0 KB")
        expect(formatFileSize(90_558_464)).toBe("86.4 MB")
    })

    it("发布日期只保留本地日期", () => {
        const text = formatReleaseDate("2026-09-27T12:34:56.000Z")
        expect(text).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(formatReleaseDate("")).toBe("-")
        expect(formatReleaseDate("not-a-date")).toBe("-")
    })
})

describe("fetchApkRelease", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("拉取并归一化发布清单", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                version: "1.2.3",
                fileName: "v1.2.3.apk",
                url: "https://dl.dobapp.cc/apk/v1.2.3.apk",
                size: 1024,
                sha256: "abc",
                builtAt: "2026-09-27T00:00:00.000Z",
            }),
        })
        vi.stubGlobal("fetch", fetchMock)

        const release = await fetchApkRelease()
        expect(fetchMock).toHaveBeenCalledWith(APK_MANIFEST_URL, expect.objectContaining({ signal: expect.anything() }))
        expect(release.version).toBe("1.2.3")
        expect(release.url).toBe("https://dl.dobapp.cc/apk/v1.2.3.apk")
        expect(release.size).toBe(1024)
    })

    it("缺少版本号或下载地址时报错", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "1.2.3" }) }))
        await expect(fetchApkRelease()).rejects.toThrow(/下载地址/)
    })

    it("HTTP 状态异常时报错", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))
        await expect(fetchApkRelease()).rejects.toThrow(/404/)
    })

    it("超时后中止请求", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn((_url: string, init?: RequestInit) => {
                return new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
                })
            })
        )
        await expect(fetchApkRelease({ timeoutMs: 10 })).rejects.toThrow(/aborted/)
    })
})

describe("常量", () => {
    it("下载页地址指向生产域名，倒计时为 3 秒", () => {
        expect(DOWNLOAD_PAGE_URL).toBe("https://dna-builder.cn/download")
        expect(AUTO_DOWNLOAD_SECONDS).toBe(3)
    })

    it("桌面版安装包走站内接口（服务端 302 到最新 MSI）", () => {
        expect(DESKTOP_DOWNLOAD_URL).toBe("https://dna-builder.cn/api/download")
    })
})
