<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { Dungeon, RewardChild } from "@/data"
import { LeveledMonster, rewardMap } from "@/data"
import { getDungeonType } from "@/utils/dungeon-utils"
import { getDropModeText, getRewardDetails, RewardItem as RewardItemType } from "@/utils/reward-utils"

const props = defineProps<{
    dungeon: Dungeon
}>()

const currentLevel = ref(props.dungeon.lv)
const ENDLESS_MAX_WAVE = 99
const ENDLESS_LEVEL_STEP = 5
const MAX_MONSTER_LEVEL = 180
type SpawnWave = NonNullable<Dungeon["spawn"]>[number]
type SpawnGenerator = SpawnWave[number]
type SpawnMonsterInfo = SpawnGenerator["m"][number]
type SpawnTagMonsterInfo = NonNullable<SpawnGenerator["sm"]>[number]
type DetailTab = "monster" | "wave" | "reward"
type RewardCostValue = number | [number, number, "Mod" | "Draft"]
const endlessWave = ref(1)
const useNihaoBoxBonus = ref(false)
const useMobileSpawnRadius = ref(false)

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
    value: RewardCostValue
    amount: number
}

/**
 * 根据副本数据选择默认页签，优先展示信息量最大的怪物页签。
 * @param dungeon 副本数据
 * @returns 默认页签
 */
function getDefaultDetailTab(dungeon: Dungeon): DetailTab {
    if (dungeon.m?.length || dungeon.sm?.length) {
        return "monster"
    }

    if (dungeon.spawn?.length) {
        return "wave"
    }

    if (dungeon.r?.length || dungeon.sr?.length) {
        return "reward"
    }

    return "monster"
}

const activeTab = ref<DetailTab>(getDefaultDetailTab(props.dungeon))

/**
 * 判断副本是否为无尽任务。
 * @returns 是否为无尽任务
 */
const isEndlessDungeon = computed(() => {
    return props.dungeon.n.includes("无尽") || props.dungeon.ts?.includes("无尽")
})

/**
 * 计算当前设定波次对应的等级基数（每波 +5，最大 180）。
 */
const endlessLevelBase = computed(() => {
    const level = props.dungeon.lv + (endlessWave.value - 1) * ENDLESS_LEVEL_STEP
    return Math.min(MAX_MONSTER_LEVEL, level)
})

/**
 * 当前无尽波次（限制在 1~99）。
 */
const selectedEndlessWave = computed(() => {
    return Math.max(1, Math.min(ENDLESS_MAX_WAVE, endlessWave.value))
})

/**
 * 怪物页签展示等级；无尽副本跟随波次，其他副本跟随等级滑块。
 */
const monsterTabLevel = computed(() => {
    if (isEndlessDungeon.value) {
        return endlessLevelBase.value
    }

    return currentLevel.value
})

/**
 * 需要累计的波次数（不能超过奖励数组长度）。
 */
const cumulativeWaveCount = computed(() => {
    if (!isEndlessDungeon.value || !props.dungeon.r?.length) {
        return 0
    }

    return Math.min(selectedEndlessWave.value, props.dungeon.r.length)
})

/**
 * 当前波次累计奖励的奖励组ID列表。
 */
const cumulativeWaveRewardIds = computed(() => {
    if (!cumulativeWaveCount.value) {
        return []
    }

    return props.dungeon.r.slice(0, cumulativeWaveCount.value)
})

/**
 * 你好箱奖励倍率。
 */
const cumulativeRewardMultiplier = computed(() => {
    return useNihaoBoxBonus.value ? 1.3 : 1
})

/**
 * 格式化奖励组序号区间显示
 * @param indices 奖励组原始序号（从 0 开始）
 * @returns 形如 #1~#3、#1,#3~#4 的文本
 */
