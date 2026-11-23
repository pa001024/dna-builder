<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import { applyFinalMasterwork, getGearCraftState, setGearMasterworkLevel, type TranscendGearItemConfig } from "@/data"
import type { TranscendGearSlot } from "@/utils/transcend-build"
import { type CraftRng, clampCraftRestore } from "@/utils/transcend-gear/craft"
import type { GearAffixIncomeSource } from "@/utils/transcend-gear/income"
import TranscendGearCraftPanel from "./TranscendGearCraftPanel.vue"
import TranscendGearItemCard from "./TranscendGearItemCard.vue"

/**
 * 构筑页槽位做装弹窗：完整 5 tab 做装（回收 / 镶嵌 / 精锻 / 附魔 / 淬炼）+ 装备预览卡。
 * 每次 apply 立即回写槽位；撤销只存精锻等级 / 最终目标锚点并在当前物品上恢复，
 * 与做装表单同口径——孔位 / 附魔 / 淬炼编辑不会被撤销连带回退。
 */
const props = withDefaults(
    defineProps<{
        open: boolean
        slot: TranscendGearSlot
        item: TranscendGearItemConfig
        /** 该槽所属构筑位的角色（附魔 / 淬炼角色过滤） */
        charId?: number
        /** 随机源（测试可注入；缺省 Math.random） */
        rng?: CraftRng
        /** 逐词条收益上下文（具备完整构筑时传入；缺省不显示单条收益） */
        affixIncomeSource?: GearAffixIncomeSource | null
    }>(),
    { charId: 0, rng: undefined, affixIncomeSource: null }
)

const emit = defineEmits<{
    (event: "update:open", value: boolean): void
    (event: "update-item", item: TranscendGearItemConfig): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()

/** 撤销点：精锻等级 + 最终目标词缀 id（不做整件物品快照） */
interface CraftHistoryEntry {
    level: number
    finalAffixId?: number
}

const MAX_CRAFT_HISTORY = 30
const history = ref<CraftHistoryEntry[]>([])
const canUndo = computed(() => history.value.length > 0)

/**
 * 读取物品的精锻锚点。
 * @param item 装备物品
 * @returns 精锻等级与最终目标词缀 id
 */
function craftAnchor(item: TranscendGearItemConfig): CraftHistoryEntry {
    const state = getGearCraftState(item, undefined, { preserveUnknown: true })
    const finalAffixId = state.finalMasterworkAffixIndex !== undefined ? item.affixes[state.finalMasterworkAffixIndex]?.affixId : undefined
    return { level: state.masterworkLevel, finalAffixId }
}

/**
 * 应用 tab 产出的新物品并回写槽位；只有精锻等级 / 最终目标变化才记录撤销点。
 * @param next 新物品
 */
function apply(next: TranscendGearItemConfig): void {
    if (next === props.item) return
    const previous = craftAnchor(props.item)
    const current = craftAnchor(next)
    if (current.level !== previous.level || current.finalAffixId !== previous.finalAffixId) {
        history.value = [...history.value, previous].slice(-MAX_CRAFT_HISTORY)
    }
    emit("update-item", next)
}

/** 撤销上一份精锻等级 / 最终目标：在当前物品上恢复，不触碰孔位 / 附魔 / 淬炼 */
function undo(): void {
    const entry = history.value.at(-1)
    if (!entry) return
    history.value = history.value.slice(0, -1)
    const restored = clampCraftRestore(props.item, entry, { preserveUnknown: true })
    let next = setGearMasterworkLevel(props.item, restored.level, undefined, { preserveUnknown: true })
    const currentFinalAffixId = craftAnchor(next).finalAffixId
    if (restored.finalAffixId !== undefined && currentFinalAffixId !== restored.finalAffixId) {
        const index = next.affixes.findIndex(roll => roll.affixId === restored.finalAffixId)
        if (index >= 0) next = applyFinalMasterwork(next, index, undefined, { preserveUnknown: true })
    } else if (restored.finalAffixId === undefined && currentFinalAffixId !== undefined) {
        next = applyFinalMasterwork(next, null, undefined, { preserveUnknown: true })
    }
    if (next !== props.item) emit("update-item", next)
}

watch(
    () => props.open,
    value => {
        if (value) history.value = []
    },
    { immediate: true }
)
</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal" :class="{ 'modal-open': open }" data-transcend-gear-craft-dialog>
            <div class="modal-box relative max-w-6xl">
                <SectionHeader number="05" kicker="CRAFT" :title="$t('transcend-build.craft_section')" no-animate compact>
                    <template #trailing>
                        <button
                            class="btn btn-ghost btn-sm btn-square"
                            :aria-label="t('common.close')"
                            data-gear-craft-close
                            @click="emit('update:open', false)"
                        >
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>

                <div class="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <ScrollArea class="h-[calc(88vh-12rem)] pr-1">
                        <TranscendGearCraftPanel
                            :item="props.item"
                            :slot-id="props.slot.slotId"
                            :char-id="props.charId"
                            :preserve-unknown="true"
                            :rng="props.rng"
                            :can-undo="canUndo"
                            initial-tab="punch"
                            @apply="apply"
                            @undo="undo"
                        />
                    </ScrollArea>

                    <aside
                        class="flex h-[calc(88vh-12rem)] min-h-0 flex-col gap-2 border-t border-base-content/10 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-3"
                        data-gear-craft-preview
                    >
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-[12px] font-semibold text-base-content/80">{{ $t("transcend-build.gear_final_preview") }}</span>
                            <span class="text-[10px] text-base-content/45">{{ gt(props.slot.name) }}</span>
                        </div>
                        <ScrollArea class="min-h-0 flex-1">
                            <div class="space-y-2 pr-1">
                                <TranscendGearItemCard
                                    :item="props.item"
                                    :slot-id="props.slot.slotId"
                                    :char-id="props.charId"
                                    bare
                                    preview
                                    :affix-income-source="affixIncomeSource"
                                />
                                <p class="text-[10px] leading-relaxed text-base-content/35">{{ $t("transcend-build.craft_sim_note") }}</p>
                            </div>
                        </ScrollArea>
                    </aside>
                </div>
            </div>
            <div class="modal-backdrop" @click="emit('update:open', false)" />
        </dialog>
    </Teleport>
</template>
