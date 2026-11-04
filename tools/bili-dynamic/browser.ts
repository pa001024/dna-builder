/**
 * @file 启动本机 Chrome/Edge，通过 CDP 量出页面真实高度后整页截图，避免固定窗口裁切。
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { ScreenshotResult } from "./types.ts"

interface CdpMessage {
    id?: number
    method?: string
    params?: unknown
    result?: unknown
    error?: { message?: string }
}

type WsListener = (event: { data?: unknown }) => void

interface WsLike {
    addEventListener(type: string, listener: WsListener): void
    send(data: string): void
    close(): void
}

interface PendingCall {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

class CdpClient {
    private socket: WsLike
    private nextId = 1
    private pending = new Map<number, PendingCall>()
    private listeners = new Map<string, Array<(params: unknown) => void>>()

    private constructor(socket: WsLike) {
        this.socket = socket
        socket.addEventListener("message", event => {
            const message = JSON.parse(String(event.data)) as CdpMessage
            if (message.id && this.pending.has(message.id)) {
                const waiter = this.pending.get(message.id)
                this.pending.delete(message.id)
                if (message.error) waiter?.reject(new Error(message.error.message ?? "CDP 调用失败"))
                else waiter?.resolve(message.result)
                return
            }
            if (message.method) {
                for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
            }
        })
        // 浏览器崩溃/退出时 WebSocket 会关掉，挂起的调用必须立刻失败，否则 await 永远不返回
        const failAll = () => {
            for (const waiter of this.pending.values()) waiter.reject(new Error("浏览器调试连接已关闭"))
            this.pending.clear()
        }
        socket.addEventListener("close", failAll)
        socket.addEventListener("error", failAll)
    }

    static connect(url: string): Promise<CdpClient> {
        const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => WsLike }).WebSocket
        if (!WebSocketCtor) throw new Error("当前 Node.js 没有内置 WebSocket，请升级到 Node.js 22+")

        return new Promise((resolve, reject) => {
            const socket = new WebSocketCtor(url)
            const timer = setTimeout(() => reject(new Error("连接浏览器调试端口超时")), 15_000)
            socket.addEventListener("open", () => {
                clearTimeout(timer)
                resolve(new CdpClient(socket))
            })
            socket.addEventListener("error", () => {
                clearTimeout(timer)
                reject(new Error("连接浏览器调试端口失败"))
            })
        })
    }

    send<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
        const id = this.nextId++
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error(`CDP 调用超时：${method}`))
            }, timeoutMs)
            this.pending.set(id, {
                resolve: value => {
                    clearTimeout(timer)
                    resolve(value as T)
                },
                reject: error => {
                    clearTimeout(timer)
                    reject(error)
                },
            })
            this.socket.send(JSON.stringify({ id, method, params }))
        })
    }

    once(method: string, timeoutMs = 20_000): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`等待浏览器事件超时：${method}`)), timeoutMs)
            const listener = (params: unknown) => {
                clearTimeout(timer)
                this.listeners.set(
                    method,
                    (this.listeners.get(method) ?? []).filter(item => item !== listener)
                )
                resolve(params)
            }
            this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener])
        })
    }

    close(): void {
        this.socket.close()
    }
}

function windowsCandidates(): string[] {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files"
    const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"
    const localAppData = process.env.LOCALAPPDATA ?? ""
    return [
        path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]
}

function macCandidates(): string[] {
    return [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
}

export function findBrowser(): string {
    if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH

    const candidates = process.platform === "win32" ? windowsCandidates() : process.platform === "darwin" ? macCandidates() : []
    for (const candidate of candidates) {
        if (candidate && existsSync(candidate)) return candidate
    }

    const lookup = process.platform === "win32" ? "where" : "which"
    for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "msedge"]) {
        try {
            const found = execFileSync(lookup, [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true })
                .trim()
                .split(/\r?\n/)[0]
            if (found && existsSync(found)) return found
        } catch {
            // 继续尝试下一个名字
        }
    }

    throw new Error("找不到 Chrome/Edge，请设置 CHROME_PATH 指向浏览器可执行文件")
}

function pngSize(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 24 || buffer[0] !== 0x89 || buffer.toString("latin1", 1, 4) !== "PNG") return null
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function killTree(child: ChildProcess): void {
    if (!child.pid) return
    if (process.platform === "win32") {
        try {
            execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true })
        } catch {
            // 进程可能已经退出
        }
        return
    }
    try {
        child.kill("SIGKILL")
    } catch {
        // 进程可能已经退出
    }
}

async function waitForDevToolsPort(profileDir: string): Promise<number> {
    const file = path.join(profileDir, "DevToolsActivePort")
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
        if (existsSync(file)) {
            try {
                const [portLine] = readFileSync(file, "utf8").split(/\r?\n/)
                const port = Number(portLine)
                if (Number.isInteger(port) && port > 0) return port
            } catch {
                // Windows 上浏览器还在写这个文件，稍后重试
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error("等待浏览器调试端口超时")
}

async function findPageTarget(port: number): Promise<string> {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/list`)
            const targets = (await response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>
            const page = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl)
            if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
        } catch {
            // 浏览器还没准备好
        }
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error("找不到浏览器页面调试目标")
}

/** 上次被 SIGINT / CI 超时打断时会留下 profile 目录，启动前顺手清掉 */
function cleanStaleProfiles(dir: string): void {
    try {
        for (const entry of readdirSync(dir)) {
            if (entry.startsWith(".chrome-profile-")) {
                try {
                    rmSync(path.join(dir, entry), { recursive: true, force: true, maxRetries: 2, retryDelay: 100 })
                } catch {
                    // 还有浏览器在用它就跳过
                }
            }
        }
    } catch {
        // 输出目录还不存在
    }
}

