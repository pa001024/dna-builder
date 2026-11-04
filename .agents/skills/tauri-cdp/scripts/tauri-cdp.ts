/**
 * Tauri 桌面端 CDP 调试 CLI（Windows / WebView2）
 *
 * 连接用户已启动的应用：不启动、不结束进程。
 * 只负责 HKLM CDP 策略的配置与清理（提权应用必须走这条通道）。
 * 用法见 ../SKILL.md。
 */

import { mkdir } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "../../../..")
const TMP_DIR = join(REPO_ROOT, ".tmp", "tauri-cdp")
const DEFAULT_PORT = Number(process.env.TAURI_CDP_PORT ?? 9222)
const DEFAULT_EXE_NAMES = ["dna-builder", "DNA Builder"]
const POLICY_KEY = String.raw`HKLM:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`
const POLICY_REG_PATH = String.raw`HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments`
const BOOLEAN_FLAGS = new Set(["json", "raw", "full", "reload", "fail-on-error", "quiet", "help", "force", "activate", "gone", "policy"])

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

interface CliArgs {
    positionals: string[]
    flags: Map<string, string | true>
}

function parseArgs(argv: string[]): CliArgs {
    const positionals: string[] = []
    const flags = new Map<string, string | true>()
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === "--") {
            positionals.push(...argv.slice(i + 1))
            break
        }
        if (!arg.startsWith("--")) {
            positionals.push(arg)
            continue
        }
        const eq = arg.indexOf("=")
        if (eq >= 0) {
            flags.set(arg.slice(2, eq), arg.slice(eq + 1))
            continue
        }
        const name = arg.slice(2)
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith("--") && !BOOLEAN_FLAGS.has(name)) {
            flags.set(name, next)
            i++
        } else {
            flags.set(name, true)
        }
    }
    return { positionals, flags }
}

function flagString(args: CliArgs, name: string, fallback?: string): string | undefined {
    const value = args.flags.get(name)
    return typeof value === "string" ? value : fallback
}

function flagBool(args: CliArgs, name: string): boolean {
    const value = args.flags.get(name)
    return value === true || value === "true"
}

function flagNumber(args: CliArgs, name: string, fallback: number): number {
    const value = flagString(args, name)
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`--${name} 需要正数，收到: ${value}`)
    return parsed
}

// ---------------------------------------------------------------------------
// CDP 客户端
// ---------------------------------------------------------------------------

interface CdpVersion {
    Browser: string
    "Protocol-Version": string
    "User-Agent": string
    webSocketDebuggerUrl: string
}

interface CdpTarget {
    id: string
    type: string
    title: string
    url: string
    webSocketDebuggerUrl?: string
}

interface PendingRequest {
    resolve: (value: any) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
}

type CdpEventHandler = (params: any) => void

class CdpClient {
    private readonly ws: WebSocket
    private nextId = 0
    private readonly pending = new Map<number, PendingRequest>()
    private readonly listeners = new Map<string, Set<CdpEventHandler>>()
    private openResolve!: () => void
    private openReject!: (error: Error) => void
    private readonly openPromise: Promise<void>
    private closed = false

    constructor(url: string) {
        this.openPromise = new Promise<void>((resolvePromise, rejectPromise) => {
            this.openResolve = resolvePromise
            this.openReject = rejectPromise
        })
        this.ws = new WebSocket(url)
        this.ws.addEventListener("open", () => this.openResolve())
        this.ws.addEventListener("error", () => {
            const error = new Error(`无法连接 CDP: ${url}`)
            this.openReject(error)
            this.rejectAll(error)
        })
        this.ws.addEventListener("close", () => {
            this.closed = true
            this.rejectAll(new Error("CDP 连接已关闭"))
        })
        this.ws.addEventListener("message", event => void this.handleMessage(event.data))
    }

    static async connect(url: string, timeoutMs = 5000): Promise<CdpClient> {
        const client = new CdpClient(url)
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            await Promise.race([
                client.openPromise,
                new Promise<void>((_, rejectPromise) => {
                    timer = setTimeout(() => rejectPromise(new Error(`连接 CDP 超时: ${url}`)), timeoutMs)
                }),
            ])
            return client
        } catch (error) {
            client.close()
            throw error
        } finally {
            if (timer) clearTimeout(timer)
        }
    }

    private async handleMessage(data: string | ArrayBuffer | Blob): Promise<void> {
        let text: string
        if (typeof data === "string") text = data
        else if (data instanceof Blob) text = await data.text()
        else text = new TextDecoder().decode(data)

        let message: any
        try {
            message = JSON.parse(text)
        } catch {
            return
        }
        if (message.id !== undefined) {
            const pending = this.pending.get(message.id)
            if (!pending) return
            clearTimeout(pending.timer)
            this.pending.delete(message.id)
            if (message.error) {
                const detail = message.error.data ? `: ${JSON.stringify(message.error.data)}` : ""
                pending.reject(new Error(`${message.error.message}${detail}`))
            } else {
                pending.resolve(message.result)
            }
            return
        }
        if (message.method) {
            for (const handler of this.listeners.get(message.method) ?? []) handler(message.params)
        }
    }

    private rejectAll(error: Error): void {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer)
            pending.reject(error)
        }
        this.pending.clear()
    }

    send<T = any>(method: string, params: Record<string, any> = {}, timeoutMs = 15000): Promise<T> {
        if (this.closed) return Promise.reject(new Error("CDP 连接已关闭"))
        const id = ++this.nextId
        return new Promise<T>((resolvePromise, rejectPromise) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                rejectPromise(new Error(`CDP 调用超时: ${method}`))
            }, timeoutMs)
            this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer })
            this.ws.send(JSON.stringify({ id, method, params }))
        })
    }

    on(method: string, handler: CdpEventHandler): void {
        let handlers = this.listeners.get(method)
        if (!handlers) {
            handlers = new Set()
            this.listeners.set(method, handlers)
        }
        handlers.add(handler)
    }

    waitForEvent(method: string, timeoutMs = 5000): Promise<any> {
        return new Promise((resolvePromise, rejectPromise) => {
            const handler = (params: any) => {
                clearTimeout(timer)
                this.listeners.get(method)?.delete(handler)
                resolvePromise(params)
            }
            const timer = setTimeout(() => {
                this.listeners.get(method)?.delete(handler)
                rejectPromise(new Error(`等待 CDP 事件超时: ${method}`))
            }, timeoutMs)
            this.on(method, handler)
        })
    }

    close(): void {
        this.closed = true
        try {
            this.ws.close()
        } catch {
            /* 忽略关闭异常 */
        }
        this.rejectAll(new Error("CDP 连接已关闭"))
    }
}

