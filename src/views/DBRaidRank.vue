<script setup lang="ts">
import { getRewardDetails, getDropModeText } from "../utils/reward-utils"
const rawRankData = [
    {
        IsOnline: [true, true, false, false, false],
        PreRaidRank: 1,
        RankName: ["SSS", "SS", "S", "A", "B"],
        RankPercent: [5, 20, 45, 70, 100],
        RankReward: [300316, 300317, 300318, 300319, 300320],
    },
]
const rankData = rawRankData[0].RankName.map((item, index) => ({
    rank: item,
    percent: rawRankData[0].RankPercent[index],
    reward: rawRankData[0].RankReward[index],
}))
</script>
<template>
    <ScrollArea class="p-4 flex h-full min-h-0">
        <div class="flex-1 grid grid-cols-1 gap-4">
            <div v-for="item in rankData" :key="item.rank" class="bg-gray-100 p-4 rounded-md">
                <p class="text-lg font-bold">
                    {{ item.rank }}
                </p>
                <p class="text-sm text-gray-600">排名前{{ item.percent }}%的玩家获得</p>

                <div v-for="rewardId in [item.reward]" :key="rewardId" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">奖励组 {{ rewardId }}</span>
                        <span
                            class="text-xs px-1.5 py-0.5 rounded"
                            :class="
                                getDropModeText(getRewardDetails(rewardId)?.m || '') === '独立'
                                    ? 'bg-success text-success-content'
                                    : 'bg-warning text-warning-content'
                            "
                        >
                            {{ getDropModeText(getRewardDetails(rewardId)?.m || "") }}
                        </span>
                    </div>
                    <!-- 使用 RewardItem 组件显示奖励 -->
                    <RewardItem :reward="getRewardDetails(rewardId)!" />
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
