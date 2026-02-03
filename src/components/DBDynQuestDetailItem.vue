<script lang="ts" setup>
import type { DynQuest } from "@/data/d/dynquest.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { getRewardDetails } from "@/utils/reward-utils"

const props = defineProps<{
    quest: DynQuest
}>()

// 获取区域信息
const getRegionInfo = (regionId: number) => {
    const region = regionMap.get(regionId)
    return region || { id: regionId, name: `区域${regionId}`, type: null, mapId: null }
}

// 获取子区域信息
const getSubRegionInfo = (subRegionId: number) => {
    const subRegion = subRegionMap.get(subRegionId)
    return subRegion || { id: subRegionId, name: `子区域${subRegionId}`, description: "", level: "", type: null }
}
</script>

<template>
    <div class="p-3 space-y-3">
        <!-- 详情头部 -->
        <div class="flex items-center justify-between">
            <div>
                <SRouterLink :to="`/db/dynquest/${quest.id}`" class="text-lg font-bold link link-primary">
                    {{ quest.name }}
                </SRouterLink>
                <div class="text-sm text-base-content/70">ID: {{ quest.id }}</div>
            </div>
        </div>

        <!-- 委托信息 -->
        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">委托信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">ID</span>
                    <span>{{ quest.id }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">概率</span>
                    <span>{{ quest.chance }}%</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">完成次数</span>
                    <span>{{ quest.completeNum === -1 ? "无限" : quest.completeNum }}</span>
                </div>
                <div v-if="quest.dayLimit" class="flex justify-between">
                    <span class="text-base-content/70">限制</span>
                    <span class="px-2 py-0.5 rounded bg-warning text-warning-content">每日限制</span>
                </div>
            </div>
        </div>

        <!-- 区域信息 -->
        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">区域信息</h3>
            <div class="grid grid-cols-1 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">区域 ID</span>
                    <span>{{ quest.regionId }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">区域名称</span>
                    <span>{{ getRegionInfo(quest.regionId).name }}</span>
                </div>
                <div v-if="getRegionInfo(quest.regionId).type" class="flex justify-between">
                    <span class="text-base-content/70">区域类型</span>
                    <span>{{ getRegionInfo(quest.regionId).type }}</span>
                </div>
                <div v-if="getRegionInfo(quest.regionId).mapId" class="flex justify-between">
                    <span class="text-base-content/70">地图 ID</span>
                    <span>{{ getRegionInfo(quest.regionId).mapId }}</span>
                </div>
            </div>
        </div>

        <!-- 子区域信息 -->
        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">子区域信息</h3>
            <div class="grid grid-cols-1 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">子区域 ID</span>
                    <span>{{ quest.subRegionId }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">子区域名称</span>
                    <span>{{ getSubRegionInfo(quest.subRegionId).name }}</span>
                </div>
                <div v-if="getSubRegionInfo(quest.subRegionId).description" class="flex justify-between">
                    <span class="text-base-content/70">描述</span>
                    <span>{{ getSubRegionInfo(quest.subRegionId).description }}</span>
                </div>
                <div v-if="getSubRegionInfo(quest.subRegionId).level" class="flex justify-between">
                    <span class="text-base-content/70">等级</span>
                    <span>{{ getSubRegionInfo(quest.subRegionId).level }}</span>
                </div>
                <div v-if="getSubRegionInfo(quest.subRegionId).type" class="flex justify-between">
                    <span class="text-base-content/70">类型</span>
                    <span>{{ getSubRegionInfo(quest.subRegionId).type }}</span>
                </div>
            </div>
        </div>

        <!-- 等级范围 -->
        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">等级范围</h3>
            <div class="text-sm text-base-content/70">等级范围: {{ quest.level[0] }} - {{ quest.level[1] || "?" }}</div>
        </div>

        <!-- 奖励列表 -->
        <div v-if="quest.reward?.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">奖励列表 ({{ quest.reward.length }}组)</h3>
            <div class="space-y-3">
                <div v-for="rewardId in quest.reward" :key="rewardId" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">奖励组 {{ rewardId }}</span>
                    </div>
                    <!-- 使用 RewardItem 组件显示奖励 -->
                    <div v-if="getRewardDetails(rewardId)" class="pl-2">
                        <RewardItem :reward="getRewardDetails(rewardId)!" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
