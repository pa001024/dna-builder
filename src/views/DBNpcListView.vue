<script lang="ts" setup>
import { useSessionStorage } from "@vueuse/core"
import { computed } from "vue"
import npcData, { type NPC, npcMap } from "@/data/d/npc.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSessionStorage<string>("npc.searchKeyword", "")
const selectedNpcId = useSessionStorage<number>("npc.selectedNpc", 0)
const showImprCheckOnly = useSessionStorage<boolean>("npc.showImprCheckOnly", false)
const showImprIncreaseOnly = useSessionStorage<boolean>("npc.showImprIncreaseOnly", false)

/**
 * 判断 NPC 是否包含印象检定。
 * @param npc NPC 数据
 * @returns 是否包含印象检定
 */
function hasNpcImprCheck(npc: NPC): boolean {
    return !!npc.talks?.some(dialogue => dialogue.options?.some(option => !!option.imprCheck))
}

/**
 * 判断 NPC 是否包含印象增加。
 * @param npc NPC 数据
 * @returns 是否包含印象增加
 */
function hasNpcImprIncrease(npc: NPC): boolean {
    return !!npc.talks?.some(dialogue => {
        return dialogue.options?.some(option => {
            return !!option.impr && option.impr[2] > 0
        })
    })
}

/**
 * 根据 ID 获取选中的 NPC。
 */
const selectedNpc = computed(() => {
    return selectedNpcId.value ? npcMap.get(selectedNpcId.value) || null : null
})

/**
 * 按关键词和筛选条件过滤 NPC。
 */
const filteredNpcs = computed(() => {
    return npcData.filter(npc => {
        if (showImprCheckOnly.value && !hasNpcImprCheck(npc)) {
            return false
        }

        if (showImprIncreaseOnly.value && !hasNpcImprIncrease(npc)) {
            return false
        }

        if (searchKeyword.value === "") {
            return true
        }

        const keyword = searchKeyword.value
        if (`${npc.id}`.includes(keyword) || (npc.name && npc.name.includes(keyword))) {
            return true
        }

        if (!npc.name) {
            return false
        }

        return matchPinyin(npc.name, keyword).match
    })
})

/**
 * 选中 NPC。
 * @param npc NPC 数据
 */
function selectNpc(npc: NPC | null) {
    selectedNpcId.value = npc?.id || 0
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedNpc }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索 NPC ID/名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />

                    <div class="mt-2 flex items-center gap-4 text-xs text-base-content/80">
                        <label class="flex items-center gap-2 select-none cursor-pointer">
                            <input v-model="showImprCheckOnly" type="checkbox" class="checkbox checkbox-xs" />
                            <span>仅显示含印象检定</span>
                        </label>

                        <label class="flex items-center gap-2 select-none cursor-pointer">
                            <input v-model="showImprIncreaseOnly" type="checkbox" class="checkbox checkbox-xs" />
                            <span>仅显示印象增加</span>
                        </label>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="npc in filteredNpcs"
                            :key="npc.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedNpcId === npc.id }"
                            @click="selectNpc(npc)"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ npc.name || `NPC ${npc.id}` }}</div>

                                    <div class="text-xs opacity-70 mt-1 flex flex-wrap items-center gap-2">
                                        <span v-if="npc.camp">{{ npc.camp }}</span>
                                        <span v-if="npc.type">{{ npc.type }}</span>
                                        <span v-if="hasNpcImprCheck(npc)" class="px-1.5 py-0.5 rounded bg-secondary text-secondary-content">
                                            印象检定
                                        </span>
                                        <span v-if="hasNpcImprIncrease(npc)" class="px-1.5 py-0.5 rounded bg-success text-success-content">
                                            印象增加
                                        </span>
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
                                <span v-if="npc.talks?.length">对话: {{ npc.talks.length }} 条</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">共 {{ filteredNpcs.length }} 个 NPC</div>
            </div>

            <div
                v-if="selectedNpc"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectNpc(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedNpc" class="flex-1">
                <DBNpcDetailItem :npc="selectedNpc" />
            </ScrollArea>
        </div>
    </div>
</template>
