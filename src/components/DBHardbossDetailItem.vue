<script lang="ts" setup>
import { computed } from "vue"
import { monsterMap } from "@/data"
import type { HardBoss, HardBossDetail } from "@/data/d/hardboss.data"
import { getHardBossDetail } from "@/data/d/hardboss.data"
import { getDropModeText, getRewardDetails } from "@/utils/reward-utils"

const props = defineProps<{
    boss: HardBoss
}>()

// 获取Boss详情（包含动态奖励）
const bossDetail = computed<HardBossDetail | undefined>(() => {
    const detail = getHardBossDetail(props.boss.id)
    return detail
})

// 获取怪物数据
const monster = computed(() => monsterMap.get(props.boss.mid))

// 格式化时间戳为日期字符串
function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    })
}

// 获取奖励状态文本
function getRewardStatusText(startTime: number, endTime: number): { text: string; color: string } {
    const now = Math.floor(Date.now() / 1000)
    if (now < startTime) {
        return { text: "未开始", color: "text-base-content/50" }
    } else if (now > endTime) {
        return { text: "已结束", color: "text-base-content/50" }
    } else {
        return { text: "进行中", color: "text-success" }
    }
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4" v-if="bossDetail">
            <!-- 详情头部 -->
            <div class="flex items-center justify-between">
                <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                        <SRouterLink :to="`/db/hardboss/${boss.id}`" class="text-lg font-bold link link-primary">
                            {{ boss.name }}
                        </SRouterLink>
                        <span class="text-sm text-base-content/70">ID: {{ boss.id }}</span>
                    </div>
                    <div class="text-sm text-base-content/70">
                        {{ boss.desc }}
                    </div>
                </div>
            </div>

            <!-- 怪物信息 -->
            <div v-if="monster" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">怪物信息</h3>
                <DBMonsterDetailItem :monster="monster" :defaultLevel="80" />
            </div>

            <!-- 动态奖励列表 -->
            <div v-for="diff in bossDetail.diff" :key="diff.id" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">
                    等级奖励 ({{ diff.dr.length }}组)
                    <span class="text-sm font-normal text-base-content/70 ml-2">Lv.{{ diff.lv }}</span>
                </h3>
                <div class="space-y-3">
                    <div
                        v-for="dr in diff.dr"
                        :key="`${dr.DynamicRewardId}-${dr.Index}`"
                        class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                    >
                        <div class="text-xs text-base-content/70 mb-2">
                            <span>{{ formatTimestamp(dr.StartTime) }} - {{ formatTimestamp(dr.EndTime) }}</span>
                        </div>
                        <!-- 使用 RewardItem 组件显示奖励 -->
                        <div v-for="reward in [getRewardDetails(dr.RewardView)].filter(v => !!v)" :key="reward.id" class="pl-2">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs font-medium">奖励组 {{ dr.RewardId }}</span>
                                <span class="text-xs" :class="getRewardStatusText(dr.StartTime, dr.EndTime).color">
                                    {{ getRewardStatusText(dr.StartTime, dr.EndTime).text }}
                                </span>
                                <span
                                    class="text-xs px-1.5 py-0.5 rounded"
                                    :class="
                                        getDropModeText(reward.m || '') === '独立'
                                            ? 'bg-success text-success-content'
                                            : 'bg-warning text-warning-content'
                                    "
                                >
                                    {{ getDropModeText(reward.m || "") }}
                                </span>
                            </div>
                            <RewardItem :reward="reward" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
