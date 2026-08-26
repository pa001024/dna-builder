/**
 * Bun.WebView 前端测试框架
 * 依赖: bun >= 1.4（内置 Bun.WebView 无头浏览器）
 *
 * 设计目标: 用零依赖的无头浏览器对前端页面做端到端冒烟/交互测试。
 * 用法: 测试文件 import { test, ... , run } 后调用 run()，例如:
 *   bun scripts/example.test.ts --url http://localhost:1420
 *
 * 关键约定:
 * - view.evaluate 接收字符串表达式，返回已反序列化的结果；复杂逻辑用 IIFE 字符串。
 * - 点击/滚动是真实用户输入 (isTrusted === true)，选择器方法会自动等待可操作。
 * - console 选项必须为函数，否则会抛 ERR_INVALID_ARG_TYPE。
 */

import { WebView } from "bun"

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 单个测试用例的执行上下文 */
export interface TestContext {
    /** 当前无头浏览器视图，可直接调用 view.click / evaluate / screenshot 等 */
    view: WebView
    /** 测试基准地址 (默认 http://localhost:1420) */
    baseUrl: string
}

/** 测试用例函数 */
export type TestFn = (ctx: TestContext) => Promise<void> | void

/** run() 配置 */
export interface RunConfig {
    /** 覆盖基准地址 */
    url?: string
    /** 每个用例通过时也截图 (便于人工查看) */
    screenshotOnPass?: boolean
}

// ---------------------------------------------------------------------------
// 测试注册表
// ---------------------------------------------------------------------------

const registry: { name: string; fn: TestFn }[] = []

/** 注册一个测试用例 */
export function test(name: string, fn: TestFn): void {
    registry.push({ name, fn })
}

/** 浏览器控制台错误收集 (run 开始时清空) */
let consoleErrors: string[] = []

// ---------------------------------------------------------------------------
// 页面求值
// ---------------------------------------------------------------------------

/**
 * 将 JS 表达式交给页面执行并返回反序列化结果。
 * 用 IIFE 包裹以安全处理 undefined（JSON.stringify(undefined) 不是合法 JSON）。
 */
export async function evalExpr<T = unknown>(ctx: TestContext, expr: string): Promise<T> {
    const json = await ctx.view.evaluate(`(function(){ const __v = (${expr}); return JSON.stringify(__v === undefined ? null : __v); })()`)
    return JSON.parse(json) as T
}

// ---------------------------------------------------------------------------
// 断言辅助
// ---------------------------------------------------------------------------

/** 断言某元素的文本等于期望值 */
export async function expectText(ctx: TestContext, selector: string, expected: string): Promise<void> {
    const actual = await evalExpr<string>(ctx, `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`)
    if (actual !== expected) {
        throw new Error(`文本不匹配 ${selector}: 期望 "${expected}"，实际 "${actual}"`)
    }
}

/** 断言某元素的文本包含子串 */
export async function expectContains(ctx: TestContext, selector: string, substr: string): Promise<void> {
    const actual = await evalExpr<string>(ctx, `document.querySelector(${JSON.stringify(selector)})?.textContent ?? ""`)
    if (!actual.includes(substr)) {
        throw new Error(`文本不包含子串 ${selector}: 期望包含 "${substr}"，实际 "${actual}"`)
    }
}

/** 断言某元素可见 (已挂载、有尺寸、非隐藏、不透明) */
export async function expectVisible(ctx: TestContext, selector: string): Promise<void> {
    const ok = await evalExpr<boolean>(
        ctx,
        `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; })()`
    )
    if (!ok) throw new Error(`元素不可见或未挂载: ${selector}`)
}

/** 断言匹配选择器的元素数量等于期望值 */
export async function expectCount(ctx: TestContext, selector: string, expected: number): Promise<void> {
    const n = await evalExpr<number>(ctx, `document.querySelectorAll(${JSON.stringify(selector)}).length`)
    if (n !== expected) throw new Error(`元素数量不匹配 ${selector}: 期望 ${expected}，实际 ${n}`)
}

