<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import { type TranscendGearEntry, type TranscendGearItemConfig } from "@/data"
import type { TranscendGearSlot } from "@/utils/transcend-build"
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
 * 升华装备方形槽位（对齐原版 ModItem）：已装备物品显示图标 / 名称 / 强度 / 词缀与孔位摘要，
 * 未拥有显示徽章并可一键加入库存；空槽只提示「选择装备」，点击打开全屏选择器。
 */

const props = defineProps<{
    slot: TranscendGearSlot
    /** v2 完整物品；为空且无旧版词条时是空槽 */
    item: TranscendGearItemConfig | null
    /** 安全模式 / 缺包时尚未迁移的 v1 词条 */
    legacyEntries?: TranscendGearEntry[]
    /** 是否已在库存中（未拥有仍参与计算） */
    owned?: boolean
    /** 库存中的份数 */
    ownedCount?: number
    /** 槽型孔位上限 */
    maxInlays?: number
    /** 该装备相对「同槽为空」的相对收益比例（0.032 = +3.2%）；不传不展示，null 表示算不出 */
    gain?: number | null
    /** 逐词条收益上下文（具备完整构筑时传入；缺省不显示单条收益） */
    affixIncomeSource?: GearAffixIncomeSource | null
    /** 该槽所属构筑位的角色（词条角色门控划线；0 / 未传表示无角色上下文） */
    charId?: number
}>()

const emit = defineEmits<{
    (event: "pick"): void
    (event: "add-to-stock"): void
    (event: "unequip"): void
    (event: "craft"): void
}>()

const { i18next } = useTranslation()
const { gt } = useGameText()

/** 悬浮操作浮层是否可见（指针悬停，或焦点在浮层按钮内）：隐藏时整层 inert，不进 Tab 序 */
const hovered = ref(false)
const focusWithin = ref(false)
const actionsVisible = computed(() => hovered.value || focusWithin.value)

/**
 * 指针进入：只认真实指针事件，与离开对称。合成 pointerenter 不代表指针真的移入，
 * 据此展开浮层会留下没有对应离开事件的常驻浮层。
 * @param event 指针事件
 * @returns 无
 */
function handlePointerEnter(event: PointerEvent): void {
    if (!event.isTrusted) return
    hovered.value = true
}

/**
 * 指针离开：只认真实指针事件。FullTooltip 复位悬停态时会派发合成 pointerleave，
 * 若不忽略会误关悬浮操作浮层（指针并未离开）。
 * @param event 指针事件
 * @returns 无
 */
function handlePointerLeave(event: PointerEvent): void {
    if (!event.isTrusted) return
    hovered.value = false
}

/**
 * 焦点进入：根节点自身聚焦不展开浮层（隐藏态按钮保持不可达），焦点落在子按钮内时保持可用。
 * @param event 焦点事件
 * @returns 无
 */
function handleFocusIn(event: FocusEvent): void {
    focusWithin.value = event.target !== event.currentTarget
}

/**
 * 焦点移出槽位（含子按钮）：仅在焦点仍留在槽位子树内时保持浮层可用。
 * @param event 焦点事件
 * @returns 无
 */
function handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    const root = event.currentTarget as HTMLElement
    focusWithin.value = next instanceof Node && next !== root && root.contains(next)
}

/** 预览实例：切槽 / 换变体 / 打开选择器时主动关闭 */
const tooltipRef = ref<{ close: () => void } | null>(null)

/** 打开选择器：先主动关闭预览（键盘 Enter 不会像真实 click 那样触发 Reka 的关闭） */
function pick(): void {
    tooltipRef.value?.close()
    emit("pick")
}

/**
 * 物品被替换（切槽 / 换变体）时立即关闭预览，避免旧预览继续显示新物品。
 * 只在「原本有物品」时关闭：空槽 → 有物品是首次装备，此时由 FullTooltip 的 disabled 解除补开，
 * 这里再关一次会与它竞争（同一 flush 内后者可能被覆盖）。
 */
watch(
    () => props.item,
    (_item, previous) => {
        if (previous) tooltipRef.value?.close()
    }
)

