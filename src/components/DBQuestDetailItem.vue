<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue"
import type { QuestItem, QuestStory } from "@/data/d/quest.data"
import type { QuestChain } from "@/data/d/questchain.data"
import { getLocalizedQuestDataByLanguage } from "@/data/d/story-locale"
import { storySummaryData } from "@/data/d/storysummary.data"
import { useSettingStore } from "@/store/setting"
import { getQuestTypeDisplay } from "@/utils/quest-utils"
import { getRewardDetails, RewardItem as RewardItemType } from "@/utils/reward-utils"
import { replaceStoryPlaceholders, type StoryTextConfig, stripStoryTextTags } from "@/utils/story-text"

interface QuestNextOption {
    condition: string
    targetId: number
    isContinuous: boolean
}

interface QuestSearchTarget {
    nodeId: string
    dialogueId: number
    optionId?: number
    /** Fuse 命中的字符区间（相对去标签、去首尾空白后的文本），用于跳转后原位高亮 */
    matchRange?: { start: number; end: number }
}

interface QuestSearchMatch {
    questId: number
    target?: QuestSearchTarget
}

interface QuestDetailItem {
    id: number
    sr?: number
    next?: Record<string, number>
    details: QuestItem | null
    reward: RewardItemType | null
    nextOptions: QuestNextOption[]
    hasBranchNext: boolean
    searchText: string
}

const props = defineProps<{
    questChain: QuestChain
    focusQuestId?: number
    searchKeyword?: string
    /** 列表页 Fuse 命中上下文，用于无精确命中时定位模糊命中内容 */
    searchFuseMatches?: Array<{ key?: string; value?: string; indices?: Array<[number, number]> }>
}>()

const settingStore = useSettingStore()
const localizedQuestData = ref<QuestStory[]>([])
type VoiceLocale = "zh" | "en" | "jp" | "kr"
const selectedVoiceLocale = useLocalStorage<VoiceLocale>("questvoice", "zh")
const isVoiceSettingsOpen = ref(false)
const voiceSettingsRef = ref<HTMLElement | null>(null)
const voiceLocaleOptions: { key: VoiceLocale; label: string }[] = [
    { key: "zh", label: "汉语" },
    { key: "en", label: "EN" },
    { key: "jp", label: "日本語" },
    { key: "kr", label: "한국어" },
]

const highlightedQuestMap = reactive<Record<number, boolean>>({})

const questElementMap = new Map<number, HTMLElement>()
const questHighlightTimerMap = new Map<number, ReturnType<typeof setTimeout>>()
const normalizedSearchKeyword = computed(() => props.searchKeyword?.trim() || "")
const searchNavigationId = ref(0)

/**
 * 异步加载当前语言的任务剧情数据，并避免过期请求覆盖最新状态。
 * @param language 设置语言代码
 */
async function loadLocalizedQuestData(language: string): Promise<void> {
    const data = await getLocalizedQuestDataByLanguage(language)
    if (settingStore.lang !== language) {
        return
    }
    localizedQuestData.value = data
}

/**
 * 将设置语言代码映射为任务语音语言。
 * @param language 设置语言代码
 * @returns 任务语音语言
 */
function resolveVoiceLocaleBySetting(language: string): VoiceLocale {
    if (language === "jiaojiao") return "en"
    if (language.startsWith("en")) return "en"
    if (language.startsWith("ja")) return "jp"
    if (language.startsWith("ko")) return "kr"
    return "zh"
}

/**
 * 切换语音设置面板显示状态。
 */
function toggleVoiceSettingsPanel(): void {
    isVoiceSettingsOpen.value = !isVoiceSettingsOpen.value
}

/**
 * 处理设置面板外部点击关闭逻辑。
 * @param event 指针事件
 */
function handleVoiceSettingsPointerDown(event: PointerEvent): void {
    if (!isVoiceSettingsOpen.value) {
        return
    }

    const panelElement = voiceSettingsRef.value
    const eventPath = typeof event.composedPath === "function" ? event.composedPath() : []
    if (panelElement && eventPath.includes(panelElement)) {
        return
    }

    const target = event.target as HTMLElement | null
    if (target?.closest("[data-quest-voice-select-content='true']")) {
        return
    }

    isVoiceSettingsOpen.value = false
}

