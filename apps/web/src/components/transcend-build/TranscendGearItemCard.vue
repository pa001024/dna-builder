<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { useGearAffixIncomes } from "@/composables/useGearAffixIncomes"
import { useShiftHeld } from "@/composables/useShiftHeld"
import type { TranscendGearItemConfig } from "@/data"
import { getGearDisplayName, getGearShowRarityId, getShowRarityColorClass } from "@/utils/transcend-gear/catalog"
import {
    type GearAffixLine,
    type GearSocketLine,
    getAncientGearLineCount,
    getGearCraftSummary,
    getGearSocketPointStyle,
    getItemAffixLines,
    getItemIconSrc,
    getItemSocketLines,
    isAncientGearIconLine,
    isUniqueGearLine,
} from "@/utils/transcend-gear/display"
import {
    type GearAffixIncomeSource,
    getAffixLineIncomeKey,
    pickUniqueComponentIncomes,
} from "@/utils/transcend-gear/income"
import { getGearSocketState } from "@/utils/transcend-gear/sockets"
import { TRANSCEND_GROOVE_MARKS, TRANSCEND_MARK_SLOT_EM } from "@/utils/transcendence-icon"
import TranscendGearAffixRow from "./TranscendGearAffixRow.vue"
import TranscendGearAncientStar from "./TranscendGearAncientStar.vue"
import TranscendGearIconMarks from "./TranscendGearIconMarks.vue"
import TranscendGearSlotIcon from "./TranscendGearSlotIcon.vue"

/**
 * 升华装备卡（游戏内装备卡口径）：品质、名称、强度、基础 / 随机 / 专属词缀与最终数值、孔位效果。
 * 数据缺失时回退名称 / 图标快照并标出未知词缀，不按当前数据包裁剪库存物品。
 */

const props = withDefaults(
    defineProps<{
        item: TranscendGearItemConfig
        /** 展示用装备位（只影响解析器输入，不影响最终数值） */
        slotId?: number
        /** 是否展示孔位区块 */
        showSockets?: boolean
        /** 紧凑模式（网格卡片内） */
        compact?: boolean
        /** 无外框版本（tooltip 内嵌） */
        bare?: boolean
        /** 预览模式：隐藏 CopyID，并把 preview 传给词缀行（抑制原生 title / 复制按钮） */
        preview?: boolean
        /** 预览中仍显示专属 CopyID（库存悬浮预览用，官方库存无行头可放 CopyID） */
        showCopyId?: boolean
        /** 是否展示档位（预览面板关闭；编辑器 / 分享摘要保持默认） */
        showRoll?: boolean
        /** 逐词条收益上下文（宿主具备完整构筑时传入；缺省不显示单条收益） */
        affixIncomeSource?: GearAffixIncomeSource | null
        /** 构筑位角色 id（0 / 未传表示无角色上下文）：词条角色门控划线 */
        charId?: number
    }>(),
    {
        slotId: 0,
        showSockets: true,
        compact: false,
        bare: false,
        preview: false,
        showCopyId: false,
        showRoll: true,
        affixIncomeSource: null,
        charId: 0,
    }
)

const { t, i18next } = useTranslation()
const { gt } = useGameText()
const shiftHeld = useShiftHeld()

/** 预览卡按住 Shift 时展开专属词条生效字段；非预览始终展开 */
const showUniqueDetails = computed(() => !props.preview || shiftHeld.value)
/** Shift 详情态逐条收益：仅在预览 + 按住 Shift + 有构筑上下文时请求 */
const affixIncomes = useGearAffixIncomes({
    source: () => props.affixIncomeSource,
    item: () => props.item,
    slotId: () => props.slotId,
    enabled: () => props.preview && shiftHeld.value && Boolean(props.affixIncomeSource),
})

const name = computed(() => getGearDisplayName(props.item, gt, i18next.language))
const iconSrc = computed(() => getItemIconSrc(props.item))
const showRarityId = computed(() => getGearShowRarityId(props.item.rarityId))
const affixLines = computed(() => getItemAffixLines(props.item, props.slotId))
const socketLines = computed(() => (props.showSockets ? getItemSocketLines(props.item) : []))
const socketState = computed(() => getGearSocketState(props.item, props.item.slotType))
const GROOVE_MARKS = TRANSCEND_GROOVE_MARKS
/** 插槽槽 1.6em；空孔与已镶嵌底图 1.2em（随行字号缩放） */
const grooveSlotStyle = { width: `${TRANSCEND_MARK_SLOT_EM}em`, height: `${TRANSCEND_MARK_SLOT_EM}em` }
const grooveFrameStyle = { width: `${GROOVE_MARKS.emptyGroove.em}em`, height: `${GROOVE_MARKS.emptyGroove.em}em` }
/** 宝石图标无上游尺寸证据，与空孔同比例 1.2em（产品一致性选择） */
const gemIconStyle = { width: `${GROOVE_MARKS.occupiedGroove.iconEm}em`, height: `${GROOVE_MARKS.occupiedGroove.iconEm}em` }

