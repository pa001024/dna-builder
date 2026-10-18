import { createSandboxRuntime, type SandboxInbound, type SandboxOutbound } from "@/utils/build-sandbox-runtime"

/**
 * worker 里还剩的网络与线程入口。
 *
 * worker realm 本身没有 window / document / DOM，这里再把这些删掉，
 * 于是「拿到 globalThis」也换不来任何能力。删的是原型链上的方法（全局方法挂在原型上，删 self 的自有属性没用）。
 */
const BLOCKED_GLOBALS = [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "importScripts",
    "indexedDB",
    "caches",
    "Worker",
    "SharedWorker",
    "BroadcastChannel",
    "Notification",
    "Request",
    "Response",
    "Headers",
    "FileReaderSync",
]

let proto: object | null = Object.getPrototypeOf(self)
for (let level = 0; level < 3 && proto; level += 1) {
    for (const key of BLOCKED_GLOBALS) {
        try {
            delete (proto as Record<string, unknown>)[key]
        } catch {
            // 有些实现里不可配置，删不掉也不影响：worker 里本来就没有 DOM
        }
    }
    proto = Object.getPrototypeOf(proto)
}

const runtime = createSandboxRuntime((message: SandboxOutbound) => {
    self.postMessage(message)
})

self.onmessage = (event: MessageEvent<SandboxInbound>) => {
    runtime.onMessage(event.data)
}
