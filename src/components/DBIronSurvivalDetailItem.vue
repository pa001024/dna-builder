<script lang="ts" setup>
import { computed, ref } from "vue"
import { dungeonMap, ironSurvivalData, ironSurvivalDungeonData, LeveledChar, MonsterLevelUpperLimit, monsterLevelDropData } from "@/data"
import { IronSurvivalMonsterLevelLimit } from "@/data/d/const.data"
import { getDungeonType } from "@/utils/dungeon-utils"
import type { CumulativeRewardBucket, IronSurvivalRewardRow } from "@/utils/iron-survival-reward-utils"
import {
    collectRewardExpectationBucketsFromReward,
    computeCompoundCumulativeBuckets,
    IRON_SURVIVAL_LEVEL_STEP,
    IRON_SURVIVAL_REWARD_BATCH_COUNT,
} from "@/utils/iron-survival-reward-utils"
import { getRewardDetails } from "@/utils/reward-utils"

interface MonsterLevelDropRow {
    level: number
    probability: number
    probabilityUp: number
    rewardId: number
}

interface CumulativeRewardDisplayItem {
    key: string
    name: string
    value: number | CumulativeRewardValue
    amount: number
}

type CumulativeRewardValue = [number | string, number | string, "Mod" | "Draft" | "IronTicket"]

const props = defineProps<{
    dungeonId: number
    hideTitle?: boolean
    /** 起始等级（含），缺省为副本基础等级 */
    startLevel?: number
    /** 结束等级（不含），[startLevel, endLevel) 半开区间 */
    endLevel?: number
}>()

const dungeon = computed(() => ironSurvivalData[props.dungeonId] || null)
const dungeonDetail = computed(() => ironSurvivalDungeonData[props.dungeonId] || null)
const dungeonBase = computed(() => dungeonMap.get(props.dungeonId) || null)
const strongKillCount = computed(() => dungeon.value?.StrongKillCount?.[0] || 50)
const baseMonsterLevel = computed(() => dungeonBase.value?.lv || 1)
const selectedStartLevel = computed(() => Math.max(baseMonsterLevel.value, props.startLevel ?? baseMonsterLevel.value))
const selectedEndLevel = computed(() =>
    Math.max(selectedStartLevel.value + IRON_SURVIVAL_LEVEL_STEP, props.endLevel ?? selectedStartLevel.value + IRON_SURVIVAL_LEVEL_STEP)
)
const useCompoundReward = ref(false)
const monsterLevelLimit = computed(() => {
    const ticketMax = Math.max(0, ...(dungeonDetail.value?.AvaliableTicketLevel || [0]))
    if (ticketMax > 0) {
        return ticketMax
    }
    return dungeonDetail.value ? IronSurvivalMonsterLevelLimit : MonsterLevelUpperLimit
})

/** 起始等级的怪物等级（封顶展示） */
const ironSurvivalStartMonsterLevel = computed(() => Math.min(monsterLevelLimit.value, selectedStartLevel.value))

/** 结束等级前一级（区间实际覆盖的最后一档）的怪物等级 */
const ironSurvivalEndMonsterLevel = computed(() => Math.min(monsterLevelLimit.value, selectedEndLevel.value - IRON_SURVIVAL_LEVEL_STEP))

const monsterLevelDropRows = computed<MonsterLevelDropRow[]>(() => {
    return (dungeonDetail.value?.MonsterLevelDrop || [])
        .map(dropId => monsterLevelDropData[dropId])
        .filter((drop): drop is NonNullable<typeof drop> => !!drop)
        .flatMap(drop =>
            drop.MonsterLevel.map((level, index) => ({
                level,
                probability: drop.BaseProbability[index] || 0,
                probabilityUp: drop.ProbabilityUp[index] || 0,
                rewardId: drop.RewardId[index] || 0,
            }))
        )
})

const monsterLevelDropRewards = computed(() => {
    return monsterLevelDropRows.value.map(row => ({
        ...row,
        reward: getRewardDetails(row.rewardId),
    }))
})

/**
 * 将累计奖励数量格式化为可展示数值。
 * @param amount 原始数量
 * @returns 格式化后的数量
 */
