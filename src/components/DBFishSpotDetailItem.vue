<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { Fish, FishingSpot } from "@/data"
import { fishMap, petMap } from "@/data"
import { calculateFishPrice, getRandomFish } from "@/utils/fish-utils"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"
import { getRewardDetails } from "@/utils/reward-utils"

const props = defineProps<{
    spot: FishingSpot
}>()

const { t: $t } = useTranslation()
const { gt } = useGameText()

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

const spotPetReward = computed(() => {
    return {
        id: 1,
        t: "Reward",
        p: 1,
        child: [
            {
                id: props.spot.petId!,
                m: "Independent",
                t: "Pet",
                p: 5000,
                c: 1,
                n: spotPet.value?.名称,
            },
        ],
    }
})
/**
 * 获取钓鱼池图标 URL。
 * @returns 钓鱼池图标 URL；若未配置则使用默认图标。
 */
const spotIcon = computed(() => {
    return props.spot.icon ? `/imgs/webp/${props.spot.icon}.webp` : "/imgs/webp/T_Tab_Angling00.webp"
})

/**
 * 出现时段枚举（1=上午 2=下午 3=夜晚）的中文原文，取值后需过 `gt`。
 */
const APPEAR_NAMES: Record<number, string> = {
    1: "上午",
    2: "下午",
    3: "夜晚",
}

/**
 * 鱼饵类型枚举（0=普通 1=同类相吸 2=好翅爱吃）对应的展示名。
 * 值是 i18n 键或游戏原文：前两项是 `db-fish-spot.lure_*` 界面文案，
 * 第三项「好翅爱吃」是游戏内鱼饵道具名，走数据包原文对照表。
 */
const LURE_NAMES: Record<number, string> = {
    0: "db-fish-spot.lure_none",
    1: "db-fish-spot.lure_same_attract",
    2: "好翅爱吃",
}

/**
 * 鱼饵类型的展示名。
 *
 * ⚠️ 取值必须用 `$t`（根级命名空间键），**不能**用 `gt`——`gt` 走的是「中文原文 → 译文」对照表，
 * 拿 `db-fish-spot.lure_none` 去查只会原样返回键名并显示在界面上（会把键名泄漏出去）。
 * 游戏原文（`好翅爱吃`）在 `$t` 下同样能命中对照表，所以这里统一用 `$t`。
 * @param lure 鱼饵类型 0=无 1=同类相吸 2=好翅爱吃
 * @returns 当前语言的鱼饵名
 */
function getLureName(lure: number): string {
    return $t(LURE_NAMES[lure] ?? String(lure))
}

/**
 * 获取出现时间名称
 * @param appear 出现时间 1=上午 2=下午 3=夜晚
 * @returns 时段中文原文（调用方负责过 `gt`）
 */
function getAppearName(appear: number): string {
    return APPEAR_NAMES[appear] || appear.toString()
}

/**
 * 获取出现时间名称。
 *
 * ⚠️ 这些原文要**逐个**过 `gt` 取译文，不能先拼成「上午、下午、夜晚」再翻译——
 * 对照表的键是单词本身，拼出来的整句不在表里，会原样退回中文。
 * @param appear 出现时间数组 1=上午 2=下午 3=夜晚
 * @returns 以「、」连接的当前语言时段名
 */
function getAppearNames(appear: number[]): string {
    return appear
        .map(t => APPEAR_NAMES[t])
        .filter(Boolean)
        .map(name => gt(name))
        .join("、")
}

/**
 * 获取鱼图片URL
 */
function getFishIcon(fish: Fish): string {
    return `/imgs/res/T_Fish_${fish.icon}.webp`
}

const APPEAR_TIMES = [1, 2, 3] as const
type AppearTime = (typeof APPEAR_TIMES)[number]

/**
 * 计算单条鱼在当前配置下的期望价格
 * @param fish 鱼数据
 * @param currentTime 当前时间段
 * @param addVariationProb 鱼饵提供的额外变异概率
 * @returns 单条鱼的期望价格
 */
