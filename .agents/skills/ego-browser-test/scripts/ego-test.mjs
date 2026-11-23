import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const CONSOLE_KEY = "__egoTestConsoleErrors"
const DEFAULT_IGNORE = [/读取自定义底图失败/, /transformCallback/, /DNAAPI获取密函失败/]
const registry = []

const CONSOLE_HOOK = `(() => {
    const KEY = ${JSON.stringify(CONSOLE_KEY)};
    const store = (window[KEY] = []);
    const describe = (value) => {
        if (typeof value === "string") return value;
        if (value instanceof Error) return value.stack || value.message;
        try { return JSON.stringify(value); } catch { return String(value); }
    };
    const push = (level, args) => {
        if (store.length >= 200) return;
        store.push(level + " " + args.map(describe).join(" "));
    };
    for (const level of ["error", "warn"]) {
        const original = console[level].bind(console);
        console[level] = (...args) => { push(level, args); original(...args); };
    }
    window.addEventListener("error", (event) => {
        push("uncaught", [event.message + (event.error && event.error.stack ? "\\n" + event.error.stack : "")]);
    });
    window.addEventListener("unhandledrejection", (event) => {
        push("rejection", [describe(event.reason)]);
    });
})();`

/** 注册一个测试用例；测试文件通过 default export 拿到本函数 */
export function test(name, fn) {
    if (typeof name !== "string" || name.trim() === "") throw new TypeError("test(name, fn) 需要非空用例名")
    if (typeof fn !== "function") throw new TypeError(`用例 ${name} 缺少执行函数`)
    registry.push({ name: name.trim(), fn })
}

/** 在页面执行 JS 表达式；表达式结果必须是 JSON 可序列化的 */
export async function evalExpr(ctx, expression) {
    return ctx.page.evaluate(`(() => { const __v = (${expression}); return __v === undefined ? null : __v })()`)
}

export async function expectText(ctx, selector, expected) {
    const actual = await ctx.page.evaluate(sel => document.querySelector(sel)?.textContent?.trim() ?? null, selector)
    if (actual !== expected) throw new Error(`文本不匹配 ${selector}: 期望 "${expected}"，实际 "${actual}"`)
}

export async function expectContains(ctx, selector, substr) {
    const actual = await ctx.page.evaluate(sel => document.querySelector(sel)?.textContent ?? "", selector)
    if (!actual.includes(substr)) throw new Error(`文本不包含子串 ${selector}: 期望包含 "${substr}"，实际 "${actual}"`)
}

export async function expectVisible(ctx, selector) {
    const ok = await ctx.page.evaluate(sel => {
        const el = document.querySelector(sel)
        if (!el) return false
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0"
    }, selector)
    if (!ok) throw new Error(`元素不可见或未挂载: ${selector}`)
}

export async function expectCount(ctx, selector, expected) {
    const count = await ctx.page.evaluate(sel => document.querySelectorAll(sel).length, selector)
    if (count !== expected) throw new Error(`元素数量不匹配 ${selector}: 期望 ${expected}，实际 ${count}`)
}

export async function expectCountAtLeast(ctx, selector, min) {
    const count = await ctx.page.evaluate(sel => document.querySelectorAll(sel).length, selector)
    if (count < min) throw new Error(`元素数量不足 ${selector}: 期望至少 ${min}，实际 ${count}`)
}

