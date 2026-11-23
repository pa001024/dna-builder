import type { BugRow, BugSeverity } from "./types"

/** 默认排序档位：S0 > S1 > S2 > U > S3 > S4（U 在 S2 与 S3 之间，spec §14.4）。 */
export const SEVERITY_ORDER: readonly BugSeverity[] = ["S0", "S1", "S2", "U", "S3", "S4"]

export type SeverityInput = {
    confirmedSeverity: BugSeverity | null
    suggestedSeverity: BugSeverity | null
    severitySource: string | null
}

export type RankingInput = {
    effectiveSeverity: BugSeverity
    /** 当前规范根上的有效登录用户票数 V。 */
    voteCount: number
    /** 最近一条有效新证据的时间（毫秒）。 */
    lastEvidenceAt: number | null
    createdAt: number | null
    id: string
}

/**
 * @description 计算参与排名的严重程度：维护者确认值优先，其次是被确定性策略采纳的 AI 建议；
 * 用户自报分数和未采纳的建议一律按 U 处理。
 * @param bug 严重程度相关字段
 * @returns 有效严重程度
 */
export function effectiveSeverity(bug: SeverityInput): BugSeverity {
    if (bug.confirmedSeverity) return bug.confirmedSeverity
    if (bug.suggestedSeverity && (bug.severitySource === "ai" || bug.severitySource === "deterministic")) {
        return bug.suggestedSeverity
    }
    return "U"
}

/** 严重程度档位序号，越小越靠前。 */
export function severityRank(severity: BugSeverity): number {
    const rank = SEVERITY_ORDER.indexOf(severity)
    return rank === -1 ? SEVERITY_ORDER.indexOf("U") : rank
}

/**
 * @description 默认排序比较器：档位 → 票数 DESC → 最近证据 DESC → createdAt ASC → id ASC。
 * @returns 负数表示 a 在前
 */
export function compareBugRanking(a: RankingInput, b: RankingInput): number {
    const bySeverity = severityRank(a.effectiveSeverity) - severityRank(b.effectiveSeverity)
    if (bySeverity !== 0) return bySeverity

    if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount

    const aEvidence = a.lastEvidenceAt ?? 0
    const bEvidence = b.lastEvidenceAt ?? 0
    if (aEvidence !== bEvidence) return bEvidence - aEvidence

    const aCreated = a.createdAt ?? 0
    const bCreated = b.createdAt ?? 0
    if (aCreated !== bCreated) return aCreated - bCreated

    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** 按默认排序返回新数组（不改动入参）。 */
export function sortBugRanking<T extends RankingInput>(items: readonly T[]): T[] {
    return [...items].sort(compareBugRanking)
}

/** 从 Bug 行与聚合统计构造排序输入。 */
export function toRankingInput(
    bug: Pick<BugRow, "id" | "confirmedSeverity" | "suggestedSeverity" | "severitySource" | "createdAt">,
    stats: { voteCount?: number; lastEvidenceAt?: number | null } = {}
): RankingInput {
    return {
        effectiveSeverity: effectiveSeverity(bug),
        voteCount: stats.voteCount ?? 0,
        lastEvidenceAt: stats.lastEvidenceAt ?? null,
        createdAt: bug.createdAt ?? null,
        id: bug.id,
    }
}