// ---------------------------------------------------------------------------
// HTTP 端点 / 目标选择
// ---------------------------------------------------------------------------

class CdpUnavailableError extends Error {
    constructor(
        readonly port: number,
        readonly hint = ""
    ) {
        super(`127.0.0.1:${port} 上没有 CDP 端点。${hint}`)
    }
}

async function fetchJson<T>(url: string, timeoutMs = 2000): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
    return (await response.json()) as T
}

async function fetchVersion(port: number): Promise<CdpVersion | null> {
    try {
        return await fetchJson<CdpVersion>(`http://127.0.0.1:${port}/json/version`, 1500)
    } catch {
        return null
    }
}

async function fetchTargets(port: number): Promise<CdpTarget[]> {
    return fetchJson<CdpTarget[]>(`http://127.0.0.1:${port}/json/list`, 3000)
}

function pageTargets(targets: CdpTarget[]): CdpTarget[] {
    return targets.filter(target => target.type === "page" && target.webSocketDebuggerUrl)
}

const HIDDEN_PAGE_PATTERN = /(?:screen-bar|float-window|cloudgame|about:blank)/i

async function measurePage(target: CdpTarget): Promise<{ width: number; height: number }> {
    let client: CdpClient | undefined
    try {
        client = await CdpClient.connect(target.webSocketDebuggerUrl!, 2000)
        const result = await client.send<any>("Runtime.evaluate", { expression: "[innerWidth, innerHeight]", returnByValue: true }, 2000)
        const [width, height] = result.result?.value ?? [0, 0]
        return { width: Number(width) || 0, height: Number(height) || 0 }
    } catch {
        return { width: 0, height: 0 }
    } finally {
        client?.close()
    }
}

/** 选择目标页：显式 --target 优先，否则排除隐藏窗口并取视口最大者 */
async function selectTarget(port: number, targetSelector?: string): Promise<CdpTarget> {
    const pages = pageTargets(await fetchTargets(port))
    if (pages.length === 0) throw new Error("没有可用的 page 目标（窗口可能还没创建）")

    if (targetSelector) {
        if (/^\d+$/.test(targetSelector)) {
            const index = Number(targetSelector) - 1
            const target = pages[index]
            if (!target) throw new Error(`--target ${targetSelector} 越界：只有 ${pages.length} 个 page 目标`)
            return target
        }
        const matched = pages.find(target => target.url.includes(targetSelector) || target.title.includes(targetSelector))
        if (!matched) throw new Error(`找不到匹配 "${targetSelector}" 的 page 目标`)
        return matched
    }

    const preferred = pages.filter(target => !HIDDEN_PAGE_PATTERN.test(target.url))
    const candidates = preferred.length > 0 ? preferred : pages
    if (candidates.length === 1) return candidates[0]

    let best = candidates[0]
    let bestArea = -1
    for (const target of candidates) {
        const { width, height } = await measurePage(target)
        const area = width * height
        if (area > bestArea) {
            best = target
            bestArea = area
        }
    }
    return best
}

interface PageOptions {
    port: number
    target?: string
    quiet: boolean
}

async function withPage<T>(options: PageOptions, fn: (client: CdpClient, target: CdpTarget) => Promise<T>): Promise<T> {
    const version = await fetchVersion(options.port)
    if (!version) {
        throw new CdpUnavailableError(
            options.port,
            `\n先运行 doctor 判断原因：没配置策略就用 policy ensure；应用已启动但没读到策略，请让用户重新启动。`
        )
    }
    const target = await selectTarget(options.port, options.target)
    if (!options.quiet) console.error(`# target: ${target.title || "(untitled)"}  ${target.url}`)
    const client = await CdpClient.connect(target.webSocketDebuggerUrl!)
    try {
        return await fn(client, target)
    } finally {
        client.close()
    }
}

// ---------------------------------------------------------------------------
// 求值 / 输入
// ---------------------------------------------------------------------------

function formatException(details: any): string {
    const description = details?.exception?.description ?? details?.text ?? "未知错误"
    if (!details?.url) return String(description)
    const line = (details.lineNumber ?? 0) + 1
    const column = (details.columnNumber ?? 0) + 1
    return `${description}\n  at ${details.url}:${line}:${column}`
}

const RETURN_VALUE_ERROR = /Object reference chain is too long|Could not return value|Unable to return value/i

async function evaluate(client: CdpClient, expression: string, timeoutMs = 15000): Promise<any> {
    const response = await client.send<any>(
        "Runtime.evaluate",
        {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
            allowUnsafeEvalBlockedByCSP: true,
        },
        timeoutMs
    )
    if (response.exceptionDetails) {
        const text = formatException(response.exceptionDetails)
        // 返回值无法序列化（循环引用等）时退化为 description，方便定位而不是直接失败
        if (RETURN_VALUE_ERROR.test(text)) {
            const fallback = await client.send<any>(
                "Runtime.evaluate",
                { expression, awaitPromise: true, returnByValue: false, userGesture: true },
                timeoutMs
            )
            if (fallback.exceptionDetails) throw new Error(formatException(fallback.exceptionDetails))
            return fallback.result?.description ?? fallback.result?.type
        }
        throw new Error(text)
    }
    const result = response.result
    if (!result) return undefined
    if (Object.hasOwn(result, "value")) return result.value
    if (result.unserializableValue !== undefined) return result.unserializableValue
    if (result.type === "undefined") return undefined
    return result.description ?? undefined
}

