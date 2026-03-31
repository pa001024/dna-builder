<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { resourceData } from "@/data/d/resource.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedResourceId = useSearchParam<number>("id", 0)

const selectedResource = computed(() => {
    return selectedResourceId.value ? resourceData.find(resource => resource.id === selectedResourceId.value) || null : null
})

/**
 * 获取资源稀有度名称。
 * @param rarity 稀有度数值。
 * @returns 稀有度文本。
 */
function getRarityName(rarity: number): string {
    const rarityMap: Record<number, string> = {
        1: "白",
        2: "绿",
        3: "蓝",
        4: "紫",
        5: "金",
    }

    return rarityMap[rarity] || rarity.toString()
}

/**
 * 获取资源稀有度标签颜色。
 * @param rarity 稀有度数值。
 * @returns 颜色样式类名。
 */
function getRarityColor(rarity: number): string {
    const colorMap: Record<number, string> = {
        1: "bg-gray-200 text-gray-800",
        2: "bg-green-200 text-green-800",
        3: "bg-blue-200 text-blue-800",
        4: "bg-purple-200 text-purple-800",
        5: "bg-yellow-200 text-yellow-800",
    }

    return colorMap[rarity] || "bg-base-200 text-base-content"
}

const filteredResources = computed(() => {
    return resourceData.filter(resource => {
        if (!searchKeyword.value) {
            return true
        }

        const query = searchKeyword.value
        if (`${resource.id}`.includes(query) || resource.name.includes(query)) {
            return true
        }

        return matchPinyin(resource.name, query).match
    })
})

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedResource }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        :placeholder="$t('resource.searchPlaceholder')"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
                        <div
                            v-for="resource in filteredResources"
                            :key="resource.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedResourceId === resource.id }"
                            @click="selectedResourceId = resource.id"
                        >
                            <div class="flex flex-col items-center gap-2 text-center">
                                <ImageFallback :src="`/imgs/res/${resource.icon}.webp`" :alt="resource.name" class="w-14 h-14 rounded shrink-0">
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="resource.name" class="w-14 h-14 rounded shrink-0" />
                                </ImageFallback>
                                <div class="min-w-0 w-full">
                                    <div class="font-medium truncate">{{ resource.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">{{ $t("resource.id") }}: {{ resource.id }}</div>
                                </div>
                                <span class="text-xs px-2 py-0.5 rounded" :class="getRarityColor(resource.rarity)">
                                    {{ getRarityName(resource.rarity) }}
                                </span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>

            <div v-if="selectedResource" class="flex-1 overflow-hidden">
                <ScrollArea class="h-full">
                    <DBResourceDetailItem :resource="selectedResource" class="flex-1" />
                </ScrollArea>
            </div>
        </div>
    </div>
</template>
