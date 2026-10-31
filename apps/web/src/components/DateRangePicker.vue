<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui"
import { computed, ref, watch } from "vue"
/** 日期区间的日历选择器：通用组件，文案由调用方经 labels 传入。 */
import { startOfDay } from "@/utils/afk-ledger"

/** 区间选择结果：首日零点（含）～末日次日零点（不含）。 */
export type DateRangeValue = { from: number; to: number }

const props = defineProps<{
    /** 是否正处于自定义区间 */
    active: boolean
    /** 按钮文案：未选时为「自定义」，已选时为 `MM-DD~MM-DD` */
    label: string
    /** 当前已选区间（打开面板时高亮用） */
    current: DateRangeValue | null
    /** 面板文案：提示语与四个快捷项，调用方按界面语言传入 */
    labels: { hint: string; yesterday: string; thisMonth: string; lastMonth: string; days90: string }
}>()

const emit = defineEmits<{ select: [value: DateRangeValue] }>()

const { i18next } = useTranslation()
const open = ref(false)
/** 面板正在看的年月。 */
const viewYear = ref(0)
const viewMonth = ref(0)
/** 第一次点击选中的首日零点；第二次点击落定末日。 */
const pendingStart = ref<number | null>(null)
/** 悬停预览的末日零点（已点首日、未点末日时画出整段）。 */
const hoverDay = ref<number | null>(null)

const DAY_MS = 86400000
/** 最多往前翻的月数，避免无意义地翻到数据保留期之外。 */
const MAX_BACK_MONTHS = 24

/**
 * 面板打开时回到当前区间（或今天）所在的月份，并清空上次的选择进度。
 */
watch(open, value => {
    if (!value) return
    const anchor = props.current?.from ?? Date.now()
    const date = new Date(anchor)
    viewYear.value = date.getFullYear()
    viewMonth.value = date.getMonth()
    pendingStart.value = null
    hoverDay.value = null
})

/** 面板标题，如「2026年10月」，跟随界面语言。 */
const viewTitle = computed(() => {
    try {
        return new Intl.DateTimeFormat(i18next.language || undefined, { year: "numeric", month: "long" }).format(
            new Date(viewYear.value, viewMonth.value, 1)
        )
    } catch {
        return `${viewYear.value}-${viewMonth.value + 1}`
    }
})

/** 周头（周一起）：用 narrow 格式跟随界面语言，如 一二三四五六日。 */
const weekdayNames = computed(() => {
    try {
        const format = new Intl.DateTimeFormat(i18next.language || undefined, { weekday: "narrow" })
        // 2026-01-05 是周一，往后取 7 天即周一优先的周头
        return Array.from({ length: 7 }, (_, index) => format.format(new Date(2026, 0, 5 + index)))
    } catch {
        return ["一", "二", "三", "四", "五", "六", "日"]
    }
})

/** 今天零点：之后的日子没有数据，不可选。 */
const todayStart = computed(() => startOfDay(Date.now()))

/** 当月日历格：前导空格 + 每天的零点时间戳。 */
const cells = computed(() => {
    const leading = (new Date(viewYear.value, viewMonth.value, 1).getDay() + 6) % 7
    const days = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
    return [
        ...Array<null>(leading).fill(null),
        ...Array.from({ length: days }, (_, index) => startOfDay(new Date(viewYear.value, viewMonth.value, index + 1).getTime())),
    ]
})

/** 是否还能往前翻（封顶 24 个月）。 */
const canGoPrev = computed(() => {
    const now = new Date()
    return (now.getFullYear() - viewYear.value) * 12 + (now.getMonth() - viewMonth.value) < MAX_BACK_MONTHS
})

/** 是否还能往后翻（不进入未来的月份）。 */
const canGoNext = computed(() => {
    const now = new Date()
    return viewYear.value < now.getFullYear() || (viewYear.value === now.getFullYear() && viewMonth.value < now.getMonth())
})

/**
 * 往前 / 往后翻一个月。
 * @param delta -1 上个月，1 下个月
 */
function stepMonth(delta: number) {
    const date = new Date(viewYear.value, viewMonth.value + delta, 1)
    viewYear.value = date.getFullYear()
    viewMonth.value = date.getMonth()
}

/**
 * 落定一个区间并关闭面板。
 * @param from 首日零点
 * @param toExclusive 末日次日零点
 */
function applyRange(from: number, toExclusive: number) {
    pendingStart.value = null
    hoverDay.value = null
    open.value = false
    emit("select", { from, to: toExclusive })
}

/**
 * 点击某天：第一次记下首日，第二次按先后组成区间落定；重复点首日则取消。
 * @param day 该天零点
 */
function pickDay(day: number) {
    if (day > todayStart.value) return
    const start = pendingStart.value
    if (start === null) {
        pendingStart.value = day
        return
    }
    if (start === day) {
        pendingStart.value = null
        return
    }
    const from = Math.min(start, day)
    applyRange(from, Math.max(start, day) + DAY_MS)
}

