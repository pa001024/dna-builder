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
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 详情头部：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <div class="flex items-start gap-3.5">
                <img
                    :src="getReputationIcon(reputation.icon)"
                    :alt="reputation.name"
                    class="size-16 shrink-0 rounded-xs bg-base-content/3 object-cover sm:size-20"
                />
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Reputation File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/reputation/${reputation.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(reputation.name) }}
                        </SRouterLink>
                        <CopyID :id="reputation.id" />
                        <span class="ml-auto shrink-0 font-orbitron text-sm font-semibold tabular-nums text-primary"
                            >Lv.{{ reputation.levels.length }}</span
                        >
                    </div>
                </div>
            </div>
        </header>

        <!-- 基本信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="INFO" :title="$t('reputation.info')" />
            <div class="mt-2 grid grid-cols-1 gap-1.5 text-sm md:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("reputation.weeklyExpLimit") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        reputation.weekLimit
                    }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("reputation.totalLevel") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        reputation.levels.length
                    }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("reputation.totalExp") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ totalLevelExp }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("reputation.entrustCount") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        reputation.entrusts.length
                    }}</span>
                </div>
            </div>

            <div class="mt-3 space-y-1.5">
                <div class="text-[11px] tracking-wide text-base-content/55">{{ $t("reputation.refreshCost") }}</div>
                <div class="flex flex-wrap gap-1.5">
                    <div
                        v-for="[name, value] in refreshCostEntries"
                        :key="name"
                        class="inline-flex items-center gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1 text-sm"
                    >
                        <img :src="getResourceIcon(resourceMap.get(name)?.icon)" :alt="name" class="size-5 rounded-xs" />
                        <span>{{ $t(name) }}</span>
                        <span class="font-orbitron text-[12px] font-semibold tabular-nums text-primary">x{{ value }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- 页签切换 -->
        <AniTabs
            v-model="activeTab"
            :tabs="[
                { label: `${$t('reputation.level')} (${reputation.levels.length})`, value: 'levels' },
                { label: `${$t('reputation.entrust')} (${reputation.entrusts.length})`, value: 'entrusts' },
            ]"
        />

        <!-- 等级明细 -->
        <section v-if="activeTab === 'levels'" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVELS" :title="$t('reputation.level')" />
            <div class="mt-2 space-y-2">
                <div v-for="level in levelDetails" :key="level.lv" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                            >{{ $t("reputation.level") }} {{ level.lv }}</span
                        >
                        <span class="text-[11px] tabular-nums text-base-content/50"
                            >{{ $t("reputation.accumulatedExp") }}: {{ level.totalExp }}</span
                        >
                    </div>
                    <div class="mt-1 text-xs text-base-content/70">{{ $t("reputation.levelUpExp") }}: {{ level.exp }}</div>

                    <div class="mt-2">
                        <div class="mb-1 flex items-center gap-1.5 text-[11px] tracking-wide text-base-content/55">
                            {{ $t("reputation.levelReward") }}
                            <CopyID :id="level.reward" />
                        </div>
                        <div v-if="level.rewardDetail" class="pl-2">
                            <RewardItem :reward="level.rewardDetail" />
                        </div>
                        <div v-else class="text-sm text-base-content/60">{{ $t("reputation.rewardNotFound") }}</div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 委托明细 -->
        <section v-else class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ENTRUSTS" :title="$t('reputation.entrust')" />
            <div class="mt-2 space-y-2">
                <div
                    v-for="entrust in entrustDetails"
                    :key="entrust.id"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex min-w-0 items-start gap-2.5">
                            <img
                                :src="getEntrustIcon(entrust.icon)"
                                :alt="entrust.name"
                                class="size-10 shrink-0 rounded-xs bg-base-content/3 object-cover"
                            />
                            <div class="min-w-0">
                                <div class="truncate text-sm font-medium">{{ $t(entrust.name) }}</div>
                                <CopyID :id="entrust.id" />
                            </div>
                        </div>
                        <div class="shrink-0 text-right text-[11px]">
                            <div
                                class="inline-block rounded-xs bg-primary/10 px-1.5 py-0.5 font-orbitron text-[11px] font-semibold tabular-nums text-primary"
                            >
                                EXP +{{ entrust.exp }}
                            </div>
                            <div class="mt-1 tabular-nums text-base-content/50">
                                {{ $t("reputation.weight") }}: {{ entrust.weight }}
                            </div>
                        </div>
                    </div>

                    <div class="mt-2 text-sm leading-relaxed wrap-break-word text-base-content/85">
                        {{ $t(entrust.desc) }}
                    </div>

                    <div class="flex flex-wrap gap-1.5">
                        <div
                            v-for="item in entrust.displayItems"
                            :key="`${item.type}-${item.id}`"
                            class="inline-flex items-center gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1 text-sm"
                        >
                            <img :src="item.icon" :alt="item.name" class="size-5 rounded-xs" />
                            <span>{{ $t(item.name) }}</span>
                            <span class="font-orbitron text-[12px] font-semibold tabular-nums text-primary">x{{ item.count }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
