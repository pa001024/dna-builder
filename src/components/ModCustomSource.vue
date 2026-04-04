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
        <div class="text-xs text-base-content/60">{{ sourceTitle }}</div>
        <div v-for="source in displayCustomSources" :key="source.key">
            <div class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors duration-200 flex items-start gap-3">
                <img :src="source.charIconUrl" class="size-10 object-cover rounded shrink-0 overflow-hidden" :alt="source.charName" />
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 min-w-0">
                        <SRouterLink :to="source.link" class="hover:underline min-w-0 truncate">
                            {{ source.charName }}
                        </SRouterLink>
                    </div>
                    <div class="mt-1 text-xs text-base-content/70">{{ source.detail }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
