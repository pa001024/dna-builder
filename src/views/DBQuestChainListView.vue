<script lang="ts" setup>
import { useSessionStorage } from "@vueuse/core"
import { computed } from "vue"
import { questData } from "@/data/d/quest.data"
import questChainData, { type QuestChain } from "@/data/d/questchain.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSessionStorage<string>("questchain.searchKeyword", "")
const selectedQuestChainId = useSessionStorage<number>("questchain.selectedQuestChain", 0)
const showImprCheckOnly = useSessionStorage<boolean>("questchain.showImprCheckOnly", false)
const showImprIncreaseOnly = useSessionStorage<boolean>("questchain.showImprIncreaseOnly", false)

/**
 * 构建包含印象检定选项的任务 ID 集合。
 * @returns 任务 ID 集合
 */
function buildQuestImprCheckIdSet(): Set<number> {
    const questIdSet = new Set<number>()

    for (const questStory of questData) {
        for (const questItem of questStory.quests) {
            const hasImprCheck = questItem.nodes.some(node => {
                return node.dialogues?.some(dialogue => dialogue.options?.some(option => !!option.imprCheck))
            })

            if (hasImprCheck) {
                questIdSet.add(questItem.id)
            }
        }
    }

    return questIdSet
}

/**
 * 构建包含印象增加选项的任务 ID 集合。
 * @returns 任务 ID 集合
 */
function buildQuestImprIncreaseIdSet(): Set<number> {
    const questIdSet = new Set<number>()

    for (const questStory of questData) {
        for (const questItem of questStory.quests) {
            const hasImprIncrease = questItem.nodes.some(node => {
                return node.dialogues?.some(dialogue => {
                    return dialogue.options?.some(option => {
                        return !!option.impr && option.impr[2] > 0
                    })
                })
            })

            if (hasImprIncrease) {
                questIdSet.add(questItem.id)
            }
        }
    }

    return questIdSet
}

/**
 * 构建任务链 ID 集合。
 * @param questIdSet 任务 ID 集合
 * @returns 任务链 ID 集合
 */
function buildQuestChainIdSetByQuestIds(questIdSet: Set<number>): Set<number> {
    const questChainIdSet = new Set<number>()

    for (const questChain of questChainData) {
        const hasMatchedQuest = questChain.quests.some(quest => questIdSet.has(quest.id))
        if (hasMatchedQuest) {
            questChainIdSet.add(questChain.id)
        }
    }

    return questChainIdSet
}

const questImprCheckIdSet = buildQuestImprCheckIdSet()
const questImprIncreaseIdSet = buildQuestImprIncreaseIdSet()
const questChainImprCheckIdSet = buildQuestChainIdSetByQuestIds(questImprCheckIdSet)
const questChainImprIncreaseIdSet = buildQuestChainIdSetByQuestIds(questImprIncreaseIdSet)

/**
 * 根据 ID 获取选中的任务链。
 */
const selectedQuestChain = computed(() => {
    return selectedQuestChainId.value ? questChainData.find(questChain => questChain.id === selectedQuestChainId.value) || null : null
})

/**
 * 判断任务链是否包含印象检定。
 * @param questChainId 任务链 ID
 * @returns 是否包含印象检定
 */
function hasQuestChainImprCheck(questChainId: number): boolean {
    return questChainImprCheckIdSet.has(questChainId)
}

/**
 * 判断任务链是否包含印象增加。
 * @param questChainId 任务链 ID
 * @returns 是否包含印象增加
 */
function hasQuestChainImprIncrease(questChainId: number): boolean {
    return questChainImprIncreaseIdSet.has(questChainId)
}

/**
 * 按关键词与筛选条件过滤任务链。
 */
const filteredQuestChains = computed(() => {
    return questChainData.filter(questChain => {
        if (showImprCheckOnly.value && !hasQuestChainImprCheck(questChain.id)) {
            return false
        }

        if (showImprIncreaseOnly.value && !hasQuestChainImprIncrease(questChain.id)) {
            return false
        }

        if (searchKeyword.value === "") {
            return true
        }

        const keyword = searchKeyword.value
        if (`${questChain.id}`.includes(keyword) || questChain.name.includes(keyword)) {
            return true
        }

        return matchPinyin(questChain.name, keyword).match
    })
})

/**
 * 选中任务链。
 * @param questChain 任务链
 */
function selectQuestChain(questChain: QuestChain | null) {
    selectedQuestChainId.value = questChain?.id || 0
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedQuestChain }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索任务 ID/名称（支持拼音）..."
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
                            v-for="questChain in filteredQuestChains"
                            :key="questChain.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedQuestChainId === questChain.id }"
                            @click="selectQuestChain(questChain)"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex-1">
                                    <div class="font-medium">{{ questChain.name }}</div>

                                    <div class="text-xs opacity-70 mt-1 flex flex-wrap items-center gap-2">
                                        <span>{{ questChain.chapterName }} {{ questChain.chapterNumber || "" }}</span>
                                        <span v-if="questChain.main" class="px-1.5 py-0.5 rounded bg-info text-info-content">主线</span>
                                        <span
                                            v-if="hasQuestChainImprCheck(questChain.id)"
                                            class="px-1.5 py-0.5 rounded bg-secondary text-secondary-content"
                                        >
                                            印象检定
                                        </span>
                                        <span
                                            v-if="hasQuestChainImprIncrease(questChain.id)"
                                            class="px-1.5 py-0.5 rounded bg-success text-success-content"
                                        >
                                            印象增加
                                        </span>
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

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">共 {{ filteredQuestChains.length }} 个任务</div>
            </div>

            <div
                v-if="selectedQuestChain"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectQuestChain(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedQuestChain" :key="selectedQuestChain.id" class="flex-2">
                <DBQuestDetailItem :questChain="selectedQuestChain" />
            </ScrollArea>
        </div>
    </div>
</template>
