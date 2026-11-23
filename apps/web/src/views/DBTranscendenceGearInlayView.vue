<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import type { FilterSelectOption } from "@/components/FilterSelect.vue"
import { useGameText } from "@/composables/useGameText"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { resourceMap } from "@/data/d"
import { affixes, inlays } from "@/data/d/dnaseasonequip.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { getAffixSearchText, getAffixSummaryParts, getAffixValueHint, getSlotName } from "@/utils/transcendence-gear"

const { gt } = useGameText()
const { t } = useTranslation()

const searchKeyword = useSearchParam<string>("kw", "")
const selectedInlayId = useSearchParam<number>("id", 0)
const slotFilter = ref(0)

const affixMap = new Map(affixes.map(affix => [affix.id, affix]))

/** 镶嵌物 → 资源名/图标 + 词缀组；引用缺失时降级为裸 id */
const inlayRows = computed(() =>
    inlays.map(inlay => {
        const resource = resourceMap.get(inlay.id)

        return {
            id: inlay.id,
            name: resource ? gt(resource.name) : `#${inlay.id}`,
            icon: resource ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp",
            rarity: resource?.rarity ?? 1,
            desc: resource ? cleanGameMarkup(gt(resource.desc)) : "",
            breakdownCost: Object.fromEntries(inlay.breakdown.itemIds.map((itemId, index) => [String(itemId), inlay.breakdown.itemCounts[index] ?? 0])),
            breakdownPriceId: inlay.breakdown.priceId,
            breakdownPrice: inlay.breakdown.price,
            affixes: Object.entries(inlay.affixIdsBySlot).map(([affixId, slotIds]) => {
                const affix = affixMap.get(Number(affixId))

                return {
                    id: Number(affixId),
                    summary: affix ? cleanGameMarkup(getAffixSummaryParts(affix).map(part => gt(part)).join(" · ")) : `#${affixId}`,
                    searchText: affix ? getAffixSearchText(affix, gt) : "",
                    valueHint: affix ? getAffixValueHint(affix, t, gt) : "",
                    slotIds,
                    slotNames: slotIds.map(slotId => gt(getSlotName(slotId))).join(" / "),
                    missing: !affix,
                }
            }),
        }
    })
)

const inlaySlotIds = computed(() => [...new Set(inlays.flatMap(inlay => Object.values(inlay.affixIdsBySlot).flat()))].sort((left, right) => left - right))

const slotOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...inlaySlotIds.value.map(slotId => ({ value: slotId, label: gt(getSlotName(slotId)) })),
])

const filteredRows = computed(() => {
    const keyword = searchKeyword.value.trim()

    return inlayRows.value
        .filter(row => {
            if (slotFilter.value && !row.affixes.some(group => group.slotIds.includes(slotFilter.value))) {
                return false
            }

            if (!keyword) {
                return true
            }

            if (`${row.id}`.includes(keyword) || row.name.includes(keyword) || row.desc.includes(keyword)) {
                return true
            }

            if (row.affixes.some(group => group.searchText.includes(keyword) || group.summary.includes(keyword) || `${group.id}`.includes(keyword))) {
                return true
            }

            // 名称 / 描述 / 词缀摘要的拼音兜底，与唯一装同口径
            return (
                matchPinyin(row.name, keyword).match ||
                matchPinyin(row.desc, keyword).match ||
                row.affixes.some(group => matchPinyin(group.summary, keyword).match)
            )
        })
        .sort((left, right) => left.id - right.id)
})

useInitialScrollToSelectedItem({ selectedSelector: ".dbtg-inlay-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
            <DbSearchBox v-model="searchKeyword" :placeholder="$t('db-transcendence.gear.search_inlay')" :count="filteredRows.length" />
            <div class="mt-3 flex flex-wrap gap-1.5">
                <FilterSelect
                    v-model="slotFilter"
                    :options="slotOptions"
                    :label="$t('db-transcendence.gear.filter_slot')"
                    :clear-value="0"
                    :clear-title="$t('common.clear')"
                />
            </div>
        </div>

        <ScrollArea class="flex-1">
            <div class="p-3 sm:p-4">
                <div v-if="!filteredRows.length" class="py-8 text-center text-[12px] text-base-content/45">{{ $t("db-transcendence.gear.no_match") }}</div>
                <div v-else class="grid gap-2 lg:grid-cols-2">
                    <article
                        v-for="row in filteredRows"
                        :key="row.id"
                        class="group relative cursor-pointer overflow-hidden rounded-xs border p-3 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5"
                        :class="selectedInlayId === row.id ? 'dbtg-inlay-active border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'"
                        @click="selectedInlayId = row.id"
                    >
                        <div class="flex items-start gap-2.5">
                            <ImageFallback :src="row.icon" :alt="row.name" class="size-10 shrink-0 overflow-hidden rounded-xs">
                                <span class="size-10 shrink-0 rounded-xs" :class="getRarityGradientClass(row.rarity)" />
                            </ImageFallback>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-baseline gap-2">
                                    <SRouterLink
                                        :to="`/db/resource/${row.id}`"
                                        stop
                                        class="truncate text-[13px] font-semibold text-base-content/85 transition-colors duration-150 hover:text-primary"
                                    >
                                        {{ row.name }}
                                    </SRouterLink>
                                    <span class="ml-auto shrink-0"><CopyID :id="row.id" /></span>
                                </div>
                                <p v-if="row.desc" class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-base-content/50">{{ row.desc }}</p>
                            </div>
                        </div>

                        <div class="mt-2 space-y-1">
                            <p class="text-[10px] tracking-wide text-base-content/40">{{ $t("db-transcendence.gear.inlay_affixes") }}</p>
                            <div
                                v-for="group in row.affixes"
                                :key="group.id"
                                class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5"
                            >
                                <span class="min-w-0 truncate text-[11px] text-base-content/70">{{ group.summary }}</span>
                                <span v-if="group.valueHint" class="font-orbitron text-[10px] text-primary/70">{{ group.valueHint }}</span>
                                <span class="text-[10px] text-base-content/40">{{ group.slotNames }}</span>
                                <SRouterLink :to="`/db/transcendence/gear/affix?id=${group.id}`" stop class="btn btn-xs ml-auto whitespace-nowrap">
                                    {{ $t("db-transcendence.gear.open_affix") }}
                                </SRouterLink>
                            </div>
                        </div>

                        <div class="mt-2 flex flex-wrap items-center gap-2">
                            <span class="text-[10px] tracking-wide text-base-content/40">{{ $t("db-transcendence.gear.inlay_breakdown") }}</span>
                            <span class="flex flex-wrap items-center gap-1.5">
                                <ResourceCostItem v-for="(count, id) in row.breakdownCost" :key="id" :value="[count, id, 'Resource']" mini />
                                <ResourceCostItem
                                    v-if="row.breakdownPriceId !== undefined"
                                    :value="[row.breakdownPrice ?? 1, row.breakdownPriceId, 'Resource']"
                                    mini
                                />
                            </span>
                        </div>
                    </article>
                </div>
            </div>
        </ScrollArea>

        <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
            <p class="text-[11px] tracking-wide text-base-content/50">
                {{ $t("common.total_count") }}
                <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredRows.length }}</b>
                {{ $t("db-transcendence.gear.inlay_count") }}
            </p>
        </div>
    </div>
</template>