function printValue(value: unknown, json = false): void {
    if (json) {
        console.log(value === undefined ? "null" : JSON.stringify(value, null, 2))
        return
    }
    if (value === undefined) {
        console.log("undefined")
        return
    }
    if (typeof value === "string") {
        console.log(value)
        return
    }
    console.log(JSON.stringify(value, null, 2) ?? String(value))
}

interface ClickPoint {
    x: number
    y: number
    width: number
    height: number
    tag: string
    text: string
    hitTag: string
    hitIsSelf: boolean
}

async function resolveClickPoint(client: CdpClient, selector: string, timeoutMs: number): Promise<ClickPoint> {
    // 同名选择器可能同时命中隐藏的侧边栏和可见卡片，优先取第一个可见元素
    const expression = `(async () => {
        const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
        if (elements.length === 0) return { found: false, count: 0 };
        const visible = el => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
        };
        const el = elements.find(visible);
        if (!el) return { found: false, count: elements.length };
        el.scrollIntoView({ block: "center", inline: "center" });
        await new Promise(resolve => setTimeout(resolve, 60));
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return { found: false, count: elements.length };
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
            found: true, count: elements.length,
            x, y, width: rect.width, height: rect.height,
            tag: el.tagName,
            text: (el.innerText ?? "").trim().slice(0, 80),
            hitTag: hit ? hit.tagName : "none",
            hitIsSelf: hit === el || el.contains(hit),
        };
    })()`

    const deadline = Date.now() + timeoutMs
    let lastError = ""
    let matchCount = 0
    while (Date.now() < deadline) {
        try {
            const result = (await evaluate(client, expression, 5000)) as (ClickPoint & { found: boolean; count: number }) | null
            if (result?.found) return result
            matchCount = result?.count ?? 0
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error)
        }
        await Bun.sleep(150)
    }
    const reason = matchCount > 0 ? `匹配到 ${matchCount} 个元素，但都不可见` : "没有匹配元素"
    throw new Error(`找不到可点击的元素: ${selector}（${reason}）${lastError ? ` (${lastError})` : ""}`)
}

async function dispatchClick(client: CdpClient, x: number, y: number, clickCount = 1): Promise<void> {
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" })
    for (let count = 1; count <= clickCount; count++) {
        await client.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            buttons: 1,
            clickCount: count,
        })
        await Bun.sleep(20)
        await client.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            buttons: 0,
            clickCount: count,
        })
        if (count < clickCount) await Bun.sleep(40)
    }
}

interface KeySpec {
    key: string
    code: string
    keyCode: number
    text?: string
    modifiers: number
}

const NAMED_KEYS: Record<string, Omit<KeySpec, "modifiers">> = {
    Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    Esc: { key: "Escape", code: "Escape", keyCode: 27 },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    Delete: { key: "Delete", code: "Delete", keyCode: 46 },
    Space: { key: " ", code: "Space", keyCode: 32, text: " " },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    Home: { key: "Home", code: "Home", keyCode: 36 },
    End: { key: "End", code: "End", keyCode: 35 },
    PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
    PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
    Insert: { key: "Insert", code: "Insert", keyCode: 45 },
    F5: { key: "F5", code: "F5", keyCode: 116 },
    F12: { key: "F12", code: "F12", keyCode: 123 },
}

function parseKey(spec: string): KeySpec {
    const parts = spec.split("+")
    const keyName = parts.pop() ?? spec
    let modifiers = 0
    for (const part of parts) {
        switch (part.toLowerCase()) {
            case "ctrl":
            case "control":
                modifiers |= 2
                break
            case "shift":
                modifiers |= 8
                break
            case "alt":
                modifiers |= 1
                break
            case "meta":
            case "cmd":
            case "win":
                modifiers |= 4
                break
            default:
                throw new Error(`未知修饰键: ${part}`)
        }
    }

    const named = NAMED_KEYS[keyName] ?? NAMED_KEYS[keyName[0]?.toUpperCase() + keyName.slice(1)]
    if (named) return { ...named, modifiers }

    if (keyName.length === 1) {
        const char = keyName
        const upper = char.toUpperCase()
        if (/[a-z]/i.test(char)) {
            return { key: char, code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: char, modifiers }
        }
        if (/\d/.test(char)) {
            return { key: char, code: `Digit${char}`, keyCode: char.charCodeAt(0), text: char, modifiers }
        }
        return { key: char, code: "", keyCode: 0, text: char, modifiers }
    }

    throw new Error(`不支持的按键: ${spec}`)
}

async function dispatchKey(client: CdpClient, spec: KeySpec): Promise<void> {
    await client.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: spec.key,
        code: spec.code,
        windowsVirtualKeyCode: spec.keyCode,
        nativeVirtualKeyCode: spec.keyCode,
        modifiers: spec.modifiers,
        text: spec.text,
        unmodifiedText: spec.text,
    })
    await client.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: spec.key,
        code: spec.code,
        windowsVirtualKeyCode: spec.keyCode,
        nativeVirtualKeyCode: spec.keyCode,
        modifiers: spec.modifiers,
    })
}

async function activateWindow(client: CdpClient): Promise<any> {
    return evaluate(
        client,
        `(async () => {
            const api = window.__TAURI__?.window;
            if (!api?.getCurrentWindow) throw new Error("window.__TAURI__.window 不可用（withGlobalTauri 未开启？）");
            const win = api.getCurrentWindow();
            await win.show();
            if (win.unminimize) await win.unminimize();
            await win.setFocus();
            return { visible: await win.isVisible(), maximized: await win.isMaximized() };
        })()`
    )
}

const WAIT_POLL_MS = 150

