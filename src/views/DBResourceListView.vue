<script lang="ts" setup>
import { computed } from "vue"
import { useSearchParam } from "@/composables/useSearchParam"
import { resourceData } from "@/data/d/resource.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

/** 资源卡片高度的估算下界（px）：实测自然高度 130.5，首帧后由 VirtualList 按实测值校正。 */
const RESOURCE_CARD_HEIGHT = 130

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

/** 选中资源在结果集中的下标：虚拟化后选中项不一定在 DOM 里，需由它滚入视口。 */
const selectedResourceIndex = computed(() => filteredResources.value.findIndex(resource => resource.id === selectedResourceId.value))

/**
 * 收起资源详情面板。
 */
function closeSelectedResource(): void {
    selectedResourceId.value = 0
}
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedResource)" @collapse="closeSelectedResource">
            <template #master>
                <!-- 左侧列表面板 -->
                <div
                    class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                    :class="{ 'sm:border-r border-base-content/10': selectedResource }"
                >
                    <!-- 检索带：下划线搜索 + 计数 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <div class="relative">
                            <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                            <input
                                v-model="searchKeyword"
                                type="text"
                                :placeholder="$t('resource.searchPlaceholder')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                            />
                            <span
                                class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                            >
                                {{ filteredResources.length }}
                            </span>
                        </div>
                    </div>

                    <!-- 资源列表 -->
                    <VirtualList
                        class="flex-1"
                        :items="filteredResources"
                        :item-height="RESOURCE_CARD_HEIGHT"
                        :item-key="resource => resource.id"
                        :min-column-width="120"
                        :active-index="selectedResourceIndex"
                        columns="auto"
                        v-slot="{ item: resource, index, animate, rowHeight }"
                    >
                        <article
                            class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                            :class="[
                                selectedResourceId === resource.id
                                    ? 'dbr-item-active border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/60 hover:border-primary/50',
                                animate ? 'animate-ef-rise motion-reduce:animate-none' : '',
                            ]"
                            :style="{ minHeight: `${rowHeight}px`, animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectedResourceId = resource.id"
                        >
                            <!-- 左侧主色强调条：选中时显现 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="selectedResourceId === resource.id ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />
                            <div class="flex flex-col items-center gap-2 p-3 text-center">
                                <ImageFallback
                                    :src="`/imgs/res/${resource.icon}.webp`"
                                    :alt="resource.name"
                                    class="size-14 shrink-0 rounded-xs bg-linear-15"
                                    :class="getRarityGradientClass(resource.rarity)"
                                >
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="resource.name" class="size-14 shrink-0 rounded-xs" />
                                </ImageFallback>
                                <div class="min-w-0 w-full">
                                    <div
                                        class="truncate text-sm font-medium transition-colors duration-200 group-hover:text-primary"
                                        :class="{ 'text-primary': selectedResourceId === resource.id }"
                                    >
                                        {{ $t(resource.name) }}
                                    </div>
                                    <div class="mt-1 text-[11px] tabular-nums text-base-content/45">
                                        {{ $t("resource.id") }}: {{ resource.id }}
                                    </div>
                                </div>
                            </div>
                        </article>
                    </VirtualList>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t('common.total_count') }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredResources.length }}</b>
                            {{ $t('db-resource-list.resource_count') }}
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedResource" class="min-h-0 min-w-0 flex-1">
                    <DBResourceDetailItem :key="selectedResourceId" :resource="selectedResource" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
