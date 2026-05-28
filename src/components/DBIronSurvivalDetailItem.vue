<script lang="ts" setup>
import { computed } from "vue"
import { dungeonMap, ironSurvivalDungeonData, LeveledChar, LeveledMonster, monsterLevelDropMap, rewardMap } from "@/data"
import { IronSurvivalMonsterLevelLimit } from "@/data/d/const.data"
import type { IronSurvival } from "@/data/d/ironsurvival.data"
import { ironSurvivalMonsterSpawnData } from "@/data/d/ironsurvival.data"
import type { Reward, RewardChild } from "@/data/data-types"
import { getDungeonType } from "@/utils/dungeon-utils"
import { getRewardDetails } from "@/utils/reward-utils"

interface IronSurvivalRewardRow {
    threshold: number
    rewardId: number | undefined
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
    dungeon: IronSurvival
    hideTitle?: boolean
    wave?: number
}>()

const dungeonDetail = computed(() => ironSurvivalDungeonData[props.dungeon.DungeonId] || null)
const dungeonBase = computed(() => dungeonMap.get(props.dungeon.DungeonId) || null)
const IRON_SURVIVAL_LEVEL_STEP = 5
const IRON_SURVIVAL_REWARD_BATCH_COUNT = 3
const dungeonMonsterSpawnMap = computed(() => new Map(ironSurvivalMonsterSpawnData.map(spawn => [spawn.id, spawn])))
const strongKillCount = computed(() => props.dungeon.StrongKillCount?.[0] || 50)
const selectedWave = computed(() => Math.max(1, props.wave ?? 1))

/**
 * 计算深境探险怪物展示等级。
 * @returns 当前波次对应的怪物等级
 */
const ironSurvivalMonsterLevel = computed(() => {
    const baseLevel = dungeonBase.value?.lv || 1
    const level = baseLevel + (selectedWave.value - 1) * IRON_SURVIVAL_LEVEL_STEP
    return Math.min(IronSurvivalMonsterLevelLimit, level)
})

