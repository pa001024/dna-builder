<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import {
    applyFinalMasterwork,
    getCraftAvailability,
    getGearCraftState,
    getGearFinalMasterworkTargets,
    getMasterworkMax,
    setGearMasterworkLevel,
    type TranscendGearItemConfig,
} from "@/data"
import { type CraftRng, getCraftConditionText, getCraftGateTextKey, pickFinalMasterworkTargetIndex } from "@/utils/transcend-gear/craft"
import { getItemAffixLines } from "@/utils/transcend-gear/display"
import { getAffixById, getAffixSummaryParts } from "@/utils/transcendence-gear"
import TranscendCraftCost from "./TranscendCraftCost.vue"

/**
 * 精锻 tab：精锻等级用滑杆拖拽或「MAX」一键满级（不是逐级点击），满级后自动进入最终精锻。
 * 随机 / 重置最终精锻对应游戏内行为（游戏内可重 roll 目标）；手动指定为模拟器操作（可复现指定结果）。
 * 随机只在手动点击时触发；撤销恢复上一份精锻等级 / 最终目标。
 */
const props = defineProps<{
    item: TranscendGearItemConfig
    slotId: number
    /** 构筑位角色 id（词条角色门控划线；0 表示无角色上下文） */
    charId: number
    preserveUnknown: boolean
    rng?: CraftRng
    canUndo: boolean
}>()

