<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import type { FilterSelectOption } from "@/components/FilterSelect.vue"
import { useGameText } from "@/composables/useGameText"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { dungeonMap } from "@/data/d"
import { nestBosses } from "@/data/d/dnaseason.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { buildNestRows } from "@/utils/transcendence-nest"

const { t } = useTranslation()
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
const selectedDungeonId = useSearchParam<number>("id", 0)

const keyFilter = ref(0)
const levelFilter = ref(0)

/** 6 张梦魇卡的动态行数据：左栏摘要与右侧详情共用同一份 */
const nestRows = computed(() => buildNestRows(gt, t))

/** 钥匙筛选行：三种钥匙（普通 / 优质 / 豪华）按出现顺序聚合 */
const keyRows = computed(() => {
    const grouped = new Map<number, { id: number; name: string; count: number }>()

    for (const row of nestRows.value) {
        const existed = grouped.get(row.key.id)

        if (existed) {
            existed.count += 1
            continue
        }

        grouped.set(row.key.id, { id: row.key.id, name: row.key.name, count: 1 })
    }

    return [...grouped.values()]
})

/** 等级筛选行：难度档对应的推荐等级去重后升序 */
const levelRows = computed(() => {
    const grouped = new Map<number, number>()

    for (const row of nestRows.value) {
        if (row.level !== undefined) {
            grouped.set(row.level, (grouped.get(row.level) ?? 0) + 1)
        }
    }

    return [...grouped.entries()].sort((left, right) => left[0] - right[0]).map(([level, count]) => ({ level, count }))
})

const keyOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...keyRows.value.map(row => ({ value: row.id, label: row.name, count: row.count })),
])

const levelOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...levelRows.value.map(row => ({ value: row.level, label: t("db-transcendence.common.lv", { level: row.level }), count: row.count })),
])

const filteredNestRows = computed(() => {
    const keyword = searchKeyword.value.trim()

    return nestRows.value.filter(row => {
        if (keyFilter.value && row.key.id !== keyFilter.value) {
            return false
        }

        if (levelFilter.value && row.level !== levelFilter.value) {
            return false
        }

        if (!keyword) {
            return true
        }

        return `${row.dungeonId}`.includes(keyword) || matchPinyin(row.name, keyword).match
    })
})

const selectedNest = computed(() => nestRows.value.find(row => row.dungeonId === selectedDungeonId.value) ?? null)

const selectedDungeon = computed(() => (selectedNest.value ? (dungeonMap.get(selectedNest.value.dungeonId) ?? null) : null))

/** 非法副本 id（手改 URL / 前进后退）直接清掉，避免高亮悬空 */
watch(
    selectedDungeonId,
    id => {
        if (id && !nestBosses.some(boss => boss.dungeonId === id)) {
            selectedDungeonId.value = 0
            return
        }

        if (!id && hasDirtyNumericParam("id")) {
            selectedDungeonId.value = 0
        }
    },
    { immediate: true }
)

useInitialScrollToSelectedItem({ selectedSelector: ".dbtn-nest-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 3" :detail-open="Boolean(selectedNest)" @collapse="selectedDungeonId = 0">
            <template #master>
                <div class="flex-1 flex min-h-0 min-w-0 flex-col overflow-hidden" :class="{ 'sm:border-r border-base-content/10': selectedNest }">
                    <div class="flex-none space-y-2 border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-transcendence.nest.search_placeholder')"
                            :count="filteredNestRows.length"
                        />
                        <div class="flex flex-wrap gap-1.5">
                            <FilterSelect
                                v-model="keyFilter"
                                :options="keyOptions"
                                :label="$t('db-transcendence.nest.key')"
                                :clear-value="0"
                                :clear-title="$t('common.clear')"
                            />
                            <FilterSelect
                                v-model="levelFilter"
                                :options="levelOptions"
                                :label="$t('common.level')"
                                :clear-value="0"
                                :clear-title="$t('common.clear')"
                            />
                        </div>
                    </div>

                    <div v-if="!filteredNestRows.length" class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">
                        {{ nestRows.length ? $t("common.no_match") : $t("common.no_data") }}
                    </div>
                    <ScrollArea v-else class="flex-1">
                        <div class="space-y-2 p-3">
                            <!-- 摘要卡：仅图标 / 名称 / 类型 / 等级 / 钥匙类型 / 梦魇残声徽标，详细内容全部在右侧 -->
                            <article
                                v-for="row in filteredNestRows"
                                :key="row.dungeonId"
                                class="group relative flex cursor-pointer items-center gap-2.5 overflow-hidden rounded-xs border p-2.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                                :class="selectedDungeonId === row.dungeonId ? 'dbtn-nest-active border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'"
                                @click="selectedDungeonId = row.dungeonId"
                            >
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedDungeonId === row.dungeonId ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <ImageFallback :src="row.iconUrl" :alt="row.name" class="size-11 shrink-0 overflow-hidden rounded-xs">
                                    <span class="size-11 shrink-0 rounded-xs" :class="getRarityGradientClass(5)" />
                                </ImageFallback>
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2">
                                        <button
                                            type="button"
                                            data-row-title
                                            class="min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] font-semibold transition-colors duration-150 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedDungeonId === row.dungeonId }"
                                            @click.stop="selectedDungeonId = row.dungeonId"
                                        >
                                            {{ row.name }}
                                        </button>
                                        <CopyID :id="row.dungeonId" />
                                    </div>
                                    <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                        <span v-if="row.type" class="rounded-xs border border-base-content/15 px-1.5 text-[10px] leading-4 text-base-content/55">{{ row.type }}</span>
                                        <span v-if="row.level !== undefined" class="rounded-xs border border-primary/40 px-1.5 text-[10px] leading-4 text-primary">
                                            {{ $t("db-transcendence.common.lv", { level: row.level }) }}
                                        </span>
                                        <span class="rounded-xs border border-base-content/15 px-1.5 text-[10px] leading-4 text-base-content/55">{{ row.key.name }}</span>
                                        <SRouterLink
                                            v-if="row.hardBossId"
                                            :to="`/db/hardboss/${row.hardBossId}`"
                                            stop
                                            class="rounded-xs border border-base-content/15 px-1.5 text-[10px] leading-4 text-base-content/45 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                                            :title="$t('db-transcendence.nest.hardboss_source')"
                                        >
                                            {{ $t("database.hard_boss") }}
                                        </SRouterLink>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredNestRows.length }}</b>
                            {{ $t("db-transcendence.nest.boss_count") }}
                        </p>
                        <p v-if="!selectedNest" class="text-[11px] text-base-content/40">{{ $t("db-transcendence.nest.select_hint") }}</p>
                        <p v-else class="text-[11px] text-base-content/50">{{ selectedNest.name }}</p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedNest && selectedDungeon" class="min-h-0 min-w-0 flex-1">
                    <DBDungeonDetailItem :key="selectedNest.dungeonId" :dungeon="selectedDungeon" :nest="selectedNest" />
                </ScrollArea>
                <div v-else class="flex flex-1 items-center justify-center p-6 text-sm text-base-content/60">
                    {{ $t("common.no_data") }}
                </div>
            </template>
        </SplitView>
    </div>
</template>
