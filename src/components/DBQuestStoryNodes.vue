<script lang="ts" setup>
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue"
import TypewriterText from "@/components/TypewriterText.vue"
import { npcMap } from "@/data/d/npc.data"
import {
    type DetectiveAnswer,
    type DetectiveQuestion,
    type Dialogue,
    type DialogueOption,
    getImprType,
    getRegionType,
    type QuestNode,
} from "@/data/d/quest.data"
import { useSettingStore } from "@/store/setting"
import { buildDialogueVoiceUrl } from "@/utils/dialogue-voice"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

interface DialogueChainItem {
    dialogue: Dialogue
    selectedOption?: DialogueOption
}

interface QuestNodeWithChain extends QuestNode {
    chain: DialogueChainItem[]
}

interface FlattenedQuestDialogueItem {
    dialogue: Dialogue
    nodeId: string
}

const props = defineProps<{
    questId: number
    nodes: QuestNode[]
    startIds?: string[]
}>()

const settingStore = useSettingStore()

const selectedOptionMap = reactive<Record<string, number>>({})
const highlightedQuestNodeMap = reactive<Record<string, boolean>>({})
const currentVoiceKey = ref<string | null>(null)
const isVoicePlaying = ref(false)
const dialogueAudioRef = ref<HTMLAudioElement | null>(null)
const autoPlayEnabled = ref(false)
const autoPlayCurrentIndex = ref(-1)
const lastManualPlayedDialogueKey = ref<string | null>(null)
const preloadedDialogueAudioMap = new Map<string, HTMLAudioElement>()
const dialogueElementMap = new Map<string, HTMLElement>()
const AUTO_PLAY_PRELOAD_AHEAD_COUNT = 2
const isRecoveringAutoPlayFromAudioError = ref(false)
const nicknameNpcIds = [...npcMap.entries()].filter(([, npc]) => npc.name === "{nickname}").map(([npcId]) => npcId)

const questNodeElementMap = new Map<string, HTMLElement>()
const nodeHighlightTimerMap = new Map<string, ReturnType<typeof setTimeout>>()

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
 * 生成任务对话唯一键。
 * @param nodeId 节点 ID
 * @param dialogue 对话条目
 * @returns 对话唯一键
 */
function getQuestDialogueKey(nodeId: string, dialogue: Dialogue): string {
    return `${nodeId}-${dialogue.id}-${dialogue.voice || ""}`
}

/**
 * 注册对话卡片 DOM 引用，供自动播放滚动定位使用。
 * @param dialogueKey 对话唯一键
 * @param element 对话卡片元素
 */
function setDialogueElement(dialogueKey: string, element: Element | ComponentPublicInstance | null) {
    if (!element) {
        dialogueElementMap.delete(dialogueKey)
        return
    }

    const targetElement = element instanceof Element ? element : (element.$el as Element | null)
    if (!targetElement) {
        dialogueElementMap.delete(dialogueKey)
        return
    }

    dialogueElementMap.set(dialogueKey, targetElement as HTMLElement)
}

/**
 * 滚动到目标对话卡片。
 * @param dialogueKey 对话唯一键
 */
