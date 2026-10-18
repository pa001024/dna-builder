import { createBuildFromSnapshot } from "@/data/CharBuildSnapshot"

/** 沙箱（worker 侧）发给主线程的消息 */
export type SandboxOutbound =
    | { type: "log"; level: "log" | "warn" | "error"; text: string }
    | { type: "rpc"; id: number; path: string[]; args: unknown[] }
    | { type: "done"; ok: boolean; value?: string; error?: string }

/** 主线程发给沙箱的消息 */
export type SandboxInbound =
    | { type: "run"; code: string }
    | { type: "rpc:result"; id: number; ok: boolean; value?: unknown; error?: string }

export interface SandboxRuntime {
    onMessage(message: SandboxInbound): void
    dispose(): void
}

/**
 * 沙箱里依然挡掉的标识符。
 *
 * 真正的隔离靠 worker realm（没有 window / document / DOM），这份名单只是把 worker 里还剩的
 * 网络与线程入口也堵上，让「拿到 globalThis」变成一件没有收益的事。
 */
const BLOCKED = new Set([
    "window",
    "document",
    "globalThis",
    "self",
    "top",
    "parent",
    "global",
    "eval",
    "Function",
    "AsyncFunction",
    "GeneratorFunction",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "Worker",
    "SharedWorker",
    "importScripts",
    "import",
    "require",
    "process",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "location",
    "navigator",
    "history",
    "postMessage",
    "Reflect",
    "Proxy",
])

const SAFE_GLOBALS: Record<string, unknown> = {
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Date,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Symbol,
    BigInt,
    Infinity,
    NaN,
    undefined,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    structuredClone,
}

const MAX_OUTPUT = 4000

/**
 * 把任意值序列化成给模型看的文本（函数 / 循环引用 / bigint 都要能兜住）。
 * @param value 待序列化的值
 * @returns 序列化后的文本
 */
export function stringify(value: unknown): string {
    if (typeof value === "string") {
        return value
    }

    if (value === undefined) {
        return "undefined"
    }

    try {
        const seen = new WeakSet<object>()
        const text = JSON.stringify(
            value,
            (_key, inner) => {
                if (typeof inner === "function") {
                    return "[Function]"
                }
                if (typeof inner === "bigint") {
                    return `${inner}n`
                }
                if (inner && typeof inner === "object") {
                    if (seen.has(inner)) {
                        return "[Circular]"
                    }
                    seen.add(inner)
                }
                return inner
            },
            2
        )
        return text ?? String(value)
    } catch {
        return String(value)
    }
}

/**
 * 截断过长的输出。
 * @param text 原文
 * @returns 截断后的文本
 */
