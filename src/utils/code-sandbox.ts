import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import type { BuildApi } from "@/utils/build-api.contract"
import { createSandboxRuntime, type SandboxInbound, type SandboxOutbound } from "@/utils/build-sandbox-runtime"

/**
 * 沙箱 worker 做成单例：每次新建 worker 都要重新编译一次代码，
 * 而一次对话里会连续跑很多段脚本，复用才不至于每轮都付一次启动成本。
 * 超时后必须 terminate（同步死循环只能靠杀线程结束），下一次调用会重新建一个。
 */
let worker: Worker | null = null

/** compute 里返回等级化实例的方法：实例过不了结构化克隆，得先转成纯数据 */
const LEVELED_METHODS = new Set(["char", "mod", "weapon", "buff", "pet", "monster"])

export interface SandboxResult {
    ok: boolean
    /** 代码块 return 出来的值（已序列化为文本） */
    value?: string
    /** console.log 收集到的输出 */
    logs: string[]
    /** 失败信息 */
    error?: string
    /** 执行的毫秒数 */
    ms: number
}

/**
 * 取（必要时新建）沙箱 worker。
 * @returns worker 实例
 */
function ensureWorker(): Worker {
    if (worker) {
        return worker
    }
    const created = new Worker(new URL("./build-sandbox.worker.ts", import.meta.url), { type: "module" })
    worker = created
    return created
}

/**
 * 杀掉沙箱线程（同步死循环只能这样结束）。
 */
export function resetSandboxWorker(): void {
    worker?.terminate()
    worker = null
}

/**
 * 把等级化实例之类的活对象转成可克隆的纯数据。
 * @param value 原始值
 * @returns 纯数据
 */
function toPlain(value: unknown): unknown {
    if (value === null || typeof value !== "object") {
        return value
    }

    try {
        return JSON.parse(JSON.stringify(value))
    } catch {
        return String(value)
    }
}

/**
 * 在主线程执行沙箱发来的一次调用。
 *
 * 页面状态与数据包只在主线程，因此 `build.*` 全部在这里真正执行；
 * 返回构筑视图时改成回传快照，让 worker 那边能在本地重算。
 * @param api 配装接口对象
 * @param path 调用路径（如 ["compute","build"]）
 * @param args 参数
 * @returns 回传给 worker 的结果
 */
async function dispatch(api: BuildApi, path: string[], args: unknown[]): Promise<{ ok: boolean; value?: unknown; error?: string }> {
    try {
        let parent: unknown = api

        for (let index = 0; index < path.length - 1; index += 1) {
            parent = (parent as Record<string, unknown> | undefined)?.[path[index]]
        }

        if (path.length === 0) {
            return { ok: false, error: "空的调用路径" }
        }

        const method = (parent as Record<string, unknown> | undefined)?.[path[path.length - 1]]

        if (typeof method !== "function") {
            return { ok: false, error: `build.${path.join(".")} 不存在，请对照接口契约写` }
        }

        const value = await (method as (...inner: unknown[]) => unknown).apply(parent, args)

        if (path[0] === "compute" && LEVELED_METHODS.has(path[1] ?? "")) {
            return { ok: true, value: toPlain(value) }
        }

        const build = (value as { raw?: { calculate?: () => number } } | undefined)?.raw

        if (typeof build?.calculate === "function") {
            return { ok: true, value: { __view: true, snapshot: createWorkerSnapshot(build as never) } }
        }

        return { ok: true, value: toPlain(value ?? null) }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
}

/**
 * 在 worker 沙箱里执行一段代码。
 *
 * 代码跑在独立 realm：没有 window / document / DOM，网络与线程入口也已清掉；
 * 超时不是「不再等待」而是真的 terminate 掉线程，因此死循环不会把页面卡死。
 * @param code 用户代码
 * @param build 配装接口对象
 * @param options.timeoutMs 超时毫秒数
 * @param options.onDeadline 截止时间回调（给接口层做循环内的自检）
 * @returns 执行结果
 */
export async function runInBuildSandbox(
    code: string,
    build: BuildApi,
    options: { timeoutMs?: number; onDeadline?: (at: number) => void } = {}
): Promise<SandboxResult> {
    const startedAt = Date.now()
    const timeoutMs = options.timeoutMs ?? 8000

    options.onDeadline?.(startedAt + timeoutMs)

    // 浏览器里一定有 Worker；没有它的只有 node / 单测环境，那条路径只用于跑通逻辑，
    // 没有线程隔离（也就没有「超时能杀掉死循环」这层保护）
    if (typeof Worker === "undefined") {
        return runInline(code, build, startedAt)
    }

    return runInWorker(code, build, timeoutMs, startedAt)
}

/**
 * 同线程执行（仅供没有 Worker 的环境跑逻辑用）。
 * @param code 用户代码
 * @param build 配装接口对象
 * @param startedAt 起始时间
 * @returns 执行结果
 */
function runInline(code: string, build: BuildApi, startedAt: number): Promise<SandboxResult> {
    const logs: string[] = []

    return new Promise<SandboxResult>(resolve => {
        const runtime = createSandboxRuntime(message => {
            if (message.type === "log") {
                logs.push(message.text)
                return
            }

            if (message.type === "rpc") {
                void dispatch(build, message.path, message.args).then(result => {
                    runtime.onMessage({ type: "rpc:result", id: message.id, ...result })
                })
                return
            }

            resolve({
                ok: message.ok,
                ...(message.value === undefined ? {} : { value: message.value }),
                ...(message.error ? { error: message.error } : {}),
                logs,
                ms: Date.now() - startedAt,
            })
        })

        runtime.onMessage({ type: "run", code })
    })
}

/**
 * 在 worker 线程里执行。
 * @param code 用户代码
 * @param build 配装接口对象
 * @param timeoutMs 超时毫秒数
 * @param startedAt 起始时间
 * @returns 执行结果
 */
function runInWorker(code: string, build: BuildApi, timeoutMs: number, startedAt: number): Promise<SandboxResult> {
    const logs: string[] = []

    return new Promise<SandboxResult>(resolve => {
        const created = ensureWorker()
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined

        const finish = (result: SandboxResult) => {
            if (settled) {
                return
            }
            settled = true
            if (timer) {
                clearTimeout(timer)
            }
            created.removeEventListener("message", onMessage)
            created.removeEventListener("error", onError)
            resolve(result)
        }

        const onMessage = (event: MessageEvent<SandboxOutbound>) => {
            const message = event.data

            if (message.type === "log") {
                logs.push(message.text)
                return
            }

            if (message.type === "rpc") {
                void dispatch(build, message.path, message.args).then(result => {
                    created.postMessage({ type: "rpc:result", id: message.id, ...result } satisfies SandboxInbound)
                })
                return
            }

            finish({
                ok: message.ok,
                ...(message.value === undefined ? {} : { value: message.value }),
                ...(message.error ? { error: message.error } : {}),
                logs,
                ms: Date.now() - startedAt,
            })
        }

        const onError = (event: ErrorEvent) => {
            finish({ ok: false, error: event.message || "沙箱线程异常", logs, ms: Date.now() - startedAt })
        }

        created.addEventListener("message", onMessage)
        created.addEventListener("error", onError)

        timer = setTimeout(() => {
            resetSandboxWorker()
            finish({
                ok: false,
                error: `执行超过 ${timeoutMs}ms 仍未结束，已终止沙箱线程；请缩小循环规模或拆分任务`,
                logs,
                ms: Date.now() - startedAt,
            })
        }, timeoutMs)

        created.postMessage({ type: "run", code } satisfies SandboxInbound)
    })
}