async function waitForExpression(client: CdpClient, expression: string, timeoutMs: number, gone = false): Promise<any> {
    const deadline = Date.now() + timeoutMs
    let lastError = ""
    let lastValue: any
    while (Date.now() < deadline) {
        try {
            const value = await evaluate(client, expression, 5000)
            lastValue = value
            if (gone ? !value : Boolean(value)) return value
            lastError = ""
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error)
        }
        await Bun.sleep(WAIT_POLL_MS)
    }
    const detail = lastError ? ` 最后错误: ${lastError}` : ` 最后值: ${JSON.stringify(lastValue)}`
    throw new Error(`等待超时 (${timeoutMs}ms): ${expression}${detail}`)
}

function visibilityExpression(selector: string): string {
    return `(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    })()`
}

// ---------------------------------------------------------------------------
// HKLM CDP 策略（唯一由 agent 管理的部分；应用生命周期仍归用户）
// ---------------------------------------------------------------------------

interface ExecResult {
    code: number
    stdout: string
    stderr: string
}

let elevatedCache: boolean | undefined

async function isElevated(): Promise<boolean> {
    if (elevatedCache !== undefined) return elevatedCache
    const proc = Bun.spawn(["whoami.exe", "/groups"], { stdout: "pipe", stderr: "pipe" })
    const text = await new Response(proc.stdout).text()
    await proc.exited
    elevatedCache = text.includes("S-1-16-12288") || text.includes("S-1-16-16384")
    return elevatedCache
}

/** 非提权时通过 UAC 提权执行临时脚本；提权后由用户确认 UAC 弹窗 */
async function runPowerShell(script: string, elevated: boolean): Promise<ExecResult> {
    await mkdir(TMP_DIR, { recursive: true })
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const scriptPath = join(TMP_DIR, `ps-${stamp}.ps1`)
    await Bun.write(scriptPath, `$ErrorActionPreference = 'Stop'\n${script}\n`)

    let argv: string[]
    if (elevated && !(await isElevated())) {
        const helperPath = join(TMP_DIR, "run-elevated.ps1")
        await Bun.write(
            helperPath,
            [
                "param([string]$Script)",
                "try {",
                "  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$Script) -Verb RunAs -Wait -PassThru",
                "  exit $p.ExitCode",
                "} catch {",
                "  Write-Error $_",
                "  exit 1",
                "}",
                "",
            ].join("\n")
        )
        argv = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helperPath, scriptPath]
    } else {
        argv = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]
    }

    const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    return { code, stdout, stderr }
}

function psQuote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`
}

function policyArgs(port: number): string {
    return `--remote-debugging-port=${port} --remote-allow-origins=*`
}

interface PolicyState {
    values: Record<string, string>
}

/** 读取 HKLM 策略中与 CDP 相关的值（只读，不需要提权） */
async function readPolicy(): Promise<PolicyState> {
    const proc = Bun.spawn(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            `$key = ${psQuote(POLICY_KEY)}; if (Test-Path $key) { $props = Get-ItemProperty -Path $key; $out = @{}; foreach ($p in $props.PSObject.Properties) { if ($p.Name -like 'PS*') { continue } $out[$p.Name] = [string]$p.Value }; $out | ConvertTo-Json -Compress } else { '{}' }`,
        ],
        { stdout: "pipe", stderr: "pipe" }
    )
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (code !== 0) return { values: {} }
    try {
        const parsed = JSON.parse(stdout.trim() || "{}")
        return { values: typeof parsed === "object" && parsed ? parsed : {} }
    } catch {
        return { values: {} }
    }
}

function cdpPolicyNames(state: PolicyState): string[] {
    return Object.entries(state.values)
        .filter(([, value]) => value.includes("remote-debugging-port"))
        .map(([name]) => name)
}

/** 值里配置的端口；解析不到时返回 undefined */
function policyPort(value: string): number | undefined {
    const match = value.match(/--remote-debugging-port=(\d+)/)
    return match ? Number(match[1]) : undefined
}

/** 值里是否配置了目标端口 */
function matchesPort(value: string, port: number): boolean {
    const configured = policyPort(value)
    return configured === port
}

function expectedExeNames(explicit?: string): string[] {
    const names = new Set<string>()
    if (explicit) names.add(basename(explicit).endsWith(".exe") ? basename(explicit) : `${basename(explicit)}.exe`)
    for (const name of DEFAULT_EXE_NAMES) names.add(`${name}.exe`)
    return [...names]
}

/** 写入 HKLM 策略（需要管理员；非提权时触发 UAC） */
async function writePolicy(exeNames: string[], port: number): Promise<void> {
    const args = policyArgs(port)
    const lines = [
        `$key = ${psQuote(POLICY_KEY)}`,
        "New-Item -Path $key -Force | Out-Null",
        ...exeNames.map(name => `Set-ItemProperty -Path $key -Name ${psQuote(name)} -Value ${psQuote(args)} -Type String -Force`),
    ]
    const result = await runPowerShell(lines.join("\n"), true)
    if (result.code !== 0) {
        throw new Error(
            `写入 HKLM CDP 策略失败: ${result.stderr.trim() || `exit ${result.code}`}\n` +
                `手动执行: reg add "${POLICY_REG_PATH}" /v dna-builder.exe /t REG_SZ /d "${args}" /f`
        )
    }
    // 回读校验，避免提权被拒却误报成功
    const state = await readPolicy()
    const missing = exeNames.filter(name => !state.values[name]?.includes(`--remote-debugging-port=${port}`))
    if (missing.length > 0) {
        throw new Error(`策略写入后校验失败，缺少: ${missing.join(", ")}（可能被 UAC 拒绝或权限不足）`)
    }
}

/** 只删除值中包含 remote-debugging-port 的项，避免影响其它 WebView2 调试配置 */
async function removePolicy(): Promise<string[]> {
    const resultFile = join(TMP_DIR, `policy-clean-${Date.now()}.txt`)
    const script = `
