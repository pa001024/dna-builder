import { ref } from "vue"
import type { CharBuild } from "@/data"
import type {
    IncomeBuffItem,
    IncomeEquippedBuffItem,
    IncomeEquippedModItem,
    IncomeModItem,
    IncomeReplaceSlot,
    TargetValueItem,
} from "@/data/Calc.worker"
import { type CharBuildWorkerSnapshot, createWorkerSnapshot } from "@/data/CharBuildSnapshot"
import type { CharSettings } from "@/data/charSettings"
import { postCalcRequest, warmCalcWorker } from "@/utils/calc-worker"

/**
 * 构筑 worker 客户端——把「候选/已装备 BUFF 与魔之楔的边际收益」与「构筑目标值」交给
 * 全局 Calc.worker 计算，避免在主线程反复克隆并重算构筑。
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
    charId?: number
    settings?: CharSettings
    skillInherit?: string
}

/** 共享 worker 请求体（与 Calc.worker 的 income 请求同形） */
export interface SharedIncomePayload extends BuildIncomeRequest {
    build: CharBuildWorkerSnapshot
}

/** 构筑列表里的一条待算目标值构筑（快照由调用方用当前数据包组装） */
export type SharedTargetValueItem = TargetValueItem

/** 经全局单例提交一次收益计算，返回 key → 收益映射 */
export function requestBuildIncomes(payload: SharedIncomePayload): Promise<Record<string, number>> {
    return postCalcRequest({ ...payload, kind: "income" }).then(data => data.incomes ?? {})
}

/**
 * 经全局单例批量求解构筑目标值，重活不落在主线程。
 * 单份构筑算不出（配置损坏 / 引用已下线数据）时该 key 不出现在结果里，不影响其余条目。
 * @param items 待计算的构筑快照
 * @returns key → 目标值
 */
export function requestBuildTargetValues(items: SharedTargetValueItem[]): Promise<Record<string, number>> {
    return postCalcRequest({ kind: "targetValues", builds: items }).then(data => {
        if (data.failed?.length) {
            console.warn("部分构筑目标值计算失败", data.failed)
        }
        return data.values ?? {}
    })
}

export function warmIncomeWorker(build: CharBuild | undefined | null) {
    if (!build?.char) return
    warmCalcWorker()
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
