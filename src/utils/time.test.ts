import i18next from "i18next"
import { beforeAll, describe, expect, it } from "vitest"
import { formatRelativeTime } from "./time"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatRelativeTime", () => {
    beforeAll(async () => {
        // 初始化 i18next 内联资源，验证相对时间文案随语言切换
        await i18next.init({
            lng: "zh-CN",
            fallbackLng: "zh-CN",
            resources: {
                "zh-CN": {
                    translation: {
                        time: {
                            justNow: "刚刚",
                            minutesAgo: "{{count}} 分钟前",
                            hoursAgo: "{{count}} 小时前",
                            daysAgo: "{{count}} 天前",
                        },
                    },
                },
                en: {
                    translation: {
                        time: {
                            justNow: "Just now",
                            minutesAgo_one: "{{count}} minute ago",
                            minutesAgo_other: "{{count}} minutes ago",
                            hoursAgo_one: "{{count}} hour ago",
                            hoursAgo_other: "{{count}} hours ago",
                            daysAgo_one: "{{count}} day ago",
                            daysAgo_other: "{{count}} days ago",
                        },
                    },
                },
            },
        })
    })

    it("zh-CN 输出相对时间文案", () => {
        const now = Date.now()
        expect(formatRelativeTime(now - 30_000)).toBe("刚刚")
        expect(formatRelativeTime(now - MINUTE - 1)).toBe("1 分钟前")
        expect(formatRelativeTime(now - 5 * MINUTE)).toBe("5 分钟前")
        expect(formatRelativeTime(now - 2 * HOUR)).toBe("2 小时前")
        expect(formatRelativeTime(now - 3 * DAY)).toBe("3 天前")
    })

    it("en 输出带复数形式的相对时间文案", () => {
        const now = Date.now()
        expect(formatRelativeTime(now - 30_000, "en")).toBe("Just now")
        expect(formatRelativeTime(now - MINUTE - 1, "en")).toBe("1 minute ago")
        expect(formatRelativeTime(now - 5 * MINUTE, "en")).toBe("5 minutes ago")
        expect(formatRelativeTime(now - 2 * HOUR, "en")).toBe("2 hours ago")
        expect(formatRelativeTime(now - 3 * DAY, "en")).toBe("3 days ago")
    })

    it("兼容秒单位时间戳", () => {
        const now = Date.now()
        expect(formatRelativeTime(Math.floor((now - 30_000) / 1000))).toBe("刚刚")
    })

    it("超过 30 天回退为日期时间文本", () => {
        const text = formatRelativeTime(Date.now() - 40 * DAY)
        expect(text).toContain(":")
    })
})