$key = ${psQuote(POLICY_KEY)}
$removed = @()
if (Test-Path $key) {
  $props = Get-ItemProperty -Path $key
  foreach ($prop in $props.PSObject.Properties) {
    if ($prop.Name -like 'PS*') { continue }
    if ([string]$prop.Value -match 'remote-debugging-port') {
      Remove-ItemProperty -Path $key -Name $prop.Name -Force
      $removed += $prop.Name
    }
  }
}
$removed -join ',' | Out-File -FilePath ${psQuote(resultFile)} -Encoding utf8
`
    const result = await runPowerShell(script, true)
    if (result.code !== 0) {
        throw new Error(
            `删除 HKLM CDP 策略失败: ${result.stderr.trim() || `exit ${result.code}`}\n` +
                `手动执行: reg delete "${POLICY_REG_PATH}" /v dna-builder.exe /f`
        )
    }
    try {
        const raw = (await Bun.file(resultFile).text()).trim()
        return raw ? raw.split(",").filter(Boolean) : []
    } catch {
        return []
    }
}

async function isProcessRunning(processName: string): Promise<boolean> {
    const proc = Bun.spawn(
        [
            "powershell.exe",
            "-NoProfile",
            "-Command",
            `if (Get-Process -Name ${psQuote(processName)} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`,
        ],
        { stdout: "pipe", stderr: "pipe" }
    )
    return (await proc.exited) === 0
}

/** 只读探测应用是否在运行（不结束、不启动） */
async function detectRunningApp(): Promise<{ name: string; running: boolean }[]> {
    return Promise.all(DEFAULT_EXE_NAMES.map(async name => ({ name, running: await isProcessRunning(name) })))
}

// ---------------------------------------------------------------------------
// 命令实现
// ---------------------------------------------------------------------------

function commonPageOptions(args: CliArgs): PageOptions {
    return {
        port: flagNumber(args, "port", DEFAULT_PORT),
        target: flagString(args, "target"),
        quiet: flagBool(args, "quiet"),
    }
}

async function cmdInfo(args: CliArgs): Promise<void> {
    const port = flagNumber(args, "port", DEFAULT_PORT)
    const version = await fetchVersion(port)
    if (!version) throw new CdpUnavailableError(port, "\n先运行 doctor 判断原因。")
    if (flagBool(args, "json")) {
        console.log(JSON.stringify(version, null, 2))
    } else {
        console.log(`Browser: ${version.Browser}`)
        console.log(`Protocol: ${version["Protocol-Version"]}`)
        console.log(`WebSocket: ${version.webSocketDebuggerUrl}`)
    }
}

async function printTargets(args: CliArgs): Promise<void> {
    const port = flagNumber(args, "port", DEFAULT_PORT)
    const targets = await fetchTargets(port)
    const pages = pageTargets(targets)
    const defaultTarget = pages.length > 0 ? await selectTarget(port) : undefined
    const sizes = await Promise.all(pages.map(page => measurePage(page)))

    if (flagBool(args, "json")) {
        console.log(
            JSON.stringify(
                targets.map(target => ({
                    ...target,
                    default: target.id === defaultTarget?.id,
                    size: pages.includes(target) ? sizes[pages.indexOf(target)] : undefined,
                })),
                null,
                2
            )
        )
        return
    }

    console.log(`BROWSER ${(await fetchVersion(port))?.Browser ?? "unknown"}`)
    console.log("")
    const rows = targets.map(target => {
        const pageIndex = pages.indexOf(target)
        const isPage = pageIndex >= 0
        const size = isPage ? `${sizes[pageIndex].width}x${sizes[pageIndex].height}` : "-"
        const mark = target.id === defaultTarget?.id ? "*" : " "
        return {
            mark,
            size,
            type: target.type,
            title: target.title || "(untitled)",
            url: target.url,
        }
    })
    const width = Math.max(...rows.map(row => row.size.length), 4)
    for (const row of rows) {
        console.log(`${row.mark}  ${row.size.padEnd(width)}  ${row.type.padEnd(7)}  ${row.title}  ${row.url}`)
    }
    console.log("")
    console.log(`* = 默认目标（--target <序号|URL 片段> 可覆盖）`)
}

async function cmdEval(args: CliArgs): Promise<void> {
    const file = flagString(args, "file")
    const expression = file ? `(async () => {\n${await Bun.file(file).text()}\n})()` : args.positionals[0]
    if (!expression) throw new Error("用法: eval <表达式> 或 eval --file <脚本文件>")
    const value = await withPage(commonPageOptions(args), client => evaluate(client, expression))
    printValue(value, flagBool(args, "json"))
}

async function cmdCall(args: CliArgs): Promise<void> {
    const command = args.positionals[0]
    if (!command) throw new Error("用法: call <tauri 命令名> [JSON 参数]")
    const rawArgs = args.positionals[1] ?? "{}"
    let parsedArgs: unknown
    try {
        parsedArgs = JSON.parse(rawArgs)
    } catch {
        throw new Error(`参数不是合法 JSON: ${rawArgs}`)
    }
    const expression = `(async () => {
        const api = window.__TAURI__?.core;
        if (!api?.invoke) throw new Error("window.__TAURI__.core.invoke 不可用（withGlobalTauri 未开启？）");
        return await api.invoke(${JSON.stringify(command)}, ${JSON.stringify(parsedArgs)});
    })()`
    const value = await withPage(commonPageOptions(args), client => evaluate(client, expression, 60000))
    printValue(value, flagBool(args, "json"))
}

async function cmdClick(args: CliArgs): Promise<void> {
    const selector = flagString(args, "selector") ?? args.positionals[0]
    const xy = flagString(args, "xy")
    const timeout = flagNumber(args, "timeout", 5000)
    const count = flagNumber(args, "count", 1)
    if (!xy && !selector) throw new Error("用法: click <选择器> 或 click --xy x,y")

    await withPage(commonPageOptions(args), async client => {
        await client.send("Page.bringToFront").catch(() => {})
        if (flagBool(args, "activate")) await activateWindow(client).catch(() => {})

        let x: number
        let y: number
        if (xy) {
            const parts = xy.split(",").map(part => Number(part.trim()))
            if (parts.length !== 2 || parts.some(part => !Number.isFinite(part))) {
                throw new Error(`--xy 需要 "x,y"，收到: ${xy}`)
            }
            ;[x, y] = parts
        } else {
            const point = await resolveClickPoint(client, selector!, timeout)
            if (!point.hitIsSelf && !flagBool(args, "force")) {
                throw new Error(
                    `元素 ${selector} 在 (${Math.round(point.x)}, ${Math.round(point.y)}) 被 <${point.hitTag}> 遮挡；` +
                        `确认要点击时加 --force，或改用 --xy`
                )
            }
            x = point.x
            y = point.y
            console.log(`# ${point.tag} (${Math.round(point.width)}x${Math.round(point.height)}) ${point.text}`)
        }

        await dispatchClick(client, x, y, count)
        const waitExpr = flagString(args, "wait")
        if (waitExpr) {
            const value = await waitForExpression(client, waitExpr, flagNumber(args, "timeout", 10000))
            printValue(value)
        }
    })
}