function formatRewardIndexRanges(indices: number[]): string {
    if (!indices.length) return ""

    const sorted = [...indices].sort((a, b) => a - b)
    const ranges: string[] = []
    let start = sorted[0]
    let prev = sorted[0]

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i]
        if (current === prev + 1) {
            prev = current
            continue
        }

        ranges.push(start === prev ? `#${start + 1}` : `#${start + 1}~#${prev + 1}`)
        start = current
        prev = current
    }

    ranges.push(start === prev ? `#${start + 1}` : `#${start + 1}~#${prev + 1}`)

    return ranges.join(",")
}

/**
 * 将怪物等级限制在有效范围内。
 * @param level 原始等级
 * @returns 限制后的等级
 */
function clampMonsterLevel(level: number): number {
    return Math.max(1, Math.min(MAX_MONSTER_LEVEL, level))
}

/**
 * 获取刷怪展示的等级基数；无尽任务使用设定波次计算基数。
 */
function getSpawnLevelBase(): number {
    return isEndlessDungeon.value ? endlessLevelBase.value : props.dungeon.lv
}

/**
 * 计算普通怪物展示等级；lv 为相对偏移，默认按 0 处理。
 * @param spawnMonster 普通怪物刷怪配置
 * @returns 展示等级
 */
function getSpawnMonsterLevel(spawnMonster: SpawnMonsterInfo): number {
    return clampMonsterLevel(getSpawnLevelBase() + (spawnMonster.lv ?? 0))
}

/**
 * 计算号令者展示等级；lv 为相对偏移。
 * @param spawnTagMonster 号令者刷怪配置
 * @returns 展示等级
 */
function getSpawnTagMonsterLevel(spawnTagMonster: SpawnTagMonsterInfo): number {
    return clampMonsterLevel(getSpawnLevelBase() + spawnTagMonster.lv)
}

/**
 * 格式化单个普通怪物数量文本。
 * @param spawnMonster 普通怪物刷怪配置
 * @returns 数量文本
 */
function getSpawnMonsterCountText(spawnMonster: SpawnMonsterInfo): string {
    return `${spawnMonster.num}`
}

/**
 * 计算波次概要文本。
 * @param wave 单波刷怪配置
 * @returns 波次概要文本
 */
function getSpawnWaveSummaryText(wave: SpawnWave): string {
    const generatorCount = wave.length
    let normalMonsterCount = 0
    let commanderPoolCount = 0

    wave.forEach(spawnGenerator => {
        normalMonsterCount += spawnGenerator.m.reduce((sum, monster) => sum + monster.num, 0)
        commanderPoolCount += spawnGenerator.sm?.length || 0
    })

    if (!commanderPoolCount) {
        return `${generatorCount} 生成器 / 普怪 ${normalMonsterCount}`
    }

    return `${generatorCount} 生成器 / 普怪 ${normalMonsterCount} / 号令者池 ${commanderPoolCount}`
}

/**
 * 获取当前刷新范围显示平台。
 * @returns 平台名称
 */
function getSpawnRadiusPlatformText(): string {
    return useMobileSpawnRadius.value ? "移动端" : "PC"
}

/**
 * 格式化刷新范围（单位：米）。
 * @param radius 刷新范围数组，按 [PC最小, PC最大, 移动端最小, 移动端最大]
 * @returns 刷新范围文本
 */
function formatSpawnRadius(radius: number[]): string {
    if (radius.length < 2) {
        return radius.map(value => `${(value / 100).toFixed(2)}m`).join(" / ")
    }

    const isShowMobile = useMobileSpawnRadius.value && radius.length >= 4
    const min = isShowMobile ? radius[2] : radius[0]
    const max = isShowMobile ? radius[3] : radius[1]

    return `${(min / 100).toFixed(2)}~${(max / 100).toFixed(2)}m`
}

/**
 * 格式化号令者单次刷新数量池文本。
 * @param smnum 号令者单次刷新数量池
 * @returns 数量池文本
 */
function formatSpawnCommanderNumText(smnum?: number[]): string {
    if (!smnum?.length) {
        return "-"
    }

    return smnum.join(" / ")
}

