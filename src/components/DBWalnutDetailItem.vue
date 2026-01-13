<script lang="ts" setup>
import { ref, computed, watch } from "vue"
import { Walnut } from "../data/d/walnut.data"
import { WalnutSequenceSimulator } from "../utils/walnut-utils"
import { draftMap } from "@/data"

const props = defineProps<{
    walnut: Walnut
}>()

// 草稿数据，用于 DBDraftDetailItem 组件
const draft = computed(() => {
    return draftMap.get(props.walnut.奖励[0].id) ?? null
})

// 模拟开函相关状态
const simulator = new WalnutSequenceSimulator()
const openResults = ref<number[][]>([])
const isAutoOpening = ref(false)
const autoOpenTimer = ref<number | null>(null)
const totalOpens = ref(0)
const goldCount = ref(0)

// 奖励数量统计
const rewardCounts = ref<Record<string, number>>({})

// 武器部件数量统计
const weaponPartCounts = ref<Record<string, number>>({})

// 按稀有度排序的奖励统计
const sortedRewardCounts = computed(() => {
    // 直接使用索引访问奖励，索引越小，稀有度越高
    return Object.entries(rewardCounts.value)
        .map(([name, count]) => {
            // 查找奖励在数组中的索引，索引越小稀有度越高
            const index = props.walnut.奖励.findIndex(r => r.name === name)
            return {
                d: props.walnut.奖励[index]?.d || 0,
                name: props.walnut.奖励[index]?.name || name,
                count,
                rarity: index + 1, // 索引+1作为稀有度，1最高
            }
        })
        .sort((a, b) => a.rarity - b.rarity) // 稀有度值越小越稀有，排在前面
})

// 获取奖励的颜色类名
function getRewardColor(rarity: number): string {
    switch (rarity) {
        case 1: // 金，稀有度最高
            return "text-yellow-500 font-bold"
        case 2: // 大银
            return "text-blue-400 font-semibold"
        case 3: // 小银
            return "text-cyan-400"
        default: // 铜
            return "text-gray-500"
    }
}

// 概率数据
const probabilityData = computed(() => {
    const data = []
    for (let n = 1; n <= 19; n++) {
        const prob = WalnutSequenceSimulator.calculateGoldProbability(n)
        data.push({
            n,
            probability: parseFloat(prob.toFixed(6)),
        })
    }
    return data
})

/**
 * 判断是否为武器部件奖励
 */
function isWeaponPart(name: string): boolean {
    // 根据实际脚本提取的部件后缀，匹配固定的部件后缀
    const weaponPartSuffixes = [
        "的上弓臂",
        "的下弓臂",
        "的刀刃",
        "的右刀刃",
        "的左刀刃",
        "的弓弦",
        "的握柄",
        "的枪机",
        "的枪管",
        "的枪身",
        "的饰物",
    ]

    return weaponPartSuffixes.some(suffix => name.endsWith(suffix))
}

/**
 * 对奖励索引进行排序
 */
function sortRewards(rewards: number[]): number[] {
    // 映射奖励索引到实际奖励对象
    const rewardObjects = rewards.map(index => {
        const reward = props.walnut.奖励[index]
        return {
            index,
            name: reward?.name || "未知",
            isGold: index === 0, // 索引0为金奖
            rarity: index + 1, // 索引+1作为稀有度，1最高
            count: reward?.count || 1,
        }
    })

    // 排序逻辑
    return rewardObjects
        .sort((a, b) => {
            // 规则1: 金奖必须排第一
            if (a.isGold && !b.isGold) {
                return -1
            }
            if (!a.isGold && b.isGold) {
                return 1
            }

            // 规则2: 根据密函类型应用不同的排序规则
            if (props.walnut.类型 === 2) {
                // 武器类型：应用部件排序规则
                // 检查是否为武器部件
                const aIsPart = isWeaponPart(a.name)
                const bIsPart = isWeaponPart(b.name)

                if (aIsPart && bIsPart) {
                    // 都是部件，选择当前获取最少的
                    const aCount = weaponPartCounts.value[a.name] || 0
                    const bCount = weaponPartCounts.value[b.name] || 0
                    return aCount - bCount
                } else if (aIsPart) {
                    // a是部件，b不是，部件优先
                    return -1
                } else if (bIsPart) {
                    // b是部件，a不是，部件优先
                    return 1
                }
                // 如果都不是部件，按照稀有度排序
                return a.rarity - b.rarity
            } else {
                // 非武器类型：按照稀有度排序
                return a.rarity - b.rarity
            }
        })
        .map(reward => reward.index)
}

/**
 * 手动开一次密函
 */
