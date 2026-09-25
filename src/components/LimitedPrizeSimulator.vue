<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { LeveledWeaponHelper, resourceMap } from "@/data"
import { skinMap } from "@/data/d"
import { charAccessoryData, headFrameData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"
import { headSculptureData } from "@/data/d/headsculpture.data"
import { charMap } from "@/data/d/index"
import { limitedPrizeCostRules, limitedPrizeItems, limitedPrizePools } from "@/data/d/limitedprize.data"
import { LeveledChar } from "@/data/leveled/LeveledChar"
import { resolveSkinIconUrl } from "@/utils/accessory-utils"
import type { RewardItem } from "@/utils/reward-utils"

type LimitedPrizeType =
    | "Char"
    | "Weapon"
    | "Skin"
    | "WeaponSkin"
    | "CharAccessory"
    | "WeaponAccessory"
    | "Resource"
    | "HeadFrame"
    | "HeadSculpture"

interface LimitedPrizeEntry {
    id: number
    name: string
    type: LimitedPrizeType
    count: number
    probability: number
    icon: string
    displayId: number
}

interface VisibleLimitedPrizeEntry extends LimitedPrizeEntry {
    currentProbability: number
    isDrawn: boolean
}

interface AggregatedRewardItem extends RewardItem {
    totalCount: number
}

const props = defineProps<{
    eventId: number
}>()

const selectedPoolIndex = ref(0)
const selectedPrizeKey = ref<string | null>(null)
const drawCount = ref(0)
const poolDrawCount = ref(0)
const totalCostSpent = ref(0)
const rewardHistory = ref<RewardItem[]>([])
const drawStats = ref<Record<string, number>>({})
const isAutoDrawing = ref(false)
const autoDrawTimer = ref<number | null>(null)
const remainingPrizeEntries = ref<LimitedPrizeEntry[]>([])

/**
 * 获取当前活动的奖池 ID 列表。
 * @returns 奖池 ID 列表
 */
const poolIds = computed(() => limitedPrizePools[props.eventId]?.LimitedPrizePoolId ?? [])

/**
 * 获取当前奖池的成本规则。
 * @returns 成本规则
 */
const currentCostRule = computed(() => {
    const poolId = poolIds.value[selectedPoolIndex.value]
    if (!poolId) {
        return null
    }
    const pool = limitedPrizeItems[poolId]
    return pool ? (limitedPrizeCostRules[pool.CostRuleId] ?? null) : null
})

/**
 * 获取当前奖池。
 * @returns 当前奖池
 */
const currentPool = computed(() => {
    const poolId = poolIds.value[selectedPoolIndex.value]
    return poolId ? (limitedPrizeItems[poolId] ?? null) : null
})

/**
 * 当前奖池的奖品列表。
 * @returns 奖品列表
 */
const prizeList = computed<LimitedPrizeEntry[]>(() => {
    const pool = currentPool.value
    if (!pool) {
        return []
    }

    return pool.Id.map((ids, index) => {
        const typeIndex = pool.Type[index]
        const type = getPrizeType(typeIndex)
        const displayId = ids[selectedPoolIndex.value] ?? ids[0] ?? 0
        const name = getPrizeName(type, displayId)
        return {
            id: pool.LimitedPrizePoolId,
            name,
            type,
            count: pool.Count[index] ?? 1,
            probability: pool.Probability[index] ?? 0,
            icon: getPrizeIcon(type, displayId),
            displayId,
        }
    })
})

/**
 * 获取奖品唯一标识。
 * @param prize 奖品项
 * @returns 唯一标识
 */
function getPrizeEntryKey(prize: LimitedPrizeEntry): string {
    return `${prize.id}-${prize.type}-${prize.displayId}`
}

/**
 * 计算当前展示的奖池奖品列表。
 * @returns 展示中的奖品列表
 */
const visiblePrizeList = computed<VisibleLimitedPrizeEntry[]>(() => {
    const remainingTotal = remainingPrizeEntries.value.reduce((sum, item) => sum + item.probability, 0)
    return prizeList.value.map(prize => {
        const remainingCount = remainingPrizeEntries.value.filter(item => getPrizeEntryKey(item) === getPrizeEntryKey(prize)).length
        const currentProbability = remainingCount > 0 && remainingTotal > 0 ? Math.round((prize.probability / remainingTotal) * 10000) : 0
        return {
            ...prize,
            currentProbability,
            isDrawn: remainingCount <= 0,
        }
    })
})

/**
 * 聚合最近结果，合并相同奖励数量。
 * @returns 聚合后的结果列表
 */
const aggregatedRewardHistory = computed<AggregatedRewardItem[]>(() => {
    const grouped = new Map<string, AggregatedRewardItem>()

    for (const reward of rewardHistory.value) {
        const key = `${reward.t}-${reward.id}`
        const existing = grouped.get(key)
        if (existing) {
            existing.totalCount += reward.c ?? 1
            continue
        }

        grouped.set(key, {
            ...reward,
            totalCount: reward.c ?? 1,
        })
    }

    return [...grouped.values()].slice(0, 20)
})

/**
 * 获取累计消耗。
 * @returns 当前奖池累计消耗
 */
const costResourceId = computed(() => currentCostRule.value?.CostResourceId ?? 1009)

/**
 * 获取当前奖池累计消耗总和。
 * @returns 累计消耗数量
 */
const totalCost = computed(() => {
    const rule = currentCostRule.value
    if (!rule) {
        return 0
    }

    return totalCostSpent.value
})

/**
 * 获取奖品类型。
 * @param typeIndex 原始类型编号
 * @returns 物品类型
 */
function getPrizeType(typeIndex: number): LimitedPrizeType {
    const typeMap: Record<number, LimitedPrizeType> = {
        0: "Char",
        1: "Weapon",
        2: "Skin",
        3: "WeaponSkin",
        4: "CharAccessory",
        5: "WeaponAccessory",
        6: "Resource",
        7: "HeadFrame",
        8: "HeadSculpture",
    }
    return typeMap[typeIndex] || "Resource"
}

/**
 * 获取奖品名称。
 * @param type 物品类型
 * @param id 物品 ID
 * @returns 名称
 */
function getPrizeName(type: LimitedPrizeType, id: number): string {
    if (type === "Char") {
        return charMap.get(id)?.名称 || `ID: ${id}`
    }
    if (type === "Weapon") {
        return LeveledWeaponHelper.idToUrl(id) ? `武器 ${id}` : `ID: ${id}`
    }
    if (type === "Skin") {
        return skinMap.get(id)?.name || `ID: ${id}`
    }
    if (type === "WeaponSkin") {
        return weaponSkinData.find(item => item.id === id)?.name || `ID: ${id}`
    }
    if (type === "CharAccessory") {
        return charAccessoryData.find(item => item.id === id)?.name || `ID: ${id}`
    }
    if (type === "WeaponAccessory") {
        return weaponAccessoryData.find(item => item.id === id)?.name || `ID: ${id}`
    }
    if (type === "HeadFrame") {
        return headFrameData.find(item => item.id === id)?.name || `ID: ${id}`
    }
    if (type === "HeadSculpture") {
        return headSculptureData.find(item => item.id === id)?.name || `ID: ${id}`
    }
    return resourceMap.get(id)?.name || `ID: ${id}`
}

/**
 * 获取奖品图标。
 * @param type 物品类型
 * @param id 物品 ID
 * @returns 图标路径
 */
function getPrizeIcon(type: LimitedPrizeType, id: number): string {
    if (type === "Char") {
        return LeveledChar.url(charMap.get(id)?.icon)
    }
    if (type === "Weapon") {
        return LeveledWeaponHelper.idToUrl(id)
    }
    if (type === "Skin") {
        const icon = skinMap.get(id)?.icon
        return icon ? resolveSkinIconUrl(icon) : "/imgs/webp/T_Head_Empty.webp"
    }
    if (type === "WeaponSkin") {
        const icon = weaponSkinData.find(item => item.id === id)?.icon
        return icon ? resolveSkinIconUrl(icon) : "/imgs/webp/T_Head_Empty.webp"
    }
    if (type === "CharAccessory") {
        const icon = charAccessoryData.find(item => item.id === id)?.icon
        return icon ? resolveSkinIconUrl(icon) : "/imgs/webp/T_Head_Empty.webp"
    }
    if (type === "WeaponAccessory") {
        const icon = weaponAccessoryData.find(item => item.id === id)?.icon
        return icon ? resolveSkinIconUrl(icon) : "/imgs/webp/T_Head_Empty.webp"
    }
    if (type === "HeadFrame") {
        const icon = headFrameData.find(item => item.id === id)?.icon
        return icon ? `/imgs/headframe/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
    if (type === "HeadSculpture") {
        const icon = headSculptureData.find(item => item.id === id)?.icon
        return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
    }
    const resource = resourceMap.get(id)
    return resource?.icon ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 抽取一个奖品。
 * @returns 奖励项
 */
function drawOnce(): RewardItem | null {
    const prizes = remainingPrizeEntries.value
    if (!prizes.length) {
        return null
    }

    const rule = currentCostRule.value
    const drawCost = rule ? (rule.CostResCount[Math.min(poolDrawCount.value, rule.CostResCount.length - 1)] ?? 0) : 0
    const total = prizes.reduce((sum, item) => sum + item.probability, 0)
    const roll = Math.random() * total
    let cursor = 0
    let selected = prizes[0]
    for (const prize of prizes) {
        cursor += prize.probability
        if (roll < cursor) {
            selected = prize
            break
        }
    }

    const reward: RewardItem = {
        id: selected.displayId,
        t: selected.type,
        p: selected.probability,
        c: selected.count,
        n: selected.name,
    }
    rewardHistory.value.unshift(reward)
    drawCount.value++
    totalCostSpent.value += drawCost
    poolDrawCount.value++
    const key = `${reward.t}-${reward.id}`
    drawStats.value[key] = (drawStats.value[key] || 0) + 1
    const selectedIndex = prizes.findIndex(item => item.id === selected.id && item.displayId === selected.displayId)
    selectedPrizeKey.value = getPrizeEntryKey(selected)

    if (selectedIndex === 0) {
        poolDrawCount.value = 0
        remainingPrizeEntries.value = prizeList.value.map(item => ({ ...item }))
        return reward
    }

    remainingPrizeEntries.value = prizes.filter(item => getPrizeEntryKey(item) !== getPrizeEntryKey(selected))
    return reward
}

/**
 * 批量抽取。
 * @param count 次数
 */
function drawMany(count: number): void {
    for (let index = 0; index < count; index++) {
        if (!drawOnce()) {
            break
        }
    }
}

/**
 * 开始自动抽取。
 */
function startAutoDraw(): void {
    if (isAutoDrawing.value) {
        return
    }
    isAutoDrawing.value = true
    autoDrawTimer.value = window.setInterval(() => {
        if (!drawOnce()) {
            stopAutoDraw()
        }
    }, 100)
}

/**
 * 停止自动抽取。
 */
function stopAutoDraw(): void {
    if (!isAutoDrawing.value) {
        return
    }
    isAutoDrawing.value = false
    if (autoDrawTimer.value) {
        window.clearInterval(autoDrawTimer.value)
        autoDrawTimer.value = null
    }
}

/**
 * 重置奖池模拟。
 */
function resetSimulation(): void {
    stopAutoDraw()
    drawCount.value = 0
    poolDrawCount.value = 0
    totalCostSpent.value = 0
    selectedPrizeKey.value = null
    rewardHistory.value = []
    drawStats.value = {}
    remainingPrizeEntries.value = prizeList.value.map(item => ({ ...item }))
}

watch(
    currentPool,
    () => {
        resetSimulation()
    },
    { immediate: true }
)

watch(
    () => props.eventId,
    () => {
        selectedPoolIndex.value = 0
    }
)
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="LIMITED PRIZE" :title="$t('limited-prize-simulator.title')">
            <template #trailing>
                <CopyID :id="eventId" />
            </template>
        </SectionHeader>

        <div v-if="poolIds.length" class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
                <button
                    v-for="(poolId, index) in poolIds"
                    :key="poolId"
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        selectedPoolIndex === index
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="selectedPoolIndex = index"
                >
                    奖池 {{ index + 1 }}
                </button>
                <span class="h-4 w-px shrink-0 bg-base-content/15" aria-hidden="true" />
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                        isAutoDrawing
                            ? 'border-base-content/20 text-base-content/60'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    :disabled="isAutoDrawing"
                    @click="drawOnce"
                >
                    抽 1 次
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                        isAutoDrawing
                            ? 'border-base-content/15 text-base-content/40'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    :disabled="isAutoDrawing"
                    @click="drawMany(8)"
                >
                    抽 8 次
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                    :class="
                        isAutoDrawing
                            ? 'border-error bg-error/10 font-semibold text-error'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="isAutoDrawing ? stopAutoDraw() : startAutoDraw()"
                >
                    {{ isAutoDrawing ? "停止" : "自动" }}
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-error/40 px-2 text-[11px] text-error/80 transition-colors duration-150 hover:border-error hover:bg-error/10 hover:text-error"
                    @click="resetSimulation"
                >
                    重置
                </button>
            </div>

            <div v-if="currentPool" class="space-y-2">
                <div class="text-[11px] tracking-wide text-base-content/55">奖品列表</div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    <div
                        v-for="(prize, index) in visiblePrizeList"
                        :key="`${prize.id}-${index}`"
                        class="flex items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200"
                        :class="
                            selectedPrizeKey === getPrizeEntryKey(prize)
                                ? 'border-primary bg-primary/10'
                                : prize.isDrawn
                                  ? 'opacity-50'
                                  : 'hover:border-primary/40'
                        "
                    >
                        <img :src="prize.icon" class="size-10 shrink-0 rounded-xs object-cover" :alt="prize.name" />
                        <div class="min-w-0 flex-1">
                            <div class="truncate text-sm font-medium text-base-content">{{ prize.name }}</div>
                            <div class="flex items-center gap-1 text-[11px] text-base-content/55">
                                <span>概率</span>
                                <span class="font-orbitron text-[13px] font-semibold text-primary"
                                    >{{ (prize.currentProbability / 100).toFixed(2) }}%</span
                                >
                                <span aria-hidden="true">·</span>
                                <span>数量</span>
                                <span class="font-orbitron text-[13px] font-semibold text-primary">{{ prize.count }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid gap-2 sm:grid-cols-2">
                <div class="space-y-1.5">
                    <div class="text-[11px] tracking-wide text-base-content/55">累计消耗</div>
                    <ResourceCostItem :name="costResourceId.toString()" :value="[totalCost, costResourceId, 'Resource']" />
                </div>
                <div class="grid content-start gap-2">
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-[11px] tracking-wide text-base-content/55">抽取次数</span>
                        <span class="font-orbitron text-[13px] font-semibold text-primary">{{ drawCount }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-[11px] tracking-wide text-base-content/55">出货统计</span>
                        <span class="font-orbitron text-[13px] font-semibold text-primary">{{
                            Object.keys(drawStats).length
                        }}</span>
                    </div>
                </div>
            </div>

            <div v-if="rewardHistory.length" class="space-y-2">
                <div class="text-[11px] tracking-wide text-base-content/55">最近结果</div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                    <ResourceCostItem
                        v-for="reward in aggregatedRewardHistory"
                        :key="`${reward.t}-${reward.id}`"
                        :name="reward.n || `ID: ${reward.id}`"
                        :value="[
                            reward.totalCount,
                            reward.id,
                            reward.t as
                                | 'Mod'
                                | 'Draft'
                                | 'Weapon'
                                | 'Char'
                                | 'CharAccessory'
                                | 'WeaponAccessory'
                                | 'Walnut'
                                | 'Resource'
                                | 'Skin'
                                | 'HeadSculpture'
                                | 'HeadFrame'
                                | 'Hair'
                                | 'WeaponSkin',
                        ]"
                    />
                </div>
            </div>
        </div>

        <div v-else class="py-1 text-sm text-base-content/55">没有找到对应活动奖池。</div>
    </section>
</template>
