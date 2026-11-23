<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, watch } from "vue"
import DBTranscendenceTalentTree from "@/components/DBTranscendenceTalentTree.vue"
import type { FilterSelectOption } from "@/components/FilterSelect.vue"
import { useGameText } from "@/composables/useGameText"
import { useSearchParam } from "@/composables/useSearchParam"
import { resourceMap } from "@/data/d"
import { levels, stages, talents, talentTrees } from "@/data/d/dnaseasonprogress.data"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { getTalentKindLabelKey } from "@/utils/transcendence-display"
import { computeTalentMatchSet } from "@/utils/transcendence-talent-tree"

/** 等级曲线行高（px） */
const LEVEL_ROW_HEIGHT = 44

const { t } = useTranslation()
const { gt } = useGameText()

const treeId = useSearchParam<number>("tree", 1)
const view = useSearchParam<string>("view", "nodes")
const kind = useSearchParam<number>("kind", 0)
const maxLevelFilter = useSearchParam<number>("ml", 0)
const searchKeyword = useSearchParam<string>("kw", "")
const selectedTalentId = useSearchParam<number>("id", 0)

/** 视图只有 nodes / levels 两种；非法值（手改 URL / 前进后退）归一为 nodes 并清掉脏 query */
const activeView = computed(() => (view.value === "levels" ? "levels" : "nodes"))
watch(
    view,
    value => {
        if (value !== "nodes" && value !== "levels") {
            view.value = "nodes"
        }
    },
    { immediate: true }
)

/** 三棵树与阶段一一对应；名称统一取官方 Title_TopLevel_* 文案，阶段二/三无 TopStage 元数据时标未开放 */
const treeRows = computed(() =>
    talentTrees.map(tree => {
        const stage = stages.find(item => item.id === tree.id)
        const nameKey = `db-transcendence.talent.stage_${tree.id}`

        return {
            id: tree.id,
            nodeCount: talents.filter(talent => talent.stageId === tree.id).length,
            name: tree.id >= 1 && tree.id <= 3 ? t(nameKey) : t("db-transcendence.talent.tree"),
            locked: !stage,
        }
    })
)

/** 无效 tree 参数（手改 URL）回落到第一棵树 */
const activeTreeId = computed(() =>
    treeRows.value.some(tree => tree.id === treeId.value) ? treeId.value : (treeRows.value[0]?.id ?? 1)
)

const currentTree = computed(() => treeRows.value.find(tree => tree.id === activeTreeId.value))

const treeTalents = computed(() => talents.filter(talent => talent.stageId === activeTreeId.value))

/** 选中节点变化（含 U4 检索跳转）时按节点所属阶段自动切树 */
watch(
    selectedTalentId,
    id => {
        if (!id) {
            return
        }

        const talent = talents.find(item => item.id === id)

        if (talent && talent.stageId !== activeTreeId.value) {
            treeId.value = talent.stageId
        }

        // 跳到具体节点时回到节点视图，否则等级曲线下看不到目标
        if (talent && activeView.value !== "nodes") {
            view.value = "nodes"
        }
    },
    { immediate: true }
)

/** 等级上限候选值从当前树数据派生，避免写死 1/30 */
const maxLevelValues = computed(() => [...new Set(treeTalents.value.map(talent => talent.maxLevel))].sort((left, right) => left - right))

/** 当前树的节点类型分布：筛选项上直接显示数量 */
const kindRows = computed(() => {
    const counts = new Map<number, number>()

    for (const talent of treeTalents.value) {
        counts.set(talent.kind, (counts.get(talent.kind) ?? 0) + 1)
    }

    return [2, 3, 4].map(nodeKind => ({
        kind: nodeKind,
        count: counts.get(nodeKind) ?? 0,
        labelKey: getTalentKindLabelKey(nodeKind),
    }))
})

const treeOptions = computed<FilterSelectOption[]>(() =>
    treeRows.value.map(tree => ({ value: tree.id, label: tree.name, count: tree.nodeCount }))
)

const viewOptions = computed<FilterSelectOption[]>(() => [
    { value: "nodes", label: t("db-transcendence.talent.view_nodes") },
    { value: "levels", label: t("db-transcendence.talent.view_levels") },
])

const kindOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...kindRows.value.map(row => ({ value: row.kind, label: t(row.labelKey), count: row.count })),
])

const maxLevelOptions = computed<FilterSelectOption[]>(() => [
    { value: 0, label: t("common.all") },
    ...maxLevelValues.value.map(levelValue => ({
        value: levelValue,
        label: t("db-transcendence.talent.max_lv", { level: levelValue }),
    })),
])

