<script lang="ts" setup>
import { computed, ref } from "vue"
import npcData, { NPC } from "@/data/d/npc.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = ref("")
const selectedNpc = ref<NPC | null>(null)

// 按关键词筛选 NPC
const filteredNpcs = computed(() => {
    return npcData.filter(npc => {
        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value
            // 直接匹配（ID、名称）
            if (`${npc.id}`.includes(q) || (npc.name && npc.name.includes(q))) {
                return true
            } else if (npc.name) {
                // 拼音匹配（名称）
                const nameMatch = matchPinyin(npc.name, q).match
                if (nameMatch) {
                    return true
                }
            }
        }
        return false
    })
})

function selectNpc(npc: NPC | null) {
    selectedNpc.value = npc
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedNpc }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索 NPC ID/名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- NPC 列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="npc in filteredNpcs"
                            :key="npc.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedNpc?.id === npc.id }"
                            @click="selectNpc(npc)"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ npc.name || `NPC ${npc.id}` }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        <span v-if="npc.camp">{{ npc.camp }}</span>
                                        <span v-if="npc.type" class="ml-2">{{ npc.type }}</span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span v-if="npc.icon" class="text-xs px-2 py-0.5 rounded bg-primary text-white">
                                        {{ npc.icon }}
                                    </span>
                                    <span class="text-xs opacity-70">ID: {{ npc.id }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span v-if="npc.charId">角色 ID: {{ npc.charId }}</span>
                                <span v-if="npc.talks && npc.talks.length">对话: {{ npc.talks.length }}条</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredNpcs.length }} 个 NPC
                </div>
            </div>
            <div
                v-if="selectedNpc"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectNpc(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedNpc" class="flex-1">
                <DBNpcDetailItem :npc="selectedNpc" />
            </ScrollArea>
        </div>
    </div>
</template>
