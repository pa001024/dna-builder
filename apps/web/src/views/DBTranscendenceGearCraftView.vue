<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { conditionsMap } from "@/data/d/condition.data"
import { breakdowns, crafts, rarities } from "@/data/d/dnaseasonequip.data"
import { getRarityName, getRaritySwatchClass } from "@/utils/rarity-utils"
import { resolveCraftGrowth } from "@/utils/transcendence-craft"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { getCraftLabelKey } from "@/utils/transcendence-gear"

const selectedCraftId = useSearchParam<number>("id", 0)

/**
 * 官方 craft 页签图标（游戏 `CraftTabIcons`）：纯白 alpha，用 mask + currentColor 着色，深浅主题都跟随正文色。
 * 贴图字形只占画布的一部分（实测 alpha 包围盒：Sell 48%×59%、Punch 73%×57%、FinalForge 73%×56%、
 * Enchant 71%×60%、Temper 72%×59%），按 contain 直接铺到 16px 盒子里只剩约 11×9px 细笔画，
 * 肉眼几乎不可辨。这里按各自包围盒放大 mask（单值百分比保持等比、取 94% 填充以免贴边裁切）。
 */
const CRAFT_TAB_ICONS = {
    Sell: { url: "/imgs/webp/T_Tab_Season_Craft_Sell.webp", maskSize: "158%" },
    Punch: { url: "/imgs/webp/T_Tab_Season_Craft_Punch.webp", maskSize: "128%" },
    FinalForge: { url: "/imgs/webp/T_Tab_Season_Craft_FinalForge.webp", maskSize: "128%" },
    Enchant: { url: "/imgs/webp/T_Tab_Season_Craft_Enchant.webp", maskSize: "132%" },
    Temper: { url: "/imgs/webp/T_Tab_Season_Craft_Temper.webp", maskSize: "131%" },
} as const

type CraftTabIconName = keyof typeof CRAFT_TAB_ICONS

/** CraftId → 官方页签图标：1/2 精锻/最终精锻 → FinalForge，3 淬炼 → Temper，4 附魔 → Enchant，5/6/7 → Punch */
const CRAFT_ID_ICON_NAME: Record<number, CraftTabIconName> = {
    1: "FinalForge",
    2: "FinalForge",
    3: "Temper",
    4: "Enchant",
    5: "Punch",
    6: "Punch",
    7: "Punch",
}

/**
 * 官方页签图标的 mask 样式。
 * @param name 图标名（对应游戏 `CraftTabIcons` 的键）
 */
function craftIconMaskStyle(name: CraftTabIconName) {
    const { url, maskSize } = CRAFT_TAB_ICONS[name]

    return {
        maskImage: `url("${url}")`,
        maskSize,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: `url("${url}")`,
        WebkitMaskSize: maskSize,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
    }
}

const { gt } = useGameText()

const rarityNameMap = new Map(rarities.map(rarity => [rarity.id, rarity.name]))

const craftRows = computed(() =>
    crafts.map(craft => ({
        id: craft.id,
        iconName: CRAFT_ID_ICON_NAME[craft.id] ?? "FinalForge",
        labelKey: getCraftLabelKey(craft.id),
        /** 游戏 TextMap 原文：装备改造面板标题与机制说明（缺失时不渲染） */
        title: cleanGameMarkup(gt(craft.title)),
        desc: cleanGameMarkup(gt(craft.desc)),
        condition: craft.condition ? cleanGameMarkup(gt(conditionsMap[craft.condition]?.remark ?? `#${craft.condition}`)) : "",
        cost: craft.costItems ?? {},
        priceId: craft.costPriceId,
        priceCount: craft.costPriceCount,
        hasCost: Boolean(craft.costItems || craft.costPriceId),
        maxCount: craft.maxCount,
        growth: resolveCraftGrowth(craft.enchantGrowthFactor, craft.enchantGrowthMaxCount),
    }))
)

const breakdownRows = computed(() =>
    breakdowns.map(row => ({
        rarity: row.rarity,
        rarityLabel: row.rarity > 6 ? getRarityName(6) : getRarityName(row.rarity),
        rarityName: gt(rarityNameMap.get(row.rarity) ?? ""),
        cost: Object.fromEntries(row.itemIds.map((itemId, index) => [String(itemId), row.itemCounts[index] ?? 0])),
        priceId: row.priceId,
        price: row.price,
        tierCount: row.tierIds.length,
        tierRange: row.tierIds.length ? `${row.tierIds[0]}–${row.tierIds[row.tierIds.length - 1]}` : "",
    }))
)

