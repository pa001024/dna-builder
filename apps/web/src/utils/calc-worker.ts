import type { CalcAutobuildRequest, CalcIncomeRequest, CalcResponse, CalcTargetValuesRequest, CalcWorkerMessage } from "@/data/Calc.worker"

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

export type CalcRequest = CalcAutobuildRequest | CalcIncomeRequest | CalcTargetValuesRequest

type CalcRequestInput = Omit<CalcAutobuildRequest, "id"> | Omit<CalcIncomeRequest, "id"> | Omit<CalcTargetValuesRequest, "id">

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
