<script lang="ts" setup>
import { computed } from "vue"
import { forgeLevelQuestData } from "@/data"
import type { ForgeLevel } from "@/data/d/forge.data"
import { getRewardDetails, type RewardItem as RewardItemType } from "@/utils/reward-utils"

interface ForgeQuestRow {
    id: number
    detail: {
        id: number
        desc: string
        target: number
        reward: RewardItemType | null
    } | null
}

const props = defineProps<{
    forge: ForgeLevel
}>()

/**
 * 解析单个任务 ID 的展示数据。
 * @param questId 任务 ID
 * @returns 任务展示信息
 */
function resolveForgeQuest(questId: number) {
    const quest = forgeLevelQuestData.find(item => item.id === questId)
    if (!quest) {
        return null
    }

    return {
        id: quest.id,
        desc: quest.desc,
        target: quest.target,
        reward: getRewardDetails(quest.reward[0] || 0),
    }
}

const forgeQuestRows = computed<ForgeQuestRow[]>(() => {
    return props.forge.ForgeLevelQuestId.map(id => ({
        id,
        detail: resolveForgeQuest(id),
    }))
})

const forgeReward = computed(() => getRewardDetails(props.forge.ForgeLevelReward))
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <div class="size-12 shrink-0 rounded-full bg-primary text-primary-content flex items-center justify-center font-bold">
                {{ forge.ForgeLevel }}
            </div>
            <div class="min-w-0 flex-1">
                <div class="text-lg font-bold">熔炼等级 {{ forge.ForgeLevel }}</div>
                <CopyID :id="forge.ForgeLevel" />
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div class="p-3 rounded bg-base-200">
                <div class="text-xs text-base-content/70 mb-1">最大同调卡牌等级</div>
                <div class="text-base font-medium">{{ forge.HyperWeaponMaxCardLevel }}</div>
            </div>
            <div class="p-3 rounded bg-base-200">
                <div class="text-xs text-base-content/70 mb-1">等级奖励</div>
                <div class="text-base font-medium">#{{ forge.ForgeLevelReward }}</div>
            </div>
        </div>

        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">等级奖励详情</div>
            <RewardItem v-if="forgeReward" :reward="forgeReward" />
            <div v-else class="text-sm text-base-content/60">未找到奖励详情</div>
        </div>

        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">关联任务</div>
            <div class="space-y-2">
                <div v-for="row in forgeQuestRows" :key="row.id" class="p-3 rounded bg-base-100 border border-base-200">
                    <div v-if="row.detail" class="space-y-1">
                        <div class="flex items-center justify-between gap-2">
                            <div class="font-medium">{{ row.detail.desc }}</div>
                            <CopyID :id="row.detail.id" />
                        </div>
                        <div class="text-xs text-base-content/70">目标数量: {{ row.detail.target }}</div>
                        <div class="text-xs text-base-content/70">任务 ID: {{ row.id }}</div>
                        <div class="mt-2">
                            <div class="text-xs text-base-content/70 mb-1">任务奖励</div>
                            <RewardItem v-if="row.detail.reward" :reward="row.detail.reward" />
                            <div v-else class="text-sm text-base-content/60">未找到任务奖励</div>
                        </div>
                    </div>
                    <div v-else class="text-sm text-base-content/60">未找到任务 {{ row.id }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
