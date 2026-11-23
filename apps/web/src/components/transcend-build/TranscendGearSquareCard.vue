<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { TranscendGearItemConfig } from "@/data"
import { getGearDisplayName, getGearIconSrc, getGearShowRarityId, getShowRarityColorClass } from "@/utils/transcend-gear/catalog"
import { getGearCraftSummary, getItemAffixCounts, getItemAffixLines, getItemSocketLines, isAncientGearIconLine } from "@/utils/transcend-gear/display"
import { formatRelativeGain } from "@/utils/transcend-gear/gain"
import type { GearAffixIncomeSource } from "@/utils/transcend-gear/income"
import { getGearSocketState } from "@/utils/transcend-gear/sockets"
import { TRANSCEND_GROOVE_MARKS } from "@/utils/transcendence-icon"
import TranscendGearIconMarks from "./TranscendGearIconMarks.vue"
import TranscendGearItemCard from "./TranscendGearItemCard.vue"
import TranscendGearSlotIcon from "./TranscendGearSlotIcon.vue"

/**
 * 升华装备方形图标卡：选择装备页库存候选与库存弹窗共用（同一组件、同一 Tooltip 口径）。
 * 方形图标 + 名称 / 强度 / 精锻 / 词缀 / 孔位摘要；FullTooltip 只包卡片，预览复用
 * `TranscendGearItemCard bare preview`（与构筑页槽位完全一致）。
 * 库存上下文只保留图标、品质楔形、太古角标与右下角孔位指示，其余信息在悬浮预览；
 * `clickable`（选择器候选）补 role=button 与 Enter / Space；库存行与当前已装备卡无点击动作，
 * 用 role=group（带 aria-label），不冒充按钮。
 */

const props = withDefaults(
    defineProps<{
        item: TranscendGearItemConfig
        /** 展示用装备位（只影响解析器输入，不影响最终数值） */
        slotId?: number
        /** 库存份数（>1 显示 ×N） */
        count?: number
        /** 与已装备物品同一身份 */
        equipped?: boolean
        /** 相对收益比例（0.032 = +3.2%）：不传不展示；null 表示未算出 */
        income?: number | null
        /** 该候选收益计算失败 */
        incomeFailed?: boolean
        /** 逐词条收益上下文（具备完整构筑时传入；缺省不显示单条收益） */
        affixIncomeSource?: GearAffixIncomeSource | null
        /** 构筑位角色 id（词条角色门控划线；0 / 未传表示无角色上下文） */
        charId?: number
        /** 可点击装备（选择器候选）：role=button + Enter / Space */
        clickable?: boolean
        /** 卡锚点上下文 */
        context?: "picker" | "stock" | "current"
    }>(),
    { slotId: 0, count: 1, equipped: false, incomeFailed: false, clickable: false, context: "stock", charId: 0 }
)

const emit = defineEmits<{
    (event: "activate"): void
}>()

const { i18next } = useTranslation()
const { gt } = useGameText()
const tooltipRef = ref<{ close: () => void } | null>(null)

const name = computed(() => getGearDisplayName(props.item, gt, i18next.language))
const iconSrc = computed(() => getGearIconSrc(props.item))
const showRarityId = computed(() => getGearShowRarityId(props.item.rarityId))
const affixCounts = computed(() => getItemAffixCounts(props.item))
const affixTotal = computed(() => affixCounts.value.base + affixCounts.value.random + affixCounts.value.unique)
/** 词条行（仅用于图标红星判定） */
const affixLines = computed(() => getItemAffixLines(props.item, props.slotId))
const ancientIcon = computed(() => affixLines.value.some(isAncientGearIconLine))
/** 装备级 craft 摘要：精锻等级不按词条分别展示 */
const craftSummary = computed(() => getGearCraftSummary(props.item))
const socketState = computed(() => getGearSocketState(props.item, props.item.slotType))
const socketLines = computed(() => getItemSocketLines(props.item))
const GROOVE_MARKS = TRANSCEND_GROOVE_MARKS
/** 右下角孔位指示：已开孔逐孔输出，已镶嵌显示宝石图标（信息条与计数不进卡片） */
const socketPips = computed(() => {
    const filled = new Map(socketLines.value.map(line => [line.socketIndex, line]))
    return Array.from({ length: socketState.value.opened }, (_, socketIndex) => ({ socketIndex, line: filled.get(socketIndex) }))
})
const incomeText = computed(() => formatRelativeGain(props.income))

/** 装备候选：先关闭预览再上报（键盘 Enter 不会像真实 click 那样触发 Reka 的关闭） */
function activate(): void {
    if (!props.clickable) return
    tooltipRef.value?.close()
    emit("activate")
}

/**
 * 键盘激活：仅处理触发根自身，Enter / Space 与按钮同口径。
 * @param event 键盘事件
 * @returns 无
 */
function onKeydown(event: KeyboardEvent): void {
    if (!props.clickable || event.target !== event.currentTarget) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    activate()
}

/** 物品被替换（原地复用 DOM）时立即关闭预览，避免旧预览继续显示新物品 */
watch(
    () => props.item,
    (_item, previous) => {
        if (previous) tooltipRef.value?.close()
    }
)

defineExpose({ close: () => tooltipRef.value?.close() })
</script>

