<script lang="ts" setup>
import { computed } from "vue"
import { charMap } from "@/data"
import { LeveledChar } from "@/data/leveled/LeveledChar"
import type { ModCharBreakthroughSourceInfo } from "@/utils/resource-source"

const props = defineProps<{
    customSources: ModCharBreakthroughSourceInfo[]
    sourceTitle?: string
}>()

const displayCustomSources = computed(() =>
    props.customSources.map(source => {
        const char = charMap.get(source.charId) || null
        return {
            ...source,
            charName: char?.名称 || source.title,
            charIconUrl: LeveledChar.url(char?.icon),
        }
    })
)

const sourceTitle = computed(() => props.sourceTitle || "角色突破")
</script>

<template>
    <div v-if="displayCustomSources.length > 0" class="space-y-2">
        <div class="text-[11px] tracking-wide text-base-content/55">{{ sourceTitle }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
            <div
                v-for="source in displayCustomSources"
                :key="source.key"
                class="group flex w-full items-center gap-2.5 rounded-xs border border-base-content/15 bg-base-content/4 p-2 transition-colors duration-200 hover:border-primary/50 hover:bg-base-content/6"
            >
                <div class="relative size-11 shrink-0 overflow-hidden rounded-xs bg-linear-to-b from-violet-500/25 to-violet-100/10">
                    <img
                        :src="source.charIconUrl"
                        :alt="source.charName"
                        class="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink :to="source.link" class="hover:underline">
                                {{ source.charName }}
                            </SRouterLink>
                        </h4>
                        <span
                            v-if="source.num"
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            x{{ source.num }}
                        </span>
                    </div>
                    <div v-if="source.detail" class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span class="shrink-0 rounded-xs bg-violet-500/15 px-1 py-px text-[8px] font-semibold text-violet-400">
                            {{ sourceTitle }}
                        </span>
                        <span class="truncate">{{ source.detail }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