function formatRewardAmount(amount: number): number {
    const rounded = Math.round(amount * 100) / 100
    if (Number.isInteger(rounded)) {
        return Math.trunc(rounded)
    }

    return rounded
}

const rewardRows = computed<IronSurvivalRewardRow[]>(() => {
    const rewardMap = dungeonDetail.value?.IronRoundsRewardView || dungeonDetail.value?.IronRoundsReward || {}
    return Object.entries(rewardMap)
        .map(([threshold, rewardId]) => ({
            threshold: Number(threshold),
            rewardId: Number(rewardId),
        }))
        .sort((a, b) => a.threshold - b.threshold)
})

/**
 * 计算某个奖励阈值在「起始等级 ~ 结束等级」半开区间内实际生效的等级档数。
 * @param threshold 当前奖励阈值
 * @returns 生效档数
 */
function getRewardRowLevelCount(threshold: number): number {
    const fromLevel = Math.max(threshold, selectedStartLevel.value)
    if (selectedEndLevel.value <= fromLevel) {
        return 0
    }

    return Math.ceil((selectedEndLevel.value - fromLevel) / IRON_SURVIVAL_LEVEL_STEP)
}

/**
 * 将累计桶转换为可展示列表。
 * @param buckets 累计容器
 * @param excludeIronTicket 是否排除罗盘项（基础收益未排除；复利路径下罗盘同样保留展示）
 * @returns 排序后的展示列表
 */
function toCumulativeDisplayItems(buckets: Map<string, CumulativeRewardBucket>, excludeIronTicket = false): CumulativeRewardDisplayItem[] {
    return Array.from(buckets.values())
        .filter(bucket => formatRewardAmount(bucket.amount) !== 0)
        .filter(bucket => !(excludeIronTicket && bucket.t === "IronTicket"))
        .map(bucket => {
            const finalAmount = formatRewardAmount(bucket.amount)
            if (bucket.t === "Mod") {
                return {
                    key: bucket.key,
                    name: bucket.n,
                    value: [finalAmount, bucket.id, bucket.d ? "Draft" : "Mod"] as CumulativeRewardValue,
                    amount: bucket.amount,
                }
            }

            if (bucket.t === "IronTicket") {
                return {
                    key: bucket.key,
                    name: bucket.n,
                    value: [finalAmount, bucket.id, "IronTicket"] as CumulativeRewardValue,
                    amount: bucket.amount,
                }
            }

            return {
                key: bucket.key,
                name: bucket.n,
                value: finalAmount,
                amount: bucket.amount,
            }
        })
        .sort((a, b) => b.amount - a.amount)
}

const roundsCumulativeRewards = computed<CumulativeRewardDisplayItem[]>(() => {
    if (!rewardRows.value.length) {
        return []
    }

    const buckets = new Map<string, CumulativeRewardBucket>()

    rewardRows.value.forEach(row => {
        if (!row.rewardId) {
            return
        }

        if (row.threshold >= selectedEndLevel.value) {
            return
        }

        const levelCount = getRewardRowLevelCount(row.threshold)
        if (levelCount <= 0) {
            return
        }

        collectRewardExpectationBucketsFromReward(row.rewardId, buckets, levelCount * IRON_SURVIVAL_REWARD_BATCH_COUNT)
    })

    return toCumulativeDisplayItems(buckets)
})

/**
 * 复利累计奖励：起始档投入 1 趟，波次等级逐档递增，每一趟打到 L 档时掉落罗盘（等级为下一档）
 * 继续投入下一档开新趟，且该趟本身也推进到下一档，逐档复投直到结束等级（不含）。
 * 第 L 档被打次数 Q_L 满足 Q_{start} = 1、Q_{L+5} = Q_L × (1 + t_L)。
 * 罗盘项保留展示，数量为复利路径下含再投资产生的总期望。
 */
const compoundCumulativeRewards = computed<CumulativeRewardDisplayItem[]>(() => {
    const buckets = computeCompoundCumulativeBuckets(
        rewardRows.value,
        selectedStartLevel.value,
        selectedEndLevel.value,
        IRON_SURVIVAL_LEVEL_STEP,
        IRON_SURVIVAL_REWARD_BATCH_COUNT
    )
    return toCumulativeDisplayItems(buckets)
})

