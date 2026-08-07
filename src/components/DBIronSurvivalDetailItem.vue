<script lang="ts" setup>
import { computed, ref } from "vue"
import {
    dungeonMap,
    ironSurvivalData,
    ironSurvivalDungeonData,
    LeveledChar,
    MonsterLevelUpperLimit,
    monsterLevelDropData,
    rewardMap,
} from "@/data"
import { IronSurvivalMonsterLevelLimit } from "@/data/d/const.data"
import type { Reward, RewardChild } from "@/data/data-types"
import { getDungeonType } from "@/utils/dungeon-utils"
import { getRewardDetails } from "@/utils/reward-utils"

interface IronSurvivalRewardRow {
    threshold: number
    rewardId: number
}

interface MonsterLevelDropRow {
    level: number
    probability: number
    probabilityUp: number
    rewardId: number
}

interface CumulativeRewardBucket {
    key: string
    t: string
    id: number
    n: string
    d?: 1
    amount: number
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
    wave?: number
}>()

const dungeon = computed(() => ironSurvivalData[props.dungeonId] || null)
const dungeonDetail = computed(() => ironSurvivalDungeonData[props.dungeonId] || null)
const dungeonBase = computed(() => dungeonMap.get(props.dungeonId) || null)
const IRON_SURVIVAL_LEVEL_STEP = 5
const IRON_SURVIVAL_REWARD_BATCH_COUNT = 1
const strongKillCount = computed(() => dungeon.value?.StrongKillCount?.[0] || 50)
const selectedWave = computed(() => Math.max(1, props.wave ?? 1))
const useCompoundReward = ref(false)
const monsterLevelLimit = computed(() => {
    const ticketMax = Math.max(0, ...(dungeonDetail.value?.AvaliableTicketLevel || [0]))
    if (ticketMax > 0) {
        return ticketMax
    }
    return dungeonDetail.value ? IronSurvivalMonsterLevelLimit : MonsterLevelUpperLimit
})

/**
 * 计算深境探险怪物展示等级。
 * @returns 当前波次对应的怪物等级
 */
const ironSurvivalMonsterLevel = computed(() => {
    const baseLevel = dungeonBase.value?.lv || 1
    const level = baseLevel + (selectedWave.value - 1) * IRON_SURVIVAL_LEVEL_STEP
    return Math.min(monsterLevelLimit.value, level)
})

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

/**
 * 归档单个奖励项到累计表。
 * @param buckets 累计容器
 * @param rewardChild 奖励项
 * @param amount 该奖励项应累计的数量
 */
function pushRewardBucket(buckets: Map<string, CumulativeRewardBucket>, rewardChild: RewardChild, amount: number): void {
    if (amount <= 0) {
        return
    }

    const key = `${rewardChild.t}-${rewardChild.id}-${rewardChild.d ? "draft" : "normal"}-${rewardChild.n || ""}`
    const existed = buckets.get(key)
    if (existed) {
        existed.amount += amount
        return
    }

    buckets.set(key, {
        key,
        t: rewardChild.t,
        id: rewardChild.id,
        n: rewardChild.n || `${rewardChild.t} ${rewardChild.id}`,
        d: rewardChild.d,
        amount,
    })
}

/**
 * 计算单个奖励子项的实际概率。
 * @param reward 父奖励组
 * @param rewardChild 奖励子项
 * @param totalP 父奖励组的总权重
 * @returns 实际概率，取值为 0~1
 */
function getRewardChildProbability(reward: Reward, rewardChild: RewardChild, totalP: number): number {
    if (reward.m === "Fixed") {
        return 1
    }

    if (reward.m === "Independent") {
        return (rewardChild.p || 0) / 10000
    }

    if (totalP <= 0) {
        return 0
    }

    return (rewardChild.p || 0) / totalP
}

/**
 * 将奖励树按实际概率转换为累计桶。
 * @param rewardId 奖励组ID
 * @param buckets 累计容器
 * @param multiplier 当前累计倍率
 * @param visiting 当前递归路径上的奖励组ID，防止循环引用
 */
