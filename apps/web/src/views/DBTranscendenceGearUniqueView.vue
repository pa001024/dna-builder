<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import type { FilterSelectOption } from "@/components/FilterSelect.vue"
import { useGameText } from "@/composables/useGameText"
import { useSearchParam } from "@/composables/useSearchParam"
import { charMap } from "@/data/d"
import { affixes, rarities, slots, uniqueEquips } from "@/data/d/dnaseasonequip.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import {
    ASSIST_SLOT_IDS,
    getAffixEffectText,
    getAffixModeledBadge,
    getAffixModeledSummary,
    getAffixSearchText,
    getAffixSummaryParts,
    getAffixValueHint,
    getPlanLabelKey,
    getSlotName,
    isEffectOnlyAffix,
} from "@/utils/transcendence-gear"

/** 唯一装卡片固定主轴尺寸（px） */
const UNIQUE_CARD_HEIGHT = 76

const { gt } = useGameText()
const { t } = useTranslation()

const route = useRoute()

const searchKeyword = useSearchParam<string>("kw", "")
const selectedUniqueId = useSearchParam<number>("id", 0)
const slotFilter = ref(0)
const charFilter = ref(0)

const affixMap = new Map(affixes.map(affix => [affix.id, affix]))

/** 唯一装品质固定为暗金（rarity 10），名称取数据表避免前端硬编码 */
const uniqueRarityName = computed(() => {
    const rarity = rarities.find(item => item.id === 10)

    return rarity ? gt(rarity.name) : ""
})

/** 同一装备 id 下重复 affixId 只保留一条（当前数据每件 1 条，保留去重逻辑防上游漂移） */
const uniqueRows = computed(() => {
    const seen = new Set<string>()

    return uniqueEquips
        .filter(equip => {
            const key = `${equip.id}:${equip.affixId}`

            if (seen.has(key)) {
                return false
            }

            seen.add(key)
            return true
        })
        .map(equip => {
            const affix = affixMap.get(equip.affixId)
            const effect = affix ? getAffixEffectText(affix, gt) : ""
            const summary = affix
                ? effect
                    ? `${t("common.effect_label")}${effect}`
                    : getAffixModeledSummary(affix, t, gt) || getAffixSummaryParts(affix).map(part => gt(part)).join(" · ")
                : ""
            const valueHint = affix ? getAffixValueHint(affix, t, gt) : ""
            const modeledBadge = affix && isEffectOnlyAffix(affix) ? (getAffixModeledBadge(affix.id) ?? "") : ""

            return {
                equip,
                affix,
                // 界面展示名与检索名分开：检索要同时覆盖原文与官方译名
                nameText: gt(equip.name),
                slotName: gt(getSlotName(equip.slot)) || `#${equip.slot}`,
                assist: ASSIST_SLOT_IDS.has(equip.slot),
                planKey: affix ? getPlanLabelKey(affix.plan) : "",
                summary: cleanGameMarkup(summary),
                valueHint,
                // 效果词条数值走手写建模值；徽章按 partial / exact 区分
                modeledHint: modeledBadge,
                // 检索正文：属性 / 效果描述（原文 + 官方译名），供关键词匹配
                searchText: affix ? getAffixSearchText(affix, gt) : "",
                // 适用角色 id（上游精确 join），驱动角色筛选
                charIds: affix?.charIds ?? [],
            }
        })
})

/** 槽型筛选项：11 个槽型全部列出，槽 10/11 显示 0 便于确认空态 */
const slotRows = computed(() =>
    slots.map(slot => ({
        id: slot.id,
        name: gt(slot.name),
        count: uniqueRows.value.filter(row => row.equip.slot === slot.id).length,
    }))
)

const slotOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...slotRows.value.map(slot => ({ value: slot.id, label: slot.name, count: slot.count })),
])

/** 适用角色筛选项：取词条 charIds 命中的唯一装数，按角色名排序 */
const charRows = computed(() => {
    const counts = new Map<number, number>()

    for (const row of uniqueRows.value) {
        for (const charId of row.charIds) {
            counts.set(charId, (counts.get(charId) ?? 0) + 1)
        }
    }

    return [...counts.entries()]
        .map(([id, count]) => {
            const char = charMap.get(id)

            return { id, name: char ? gt(char.名称) : `#${id}`, count }
        })
        .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
})

const charOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...charRows.value.map(char => ({ value: char.id, label: char.name, count: char.count })),
])

const filteredRows = computed(() => {
    const keyword = searchKeyword.value.trim()

    return uniqueRows.value.filter(row => {
        if (slotFilter.value && row.equip.slot !== slotFilter.value) {
            return false
        }

        if (charFilter.value && !row.charIds.includes(charFilter.value)) {
            return false
        }

        if (!keyword) {
            return true
        }

        if (`${row.equip.id}`.includes(keyword) || row.equip.name.includes(keyword) || `${row.equip.affixId}`.includes(keyword)) {
            return true
        }

        // 名称 / 拼音之外，再按词条正文（属性名、效果描述、建模属性名）匹配；原文与官方译名都收
        if (row.nameText.includes(keyword) || row.searchText.includes(keyword)) {
            return true
        }

        return matchPinyin(`${row.equip.name} ${row.nameText} ${row.searchText}`, keyword).match
    })
})

const selectedRow = computed(() => uniqueRows.value.find(row => row.equip.id === selectedUniqueId.value) ?? null)
const selectedAffix = computed(() => (selectedRow.value ? selectedRow.value.affix : null))

/** query 是否带 id（含脏值 / 0）：用于区分「深链选中」与普通进入 */
function hasRawIdParam(): boolean {
    const raw = route.query.id
    const value = Array.isArray(raw) ? raw[0] : raw

    return value !== undefined && value !== null && value !== ""
}

