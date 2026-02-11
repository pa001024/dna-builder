<script lang="ts" setup>
import { computed, reactive } from "vue"
import TypewriterText from "@/components/TypewriterText.vue"
import { charMap, LeveledChar } from "@/data"
import { npcMap } from "@/data/d/npc.data"
import type { PartyTopic } from "@/data/d/partytopic.data"
import { type Dialogue, type DialogueOption, getImprType, getRegionType } from "@/data/d/quest.data"
import { questChainMap } from "@/data/d/questchain.data"
import { resourceMap } from "@/data/d/resource.data"
import { useSettingStore } from "@/store/setting"
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
            <h3 class="font-bold mb-2">剧情对话 ({{ partyTopic.dialogues.length }} 条)</h3>

            <TransitionGroup v-if="dialogueChain.length" name="dialogue-list" tag="div" class="space-y-2">
                <div v-for="item in dialogueChain" :key="item.dialogue.id" class="dialogue-card p-2 bg-base-200 rounded space-y-2">
                    <div class="flex items-start gap-2">
                        <img
                            v-if="item.dialogue.npc"
                            :src="getSpeakerAvatar(item.dialogue.npc)"
                            :alt="`${item.dialogue.npc}`"
                            class="size-8 rounded object-cover bg-base-100"
                            loading="lazy"
                        />

                        <div class="min-w-0 flex-1 text-xs">
                            <div class="font-medium text-primary mb-1" v-if="item.dialogue.npc">
                                {{ getSpeakerName(item.dialogue.npc) }}
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
</style>
