<script setup lang="ts">
import { CalendarDate, CalendarDateTime, type DateValue, fromDate, getLocalTimeZone, today } from "@internationalized/date"
import { useTranslation } from "i18next-vue"
import {
    CalendarCell,
    CalendarCellTrigger,
    CalendarGrid,
    CalendarGridBody,
    CalendarGridHead,
    CalendarGridRow,
    CalendarHeadCell,
    CalendarHeader,
    CalendarHeading,
    CalendarNext,
    CalendarPrev,
    CalendarRoot,
    PopoverContent,
    PopoverPortal,
    PopoverRoot,
    PopoverTrigger,
} from "reka-ui"
import { type ComponentPublicInstance, computed, ref, watch } from "vue"

const props = defineProps<{
    /** 当前值（本地时区秒级时间戳）；undefined 为空 */
    modelValue?: number | null
    /** 空值占位文案 */
    placeholder?: string
}>()

const emit = defineEmits<{
    "update:modelValue": [value: number | undefined]
}>()

const { t, i18next } = useTranslation()

/** 跟随应用语言（t 建立响应式依赖，切换语言时日历表头同步重渲染） */
const locale = computed(() => {
    void t("common.all")
    return i18next.language || undefined
})

/** 日历视图：日期 / 年月（点顶部月份标题切换） */
const view = ref<"date" | "month">("date")

const datePart = ref<CalendarDate | undefined>()
/** 日历当前展示月份（非受控初始值；跳转时递增 calendarKey 重挂） */
const calendarPlaceholder = ref<DateValue>(today(getLocalTimeZone()))
const calendarKey = ref(0)
const hour = ref(0)
const minute = ref(0)

watch(
    () => props.modelValue,
    value => {
        if (value === undefined || value === null) {
            datePart.value = undefined
            return
        }
        const zoned = fromDate(new Date(value * 1000), getLocalTimeZone())
        datePart.value = new CalendarDate(zoned.year, zoned.month, zoned.day)
        if (calendarPlaceholder.value.year !== zoned.year || calendarPlaceholder.value.month !== zoned.month) {
            calendarPlaceholder.value = new CalendarDate(zoned.year, zoned.month, zoned.day)
            calendarKey.value += 1
        }
        hour.value = zoned.hour
        minute.value = zoned.minute
    },
    { immediate: true }
)

