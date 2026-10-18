import { describe, expect, it } from "bun:test"
import { installPlugin } from "./install"

/**
 * 安装引导接口的 UA 路由测试：
 * - PowerShell UA 返回 text/plain 静态安装脚本（带 CDN 缓存头）；
 * - 浏览器 UA 返回 text/html 落地页（英文、带复制按钮、主命令不含 Bypass）。
 * 脚本内容本身不做断言（脚本无需测试）。
 */

const app = installPlugin()

describe("install endpoint UA routing", () => {
    it("PowerShell UA 返回静态安装脚本且可缓存", async () => {
        const res = await app.handle(
            new Request("https://api.dna-builder.cn/", {
                headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PowerShell/7.4.0" },
            })
        )
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("text/plain")
        // 静态脚本内容恒定，允许 CDN 缓存
        expect(res.headers.get("cache-control")).toContain("max-age")
        expect((await res.text()).length).toBeGreaterThan(0)
    })

    it("浏览器 UA 返回英文落地页且含安装命令", async () => {
        const res = await app.handle(
            new Request("https://api.dna-builder.cn/", {
                headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36" },
            })
        )
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("text/html")
        const body = await res.text()
        // 主推命令对齐 bun：powershell -c "irm <host> | iex"（不带协议头）
        expect(body).toContain('powershell -c "irm api.dna-builder.cn | iex"')
        // 落地页必须带复制功能（按钮 + clipboard 调用）
        expect(body).toContain('id="copy"')
        expect(body).toContain("navigator.clipboard")
        // 英文文案
        expect(body).toContain("To install, run the following in your terminal:")
        // 主命令内不应出现 ExecutionPolicy Bypass
        const codeBlock = body.split('id="cmd">')[1].split("</code>")[0]
        expect(codeBlock).not.toContain("ExecutionPolicy")
    })

    it("/install.ps1 入口行为一致", async () => {
        const res = await app.handle(
            new Request("https://api.dna-builder.cn/install.ps1", {
                headers: { "user-agent": "WindowsPowerShell/5.1.19041.1" },
            })
        )
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("text/plain")
        expect(res.headers.get("cache-control")).toContain("max-age")
    })
})