const legacyCount = computed(() => props.legacyEntries?.length ?? 0)
const isEmpty = computed(() => !props.item && legacyCount.value === 0)
const name = computed(() => (props.item ? getGearDisplayName(props.item, gt, i18next.language) : ""))
const iconSrc = computed(() => (props.item ? getGearIconSrc(props.item) : ""))
const showRarityId = computed(() => (props.item ? getGearShowRarityId(props.item.rarityId) : 0))
const affixCounts = computed(() => (props.item ? getItemAffixCounts(props.item) : { base: 0, random: 0, unique: 0 }))
const affixTotal = computed(() => affixCounts.value.base + affixCounts.value.random + affixCounts.value.unique)
const socketState = computed(() => (props.item ? getGearSocketState(props.item, props.item.slotType) : { opened: 0, used: 0, max: 0 }))
const socketLines = computed(() => (props.item ? getItemSocketLines(props.item) : []))
const GROOVE_MARKS = TRANSCEND_GROOVE_MARKS
/** 右下角孔位指示：已开孔逐孔输出，已镶嵌显示宝石图标 */
const socketPips = computed(() => {
    const filled = new Map(socketLines.value.map(line => [line.socketIndex, line]))
    return Array.from({ length: socketState.value.opened }, (_, socketIndex) => ({ socketIndex, line: filled.get(socketIndex) }))
})
/** 词条行（仅用于图标红星判定） */
const affixLines = computed(() => (props.item ? getItemAffixLines(props.item, props.slot.slotId) : []))
const ancientIcon = computed(() => affixLines.value.some(isAncientGearIconLine))
/** 装备级 craft 摘要：精锻等级不按词条分别展示 */
const craftSummary = computed(() => (props.item ? getGearCraftSummary(props.item) : null))
/** 相对收益文本（比例 → 带符号百分比；null 显示 —） */
const gainText = computed(() => formatRelativeGain(props.gain))

/** 旧版条目的稀有度近似：按普通词条数（仅数据缺失时使用） */
const legacyRarity = computed<"empty" | "blue" | "gold">(() => {
    if (legacyCount.value === 0) return "empty"
    return legacyCount.value >= 3 ? "gold" : "blue"
})

/** 右上楔形颜色：v2 按品质，旧版按词条数 */
const wedgeClass = computed(() => {
    if (props.item) {
        if (!showRarityId.value) return "bg-gray-300"
        return getShowRarityColorClass(showRarityId.value)
    }
    return legacyRarity.value === "gold" ? "bg-yellow-400" : "bg-blue-500"
})
</script>

