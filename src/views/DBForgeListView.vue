<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { forgeLevelData } from "@/data"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedForgeLevel = useSearchParam<number>("id", 0)

const selectedForge = computed(() => {
    return selectedForgeLevel.value ? forgeLevelData.find(item => item.ForgeLevel === selectedForgeLevel.value) || null : null
})

const filteredForgeLevels = computed(() => {
    return forgeLevelData.filter(item => {
        if (!searchKeyword.value) {
            return true
        }

        const query = searchKeyword.value
        return (
            `${item.ForgeLevel}`.includes(query) ||
            `${item.ForgeLevelReward}`.includes(query) ||
            item.ForgeLevelQuestId.some(id => `${id}`.includes(query)) ||
            `${item.HyperWeaponMaxCardLevel}`.includes(query)
        )
    })
})

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedForge }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索熔炼等级、任务或奖励 ID..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="forge in filteredForgeLevels"
                            :key="forge.ForgeLevel"
                            class="p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedForgeLevel === forge.ForgeLevel }"
                            @click="selectedForgeLevel = forge.ForgeLevel"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <div class="font-medium">熔炼等级 {{ forge.ForgeLevel }}</div>
                                    <div class="text-xs opacity-70 mt-1">最大同调卡牌等级: {{ forge.HyperWeaponMaxCardLevel }}</div>
                                </div>
                                <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">ID: {{ forge.ForgeLevel }}</span>
                            </div>

                            <div class="flex flex-wrap gap-2 mt-2 text-xs opacity-75">
                                <span>任务 {{ forge.ForgeLevelQuestId.length }} 个</span>
                                <span>奖励 {{ forge.ForgeLevelReward }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredForgeLevels.length }} 个熔炼等级
                </div>
            </div>

            <div
                v-if="selectedForge"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedForgeLevel = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedForge" class="flex-1">
                <DBForgeDetailItem :forge="selectedForge" />
            </ScrollArea>
        </div>
    </div>
</template>
