<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import type { StepsShot } from "../../content/types"
import { clamp01, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: StepsShot; time: number; duration: number }>()
const tr = useHelpText()

const vertical = computed(() => props.shot.layout === "vertical")
const stepCount = computed(() => props.shot.steps.length)

function stepAt(index: number): number {
    return 0.45 + index * 0.72
}

function active(index: number): boolean {
    return props.time >= stepAt(index)
}

function lineWidth(index: number): string {
    return `${clamp01(progressAt(props.time, stepAt(index) + 0.16, 0.42)) * 100}%`
}
</script>

<template>
    <div class="help-steps-shot">
        <div class="help-steps-shot__head">
            <div>
                <div class="help-kicker" :style="enterStyle(time, 0.1, 0.5, 8)">{{ tr(shot.kicker ?? "") }}</div>
                <h2 class="help-display help-steps-shot__title" :style="enterStyle(time, 0.22, 0.6, 16)">
                    {{ tr(shot.title) }}
                </h2>
            </div>
        </div>

        <div
            class="help-steps-grid"
            :style="{ '--steps': stepCount, gridTemplateColumns: vertical ? 'minmax(0, 1fr)' : undefined }"
        >
            <div
                v-for="(step, index) in shot.steps"
                :key="index"
                class="help-step"
                :style="enterStyle(time, stepAt(index), 0.62, 22)"
            >
                <div class="help-step__index">0{{ index + 1 }}</div>
                <Icon :icon="step.icon" class="help-step__icon size-6" />
                <div class="help-step__title">{{ tr(step.title) }}</div>
                <div class="help-step__desc">{{ tr(step.desc) }}</div>
                <div
                    class="help-rule"
                    :style="{ position: 'absolute', left: 0, bottom: 0, width: lineWidth(index), opacity: active(index) ? 0.9 : 0.18 }"
                />
            </div>
        </div>
    </div>
</template>
