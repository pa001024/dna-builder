<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { Dungeon } from "@/data"
import { LeveledMonster } from "@/data"
import { getDungeonType } from "@/utils/dungeon-utils"
import { getDropModeText, getRewardDetails, RewardItem as RewardItemType } from "@/utils/reward-utils"

const props = defineProps<{
    dungeon: Dungeon
}>()

const currentLevel = ref(props.dungeon.lv)

/**
 * 格式化奖励组序号区间显示
 * @param indices 奖励组原始序号（从 0 开始）
 * @returns 形如 #1~#3、#1,#3~#4 的文本
 */
function formatRewardIndexRanges(indices: number[]): string {
    if (!indices.length) return ""

    const sorted = [...indices].sort((a, b) => a - b)
    const ranges: string[] = []
    let start = sorted[0]
    let prev = sorted[0]

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i]
        if (current === prev + 1) {
            prev = current
            continue
        }

        ranges.push(start === prev ? `#${start + 1}` : `#${start + 1}~#${prev + 1}`)
        start = current
        prev = current
    }

    ranges.push(start === prev ? `#${start + 1}` : `#${start + 1}~#${prev + 1}`)

    return ranges.join(",")
}

/**
 * 合并奖励列表中相同奖励组（按 reward.id）并记录原始索引
 */
const mergedDungeonRewards = computed(() => {
    const groupedRewards = new Map<number, { reward: RewardItemType; indices: number[] }>()

    props.dungeon.r?.forEach((rewardId, index) => {
        const reward = getRewardDetails(rewardId)
        if (!reward) return

        const grouped = groupedRewards.get(reward.id)
        if (grouped) {
            grouped.indices.push(index)
            return
        }

        groupedRewards.set(reward.id, {
            reward,
            indices: [index],
        })
    })

    return Array.from(groupedRewards.values())
})

watch(
    () => props.dungeon.id,
    () => {
        currentLevel.value = props.dungeon.lv
    }
)
</script>

<template>
    <div class="p-3 space-y-3">
        <!-- 详情头部 -->
        <div class="flex items-center justify-between">
            <div>
                <SRouterLink :to="`/db/dungeon/${dungeon.id}`" class="text-lg font-bold link link-primary">
                    {{ dungeon.n }}
                </SRouterLink>
                <div class="text-sm text-base-content/70">
                    {{ dungeon.desc }}
                </div>
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
            <!-- 等级控制 -->
            <div class="flex items-center gap-4 mb-3">
                <span class="text-sm min-w-12">Lv. {{ currentLevel }}</span>
                <input v-model.number="currentLevel" type="range" class="range range-primary range-xs grow" min="1" max="180" step="1" />
            </div>
            <h3 class="font-bold mb-2">普通怪物 ({{ dungeon.m.length }}种)</h3>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <DBMonsterCompactCard
                    v-for="monsterId in dungeon.m"
                    :key="monsterId"
                    :monster="new LeveledMonster(monsterId, currentLevel)"
                />
            </div>
        </div>

        <!-- 特殊怪物 -->
        <div v-if="dungeon.sm?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">特殊怪物 ({{ dungeon.sm.length }}种)</h3>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <DBMonsterCompactCard
                    v-for="monsterId in dungeon.sm"
                    :key="monsterId"
                    :monster="new LeveledMonster(monsterId, currentLevel)"
                />
            </div>
        </div>

        <!-- 奖励列表 -->
        <div v-if="dungeon.r?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">奖励列表</h3>
            <div class="space-y-3">
                <div
                    v-for="item in mergedDungeonRewards"
                    :key="`${item.reward.id}-${item.indices.join('-')}`"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">{{ formatRewardIndexRanges(item.indices) }} 奖励组 {{ item.reward.id }}</span>

                        <span
                            class="text-xs px-1.5 py-0.5 rounded"
                            :class="
                                getDropModeText(item.reward.m || '') === '独立'
                                    ? 'bg-success text-success-content'
                                    : 'bg-warning text-warning-content'
                            "
                        >
                            {{ getDropModeText(item.reward.m || "") }}
                            <span v-if="item.reward.totalP">总容量 {{ item.reward.totalP }}</span>
                        </span>
                    </div>
                    <!-- 使用 RewardItem 组件显示奖励 -->
                    <RewardItem :reward="item.reward" />
                </div>
            </div>
        </div>

        <!-- 特殊奖励 -->
        <div v-if="dungeon.sr?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">特殊奖励 ({{ dungeon.sr.length }}组)</h3>
            <div class="space-y-3">
                <div
                    v-for="reward in dungeon.sr.map(id => getRewardDetails(id)).filter((r): r is RewardItemType => !!r)"
                    :key="reward.id"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">特殊奖励组 {{ reward.id }}</span>
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
