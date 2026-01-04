<script lang="ts" setup>
import { getRewardDetails } from "../utils/reward-utils"
import { monsterMap } from "../data/d/index"
import { getDungeonType } from "../utils/dungeon-utils"

// 定义组件接收的Props
interface Props {
    dungeon: any
}

const props = defineProps<Props>()

// 获取怪物名称
function getMonsterName(monsterId: number): string {
    const monster = monsterMap.get(monsterId)
    return monster?.名称 || `ID: ${monsterId}`
}

// 获取掉落模式文本
function getDropModeText(mode: string): string {
    const modeMap: Record<string, string> = {
        Independent: "独立",
        Weight: "权重",
        Fixed: "固定",
        Gender: "性别",
        Level: "等级",
        Once: "一次",
        Sequence: "序列",
    }

    return modeMap[mode] || mode
}
</script>

<template>
    <div class="h-full">
        <ScrollArea class="h-full">
            <div class="p-3 space-y-4">
                <!-- 详情头部 -->
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-bold">{{ props.dungeon.n }}</h2>
                        <div class="text-sm text-base-content/70">{{ props.dungeon.desc }}</div>
                    </div>
                    <span class="text-xs px-2 py-1 rounded" :class="getDungeonType(props.dungeon.t).color + ' text-white'">
                        {{ getDungeonType(props.dungeon.t).label }}
                    </span>
                </div>

                <!-- 副本信息 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg p-3">
                    <h3 class="font-bold mb-2">副本信息</h3>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-base-content/70">ID</span>
                            <span>{{ props.dungeon.id }}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-base-content/70">等级</span>
                            <span>Lv.{{ props.dungeon.lv }}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-base-content/70">类型</span>
                            <span>{{ props.dungeon.t }}</span>
                        </div>
                        <div v-if="props.dungeon.win" class="flex justify-between">
                            <span class="text-base-content/70">胜利条件</span>
                            <span>{{ props.dungeon.win === 1 ? "通关" : props.dungeon.win === 2 ? "撤离" : "特殊条件" }}</span>
                        </div>
                    </div>
                </div>

                <!-- 普通怪物 -->
                <div v-if="props.dungeon.m?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                    <h3 class="font-bold mb-2">普通怪物 ({{ props.dungeon.m.length }}个)</h3>
                    <div class="flex flex-wrap gap-1">
                        <RouterLink
                            :to="`/db/monster/${monsterId}`"
                            v-for="monsterId in props.dungeon.m"
                            :key="monsterId"
                            class="px-2 py-1 bg-base-200 rounded text-xs hover:bg-base-300 transition-colors cursor-pointer"
                        >
                            {{ $t(getMonsterName(monsterId)) }}
                        </RouterLink>
                    </div>
                </div>

                <!-- 特殊怪物 -->
                <div v-if="props.dungeon.sm?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                    <h3 class="font-bold mb-2">特殊怪物 ({{ props.dungeon.sm.length }}个)</h3>
                    <div class="flex flex-wrap gap-1">
                        <RouterLink
                            :to="`/db/monster/${smId}`"
                            v-for="smId in props.dungeon.sm"
                            :key="smId"
                            class="px-2 py-1 bg-base-200 rounded text-xs hover:bg-base-300 transition-colors cursor-pointer"
                        >
                            {{ $t(getMonsterName(smId)) }}
                        </RouterLink>
                    </div>
                </div>

                <!-- 奖励列表 -->
                <div v-if="props.dungeon.r?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                    <h3 class="font-bold mb-2">奖励列表</h3>
                    <div class="space-y-3">
                        <div
                            v-for="rewardId in props.dungeon.r"
                            :key="rewardId"
                            class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                        >
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
                <div v-if="props.dungeon.sr?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                    <h3 class="font-bold mb-2">特殊奖励 ({{ props.dungeon.sr.length }}组)</h3>
                    <div class="space-y-3">
                        <div
                            v-for="rewardId in props.dungeon.sr"
                            :key="rewardId"
                            class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                        >
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
    </div>
</template>