const displayText = computed(() => {
    const value = props.modelValue
    if (value === undefined || value === null) {
        return ""
    }
    const date = new Date(value * 1000)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
        date.getMinutes()
    )}`
})

const hours = computed(() => Array.from({ length: 24 }, (_, index) => index))
const minutes = computed(() => Array.from({ length: 60 }, (_, index) => index))

/** 本地化月份短名（1~12 月） */
const monthNames = computed(() => {
    const formatter = new Intl.DateTimeFormat(locale.value || undefined, { month: "short" })
    return Array.from({ length: 12 }, (_, index) => formatter.format(new Date(2026, index, 1)))
})

const todayDate = computed(() => today(getLocalTimeZone()))

function emitValue() {
    if (!datePart.value) {
        emit("update:modelValue", undefined)
        return
    }
    const dateTime = new CalendarDateTime(
        datePart.value.year,
        datePart.value.month,
        datePart.value.day,
        hour.value,
        minute.value
    )
    emit("update:modelValue", Math.floor(dateTime.toDate(getLocalTimeZone()).getTime() / 1000))
}

/**
 * 日期切换：保留已选时间；取消选中则清空。
 * @param value 日历值
 */
function handleDateSelect(value: { year: number; month: number; day: number } | undefined) {
    datePart.value = value === undefined ? undefined : new CalendarDate(value.year, value.month, value.day)
    emitValue()
}

/**
 * 整体平移展示月份/年份（按钮与滚轮共用）。
 * @param delta 步进（正数向后）
 * @param unit 步进单位
 */
function shiftCalendar(delta: number, unit: "months" | "years") {
    calendarPlaceholder.value =
        unit === "months" ? calendarPlaceholder.value.add({ months: delta }) : calendarPlaceholder.value.add({ years: delta })
    calendarKey.value += 1
}

/**
 * 年月视图选中某月：切回日期视图并展示该月。
 * @param monthIndex 月份序号（0-based）
 */
function selectMonth(monthIndex: number) {
    calendarPlaceholder.value = calendarPlaceholder.value.set({ month: monthIndex + 1 })
    calendarKey.value += 1
    view.value = "date"
}

/**
 * 判断年月格是否为当前展示月。
 * @param monthIndex 月份序号（0-based）
 */
function isSelectedMonth(monthIndex: number): boolean {
    return calendarPlaceholder.value.month === monthIndex + 1
}

/**
 * 判断年月格是否为本月。
 * @param monthIndex 月份序号（0-based）
 */
function isTodayMonth(monthIndex: number): boolean {
    return todayDate.value.year === calendarPlaceholder.value.year && todayDate.value.month === monthIndex + 1
}

/**
 * 回到当前时刻。
 */
function resetToNow() {
    const zoned = fromDate(new Date(), getLocalTimeZone())
    datePart.value = new CalendarDate(zoned.year, zoned.month, zoned.day)
    calendarPlaceholder.value = new CalendarDate(zoned.year, zoned.month, zoned.day)
    calendarKey.value += 1
    hour.value = zoned.hour
    minute.value = zoned.minute
    emitValue()
}

let wheelElement: HTMLElement | null = null
let wheelAccumulator = 0
let wheelCooldown = false

/**
 * 日历区滚轮翻页：日期视图按月，月份视图按年（需非 passive 才能吞掉页面滚动）。
 */
function handleWheel(event: WheelEvent) {
    event.preventDefault()
    if (wheelCooldown) {
        return
    }
    wheelAccumulator += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    if (Math.abs(wheelAccumulator) < 40) {
        return
    }
    const direction = wheelAccumulator > 0 ? 1 : -1
    wheelAccumulator = 0
    wheelCooldown = true
    window.setTimeout(() => {
        wheelCooldown = false
    }, 180)
    shiftCalendar(direction, view.value === "month" ? "years" : "months")
}

/**
 * 绑定滚轮监听（内容随 Popover 挂载/卸载，这里自管理避免 passive 失效）。
 */
function bindWheel(element: Element | ComponentPublicInstance | null) {
    if (wheelElement) {
        wheelElement.removeEventListener("wheel", handleWheel)
    }
    wheelElement = element instanceof HTMLElement ? element : null
    wheelElement?.addEventListener("wheel", handleWheel, { passive: false })
}
</script>
<template>
    <PopoverRoot
        @update:open="
            open => {
                if (!open) view = 'date'
            }
        "
    >
        <PopoverTrigger class="btn btn-sm min-w-0 max-w-full gap-2">
            <Icon icon="radix-icons:calendar" class="size-4 shrink-0" />
            <span v-if="displayText" class="truncate font-mono text-[13px]">{{ displayText }}</span>
            <span v-else class="truncate text-sm text-base-content/45">{{ placeholder ?? $t("datetimepicker.placeholder") }}</span>
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent
                class="z-10000 w-auto rounded-xs border border-base-content/15 bg-base-100/95 p-3 shadow-lg backdrop-blur-md"
                side="bottom"
                align="start"
                :side-offset="5"
            >
                <div :ref="bindWheel">
                    <div v-if="view === 'date'">
                        <CalendarRoot
                            :key="calendarKey"
                            v-slot="{ grid, weekDays }"
                            :model-value="datePart"
                            :default-placeholder="calendarPlaceholder as DateValue"
                            :locale="locale"
                            fixed-weeks
                            @update:model-value="handleDateSelect"
                        >
                            <CalendarHeader class="flex items-center justify-between">
                                <CalendarPrev class="btn btn-xs h-7 w-7 cursor-pointer p-0" aria-label="Previous month">
                                    <Icon icon="radix-icons:chevron-left" class="size-4" />
                                </CalendarPrev>
                                <CalendarHeading
                                    class="cursor-pointer rounded-xs px-2 py-0.5 text-sm font-medium transition-colors hover:bg-primary/10"
                                    @click="view = 'month'"
                                />
                                <CalendarNext class="btn btn-xs h-7 w-7 cursor-pointer p-0" aria-label="Next month">
                                    <Icon icon="radix-icons:chevron-right" class="size-4" />
                                </CalendarNext>
                            </CalendarHeader>
                            <div class="mt-2 flex flex-col gap-y-2">
                                <CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse">
                                    <CalendarGridHead>
                                        <CalendarGridRow class="flex">
                                            <CalendarHeadCell
                                                v-for="day in weekDays"
                                                :key="day"
                                                class="w-9 text-[11px] text-base-content/45"
                                            >
                                                {{ day }}
                                            </CalendarHeadCell>
                                        </CalendarGridRow>
                                    </CalendarGridHead>
                                    <CalendarGridBody>
                                        <CalendarGridRow v-for="(week, weekIndex) in month.rows" :key="weekIndex" class="mt-1 flex w-full">
                                            <CalendarCell v-for="date in week" :key="date.toString()" :date="date">
                                                <CalendarCellTrigger
                                                    :day="date"
                                                    :month="month.value"
                                                    class="flex size-9 cursor-pointer items-center justify-center rounded-xs text-sm transition-colors hover:bg-primary/10 data-disabled:pointer-events-none data-disabled:opacity-40 data-outside-view:text-base-content/35 data-selected:bg-primary data-selected:font-semibold data-selected:text-primary-content data-today:border data-today:border-primary/60 data-unavailable:line-through"
                                                />
                                            </CalendarCell>
                                        </CalendarGridRow>
                                    </CalendarGridBody>
                                </CalendarGrid>
                            </div>
                        </CalendarRoot>
                    </div>
                    <div v-else>
                        <div class="flex items-center justify-between">
                            <button
                                type="button"
                                class="btn btn-xs h-7 w-7 cursor-pointer p-0"
                                aria-label="Previous year"
                                @click="shiftCalendar(-1, 'years')"
                            >
                                <Icon icon="radix-icons:chevron-left" class="size-4" />
                            </button>
                            <span class="font-mono text-sm">{{ calendarPlaceholder.year }}</span>
                            <button
                                type="button"
                                class="btn btn-xs h-7 w-7 cursor-pointer p-0"
                                aria-label="Next year"
                                @click="shiftCalendar(1, 'years')"
                            >
                                <Icon icon="radix-icons:chevron-right" class="size-4" />
                            </button>
                        </div>
                        <div class="mt-2 grid grid-cols-4 gap-1">
                            <button
                                v-for="(name, monthIndex) in monthNames"
                                :key="name"
                                type="button"
                                class="flex h-12 cursor-pointer items-center justify-center rounded-xs text-sm transition-colors hover:bg-primary/10"
                                :class="{
                                    'bg-primary font-semibold text-primary-content': isSelectedMonth(monthIndex),
                                    'border border-primary/60': isTodayMonth(monthIndex) && !isSelectedMonth(monthIndex),
                                }"
                                @click="selectMonth(monthIndex)"
                            >
                                {{ name }}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="mt-2 flex items-center gap-2 border-t border-base-content/10 pt-2">
                    <Select
                        :model-value="hour"
                        class="w-20 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                        @update:model-value="hour = Number($event); emitValue()"
                    >
                        <SelectItem v-for="h in hours" :key="h" :value="h">{{ String(h).padStart(2, "0") }}</SelectItem>
                    </Select>
                    <span class="font-mono text-sm text-base-content/45">:</span>
                    <Select
                        :model-value="minute"
                        class="w-20 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                        @update:model-value="minute = Number($event); emitValue()"
                    >
                        <SelectItem v-for="m in minutes" :key="m" :value="m">{{ String(m).padStart(2, "0") }}</SelectItem>
                    </Select>
                    <button type="button" class="btn btn-xs ml-auto whitespace-nowrap" @click="resetToNow">
                        {{ $t("datetimepicker.now") }}
                    </button>
                </div>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