function calculateExpectedFishPrice(fish: Fish, currentTime: AppearTime, addVariationProb: number): number {
    /**
     * 计算鱼在默认长度采样下的价格
     * @param targetFish 目标鱼
     * @returns 价格
     */
    function calculateBasePrice(targetFish: Fish) {
        return calculateFishPrice(targetFish, targetFish.length[0] + (targetFish.length[1] - targetFish.length[0]) / 1.3)
    }

    /**
     * 计算鱼在包含变异时的期望价格
     * @param targetFish 目标鱼
     * @returns 期望价格
     */
    function calculateMutationExpectedPrice(targetFish: Fish): number {
        const adjustedMutationProb = (targetFish.varProb || 0) * (1 + addVariationProb)
        const { price: basePrice } = calculateBasePrice(targetFish)
        if (!targetFish.var || adjustedMutationProb <= 0 || targetFish.var.length === 0) return basePrice

        const mutatedExpectedPrice =
            targetFish.var.reduce((sum, varFishId) => {
                const varFish = fishMap.get(varFishId)
                if (!varFish) return sum
                const { price: varPrice } = calculateBasePrice(varFish)
                return sum + varPrice
            }, 0) / targetFish.var.length

        return basePrice * (1 - adjustedMutationProb) + mutatedExpectedPrice * adjustedMutationProb
    }

    let finalPrice = calculateMutationExpectedPrice(fish)

    // 授渔以鱼需要可在当前时间段钓到，才参与期望替换
    if (fish.s2b && fish.s2b > 0) {
        const s2bFish = fishMap.get(fish.s2b)
        if (s2bFish && s2bFish.appear.includes(currentTime)) {
            const s2bFinalPrice = calculateMutationExpectedPrice(s2bFish)
            if (!s2bCompare.value || s2bFinalPrice > finalPrice) {
                finalPrice = s2bFinalPrice
            }
        }
    }

    return finalPrice
}

/**
 * 计算指定时间段的池子单条期望值
 * @param currentTime 时间段
 * @returns 单条期望值
 */
function calculateSpotExpectedValue(currentTime: AppearTime): number {
    const currentLure = lure.value
    const addVariationProb = currentLure === 1 ? 0.3 : 0
    const addRareFishProb = currentLure === 2 ? 1 : 0

    const adjustedWeights = spotFish.value.map((fish, index) => {
        const baseWeight = props.spot.weights[index] || 0
        if (!fish.appear.includes(currentTime)) return 0
        // 稀有鱼（level > 3）的权重受鱼饵影响
        return fish.level > 3 ? baseWeight * (1 + addRareFishProb) : baseWeight
    })

    const totalWeight = adjustedWeights.reduce((sum, weight) => sum + weight, 0)
    if (totalWeight <= 0) return 0

    let totalValue = 0
    spotFish.value.forEach((fish, index) => {
        const weight = adjustedWeights[index]
        if (weight <= 0) return

        const probability = weight / totalWeight
        const finalPrice = calculateExpectedFishPrice(fish, currentTime, addVariationProb)
        totalValue += finalPrice * probability
    })

    return totalValue
}

/**
 * 三个时间段的期望值
 */
