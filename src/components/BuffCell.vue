<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { LeveledBuff } from "@/data/leveled"
import { format100 } from "@/util"

const props = defineProps<{
    buff: LeveledBuff
    lv: number
    selected?: boolean
    income: number
    title?: string
    /** 覆盖率（0-1，仅选中且父级提供时显示覆盖率控件） */
    coverage?: number
}>()
const emit = defineEmits<{
    setBuffLv: [buff: LeveledBuff, level: number]
    setBuffCoverage: [buff: LeveledBuff, coverage: number]
}>()

const setBuffLv = (buff: LeveledBuff, lv: number) => {
    emit("setBuffLv", buff, lv)
}

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
    emit("setBuffCoverage", props.buff, clampPercent(percent) / 100)
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
    <div class="flex">
        <ShowProps side="top" :props="buff.getProperties()" :attr="buff.attr" :code="buff.code" :title="title">
            <div
                class="flex-1 rounded-xs border border-base-content/10 bg-base-100/70 p-3 cursor-pointer hover:border-primary/40 transition-colors duration-200"
                :class="{
                    ' border-primary bg-primary/5 shadow-sm shadow-primary/10 hover:border-primary': selected,
                }"
            >
                <div class="flex items-center justify-between mb-2">
                    <div class="text-sm font-medium flex items-center gap-1">
                        <div v-if="selected" class="text-primary">
                            <Icon icon="ri:checkbox-circle-fill" />
                        </div>
                        {{ $t(buff.名称) }}
                    </div>
                    <div v-if="buff.mx" class="text-xs text-base-content/60 font-orbitron tabular-nums">
                        Lv.
                        <NumberInput
                            v-if="selected"
                            :model-value="lv"
                            :min="buff.lx || 0"
                            :max="buff.mx"
                            class="w-8 text-center"
                            @update:model-value="setBuffLv(buff, $event)"
                        />
                        <span v-else>{{ lv }}</span>
                    </div>
                </div>
                <div class="text-xs text-base-content/60 mb-2">
                    {{ $t(buff.描述) }}
                </div>
                <div class="flex items-center gap-2">
                    <div class="text-xs text-base-content/40" v-if="income">
                        {{ $t("char-build.income") }}:
                        <span class="font-orbitron tabular-nums">{{ format100(income) }}</span>
                    </div>
                    <button
                        v-if="selected && coverage !== undefined"
                        type="button"
                        class="btn btn-ghost btn-xs gap-1 border border-base-content/10"
                        title="设置BUFF覆盖率"
                        @click.stop="coverageOpen = true"
                    >
                        <Icon icon="ri:percent-line" class="size-3" />
                        {{ coveragePercent }}%
                    </button>
                </div>
            </div>
        </ShowProps>
        <DialogRoot
            v-if="selected && coverage !== undefined"
            :open="coverageOpen"
            @update:open="coverageOpen = $event"
        >
            <DialogPortal>
                <DialogOverlay
                    class="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm data-[state=open]:animate-overlayShow"
                />
                <DialogContent
                    class="fixed top-1/2 left-1/2 z-100 w-[90vw] max-w-64 -translate-x-1/2 -translate-y-1/2 rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md data-[state=open]:animate-contentShow"
                >
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex flex-col">
                            <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/70">COVERAGE</span>
                            <DialogTitle class="text-sm font-semibold text-base-content">
                                {{ $t("char-build.coverage") }}
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
                            aria-label="覆盖率减1%"
                            @click="stepCoverage(-1)"
                        >
                            −
                        </button>
                        <div class="flex items-baseline gap-0.5">
                            <input
                                v-model="percentText"
                                type="text"
                                inputmode="numeric"
                                class="w-10 bg-transparent text-center font-orbitron text-[13px] font-semibold tabular-nums text-primary outline-none"
                                aria-label="BUFF覆盖率百分比"
                                @blur="commitPercent"
                                @keydown.enter.prevent="commitPercent"
                            />
                            <span class="text-[11px] text-base-content/50">%</span>
                        </div>
                        <button
                            type="button"
                            class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-sm leading-none text-base-content/60 transition-colors duration-150 active:scale-[0.97] hover:border-primary/50 hover:text-primary"
                            aria-label="覆盖率加1%"
                            @click="stepCoverage(1)"
                        >
                            +
                        </button>
                    </div>
                </DialogContent>
            </DialogPortal>
        </DialogRoot>
    </div>
</template>
