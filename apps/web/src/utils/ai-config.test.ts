import { describe, expect, it } from "vitest"
import {
    DEFAULT_AI_CONTEXT_WINDOW,
    DEFAULT_AI_MAX_TOKENS,
    formatTokenCount,
    parseTokenCount,
    resolveAiContextWindow,
    resolveAiMaxTokens,
} from "@/utils/ai-config"

describe("parseTokenCount", () => {
    it("数字原样取整，非正与非有限值返回 null", () => {
        expect(parseTokenCount(32768)).toBe(32768)
        expect(parseTokenCount(100.9)).toBe(100)
        expect(parseTokenCount(0)).toBeNull()
        expect(parseTokenCount(-5)).toBeNull()
        expect(parseTokenCount(NaN)).toBeNull()
    })

    it("纯数字字符串与千分位逗号", () => {
        expect(parseTokenCount("262144")).toBe(262144)
        expect(parseTokenCount("  32768  ")).toBe(32768)
        expect(parseTokenCount("262,144")).toBe(262144)
    })

    it("K / M 后缀（大小写不敏感，支持小数与空格）", () => {
        expect(parseTokenCount("400K")).toBe(400_000)
        expect(parseTokenCount("400k")).toBe(400_000)
        expect(parseTokenCount("1M")).toBe(1_000_000)
        expect(parseTokenCount("1m")).toBe(1_000_000)
        expect(parseTokenCount("1.5M")).toBe(1_500_000)
        expect(parseTokenCount("256 K")).toBe(256_000)
        expect(parseTokenCount("32k")).toBe(32_000)
    })

    it("空值与非法文本返回 null", () => {
        expect(parseTokenCount(null)).toBeNull()
        expect(parseTokenCount(undefined)).toBeNull()
        expect(parseTokenCount("")).toBeNull()
        expect(parseTokenCount("   ")).toBeNull()
        expect(parseTokenCount("abc")).toBeNull()
        expect(parseTokenCount("K")).toBeNull()
        expect(parseTokenCount("10G")).toBeNull()
        expect(parseTokenCount("0K")).toBeNull()
    })
})

describe("formatTokenCount", () => {
    it("优先整数刻度：十进制 K/M 与二进制 K", () => {
        expect(formatTokenCount(262144)).toBe("256K")
        expect(formatTokenCount(32768)).toBe("32K")
        expect(formatTokenCount(131072)).toBe("128K")
        expect(formatTokenCount(128000)).toBe("128K")
        expect(formatTokenCount(200000)).toBe("200K")
        expect(formatTokenCount(1_000_000)).toBe("1M")
        expect(formatTokenCount(1_048_576)).toBe("1M")
        expect(formatTokenCount(1_500_000)).toBe("1.5M")
    })

    it("兼容字符串并拒绝非法值", () => {
        expect(formatTokenCount("256K")).toBe("256K")
        expect(formatTokenCount("1M")).toBe("1M")
        expect(formatTokenCount(null)).toBe("")
        expect(formatTokenCount(0)).toBe("")
        expect(formatTokenCount("乱填")).toBe("")
    })
})

describe("resolveAiMaxTokens / resolveAiContextWindow", () => {
    it("可解析值直通，空缺回落各自默认值", () => {
        expect(resolveAiMaxTokens("32K")).toBe(32_000)
        expect(resolveAiMaxTokens("400K")).toBe(400_000)
        expect(resolveAiMaxTokens(null)).toBe(DEFAULT_AI_MAX_TOKENS)
        expect(resolveAiMaxTokens("乱填")).toBe(DEFAULT_AI_MAX_TOKENS)
        expect(resolveAiContextWindow("1M")).toBe(1_000_000)
        expect(resolveAiContextWindow("")).toBe(DEFAULT_AI_CONTEXT_WINDOW)
        expect(resolveAiContextWindow(undefined)).toBe(DEFAULT_AI_CONTEXT_WINDOW)
    })

    it("优先级：用户配置 > 模型元数据 > 默认值", () => {
        expect(resolveAiContextWindow("400K", 1_000_000)).toBe(400_000)
        expect(resolveAiContextWindow("", 1_000_000)).toBe(1_000_000)
        expect(resolveAiContextWindow(null, null)).toBe(DEFAULT_AI_CONTEXT_WINDOW)
        expect(resolveAiMaxTokens("16K", 65_536)).toBe(16_000)
        expect(resolveAiMaxTokens(null, 65_536)).toBe(65_536)
        expect(resolveAiMaxTokens(undefined, undefined)).toBe(DEFAULT_AI_MAX_TOKENS)
    })
})
