<script lang="ts" setup>
import { computed } from "vue"
import { npcMap } from "@/data/d/npc.data"
import { questData } from "@/data/d/quest.data"
import type { QuestChain } from "@/data/d/questchain.data"
import { getDropModeText, getRewardDetails, RewardItem as RewardItemType } from "@/utils/reward-utils"

const props = defineProps<{
    questChain: QuestChain
}>()

// 预先计算所有任务的详情
const questDetails = computed(() => {
    return props.questChain.quests.map(quest => {
        // 在 questData 中查找对应任务
        let details = null
        for (const questList of questData) {
            const foundQuest = questList.quests.find(q => q.id === quest.id)
            if (foundQuest) {
                details = foundQuest
                break
            }
        }

        // 获取任务奖励
        const rewardId = props.questChain.questReward?.[quest.id]
        const reward = rewardId ? getRewardDetails(rewardId) : null

        return {
            ...quest,
            details,
            reward,
        }
    })
})

// 获取NPC名称
function getNPCName(npcId: number | undefined): string {
    if (npcId === undefined) return "未知"
    const npc = npcMap.get(npcId)
    return npc?.name || `${npcId}`
}
</script>

<template>
    <div class="p-3 space-y-3">
        <!-- 详情头部 -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <!-- 任务图标 -->
                <div
                    v-if="questChain.icon"
                    class="size-10 bg-base-content"
                    :style="{ mask: `url(/imgs/webp/${questChain.icon}.webp) no-repeat center/contain` }"
                    :alt="questChain.name"
                />

                <div>
                    <SRouterLink :to="`/db/questchain/${questChain.id}`" class="text-lg font-bold link link-primary">
                        {{ questChain.name }}
                    </SRouterLink>
                    <div class="text-sm text-base-content/70">ID: {{ questChain.id }}</div>
                </div>
            </div>
        </div>

        <!-- 基本信息 -->
        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">基本信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">ID</span>
                    <span>{{ questChain.id }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">章节</span>
                    <span>{{ questChain.chapterName }} {{ questChain.chapterNumber || "" }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">剧集</span>
                    <span>{{ questChain.episode }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">类型</span>
                    <span>{{ questChain.type }}</span>
                </div>
                <div v-if="questChain.main" class="flex justify-between">
                    <span class="text-base-content/70">主线</span>
                    <span class="px-2 py-0.5 rounded bg-info text-info-content">是</span>
                </div>
                <div v-if="questChain.startTime" class="flex justify-between">
                    <span class="text-base-content/70">开始时间</span>
                    <span>{{ new Date(questChain.startTime * 1000).toLocaleString() }}</span>
                </div>
                <div v-if="questChain.endTime" class="flex justify-between">
                    <span class="text-base-content/70">结束时间</span>
                    <span>{{ new Date(questChain.endTime * 1000).toLocaleString() }}</span>
                </div>
            </div>
        </div>

        <!-- 描述信息 -->
        <div v-if="questChain.desc || questChain.detail" class="card bg-base-100 border border-base-200 rounded p-3">
            <div class="text-sm">
                <div v-if="questChain.desc" class="mb-2">
                    <span class="text-base-content/70">描述: </span>
                    <span>{{ questChain.desc }}</span>
                </div>
                <div v-if="questChain.detail">
                    <span class="text-base-content/70">详情: </span>
                    <span>{{ questChain.detail }}</span>
                </div>
            </div>
        </div>

        <!-- 任务列表 -->
        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">任务列表 ({{ questChain.quests.length }}个)</h3>
            <div class="space-y-3">
                <div v-for="quest in questDetails" :key="quest.id" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">任务 ID: {{ quest.id }}</span>
                    </div>
                    <!-- 显示任务对话信息 -->
                    <div v-if="quest.details" class="pl-2 text-xs">
                        <div v-for="dialogue in quest.details.dialogues" :key="dialogue.id" class="mb-1">
                            <span class="font-medium text-primary mr-1">{{ getNPCName(dialogue.npc) }}:</span>
                            {{ dialogue.content }}
                        </div>
                    </div>

                    <!-- 显示任务奖励 -->
                    <div v-if="quest.reward" class="mt-2 pl-2">
                        <div class="text-xs font-medium mb-1">任务奖励:</div>
                        <RewardItem :reward="quest.reward as RewardItemType" />
                    </div>
                </div>
            </div>
        </div>

        <!-- 奖励信息 -->
        <div v-if="questChain.reward?.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">奖励信息</h3>
            <div class="space-y-3">
                <div
                    v-for="(reward, index) in questChain.reward.map(id => getRewardDetails(id)).filter((r): r is RewardItemType => !!r)"
                    :key="reward.id"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">#{{ index + 1 }} 奖励组 {{ reward.id }}</span>

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
    </div>
</template>
