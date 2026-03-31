<script lang="ts" setup>
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import type { EventItem } from "@/data/d/event.data"
import { expandRewardSequenceSource, RewardSequenceSimulator } from "@/utils/reward-sequence"
import { getDropModeText, getRewardDetails, type RewardItem } from "@/utils/reward-utils"

const props = defineProps<{
    boxDrop: NonNullable<EventItem["boxDrop"]>
}>()

type BoxDropLeafType =
    | "Mod"
    | "Resource"
    | "CharAccessory"
    | "Weapon"
    | "WeaponSkin"
    | "WeaponAccessory"
    | "HeadSculpture"
    | "Walnut"
    | "Skin"
    | "HeadFrame"
    | "Char"
    | "Draft"

const openCount = ref(0)
const rewardCounts = ref<Record<string, { reward: RewardItem; count: number }>>({})
const lastResult = ref<RewardItem[]>([])
const currentRewardIndex = ref(0)
const currentRewardOpened = ref(0)
const rewardSequenceMap = ref(new Map<number, RewardSequenceSimulator<RewardItem>>())

/**
 * 生成奖励统计键。
 * @param reward 奖励项
 * @returns 统计键
 */
function getRewardKey(reward: RewardItem): string {
    return `${reward.t}-${reward.id}-${reward.n || ""}`
}

/**
 * 克隆叶子奖励并补足数量。
 * @param reward 奖励项
 * @param count 数量倍率
 * @returns 叶子奖励
 */
function createLeafReward(reward: RewardItem, count: number): RewardItem {
    return {
        ...reward,
        c: count,
    }
}

/**
 * 将叶子奖励转换为资源成本展示值。
 * @param reward 叶子奖励
 * @returns ResourceCostItem 入参
 */
function getRewardCostValue(reward: RewardItem): [number | string, number | string, BoxDropLeafType] {
    return [reward.c ?? 1, reward.id, reward.t as BoxDropLeafType]
}

/**
 * 从奖励树中随机抽取一个子项。
 * @param items 子项列表
 * @returns 选中的子项
 */
function pickRewardChild(items: RewardItem[]): RewardItem | null {
    const totalWeight = items.reduce((sum, item) => sum + (item.p || 0), 0)
    if (totalWeight <= 0) {
        return items[0] ?? null
    }

    const roll = Math.random() * totalWeight
    let cursor = 0
    for (const item of items) {
        cursor += item.p || 0
        if (roll < cursor) {
            return item
        }
    }

    return items[items.length - 1] ?? null
}

/**
 * 递归展开奖励树，直到落到叶子奖励。
 * @param reward 奖励树根节点
 * @param multiplier 数量倍率
 * @returns 叶子奖励列表
 */
function drawRewardTree(reward: RewardItem, multiplier = 1): RewardItem[] {
    const totalMultiplier = multiplier * (reward.c ?? 1)
    const children = reward.child || []

    if (!children.length) {
        return [createLeafReward(reward, totalMultiplier)]
    }

    if (reward.m === "Independent") {
        const results: RewardItem[] = []
        for (const child of children) {
            const chance = (child.p || 0) / 10000
            if (Math.random() < chance) {
                results.push(...drawRewardNode(child, totalMultiplier))
            }
        }
        return results
    }

    if (reward.m === "Fixed") {
        return children.flatMap(child => drawRewardNode(child, totalMultiplier))
    }

    if (reward.m === "Sequence") {
        if (!rewardSequenceMap.value.has(reward.id)) {
            const sequenceSource = expandRewardSequenceSource(children, child => child.p || 0)
            rewardSequenceMap.value.set(reward.id, new RewardSequenceSimulator(sequenceSource))
        }

        const sequence = rewardSequenceMap.value.get(reward.id)
        if (!sequence) {
            return []
        }

        const selectedChild = sequence.draw()
        if (!selectedChild) {
            return []
        }

        return drawRewardNode(selectedChild, totalMultiplier)
    }

    const selectedChild = pickRewardChild(children)
    return selectedChild ? drawRewardNode(selectedChild, totalMultiplier) : []
}

/**
 * 递归展开单个奖励节点。
 * @param reward 奖励节点
 * @param multiplier 数量倍率
 * @returns 叶子奖励列表
 */
function drawRewardNode(reward: RewardItem, multiplier: number): RewardItem[] {
    const totalMultiplier = multiplier * (reward.c ?? 1)
    if (reward.t === "Reward") {
        const nestedReward = getRewardDetails(reward.id)
        return nestedReward ? drawRewardTree(nestedReward, totalMultiplier) : []
    }

    return [createLeafReward(reward, totalMultiplier)]
}

const rewardItems = computed(() => {
    return props.boxDrop.rewardId
        .map((id, index) => ({
            id,
            count: props.boxDrop.rewardCount[index] ?? Number.POSITIVE_INFINITY,
            reward: getRewardDetails(id),
        }))
        .filter(item => item.reward)
})

const sortedRewardCounts = computed(() => {
    return Object.entries(rewardCounts.value)
        .map(([key, item]) => ({
            key,
            reward: item.reward,
            count: item.count,
        }))
        .sort((a, b) => b.count - a.count)
})

