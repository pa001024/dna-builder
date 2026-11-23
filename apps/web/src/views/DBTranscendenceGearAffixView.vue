<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import type { FilterSelectOption } from "@/components/FilterSelect.vue"
import { useGameText } from "@/composables/useGameText"
import { useSearchParam } from "@/composables/useSearchParam"
import type { DnaSeasonAffix } from "@/data/d/dnaseasonequip.data"
import { affixes, affixPools, slots } from "@/data/d/dnaseasonequip.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { hasTierRange } from "@/utils/transcend-gear/display"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import {
    getAffixEffectText,
    getAffixModeledBadge,
    getAffixModeledSummary,
    getAffixSearchText,
    getAffixSlotIds,
    getAffixSummaryParts,
    getAffixValueHint,
    getPlanLabelKey,
    getPoolLabelKey,
    isEffectOnlyAffix,
} from "@/utils/transcendence-gear"

/** 词缀卡片固定主轴尺寸（px），虚拟滚动按它切片 */
const AFFIX_CARD_HEIGHT = 88

const { gt } = useGameText()
const { t } = useTranslation()

const route = useRoute()

const searchKeyword = useSearchParam<string>("kw", "")
const selectedAffixId = useSearchParam<number>("id", 0)

const planFilter = ref(0)
const poolFilter = ref(0)
const slotFilter = ref(0)

const planRows = computed(() => [1, 2, 3, 4].map(plan => ({ plan, count: affixes.filter(affix => affix.plan === plan).length })))

const poolRows = computed(() => affixPools.map(pool => ({ id: pool.id, name: getPoolLabelKey(pool.id) ? t(getPoolLabelKey(pool.id)) : gt(pool.name) })))

const slotRows = computed(() => slots.map(slot => ({ id: slot.id, name: gt(slot.name) })))

const planOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...planRows.value.map(row => ({ value: row.plan, label: t(getPlanLabelKey(row.plan)), count: row.count })),
])

const poolOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...poolRows.value.map(pool => ({ value: pool.id, label: pool.name })),
])

const slotOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...slotRows.value.map(slot => ({ value: slot.id, label: slot.name })),
])

/** 词缀卡片标题：专属 desc-only 只显示「效果:<描述>」，其余属性名逐段翻译后用 ` · ` 连接 */
function summaryOf(affix: DnaSeasonAffix): string {
    const effect = getAffixEffectText(affix, gt)
    if (effect) return `${t("common.effect_label")}${effect}`
    return getAffixModeledSummary(affix, t, gt) || getAffixSummaryParts(affix).map(part => gt(part)).join(" · ")
}

/** 词缀卡片数值行：数据属性区间优先，手写词条回退权威建模数值 */
function valueHintOf(affix: DnaSeasonAffix): string {
    return getAffixValueHint(affix, t, gt)
}

/** 手写建模徽章：partial → 推算值；exact → 精确数值；无建模值不显示 */
function modeledBadgeOf(affix: DnaSeasonAffix): string {
    if (!isEffectOnlyAffix(affix)) return ""
    return getAffixModeledBadge(affix.id) ?? ""
}

/** 词条检索正文（原文 + 官方译名 + 池名）：随界面语言重建一次，避免每次输入重复翻译 */
const affixSearchTexts = computed(
    () => new Map<number, string>(affixes.map(affix => [affix.id, `${getAffixSearchText(affix, gt)} ${affix.poolName ?? ""}`]))
)

const filteredAffixes = computed(() => {
    const keyword = searchKeyword.value.trim()

    return affixes.filter(affix => {
        if (planFilter.value && affix.plan !== planFilter.value) {
            return false
        }

        if (poolFilter.value && affix.pool !== poolFilter.value) {
            return false
        }

        if (slotFilter.value && !getAffixSlotIds(affix).includes(slotFilter.value)) {
            return false
        }

        if (!keyword) {
            return true
        }

        if (`${affix.id}`.includes(keyword)) {
            return true
        }

        // 正文（属性/效果/建模名）与拼音兜底，原文与界面展示的译名都能命中
        const searchText = affixSearchTexts.value.get(affix.id) ?? ""

        return matchPinyin(searchText, keyword).match
    })
})

const selectedAffix = computed(() => affixes.find(affix => affix.id === selectedAffixId.value) ?? null)

/** query 是否带 id（含脏值 / 0）：用于区分「深链选中」与普通进入 */
function hasRawIdParam(): boolean {
    const raw = route.query.id
    const value = Array.isArray(raw) ? raw[0] : raw

    return value !== undefined && value !== null && value !== ""
}

/** 脏值 / 0 / 不存在的 id 一律清回默认值，避免右栏空白但 URL 仍带 id */
watch(
    selectedAffixId,
    id => {
        if (!hasRawIdParam()) {
            return
        }

        if (id > 0 && affixes.some(affix => affix.id === id)) {
            return
        }

        selectedAffixId.value = 0
    },
    { immediate: true }
)