/** 插槽行：上游 `PointStyle` 3 空孔 / 4 已镶嵌，只按是否镶嵌宝石区分 */
interface GearGrooveRow {
    socketIndex: number
    line?: GearSocketLine
    pointStyle: 3 | 4
}

/** 已开孔逐孔输出：空孔补 1.2em 空孔行，已镶嵌行走宝石图标链路 */
const grooveRows = computed<GearGrooveRow[]>(() => {
    if (!props.showSockets) return []
    const filled = new Map(socketLines.value.filter(line => getGearSocketPointStyle(line.gemId) === 4).map(line => [line.socketIndex, line]))
    return Array.from({ length: socketState.value.opened }, (_, socketIndex) => {
        const line = filled.get(socketIndex)
        return { socketIndex, line, pointStyle: getGearSocketPointStyle(line?.gemId) }
    })
})
/** 装备级 craft 摘要：精锻等级 / 最终目标 / 淬炼 / 附魔（不按词条分别展示） */
const craftSummary = computed(() => getGearCraftSummary(props.item))
/** 装备图标红星：任意非基础词条太古（复用已有词缀行，不重复计算区间） */
const ancientIcon = computed(() => affixLines.value.some(isAncientGearIconLine))
/** 装备级太古总数：Tips 顶部星条 N 颗（逐词缀，含太古专属行；图标角标仍为布尔一颗） */
const ancientCount = computed(() => getAncientGearLineCount(affixLines.value))
/** 顶部星条无障碍文案：复用现有术语「太古」+ 计数 */
const ancientLabel = computed(() => `${t("transcend-build.gear_ancient")} ×${ancientCount.value}`)

/** 收益仅在预览卡 Shift 详情态 + 有构筑上下文时取用 */
const incomeEnabled = computed(() => props.preview && shiftHeld.value && Boolean(props.affixIncomeSource))

/**
 * 词条行单条收益：普通词条 = 去掉该条；专属词条 = 去掉整条专属词缀。
 * @param line 词条行
 * @returns 相对收益比例；不显示时 undefined
 */
function lineIncome(line: GearAffixLine): number | null | undefined {
    if (!incomeEnabled.value) return undefined
    const key = getAffixLineIncomeKey(line)
    return key === undefined ? undefined : affixIncomes.value[key]
}

/**
 * 专属展开明细行的单行收益：按行 key 对齐组件候选（技能等级 / 建模属性）；
 * 无法隔离的组件没有对应 key，界面自行隐藏。
 * @param line 词条行
 * @returns 行 key → 相对收益比例；非专属 / 未启用时 undefined
 */
function lineDetailIncomes(line: GearAffixLine): Record<string, number | null> | undefined {
    if (!incomeEnabled.value || !isUniqueGearLine(line)) return undefined
    return pickUniqueComponentIncomes(affixIncomes.value, line.roll.affixId)
}

/**
 * 宝石效果文本。
 * @param line 宝石行
 * @returns 展示文本
 */
function socketTitle(line: (typeof socketLines.value)[number]): string {
    const parts = line.summaryParts.map(part => gt(part)).filter(Boolean)
    return parts.length ? parts.join(" · ") : t("transcend-build.gear_unknown")
}
</script>

