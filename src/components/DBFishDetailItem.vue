<script lang="ts" setup>
import { computed } from "vue"
import { Fish, fish2SpotMap, fishingSpotMap, fishMap, resourceMap } from "@/data"
import { calculateFishPrice } from "@/utils/fish-utils"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"

const props = defineProps<{
    fish: Fish
}>()

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
 * 获取鱼对应的资源信息
 */
const fishResource = computed(() => resourceMap.get(props.fish.rid) || null)

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
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 档案头：纸面 + primary 强调线 -->
        <header class="border-b-2 border-primary pb-3">
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Fish File
            </p>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SRouterLink
                    :to="`/db/fish/${fish.id}`"
                    class="truncate text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary"
                >
                    {{ $t(fish.name) }}
                </SRouterLink>
                <CopyID :id="fish.id" />
                <span :class="getRarityBadgeClass(fish.rarity)">
                    {{ getRarityName(fish.rarity) }}
                </span>
            </div>
            <!-- 鱼图 -->
            <div class="mt-3 flex justify-center">
                <img :src="`/imgs/res/T_Fish_${fish.icon}.webp`" class="w-24 rounded-xs object-cover" />
            </div>
        </header>

        <!-- 基础信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="STATS" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">Lv.</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ fish.level }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">长度</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ fish.length[0] }}-{{ fish.length[1] }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">价格</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ fish.price[0] }}</span>
                </div>
            </div>
        </section>

        <!-- 描述 -->
        <section v-if="fishResource?.desc" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('resource.description')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/85">{{ fishResource.desc }}</div>
        </section>

        <!-- 背景 -->
        <section v-if="fishResource?.desc2" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BACKGROUND" :title="$t('resource.background')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/85">{{ fishResource.desc2 }}</div>
        </section>

        <!-- 出现时间 / 变异概率 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="APPEARANCE" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">出现时间</span>
                    <span class="text-sm text-base-content/90">{{ getAppearName(fish.appear) }}</span>
                </div>
                <div
                    v-if="fish.var && fish.varProb && fish.var.length > 0 && fish.varProb > 0"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">变异概率</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ (fish.varProb * 100).toFixed(0) }}%
                    </span>
                </div>
            </div>
        </section>

        <!-- 授渔以鱼 -->
        <section v-if="s2bFish" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TRANSFORM" />
            <div class="flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <img :src="`/imgs/res/T_Fish_${s2bFish.icon}.webp`" class="size-10 shrink-0 rounded-xs object-cover" />
                <SRouterLink
                    :to="`/db/fish/${s2bFish.id}`"
                    class="truncate text-sm font-semibold transition-colors duration-150 hover:text-primary"
                >
                    {{ $t(s2bFish.name) }}
                </SRouterLink>
                <span class="ml-auto shrink-0 pl-2 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                    {{ calculateFishPrice(s2bFish).price }}
                </span>
            </div>
        </section>

        <!-- 出现鱼池及权重 -->
        <section v-if="fishSpots.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SPOTS" />
            <div class="space-y-1.5">
                <div
                    v-for="spot in fishSpots"
                    :key="spot.spotId"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <SRouterLink :to="`/fish/${spot.spotId}`" class="truncate text-sm transition-colors duration-150 hover:text-primary">
                        {{ spot.spotName }}
                    </SRouterLink>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ spot.weight }}</span>
                </div>
            </div>
        </section>
    </div>
</template>
