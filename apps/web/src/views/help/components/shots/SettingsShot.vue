<script setup lang="ts">
import { useHelpText } from "../../content/locale"
import { type SettingsShot } from "../../content/types"
import { enterStyle } from "./motion"

defineProps<{ shot: SettingsShot; time: number; duration: number }>()
const tr = useHelpText()
</script>

<template>
    <div class="help-center-shot">
        <div class="help-panel flex w-245 overflow-hidden" style="min-height: 470px">
            <div class="w-52 flex-none border-r border-white/10 bg-black/20 p-3">
                <div class="help-build-panel__title px-2 pb-2">{{ tr(shot.title) }}</div>
                <div
                    v-for="(item, index) in shot.nav ?? []"
                    :key="index"
                    class="mb-1 flex items-center gap-2 px-2.5 py-2 text-[11px]"
                    :style="{
                        color: index === (shot.activeNav ?? 0) ? 'color-mix(in oklch, var(--accent) 74%, white)' : 'rgba(222,232,250,0.46)',
                        background: index === (shot.activeNav ?? 0) ? 'color-mix(in oklch, var(--accent) 9%, transparent)' : 'transparent',
                        borderLeft: index === (shot.activeNav ?? 0) ? '2px solid var(--accent)' : '2px solid transparent',
                    }"
                >
                    <Icon v-if="item.icon" :icon="item.icon" class="size-3.5" />
                    <span class="truncate">{{ tr(item.label) }}</span>
                </div>
            </div>

            <div class="flex-1 space-y-5 p-5">
                <div v-for="(section, sectionIndex) in shot.sections" :key="sectionIndex" :style="enterStyle(time, 0.25 + sectionIndex * 0.18, 0.5, 12)">
                    <div class="flex items-center gap-2">
                        <span class="h-2 w-0.5 bg-(--accent)" />
                        <span class="text-[12px] font-semibold text-white/70">{{ tr(section.title) }}</span>
                    </div>
                    <div class="mt-2 border border-white/8 bg-white/3">
                        <div v-for="(row, rowIndex) in section.rows" :key="rowIndex" class="flex items-center justify-between gap-4 border-b border-white/6 px-3 py-2.5 last:border-b-0">
                            <span class="text-[11px] text-white/55">{{ tr(row.label) }}</span>
                            <span v-if="row.control === 'toggle'" class="help-toggle" :class="{ 'help-toggle--on': row.on !== false }"><span class="help-toggle__knob" /></span>
                            <span v-else-if="row.control === 'slider'" class="flex items-center gap-2">
                                <span class="help-slider"><span class="help-slider__fill" :style="{ width: `${row.level ?? 60}%` }" /></span>
                                <span class="w-9 text-right font-orbitron text-[10px] text-white/50">{{ row.level ?? 60 }}%</span>
                            </span>
                            <span v-else class="help-chip h-6! px-2! text-[10px]!">{{ tr(row.value ?? "") }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
