import { onBeforeUnmount, ref, shallowRef } from "vue"
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

/**
 * 创建一个构筑收益 worker 客户端。
 * @returns `incomes`（收益映射）与 `refresh`（提交一次计算请求）
 */
export function useBuildIncomeWorker() {
    const incomes = ref<Record<string, number>>({})
    const workerRef = shallowRef<Worker>()
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
        const worker = workerRef.value || new Worker(new URL("@/data/CharBuild.worker.ts", import.meta.url), { type: "module" })
        workerRef.value = worker
        const id = ++requestId
        worker.onmessage = (event: MessageEvent<{ id: number; incomes?: Record<string, number>; error?: string }>) => {
            if (event.data.id !== requestId) return
            if (event.data.error) {
                console.error(`${label}worker计算失败`, event.data.error)
                return
            }
            incomes.value = event.data.incomes || {}
        }
        // 类实例快照与 Vue proxy 需转为 worker 可结构化克隆的普通数据
        const payload = {
            id,
            build: createWorkerSnapshot(charBuild) as CharBuildWorkerSnapshot,
            ...request,
        }
        worker.postMessage(JSON.parse(JSON.stringify(payload)))
    }

    onBeforeUnmount(() => {
        workerRef.value?.terminate()
    })

    return { incomes, refresh }
}
