<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useGameText } from "@/composables/useGameText"
import { useSearchParam } from "@/composables/useSearchParam"
import { affixLevels, baseNames, namePrefixes, rarities, slots } from "@/data/d/dnaseasonequip.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRaritySwatchClass } from "@/utils/rarity-utils"
import { ASSIST_SLOT_IDS, getCraftLabelKey, getEquipPositions, getPlanLabelKey, getPoolLabelKey, getSlotName } from "@/utils/transcendence-gear"

/** 词条档位行高（px） */
const TABLE_ROW_HEIGHT = 40

const { t } = useTranslation()
const { gt } = useGameText()

const route = useRoute()

const searchKeyword = useSearchParam<string>("kw", "")
const selectedBaseId = useSearchParam<number>("id", 0)
const activeSection = ref("rarity")

const selectedBaseName = computed(() => baseNames.find(item => item.id === selectedBaseId.value) ?? null)

/** query 是否带 id（含脏值 / 0）：用于区分「深链基础名」与普通进入 */
function hasRawIdParam(): boolean {
    const raw = route.query.id
    const value = Array.isArray(raw) ? raw[0] : raw

    return value !== undefined && value !== null && value !== ""
}

/** 深链 `?id=` 强制切到基础名 tab；脏值 / 0 / 不存在的 id 清掉 query，但保留基础名列表作为落点 */
watch(
    selectedBaseId,
    id => {
        if (!hasRawIdParam()) {
            return
        }

        activeSection.value = "base"

        if (!(id > 0) || !baseNames.some(item => item.id === id)) {
            selectedBaseId.value = 0
        }
    },
    { immediate: true }
)

/** 切换参考表 tab 时丢弃基础名选中，避免 URL 残留与当前内容不一致的 id */
function selectSection(key: string): void {
    activeSection.value = key

    if (key !== "base" && selectedBaseId.value) {
        selectedBaseId.value = 0
    }
}

const sections = computed(() => [
    { key: "rarity", labelKey: "db-transcendence.gear.base_section_rarity", count: rarities.length },
    { key: "slot", labelKey: "db-transcendence.gear.base_section_slots", count: slots.length },
    { key: "base", labelKey: "db-transcendence.gear.base_section_basenames", count: baseNames.length },
    { key: "prefix", labelKey: "db-transcendence.gear.base_section_prefixes", count: namePrefixes.length },
    { key: "level", labelKey: "db-transcendence.gear.base_section_levels", count: affixLevels.length },
])

/** 只有基础名/前缀支持关键词搜索，其余分类是纯参考表 */
const searchable = computed(() => activeSection.value === "base" || activeSection.value === "prefix")

const keyword = computed(() => searchKeyword.value.trim())

/** 基础名 / 前缀检索：原文与界面展示的官方译名都参与匹配 */
function matchesName(item: { id: number; name: string }): boolean {
    if (!keyword.value) {
        return true
    }

    return `${item.id}`.includes(keyword.value) || matchPinyin(`${item.name} ${gt(item.name)}`, keyword.value).match
}

const baseRows = computed(() =>
    baseNames
        .filter(matchesName)
        .map(item => ({ item, slotName: gt(getSlotName(item.slot)) || "—" }))
)

const prefixRows = computed(() =>
    namePrefixes
        .filter(matchesName)
        .map(item => ({ item, slotName: gt(getSlotName(item.slot)) || "—" }))
)

const rarityRows = computed(() =>
    rarities.map(rarity => ({
        id: rarity.id,
        showRarityId: rarity.showRarityId > 6 ? 6 : rarity.showRarityId,
        name: gt(rarity.name),
        minAffixCount: rarity.minAffixCount.join(" / "),
        hasUniqueAffix: rarity.hasUniqueAffix,
        craftLabels: rarity.craftTypes.map(id => {
            const key = getCraftLabelKey(id)

            return key ? t(key) : "—"
        }),
    }))
)

const slotRows = computed(() =>
    slots.map(slot => ({
        id: slot.id,
        name: gt(slot.name) || "—",
        positions: getEquipPositions(slot.id).join(" / "),
        baseAffixId: slot.baseAffixId ?? 0,
        maxInlayCount: slot.maxInlayCount ?? 0,
        assist: ASSIST_SLOT_IDS.has(slot.id),
        poolNames: (slot.temperAffixPoolIds ?? []).map(poolId => {
            const key = getPoolLabelKey(poolId)

            return key ? t(key) : "—"
        }),
    }))
)

