<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import {
    affixPools,
    applyTemper,
    type DnaSeasonAffix,
    getCraftAvailability,
    getGearCraftState,
    resetTempering,
    setTemperingAncient,
    slots,
    type TranscendGearItemConfig,
} from "@/data"
import { getCraftConditionText, getCraftGateTextKey, getTemperCandidates, groupTemperPools } from "@/utils/transcend-gear/craft"
import { getItemAffixLines } from "@/utils/transcend-gear/display"
import { canAffixBeAncient } from "@/utils/transcend-gear/generation"
import { getAffixSummaryParts, getPoolLabelKey } from "@/utils/transcendence-gear"
import TranscendCraftCost from "./TranscendCraftCost.vue"

/**
 * 淬炼 tab：保留当前淬炼行 + 槽位池候选 + 重置（模拟器功能）。
 * 附魔快照原词缀在池内禁用：淬炼回该词缀会让重置附魔失去原词缀。
 */
const props = defineProps<{
    item: TranscendGearItemConfig
    charId: number
    slotId: number
    preserveUnknown: boolean
}>()

const emit = defineEmits<{
    (event: "apply", item: TranscendGearItemConfig): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const state = computed(() => getGearCraftState(props.item, undefined, { preserveUnknown: props.preserveUnknown }))
const lines = computed(() => getItemAffixLines(props.item, props.slotId))
const availability = computed(() => getCraftAvailability(props.item, 3, undefined, { preserveUnknown: props.preserveUnknown }))
const condition = computed(() => getCraftConditionText(3, gt))
const gate = computed(() => {
    const key = getCraftGateTextKey(availability.value.reason)
    return key ? t(key) : ""
})
const snapshotAffixId = computed(() => state.value.enchantSnapshot?.roll.affixId)

/** 当前淬炼行 */
const temperingLine = computed(() => lines.value.find(line => line.tempering === true))

/** 当前淬炼词条是否可太古（没有太古公式的词条禁用） */
const temperingCanBeAncient = computed(() => canAffixBeAncient(temperingLine.value?.affix))

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
 * 淬炼候选：槽位池全池（不按 Plan 过滤），排除基础 / 专属 / 角色不匹配；
 * 同 id 的随机 / 附魔词条保留（淬炼可与随机词条同 id 共存），附魔快照原词缀保留展示但禁用。
 */
const temperingPool = computed(() =>
    getTemperCandidates(props.item, props.charId, { preserveUnknown: props.preserveUnknown })
)

/** 当前选中的词缀配方组（上游先选配方组，再选词条） */
const activePoolId = ref<number | undefined>(undefined)

/** 新淬炼候选是否按太古应用（词条无太古公式时忽略） */
const temperAncient = ref(false)

/** 槽型 `temperAffixPoolIds` 对应的全部配方组（空组保留并显示空态）；名称取 `affixPools.name` 官方本地化 */
const poolGroups = computed(() => {
    const slot = slots.find(entry => entry.id === Math.round(props.item.slotType))
    const poolIds = slot?.temperAffixPoolIds ?? []
    return groupTemperPools(poolIds, temperingPool.value).map(group => {
        const labelKey = getPoolLabelKey(group.poolId)
        const pool = affixPools.find(entry => entry.id === group.poolId)
        return { ...group, label: labelKey ? t(labelKey) : gt(pool?.name) }
    })
})

/** 当前配方组；未选择时为空 */
const activeGroup = computed(() => poolGroups.value.find(group => group.poolId === activePoolId.value))

/** 当前配方组内是否有可太古词条（没有时禁用新淬炼太古勾选） */
const activeGroupCanBeAncient = computed(() => Boolean(activeGroup.value?.affixes.some(affix => canAffixBeAncient(affix))))

watch(activeGroupCanBeAncient, canBeAncient => {
    if (!canBeAncient) temperAncient.value = false
})

watch(poolGroups, groups => {
    if (activePoolId.value !== undefined && !groups.some(group => group.poolId === activePoolId.value)) {
        activePoolId.value = undefined
    }
})

/**
 * 词缀是否因附魔快照保留而禁用。
 * @param affix 词缀
 * @returns 禁用为 true
 */
function isSnapshotBlocked(affix: DnaSeasonAffix): boolean {
    return affix.id === snapshotAffixId.value
}

/**
 * 淬炼（新增或替换单条淬炼词缀）；太古按勾选写入，词条无太古公式时为 false。
 * @param affix 词缀
 */
function applyTempering(affix: DnaSeasonAffix): void {
    if (isSnapshotBlocked(affix)) return
    const ancient = temperAncient.value && canAffixBeAncient(affix)
    const next = applyTemper(props.item, { affixId: affix.id, ancient })
    if (next !== props.item) emit("apply", next)
}

/**
 * 切换当前淬炼词条的太古标记（模拟器手选，不增加淬炼次数）。
 * @param ancient 是否太古
 */
function toggleTemperingAncient(ancient: boolean): void {
    const next = setTemperingAncient(props.item, ancient)
    if (next !== props.item) emit("apply", next)
}

/** 重置淬炼（模拟器功能）：移除淬炼词缀并清零次数 */
function resetTemperingNow(): void {
    const next = resetTempering(props.item)
    if (next !== props.item) emit("apply", next)
}
</script>

<template>
    <div class="space-y-2" data-craft-panel="temper">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="text-[11px] font-medium text-base-content/75">{{ $t("transcend-build.craft_tab_temper") }}</span>
            <span class="text-[10px] leading-relaxed text-base-content/40">{{ $t("transcend-build.craft_temper_desc") }}</span>
            <span v-if="state.temperingCount > 0" class="text-[10px] text-base-content/40" data-temper-count>
                {{ $t("transcend-build.craft_tempering_count", { count: state.temperingCount }) }}
            </span>
            <span v-if="condition" class="text-[10px] text-base-content/40">{{ $t("transcend-build.craft_condition") }} · {{ condition }}</span>
            <span v-if="!availability.available" class="ml-auto text-[10px] text-warning/80" data-craft-gate="3">{{ gate }}</span>
        </div>

        <div class="space-y-2 rounded-xs border border-base-content/12 bg-base-100/50 p-2" data-create-craft="3">
            <div v-if="temperingLine" class="flex items-center gap-1.5" data-craft-tempering-current>
                <TranscendGearAffixRow :line="temperingLine" :slot-id="slotId" :char-id="charId" :show-roll="false" class="min-w-0 flex-1" />
                <label
                    class="inline-flex shrink-0 items-center gap-1 text-[11px] text-base-content/65"
                    :class="{ 'cursor-not-allowed opacity-45': !temperingCanBeAncient }"
                    :title="temperingCanBeAncient ? $t('transcend-build.gear_ancient') : $t('transcend-build.gear_ancient_unavailable')"
                >
                    <input
                        type="checkbox"
                        class="checkbox checkbox-primary checkbox-xs"
                        :checked="temperingLine.roll.ancient"
                        :disabled="!temperingCanBeAncient"
                        data-temper-ancient
                        :data-temper-ancient-eligible="temperingCanBeAncient ? '1' : '0'"
                        @change="toggleTemperingAncient(($event.target as HTMLInputElement).checked)"
                    />
                    {{ $t("transcend-build.gear_ancient") }}
                </label>
                <span v-if="temperingLine.ancient" class="shrink-0 text-[10px] text-warning/80" data-temper-ancient-note>
                    {{ $t("transcend-build.gear_ancient_roll_ignored") }}
                </span>
                <span class="border border-warning/40 px-1 py-px text-[9px] leading-none text-warning/80">{{ $t("transcend-build.craft_simulator_only") }}</span>
                <button
                    type="button"
                    class="btn btn-ghost btn-xs shrink-0"
                    :aria-label="$t('transcend-build.craft_tempering_reset_note')"
                    data-craft-tempering-reset
                    @click="resetTemperingNow"
                >
                    <Icon icon="ri:refresh-line" class="size-3.5" />
                    {{ $t("transcend-build.craft_tempering_reset") }}
                </button>
            </div>
            <p v-else class="text-[10px] text-base-content/40">{{ $t("transcend-build.craft_tempering_add") }}</p>

            <template v-if="availability.available">
                <div class="space-y-1.5" data-temper-pools>
                    <span class="block text-[10px] text-base-content/40">{{ $t("transcend-build.craft_temper_pool") }}</span>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="group in poolGroups"
                            :key="group.poolId"
                            type="button"
                            class="btn btn-xs"
                            :class="activePoolId === group.poolId ? 'btn-primary' : 'btn-ghost border border-base-content/12'"
                            :data-temper-pool-id="group.poolId"
                            :data-temper-pool-active="activePoolId === group.poolId ? '1' : '0'"
                            @click="activePoolId = group.poolId"
                        >
                            {{ group.label }}
                        </button>
                    </div>
                </div>

                <p v-if="!activeGroup" class="text-[10px] leading-relaxed text-base-content/40" data-temper-pick-pool>
                    {{ $t("transcend-build.craft_temper_pick_pool") }}
                </p>
                <template v-else>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p class="text-[10px] text-base-content/40">{{ temperingLine ? $t("transcend-build.craft_tempering_replace") : $t("transcend-build.craft_tempering_add") }}</p>
                        <label
                            class="inline-flex items-center gap-1 text-[11px] text-base-content/65"
                            :class="{ 'cursor-not-allowed opacity-45': !activeGroupCanBeAncient }"
                            :title="activeGroupCanBeAncient ? $t('transcend-build.gear_ancient') : $t('transcend-build.gear_ancient_unavailable')"
                        >
                            <input
                                type="checkbox"
                                class="checkbox checkbox-primary checkbox-xs"
                                :checked="temperAncient"
                                :disabled="!activeGroupCanBeAncient"
                                data-temper-ancient-new
                                :data-temper-ancient-new-eligible="activeGroupCanBeAncient ? '1' : '0'"
                                @change="temperAncient = ($event.target as HTMLInputElement).checked"
                            />
                            {{ $t("transcend-build.gear_ancient") }}
                        </label>
                    </div>
                    <ScrollArea class="max-h-40 pr-1">
                        <div class="flex flex-wrap gap-1.5">
                            <button
                                v-for="affix in activeGroup.affixes"
                                :key="affix.id"
                                type="button"
                                class="btn btn-xs btn-ghost border border-base-content/12 disabled:cursor-not-allowed disabled:opacity-45"
                                :disabled="isSnapshotBlocked(affix)"
                                :title="isSnapshotBlocked(affix) ? $t('transcend-build.gear_affix_snapshot_reserved') : affixName(affix)"
                                :data-temper-affix-id="affix.id"
                                :data-temper-blocked="isSnapshotBlocked(affix) ? 'snapshot' : undefined"
                                @click="applyTempering(affix)"
                            >
                                {{ affixName(affix) }}
                            </button>
                            <p v-if="!activeGroup.affixes.length" class="py-2 text-center text-[10px] text-base-content/35">{{ $t("transcend-build.craft_no_candidates") }}</p>
                        </div>
                    </ScrollArea>
                    <p v-if="activeGroup.affixes.some(isSnapshotBlocked)" class="text-[10px] leading-relaxed text-warning/70" data-temper-snapshot-note>
                        {{ $t("transcend-build.gear_affix_snapshot_reserved") }}
                    </p>
                </template>
            </template>

            <TranscendCraftCost :craft-id="3" :state="state" />
        </div>
    </div>
</template>
