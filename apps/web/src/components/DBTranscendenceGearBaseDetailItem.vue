<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import { useGameText } from "@/composables/useGameText"
import { TRANSCEND_EQUIP_BASE_SCORE_MAX, TRANSCEND_EQUIP_BASE_SCORE_MIN } from "@/data"
import { affixPools, type DnaSeasonBaseName } from "@/data/d/dnaseasonequip.data"
import { getBaseNameAffixProfile } from "@/utils/transcend-gear/base-profile"
import { getGearRarity, getGearShowRarityId, getShowRarityClass } from "@/utils/transcend-gear/catalog"
import { getAffixStrengthRangeText } from "@/utils/transcend-gear/display"
import { getAffixRollRange } from "@/utils/transcend-gear/generation"
import {
    formatAffixValue,
    getAffixAttrs,
    getAffixSummaryParts,
    getEquipPositions,
    getPoolLabelKey,
    getSlotName,
} from "@/utils/transcendence-gear"

/**
 * 基础名档案：槽位固定词条（恒 1 条）+ 洗练池随机词条 + 强度 1–50 + 品质条数。
 * 固定 / 随机数值与区间全部走数据层公式，品质不进入取值链；暗金不走基础名页面。
 */

const props = defineProps<{
    /** 当前基础名 */
    baseName: DnaSeasonBaseName
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const power = ref(TRANSCEND_EQUIP_BASE_SCORE_MAX)
const selectedRarityId = ref(5)

const profile = computed(() => getBaseNameAffixProfile(props.baseName.id))
const slotName = computed(() => gt(getSlotName(props.baseName.slot)))
const positions = computed(() => getEquipPositions(props.baseName.slot))
const iconSrc = computed(() => (props.baseName.icon ? `/imgs/res/${props.baseName.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"))

const baseAffix = computed(() => profile.value?.baseAffix ?? null)
const baseAffixName = computed(() =>
    baseAffix.value ? getAffixSummaryParts(baseAffix.value).map(part => gt(part)).join(" · ") : ""
)
const fixedValueText = computed(() => {
    const value = profile.value?.fixedAt(power.value)
    if (value === null || value === undefined) return ""
    const attr = baseAffix.value ? getAffixAttrs(baseAffix.value)[0] : undefined
    return attr ? formatAffixValue(attr, value) : `${+value.toFixed(4)}`
})

/** 洗练池分组：池名 + 随机词条（当前强度档位 / 数值区间）+ 精确成对排斥关系 */
const poolRows = computed(() =>
    (profile.value?.poolGroups ?? []).map(group => {
        const pool = affixPools.find(item => item.id === group.poolId)
        const poolKey = getPoolLabelKey(group.poolId)
        const nameOf = new Map(group.affixes.map(affix => [affix.id, getAffixSummaryParts(affix).map(part => gt(part)).join(" · ")]))
        const exclusionRelations = group.exclusionRelations.map(relation => ({
            affixId: relation.affixId,
            name: nameOf.get(relation.affixId) ?? "—",
            excludedText: relation.excludedAffixIds.map(affixId => nameOf.get(affixId) ?? "—").join(" / "),
        }))
        return {
            id: group.poolId,
            label: poolKey ? t(poolKey) : gt(pool?.name),
            exclusionRelations,
            rows: group.affixes.map(affix => {
                const range = getAffixRollRange(affix, power.value)
                return {
                    id: affix.id,
                    name: getAffixSummaryParts(affix).map(part => gt(part)).join(" · "),
                    rollText: range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`,
                    valueText: getAffixStrengthRangeText(affix, power.value),
                }
            }),
        }
    })
)

const poolTotal = computed(() => poolRows.value.reduce((sum, group) => sum + group.rows.length, 0))

/** 词缀组 tab：一次只展示一个洗练池；切换基础名时组件带 key 重挂载，默认落到第一组 */
const activePoolId = ref<number | null>(null)
const activePool = computed(() => poolRows.value.find(group => group.id === activePoolId.value) ?? poolRows.value[0] ?? null)

/** 品质 1–5：条数取 `MinAffixCount`，颜色用展示稀有度 */
const rarityRows = computed(() =>
    [1, 2, 3, 4, 5].map(rarityId => {
        const rarity = getGearRarity(rarityId)
        return {
            rarityId,
            name: rarity ? gt(rarity.name) : "",
            swatch: getShowRarityClass(getGearShowRarityId(rarityId)),
            count: profile.value?.randomCountByRarity[rarityId] ?? 0,
        }
    })
)

const selectedRow = computed(() => rarityRows.value.find(row => row.rarityId === selectedRarityId.value))
const selectedRandomCount = computed(() => selectedRow.value?.count ?? 0)
const totalCount = computed(() => 1 + selectedRandomCount.value)

/** 条数口径：随机 0–4、含固定共 1–5（由品质决定） */
const countRange = computed(() => {
    const counts = Object.values(profile.value?.randomCountByRarity ?? {})
    const max = counts.length ? Math.max(...counts) : 0
    const min = counts.length ? Math.min(...counts) : 0
    return { min, max, fixedMin: 1, fixedMax: 1 + max }
})

