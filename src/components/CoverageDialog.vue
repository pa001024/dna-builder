<script setup lang="ts">
import { computed, ref, watch } from "vue"

/**
 * 覆盖率编辑控件——按钮展示当前覆盖率百分比，点击弹出「预设 + 步进 + 手输」弹窗。
 * 由 BUFF 列表（BuffCell）与魔灵面板（PetEditor）共用，保证同一套交互与取值精度（0-1 小数）。
 */

const props = withDefaults(
    defineProps<{
        /** 覆盖率（0-1） */
        coverage: number
        /** 弹窗标题（默认「覆盖率」） */
        title?: string
        /** 触发按钮的无障碍说明 */
        hint?: string
    }>(),
    { title: "", hint: "" }
)

const emit = defineEmits<{
    /** 覆盖率变更（0-1） */
    updateCoverage: [coverage: number]
}>()

/** 覆盖率弹窗开关 */
const coverageOpen = ref(false)

/** 将 coverage 小数转为展示用百分比数字（最多两位小数，避免浮点尾差） */
const coverageToPercent = (value: number) => Number(((value ?? 1) * 100).toFixed(2))

/** 当前覆盖率百分比展示值 */
const coveragePercent = computed(() => coverageToPercent(props.coverage ?? 1))

/** 弹窗内可手输的百分比文本 */
const percentText = ref("")
watch(
    coveragePercent,
    value => {
        percentText.value = String(value)
    },
    { immediate: true }
)

/** 将百分比钳制在 0-100，并保留至多两位小数 */
const clampPercent = (value: number) => Number(Math.min(100, Math.max(0, value)).toFixed(2))

/** 设置覆盖率（百分比转小数，如 50 → 0.5） */
const setCoverage = (percent: number) => {
    emit("updateCoverage", clampPercent(percent) / 100)
}

/** 按步进增减覆盖率（1% 步进，实时提交） */
const stepCoverage = (delta: number) => {
    setCoverage(clampPercent(coverageToPercent(props.coverage ?? 1) + delta))
}

/** 提交手输百分比：非法输入回退为当前值 */
const commitPercent = () => {
    const value = Number(percentText.value)
    if (Number.isFinite(value)) {
        setCoverage(clampPercent(value))
    } else {
        percentText.value = String(coveragePercent.value)
    }
}
</script>
<template>
    <button
        type="button"
        class="btn btn-ghost btn-xs gap-1 border border-base-content/10"
        :title="hint || title || $t('char-build.coverage')"
        @click.stop="coverageOpen = true"
    >
        <Icon icon="ri:percent-line" class="size-3" />
        {{ coveragePercent }}%
    </button>
    <DialogRoot v-model:open="coverageOpen">
        <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm data-[state=open]:animate-overlayShow" />
            <DialogContent
                class="fixed top-1/2 left-1/2 z-100 w-[90vw] max-w-64 -translate-x-1/2 -translate-y-1/2 rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md data-[state=open]:animate-contentShow"
            >
                <div class="flex items-start justify-between gap-2">
                    <div class="flex flex-col">
                        <span class="font-mono text-[10px] tracking-[0.2em] text-primary/70 uppercase">COVERAGE</span>
                        <DialogTitle class="text-sm font-semibold text-base-content">
                            {{ title || $t("char-build.coverage") }}
                        </DialogTitle>
                    </div>
                    <DialogClose
                        class="cursor-pointer rounded-xs border border-base-content/20 p-1 text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        aria-label="close"
                    >
                        <Icon icon="radix-icons:cross2" class="block size-3.5" />
                    </DialogClose>
                </div>
                <div class="mt-3 grid grid-cols-4 gap-1">
                    <button
                        v-for="p in [100, 75, 50, 25]"
                        :key="p"
                        type="button"
                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-1 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                        :class="
                            coveragePercent === p
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        @click="setCoverage(p)"
                    >
                        {{ p }}%
                    </button>
                </div>
                <div
                    class="mt-2 flex items-center justify-center gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                >
                    <button
                        type="button"
                        class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-sm leading-none text-base-content/60 transition-colors duration-150 active:scale-[0.97] hover:border-primary/50 hover:text-primary"
                        :aria-label="$t('coverage-dialog.coverage_minus')"
                        @click="stepCoverage(-1)"
                    >
                        −
                    </button>
                    <div class="flex items-baseline gap-0.5">
                        <input
                            v-model="percentText"
                            type="text"
                            inputmode="numeric"
                            class="w-10 bg-transparent text-center font-orbitron text-[13px] font-semibold text-primary outline-none"
                            :aria-label="$t('coverage-dialog.coverage_percent')"
                            @blur="commitPercent"
                            @keydown.enter.prevent="commitPercent"
                        />
                        <span class="text-[11px] text-base-content/50">%</span>
                    </div>
                    <button
                        type="button"
                        class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-sm leading-none text-base-content/60 transition-colors duration-150 active:scale-[0.97] hover:border-primary/50 hover:text-primary"
                        :aria-label="$t('coverage-dialog.coverage_plus')"
                        @click="stepCoverage(1)"
                    >
                        +
                    </button>
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
