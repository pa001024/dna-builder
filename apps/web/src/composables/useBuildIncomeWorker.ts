import { ref } from "vue"
import type { CharBuild } from "@/data"
import type {
    IncomeBuffItem,
    IncomeEquippedBuffItem,
    IncomeEquippedModItem,
    IncomeModItem,
    IncomeReplaceSlot,
    TargetValueItem,
} from "@/data/CharBuild.worker"
import { type CharBuildWorkerSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"

/**
 * 构筑 worker 客户端——把「候选/已装备 BUFF 与魔之楔的边际收益」与「构筑目标值」交给
 * CharBuild.worker 计算，避免在主线程反复克隆并重算构筑。
 *
 * 面板（魔灵潜质槽、魔灵面板）与构筑列表只负责组装请求；请求的 key 由调用方定义，
 * 收益通过 `incomes[key]`、目标值通过返回值读取。
 */

/** 收益请求（不含 id 与构筑快照，由本 composable 补齐） */
export interface BuildIncomeRequest {
    buffs?: IncomeBuffItem[]
    mods?: IncomeModItem[]
    /** 候选魔之楔的落槽位置：有则按替换该槽位求收益，无则退化为附加口径 */
    replaceSlot?: IncomeReplaceSlot
    equippedMods?: IncomeEquippedModItem[]
    equippedBuffs?: IncomeEquippedBuffItem[]
}

/** 共享 worker 请求体（与 CharBuild.worker 的 IncomeRequest 同形） */
export interface SharedIncomePayload extends BuildIncomeRequest {
    build: CharBuildWorkerSnapshot
}

/** 构筑列表里的一条待算目标值构筑（快照由调用方用当前数据包组装） */
export type SharedTargetValueItem = TargetValueItem

type WorkerResponse = {
    id: number
    incomes?: Record<string, number>
    values?: Record<string, number>
    failed?: string[]
    error?: string
}

type PendingRequest = {
    resolve: (data: WorkerResponse) => void
    reject: (error: Error) => void
}

/**
 * 模块级共享 worker：各面板（BUFF/MOD/魔灵）与构筑列表复用同一实例，冷启动
 * （新线程内全套模块求值，dev 下约 2s）每页只付一次；remount 不再重建。
 * 回包按自增 id 分发，调用方自行丢弃过期响应（worker 内按序处理，先发的先回）。
 */
let sharedWorker: Worker | null = null
const pendingRequests = new Map<number, PendingRequest>()
let sharedRequestId = 0
let warmedUp = false

function getSharedWorker(): Worker {
    if (!sharedWorker) {
        sharedWorker = new Worker(new URL("@/data/CharBuild.worker.ts", import.meta.url), { type: "module" })
        sharedWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const entry = pendingRequests.get(event.data.id)
            if (!entry) return
            pendingRequests.delete(event.data.id)
            if (event.data.error) entry.reject(new Error(event.data.error))
            else entry.resolve(event.data)
        }
        sharedWorker.onerror = () => {
            const error = new Error("构筑 worker 出错，已重置（下次调用重建）")
            pendingRequests.forEach(entry => entry.reject(error))
            pendingRequests.clear()
            sharedWorker?.terminate()
            sharedWorker = null
        }
    }
    return sharedWorker
}

/**
 * 提交一次请求到共享 worker，统一处理回包分发与异常清理。
 * @param message 请求体（worker 侧补齐 id 后按 kind 分发）
 * @param pick 从回包里取出本次结果
 * @param id 请求序号
 * @returns 结果
 */
function postToWorker<T>(message: Record<string, unknown>, pick: (data: WorkerResponse) => T, id: number): Promise<T> {
    const worker = getSharedWorker()
    return new Promise<T>((resolve, reject) => {
        pendingRequests.set(id, { resolve: data => resolve(pick(data)), reject })
        try {
            worker.postMessage({ ...message, id })
        } catch (error) {
            pendingRequests.delete(id)
            reject(error instanceof Error ? error : new Error(String(error)))
        }
    })
}

/** 经共享 worker 提交一次收益计算，返回 key → 收益映射 */
export function requestBuildIncomes(payload: SharedIncomePayload): Promise<Record<string, number>> {
    return postToWorker({ ...payload, kind: "income" }, data => data.incomes ?? {}, ++sharedRequestId)
}

/**
 * 经共享 worker 批量求解构筑目标值（`calculate()`），重活不落在主线程。
 * 单份构筑算不出（配置损坏 / 引用已下线数据）时该 key 不出现在结果里，不影响其余条目。
 * @param items 待计算的构筑快照
 * @returns key → 目标值
 */
export function requestBuildTargetValues(items: SharedTargetValueItem[]): Promise<Record<string, number>> {
    return postToWorker(
        { kind: "targetValues", builds: items },
        data => {
            if (data.failed?.length) {
                console.warn("部分构筑目标值计算失败", data.failed)
            }
            return data.values ?? {}
        },
        ++sharedRequestId
    )
}

/**
 * 预热共享 worker：触发其内模块求值（冷启动大头），首个面板打开前调用可避开卡顿。
 * 空请求只做快照恢复，不跑任何候选；失败静默吞掉（真正请求时会重建）。
 * @param build 当前构筑
 */
export function warmIncomeWorker(build: CharBuild | undefined | null) {
    if (warmedUp || !build?.char) return
    warmedUp = true
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
    const run = () => requestBuildIncomes({ build: createWorkerSnapshot(build) }).catch(() => {})
    if (idle) idle(run)
    else setTimeout(run, 1000)
}

/**
 * 创建一个构筑收益 worker 客户端。
 * @returns `incomes`（收益映射）与 `refresh`（提交一次计算请求）
 */
export function useBuildIncomeWorker() {
    const incomes = ref<Record<string, number>>({})
    let requestId = 0

    /**
     * 提交收益计算请求；仅接受最后一次请求的返回，避免乱序覆盖。
     * 数据包未就绪时构筑只是占位对象（无快照字段），此时清空收益直接返回，交由面板显示空收益。
     * @param charBuild 当前构筑
     * @param request 请求内容（候选/已装备条目）
     * @param label 出错日志的场景名
     */
    function refresh(charBuild: CharBuild | undefined | null, request: BuildIncomeRequest, label = "收益") {
        if (!charBuild?.char) {
            incomes.value = {}
            return
        }
        const id = ++requestId
        // 类实例快照与 Vue proxy 需转为 worker 可结构化克隆的普通数据
        const payload: SharedIncomePayload = {
            build: createWorkerSnapshot(charBuild) as CharBuildWorkerSnapshot,
            ...request,
        }
        requestBuildIncomes(JSON.parse(JSON.stringify(payload)))
            .then(result => {
                if (id !== requestId) return
                incomes.value = result
            })
            .catch(error => console.error(`${label}worker计算失败`, error))
    }

    return { incomes, refresh }
}
