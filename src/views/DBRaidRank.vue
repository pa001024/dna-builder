<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useSearchParam } from "@/composables/useSearchParam"
import { dungeonMap } from "@/data"
import {
    getPreRaidRankReward,
    PreRaidRank,
    type PreRaidRankRewardItem,
    RaidBuff,
    RaidCalculation,
    RaidDungeon,
    RaidSeason,
} from "@/data/d/raid.data"
import { getDropModeText } from "@/utils/i18n-utils"
import { getRewardDetails } from "@/utils/reward-utils"

// 计算分数函数
const calculateScore = (baseRaidPoint: number, remainingTime: number, formulaId: number): number => {
    // 找到对应的计算公式
    const formula = RaidCalculation.find(item => item.FomulaId === formulaId)
    if (!formula) return baseRaidPoint

    const { RaidTimeRate, RaidTimeZone } = formula
    let totalAddition = 0
    let timeUsed = 0

    // 计算每个时区的加成
    for (let i = 0; i < RaidTimeZone.length; i++) {
        const zoneEnd = RaidTimeZone[i]
        const rate = RaidTimeRate[i]

        // 如果剩余时间已经用完，结束计算
        if (remainingTime <= timeUsed) break

        // 计算当前时区的时间范围
        const zoneStart = i === 0 ? 0 : RaidTimeZone[i - 1]
        const zoneDuration = zoneEnd - zoneStart

        // 计算在当前时区中实际使用的时间
        const timeInZone = Math.min(remainingTime - timeUsed, zoneDuration)

        // 累加当前时区的加成
        totalAddition += timeInZone * rate
        timeUsed += timeInZone
    }

    // 计算最终分数
    return Math.floor(baseRaidPoint + totalAddition * baseRaidPoint)
}

/**
 * 根据目标分数反推剩余时间。
 * @param baseRaidPoint 基础分数
 * @param targetScore 目标分数
 * @param formulaId 公式ID
 * @returns 反推出的剩余时间
 */
const calculateRemainingTimeByScore = (baseRaidPoint: number, targetScore: number, formulaId: number): number => {
    const formula = RaidCalculation.find(item => item.FomulaId === formulaId)
    if (!formula) return 0

    const maxTime = Math.max(...formula.RaidTimeZone)
    if (targetScore <= baseRaidPoint) return 0

    let remainingAddition = targetScore / baseRaidPoint - 1
    let time = 0

    for (let i = 0; i < formula.RaidTimeZone.length; i++) {
        const rate = formula.RaidTimeRate[i] ?? 0
        const zoneEnd = formula.RaidTimeZone[i]
        const zoneStart = i === 0 ? 0 : formula.RaidTimeZone[i - 1]
        const zoneDuration = zoneEnd - zoneStart

        if (rate <= 0) continue

        const zoneAddition = zoneDuration * rate
        if (remainingAddition <= zoneAddition) {
            return Math.min(time + remainingAddition / rate, maxTime)
        }

        remainingAddition -= zoneAddition
        time += zoneDuration
    }

    return maxTime
}

// 状态管理
const raidDungeons = Object.values(RaidDungeon)
const defaultSeason =
    Object.values(RaidSeason)
        .filter(season => raidDungeons.some(dungeon => dungeon.RaidSeason === season.RaidSeason))
        .sort((a, b) => a.RaidSeason - b.RaidSeason)
        .at(-1)?.RaidSeason ?? 0
const defaultDungeon =
    raidDungeons
        .filter(dungeon => dungeon.RaidSeason === defaultSeason)
        .sort((a, b) => a.DifficultyLevel - b.DifficultyLevel)
        .at(-1)?.DungeonId ?? 0

const selectedSeason = useSearchParam<number>("s", defaultSeason)
const scoreInput = ref("")
const remainingTime = ref(30)
const selectedDungeon = useSearchParam<number>("d", defaultDungeon)
const activeInfoTab = useSearchParam<"score" | "dungeon" | "rank">("t", "rank")
const seasonTabs = computed(() => Object.values(RaidSeason))
const dungeonTabs = computed(() => {
    const season = RaidSeason[selectedSeason.value]
    if (!season) return []

    return Object.values(RaidDungeon).filter(dungeon => dungeon.RaidSeason === season.RaidSeason)
})

/**
 * 切换赛季时，保留当前副本在新赛季中的序号。
 * @param nextSeason 目标赛季ID
 */
