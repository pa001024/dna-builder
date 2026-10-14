import { ref } from "vue"
import type { CharBuild } from "@/data"
import type { IncomeBuffItem, IncomeEquippedBuffItem, IncomeEquippedModItem, IncomeModItem } from "@/data/CharBuild.worker"
import { type CharBuildWorkerSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"

/**
 * 构筑收益 worker 客户端——把「候选/已装备 BUFF 与魔之楔的边际收益」交给 CharBuild.worker 计算，
 * 避免在主线程反复克隆并重算构筑。
 *
 * 面板（魔灵潜质槽、魔灵面板）只负责组装请求；请求的 key 由调用方定义，收益通过 `incomes[key]` 读取。
 */

/** 收益请求（不含 id 与构筑快照，由本 composable 补齐） */
export interface BuildIncomeRequest {
    buffs?: IncomeBuffItem[]
    mods?: IncomeModItem[]
    equippedMods?: IncomeEquippedModItem[]
    equippedBuffs?: IncomeEquippedBuffItem[]
}

/** 共享 worker 请求体（与 CharBuild.worker 的 IncomeRequest 同形） */
export interface SharedIncomePayload extends BuildIncomeRequest {
    build: CharBuildWorkerSnapshot
}

type PendingIncome = {
    resolve: (incomes: Record<string, number>) => void
    reject: (error: Error) => void
}

/**
 * 模块级共享 worker：各面板（BUFF/MOD/魔灵）复用同一实例，冷启动
 * （新线程内全套模块求值，dev 下约 2s）每页只付一次；remount 不再重建。
 * 回包按自增 id 分发，调用方自行丢弃过期响应（worker 内按序处理，先发的先回）。
 */
let sharedWorker: Worker | null = null
const pendingIncomes = new Map<number, PendingIncome>()
let sharedRequestId = 0
let warmedUp = false

function getSharedWorker(): Worker {
    if (!sharedWorker) {
        sharedWorker = new Worker(new URL("@/data/CharBuild.worker.ts", import.meta.url), { type: "module" })
        sharedWorker.onmessage = (event: MessageEvent<{ id: number; incomes?: Record<string, number>; error?: string }>) => {
            const entry = pendingIncomes.get(event.data.id)
            if (!entry) return
            pendingIncomes.delete(event.data.id)
            if (event.data.error) entry.reject(new Error(event.data.error))
            else entry.resolve(event.data.incomes || {})
        }
        sharedWorker.onerror = () => {
            const error = new Error("收益 worker 出错，已重置（下次调用重建）")
            pendingIncomes.forEach(entry => entry.reject(error))
            pendingIncomes.clear()
            sharedWorker?.terminate()
            sharedWorker = null
        }
    }
    return sharedWorker
}

/** 经共享 worker 提交一次收益计算，返回 key → 收益映射 */
export function requestBuildIncomes(payload: SharedIncomePayload): Promise<Record<string, number>> {
    const worker = getSharedWorker()
    const id = ++sharedRequestId
    return new Promise<Record<string, number>>((resolve, reject) => {
        pendingIncomes.set(id, { resolve, reject })
        try {
            worker.postMessage({ ...payload, id })
        } catch (error) {
            pendingIncomes.delete(id)
            reject(error instanceof Error ? error : new Error(String(error)))
        }
    })
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
