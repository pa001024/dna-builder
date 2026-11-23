import type { CharBuildWorkerSnapshot } from "@/data/CharBuildSnapshot"
import { calculateTeamSnapshotDamage, hasSameTeamSides } from "./income-core"

/**
 * 升华装备收益 worker：请求里携带主线程用当前数据包组装好的构筑快照，
 * 收益口径是目标函数卡的团队合计（各启用侧伤害之和），worker 只重建并求和，
 * 不读取自己的数据表；单个候选失败逐项返回，不静默丢弃。
 */

/** 参与团队合计的单侧快照（side 只用于请求可读性 / 侧集合校验） */
export interface GearIncomeSideBuild {
    side: string
    build: CharBuildWorkerSnapshot
}

export interface GearIncomeCandidate {
    key: string
    /** 该候选的团队快照：每个启用侧一项（旧单侧兼容路径 = 一项） */
    builds: GearIncomeSideBuild[]
}

export interface GearIncomeRequest {
    id: number
    /** 基准团队快照 */
    baseline: GearIncomeSideBuild[]
    /** 候选物品替换后在 owner side 重建的团队快照 */
    candidates: GearIncomeCandidate[]
}

export interface GearIncomeFailure {
    key: string
    error: string
}

export interface GearIncomeResponse {
    id: number
    /** 基准团队目标合计 */
    baseline?: number
    /** key → 团队合计伤害差 */
    incomes?: Record<string, number>
    /** 无法计算的候选（key + 原因） */
    failures?: GearIncomeFailure[]
    /** 基准合计无法计算时的明确原因 */
    error?: string
}

/**
 * 纯求值入口（可单测）：基准 / 候选的侧集合必须一致；任一侧失败不静默跳过。
 * @param request 收益请求
 * @returns 基准合计、key → 合计差与逐项失败
 */
export function calculateIncomeResponse(request: GearIncomeRequest): GearIncomeResponse {
    const { id, baseline, candidates } = request
    const base = calculateTeamSnapshotDamage(baseline.map(entry => entry.build))
    if (base.damage === undefined) return { id, error: base.error ?? "build-unavailable" }
    const baselineSides = baseline.map(entry => entry.side)
    const incomes: Record<string, number> = {}
    const failures: GearIncomeFailure[] = []
    for (const candidate of candidates) {
        const candidateSides = candidate.builds.map(entry => entry.side)
        if (!hasSameTeamSides(baselineSides, candidateSides)) {
            failures.push({ key: candidate.key, error: "side-mismatch" })
            continue
        }
        const next = calculateTeamSnapshotDamage(candidate.builds.map(entry => entry.build))
        if (next.damage === undefined) {
            failures.push({ key: candidate.key, error: next.error ?? "build-unavailable" })
            continue
        }
        incomes[candidate.key] = next.damage - base.damage
    }
    return { id, baseline: base.damage, incomes, failures }
}

// 纯函数可直接单测；仅 worker 环境注册消息处理
if (typeof self !== "undefined") {
    self.onmessage = (event: MessageEvent<GearIncomeRequest>) => {
        self.postMessage(calculateIncomeResponse(event.data))
    }
}
