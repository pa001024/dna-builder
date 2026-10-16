<script lang="ts" setup>
import { computed } from "vue"
import { walnutMap } from "@/data/d"
import type { Walnut } from "@/data/d/walnut.data"
import type { ModWalnutSourceInfo } from "@/utils/resource-source"
import { getWalnutProduct, type WalnutProduct } from "@/utils/walnut-product"

const props = defineProps<{
    walnutSources: ModWalnutSourceInfo[]
}>()

interface DisplayWalnutSource extends ModWalnutSourceInfo {
    walnut: Walnut
    product: WalnutProduct
    /** 期望开函次数展示文本（不可产出时为空） */
    expectedText: string
}

/**
 * 按密函 ID 补全密函数据与成品图标信息，查不到的来源直接丢弃。
 */
const displayWalnutSources = computed<DisplayWalnutSource[]>(() => {
    return props.walnutSources
        .map(source => {
            const walnut = walnutMap.get(source.walnutId) ?? null
            if (!walnut) {
                return null
            }
            return {
                ...source,
                walnut,
                product: getWalnutProduct(walnut),
                expectedText: Number.isFinite(source.expectedOpens) ? source.expectedOpens.toFixed(2) : "",
            }
        })
        .filter((source): source is DisplayWalnutSource => source !== null)
})
</script>

<template>
    <div v-if="displayWalnutSources.length > 0" class="space-y-2">
        <div class="text-[11px] tracking-wide text-base-content/55">{{ $t("密函") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in displayWalnutSources"
                :key="source.key"
                class="group flex w-full items-center gap-2.5 rounded-xs border border-base-content/15 bg-base-content/4 p-2 transition-colors duration-200 hover:border-primary/50 hover:bg-base-content/6"
            >
                <div
                    class="relative size-11 shrink-0 overflow-hidden rounded-xs bg-linear-15"
                    :class="source.product.bg"
                >
                    <img
                        :src="source.product.icon"
                        :alt="source.walnut.名称"
                        class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink :to="`/db/walnut/${source.walnut.id}`" class="hover:underline">
                                {{ $t(source.walnut.名称) }}
                            </SRouterLink>
                        </h4>
                        <span
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            {{ $t(source.tierKey) }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span
                            class="shrink-0 rounded-xs bg-yellow-500/15 px-1 py-px font-mono text-[8px] font-semibold tracking-[0.15em] uppercase text-yellow-400"
                        >
                            WALNUT
                        </span>
                        <span v-if="source.isDraft" class="shrink-0 truncate">{{ $t("UI_FORGING_BLUEPRINT") }}</span>
                        <span v-if="source.expectedText" class="truncate">{{
                            $t("walnut-source.expected_opens", { n: source.expectedText })
                        }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