const levelRows = computed(() =>
    affixLevels
        .slice()
        .sort((left, right) => left.power - right.power)
        .map(row => ({
            power: row.power,
            cells: [1, 2, 3, 4].map(planId => {
                const plan = row.plans.find(item => item.planId === planId)

                return plan ? `${plan.minRollLevel}–${plan.maxRollLevel}` : "—"
            }),
        }))
)
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-none space-y-2 border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <button
                    v-for="section in sections"
                    :key="section.key"
                    type="button"
                    class="btn btn-xs whitespace-nowrap"
                    :class="activeSection === section.key ? 'btn-primary' : ''"
                    @click="selectSection(section.key)"
                >
                    {{ $t(section.labelKey) }}
                    <span class="font-mono text-[10px] opacity-70">{{ section.count }}</span>
                </button>
            </div>
            <DbSearchBox v-if="searchable" v-model="searchKeyword" :placeholder="$t('db-transcendence.gear.search_base')" :count="activeSection === 'base' ? baseRows.length : prefixRows.length" />
        </div>

        <!-- 词条档位：表头 + 虚拟行 -->
        <div v-if="activeSection === 'level'" class="flex min-h-0 flex-1 flex-col">
            <template v-if="levelRows.length">
                <div class="flex flex-none items-center gap-3 border-b border-base-content/15 px-5 py-2 text-[11px] text-base-content/45">
                    <span class="w-16 shrink-0">{{ $t("db-transcendence.gear.power") }}</span>
                    <span v-for="plan in [1, 2, 3, 4]" :key="plan" class="min-w-0 flex-1">{{ $t(getPlanLabelKey(plan)) }}</span>
                </div>
                <VirtualList class="flex-1" :items="levelRows" :item-height="TABLE_ROW_HEIGHT" :item-key="row => row.power" v-slot="{ item: row, animate }">
                    <div class="flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-1.5 backdrop-blur-sm" :class="animate ? 'animate-ef-rise motion-reduce:animate-none' : ''">
                        <span class="w-16 shrink-0 font-orbitron text-[12px] font-semibold text-base-content/65">{{ row.power }}</span>
                        <span v-for="(cell, index) in row.cells" :key="index" class="min-w-0 flex-1 font-orbitron text-[11px] text-base-content/70">{{ cell }}</span>
                    </div>
                </VirtualList>
            </template>
            <div v-else class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">{{ $t("common.no_data") }}</div>
        </div>

        <SplitView
            v-else-if="activeSection === 'base'"
            :desktop-ratio="1 / 2"
            :detail-open="Boolean(selectedBaseName)"
            @collapse="selectedBaseId = 0"
        >
            <template #master>
                <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" :class="{ 'sm:border-r border-base-content/10': selectedBaseName }">
                    <div v-if="!baseRows.length" class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">
                        {{ $t("db-transcendence.gear.no_match") }}
                    </div>
                    <ScrollArea v-else class="flex-1">
                        <div class="grid gap-2 p-3 sm:p-4" :class="selectedBaseName ? 'grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'">
                            <article
                                v-for="row in baseRows"
                                :key="row.item.id"
                                class="group relative flex cursor-pointer items-center gap-2.5 rounded-xs border p-2.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                                :class="[selectedBaseId === row.item.id ? 'dbtg-base-active border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/60 hover:border-primary/50']"
                                :data-base-card="row.item.id"
                                @click="selectedBaseId = row.item.id"
                            >
                                <ImageFallback :src="row.item.icon ? `/imgs/res/${row.item.icon}.webp` : '/imgs/webp/T_Head_Empty.webp'" :alt="gt(row.item.name)" class="size-9 shrink-0 overflow-hidden rounded-xs">
                                    <span class="flex size-9 items-center justify-center rounded-xs border border-base-content/15 bg-base-content/5 text-[12px] text-base-content/45">
                                        {{ row.item.name.slice(0, 1) }}
                                    </span>
                                </ImageFallback>
                                <div class="min-w-0 flex-1">
                                    <button
                                        type="button"
                                        data-row-title
                                        class="block w-full cursor-pointer truncate text-left text-[12px] font-medium text-base-content/80 transition-colors duration-150 group-hover:text-primary"
                                        @click.stop="selectedBaseId = row.item.id"
                                    >
                                        {{ gt(row.item.name) }}
                                    </button>
                                    <p class="text-[10px] text-base-content/45">{{ row.slotName }}</p>
                                </div>
                                <CopyID :id="row.item.id" />
                            </article>
                        </div>
                    </ScrollArea>
                    <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ baseRows.length }}</b>
                            {{ $t("db-transcendence.gear.base_section_basenames") }}
                        </p>
                        <p v-if="!selectedBaseName" class="text-[11px] text-base-content/40">{{ $t("db-transcendence.gear.select_hint") }}</p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedBaseName" class="min-h-0 min-w-0 flex-1">
                    <DBTranscendenceGearBaseDetailItem :key="selectedBaseName.id" :base-name="selectedBaseName" />
                </ScrollArea>
            </template>
        </SplitView>

        <ScrollArea v-else class="flex-1">
            <div class="space-y-3 p-3 sm:p-4">
                <!-- 品质 -->
                <template v-if="activeSection === 'rarity'">
                    <div v-if="rarityRows.length" data-rarity-list class="overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm">
                        <div class="divide-y divide-base-content/8">
                            <div
                                v-for="row in rarityRows"
                                :key="row.id"
                                :data-rarity-row="row.id"
                                class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-2 transition-colors duration-150 hover:bg-base-content/3"
                            >
                                <span class="inline-flex min-w-0 items-center gap-1.5">
                                    <span :class="getRaritySwatchClass(row.showRarityId)" />
                                    <span class="text-[12px] font-semibold text-base-content/85">{{ row.name }}</span>
                                </span>
                                <CopyID :id="row.id" />
                                <span class="inline-flex items-baseline gap-1 text-[11px]">
                                    <span class="text-[10px] text-base-content/40">{{ $t("db-transcendence.gear.min_affix_count") }}</span>
                                    <b class="font-orbitron font-semibold text-base-content/70">{{ row.minAffixCount }}</b>
                                </span>
                                <span v-if="row.hasUniqueAffix" class="text-[11px] text-primary">{{ $t("db-transcendence.gear.unique_affix_yes") }}</span>
                                <span class="inline-flex items-baseline gap-1 text-[11px]">
                                    <span class="text-[10px] text-base-content/40">{{ $t("db-transcendence.gear.craft_types") }}</span>
                                    <span class="text-base-content/65">{{ row.craftLabels.join(" / ") }}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <p v-else class="py-8 text-center text-[12px] text-base-content/45">{{ $t("common.no_data") }}</p>
                </template>

                <!-- 槽型 -->
                <template v-else-if="activeSection === 'slot'">
                    <div v-if="slotRows.length" class="space-y-2">
                        <div v-for="row in slotRows" :key="row.id" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span class="text-[13px] font-semibold text-base-content/85">{{ row.name }}</span>
                                <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/45">
                                    {{ $t("db-transcendence.gear.slot_positions") }} {{ row.positions }}
                                </span>
                                <span v-if="row.assist" class="rounded-xs border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                                    {{ $t("db-transcendence.gear.assist_only") }}
                                </span>
                                <span class="ml-auto"><CopyID :id="row.id" /></span>
                            </div>
                            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-content/55">
                                <span>{{ $t("db-transcendence.gear.slot_base_affix") }}</span>
                                <template v-if="row.baseAffixId">
                                    <CopyID :id="row.baseAffixId" />
                                    <SRouterLink :to="`/db/transcendence/gear/affix?id=${row.baseAffixId}`" class="btn btn-xs whitespace-nowrap">
                                        {{ $t("db-transcendence.gear.open_affix") }}
                                    </SRouterLink>
                                </template>
                                <span class="ml-2">{{ $t("db-transcendence.gear.slot_inlay_limit") }} · {{ row.maxInlayCount }}</span>
                                <span>{{ $t("db-transcendence.gear.slot_temper_pools") }} · {{ row.poolNames.length ? row.poolNames.join(" / ") : "—" }}</span>
                            </div>
                        </div>
                    </div>
                    <p v-else class="py-8 text-center text-[12px] text-base-content/45">{{ $t("common.no_data") }}</p>
                </template>

                <!-- 名称前缀 -->
                <template v-else-if="activeSection === 'prefix'">
                    <div v-if="!prefixRows.length" class="py-8 text-center text-[12px] text-base-content/45">{{ $t("db-transcendence.gear.no_match") }}</div>
                    <div v-else class="space-y-1.5">
                        <div v-for="row in prefixRows" :key="row.item.id" class="flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2 backdrop-blur-sm">
                            <span class="text-[12px] font-medium text-base-content/80">{{ gt(row.item.name) }}</span>
                            <span class="text-[11px] text-base-content/45">{{ row.slotName }}</span>
                            <span class="ml-auto"><CopyID :id="row.item.id" /></span>
                        </div>
                    </div>
                </template>
            </div>
        </ScrollArea>
    </div>
</template>