async function cmdHover(args: CliArgs): Promise<void> {
    const selector = flagString(args, "selector") ?? args.positionals[0]
    if (!selector) throw new Error("用法: hover <选择器>")
    await withPage(commonPageOptions(args), async client => {
        await client.send("Page.bringToFront").catch(() => {})
        const point = await resolveClickPoint(client, selector, flagNumber(args, "timeout", 5000))
        await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none" })
        console.log(`# hover ${point.tag} (${Math.round(point.x)}, ${Math.round(point.y)})`)
    })
}

async function cmdType(args: CliArgs): Promise<void> {
    const text = flagString(args, "text") ?? args.positionals.join(" ")
    const selector = flagString(args, "selector")
    await withPage(commonPageOptions(args), async client => {
        await client.send("Page.bringToFront").catch(() => {})
        if (selector) {
            const focused = await evaluate(
                client,
                `(() => {
                    const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
                    const visible = el => {
                        const rect = el.getBoundingClientRect();
                        const style = getComputedStyle(el);
                        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
                    };
                    const el = elements.find(visible);
                    if (!el) return false;
                    el.focus();
                    if (typeof el.select === "function") el.select();
                    return true;
                })()`
            )
            if (!focused) throw new Error(`找不到可见的输入元素: ${selector}`)
        }
        if (flagBool(args, "clear")) {
            await dispatchKey(client, parseKey("Ctrl+A"))
            await dispatchKey(client, parseKey("Backspace"))
        }
        await client.send("Input.insertText", { text })
        if (selector) {
            const value = await evaluate(
                client,
                `(() => { const el = document.activeElement; return el ? (el.value ?? el.innerText ?? "") : null; })()`
            )
            printValue(value)
        } else {
            console.log(`typed ${text.length} chars`)
        }
    })
}

async function cmdPress(args: CliArgs): Promise<void> {
    const spec = flagString(args, "key") ?? args.positionals[0]
    if (!spec) throw new Error("用法: press <按键，如 Enter / Escape / Ctrl+A>")
    const key = parseKey(spec)
    await withPage(commonPageOptions(args), async client => {
        await client.send("Page.bringToFront").catch(() => {})
        await dispatchKey(client, key)
        console.log(`pressed ${spec}`)
    })
}

async function cmdWait(args: CliArgs): Promise<void> {
    const selector = flagString(args, "selector")
    const expression = selector ? visibilityExpression(selector) : args.positionals[0]
    if (!expression) throw new Error("用法: wait <表达式> / wait --selector <选择器> [--gone] [--timeout ms]")
    const timeout = flagNumber(args, "timeout", 10000)
    const value = await withPage(commonPageOptions(args), client => waitForExpression(client, expression, timeout, flagBool(args, "gone")))
    printValue(value, flagBool(args, "json"))
}

async function cmdScreenshot(args: CliArgs): Promise<void> {
    const format = (flagString(args, "format", "png") ?? "png").toLowerCase()
    if (!["png", "jpeg", "webp"].includes(format)) throw new Error(`不支持的图片格式: ${format}`)
    const extension = format === "jpeg" ? "jpg" : format
    const outFlag = flagString(args, "out") ?? args.positionals[0]
    const outPath = outFlag
        ? isAbsolute(outFlag)
            ? outFlag
            : resolve(process.cwd(), outFlag)
        : join(TMP_DIR, `shot-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`)

    await withPage(commonPageOptions(args), async client => {
        await client.send("Page.bringToFront").catch(() => {})
        if (flagBool(args, "activate")) {
            await activateWindow(client).catch(error => {
                console.error(`# 激活窗口失败（继续截图）: ${error instanceof Error ? error.message : String(error)}`)
            })
            await Bun.sleep(300)
        }
        const result = await client.send<any>("Page.captureScreenshot", {
            format,
            fromSurface: true,
            captureBeyondViewport: flagBool(args, "full"),
        })
        if (!result?.data) throw new Error("截图失败：Page.captureScreenshot 没有返回数据")
        await mkdir(dirname(outPath), { recursive: true })
        await Bun.write(outPath, Buffer.from(result.data, "base64"))
        console.log(outPath)
    })
}

function formatConsoleArg(arg: any): string {
    if (!arg) return String(arg)
    if (Object.hasOwn(arg, "value")) {
        return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value)
    }
    if (arg.unserializableValue !== undefined) return arg.unserializableValue
    if (arg.description !== undefined) return arg.description
    return arg.type ?? "unknown"
}

