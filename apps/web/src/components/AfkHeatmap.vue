<script setup lang="ts">
/**
 * 每日副本总时长的 GitHub 风格热力图。
 *
 * 数据是场次收尾时维护的每日每副本聚合格：一整年一次查询取齐，
 * 本组件只在已拿到的格子上按副本筛选，O(1) 直接渲染。
 * 格子尺寸按容器实测宽度自适应：宽度够就铺满整列，不留横向滚动条也不留白。
 */

import { useElementSize } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import Tooltip from "@/components/Tooltip.vue"
import { AFK_HEATMAP_DAYS, type AfkDay, afkDungeonLabel, dayIdOf, startOfDay } from "@/utils/afk-ledger"

const props = defineProps<{
    /** `loadDayCells` 取出的日聚合格 */
    cells: AfkDay[]
    /** 当前副本筛选：空串表示全部副本 */
    dungeonId?: string
    /** 点击选中的日子零点；null 表示未选 */
    selected?: number | null
}>()

const emit = defineEmits<{
    /** 点击某个日子的格子（参数为该日零点时间戳） */
    select: [dayStart: number]
}>()

const { t } = useTranslation()

/** 列间距（px）。 */
const GAP = 3
/** 星期标签列宽 + 与网格的间距。 */
const LABEL_W = 20 + GAP
/** 格子边长上下限：低于下限时按最小宽度出滚动条，高于上限不再放大。 */
const CELL_MIN = 8
const CELL_MAX = 14

/** 网格容器：实测宽度驱动格子自适应。 */
const gridBox = ref<HTMLDivElement | null>(null)
const { width: boxWidth } = useElementSize(gridBox)

/** 今天的零点：组件存活期间跨零点不重算，网格保持稳定。 */
const todayStart = startOfDay(Date.now())

/** 当前副本筛选下 dayId → 合计（含跨副本合计；副本筛选时只含该副本的格）。 */
const cellByDay = computed(() => {
    const map = new Map<number, { durationMs: number; runs: number }>()
    for (const cell of props.cells) {
        if (props.dungeonId && cell.dungeonId !== props.dungeonId) continue
        const row = map.get(cell.dayId)
        if (row) {
            row.durationMs += cell.durationMs
            row.runs += cell.runs
        } else {
            map.set(cell.dayId, { durationMs: cell.durationMs, runs: cell.runs })
        }
    }
    return map
})

/** 热力图的第一天：结束日往前推满 53 周网格的起始周一（本地时区）。 */
const gridStart = computed(() => {
    const start = todayStart - (AFK_HEATMAP_DAYS - 1) * 86400000
    // 对齐到本周一，让每一列都是完整的一周（周一在顶）
    const dow = (new Date(start).getDay() + 6) % 7
    return start - dow * 86400000
})

/** 图上的日子（含网格起点之前的补齐格）。 */
const days = computed(() => {
    const count = Math.ceil((todayStart - gridStart.value) / 86400000) + 1
    return Array.from({ length: count }, (_, index) => gridStart.value + index * 86400000)
})

/** 实际用到的周列数（起点对齐周一后最多 54 列）。 */
const weekCount = computed(() => Math.max(1, Math.ceil(days.value.length / 7)))

/**
 * 格子边长：把可用宽度均分给所有列，夹在上下限内。
 * 宽度未测出前按上限给，首帧不闪；测出后自适应铺满。
 */
const cell = computed(() => {
    if (boxWidth.value <= 0) return CELL_MAX
    const fit = (Math.floor(boxWidth.value) - (weekCount.value - 1) * GAP) / weekCount.value
    return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(fit * 10) / 10))
})

/** 网格像素宽：列数 × 边长 + 列间 gap。 */
const gridWidth = computed(() => weekCount.value * cell.value + (weekCount.value - 1) * GAP)

/** 周列标签：每月第一个出现的列标月份缩写。 */
const monthLabels = computed(() => {
    const labels: { week: number; text: string }[] = []
    let lastMonth = -1
    for (const [index, dayStart] of days.value.entries()) {
        const week = Math.floor(index / 7)
        const month = new Date(dayStart).getMonth()
        if (month !== lastMonth) {
            labels.push({ week, text: t(`afk-ledger.month_${month + 1}`) })
            lastMonth = month
        }
    }
    return labels
})

/** 着色分档：按时长映射 0–4 级（阈值 15m / 1h / 3h）。 */
const maxLevel = 4
const thresholds = [15 * 60000, 3600000, 3 * 3600000]

/**
 * 一天的时长落在哪一级。
 * @param durationMs 当日副本总时长
 * @returns 0（无）到 4（最长）
 */
function levelOf(durationMs: number) {
    if (durationMs <= 0) return 0
    let level = 1
    for (const limit of thresholds) if (durationMs >= limit) level += 1
    return Math.min(maxLevel, level)
}

/** 一天的展示数据。 */
type HeatmapDay = {
    dayStart: number
    durationMs: number
    runs: number
    level: number
    future: boolean
    selected: boolean
    tip: string
}

/** 选中的 dayId：整张网格共用一次换算。 */
const selectedDayId = computed(() => (props.selected == null ? null : dayIdOf(props.selected)))

