<script lang="ts" setup>
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, reactive } from "vue"
import TypewriterText from "@/components/TypewriterText.vue"
import { npcMap } from "@/data/d/npc.data"
import {
    type DetectiveAnswer,
    type DetectiveQuestion,
    type Dialogue,
    type DialogueOption,
    getImprType,
    getRegionType,
    type QuestItem,
    type QuestNode,
    questData,
} from "@/data/d/quest.data"
import type { QuestChain } from "@/data/d/questchain.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { useSettingStore } from "@/store/setting"
import { getDropModeText, getRewardDetails, RewardItem as RewardItemType } from "@/utils/reward-utils"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

interface DialogueChainItem {
    dialogue: Dialogue
    selectedOption?: DialogueOption
}

interface QuestNodeWithChain extends QuestNode {
    chain: DialogueChainItem[]
}

interface QuestNextOption {
    condition: string
    targetId: number
    isContinuous: boolean
}

interface QuestDetailItem {
    id: number
    sr?: number
    next?: Record<string, number>
    details: QuestItem | null
    nodeChains: QuestNodeWithChain[]
    nodeMap: Map<string, QuestNodeWithChain>
    reward: RewardItemType | null
    nextOptions: QuestNextOption[]
    hasBranchNext: boolean
}

const props = defineProps<{
    questChain: QuestChain
}>()

const settingStore = useSettingStore()

const selectedOptionMap = reactive<Record<string, number>>({})
const highlightedQuestNodeMap = reactive<Record<string, boolean>>({})
const highlightedQuestMap = reactive<Record<number, boolean>>({})

const questNodeElementMap = new Map<string, HTMLElement>()
const nodeHighlightTimerMap = new Map<string, ReturnType<typeof setTimeout>>()
const questElementMap = new Map<number, HTMLElement>()
const questHighlightTimerMap = new Map<number, ReturnType<typeof setTimeout>>()

const questItemMap = new Map<number, QuestItem>()
for (const questList of questData) {
    for (const questItem of questList.quests) {
        questItemMap.set(questItem.id, questItem)
    }
}

/**
 * 获取当前剧情文本替换配置。
 */
const storyTextConfig = computed<StoryTextConfig>(() => {
    return {
        nickname: settingStore.protagonistName1?.trim() || "维塔",
        nickname2: settingStore.protagonistName2?.trim() || "墨斯",
        gender: settingStore.protagonistGender,
        gender2: settingStore.protagonistGender2,
    }
})

/**
 * 解析剧情文本中的占位符。
 * @param text 原始文本
 * @returns 替换后的文本
 */
function formatStoryText(text: string | undefined): string {
    if (!text) {
        return ""
    }

    return replaceStoryPlaceholders(text, storyTextConfig.value)
}

/**
 * 生成任务节点分支状态作用域键。
 * @param questId 任务 ID
 * @param nodeId 节点 ID
 * @returns 作用域键
 */
function getQuestNodeScopeKey(questId: number, nodeId: string): string {
    return `quest-${questId}-node-${nodeId}`
}

/**
 * 生成选项状态键。
 * @param scopeKey 分支作用域键
 * @param dialogueId 对话 ID
 * @returns 状态键
 */
function getOptionStateKey(scopeKey: string, dialogueId: number): string {
    return `${scopeKey}-${dialogueId}`
}

/**
 * 注册任务节点 DOM 引用，供跳转定位使用。
 * @param nodeKey 节点作用域键
 * @param element 节点元素
 */
function setQuestNodeElement(nodeKey: string, element: Element | ComponentPublicInstance | null) {
    if (!element) {
        questNodeElementMap.delete(nodeKey)
        return
    }

    const targetElement = element instanceof Element ? element : (element.$el as Element | null)
    if (!targetElement) {
        questNodeElementMap.delete(nodeKey)
        return
    }

    questNodeElementMap.set(nodeKey, targetElement as HTMLElement)
}

/**
 * 注册任务卡片 DOM 引用，供任务级跳转定位使用。
 * @param questId 任务 ID
 * @param element 任务卡片元素
 */
