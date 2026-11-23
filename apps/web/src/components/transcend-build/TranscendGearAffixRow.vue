<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import {
    type GearAffixDetailRow,
    type GearAffixLine,
    getGearAffixTitle,
    getUniqueAffixDetailRows,
    isBaseGearLine,
    isGoldGearLineValue,
    isUniqueGearLine,
} from "@/utils/transcend-gear/display"
import { formatRelativeGain } from "@/utils/transcend-gear/gain"
import { isAffixAllowedForChar } from "@/utils/transcend-gear/generation"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { TRANSCEND_MARK_PADDING_TOP_EM, TRANSCEND_MARK_SLOT_EM, TRANSCEND_MARK_TEXT_PULL_EM } from "@/utils/transcendence-icon"
import TranscendGearLineMark from "./TranscendGearLineMark.vue"
import TranscendRichText from "./TranscendRichText.vue"

/**
 * 词缀行（官方 tips 口径）：非基础行固定 1.6em 标记槽（上游 `SizeBox_Point` 24 设计单位），随宿主字号缩放，
 * 标记不裁剪；文本列从槽右边界开始，按上游 `HorizontalBoxSlot_3` 的 `Padding.Left=-2`、`Top=1`
 * （-0.1333em / 0.0667em）对齐，行内不用 gap。基础行不渲染标记槽，文本从最左开始。
 * 标题 / 数值 / 区间在同一文本流内换行：分隔只用文本空白（行首空白会被折叠），不用外边距补偿，换行后仍从文本列开始。
 * 专属行不再内联裸数值：在文本列下方纵向逐行展示属性键值对（`getUniqueAffixDetailRows`），
 * 预览时默认抑制，宿主传入 `show-unique-details`（按住 Shift）时展开。
 * Shift 详情态下普通词条行尾与专属行整体收益（`income`）同格式展示；
 * 专属明细行按行 key（`skill:<type>` / `modeled:<index>:<name>`）叠加可隔离组件的单独收益（`detailIncomes`）。
 * 角色门控：词条 `charIds` 与宿主传入的构筑位角色不匹配时整行划删除线（`data-affix-gated`），不改布局与交互。
 */

const props = withDefaults(
    defineProps<{
        line: GearAffixLine
        /** 紧凑字号（分享摘要等 10px 场景） */
        dense?: boolean
        /** 是否展示档位（编辑器在控件区展示，卡片默认展示） */
        showRoll?: boolean
        /** 预览模式（tooltip 内嵌）：抑制原生 title 与复制按钮，保留 aria / data 语义 */
        preview?: boolean
        /** 预览模式下是否展开专属词条明细行（宿主按住 Shift 时透传；非预览始终展示） */
        showUniqueDetails?: boolean
        /** 行收益 key（普通行 `affix:<index>:<affixId>`；专属行 `unique:<affixId>`）：渲染 data-affix-uid 与收益表对齐 */
        incomeKey?: string
        /** 该词条单独的相对收益（比例，0.032 = +3.2%）：Shift 详情态由宿主透传；缺省不显示 */
        income?: number | null
        /** 专属明细行的单行收益（行 key → 比例）：仅可隔离组件；缺省 / 无该 key 不显示 */
        detailIncomes?: Record<string, number | null> | null
        /** 装备位（专属行属性结算用，纯展示不影响数值） */
        slotId?: number
        /** 构筑位角色 id（0 / 未传表示无角色上下文）：词条 `charIds` 不命中时整行划线 */
        charId?: number
    }>(),
    { dense: false, showRoll: true, preview: false, showUniqueDetails: false, income: undefined, slotId: 0, charId: 0 }
)

const { t } = useTranslation()
const { gt } = useGameText()

const isBase = computed(() => isBaseGearLine(props.line))
const isUnique = computed(() => isUniqueGearLine(props.line))
/** 跨赛季专属：上游 `bDisabled`，标签剥离 + 变红 */
const isDisabled = computed(() => props.line.disabled === true)
/** 角色门控：适用角色与构筑位角色不匹配（无 affix / 无 charIds / 无角色上下文放行） */
const gated = computed(() => (props.line.affix ? !isAffixAllowedForChar(props.line.affix, props.charId) : false))
/** 数值金色：上游 `Value ~= Base`（基础 / 太古强制白色） */
const isGoldValue = computed(() => isGoldGearLineValue(props.line))
/** 标题保留富文本标签；tooltip / data 属性用去标签纯文本 */
const title = computed(() =>
    getGearAffixTitle(props.line.affix, props.line.summaryParts, gt, {
        effect: t("common.effect_label"),
        unknown: t("transcend-build.gear_unknown"),
    })
)
const plainTitle = computed(() => cleanGameMarkup(title.value))
/** 跨赛季专属剥离富文本标签 */
const displayTitle = computed(() => (isDisabled.value ? plainTitle.value : title.value))
/** 专属正文 60% 白；跨赛季专属变红；基础 / 太古 / 随机整行白 */
const titleClass = computed(() => (isDisabled.value ? "text-affix-warning" : isUnique.value ? "text-base-content/60" : "text-base-content"))
/** 专属行属性键值对：非预览始终展示；预览仅在宿主按住 Shift（透传 `showUniqueDetails`）时展开 */
const detailRows = computed<GearAffixDetailRow[]>(() => {
    if (!isUnique.value || !props.line.affix) return []
    if (props.preview && !props.showUniqueDetails) return []
    return getUniqueAffixDetailRows(props.line.affix, props.line.roll, props.slotId, t, gt)
})
/** 专属行明细（行 + 该行单独收益文本；无法隔离的组件为空串） */
const detailRowViews = computed(() =>
    detailRows.value.map(row => ({ row, incomeText: gainTextOf(props.detailIncomes?.[row.key]) }))
)
/** 行收益文本：未提供 / 非有限值 / 四舍五入为 0.0% 时不显示（普通词条与专属整体收益同口径） */
const incomeText = computed(() => gainTextOf(props.income))