const handleSeasonChange = (nextSeason: number) => {
    if (selectedSeason.value === nextSeason) return

    const previousDungeon = RaidDungeon[selectedDungeon.value]
    const previousSeasonDungeons = Object.values(RaidDungeon)
        .filter(dungeon => dungeon.RaidSeason === previousDungeon?.RaidSeason)
        .sort((a, b) => a.DifficultyLevel - b.DifficultyLevel)
    const nextSeasonDungeons = Object.values(RaidDungeon)
        .filter(dungeon => dungeon.RaidSeason === nextSeason)
        .sort((a, b) => a.DifficultyLevel - b.DifficultyLevel)

    const previousIndex = previousSeasonDungeons.findIndex(dungeon => dungeon.DungeonId === selectedDungeon.value)

    selectedSeason.value = nextSeason
    selectedDungeon.value = nextSeasonDungeons[previousIndex]?.DungeonId ?? nextSeasonDungeons.at(-1)?.DungeonId ?? selectedDungeon.value
}

// 计算当前选中副本的最大允许剩余时间
const maxAllowedTime = computed(() => {
    const dungeon = RaidDungeon[selectedDungeon.value]
    if (!dungeon) return 0

    const formula = RaidCalculation.find(item => item.FomulaId === dungeon.FomulaId)
    if (!formula) return 0

    // 使用RaidTimeZone的最大值作为最大允许时间
    return Math.max(...formula.RaidTimeZone)
})

const currentDungeonData = computed(() => RaidDungeon[selectedDungeon.value])

const maxScore = computed(() => {
    const dungeon = currentDungeonData.value
    if (!dungeon) return 0
    return calculateScore(dungeon.BaseRaidPoint, maxAllowedTime.value, dungeon.FomulaId)
})

const minScore = computed(() => currentDungeonData.value?.BaseRaidPoint ?? 0)

/**
 * 将输入的剩余时间限制在允许范围内，并同步分数输入。
 * @param value 输入的剩余时间
 */
const updateRemainingTime = (value: number) => {
    const maxTime = maxAllowedTime.value
    const nextTime = Math.max(0, Math.min(value, maxTime))
    remainingTime.value = nextTime

    const dungeon = currentDungeonData.value
    if (!dungeon) return
    scoreInput.value = `${calculateScore(dungeon.BaseRaidPoint, nextTime, dungeon.FomulaId)}`
}

/**
 * 根据输入分数反推剩余时间，并同步分数输入。
 * @param event 输入事件
 */
const handleScoreInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target) {
        const rawValue = target.value
        scoreInput.value = rawValue

        if (!rawValue.trim()) return

        const dungeon = currentDungeonData.value
        if (!dungeon) return

        const parsedScore = Number(rawValue)
        if (!Number.isFinite(parsedScore)) return
        if (parsedScore < minScore.value) return

        const nextScore = Math.max(0, Math.min(parsedScore, maxScore.value))
        updateRemainingTime(calculateRemainingTimeByScore(dungeon.BaseRaidPoint, nextScore, dungeon.FomulaId))
    }
}

/**
 * 分数输入失焦后统一规整显示值。
 */
const commitScoreInput = () => {
    const dungeon = currentDungeonData.value
    if (!dungeon) return

    const parsedScore = Number(scoreInput.value)
    const nextScore = Number.isFinite(parsedScore)
        ? Math.max(minScore.value, Math.min(Math.floor(parsedScore), maxScore.value))
        : maxScore.value

    scoreInput.value = `${nextScore}`
    updateRemainingTime(calculateRemainingTimeByScore(dungeon.BaseRaidPoint, nextScore, dungeon.FomulaId))
}

/**
 * 根据输入剩余时间更新分数输入。
 * @param event 输入事件
 */
const handleRemainingTimeInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target) {
        updateRemainingTime(Number(target.value))
    }
}

// 计算当前选中副本的分数
const currentScore = computed(() => {
    const dungeon = currentDungeonData.value
    if (!dungeon) return 0

    // 确保使用的剩余时间不超过最大值
    const actualTime = Math.min(remainingTime.value, maxAllowedTime.value)
    return calculateScore(dungeon.BaseRaidPoint, actualTime, dungeon.FomulaId)
})