function setQuestElement(questId: number, element: Element | ComponentPublicInstance | null) {
    if (!element) {
        questElementMap.delete(questId)
        return
    }

    const targetElement = element instanceof Element ? element : (element.$el as Element | null)
    if (!targetElement) {
        questElementMap.delete(questId)
        return
    }

    questElementMap.set(questId, targetElement as HTMLElement)
}

/**
 * 触发节点一次性高亮动画。
 * @param nodeKey 节点作用域键
 */
function triggerQuestNodeHighlight(nodeKey: string) {
    highlightedQuestNodeMap[nodeKey] = false

    nextTick(() => {
        highlightedQuestNodeMap[nodeKey] = true

        const previousTimer = nodeHighlightTimerMap.get(nodeKey)
        if (previousTimer) {
            clearTimeout(previousTimer)
        }

        const timer = setTimeout(() => {
            highlightedQuestNodeMap[nodeKey] = false
            nodeHighlightTimerMap.delete(nodeKey)
        }, 1200)

        nodeHighlightTimerMap.set(nodeKey, timer)
    })
}

/**
 * 触发任务卡片一次性高亮动画。
 * @param questId 任务 ID
 */
function triggerQuestHighlight(questId: number) {
    highlightedQuestMap[questId] = false

    nextTick(() => {
        highlightedQuestMap[questId] = true

        const previousTimer = questHighlightTimerMap.get(questId)
        if (previousTimer) {
            clearTimeout(previousTimer)
        }

        const timer = setTimeout(() => {
            highlightedQuestMap[questId] = false
            questHighlightTimerMap.delete(questId)
        }, 1200)

        questHighlightTimerMap.set(questId, timer)
    })
}

/**
 * 跳转到目标任务节点并触发高亮。
 * @param questId 任务 ID
 * @param nodeId 节点 ID
 */
function jumpToQuestNode(questId: number, nodeId: string) {
    const nodeKey = getQuestNodeScopeKey(questId, nodeId)
    const targetElement = questNodeElementMap.get(nodeKey)
    if (!targetElement) {
        return
    }

    targetElement.scrollIntoView({ behavior: "smooth", block: "center" })
    triggerQuestNodeHighlight(nodeKey)
}

/**
 * 跳转到目标任务卡片并触发高亮。
 * @param questId 目标任务 ID
 */
function jumpToQuest(questId: number) {
    const targetElement = questElementMap.get(questId)
    if (!targetElement) {
        return
    }

    targetElement.scrollIntoView({ behavior: "smooth", block: "center" })
    triggerQuestHighlight(questId)
}

onBeforeUnmount(() => {
    for (const timer of nodeHighlightTimerMap.values()) {
        clearTimeout(timer)
    }
    for (const timer of questHighlightTimerMap.values()) {
        clearTimeout(timer)
    }
    nodeHighlightTimerMap.clear()
    questHighlightTimerMap.clear()
    questNodeElementMap.clear()
    questElementMap.clear()
})

/**
 * 读取当前对话已选选项，默认取第一个选项。
 * @param scopeKey 分支作用域键
 * @param dialogue 对话数据
 * @returns 当前选项
 */
function getSelectedOption(scopeKey: string, dialogue: Dialogue): DialogueOption | undefined {
    if (!dialogue.options?.length) {
        return undefined
    }

    const optionStateKey = getOptionStateKey(scopeKey, dialogue.id)
    const selectedOptionId = selectedOptionMap[optionStateKey] ?? dialogue.options[0].id
    return dialogue.options.find(option => option.id === selectedOptionId) ?? dialogue.options[0]
}

/**
 * 从指定起点串接对话链，并防止循环引用导致死循环。
 * @param startId 起始对话 ID
 * @param dialogueMap 对话映射
 * @param visitedIds 已访问对话集合
 * @param chain 输出链路
 * @param scopeKey 分支作用域键
 */
function appendDialogueChain(
    startId: number,
    dialogueMap: Map<number, Dialogue>,
    visitedIds: Set<number>,
    chain: DialogueChainItem[],
    scopeKey: string
) {
    let currentId: number | undefined = startId

    while (currentId !== undefined && !visitedIds.has(currentId)) {
        const dialogue = dialogueMap.get(currentId)
        if (!dialogue) {
            break
        }

        visitedIds.add(currentId)
        const selectedOption = getSelectedOption(scopeKey, dialogue)
        chain.push({ dialogue, selectedOption })

        if (dialogue.options?.length) {
            currentId = selectedOption?.next
            continue
        }

        currentId = dialogue.next
    }
}