export async function captureFullPage(options: {
    htmlPath: string
    outPath: string
    width: number
    minHeight: number
    scale?: number
}): Promise<ScreenshotResult> {
    const { htmlPath, outPath, width, minHeight, scale = 2 } = options
    const browser = findBrowser()
    const outDir = path.dirname(outPath)
    cleanStaleProfiles(outDir)
    const profileDir = path.join(outDir, `.chrome-profile-${process.pid}-${Date.now()}`)
    rmSync(profileDir, { recursive: true, force: true })
    mkdirSync(profileDir, { recursive: true })

    const child = spawn(
        browser,
        [
            "--headless=new",
            "--remote-debugging-port=0",
            "--remote-allow-origins=*",
            `--user-data-dir=${profileDir}`,
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--disable-sync",
            "--disable-background-networking",
            "--disable-component-update",
            "--mute-audio",
            `--window-size=${width},${minHeight}`,
            "about:blank",
        ],
        { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }
    )

    let stderr = ""
    child.stderr?.on("data", chunk => {
        stderr = `${stderr}${String(chunk)}`.slice(-2000)
    })

    try {
        const port = await waitForDevToolsPort(profileDir)
        const wsUrl = await findPageTarget(port)
        const cdp = await CdpClient.connect(wsUrl)
        try {
            await cdp.send("Page.enable")
            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width,
                height: minHeight,
                deviceScaleFactor: scale,
                mobile: false,
            })

            const loaded = cdp.once("Page.loadEventFired")
            await cdp.send("Page.navigate", { url: pathToFileURL(htmlPath).href })
            await loaded

            const evaluated = await cdp.send<{ result?: { value?: number } }>("Runtime.evaluate", {
                expression:
                    "document.fonts.ready.then(() => Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)))",
                awaitPromise: true,
                returnByValue: true,
            })
            const contentHeight = Math.max(minHeight, Math.ceil(Number(evaluated.result?.value ?? minHeight)))

            await cdp.send("Emulation.setDeviceMetricsOverride", {
                width,
                height: contentHeight,
                deviceScaleFactor: scale,
                mobile: false,
            })
            await new Promise(resolve => setTimeout(resolve, 150))

            const shot = await cdp.send<{ data: string }>("Page.captureScreenshot", {
                format: "png",
                captureBeyondViewport: true,
                fromSurface: true,
            })
            const buffer = Buffer.from(shot.data, "base64")
            const size = pngSize(buffer)
            if (!size) throw new Error("截图结果不是 PNG")
            writeFileSync(outPath, buffer)
            return { ...size, bytes: buffer.length, browser }
        } finally {
            cdp.close()
        }
    } catch (error) {
        const detail = stderr.trim().split(/\r?\n/).slice(-3).join(" ")
        throw new Error(`浏览器渲染失败：${error instanceof Error ? error.message : error}${detail ? `\n${detail}` : ""}`)
    } finally {
        killTree(child)
        await new Promise(resolve => setTimeout(resolve, 300))
        try {
            rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
        } catch {
            // 浏览器子进程可能还握着 profile 目录，残留物在 .tmp 下可忽略
        }
    }
}
