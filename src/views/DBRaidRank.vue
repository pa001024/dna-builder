<script setup lang="ts">
import { computed, ref } from "vue"
import { dungeonMap } from "@/data"
import { PreRaidRank, RaidCalculation, RaidDungeon, RaidSeason } from "../data/d/raid.data"
import { getDropModeText, getRewardDetails } from "../utils/reward-utils"

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

// 状态管理
const selectedSeason = ref<number>(1001)
const remainingTime = ref(30)
const selectedDungeon = ref<number>(21013)

// 计算当前选中副本的最大允许剩余时间
const maxAllowedTime = computed(() => {
    const dungeon = RaidDungeon[selectedDungeon.value]
    if (!dungeon) return 0

    const formula = RaidCalculation.find(item => item.FomulaId === dungeon.FomulaId)
    if (!formula) return 0

    // 使用RaidTimeZone的最大值作为最大允许时间
    return Math.max(...formula.RaidTimeZone)
})

// 监听剩余时间变化，确保不超过最大值
const updateRemainingTime = (value: number) => {
    const maxTime = maxAllowedTime.value
    remainingTime.value = Math.min(value, maxTime)
}

// 处理输入事件，确保类型安全
const handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target) {
        updateRemainingTime(Number(target.value))
    }
}

// 计算当前选中副本的分数
const currentScore = computed(() => {
    const dungeon = RaidDungeon[selectedDungeon.value]
    if (!dungeon) return 0

    // 确保使用的剩余时间不超过最大值
    const actualTime = Math.min(remainingTime.value, maxAllowedTime.value)
    return calculateScore(dungeon.BaseRaidPoint, actualTime, dungeon.FomulaId)
})

const currentFormula = computed(() => {
    const formulaId = RaidDungeon[selectedDungeon.value]?.FomulaId
    if (!formulaId) return undefined

    return RaidCalculation.find(item => item.FomulaId === formulaId)
})

// 计算奖励次数函数
const calculateRewardCount = (score: number, season: number | string): number => {
    const seasonData = RaidSeason[season]
    if (!seasonData) return 0

    const { RaidPointToRewradMaxTime } = seasonData

    // 计算奖励次数 = 分数 / 1000（向下取整）
    let rewardCount = Math.floor(score / 1000)

    // 限制最大奖励次数
    rewardCount = Math.min(rewardCount, RaidPointToRewradMaxTime)

    return rewardCount
}

// 计算当前分数对应的奖励次数
const currentRewardCount = computed(() => {
    return calculateRewardCount(currentScore.value, selectedSeason.value)
})

// 获取当前赛季的奖励ID
const rewardId = computed(() => {
    const seasonData = RaidSeason[selectedSeason.value]
    if (!seasonData) return 0

    // RaidPointToRewrad的键是分数阈值，值是奖励ID
    const firstRewardKey = Object.keys(seasonData.RaidPointToRewrad)[0]
    return seasonData.RaidPointToRewrad[firstRewardKey as keyof typeof seasonData.RaidPointToRewrad] || 0
})

// 获取当前奖励详情
const currentReward = computed(() => {
    const id = rewardId.value
    return getRewardDetails(id)
})

// 获取当前赛季下的副本列表
const currentDungeons = computed(() => {
    const season = RaidSeason[selectedSeason.value]
    if (!season) return []

    return Object.values(RaidDungeon).filter(dungeon => dungeon.RaidSeason === season.RaidSeason)
})

const currentDungeon = computed(() => {
    return dungeonMap.get(selectedDungeon.value)
})

// 原始排名数据（暂时保留）
const rankData = computed(() => {
    const data = PreRaidRank[selectedSeason.value]
    if (!data) return undefined

    return data.RankName.map((item, index) => ({
        rank: item,
        percent: data.RankPercent[index],
        reward: data.RankReward[index],
    }))
})