async function cmdConsole(args: CliArgs): Promise<void> {
    const seconds = flagNumber(args, "seconds", 5)
    const json = flagBool(args, "json")
    const failOnError = flagBool(args, "fail-on-error")
    const errors: string[] = []

    await withPage(commonPageOptions(args), async client => {
        const emit = (entry: Record<string, any>) => {
            if (json) {
                console.log(JSON.stringify(entry))
                return
            }
            const location = entry.url ? ` (${entry.url}${entry.line ? `:${entry.line}` : ""})` : ""
            console.log(`[${entry.kind}.${entry.level}] ${entry.text}${location}`)
        }

        client.on("Runtime.consoleAPICalled", params => {
            const text = (params.args ?? []).map(formatConsoleArg).join(" ")
            const level = String(params.type ?? "log")
            emit({ kind: "console", level, text })
            if (level === "error" || level === "assert") errors.push(text)
        })
        client.on("Runtime.exceptionThrown", params => {
            const details = params.exceptionDetails ?? {}
            const text = details.exception?.description ?? details.text ?? "unknown exception"
            emit({ kind: "exception", level: "error", text, url: details.url, line: details.lineNumber })
            errors.push(text)
        })
        client.on("Log.entryAdded", params => {
            const entry = params.entry ?? {}
            const level = String(entry.level ?? "info")
            emit({ kind: "log", level, text: entry.text ?? "", url: entry.url, line: entry.lineNumber })
            if (level === "error") errors.push(entry.text ?? "")
        })

        await client.send("Runtime.enable")
        await client.send("Log.enable")
        await client.send("Page.enable")
        if (flagBool(args, "reload")) {
            const loaded = client.waitForEvent("Page.loadEventFired", 10000).catch(() => undefined)
            await client.send("Page.reload", { ignoreCache: true })
            await loaded
        }
        console.error(`# 监听控制台 ${seconds}s（Ctrl+C 结束）`)
        await Bun.sleep(seconds * 1000)
    })

    if (failOnError && errors.length > 0) {
        throw new Error(`捕获到 ${errors.length} 条错误/异常`)
    }
}

async function cmdReload(args: CliArgs): Promise<void> {
    await withPage(commonPageOptions(args), async client => {
        const loaded = client.waitForEvent("Page.loadEventFired", flagNumber(args, "timeout", 15000)).catch(() => undefined)
        await client.send("Page.reload", { ignoreCache: true })
        await loaded
        console.log("reloaded")
    })
}

async function cmdFocus(args: CliArgs): Promise<void> {
    const value = await withPage(commonPageOptions(args), client => activateWindow(client))
    printValue(value, flagBool(args, "json"))
}

/**
 * 连接诊断：端点可用 → 列出目标；不可用 → 判断原因并给出下一步。
 * 只读，不改策略、不碰进程。策略配置用 `policy ensure`。
 */
async function cmdDoctor(args: CliArgs): Promise<void> {
    const port = flagNumber(args, "port", DEFAULT_PORT)
    const version = await fetchVersion(port)
    if (version) {
        console.log(`✅ CDP 可用: ${version.Browser} @ http://127.0.0.1:${port}`)
        const targets = await fetchTargets(port).catch(() => [] as CdpTarget[])
        if (pageTargets(targets).length === 0) {
            console.log("⚠ 端点可用，但暂时没有 page 目标（窗口可能还没创建、已隐藏或已关闭）")
            return
        }
        await printTargets(args)
        return
    }

    const policy = await readPolicy()
    const configured = cdpPolicyNames(policy)
    const configuredForPort = configured.filter(name => matchesPort(policy.values[name], port))
    const otherPorts = configured
        .filter(name => !matchesPort(policy.values[name], port))
        .map(name => `${name}=${policyPort(policy.values[name]) ?? "?"}`)
    const apps = await detectRunningApp()
    const running = apps.filter(app => app.running).map(app => app.name)

    console.log(`❌ 127.0.0.1:${port} 上没有 CDP 端点\n`)
    console.log(`HKLM CDP 策略: ${configured.length > 0 ? configured.join(", ") : "未配置"}`)
    if (otherPorts.length > 0) console.log(`其中非 ${port} 端口: ${otherPorts.join(", ")}`)
    console.log(`应用进程: ${running.length > 0 ? running.join(", ") : "未运行"}\n`)

    if (otherPorts.length > 0 && configuredForPort.length === 0) {
        console.log(`原因: 策略里配置的是其它端口，不是 ${port}。`)
        console.log("下一步: 由 agent 执行 `policy ensure` 覆盖为当前端口，然后请用户重新启动应用。")
    } else if (running.length > 0 && configuredForPort.length === 0) {
        console.log("原因: 应用已启动，但启动前没有针对该端口的 HKLM CDP 策略。")
        console.log("下一步: 由 agent 执行 `policy ensure`（写 HKLM），然后请用户退出并重新启动应用。")
    } else if (running.length > 0) {
        console.log("原因: 策略已配置，但应用是在策略生效前启动的（WebView2 只在启动时读取策略）。")
        console.log("下一步: 请用户退出并重新启动应用（agent 不结束进程）。")
    } else if (configuredForPort.length === 0) {
        console.log("原因: 应用未运行，且没有针对该端口的 HKLM CDP 策略。")
        console.log("下一步: 先由 agent 执行 `policy ensure`，再请用户启动应用。")
    } else {
        console.log("原因: 应用未运行（策略已配置，启动后会生效）。")
        console.log("下一步: 请用户启动应用。")
    }
    console.log(`\n排查: reg query "${POLICY_REG_PATH}"；netstat -ano | findstr :${port}`)
}

