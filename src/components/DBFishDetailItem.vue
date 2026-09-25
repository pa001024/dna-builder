<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { Fish, fish2SpotMap, fishingSpotMap, fishMap, resourceMap } from "@/data"
import { calculateFishPrice } from "@/utils/fish-utils"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"

const props = defineProps<{
    fish: Fish
}>()

const { t } = useTranslation()
const { gt } = useGameText()

/**
 * 出现时段枚举（1=上午 2=下午 3=夜晚）的中文原文。
 * 值走数据包原文对照表，展示时过 `gt` 即可得到当前语言。
 */
const APPEAR_NAMES: Record<number, string> = {
    1: "上午",
    2: "下午",
    3: "夜晚",
}

/**
 * 获取出现时间名称。
 *
 * ⚠️ 这些原文要**逐个**过 `gt` 取译文，不能先拼成「上午、下午、夜晚」再翻译——
 * 对照表的键是单词本身，拼出来的整句不在表里，会原样退回中文。
 * @param appear 出现时间数组 1=上午 2=下午 3=夜晚
 * @returns 以「、」连接的当前语言时段名
 */
function getAppearName(appear: number[]): string {
    return appear
        .map(t => APPEAR_NAMES[t])
        .filter(Boolean)
        .map(name => gt(name))
        .join("、")
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
 * 获取当前鱼所在的鱼池和权重信息。
 *
 * `spotName` 保留**游戏原文**，由模板过 `$t` 取译文；查不到鱼池时退回已翻译的占位文案。
 * @returns 鱼池条目（含名称原文与在池中的权重）
 */
const fishSpots = computed(() => {
    const spots = fish2SpotMap.get(props.fish.id) || []
    return spots.map(spotInfo => {
        const spot = fishingSpotMap.get(spotInfo.spotId)
        return {
            ...spotInfo,
            spotName: spot?.name || t("db-fish-detail.unknown_spot", { id: spotInfo.spotId }),
        }
    })
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Fish File
            </p>
            <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                <SRouterLink
                    :to="`/db/fish/${fish.id}`"
                    class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                >
                    {{ $t(fish.name) }}
                </SRouterLink>
                <CopyID :id="fish.id" />
                <span :class="getRarityBadgeClass(fish.rarity)">
                    {{ gt(getRarityName(fish.rarity)) }}
                </span>
            </div>
            <!-- 鱼图 -->
            <div class="relative mt-3 flex justify-center">
                <img :src="`/imgs/res/T_Fish_${fish.icon}.webp`" class="w-24 rounded-xs object-cover" />
            </div>
        </header>

        <!-- 基础信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="STATS" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">Lv.</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ fish.level }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t('db-fish-detail.length') }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">
                        {{ fish.length[0] }}-{{ fish.length[1] }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t('common.price') }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ fish.price[0] }}</span>
                </div>
            </div>
        </section>

        <!-- 描述 -->
        <section v-if="fishResource?.desc" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('resource.description')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/85">{{ gt(fishResource.desc) }}</div>
        </section>

        <!-- 背景 -->
        <section v-if="fishResource?.desc2" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BACKGROUND" :title="$t('resource.background')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/85">{{ gt(fishResource.desc2) }}</div>
        </section>

        <!-- 出现时间 / 变异概率 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="APPEARANCE" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t('db-fish-detail.appearance_time') }}</span>
                    <span class="text-sm text-base-content/90">{{ gt(getAppearName(fish.appear)) }}</span>
                </div>
                <div
                    v-if="fish.var && fish.varProb && fish.var.length > 0 && fish.varProb > 0"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t('db-fish-detail.mutation_rate') }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">
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
                <span class="ml-auto shrink-0 pl-2 font-orbitron text-[13px] font-semibold text-primary">
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
                    <SRouterLink :to="`/db/fishspot/${spot.spotId}`" class="truncate text-sm transition-colors duration-150 hover:text-primary">
                        {{ $t(spot.spotName) }}
                    </SRouterLink>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ spot.weight }}</span>
                </div>
            </div>
        </section>
    </div>
</template>
