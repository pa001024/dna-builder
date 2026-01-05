<script lang="ts" setup>
import { getRewardDetails, getDropModeText } from "../utils/reward-utils"
import { monsterMap } from "../data/d/index"
import { getDungeonType } from "../utils/dungeon-utils"
import type { Dungeon } from "../data"

defineProps<{
    dungeon: Dungeon
}>()

// 获取怪物名称
function getMonsterName(monsterId: number): string {
    const monster = monsterMap.get(monsterId)
    return monster?.n || `ID: ${monsterId}`
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <!-- 详情头部 -->
            <div class="flex items-center justify-between">
                <div>
                    <RouterLink :to="`/db/dungeon/${dungeon.id}`" class="text-lg font-bold link link-primary">{{ dungeon.n }}</RouterLink>
                    <div class="text-sm text-base-content/70">{{ dungeon.desc }}</div>
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

            <!-- 普通怪物 -->
            <div v-if="dungeon.m?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">普通怪物 ({{ dungeon.m.length }}个)</h3>
                <div class="flex flex-wrap gap-1">
                    <RouterLink
                        :to="`/db/monster/${monsterId}`"
                        v-for="monsterId in dungeon.m"
                        :key="monsterId"
                        class="px-2 py-1 bg-base-200 rounded text-xs hover:bg-base-300 transition-colors cursor-pointer"
                    >
                        {{ $t(getMonsterName(monsterId)) }}
                    </RouterLink>
                </div>
            </div>

            <!-- 特殊怪物 -->
            <div v-if="dungeon.sm?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">特殊怪物 ({{ dungeon.sm.length }}个)</h3>
                <div class="flex flex-wrap gap-1">
                    <RouterLink
                        :to="`/db/monster/${smId}`"
                        v-for="smId in dungeon.sm"
                        :key="smId"
                        class="px-2 py-1 bg-base-200 rounded text-xs hover:bg-base-300 transition-colors cursor-pointer"
                    >
                        {{ $t(getMonsterName(smId)) }}
                    </RouterLink>
                </div>
            </div>

            <!-- 奖励列表 -->
            <div v-if="dungeon.r?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">奖励列表</h3>
                <div class="space-y-3">
                    <div v-for="rewardId in dungeon.r" :key="rewardId" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
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
                        <RewardItem :rewardId="rewardId" />
                    </div>
                </div>
            </div>

            <!-- 特殊奖励 -->
            <div v-if="dungeon.sr?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">特殊奖励 ({{ dungeon.sr.length }}组)</h3>
                <div class="space-y-3">
                    <div v-for="rewardId in dungeon.sr" :key="rewardId" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium">特殊奖励组 {{ rewardId }}</span>
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
                        <RewardItem :rewardId="rewardId" />
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
