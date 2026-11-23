<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useGameText } from "@/composables/useGameText"
import { useSearchParam } from "@/composables/useSearchParam"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import {
    buildJourneyBuffGroups,
    buildJourneyQuestRows,
    getJourneyPhases,
    type JourneyQuestRow,
    shouldResetJourneyFilters,
} from "@/utils/transcendence-journey"
import { summarizeTranscendenceRewardFull } from "@/utils/transcendence-reward"

/** 任务卡固定主轴尺寸（px） */
const QUEST_ROW_HEIGHT = 72

const { gt } = useGameText()

const route = useRoute()

const selectedQuestId = useSearchParam<number>("id", 0)

const phaseFilter = ref(0)
const searchKeyword = ref("")

const phases = computed(() => getJourneyPhases())

const buffGroups = computed(() => buildJourneyBuffGroups())

/** 52 条任务：文案与奖励数量一次性算好，行内不再求值 */
const questRows = computed<JourneyQuestRow[]>(() => buildJourneyQuestRows())

const questRowMap = computed(() => new Map(questRows.value.map(row => [row.id, row])))

const selectedQuest = computed(() => (selectedQuestId.value ? (questRowMap.value.get(selectedQuestId.value) ?? null) : null))

/** 带奖励数量与可检索文本的行 */
const questCards = computed(() =>
    questRows.value.map(row => {
        const rewardCount = row.rewardIds.reduce((total, rewardId) => total + summarizeTranscendenceRewardFull(rewardId).rows.length, 0)

        return { row, desc: cleanGameMarkup(gt(row.desc)), rewardCount }
    })
)

const filteredQuests = computed(() => {
    const keyword = searchKeyword.value.trim()

    return questCards.value.filter(card => {
        if (phaseFilter.value && card.row.phase !== phaseFilter.value) {
            return false
        }

        if (!keyword) {
            return true
        }

        return `${card.row.id}`.includes(keyword) || card.desc.includes(keyword) || card.row.targetIds.some(targetId => `${targetId}`.includes(keyword))
    })
})

const selectedQuestIndex = computed(() => {
    if (!selectedQuest.value) {
        return null
    }

    const index = filteredQuests.value.findIndex(card => card.row.id === selectedQuest.value?.id)

    return index === -1 ? null : index
})

/** 首次深链水合是否已完成；之后的任务 id 变化都来自用户点选或前进后退 */
let questDeepLinkHydrated = false

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

watch(
    selectedQuestId,
    id => {
        if (!id) {
            if (hasDirtyNumericParam("id")) {
                selectedQuestId.value = 0
            }

            questDeepLinkHydrated = true
            return
        }

        const quest = questRowMap.value.get(id)

        if (!quest) {
            selectedQuestId.value = 0
            questDeepLinkHydrated = true
            return
        }

        // 首次深链水合或目标被筛选隐藏时才重置，点选同阶段任务保持原筛选
        const visible = filteredQuests.value.some(card => card.row.id === id)

        if (shouldResetJourneyFilters(questDeepLinkHydrated, visible)) {
            phaseFilter.value = 0
            searchKeyword.value = ""
        }

        questDeepLinkHydrated = true
    },
    { immediate: true }
)

/**
 * 切换阶段筛选：隐藏的选中项不再高亮，但详情保留（可继续对照）。
 * @param phase 阶段序号，0 表示全部
 */
function setPhase(phase: number): void {
    phaseFilter.value = phase
}

const subTabOptions = computed(() => [
    { key: "tasks" as const, path: "/db/transcendence/journey", labelKey: "db-transcendence.journey.sub_tasks", count: questRows.value.length },
    { key: "buffs" as const, path: "/db/transcendence/journey/buffs", labelKey: "db-transcendence.journey.sub_buffs", count: buffGroups.value.length },
])

