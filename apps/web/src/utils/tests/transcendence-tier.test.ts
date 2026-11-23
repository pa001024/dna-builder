import { describe, expect, it } from "vitest"
import { commissionTiers } from "@/data/d/dnaseason.data"
import type { RewardItem } from "@/utils/reward-utils"
import { buildSeasonTierRows, resolveTierReward, SEASON_TIER_NAME_KEYS } from "@/utils/transcendence-journey"

/** 16 档期望的难度名键与档内罗马序号（tierId 1–16 与 seasonTiers 对齐） */
const EXPECTED_LEVELS = [1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
const EXPECTED_NAME_TIERS = ["Ⅰ", "Ⅱ", "Ⅰ", "Ⅱ", "Ⅰ", "Ⅱ", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"]
const COMMISSION_GROUP = commissionTiers[0]
const REAL_REWARD_ID = COMMISSION_GROUP.tiers[0].dungeonRewardView

/**
 * 统计奖励树可渲染叶子数（与 collectRewardChips 同口径）。
 * @param reward 奖励根
 * @returns 叶子数
 */
function countLeaves(reward: RewardItem | null): number {
    return (reward?.child ?? []).reduce((sum, item) => sum + (item.t === "Reward" ? countLeaves(item) : 1), 0)
}

describe("buildSeasonTierRows：16 档难度映射", () => {
    it("tierId、nameKey、nameTier 与 seasonTiers 1–16 全量对齐", () => {
        const rows = buildSeasonTierRows(COMMISSION_GROUP)
        expect(rows).toHaveLength(16)
        rows.forEach((row, index) => {
            expect(row.tierId).toBe(index + 1)
            expect(row.nameKey).toBe(SEASON_TIER_NAME_KEYS[EXPECTED_LEVELS[index]])
            expect(row.nameTier).toBe(EXPECTED_NAME_TIERS[index])
            expect(row.nameKey).not.toBe("")
        })
    })

    it("档位缺失时返回空数组", () => {
        expect(buildSeasonTierRows(undefined)).toEqual([])
    })

    it("limit 只截断摘要 chip，extra 补足剩余数量", () => {
        const all = buildSeasonTierRows(COMMISSION_GROUP, 100)
        const limited = buildSeasonTierRows(COMMISSION_GROUP, 2)
        limited.forEach((row, index) => {
            expect(row.rows.length).toBeLessThanOrEqual(2)
            expect(row.rows.length + row.extra).toBe(all[index].rows.length + all[index].extra)
        })
    })
})

describe("resolveTierReward：根与摘要同源", () => {
    it("列表摘要与详情 RewardItem 根来自同一奖励组", () => {
        const tier = COMMISSION_GROUP.tiers[0]
        const { reward, summary } = resolveTierReward(tier.dungeonRewardView, tier.dungeonRewards ?? [], 4)
        expect(reward?.id).toBe(tier.dungeonRewardView)
        expect(summary.missing).toBe(false)
        expect(summary.rows.length + summary.extra).toBe(countLeaves(reward))

        const row = buildSeasonTierRows(COMMISSION_GROUP).find(item => item.tierId === tier.tierId)
        expect(row?.reward?.id).toBe(tier.dungeonRewardView)
        expect(row?.rows).toEqual(summary.rows)
        expect(row?.extra).toBe(summary.extra)
    })

    it("主奖励组无叶子时回退 dungeonRewards", () => {
        const missingViewId = 987654321
        const rows = buildSeasonTierRows(
            { ruleId: 1, tiers: [{ tierId: 1, dungeonRewardView: missingViewId, dungeonRewards: [REAL_REWARD_ID] }] },
            4
        )
        expect(rows[0].rewardId).toBe(missingViewId)
        expect(rows[0].reward?.id).toBe(REAL_REWARD_ID)
        expect(rows[0].missing).toBe(false)
        expect(rows[0].rows.length).toBeGreaterThan(0)
    })

    it("主组与回退组都取不到时返回缺失摘要", () => {
        const missingViewId = 987654321
        const rows = buildSeasonTierRows(
            { ruleId: 1, tiers: [{ tierId: 1, dungeonRewardView: missingViewId, dungeonRewards: [missingViewId + 1] }] },
            4
        )
        expect(rows[0].reward).toBeNull()
        expect(rows[0].missing).toBe(true)
        expect(rows[0].missingId).toBe(missingViewId)
        expect(rows[0].rows[0]?.missing).toBe(true)
    })

    it("dungeonRewards 为空时同样返回缺失摘要", () => {
        const missingViewId = 987654321
        const rows = buildSeasonTierRows({ ruleId: 1, tiers: [{ tierId: 1, dungeonRewardView: missingViewId }] }, 4)
        expect(rows[0].reward).toBeNull()
        expect(rows[0].missing).toBe(true)
        expect(rows[0].missingId).toBe(missingViewId)
    })
})