const gridDays = computed<HeatmapDay[]>(() => {
    const selected = selectedDayId.value
    return days.value.map(dayStart => {
        const cellData = cellByDay.value.get(dayIdOf(dayStart))
        const day = {
            dayStart,
            durationMs: cellData?.durationMs ?? 0,
            runs: cellData?.runs ?? 0,
            level: levelOf(cellData?.durationMs ?? 0),
            future: dayStart > todayStart,
            selected: selected !== null && dayIdOf(dayStart) === selected,
        }
        return { ...day, tip: tipOf(day) }
    })
})

/** 色阶：主题中性底 + 主色渐深（与 KPI/图表同一套 CSS 变量）。 */
const levelClasses = [
    "bg-base-content/8",
    "bg-primary/25",
    "bg-primary/50",
    "bg-primary/75",
    "bg-primary",
]

/** 悬停提示（title）：日期 + 时长 + 场次。 */
function tipOf(day: Pick<HeatmapDay, "dayStart" | "durationMs" | "runs">) {
    const date = new Date(day.dayStart)
    const pad = (v: number) => String(v).padStart(2, "0")
    const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    if (day.durationMs <= 0) return `${stamp} · ${t("afk-ledger.heat_none")}`
    return `${stamp} · ${formatHeatDuration(day.durationMs)} · ${t("afk-ledger.heat_runs", { runs: day.runs })}`
}

/** 毫秒 → `12h26m` / `26m` / `45s`（时长用单位后缀，避免和 HH:mm 时刻混淆）。 */
function formatHeatDuration(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const pad = (v: number) => String(v).padStart(2, "0")
    if (hours > 0) return `${hours}h${pad(minutes)}m`
    if (minutes > 0) return `${minutes}m`
    return `${total}s`
}

/** 当前副本名（提示与空态共用）。 */
const dungeonLabel = computed(() => {
    if (!props.dungeonId) return ""
    const cellData = props.cells.find(c => c.dungeonId === props.dungeonId)
    return afkDungeonLabel(props.dungeonId, cellData?.dungeonName ?? "")
})
</script>

<template>
    <div class="min-w-0">
        <!-- 月份行：按周列对齐（标签列宽 + 列号 × (格+距)） -->
        <div class="relative mb-1 h-4 overflow-hidden" :style="{ paddingLeft: `${LABEL_W}px` }">
            <span
                v-for="label in monthLabels"
                :key="label.week"
                class="absolute text-[10px] whitespace-nowrap text-base-content/40"
                :style="{ left: `${LABEL_W + label.week * (cell + GAP)}px` }"
            >
                {{ label.text }}
            </span>
        </div>
        <div class="flex" :style="{ gap: `${GAP}px` }">
            <!-- 星期行标签：只标 一/三/五，与 GitHub 一致 -->
            <div
                class="flex w-5 shrink-0 flex-col text-[10px] text-base-content/40"
                :style="{ gap: `${GAP}px`, lineHeight: `${cell}px` }"
            >
                <span v-for="dow in 7" :key="dow" :style="{ height: `${cell}px` }">
                    <template v-if="dow === 1">{{ $t("afk-ledger.week_1") }}</template>
                    <template v-else-if="dow === 3">{{ $t("afk-ledger.week_3") }}</template>
                    <template v-else-if="dow === 5">{{ $t("afk-ledger.week_5") }}</template>
                </span>
            </div>
            <div ref="gridBox" class="relative min-w-0 flex-1 overflow-x-auto">
                <!-- p-px：给 ring 高亮留 1px 余量，边缘格子的描边不会被 overflow 裁掉 -->
                <div class="grid grid-flow-col grid-rows-7 p-px" :style="{ width: `${gridWidth + 2}px`, gap: `${GAP}px` }">
                    <Tooltip v-for="day in gridDays" :key="day.dayStart" :tooltip="day.tip">
                        <button
                            type="button"
                            class="relative block cursor-pointer rounded-xs outline-none hover:z-10 hover:ring-1 hover:ring-base-content/70 focus-visible:ring-1 focus-visible:ring-primary"
                            :class="[
                                day.future ? 'invisible' : levelClasses[day.level],
                                day.selected ? 'z-10 ring-1 ring-base-content' : '',
                            ]"
                            :style="{ width: `${cell}px`, height: `${cell}px` }"
                            :aria-label="day.tip"
                            :disabled="day.future"
                            @click="emit('select', day.dayStart)"
                        />
                    </Tooltip>
                </div>
            </div>
        </div>
        <!-- 图例与当前副本 -->
        <div class="mt-1 flex items-center gap-2 text-[10px] text-base-content/40">
            <span v-if="dungeonLabel" class="min-w-0 truncate">{{ dungeonLabel }}</span>
            <span class="ml-auto inline-flex items-center gap-1">
                {{ $t("afk-ledger.heat_less") }}
                <span
                    v-for="cls in levelClasses"
                    :key="cls"
                    class="rounded-xs"
                    :class="cls"
                    :style="{ width: `${Math.min(10, cell)}px`, height: `${Math.min(10, cell)}px` }"
                />
                {{ $t("afk-ledger.heat_more") }}
            </span>
        </div>
    </div>
</template>
