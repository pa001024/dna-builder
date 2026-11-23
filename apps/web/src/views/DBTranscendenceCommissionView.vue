<script lang="ts" setup>
import { computed, watch } from "vue"
import { useRoute } from "vue-router"
import { useGameText } from "@/composables/useGameText"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { dungeonMap } from "@/data/d"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { buildJourneyCommissionRows } from "@/utils/transcendence-journey"

const { gt } = useGameText()

const route = useRoute()

/**
 * 数字型 query 参数是否为非数字脏值（如 `id=abc`）。
 * `useSearchParam` 对非数字会静默回落默认值，只能回看原始 query 才能清掉脏参数。
 * @param key query 参数名
 * @returns 是否是需要清理的脏值
 */
function hasDirtyNumericParam(key: string): boolean {
    const raw = route.query[key]
    const value = Array.isArray(raw) ? raw[0] : raw

    return value !== undefined && value !== null && value !== "" && !Number.isFinite(Number(value))
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedCommissionId = useSearchParam<number>("id", 0)

/** 4 个委托副本：左栏摘要与右侧详情共用同一份行数据 */
const commissionRows = computed(() => buildJourneyCommissionRows())

/** 全部档位奖励条目数（底部统计） */
const commissionTierCount = computed(() => commissionRows.value.reduce((total, row) => total + row.tiers.length, 0))

const filteredCommissionRows = computed(() => {
    const keyword = searchKeyword.value.trim()

    if (!keyword) {
        return commissionRows.value
    }

    return commissionRows.value.filter(row => {
        const name = gt(row.name)

        return `${row.dungeonId}`.includes(keyword) || `${row.ruleId}`.includes(keyword) || matchPinyin(name, keyword).match
    })
})

const selectedCommission = computed(
    () => commissionRows.value.find(row => row.dungeonId === selectedCommissionId.value) ?? null
)

const selectedDungeon = computed(() =>
    selectedCommission.value ? (dungeonMap.get(selectedCommission.value.dungeonId) ?? null) : null
)

/** 非法委托 id（手改 URL / 前进后退）直接清掉，避免高亮悬空 */
watch(
    selectedCommissionId,
    id => {
        if (id && !commissionRows.value.some(row => row.dungeonId === id)) {
            selectedCommissionId.value = 0
            return
        }

        if (!id && hasDirtyNumericParam("id")) {
            selectedCommissionId.value = 0
        }
    },
    { immediate: true }
)

useInitialScrollToSelectedItem({ selectedSelector: ".dbcommission-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 3" :detail-open="Boolean(selectedCommission)" @collapse="selectedCommissionId = 0">
            <template #master>
                <div
                    class="flex-1 flex min-h-0 min-w-0 flex-col overflow-hidden"
                    :class="{ 'sm:border-r border-base-content/10': selectedCommission }"
                >
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-transcendence.journey.commission_search_placeholder')"
                            :count="filteredCommissionRows.length"
                        />
                    </div>

                    <div
                        v-if="!filteredCommissionRows.length"
                        class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45"
                    >
                        {{ commissionRows.length ? $t("common.no_match") : $t("common.no_data") }}
                    </div>
                    <ScrollArea v-else class="flex-1">
                        <div class="space-y-2 p-3">
                            <!-- 摘要卡：图标 / 名称 / 类型 / 规则 ID，档位奖励等详细内容全部在右侧 -->
                            <article
                                v-for="row in filteredCommissionRows"
                                :key="row.dungeonId"
                                class="group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xs border p-2.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                                :class="
                                    selectedCommissionId === row.dungeonId
                                        ? 'dbcommission-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                @click="selectedCommissionId = row.dungeonId"
                            >
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedCommissionId === row.dungeonId ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <ImageFallback
                                    :src="`/imgs/webp/${row.image}.webp`"
                                    :alt="gt(row.name)"
                                    class="size-11 shrink-0 overflow-hidden rounded-xs"
                                >
                                    <span class="size-11 shrink-0 rounded-xs" :class="getRarityGradientClass(5)" />
                                </ImageFallback>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2">
                                        <button
                                            type="button"
                                            data-row-title
                                            class="min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] font-semibold transition-colors duration-150 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedCommissionId === row.dungeonId }"
                                            @click.stop="selectedCommissionId = row.dungeonId"
                                        >
                                            {{
                                                gt(row.name) ||
                                                $t("db-transcendence.unknown_entity", { id: row.dungeonId })
                                            }}
                                        </button>
                                        <CopyID :id="row.dungeonId" />
                                    </div>
                                    <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                        <span
                                            v-if="row.typeKey"
                                            class="rounded-xs border border-base-content/15 px-1.5 text-[10px] leading-4 text-base-content/55"
                                        >
                                            {{ $t(row.typeKey) }}
                                        </span>
                                        <span
                                            class="rounded-xs border border-base-content/15 px-1.5 text-[10px] leading-4 text-base-content/55"
                                        >
                                            {{ $t("db-transcendence.journey.tier_total", { count: row.tiers.length }) }}
                                        </span>
                                        <CopyID :id="row.ruleId" />
                                    </div>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("db-transcendence.journey.commission_count", { count: filteredCommissionRows.length }) }}
                            <span class="mx-1 text-base-content/25">·</span>
                            {{ $t("db-transcendence.journey.tier_total", { count: commissionTierCount }) }}
                        </p>
                        <p v-if="!selectedCommission" class="text-[11px] text-base-content/40">
                            {{ $t("db-transcendence.journey.commission_select_hint") }}
                        </p>
                        <p v-else class="truncate text-[11px] text-base-content/50">
                            {{ gt(selectedCommission.name) || $t("db-transcendence.unknown_entity", { id: selectedCommission.dungeonId }) }}
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedCommission && selectedDungeon" class="min-h-0 min-w-0 flex-1">
                    <DBDungeonDetailItem :key="selectedCommission.dungeonId" :dungeon="selectedDungeon" :commission="selectedCommission" />
                </ScrollArea>
                <div v-else class="flex flex-1 items-center justify-center p-6 text-sm text-base-content/60">
                    {{ $t("common.no_data") }}
                </div>
            </template>
        </SplitView>
    </div>
</template>