const currentFormula = computed(() => {
    const formulaId = currentDungeonData.value?.FomulaId
    if (!formulaId) return undefined

    return RaidCalculation.find(item => item.FomulaId === formulaId)
})

/**
 * 初始化或切换副本时，回填最高分数和最大剩余时间。
 */
const fillMaxScoreAndTime = () => {
    remainingTime.value = maxAllowedTime.value
    scoreInput.value = `${maxScore.value}`
}

watch(selectedDungeon, fillMaxScoreAndTime, { immediate: true })

// 当前赛季/副本的分数奖励配置（RaidPointToRewrad 与最大奖励次数）
/**
 * 新赛季（1006 起）奖励配置迁移到副本维度，优先取当前副本的配置，旧赛季回退到赛季维度。
 */
const rewardConfig = computed(() => {
    const dungeon = currentDungeonData.value
    const seasonData = RaidSeason[selectedSeason.value]
    return {
        reward: dungeon?.RaidPointToRewrad ?? seasonData?.RaidPointToRewrad,
        maxTime: dungeon?.RaidPointToRewradMaxTime ?? seasonData?.RaidPointToRewradMaxTime,
    }
})

// 计算奖励次数函数
const calculateRewardCount = (score: number, season: number | string): number => {
    const seasonData = RaidSeason[season]
    if (!seasonData) return 0

    // 最大奖励次数优先取当前副本配置（新赛季），旧赛季回退到赛季配置
    const maxTime =
        currentDungeonData.value?.RaidPointToRewradMaxTime ?? seasonData.RaidPointToRewradMaxTime ?? 0

    // 计算奖励次数 = 分数 / 1000（向下取整）
    let rewardCount = Math.floor(score / 1000)

    // 限制最大奖励次数
    rewardCount = Math.min(rewardCount, maxTime)

    return rewardCount
}

// 计算当前分数对应的奖励次数
const currentRewardCount = computed(() => {
    return calculateRewardCount(currentScore.value, selectedSeason.value)
})

// 获取当前赛季/副本的奖励ID
const rewardId = computed(() => {
    // RaidPointToRewrad的键是分数阈值，值是奖励ID
    // 新赛季配置迁移到副本维度，优先取副本配置，旧赛季回退到赛季配置
    const rewardMap = rewardConfig.value.reward
    if (!rewardMap) return 0

    const firstRewardKey = Object.keys(rewardMap)[0]
    return rewardMap[firstRewardKey] || 0
})

// 获取当前奖励详情
const currentReward = computed(() => {
    const id = rewardId.value
    return getRewardDetails(id)
})

const currentDungeon = computed(() => {
    return dungeonMap.get(selectedDungeon.value)
})

// 原始排名数据（暂时保留）
interface RankDataItem {
    percent: number
    rank: string
    reward: PreRaidRankRewardItem
}

const supportedTitleFrameIds = new Set([10021, 10022, 10023, 10024, 10025, 10028, 10029, 10030, 10031, 10032])

const rankData = computed<RankDataItem[]>(() => {
    const data = PreRaidRank[selectedSeason.value]
    if (!data) return []

    return data.RankName.flatMap((item, index) => {
        const reward = getPreRaidRankReward(selectedSeason.value, index)
        if (!reward) return []

        return [
            {
                rank: item,
                percent: data.RankPercent[index],
                reward,
            },
        ]
    })
})

function getTitleFrameId(reward: PreRaidRankRewardItem) {
    const titleFrameId = reward.child?.[0]?.id
    if (!titleFrameId || !supportedTitleFrameIds.has(titleFrameId)) return undefined
    return titleFrameId
}

function getDungeonName(dungeonId: number) {
    return dungeonMap.get(dungeonId)?.n || `${dungeonId}`
}

function getSeasonName(str: number) {
    return `${~~(str / 1000)}.${~~(str % 1000)}`
}

/**
 * 判断名次条目是否属于前三档（用于主色强调）。
 * @param index 名次条目索引
 * @returns 是否属于前三档
 */