<template>
    <FullTooltip ref="tooltipRef" side="top" :disabled="!item">
        <template #tooltip>
            <div v-if="item" class="-mx-3 -my-2 w-78.5 max-h-[70vh] overflow-y-auto overscroll-contain" data-gear-tooltip>
                <TranscendGearItemCard :item="item" :slot-id="slot.slotId" :char-id="charId ?? 0" bare preview :affix-income-source="affixIncomeSource" />
            </div>
        </template>
        <div
            class="group/gear relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xs border bg-base-200/60 backdrop-blur-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="isEmpty ? 'border-dashed border-base-content/25 hover:border-primary/60' : 'border-base-content/15 hover:border-primary/60'"
            :data-gear-slot="slot.slotId"
            :data-rarity="item ? showRarityId : legacyRarity"
            :data-owned="item ? (owned ? '1' : '0') : ''"
            :data-empty="isEmpty ? '1' : ''"
            role="button"
            tabindex="0"
            @click="pick"
            @pointerenter="handlePointerEnter"
            @pointerleave="handlePointerLeave"
            @focusin="handleFocusIn"
            @focusout="handleFocusOut"
            @keydown.enter.self="pick"
            @keydown.space.self.prevent="pick"
        >
            <template v-if="isEmpty">
                <div class="flex h-full w-full flex-col items-center justify-center gap-1 text-base-content/35">
                    <TranscendGearSlotIcon :slot-type="slot.slotType" class="size-8" />
                    <span class="text-xs transition-colors duration-200 group-hover/gear:text-primary/70">{{ $t("transcend-build.gear_select") }}</span>
                </div>
            </template>
            <template v-else>
                <ImageFallback v-if="item" :src="iconSrc" :alt="name" class="h-full w-full object-cover">
                    <TranscendGearSlotIcon :slot-type="slot.slotType" class="size-8 text-base-content/45" />
                </ImageFallback>
                <div v-else class="flex h-full w-full flex-col items-center justify-center gap-1 text-base-content/40">
                    <TranscendGearSlotIcon :slot-type="slot.slotType" class="size-8" />
                    <span class="text-xs">{{ $t("transcend-build.gear_legacy_entry", { count: legacyCount }) }}</span>
                </div>

                <span
                    class="pointer-events-none absolute top-0 right-0 z-10 h-6 w-6 [clip-path:polygon(100%_0,100%_100%,0_0)]"
                    :class="wedgeClass"
                    aria-hidden="true"
                />
                <TranscendGearIconMarks
                    v-if="ancientIcon"
                    :ancient="ancientIcon"
                    suppress-title
                    class="pointer-events-none absolute top-0.5 left-0.5 z-10"
                />

                <span
                    v-if="item && owned === false"
                    class="pointer-events-none absolute top-1 z-10 border border-warning/50 bg-base-100/80 px-1 py-px text-xs leading-none text-warning/90"
                    :class="ancientIcon ? 'left-6' : 'left-1'"
                >
                    {{ $t("transcend-build.gear_not_owned") }}
                </span>
                <span
                    v-else-if="item && ownedCount && ownedCount > 1"
                    class="pointer-events-none absolute top-1 z-10 bg-base-100/70 px-1 py-px font-mono text-xs leading-none text-base-content/60"
                    :class="ancientIcon ? 'left-6' : 'left-1'"
                >
                    ×{{ ownedCount }}
                </span>

                <!-- 悬浮操作：加入库存 / 装备改造 / 卸下；隐藏时 inert，不进 Tab 序（可见性由指针 / 焦点驱动） -->
                <div
                    class="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-1 bg-base-100/70 py-0.5 backdrop-blur-sm transition-opacity duration-150"
                    :class="actionsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
                    :inert="!actionsVisible"
                    data-gear-actions
                >
                    <button
                        v-if="item && owned === false"
                        type="button"
                        class="btn btn-ghost btn-xs h-5 min-h-0 px-1"
                        :aria-label="$t('transcend-build.gear_add_to_stock')"
                        :tabindex="actionsVisible ? undefined : -1"
                        data-gear-add-to-stock
                        @click.stop="emit('add-to-stock')"
                    >
                        <Icon icon="ri:add-line" class="size-3.5" />
                    </button>
                    <button
                        v-if="item"
                        type="button"
                        class="btn btn-ghost btn-xs h-5 min-h-0 px-1"
                        :aria-label="$t('transcend-build.craft_section')"
                        :tabindex="actionsVisible ? undefined : -1"
                        data-gear-sockets
                        data-gear-craft
                        @click.stop="emit('craft')"
                    >
                        <Icon icon="ri:sparkling-line" class="size-3.5" />
                    </button>
                    <button
                        v-if="item"
                        type="button"
                        class="btn btn-ghost btn-xs h-5 min-h-0 px-1 text-error/80"
                        :aria-label="$t('transcend-build.gear_unequip')"
                        :tabindex="actionsVisible ? undefined : -1"
                        data-gear-unequip
                        @click.stop="emit('unequip')"
                    >
                        <Icon icon="codicon:chrome-close" class="size-3.5" />
                    </button>
                </div>

                <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-base-100/25 px-2 py-2 backdrop-blur-sm">
                    <div class="flex items-center gap-1 text-sm leading-tight font-bold text-base-content/80">
                        <span class="truncate">{{ item ? name : gt(slot.name) }}</span>
                    </div>
                    <div class="relative h-6 text-xs leading-8 text-base-content/80">
                        <div class="absolute inset-0 flex items-center justify-between gap-1">
                            <span v-if="item" class="flex min-w-0 items-center gap-x-1 truncate tabular-nums">
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
                                    v-if="craftSummary && craftSummary.masterworkLevel > 0"
                                    class="shrink-0 text-warning"
                                    :title="$t('transcend-build.gear_masterwork_level', { level: craftSummary.masterworkLevel })"
                                    :aria-label="$t('transcend-build.gear_masterwork_level', { level: craftSummary.masterworkLevel })"
                                    data-gear-masterwork
                                >
                                    +{{ craftSummary.masterworkLevel }}F
                                </span>
                            </span>
                            <span v-else class="min-w-0 truncate">{{ $t("transcend-build.gear_legacy_readonly") }}</span>
                            <span
                                v-if="gain !== undefined"
                                class="shrink-0"
                                :class="gain === null ? 'text-warning/80' : ''"
                                :aria-label="`${$t('transcend-build.gear_gain_slot_baseline')} ${gainText}`"
                                data-gear-gain
                                :data-gain-value="gainText"
                                :data-gain-failed="gain === null ? '1' : ''"
                            >
                                {{ gainText }}
                            </span>
                        </div>
                    </div>
                </div>

                <div
                    v-if="socketPips.length"
                    class="pointer-events-none absolute right-1 bottom-16 z-10 flex items-center gap-0.5 rounded-xs bg-base-100/40 px-0.5 py-px backdrop-blur-sm"
                    :class="socketPips.length > 1 ? 'flex-col' : 'flex-row'"
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
            </template>
        </div>
    </FullTooltip>
</template>
