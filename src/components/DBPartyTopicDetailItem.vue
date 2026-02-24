<script lang="ts" setup>
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue"
import TypewriterText from "@/components/TypewriterText.vue"
import { charMap, LeveledChar } from "@/data"
import { npcMap } from "@/data/d/npc.data"
import type { PartyTopic } from "@/data/d/partytopic.data"
import { type Dialogue, type DialogueOption, getImprType, getRegionType } from "@/data/d/quest.data"
import { questChainMap } from "@/data/d/questchain.data"
import { resourceMap } from "@/data/d/resource.data"
import { useSettingStore } from "@/store/setting"
import { buildDialogueVoiceUrl } from "@/utils/dialogue-voice"
import { getRewardDetails } from "@/utils/reward-utils"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

interface DialogueChainItem {
    dialogue: Dialogue
    selectedOption?: DialogueOption
}

interface ConsumeEntry {
    amount: number
    displayName: string
    resourceId: number | string
}

const props = defineProps<{
    partyTopic: PartyTopic
}>()

const settingStore = useSettingStore()
const selectedOptionMap = reactive<Record<string, number>>({})
const currentVoiceKey = ref<string | null>(null)
const isVoicePlaying = ref(false)
const dialogueAudioRef = ref<HTMLAudioElement | null>(null)
const autoPlayEnabled = ref(false)
const autoPlayCurrentIndex = ref(-1)
const dialogueElementMap = new Map<number, HTMLElement>()
const preloadedDialogueAudioMap = new Map<string, HTMLAudioElement>()
const AUTO_PLAY_PRELOAD_AHEAD_COUNT = 2
const lastManualPlayedDialogueId = ref<number | null>(null)
const isRecoveringAutoPlayFromAudioError = ref(false)
const nicknameNpcIds = [...npcMap.entries()].filter(([, npc]) => npc.name === "{nickname}").map(([npcId]) => npcId)

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
 * 获取光阴集前置任务链信息。
 */
const conditionQuestChain = computed(() => {
    if (!props.partyTopic.conditionId) {
        return undefined
    }

    return questChainMap.get(props.partyTopic.conditionId)
})

/**
 * 将 consume 字段转换为可展示的资源列表。
 */
const consumeEntries = computed<ConsumeEntry[]>(() => {
    return Object.entries(props.partyTopic.consume || {})
        .map(([resourceId, amount]) => {
            const parsedResourceId = Number(resourceId)
            const resolvedResource = Number.isFinite(parsedResourceId)
                ? resourceMap.get(parsedResourceId) || resourceMap.get(resourceId)
                : resourceMap.get(resourceId)

            return {
                amount,
                displayName: resolvedResource?.name || resourceId,
                resourceId: Number.isFinite(parsedResourceId) ? parsedResourceId : resourceId,
            }
        })
        .sort((left, right) => `${left.resourceId}`.localeCompare(`${right.resourceId}`, "zh-Hans-CN", { numeric: true }))
})

/**
 * 构建当前光阴集可展示的对话链。
 */
