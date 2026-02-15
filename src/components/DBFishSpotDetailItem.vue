<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { calculateFishPrice, getRandomFish } from "@/utils/fish-utils"
import { getRewardDetails } from "@/utils/reward-utils"
import type { Fish, FishingSpot } from "../data"
import { fishMap, petMap } from "../data"

const props = defineProps<{
    spot: FishingSpot
}>()

const selectedFish = ref<Fish | null>(null)

/**
 * 获取钓鱼池中的鱼数据
 */
const spotFish = computed(() => {
    return props.spot.fishIds.map(id => fishMap.get(id)).filter((f): f is Fish => f !== undefined)
})

const extraRewardDetail = computed(() => {
    return props.spot.extraReward ? getRewardDetails(props.spot.extraReward) : null
})

const spotPet = computed(() => {
    return props.spot.petId ? petMap.get(props.spot.petId) || null : null
})

/**
 * 获取稀有度颜色
 */
function getRarityColor(rarity: number): string {
    const colorMap: Record<number, string> = {
        1: "bg-green-200 text-green-800",
        2: "bg-green-200 text-green-800",
        3: "bg-blue-200 text-blue-800",
        4: "bg-purple-200 text-purple-800",
        5: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[rarity] || "bg-base-200 text-base-content"
}

/**
 * 获取稀有度名称
 */
function getRarityName(rarity: number): string {
    const rarityMap: Record<number, string> = {
        1: "白",
        2: "绿",
        3: "蓝",
        4: "紫",
        5: "金",
    }
    return rarityMap[rarity] || rarity.toString()
}

/**
 * 获取出现时间名称
 * @param appear 出现时间 1=上午 2=下午 3=夜晚
 */
function getAppearName(appear: number): string {
    const timeMap: Record<number, string> = {
        1: "上午",
        2: "下午",
        3: "夜晚",
    }
    return timeMap[appear] || appear.toString()
}

/**
 * 获取出现时间名称
 * @param appear 出现时间数组 1=上午 2=下午 3=夜晚
 */
function getAppearNames(appear: number[]): string {
    const timeMap: Record<number, string> = {
        1: "上午",
        2: "下午",
        3: "夜晚",
    }
    return appear.map(t => timeMap[t]).join("、")
}

/**
 * 获取鱼饵名称
 * @param lure 鱼饵类型 0=无 1=蚓鱼上钩 2=同类相吸
 */
function getLureName(lure: number): string {
    const lureMap: Record<number, string> = {
        0: "其他",
        1: "同类相吸(变异概率+30%)",
        2: "好翅爱吃(稀有鱼权重+100%)",
    }
    return lureMap[lure] || lure.toString()
}

/**
 * 获取鱼图片URL
 */
function getFishIcon(fish: Fish): string {
    return `/imgs/webp/T_Fish_${fish.icon}.webp`
}

/**
 * 计算池子期望值
 */
const expectedValue = computed(() => {
    // 获取当前选择的鱼饵
    const currentLure = lure.value

    // 计算不同鱼饵对权重和变异概率的影响
    const AddVariationProb = currentLure === 1 ? 0.3 : 0
    const AddRareFishProb = currentLure === 2 ? 1 : 0

    // 计算调整后的权重和总权重
    const adjustedWeights = spotFish.value.map((fish, index) => {
        const baseWeight = props.spot.weights[index] || 0
        if (!fish.appear.includes(selectTime.value)) return 0
        // 稀有鱼（level > 3）的权重受鱼饵影响
        return fish.level > 3 ? baseWeight * (1 + AddRareFishProb) : baseWeight
    })

    const totalWeight = adjustedWeights.reduce((sum, w) => sum + w, 0)
    let totalValue = 0

    spotFish.value.forEach((fish, index) => {
        const weight = adjustedWeights[index]
        const probability = weight / totalWeight

        // 计算调整后的变异概率
        const adjustedMutationProb = (fish.varProb || 0) * (1 + AddVariationProb)

        // 计算基础鱼价格和变异后的期望价格
        let finalPrice = 0

        function calculate(fish: Fish) {
            return calculateFishPrice(fish, fish.length[0] + (fish.length[1] - fish.length[0]) / 1.3)
        }

        // 计算基础鱼的变异期望
        if (fish.var && adjustedMutationProb > 0 && fish.var.length > 0) {
            // 基础鱼价格
            const { price: basePrice } = calculate(fish)
            // 计算变异后的期望价格
            const mutatedExpectedPrice =
                fish.var.reduce((sum, varFishId) => {
                    const varFish = fishMap.get(varFishId)
                    if (varFish) {
                        const { price: varPrice } = calculate(varFish)
                        return sum + varPrice
                    }
                    return sum
                }, 0) / fish.var.length

            // 加权平均基础价格和变异后的期望价格
            finalPrice = basePrice * (1 - adjustedMutationProb) + mutatedExpectedPrice * adjustedMutationProb
        } else {
            // 没有变异，直接使用基础价格
            const { price: basePrice } = calculate(fish)
            finalPrice = basePrice
        }

        // 考虑授渔以鱼机制
        if (fish.s2b && fish.s2b > 0) {
            const s2bFish = fishMap.get(fish.s2b)
            if (s2bFish) {
                let s2bFinalPrice = 0

                // 计算授渔以鱼的调整后变异概率
                const s2bAdjustedMutationProb = (s2bFish.varProb || 0) * (1 + AddVariationProb)

                // 计算授渔以鱼的变异期望
                if (s2bFish.var && s2bAdjustedMutationProb > 0 && s2bFish.var.length > 0) {
                    // 授渔以鱼基础价格
                    const { price: s2bBasePrice } = calculate(s2bFish)
                    // 计算授渔以鱼变异后的期望价格
                    const s2bMutatedExpectedPrice =
                        s2bFish.var.reduce((sum, varFishId) => {
                            const varFish = fishMap.get(varFishId)
                            if (varFish) {
                                const { price: varPrice } = calculate(varFish)
                                return sum + varPrice
                            }
                            return sum
                        }, 0) / s2bFish.var.length

                    // 加权平均授渔以鱼基础价格和变异后的期望价格
                    s2bFinalPrice = s2bBasePrice * (1 - s2bAdjustedMutationProb) + s2bMutatedExpectedPrice * s2bAdjustedMutationProb
                } else {
                    // 授渔以鱼没有变异，直接使用基础价格
                    const { price: s2bBasePrice } = calculate(s2bFish)
                    s2bFinalPrice = s2bBasePrice
                }

                // 根据s2bCompare选项决定是否使用授渔以鱼的价格
                if (s2bCompare.value ? s2bFinalPrice > finalPrice : true) {
                    finalPrice = s2bFinalPrice
                }
            }
        }

        totalValue += finalPrice * probability
    })

    return totalValue
})

// 钓鱼模拟相关状态
interface ReducedCatchLog {
    price: number
    finalFish: Fish
    mutated: boolean
    originFish: Fish | null
    originPrice: number
    length: number
    count: number
}

const reducedCatchHistory = ref<ReducedCatchLog[]>([])
const catchCount = ref(0)
const selectTime = ref<1 | 2 | 3>(1)
const lure = ref<0 | 1 | 2>(0)
const s2bCompare = ref<boolean>(false)

watch(
    () => props.spot,
    () => {
        clearHistory()
    }
)

/**
 * 模拟一次钓鱼
 * @param fish 基础鱼
 * @returns 钓鱼结果
 */
function randomCatch(fish: Fish): ReducedCatchLog {
    let { fish: finalFish, price, length } = calculateFishPrice(fish)
    let mutated = false
    let originFish = null
    let originPrice = 0

    // 变异逻辑：有varProb概率变异
    if (fish.var && fish.varProb && fish.var.length > 0 && Math.random() < fish.varProb) {
        const varFishId = fish.var[Math.floor(Math.random() * fish.var.length)]
        const varFish = fishMap.get(varFishId)
        if (varFish) {
            finalFish = varFish
            const { price: varPrice } = calculateFishPrice(varFish)
            price = varPrice
            mutated = true
        }
    }

    // 授渔以鱼逻辑：查看s2b，如果s2b鱼价值大于当前鱼则替换
    if (finalFish.s2b && finalFish.s2b > 0) {
        const s2bFish = calculateFishPrice(fishMap.get(finalFish.s2b)!)
        if (s2bFish && (!s2bCompare.value || s2bFish.price > price)) {
            finalFish = s2bFish.fish
            originPrice = price
            price = s2bFish.price
            originFish = fish
        }
    }

    return { price, finalFish, mutated, originFish, originPrice, length, count: 1 }
}

/**
 * 模拟一次钓鱼
 */
function fishOnce() {
    const fish = getRandomFish(props.spot, selectTime.value, lure.value)
    const result = randomCatch(fish.fish)

    // 使用鱼名称和长度作为唯一键
    const key = `${result.finalFish.name}_${result.length}`

    const existingIndex = reducedCatchHistory.value.findIndex(r => `${r.finalFish.name}_${r.length}` === key)

    if (existingIndex !== -1) {
        // 已存在，增加数量
        reducedCatchHistory.value[existingIndex].count += 1
    } else {
        // 不存在，添加新记录
        reducedCatchHistory.value.push(result)
        // 按 level 降序排序
        reducedCatchHistory.value.sort((a, b) => b.finalFish.level - a.finalFish.level)
        // 只保留前50条
        if (reducedCatchHistory.value.length > 50) {
            reducedCatchHistory.value = reducedCatchHistory.value.slice(0, 50)
        }
    }

    catchCount.value++
}

/**
 * 批量模拟钓鱼
 */
function fishMultiple(count: number) {
    for (let i = 0; i < count; i++) {
        fishOnce()
    }
}

/**
 * 清空钓鱼记录
 */
function clearHistory() {
    reducedCatchHistory.value = []
    catchCount.value = 0
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧：池子信息 + 鱼列表 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedFish }">
                <ScrollArea class="flex-1">
                    <div class="p-3 space-y-4">
                        <!-- 池子信息 -->
                        <div class="p-3 bg-base-200 rounded space-y-2">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-12 h-12 overflow-hidden rounded-full">
                                    <img :src="`/imgs/webp/${spot.icon}.webp`" class="w-full h-full object-cover" />
                                </div>
                                <div>
                                    <SRouterLink :to="`/db/fishspot/${spot.id}`"
                                        class="font-medium text-lg link link-primary">{{
                                            spot.name
                                        }}</SRouterLink>
                                    <div class="text-sm text-base-content/70">ID: {{ spot.id }}</div>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <div v-if="extraRewardDetail" class="p-2 bg-base-100 rounded">
                                    <div class="text-xs text-base-content/70 mb-1">
                                        额外奖励 (概率:
                                        {{ spot.extraRewardProb !== undefined ? `${(spot.extraRewardProb *
                                            100).toFixed(2)}%` : "-" }})
                                    </div>
                                    <RewardItem :reward="extraRewardDetail" />
                                </div>
                                <div v-else-if="spot.extraReward !== undefined"
                                    class="p-2 bg-base-100 rounded text-xs text-warning">
                                    额外奖励数据不存在
                                </div>

                                <div v-if="spotPet" class="p-2 bg-base-100 rounded">
                                    <div class="text-xs text-base-content/70 mb-1">
                                        魔灵奖励 (概率:
                                        {{ spot.petProb !== undefined ? `${(spot.petProb * 100).toFixed(2)}%` : "-" }})
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <img :src="`/imgs/webp/T_Head_Pet_${spotPet.icon}.webp`"
                                            class="w-8 h-8 object-cover rounded" />
                                        <SRouterLink :to="`/db/pet/${spotPet.id}`" class="text-sm link link-primary">
                                            {{ $t(spotPet.名称) }}
                                        </SRouterLink>
                                    </div>
                                </div>
                                <div v-else-if="spot.petId !== undefined"
                                    class="p-2 bg-base-100 rounded text-xs text-warning">
                                    魔灵数据不存在
                                </div>
                            </div>
                            <div class="p-3 bg-base-100 rounded">
                                <div class="text-xs text-base-content/70 mb-1">
                                    100条鱼平均期望(下方可调选项 当前设置: {{ getAppearName(selectTime) }} | {{ getLureName(lure) }} |
                                    {{ s2bCompare ? "放弃低价值授渔以鱼" : "无脑授渔以鱼" }})
                                </div>
                                <div class="text-2xl font-bold text-primary">{{ (expectedValue * 100).toFixed(2) }}
                                </div>
                                <div class="text-sm text-base-content/70">单条期望: {{ expectedValue.toFixed(2) }}</div>
                            </div>
                        </div>

                        <!-- 鱼列表 -->
                        <div class="p-3 bg-base-200 rounded">
                            <div class="text-xs text-base-content/70 mb-2">鱼种列表 (共 {{ spotFish.length }} 种)</div>
                            <div class="space-y-2">
                                <div v-for="(fish, index) in spotFish" :key="fish.id"
                                    class="flex items-center gap-2 p-2 bg-base-100 rounded cursor-pointer hover:bg-base-300"
                                    @click="selectedFish = fish">
                                    <img :src="getFishIcon(fish)" class="w-8 h-8 object-cover rounded" />
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium">{{ fish.name }}</span>
                                            <span class="text-xs text-base-content/70">ID: {{ fish.id }}</span>
                                            <span class="text-xs px-1.5 py-0.5 rounded"
                                                :class="getRarityColor(fish.rarity)">
                                                {{ getRarityName(fish.rarity) }}
                                            </span>
                                        </div>
                                        <div class="text-xs text-base-content/70 flex flex-wrap gap-2">
                                            <div class="badge badge-sm">Lv.{{ fish.level }}</div>
                                            <div v-if="calculateFishPrice(fish, 1).length !== calculateFishPrice(fish, 10000).length"
                                                class="badge badge-sm">
                                                长度: {{ calculateFishPrice(fish, 1).length }}~{{ calculateFishPrice(fish,
                                                    10000).length }}
                                            </div>
                                            <div v-else class="badge badge-sm">长度: {{ calculateFishPrice(fish,
                                                10000).length }}</div>
                                            <div v-if="calculateFishPrice(fish, 1).price !== calculateFishPrice(fish, 10000).price"
                                                class="badge badge-sm">
                                                价格: {{ calculateFishPrice(fish, 1).price }}~{{ calculateFishPrice(fish,
                                                    10000).price }}
                                            </div>
                                            <div v-else class="badge badge-sm">价格: {{ calculateFishPrice(fish,
                                                10000).price }}</div>
                                            <div v-if="spot.weights[index]" class="badge badge-sm">权重: {{
                                                spot.weights[index] }}</div>
                                            <div class="badge badge-sm">出现时间: {{ getAppearNames(fish.appear) }}</div>
                                            <div v-if="fish.varProb" class="badge badge-sm">
                                                异种: {{ +(fish.varProb * 100).toFixed(2) }}%
                                            </div>
                                            <div v-if="fish.s2b" class="badge badge-sm">
                                                授渔以鱼: {{ fishMap.get(fish.s2b)!.name }}({{
                                                    calculateFishPrice(fishMap.get(fish.s2b)!, 10000).price
                                                }})
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 钓鱼模拟 -->
                        <div class="p-3 bg-base-200 rounded space-y-2">
                            <div class="text-xs text-base-content/70">钓鱼模拟</div>
                            <div class="grid grid-cols-1 items-center">
                                <div class="flex-1 flex gap-2 items-center p-2">
                                    <span class="text-xs text-base-content/70 w-16">钓鱼时间</span>
                                    <label v-for="time in [1, 2, 3]" :key="time" class="text-xs text-base-content/70">
                                        <input v-model="selectTime" type="radio" :value="time" class="radio radio-sm" />
                                        {{ getAppearName(time) }}
                                    </label>
                                </div>
                                <div class="flex-1 flex gap-2 items-center p-2">
                                    <span class="text-xs text-base-content/70 w-16">其他</span>
                                    <label class="text-xs text-base-content/70">
                                        <input v-model="s2bCompare" type="checkbox" class="toggle toggle-sm" />
                                        放弃低价值授渔以鱼
                                    </label>
                                </div>
                                <div class="flex-1 flex gap-2 items-center p-2">
                                    <span class="text-xs text-base-content/70 w-16">鱼饵类型</span>
                                    <label v-for="lureType in [0, 1, 2]" :key="lureType"
                                        class="text-xs text-base-content/70">
                                        <input v-model="lure" type="radio" :value="lureType" class="radio radio-sm" />
                                        {{ getLureName(lureType) }}
                                    </label>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-2 col-span-3">
                                <button class="btn btn-primary btn-sm" @click="fishOnce">钓一次</button>
                                <button class="btn btn-secondary btn-sm" @click="fishMultiple(100)">钓100次</button>
                                <button class="btn btn-ghost btn-sm" @click="clearHistory">清空记录</button>
                            </div>
                        </div>

                        <!-- 钓鱼记录 -->
                        <div class="p-3 bg-base-200 rounded">
                            <div class="text-xs text-base-content/70 mb-2">钓鱼记录 (共 {{ catchCount }} 次)</div>
                            <div class="text-xs text-base-content/70 mb-2">
                                总价值:{{+reducedCatchHistory.reduce((acc, cur) => acc + cur.price * cur.count,
                                    0).toFixed(2)}}
                            </div>
                            <div class="space-y-2">
                                <div v-for="(record, index) in reducedCatchHistory" :key="index"
                                    class="flex items-center gap-2 p-2 bg-base-100 rounded">
                                    <img :src="getFishIcon(record.finalFish)" class="w-8 h-8 object-cover rounded" />
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium">{{ record.finalFish.name }}</span>
                                            <span class="text-xs px-1.5 py-0.5 rounded"
                                                :class="getRarityColor(record.finalFish.rarity)">
                                                {{ getRarityName(record.finalFish.rarity) }}
                                            </span>
                                            <span class="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-800">
                                                x{{ record.count }}
                                            </span>
                                        </div>
                                        <div class="text-xs text-base-content/70">
                                            价格: {{ record.originPrice ? `${record.originPrice} -> ${record.price}` :
                                                record.price }}
                                            <span v-if="record.mutated" class="text-green-600 ml-1">变异</span>
                                            <span v-if="record.originFish" class="text-blue-600 ml-1">授渔以鱼 ({{
                                                record.originFish.name }})</span>
                                            <span class="ml-1">{{ +record.length.toFixed(2) }}cm</span>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="reducedCatchHistory.length === 0"
                                    class="text-center text-sm text-base-content/50 py-4">
                                    暂无钓鱼记录
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            <!-- 右侧关闭按钮 -->
            <div v-if="selectedFish"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedFish = null">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧：鱼详情 -->
            <ScrollArea v-if="selectedFish" class="flex-1">
                <DBFishDetailItem :fish="selectedFish" />
            </ScrollArea>
        </div>
    </div>
</template>
