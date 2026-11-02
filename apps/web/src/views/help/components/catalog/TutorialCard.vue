<script setup lang="ts">
import { computed } from "vue"
import { formatDuration, useHelpText } from "../../content/locale"
import { L, type Tutorial } from "../../content/types"
import PlatformTags from "../PlatformTags.vue"

const props = defineProps<{ tutorial: Tutorial; featured?: boolean }>()
const emit = defineEmits<{ (event: "play"): void }>()
const tr = useHelpText()

const duration = computed(() => props.tutorial.scenes.reduce((sum, scene) => sum + scene.duration, 0))
</script>

<template>
    <button
        type="button"
        class="group relative flex w-full flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/55 text-left backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-(--card-accent)/45 hover:shadow-[0_18px_50px_rgba(0,0,0,0.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :style="{ '--card-accent': tutorial.accent }"
        @click="emit('play')"
    >
        <div
            class="relative h-32 w-full overflow-hidden border-b border-base-content/10"
            :style="{
                background: `radial-gradient(90% 110% at 82% 0%, color-mix(in oklch, ${tutorial.accent} 34%, transparent), transparent 64%), linear-gradient(150deg, color-mix(in oklch, ${tutorial.accent} 12%, #0b1019), #0b0f18)`,
            }"
        >
            <div
                class="absolute inset-0 opacity-70"
                style="background-image: linear-gradient(to right, rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.055) 1px, transparent 1px); background-size: 26px 26px; mask-image: linear-gradient(120deg, transparent 10%, black)"
            />
            <span class="absolute right-3 top-2 font-orbitron text-5xl font-bold leading-none text-white/8">{{ tutorial.number }}</span>
            <span
                class="absolute left-3 top-3 flex size-11 items-center justify-center border border-white/15 text-white/85 transition-transform duration-300 group-hover:scale-110"
                :style="{ background: `color-mix(in oklch, ${tutorial.accent} 24%, rgba(9,13,21,0.8))`, color: `color-mix(in oklch, ${tutorial.accent} 70%, white)` }"
            >
                <Icon :icon="tutorial.icon" class="size-6" />
            </span>
            <span class="absolute bottom-2 left-3 font-orbitron text-[9px] tracking-[0.22em] text-white/40">EP {{ tutorial.number }}</span>
            <span class="absolute bottom-2 right-3 rounded-xs border border-white/15 bg-black/45 px-1.5 py-0.5 font-orbitron text-[9px] text-white/65">
                {{ formatDuration(duration) }}
            </span>
            <span class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span class="flex size-12 items-center justify-center rounded-full border border-white/30 bg-black/45 backdrop-blur-sm">
                    <Icon icon="ri:play-fill" class="ml-0.5 size-5 text-white" />
                </span>
            </span>
        </div>

        <div class="flex flex-1 flex-col p-3.5">
            <div class="text-sm font-semibold leading-snug">{{ tr(tutorial.title) }}</div>
            <p class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-base-content/50">{{ tr(tutorial.subtitle) }}</p>
            <div class="mt-3 flex items-center justify-between gap-2">
                <PlatformTags :platforms="tutorial.platforms" compact />
                <span class="shrink-0 font-orbitron text-[9px] text-base-content/35">
                    {{ tutorial.scenes.length }} {{ tr(L("章", "章", "CH", "章", "장", "CH")) }}
                </span>
            </div>
        </div>
    </button>
</template>