const displayedCumulativeRewards = computed(() =>
    useCompoundReward.value ? compoundCumulativeRewards.value : roundsCumulativeRewards.value
)

const rewardRowDetails = computed(() => {
    return rewardRows.value.map(row => ({
        ...row,
        reward: row.rewardId ? getRewardDetails(row.rewardId) : null,
    }))
})
</script>

<template>
    <div class="space-y-3">
        <div class="space-y-2" v-if="dungeonBase && !hideTitle">
            <div class="flex items-center gap-2 min-w-0">
                <img v-if="dungeonBase.e" :src="LeveledChar.elementUrl(dungeonBase.e)" alt="" class="h-8 inline-block" />
                <SRouterLink
                    :to="`/db/dungeon/${dungeonBase.id}`"
                    class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary"
                >
                    {{ $t(dungeonBase.n) }}
                </SRouterLink>
                <CopyID :id="dungeonBase.id" />
                <div class="flex-1"></div>
                <span
                    class="shrink-0 rounded-xs px-2 py-1 text-xs font-semibold"
                    :class="getDungeonType(dungeonBase.t).color + ' text-primary-content'"
                >
                    Lv.{{ dungeonBase.lv }} {{ dungeonBase.t }}
                </span>
            </div>
            <p class="text-sm leading-relaxed text-base-content/70">
                {{ dungeonBase.desc }}
            </p>
        </div>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CUMULATIVE" title="累计奖励">
                <template #trailing>
                    <div class="flex items-center gap-2">
                        <span v-if="useCompoundReward" class="text-xs text-base-content/70">（含复利）</span>
                        <label class="label cursor-pointer gap-1 p-0">
                            <span class="text-xs text-base-content/70">复利</span>
                            <input v-model="useCompoundReward" type="checkbox" class="checkbox checkbox-xs" />
                        </label>
                        <span class="font-mono text-[11px] tabular-nums text-base-content/55">
                            Lv.{{ ironSurvivalStartMonsterLevel }} ~ Lv.{{ ironSurvivalEndMonsterLevel }}
                        </span>
                    </div>
                </template>
            </SectionHeader>
            <div v-if="displayedCumulativeRewards.length" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <ResourceCostItem v-for="item in displayedCumulativeRewards" :key="item.key" :name="item.name" :value="item.value" />
            </div>
            <div v-else class="text-sm text-base-content/60">当前暂无可累计奖励</div>
        </section>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="REWARD TABLE" title="等级奖励表" />
            <p class="mb-2 text-[11px] tracking-wide text-base-content/55">可获取小于等于当前等级的所有奖励</p>
            <div class="space-y-2">
                <div
                    v-for="row in rewardRowDetails"
                    :key="row.threshold"
                    class="flex items-start justify-between gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="min-w-0 shrink-0">
                        <div class="flex items-baseline gap-1 text-sm">
                            <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">Lv. {{ row.threshold }}</span>
                            <CopyID :id="row.rewardId" />
                        </div>
                        <RewardItem v-if="row.reward" :reward="row.reward" />
                    </div>
                </div>
            </div>
        </section>

        <section v-if="monsterLevelDropRewards.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="STRONG DROP" title="强敌掉落表" :count="`${strongKillCount}击杀/强敌`" />
            <div class="space-y-2">
                <div
                    v-for="dropRow in monsterLevelDropRewards"
                    :key="`${dropRow.level}-${dropRow.rewardId}`"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
                        <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">Lv. {{ dropRow.level }}</span>
                        <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/55">
                            概率 {{ dropRow.probability / 100 }}%
                        </span>
                        <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/55">
                            概率提升 {{ dropRow.probabilityUp / 100 }}%
                        </span>
                        <CopyID :id="dropRow.rewardId" />
                    </div>
                    <RewardItem v-if="dropRow.reward" :reward="dropRow.reward" />
                </div>
            </div>
        </section>

        <DBIronSurvivalSpawn
            v-if="dungeon && !hideTitle"
            :dungeon-id="props.dungeonId"
            :wave="Math.max(1, Math.round((selectedEndLevel - baseMonsterLevel) / IRON_SURVIVAL_LEVEL_STEP))"
        />
    </div>
</template>
