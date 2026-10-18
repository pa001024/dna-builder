<script setup lang="ts">
import { computed } from "vue"

/**
 * 时间过滤器的离散时间点。
 */
export interface TimePointFilterPoint {
    timestamp: number
    label: string
    shortLabel: string
    activeCount: number
    isCurrent: boolean
}

const enabled = defineModel<boolean>("enabled", { default: true })
const selectedIndex = defineModel<number>("index", { default: 0 })
const diffOnly = defineModel<boolean>("diffOnly", { default: false })

const props = withDefaults(
    defineProps<{
        points: TimePointFilterPoint[]
        currentIndex: number
        title: string
        kicker?: string
        countText?: string
        desc?: string
        pointUnit: string
        statusCountText: string
        compareLabel?: string | null
    }>(),
    { kicker: "TIMELINE", countText: "", desc: "", compareLabel: null }
)

/**
 * 当前选中的离散时间点，索引越界时回落到当前时间点。
 */
const selectedPoint = computed(() => {
    return props.points[selectedIndex.value] ?? props.points[props.currentIndex] ?? null
})

/**
 * 是否处于差异对比状态。
 */
const showDiff = computed(() => enabled.value && diffOnly.value)

/**
 * 将滑块重置到当前时间点。
 */
function resetToCurrent(): void {
    selectedIndex.value = props.currentIndex
}
</script>

<template>
    <section class="space-y-4 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact :kicker="kicker" :title="title" :count="countText">
            <template #trailing>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label class="label cursor-pointer gap-1.5 p-0">
                        <input v-model="enabled" type="checkbox" class="toggle toggle-primary toggle-sm" />
                        <span class="text-xs">{{ $t("time-filter.current_only") }}</span>
                    </label>
                    <label class="label cursor-pointer gap-1.5 p-0">
                        <input v-model="diffOnly" type="checkbox" class="toggle toggle-success toggle-sm" :disabled="!enabled" />
                        <span class="text-xs" :class="{ 'text-base-content/40': !enabled }">{{ $t("common.show_diff_only") }}</span>
                    </label>
                </div>
            </template>
        </SectionHeader>

        <p v-if="desc" class="text-xs leading-relaxed text-base-content/55">{{ desc }}</p>

        <!-- 时间点轨道 -->
        <div v-if="enabled" class="space-y-2">
            <!-- p-1 -m-1：为"当前"光点的负偏移预留溢出空间，避免被 overflow-x-auto 裁剪 -->
            <div class="-m-1 flex items-center gap-1.5 overflow-x-auto p-1 pb-1.5">
                <button
                    v-for="(point, index) in points"
                    :key="point.timestamp"
                    type="button"
                    class="relative shrink-0 rounded-xs border px-2.5 py-1.5 text-center transition-all duration-200 active:scale-[0.97]"
                    :class="
                        index === selectedIndex
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-base-content/15 text-base-content/60 hover:border-primary/50 hover:text-primary'
                    "
                    :title="point.label"
                    @click="selectedIndex = index"
                >
                    <span v-if="point.isCurrent" class="absolute -right-1 -top-1 flex size-2">
                        <span class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60"></span>
                        <span class="relative inline-flex size-2 rounded-full bg-success"></span>
                    </span>
                    <div class="text-xs font-medium leading-tight">{{ point.shortLabel }}</div>
                    <div class="text-[10px] leading-tight opacity-70">{{ point.activeCount }} {{ pointUnit }}</div>
                </button>
            </div>
            <div v-if="points.length > 1" class="flex items-center gap-3">
                <input
                    v-model.number="selectedIndex"
                    type="range"
                    class="range range-primary range-xs grow"
                    :min="0"
                    :max="points.length - 1"
                    step="1"
                />
                <button
                    type="button"
                    class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                        selectedIndex === currentIndex
                            ? 'border-base-content/15 text-base-content/40'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    :disabled="selectedIndex === currentIndex"
                    @click="resetToCurrent"
                >
                    {{ $t("common.reset_to_current") }}
                </button>
            </div>
        </div>

        <!-- 当前时间点状态栏 -->
        <div
            v-if="selectedPoint"
            class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xs border px-3 py-2 text-xs"
            :class="
                selectedPoint.isCurrent
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-base-content/10 bg-base-content/3 text-base-content/70'
            "
        >
            <span class="font-medium">{{ selectedPoint.label }}</span>
            <span v-if="selectedPoint.isCurrent" class="rounded-xs bg-primary px-1.5 py-0.5 font-semibold text-primary-content">{{
                $t("time-filter.current")
            }}</span>
            <span class="opacity-60">·</span>
            <span>{{ statusCountText }}</span>
            <template v-if="showDiff && compareLabel">
                <span class="opacity-60">·</span>
                <span>{{ $t("time-filter.compare_previous", { label: compareLabel }) }}</span>
            </template>
        </div>
    </section>
</template>