function isTopThreeRank(index: number): boolean {
    return index < 3
}
</script>
<template>
    <ScrollArea class="h-full min-h-0">
        <div class="stagger-rise space-y-4 p-4">
            <!-- 赛季 / 副本筛选：方章 chip -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <div class="space-y-3">
                    <!-- 赛季筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">SEASON</span>
                        <button
                            v-for="season in seasonTabs"
                            :key="season.RaidSeason"
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSeason === season.RaidSeason
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="handleSeasonChange(season.RaidSeason)"
                        >
                            {{ getSeasonName(season.RaidSeason) }}
                        </button>
                    </div>
                    <!-- 副本筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">DUNGEON</span>
                        <button
                            v-for="dungeon in dungeonTabs"
                            :key="dungeon.DungeonId"
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedDungeon === dungeon.DungeonId
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedDungeon = dungeon.DungeonId"
                        >
                            {{ getDungeonName(dungeon.DungeonId) }} (难度{{ dungeon.DifficultyLevel }})
                        </button>
                    </div>
                </div>
            </section>

            <!-- 词缀说明 -->
            <p class="flex flex-wrap items-center gap-x-2 text-sm leading-relaxed text-base-content/70">
                <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">BUFF</span>
                {{ RaidDungeon[selectedDungeon]?.RaidBuffID.map(id => RaidBuff[id].RaidBuffDes).join("、") }}
            </p>

            <!-- 信息分页 -->
            <AniTabs
                v-model="activeInfoTab"
                :tabs="[
                    { label: '分数计算', value: 'score' },
                    { label: '副本信息', value: 'dungeon' },
                    { label: '排名信息', value: 'rank' },
                ]"
            />

            <!-- 计算说明 -->
            <div v-if="activeInfoTab === 'score'" class="space-y-3">
                <!-- 分数计算器 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="CALCULATOR" title="分数计算" />
                    <!-- 当前分数 -->
                    <div class="flex items-baseline gap-2">
                        <span class="text-sm text-base-content/60">分数:</span>
                        <span class="font-orbitron text-2xl font-bold tabular-nums text-primary">{{ currentScore }}</span>
                    </div>
                    <!-- 分数 / 剩余时间输入 -->
                    <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                        <label class="block">
                            <span class="mb-1 block text-sm font-medium text-base-content/80">分数:</span>
                            <input
                                :value="scoreInput"
                                @input="handleScoreInput"
                                @change="commitScoreInput"
                                type="number"
                                :min="minScore"
                                :max="maxScore"
                                placeholder="输入分数"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 font-orbitron text-sm tabular-nums outline-none transition-colors duration-200 placeholder:text-base-content/35 placeholder:font-sans focus:border-primary"
                            />
                            <span class="mt-1 block text-[11px] tabular-nums text-base-content/45">最高分数: {{ maxScore }}</span>
                        </label>
                        <label class="block">
                            <span class="mb-1 block text-sm font-medium text-base-content/80">剩余时间(秒):</span>
                            <input
                                :value="remainingTime"
                                @input="handleRemainingTimeInput"
                                type="number"
                                min="0"
                                :max="maxAllowedTime"
                                step="0.1"
                                placeholder="输入剩余时间"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 font-orbitron text-sm tabular-nums outline-none transition-colors duration-200 placeholder:text-base-content/35 placeholder:font-sans focus:border-primary"
                            />
                            <span class="mt-1 block text-[11px] tabular-nums text-base-content/45">
                                最大允许时间: {{ maxAllowedTime }}秒 用时: {{ +(maxAllowedTime - remainingTime).toFixed(2) }}秒
                            </span>
                        </label>
                        <div class="col-span-2">
                            <input
                                type="range"
                                :value="remainingTime"
                                @input="handleRemainingTimeInput"
                                :max="maxAllowedTime"
                                step="0.1"
                                class="range range-primary range-xs w-full"
                            />
                        </div>
                    </div>
                </section>

                <!-- 公式说明 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="FORMULA" title="分数计算说明:" />
                    <p class="text-sm leading-relaxed text-base-content/90">
                        最终分数 = BaseRaidPoint + (1 + 时间区间1×速率1 + 时间区间2×速率2 + 时间区间3×速率3)
                        <span class="ml-1 text-xs opacity-80">依次取区间值直到剩余时间用完</span>
                    </p>
                    <p class="mt-2 text-[11px] leading-relaxed tabular-nums text-base-content/55">
                        当前副本: {{ RaidDungeon[selectedDungeon]?.DungeonId }} | BaseRaidPoint:
                        {{ RaidDungeon[selectedDungeon]?.BaseRaidPoint }} | 公式ID: {{ RaidDungeon[selectedDungeon]?.FomulaId }} | 时间区间:
                        {{ currentFormula?.RaidTimeZone }} | 速率:
                        {{ currentFormula?.RaidTimeRate }}
                    </p>
                </section>

                <!-- 奖励数量展示 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="REWARD" title="分数奖励计算:" />
                    <p class="text-sm leading-relaxed text-base-content/90">
                        每1000分可获得 <b class="font-orbitron tabular-nums text-primary">1</b> 次奖励 | 最大奖励次数:
                        <b class="font-orbitron tabular-nums text-primary">{{ rewardConfig.maxTime ?? 0 }}</b>
                        次
                    </p>
                    <div class="mt-3">
                        <p class="text-sm font-medium text-base-content/80">当前获得奖励次数:</p>
                        <div class="mt-1 flex items-baseline gap-1">
                            <span class="font-orbitron text-lg font-bold tabular-nums text-primary">{{ currentRewardCount }}</span>
                            <span class="text-sm text-base-content/55">次</span>
                        </div>

                        <!-- 奖励组（内层小卡） -->
                        <div class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="mb-1 flex items-center justify-between gap-2">
                                <span class="text-sm font-medium text-base-content/85">奖励组 {{ rewardId }}</span>
                                <span
                                    class="rounded-xs px-1.5 py-0.5 text-[10px] leading-4"
                                    :class="
                                        getDropModeText(currentReward?.m || '') === '独立'
                                            ? 'bg-success text-success-content'
                                            : 'bg-warning text-warning-content'
                                    "
                                >
                                    {{ getDropModeText(currentReward?.m || "") }}
                                </span>
                            </div>
                            <RewardItem :reward="currentReward!" />
                        </div>
                    </div>
                </section>
                <!-- 副本展示 -->
            </div>

            <!-- 副本信息 -->
            <div
                v-if="activeInfoTab === 'dungeon' && currentDungeon"
                class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            >
                <DBDungeonDetailItem :dungeon="currentDungeon" />
            </div>

            <!-- 排名信息：榜单行（前三档主色强调） -->
            <div v-if="activeInfoTab === 'rank'" class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <article
                    v-for="(item, index) in rankData"
                    :key="item.rank"
                    class="relative overflow-hidden rounded-xs border p-3 backdrop-blur-sm animate-ef-rise motion-reduce:animate-none"
                    :class="isTopThreeRank(index) ? 'border-primary/40 bg-primary/6' : 'border-base-content/10 bg-base-100/60'"
                    :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                >
                    <!-- 左侧主色强调条：前三档显现 -->
                    <span
                        class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                        :class="isTopThreeRank(index) ? 'opacity-100' : 'opacity-0'"
                        aria-hidden="true"
                    />
                    <div class="flex items-center gap-3">
                        <img class="h-12 shrink-0" :src="`/imgs/rank/T_Activity_GuildWar_Rank_${item.rank}.webp`" :alt="item.rank" />
                        <div class="min-w-0">
                            <p class="font-orbitron text-lg font-bold tabular-nums" :class="isTopThreeRank(index) ? 'text-primary' : ''">
                                {{ item.rank }}
                            </p>
                            <p class="mt-0.5 text-[11px] text-base-content/50">排名前{{ item.percent }}%的玩家获得</p>
                        </div>
                    </div>
                    <div class="relative mt-3 inline-flex">
                        <TitleFrameRender
                            v-if="getTitleFrameId(item.reward)"
                            class="h-12 w-48 max-w-full shrink-0"
                            :title-frame-id="getTitleFrameId(item.reward)"
                        >
                            <p class="text-sm font-bold text-white">{{ $t(item.reward.child?.[0].n || "") }}</p>
                        </TitleFrameRender>
                        <img v-else class="h-12" :src="`/imgs/rank/${selectedSeason}_${item.rank}.webp`" :alt="item.rank" />
                        <div v-if="!getTitleFrameId(item.reward)" class="absolute inset-0 flex items-center justify-center">
                            <p class="text-sm font-bold text-white">{{ $t(item.reward.child?.[0].n || "") }}</p>
                        </div>
                    </div>
                    <!-- 奖励明细（内层小卡） -->
                    <div :key="item.reward.id" class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                        <!-- 使用 RewardItem 组件显示奖励 -->
                        <RewardItem :reward="item.reward" header />
                    </div>
                </article>
            </div>
        </div>
    </ScrollArea>
</template>