const noteKeys = [
    "db-transcendence.gear.pool_note_temper",
    "db-transcendence.gear.pool_note_plan3",
    "db-transcendence.gear.pool_note_count",
    "db-transcendence.gear.pool_note_unique",
]
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 档案头：基础名的槽位图标 + 名称 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
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
            <span class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]" aria-hidden="true" />
            <div class="relative flex items-center gap-3.5">
                <div class="size-16 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5">
                    <ImageFallback :src="iconSrc" :alt="gt(baseName.name)" class="size-16 object-cover">
                        <span class="flex size-16 items-center justify-center font-orbitron text-xl font-semibold text-primary/60">{{ baseName.name.slice(0, 1) }}</span>
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Base File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="truncate text-xl leading-tight font-bold tracking-tight text-base-content sm:text-2xl">{{ gt(baseName.name) }}</span>
                        <CopyID :id="baseName.id" />
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <span v-if="slotName" class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/60">{{ slotName }}</span>
                        <span v-if="positions.length" class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/60">
                            {{ $t("db-transcendence.gear.slot_positions") }} {{ positions.join(" / ") }}
                        </span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 强度：固定词条档位与随机词条 roll 区间共用 -->
        <section v-if="profile" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="POWER" :title="$t('db-transcendence.gear.power')">
                <template #trailing>
                    <span class="font-orbitron text-[15px] font-semibold text-primary" data-base-power-value>{{ power }}</span>
                </template>
            </SectionHeader>
            <input
                v-model.number="power"
                type="range"
                :min="TRANSCEND_EQUIP_BASE_SCORE_MIN"
                :max="TRANSCEND_EQUIP_BASE_SCORE_MAX"
                step="1"
                class="range range-primary range-sm w-full"
                data-base-power
            />
            <p class="mt-1.5 text-[11px] text-base-content/45">{{ $t("db-transcendence.gear.strength_plan2_formula") }}</p>
        </section>

        <!-- 固定词条：槽位 BaseAffixId（Plan 1），恒 1 条，单值 -->
        <section v-if="baseAffix" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="FIXED" :title="$t('db-transcendence.gear.fixed_affix')" />
            <div class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <SRouterLink
                    :to="`/db/transcendence/gear/affix?id=${baseAffix.id}`"
                    stop
                    class="min-w-0 truncate text-[13px] font-medium text-base-content/85 transition-colors duration-150 hover:text-primary"
                >
                    {{ baseAffixName }}
                </SRouterLink>
                <span class="rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{{ $t("db-transcendence.gear.fixed_affix") }}</span>
                <CopyID :id="baseAffix.id" compact />
                <span class="ml-auto font-orbitron text-[13px] font-semibold text-primary" data-base-fixed-value>{{ fixedValueText }}</span>
            </div>
            <p class="mt-1.5 text-[11px] text-base-content/45">{{ $t("db-transcendence.gear.fixed_affix_note") }}</p>
        </section>

        <!-- 随机词条池：按槽位洗练池分 tab，表格列出词条、Roll 档位与当前强度数值 -->
        <section
            v-if="poolRows.length"
            class="@container rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="RANDOM" :title="$t('db-transcendence.gear.random_pool')" :count="poolTotal" />

            <!-- 词缀组 tab：每组一个洗练池 -->
            <div class="flex flex-wrap items-center gap-1.5" role="tablist" :aria-label="$t('db-transcendence.gear.random_pool')">
                <button
                    v-for="group in poolRows"
                    :key="group.id"
                    type="button"
                    role="tab"
                    class="btn btn-xs whitespace-nowrap"
                    :class="activePool?.id === group.id ? 'btn-primary' : ''"
                    :aria-selected="activePool?.id === group.id"
                    :data-base-pool-tab="group.id"
                    @click="activePoolId = group.id"
                >
                    {{ group.label }}
                    <span class="font-mono text-[10px] opacity-70">{{ group.rows.length }}</span>
                </button>
            </div>

            <template v-if="activePool">
                <div class="mt-2 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3" data-base-pool-table>
                    <div
                        class="hidden border-b border-base-content/10 px-2.5 py-1.5 text-[10px] tracking-wide text-base-content/40 @md:grid @md:grid-cols-[minmax(0,1fr)_5.5rem_6rem_4.5rem] @md:gap-x-4"
                    >
                        <span>{{ $t("db-transcendence.gear.affix_name") }}</span>
                        <span class="text-right">{{ $t("db-transcendence.gear.roll_range") }}</span>
                        <span class="text-right">{{ $t("db-transcendence.gear.value_range") }}</span>
                        <span class="text-right">ID</span>
                    </div>
                    <div class="divide-y divide-base-content/8">
                        <article
                            v-for="row in activePool.rows"
                            :key="row.id"
                            class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2 transition-colors duration-150 hover:bg-base-content/3 @md:grid @md:grid-cols-[minmax(0,1fr)_5.5rem_6rem_4.5rem] @md:items-center @md:gap-x-4"
                            :data-base-affix="row.id"
                        >
                            <SRouterLink
                                :to="`/db/transcendence/gear/affix?id=${row.id}`"
                                stop
                                :title="row.name"
                                class="min-w-0 basis-full truncate text-[12px] font-medium text-base-content/80 transition-colors duration-150 hover:text-primary @md:basis-auto"
                            >
                                {{ row.name }}
                            </SRouterLink>
                            <span class="inline-flex items-baseline gap-1 @md:justify-end">
                                <span class="text-[10px] text-base-content/40 @md:hidden">{{ $t("db-transcendence.gear.roll_range") }}</span>
                                <span class="font-mono text-[11px] text-base-content/55">{{ row.rollText }}</span>
                            </span>
                            <span class="inline-flex items-baseline gap-1 @md:justify-end">
                                <span class="text-[10px] text-base-content/40 @md:hidden">{{ $t("db-transcendence.gear.value_range") }}</span>
                                <span class="font-orbitron text-[11px] font-semibold text-primary">{{ row.valueText || "—" }}</span>
                            </span>
                            <span class="justify-self-end"><CopyID :id="row.id" /></span>
                        </article>
                    </div>
                </div>

                <!-- 排斥关系：只列当前词缀组，按词条给出不可共存的词缀 -->
                <div v-if="activePool.exclusionRelations.length" class="mt-2 rounded-xs border border-warning/25 bg-warning/5 p-2.5" data-base-exclusive>
                    <div class="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <p class="text-[11px] font-semibold text-warning/80">{{ $t("db-transcendence.gear.exclusion_relations") }}</p>
                        <p class="text-[10px] text-base-content/40">{{ $t("db-transcendence.gear.exclusion_hint") }}</p>
                    </div>
                    <div class="overflow-hidden rounded-xs border border-warning/15 bg-base-100/30">
                        <div
                            class="hidden border-b border-warning/15 px-2.5 py-1 text-[10px] tracking-wide text-warning/50 @md:grid @md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] @md:gap-x-4"
                        >
                            <span>{{ $t("db-transcendence.gear.affix_name") }}</span>
                            <span>{{ $t("db-transcendence.gear.excluded_affixes") }}</span>
                        </div>
                        <div class="divide-y divide-warning/10">
                            <p
                                v-for="relation in activePool.exclusionRelations"
                                :key="relation.affixId"
                                class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2.5 py-1.5 text-[11px] leading-snug @md:grid @md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] @md:gap-x-4"
                                :data-base-exclusion="relation.affixId"
                            >
                                <span class="text-base-content/75">{{ relation.name }}</span>
                                <span class="min-w-0 text-base-content/45">
                                    <span class="mr-1 text-warning/70" aria-hidden="true">✕</span>{{ relation.excludedText }}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            </template>
        </section>

        <!-- 条数：品质 1–5 选择，随机 0–4 / 含固定共 1–5 -->
        <section v-if="profile" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="COUNT" :title="$t('db-transcendence.gear.base_count_title')">
                <template #trailing>
                    <span class="rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary" data-base-count-badge>
                        {{ $t("db-transcendence.gear.base_count_badge", { total: totalCount }) }}
                    </span>
                </template>
            </SectionHeader>
            <div class="flex flex-wrap gap-1.5">
                <button
                    v-for="row in rarityRows"
                    :key="row.rarityId"
                    type="button"
                    class="btn btn-xs whitespace-nowrap"
                    :class="selectedRarityId === row.rarityId ? 'btn-primary' : ''"
                    :data-base-rarity="row.rarityId"
                    @click="selectedRarityId = row.rarityId"
                >
                    <span :class="row.swatch" />
                    {{ row.name }}
                    <span class="font-mono text-[10px] opacity-70">{{ row.count }}</span>
                </button>
            </div>
            <p class="mt-2 text-[11px] text-base-content/55" data-base-count-selected>
                {{ $t("db-transcendence.gear.base_count_selected", { rarity: selectedRow?.name ?? "", random: selectedRandomCount, total: totalCount }) }}
            </p>
            <p class="mt-1 text-[11px] text-base-content/45">
                {{ $t("db-transcendence.gear.base_count_range", { min: countRange.min, max: countRange.max, fixedMin: countRange.fixedMin, fixedMax: countRange.fixedMax }) }}
            </p>
        </section>

        <!-- 脚注：洗练池口径 / Plan 3 / 强度不改条数 / 暗金不在本页 -->
        <section v-if="profile" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="NOTES" :title="$t('db-transcendence.gear.notes')" />
            <ul class="space-y-1 text-[11px] leading-relaxed text-base-content/55">
                <li v-for="key in noteKeys" :key="key">{{ $t(key) }}</li>
            </ul>
        </section>

        <div v-if="!profile" class="flex flex-1 items-center justify-center p-6 text-sm text-base-content/70">
            {{ $t("db-transcendence.detail.not_found") }}
        </div>
    </div>
</template>
