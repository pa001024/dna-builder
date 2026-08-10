<script lang="ts" setup>
import { computed, reactive } from "vue"
import { npcMap } from "@/data/d/npc.data"
import type { RougeDialogue, RougeDialogueOption, RougeStoryNode } from "@/data/d/rouge.data"
import { useSettingStore } from "@/store/setting"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

interface DialogueChainItem {
    dialogue: RougeDialogue
    selectedOption?: RougeDialogueOption
}

const props = defineProps<{
    nodes: RougeStoryNode[]
    eventName: string
}>()

const settingStore = useSettingStore()

const selectedOptionMap = reactive<Record<string, number>>({})

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
 * 获取说话人名称，优先使用导出器翻译好的 SpeakNpcName，
 * 无则回退为 NPC ID 解析（参考 quest 模块）。
 * @param dialogue 对话数据
 * @returns 说话人名称
 */
function getSpeakerName(dialogue: RougeDialogue): string {
    if (dialogue.speakerName) {
        return dialogue.speakerName
    }
    if (dialogue.npc === undefined) {
        return ""
    }
    const rawName = npcMap.get(dialogue.npc)?.name || `${dialogue.npc}`
    return formatStoryText(rawName)
}

/**
 * 生成节点分支状态作用域键。
 * @param nodeId 节点 ID
 * @returns 作用域键
 */
function getNodeScopeKey(nodeId: string): string {
    return `rouge-event-${props.eventName}-node-${nodeId}`
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
 * 读取当前对话已选选项，默认取第一个选项。
 * @param scopeKey 分支作用域键
 * @param dialogue 对话数据
 * @returns 当前选项
 */
function getSelectedOption(scopeKey: string, dialogue: RougeDialogue): RougeDialogueOption | undefined {
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
    startId: number | undefined,
    dialogueMap: Map<number, RougeDialogue>,
    visitedIds: Set<number>,
    chain: DialogueChainItem[],
    scopeKey: string
) {
    let currentId = startId

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
 * 收集对话及其嵌套选项，建立可查询映射。
 * @param dialogue 当前对话节点
 * @param dialogueMap 对话映射
 * @param incomingIds 入边节点集合
 */
function collectDialogueNode(dialogue: RougeDialogue, dialogueMap: Map<number, RougeDialogue>, incomingIds: Set<number>): void {
    dialogueMap.set(dialogue.id, dialogue)

    if (dialogue.next !== undefined) {
        incomingIds.add(dialogue.next)
    }

    for (const option of dialogue.options ?? []) {
        collectDialogueOption(option, dialogueMap, incomingIds)
    }
}

/**
 * 收集嵌套选项节点。
 * @param option 对话选项
 * @param dialogueMap 对话映射
 * @param incomingIds 入边节点集合
 */
function collectDialogueOption(option: RougeDialogueOption, dialogueMap: Map<number, RougeDialogue>, incomingIds: Set<number>): void {
    dialogueMap.set(option.id, option)

    if (option.next !== undefined) {
        incomingIds.add(option.next)
    }

    for (const childOption of option.options ?? []) {
        collectDialogueOption(childOption, dialogueMap, incomingIds)
    }
}

/**
 * 根据当前分支选择构建可展示对话链。
 * @param dialogues 原始对话数组
 * @param scopeKey 分支作用域键
 * @returns 对话链
 */
function buildDialogueChain(dialogues: RougeDialogue[], scopeKey: string): DialogueChainItem[] {
    if (!dialogues.length) {
        return []
    }

    const dialogueMap = new Map<number, RougeDialogue>()
    const incomingIds = new Set<number>()

    for (const dialogue of dialogues) {
        collectDialogueNode(dialogue, dialogueMap, incomingIds)
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
 * 处理对话选项选择。
 * @param scopeKey 分支作用域键
 * @param dialogueId 对话 ID
 * @param optionId 选项 ID
 */
function selectOption(scopeKey: string, dialogueId: number, optionId: number) {
    selectedOptionMap[getOptionStateKey(scopeKey, dialogueId)] = optionId
}

/**
 * 节点对话链列表。
 */
const nodeChains = computed<Array<{ node: RougeStoryNode; chain: DialogueChainItem[] }>>(() => {
    return props.nodes.map(node => ({
        node,
        chain: buildDialogueChain(node.dialogues ?? [], getNodeScopeKey(node.id)),
    }))
})
</script>

<template>
    <div class="space-y-3">
        <div v-for="{ node, chain } in nodeChains" :key="node.id" class="bg-base-100 rounded space-y-2">
            <div v-if="node.name && node.name !== '对话节点'" class="px-1 text-xs font-medium text-base-content/60">
                {{ formatStoryText(node.name) }}
            </div>

            <TransitionGroup name="dialogue-list" tag="div" v-if="chain.length" class="space-y-2">
                <DBDialogueCard
                    v-for="item in chain"
                    :key="`${node.id}-${item.dialogue.id}`"
                    :dialogue="item.dialogue"
                    :selected-option="item.selectedOption"
                    :trigger-key="`${props.eventName}-${node.id}-${item.dialogue.id}`"
                    :speaker-name="item.dialogue.npc !== undefined || item.dialogue.speakerName ? `${$t(getSpeakerName(item.dialogue))}:` : undefined"
                    :show-voice-button="!!item.dialogue.voice"
                    @select-option="payload => selectOption(getNodeScopeKey(node.id), payload.dialogueId, payload.optionId)"
                />
            </TransitionGroup>

            <div v-if="!chain.length" class="px-1 text-sm text-base-content/70">该节点暂无可展示内容</div>
        </div>

        <div v-if="!nodeChains.length" class="text-sm text-base-content/70">暂无剧情对话</div>
    </div>
</template>

<style scoped>
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
</style>