watch(
    () => settingStore.lang,
    async language => {
        selectedVoiceLocale.value = resolveVoiceLocaleBySetting(language)
        await loadLocalizedQuestData(language)
    },
    { immediate: true }
)

/**
 * 按当前设置语言构建任务详情映射，便于按任务 ID 快速读取任务文本。
 */
const questItemMap = computed(() => {
    const map = new Map<number, QuestItem>()

    for (const questList of localizedQuestData.value) {
        for (const questItem of questList.quests) {
            map.set(questItem.id, questItem)
        }
    }

    return map
})

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

/**
 * 跳转到命中的任务索引。
 * @param nextIndex 目标索引
 */
function jumpToMatchedQuest(nextIndex: number) {
    if (!matchedQuestTargets.value.length) {
        return
    }

    const total = matchedQuestTargets.value.length
    const normalizedIndex = ((nextIndex % total) + total) % total
    activeMatchIndex.value = normalizedIndex

    const match = matchedQuestTargets.value[normalizedIndex]
    if (!match) {
        return
    }

    searchNavigationId.value += 1
    if (!match.target) {
        jumpToQuest(match.questId)
    }
}

onBeforeUnmount(() => {
    if (initialJumpTimer) {
        clearTimeout(initialJumpTimer)
        initialJumpTimer = null
    }
    document.removeEventListener("pointerdown", handleVoiceSettingsPointerDown)
    for (const timer of questHighlightTimerMap.values()) {
        clearTimeout(timer)
    }
    questHighlightTimerMap.clear()
    questElementMap.clear()
})

watch(isVoiceSettingsOpen, isOpen => {
    if (isOpen) {
        document.addEventListener("pointerdown", handleVoiceSettingsPointerDown)
        return
    }

    document.removeEventListener("pointerdown", handleVoiceSettingsPointerDown)
})

/**
 * 获取任务展示标签。
 * @param questId 任务 ID
 * @returns 任务标签
 */
function getQuestLabel(questId: number): string {
    const targetQuest = questItemMap.value.get(questId)
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
        const details = questItemMap.value.get(quest.id) ?? null
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
            searchText: [
                formatStoryText(details?.name || ""),
                formatStoryText(details?.desc || ""),
                ...(details?.nodes ?? []).flatMap(node => [
                    formatStoryText(node.name || ""),
                    ...(node.dialogues ?? []).flatMap(dialogue => [
                        formatStoryText(dialogue.content || ""),
                        ...(dialogue.options ?? []).map(option => formatStoryText(option.content || "")),
                    ]),
                ]),
            ]
                .filter(Boolean)
                .join(" "),
        }
    })
})

const searchFuseMatches = computed(() => props.searchFuseMatches ?? [])

/**
 * 精确命中：命中对话正文/选项，或整条任务的 searchText。
 * @param keyword 搜索关键词
 * @returns 精确命中列表
 */
function buildExactQuestMatches(keyword: string): QuestSearchMatch[] {
    return questDetails.value.flatMap(quest => {
        const dialogueMatches = (quest.details?.nodes ?? []).flatMap(node => {
            return (node.dialogues ?? []).flatMap(dialogue => {
                const matches: QuestSearchMatch[] = []
                if (formatStoryText(dialogue.content).includes(keyword)) {
                    matches.push({
                        questId: quest.id,
                        target: {
                            nodeId: node.id,
                            dialogueId: dialogue.id,
                        },
                    })
                }

                for (const option of dialogue.options ?? []) {
                    if (formatStoryText(option.content).includes(keyword)) {
                        matches.push({
                            questId: quest.id,
                            target: {
                                nodeId: node.id,
                                dialogueId: dialogue.id,
                                optionId: option.id,
                            },
                        })
                    }
                }

                return matches
            })
        })

        if (dialogueMatches.length) {
            return dialogueMatches
        }

        return quest.searchText.includes(keyword) ? [{ questId: quest.id }] : []
    })
}

/**
 * 无精确命中时的兜底：复用列表页 Fuse 的命中上下文。
 * 将 Fuse 命中的 snippet 文本与当前链中的对话/选项文本比对（清洗规则与列表索引一致：
 * 去样式标签 + 去首尾空白），定位到具体对话，实现模糊命中的跳转与原位高亮。
 * @returns 基于 Fuse 命中定位的搜索目标
 */
