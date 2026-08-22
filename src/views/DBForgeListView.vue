<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { forgeLevelData } from "@/data"

const searchKeyword = useSearchParam<string>("kw", "")

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

// 本页无选中态列表项，显式声明空选择器以遵循统一定位约定
useInitialScrollToSelectedItem({ selectedSelector: ".dbf-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col">
            <!-- 顶部列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0">
                <!-- 检索带：下划线搜索 + 计数 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索熔炼等级、任务或奖励 ID..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredForgeLevels.length }}
                        </span>
                    </div>
                </div>

                <!-- 熔炼等级列表 -->
                <ScrollArea class="flex-1">
                    <div class="stagger-rise space-y-3 p-3">
                        <div v-for="forge in filteredForgeLevels" :key="forge.ForgeLevel">
                            <DBForgeDetailItem :forge="forge" />
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共
                        <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredForgeLevels.length }}</b>
                        个熔炼等级
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