/** 子页由独立路由决定：/journey、/journey/buffs；按 route.name 判别，尾斜杠等 path 变体不受影响 */
const activeSubTab = computed<"tasks" | "buffs">(() => {
    if (route.name === "transcendence-journey-buffs") {
        return "buffs"
    }

    return "tasks"
})

/** 切换子页：只保留公共筛选，任务选中 id 不跨页沿用 */
function subTabTarget(path: string) {
    const query = { ...route.query }
    delete query.id
    delete query.journeysub

    return { path, query }
}

/** 旅程增益等级总数（4 类型共 16 级） */
const buffLevelCount = computed(() => buffGroups.value.reduce((total, group) => total + group.levels.length, 0))
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-none space-y-2 border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <SRouterLink
                    v-for="item in subTabOptions"
                    :key="item.key"
                    :to="subTabTarget(item.path)"
                    class="btn btn-xs whitespace-nowrap"
                    :class="activeSubTab === item.key ? 'btn-primary' : ''"
                    :aria-current="activeSubTab === item.key ? 'page' : undefined"
                >
                    {{ $t(item.labelKey) }}
                    <span class="font-mono text-[10px] opacity-70">{{ item.count }}</span>
                </SRouterLink>
            </div>
        </div>

        <div v-if="activeSubTab === 'tasks'" class="flex min-h-0 flex-1 flex-col">
            <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedQuest)" @collapse="selectedQuestId = 0">
                <template #master>
                    <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedQuest }">
                        <div class="flex-none space-y-2 border-b border-base-content/15 px-4 pt-3 pb-2 stagger-rise">
                            <DbSearchBox v-model="searchKeyword" :placeholder="$t('db-transcendence.journey.search_quest')" :count="filteredQuests.length" />
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                <span class="mr-1 shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("db-transcendence.journey.phase") }}</span>
                                <button type="button" class="btn btn-xs whitespace-nowrap" :class="phaseFilter === 0 ? 'btn-primary' : ''" @click="setPhase(0)">
                                    {{ $t("common.all") }}
                                </button>
                                <button
                                    v-for="phase in phases"
                                    :key="phase.index"
                                    type="button"
                                    class="btn btn-xs whitespace-nowrap"
                                    :class="phaseFilter === phase.index ? 'btn-primary' : ''"
                                    @click="setPhase(phase.index)"
                                >
                                    {{ $t("db-transcendence.journey.phase_n", { n: phase.index }) }}
                                    <span class="font-mono text-[10px] opacity-70">{{ phase.count }}</span>
                                </button>
                            </div>
                        </div>

                        <div v-if="!filteredQuests.length" class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">
                            {{ questRows.length ? $t("common.no_match") : $t("common.no_data") }}
                        </div>
                        <VirtualList
                            v-else
                            class="flex-1"
                            :items="filteredQuests"
                            :item-height="QUEST_ROW_HEIGHT"
                            :item-key="card => card.row.id"
                            :active-index="selectedQuestIndex"
                            v-slot="{ item: card, index, animate, rowHeight }"
                        >
                            <article
                                class="group relative flex cursor-pointer flex-col justify-center overflow-hidden rounded-xs border p-2.5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                                :class="[selectedQuestId === card.row.id ? 'dbtj-quest-active border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/60 hover:border-primary/50', animate ? 'animate-ef-rise motion-reduce:animate-none' : '']"
                                :style="{ minHeight: `${rowHeight}px`, animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedQuestId = card.row.id"
                            >
                                <span class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200" :class="selectedQuestId === card.row.id ? 'opacity-100' : 'opacity-0'" aria-hidden="true" />
                                <div class="flex items-center gap-2">
                                    <span class="shrink-0 rounded-xs border border-primary/40 px-1 text-[10px] leading-4 text-primary">{{ $t("db-transcendence.journey.phase_n", { n: card.row.phase }) }}</span>
                                    <button
                                        type="button"
                                        data-row-title
                                        class="min-w-0 flex-1 cursor-pointer truncate text-left text-[12px] text-base-content/80 transition-colors duration-150 group-hover:text-primary"
                                        @click.stop="selectedQuestId = card.row.id"
                                    >
                                        {{ card.desc }}
                                    </button>
                                    <span class="shrink-0"><CopyID compact :id="card.row.id" /></span>
                                </div>
                                <p class="mt-1 truncate text-[10px] text-base-content/40">
                                    {{ $t("db-transcendence.journey.target_of", { count: card.row.target }) }} ·
                                    {{ $t("db-transcendence.journey.reward_count", { count: card.rewardCount }) }}
                                </p>
                            </article>
                        </VirtualList>

                        <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                            <p class="text-[11px] tracking-wide text-base-content/50">
                                {{ $t("common.total_count") }}
                                <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredQuests.length }}</b>
                                {{ $t("db-transcendence.journey.quest_count") }}
                            </p>
                            <p v-if="!selectedQuest" class="text-[11px] text-base-content/40">{{ $t("db-transcendence.journey.select_hint") }}</p>
                        </div>
                    </div>
                </template>
                <template #detail>
                    <ScrollArea v-if="selectedQuest" class="min-h-0 min-w-0 flex-1">
                        <DBTranscendenceJourneyQuestDetail :key="selectedQuest.id" :quest="selectedQuest" class="block p-4" />
                    </ScrollArea>
                </template>
            </SplitView>
        </div>

        <ScrollArea v-else class="flex-1">
            <div class="space-y-3 p-3 sm:p-4 stagger-rise">
                <SectionHeader no-animate compact kicker="BOOST" :title="$t('db-transcendence.journey.buffs')" :count="buffGroups.length" />
                <div v-if="!buffGroups.length" class="py-8 text-center text-[12px] text-base-content/45">{{ $t("common.no_data") }}</div>
                <div v-else class="grid gap-2 xl:grid-cols-2">
                    <article v-for="group in buffGroups" :key="group.id" class="rounded-xs border border-base-content/15 bg-base-100/60 p-3 backdrop-blur-sm">
                        <div class="flex items-center gap-2.5">
                            <ImageFallback :src="`/imgs/webp/${group.icon}.webp`" :alt="gt(group.desc)" class="size-9 shrink-0 overflow-hidden rounded-xs">
                                <Icon icon="ri:magic-line" class="size-9 text-primary/40" />
                            </ImageFallback>
                            <div class="min-w-0 flex-1">
                                <p class="truncate text-[12px] font-semibold text-base-content/80">{{ cleanGameMarkup(gt(group.desc)) }}</p>
                                <span class="mt-0.5 flex"><CopyID compact :id="group.id" /></span>
                            </div>
                            <span class="shrink-0 text-[10px] text-base-content/40">{{ $t("db-transcendence.journey.buff_levels", { count: group.levels.length }) }}</span>
                        </div>
                        <div class="mt-2 space-y-1">
                            <div v-for="level in group.levels" :key="level.id" class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5">
                                <span class="shrink-0 font-orbitron text-[11px] font-semibold text-primary">{{ $t("db-transcendence.journey.buff_level", { n: level.level }) }}</span>
                                <span class="shrink-0 text-[11px] text-base-content/60">{{ $t("db-transcendence.rift.drop_rate", { rate: level.dropBonusRate / 100 }) }}</span>
                                <span class="ml-auto flex flex-wrap items-center gap-1.5">
                                    <span class="text-[10px] text-base-content/40">{{ $t("db-transcendence.journey.buff_cost") }}</span>
                                    <ResourceCostItem v-for="(count, id) in level.cost" :key="id" :value="[count, id, 'Resource']" mini />
                                </span>
                            </div>
                        </div>
                    </article>
                </div>
            </div>
        </ScrollArea>

        <div v-if="activeSubTab === 'buffs'" class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
            <p class="text-[11px] tracking-wide text-base-content/50">
                {{ $t("db-transcendence.journey.buff_count", { count: buffLevelCount }) }}
            </p>
        </div>
    </div>
</template>