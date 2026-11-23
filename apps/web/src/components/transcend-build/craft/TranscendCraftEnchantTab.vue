<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import SearchSelect from "@/components/SearchSelect.vue"
import { useGameText } from "@/composables/useGameText"
import {
    applyEnchant,
    type DnaSeasonAffix,
    getCraftAvailability,
    getGearCraftState,
    resetEnchant,
    type TranscendGearItemConfig,
} from "@/data"
import {
    type CraftRng,
    type EnchantCandidateRoll,
    getCraftConditionText,
    getCraftGateTextKey,
    getEnchantAffixPool,
    getEnchantFlow,
    pickDistinct,
    pickEnchantRolls,
    pickRandomEnchantRoll,
    shouldPreviewFinalMasterwork,
} from "@/utils/transcend-gear/craft"
import { getAffixFinalValueText, getItemAffixLines } from "@/utils/transcend-gear/display"
import { getAffixRollRange } from "@/utils/transcend-gear/generation"
import { getAffixById, getAffixSummaryParts } from "@/utils/transcendence-gear"
import TranscendCraftCost from "./TranscendCraftCost.vue"

/**
 * 附魔 tab（两段式）：选择被替换词缀 → 首次附魔官方确认 → 生成 2 个候选 + 保持原状。
 * 「随机」为词条选择区前的可切换选项：点击附魔 = 池内随机 1 条并随机 roll（单条结果可确认）。
 * 「自定义」手动指定词条与档位立即替换当前目标。已附魔时目标槽固定；重置为模拟器功能。
 */
const props = defineProps<{
    item: TranscendGearItemConfig
    charId: number
    slotId: number
    preserveUnknown: boolean
    rng?: CraftRng
}>()