function collectRewardExpectationBucketsFromReward(
    rewardId: number,
    buckets: Map<string, CumulativeRewardBucket>,
    multiplier = 1,
    visiting: Set<number> = new Set()
): void {
    if (visiting.has(rewardId)) {
        return
    }

    const reward = rewardMap.get(rewardId)
    if (!reward?.child?.length) {
        return
    }

    const nextVisiting = new Set(visiting)
    nextVisiting.add(rewardId)

    const totalP = reward.child.reduce((sum, child) => sum + (child.p || 0), 0)

    reward.child.forEach(rewardChild => {
        const probability = getRewardChildProbability(reward, rewardChild, totalP)
        if (probability <= 0) {
            return
        }

        const nextMultiplier = multiplier * probability * rewardChild.c
        if (rewardChild.t === "Reward") {
            collectRewardExpectationBucketsFromReward(rewardChild.id, buckets, nextMultiplier, nextVisiting)
            return
        }

        pushRewardBucket(buckets, rewardChild, nextMultiplier)
    })
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
 * 计算某个奖励阈值在当前波次范围内实际生效的波次数量。
 * @param threshold 当前奖励阈值
 * @returns 生效波次数
 */
function getRewardRowWaveCount(threshold: number): number {
    const baseLevel = dungeonBase.value?.lv || 1
    const startWave = Math.max(1, Math.ceil((threshold - baseLevel) / IRON_SURVIVAL_LEVEL_STEP) + 1)
    const endWave = selectedWave.value

    if (endWave < startWave) {
        return 0
    }

    return endWave - startWave + 1
}

/**
 * 将累计桶转换为可展示列表。
 * @param buckets 累计容器
 * @param excludeIronTicket 是否排除罗盘项（基础收益未排除；复利路径下罗盘同样保留展示）
 * @returns 排序后的展示列表
 */
function toCumulativeDisplayItems(
    buckets: Map<string, CumulativeRewardBucket>,
    excludeIronTicket = false
): CumulativeRewardDisplayItem[] {
    return Array.from(buckets.values())
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
    const currentThreshold = ironSurvivalMonsterLevel.value

    rewardRows.value.forEach(row => {
        if (!row.rewardId) {
            return
        }

        if (row.threshold > currentThreshold) {
            return
        }

        const waveCount = getRewardRowWaveCount(row.threshold)
        if (waveCount <= 0) {
            return
        }

        collectRewardExpectationBucketsFromReward(row.rewardId, buckets, waveCount * IRON_SURVIVAL_REWARD_BATCH_COUNT)
    })

    return toCumulativeDisplayItems(buckets)
})

const ironTicketExpectationCache = new Map<number, number>()

/**
 * 计算单个奖励组展开后罗盘（IronTicket）的总掉落期望。
 * @param rewardId 奖励组ID
 * @returns 罗盘掉落期望数量
 */
function getIronTicketExpectation(rewardId: number): number {
    const cached = ironTicketExpectationCache.get(rewardId)
    if (cached !== undefined) {
        return cached
    }

    const buckets = new Map<string, CumulativeRewardBucket>()
    collectRewardExpectationBucketsFromReward(rewardId, buckets)
    const expectation = Array.from(buckets.values()).reduce((sum, bucket) => sum + (bucket.t === "IronTicket" ? bucket.amount : 0), 0)
    ironTicketExpectationCache.set(rewardId, expectation)
    return expectation
}

/**
 * 复利累计奖励：每波正常打一次，同时将掉落罗盘（等级为下一波等级）继续投入下一波，
 * 逐波递归，直到达到当前设定波次等级。
 * 第 w 波被打次数 Q_w 满足 Q_{w+1} = 1 + Q_w × t_w（t_w 为该波打一次的罗盘掉落期望）。
 * 罗盘项保留展示，数量为复利路径下含再投资产生的总期望。
 */
