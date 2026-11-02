<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import type { CardsShot } from "../../content/types"
import { clamp01, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: CardsShot; time: number; duration: number }>()
const tr = useHelpText()

const columns = computed(() => props.shot.columns ?? (props.shot.variant === "checklist" ? 2 : 4))
const searchText = computed(() => {
    if (!props.shot.toolbar?.search) return ""
    const full = tr(props.shot.toolbar.search)
    const count = Math.floor(clamp01(progressAt(props.time, 0.25, 1.15)) * full.length)
    return full.slice(0, count)
})
const highlight = computed(() => (props.time >= (props.shot.highlightAt ?? 1.5) ? props.shot.highlight : undefined))

function cardAt(index: number): number {
    return 0.38 + Math.min(index, 10) * 0.075
}
</script>

<template>
    <div class="help-cards-shot">
        <div class="help-cards-shot__head">
            <div>
                <div class="help-kicker" :style="enterStyle(time, 0.08, 0.5, 8)">{{ tr(shot.kicker ?? "") }}</div>
                <h2 class="help-display help-cards-shot__title" :style="enterStyle(time, 0.18, 0.6, 16)">{{ tr(shot.title) }}</h2>
            </div>
            <div v-if="shot.footnote" class="help-muted text-sm" :style="enterStyle(time, 0.6, 0.5, 8)">{{ tr(shot.footnote) }}</div>
        </div>

        <div class="help-window help-window--static" style="flex: 1; min-height: 0; display: flex; flex-direction: column">
            <div class="help-window__bar">
                <div class="help-window__dots"><i class="help-window__dot" /><i class="help-window__dot" /><i class="help-window__dot" /></div>
                <span class="help-window__title">{{ tr(shot.title) }}</span>
                <span class="help-window__tag">DNA BUILDER</span>
            </div>

            <div class="help-window__body" style="flex: 1; min-height: 0">
                <div v-if="shot.sidebar" class="help-window__sidebar">
                    <div
                        v-for="(item, index) in shot.sidebar.items"
                        :key="index"
                        class="mb-1 flex items-center gap-2 px-2 py-2 text-[11px]"
                        :style="{
                            color: index === shot.sidebar.active ? 'color-mix(in oklch, var(--accent) 72%, white)' : 'rgba(222,232,250,0.48)',
                            background: index === shot.sidebar.active ? 'color-mix(in oklch, var(--accent) 10%, transparent)' : 'transparent',
                            borderLeft: index === shot.sidebar.active ? '2px solid var(--accent)' : '2px solid transparent',
                        }"
                    >
                        <Icon v-if="item.icon" :icon="item.icon" class="size-3.5" />
                        <span class="truncate">{{ tr(item.label) }}</span>
                    </div>
                </div>

                <div class="help-window__main" style="display: flex; flex-direction: column">
                    <div v-if="shot.toolbar" class="help-toolbar">
                        <div v-if="shot.toolbar.search" class="help-toolbar__search min-w-70!">
                            <Icon icon="ri:search-line" class="size-4 opacity-60" />
                            <span class="truncate">{{ searchText }}</span>
                            <span class="ml-auto h-3.5 w-px animate-pulse bg-white/50" />
                        </div>
                        <div
                            v-for="(tab, index) in shot.toolbar.tabs ?? []"
                            :key="index"
                            class="help-chip"
                            :class="{ 'help-chip--accent': index === shot.toolbar.activeTab }"
                        >
                            {{ tr(tab) }}
                        </div>
                        <div class="flex-1" />
                        <div v-for="(action, index) in shot.toolbar.actions ?? []" :key="index" class="help-chip">{{ tr(action) }}</div>
                    </div>

                    <div class="help-card-grid" :style="{ '--cols': columns, flex: 1 }">
                        <div
                            v-for="(item, index) in shot.items"
                            :key="index"
                            class="help-card"
                            :class="[
                                shot.variant === 'tiles' ? 'help-card--tile' : '',
                                shot.variant === 'checklist' ? 'help-card--check' : '',
                                shot.variant === 'gallery' ? 'help-card--gallery' : '',
                                { 'help-card--focus': highlight === index },
                            ]"
                            :style="{ '--card-accent': item.accent ?? 'var(--accent)', ...enterStyle(time, cardAt(index), 0.55, 18) }"
                        >
                            <template v-if="shot.variant === 'gallery'">
                                <div class="help-card__poster" />
                                <div class="help-card__title">{{ tr(item.title) }}</div>
                                <div v-if="item.subtitle" class="help-card__subtitle px-3.5">{{ tr(item.subtitle) }}</div>
                                <div class="help-card__meta">
                                    <span>{{ tr(item.meta ?? item.tag ?? "") }}</span>
                                    <span class="help-chip h-5! px-1.5! text-[9px]!">{{ tr(item.tag ?? "") }}</span>
                                </div>
                            </template>

                            <template v-else-if="shot.variant === 'checklist'">
                                <span class="help-card__check"><Icon icon="ri:check-line" class="size-3.5" /></span>
                                <div class="min-w-0 flex-1">
                                    <div class="help-card__title truncate">{{ tr(item.title) }}</div>
                                    <div v-if="item.subtitle" class="help-card__subtitle mt-0.5! truncate">{{ tr(item.subtitle) }}</div>
                                </div>
                                <div class="help-card__meta">
                                    <span v-if="item.tag" class="help-chip h-5! px-1.5! text-[9px]!">{{ tr(item.tag) }}</span>
                                    <span>{{ tr(item.meta ?? "") }}</span>
                                </div>
                            </template>

                            <template v-else>
                                <div class="help-card__icon">
                                    <Icon :icon="item.icon ?? 'ri:box-1-line'" class="size-5" />
                                </div>
                                <div class="help-card__title">{{ tr(item.title) }}</div>
                                <div v-if="item.subtitle" class="help-card__subtitle">{{ tr(item.subtitle) }}</div>
                                <div class="help-card__meta">
                                    <span class="truncate">{{ tr(item.meta ?? "") }}</span>
                                    <span v-if="item.tag" class="help-chip h-5! px-1.5! text-[9px]!">{{ tr(item.tag) }}</span>
                                </div>
                            </template>

                            <span
                                v-if="highlight === index && shot.highlightLabel"
                                class="help-chip help-chip--accent absolute right-2 top-2 h-5! px-1.5! text-[9px]!"
                            >
                                {{ tr(shot.highlightLabel) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
