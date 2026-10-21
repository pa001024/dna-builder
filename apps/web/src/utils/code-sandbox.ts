import { createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import type { BuildApi } from "@/utils/build-api.contract"
import { createSandboxRuntime, type SandboxInbound, type SandboxOutbound } from "@/utils/build-sandbox-runtime"

/**
 * 沙箱 worker 常驻单例：预启动、跨对话复用，超时/线程异常才重建。
 *
 * - 预启动：对话窗打开时调一次 `warmupBuildSandbox`（幂等），真正执行时不再为冷启动付费；
 *   其它页面用不到沙箱，不跟整页生命周期走；
 * - 常驻：成功与普通失败（用户代码报错、单次 RPC 报错）都不杀线程；
 * - 重建：超时（同步死循环只能靠杀线程结束）与线程级未捕获异常是唯二的 kill 场景，
 *   杀完立刻在后台补建一个，下一次调用仍是热启动。
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

/** 常驻实例的就绪 Promise：模块加载完成（收到 ready）后兑现，加载期抛错则拒绝 */
let workerReady: Promise<void> | null = null

/**
 * 取（必要时新建）沙箱 worker。
 *
 * 只建线程不定执行：调用方必须先 `await workerReady`，等模块加载完成再投递，
 * 加载耗时不计入单次执行预算。
 * @returns worker 实例
 */
function ensureWorker(): Worker {
    if (worker) {
        return worker
    }
    const created = new Worker(new URL("./build-sandbox.worker.ts", import.meta.url), { type: "module" })
    worker = created
    workerReady = new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            created.removeEventListener("message", onReady)
            created.removeEventListener("error", onLoadError)
        }
        const onReady = (event: MessageEvent<SandboxOutbound>) => {
            if (event.data.type === "ready") {
                cleanup()
                resolve()
            }
        }
        const onLoadError = () => {
            cleanup()
            reject(new Error("沙箱线程加载失败"))
        }
        created.addEventListener("message", onReady)
        created.addEventListener("error", onLoadError)
    })
    // 调用方按需 await 捕获拒绝；这里兜住，避免刷未处理拒绝的控制台噪音
    workerReady.catch(() => {})
    return created
}

/**
 * 杀掉沙箱线程（同步死循环只能这样结束）。
 *
 * 裸调会留下一个冷的空位：超时/异常处理里杀完必须立刻 `warmupBuildSandbox` 补建，
 * 其它地方不要直接调它。
 */
export function resetSandboxWorker(): void {
    worker?.terminate()
    worker = null
    workerReady = null
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
 * 单次执行的总预算（毫秒）。
 *
 * 覆盖线程冷启动（首次要加载整个构筑计算图）与每次 RPC 的页面重算：
 * 写操作会触发配装页的响应式重算，批量试装循环与 autoSolve 动辄跑几秒，
 * 原来的 8 秒在真实构筑上必超。run_code 工具直接引用该值，两边保持一致。
 */
export const SANDBOX_TIMEOUT_MS = 30000

/**
 * 等待常驻线程就绪的上限（毫秒）。
 *
 * 执行预算从投递那一刻才起算，加载另给 60 秒：开发模式冷启动要现场转译整个构筑计算图，
 * 一次转不完就明确报加载超时（重试时已变热），而不是扣执行预算造成误杀。
 */
export const SANDBOX_LOAD_TIMEOUT_MS = 60000

/**
 * 等待常驻线程就绪，超时则抛错（调用方转为明确的加载失败返回，不走执行超时的口径）。
 * @param ready 常驻实例的就绪 Promise
 * @param timeoutMs 等待上限毫秒数
 */
async function waitForWorkerReady(ready: Promise<void>, timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        await Promise.race([
            ready,
            new Promise<void>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error("沙箱线程加载超时")), timeoutMs)
            }),
        ])
    } finally {
        if (timer) {
            clearTimeout(timer)
        }
    }
}

/**
 * 预热沙箱线程（幂等）：提前建好 Worker 并加载构筑计算图，真正执行时不再为冷启动付费。
 *
 * 已有常驻实例时直接返回；建失败也不抛错，等真正执行时再按正常路径报错。
 */