const emit = defineEmits<{
    (event: "apply", item: TranscendGearItemConfig): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const state = computed(() => getGearCraftState(props.item, undefined, { preserveUnknown: props.preserveUnknown }))
const flow = computed(() => getEnchantFlow(props.item, { preserveUnknown: props.preserveUnknown }))
const lines = computed(() => getItemAffixLines(props.item, props.slotId))
const availability = computed(() => getCraftAvailability(props.item, 4, undefined, { preserveUnknown: props.preserveUnknown }))
const condition = computed(() => getCraftConditionText(4, gt))
const gate = computed(() => {
    const key = getCraftGateTextKey(availability.value.reason)
    return key ? t(key) : ""
})

const snapshotAffixId = computed(() => state.value.enchantSnapshot?.roll.affixId)

type EnchantPhase = "idle" | "confirm" | "candidates"
const phase = ref<EnchantPhase>("idle")
const targetIndex = ref<number | undefined>(undefined)
const candidates = ref<EnchantCandidateRoll[]>([])
/** 选中的候选下标；等于 candidates.length 表示「保持原状」 */
const selectedIndex = ref(0)
/** 候选池不足（本地数据限制），显示空态 */
const noCandidates = ref(false)
/** 随机模式：词条由池内随机挑选并随机 roll */
const randomMode = ref(false)

/** 自定义弹层状态 */
const customOpen = ref(false)
const customConfirming = ref(false)
const customAffixId = ref(0)
const customRollLevel = ref(1)

/**
 * 词缀展示名。
 * @param affix 词缀
 * @returns 展示文本
 */
function affixName(affix: DnaSeasonAffix | undefined): string {
    if (!affix) return t("transcend-build.gear_unknown")
    const parts = getAffixSummaryParts(affix).map(part => gt(part)).filter(Boolean)
    return parts.join(" · ")
}

/**
 * 词缀下标对应的预览行。
 * @param index 词缀下标
 * @returns 预览行；缺失时 undefined
 */
function lineAt(index: number | undefined) {
    if (index === undefined) return undefined
    return lines.value.find(line => line.affixIndex === index)
}

/** 可替换目标行 */
const targetOptions = computed(() =>
    flow.value.targets.flatMap(index => {
        const line = lineAt(index)
        return line ? [{ index, line }] : []
    })
)

/** 当前附魔行 */
const enchantLine = computed(() => {
    const index = flow.value.enchantAffixIndex
    return index === undefined ? undefined : lineAt(index)
})

/** 当前附魔词缀 id */
const enchantAffixId = computed(() => (enchantLine.value ? enchantLine.value.roll.affixId : undefined))

/** 当前选中的目标（已附魔时固定为附魔行） */
const selectedTarget = computed(() => (flow.value.stage === "replace" ? flow.value.enchantAffixIndex : targetIndex.value))

/** 候选阶段展示的被替换词缀行（首次附魔时候选区同样展示） */
const candidateTargetLine = computed(() => lineAt(selectedTarget.value))

/** 基础强度（候选数值展示与 roll 区间用） */
const strength = computed(() => Math.max(1, Math.round(Number(props.item.equipBaseScore) || 1)))

/**
 * 候选展示数值（与 apply 写入使用同一档位）。
 * @param candidate 候选结果
 * @returns 数值文本
 */
function candidateValue(candidate: EnchantCandidateRoll): string {
    return getAffixFinalValueText(
        candidate.affix,
        {
            affixId: candidate.affix.id,
            rollLevel: candidate.rollLevel,
            masterworkLevel: state.value.masterworkLevel,
            ancient: false,
            finalMasterwork: shouldPreviewFinalMasterwork(state.value, selectedTarget.value, candidate.affix),
        },
        props.slotId
    )
}

/** 是否可提交附魔（已选目标，或随机模式下存在可随机目标） */
const canConfirm = computed(
    () =>
        phase.value === "idle" &&
        availability.value.available &&
        (selectedTarget.value !== undefined || (randomMode.value && flow.value.targets.length > 0))
)

/** 词条区提示：随机模式 / 替换阶段目标固定 / 首次选择目标 */
const enchantModeHint = computed(() => {
    if (randomMode.value) return t("transcend-build.craft_enchant_random_hint")
    if (flow.value.stage === "replace") return t("transcend-build.craft_enchant_target_fixed")
    return t("transcend-build.craft_enchant_select_hint")
})

/** 切换随机模式（词条由池内随机挑选，目标仍可按普通目标选择） */
function toggleRandomMode(): void {
    randomMode.value = !randomMode.value
    noCandidates.value = false
}

/**
 * 解析本次附魔的替换目标：优先已选目标；随机模式下未选目标时从合法目标中随机一个。
 * @returns 目标下标；没有可用目标时 undefined
 */
function resolveTargetIndex(): number | undefined {
    const index = selectedTarget.value
    if (index !== undefined) return index
    if (!randomMode.value) return undefined
    const picked = pickDistinct(flow.value.targets, 1, props.rng)[0]
    if (picked !== undefined) targetIndex.value = picked
    return picked
}

/**
 * 生成附魔候选：随机模式 = 单条随机结果；手动模式 = 2 条候选各自随机档位。
 */
function startCandidates(): void {
    const index = resolveTargetIndex()
    if (index === undefined) return
    const target = props.item.affixes[index]
    if (!target) return
    const request = {
        slotType: props.item.slotType,
        charId: props.charId,
        presentAffixIds: props.item.affixes.map(roll => roll.affixId),
        excludeAffixId: target.affixId,
        reservedAffixId: snapshotAffixId.value,
        count: 1,
    }
    if (randomMode.value) {
        const picked = pickRandomEnchantRoll(request, strength.value, props.rng)
        candidates.value = picked ? [picked] : []
        selectedIndex.value = 0
    } else {
        candidates.value = pickEnchantRolls({ ...request, count: 2 }, strength.value, props.rng)
        selectedIndex.value = candidates.value.length
    }
    noCandidates.value = candidates.value.length === 0
    phase.value = candidates.value.length ? "candidates" : "idle"
}

/** 生成候选（首次附魔需先经过官方确认弹窗） */
function confirmEnchant(): void {
    if (!canConfirm.value) return
    if (flow.value.needsFirstConfirm) {
        phase.value = "confirm"
        return
    }
    startCandidates()
}

/**
 * 选择被替换词缀（首次附魔阶段）。
 * @param index 词缀下标
 */
function selectTarget(index: number): void {
    targetIndex.value = index
    noCandidates.value = false
}

/** 确认首次附魔（官方 100456 文案语义） */
function confirmFirstEnchant(): void {
    startCandidates()
}

/** 取消首次确认 */
function cancelFirstEnchant(): void {
    phase.value = "idle"
}

/** 应用选中的候选；选择「保持原状」时不修改装备、不返还消耗 */
function applySelected(): void {
    const index = selectedTarget.value
    if (index === undefined) return
    if (selectedIndex.value >= candidates.value.length) {
        cancelCandidates()
        return
    }
    const candidate = candidates.value[selectedIndex.value]
    if (!candidate) return
    const next = applyEnchant(props.item, index, { affixId: candidate.affix.id, rollLevel: candidate.rollLevel })
    phase.value = "idle"
    candidates.value = []
    noCandidates.value = false
    if (next !== props.item) emit("apply", next)
}

/** 取消候选（等同保持原状） */
function cancelCandidates(): void {
    phase.value = "idle"
    candidates.value = []
    noCandidates.value = false
}

/** 自定义不可用原因；可用时为空串 */
const customDisabledReason = computed(() => {
    if (!availability.value.available) return gate.value
    if (selectedTarget.value === undefined) return t("transcend-build.craft_enchant_select_hint")
    return ""
})

/** 自定义可 roll 词缀池（与随机 / 候选同一过滤口径） */
const customOptions = computed(() =>
    getEnchantAffixPool({
        slotType: props.item.slotType,
        charId: props.charId,
        presentAffixIds: props.item.affixes.map(roll => roll.affixId),
        excludeAffixId: lineAt(selectedTarget.value)?.roll.affixId,
        reservedAffixId: snapshotAffixId.value,
    }).map(affix => ({ value: affix.id, label: affixName(affix) }))
)

/** 自定义选中的词缀 */
const customAffix = computed(() => getAffixById(customAffixId.value))

/** 自定义档位范围（强度对应区间） */
const customRange = computed(() => (customAffix.value ? getAffixRollRange(customAffix.value, strength.value) : { min: 1, max: 1 }))

/** 自定义数值文本（最终值） */
const customValueText = computed(() =>
    customAffix.value
        ? getAffixFinalValueText(
              customAffix.value,
              {
                  affixId: customAffix.value.id,
                  rollLevel: customRollLevel.value,
                  masterworkLevel: state.value.masterworkLevel,
                  ancient: false,
                  finalMasterwork: shouldPreviewFinalMasterwork(state.value, selectedTarget.value, customAffix.value),
              },
              props.slotId
          )
        : ""
)

/** 自定义是否可提交 */
const canCustom = computed(() => customDisabledReason.value === "")
const customReady = computed(() => Boolean(customAffix.value))

/** 打开自定义弹层 */
function openCustom(): void {
    if (!canCustom.value) return
    customAffixId.value = 0
    customRollLevel.value = 1
    customConfirming.value = false
    customOpen.value = true
}

/** 关闭自定义弹层 */
function closeCustom(): void {
    customOpen.value = false
    customConfirming.value = false
}

/**
 * 选择自定义词缀（档位默认取区间上限，可继续调整）。
 * @param value 词缀 id（0 = 未选择）
 */
function selectCustomAffix(value: string | number): void {
    const affixId = Math.round(Number(value))
    customAffixId.value = Number.isFinite(affixId) && affixId > 0 ? affixId : 0
    const affix = customAffix.value
    customRollLevel.value = affix ? getAffixRollRange(affix, strength.value).max : 1
}

/**
 * 调整自定义档位到区间内。
 * @param value 目标档位
 */
function adjustCustomRoll(value: number): void {
    const range = customRange.value
    customRollLevel.value = Math.max(range.min, Math.min(range.max, Math.round(Number(value) || range.max)))
}

/** 自定义确认：首次附魔先走官方确认口径 */
function confirmCustom(): void {
    if (!customReady.value) return
    if (flow.value.needsFirstConfirm && !customConfirming.value) {
        customConfirming.value = true
        return
    }
    applyCustomEnchant()
}

/** 立即把当前目标词缀替换为指定词条与档位（计入附魔次数与快照语义） */
function applyCustomEnchant(): void {
    const index = selectedTarget.value
    const affix = customAffix.value
    if (index === undefined || !affix) return
    const next = applyEnchant(props.item, index, { affixId: affix.id, rollLevel: customRollLevel.value })
    closeCustom()
    if (next !== props.item) emit("apply", next)
}

/** 重置附魔（模拟器功能）：恢复附魔前原词缀并清零次数 */
function resetEnchantNow(): void {
    const next = resetEnchant(props.item)
    phase.value = "idle"
    candidates.value = []
    noCandidates.value = false
    targetIndex.value = undefined
    if (next !== props.item) emit("apply", next)
}

watch(
    () => props.item,
    () => {
        phase.value = "idle"
        candidates.value = []
        noCandidates.value = false
        if (flow.value.stage === "replace") targetIndex.value = flow.value.enchantAffixIndex
        else if (targetIndex.value !== undefined && !flow.value.targets.includes(targetIndex.value)) targetIndex.value = undefined
    }
)
</script>

<template>
    <div
        class="space-y-2"
        data-craft-panel="enchant"
        :data-enchant-stage="flow.stage"
        :data-enchant-snapshot-id="snapshotAffixId"
        :data-enchant-current-id="enchantAffixId"
        :data-enchant-random-mode="randomMode ? '1' : '0'"
    >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_tab_enchant") }}</span>
            <span class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_enchant_desc") }}</span>
            <span class="text-[10px] text-base-content/40" data-enchant-count>
                {{ $t("transcend-build.craft_enchant_count", { count: state.enchantCount }) }}
            </span>
            <span v-if="condition" class="text-[10px] text-base-content/40">{{ $t("transcend-build.craft_condition") }} · {{ condition }}</span>
            <span v-if="!availability.available" class="ml-auto text-[10px] text-warning/80" data-craft-gate="4">{{ gate }}</span>
        </div>

        <div class="space-y-2 rounded-xs border border-base-content/12 bg-base-100/50 p-2" data-create-craft="4">
            <div v-if="enchantLine" class="space-y-1" data-craft-enchant-current>
                <span class="block text-[10px] text-base-content/40">{{ $t("transcend-build.craft_enchant_current") }}</span>
                <TranscendGearAffixRow :line="enchantLine" :slot-id="slotId" :char-id="charId" :show-roll="false" />
                <span class="block text-[10px] text-base-content/40">{{ $t("transcend-build.craft_enchant_replace_desc") }}</span>
            </div>

            <template v-if="phase === 'idle'">
                <div class="flex flex-wrap items-center gap-1.5" data-enchant-mode>
                    <span class="text-[10px] text-base-content/40">{{ $t("transcend-build.craft_enchant_select_affix") }}</span>
                    <button
                        type="button"
                        class="flex h-6 items-center gap-1 rounded-xs border px-1.5 text-[10px] transition-colors duration-150"
                        :class="randomMode ? 'border-primary/70 bg-primary/10 text-primary' : 'border-base-content/20 text-base-content/60 hover:border-primary/50'"
                        :title="$t('transcend-build.craft_enchant_random_hint')"
                        data-enchant-random
                        :data-selected="randomMode ? '1' : '0'"
                        @click="toggleRandomMode"
                    >
                        <Icon icon="ri:exchange-line" class="size-3" />
                        {{ $t("transcend-build.craft_random") }}
                    </button>
                    <span class="text-[10px] text-base-content/35" data-enchant-mode-hint>{{ enchantModeHint }}</span>
                </div>

                <template v-if="flow.stage === 'first'">
                    <div v-if="targetOptions.length" class="flex flex-wrap gap-1.5">
                        <button
                            v-for="option in targetOptions"
                            :key="option.index"
                            type="button"
                            class="max-w-56 rounded-xs border px-1.5 py-1 text-left transition-colors duration-150"
                            :class="targetIndex === option.index ? 'border-primary/70 bg-primary/10' : 'border-base-content/12 hover:border-primary/50'"
                            :data-enchant-target="option.line.roll.affixId"
                            :data-enchant-target-index="option.index"
                            @click="selectTarget(option.index)"
                        >
                            <span class="block truncate text-[10px] text-base-content/70">{{ affixName(option.line.affix) }}</span>
                            <span class="block font-orbitron text-[10px] text-primary">{{ option.line.valueText }}</span>
                        </button>
                    </div>
                    <p v-else class="text-[10px] text-warning/80" data-craft-gate="4">{{ $t("transcend-build.craft_gate_no_enchant_target") }}</p>
                </template>
            </template>

            <div class="flex flex-wrap items-center gap-2">
                <button v-if="phase === 'idle'" type="button" class="btn btn-xs btn-primary" :disabled="!canConfirm" data-enchant-confirm @click="confirmEnchant">
                    {{ $t("transcend-build.craft_enchant_confirm") }}
                </button>
                <button
                    v-if="phase === 'idle'"
                    type="button"
                    class="btn btn-xs btn-outline"
                    :disabled="!canCustom"
                    :title="customDisabledReason || undefined"
                    data-enchant-custom
                    @click="openCustom"
                >
                    <Icon icon="ri:edit-line" class="size-3.5" />
                    {{ $t("transcend-build.craft_enchant_custom") }}
                </button>
                <TranscendCraftCost :craft-id="4" :state="state" class="ml-auto" />
            </div>

            <p v-if="noCandidates" class="text-[10px] text-warning/80" data-enchant-no-candidates>{{ $t("transcend-build.craft_no_candidates") }}</p>

            <div v-if="phase === 'confirm'" class="space-y-1.5 border-t border-base-content/10 pt-2" data-enchant-first-confirm>
                <p class="text-[10px] leading-relaxed text-warning/85">{{ $t("transcend-build.craft_enchant_first_confirm") }}</p>
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="btn btn-xs btn-primary" data-enchant-first-confirm-yes @click="confirmFirstEnchant">
                        {{ $t("transcend-build.craft_enchant_confirm") }}
                    </button>
                    <button type="button" class="btn btn-xs btn-ghost" data-enchant-first-confirm-no @click="cancelFirstEnchant">
                        {{ $t("transcend-build.craft_cancel") }}
                    </button>
                </div>
            </div>

            <div v-if="phase === 'candidates'" class="space-y-1.5 border-t border-base-content/10 pt-2" data-enchant-candidates>
                <span class="block text-[10px] text-base-content/45">{{ $t("transcend-build.craft_enchant_candidates") }}</span>
                <div v-if="flow.stage === 'first' && candidateTargetLine" class="space-y-1" data-enchant-candidate-current>
                    <span class="block text-[10px] text-base-content/40">{{ $t("transcend-build.gear_current_affixes") }}</span>
                    <TranscendGearAffixRow :line="candidateTargetLine" :slot-id="slotId" :char-id="charId" :show-roll="false" />
                </div>
                <div class="flex flex-wrap gap-1.5">
                    <button
                        v-for="(candidate, index) in candidates"
                        :key="candidate.affix.id"
                        type="button"
                        class="max-w-56 rounded-xs border px-1.5 py-1 text-left transition-colors duration-150"
                        :class="selectedIndex === index ? 'border-primary/70 bg-primary/10' : 'border-base-content/12 hover:border-primary/50'"
                        :data-enchant-candidate="candidate.affix.id"
                        :data-enchant-candidate-roll="candidate.rollLevel"
                        :data-selected="selectedIndex === index ? '1' : '0'"
                        @click="selectedIndex = index"
                    >
                        <span class="block truncate text-[10px] text-base-content/70">{{ affixName(candidate.affix) }}</span>
                        <span class="block font-orbitron text-[10px] text-primary">{{ candidateValue(candidate) }}</span>
                    </button>
                    <button
                        type="button"
                        class="max-w-56 rounded-xs border px-1.5 py-1 text-left transition-colors duration-150"
                        :class="selectedIndex === candidates.length ? 'border-warning/70 bg-warning/10' : 'border-base-content/12 hover:border-warning/50'"
                        data-enchant-keep
                        :data-selected="selectedIndex === candidates.length ? '1' : '0'"
                        @click="selectedIndex = candidates.length"
                    >
                        <span class="block text-[10px] text-base-content/70">{{ $t("transcend-build.craft_enchant_no_change") }}</span>
                    </button>
                </div>
                <div class="flex flex-wrap gap-1.5">
                    <button type="button" class="btn btn-xs btn-primary" data-enchant-apply @click="applySelected">{{ $t("transcend-build.craft_apply") }}</button>
                    <button type="button" class="btn btn-xs btn-ghost" data-enchant-cancel @click="cancelCandidates">{{ $t("transcend-build.craft_cancel") }}</button>
                </div>
            </div>

            <div v-if="flow.stage === 'replace'" class="flex flex-wrap items-center gap-2 border-t border-base-content/10 pt-2" data-enchant-reset-block>
                <span class="border border-warning/40 px-1 py-px text-[9px] leading-none text-warning/80">{{ $t("transcend-build.craft_simulator_only") }}</span>
                <button type="button" class="btn btn-xs btn-outline" data-enchant-reset @click="resetEnchantNow">
                    <Icon icon="ri:refresh-line" class="size-3.5" />
                    {{ $t("transcend-build.craft_enchant_reset") }}
                </button>
                <span class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_enchant_reset_note") }}</span>
            </div>
        </div>

        <Teleport v-if="customOpen" to="body">
            <dialog class="modal" :class="{ 'modal-open': customOpen }" data-enchant-custom-dialog>
                <div class="modal-box relative max-w-96 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-[12px] font-semibold text-base-content/85">{{ $t("transcend-build.craft_enchant_custom") }}</span>
                        <span class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_enchant_custom_desc") }}</span>
                        <button type="button" class="btn btn-ghost btn-xs btn-square ml-auto" data-enchant-custom-close @click="closeCustom">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </div>

                    <div class="space-y-2 rounded-xs border border-base-content/12 bg-base-100/50 p-2">
                        <SearchSelect
                            :model-value="customAffixId"
                            :options="customOptions"
                            :label="$t('transcend-build.gear_affix_pick')"
                            :clear-value="0"
                            data-enchant-custom-select
                            @update:model-value="selectCustomAffix"
                        />
                        <label v-if="customAffix" class="flex items-center gap-2 text-[10px] text-base-content/45">
                            <span class="shrink-0">{{ $t("transcend-build.gear_roll") }} {{ customRange.min }}–{{ customRange.max }}</span>
                            <input
                                :value="customRollLevel"
                                type="range"
                                :min="customRange.min"
                                :max="customRange.max"
                                step="1"
                                class="range range-primary range-xs min-w-0 flex-1"
                                data-enchant-custom-roll
                                @input="adjustCustomRoll(Number(($event.target as HTMLInputElement).value))"
                            />
                            <b class="w-8 shrink-0 text-right font-orbitron text-[11px] text-primary" data-enchant-custom-level>{{ customRollLevel }}</b>
                        </label>
                        <p v-if="customValueText" class="font-orbitron text-[11px] text-primary" data-enchant-custom-value>{{ customValueText }}</p>
                    </div>

                    <div v-if="customConfirming" class="space-y-1.5 border-t border-base-content/10 pt-2" data-enchant-custom-first-confirm>
                        <p class="text-[10px] leading-relaxed text-warning/85">{{ $t("transcend-build.craft_enchant_first_confirm") }}</p>
                        <div class="flex flex-wrap justify-end gap-1.5">
                            <button type="button" class="btn btn-xs btn-ghost" @click="customConfirming = false">{{ $t("transcend-build.craft_cancel") }}</button>
                            <button type="button" class="btn btn-xs btn-primary" data-enchant-custom-apply @click="applyCustomEnchant">
                                {{ $t("transcend-build.craft_enchant_confirm") }}
                            </button>
                        </div>
                    </div>
                    <div v-else class="flex flex-wrap justify-end gap-1.5">
                        <button type="button" class="btn btn-xs btn-ghost" @click="closeCustom">{{ $t("transcend-build.craft_cancel") }}</button>
                        <button type="button" class="btn btn-xs btn-primary" :disabled="!customReady" data-enchant-custom-confirm @click="confirmCustom">
                            {{ $t("transcend-build.craft_apply") }}
                        </button>
                    </div>
                </div>
                <div class="modal-backdrop" @click="closeCustom" />
            </dialog>
        </Teleport>
    </div>
</template>