/** 配置 HKLM 策略（agent 负责）；不重启应用，只提示用户重启 */
async function cmdPolicyEnsure(args: CliArgs): Promise<void> {
    const port = flagNumber(args, "port", DEFAULT_PORT)
    const exeNames = expectedExeNames(flagString(args, "exe"))
    await writePolicy(exeNames, port)
    console.log(`✅ 已写入 HKLM CDP 策略: ${exeNames.join(", ")} -> ${policyArgs(port)}`)

    const apps = await detectRunningApp()
    const running = apps.filter(app => app.running).map(app => app.name)
    if (running.length > 0) {
        console.log(`⚠ 应用正在运行 (${running.join(", ")})。WebView2 只在启动时读取策略，请让用户退出并重新启动。`)
        console.log("   agent 不结束进程。")
    } else {
        console.log("应用当前未运行，用户下次启动即会开放 CDP 端口。")
    }
    console.log(`清理: bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts policy remove`)
}

/** 移除 HKLM 策略（agent 负责；测试结束或用户要求关闭调试时执行） */
async function cmdPolicyRemove(args: CliArgs): Promise<void> {
    const removed = await removePolicy()
    if (flagBool(args, "json")) {
        console.log(JSON.stringify({ removed }))
    } else {
        console.log(removed.length > 0 ? `✅ 已移除 HKLM CDP 策略: ${removed.join(", ")}` : "没有需要移除的 HKLM CDP 策略")
    }
    console.log("已运行的应用不会受影响；下次启动将不再开放 CDP 端口。")
}

async function cmdPolicyStatus(args: CliArgs): Promise<void> {
    const state = await readPolicy()
    const configured = cdpPolicyNames(state)
    const apps = await detectRunningApp()
    if (flagBool(args, "json")) {
        console.log(
            JSON.stringify(
                {
                    policy: configured.map(name => ({ name, value: state.values[name] })),
                    apps,
                },
                null,
                2
            )
        )
        return
    }
    console.log(configured.length > 0 ? `HKLM CDP 策略: ${configured.join(", ")}` : "HKLM CDP 策略: 未配置")
    for (const name of configured) console.log(`  ${name} = ${state.values[name]}`)
    console.log(
        `应用进程: ${
            apps
                .filter(app => app.running)
                .map(app => app.name)
                .join(", ") || "未运行"
        }`
    )
}

const HELP = `Tauri 桌面端 CDP 调试 CLI（Windows / WebView2）
应用由用户用 bun dd / bun dd2 启动；本工具不启动、不结束进程。
agent 只负责 HKLM CDP 策略的配置（policy ensure）与清理（policy remove）。

用法: bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts <命令> [参数] [选项]

命令:
  doctor                诊断连接：端点可用则列目标；不可用则判断是没启动还是没配置策略
  policy ensure         写入 HKLM CDP 策略（需要管理员，会弹 UAC）；不重启应用
  policy remove         移除 HKLM CDP 策略（测试结束 / 用户要求关闭调试时执行）
  policy status         查看当前策略值与应用进程状态（只读）
  targets               列出 WebView2 目标（page / service_worker）与视口尺寸
  info                  显示 CDP 浏览器版本
  eval <表达式>         在页面执行 JS（支持 await，返回 JSON/字符串）
  eval --file <文件>    执行 JS 文件（作为 async 函数体）
  call <命令> [JSON]    调用 Tauri 命令：window.__TAURI__.core.invoke
  click <选择器>        点击元素中心；--xy x,y 点坐标；--count 2 双击
  hover <选择器>        移动鼠标到元素
  type <文本>           向焦点元素插入文本；--selector 先聚焦；--clear 先清空
  press <按键>          按键，如 Enter / Escape / Tab / Ctrl+A
  wait <表达式>         轮询到表达式为真；--selector 等待元素可见；--gone 等待消失
  screenshot [路径]     截图（默认 .tmp/tauri-cdp/）；--full 整页；--activate 先显示窗口
  console               监听控制台；--seconds 5；--reload 先刷新；--fail-on-error
  reload                刷新页面
  focus                 显示/还原/聚焦窗口（调用 Tauri window API）

选项:
  --port <n>            CDP 端口（默认 9222，或 TAURI_CDP_PORT）
  --target <序号|片段>  选择 page 目标（序号从 1 开始）
  --timeout <ms>        等待超时（默认 5000/10000，视命令而定）
  --exe <名称|路径>     policy ensure 时额外写入的 exe 文件名（默认 dna-builder.exe 与 DNA Builder.exe）
  --json                结构化输出
  --quiet               隐藏进度信息
  --help                显示本帮助

示例:
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts doctor
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts policy ensure
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts targets
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts eval "document.title"
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts call get_os_version
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts click "a[href='#/char']"
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts screenshot .tmp/desktop.png
  bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts policy remove
`

async function main(): Promise<void> {
    const [command, ...rest] = Bun.argv.slice(2)
    if (!command || command === "--help" || command === "-h" || command === "help") {
        console.log(HELP)
        return
    }
    const args = parseArgs(rest)
    if (flagBool(args, "help")) {
        console.log(HELP)
        return
    }

    switch (command) {
        case "doctor":
            return cmdDoctor(args)
        case "policy": {
            const sub = args.positionals.shift()
            switch (sub) {
                case "ensure":
                    return cmdPolicyEnsure(args)
                case "remove":
                    return cmdPolicyRemove(args)
                case "status":
                    return cmdPolicyStatus(args)
                default:
                    throw new Error(`用法: policy ensure | remove | status`)
            }
        }
        case "targets":
            return printTargets(args)
        case "info":
            return cmdInfo(args)
        case "eval":
            return cmdEval(args)
        case "call":
            return cmdCall(args)
        case "click":
            return cmdClick(args)
        case "hover":
            return cmdHover(args)
        case "type":
            return cmdType(args)
        case "press":
            return cmdPress(args)
        case "wait":
            return cmdWait(args)
        case "screenshot":
            return cmdScreenshot(args)
        case "console":
            return cmdConsole(args)
        case "reload":
            return cmdReload(args)
        case "focus":
            return cmdFocus(args)
        default:
            throw new Error(`未知命令: ${command}\n\n${HELP}`)
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(`❌ ${error instanceof Error ? error.message : String(error)}`)
        process.exit(error instanceof CdpUnavailableError ? 2 : 1)
    })