const emit = defineEmits<{
    (event: "apply", item: TranscendGearItemConfig): void
    (event: "undo"): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const state = computed(() => getGearCraftState(props.item, undefined, { preserveUnknown: props.preserveUnknown }))
const max = computed(() => getMasterworkMax())
const isFinal = computed(() => state.value.masterworkLevel >= max.value)
const lines = computed(() => getItemAffixLines(props.item, props.slotId))
/** 本次随机到的目标行下标（按位置定位，同 id 双行不串行） */
const lastRolledAffixIndex = ref<number | undefined>(undefined)
const lastRolledAffixId = computed(() => {
    const index = lastRolledAffixIndex.value
    return index === undefined ? undefined : props.item.affixes[index]?.affixId
})

/** 滑杆本地等级：拖动时先更新显示，松手后再提交 */
const level = ref(state.value.masterworkLevel)
watch(
    () => state.value.masterworkLevel,
    value => {
        level.value = value
    }
)

/** craft 1 / 2 的可用性 */
const availability1 = computed(() => getCraftAvailability(props.item, 1, undefined, { preserveUnknown: props.preserveUnknown }))
const availability2 = computed(() => getCraftAvailability(props.item, 2, undefined, { preserveUnknown: props.preserveUnknown }))

/** 门槛文案 */
const gate1 = computed(() => {
    const key = getCraftGateTextKey(availability1.value.reason)
    return key ? t(key) : ""
})
const gate2 = computed(() => {
    const key = getCraftGateTextKey(availability2.value.reason)
    return key ? t(key) : ""
})

/** 官方条件原文（只展示） */
const condition1 = computed(() => getCraftConditionText(1, gt))
const condition2 = computed(() => getCraftConditionText(2, gt))

/**
 * 词缀展示名（按摘要分段翻译）。
 * @param affixId 词缀 id
 * @returns 展示名
 */
function affixName(affixId: number | undefined): string {
    const affix = affixId === undefined ? undefined : getAffixById(affixId)
    if (!affix) return t("transcend-build.gear_unknown")
    const parts = getAffixSummaryParts(affix).map(part => gt(part)).filter(Boolean)
    return parts.join(" · ")
}

/** 当前最终精锻目标词缀 id */
const finalAffixId = computed(() => {
    const index = state.value.finalMasterworkAffixIndex
    return index === undefined ? undefined : props.item.affixes[index]?.affixId
})

/** 当前最终精锻目标行：按 craft 下标定位（同 id 随机 / 淬炼双行不串行） */
const finalLine = computed(() => {
    const index = state.value.finalMasterworkAffixIndex
    return index === undefined ? undefined : lines.value.find(line => line.affixIndex === index)
})

/** 最终精锻手动选择项：有 MaxAffixUpdateFunc 的现存词缀；同 affixId 只出现一个选项 */
const finalTargetOptions = computed(() => {
    const seen = new Set<number>()
    return getGearFinalMasterworkTargets(props.item, undefined, { preserveUnknown: props.preserveUnknown }).flatMap(index => {
        const roll = props.item.affixes[index]
        if (!roll || seen.has(roll.affixId)) return []
        seen.add(roll.affixId)
        return [{ value: roll.affixId, label: affixName(roll.affixId) }]
    })
})

/** 滑杆拖动中的等级显示 */
function onLevelInput(event: Event): void {
    level.value = Number((event.target as HTMLInputElement).value)
}

/** 松手提交精锻等级；不满级时数据层自动清除最终精锻目标 */
function commitLevel(): void {
    const next = setGearMasterworkLevel(props.item, level.value, undefined, { preserveUnknown: props.preserveUnknown })
    if (next !== props.item) emit("apply", next)
    else level.value = state.value.masterworkLevel
}

/** MAX 一键满级：与滑杆松手同路径提交（撤销点 / 回写一致） */
function maxLevel(): void {
    level.value = max.value
    commitLevel()
}

/** 手动选择最终精锻目标；0 = 清除 */
function selectFinalTarget(value: string | number): void {
    const affixId = Math.round(Number(value))
    if (!affixId) {
        resetFinalMasterwork()
        return
    }
    const index = props.item.affixes.findIndex(roll => roll.affixId === affixId)
    if (index < 0) return
    const next = applyFinalMasterwork(props.item, index, undefined, { preserveUnknown: props.preserveUnknown })
    if (next === props.item) return
    lastRolledAffixIndex.value = undefined
    emit("apply", next)
}

/** 手动随机最终精锻目标（不自动触发；可重复点击重掷） */
function randomFinalMasterwork(): void {
    const index = pickFinalMasterworkTargetIndex(props.item, { preserveUnknown: props.preserveUnknown }, props.rng)
    if (index === undefined) return
    const target = props.item.affixes[index]
    const next = applyFinalMasterwork(props.item, index, undefined, { preserveUnknown: props.preserveUnknown })
    if (next === props.item || !target) return
    lastRolledAffixIndex.value = index
    emit("apply", next)
}

/** 重置最终精锻（游戏内重选 / 重 roll 目标）：清除目标 */
function resetFinalMasterwork(): void {
    const next = applyFinalMasterwork(props.item, null, undefined, { preserveUnknown: props.preserveUnknown })
    if (next === props.item) return
    lastRolledAffixIndex.value = undefined
    emit("apply", next)
}

/** 撤销上一份精锻等级 / 最终目标 */
function undoCraft(): void {
    lastRolledAffixIndex.value = undefined
    emit("undo")
}

/** 本次随机到的目标行（按行下标定位） */
const rolledLine = computed(() => {
    const index = lastRolledAffixIndex.value
    return index === undefined ? undefined : lines.value.find(line => line.affixIndex === index)
})
</script>

<template>
    <div class="space-y-2" data-craft-panel="finalforge" :data-forge-stage="isFinal ? 'final' : 'masterwork'">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_tab_final_forge") }}</span>
            <span class="text-[10px] leading-relaxed text-base-content/40" data-forge-desc>
                {{ isFinal ? $t("transcend-build.craft_refine_final_desc") : $t("transcend-build.craft_refine_desc") }}
            </span>
            <span
                v-if="!(isFinal ? availability2.available : availability1.available)"
                class="text-[10px] text-warning/80"
                :data-craft-gate="isFinal ? 2 : 1"
            >
                {{ isFinal ? gate2 : gate1 }}
            </span>
            <button type="button" class="btn btn-ghost btn-xs ml-auto" :disabled="!canUndo" data-forge-undo @click="undoCraft">
                <Icon icon="ri:history-line" class="size-3.5" />
                {{ $t("transcend-build.craft_undo") }}
            </button>
        </div>

        <div v-if="!isFinal" class="rounded-xs border border-base-content/12 bg-base-100/50 p-2" data-create-craft="1">
            <div class="flex flex-wrap items-center gap-2">
                <span class="font-orbitron text-[12px] font-semibold text-primary" data-craft-masterwork-level>
                    {{ level }} / {{ max }}
                </span>
                <button
                    type="button"
                    class="btn btn-xs btn-outline font-orbitron"
                    :disabled="!availability1.available"
                    :title="availability1.available ? undefined : gate1"
                    data-forge-max
                    @click="maxLevel"
                >
                    MAX
                </button>
                <span v-if="condition1" class="text-[10px] text-base-content/40">
                    {{ $t("transcend-build.craft_condition") }} · {{ condition1 }}
                </span>
                <TranscendCraftCost :craft-id="1" :state="state" class="ml-auto" />
            </div>
            <label class="mt-1.5 flex items-center gap-2 text-[10px] text-base-content/45">
                <input
                    :value="level"
                    type="range"
                    :min="0"
                    :max="max"
                    step="1"
                    class="range range-primary range-xs min-w-0 flex-1"
                    :disabled="!availability1.available"
                    data-forge-masterwork-range
                    @input="onLevelInput"
                    @change="commitLevel"
                />
            </label>
        </div>

        <div v-else class="rounded-xs border border-base-content/12 bg-base-100/50 p-2" data-create-craft="2">
            <div class="flex flex-wrap items-center gap-2">
                <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_final_masterwork") }}</span>
                <span class="font-orbitron text-[12px] font-semibold text-primary" data-craft-masterwork-level>{{ state.masterworkLevel }} / {{ max }}</span>
                <span v-if="condition2" class="text-[10px] text-base-content/40">
                    {{ $t("transcend-build.craft_condition") }} · {{ condition2 }}
                </span>
                <TranscendCraftCost :craft-id="2" :state="state" class="ml-auto" />
            </div>

            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button type="button" class="btn btn-xs btn-outline" :disabled="!availability2.available" data-forge-random @click="randomFinalMasterwork">
                    <Icon icon="ri:exchange-line" class="size-3.5" />
                    {{ $t("transcend-build.craft_random") }}
                </button>
                <span class="inline-flex items-center gap-1 rounded-xs border border-base-content/15 px-1 py-0.5" data-forge-manual-entry>
                    <SearchSelect
                        :model-value="finalAffixId ?? 0"
                        :options="finalTargetOptions"
                        :label="$t('transcend-build.craft_final_masterwork')"
                        :clear-value="0"
                        :clear-title="$t('transcend-build.craft_final_masterwork_reset')"
                        data-forge-final-select
                        @update:model-value="selectFinalTarget"
                    />
                    <span class="border border-warning/40 px-1 py-px text-[9px] leading-none text-warning/80" data-forge-manual-badge>
                        {{ $t("transcend-build.craft_simulator_only") }}
                    </span>
                </span>
                <button
                    type="button"
                    class="btn btn-xs btn-ghost"
                    :disabled="finalAffixId === undefined"
                    data-forge-final-reset
                    @click="resetFinalMasterwork"
                >
                    <Icon icon="ri:refresh-line" class="size-3.5" />
                    {{ $t("transcend-build.craft_final_masterwork_reset") }}
                </button>
            </div>

            <div v-if="finalLine" class="mt-1.5 space-y-1" data-forge-final-target :data-final-target="finalAffixId">
                <span class="block text-[10px] text-base-content/40">{{ $t("transcend-build.craft_refine_change_affix") }}</span>
                <TranscendGearAffixRow :line="finalLine" :slot-id="slotId" :char-id="charId" :show-roll="false" />
            </div>
            <p v-else-if="!availability2.available" class="mt-1 text-[10px] text-warning/80" data-craft-gate="2">{{ gate2 }}</p>
            <p v-else class="mt-1 text-[10px] text-base-content/40">{{ $t("transcend-build.craft_refine_result_preview") }}</p>

            <div
                v-if="lastRolledAffixId !== undefined"
                class="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-base-content/10 pt-1.5"
                data-forge-rolled
                :data-forge-rolled-id="lastRolledAffixId"
            >
                <span class="text-[10px] text-base-content/45">
                    {{ $t("transcend-build.craft_refine_result", { name: affixName(lastRolledAffixId) }) }}
                </span>
                <span v-if="rolledLine" class="font-orbitron text-[11px] text-primary">{{ rolledLine.valueText }}</span>
            </div>
        </div>
    </div>
</template>
