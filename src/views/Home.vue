<script lang="tsx" setup>
import { FunctionalComponent, ref, onMounted, onUnmounted } from "vue"
import StatisticsProgress from "../components/StatisticsProgress.vue"
import { env } from "../env"

// const stat = useStatisticsStore()
// const nav = useRouter()

const StatisticsItem: FunctionalComponent<{
    progress?: number
    title: string
}> = ({ title, progress, ...props }, { slots }) => {
    return (
        <div {...props} class="flex w-full items-center space-x-4 p-6 bg-base-100/50 hover:bg-base-100 transition-all duration-500 rounded-lg">
            {typeof progress === "number" && <StatisticsProgress progress={progress} />}
            <div class="grid justify-center">
                <div class="text-sm text-neutral-500">{title}</div>
                <div class="text-2xl font-medium">{slots.default?.()}</div>
            </div>
        </div>
    )
}

/**
 * 将毫秒转换为天、时、分、秒格式
 * @param ms 毫秒数
 * @returns 格式化后的时间字符串
 */
function timeStr(ms: number) {
    // 返回3时42分18秒格式
    const d = ~~(ms / 864e5)
    const h = ~~(ms / 36e5) % 24
    const m = ~~((ms % 36e5) / 6e4)
    const s = ~~((ms % 6e4) / 1e3)
    if (d) {
        return `${d}天${h}时${m}分${s}秒`
    }
    if (h) {
        return `${h}时${m}分${s}秒`
    }
    if (m) {
        return `${m}分${s}秒`
    }
    return `${s}秒`
}

/**
 * 将当前UTC时间以指定时间间隔为单位向上取整，并返回与当前时间的差值（毫秒）
 * @param interval 时间间隔，单位天
 * @param offset 偏移量，单位天
 */
function getIntervalDayTime(interval: number = 3, offset: number = 0): number {
    // 获取当前UTC时间戳
    const now = new Date().getTime()

    // 3天的毫秒数：3 * 24小时 * 60分钟 * 60秒 * 1000毫秒
    const oneDay = 24 * 60 * 60 * 1000
    const oneHour = 60 * 60 * 1000
    offset = offset * oneDay + 3 * oneHour // 5点
    // 计算向上取整后的时间戳
    const next3DayTimestamp = Math.ceil((now + offset) / (interval * oneDay)) * (interval * oneDay) - offset

    // 返回差值
    return next3DayTimestamp - now
}

function getIntervalHourTime(interval: number = 3, offset: number = 0): number {
    // 获取当前UTC时间戳
    const now = new Date().getTime()

    // 3天的毫秒数：3 * 24小时 * 60分钟 * 60秒 * 1000毫秒
    const oneHour = 60 * 60 * 1000
    offset = offset * oneHour
    // 计算向上取整后的时间戳
    const next3DayTimestamp = Math.ceil((now + offset) / (interval * oneHour)) * (interval * oneHour) - offset

    // 返回差值
    return next3DayTimestamp - now
}

// 倒计时剩余毫秒
const moling = ref(getIntervalDayTime(3, 1))
const zhouben = ref(getIntervalDayTime(7, 3))
const mihan = ref(getIntervalHourTime(1))

let timer: number | null = null

onMounted(() => {
    // 每秒更新一次
    timer = window.setInterval(() => {
        moling.value = getIntervalDayTime(3, 2)
        zhouben.value = getIntervalDayTime(7, 3)
        mihan.value = getIntervalHourTime(1)
    }, 1000)
})

onUnmounted(() => {
    if (timer) {
        clearInterval(timer)
    }
})
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea class="h-full overflow-hidden">
            <div class="p-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] w-full justify-items-center gap-4">
                <div v-if="!env.isApp" class="flex w-full items-center bg-base-100/50 hover:bg-base-100 transition-all duration-500 rounded-lg p-4">
                    <a href="https://github.com/pa001024/dna-builder/releases/latest" target="_blank" class="btn btn-primary flex-1">{{
                        $t("home.download")
                    }}</a>
                </div>
                <div class="flex w-full items-center bg-base-100/50 hover:bg-base-100 transition-all duration-500 rounded-lg p-4">
                    <a href="https://github.com/pa001024/dna-builder" target="_blank" class="btn btn-primary flex-1">{{ $t("home.starme") }}</a>
                </div>
                <StatisticsItem title="魔灵刷新时间">{{ timeStr(moling) }}</StatisticsItem>
                <StatisticsItem title="周本刷新时间">{{ timeStr(zhouben) }}</StatisticsItem>
                <StatisticsItem title="密函刷新时间">{{ timeStr(mihan) }}</StatisticsItem>
            </div>
        </ScrollArea>
    </div>
</template>
