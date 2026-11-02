<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import type { ModalShot } from "../../content/types"
import { clamp01, enterStyle, popStyle, progressAt } from "./motion"

const props = defineProps<{ shot: ModalShot; time: number; duration: number }>()
const tr = useHelpText()

const resultVisible = computed(() => !!props.shot.result && props.time >= (props.shot.resultAt ?? 1.4))
const resultStyle = computed(() => popStyle(props.time, props.shot.resultAt ?? 1.4, 0.6, 0.94))
const confirmGlow = computed(() => clamp01(progressAt(props.time, props.shot.confirmAt ?? props.duration - 1.2, 0.4)))
</script>

<template>
    <div class="help-center-shot">
        <div class="help-modal-backdrop" />
        <div class="help-modal" :style="popStyle(time, 0.12, 0.65, 0.96)">
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                <div class="text-sm font-semibold">{{ tr(shot.title) }}</div>
                <Icon icon="ri:close-line" class="size-4 text-white/35" />
            </div>

            <div class="px-5 py-4">
                <p v-if="shot.description" class="text-[12px] leading-relaxed text-white/50">{{ tr(shot.description) }}</p>

                <div v-if="shot.fields?.length" class="mt-3 space-y-2">
                    <div v-for="(field, index) in shot.fields" :key="index" class="flex items-center justify-between border border-white/8 bg-white/3 px-3 py-2 text-[11px]" :style="enterStyle(time, 0.35 + index * 0.08, 0.4, 6)">
                        <span class="text-white/45">{{ tr(field.label) }}</span>
                        <span class="max-w-[62%] truncate text-white/75">{{ tr(field.value) }}</span>
                    </div>
                </div>

                <div v-if="shot.options?.length" class="mt-2 space-y-2">
                    <div
                        v-for="(option, index) in shot.options"
                        :key="index"
                        class="flex items-center gap-3 border px-3 py-2.5"
                        :class="option.active ? 'border-(--accent)/55 bg-(--accent)/10' : 'border-white/10 bg-white/3'"
                        :style="enterStyle(time, 0.35 + index * 0.1, 0.4, 8)"
                    >
                        <span class="flex size-8 items-center justify-center border border-white/10 bg-white/4">
                            <Icon :icon="option.icon ?? 'ri:checkbox-circle-line'" class="size-4 help-accent" />
                        </span>
                        <div class="min-w-0">
                            <div class="text-[12px] text-white/80">{{ tr(option.label) }}</div>
                            <div v-if="option.desc" class="mt-0.5 text-[10px] text-white/35">{{ tr(option.desc) }}</div>
                        </div>
                        <Icon v-if="option.active" icon="ri:check-line" class="ml-auto size-4 help-accent" />
                    </div>
                </div>

                <div v-if="resultVisible" class="mt-4 border border-(--accent)/40 bg-(--accent)/8 p-4" :style="resultStyle">
                    <div class="text-[10px] tracking-widest text-white/40">{{ tr(shot.result!.title) }}</div>
                    <div class="mt-1 font-orbitron text-xl help-accent">{{ tr(shot.result!.value) }}</div>
                    <div v-if="shot.result!.hint" class="mt-1 text-[10px] text-white/40">{{ tr(shot.result!.hint) }}</div>
                </div>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
                <span v-for="(action, index) in shot.actions ?? []" :key="index" class="help-chip h-8! px-4! text-[11px]!" :class="index === (shot.actions?.length ?? 0) - 1 ? 'help-chip--accent' : ''" :style="{ boxShadow: index === (shot.actions?.length ?? 0) - 1 && confirmGlow > 0.4 ? '0 0 22px color-mix(in oklch, var(--accent) 45%, transparent)' : undefined }">
                    {{ tr(action) }}
                </span>
            </div>
        </div>
    </div>
</template>
