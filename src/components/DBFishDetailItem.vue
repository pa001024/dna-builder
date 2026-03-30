<script lang="ts" setup>
import { computed } from "vue"
import { calculateFishPrice } from "@/utils/fish-utils"
import { Fish, fish2SpotMap, fishingSpotMap, fishMap } from "../data"

const props = defineProps<{
    fish: Fish
}>()

/**
 * 获取稀有度颜色
 * @param type 稀有度 1绿 2蓝 3紫 4金
 */
function getRarityColor(type: number): string {
    const colorMap: Record<number, string> = {
        1: "bg-green-200 text-green-800",
        2: "bg-blue-200 text-blue-800",
        3: "bg-purple-200 text-purple-800",
        4: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[type] || "bg-base-200 text-base-content"
}

/**
 * 获取稀有度名称
 * @param type 稀有度 1绿 2蓝 3紫 4金
 */
function getRarityName(type: number): string {
    const rarityMap: Record<number, string> = {
        1: "绿",
        2: "蓝",
        3: "紫",
        4: "金",
    }
    return rarityMap[type] || type.toString()
}

/**
 * 获取出现时间名称
 * @param appear 出现时间数组 1=上午 2=下午 3=夜晚
 */
function getAppearName(appear: number[]): string {
    const timeMap: Record<number, string> = {
        1: "上午",
        2: "下午",
        3: "夜晚",
    }
    return appear.map(t => timeMap[t]).join("、")
}

/**
 * 获取授渔以鱼
 * @param s2bId 授渔以鱼ID
 */
function getS2BFish(s2bId?: number): Fish | null {
    if (!s2bId) return null
    return fishMap.get(s2bId) || null
}

const s2bFish = computed(() => getS2BFish(props.fish.s2b))

/**
 * 获取当前鱼所在的鱼池和权重信息
 */
const fishSpots = computed(() => {
    const spots = fish2SpotMap.get(props.fish.id) || []
    // 转换为包含鱼池名称的对象
    return spots.map(spotInfo => {
        const spot = fishingSpotMap.get(spotInfo.spotId)
        return {
            ...spotInfo,
            spotName: spot?.name || `未知鱼池(${spotInfo.spotId})`,
        }
    })
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <SRouterLink :to="`/db/fish/${fish.id}`" class="text-lg font-bold link link-primary">
                {{ fish.name }}
            </SRouterLink>
            <span class="text-xs text-base-content/70">ID: {{ fish.id }}</span>
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded" :class="getRarityColor(fish.type)">
                    {{ getRarityName(fish.type) }}
                </span>
            </div>
        </div>

        <div class="flex justify-center items-center">
            <img :src="`/imgs/webp/T_Fish_${fish.icon}.webp`" class="w-24 object-cover rounded" />
        </div>

        <div class="flex flex-wrap gap-2 text-sm opacity-70">
            <span>Lv. {{ fish.level }}</span>
            <span>长度: {{ fish.length[0] }}-{{ fish.length[1] }}</span>
            <span>价格: {{ fish.price[0] }}</span>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">出现时间</div>
            <div class="text-sm">{{ getAppearName(fish.appear) }}</div>
        </div>

        <div v-if="fish.var && fish.varProb && fish.var.length > 0 && fish.varProb > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">变异概率</div>
            <div class="text-sm">{{ (fish.varProb * 100).toFixed(0) }}%</div>
        </div>

        <div v-if="s2bFish" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">授渔以鱼</div>
            <div class="flex items-center gap-2">
                <img :src="`/imgs/webp/T_Fish_${s2bFish.icon}.webp`" class="w-10 h-10 object-cover rounded" />
                <SRouterLink :to="`/db/fish/${s2bFish.id}`" class="text-sm link link-primary">
                    {{ s2bFish.name }}
                </SRouterLink>
                <span class="text-xs text-base-content/70">价格: {{ calculateFishPrice(s2bFish).price }}</span>
            </div>
        </div>

        <div v-if="fishSpots.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">出现鱼池及权重</div>
            <div class="space-y-2">
                <div v-for="spot in fishSpots" :key="spot.spotId" class="flex items-center justify-between">
                    <SRouterLink :to="`/fish/${spot.spotId}`" class="text-sm link link-primary">
                        {{ spot.spotName }}
                    </SRouterLink>
                    <span class="text-sm">{{ spot.weight }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