<template>
    <FullTooltip ref="tooltipRef" side="top">
        <template #tooltip>
            <div v-if="item" class="-mx-3 -my-2 w-78.5 max-h-[70vh] overflow-y-auto overscroll-contain" data-gear-tooltip>
                <TranscendGearItemCard
                    :item="item"
                    :slot-id="slotId"
                    :char-id="charId"
                    bare
                    preview
                    :show-copy-id="context === 'stock'"
                    :affix-income-source="affixIncomeSource"
                />
            </div>
        </template>
        <div
            class="group/gear-card relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xs border bg-base-200/60 backdrop-blur-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="[equipped ? 'border-primary/60 bg-primary/5' : 'border-base-content/15 hover:border-primary/50', clickable ? 'cursor-pointer' : '']"
            :data-gear-square-card="item.kind"
            :data-gear-item="item.kind"
            :data-gear-stock-card="context === 'stock' ? '' : undefined"
            :data-gear-picker-card="context === 'picker' ? '' : undefined"
            :data-gear-current-card="context === 'current' ? '' : undefined"
            :data-rarity="showRarityId"
            tabindex="0"
            :aria-label="name"
            :role="clickable ? 'button' : 'group'"
            @click="activate"
            @keydown="onKeydown"
        >
            <ImageFallback :src="iconSrc" :alt="name" class="h-full w-full object-cover">
                <TranscendGearSlotIcon :slot-type="item.slotType" class="size-8 text-base-content/45" />
            </ImageFallback>

            <span
                v-if="clickable"
                class="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover/gear-card:bg-black/15"
            />

            <span
                class="pointer-events-none absolute top-0 right-0 z-10 h-6 w-6 [clip-path:polygon(100%_0,100%_100%,0_0)]"
                :class="showRarityId ? getShowRarityColorClass(showRarityId) : 'bg-gray-300'"
                aria-hidden="true"
            />
            <TranscendGearIconMarks
                v-if="ancientIcon"
                :ancient="ancientIcon"
                suppress-title
                class="pointer-events-none absolute top-0.5 left-0.5 z-10"
            />

            <div
                class="pointer-events-none absolute top-1 z-10 flex flex-col items-start gap-0.5"
                :class="ancientIcon ? 'left-6' : 'left-1'"
            >
                <span v-if="equipped" class="border border-primary/50 bg-base-100/80 px-1 py-px text-xs leading-none text-primary" data-gear-equipped>
                    {{ $t("transcend-build.gear_equipped") }}
                </span>
                <span v-if="count > 1" class="bg-base-100/70 px-1 py-px font-mono text-xs leading-none text-base-content/60">×{{ count }}</span>
            </div>

            <div
                v-if="socketPips.length"
                class="pointer-events-none absolute right-1 z-10 flex items-center gap-0.5 rounded-xs bg-base-100/40 px-0.5 py-px backdrop-blur-sm"
                :class="[context === 'stock' ? 'bottom-1' : 'bottom-16', socketPips.length > 1 ? 'flex-col' : 'flex-row']"
                data-gear-socket-pips
            >
                <span
                    v-for="pip in socketPips"
                    :key="pip.socketIndex"
                    class="relative grid size-3 place-items-center"
                    :data-gear-socket-pip="pip.socketIndex"
                    :data-gear-socket-filled="pip.line ? '1' : undefined"
                >
                    <img :src="GROOVE_MARKS.emptyGroove.url" alt="" aria-hidden="true" class="absolute size-full" data-gear-socket-pip-frame />
                    <ImageFallback v-if="pip.line" :src="pip.line.iconSrc" :alt="pip.line.name" class="relative size-2.5 object-contain" data-gear-socket-pip-gem>
                        <span class="flex size-2.5 items-center justify-center rounded-xs border border-base-content/15 text-[7px] leading-none text-base-content/40" data-gear-socket-pip-fallback>{{ $t("transcend-build.gear_type_gem").slice(0, 1) }}</span>
                    </ImageFallback>
                </span>
            </div>

            <div v-if="context !== 'stock'" class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-base-100/25 px-2 py-2 backdrop-blur-sm">
                <div class="flex items-center gap-1 text-sm leading-tight font-bold text-base-content/80">
                    <span class="truncate">{{ name || $t("transcend-build.gear_unknown") }}</span>
                </div>
                <div class="relative h-6 text-xs leading-8 text-base-content/80">
                    <div class="absolute inset-0 flex items-center justify-between gap-1">
                        <span class="flex min-w-0 items-center gap-x-1 truncate tabular-nums">
                            <span
                                v-if="item.equipBaseScore"
                                class="shrink-0"
                                :title="$t('transcend-build.gear_strength')"
                                :aria-label="`${$t('transcend-build.gear_strength')} ${item.equipBaseScore}`"
                                data-gear-strength
                            >
                                T{{ item.equipBaseScore }}
                            </span>
                            <span
                                class="shrink-0"
                                :title="$t('transcend-build.gear_affixes')"
                                :aria-label="`${$t('transcend-build.gear_affixes')} ${affixTotal}`"
                                data-gear-affixes
                            >
                                A{{ affixTotal }}
                            </span>
                            <span
                                v-if="craftSummary.masterworkLevel > 0"
                                class="shrink-0 text-warning"
                                :title="$t('transcend-build.gear_masterwork_level', { level: craftSummary.masterworkLevel })"
                                :aria-label="$t('transcend-build.gear_masterwork_level', { level: craftSummary.masterworkLevel })"
                                data-gear-masterwork
                            >
                                +{{ craftSummary.masterworkLevel }}F
                            </span>
                        </span>
                        <span
                            v-if="income !== undefined"
                            class="shrink-0"
                            :class="incomeFailed ? 'text-warning/80' : ''"
                            :aria-label="`${$t('transcend-build.gear_gain_relative')} ${incomeText}`"
                            data-gear-income
                            :data-income-value="incomeText"
                            :data-income-failed="incomeFailed ? '1' : ''"
                        >
                            {{ incomeText }}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </FullTooltip>
</template>
