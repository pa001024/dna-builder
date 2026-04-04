<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { resourceData } from "@/data/d/resource.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedResourceId = useSearchParam<number>("id", 0)

const selectedResource = computed(() => {
    return selectedResourceId.value ? resourceData.find(resource => resource.id === selectedResourceId.value) || null : null
})

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
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                        <div
                            v-for="resource in filteredResources"
                            :key="resource.id"
                            class="p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedResourceId === resource.id }"
                            @click="selectedResourceId = resource.id"
                        >
                            <div class="flex flex-col items-center gap-2 text-center">
                                <ImageFallback
                                    :src="`/imgs/res/${resource.icon}.webp`"
                                    :alt="resource.name"
                                    class="w-14 h-14 rounded shrink-0"
                                    :class="`bg-linear-15 ${getRarityGradientClass(resource.rarity)}`"
                                >
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="resource.name" class="w-14 h-14 rounded shrink-0" />
                                </ImageFallback>
                                <div class="min-w-0 w-full">
                                    <div class="font-medium truncate">{{ resource.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">{{ $t("resource.id") }}: {{ resource.id }}</div>
                                </div>
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
