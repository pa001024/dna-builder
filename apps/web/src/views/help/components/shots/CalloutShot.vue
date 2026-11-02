<script setup lang="ts">
import { useHelpText } from "../../content/locale"
import type { CalloutShot } from "../../content/types"
import { enterStyle } from "./motion"

defineProps<{ shot: CalloutShot; time: number; duration: number }>()
const tr = useHelpText()

function pointAt(index: number): number {
    return 0.85 + index * 0.52
}
</script>

<template>
    <div class="help-callout-shot">
        <div class="help-callout-shot__body">
            <div class="help-kicker" :style="enterStyle(time, 0.1, 0.5, 8)">{{ tr(shot.kicker ?? "") }}</div>
            <h2 class="help-display help-callout-shot__title" :style="enterStyle(time, 0.26, 0.7, 20)">
                {{ tr(shot.title) }}
            </h2>
            <div class="help-callout-points">
                <div v-for="(point, index) in shot.points" :key="index" class="help-callout-point" :style="enterStyle(time, pointAt(index), 0.55, 14)">
                    <Icon :icon="point.icon ?? 'ri:checkbox-circle-fill'" class="help-accent mt-0.5 size-5 shrink-0" />
                    <span>{{ tr(point.text) }}</span>
                </div>
            </div>
            <div v-if="shot.note" class="help-muted mt-8 text-sm" :style="enterStyle(time, pointAt(shot.points.length), 0.5, 8)">
                {{ tr(shot.note) }}
            </div>
        </div>

        <div v-if="shot.icon" class="help-callout-shot__icon" :style="enterStyle(time, 0.4, 0.9, 24)">
            <Icon :icon="shot.icon" class="size-24" />
        </div>
    </div>
</template>