/**
 * 计算号令者权重对应的百分比文本（保留两位小数）。
 * @param spawnGenerator 生成器配置
 * @param spawnTagMonster 号令者配置
 * @returns 百分比文本，不包含 % 符号
 */
function getSpawnTagMonsterWeightPercentText(spawnGenerator: SpawnGenerator, spawnTagMonster: SpawnTagMonsterInfo): string {
    const totalWeight = spawnGenerator.sm?.reduce((sum, item) => sum + item.w, 0) || 0
    if (totalWeight <= 0) {
        return "0.00"
    }

    return ((spawnTagMonster.w / totalWeight) * 100).toFixed(2)
}

/**
 * 格式化累计奖励显示数量（保留两位小数，整数不带小数）。
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
 * 递归累计奖励组中的可展示奖励项。
 * @param rewardId 奖励组ID
 * @param buckets 累计容器
 * @param parentAmount 父节点的数量倍率
 * @param visiting 当前递归路径上的奖励组ID，防止循环引用
 */
function collectRewardGroupItems(
    rewardId: number,
    buckets: Map<string, CumulativeRewardBucket>,
    parentAmount: number,
    visiting: Set<number> = new Set()
): void {
    if (visiting.has(rewardId)) {
        return
    }

    const reward = rewardMap.get(rewardId)
    if (!reward) {
        return
    }

    const nextVisiting = new Set(visiting)
    nextVisiting.add(rewardId)

    reward.child.forEach(rewardChild => {
        const childAmount = parentAmount * (rewardChild.c || 1)
        if (rewardChild.t === "Reward") {
            collectRewardGroupItems(rewardChild.id, buckets, childAmount, nextVisiting)
            return
        }

        pushRewardBucket(buckets, rewardChild, childAmount)
    })
}

/**
 * 计算当前波次累计奖励（用于奖励页签顶部展示）。
 */