/**
 * 根据当前分支选择构建可展示对话链。
 * @param dialogues 原始对话数组
 * @param scopeKey 分支作用域键
 * @returns 对话链
 */
function buildDialogueChain(dialogues: Dialogue[], scopeKey: string): DialogueChainItem[] {
    if (!dialogues.length) {
        return []
    }

    const dialogueMap = new Map<number, Dialogue>()
    const incomingIds = new Set<number>()

    for (const dialogue of dialogues) {
        dialogueMap.set(dialogue.id, dialogue)

        if (dialogue.next !== undefined) {
            incomingIds.add(dialogue.next)
        }

        for (const option of dialogue.options ?? []) {
            if (option.next !== undefined) {
                incomingIds.add(option.next)
            }
        }
    }

    const startDialogues = dialogues.filter(dialogue => !incomingIds.has(dialogue.id))
    const startIds = (startDialogues.length > 0 ? startDialogues : [dialogues[0]]).map(dialogue => dialogue.id)

    const visitedIds = new Set<number>()
    const chain: DialogueChainItem[] = []
    for (const startId of startIds) {
        appendDialogueChain(startId, dialogueMap, visitedIds, chain, scopeKey)
    }

    return chain
}

/**
 * 构建任务节点分支链。
 * @param questId 任务 ID
 * @param nodes 节点数组
 * @returns 带分支链的节点
 */
function buildQuestNodeChains(questId: number, nodes: QuestNode[]): QuestNodeWithChain[] {
    const nodeMap = new Map<string, QuestNodeWithChain>()
    for (const node of nodes) {
        nodeMap.set(node.id, {
            ...node,
            chain: buildDialogueChain(node.dialogues ?? [], getQuestNodeScopeKey(questId, node.id)),
        })
    }

    const incomingNodeIdSet = new Set<string>()
    for (const node of nodeMap.values()) {
        for (const nextNodeId of node.next ?? []) {
            if (nodeMap.has(nextNodeId)) {
                incomingNodeIdSet.add(nextNodeId)
            }
        }
    }

    const orderedNodeIds: string[] = []
    const visitedNodeIdSet = new Set<string>()

    /**
     * 按 next 关系深度优先整理节点展示顺序，并用 visited 防止循环引用。
     * @param nodeId 当前节点 ID
     */
    function visitNodeByNext(nodeId: string) {
        if (visitedNodeIdSet.has(nodeId)) {
            return
        }

        const currentNode = nodeMap.get(nodeId)
        if (!currentNode) {
            return
        }

        visitedNodeIdSet.add(nodeId)
        orderedNodeIds.push(nodeId)

        for (const nextNodeId of currentNode.next ?? []) {
            visitNodeByNext(nextNodeId)
        }
    }

    const startNodeIds = nodes.filter(node => !incomingNodeIdSet.has(node.id)).map(node => node.id)
    const initialNodeIds = startNodeIds.length ? startNodeIds : nodes.map(node => node.id)

    for (const startNodeId of initialNodeIds) {
        visitNodeByNext(startNodeId)
    }

    for (const node of nodes) {
        visitNodeByNext(node.id)
    }

    return orderedNodeIds.map(nodeId => nodeMap.get(nodeId)).filter((node): node is QuestNodeWithChain => !!node)
}

/**
 * 获取节点展示标签。
 * @param nodeMap 节点映射
 * @param nodeId 目标节点 ID
 * @returns 节点标签
 */
function getNodeLabel(nodeMap: Map<string, QuestNodeWithChain>, nodeId: string): string {
    const targetNode = nodeMap.get(nodeId)
    if (!targetNode) {
        return `未知节点 ${nodeId}`
    }

    return `${formatStoryText(targetNode.name)} (${targetNode.type})`
}