export function truncate(text: string): string {
    return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…（输出过长已截断，共 ${text.length} 字符）` : text
}

const AsyncFunctionCtor = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
) => (scope: unknown) => Promise<unknown>

function isViewPayload(value: unknown): value is { __view: true; snapshot: unknown } {
    return typeof value === "object" && value !== null && (value as { __view?: boolean }).__view === true
}

/**
 * 创建 worker 侧的沙箱运行时。
 *
 * 用户代码在这里编译执行：`build` 的每个方法都是一次到主线程的 RPC（页面状态只存在于主线程），
 * 而主线程回传的构筑快照会在 worker 内重建出真正的 CharBuild，之后的查数值都在本地跑，不再往返。
 * @param send 向主线程发消息
 * @returns 运行时
 */
export function createSandboxRuntime(send: (message: SandboxOutbound) => void): SandboxRuntime {
    let nextId = 1
    let disposed = false
    const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

    function rpc(path: string[], args: unknown[]): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const id = nextId++
            pending.set(id, { resolve, reject })
            send({ type: "rpc", id, path, args })
        })
    }

    function localView(build: ReturnType<typeof createBuildFromSnapshot>) {
        return {
            damage: async () => build.calculate(),
            attributes: async () => build.calculateWeaponAttributes(),
            bonus: async (attr: string, prefix = "角色", includeMods = true) => build.getTotalBonus(attr, prefix, { includeMods }),
            fullness: async () =>
                build.getFullnessWeaponSources().map(item => ({
                    weapon: (item.weapon as { 名称?: string }).名称 ?? "",
                    triggerRate: item.triggerRate,
                    conversionRate: item.conversionRate,
                    value: item.value,
                })),
            cost: async (type?: string) => {
                if (type) {
                    return { used: build.getModCost(type), cap: build.getModCap(type) }
                }
                const out: Record<string, { used: number; cap: number }> = {}
                for (const key of ["角色", "近战", "远程", "同律"]) {
                    out[key] = { used: build.getModCost(key), cap: build.getModCap(key) }
                }
                return out
            },
            mods: async (type: string) =>
                build.getMods(type).map(item => ({
                    name: (item as { 名称?: string } | null)?.名称 ?? "",
                    level: (item as { 等级?: number } | null)?.等级 ?? 0,
                    tolerance: (item as { 耐受?: number } | null)?.耐受 ?? 0,
                })),
            weapons: async () => ({ 近战: build.meleeWeapon.名称, 远程: build.rangedWeapon.名称 }),
            skills: async () => build.allSkills.map(item => item.名称),
            variable: async (name: string) => {
                const hit = build.customVariables.find(item => item[0] === name)
                if (!hit) {
                    throw new Error(`当前构筑没有自定义变量「${name}」`)
                }
                return build.evaluateCustomVariableDefinition(hit[0], hit[1])
            },
            eval: async (expression: string) => build.evaluateAST(expression),
            raw: build,
        }
    }

    function toLocal(value: unknown): unknown {
        if (isViewPayload(value)) {
            return localView(createBuildFromSnapshot(value.snapshot as never))
        }
        return value
    }

    function remote(path: string[]): unknown {
        const call = (...args: unknown[]) => rpc(path, args).then(toLocal)

        return new Proxy(call, {
            get(_target, key) {
                if (typeof key === "symbol") {
                    return undefined
                }
                return remote([...path, key])
            },
            apply(_target, _thisArg, args: unknown[]) {
                return rpc(path, args).then(toLocal)
            },
        })
    }

    const build = remote([])

    function makeConsole(level: "log" | "warn" | "error") {
        return (...args: unknown[]) => {
            send({ type: "log", level, text: truncate(args.map(item => stringify(item)).join(" ")) })
        }
    }

    function run(code: string): void {
        const scope: Record<string, unknown> = {
            ...SAFE_GLOBALS,
            build,
            console: { log: makeConsole("log"), warn: makeConsole("warn"), error: makeConsole("error") },
        }

        const guarded = new Proxy(scope, {
            has: () => true,
            get(target, key) {
                // with 绑定时要读 @@unscopables，symbol 键一律放行，否则 with 语句本身就没法工作
                if (typeof key === "symbol") {
                    return (target as Record<symbol, unknown>)[key]
                }
                if (BLOCKED.has(key)) {
                    throw new ReferenceError(`沙箱里不能访问 ${key}：只能通过 build 对象读写配装`)
                }
                if (key in target) {
                    return target[key]
                }
                throw new ReferenceError(`${key} 未定义：沙箱里只有 build 对象可用`)
            },
            set() {
                throw new ReferenceError("沙箱里不能写入全局变量")
            },
        })

        void (async () => {
            try {
                // 不能用 "use strict"：with 语句在严格模式下非法，而拦截自由变量查找正是靠 with
                const runner = new AsyncFunctionCtor("__scope", `return (async()=>{with(__scope){${code}\n}})()`)
                const value = await runner(guarded)
                if (!disposed) {
                    send({ type: "done", ok: true, value: truncate(stringify(value)) })
                }
            } catch (error) {
                if (!disposed) {
                    send({ type: "done", ok: false, error: error instanceof Error ? error.message : String(error) })
                }
            }
        })()
    }

    return {
        onMessage(message) {
            if (message.type === "run") {
                run(message.code)
                return
            }

            const entry = pending.get(message.id)
            if (!entry) {
                return
            }
            pending.delete(message.id)

            if (message.ok) {
                entry.resolve(message.value)
            } else {
                entry.reject(new Error(message.error ?? "调用失败"))
            }
        },
        dispose() {
            disposed = true
            pending.clear()
        },
    }
}