const compoundCumulativeRewards = computed<CumulativeRewardDisplayItem[]>(() => {
    const buckets = new Map<string, CumulativeRewardBucket>()
    const baseLevel = dungeonBase.value?.lv || 1
    const maxLevel = ironSurvivalMonsterLevel.value
    let playCount = 1

    for (let wave = 1; ; wave++) {
        const level = baseLevel + (wave - 1) * IRON_SURVIVAL_LEVEL_STEP
        if (level > maxLevel) {
            break
        }

        const rows = rewardRows.value.filter(row => row.threshold <= level)
        if (!rows.length) {
            continue
        }

        let waveTicket = 0
        for (const row of rows) {
            collectRewardExpectationBucketsFromReward(row.rewardId, buckets, playCount * IRON_SURVIVAL_REWARD_BATCH_COUNT)
            waveTicket += getIronTicketExpectation(row.rewardId)
        }
        playCount = 1 + playCount * waveTicket
    }

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
        <div class="p-2 space-y-2" v-if="dungeonBase && !hideTitle">
            <div class="flex items-center gap-2 min-w-0">
                <img v-if="dungeonBase.e" :src="LeveledChar.elementUrl(dungeonBase.e)" alt="" class="h-8 inline-block" />
                <SRouterLink :to="`/db/dungeon/${dungeonBase.id}`" class="text-lg font-bold link link-primary">
                    {{ $t(dungeonBase.n) }}
                </SRouterLink>
                <CopyID :id="dungeonBase.id" />
                <div class="flex-1"></div>
                <span class="text-xs px-2 py-1 rounded" :class="getDungeonType(dungeonBase.t).color + ' text-white'">
                    Lv.{{ dungeonBase.lv }} {{ dungeonBase.t }}
                </span>
            </div>
            <div class="text-sm text-base-content/70">
                {{ dungeonBase.desc }}
            </div>
        </div>

        <div class="p-3 rounded bg-base-200">
            <div class="mb-2 flex items-center justify-between gap-2">
                <div class="text-xs text-base-content/70">累计奖励</div>
                <div class="flex items-center gap-2">
                    <span v-if="useCompoundReward" class="text-xs text-base-content/70">（含复利）</span>
                    <label class="label cursor-pointer gap-1 p-0">
                        <span class="text-xs text-base-content/70">复利</span>
                        <input v-model="useCompoundReward" type="checkbox" class="checkbox checkbox-xs" />
                    </label>
                    <span class="text-xs text-base-content/70">Lv.{{ ironSurvivalMonsterLevel }} 及以下</span>
                </div>
            </div>
            <div v-if="displayedCumulativeRewards.length" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <ResourceCostItem
                    v-for="item in displayedCumulativeRewards"
                    :key="item.key"
                    :name="item.name"
                    :value="item.value"
                    class="bg-base-200"
                />
            </div>
            <div v-else class="text-sm text-base-content/60">当前暂无可累计奖励</div>
        </div>

        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">等级奖励表</div>
            <div class="text-xs text-base-content/60 mb-2">可获取小于等于当前等级的所有奖励</div>
            <div class="space-y-2">
                <div
                    v-for="row in rewardRowDetails"
                    :key="row.threshold"
                    class="p-3 rounded bg-base-100 border border-base-200 flex items-start justify-between gap-3"
                >
                    <div class="shrink-0">
                        <div class="text-sm">
                            Lv. {{ row.threshold }}
                            <CopyID :id="row.rewardId" />
                        </div>
                        <RewardItem v-if="row.reward" :reward="row.reward" />
                    </div>
                </div>
            </div>
        </div>

        <div v-if="monsterLevelDropRewards.length" class="p-3 rounded bg-base-200">
            <div class="mb-2 flex items-center justify-between gap-2">
                <div class="text-xs text-base-content/70">强敌掉落表</div>
                <div class="text-xs text-base-content/70">{{ strongKillCount }}击杀/强敌</div>
            </div>
            <div class="space-y-2">
                <div
                    v-for="dropRow in monsterLevelDropRewards"
                    :key="`${dropRow.level}-${dropRow.rewardId}`"
                    class="rounded border border-base-200 bg-base-100 p-3"
                >
                    <div class="mb-2 flex flex-wrap items-center gap-2 text-sm">
                        <span class="font-medium">Lv. {{ dropRow.level }}</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-base-200">概率 {{ dropRow.probability / 100 }}%</span>
                        <span class="text-xs px-2 py-0.5 rounded bg-base-200">概率提升 {{ dropRow.probabilityUp / 100 }}%</span>
                        <CopyID :id="dropRow.rewardId" />
                    </div>
                    <RewardItem v-if="dropRow.reward" :reward="dropRow.reward" />
                </div>
            </div>
        </div>

        <DBIronSurvivalSpawn v-if="dungeon && !hideTitle" :dungeon-id="props.dungeonId" :wave="wave" />
    </div>
</template>
