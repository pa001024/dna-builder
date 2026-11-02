<script setup lang="ts">
import { useHelpText } from "../../content/locale"
import type { CompareShot } from "../../content/types"
import { enterStyle, popStyle } from "./motion"

defineProps<{ shot: CompareShot; time: number; duration: number }>()
const tr = useHelpText()
</script>

<template>
    <div class="help-center-shot">
        <div class="w-250">
            <div class="mb-5 text-center">
                <div class="help-kicker">{{ tr(shot.kicker ?? "") }}</div>
                <h2 class="help-display mt-2 text-4xl">{{ tr(shot.title) }}</h2>
            </div>

            <div class="flex items-center gap-4">
                <div class="help-compare-card" :style="enterStyle(time, 0.3, 0.65, 18)">
                    <div class="help-build-panel__title">A</div>
                    <div class="mt-2 text-lg font-semibold">{{ tr(shot.left.title) }}</div>
                    <div v-if="shot.left.subtitle" class="mt-1 text-[11px] text-white/40">{{ tr(shot.left.subtitle) }}</div>
                    <div class="mt-4 space-y-1">
                        <div v-for="(stat, index) in shot.left.stats" :key="index" class="help-stat-row">
                            <span class="help-stat-row__label">{{ tr(stat.label) }}</span>
                            <span class="help-stat-row__value">{{ stat.value }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="shot.delta" class="flex w-24 flex-none flex-col items-center" :style="popStyle(time, 0.9, 0.55, 0.8)">
                    <div class="font-orbitron text-2xl font-bold" :class="shot.delta.positive !== false ? 'help-accent' : 'text-red-300'">{{ shot.delta.value }}</div>
                    <div class="mt-1 text-center text-[10px] text-white/40">{{ tr(shot.delta.label) }}</div>
                </div>

                <div class="help-compare-card help-compare-card--accent" :style="enterStyle(time, 0.5, 0.65, 18)">
                    <div class="help-build-panel__title">B</div>
                    <div class="mt-2 text-lg font-semibold">{{ tr(shot.right.title) }}</div>
                    <div v-if="shot.right.subtitle" class="mt-1 text-[11px] text-white/40">{{ tr(shot.right.subtitle) }}</div>
                    <div class="mt-4 space-y-1">
                        <div v-for="(stat, index) in shot.right.stats" :key="index" class="help-stat-row">
                            <span class="help-stat-row__label">{{ tr(stat.label) }}</span>
                            <span class="help-stat-row__value">{{ stat.value }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