/**
 * 收益展示文本：正号百分比；未提供 / 非有限值 / 四舍五入后为 0.0% 时为空串。
 * @param income 相对收益比例（0.032 = +3.2%）
 * @returns 展示文本；不显示时为空串
 */
function gainTextOf(income: number | null | undefined): string {
    if (typeof income !== "number" || !Number.isFinite(income)) return ""
    if (Math.abs(income * 100) < 0.05) return ""
    return formatRelativeGain(income)
}

/** 标记槽尺寸（与标记层同源，统一按 em 缩放） */
const slotStyle = { width: `${TRANSCEND_MARK_SLOT_EM}em`, height: `${TRANSCEND_MARK_SLOT_EM}em` }
/** 非基础行首列 1.6em；基础行单列占满 */
const rowStyle = computed(() => (isBase.value ? undefined : { gridTemplateColumns: `${TRANSCEND_MARK_SLOT_EM}em minmax(0, 1fr)` }))
/** 文本列 `Padding.Top=1` 与 `Padding.Left=-2`（相对槽的负偏移） */
const textStyle = computed(() => ({
    paddingTop: `${TRANSCEND_MARK_PADDING_TOP_EM}em`,
    marginLeft: isBase.value ? undefined : `-${TRANSCEND_MARK_TEXT_PULL_EM}em`,
}))
</script>

<template>
    <div
        class="grid grid-cols-1 items-start"
        :class="[dense ? 'text-[10px] leading-snug' : 'text-[11px] leading-snug', gated ? 'line-through opacity-60' : '']"
        :style="rowStyle"
        :data-affix-source="line.source"
        :data-affix-disabled="isDisabled ? '' : undefined"
        :data-affix-gated="gated ? 'true' : undefined"
        :data-affix-uid="incomeKey"
        data-affix-line
    >
        <span v-if="!isBase" class="flex items-center justify-center" :style="slotStyle" data-gear-line-mark-slot>
            <TranscendGearLineMark :line="line" :preview="preview" />
        </span>
        <div
            class="min-w-0 wrap-break-word"
            :style="textStyle"
            :data-affix-title="plainTitle"
            :title="preview ? undefined : plainTitle"
        >
            <span :class="titleClass"><TranscendRichText :text="displayTitle" /></span>
            <template v-if="!isUnique && line.valueText">{{ " " }}<span class="font-orbitron font-semibold whitespace-nowrap" :class="isGoldValue ? 'text-affix-highlight' : 'text-base-content'" :data-affix-value="line.valueText" :data-affix-value-highlight="isGoldValue ? '' : undefined">{{ line.valueText }}</span></template>
            <template v-if="line.rangeText">{{ " " }}<span class="whitespace-nowrap text-base-content/60" :data-affix-range="line.rangeText">{{ line.rangeText }}</span></template>
            <template v-if="showRoll && line.rollText">{{ " " }}<span class="text-base-content/40">{{ $t("transcend-build.gear_roll_short") }} {{ line.rollText }}</span></template>
            <template v-if="incomeText">{{ " " }}<span class="whitespace-nowrap text-[10px] tabular-nums text-base-content/50" data-affix-income :data-affix-income-value="incomeText">{{ incomeText }}</span></template>
            <template v-if="!line.affix && !preview">{{ " " }}<CopyID :id="line.roll.affixId" compact /></template>
            <div v-if="detailRows.length" class="mt-0.5 flex flex-col gap-y-0.5 text-[10px] leading-tight" data-affix-detail-row>
                <div v-for="view in detailRowViews" :key="view.row.key" class="flex items-baseline gap-1 whitespace-nowrap" :data-affix-detail-key="view.row.key">
                    <span class="text-base-content/45" :data-affix-detail-name="view.row.name">{{ view.row.name }}</span>
                    <span v-if="view.row.value" class="font-orbitron font-semibold" :class="isGoldValue ? 'text-affix-highlight' : 'text-base-content'" :data-affix-detail-value="view.row.value">{{ view.row.value }}</span>
                    <span v-if="view.incomeText" class="tabular-nums text-base-content/50" data-affix-detail-income :data-affix-detail-income-value="view.incomeText">{{ view.incomeText }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