function openOnce() {
    let result = simulator.open()

    // 对奖励进行排序
    result = sortRewards(result)

    // 只统计第一个奖励
    const index = result[0]
    const reward = props.walnut.奖励[index]
    if (!reward) return

    // 更新奖励统计，乘以奖励数量
    rewardCounts.value[reward.name] = (rewardCounts.value[reward.name] || 0) + reward.count

    // 如果是武器部件，单独统计，乘以奖励数量
    if (isWeaponPart(reward.name)) {
        weaponPartCounts.value[reward.name] = (weaponPartCounts.value[reward.name] || 0) + reward.count
    }

    openResults.value.unshift(result)
    totalOpens.value++

    // 检查是否出金（索引为0的奖励为金）
    if (index === 0) {
        goldCount.value++
    }

    // 最多保留50条记录
    if (openResults.value.length > 200) {
        openResults.value.pop()
    }
}

/**
 * 开始自动开密函
 */
function startAutoOpen() {
    if (isAutoOpening.value) return

    isAutoOpening.value = true
    autoOpenTimer.value = setInterval(() => {
        openOnce()
    }, 100) as unknown as number
}

/**
 * 停止自动开密函
 */
function stopAutoOpen() {
    if (!isAutoOpening.value) return

    isAutoOpening.value = false
    if (autoOpenTimer.value) {
        clearInterval(autoOpenTimer.value)
        autoOpenTimer.value = null
    }
}

/**
 * 重置模拟数据
 */
function resetSimulation() {
    stopAutoOpen()
    openResults.value = []
    totalOpens.value = 0
    goldCount.value = 0
    // 重置奖励统计
    rewardCounts.value = {}
    weaponPartCounts.value = {}
}
watch(() => props.walnut.奖励, resetSimulation)

/**
 * 获取奖励索引对应的信息
 */
function getRewardInfo(index: number) {
    const reward = props.walnut.奖励[index]
    return {
        index,
        name: reward?.name || "未知",
        count: reward?.count || 1,
        d: reward?.d || 0,
    }
}

/**
 * 获取奖励索引对应的颜色类名
 */
