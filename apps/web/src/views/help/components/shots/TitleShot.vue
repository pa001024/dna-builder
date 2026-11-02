<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import { L, type TitleShot } from "../../content/types"
import { easeOutExpo, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: TitleShot; time: number; duration: number }>()
const tr = useHelpText()

const defaultKicker = L("DNA BUILDER · 使用指南", "DNA BUILDER · 使用指南", "DNA BUILDER · GUIDE", "DNA BUILDER · ガイド", "DNA BUILDER · 가이드", "DNA BUILDER · GUIDE")

const ruleWidth = computed(() => `${easeOutExpo(progressAt(props.time, 0.7, 0.8)) * 118}px`)
const iconStyle = computed(() => ({
    ...enterStyle(props.time, 0.5, 0.9, 24),
    animation: props.time > 1.4 ? "help-float 6s ease-in-out infinite" : undefined,
}))
const ghostStyle = computed(() => ({
    opacity: 0.03 + 0.02 * easeOutExpo(progressAt(props.time, 0, 2)),
    transform: `translateY(${(1 - easeOutExpo(progressAt(props.time, 0, 2.4))) * 26}px)`,
}))
</script>

<template>
    <div class="help-title-shot" :class="`help-title-shot--${shot.variant ?? 'intro'}`">
        <div v-if="shot.index" class="help-title-shot__ghost" :style="ghostStyle">{{ shot.index }}</div>

        <div v-if="shot.icon" class="help-title-shot__icon" :style="iconStyle">
            <Icon :icon="shot.icon" class="size-16" />
        </div>

        <div class="help-title-shot__content">
            <div class="help-kicker" :style="enterStyle(time, 0.1, 0.6, 10)">
                {{ tr(shot.kicker ?? defaultKicker) }}
            </div>
            <div class="help-rule" :style="{ width: ruleWidth, marginTop: '18px' }" />
            <h1 class="help-display help-title-shot__title" :style="enterStyle(time, 0.36, 0.8, 26)">
                {{ tr(shot.title) }}
            </h1>
            <p v-if="shot.subtitle" class="help-title-shot__subtitle" :style="enterStyle(time, 0.95, 0.8, 16)">
                {{ tr(shot.subtitle) }}
            </p>
        </div>
    </div>
</template>
