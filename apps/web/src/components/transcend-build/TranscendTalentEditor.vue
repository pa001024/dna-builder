<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import DBTranscendenceTalentTree from "@/components/DBTranscendenceTalentTree.vue"
import { useGameText } from "@/composables/useGameText"
import { stages, type TranscendBuildSettings, talents } from "@/data"
import { areAllTargetTalentsMaxed, getVisibleTalentStageWarnings } from "@/utils/transcend-build"
import { cleanGameMarkup, formatTalentEffectValue, getTalentIconUrl, getTalentKindLabelKey } from "@/utils/transcendence-display"

/**
 * 升华天赋编辑器（仅主控生效）：复用 U13 天赋树画布，节点等级在右侧详情里编辑。
 * U13 画布只负责浏览/选中（不支持写等级），等级状态由本组件通过 `update-talent-levels` 回传。
 */

const props = defineProps<{
    settings: TranscendBuildSettings
    /** 「包含未开放阶段（理论值）」：只影响页面的全部解锁 / 重置默认值 */
    includeUnreleasedStages: boolean
}>()

const emit = defineEmits<{
    (event: "update-talent-levels", levels: [number, number][]): void
    (event: "update-include-unreleased-stages", value: boolean): void
    /** 全部解锁 / 清空全部：页面按可达口径（或理论口径）切换满级与清空 */
    (event: "toggle-all"): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const activeTreeId = ref(1)
const selectedTalentId = ref(0)

const treeRows = computed(() =>
    [1, 2, 3].map(treeId => ({
        id: treeId,
        name: t(`db-transcendence.talent.stage_${treeId}`),
        nodeCount: talents.filter(talent => talent.stageId === treeId).length,
        locked: !stages.some(stage => stage.id === treeId),
    }))
)

const treeTalents = computed(() => talents.filter(talent => talent.stageId === activeTreeId.value))
const matchSet = computed(() => new Set(treeTalents.value.map(talent => talent.id)))
const selectedTalent = computed(() => talents.find(talent => talent.id === selectedTalentId.value) ?? null)
const currentTreeLocked = computed(() => treeRows.value.find(tree => tree.id === activeTreeId.value)?.locked ?? false)

/** 已投入节点的阶段可达性警告：不阻止编辑，仅提示游戏内不可达 / 当前版本未开放（当前阶段另有说明） */
const stageWarnings = computed(() =>
    getVisibleTalentStageWarnings(props.settings.transcend.talentLevels, activeTreeId.value).map(warning => ({
        key: `${warning.stageId}-${warning.reason}`,
        stageId: warning.stageId,
        name: t(`db-transcendence.talent.stage_${warning.stageId}`),
        messageKey:
            warning.reason === "unreachable" ? "transcend-build.talent_stage_unreachable" : "transcend-build.talent_stage_unreleased",
    }))
)

/** 已投入的节点等级表 */
const levelMap = computed(() => new Map(props.settings.transcend.talentLevels))
/** 目标口径（随理论开关）是否已全部满级：决定工具条按钮走「全部解锁」还是「清空全部」 */
const allTargetTalentsMaxed = computed(() =>
    areAllTargetTalentsMaxed(props.settings.transcend.talentLevels, props.includeUnreleasedStages)
)
/** 已激活（等级 > 0）的节点 id；用于节点激活/未激活配色 */
const activeTalentIds = computed(
    () => new Set([...levelMap.value.entries()].filter(([, level]) => level > 0).map(([id]) => id))
)

/**
 * 取节点已投入等级。
 * @param talentId 节点 id
 * @returns 等级（0 表示未激活）
 */
function levelOf(talentId: number): number {
    return levelMap.value.get(talentId) ?? 0
}

/** 当前选中节点的等级与效果行 */
const selectedLevel = computed(() => (selectedTalent.value ? levelOf(selectedTalent.value.id) : 0))
const effectRows = computed(() => {
    const talent = selectedTalent.value
    if (!talent) return []
    return talent.effects.map(effect => ({
        key: `${effect.index}-${effect.attr}`,
        label: gt(effect.attr),
        addTypeKey: effect.addType === "Rate" ? "db-transcendence.talent.add_type_rate" : "db-transcendence.talent.add_type_value",
        unlockLevel: effect.unlockLevel ?? 1,
        description: cleanGameMarkup(effect.description ? gt(effect.description) : ""),
        value: formatTalentEffectValue(effect, selectedLevel.value),
    }))
})

/** 未激活的前置节点名称（仅提示，不阻止编辑） */
const inactiveParents = computed(() => {
    const talent = selectedTalent.value
    if (!talent?.parentIds?.length) return []
    return talent.parentIds.filter(id => levelOf(id) <= 0).map(id => {
        const parent = talents.find(item => item.id === id)
        return parent ? gt(parent.name) : String(id)
    })
})

/**
 * 写入某个节点的等级（0 表示移除），并钳制到 0..maxLevel。
 * @param talentId 节点 id
 * @param level 目标等级
 */
function setTalentLevel(talentId: number, level: number): void {
    const talent = talents.find(item => item.id === talentId)
    if (!talent) return
    const maxLevel = Math.max(1, Math.round(talent.maxLevel || 1))
    const next = Math.max(0, Math.min(maxLevel, Math.round(Number(level) || 0)))
    const map = new Map(levelMap.value)
    if (next <= 0) {
        map.delete(talentId)
    } else {
        map.set(talentId, next)
    }
    emit(
        "update-talent-levels",
        [...map.entries()].sort((left, right) => left[0] - right[0])
    )
}

/**
 * 在选中节点的等级上加减。
 * @param delta 变化量
 */
function stepSelectedLevel(delta: number): void {
    if (!selectedTalent.value) return
    setTalentLevel(selectedTalent.value.id, selectedLevel.value + delta)
}

/**
 * 清空当前节点的投入。
 */
function clearSelectedLevel(): void {
    if (!selectedTalent.value) return
    setTalentLevel(selectedTalent.value.id, 0)
}

/** 当前树的已投入节点数（用于标题计数） */
const allocatedCount = computed(() => treeTalents.value.filter(talent => levelOf(talent.id) > 0).length)

/**
 * 切换天赋阶段树并清空选中节点。
 * @param treeId 阶段 id
 */
function selectTree(treeId: number): void {
    activeTreeId.value = treeId
    selectedTalentId.value = 0
}
</script>

<template>
    <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
                <button
                    v-for="tree in treeRows"
                    :key="tree.id"
                    type="button"
                    class="btn btn-xs whitespace-nowrap"
                    :class="activeTreeId === tree.id ? 'btn-primary' : ''"
                    @click="selectTree(tree.id)"
                >
                    {{ tree.name }}
                    <span class="font-mono opacity-60">{{ tree.nodeCount }}</span>
                </button>
            </div>
            <div class="flex flex-wrap items-center gap-3">
                <span class="font-mono text-[10px] text-base-content/40">ALLOCATED {{ allocatedCount }} / {{ treeTalents.length }}</span>
                <label
                    class="flex cursor-pointer items-center gap-2 text-[12px]"
                    :title="$t('transcend-build.talent_include_unreleased_hint')"
                >
                    <input
                        type="checkbox"
                        class="toggle toggle-primary toggle-xs"
                        :checked="includeUnreleasedStages"
                        @change="emit('update-include-unreleased-stages', ($event.target as HTMLInputElement).checked)"
                    />
                    {{ $t("transcend-build.talent_include_unreleased") }}
                </label>
                <button
                    type="button"
                    class="btn btn-xs"
                    :class="allTargetTalentsMaxed ? 'btn-error btn-outline' : ''"
                    :data-talent-all-action="allTargetTalentsMaxed ? 'clear' : 'unlock'"
                    :title="allTargetTalentsMaxed ? $t('transcend-build.talent_clear_all') : $t('transcend-build.talent_unlock_all')"
                    @click="emit('toggle-all')"
                >
                    <Icon :icon="allTargetTalentsMaxed ? 'ri:delete-bin-6-line' : 'ri:key-2-line'" />
                    {{ allTargetTalentsMaxed ? $t("transcend-build.talent_clear_all") : $t("transcend-build.talent_unlock_all") }}
                </button>
            </div>
        </div>

        <div class="space-y-0.5 text-[10px] leading-relaxed text-base-content/40">
            <p>{{ $t("transcend-build.talent_stage_cumulative_hint") }}</p>
            <p>{{ $t("transcend-build.talent_include_unreleased_hint") }}</p>
        </div>

        <p v-if="currentTreeLocked" class="text-[11px] leading-relaxed text-warning/80">{{ $t("transcend-build.talent_stage_locked") }}</p>
        <ul v-if="stageWarnings.length" class="space-y-1 text-[11px] leading-relaxed text-warning/80">
            <li v-for="warning in stageWarnings" :key="warning.key">{{ warning.name }} · {{ $t(warning.messageKey) }}</li>
        </ul>

        <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div class="flex h-105 min-h-0 flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/40">
                <DBTranscendenceTalentTree
                    v-if="treeTalents.length"
                    :talents="treeTalents"
                    :selected-id="selectedTalentId"
                    :match-set="matchSet"
                    :active-ids="activeTalentIds"
                    @select="selectedTalentId = $event"
                />
                <p v-else class="flex flex-1 items-center justify-center text-sm text-base-content/40">
                    {{ $t("transcend-build.talent_no_data") }}
                </p>
            </div>

            <div class="rounded-xs border border-base-content/10 bg-base-100/60 p-2.5 backdrop-blur-sm">
                <template v-if="selectedTalent">
                    <div class="flex items-start gap-2.5">
                        <ImageFallback
                            :src="getTalentIconUrl(selectedTalent.icon)"
                            :alt="gt(selectedTalent.name)"
                            class="size-10 shrink-0 rounded-xs object-cover"
                        >
                            <span class="text-sm">{{ gt(selectedTalent.name).slice(0, 1) }}</span>
                        </ImageFallback>
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-[13px] font-semibold">{{ gt(selectedTalent.name) }}</p>
                            <p class="text-[10px] tracking-wide text-base-content/45">
                                {{ $t(getTalentKindLabelKey(selectedTalent.kind)) }} · MAX LV {{ selectedTalent.maxLevel }}
                            </p>
                        </div>
                    </div>

                    <div class="mt-3 flex items-center gap-2">
                        <button type="button" class="btn btn-xs" :disabled="selectedLevel <= 0" @click="stepSelectedLevel(-1)">−</button>
                        <input
                            :value="selectedLevel"
                            type="number"
                            min="0"
                            :max="selectedTalent.maxLevel"
                            class="w-16 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-center font-mono text-[13px] outline-none focus:border-primary"
                            @change="setTalentLevel(selectedTalent.id, Number(($event.target as HTMLInputElement).value))"
                        />
                        <button
                            type="button"
                            class="btn btn-xs"
                            :disabled="selectedLevel >= selectedTalent.maxLevel"
                            @click="stepSelectedLevel(1)"
                        >
                            +
                        </button>
                        <span class="font-mono text-[10px] text-base-content/40">/ {{ selectedTalent.maxLevel }}</span>
                        <button type="button" class="btn btn-ghost btn-xs ml-auto" @click="clearSelectedLevel">
                            {{ $t("transcend-build.talent_clear") }}
                        </button>
                    </div>

                    <p v-if="inactiveParents.length" class="mt-2 text-[11px] leading-relaxed text-warning/80">
                        {{ $t("transcend-build.talent_need_parent", { nodes: inactiveParents.join(" / ") }) }}
                    </p>

                    <p class="mt-2 text-[11px] leading-relaxed text-base-content/55">{{ gt(selectedTalent.desc) }}</p>

                    <div class="mt-2 space-y-1.5">
                        <div
                            v-for="effect in effectRows"
                            :key="effect.key"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5"
                            :class="effect.value === null ? 'opacity-50' : ''"
                        >
                            <div class="flex items-center gap-1.5">
                                <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/80">{{ effect.label }}</span>
                                <span class="border border-base-content/20 px-1 py-px text-[9px] leading-none text-base-content/50">
                                    {{ $t(effect.addTypeKey) }}
                                </span>
                                <span v-if="effect.value !== null" class="font-orbitron text-[11px] font-semibold text-primary">
                                    {{ effect.value }}
                                </span>
                            </div>
                            <p v-if="effect.value === null" class="mt-0.5 text-[10px] text-base-content/45">
                                {{ $t("transcend-build.talent_unlock_hint", { level: effect.unlockLevel }) }}
                            </p>
                        </div>
                        <p v-if="!effectRows.length" class="text-[11px] text-base-content/40">{{ $t("common.no_data") }}</p>
                    </div>
                </template>
                <p v-else class="flex h-full items-center justify-center text-center text-[11px] leading-relaxed text-base-content/40">
                    {{ $t("transcend-build.talent_selected_none") }}
                </p>
            </div>
        </div>
    </div>
</template>