function scrollToDialogue(dialogueKey: string): void {
    const targetElement = dialogueElementMap.get(dialogueKey)
    if (!targetElement) {
        return
    }

    nextTick(() => {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" })
    })
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
 * 获取节点所属的可滚动容器，找不到则回退到窗口滚动。
 * @param element 目标节点元素
 * @returns 可滚动容器
 */
function getScrollableContainer(element: HTMLElement): HTMLElement | Window {
    if (typeof window === "undefined") {
        return element
    }

    let currentParent: HTMLElement | null = element.parentElement
    while (currentParent) {
        const { overflowY } = window.getComputedStyle(currentParent)
        const canScrollY = /auto|scroll|overlay/.test(overflowY) && currentParent.scrollHeight > currentParent.clientHeight
        if (canScrollY) {
            return currentParent
        }

        currentParent = currentParent.parentElement
    }

    return window
}

/**
 * 判断滚动容器是否为 Window。
 * @param container 滚动容器
 * @returns 是否为 Window
 */
function isWindowContainer(container: HTMLElement | Window): container is Window {
    if (typeof Window === "undefined") {
        return false
    }

    return container instanceof Window
}

/**
 * 判断节点高度是否超过当前滚动容器高度。
 * @param element 目标节点元素
 * @param container 滚动容器
 * @returns 是否超出容器高度
 */
function isNodeHigherThanContainer(element: HTMLElement, container: HTMLElement | Window): boolean {
    const elementHeight = element.getBoundingClientRect().height
    if (isWindowContainer(container)) {
        return elementHeight > window.innerHeight
    }

    return elementHeight > container.clientHeight
}

/**
 * 将目标节点按顶部对齐滚动，确保超高节点顶部可见。
 * @param element 目标节点元素
 * @param container 滚动容器
 */
function scrollNodeToTop(element: HTMLElement, container: HTMLElement | Window) {
    const topOffset = 12
    if (isWindowContainer(container)) {
        const elementRect = element.getBoundingClientRect()
        window.scrollTo({
            top: window.scrollY + elementRect.top - topOffset,
            behavior: "smooth",
        })
        return
    }

    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    container.scrollTo({
        top: container.scrollTop + (elementRect.top - containerRect.top) - topOffset,
        behavior: "smooth",
    })
}

/**
 * 跳转到目标任务节点并触发高亮。
 * @param nodeId 节点 ID
 */
function jumpToQuestNode(nodeId: string) {
    const nodeKey = getQuestNodeScopeKey(props.questId, nodeId)
    const targetElement = questNodeElementMap.get(nodeKey)
    if (!targetElement) {
        return
    }

    const scrollContainer = getScrollableContainer(targetElement)
    if (isNodeHigherThanContainer(targetElement, scrollContainer)) {
        scrollNodeToTop(targetElement, scrollContainer)
    } else {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" })
    }

    triggerQuestNodeHighlight(nodeKey)
}

onBeforeUnmount(() => {
    for (const timer of nodeHighlightTimerMap.values()) {
        clearTimeout(timer)
    }
    nodeHighlightTimerMap.clear()
    questNodeElementMap.clear()
    dialogueElementMap.clear()
    stopAutoPlay()
    stopDialogueVoicePlayback()
    clearPreloadedDialogueVoices()
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
 * @param startIds 起始节点 ID 列表
 * @returns 带分支链的节点
 */
function buildQuestNodeChains(questId: number, nodes: QuestNode[], startIds?: string[]): QuestNodeWithChain[] {
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

    const explicitStartNodeIds = (startIds ?? []).filter(startId => nodeMap.has(startId))
    const fallbackStartNodeIds = nodes.filter(node => !incomingNodeIdSet.has(node.id)).map(node => node.id)
    const initialNodeIds = explicitStartNodeIds.length
        ? explicitStartNodeIds
        : fallbackStartNodeIds.length
          ? fallbackStartNodeIds
          : nodes.map(node => node.id)

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
 * @param nodeId 目标节点 ID
 * @returns 节点标签
 */
function getNodeLabel(nodeId: string): string {
    const label = nodeDisplayLabelMap.value.get(nodeId)
    if (!label) {
        return `未知节点 ${nodeId}`
    }

    return label
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
 * 生成对话语音状态键，用于识别当前播放条目。
 * @param dialogue 对话条目
 * @param nodeId 节点 ID
 * @returns 播放状态键
 */
function getDialogueVoiceKey(dialogue: Dialogue, nodeId: string): string {
    return getQuestDialogueKey(nodeId, dialogue)
}

/**
 * 构建对话语音播放地址。
 * @param dialogue 对话条目
 * @returns 语音 URL
 */
function getDialogueVoiceUrl(dialogue: Dialogue): string {
    return buildDialogueVoiceUrl({
        voice: dialogue.voice,
        text: dialogue.content,
        npcId: dialogue.npc,
        forceGenderNpcIds: nicknameNpcIds,
        language: settingStore.lang,
        gender: settingStore.protagonistGender,
        gender2: settingStore.protagonistGender2,
    })
}

/**
 * 记录用户手动播放的对话键，用于自动播放起点定位。
 * @param dialogueKey 对话唯一键
 */
function markManualPlayedDialogue(dialogueKey: string): void {
    lastManualPlayedDialogueKey.value = dialogueKey
}

/**
 * 根据对话键查找当前链路中的索引。
 * @param dialogueKey 对话唯一键
 * @returns 索引，找不到返回 -1
 */
function getDialogueIndexByKey(dialogueKey: string | null): number {
    if (!dialogueKey) {
        return -1
    }

    return flattenedDialogueChain.value.findIndex(item => getQuestDialogueKey(item.nodeId, item.dialogue) === dialogueKey)
}

/**
 * 根据当前语音状态键反查对话索引。
 * @returns 对话索引，找不到返回 -1
 */
function getCurrentDialogueIndexByVoiceKey(): number {
    if (!currentVoiceKey.value) {
        return -1
    }

    return flattenedDialogueChain.value.findIndex(item => getQuestDialogueKey(item.nodeId, item.dialogue) === currentVoiceKey.value)
}

/**
 * 从指定索引开始查找下一个可播放对话。
 * @param startIndex 起始索引
 * @returns 可播放索引，找不到返回 -1
 */
function findNextPlayableDialogueIndex(startIndex: number): number {
    for (let index = Math.max(0, startIndex); index < flattenedDialogueChain.value.length; index += 1) {
        const targetDialogue = flattenedDialogueChain.value[index].dialogue
        if (getDialogueVoiceUrl(targetDialogue)) {
            return index
        }
    }

    return -1
}

/**
 * 清理自动播放预加载缓存，释放音频对象引用。
 */
function clearPreloadedDialogueVoices(): void {
    for (const preloadAudio of preloadedDialogueAudioMap.values()) {
        preloadAudio.pause()
        preloadAudio.removeAttribute("src")
        preloadAudio.load()
    }
    preloadedDialogueAudioMap.clear()
}

/**
 * 预加载指定索引的对话语音。
 * @param index 对话索引
 */
function preloadDialogueVoiceByIndex(index: number): void {
    if (!autoPlayEnabled.value) {
        return
    }

    const targetItem = flattenedDialogueChain.value[index]
    if (!targetItem) {
        return
    }

    const voiceUrl = getDialogueVoiceUrl(targetItem.dialogue)
    if (!voiceUrl || preloadedDialogueAudioMap.has(voiceUrl)) {
        return
    }

    const preloadAudio = new Audio()
    preloadAudio.preload = "auto"
    preloadAudio.src = voiceUrl
    preloadAudio.load()
    preloadedDialogueAudioMap.set(voiceUrl, preloadAudio)
}

/**
 * 预加载当前索引后续的可播放语音，降低自动连播切换卡顿。
 * @param currentIndex 当前对话索引
 * @param preloadCount 预加载数量
 */
function preloadUpcomingDialogueVoices(currentIndex: number, preloadCount = AUTO_PLAY_PRELOAD_AHEAD_COUNT): void {
    if (!autoPlayEnabled.value) {
        return
    }

    let loadedCount = 0
    for (let index = currentIndex + 1; index < flattenedDialogueChain.value.length; index += 1) {
        const targetDialogue = flattenedDialogueChain.value[index].dialogue
        if (!getDialogueVoiceUrl(targetDialogue)) {
            continue
        }

        preloadDialogueVoiceByIndex(index)
        loadedCount += 1
        if (loadedCount >= preloadCount) {
            break
        }
    }
}

/**
 * 自动播放失败恢复：从指定索引开始尝试后续可播放条目，直到成功或耗尽。
 * @param startIndex 起始索引
 */
async function recoverAutoPlayAfterFailure(startIndex: number): Promise<void> {
    if (!autoPlayEnabled.value || isRecoveringAutoPlayFromAudioError.value) {
        return
    }

    isRecoveringAutoPlayFromAudioError.value = true
    try {
        let nextPlayableIndex = findNextPlayableDialogueIndex(startIndex)
        while (nextPlayableIndex !== -1 && autoPlayEnabled.value) {
            const played = await playDialogueByIndex(nextPlayableIndex, true)
            if (played) {
                return
            }

            nextPlayableIndex = findNextPlayableDialogueIndex(nextPlayableIndex + 1)
        }

        stopAutoPlay()
    } finally {
        isRecoveringAutoPlayFromAudioError.value = false
    }
}

/**
 * 播放指定索引的对话语音。
 * @param index 对话索引
 * @param skipRecovery 是否跳过自动失败恢复（供恢复流程内部调用）
 * @returns 是否成功触发播放
 */
async function playDialogueByIndex(index: number, skipRecovery = false): Promise<boolean> {
    const audio = dialogueAudioRef.value
    const targetItem = flattenedDialogueChain.value[index]
    if (!audio || !targetItem) {
        return false
    }

    const voiceUrl = getDialogueVoiceUrl(targetItem.dialogue)
    if (!voiceUrl) {
        return false
    }

    const voiceKey = getQuestDialogueKey(targetItem.nodeId, targetItem.dialogue)
    autoPlayCurrentIndex.value = index
    currentVoiceKey.value = voiceKey
    scrollToDialogue(voiceKey)
    preloadUpcomingDialogueVoices(index)

    audio.pause()
    audio.currentTime = 0
    audio.src = voiceUrl

    try {
        await audio.play()
        return true
    } catch (error) {
        currentVoiceKey.value = null
        isVoicePlaying.value = false
        console.error("任务剧情语音播放失败:", error)

        if (autoPlayEnabled.value && !skipRecovery) {
            void recoverAutoPlayAfterFailure(index + 1)
        }
        return false
    }
}

/**
 * 启动自动播放。
 */
async function startAutoPlay(): Promise<void> {
    if (!hasPlayableDialogue.value) {
        autoPlayEnabled.value = false
        return
    }

    const currentIndex = getCurrentDialogueIndexByVoiceKey()
    if (currentIndex !== -1 && isVoicePlaying.value) {
        autoPlayCurrentIndex.value = currentIndex
        scrollToDialogue(flattenedDialogueChain.value[currentIndex].key)
        preloadUpcomingDialogueVoices(currentIndex)
        return
    }

    const manualAnchorIndex = getDialogueIndexByKey(lastManualPlayedDialogueKey.value)
    const startFromIndex = manualAnchorIndex !== -1 ? manualAnchorIndex + 1 : 0
    const startIndex = findNextPlayableDialogueIndex(startFromIndex)
    if (startIndex === -1) {
        autoPlayEnabled.value = false
        return
    }

    await playDialogueByIndex(startIndex)
}

/**
 * 停止自动播放并清空自动播放进度。
 */
function stopAutoPlay(): void {
    autoPlayEnabled.value = false
    autoPlayCurrentIndex.value = -1
    clearPreloadedDialogueVoices()
}

/**
 * 自动播放开关变更处理。
 */
function handleAutoPlaySwitchChange(): void {
    if (!autoPlayEnabled.value) {
        stopAutoPlay()
        return
    }

    void startAutoPlay()
}

/**
 * 停止当前对话语音播放并重置状态。
 */
function stopDialogueVoicePlayback(): void {
    const audio = dialogueAudioRef.value
    if (!audio) {
        return
    }
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
    currentVoiceKey.value = null
    isVoicePlaying.value = false
    autoPlayCurrentIndex.value = -1
}

/**
 * 切换对话语音播放状态（懒加载，点击时才加载音频）。
 * @param dialogue 对话条目
 * @param nodeId 节点 ID
 */
async function toggleDialogueVoicePlayback(dialogue: Dialogue, nodeId: string): Promise<void> {
    const voiceKey = getQuestDialogueKey(nodeId, dialogue)
    markManualPlayedDialogue(voiceKey)

    const audio = dialogueAudioRef.value
    if (!audio) {
        return
    }

    const voiceUrl = getDialogueVoiceUrl(dialogue)
    if (!voiceUrl) {
        return
    }

    if (currentVoiceKey.value === voiceKey) {
        const currentIndex = getCurrentDialogueIndexByVoiceKey()
        if (currentIndex !== -1) {
            autoPlayCurrentIndex.value = currentIndex
            scrollToDialogue(voiceKey)
        }

        if (audio.paused) {
            try {
                await audio.play()
            } catch (error) {
                console.error("任务剧情语音播放失败:", error)
            }
        } else {
            audio.pause()
        }
        return
    }

    const targetIndex = flattenedDialogueChain.value.findIndex(item => {
        return getQuestDialogueKey(item.nodeId, item.dialogue) === voiceKey
    })
    if (targetIndex === -1) {
        return
    }

    await playDialogueByIndex(targetIndex)
}

/**
 * 播放器播放事件回调。
 */
function handleDialogueVoicePlay(): void {
    isVoicePlaying.value = true
}

/**
 * 播放器暂停事件回调。
 */
function handleDialogueVoicePause(): void {
    isVoicePlaying.value = false
}

/**
 * 播放器结束事件回调。
 */
function handleDialogueVoiceEnded(): void {
    isVoicePlaying.value = false
    currentVoiceKey.value = null

    if (!autoPlayEnabled.value) {
        return
    }

    const nextPlayableIndex = findNextPlayableDialogueIndex(autoPlayCurrentIndex.value + 1)
    if (nextPlayableIndex === -1) {
        stopAutoPlay()
        return
    }

    void playDialogueByIndex(nextPlayableIndex)
}

/**
 * 播放器加载失败事件回调。
 */
function handleDialogueVoiceError(): void {
    currentVoiceKey.value = null
    isVoicePlaying.value = false

    if (!autoPlayEnabled.value) {
        return
    }

    void recoverAutoPlayAfterFailure(autoPlayCurrentIndex.value + 1)
}

/**
 * 计算节点分支链。
 */
const questNodeChains = computed<QuestNodeWithChain[]>(() => {
    return buildQuestNodeChains(props.questId, props.nodes, props.startIds)
})

/**
 * 扁平化任务节点中的对话链，便于跨节点顺序自动播放。
 */
const flattenedDialogueChain = computed<Array<FlattenedQuestDialogueItem & { key: string }>>(() => {
    const result: Array<FlattenedQuestDialogueItem & { key: string }> = []
    for (const node of questNodeChains.value) {
        for (const item of node.chain) {
            result.push({
                key: getQuestDialogueKey(node.id, item.dialogue),
                dialogue: item.dialogue,
                nodeId: node.id,
            })
        }
    }

    return result
})

/**
 * 是否存在可播放语音对话。
 */
const hasPlayableDialogue = computed(() => {
    return flattenedDialogueChain.value.some(item => !!getDialogueVoiceUrl(item.dialogue))
})

/**
 * 节点展示标签映射。
 * 当展示标签重复时，为重复项追加 # 序号，避免跳转按钮无法区分。
 */
const nodeDisplayLabelMap = computed(() => {
    const groupedNodeMap = new Map<string, QuestNodeWithChain[]>()
    for (const node of questNodeChains.value) {
        const baseLabel = `${formatStoryText(node.name)} (${node.type})`
        const groupedNodes = groupedNodeMap.get(baseLabel) ?? []
        groupedNodes.push(node)
        groupedNodeMap.set(baseLabel, groupedNodes)
    }

    const labelMap = new Map<string, string>()
    for (const [baseLabel, groupedNodes] of groupedNodeMap.entries()) {
        const hasDuplicate = groupedNodes.length > 1
        for (const [index, node] of groupedNodes.entries()) {
            labelMap.set(node.id, hasDuplicate ? `${baseLabel} #${index + 1}` : baseLabel)
        }
    }

    return labelMap
})

watch(
    () => [settingStore.lang, settingStore.protagonistGender, settingStore.protagonistGender2],
    () => {
        stopAutoPlay()
        stopDialogueVoicePlayback()
    }
)

watch(flattenedDialogueChain, () => {
    clearPreloadedDialogueVoices()

    if (!autoPlayEnabled.value) {
        return
    }

    void startAutoPlay()
})
</script>

<template>
    <div class="text-sm space-y-2">
        <div class="flex items-center justify-end">
            <label class="flex items-center gap-2 text-xs text-base-content/80 select-none">
                <span>自动播放</span>
                <input
                    v-model="autoPlayEnabled"
                    type="checkbox"
                    class="toggle toggle-primary toggle-sm"
                    :disabled="!hasPlayableDialogue"
                    @change="handleAutoPlaySwitchChange"
                />
            </label>
        </div>

        <div
            v-for="node in questNodeChains"
            :key="node.id"
            :ref="element => setQuestNodeElement(getQuestNodeScopeKey(questId, node.id), element)"
            class="p-2 bg-base-100 rounded border border-base-300 space-y-2 transition-all duration-300"
            :class="{
                'quest-node-highlight': highlightedQuestNodeMap[getQuestNodeScopeKey(questId, node.id)],
            }"
        >
            <div class="text-sm text-base-content/70">{{ getNodeLabel(node.id) }} · {{ node.id }}</div>

            <TransitionGroup name="dialogue-list" tag="div" v-if="node.chain.length" class="space-y-2">
                <div
                    v-for="item in node.chain"
                    :key="getQuestDialogueKey(node.id, item.dialogue)"
                    :ref="element => setDialogueElement(getQuestDialogueKey(node.id, item.dialogue), element)"
                    class="dialogue-card p-2 rounded bg-base-200/80 space-y-1"
                    :class="{ 'dialogue-card-playing': isVoicePlaying && currentVoiceKey === getDialogueVoiceKey(item.dialogue, node.id) }"
                >
                    <div class="space-y-1">
                        <div class="flex items-center gap-2">
                            <span
                                class="font-medium text-primary mr-1 min-w-0 truncate"
                                :title="`ID: ${item.dialogue.npc}`"
                                v-if="item.dialogue.npc"
                            >
                                {{ getNPCName(item.dialogue.npc) }}:
                            </span>
                            <button
                                v-if="item.dialogue.voice"
                                type="button"
                                class="btn btn-ghost btn-xs shrink-0 ml-auto"
                                @click="toggleDialogueVoicePlayback(item.dialogue, node.id)"
                            >
                                <Icon
                                    :icon="
                                        currentVoiceKey === getDialogueVoiceKey(item.dialogue, node.id) && isVoicePlaying
                                            ? 'ri:pause-circle-line'
                                            : 'ri:play-circle-line'
                                    "
                                />
                            </button>
                        </div>
                        <TypewriterText :text="item.dialogue.content" :trigger-key="`${questId}-${node.id}-${item.dialogue.id}`" />
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
                            @click="selectOption(getQuestNodeScopeKey(questId, node.id), item.dialogue.id, option.id)"
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
                                        印象检定 {{ $t(getRegionType(impressionCheck.regionId)) }}·{{ impressionCheck.typeLabel }}
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
                        @click="jumpToQuestNode(nextId)"
                    >
                        {{ getNodeLabel(nextId) }}
                    </button>
                </template>
            </div>

            <div v-if="!node.chain.length && !node.questions?.length" class="text-base-content/70">该节点暂无可展示内容</div>
        </div>
        <audio
            ref="dialogueAudioRef"
            class="hidden"
            :preload="autoPlayEnabled ? 'auto' : 'none'"
            @ended="handleDialogueVoiceEnded"
            @error="handleDialogueVoiceError"
            @pause="handleDialogueVoicePause"
            @play="handleDialogueVoicePlay"
        />
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
    box-shadow: 0 8px 24px color-mix(in srgb, var(--color-base-content) 16%, transparent);
}

.dialogue-card-playing {
    border: 1px solid color-mix(in srgb, var(--color-primary) 60%, transparent);
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-base-100));
    box-shadow:
        0 0 0 1px color-mix(in srgb, var(--color-primary) 24%, transparent),
        0 10px 24px color-mix(in srgb, var(--color-primary) 18%, transparent);
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
    border-color: color-mix(in srgb, var(--color-primary) 70%, transparent);
    box-shadow:
        0 0 0 1px color-mix(in srgb, var(--color-primary) 35%, transparent),
        0 0 0 8px color-mix(in srgb, var(--color-primary) 12%, transparent);
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