/**
 * 更新指定对话的选项状态。
 * @param scopeKey 分支作用域键
 * @param dialogueId 对话 ID
 * @param optionId 选项 ID
 */
function selectOption(scopeKey: string, dialogueId: number, optionId: number) {
    selectedOptionMap[getOptionStateKey(scopeKey, dialogueId)] = optionId
}

/**
 * 提取选项中的印象变化条目。
 * @param option 对话选项
 * @returns 印象变化条目列表
 */
function getImpressionEntries(option: DialogueOption): Array<{ regionId: number; typeLabel: string; value: number }> {
    if (!option.impr) {
        return []
    }

    const [regionId, imprType, value] = option.impr
    if (typeof value !== "number" || value === 0) {
        return []
    }

    return [
        {
            regionId,
            typeLabel: getImprType(imprType),
            value,
        },
    ]
}

/**
 * 提取选项中的印象检定条目。
 * @param option 对话选项
 * @returns 印象检定条目列表
 */
function getImpressionCheckEntries(option: DialogueOption): Array<{ regionId: number; typeLabel: string; threshold: number }> {
    if (!option.imprCheck) {
        return []
    }

    const [regionId, imprType, threshold] = option.imprCheck
    if (typeof threshold !== "number") {
        return []
    }

    return [
        {
            regionId,
            typeLabel: getImprType(imprType),
            threshold,
        },
    ]
}

/**
 * 获取问题对应的答案数据。
 * @param node 任务节点
 * @param question 问题数据
 * @returns 答案列表
 */
function getQuestionAnswers(node: QuestNodeWithChain, question: DetectiveQuestion): DetectiveAnswer[] {
    const nodeAnswers = node.answers ?? []
    if (!nodeAnswers.length) {
        return []
    }

    const answerIdSet = new Set(question.answers)
    const idMatchedAnswers = nodeAnswers.filter(answer => answerIdSet.has(answer.id))
    if (idMatchedAnswers.length) {
        return idMatchedAnswers
    }

    return nodeAnswers.filter(answer => answer.qid === question.id)
}

/**
 * 获取 NPC 名称。
 * @param npcId NPC ID
 * @returns NPC 名称
 */
function getNPCName(npcId: number | undefined): string {
    if (npcId === undefined) {
        return ""
    }

    const rawName = npcMap.get(npcId)?.name || `${npcId}`
    return formatStoryText(rawName)
}

/**
 * 获取任务展示标签。
 * @param questId 任务 ID
 * @returns 任务标签
 */
function getQuestLabel(questId: number): string {
    const targetQuest = questItemMap.get(questId)
    if (!targetQuest) {
        return `未知任务 ${questId}`
    }

    return `${formatStoryText(targetQuest.name)} (${questId})`
}

/**
 * 判断任务是否需要展示分支或跳转选项。
 * @param quest 任务详情
 * @returns 是否显示跳转区块
 */
function shouldShowQuestNextOptions(quest: QuestDetailItem): boolean {
    if (!quest.nextOptions.length) {
        return false
    }

    if (quest.hasBranchNext) {
        return true
    }

    return !quest.nextOptions[0].isContinuous
}

/**
 * 计算任务详情列表。
 */
const questDetails = computed<QuestDetailItem[]>(() => {
    const questIndexMap = new Map<number, number>(props.questChain.quests.map((quest, index) => [quest.id, index]))

    return props.questChain.quests.map((quest, index) => {
        const details = questItemMap.get(quest.id) ?? null
        const rewardId = props.questChain.questReward?.[quest.id]
        const reward = rewardId ? getRewardDetails(rewardId) : null
        const nodeChains = details ? buildQuestNodeChains(quest.id, details.nodes) : []
        const nodeMap = new Map<string, QuestNodeWithChain>(nodeChains.map(node => [node.id, node]))

        const nextEntries = Object.entries(quest.next ?? {})
            .map(([condition, targetId]) => ({ condition, targetId }))
            .filter(nextOption => questIndexMap.has(nextOption.targetId))

        const hasBranchNext = nextEntries.length > 1
        const expectedNextQuestId = props.questChain.quests[index + 1]?.id
        const nextOptions: QuestNextOption[] = nextEntries.map(nextOption => ({
            condition: nextOption.condition,
            targetId: nextOption.targetId,
            isContinuous: !hasBranchNext && expectedNextQuestId === nextOption.targetId,
        }))

        return {
            ...quest,
            details,
            nodeChains,
            nodeMap,
            reward,
            nextOptions,
            hasBranchNext,
        }
    })
})