function buildFuseFallbackQuestMatches(): QuestSearchMatch[] {
    const matches: QuestSearchMatch[] = []

    // 先按清洗后文本建立索引，避免逐条 Fuse 命中重复全量扫描
    const textTargetMap = new Map<string, Array<{ questId: number; target: QuestSearchTarget }>>()
    for (const quest of questDetails.value) {
        for (const node of quest.details?.nodes ?? []) {
            for (const dialogue of node.dialogues ?? []) {
                const contentKey = stripStoryTextTags(dialogue.content || "").trim()
                if (contentKey) {
                    const targets = textTargetMap.get(contentKey) ?? []
                    targets.push({
                        questId: quest.id,
                        target: {
                            nodeId: node.id,
                            dialogueId: dialogue.id,
                        },
                    })
                    textTargetMap.set(contentKey, targets)
                }

                for (const option of dialogue.options ?? []) {
                    const optionKey = stripStoryTextTags(option.content || "").trim()
                    if (optionKey) {
                        const targets = textTargetMap.get(optionKey) ?? []
                        targets.push({
                            questId: quest.id,
                            target: {
                                nodeId: node.id,
                                dialogueId: dialogue.id,
                                optionId: option.id,
                            },
                        })
                        textTargetMap.set(optionKey, targets)
                    }
                }
            }
        }
    }

    const visitedValues = new Set<string>()
    for (const fuseMatch of searchFuseMatches.value) {
        if (fuseMatch.key !== "snippets" || !fuseMatch.value) {
            continue
        }

        const matchedText = fuseMatch.value.trim()
        if (!matchedText || visitedValues.has(matchedText)) {
            continue
        }
        visitedValues.add(matchedText)

        // Fuse 区间为闭区间 [start, end]，转换为半开区间供高亮使用
        const firstHit = fuseMatch.indices?.[0]
        const matchRange =
            firstHit && Number.isInteger(firstHit[0]) && Number.isInteger(firstHit[1]) && firstHit[1] >= firstHit[0]
                ? { start: firstHit[0], end: firstHit[1] + 1 }
                : undefined

        for (const target of textTargetMap.get(matchedText) ?? []) {
            matches.push({
                questId: target.questId,
                target: {
                    nodeId: target.target.nodeId,
                    dialogueId: target.target.dialogueId,
                    optionId: target.target.optionId,
                    matchRange,
                },
            })
        }
    }

    return matches
}

const matchedQuestTargets = computed<QuestSearchMatch[]>(() => {
    const keyword = normalizedSearchKeyword.value
    if (!keyword) {
        return []
    }

    // 精确命中优先；再并入列表页 Fuse 命中的内容（覆盖模糊命中场景），并去重
    const exactMatches = buildExactQuestMatches(keyword)
    const fuseMatches = buildFuseFallbackQuestMatches()

    if (!exactMatches.length) {
        return fuseMatches
    }
    if (!fuseMatches.length) {
        return exactMatches
    }

    const seenKeys = new Set<string>()
    const merged: QuestSearchMatch[] = []
    for (const match of [...exactMatches, ...fuseMatches]) {
        const optionKey = match.target ? `${match.target.nodeId}-${match.target.dialogueId}-${match.target.optionId ?? ""}` : `quest-${match.questId}`
        const key = `${match.questId}|${optionKey}`
        if (seenKeys.has(key)) {
            continue
        }
        seenKeys.add(key)
        merged.push(match)
    }
    return merged
})

const activeMatchIndex = ref(0)
const activeSearchMatch = computed(() => matchedQuestTargets.value[activeMatchIndex.value])
const activeSearchTarget = computed(() => activeSearchMatch.value?.target)
const activeSearchQuestId = computed(() => activeSearchMatch.value?.questId)

// 自动跳转到首个搜索命中的节流定时器与已跳转标记
let initialJumpTimer: ReturnType<typeof setTimeout> | null = null
const autoJumpedTargetKey = ref("")

/**
 * 从列表页点选任务链进入详情 / 关键词变化时，自动跳转到首个命中的对话。
 * 每个 (任务链, 关键词) 组合只自动跳转一次，避免干扰用户通过 1/N 浮层手动切换。
 */
