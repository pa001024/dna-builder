import { dungeonMap, monsterMap } from "@/data/d"
import type { DnaSeasonCommissionTier, DnaSeasonQuest } from "@/data/d/dnaseason.data"
import { buffLevels, buffTypes, commissionTiers, seasons as dnaSeasons, tiers as seasonTiers } from "@/data/d/dnaseason.data"
import { getRewardDetails, type RewardItem } from "@/utils/reward-utils"
import type { TranscendenceRewardChip, TranscendenceRewardSummary } from "@/utils/transcendence-reward"
import { getMonsterIconUrl } from "@/utils/transcendence-rift"

/** 难度档名称 → 界面文案键：上游 `tierLevel` 1–4 与 TextMap `UI_DNASeasonTier_Name_*` 一一对应 */
export const SEASON_TIER_NAME_KEYS: Record<number, string> = {
    1: "db-transcendence.overview.tier_name_1",
    2: "db-transcendence.overview.tier_name_2",
    3: "db-transcendence.overview.tier_name_3",
    4: "db-transcendence.overview.tier_name_4",
}

/** 旅程任务行：附带所属阶段信息 */
export interface JourneyQuestRow extends DnaSeasonQuest {
    phase: number
    phaseId: number
    coreQuestId: number
}

/** 旅程阶段摘要 */
export interface JourneyPhaseRow {
    index: number
    phaseId: number
    count: number
}

/** 档位奖励行：难度标签 + 摘要 chip + RewardItem 直出所需的原始奖励组 */
export interface SeasonTierRow extends TranscendenceRewardSummary {
    tierId: number
    /** 难度名文案键与档内罗马序号（16 档与 16 难度阶按 tierId 对齐） */
    nameKey: string
    nameTier: string
    rewardId: number
    reward: RewardItem | null
}

/** 委托副本行：副本信息与 16 档奖励 */
export interface JourneyCommissionRow {
    dungeonId: number
    ruleId: number
    sort: number
    image: string
    name?: string
    typeKey?: string
    desc?: string
    monsters: { id: number; name?: string; iconUrl: string }[]
    tiers: SeasonTierRow[]
}

/** 旅程增益组：4 类型，各 4 级（合计 16 行） */
export interface JourneyBuffGroup {
    id: string
    desc: string
    icon: string
    smallIcon: string
    levels: { id: number; level: number; dropBonusRate: number; cost: Record<string, number> }[]
}

const dnaSeason = dnaSeasons[0]

/**
 * 任务 id 变化后是否需要清除阶段筛选与搜索词。
 *
 * 只有「首次深链水合」或「目标被当前筛选隐藏」才重置：
 * 用户点选同阶段任务不得清筛选，否则列表会突然回滚到全量。
 * @param hydrated 深链水合是否已完成
 * @param visible 目标任务是否在当前筛选结果中
 * @returns 是否需要重置筛选
 */
export function shouldResetJourneyFilters(hydrated: boolean, visible: boolean): boolean {
    return !hydrated || !visible
}

/**
 * 展平 5 个阶段的任务（附阶段序号，供列表与详情共用）。
 * @returns 任务行
 */
export function buildJourneyQuestRows(): JourneyQuestRow[] {
    const rows: JourneyQuestRow[] = []

    for (const phase of dnaSeason?.questPhases ?? []) {
        for (const quest of phase.quests) {
            rows.push({ ...quest, phase: phase.index, phaseId: phase.phaseId, coreQuestId: phase.coreQuestId })
        }
    }

    return rows
}

/**
 * 阶段摘要（8/12/13/9/10 = 52）。
 * @returns 阶段列表
 */
export function getJourneyPhases(): JourneyPhaseRow[] {
    return (dnaSeason?.questPhases ?? []).map(phase => ({ index: phase.index, phaseId: phase.phaseId, count: phase.quests.length }))
}

/**
 * 升华赛季副本类型 → 界面文案键。
 * 上游 `DungeonType` 只有英文枚举，这里按 TextMap 官方短名映射；
 * 未映射的类型不展示（不输出英文枚举）。
 * @param type 上游副本类型
 * @returns i18n 文案键；未收录返回空串
 */
export function getTranscendenceDungeonTypeKey(type: string | undefined): string {
    if (type === "SurvivalMini") {
        return "db-transcendence.common.dungeon_type_exploration"
    }

    if (type === "SurvivalMiniPro") {
        return "db-transcendence.common.dungeon_type_hedge"
    }

    if (type === "Defence") {
        return "db-transcendence.common.dungeon_type_defence"
    }

    if (type === "ExtermPro") {
        return "db-transcendence.common.dungeon_type_expulsion"
    }

    return ""
}