<template>
    <div :class="bare ? '' : 'overflow-hidden rounded-xs border border-base-content/12 bg-base-100/60'" :data-gear-item="item.kind">
        <div class="flex items-start gap-2.5 border-b border-base-content/10 p-2.5">
            <div class="relative size-10 shrink-0 overflow-hidden rounded-xs border border-base-content/15 bg-base-200/60">
                <ImageFallback :src="iconSrc" :alt="name" class="h-full w-full object-cover">
                    <span class="flex h-full w-full items-center justify-center text-base-content/35">
                        <TranscendGearSlotIcon :slot-type="item.slotType" class="size-6" />
                    </span>
                </ImageFallback>
                <span
                    v-if="showRarityId"
                    class="pointer-events-none absolute top-0 right-0 h-3 w-3 [clip-path:polygon(100%_0,100%_100%,0_0)]"
                    :class="getShowRarityColorClass(showRarityId)"
                    data-gear-rarity-wedge
                    :data-gear-rarity="showRarityId"
                />
                <TranscendGearIconMarks
                    v-if="ancientIcon"
                    :ancient="ancientIcon"
                    :suppress-title="preview"
                    class="pointer-events-none absolute top-0.5 left-0.5 z-10"
                />
            </div>
            <div class="min-w-0 flex-1">
                <div
                    v-if="!compact && ancientCount > 0"
                    class="mb-1 flex items-center gap-[0.35em] text-[13px]"
                    data-gear-ancient-bar
                    :data-gear-ancient-count="ancientCount"
                    role="img"
                    :aria-label="ancientLabel"
                >
                    <TranscendGearAncientStar v-for="index in ancientCount" :key="index" variant="total" suppress-title aria-hidden="true" />
                </div>
                <div class="flex flex-wrap items-center gap-1.5" data-gear-title-row>
                    <span class="truncate text-[13px] font-semibold text-base-content/85" data-gear-title>{{ name || $t("transcend-build.gear_unknown") }}</span>
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-base-content/50">
                    <span v-if="item.equipBaseScore">{{ $t("transcend-build.gear_strength") }} <b class="font-orbitron text-base-content/70" data-gear-strength>{{ item.equipBaseScore }}</b></span>
                    <span v-else class="text-base-content/35">{{ $t("transcend-build.gear_strength_unset") }}</span>
                    <span v-if="craftSummary.masterworkLevel > 0" class="text-warning/80" data-gear-masterwork>{{ $t("transcend-build.gear_masterwork_level", { level: craftSummary.masterworkLevel }) }}</span>
                    <span v-if="item.uniqueId && (!preview || showCopyId)"><CopyID :id="item.uniqueId" compact /></span>
                    <span v-if="socketState.max > 0" data-gear-socket-state>
                        {{ $t("transcend-build.gear_socket_used") }} {{ socketState.used }} ·
                        {{ $t("transcend-build.gear_socket_opened") }} {{ socketState.opened }}/{{ socketState.max }}
                    </span>
                </div>
            </div>
        </div>

        <div class="space-y-1.5 p-2.5">
            <TranscendGearAffixRow
                v-for="line in affixLines"
                :key="`${line.source}-${line.roll.affixId}`"
                :line="line"
                :slot-id="slotId"
                :char-id="charId"
                :show-roll="!compact && !preview && showRoll"
                :preview="preview"
                :show-unique-details="showUniqueDetails"
                :income-key="getAffixLineIncomeKey(line)"
                :income="lineIncome(line)"
                :detail-incomes="lineDetailIncomes(line)"
            />

            <div v-if="showSockets && grooveRows.length" class="space-y-1 border-t border-base-content/10 pt-1.5">
                <div
                    v-for="row in grooveRows"
                    :key="`socket-${row.socketIndex}`"
                    class="flex items-start gap-2 text-[11px]"
                    :data-gear-socket="row.line ? row.socketIndex : undefined"
                    :data-gear-socket-empty="row.line ? undefined : row.socketIndex"
                    :data-affix-type="row.line ? 'gem' : undefined"
                    :role="row.line ? 'group' : 'img'"
                    :aria-label="row.line ? $t('transcend-build.gear_type_gem') : $t('transcend-build.gear_socket_empty')"
                >
                    <span class="relative grid shrink-0 place-items-center" :style="grooveSlotStyle" data-gear-groove :data-gear-groove-point-style="row.pointStyle">
                        <img v-if="!row.line" :src="GROOVE_MARKS.emptyGroove.url" alt="" aria-hidden="true" class="shrink-0" :style="grooveFrameStyle" data-gear-groove-icon />
                        <template v-else>
                            <img :src="GROOVE_MARKS.emptyGroove.url" alt="" aria-hidden="true" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" :style="grooveFrameStyle" data-gear-groove-frame />
                            <ImageFallback :src="row.line.iconSrc" :alt="row.line.name" class="relative object-contain" :style="gemIconStyle" data-gear-groove-icon>
                                <span class="flex items-center justify-center rounded-xs border border-base-content/15 text-[9px] text-base-content/40" :style="gemIconStyle">
                                    {{ $t("transcend-build.gear_type_gem").slice(0, 1) }}
                                </span>
                            </ImageFallback>
                        </template>
                    </span>
                    <div class="min-w-0 flex-1">
                        <template v-if="row.line">
                            <span v-if="row.line.unknownGem" class="text-affix-title" data-gear-groove-title>{{ $t("transcend-build.gear_unknown_gem") }}</span>
                            <span v-else class="text-affix-title" data-gear-groove-title>{{ gt(row.line.name) }}</span>
                            <CopyID v-if="row.line.unknownGem && !preview" :id="row.line.gemId" compact />
                            <span class="ml-1.5 text-affix-title opacity-70">{{ socketTitle(row.line) }}</span>
                        </template>
                        <span v-else :style="{ color: GROOVE_MARKS.emptyGroove.color }" data-gear-groove-label>{{ $t("transcend-build.gear_socket_empty") }}</span>
                    </div>
                    <span v-if="row.line?.valueText" class="shrink-0 font-orbitron text-[11px] text-info">{{ row.line.valueText }}</span>
                </div>
            </div>
            <p v-if="!affixLines.length && !grooveRows.length" class="py-1 text-[11px] text-base-content/35">
                {{ $t("transcend-build.gear_no_affix_selected") }}
            </p>
        </div>

        <p v-if="preview" class="border-t border-base-content/8 px-2.5 py-1 text-center text-[10px] text-base-content/40" data-gear-shift-hint>
            {{ $t("transcend-build.gear_shift_hint") }}
        </p>
    </div>
</template>