const dialogueChain = computed(() => {
    return buildDialogueChain(props.partyTopic.dialogues ?? [], getPartyTopicScopeKey(props.partyTopic.id))
})
const hasPlayableDialogue = computed(() => {
    return dialogueChain.value.some(item => {
        return !!getDialogueVoiceUrl(item.dialogue)
    })
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
 * 生成光阴集分支状态作用域键。
 * @param partyTopicId 光阴集 ID
 * @returns 作用域键
 */
function getPartyTopicScopeKey(partyTopicId: number): string {
    return `party-topic-${partyTopicId}`
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
 * 读取当前对话已选选项，默认返回第一项。
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
 * 从指定起点拼接对话链，并防止循环引用导致死循环。
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
 * 切换对话选项。
 * @param dialogueId 对话 ID
 * @param optionId 选项 ID
 */
function selectOption(dialogueId: number, optionId: number) {
    const scopeKey = getPartyTopicScopeKey(props.partyTopic.id)
    const optionStateKey = getOptionStateKey(scopeKey, dialogueId)
    selectedOptionMap[optionStateKey] = optionId
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

    return targetCharacter.名称
}

/**
 * 获取说话 NPC 名称。
 * @param npcId NPC ID
 * @returns NPC 名称
 */
function getSpeakerName(npcId: number | undefined): string {
    if (npcId === undefined) {
        return "旁白"
    }

    const rawName = npcMap.get(npcId)?.name || `${npcId}`
    return formatStoryText(rawName)
}

/**
 * 获取说话 NPC 头像。
 * @param npcId NPC ID
 * @returns 头像地址
 */
function getSpeakerAvatar(npcId: number | undefined): string {
    if (npcId === undefined) {
        return "/imgs/webp/T_Head_Empty.webp"
    }

    const npc = npcMap.get(npcId)
    if (npc?.icon) {
        return `/imgs/webp/T_Head_${npc.icon}.webp`
    }

    if (npc?.charId) {
        return LeveledChar.idToUrl(npc.charId)
    }

    if (npc?.name) {
        if (npc.name === "{nickname}") {
            return storyTextConfig.value.gender === "female" ? "/imgs/webp/T_Head_Nvzhu.webp" : "/imgs/webp/T_Head_Nanzhu.webp"
        }
        const charId = charMap.get(npc.name)?.id
        return LeveledChar.idToUrl(charId || npc.charId)
    }

    return "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 生成对话语音状态键，用于识别当前播放条目。
 * @param dialogue 对话条目
 * @returns 播放状态键
 */
function getDialogueVoiceKey(dialogue: Dialogue): string {
    return `${dialogue.id}-${dialogue.voice || ""}`
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
 * 注册对话卡片 DOM 引用，供自动播放滚动定位使用。
 * @param dialogueId 对话 ID
 * @param element 对话卡片元素
 */
function setDialogueElement(dialogueId: number, element: Element | ComponentPublicInstance | null) {
    if (!element) {
        dialogueElementMap.delete(dialogueId)
        return
    }

    const targetElement = element instanceof Element ? element : (element.$el as Element | null)
    if (!targetElement) {
        dialogueElementMap.delete(dialogueId)
        return
    }

    dialogueElementMap.set(dialogueId, targetElement as HTMLElement)
}

/**
 * 滚动到目标对话卡片。
 * @param dialogueId 对话 ID
 */
function scrollToDialogue(dialogueId: number): void {
    const targetElement = dialogueElementMap.get(dialogueId)
    if (!targetElement) {
        return
    }

    nextTick(() => {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" })
    })
}

/**
 * 从指定索引开始查找下一个可播放对话。
 * @param startIndex 起始索引
 * @returns 可播放索引，找不到返回 -1
 */
function findNextPlayableDialogueIndex(startIndex: number): number {
    for (let index = Math.max(0, startIndex); index < dialogueChain.value.length; index += 1) {
        const targetDialogue = dialogueChain.value[index].dialogue
        if (getDialogueVoiceUrl(targetDialogue)) {
            return index
        }
    }

    return -1
}

/**
 * 根据当前语音状态键反查对话索引。
 * @returns 对话索引，找不到返回 -1
 */
function getCurrentDialogueIndexByVoiceKey(): number {
    if (!currentVoiceKey.value) {
        return -1
    }

    return dialogueChain.value.findIndex(item => getDialogueVoiceKey(item.dialogue) === currentVoiceKey.value)
}

/**
 * 记录用户手动播放的对话 ID，用于自动播放起点定位。
 * @param dialogueId 对话 ID
 */
function markManualPlayedDialogue(dialogueId: number): void {
    lastManualPlayedDialogueId.value = dialogueId
}

/**
 * 根据对话 ID 查找当前链路中的索引。
 * @param dialogueId 对话 ID
 * @returns 索引，找不到返回 -1
 */
function getDialogueIndexById(dialogueId: number | null): number {
    if (dialogueId === null) {
        return -1
    }

    return dialogueChain.value.findIndex(item => item.dialogue.id === dialogueId)
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

    const targetItem = dialogueChain.value[index]
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
    for (let index = currentIndex + 1; index < dialogueChain.value.length; index += 1) {
        const targetDialogue = dialogueChain.value[index].dialogue
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
    const targetItem = dialogueChain.value[index]
    if (!audio || !targetItem) {
        return false
    }

    const targetDialogue = targetItem.dialogue
    const voiceUrl = getDialogueVoiceUrl(targetDialogue)
    if (!voiceUrl) {
        return false
    }

    autoPlayCurrentIndex.value = index
    currentVoiceKey.value = getDialogueVoiceKey(targetDialogue)
    scrollToDialogue(targetDialogue.id)

    audio.pause()
    audio.currentTime = 0
    audio.src = voiceUrl
    preloadUpcomingDialogueVoices(index)

    try {
        await audio.play()
        return true
    } catch (error) {
        currentVoiceKey.value = null
        isVoicePlaying.value = false
        console.error("光阴集语音播放失败:", error)

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
        scrollToDialogue(dialogueChain.value[currentIndex].dialogue.id)
        preloadUpcomingDialogueVoices(currentIndex)
        return
    }

    const manualAnchorIndex = getDialogueIndexById(lastManualPlayedDialogueId.value)
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
 */
async function toggleDialogueVoicePlayback(dialogue: Dialogue): Promise<void> {
    markManualPlayedDialogue(dialogue.id)

    const audio = dialogueAudioRef.value
    if (!audio) {
        return
    }

    const voiceUrl = getDialogueVoiceUrl(dialogue)
    if (!voiceUrl) {
        return
    }

    const voiceKey = getDialogueVoiceKey(dialogue)
    if (currentVoiceKey.value === voiceKey) {
        const currentIndex = getCurrentDialogueIndexByVoiceKey()
        if (currentIndex !== -1) {
            autoPlayCurrentIndex.value = currentIndex
            scrollToDialogue(dialogue.id)
        }

        if (audio.paused) {
            try {
                await audio.play()
            } catch (error) {
                console.error("光阴集语音播放失败:", error)
            }
        } else {
            audio.pause()
        }
        return
    }

    const targetIndex = dialogueChain.value.findIndex(item => item.dialogue.id === dialogue.id)
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
 * 提取选项中的印象变化条目。
 * @param option 对话选项
 * @returns 印象条目列表
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

const partyTopicReward = computed(() => getRewardDetails(props.partyTopic.reward))

watch(
    () => [settingStore.lang, settingStore.protagonistGender, settingStore.protagonistGender2],
    () => {
        stopAutoPlay()
        stopDialogueVoicePlayback()
    }
)

watch(dialogueChain, () => {
    clearPreloadedDialogueVoices()

    if (!autoPlayEnabled.value) {
        return
    }

    void startAutoPlay()
})

onBeforeUnmount(() => {
    stopAutoPlay()
    stopDialogueVoicePlayback()
    dialogueElementMap.clear()
    clearPreloadedDialogueVoices()
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
                <img
                    :src="LeveledChar.idToUrl(partyTopic.charId)"
                    alt=""
                    class="size-10 rounded-lg object-cover bg-base-200"
                    loading="lazy"
                />

                <div class="min-w-0">
                    <SRouterLink :to="`/db/partytopic/${partyTopic.id}`" class="text-lg font-bold link link-primary line-clamp-1">
                        {{ formatStoryText(partyTopic.name) }}
                    </SRouterLink>
                    <div class="text-sm text-base-content/70">ID: {{ partyTopic.id }}</div>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">基础信息</h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div class="flex items-start justify-between gap-2">
                    <span class="text-base-content/70">角色</span>
                    <SRouterLink :to="`/db/char/${partyTopic.charId}`" class="text-right link link-primary">
                        {{ getCharacterName(partyTopic.charId) }}
                    </SRouterLink>
                </div>

                <div v-if="partyTopic.conditionId" class="flex items-start justify-between gap-2">
                    <span class="text-base-content/70">前置任务链</span>
                    <SRouterLink :to="`/db/questchain/${partyTopic.conditionId}`" class="text-right link link-primary">
                        {{
                            conditionQuestChain
                                ? `${formatStoryText(conditionQuestChain.name)} (${partyTopic.conditionId})`
                                : partyTopic.conditionId
                        }}
                    </SRouterLink>
                </div>

                <div class="flex items-start justify-between gap-2">
                    <span class="text-base-content/70">奖励 ID</span>
                    <span class="text-right">{{ partyTopic.reward }}</span>
                </div>
            </div>

            <div v-if="partyTopic.desc" class="mt-3 p-2 rounded bg-base-200/70 text-sm leading-6">
                <div class="text-xs text-base-content/70 mb-1">描述</div>
                <div>{{ formatStoryText(partyTopic.desc) }}</div>
            </div>

            <div v-if="partyTopic.memoryDesc" class="mt-2 p-2 rounded bg-base-200/70 text-sm leading-6">
                <div class="text-xs text-base-content/70 mb-1">{{ formatStoryText(partyTopic.memoryName || "无") }}</div>
                <div>{{ formatStoryText(partyTopic.memoryDesc) }}</div>
            </div>
        </div>
        <div v-if="partyTopicReward" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">奖励</h3>
            <div>
                <RewardItem :reward="partyTopicReward" />
            </div>
        </div>

        <div v-if="consumeEntries.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">消耗资源</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <ResourceCostItem
                    v-for="consumeItem in consumeEntries"
                    :key="`consume-${partyTopic.id}-${consumeItem.resourceId}`"
                    :name="consumeItem.displayName"
                    :value="consumeItem.amount"
                />
            </div>
        </div>

        <div v-if="partyTopic.dialogues?.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <div class="mb-2 flex items-center justify-between gap-3">
                <h3 class="font-bold">剧情对话 ({{ partyTopic.dialogues.length }} 条)</h3>
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

            <TransitionGroup v-if="dialogueChain.length" name="dialogue-list" tag="div" class="space-y-2">
                <div
                    v-for="item in dialogueChain"
                    :key="item.dialogue.id"
                    :ref="element => setDialogueElement(item.dialogue.id, element)"
                    class="dialogue-card p-2 bg-base-200 rounded space-y-2"
                    :class="{ 'dialogue-card-playing': isVoicePlaying && currentVoiceKey === getDialogueVoiceKey(item.dialogue) }"
                >
                    <div class="flex items-start gap-2">
                        <img
                            v-if="item.dialogue.npc"
                            :src="getSpeakerAvatar(item.dialogue.npc)"
                            :alt="`${item.dialogue.npc}`"
                            class="size-8 rounded object-cover bg-base-100"
                            loading="lazy"
                        />

                        <div class="min-w-0 flex-1 text-xs">
                            <div class="mb-1 flex items-center gap-2">
                                <div class="font-medium text-primary min-w-0 truncate" v-if="item.dialogue.npc">
                                    {{ getSpeakerName(item.dialogue.npc) }}
                                </div>
                                <button
                                    v-if="item.dialogue.voice"
                                    type="button"
                                    class="btn btn-ghost btn-xs shrink-0 ml-auto"
                                    @click="toggleDialogueVoicePlayback(item.dialogue)"
                                >
                                    <Icon
                                        :icon="
                                            currentVoiceKey === getDialogueVoiceKey(item.dialogue) && isVoicePlaying
                                                ? 'ri:pause-circle-line'
                                                : 'ri:play-circle-line'
                                        "
                                    />
                                </button>
                            </div>
                            <TypewriterText
                                :text="formatStoryText(item.dialogue.content)"
                                :trigger-key="`${partyTopic.id}-${item.dialogue.id}`"
                            />
                        </div>
                    </div>

                    <div v-if="item.dialogue.options?.length" class="space-y-2">
                        <button
                            v-for="(option, optionIndex) in item.dialogue.options"
                            :key="option.id"
                            type="button"
                            class="group w-full rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-all duration-200"
                            :class="
                                item.selectedOption?.id === option.id
                                    ? 'border-primary/80 bg-primary/8 shadow-sm'
                                    : 'border-base-300/90 bg-base-100/60 hover:border-primary/40 hover:bg-base-100/80'
                            "
                            @click="selectOption(item.dialogue.id, option.id)"
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

                                <span class="leading-4 text-base-content/90 whitespace-normal">
                                    {{ formatStoryText(option.content) }}
                                </span>
                            </div>

                            <div
                                v-if="getImpressionEntries(option).length || getImpressionCheckEntries(option).length"
                                class="mt-1.5 flex flex-wrap gap-1.5 pl-6"
                            >
                                <span
                                    v-for="impression in getImpressionEntries(option)"
                                    :key="`${option.id}-${impression.regionId}-${impression.typeLabel}-impr`"
                                    class="rounded border px-1.5 py-0.5 text-[10px] leading-none"
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
                                    class="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] leading-none text-info"
                                >
                                    印象检定 {{ $t(getRegionType(impressionCheck.regionId)) }}·{{ impressionCheck.typeLabel }} ≥
                                    {{ impressionCheck.threshold }}
                                </span>
                            </div>
                        </button>
                    </div>
                </div>
            </TransitionGroup>

            <div v-else class="text-sm text-base-content/70">暂无可展示的对话链</div>
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
</style>