/** FilterSelect 值域是 string | number，这里按各参数的类型窄化写回 */
const treeFilterValue = computed<string | number>({
    get: () => activeTreeId.value,
    set: value => switchTree(Number(value)),
})

const viewFilterValue = computed<string | number>({
    get: () => activeView.value,
    set: value => {
        if (value === "nodes" || value === "levels") {
            view.value = value
        }
    },
})

const kindFilterValue = computed<string | number>({
    get: () => kind.value,
    set: value => {
        if (typeof value === "number") {
            kind.value = value
        }
    },
})

const maxLevelFilterValue = computed<string | number>({
    get: () => maxLevelFilter.value,
    set: value => {
        if (typeof value === "number") {
            maxLevelFilter.value = value
        }
    },
})

/** 按类型/等级/关键词计算命中集合；树形图只做变暗，不改布局 */
const matchSet = computed(() =>
    computeTalentMatchSet(
        treeTalents.value,
        { kind: kind.value, maxLevel: maxLevelFilter.value, keyword: searchKeyword.value },
        gt
    )
)

/** 当前树的命中节点（保持上游 position 顺序，用于计数与空态判断） */
const filteredTalents = computed(() => treeTalents.value.filter(talent => matchSet.value.has(talent.id)))

const selectedTalent = computed(() => talents.find(talent => talent.id === selectedTalentId.value) ?? null)

/** 选中节点：点击后设置 `?id=`，跨树由下方 watch 切换 */
function selectTalent(id: number): void {
    selectedTalentId.value = id
}

const levelRows = computed(() =>
    levels
        .filter(row => row.stageId === activeTreeId.value)
        .sort((left, right) => left.level - right.level)
        .map(row => {
            const resource = resourceMap.get(row.reward.id)

            return {
                level: row.level,
                requiredExp: row.requiredExp,
                cap: Boolean(row.stageCap),
                rewardName: resource ? gt(resource.name) : `#${row.reward.id}`,
                rewardIcon: resource ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp",
                rewardRarity: resource?.rarity ?? 1,
                rewardCount: row.reward.count,
            }
        })
)

/**
 * 切换天赋树：节点 id 与搜索词都跨树失效，必须清空。
 * @param id 目标阶段/树 id
 */
function switchTree(id: number): void {
    if (activeTreeId.value === id) {
        return
    }

    treeId.value = id
    selectedTalentId.value = 0
    searchKeyword.value = ""
}

/** 手改 `?tree=` 时，选中节点若不属于目标树则清理，避免详情与画布不同步（深链自动切树不会触发） */
watch(treeId, id => {
    const talent = talents.find(item => item.id === selectedTalentId.value)

    if (talent && talent.stageId !== id) {
        selectedTalentId.value = 0
    }
})
</script>

