<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { resourceMap } from "@/data/d"
import type { Reputation } from "@/data/d/reputation.data"
import { getRewardDetails } from "@/utils/reward-utils"

interface EntrustItemDisplay {
    type: string
    id: number
    count: number
    name: string
    icon: string
}

const props = defineProps<{
    reputation: Reputation
}>()

const activeTab = ref<"levels" | "entrusts">("levels")

/**
 * 切换到新的区域声名条目时，默认回到等级标签页。
 */
watch(
    () => props.reputation.id,
    () => {
        activeTab.value = "levels"
    }
)

/**
 * 将区域声名图标名转换为可访问的图片地址。
 * @param icon 图标资源名
 * @returns 图片 URL
 */
function getReputationIcon(icon: string): string {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 将委托头像图标名转换为可访问的图片地址。
 * @param icon 图标资源名
 * @returns 图片 URL
 */
function getEntrustIcon(icon: string): string {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 将资源图标名转换为可访问的图片地址。
 * @param icon 资源图标名
 * @returns 图片 URL
 */
function getResourceIcon(icon: string | undefined): string {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 将委托物品元组解析为可展示的结构。
 * @param item 原始委托物品三元组 [类型, ID, 数量]
 * @returns 规范化后的展示对象
 */
function resolveEntrustItem(item: [string, number, number]): EntrustItemDisplay {
    const [type, id, count] = item
    const resource = type === "Resource" ? resourceMap.get(id) : undefined

    return {
        type,
        id,
        count,
        name: resource?.name || `${type} ${id}`,
        icon: getResourceIcon(resource?.icon),
    }
}

/**
 * 预计算等级明细，包含累计经验和奖励详情，避免模板中重复计算。
 */
const levelDetails = computed(() => {
    let totalExp = 0

    return props.reputation.levels.map(level => {
        totalExp += level.exp

        return {
            ...level,
            totalExp,
            rewardDetail: getRewardDetails(level.reward),
        }
    })
})

/**
 * 预计算委托条目展示数据。
 */
const entrustDetails = computed(() => {
    return props.reputation.entrusts.map(entrust => ({
        ...entrust,
        displayItems: entrust.items.map(resolveEntrustItem),
    }))
})

/**
 * 计算刷新消耗的资源列表，便于模板遍历。
 */
const refreshCostEntries = computed(() => {
    return Object.entries(props.reputation.refreshCost)
})

/**
 * 统计区域声名总经验。
 */
const totalLevelExp = computed(() => {
    return props.reputation.levels.reduce((sum, level) => sum + level.exp, 0)
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
                <img :src="getReputationIcon(reputation.icon)" :alt="reputation.name" class="size-12 rounded-lg bg-base-200 object-cover" />
                <div class="min-w-0">
                    <SRouterLink :to="`/db/reputation/${reputation.id}`" class="text-lg font-bold link link-primary">
                        {{ $t(reputation.name) }}
                    </SRouterLink>
                    <div class="text-sm text-base-content/70">ID: {{ reputation.id }}</div>
                </div>
            </div>
            <span class="text-xs px-2 py-1 rounded bg-primary text-primary-content">Lv.{{ reputation.levels.length }}</span>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded-lg p-3 space-y-2">
            <h3 class="font-bold">{{ $t("reputation.info") }}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">{{ $t("reputation.weeklyExpLimit") }}</span>
                    <span>{{ reputation.weekLimit }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">{{ $t("reputation.totalLevel") }}</span>
                    <span>{{ reputation.levels.length }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">{{ $t("reputation.totalExp") }}</span>
                    <span>{{ totalLevelExp }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">{{ $t("reputation.entrustCount") }}</span>
                    <span>{{ reputation.entrusts.length }}</span>
                </div>
            </div>

            <div class="space-y-1">
                <div class="text-sm text-base-content/70">{{ $t("reputation.refreshCost") }}</div>
                <div class="flex flex-wrap gap-2">
                    <div
                        v-for="[name, value] in refreshCostEntries"
                        :key="name"
                        class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-base-200 text-sm"
                    >
                        <img :src="getResourceIcon(resourceMap.get(name)?.icon)" :alt="name" class="size-5 rounded" />
                        <span>{{ $t(name) }}</span>
                        <span class="font-medium">x{{ value }}</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="flex gap-2">
            <button
                class="px-3 py-1.5 text-sm rounded-full transition-all"
                :class="activeTab === 'levels' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                @click="activeTab = 'levels'"
            >
                {{ $t("reputation.level") }} ({{ reputation.levels.length }})
            </button>
            <button
                class="px-3 py-1.5 text-sm rounded-full transition-all"
                :class="activeTab === 'entrusts' ? 'bg-primary text-primary-content' : 'bg-base-200 hover:bg-base-300'"
                @click="activeTab = 'entrusts'"
            >
                {{ $t("reputation.entrust") }} ({{ reputation.entrusts.length }})
            </button>
        </div>

        <div v-if="activeTab === 'levels'" class="space-y-2">
            <div v-for="level in levelDetails" :key="level.lv" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <div class="flex items-center justify-between gap-2">
                    <div class="font-medium">{{ $t("reputation.level") }} {{ level.lv }}</div>
                    <div class="text-xs opacity-70">{{ $t("reputation.accumulatedExp") }}: {{ level.totalExp }}</div>
                </div>
                <div class="text-sm text-base-content/70 mt-1">{{ $t("reputation.levelUpExp") }}: {{ level.exp }}</div>

                <div class="mt-2">
                    <div class="text-sm font-medium mb-1">{{ $t("reputation.levelReward") }} #{{ level.reward }}</div>
                    <div v-if="level.rewardDetail" class="pl-2">
                        <RewardItem :reward="level.rewardDetail" />
                    </div>
                    <div v-else class="text-sm text-base-content/60">{{ $t("reputation.rewardNotFound") }}</div>
                </div>
            </div>
        </div>

        <div v-else class="space-y-2">
            <div v-for="entrust in entrustDetails" :key="entrust.id" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-start gap-2 min-w-0">
                        <img :src="getEntrustIcon(entrust.icon)" :alt="entrust.name" class="size-10 rounded bg-base-200 object-cover" />
                        <div class="min-w-0">
                            <div class="font-medium wrap-break-word">{{ $t(entrust.name) }}</div>
                            <div class="text-xs text-base-content/70 mt-0.5">ID: {{ entrust.id }}</div>
                        </div>
                    </div>
                    <div class="text-right text-xs shrink-0">
                        <div class="px-2 py-0.5 rounded bg-primary text-primary-content">EXP +{{ entrust.exp }}</div>
                        <div class="opacity-70 mt-1">{{ $t("reputation.weight") }}: {{ entrust.weight }}</div>
                    </div>
                </div>

                <div class="text-sm text-base-content/80 mt-2 wrap-break-word">
                    {{ $t(entrust.desc) }}
                </div>

                <div class="mt-2 flex flex-wrap gap-2">
                    <div
                        v-for="item in entrust.displayItems"
                        :key="`${item.type}-${item.id}`"
                        class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-base-200 text-sm"
                    >
                        <img :src="item.icon" :alt="item.name" class="size-5 rounded" />
                        <span>{{ $t(item.name) }}</span>
                        <span class="font-medium">x{{ item.count }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