export function warmupBuildSandbox(): void {
    if (typeof Worker === "undefined") {
        return
    }

    try {
        ensureWorker()
    } catch {
        resetSandboxWorker()
    }
}

/**
 * 常驻线程是否存在（预启动/复用状态观测，供调试与测试用）。
 * @returns 已有常驻实例时为 true；刚建好的实例仍在后台加载模块，首次执行仍可能比后续慢
 */
export function isSandboxWorkerResident(): boolean {
    return worker !== null
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
    const timeoutMs = options.timeoutMs ?? SANDBOX_TIMEOUT_MS

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

            // 常驻握手包不属于任何一次执行（同线程路径收不到它，这里只为类型收窄）
            if (message.type === "ready") {
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
    const created = ensureWorker()
    const ready = workerReady

    return (async (): Promise<SandboxResult> => {
        // 先等常驻线程就绪再投递：执行预算从投递起算，加载耗时不再造成误杀；
        // 加载失败/超时直接回明确错误，不进执行超时的口径。
        if (ready) {
            try {
                await waitForWorkerReady(ready, SANDBOX_LOAD_TIMEOUT_MS)
            } catch {
                resetSandboxWorker()
                return {
                    ok: false,
                    error: "沙箱线程未就绪（加载失败，或 60s 内没加载完；开发模式首次加载较慢），请重试；一直失败请刷新页面",
                    logs: [],
                    ms: Date.now() - startedAt,
                }
            }
        }

        return runOnReadyWorker(code, build, created, timeoutMs, startedAt)
    })()
}

/**
 * 在已就绪的常驻线程上执行（投递即起算执行预算）。
 * @param code 用户代码
 * @param build 配装接口对象
 * @param created 本次使用的常驻实例（调用时已就绪）
 * @param timeoutMs 超时毫秒数
 * @param startedAt 起始时间
 * @returns 执行结果
 */
function runOnReadyWorker(code: string, build: BuildApi, created: Worker, timeoutMs: number, startedAt: number): Promise<SandboxResult> {
    const logs: string[] = []

    return new Promise<SandboxResult>(resolve => {
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

            // 常驻握手包不属于任何一次执行：误当成 done 会提前结算，必须先拦掉
            if (message.type === "ready") {
                return
            }

            if (message.type === "log") {
                logs.push(message.text)
                return
            }

            if (message.type === "rpc") {
                void dispatch(build, message.path, message.args).then(result => {
                    try {
                        created.postMessage({ type: "rpc:result", id: message.id, ...result } satisfies SandboxInbound)
                    } catch {
                        // 结果里混进函数等不可克隆的值：如实回错，绝不能吞掉让 worker 空等到超时
                        created.postMessage({
                            type: "rpc:result",
                            id: message.id,
                            ok: false,
                            error: `build.${message.path.join(".")} 的返回无法传回线程（混入了不可克隆的值），请只返回纯数据`,
                        } satisfies SandboxInbound)
                    }
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
            // 线程级未捕获异常：该实例不再可信，杀掉并在后台补一个常驻线程
            resetSandboxWorker()
            warmupBuildSandbox()
            finish({ ok: false, error: event.message || "沙箱线程异常", logs, ms: Date.now() - startedAt })
        }

        created.addEventListener("message", onMessage)
        created.addEventListener("error", onError)

        timer = setTimeout(() => {
            // 超时只能杀线程；杀完立刻在后台补一个常驻线程，下一次调用仍是热启动
            resetSandboxWorker()
            warmupBuildSandbox()
            finish({
                ok: false,
                error: `执行超过 ${timeoutMs}ms 仍未结束，已终止沙箱线程；请缩小循环规模或拆分任务；批量比对优先用 compute.build / simulate 在本地算，只把最优方案写回`,
                logs,
                ms: Date.now() - startedAt,
            })
        }, timeoutMs)

        created.postMessage({ type: "run", code } satisfies SandboxInbound)
    })
}
