import type {
    CalcAutobuildRequest,
    CalcBuildEvaluation,
    CalcEvaluateRequest,
    CalcIncomeRequest,
    CalcResponse,
    CalcTargetValuesRequest,
    CalcWorkerMessage,
} from "@/data/Calc.worker"

type PendingRequest = {
    resolve: (data: CalcResponse) => void
    reject: (error: Error) => void
    onLog?: (message: string) => void
}

let worker: Worker | null = null
const pendingRequests = new Map<number, PendingRequest>()
let requestId = 0
let warmedUp = false

function getWorker(): Worker {
    if (!worker) {
        worker = new Worker(new URL("@/data/Calc.worker.ts", import.meta.url), { type: "module" })
        worker.onmessage = (event: MessageEvent<CalcWorkerMessage>) => {
            const data = event.data
            const entry = pendingRequests.get(data.id)
            if (!entry) return
            if (data.type === "log") {
                entry.onLog?.(data.message)
                return
            }
            pendingRequests.delete(data.id)
            if (data.error) entry.reject(new Error(data.error))
            else entry.resolve(data)
        }
        worker.onerror = () => {
            const error = new Error("计算 worker 出错，已重置（下次调用重建）")
            pendingRequests.forEach(entry => entry.reject(error))
            pendingRequests.clear()
            worker?.terminate()
            worker = null
        }
    }
    return worker
}

export type CalcRequest = CalcAutobuildRequest | CalcIncomeRequest | CalcTargetValuesRequest | CalcEvaluateRequest

type CalcRequestInput =
    | Omit<CalcAutobuildRequest, "id">
    | Omit<CalcIncomeRequest, "id">
    | Omit<CalcTargetValuesRequest, "id">
    | Omit<CalcEvaluateRequest, "id">

/**
 * 提交一次构筑求值（节点编辑器使用）：走 wasm worker，失败时 worker 内部回退 TS。
 * @param payload 角色 id、完整配置与可选目标函数覆盖
 * @returns 属性 / 武器面板 / 目标值 / 伤害明细
 */
export function requestBuildEvaluation(payload: Omit<CalcEvaluateRequest, "id" | "kind">): Promise<CalcBuildEvaluation> {
    return postCalcRequest({ ...payload, kind: "evaluate" }).then(data => {
        if (!data.evaluation) throw new Error(data.error || "构筑求值无结果")
        return data.evaluation
    })
}

export function postCalcRequest(message: CalcRequestInput, onLog?: (text: string) => void): Promise<CalcResponse> {
    const target = getWorker()
    const id = ++requestId
    return new Promise<CalcResponse>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject, onLog })
        try {
            target.postMessage({ ...message, id })
        } catch (error) {
            pendingRequests.delete(id)
            reject(error instanceof Error ? error : new Error(String(error)))
        }
    })
}

export function warmCalcWorker(): void {
    if (warmedUp) return
    warmedUp = true
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
    const run = () => {
        try {
            getWorker()
        } catch {
            warmedUp = false
        }
    }
    if (idle) idle(run)
    else setTimeout(run, 1000)
}
