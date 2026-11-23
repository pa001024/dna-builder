import { getRewardDetails, type RewardItem } from "@/utils/reward-utils"

/** 奖励条目：name 是游戏原文（调用方再过 gt），missing 表示整组奖励都取不到 */
export interface TranscendenceRewardChip {
    key: string
    name: string
    count?: number
    /** 上游没有名词条：调用方按当前语言渲染「未知奖励」，不得输出空 chip */
    unnamed?: boolean
    missing?: boolean
    missingId?: number
}

/** 奖励摘要：行数超过 limit 时用 extra 提示剩余数量 */
export interface TranscendenceRewardSummary {
    rows: TranscendenceRewardChip[]
    extra: number
    missing: boolean
    missingId?: number
}

/**
 * 递归摊平奖励组的叶子项。
 * @param items 奖励组子项
 * @param rows 收集结果
 */
function walkRewardItems(items: RewardItem[] | undefined, rows: TranscendenceRewardChip[]): void {
    for (const item of items ?? []) {
        if (item.t === "Reward") {
            walkRewardItems(item.child, rows)
            continue
        }

        const name = item.n ?? ""

        rows.push({ key: `${item.t}-${item.id}-${rows.length}`, name, unnamed: !name, count: item.c })
    }
}

/**
 * 汇总一条奖励引用：主引用取不到时依次回退 fallbackIds，全部取不到时返回缺失标记。
 * @param rewardId 主奖励 id
 * @param fallbackIds 回退奖励 id
 * @param limit 最多展示的条目数
 * @returns 奖励摘要
 */
export function summarizeTranscendenceReward(rewardId?: number, fallbackIds: number[] = [], limit = 4): TranscendenceRewardSummary {
    const collect = (id: number): TranscendenceRewardChip[] => {
        const rows: TranscendenceRewardChip[] = []
        walkRewardItems(getRewardDetails(id)?.child, rows)

        return rows
    }

    let rows = rewardId === undefined ? [] : collect(rewardId)

    if (!rows.length) {
        for (const id of fallbackIds) {
            rows = collect(id)
            if (rows.length) {
                break
            }
        }
    }

    if (!rows.length) {
        return {
            rows: [{ key: `missing-${rewardId ?? "none"}`, name: "", missing: true, missingId: rewardId }],
            extra: 0,
            missing: true,
            missingId: rewardId,
        }
    }

    return { rows: rows.slice(0, limit), extra: Math.max(rows.length - limit, 0), missing: false }
}

/**
 * 汇总一条奖励引用的全部条目（详情页不截断）。
 * @param rewardId 主奖励 id
 * @param fallbackIds 回退奖励 id
 * @returns 奖励摘要
 */
export function summarizeTranscendenceRewardFull(rewardId?: number, fallbackIds: number[] = []): TranscendenceRewardSummary {
    return summarizeTranscendenceReward(rewardId, fallbackIds, Number.MAX_SAFE_INTEGER)
}
