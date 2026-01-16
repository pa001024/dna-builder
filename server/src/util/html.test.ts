import { describe, expect, it } from "bun:test"
import { sanitizeHTML } from "./html"

describe("sanitizeHTML", () => {
    describe("基本功能", () => {
        it("应该保留允许的标签和属性", () => {
            const inputHTML = '<p><a href="#">Hello</a></p><span>World</span>'
            const expectedOutput = '<p><a href="#">Hello</a></p><span>World</span>'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该返回空字符串如果输入为空", () => {
            const inputHTML = ""
            const expectedOutput = ""
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除不允许的属性", () => {
            const inputHTML = '<a href="#" target="_blank" onclick="alert(1)">Link</a>'
            const expectedOutput = '<a href="#">Link</a>'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("XSS 防护 - javascript: 协议", () => {
        it("应该移除 href 中的 javascript: 协议", () => {
            const inputHTML = '<a href="javascript:alert(1)">Click me</a>'
            const expectedOutput = "<a>Click me</a>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 img src 中的 javascript: 协议", () => {
            const inputHTML = '<img src="javascript:alert(1)" />'
            const expectedOutput = "<img/>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 javascript: 协议（大小写混合）", () => {
            const inputHTML = '<a href="JaVaScRiPt:alert(1)">XSS</a>'
            const expectedOutput = "<a>XSS</a>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("XSS 防护 - data: 协议", () => {
        it("应该移除 img src 中的 data: 协议", () => {
            const inputHTML = '<img src="data:image/svg+xml,<svg onload=alert(1)></svg>" />'
            const expectedOutput = "<img/>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 href 中的 data: 协议", () => {
            const inputHTML = '<a href="data:text/html,<script>alert(1)</script>">Click</a>'
            const expectedOutput = "<a>Click</a>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("XSS 防护 - 其他危险协议", () => {
        it("应该移除 vbscript: 协议", () => {
            const inputHTML = '<a href="vbscript:alert(1)">XSS</a>'
            const expectedOutput = "<a>XSS</a>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 file: 协议", () => {
            const inputHTML = '<a href="file:///etc/passwd">XSS</a>'
            const expectedOutput = "<a>XSS</a>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 about: 协议", () => {
            const inputHTML = '<a href="about:blank">XSS</a>'
            const expectedOutput = "<a>XSS</a>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("XSS 防护 - style 属性", () => {
        it("应该完全移除 style 属性", () => {
            const inputHTML = "<p style=\"color: red; background: url('javascript:alert(1)')\">Text</p>"
            const expectedOutput = "<p>Text</p>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除包含恶意 CSS 的 style 属性", () => {
            const inputHTML = "<div style=\"behavior: url('javascript:alert(1)')\">XSS</div>"
            const expectedOutput = "<div>XSS</div>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("XSS 防护 - 危险标签", () => {
        it("应该移除 script 标签", () => {
            const inputHTML = "<script>alert(1)</script><p>Safe</p>"
            const expectedOutput = "<p>Safe</p>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 iframe 标签", () => {
            const inputHTML = '<iframe src="javascript:alert(1)"></iframe><p>Safe</p>'
            const expectedOutput = "<p>Safe</p>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 object 标签", () => {
            const inputHTML = '<object data="javascript:alert(1)"></object><p>Safe</p>'
            const expectedOutput = "<p>Safe</p>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 embed 标签", () => {
            const inputHTML = '<embed src="javascript:alert(1)"><p>Safe</p>'
            const expectedOutput = "<p>Safe</p>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("XSS 防护 - 事件处理器", () => {
        it("应该移除 onclick 事件", () => {
            const inputHTML = '<p onclick="alert(1)">Click</p>'
            const expectedOutput = "<p>Click</p>"
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 onerror 事件", () => {
            const inputHTML = '<img src="x" onerror="alert(1)" />'
            const expectedOutput = '<img src="x" />'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该移除 onload 事件", () => {
            const inputHTML = '<img src="x" onload="alert(1)" />'
            const expectedOutput = '<img src="x" />'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("安全 URL", () => {
        it("应该保留 http: 协议", () => {
            const inputHTML = '<a href="http://example.com">Link</a>'
            const expectedOutput = '<a href="http://example.com">Link</a>'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该保留 https: 协议", () => {
            const inputHTML = '<a href="https://example.com">Link</a>'
            const expectedOutput = '<a href="https://example.com">Link</a>'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该保留相对 URL", () => {
            const inputHTML = '<a href="/path">Link</a>'
            const expectedOutput = '<a href="/path">Link</a>'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })

        it("应该保留 anchor", () => {
            const inputHTML = '<a href="#section">Link</a>'
            const expectedOutput = '<a href="#section">Link</a>'
            expect(sanitizeHTML(inputHTML)).toEqual(expectedOutput)
        })
    })

    describe("长度限制", () => {
        it("应该返回提示如果输入过长", () => {
            const longInput = `${"<p>".repeat(30000)}Content${"</p>".repeat(30000)}`
            const result = sanitizeHTML(longInput)
            expect(result).toBe("[消息过长]")
        })
    })
})
