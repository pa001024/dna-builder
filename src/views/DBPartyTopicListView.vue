<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { charMap } from "@/data"
import partyTopicData, { type PartyTopic } from "@/data/d/partytopic.data"
import { questChainMap } from "@/data/d/questchain.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("partytopic.searchKeyword", "")
const selectedPartyTopicId = useSearchParam<number>("partytopic.selectedTopic", 0)
const selectedCharacterId = useSearchParam<string>("partytopic.selectedCharacter", "-")

/**
 * 获取当前选中的光阴集。
 */
const selectedPartyTopic = computed(() => {
    return selectedPartyTopicId.value ? partyTopicData.find(topic => topic.id === selectedPartyTopicId.value) || null : null
})

/**
 * 获取当前数据集中可筛选的角色列表。
 */
const characterOptions = computed(() => {
    const uniqueCharacterIds = new Set<number>()
    for (const partyTopic of partyTopicData) {
        uniqueCharacterIds.add(partyTopic.charId)
    }

    return Array.from(uniqueCharacterIds)
        .map(charId => ({
            charId,
            charName: getCharacterName(charId),
        }))
        .sort((left, right) => left.charId - right.charId)
})

/**
 * 关键词和角色联合过滤后的光阴集列表。
 */
const filteredPartyTopics = computed(() => {
    return partyTopicData.filter(partyTopic => {
        if (selectedCharacterId.value && selectedCharacterId.value !== "-" && partyTopic.charId !== Number(selectedCharacterId.value)) {
            return false
        }

        if (!searchKeyword.value) {
            return true
        }

        const keyword = searchKeyword.value
        const charName = getCharacterName(partyTopic.charId)

        if (`${partyTopic.id}`.includes(keyword) || partyTopic.name.includes(keyword) || charName.includes(keyword)) {
            return true
        }

        return matchPinyin(partyTopic.name, keyword).match || matchPinyin(charName, keyword).match
    })
})

/**
 * 选中光阴集。
 * @param partyTopic 光阴集
 */
function selectPartyTopic(partyTopic: PartyTopic | null) {
    selectedPartyTopicId.value = partyTopic?.id || 0
}

/**
 * 获取角色名称。
 * @param charId 角色 ID
 * @returns 角色名称
 */
function getCharacterName(charId: number): string {
    const targetCharacter = charMap.get(charId)
    if (!targetCharacter) {
        return `角色 ${charId}`
    }

    for (const [key, value] of charMap.entries()) {
        if (typeof key === "string" && value === targetCharacter) {
            return key
        }
    }

    return `角色 ${charId}`
}

/**
 * 获取前置任务链名称。
 * @param conditionId 前置任务链 ID
 * @returns 任务链显示文本
 */
function getConditionQuestChainName(conditionId: number | undefined): string {
    if (!conditionId) {
        return "无"
    }

    const questChain = questChainMap.get(conditionId)
    return questChain ? `${questChain.name}` : `${conditionId}`
}

/**
 * 获取光阴集消耗资源总数。
 * @param partyTopic 光阴集数据
 * @returns 消耗总数
 */
function getConsumeCount(partyTopic: PartyTopic): number {
    return Object.keys(partyTopic.consume || {}).length
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden"
                :class="{ 'border-r border-base-200': selectedPartyTopic }">
                <div class="p-3 border-b border-base-200 space-y-2">
                    <input v-model="searchKeyword" type="text" placeholder="搜索光阴集 ID/名称/角色（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all" />

                    <div class="flex items-center gap-2 text-xs">
                        <span class="text-base-content/70 shrink-0">角色筛选</span>
                        <Select v-model="selectedCharacterId"
                            class="w-full px-2 py-1 rounded bg-base-200 text-base-content outline-none focus:ring-1 focus:ring-primary">
                            <SelectItem value="-">全部角色</SelectItem>
                            <SelectItem v-for="characterOption in characterOptions" :key="characterOption.charId"
                                :value="characterOption.charId">
                                {{ characterOption.charName }}
                            </SelectItem>
                        </Select>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div v-for="partyTopic in filteredPartyTopics" :key="partyTopic.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedPartyTopicId === partyTopic.id }"
                            @click="selectPartyTopic(partyTopic)">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0 flex-1">
                                    <div class="font-medium line-clamp-1">{{ partyTopic.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">
                                        {{ getCharacterName(partyTopic.charId) }} · 资源 {{ getConsumeCount(partyTopic) }}
                                        项
                                    </div>
                                </div>

                                <div class="flex flex-col items-end gap-1 text-xs opacity-70 shrink-0">
                                    <span>ID: {{ partyTopic.id }}</span>
                                </div>
                            </div>

                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>前置: {{ getConditionQuestChainName(partyTopic.conditionId) }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredPartyTopics.length }} 条光阴集
                </div>
            </div>

            <div v-if="selectedPartyTopic"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectPartyTopic(null)">
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedPartyTopic" :key="selectedPartyTopic.id" class="flex-2">
                <DBPartyTopicDetailItem :party-topic="selectedPartyTopic" />
            </ScrollArea>
        </div>
    </div>
</template>