export async function expectEval(ctx, expression, expected) {
    const actual = await evalExpr(ctx, expression)
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`求值断言失败 (${expression}): 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
    }
}

export async function expectNoConsoleErrors(ctx, options = {}) {
    const entries = await readConsoleErrors(ctx)
    const ignore = [...ctx.ignoreConsoleErrors, ...(options.ignore ?? [])]
    const hits = entries.filter(
        line =>
            !ignore.some(pattern => {
                if (typeof pattern === "string") return line.includes(pattern)
                pattern.lastIndex = 0
                return pattern.test(line)
            })
    )
    if (hits.length > 0) throw new Error(`存在 ${hits.length} 条浏览器控制台错误:\n  ${hits.join("\n  ")}`)
}

/** 截图保存到本次运行的 screenshots 目录；ego 要求绝对路径（Windows 用正斜杠） */
export async function snapshot(ctx, name, options = {}) {
    await mkdir(ctx.screenshotDir, { recursive: true })
    const file = path.join(ctx.screenshotDir, `${slug(name)}.png`).replaceAll("\\", "/")
    const args = { path: file, fullPage: options.fullPage ?? false }
    try {
        await ctx.page.screenshot(args)
    } catch {
        await ctx.page.screenshot(args)
    }
    return file
}

/**
 * 运行所有已注册用例。
 * 测试文件以 `export default (api) => { ... }` 注册用例；由 run.mjs 通过绝对 file URL 传入。
 */
export async function run(config = {}) {
    const startedAt = Date.now()
    const baseUrl = config.baseUrl ?? "http://localhost:1420"
    const screenshotDir = path.resolve(config.screenshotDir ?? path.join(".tmp", "ego-browser-test", stamp()))
    const resultDir = path.resolve(config.resultDir ?? screenshotDir)
    const results = []
    let task
    let fatal = null
    let ctx

    try {
        const files = Array.isArray(config.tests) ? config.tests : []
        if (files.length === 0) throw new Error("没有测试文件：请传入 *.test.mjs 或目录")

        registry.length = 0
        for (const file of files) {
            const url = file.startsWith("file:") ? file : pathToFileURL(file).href
            const mod = await import(url)
            if (typeof mod.default !== "function") {
                throw new TypeError(`测试文件必须 default export 一个函数: ${file}`)
            }
            mod.default(testApi())
        }

        const taskSpaceFn = globalThis.taskSpace
        if (typeof taskSpaceFn !== "function") {
            throw new Error("未检测到 ego-browser 运行环境：请通过 `pnpm test:browser` 或 `ego-browser nodejs` 运行")
        }

        task = await taskSpaceFn(`dna-builder e2e ${stamp()}`)
        const page = task.page("p1")
        console.log(`[ego-browser-test] 任务空间 ${task.name} (${task.spaceId}) 已就绪`)
        ctx = {
            task,
            page,
            baseUrl,
            screenshotDir,
            ignoreConsoleErrors: [...DEFAULT_IGNORE, ...(config.ignoreConsoleErrors ?? [])],
            url: target => buildUrl(baseUrl, target),
            goto: (target, options) => page.goto(buildUrl(baseUrl, target), options),
            snapshot: (name, options) => snapshot(ctx, name, options),
        }

        await installConsoleCapture(page)
        const viewport = config.viewport === false ? null : (config.viewport ?? { width: 1440, height: 900 })
        if (viewport) {
            await page.cdp("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false })
        }
        const startUrl = buildUrl(baseUrl, config.startPath ?? "/")
        const setupStarted = Date.now()
        try {
            await page.goto(startUrl, { timeout: config.navigationTimeout ?? 60_000 })
        } catch (error) {
            throw new Error(`无法打开 ${startUrl}。请确认开发服务器已启动（不要由 agent 启动 pnpm dev）。\n${formatError(error)}`)
        }
        await waitForAppReady(page, config.readyTimeout ?? 60_000)
        console.log(`[ego-browser-test] 页面就绪 ${startUrl} (${Date.now() - setupStarted}ms)`)

        const tests = config.filter ? registry.filter(item => item.name.includes(config.filter)) : registry
        if (tests.length === 0) throw new Error(`没有名称包含 ${JSON.stringify(config.filter)} 的用例`)

        for (const item of tests) {
            const testStarted = Date.now()
            try {
                await item.fn(ctx)
                await expectNoConsoleErrors(ctx)
                results.push({ name: item.name, ok: true, ms: Date.now() - testStarted })
                console.log(`  ✓ ${item.name} (${Date.now() - testStarted}ms)`)
                if (config.screenshotOnPass) await snapshot(ctx, `pass-${slug(item.name)}`)
            } catch (error) {
                const message = formatError(error)
                results.push({ name: item.name, ok: false, ms: Date.now() - testStarted, error: message })
                console.error(`  ✗ ${item.name}: ${message.split("\n")[0]}`)
                try {
                    const file = await snapshot(ctx, `fail-${slug(item.name)}`)
                    console.error(`    截图: ${file}`)
                } catch {
                    /* 截图失败不阻断后续用例 */
                }
            } finally {
                await resetConsoleErrors(ctx)
            }
        }
    } catch (error) {
        fatal = error
    } finally {
        if (task) {
            const closeStarted = Date.now()
            try {
                const receipt = await task.finish({ keep: config.keep ? ["p1"] : [] })
                console.log(`[ego-browser-test] 任务空间已结束 (closed=${receipt.closedSpace}, ${Date.now() - closeStarted}ms)`)
            } catch (error) {
                console.warn(`[ego-browser-test] 关闭任务空间失败: ${formatError(error)}`)
            }
        }
    }

    const failedTests = results.filter(item => !item.ok).length
    const summary = {
        startedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        baseUrl,
        screenshotDir: screenshotDir.replaceAll("\\", "/"),
        resultDir: resultDir.replaceAll("\\", "/"),
        space: task?.name,
        passed: results.length - failedTests,
        failed: failedTests + (fatal ? 1 : 0),
        tests: results,
        ...(fatal ? { fatal: formatError(fatal) } : {}),
    }
    await mkdir(resultDir, { recursive: true })
    await writeFile(path.join(resultDir, "result.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")
    printSummary(summary)
    if (fatal || failedTests > 0) process.exitCode = 1
    return summary
}

export function buildUrl(baseUrl, target = "/") {
    const url = new URL(target, baseUrl)
    if (!url.searchParams.has("hideUpdateInfo")) url.searchParams.set("hideUpdateInfo", "1")
    return url.href
}

export async function installConsoleCapture(page) {
    await page.cdp("Page.addScriptToEvaluateOnNewDocument", { source: CONSOLE_HOOK })
}

function testApi() {
    return {
        test,
        expectText,
        expectContains,
        expectVisible,
        expectCount,
        expectCountAtLeast,
        expectEval,
        expectNoConsoleErrors,
        snapshot,
        evalExpr,
        buildUrl,
        installConsoleCapture,
    }
}

async function readConsoleErrors(ctx) {
    try {
        return await ctx.page.evaluate(key => (Array.isArray(window[key]) ? window[key].slice() : []), CONSOLE_KEY)
    } catch {
        return []
    }
}

async function resetConsoleErrors(ctx) {
    try {
        await ctx.page.evaluate(key => {
            window[key] = []
        }, CONSOLE_KEY)
    } catch {
        /* 页面可能已关闭或跨域，下一次读取会返回空数组 */
    }
}

async function waitForAppReady(page, timeout) {
    const isApp = await page.evaluate(() => Boolean(document.querySelector("#app")))
    if (!isApp) return
    try {
        await page.waitForSelector("#app > *", { state: "attached", timeout })
        await page.waitForFunction(() => !document.querySelector("#boot-loader"), undefined, { timeout })
    } catch (error) {
        throw new Error(`应用在 ${timeout}ms 内未完成启动（#boot-loader 仍存在）。请确认开发服务器正常。\n${formatError(error)}`)
    }
}

function printSummary(summary) {
    console.log(`\n[ego-browser-test] ${summary.passed} passed / ${summary.failed} failed (${summary.durationMs}ms)`)
    console.log(`[ego-browser-test] 产物: ${summary.screenshotDir}`)
    if (summary.fatal) console.error(`[ego-browser-test] 运行失败: ${summary.fatal.split("\n")[0]}`)
    if (summary.failed > 0 && summary.tests.some(item => !item.ok)) {
        console.error("[ego-browser-test] 失败用例:")
        for (const item of summary.tests.filter(entry => !entry.ok)) {
            const lines = (item.error ?? "unknown error").split("\n")
            console.error(`  - ${item.name}: ${lines[0]}`)
            for (const line of lines.slice(1, 10)) console.error(`      ${line}`)
        }
    }
}

function formatError(error) {
    if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`
    return String(error)
}

function slug(text) {
    return text.replace(/[^\w一-鿿-]+/g, "_").slice(0, 80) || "shot"
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, "-")
}