const expectedValueByTime = computed(() => {
    return APPEAR_TIMES.map(time => ({
        time,
        value: calculateSpotExpectedValue(time),
    }))
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
const selectTime = ref<AppearTime>(1)
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
 * @param currentTime 当前时间段
 * @returns 钓鱼结果
 */
function randomCatch(fish: Fish, currentTime: AppearTime): ReducedCatchLog {
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
        const s2bFishData = fishMap.get(finalFish.s2b)
        if (s2bFishData && s2bFishData.appear.includes(currentTime)) {
            const s2bFish = calculateFishPrice(s2bFishData)
            if (!s2bCompare.value || s2bFish.price > price) {
                finalFish = s2bFish.fish
                originPrice = price
                price = s2bFish.price
                originFish = fish
            }
        }
    }

    return { price, finalFish, mutated, originFish, originPrice, length, count: 1 }
}

/**
 * 模拟一次钓鱼
 */
function fishOnce() {
    const fish = getRandomFish(props.spot, selectTime.value, lure.value)
    const result = randomCatch(fish.fish, selectTime.value)

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
    <div class="h-full flex flex-col">
        <SplitView
            :desktop-ratio="1 / 2"
            :detail-open="Boolean(selectedFish)"
            @collapse="selectedFish = null"
        >
            <template #master>
            <!-- 左侧：池子信息 + 鱼列表 -->
            <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedFish }">
                <ScrollArea class="flex-1">
                    <div class="stagger-rise space-y-3 p-3 sm:p-4">
                        <!-- 池子信息 -->
                        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <SectionHeader no-animate compact kicker="SPOT INFO" />
                            <!-- 池子名片 -->
                            <div class="mb-2.5 flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                                <div class="size-12 shrink-0 overflow-hidden rounded-xs">
                                    <img :src="spotIcon" class="h-full w-full object-cover" />
                                </div>
                                <div class="min-w-0">
                                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <SRouterLink
                                            :to="`/db/fishspot/${spot.id}`"
                                            class="truncate text-lg font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary"
                                        >
                                            {{ $t(spot.name) }}
                                        </SRouterLink>
                                        <CopyID :id="spot.id" />
                                    </div>
                                </div>
                            </div>

                            <div class="space-y-2">
                                <!-- 额外奖励 -->
                                <div v-if="extraRewardDetail" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                                    <div class="mb-1.5 text-[11px] tracking-wide text-base-content/55">
                                        {{
                                            $t("db-fish-spot.extra_reward", {
                                                prob: spot.extraRewardProb !== undefined ? `${(spot.extraRewardProb * 100).toFixed(2)}%` : "-",
                                            })
                                        }}
                                    </div>
                                    <RewardItem :reward="extraRewardDetail" />

                                    <!-- 魔灵奖励 -->
                                    <div v-if="spotPet" class="mt-2">
                                        <div class="mb-1.5 text-[11px] tracking-wide text-base-content/55">
                                            {{
                                                $t("db-fish-spot.pet_reward", {
                                                    prob: spot.petProb !== undefined ? `${(spot.petProb * 100).toFixed(2)}%` : "-",
                                                })
                                            }}
                                        </div>
                                        <RewardItem :reward="spotPetReward" />
                                    </div>
                                </div>
                                <div
                                    v-else-if="spot.extraReward !== undefined"
                                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-xs text-warning"
                                >
                                    {{ $t('db-fish-spot.no_extra_reward') }}
                                </div>

                                <div
                                    v-else-if="spot.petId !== undefined"
                                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-xs text-warning"
                                >
                                    {{ $t('db-fish-spot.no_pet_data') }}
                                </div>
                            </div>
                        </section>

                        <!-- 期望值 -->
                        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <SectionHeader no-animate compact kicker="EXPECTED" />
                            <div class="mb-2 text-[11px] tracking-wide text-base-content/55">
                                {{
                                    $t("db-fish-spot.expected_hint", {
                                        lure: getLureName(lure),
                                        mode: s2bCompare ? $t("db-fish-spot.skip_low_value") : $t("db-fish-spot.always_s2b"),
                                    })
                                }}
                            </div>
                            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                                <div
                                    v-for="timeExpected in expectedValueByTime"
                                    :key="timeExpected.time"
                                    class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                                >
                                    <div class="text-xs text-base-content/60">{{ gt(getAppearName(timeExpected.time)) }}</div>
                                    <div class="font-orbitron text-lg font-bold text-primary">
                                        {{ (timeExpected.value * 100).toFixed(2) }}
                                    </div>
                                    <div class="text-[11px] tabular-nums text-base-content/50">
                                        {{ $t("db-fish-spot.per_fish_expected", { value: timeExpected.value.toFixed(2) }) }}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- 鱼列表 -->
                        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <SectionHeader no-animate compact kicker="SPECIES" :title="$t('db-fish-spot.fish_list')" :count="spotFish.length" />
                            <div class="space-y-2">
                                <div
                                    v-for="(fish, index) in spotFish"
                                    :key="fish.id"
                                    class="group cursor-pointer rounded-xs border p-2.5 transition-all duration-200 hover:-translate-y-0.5"
                                    :class="
                                        selectedFish?.id === fish.id
                                            ? 'dbfs-item-active border-primary/70 bg-primary/10'
                                            : 'border-base-content/10 bg-base-content/3 hover:border-primary/40'
                                    "
                                    @click="selectedFish = fish"
                                >
                                    <div class="flex items-center gap-2.5">
                                        <img :src="getFishIcon(fish)" class="size-8 shrink-0 rounded-xs object-cover" />
                                        <div class="min-w-0 flex-1">
                                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span
                                                    class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                    :class="{ 'text-primary': selectedFish?.id === fish.id }"
                                                >
                                                    {{ $t(fish.name) }}
                                                </span>
                                                <CopyID :id="fish.id" />
                                                <span
                                                    class="shrink-0 rounded-xs px-1.5 py-0.5 text-[10px] leading-4"
                                                    :class="getRarityBadgeClass(fish.rarity)"
                                                >
                                                    {{ gt(getRarityName(fish.rarity)) }}
                                                </span>
                                            </div>
                                            <!-- 属性行 -->
                                            <div
                                                class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] leading-4 text-base-content/55"
                                            >
                                                <span class="rounded-xs border border-base-content/15 px-1 tabular-nums"
                                                    >Lv.{{ fish.level }}</span
                                                >
                                                <span
                                                    v-if="calculateFishPrice(fish, 1).length !== calculateFishPrice(fish, 10000).length"
                                                    class="rounded-xs border border-base-content/15 px-1 tabular-nums"
                                                >
                                                    {{ $t("db-fish-detail.length") }}:
                                                    {{ calculateFishPrice(fish, 1).length }}~{{ calculateFishPrice(fish, 10000).length }}
                                                </span>
                                                <span v-else class="rounded-xs border border-base-content/15 px-1 tabular-nums">
                                                    {{ $t("db-fish-detail.length") }}: {{ calculateFishPrice(fish, 10000).length }}
                                                </span>
                                                <span
                                                    v-if="calculateFishPrice(fish, 1).price !== calculateFishPrice(fish, 10000).price"
                                                    class="rounded-xs border border-base-content/15 px-1 tabular-nums"
                                                >
                                                    {{ $t("common.price") }}:
                                                    {{ calculateFishPrice(fish, 1).price }}~{{ calculateFishPrice(fish, 10000).price }}
                                                </span>
                                                <span v-else class="rounded-xs border border-base-content/15 px-1 tabular-nums">
                                                    {{ $t("common.price") }}: {{ calculateFishPrice(fish, 10000).price }}
                                                </span>
                                                <span
                                                    v-if="spot.weights[index]"
                                                    class="rounded-xs border border-base-content/15 px-1 tabular-nums"
                                                >
                                                    {{ $t("db-fish-spot.weight") }}: {{ spot.weights[index] }}
                                                </span>
                                                <span class="rounded-xs border border-base-content/15 px-1"
                                                    >{{ $t("db-fish-detail.appearance_time") }}: {{ gt(getAppearNames(fish.appear)) }}</span
                                                >
                                                <span
                                                    v-if="fish.varProb"
                                                    class="rounded-xs border border-base-content/15 px-1 tabular-nums"
                                                >
                                                    {{ $t("db-fish-spot.variant") }}: {{ +(fish.varProb * 100).toFixed(2) }}%
                                                </span>
                                                <span v-if="fish.s2b" class="rounded-xs border border-base-content/15 px-1">
                                                    {{ $t("db-fish-spot.s2b") }}: {{ $t(fishMap.get(fish.s2b)!.name) }}({{
                                                        calculateFishPrice(fishMap.get(fish.s2b)!, 10000).price
                                                    }})
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <!-- 钓鱼模拟 -->
                        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <SectionHeader no-animate compact kicker="SIMULATOR" :title="$t('db-fish-spot.fishing_sim')" />
                            <div class="space-y-1">
                                <div
                                    class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                                >
                                    <span class="w-16 shrink-0 text-xs text-base-content/55">{{ $t('db-fish-spot.fishing_time') }}</span>
                                    <label v-for="time in [1, 2, 3]" :key="time" class="cursor-pointer text-xs text-base-content/70">
                                        <input v-model="selectTime" type="radio" :value="time" class="radio radio-sm" />
                                        {{ gt(getAppearName(time)) }}
                                    </label>
                                </div>
                                <div
                                    class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                                >
                                    <span class="w-16 shrink-0 text-xs text-base-content/55">{{ $t('db-fish-spot.other') }}</span>
                                    <label class="cursor-pointer text-xs text-base-content/70">
                                        <input v-model="s2bCompare" type="checkbox" class="toggle toggle-sm" />
                                        {{ $t('db-fish-spot.skip_low_value') }}
                                    </label>
                                </div>
                                <div
                                    class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                                >
                                    <span class="w-16 shrink-0 text-xs text-base-content/55">{{ $t('db-fish-spot.bait_type') }}</span>
                                    <label
                                        v-for="lureType in [0, 1, 2]"
                                        :key="lureType"
                                        class="cursor-pointer text-xs text-base-content/70"
                                    >
                                        <input v-model="lure" type="radio" :value="lureType" class="radio radio-sm" />
                                        {{ getLureName(lureType) }}
                                    </label>
                                </div>
                            </div>
                            <div class="mt-2 grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    class="inline-flex h-6 cursor-pointer items-center justify-center rounded-xs border border-primary bg-primary px-2 text-[11px] font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                                    @click="fishOnce"
                                >
                                    {{ $t('db-fish-spot.fish_once') }}
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex h-6 cursor-pointer items-center justify-center rounded-xs border border-primary/50 px-2 text-[11px] text-primary transition-colors duration-150 hover:bg-primary/10 active:scale-[0.97]"
                                    @click="fishMultiple(100)"
                                >
                                    {{ $t('db-fish-spot.fish_100') }}
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex h-6 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-error/60 hover:text-error active:scale-[0.97]"
                                    @click="clearHistory"
                                >
                                    {{ $t('db-fish-spot.clear_records') }}
                                </button>
                            </div>
                        </section>

                        <!-- 钓鱼记录 -->
                        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <SectionHeader no-animate compact kicker="RECORDS" :title="$t('db-fish-spot.fishing_records')" :count="catchCount" />
                            <div class="mb-2 text-[11px] tracking-wide text-base-content/55">
                                {{ $t('db-fish-spot.total_value') }}
                                <b class="font-orbitron text-sm font-semibold text-primary">{{
                                    +reducedCatchHistory.reduce((acc, cur) => acc + cur.price * cur.count, 0).toFixed(2)
                                }}</b>
                            </div>
                            <div class="space-y-2">
                                <div
                                    v-for="(record, index) in reducedCatchHistory"
                                    :key="index"
                                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40"
                                >
                                    <div class="flex items-center gap-2.5">
                                        <img :src="getFishIcon(record.finalFish)" class="size-8 shrink-0 rounded-xs object-cover" />
                                        <div class="min-w-0 flex-1">
                                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span class="truncate text-sm font-semibold">{{ $t(record.finalFish.name) }}</span>
                                                <span :class="getRarityBadgeClass(record.finalFish.rarity)">
                                                    {{ gt(getRarityName(record.finalFish.rarity)) }}
                                                </span>
                                                <span
                                                    class="shrink-0 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] leading-4 tabular-nums text-base-content/60"
                                                >
                                                    x{{ record.count }}
                                                </span>
                                            </div>
                                            <div class="mt-1 text-[11px] tabular-nums text-base-content/55">
                                                {{ $t("common.price") }}:
                                                {{ record.originPrice ? `${record.originPrice} -> ${record.price}` : record.price }}
                                                <span v-if="record.mutated" class="ml-1 font-medium text-success">{{
                                                    $t("db-fish-spot.mutation")
                                                }}</span>
                                                <span v-if="record.originFish" class="ml-1 font-medium text-info"
                                                    >{{ $t("db-fish-spot.s2b") }} ({{ $t(record.originFish.name) }})</span
                                                >
                                                <span class="ml-1">{{ +record.length.toFixed(2) }}cm</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="reducedCatchHistory.length === 0" class="py-6 text-center text-sm text-base-content/45">
                                    {{ $t('db-fish-spot.no_records') }}
                                </div>
                            </div>
                        </section>
                    </div>
                </ScrollArea>
            </div>

            </template>
            <template #detail>

            <!-- 右侧：鱼详情 -->
            <ScrollArea v-if="selectedFish" class="min-h-0 min-w-0 flex-1">
                <DBFishDetailItem :fish="selectedFish" />
            </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
