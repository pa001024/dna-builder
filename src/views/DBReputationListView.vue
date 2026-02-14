<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import reputationData from "@/data/d/reputation.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("reputation.searchKeyword", "")
const selectedReputationId = useSearchParam<number>("reputation.selectedReputation", 0)

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

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden"
                :class="{ 'border-r border-base-200': selectedReputation }">
                <div class="p-3 border-b border-base-200">
                    <input v-model="searchKeyword" type="text" :placeholder="$t('reputation.searchPlaceholder')"
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="reputation in filteredReputations" :key="reputation.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedReputationId === reputation.id }"
                            @click="selectReputation(reputation)">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex items-start gap-2">
                                    <img :src="getReputationIcon(reputation.icon)" :alt="reputation.name"
                                        class="size-10 rounded bg-base-300 object-cover" />
                                    <div class="min-w-0">
                                        <div class="font-medium wrap-break-word">{{ $t(reputation.name) }}</div>
                                        <div class="text-xs opacity-70 mt-1">
                                            {{ $t("reputation.weeklyExpLimit") }}: {{ reputation.weekLimit }}
                                        </div>
                                    </div>
                                </div>

                                <div class="flex flex-col items-end gap-1 shrink-0">
                                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">ID: {{
                                        reputation.id }}</span>
                                    <span class="text-xs opacity-70">Lv.{{ reputation.levels.length }}</span>
                                </div>
                            </div>

                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70 flex-wrap">
                                <span>{{ $t("reputation.level") }}: {{ reputation.levels.length }}</span>
                                <span>{{ $t("reputation.entrust") }}: {{ reputation.entrusts.length }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    {{ $t("reputation.totalCount", { count: filteredReputations.length }) }}
                </div>
            </div>

            <div v-if="selectedReputation"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectReputation(null)">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedReputation" class="flex-2">
                <DBReputationDetailItem :reputation="selectedReputation" />
            </ScrollArea>
        </div>
    </div>
</template>