<template>
    <div class="h-full flex flex-col">
        <!-- 搜索 + 筛选：天赋树 / 视图 / 节点类型 / 等级上限 -->
        <div class="flex-none space-y-3 border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
            <DbSearchBox
                v-if="activeView === 'nodes'"
                v-model="searchKeyword"
                :placeholder="$t('db-transcendence.talent.search_placeholder')"
                :count="filteredTalents.length"
            />
            <div class="flex flex-wrap gap-1.5">
                <FilterSelect
                    v-model="treeFilterValue"
                    :options="treeOptions"
                    :label="$t('db-transcendence.talent.tree')"
                    :clearable="false"
                />
                <FilterSelect
                    v-model="viewFilterValue"
                    :options="viewOptions"
                    :label="$t('db-transcendence.talent.view')"
                    :clearable="false"
                />
                <template v-if="activeView === 'nodes'">
                    <FilterSelect
                        v-model="kindFilterValue"
                        :options="kindOptions"
                        :label="$t('common.type')"
                        :clear-value="0"
                        :clear-title="$t('common.clear')"
                    />
                    <FilterSelect
                        v-model="maxLevelFilterValue"
                        :options="maxLevelOptions"
                        :label="$t('db-transcendence.talent.max_level')"
                        :clear-value="0"
                        :clear-title="$t('common.clear')"
                    />
                </template>
            </div>
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] leading-relaxed text-base-content/40">
                <span v-if="currentTree?.locked" class="rounded-xs border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-warning">
                    {{ $t("db-transcendence.talent.stage_locked") }}
                </span>
                <span v-if="!levelRows.length">{{ $t("db-transcendence.talent.stage_data_note") }}</span>
                <span v-if="activeTreeId > 1">{{ $t("db-transcendence.talent.stage_gate_hint") }}</span>
                <span>{{ $t("db-transcendence.talent.stage_order_hint") }}</span>
            </p>
        </div>

        <!-- 节点视图：左列表 + 右详情 -->
        <div v-if="activeView === 'nodes'" class="flex min-h-0 flex-1 flex-col">
            <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedTalent)" @collapse="selectedTalentId = 0">
                <template #master>
                    <div
                        class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                        :class="{ 'sm:border-r border-base-content/10': selectedTalent }"
                    >
                        <div v-if="!treeTalents.length" class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">
                            {{ $t("common.no_data") }}
                        </div>
                        <DBTranscendenceTalentTree
                            v-else
                            class="flex-1"
                            :talents="treeTalents"
                            :selected-id="selectedTalentId"
                            :match-set="matchSet"
                            :stage-locked="Boolean(currentTree?.locked)"
                            @select="selectTalent"
                        />

                        <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                            <p class="text-[11px] tracking-wide text-base-content/50">
                                {{ $t("common.total_count") }}
                                <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredTalents.length }}</b>
                                {{ $t("db-transcendence.talent.node_count") }}
                            </p>
                            <p v-if="!selectedTalent" class="text-[11px] text-base-content/40">{{ $t("db-transcendence.talent.select_hint") }}</p>
                        </div>
                    </div>
                </template>
                <template #detail>
                    <ScrollArea v-if="selectedTalent" class="min-h-0 min-w-0 flex-1">
                        <DBTranscendenceTalentDetailItem
                            :key="selectedTalent.id"
                            :talent="selectedTalent"
                            navigation="select"
                            @select="selectTalent"
                        />
                    </ScrollArea>
                </template>
            </SplitView>
        </div>

        <!-- 等级曲线：1–100 升华等级 -->
        <div v-else class="flex min-h-0 flex-1 flex-col">
            <div v-if="!levelRows.length" class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">
                {{ $t("db-transcendence.talent.curve_missing") }}
            </div>
            <template v-else>
                <div class="flex flex-none items-center gap-2 border-b border-base-content/15 px-4 py-2 text-[11px] text-base-content/45">
                    <span class="w-16 shrink-0">{{ $t("common.level") }}</span>
                    <span class="w-32 shrink-0">{{ $t("db-transcendence.talent.curve_exp") }}</span>
                    <span class="min-w-0 flex-1">{{ $t("db-transcendence.talent.curve_reward") }}</span>
                    <span class="shrink-0">{{ $t("db-transcendence.talent.curve_cap") }}</span>
                </div>
                <VirtualList
                    class="flex-1"
                    :items="levelRows"
                    :item-height="LEVEL_ROW_HEIGHT"
                    :item-key="row => row.level"
                    :active-index="null"
                    v-slot="{ item: row, animate }"
                >
                    <div
                        class="flex items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/60 px-3 py-2 backdrop-blur-sm"
                        :class="animate ? 'animate-ef-rise motion-reduce:animate-none' : ''"
                        :style="{ minHeight: `${LEVEL_ROW_HEIGHT - 8}px` }"
                    >
                        <span class="w-16 shrink-0 font-orbitron text-[12px] font-semibold text-base-content/65">
                            {{ $t("db-transcendence.talent.max_lv", { level: row.level }) }}
                        </span>
                        <span class="w-32 shrink-0 text-[11px] text-base-content/50">
                            {{ $t("db-transcendence.talent.curve_exp") }}
                            <b class="font-orbitron text-[11px] font-semibold text-primary">{{ row.requiredExp }}</b>
                        </span>
                        <span class="flex min-w-0 items-center gap-1.5">
                            <ImageFallback :src="row.rewardIcon" :alt="row.rewardName" class="size-5 shrink-0 overflow-hidden rounded-xs">
                                <span class="size-5 shrink-0 rounded-xs" :class="getRarityGradientClass(row.rewardRarity)" />
                            </ImageFallback>
                            <span class="truncate text-[11px] text-base-content/65">{{ row.rewardName }}</span>
                            <span class="font-orbitron text-[11px] font-semibold text-base-content/55">×{{ row.rewardCount }}</span>
                        </span>
                        <span
                            v-if="row.cap"
                            class="ml-auto shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                        >
                            {{ $t("db-transcendence.talent.curve_cap") }}
                        </span>
                    </div>
                </VirtualList>
            </template>
        </div>
    </div>
</template>