const monsterLevelDropRows = computed<MonsterLevelDropRow[]>(() => {
    return (dungeonDetail.value?.MonsterLevelDrop || [])
        .map(dropId => monsterLevelDropMap.get(dropId))
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
 * @param nextThreshold 下一个奖励阈值
 * @returns 生效波次数
 */
function getRewardRowWaveCount(threshold: number, nextThreshold: number | undefined): number {
    const baseLevel = dungeonBase.value?.lv || 1
    const startWave = Math.max(1, Math.ceil((threshold - baseLevel) / IRON_SURVIVAL_LEVEL_STEP) + 1)
    const endWave = nextThreshold
        ? Math.min(selectedWave.value, Math.ceil((nextThreshold - baseLevel) / IRON_SURVIVAL_LEVEL_STEP))
        : selectedWave.value

    if (endWave < startWave) {
        return 0
    }

    return endWave - startWave + 1
}

const roundsCumulativeRewards = computed<CumulativeRewardDisplayItem[]>(() => {
    if (!rewardRows.value.length) {
        return []
    }

    const buckets = new Map<string, CumulativeRewardBucket>()
    rewardRows.value.forEach((row, index) => {
        if (!row.rewardId) {
            return
        }

        const nextThreshold = rewardRows.value[index + 1]?.threshold
        const waveCount = getRewardRowWaveCount(row.threshold, nextThreshold)
        if (waveCount <= 0) {
            return
        }

        collectRewardExpectationBucketsFromReward(row.rewardId, buckets, waveCount * IRON_SURVIVAL_REWARD_BATCH_COUNT)
    })

    return Array.from(buckets.values())
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
})

const rewardRowDetails = computed(() => {
    return rewardRows.value.map(row => ({
        ...row,
        reward: row.rewardId ? getRewardDetails(row.rewardId) : null,
    }))
})

/**
 * 根据生成器ID获取真正的怪物ID列表。
 * @param spawnId 生成器ID
 * @returns 怪物ID列表
 */
function getSpawnMonsterIds(spawnId: number): number[] {
    return dungeonMonsterSpawnMap.value.get(spawnId)?.m?.map(monster => monster.id) || []
}
</script>

<template>
    <div class="space-y-3">
        <div class="p-2 space-y-2" v-if="dungeonBase && !hideTitle">
            <div class="flex items-center gap-2 min-w-0">
                <img v-if="dungeonBase.e" :src="LeveledChar.elementUrl(dungeonBase.e)" alt="" class="h-8 inline-block" />
                <SRouterLink :to="`/db/dungeon/${dungeonBase.id}`" class="text-lg font-bold link link-primary">
                    {{ dungeonBase.n }}
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
                <div class="text-xs text-base-content/70">3次/轮，Lv.{{ ironSurvivalMonsterLevel }} 及以下</div>
            </div>
            <div v-if="roundsCumulativeRewards.length" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <ResourceCostItem
                    v-for="item in roundsCumulativeRewards"
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
            <div class="space-y-2">
                <div
                    v-for="row in rewardRowDetails"
                    :key="row.threshold"
                    class="p-3 rounded bg-base-100 border border-base-200 flex items-start justify-between gap-3"
                >
                    <div class="shrink-0">
                        <div class="text-sm">Lv. {{ row.threshold }} 奖励组 {{ row.rewardId }}</div>
                        <RewardItem v-if="row.reward" :reward="row.reward" />
                    </div>
                </div>
            </div>
        </div>

        <div class="p-3 rounded bg-base-200">
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
                        <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">原型奖励 {{ dropRow.rewardId }}</span>
                    </div>
                    <RewardItem v-if="dropRow.reward" :reward="dropRow.reward" />
                </div>
            </div>
        </div>

        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">普通刷怪</div>
            <div class="space-y-2">
                <div
                    v-for="(spawnGroup, index) in dungeon.MonsterSpawnId"
                    :key="index"
                    class="p-3 rounded bg-base-100 border border-base-200"
                >
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="font-medium">第 {{ index + 1 }} 组</div>
                        <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">怪物 ID 组</span>
                    </div>
                    <div class="space-y-2">
                        <div v-for="spawnId in spawnGroup" :key="spawnId" class="rounded border border-base-200 bg-base-200/60 p-2">
                            <div class="mb-2 flex items-center justify-between text-xs text-base-content/70">
                                <span>生成器</span>
                                <CopyID :id="spawnId" />
                            </div>
                            <div class="mb-2 text-xs text-base-content/70">{{ strongKillCount }} 小怪后生成 1 个精英</div>
                            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                                <DBMonsterCompactCard
                                    v-for="monsterId in getSpawnMonsterIds(spawnId)"
                                    :key="`${spawnId}-${monsterId}`"
                                    :monster="new LeveledMonster(monsterId, ironSurvivalMonsterLevel)"
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">强敌刷怪</div>
            <div class="space-y-2">
                <div
                    v-for="(spawnGroup, index) in dungeon.StrongLoopSpawnId"
                    :key="index"
                    class="p-3 rounded bg-base-100 border border-base-200"
                >
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="font-medium">阶段 {{ index + 1 }}</div>
                        <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">强敌 ID 组</span>
                    </div>
                    <div class="space-y-2">
                        <div v-for="spawnId in spawnGroup" :key="spawnId" class="rounded border border-base-200 bg-base-200/60 p-2">
                            <div class="mb-2 flex items-center justify-between text-xs text-base-content/70">
                                <span>生成器</span>
                                <CopyID :id="spawnId" />
                            </div>
                            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                                <DBMonsterCompactCard
                                    v-for="monsterId in getSpawnMonsterIds(spawnId)"
                                    :key="`${spawnId}-${monsterId}`"
                                    :monster="new LeveledMonster(monsterId, ironSurvivalMonsterLevel)"
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