function getDungeonName(dungeonId: number) {
    return dungeonMap.get(dungeonId)?.n || `${dungeonId}`
}
</script>
<template>
    <ScrollArea class="p-4 flex h-full min-h-0">
        <div class="grid grid-cols-3 gap-4 mb-4">
            <!-- 赛季选择 -->
            <div>
                <label class="block text-sm font-medium mb-1">选择RaidSeason:</label>
                <Select v-model="selectedSeason" class="input input-sm w-full max-w-xs">
                    <SelectItem v-for="season in Object.values(RaidSeason)" :key="season.RaidSeason" :value="season.RaidSeason">
                        赛季 {{ season.RaidSeason }}
                    </SelectItem>
                </Select>
            </div>

            <!-- 副本选择 -->
            <div>
                <label class="block text-sm font-medium mb-1">选择RaidDungeon:</label>
                <Select v-model="selectedDungeon" class="input input-sm w-full max-w-xs">
                    <SelectItem v-for="dungeon in currentDungeons" :key="dungeon.DungeonId" :value="dungeon.DungeonId">
                        {{ getDungeonName(dungeon.DungeonId) }} (难度{{ dungeon.DifficultyLevel }})
                    </SelectItem>
                </Select>
            </div>

            <!-- 剩余时间输入 -->
            <div>
                <label class="block text-sm font-medium mb-1">剩余时间(秒):</label>
                <div class="flex gap-2 items-end">
                    <div class="w-full max-w-xs">
                        <input
                            :value="remainingTime"
                            @input="handleInput"
                            type="number"
                            min="0"
                            :max="maxAllowedTime"
                            step="0.1"
                            class="input input-sm w-full"
                            placeholder="输入剩余时间"
                        />
                        <p class="text-xs text-gray-500 mt-1">
                            最大允许时间: {{ maxAllowedTime }}秒 用时: {{ maxAllowedTime - remainingTime }}秒
                        </p>
                    </div>
                </div>
            </div>
            <div class="col-span-3">
                <input type="range" v-model="remainingTime" :max="maxAllowedTime" step="0.1" class="range range-primary range-xs w-full" />
            </div>
        </div>

        <div class="mb-4 flex items-center gap-2">
            <span class="font-medium">分数:</span>
            <span class="text-xl font-bold">{{ currentScore }}</span>
        </div>

        <!-- 计算说明 -->
        <div class="mb-4 p-4 bg-base-100 rounded-md">
            <h3 class="font-medium mb-2">分数计算说明:</h3>
            <p class="text-sm">
                最终分数 = BaseRaidPoint + (1 + 时间区间1×速率1 + 时间区间2×速率2 + 时间区间3×速率3)
                <span class="opacity-80 text-xs">依次取区间值直到剩余时间用完</span>
            </p>
            <p class="text-sm mt-2">
                当前副本: {{ RaidDungeon[selectedDungeon]?.DungeonId }} | BaseRaidPoint: {{ RaidDungeon[selectedDungeon]?.BaseRaidPoint }} |
                公式ID: {{ RaidDungeon[selectedDungeon]?.FomulaId }} | 时间区间: {{ currentFormula?.RaidTimeZone }} | 速率:
                {{ currentFormula?.RaidTimeRate }}
            </p>
        </div>
        <!-- 奖励数量展示 -->
        <div class="mb-4 p-3 bg-base-100 rounded-md">
            <h4 class="font-medium mb-2">分数奖励计算:</h4>
            <p class="text-sm">
                每1000分可获得 <span class="font-bold">1</span> 次奖励 | 最大奖励次数:
                <span class="font-bold">{{ RaidSeason[selectedSeason]?.RaidPointToRewradMaxTime }}</span>
                次
            </p>
            <div class="mt-3">
                <p class="text-sm font-medium">当前获得奖励次数:</p>
                <div class="flex items-center mt-1">
                    <span class="text-lg font-bold">{{ currentRewardCount }}</span>
                    <span class="text-sm opacity-80">次</span>
                </div>

                <!-- 使用RewardItem组件显示奖励 -->
                <div class="mt-3 p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">奖励组 {{ rewardId }}</span>
                        <span
                            class="text-xs px-1.5 py-0.5 rounded"
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
        </div>
        <!-- 副本展示 -->
        <div class="mb-4 bg-base-100 rounded-md" v-if="currentDungeon">
            <DBDungeonDetailItem :dungeon="currentDungeon" />
        </div>
        <div class="flex-1 grid grid-cols-1 gap-4">
            <div v-for="item in rankData" :key="item.rank" class="bg-base-100 p-4 rounded-md">
                <p class="text-lg font-bold">
                    {{ item.rank }}
                </p>
                <p class="text-sm opacity-80">排名前{{ item.percent }}%的玩家获得</p>

                <div
                    v-for="reward in [getRewardDetails(item.reward)]"
                    :key="reward?.id"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">奖励组 {{ reward?.id }}</span>
                        <span
                            class="text-xs px-1.5 py-0.5 rounded"
                            :class="
                                getDropModeText(reward?.m || '') === '独立'
                                    ? 'bg-success text-success-content'
                                    : 'bg-warning text-warning-content'
                            "
                        >
                            {{ getDropModeText(reward?.m || "") }}
                        </span>
                    </div>
                    <!-- 使用 RewardItem 组件显示奖励 -->
                    <RewardItem :reward="reward!" />
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