/** 断言匹配选择器的元素数量至少为 min */
export async function expectCountAtLeast(ctx: TestContext, selector: string, min: number): Promise<void> {
    const n = await evalExpr<number>(ctx, `document.querySelectorAll(${JSON.stringify(selector)}).length`)
    if (n < min) throw new Error(`元素数量不足 ${selector}: 期望至少 ${min}，实际 ${n}`)
}

/** 断言页面内 JS 表达式求值结果等于期望值 */
export async function expectEval(ctx: TestContext, expr: string, expected: unknown): Promise<void> {
    const actual = await evalExpr(ctx, expr)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`求值断言失败 (${expr}): 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
    }
}

/** 断言本轮运行中浏览器控制台没有 error / warning */
export async function expectNoConsoleErrors(): Promise<void> {
    if (consoleErrors.length > 0) {
        throw new Error(`存在 ${consoleErrors.length} 条浏览器控制台错误:\n  ${consoleErrors.join("\n  ")}`)
    }
}

// ---------------------------------------------------------------------------
// 截图
// ---------------------------------------------------------------------------

/** 截图并保存到 screenshots/ 目录，返回文件路径 */
export async function snapshot(ctx: TestContext, name: string, format: "png" | "jpeg" | "webp" = "png"): Promise<string> {
    await Bun.mkdir("screenshots", { recursive: true })
    const file = `screenshots/${name}.${format}`
    await Bun.write(file, await ctx.view.screenshot({ format }))
    return file
}

// ---------------------------------------------------------------------------
// 运行器
// ---------------------------------------------------------------------------

/** 从命令行或环境变量解析基准地址 */
function resolveBaseUrl(config?: RunConfig): string {
    for (let i = 2; i < Bun.argv.length; i++) {
        if (Bun.argv[i] === "--url" && Bun.argv[i + 1]) return Bun.argv[i + 1]
    }
    if (config?.url) return config.url
    return process.env.FRONTEND_TEST_URL ?? "http://localhost:1420"
}

/** 将用例名转为安全文件名 */
function slug(s: string): string {
    return s.replace(/[^\w一-龥-]+/g, "_").slice(0, 60)
}

/**
 * 运行所有已注册用例，输出通过/失败摘要，失败时以退出码 1 结束。
 * 在用例文件末尾调用一次即可。
 */
export async function run(config: RunConfig = {}): Promise<void> {
    const baseUrl = resolveBaseUrl(config)
    consoleErrors = []
    await Bun.mkdir("screenshots", { recursive: true })

    const passed: string[] = []
    const failed: { name: string; error: string }[] = []

    const view = new WebView({
        width: 1280,
        height: 800,
        console: (level: string, ...args: unknown[]) => {
            const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
            console.log(`[browser ${level}]`, msg)
            if (level === "error" || level === "warning") consoleErrors.push(`[${level}] ${msg}`)
        },
    })

    // 导航失败属于环境错误，单独处理直接退出
    try {
        console.log(`🌐 导航至 ${baseUrl}`)
        await view.navigate(baseUrl)
    } catch (e) {
        console.error("无法导航到目标地址 (请确认开发服务器已启动):", e instanceof Error ? e.message : String(e))
        await view.close()
        process.exit(2)
    }

    try {
        for (const t of registry) {
            try {
                await t.fn({ view, baseUrl })
                passed.push(t.name)
                console.log(`  ✓ ${t.name}`)
                if (config.screenshotOnPass) await snapshot({ view, baseUrl }, slug(t.name))
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                failed.push({ name: t.name, error: msg })
                console.error(`  ✗ ${t.name}: ${msg}`)
                try {
                    await Bun.write(`screenshots/${slug(t.name)}.png`, await view.screenshot({ format: "png" }))
                } catch {
                    /* 截图失败不阻断 */
                }
            }
        }
    } finally {
        await view.close()
    }

    console.log(`\n结果: ${passed.length} 通过 / ${failed.length} 失败`)
    if (failed.length > 0) {
        console.error("失败用例:")
        for (const f of failed) console.error(`  - ${f.name}: ${f.error}`)
        process.exit(1)
    }
}
