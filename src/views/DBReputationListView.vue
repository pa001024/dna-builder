<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import reputationData from "@/data/d/reputation.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedReputationId = useSearchParam<number>("id", 0)

/**
 * 根据 ID 获取当前选中的区域声名条目。
 */
const selectedReputation = computed(() => {
    return selectedReputationId.value ? reputationData.find(reputation => reputation.id === selectedReputationId.value) || null : null
})

/**
 * 根据关键词筛选区域声名条目，支持拼音匹配。
 */
const filteredReputations = computed(() => {
    return reputationData.filter(reputation => {
        if (searchKeyword.value === "") {
            return true
        }

        const query = searchKeyword.value
        if (
            `${reputation.id}`.includes(query) ||
            reputation.name.includes(query) ||
            reputation.entrusts.some(entrust => entrust.name.includes(query) || entrust.desc.includes(query))
        ) {
            return true
        }

        if (matchPinyin(reputation.name, query).match) {
            return true
        }

        return reputation.entrusts.some(entrust => matchPinyin(entrust.name, query).match || matchPinyin(entrust.desc, query).match)
    })
})

/**
 * 切换当前选中的区域声名条目。
 * @param reputation 目标区域声名条目，传入 null 表示取消选择
 */
function selectReputation(reputation: (typeof reputationData)[0] | null) {
    selectedReputationId.value = reputation?.id || 0
}

/**
 * 计算区域声名图标的资源地址。
 * @param icon 图标资源名
 * @returns 可展示的图片 URL
 */
function getReputationIcon(icon: string): string {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbrp-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedReputation }">
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="$t('reputation.searchPlaceholder')"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredReputations.length }}
                        </span>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div
                            v-if="filteredReputations.length === 0"
                            class="flex flex-col items-center justify-center py-20 text-base-content/45"
                        >
                            <p class="text-sm">未找到匹配的区域声名</p>
                        </div>

                        <div v-else class="space-y-2">
                            <article
                                v-for="(reputation, index) in filteredReputations"
                                :key="reputation.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedReputationId === reputation.id
                                        ? 'dbrp-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectReputation(reputation)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedReputationId === reputation.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <img
                                        :src="getReputationIcon(reputation.icon)"
                                        :alt="reputation.name"
                                        class="size-12 shrink-0 rounded-xs bg-base-content/3 object-cover"
                                    />
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：名称 + 幽灵 ID -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedReputationId === reputation.id }"
                                            >
                                                {{ $t(reputation.name) }}
                                            </h3>
                                            <CopyID :id="reputation.id" class="ml-auto shrink-0" />
                                        </div>
                                        <!-- 元信息行：周上限 / 等级 / 委托数 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span>{{ $t("reputation.weeklyExpLimit") }}: {{ reputation.weekLimit }}</span>
                                            <span class="font-mono tabular-nums">Lv.{{ reputation.levels.length }}</span>
                                            <span>{{ $t("reputation.entrust") }}: {{ reputation.entrusts.length }}</span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        {{ $t("reputation.totalCount", { count: filteredReputations.length }) }}
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedReputation"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectReputation(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedReputation" class="min-w-0 flex-2">
                <DBReputationDetailItem :key="selectedReputationId" :reputation="selectedReputation" />
            </ScrollArea>
        </div>
    </div>
</template>