useInitialScrollToSelectedItem({ selectedSelector: ".dbtg-craft-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea class="flex-1">
            <div class="space-y-3 p-3 sm:p-4">
                <!-- 装备改造 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="CRAFT" :title="$t('db-transcendence.overview.crafts')" :count="craftRows.length">
                        <template #title>
                            <span
                                class="inline-block size-5 shrink-0 bg-current text-base-content"
                                aria-hidden="true"
                                data-craft-icon
                                :style="craftIconMaskStyle('FinalForge')"
                            />
                        </template>
                    </SectionHeader>
                    <div v-if="craftRows.length" class="space-y-1.5">
                        <article
                            v-for="row in craftRows"
                            :key="row.id"
                            class="cursor-pointer rounded-xs border p-2.5 transition-colors duration-150"
                            :class="selectedCraftId === row.id ? 'dbtg-craft-active border-primary/70 bg-primary/10' : 'border-base-content/10 bg-base-content/3 hover:border-primary/40'"
                            :data-craft-row-id="row.id"
                            @click="selectedCraftId = row.id"
                        >
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span
                                    class="inline-block size-4 shrink-0 bg-current text-base-content/85"
                                    aria-hidden="true"
                                    :data-craft-type-icon="row.id"
                                    :style="craftIconMaskStyle(row.iconName)"
                                />
                                <span class="text-[13px] font-semibold text-base-content/85">{{ row.labelKey ? $t(row.labelKey) : `#${row.id}` }}</span>
                                <CopyID :id="row.id" />
                                <span v-if="row.maxCount !== undefined" class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/50">
                                    {{ $t("db-transcendence.overview.craft_limit", { count: row.maxCount }) }}
                                </span>
                            </div>
                            <p v-if="row.condition" class="mt-1 text-[11px] text-base-content/45">
                                {{ $t("db-transcendence.gear.craft_condition") }} · {{ row.condition }}
                            </p>
                            <p v-if="row.growth" class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-base-content/45" data-craft-growth>
                                <span>{{ $t("db-transcendence.overview.craft_growth", { first: row.growth.firstMultiplier, factor: row.growth.factor, cap: row.growth.capMultiplier, capAt: row.growth.capAt }) }}</span>
                                <span class="rounded-xs border border-base-content/15 px-1 py-px text-[10px] text-base-content/35">{{ $t("db-transcendence.overview.craft_growth_note") }}</span>
                            </p>
                            <div class="mt-2">
                                <div v-if="row.hasCost" class="flex flex-wrap items-center gap-1.5">
                                    <ResourceCostItem v-for="(count, id) in row.cost" :key="id" :value="[count, id, 'Resource']" mini />
                                    <ResourceCostItem
                                        v-if="row.priceId !== undefined"
                                        :value="[row.priceCount ?? 1, row.priceId, 'Resource']"
                                        mini
                                    />
                                </div>
                                <p v-else class="text-[11px] text-base-content/40">{{ $t("db-transcendence.gear.craft_no_cost") }}</p>
                            </div>
                            <div v-if="row.title || row.desc" class="mt-2 border-t border-base-content/10 pt-2">
                                <p class="text-[11px] leading-relaxed text-base-content/55" :data-craft-id="row.id">
                                    <span v-if="row.title" class="font-medium text-base-content/75">{{ row.title }}</span>
                                    <span v-if="row.title && row.desc" class="mx-1 text-base-content/30">·</span>
                                    <span v-if="row.desc" data-craft-desc>{{ row.desc }}</span>
                                </p>
                            </div>
                        </article>
                    </div>
                    <p v-else class="py-6 text-center text-[12px] text-base-content/45">{{ $t("common.no_data") }}</p>
                </section>

                <!-- 分解 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="BREAKDOWN" :title="$t('db-transcendence.overview.breakdown')" :count="breakdownRows.length" />
                    <div v-if="breakdownRows.length" class="space-y-1.5">
                        <article v-for="row in breakdownRows" :key="row.rarity" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span :class="getRaritySwatchClass(row.rarity > 6 ? 6 : row.rarity)" />
                                <span class="text-[13px] font-semibold text-base-content/85">{{ row.rarityName || row.rarityLabel }}</span>
                                <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/50">
                                    {{ $t("db-transcendence.gear.breakdown_tiers", { count: row.tierCount }) }}
                                </span>
                                <span v-if="row.tierRange" class="rounded-xs border border-base-content/15 px-1.5 py-0.5 font-mono text-[10px] text-base-content/40">{{ row.tierRange }}</span>
                            </div>
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                                <span class="text-[10px] tracking-wide text-base-content/40">{{ $t("db-transcendence.gear.breakdown_items") }}</span>
                                <span class="flex flex-wrap items-center gap-1.5">
                                    <ResourceCostItem v-for="(count, id) in row.cost" :key="id" :value="[count, id, 'Resource']" mini />
                                    <ResourceCostItem v-if="row.priceId !== undefined" :value="[row.price ?? 1, row.priceId, 'Resource']" mini />
                                </span>
                            </div>
                        </article>
                    </div>
                    <p v-else class="py-6 text-center text-[12px] text-base-content/45">{{ $t("common.no_data") }}</p>
                </section>
            </div>
        </ScrollArea>

        <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
            <p class="text-[11px] tracking-wide text-base-content/50">
                <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ craftRows.length }}</b>
                {{ $t("db-transcendence.gear.craft_count") }} ·
                <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ breakdownRows.length }}</b>
                {{ $t("db-transcendence.gear.breakdown_count") }}
            </p>
        </div>
    </div>
</template>