const cumulativeWaveRewards = computed<CumulativeRewardDisplayItem[]>(() => {
    if (!cumulativeWaveRewardIds.value.length) {
        return []
    }

    const buckets = new Map<string, CumulativeRewardBucket>()
    cumulativeWaveRewardIds.value.forEach(rewardId => {
        collectRewardGroupItems(rewardId, buckets, 1)
    })

    return Array.from(buckets.values())
        .map(bucket => {
            const finalAmount = formatRewardAmount(bucket.amount * cumulativeRewardMultiplier.value)
            if (bucket.t === "Mod") {
                return {
                    key: bucket.key,
                    name: bucket.n,
                    value: [finalAmount, bucket.id, bucket.d ? "Draft" : "Mod"] as RewardCostValue,
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

/**
 * 合并奖励列表中相同奖励组（按 reward.id）并记录原始索引
 */
const mergedDungeonRewards = computed(() => {
    const groupedRewards = new Map<number, { reward: RewardItemType; indices: number[] }>()

    props.dungeon.r?.forEach((rewardId, index) => {
        const reward = getRewardDetails(rewardId)
        if (!reward) return

        const grouped = groupedRewards.get(reward.id)
        if (grouped) {
            grouped.indices.push(index)
            return
        }

        groupedRewards.set(reward.id, {
            reward,
            indices: [index],
        })
    })

    return Array.from(groupedRewards.values())
})

watch(
    () => props.dungeon.id,
    () => {
        currentLevel.value = props.dungeon.lv
        endlessWave.value = 1
        useNihaoBoxBonus.value = false
        useMobileSpawnRadius.value = false
        activeTab.value = getDefaultDetailTab(props.dungeon)
    }
)
</script>

<template>
    <div class="p-3 space-y-3">
        <!-- 详情头部 -->
        <div class="flex items-center justify-between">
            <div>
                <SRouterLink :to="`/db/dungeon/${dungeon.id}`" class="text-lg font-bold link link-primary">
                    {{ dungeon.n }}
                </SRouterLink>
                <div class="text-sm text-base-content/70">
                    {{ dungeon.desc }}
                </div>
            </div>
            <span class="text-xs px-2 py-1 rounded" :class="getDungeonType(dungeon.t).color + ' text-white'">
                {{ getDungeonType(dungeon.t).label }}
            </span>
        </div>

        <!-- 副本信息 -->
        <div class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">副本信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">ID</span>
                    <span>{{ dungeon.id }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">等级</span>
                    <span>Lv.{{ dungeon.lv }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">类型</span>
                    <span>{{ dungeon.t }}</span>
                </div>
                <div v-if="dungeon.e" class="flex justify-between">
                    <span class="text-base-content/70">属性</span>
                    <span>{{ dungeon.e }}</span>
                </div>
                <div v-if="dungeon.win" class="flex justify-between">
                    <span class="text-base-content/70">胜利</span>
                    <span>{{ dungeon.win === 1 ? "手动" : dungeon.win === 2 ? "自动" : "特殊" }}</span>
                </div>
            </div>
        </div>

        <div class="tabs tabs-boxed bg-base-200/60 p-1">
            <button type="button" class="tab flex-1" :class="{ 'tab-active': activeTab === 'monster' }" @click="activeTab = 'monster'">
                怪物 ({{ (dungeon.m?.length || 0) + (dungeon.sm?.length || 0) }})
            </button>
            <button type="button" class="tab flex-1" :class="{ 'tab-active': activeTab === 'wave' }" @click="activeTab = 'wave'">
                波次 ({{ dungeon.spawn?.length || 0 }})
            </button>
            <button type="button" class="tab flex-1" :class="{ 'tab-active': activeTab === 'reward' }" @click="activeTab = 'reward'">
                奖励 ({{ (dungeon.r?.length || 0) + (dungeon.sr?.length || 0) }})
            </button>
        </div>

        <div v-if="isEndlessDungeon" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <div class="mb-1 flex items-center justify-between text-sm">
                <span>无尽波次</span>
                <span>{{ selectedEndlessWave }} / {{ ENDLESS_MAX_WAVE }}</span>
            </div>
            <input
                v-model.number="endlessWave"
                type="range"
                class="range range-primary range-xs w-full"
                min="1"
                :max="ENDLESS_MAX_WAVE"
                step="1"
            />
            <div class="mt-1 text-xs text-base-content/70">当前怪物等级基数 Lv.{{ endlessLevelBase }}（每波 +{{ ENDLESS_LEVEL_STEP }}，最高 180）</div>
        </div>

        <template v-if="activeTab === 'monster'">
            <!-- 普通怪物 -->
            <div v-if="dungeon.m?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <!-- 等级控制 -->
                <div class="flex items-center gap-4 mb-3">
                    <span class="text-sm min-w-12">Lv. {{ monsterTabLevel }}</span>
                    <input
                        v-if="!isEndlessDungeon"
                        v-model.number="currentLevel"
                        type="range"
                        class="range range-primary range-xs grow"
                        min="1"
                        max="180"
                        step="1"
                    />
                    <span v-else class="text-xs text-base-content/70">无尽副本等级由上方波次滑块控制</span>
                </div>
                <h3 class="font-bold mb-2">普通怪物 ({{ dungeon.m.length }}种)</h3>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                    <DBMonsterCompactCard
                        v-for="monsterId in dungeon.m"
                        :key="monsterId"
                        :monster="new LeveledMonster(monsterId, monsterTabLevel)"
                    />
                </div>
            </div>

            <!-- 特殊怪物 -->
            <div v-if="dungeon.sm?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">特殊怪物 ({{ dungeon.sm.length }}种)</h3>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                    <DBMonsterCompactCard
                        v-for="monsterId in dungeon.sm"
                        :key="monsterId"
                        :monster="new LeveledMonster(monsterId, monsterTabLevel)"
                    />
                </div>
            </div>

            <div v-if="!dungeon.m?.length && !dungeon.sm?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3 text-sm text-base-content/70">
                暂无怪物数据
            </div>
        </template>

        <template v-else-if="activeTab === 'wave'">
            <div class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <div class="flex items-center justify-between">
                    <span class="text-sm">刷新范围显示</span>
                    <label class="label cursor-pointer gap-2 p-0">
                        <span class="text-xs text-base-content/70">移动端</span>
                        <input v-model="useMobileSpawnRadius" type="checkbox" class="checkbox checkbox-xs" />
                    </label>
                </div>
                <div class="mt-1 text-xs text-base-content/70">当前平台：{{ getSpawnRadiusPlatformText() }}（默认 PC）</div>
            </div>

            <!-- 怪物波次 -->
            <div v-if="dungeon.spawn?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">怪物波次 ({{ dungeon.spawn.length }}波)</h3>
                <div class="space-y-3">
                    <div
                        v-for="(wave, waveIndex) in dungeon.spawn"
                        :key="`${dungeon.id}-wave-${waveIndex}`"
                        class="rounded-lg border border-base-300 bg-base-200/60 p-2"
                    >
                        <div class="mb-2 flex items-center justify-between">
                            <span class="text-sm font-medium">第 {{ waveIndex + 1 }} 波</span>
                            <span class="text-xs text-base-content/70">{{ getSpawnWaveSummaryText(wave) }}</span>
                        </div>

                        <div class="space-y-3">
                            <div
                                v-for="(spawnGenerator, spawnIndex) in wave"
                                :key="`${waveIndex}-${spawnGenerator.id}-${spawnIndex}`"
                                class="rounded border border-base-300 bg-base-100/80 p-2"
                            >
                                <div class="mb-2 grid gap-1 text-xs text-base-content/70 md:grid-cols-2">
                                    <div class="flex items-center justify-between rounded bg-base-200 px-2 py-1">
                                        <span>生成器ID</span>
                                        <span>{{ spawnGenerator.id }}</span>
                                    </div>
                                    <div class="flex items-center justify-between rounded bg-base-200 px-2 py-1">
                                        <span>检查时间</span>
                                        <span>{{ spawnGenerator.time }}s</span>
                                    </div>
                                    <div class="flex items-center justify-between rounded bg-base-200 px-2 py-1">
                                        <span>刷新间隔</span>
                                        <span>{{ spawnGenerator.th }}s</span>
                                    </div>
                                    <div class="flex items-center justify-between rounded bg-base-200 px-2 py-1">
                                        <span>刷新范围 ({{ getSpawnRadiusPlatformText() }})</span>
                                        <span>{{ formatSpawnRadius(spawnGenerator.radius) }}</span>
                                    </div>
                                </div>

                                <div class="mb-2">
                                    <div class="mb-1 text-xs font-medium text-base-content/70">普通怪物 ({{ spawnGenerator.m.length }}种)</div>
                                    <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                                        <div
                                            v-for="(spawnMonster, monsterIndex) in spawnGenerator.m"
                                            :key="`${spawnGenerator.id}-m-${spawnMonster.id}-${monsterIndex}`"
                                            class="space-y-1"
                                        >
                                            <DBMonsterCompactCard
                                                :monster="new LeveledMonster(spawnMonster.id, getSpawnMonsterLevel(spawnMonster))"
                                            />
                                            <div class="flex items-center justify-between rounded bg-base-200 px-2 py-1 text-xs">
                                                <span class="text-base-content/70">数量</span>
                                                <span class="font-medium">x{{ getSpawnMonsterCountText(spawnMonster) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="spawnGenerator.sm?.length">
                                    <div class="mb-1 flex items-center justify-between text-xs font-medium text-base-content/70">
                                        <span>号令者 ({{ spawnGenerator.sm.length }}种)</span>
                                        <span>单次刷新数量池: {{ formatSpawnCommanderNumText(spawnGenerator.smnum) }}</span>
                                    </div>
                                    <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                                        <div
                                            v-for="(spawnTagMonster, tagIndex) in spawnGenerator.sm"
                                            :key="`${spawnGenerator.id}-sm-${spawnTagMonster.id}-${tagIndex}`"
                                            class="space-y-1"
                                        >
                                            <DBMonsterCompactCard
                                                :monster="new LeveledMonster(spawnTagMonster.id, getSpawnTagMonsterLevel(spawnTagMonster))"
                                            />
                                            <div class="flex items-center justify-between rounded bg-base-200 px-2 py-1 text-xs">
                                                <span class="text-base-content/70">权重</span>
                                                <span class="font-medium">
                                                    {{ spawnTagMonster.w }} ({{ getSpawnTagMonsterWeightPercentText(spawnGenerator, spawnTagMonster) }}%)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="card bg-base-100 border border-base-200 rounded-lg p-3 text-sm text-base-content/70">暂无波次数据</div>
        </template>

        <template v-else>
            <div v-if="isEndlessDungeon && dungeon.r?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <div class="mb-2 flex items-center justify-between">
                    <h3 class="font-bold">波数累计奖励 (1~{{ cumulativeWaveCount }}波)</h3>
                    <label class="label cursor-pointer gap-2 text-xs">
                        <span>你好箱</span>
                        <input v-model="useNihaoBoxBonus" type="checkbox" class="checkbox checkbox-xs" />
                    </label>
                </div>
                <div v-if="cumulativeWaveRewards.length" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                    <ResourceCostItem
                        v-for="item in cumulativeWaveRewards"
                        :key="item.key"
                        :name="item.name"
                        :value="item.value"
                        class="bg-base-200"
                    />
                </div>
                <div v-else class="text-sm text-base-content/70">当前波次暂无可累计奖励</div>
            </div>

            <!-- 奖励列表 -->
            <div v-if="dungeon.r?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">奖励列表</h3>
                <div class="space-y-3">
                    <div
                        v-for="item in mergedDungeonRewards"
                        :key="`${item.reward.id}-${item.indices.join('-')}`"
                        class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                    >
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium">{{ formatRewardIndexRanges(item.indices) }} 奖励组 {{ item.reward.id }}</span>

                            <span
                                class="text-xs px-1.5 py-0.5 rounded"
                                :class="
                                    getDropModeText(item.reward.m || '') === '独立'
                                        ? 'bg-success text-success-content'
                                        : 'bg-warning text-warning-content'
                                "
                            >
                                {{ getDropModeText(item.reward.m || "") }}
                                <span v-if="item.reward.totalP">总容量 {{ item.reward.totalP }}</span>
                            </span>
                        </div>
                        <!-- 使用 RewardItem 组件显示奖励 -->
                        <RewardItem :reward="item.reward" />
                    </div>
                </div>
            </div>

            <!-- 特殊奖励 -->
            <div v-if="dungeon.sr?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">特殊奖励 ({{ dungeon.sr.length }}组)</h3>
                <div class="space-y-3">
                    <div
                        v-for="reward in dungeon.sr.map(id => getRewardDetails(id)).filter((r): r is RewardItemType => !!r)"
                        :key="reward.id"
                        class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                    >
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium">特殊奖励组 {{ reward.id }}</span>
                            <span
                                class="text-xs px-1.5 py-0.5 rounded"
                                :class="
                                    getDropModeText(reward.m || '') === '独立'
                                        ? 'bg-success text-success-content'
                                        : 'bg-warning text-warning-content'
                                "
                            >
                                {{ getDropModeText(reward.m || "") }}
                                <span v-if="reward.totalP">总容量 {{ reward.totalP }}</span>
                            </span>
                        </div>
                        <!-- 使用 RewardItem 组件显示奖励 -->
                        <RewardItem :reward="reward" />
                    </div>
                </div>
            </div>

            <div v-if="!dungeon.r?.length && !dungeon.sr?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3 text-sm text-base-content/70">
                暂无奖励数据
            </div>
        </template>
    </div>
</template>
