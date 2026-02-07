<script lang="ts" setup>
import { useSessionStorage } from "@vueuse/core"
import { computed } from "vue"
import questChainData, { QuestChain } from "@/data/d/questchain.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSessionStorage<string>("questchain.searchKeyword", "")
const selectedQuestChainId = useSessionStorage<number>("questchain.selectedQuestChain", 0)

// 根据 ID 获取选中的任务
const selectedQuestChain = computed(() => {
    return selectedQuestChainId.value ? questChainData.find(questChain => questChain.id === selectedQuestChainId.value) || null : null
})

// 按关键词筛选任务
const filteredQuestChains = computed(() => {
    return questChainData.filter(questChain => {
        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value
            // 直接匹配（ID、名称）
            if (`${questChain.id}`.includes(q) || questChain.name.includes(q)) {
                return true
            } else {
                // 拼音匹配（名称）
                const nameMatch = matchPinyin(questChain.name, q).match
                if (nameMatch) {
                    return true
                }
            }
        }
        return false
    })
})

function selectQuestChain(questChain: QuestChain | null) {
    selectedQuestChainId.value = questChain?.id || 0
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedQuestChain }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索任务 ID/名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 任务列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="questChain in filteredQuestChains"
                            :key="questChain.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedQuestChainId === questChain.id }"
                            @click="selectQuestChain(questChain)"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ questChain.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span>{{ questChain.chapterName }} {{ questChain.chapterNumber || "" }}</span>
                                        <span v-if="questChain.main" class="ml-2 px-1.5 py-0.5 rounded bg-info text-info-content"
                                            >主线</span
                                        >
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs opacity-70">ID: {{ questChain.id }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>{{ questChain.episode }}</span>
                                <span v-if="questChain.type">类型: {{ questChain.type }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredQuestChains.length }} 个任务
                </div>
            </div>
            <div
                v-if="selectedQuestChain"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectQuestChain(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedQuestChain" class="flex-2">
                <DBQuestDetailItem :questChain="selectedQuestChain" />
            </ScrollArea>
        </div>
    </div>
</template>