/** 脏值 / 0 / 不存在的 id 一律清回默认值，避免右栏空白但 URL 仍带 id */
watch(
    selectedUniqueId,
    id => {
        if (!hasRawIdParam()) {
            return
        }

        if (id > 0 && uniqueEquips.some(equip => equip.id === id)) {
            return
        }

        selectedUniqueId.value = 0
    },
    { immediate: true }
)

const selectedIndex = computed(() => {
    if (!selectedUniqueId.value) {
        return null
    }

    const index = filteredRows.value.findIndex(row => row.equip.id === selectedUniqueId.value)

    return index === -1 ? null : index
})
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedRow)" @collapse="selectedUniqueId = 0">
            <template #master>
                <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedRow }">
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-transcendence.gear.search_unique')"
                            :count="filteredRows.length"
                        />
                        <div class="mt-3 flex flex-wrap gap-1.5">
                            <FilterSelect
                                v-model="slotFilter"
                                :options="slotOptions"
                                :label="$t('db-transcendence.gear.filter_slot')"
                                :clear-value="0"
                                :clear-title="$t('common.clear')"
                            />
                            <FilterSelect
                                v-model="charFilter"
                                :options="charOptions"
                                :label="$t('db-transcendence.gear.filter_char')"
                                :clear-value="0"
                                :clear-title="$t('common.clear')"
                            />
                        </div>
                    </div>

                    <div v-if="!filteredRows.length" class="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
                        <p class="text-[12px] text-base-content/45">{{ slotFilter ? $t("db-transcendence.gear.unique_empty") : $t("db-transcendence.gear.no_match") }}</p>
                    </div>
                    <VirtualList
                        v-else
                        class="flex-1"
                        :items="filteredRows"
                        :item-height="UNIQUE_CARD_HEIGHT"
                        :item-key="row => row.equip.id"
                        :active-index="selectedIndex"
                        v-slot="{ item: row, index, animate, rowHeight }"
                    >
                        <article
                            class="group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-xs border p-2.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                            :class="[selectedUniqueId === row.equip.id ? 'dbtg-unique-active border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/60 hover:border-primary/50', animate ? 'animate-ef-rise motion-reduce:animate-none' : '']"
                            :style="{ minHeight: `${rowHeight}px`, animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectedUniqueId = row.equip.id"
                        >
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedUniqueId === row.equip.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <ImageFallback :src="`/imgs/res/${row.equip.icon}.webp`" :alt="gt(row.equip.name)" class="size-10 shrink-0 overflow-hidden rounded-xs">
                                <span class="flex size-10 items-center justify-center rounded-xs border border-base-content/15 bg-base-content/5 text-[12px] text-base-content/45">
                                    {{ row.equip.name.slice(0, 1) }}
                                </span>
                            </ImageFallback>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-baseline gap-2">
                                    <button
                                        type="button"
                                        data-row-title
                                        class="min-w-0 cursor-pointer truncate text-left text-[13px] font-semibold transition-colors duration-150 group-hover:text-primary"
                                        :class="{ 'text-primary': selectedUniqueId === row.equip.id }"
                                        @click.stop="selectedUniqueId = row.equip.id"
                                    >
                                        {{ gt(row.equip.name) }}
                                    </button>
                                    <span class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 text-base-content/45">{{ row.slotName }}</span>
                                    <span v-if="uniqueRarityName" class="shrink-0 rounded-xs border border-warning/30 px-1 text-[10px] leading-4 text-warning/80">{{ uniqueRarityName }}</span>
                                    <span v-if="row.assist" class="shrink-0 rounded-xs border border-warning/30 px-1 text-[10px] leading-4 text-warning/80">{{ $t("db-transcendence.gear.assist_only") }}</span>
                                    <span class="ml-auto shrink-0"><CopyID :id="row.equip.id" /></span>
                                </div>
                                <p class="mt-1 truncate text-[11px] text-base-content/55">{{ row.summary }}</p>
                                <p v-if="row.affix" class="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-base-content/35">
                                    <span>{{ $t(row.planKey) }}</span>
                                    <CopyID :id="row.equip.affixId" />
                                    <span
                                        v-if="row.modeledHint === 'partial'"
                                        class="shrink-0 rounded-xs border border-warning/30 px-1 text-[10px] leading-4 text-warning/70"
                                        :title="$t('db-transcendence.gear.modeled_tag')"
                                        data-modeled-hint
                                    >
                                        {{ $t("db-transcendence.gear.mapping_handwritten") }}
                                    </span>
                                    <span
                                        v-else-if="row.modeledHint === 'exact'"
                                        class="shrink-0 rounded-xs border border-success/30 px-1 text-[10px] leading-4 text-success/70"
                                        data-modeled-hint
                                    >
                                        {{ $t("db-transcendence.gear.modeled_exact") }}
                                    </span>
                                    <span v-if="row.valueHint" class="font-orbitron text-primary/70">{{ row.valueHint }}</span>
                                </p>
                            </div>
                        </article>
                    </VirtualList>

                    <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredRows.length }}</b>
                            {{ $t("db-transcendence.gear.unique_count") }}
                        </p>
                        <p v-if="!selectedRow" class="text-[11px] text-base-content/40">{{ $t("db-transcendence.gear.select_hint") }}</p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedRow" class="min-h-0 min-w-0 flex-1">
                    <DBTranscendenceGearDetailItem v-if="selectedAffix" :key="selectedRow.equip.id" :affix="selectedAffix" :unique="selectedRow.equip" />
                    <div v-else class="p-6 text-center text-[12px] text-base-content/45">
                        {{ $t("db-transcendence.gear.unknown_entity", { id: selectedRow.equip.affixId }) }}
                    </div>
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
