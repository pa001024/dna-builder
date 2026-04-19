<script setup lang="ts">
import { computed } from "vue"
import { DEFAULT_COUNTER_RESET_CRON, getNextCronOccurrence, normalizeCronExpression } from "@/utils/cron"

type CronMode = "year" | "month" | "week" | "day" | "hour" | "minute" | "custom"

interface ParsedCron {
    mode: CronMode
    interval: number
    weekday: number
    hour: number
    minute: number
}

const model = defineModel<string | null>({ default: null })

const props = withDefaults(
    defineProps<{
        disabled?: boolean
        placeholder?: string
    }>(),
    {
        disabled: false,
        placeholder: DEFAULT_COUNTER_RESET_CRON,
    }
)

const intervalOptions = {
    year: [1, 2, 3, 4, 5, 10],
    month: [1, 2, 3, 4, 5, 6, 12],
    week: [1, 2, 3, 4, 6, 8, 12],
    day: [1, 2, 3, 4, 5, 7, 14],
    hour: [1, 2, 3, 4, 6, 8, 12],
    minute: [1, 5, 10, 15, 30],
} as const

const parsed = computed(() => parseCron(model.value))
const nextText = computed(() => {
    const normalized = normalizeCronExpression(model.value)
    if (!normalized) return ""
    const next = getNextCronOccurrence(normalized, Date.now())
    return next ? new Date(next).toLocaleString() : ""
})

/**
 * 解析 cron 文本。
 * @param value cron 文本
 * @returns 解析结果
 */
function parseCron(value: string | null): ParsedCron {
    const normalized = normalizeCronExpression(value)
    if (!normalized) {
        return {
            mode: "week",
            interval: 1,
            weekday: 1,
            hour: 5,
            minute: 0,
        }
    }

    const parts = normalized.split(" ")
    if (parts.length === 5) {
        const [minute, hour, dayOfMonth, month, weekday] = parts
        if (minute === "0" && hour === "5" && dayOfMonth === "*" && month === "*" && weekday === "1") {
            return {
                mode: "week",
                interval: 1,
                weekday: 1,
                hour: 5,
                minute: 0,
            }
        }
        return {
            mode: "custom",
            interval: 1,
            weekday: Number(weekday) || 1,
            hour: Number(hour) || 0,
            minute: Number(minute) || 0,
        }
    }

    const [minute, hour, dayOfMonth, month, weekday, year] = parts
    if (minute === "0" && hour === "5" && dayOfMonth === "*" && month === "*" && weekday === "1" && year === "*/1") {
        return {
            mode: "week",
            interval: 1,
            weekday: 1,
            hour: 5,
            minute: 0,
        }
    }

    return {
        mode: "custom",
        interval: 1,
        weekday: Number(weekday) || 1,
        hour: Number(hour) || 0,
        minute: Number(minute) || 0,
    }
}

/**
 * 写入 cron 文本。
 * @param next cron 文本
 */
function emitCron(next: string) {
    model.value = normalizeCronExpression(next)
}

/**
 * 构造周期 cron。
 * @param mode 周期类型
 * @param interval 间隔
 * @returns cron 文本
 */
function buildIntervalCron(mode: Exclude<CronMode, "custom">, interval: number) {
    switch (mode) {
        case "year":
            return `0 5 1 1 */${interval}`
        case "month":
            return `0 5 1 */${interval} *`
        case "week":
            return interval === 1 ? "0 5 * * 1" : `0 5 * * */${interval}`
        case "day":
            return `0 5 */${interval} * *`
        case "hour":
            return `0 */${interval} * * *`
        case "minute":
            return `*/${interval} * * * *`
    }
}

/**
 * 构造周几+时间 cron。
 * @param weekday 星期
 * @param hour 小时
 * @param minute 分钟
 * @returns cron 文本
 */
function buildWeekCron(weekday: number, hour: number, minute: number) {
    return `${minute} ${hour} * * ${weekday}`
}

/**
 * 读取下拉框数值。
 * @param event 变更事件
 * @returns 数值
 */
function readValue(event: Event) {
    return Number((event.target as HTMLSelectElement).value)
}
</script>

<template>
    <div class="grid gap-2">
        <div class="grid gap-2 sm:grid-cols-2">
            <select
                :disabled="disabled"
                class="select select-bordered select-sm"
                :value="parsed.interval"
                @change="emitCron(buildIntervalCron(parsed.mode === 'custom' ? 'week' : parsed.mode, readValue($event)))"
            >
                <option v-for="value in intervalOptions[parsed.mode === 'custom' ? 'week' : parsed.mode]" :key="value" :value="value">
                    每{{ value }}
                </option>
            </select>
            <select
                :disabled="disabled"
                class="select select-bordered select-sm"
                :value="parsed.mode"
                @change="
                    emitCron(buildIntervalCron(($event.target as HTMLSelectElement).value as Exclude<CronMode, 'custom'>, parsed.interval))
                "
            >
                <option value="year">年</option>
                <option value="month">月</option>
                <option value="week">周</option>
                <option value="day">日</option>
                <option value="hour">小时</option>
                <option value="minute">分钟</option>
            </select>
        </div>

        <div class="grid gap-2 sm:grid-cols-3">
            <select
                :disabled="disabled"
                class="select select-bordered select-sm"
                :value="parsed.weekday"
                @change="emitCron(buildWeekCron(readValue($event), parsed.hour, parsed.minute))"
            >
                <option value="1">周一</option>
                <option value="2">周二</option>
                <option value="3">周三</option>
                <option value="4">周四</option>
                <option value="5">周五</option>
                <option value="6">周六</option>
                <option value="0">周日</option>
            </select>
            <select
                :disabled="disabled"
                class="select select-bordered select-sm"
                :value="parsed.hour"
                @change="emitCron(buildWeekCron(parsed.weekday, readValue($event), parsed.minute))"
            >
                <option v-for="hour in 24" :key="hour - 1" :value="hour - 1">{{ `${hour - 1}时` }}</option>
            </select>
            <select
                :disabled="disabled"
                class="select select-bordered select-sm"
                :value="parsed.minute"
                @change="emitCron(buildWeekCron(parsed.weekday, parsed.hour, readValue($event)))"
            >
                <option v-for="minute in 60" :key="minute - 1" :value="minute - 1">{{ `${minute - 1}分` }}</option>
            </select>
        </div>

        <div class="text-xs text-base-content/60">
            <span v-if="nextText">下一次执行: {{ nextText }}</span>
            <span v-else>{{ placeholder }}</span>
        </div>
    </div>
</template>