// 获取子区域名称
const getSubRegionName = (subRegionId: number) => {
    const subRegion = subRegionMap.get(subRegionId)
    return subRegion ? subRegion.name : `子区域${subRegionId}`
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div
                    v-if="questChain.icon"
                    class="size-10 bg-base-content"
                    :style="{ mask: `url(/imgs/webp/${questChain.icon}.webp) no-repeat center/contain` }"
                    :alt="questChain.name"
                />

                <div>
                    <SRouterLink :to="`/db/questchain/${questChain.id}`" class="text-lg font-bold link link-primary">
                        {{ questChain.name }}
                    </SRouterLink>
                    <div class="text-sm text-base-content/70">ID: {{ questChain.id }}</div>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">基本信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">ID</span>
                    <span>{{ questChain.id }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">章节</span>
                    <span>{{ questChain.chapterName }} {{ questChain.chapterNumber || "" }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">剧集</span>
                    <span>{{ questChain.episode }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">类型</span>
                    <span>{{ questChain.type }}</span>
                </div>
                <div v-if="questChain.main" class="flex justify-between">
                    <span class="text-base-content/70">主线</span>
                    <span class="px-2 py-0.5 rounded bg-info text-info-content">是</span>
                </div>
                <div v-if="questChain.startTime" class="flex justify-between">
                    <span class="text-base-content/70">开始时间</span>
                    <span>{{ new Date(questChain.startTime * 1000).toLocaleString() }}</span>
                </div>
                <div v-if="questChain.endTime" class="flex justify-between">
                    <span class="text-base-content/70">结束时间</span>
                    <span>{{ new Date(questChain.endTime * 1000).toLocaleString() }}</span>
                </div>
            </div>
        </div>

        <div v-if="questChain.desc || questChain.detail" class="card bg-base-100 border border-base-200 rounded p-3">
            <div class="text-sm">
                <div v-if="questChain.desc" class="mb-2">
                    <span class="text-base-content/70">描述: </span>
                    <span>{{ questChain.desc }}</span>
                </div>
                <div v-if="questChain.detail">
                    <span class="text-base-content/70">详情: </span>
                    <span>{{ questChain.detail }}</span>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">任务列表 ({{ questChain.quests.length }}个)</h3>
            <div class="space-y-3">
                <div
                    v-for="quest in questDetails"
                    :key="quest.id"
                    :ref="element => setQuestElement(quest.id, element)"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-all duration-300"
                    :class="{ 'quest-node-highlight': highlightedQuestMap[quest.id] }"
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="font-medium"
                            >任务: {{ formatStoryText(quest.details?.name || "?") }}
                            <span class="text-sm text-base-content/70">ID: {{ quest.id }}</span>
                            <span class="text-sm text-base-content/70 ml-2" v-if="quest.sr">区域: {{ getSubRegionName(quest.sr) }}</span>
                        </span>
                    </div>

                    <div v-if="quest.details?.desc" class="text-sm text-base-content/70 mb-2">
                        {{ formatStoryText(quest.details.desc) }}
                    </div>

                    <div v-if="shouldShowQuestNextOptions(quest)" class="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span class="text-base-content/60">任务跳转</span>
                        <template
                            v-for="nextOption in quest.nextOptions"
                            :key="`${quest.id}-next-${nextOption.condition}-${nextOption.targetId}`"
                        >
                            <span class="text-primary">→</span>
                            <button
                                type="button"
                                class="cursor-pointer rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary/80 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                                @click="jumpToQuest(nextOption.targetId)"
                            >
                                <span v-if="quest.hasBranchNext" class="mr-1 text-base-content/70">{{ nextOption.condition }}:</span>
                                {{ getQuestLabel(nextOption.targetId) }}
                            </button>
                        </template>
                    </div>

                    <div v-if="quest.details" class="text-sm space-y-2">
                        <div
                            v-for="node in quest.nodeChains"
                            :key="node.id"
                            :ref="element => setQuestNodeElement(getQuestNodeScopeKey(quest.id, node.id), element)"
                            class="p-2 bg-base-100 rounded border border-base-300 space-y-2 transition-all duration-300"
                            :class="{
                                'quest-node-highlight': highlightedQuestNodeMap[getQuestNodeScopeKey(quest.id, node.id)],
                            }"
                        >
                            <div class="text-sm text-base-content/70">
                                {{ formatStoryText(node.name) }} · {{ node.type }} · {{ node.id }}
                            </div>

                            <TransitionGroup name="dialogue-list" tag="div" v-if="node.chain.length" class="space-y-2">
                                <div
                                    v-for="item in node.chain"
                                    :key="item.dialogue.id"
                                    class="dialogue-card p-2 rounded bg-base-200/80 space-y-1"
                                >
                                    <div>
                                        <span
                                            class="font-medium text-primary mr-1"
                                            :title="`ID: ${item.dialogue.npc}`"
                                            v-if="item.dialogue.npc"
                                        >
                                            {{ getNPCName(item.dialogue.npc) }}:
                                        </span>
                                        <TypewriterText
                                            :text="item.dialogue.content"
                                            :trigger-key="`${quest.id}-${node.id}-${item.dialogue.id}`"
                                        />
                                    </div>

                                    <div v-if="item.dialogue.options?.length" class="space-y-2">
                                        <button
                                            v-for="(option, optionIndex) in item.dialogue.options"
                                            :key="option.id"
                                            type="button"
                                            class="group w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all duration-200"
                                            :class="
                                                item.selectedOption?.id === option.id
                                                    ? 'border-primary/80 bg-primary/8 shadow-sm'
                                                    : 'border-base-300/90 bg-base-100/60 hover:border-primary/40 hover:bg-base-100/80'
                                            "
                                            @click="selectOption(getQuestNodeScopeKey(quest.id, node.id), item.dialogue.id, option.id)"
                                        >
                                            <div class="flex items-start gap-2">
                                                <span
                                                    class="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold"
                                                    :class="
                                                        item.selectedOption?.id === option.id
                                                            ? 'border-primary bg-primary text-primary-content'
                                                            : 'border-base-300 text-base-content/70 group-hover:border-primary/40'
                                                    "
                                                >
                                                    {{ optionIndex + 1 }}
                                                </span>

                                                <div class="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
                                                    <span class="leading-4 text-base-content/90 whitespace-normal">
                                                        {{ formatStoryText(option.content) }}
                                                    </span>

                                                    <span
                                                        v-for="impression in getImpressionEntries(option)"
                                                        :key="`${option.id}-${impression.regionId}-${impression.typeLabel}-impr`"
                                                        class="rounded border px-1.5 py-0.5 text-xs leading-none"
                                                        :class="
                                                            impression.value > 0
                                                                ? 'border-success/40 bg-success/10 text-success'
                                                                : 'border-error/40 bg-error/10 text-error'
                                                        "
                                                    >
                                                        {{ $t(getRegionType(impression.regionId)) }}·{{ impression.typeLabel }}
                                                        {{ impression.value > 0 ? `+${impression.value}` : impression.value }}
                                                    </span>

                                                    <span
                                                        v-for="impressionCheck in getImpressionCheckEntries(option)"
                                                        :key="`${option.id}-${impressionCheck.regionId}-${impressionCheck.typeLabel}-impr-check`"
                                                        class="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-xs leading-none text-info"
                                                    >
                                                        印象检定 {{ $t(getRegionType(impressionCheck.regionId)) }}·{{
                                                            impressionCheck.typeLabel
                                                        }}
                                                        ≥
                                                        {{ impressionCheck.threshold }}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </TransitionGroup>

                            <div v-if="node.questions?.length" class="rounded bg-base-200/60 p-2 space-y-2">
                                <div class="text-sm font-semibold text-accent">侦探问答</div>

                                <div
                                    v-for="question in node.questions"
                                    :key="question.id"
                                    class="rounded border border-base-300 bg-base-100/70 p-2 space-y-1.5"
                                >
                                    <div class="text-sm font-medium">Q{{ question.id }} · {{ question.name }}</div>
                                    <div v-if="question.tips" class="text-xs text-base-content/70">提示：{{ question.tips }}</div>

                                    <div class="space-y-1">
                                        <div
                                            v-for="answer in getQuestionAnswers(node, question)"
                                            :key="answer.id"
                                            class="rounded border border-base-300/80 bg-base-100 px-2 py-1"
                                        >
                                            <div class="flex items-start gap-2">
                                                <img
                                                    v-if="answer.icon"
                                                    :src="`/imgs/webp/T_DetectiveMinigame_${answer.icon}.webp`"
                                                    :alt="answer.name"
                                                    class="size-8 rounded object-cover border border-base-300/80 bg-base-200"
                                                    loading="lazy"
                                                />

                                                <div class="min-w-0 flex-1">
                                                    <div class="text-xs font-medium">A{{ answer.id }} · {{ answer.name }}</div>
                                                    <div v-if="answer.desc" class="text-xs text-base-content/70">{{ answer.desc }}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div v-if="node.next?.length" class="flex flex-wrap items-center gap-1.5 text-xs">
                                <span class="text-base-content/60">节点跳转</span>
                                <template v-for="nextId in node.next" :key="`${node.id}-next-${nextId}`">
                                    <span class="text-primary">→</span>
                                    <button
                                        type="button"
                                        class="cursor-pointer rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary/80 hover:bg-primary/10 hover:border-primary/50 transition-colors"
                                        @click="jumpToQuestNode(quest.id, nextId)"
                                    >
                                        {{ getNodeLabel(quest.nodeMap, nextId) }}
                                    </button>
                                </template>
                            </div>

                            <div v-if="!node.chain.length && !node.questions?.length" class="text-base-content/70">
                                该节点暂无可展示内容
                            </div>
                        </div>
                    </div>

                    <div v-if="quest.reward" class="mt-2 pl-2">
                        <div class="text-sm font-medium mb-1">任务奖励:</div>
                        <RewardItem :reward="quest.reward as RewardItemType" />
                    </div>
                </div>
            </div>
        </div>

        <div v-if="questChain.reward?.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">奖励信息</h3>
            <div class="space-y-3">
                <div
                    v-for="(reward, index) in questChain.reward
                        .map(id => getRewardDetails(id))
                        .filter((rewardItem): rewardItem is RewardItemType => !!rewardItem)"
                    :key="reward.id"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors"
                >
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">#{{ index + 1 }} 奖励组 {{ reward.id }}</span>

                        <span
                            class="text-sm px-1.5 py-0.5 rounded"
                            :class="
                                getDropModeText(reward.m || '') === '独立'
                                    ? 'bg-success text-success-content'
                                    : 'bg-warning text-warning-content'
                            "
                        >
                            {{ getDropModeText(reward.m || "") }}
                            <span v-if="reward.totalP"> 总概率 {{ reward.totalP }}</span>
                        </span>
                    </div>

                    <RewardItem :reward="reward" />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.dialogue-card {
    transition:
        transform 220ms ease,
        opacity 220ms ease,
        box-shadow 220ms ease;
    box-shadow: 0 0 0 transparent;
}

.dialogue-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px hsl(var(--b3) / 0.25);
}

.dialogue-list-enter-active,
.dialogue-list-leave-active {
    transition: all 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.dialogue-list-enter-from,
.dialogue-list-leave-to {
    opacity: 0;
    transform: translateY(14px) scale(0.98);
    filter: blur(4px);
}

.dialogue-list-move {
    transition: transform 260ms ease;
}

.quest-node-highlight {
    border-color: hsl(var(--p));
    box-shadow:
        0 0 0 1px hsl(var(--p) / 0.35),
        0 0 0 8px hsl(var(--p) / 0.12);
    animation: quest-node-pulse 1.05s ease;
}

@keyframes quest-node-pulse {
    0% {
        transform: translateY(0) scale(1);
    }
    30% {
        transform: translateY(-1px) scale(1.01);
    }
    100% {
        transform: translateY(0) scale(1);
    }
}
</style>