/**
 * 递归摊平奖励树叶子（与 summarizeTranscendenceReward 同口径）。
 * @param reward 奖励根
 * @param rows 收集结果
 * @returns 叶子 chip
 */
function collectRewardChips(reward: RewardItem, rows: TranscendenceRewardChip[] = []): TranscendenceRewardChip[] {
    for (const item of reward.child ?? []) {
        if (item.t === "Reward") {
            collectRewardChips(item, rows)
            continue
        }

        const name = item.n ?? ""
        rows.push({ key: `${item.t}-${item.id}-${rows.length}`, name, unnamed: !name, count: item.c })
    }

    return rows
}

/**
 * 解析档位奖励：主奖励组无叶子时回退 `dungeonRewards`，一次遍历同时产出 RewardItem 根与摘要 chip。
 * @param rewardId 主奖励组 id（dungeonRewardView）
 * @param fallbackIds 回退奖励组 id
 * @param limit 摘要 chip 最多保留的条目数
 * @returns 奖励根与摘要
 */
export function resolveTierReward(
    rewardId: number,
    fallbackIds: number[],
    limit = 4
): { reward: RewardItem | null; summary: TranscendenceRewardSummary } {
    for (const id of [rewardId, ...fallbackIds]) {
        const reward = getRewardDetails(id)
        if (!reward) {
            continue
        }

        const rows = collectRewardChips(reward)
        if (!rows.length) {
            continue
        }

        return { reward, summary: { rows: rows.slice(0, limit), extra: Math.max(rows.length - limit, 0), missing: false } }
    }

    return {
        reward: null,
        summary: {
            rows: [{ key: `missing-${rewardId}`, name: "", missing: true, missingId: rewardId }],
            extra: 0,
            missing: true,
            missingId: rewardId,
        },
    }
}

/**
 * 构建档位奖励行：tierId 对齐 16 难度阶取难度名，同时保留摘要 chip 与 RewardItem 原始奖励组。
 * @param group 委托规则对应的档位组
 * @param limit 摘要 chip 最多保留的条目数
 * @returns 档位奖励行
 */
export function buildSeasonTierRows(group: DnaSeasonCommissionTier | undefined, limit = 4): SeasonTierRow[] {
    return (group?.tiers ?? []).map(tier => {
        const difficulty = seasonTiers.find(item => item.id === tier.tierId)
        const { reward, summary } = resolveTierReward(tier.dungeonRewardView, tier.dungeonRewards ?? [], limit)

        return {
            tierId: tier.tierId,
            nameKey: difficulty ? (SEASON_TIER_NAME_KEYS[difficulty.tierLevel] ?? "") : "",
            nameTier: difficulty?.nameTier ?? "",
            rewardId: tier.dungeonRewardView,
            reward,
            ...summary,
        }
    })
}

/**
 * 构建 4 个委托副本行：副本名/类型/怪物 join 本地表，档位奖励优先 dungeonRewardView。
 * @returns 委托行
 */
export function buildJourneyCommissionRows(): JourneyCommissionRow[] {
    return (dnaSeason?.commissions ?? []).map(commission => {
        const dungeon = dungeonMap.get(commission.dungeonId)
        const tierGroup = commissionTiers.find(group => group.ruleId === commission.ruleId)

        return {
            dungeonId: commission.dungeonId,
            ruleId: commission.ruleId,
            sort: commission.sort,
            image: commission.image,
            name: dungeon?.n,
            typeKey: getTranscendenceDungeonTypeKey(dungeon?.t),
            desc: dungeon?.desc,
            monsters: (dungeon?.m ?? []).map(unitId => {
                const monster = monsterMap.get(unitId)

                return { id: unitId, name: monster?.n, iconUrl: getMonsterIconUrl(monster?.icon) }
            }),
            tiers: buildSeasonTierRows(tierGroup),
        }
    })
}

/**
 * 旅程增益：按 buffType 分组，组内按等级升序。
 * @returns 4 个增益组
 */
export function buildJourneyBuffGroups(): JourneyBuffGroup[] {
    return buffTypes.map(type => ({
        id: type.id,
        desc: type.desc,
        icon: type.icon,
        smallIcon: type.smallIcon,
        levels: buffLevels
            .filter(level => level.type === type.id)
            .sort((left, right) => left.level - right.level)
            .map(level => ({ id: level.id, level: level.level, dropBonusRate: level.dropBonusRate, cost: level.cost })),
    }))
}