function getRewardTypeColor(index: number): string {
    switch (index) {
        case 0: // 金
            return "text-yellow-500 font-bold"
        case 1: // 大银
            return "text-blue-400"
        case 2: // 小银
            return "text-cyan-400"
        default: // 铜
            return "text-gray-300"
    }
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <div class="p-3">
                <!-- 密函基本信息 -->
                <div class="flex items-center gap-3 mb-3">
                    <span class="text-lg font-bold">
                        {{ props.walnut.名称 }}
                    </span>
                    <span class="text-xs text-base-content/70">ID: {{ props.walnut.id }}</span>
                    <div class="text-sm text-base-content/70 flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-base-200"> {{ props.walnut.稀有度 }}星 </span>
                        <div class="ml-auto badge badge-sm badge-soft gap-1 text-base-content/80">
                            {{ props.walnut.类型 === 1 ? "角色" : props.walnut.类型 === 2 ? "武器" : "魔之楔" }}
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap gap-2 text-sm opacity-70 mb-3">
                    <span>{{ props.walnut.模式 }}</span>
                </div>

                <!-- 获取途径 -->
                <div class="p-3 bg-base-200 rounded mb-3">
                    <div class="text-xs text-base-content/70 mb-1">获取途径</div>
                    <div class="flex flex-wrap gap-2">
                        <span v-for="way in props.walnut.获取途径" :key="way" class="bg-base-300 px-2 py-0.5 rounded-full text-xs">
                            {{ way }}
                        </span>
                    </div>
                </div>

                <!-- 奖励列表 -->
                <div class="p-3 bg-base-200 rounded mb-3">
                    <div class="flex items-center justify-between mb-3">
                        <div class="text-xs text-base-content/70">奖励列表</div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full min-w-100">
                            <thead>
                                <tr class="border-b border-base-content/20">
                                    <th class="text-left py-2 px-3 text-xs">ID</th>
                                    <th class="text-left py-2 px-3 text-xs">名称</th>
                                    <th class="text-left py-2 px-3 text-xs">数量</th>
                                    <th class="text-left py-2 px-3 text-xs">池随机范围*</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(reward, index) in props.walnut.奖励"
                                    :key="index"
                                    class="border-b border-base-content/10 hover:bg-base-300/50 transition-colors"
                                >
                                    <td class="py-2 px-3 text-sm">{{ reward.id }}</td>
                                    <td class="py-2 px-3 text-sm">
                                        {{ (reward.d || 0) > 0 ? `图纸: ` : "" }}
                                        {{ $t(reward.name) }}
                                    </td>
                                    <td class="py-2 px-3 text-sm">{{ reward.count }}</td>
                                    <td class="py-2 px-3 text-sm">{{ index > 0 ? `0~${props.walnut.参数[index]}` : 1 }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p class="text-xs text-base-content/70 mt-4">
                        * 机制: 从每个奖励的随机范围抽取n个该种奖励后加入到奖励序列, 打乱后在序列结尾放置金奖励,
                        重复抽取直到抽出金后重置序列
                    </p>
                </div>

                <div v-if="draft" class="bg-base-200 rounded mb-3">
                    <!-- 图纸 -->
                    <DBDraftDetailItem :draft="draft" />
                </div>

                <!-- 模拟开函 -->
                <div class="p-3 bg-base-200 rounded mb-3">
                    <div class="flex items-center justify-between mb-3">
                        <div class="text-xs text-base-content/70">模拟开函</div>
                    </div>

                    <!-- 统计信息 -->
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <div class="bg-base-300 rounded p-2">
                            <div class="text-xs text-base-content/60 mb-0.5">总开函次数</div>
                            <div class="text-lg font-bold">{{ totalOpens }}</div>
                        </div>
                        <div class="bg-base-300 rounded p-2">
                            <div class="text-xs text-base-content/60 mb-0.5">出金次数</div>
                            <div class="text-lg font-bold text-yellow-500">{{ goldCount }}</div>
                        </div>
                        <div class="bg-base-300 rounded p-2">
                            <div class="text-xs text-base-content/60 mb-0.5">出金率</div>
                            <div class="text-lg font-bold">{{ totalOpens > 0 ? ((goldCount / totalOpens) * 100).toFixed(2) : 0 }}%</div>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="flex flex-wrap gap-2 justify-center mb-3">
                        <button class="btn btn-primary btn-sm" :disabled="isAutoOpening" @click="openOnce">手动开一次</button>
                        <button class="btn btn-secondary btn-sm" @click="isAutoOpening ? stopAutoOpen() : startAutoOpen()">
                            {{ isAutoOpening ? "停止自动" : "开始自动" }}开
                        </button>
                        <button class="btn btn-error btn-sm" @click="resetSimulation">重置数据</button>
                    </div>

                    <!-- 开函结果 -->
                    <div class="mb-3">
                        <div class="text-xs text-base-content/70 mb-2">开函结果（最近200次）</div>
                        <div class="bg-base-300 rounded p-2 max-h-48 overflow-y-auto">
                            <div v-if="openResults.length === 0" class="text-center text-base-content/60 py-4">暂无开函记录</div>
                            <div v-else class="grid grid-cols-1 gap-1">
                                <div
                                    v-for="(result, index) in openResults"
                                    :key="index"
                                    class="flex items-center gap-2 p-1 bg-base-100/50 rounded text-xs"
                                >
                                    <span class="text-base-content/60 w-8">{{ totalOpens - index }}</span>
                                    <div class="flex-1 flex gap-0.5">
                                        <span
                                            v-for="(reward, rIndex) in result.map(v => getRewardInfo(v))"
                                            :key="rIndex"
                                            class="px-1.5 py-0.5 rounded text-xs font-medium"
                                            :class="[getRewardTypeColor(reward.index), rIndex === 0 ? 'underline' : '']"
                                        >
                                            {{ reward.d > 0 ? $t(`图纸: `) : "" }}
                                            {{ $t(reward.name) }}
                                            {{ reward.count > 1 ? `*${reward.count}` : "" }}
                                        </span>
                                    </div>
                                    <span v-if="result.includes(0)" class="text-xs text-yellow-500 font-bold"> ✨ </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 奖励数量统计 -->
                    <div class="mb-3">
                        <div class="text-xs text-base-content/70 mb-2">奖励数量统计</div>
                        <div class="bg-base-300 rounded p-2 max-h-40 overflow-y-auto">
                            <div v-if="Object.keys(rewardCounts).length === 0" class="text-center text-base-content/60 py-4">
                                暂无统计数据
                            </div>
                            <div v-else class="grid grid-cols-2 gap-2">
                                <div
                                    v-for="reward in sortedRewardCounts"
                                    :key="reward.name"
                                    class="flex items-center justify-between p-2 bg-base-100/50 rounded text-xs"
                                >
                                    <div>
                                        <span :class="getRewardColor(reward.rarity)">
                                            {{ reward.d > 0 ? $t(`图纸: `) : "" }}
                                            {{ $t(reward.name) }}</span
                                        >
                                    </div>
                                    <span class="font-medium text-primary">*{{ reward.count }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="text-xs text-base-content/70 mb-2">出金概率期望</div>
                        <div class="bg-base-300 rounded p-2 overflow-x-auto">
                            <table class="w-full min-w-100">
                                <thead>
                                    <tr class="border-b border-base-content/20">
                                        <th class="text-left py-2 px-3 text-xs">开函次数(n)</th>
                                        <th class="text-left py-2 px-3 text-xs">至少一次出金概率</th>
                                        <th class="text-left py-2 px-3 text-xs">刚好在这次开出金概率</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="(item, index) in probabilityData"
                                        :key="item.n"
                                        class="border-b border-base-content/10 hover:bg-base-100/50 transition-colors"
                                    >
                                        <td class="py-1.5 px-3 text-xs">{{ item.n }}</td>
                                        <td class="py-1.5 px-3 text-xs">{{ (item.probability * 100).toFixed(2) }}%</td>
                                        <td class="py-1.5 px-3 text-xs">
                                            {{
                                                +(
                                                    (index === 0
                                                        ? item.probability
                                                        : item.probability - probabilityData[index - 1].probability) * 100
                                                ).toFixed(2)
                                            }}%
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
