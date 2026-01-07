import { describe, expect, it } from "bun:test"
import { sanitizeImages, isSafeURL } from "../mod/guide"
import { sanitizeHTML } from "../../util/html"

describe("guide XSS 防护", () => {
    describe("isSafeURL", () => {
        it("应该允许 http: URL", () => {
            expect(isSafeURL("http://example.com")).toBe(true)
        })

        it("应该允许 https: URL", () => {
            expect(isSafeURL("https://example.com")).toBe(true)
        })

        it("应该阻止 javascript: URL", () => {
            expect(isSafeURL("javascript:alert(1)")).toBe(false)
        })

        it("应该阻止 data: URL", () => {
            expect(isSafeURL("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false)
        })

        it("应该阻止 vbscript: URL", () => {
            expect(isSafeURL("vbscript:alert(1)")).toBe(false)
        })

        it("应该阻止 file: URL", () => {
            expect(isSafeURL("file:///etc/passwd")).toBe(false)
        })

        it("应该阻止 about: URL", () => {
            expect(isSafeURL("about:blank")).toBe(false)
        })

        it("应该处理空值", () => {
            expect(isSafeURL("")).toBe(false)
            expect(isSafeURL(null as any)).toBe(false)
        })
    })

    describe("sanitizeImages", () => {
        it("应该保留安全 URL", () => {
            const images = ["https://example.com/img1.jpg", "https://example.com/img2.png"]
            const result = sanitizeImages(images)
            expect(result).toEqual(images)
        })

        it("应该移除 javascript: URL", () => {
            const images = ["https://example.com/img1.jpg", "javascript:alert(1)", "https://example.com/img2.png"]
            const result = sanitizeImages(images)
            expect(result).toEqual(["https://example.com/img1.jpg", "https://example.com/img2.png"])
        })

        it("应该移除 data: URL", () => {
            const images = ["data:image/svg+xml,<svg onload=alert(1)>", "https://example.com/img.jpg"]
            const result = sanitizeImages(images)
            expect(result).toEqual(["https://example.com/img.jpg"])
        })

        it("应该处理空数组", () => {
            const result = sanitizeImages([])
            expect(result).toEqual([])
        })

        it("应该处理 null/undefined", () => {
            expect(sanitizeImages(null as any)).toEqual([])
            expect(sanitizeImages(undefined as any)).toEqual([])
        })
    })

    describe("sanitizeHTML on markdown content (HTML是合法的markdown)", () => {
        it("应该清理直接嵌入的 HTML 标签", () => {
            const markdown = "<script>alert(1)</script># 标题\n\n段落内容"
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("<script>")
            expect(result).toContain("标题")
        })

        it("应该清理 iframe 标签", () => {
            const markdown = '<iframe src="javascript:alert(1)"></iframe>文本'
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("<iframe>")
            expect(result).toContain("文本")
        })

        it("应该清理 style 标签", () => {
            const markdown = "<style>body { color: red; }</style>文本"
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("<style>")
            expect(result).toContain("文本")
        })

        it("应该清理 onclick 事件", () => {
            const markdown = '<p onclick="alert(1)">点击</p>'
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("onclick")
            expect(result).toContain("点击")
        })

        it("应该清理 href 中的 javascript: 协议", () => {
            const markdown = '<a href="javascript:alert(1)">链接</a>'
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("javascript:")
        })

        it("应该清理 img src 中的 javascript: 协议", () => {
            const markdown = '<img src="javascript:alert(1)" />'
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("javascript:")
        })

        it("应该清理 img src 中的 data: 协议", () => {
            const markdown = '<img src="data:image/svg+xml,<svg onload=alert(1)></svg>" />'
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("data:")
        })

        it("应该清理 style 属性", () => {
            const markdown = "<p style=\"color: red; background: url('javascript:alert(1)')\">文本</p>"
            const result = sanitizeHTML(markdown)
            expect(result).not.toContain("style")
            expect(result).toContain("文本")
        })

        it("应该保留允许的标签", () => {
            const markdown = "<p><b>粗体</b>和<i>斜体</i></p>"
            const result = sanitizeHTML(markdown)
            expect(result).toContain("<b>")
            expect(result).toContain("<i>")
        })

        it("应该保留安全的 href", () => {
            const markdown = '<a href="https://example.com">链接</a>'
            const result = sanitizeHTML(markdown)
            expect(result).toContain('<a href="https://example.com"')
            expect(result).toContain("链接")
        })

        it("应该保留安全的 img src", () => {
            const markdown = '<img src="https://example.com/img.jpg" />'
            const result = sanitizeHTML(markdown)
            expect(result).toContain('<img src="https://example.com/img.jpg"')
        })

        it("应该处理空字符串", () => {
            const result = sanitizeHTML("")
            expect(result).toBe("")
        })
    })
})