const selectedAffixIndex = computed(() => {
    if (!selectedAffixId.value) {
        return null
    }

    const index = filteredAffixes.value.findIndex(affix => affix.id === selectedAffixId.value)

    return index === -1 ? null : index
})
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedAffix)" @collapse="selectedAffixId = 0">
            <template #master>
                <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedAffix }">
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-transcendence.gear.search_affix')"
                            :count="filteredAffixes.length"
                        />
                        <div class="mt-3 flex flex-wrap gap-1.5">
                            <FilterSelect
                                v-model="planFilter"
                                :options="planOptions"
                                :label="$t('db-transcendence.gear.filter_plan')"
                                :clear-value="0"
                                :clear-title="$t('common.clear')"
                            />
                            <FilterSelect
                                v-model="poolFilter"
                                :options="poolOptions"
                                :label="$t('db-transcendence.gear.filter_pool')"
                                :clear-value="0"
                                :clear-title="$t('common.clear')"
                            />
                            <FilterSelect
                                v-model="slotFilter"
                                :options="slotOptions"
                                :label="$t('db-transcendence.gear.filter_slot')"
                                :clear-value="0"
                                :clear-title="$t('common.clear')"
                            />
                        </div>
                    </div>

                    <div v-if="!filteredAffixes.length" class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">
                        {{ $t("db-transcendence.gear.no_match") }}
                    </div>
                    <VirtualList
                        v-else
                        class="flex-1"
                        :items="filteredAffixes"
                        :item-height="AFFIX_CARD_HEIGHT"
                        :item-key="affix => affix.id"
                        :active-index="selectedAffixIndex"
                        v-slot="{ item: affix, index, animate, rowHeight }"
                    >
                        <article
                            class="group relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-xs border p-2.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                            :class="[selectedAffixId === affix.id ? 'dbtg-affix-active border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/60 hover:border-primary/50', animate ? 'animate-ef-rise motion-reduce:animate-none' : '']"
                            :style="{ minHeight: `${rowHeight}px`, animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectedAffixId = affix.id"
                        >
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedAffixId === affix.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="min-w-0 flex-1">
                                <div class="flex items-baseline gap-2">
                                    <button
                                        type="button"
                                        data-row-title
                                        class="min-w-0 cursor-pointer truncate text-left text-[13px] font-semibold transition-colors duration-150 group-hover:text-primary"
                                        :class="{ 'text-primary': selectedAffixId === affix.id }"
                                        @click.stop="selectedAffixId = affix.id"
                                    >
                                        {{ cleanGameMarkup(summaryOf(affix)) || $t(getPlanLabelKey(affix.plan)) }}
                                    </button>
                                    <span class="shrink-0 rounded-xs border border-primary/30 px-1 text-[10px] leading-4 text-primary/80">
                                        {{ $t(getPlanLabelKey(affix.plan)) }}
                                    </span>
                                    <span class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 text-base-content/45">
                                        {{ affix.pool ? $t(getPoolLabelKey(affix.pool)) : "—" }}
                                    </span>
                                    <span class="ml-auto shrink-0"><CopyID :id="affix.id" /></span>
                                </div>
                                <p class="mt-1 flex items-center gap-1.5 text-[11px] text-base-content/45">
                                    <span
                                        v-if="hasTierRange(affix)"
                                        class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 text-base-content/40"
                                    >
                                        {{ $t("db-transcendence.gear.all_tiers") }}
                                    </span>
                                    <span
                                        v-if="modeledBadgeOf(affix) === 'partial'"
                                        class="shrink-0 rounded-xs border border-warning/30 px-1 text-[10px] leading-4 text-warning/70"
                                        :title="$t('db-transcendence.gear.modeled_tag')"
                                    >
                                        {{ $t("db-transcendence.gear.mapping_handwritten") }}
                                    </span>
                                    <span
                                        v-else-if="modeledBadgeOf(affix) === 'exact'"
                                        class="shrink-0 rounded-xs border border-success/30 px-1 text-[10px] leading-4 text-success/70"
                                    >
                                        {{ $t("db-transcendence.gear.modeled_exact") }}
                                    </span>
                                    <span v-if="valueHintOf(affix)" class="truncate">{{ valueHintOf(affix) }}</span>
                                </p>
                                <p class="mt-1 text-[10px] text-base-content/35">
                                    {{ $t("db-transcendence.gear.roll_short", { max: affix.totalValueLevel }) }} · {{ $t("db-transcendence.gear.slot_count", { count: getAffixSlotIds(affix).length }) }}
                                </p>
                            </div>
                        </article>
                    </VirtualList>

                    <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredAffixes.length }}</b>
                            {{ $t("db-transcendence.gear.affix_count") }}
                        </p>
                        <p v-if="!selectedAffix" class="text-[11px] text-base-content/40">{{ $t("db-transcendence.gear.select_hint") }}</p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedAffix" class="min-h-0 min-w-0 flex-1">
                    <DBTranscendenceGearDetailItem :key="selectedAffix.id" :affix="selectedAffix" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
