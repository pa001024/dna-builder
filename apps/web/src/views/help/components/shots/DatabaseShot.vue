<script setup lang="ts">
import { useHelpText } from "../../content/locale"
import type { DatabaseShot } from "../../content/types"
import { enterStyle } from "./motion"

defineProps<{ shot: DatabaseShot; time: number; duration: number }>()
const tr = useHelpText()
</script>

<template>
    <div class="help-db-shot">
        <div class="help-db-window">
            <div class="help-db-list">
                <div class="mb-3 flex items-center gap-2 border border-white/10 bg-white/4 px-2.5 py-2 text-[11px] text-white/45">
                    <Icon icon="ri:search-line" class="size-3.5" />
                    <span class="truncate">{{ tr(shot.search ?? "") }}</span>
                </div>
                <div class="mb-3 flex flex-wrap gap-1">
                    <span v-for="(filter, index) in shot.filters ?? []" :key="index" class="help-chip h-5! px-1.5! text-[9px]!" :class="{ 'help-chip--accent': index === 0 }">
                        {{ tr(filter) }}
                    </span>
                </div>
                <div
                    v-for="(item, index) in shot.list"
                    :key="index"
                    class="help-db-row"
                    :class="{ 'help-db-row--active': item.active }"
                    :style="enterStyle(time, 0.25 + index * 0.06, 0.4, 8)"
                >
                    <Icon :icon="item.icon ?? 'ri:file-list-line'" class="size-3.5 shrink-0 opacity-70" />
                    <span class="min-w-0 flex-1 truncate">{{ tr(item.title) }}</span>
                    <span class="shrink-0 text-[9px] text-white/30">{{ tr(item.meta ?? "") }}</span>
                </div>
            </div>

            <div class="help-db-detail">
                <div class="flex items-start gap-4">
                    <div class="help-avatar size-16!">
                        <Icon :icon="shot.detail.icon ?? 'ri:database-2-line'" class="size-8" />
                    </div>
                    <div class="min-w-0">
                        <div class="help-kicker">DATABASE ENTRY</div>
                        <div class="mt-1 text-2xl font-bold leading-tight">{{ tr(shot.detail.title) }}</div>
                        <div class="mt-1 text-[11px] text-white/45">{{ tr(shot.detail.subtitle ?? "") }}</div>
                    </div>
                    <span class="help-chip help-chip--accent ml-auto h-6!">{{ tr(shot.title) }}</span>
                </div>

                <div class="mt-5 grid grid-cols-3 gap-2">
                    <div v-for="(stat, index) in shot.detail.stats ?? []" :key="index" class="border border-white/10 bg-white/4 px-3 py-2.5" :style="enterStyle(time, 0.45 + index * 0.07, 0.4, 8)">
                        <div class="text-[9px] tracking-widest text-white/35">{{ tr(stat.label) }}</div>
                        <div class="mt-1 font-orbitron text-[15px] text-white/85">{{ stat.value }}</div>
                    </div>
                </div>

                <div class="help-db-tabs">
                    <span
                        v-for="(tab, index) in shot.detail.tabs ?? []"
                        :key="index"
                        class="help-db-tab"
                        :class="{ 'help-db-tab--active': index === (shot.detail.activeTab ?? 0) }"
                    >
                        {{ tr(tab) }}
                    </span>
                </div>

                <div class="mt-4 space-y-2">
                    <p v-for="(paragraph, index) in shot.detail.paragraphs ?? []" :key="index" class="text-[12px] leading-relaxed text-white/55" :style="enterStyle(time, 0.7 + index * 0.18, 0.45, 8)">
                        {{ tr(paragraph) }}
                    </p>
                </div>

                <div class="mt-5 flex gap-2">
                    <span class="help-chip">{{ tr(shot.title) }} · 35</span>
                    <span class="help-chip">{{ tr(shot.detail.tabs?.[shot.detail.activeTab ?? 0] ?? shot.title) }}</span>
                    <span class="help-chip help-chip--accent">{{ tr(shot.list.find(item => item.active)?.meta ?? "") }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