/**
 * 快捷项：昨天 / 本月 / 上月 / 90 天，直接落定。
 * @param kind 快捷类型
 */
function applyQuick(kind: "yesterday" | "thisMonth" | "lastMonth" | "days90") {
    const today = todayStart.value
    const now = new Date()
    if (kind === "yesterday") {
        applyRange(today - DAY_MS, today)
        return
    }
    if (kind === "thisMonth") {
        applyRange(startOfDay(new Date(now.getFullYear(), now.getMonth(), 1).getTime()), today + DAY_MS)
        return
    }
    if (kind === "lastMonth") {
        const first = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime())
        applyRange(first, startOfDay(new Date(now.getFullYear(), now.getMonth(), 1).getTime()))
        return
    }
    applyRange(today - 89 * DAY_MS, today + DAY_MS)
}

/**
 * 某天在当前高亮区间内（含悬停预览）。
 * @param day 该天零点
 * @returns 是否落在区间内
 */
function inRange(day: number) {
    if (pendingStart.value !== null && hoverDay.value !== null) {
        const from = Math.min(pendingStart.value, hoverDay.value)
        const to = Math.max(pendingStart.value, hoverDay.value)
        return day >= from && day <= to
    }
    const current = props.current
    if (pendingStart.value === null && current) return day >= current.from && day < current.to
    return false
}

/**
 * 某天是否是区间端点（含悬停预览的另一端）。
 * @param day 该天零点
 * @returns 是否端点
 */
function isEndpoint(day: number) {
    if (pendingStart.value !== null) {
        if (day === pendingStart.value) return true
        if (hoverDay.value !== null && hoverDay.value !== pendingStart.value && day === hoverDay.value) return true
        return false
    }
    const current = props.current
    return current !== null && (day === current.from || day === current.to - DAY_MS)
}
</script>

<template>
    <PopoverRoot v-model:open="open">
        <PopoverTrigger
            type="button"
            class="btn btn-xs whitespace-nowrap"
            :class="active ? 'border-primary bg-primary/10 text-primary' : ''"
            :aria-pressed="active"
        >
            <Icon icon="radix-icons:calendar" class="size-3.5" />
            {{ label }}
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent
                align="start"
                :side-offset="4"
                class="z-10000 w-72 rounded-xs border border-base-content/15 bg-base-100/95 p-2.5 shadow-lg backdrop-blur-md"
            >
                <p class="mb-2 text-[11px] text-base-content/50">{{ labels.hint }}</p>
                <div class="mb-2 flex flex-wrap gap-1.5">
                    <button type="button" class="btn btn-xs" @click="applyQuick('yesterday')">
                        {{ labels.yesterday }}
                    </button>
                    <button type="button" class="btn btn-xs" @click="applyQuick('thisMonth')">
                        {{ labels.thisMonth }}
                    </button>
                    <button type="button" class="btn btn-xs" @click="applyQuick('lastMonth')">
                        {{ labels.lastMonth }}
                    </button>
                    <button type="button" class="btn btn-xs" @click="applyQuick('days90')">
                        {{ labels.days90 }}
                    </button>
                </div>
                <div class="mb-1 flex items-center justify-between">
                    <button
                        type="button"
                        class="btn btn-xs btn-square btn-ghost"
                        :disabled="!canGoPrev"
                        @click="stepMonth(-1)"
                    >
                        <Icon icon="ri:arrow-left-s-line" class="size-3.5" />
                    </button>
                    <span class="text-xs font-medium">{{ viewTitle }}</span>
                    <button
                        type="button"
                        class="btn btn-xs btn-square btn-ghost"
                        :disabled="!canGoNext"
                        @click="stepMonth(1)"
                    >
                        <Icon icon="ri:arrow-right-s-line" class="size-3.5" />
                    </button>
                </div>
                <div class="grid grid-cols-7 text-center text-[10px] text-base-content/40">
                    <span v-for="name in weekdayNames" :key="name" class="py-1">{{ name }}</span>
                </div>
                <div class="grid grid-cols-7 gap-px text-center">
                    <template v-for="(day, index) in cells" :key="index">
                        <span v-if="day === null" />
                        <button
                            v-else
                            type="button"
                            class="rounded-xs py-1 text-[11px] transition-colors"
                            :disabled="day > todayStart"
                            :class="[
                                day > todayStart
                                    ? 'cursor-not-allowed text-base-content/20'
                                    : isEndpoint(day)
                                      ? 'bg-primary font-semibold text-primary-content'
                                      : inRange(day)
                                        ? 'bg-primary/15 text-primary'
                                        : 'text-base-content/75 hover:bg-primary/10',
                            ]"
                            @click="pickDay(day)"
                            @mouseenter="hoverDay = day"
                            @mouseleave="hoverDay = null"
                        >
                            {{ new Date(day).getDate() }}
                        </button>
                    </template>
                </div>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
