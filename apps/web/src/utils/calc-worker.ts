import type {
    CalcAutobuildRequest,
    CalcBuildEvaluation,
    CalcBuildPanels,
    CalcEvaluateRequest,
    CalcIncomeRequest,
    CalcPanelsRequest,
    CalcResponse,
    CalcTargetValuesRequest,
    CalcWorkerMessage,
} from "@/data/Calc.worker"
import { recordWorkerRequest } from "@/utils/nodeEditorPerf"

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

export type CalcRequest = CalcAutobuildRequest | CalcIncomeRequest | CalcTargetValuesRequest | CalcEvaluateRequest | CalcPanelsRequest

type CalcRequestInput =
    | Omit<CalcAutobuildRequest, "id">
    | Omit<CalcIncomeRequest, "id">
    | Omit<CalcTargetValuesRequest, "id">
    | Omit<CalcEvaluateRequest, "id">
    | Omit<CalcPanelsRequest, "id">

/** 请求关联信息：性能面板按节点归集 worker 调用 */
export interface CalcRequestMeta {
    nodeId?: string
    nodeType?: string
}

/**
 * 提交一次构筑求值（节点编辑器使用）：走 wasm worker，失败时 worker 内部回退 TS。
 * @param payload 角色 id、完整配置与可选目标函数覆盖
 * @param meta 关联节点（性能面板归集用）
 * @returns 属性 / 武器面板 / 目标值 / 伤害明细
 */
export function requestBuildEvaluation(
    payload: Omit<CalcEvaluateRequest, "id" | "kind">,
    meta?: CalcRequestMeta
): Promise<CalcBuildEvaluation> {
    return postCalcRequest({ ...payload, kind: "evaluate" }, undefined, meta).then(data => {
        if (!data.evaluation) throw new Error(data.error || "构筑求值无结果")
        return data.evaluation
    })
}

/**
 * 提交一次面板请求（节点编辑器使用）：只算属性 / 武器面板，不触发目标函数与伤害求值。
 * @param payload 角色 id、完整配置与需要的面板类型（同一构筑一次批量计算）
 * @param meta 关联节点（性能面板归集用）
 * @returns 面板键 → 属性表
 */
export function requestBuildPanels(payload: Omit<CalcPanelsRequest, "id" | "kind">, meta?: CalcRequestMeta): Promise<CalcBuildPanels> {
    return postCalcRequest({ ...payload, kind: "panels" }, undefined, meta).then(data => {
        if (!data.panels) throw new Error(data.error || "面板求值无结果")
        return data.panels
    })
}

/**
 * 向 worker 提交一次请求：记录请求耗时与引擎（性能面板）。
 * @param message 请求体（不含 id）
 * @param onLog 日志回调（自动配装等长任务）
 * @param meta 关联节点
 * @returns worker 响应
 */
export function postCalcRequest(message: CalcRequestInput, onLog?: (text: string) => void, meta?: CalcRequestMeta): Promise<CalcResponse> {
    const target = getWorker()
    const id = ++requestId
    const startedAt = performance.now()
    const kind = message.kind ?? "income"
    // 优先用 worker 回传的处理耗时：排除消息排队与 worker 冷启动加载时间
    const finish = (engine?: string, status: "ok" | "error" = "ok", elapsedMs?: number) =>
        recordWorkerRequest(kind, elapsedMs ?? performance.now() - startedAt, { ...meta, engine, status })
    return new Promise<CalcResponse>((resolve, reject) => {
        pendingRequests.set(id, {
            resolve: data => {
                // wasm 建表是会话级一次性开销：单独记一笔，不摊到触发它的请求上
                if (data.wasmSetupMs !== undefined) recordWorkerRequest("wasm-init", data.wasmSetupMs, { ...meta, engine: "wasm" })
                finish(data.engine, "ok", data.elapsedMs)
                resolve(data)
            },
            reject: error => {
                finish(undefined, "error")
                reject(error)
            },
            onLog,
        })
        try {
            target.postMessage({ ...message, id })
        } catch (error) {
            pendingRequests.delete(id)
            finish(undefined, "error")
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
