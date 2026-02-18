<script lang="ts" setup>
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, reactive } from "vue"
import DBQuestStoryNodes from "@/components/DBQuestStoryNodes.vue"
import { type QuestItem, questData } from "@/data/d/quest.data"
import type { QuestChain } from "@/data/d/questchain.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { useSettingStore } from "@/store/setting"
import { getDropModeText, getRewardDetails, RewardItem as RewardItemType } from "@/utils/reward-utils"
import { replaceStoryPlaceholders, type StoryTextConfig } from "@/utils/story-text"

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
    reward: RewardItemType | null
    nextOptions: QuestNextOption[]
    hasBranchNext: boolean
}

const props = defineProps<{
    questChain: QuestChain
}>()

const settingStore = useSettingStore()

const highlightedQuestMap = reactive<Record<number, boolean>>({})

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
    for (const timer of questHighlightTimerMap.values()) {
        clearTimeout(timer)
    }
    questHighlightTimerMap.clear()
    questElementMap.clear()
})

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
            reward,
            nextOptions,
            hasBranchNext,
        }
    })
})

/**
 * 获取子区域名称。
 * @param subRegionId 子区域 ID
 * @returns 子区域名称
 */
function getSubRegionName(subRegionId: number): string {
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

                    <DBQuestStoryNodes
                        v-if="quest.details?.nodes?.length"
                        :quest-id="quest.id"
                        :nodes="quest.details.nodes"
                        :start-ids="quest.details.startIds"
                    />

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
