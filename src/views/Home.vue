<script lang="tsx" setup>
import { FunctionalComponent } from "vue"
import { useRouter } from "vue-router"
import StatisticsProgress from "../components/StatisticsProgress.vue"
import { env } from "../env"

// const stat = useStatisticsStore()
const nav = useRouter()

const StatisticsItem: FunctionalComponent<{
    progress?: number
    title: string
}> = ({ title, progress, ...props }, { slots }) => {
    return (
        <div
            {...props}
            class="flex w-full items-center space-x-4 p-6 bg-base-100/50 hover:bg-base-100 transition-all duration-500 rounded-lg"
        >
            {typeof progress === "number" && <StatisticsProgress progress={progress} />}
            <div class="grid justify-center">
                <div class="text-sm text-neutral-500">{title}</div>
                <div class="text-2xl font-medium">{slots.default?.()}</div>
            </div>
        </div>
    )
}

function timeStr(ms: number) {
    // 返回3时42分18秒格式
    const h = ~~(ms / 36e5)
    const m = ~~((ms % 36e5) / 6e4)
    const s = ~~((ms % 6e4) / 1e3)
    return `${h}时${m}分${s}秒`
}
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea class="h-full overflow-hidden">
            <div class="p-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] w-full justify-items-center gap-4">
                1
            </div>
        </ScrollArea>
        <div class="flex-1"></div>
        <div v-if="!env.isApp" class="flex items-center justify-center p-4">
            <a class="link center" href="https://beian.miit.gov.cn" target="_blank" one-link-mark="yes">浙ICP备2024097919号-1</a>
        </div>
    </div>
</template>