/**
 * 模拟一次箱子掉落。
 */
function openOnce(): void {
    if (!rewardItems.value.length) {
        return
    }

    if (currentRewardIndex.value >= rewardItems.value.length) {
        return
    }

    const selectedReward = rewardItems.value[currentRewardIndex.value]
    const reward = selectedReward?.reward
    if (!selectedReward || !reward) {
        return
    }

    const results = drawRewardTree(reward)
    if (!results.length) {
        return
    }

    lastResult.value = results

    for (const item of results) {
        const key = getRewardKey(item)
        const existed = rewardCounts.value[key]
        if (existed) {
            existed.count += item.c ?? 1
            continue
        }
        rewardCounts.value[key] = {
            reward: item,
            count: item.c ?? 1,
        }
    }

    currentRewardOpened.value++
    if (Number.isFinite(selectedReward.count) && currentRewardOpened.value >= selectedReward.count) {
        currentRewardOpened.value = 0
        currentRewardIndex.value = currentRewardIndex.value + 1
    }

    openCount.value++
}

/**
 * 批量模拟箱子掉落。
 * @param count 模拟次数
 */
function openMany(count: number): void {
    for (let i = 0; i < count; i++) {
        openOnce()
    }
}

/**
 * 重置模拟数据。
 */
function resetSimulation(): void {
    openCount.value = 0
    rewardCounts.value = {}
    lastResult.value = []
    currentRewardIndex.value = 0
    currentRewardOpened.value = 0
    rewardSequenceMap.value = new Map()
}

watch(
    () => props.boxDrop,
    () => {
        resetSimulation()
    }
)
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-center justify-between">
            <div class="text-sm font-medium">抽奖</div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded bg-base-300 p-2">
                <div class="text-xs text-base-content/60">总上限</div>
                <div class="font-medium">{{ boxDrop.boxMaximum }}</div>
            </div>
            <div class="rounded bg-base-300 p-2">
                <div class="text-xs text-base-content/60">每日上限</div>
                <div class="font-medium">{{ boxDrop.boxPerDay }}</div>
            </div>
            <div class="col-span-2 rounded bg-base-300 p-2">
                <div class="text-xs text-base-content/60">消耗</div>
                <ResourceCostItem :name="boxDrop.boxCoinId.toString()" :value="[boxDrop.coinPerBox, boxDrop.boxCoinId, 'Resource']" />
            </div>
        </div>

        <div class="space-y-2">
            <div class="text-xs text-base-content/70">奖励列表</div>
            <div class="space-y-2">
                <div
                    v-for="(item, index) in rewardItems"
                    :key="item.id"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">#{{ index + 1 }} 奖励组 {{ item.id }}</span>
                        <span
                            class="text-sm px-1.5 py-0.5 rounded"
                            :class="
                                getDropModeText(item.reward?.m || '') === '独立'
                                    ? 'bg-success text-success-content'
                                    : 'bg-warning text-warning-content'
                            "
                        >
                            {{ getDropModeText(item.reward?.m || "") }}
                            <span v-if="item.reward?.totalP">总容量 {{ item.reward.totalP }}</span>
                        </span>
                    </div>
                    <div class="text-xs text-base-content/60 mb-1">限量 {{ Number.isFinite(item.count) ? `${item.count} 个` : "∞" }}</div>
                    <div v-if="item.reward" class="pl-2">
                        <RewardItem :reward="item.reward" />
                    </div>
                </div>
            </div>
        </div>

        <div class="space-y-2">
            <div class="text-xs text-base-content/70">模拟</div>
            <div class="flex flex-wrap gap-2 justify-center mb-3">
                <button class="btn btn-primary btn-sm" @click="openOnce">抽1次</button>
                <button class="btn btn-primary btn-sm" @click="openMany(10)">抽10次</button>
                <button class="btn btn-error btn-sm" @click="resetSimulation">重置</button>
            </div>

            <div class="grid grid-cols-2 gap-2">
                <div class="rounded bg-base-300 p-2">
                    <div class="text-xs text-base-content/60">模拟次数</div>
                    <div class="text-2xl p-2 font-bold">{{ openCount }}</div>
                </div>
                <div class="rounded bg-base-300 p-2">
                    <div class="text-xs text-base-content/60">最近结果</div>
                    <div v-if="lastResult.length" class="space-y-1 text-sm font-medium">
                        <ResourceCostItem
                            v-for="item in lastResult"
                            :key="`${item.t}-${item.id}-${item.n || ''}`"
                            :name="item.n ? t(item.n) : `ID: ${item.id}`"
                            :value="getRewardCostValue(item)"
                        />
                    </div>
                    <span v-else class="text-sm font-medium">-</span>
                </div>
            </div>

            <div class="space-y-2">
                <div class="text-xs text-base-content/70">统计</div>
                <div class="grid grid-cols-2 gap-2">
                    <ResourceCostItem
                        v-for="item in sortedRewardCounts"
                        :key="item.key"
                        :name="item.reward.n ? t(item.reward.n) : `ID: ${item.reward.id}`"
                        :value="[item.count, item.reward.id, item.reward.t as BoxDropLeafType]"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