watch(
    () => [props.questChain?.id, normalizedSearchKeyword.value, matchedQuestTargets.value.length],
    () => {
        const token = `${props.questChain?.id ?? 0}|${normalizedSearchKeyword.value}`
        if (!matchedQuestTargets.value.length || autoJumpedTargetKey.value === token) {
            return
        }

        if (initialJumpTimer) {
            clearTimeout(initialJumpTimer)
        }

        initialJumpTimer = setTimeout(() => {
            autoJumpedTargetKey.value = token
            activeMatchIndex.value = 0
            jumpToMatchedQuest(0)
        }, 120)
    },
    { immediate: true }
)

/**
 * 获取任务链版本号。
 * @returns 版本号
 */
const questChainVersion = computed(() => props.questChain.版本 || "")
const questChainTypeDisplay = computed(() => getQuestTypeDisplay(props.questChain.type))

/**
 * 当前任务链的 AI 剧情总结文本（已应用剧情占位符替换）。
 * 数据来自 storysummary.data.ts（storySummary.json 导入），无摘要时返回空文本。
 */
const questChainAiSummary = computed(() => formatStoryText(storySummaryData[props.questChain.id]))
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 搜索命中导航浮窗 -->
        <div
            v-if="matchedQuestTargets.length"
            class="fixed bottom-6 right-6 z-1200 flex items-center gap-2 rounded-xs border border-base-content/15 bg-base-100/95 p-2 shadow-lg backdrop-blur-sm"
        >
            <button type="button" class="btn btn-ghost btn-xs" @click="jumpToMatchedQuest(activeMatchIndex - 1)">
                <Icon icon="ri:arrow-up-s-line" />
            </button>
            <span class="min-w-12 text-center font-mono text-[11px] tabular-nums text-base-content/60"
                >{{ activeMatchIndex + 1 }}/{{ matchedQuestTargets.length }}</span
            >
            <button type="button" class="btn btn-ghost btn-xs" @click="jumpToMatchedQuest(activeMatchIndex + 1)">
                <Icon icon="ri:arrow-down-s-line" />
            </button>
        </div>

        <!-- 任务链档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-start gap-3.5">
                <div
                    v-if="questChain.icon"
                    class="size-20 shrink-0 bg-base-content"
                    :style="{ mask: `url(/imgs/webp/${questChain.icon}.webp) no-repeat center/contain` }"
                    :alt="questChain.name"
                />

                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Quest Chain
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/questchain/${questChain.id}`"
                            class="wrap-break-word font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(questChain.name) }}
                        </SRouterLink>
                        <CopyID :id="questChain.id" />
                    </div>

                    <!-- 元信息行：类型 / 版本 / 集数 / 章节 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <img
                            :src="`/imgs/tp/${questChainTypeDisplay.icon}.webp`"
                            :alt="questChainTypeDisplay.name"
                            class="h-5 w-5 shrink-0 object-contain"
                            loading="lazy"
                        />
                        <span>{{ questChainTypeDisplay.name }}</span>
                        <template v-if="questChainVersion">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span class="font-mono tabular-nums">v{{ questChainVersion }}</span>
                        </template>
                        <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                        <span>{{ $t(questChain.episode) }}</span>
                        <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                        <span>{{ $t(questChain.chapterName) }} {{ $t(questChain.chapterNumber || "") }}</span>
                    </div>

                    <!-- 时间行：开始 / 结束 -->
                    <div
                        v-if="questChain.startTime || questChain.endTime"
                        class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-base-content/50"
                    >
                        <template v-if="questChain.startTime">
                            <span>开始时间</span>
                            <span class="font-mono tabular-nums">{{ new Date(questChain.startTime * 1000).toLocaleString() }}</span>
                        </template>
                        <template v-if="questChain.endTime">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span>结束时间</span>
                            <span class="font-mono tabular-nums">{{ new Date(questChain.endTime * 1000).toLocaleString() }}</span>
                        </template>
                    </div>
                </div>

                <!-- 剧情语音设置 -->
                <div ref="voiceSettingsRef" class="relative shrink-0">
                    <button
                        type="button"
                        class="btn btn-ghost btn-sm btn-square"
                        title="剧情语音设置"
                        :class="{ 'bg-base-content/10': isVoiceSettingsOpen }"
                        @click="toggleVoiceSettingsPanel"
                    >
                        <Icon icon="ri:settings-3-line" />
                    </button>
                    <div
                        v-if="isVoiceSettingsOpen"
                        class="absolute right-0 top-full z-1000 mt-2 w-56 rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md"
                    >
                        <div class="space-y-2">
                            <div class="text-xs font-medium text-base-content/70">语音语言</div>
                            <Select
                                v-model="selectedVoiceLocale"
                                class="w-full rounded-xs border border-base-content/20 bg-base-content/5 px-3 py-2 text-sm"
                                content-class="z-[10010]"
                                :content-props="{ 'data-quest-voice-select-content': 'true' }"
                            >
                                <SelectItem v-for="option in voiceLocaleOptions" :key="option.key" :value="option.key">
                                    {{ option.label }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <!-- 任务链 AI 剧情总结（数据由 storySummary.json 导入，无摘要时隐藏） -->
        <section
            v-if="questChainAiSummary"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="AI" title="剧情 AI 总结">
                <template #trailing>
                    <span class="text-[10px] tracking-wide text-base-content/45">AI 生成 · 仅供参考</span>
                </template>
            </SectionHeader>
            <p class="text-sm leading-relaxed whitespace-pre-line text-base-content/75">{{ questChainAiSummary }}</p>
        </section>

        <!-- 奖励信息 -->
        <section v-if="questChain.reward?.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="REWARD" title="奖励信息" />
            <div class="space-y-3">
                <div
                    v-for="reward in questChain.reward
                        .map(id => getRewardDetails(id))
                        .filter((rewardItem): rewardItem is RewardItemType => !!rewardItem)"
                    :key="reward.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40"
                >
                    <RewardItem :reward="reward" header />
                </div>
            </div>
        </section>

        <!-- 任务列表 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="QUESTS" title="任务列表" :count="questChain.quests.length" />
            <div class="space-y-3">
                <div
                    v-for="quest in questDetails"
                    :key="quest.id"
                    :data-quest-id="quest.id"
                    :ref="element => setQuestElement(quest.id, element)"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-all duration-300"
                    :class="{ 'border-primary ring-4 ring-primary/10': highlightedQuestMap[quest.id] }"
                >
                    <div class="flex items-center gap-2 text-sm">
                        任务:
                        <HighlightStoryText
                            :text="quest.details?.name || '?'"
                            :keyword="normalizedSearchKeyword"
                            :story-config="storyTextConfig"
                        />
                        <CopyID :id="quest.id" />
                        <div class="flex-1"></div>
                        <span v-if="quest.sr" class="ml-2 inline-flex items-center gap-1 text-xs text-base-content/70">
                            <span>子区域:</span>
                            <SubRegionLink :sub-region-id="quest.sr" />
                        </span>
                    </div>

                    <div v-if="quest.details?.desc" class="text-sm leading-relaxed text-base-content/70">
                        <HighlightStoryText
                            :text="quest.details.desc"
                            :keyword="normalizedSearchKeyword"
                            :story-config="storyTextConfig"
                        />
                    </div>

                    <div v-if="shouldShowQuestNextOptions(quest)" class="flex flex-wrap items-center gap-1.5 text-xs">
                        <span class="text-base-content/60">任务跳转</span>
                        <template
                            v-for="nextOption in quest.nextOptions"
                            :key="`${quest.id}-next-${nextOption.condition}-${nextOption.targetId}`"
                        >
                            <span class="text-primary">→</span>
                            <button
                                type="button"
                                class="cursor-pointer rounded-xs border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary/80 transition-colors duration-200 hover:border-primary/50 hover:bg-primary/10"
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
                        :quest-chain-icon="questChain.icon"
                        :quest-name="quest.details?.name || questChain.name"
                        :voice-language="selectedVoiceLocale"
                        :search-keyword="normalizedSearchKeyword"
                        :search-target="activeSearchQuestId === quest.id ? activeSearchTarget : undefined"
                        :search-target-request="activeSearchQuestId === quest.id ? searchNavigationId : undefined"
                    />

                    <!-- 任务奖励 -->
                    <div v-if="quest.reward" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                        <div class="mb-1 text-[11px] tracking-wide text-base-content/55">任务奖励:</div>
                        <RewardItem :reward="quest.reward as RewardItemType" />
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
