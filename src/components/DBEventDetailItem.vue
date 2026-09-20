<script lang="ts" setup>
import { computed } from "vue"
import type { EventItem } from "@/data/d/event.data"
import { limitedPrizePools } from "@/data/d/limitedprize.data"
import { questChainMap } from "@/data/d/questchain.data"
import { getRewardDetails, type RewardItem as RewardDetail } from "@/utils/reward-utils"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextSegment } from "@/utils/story-text"
import { formatDateTime, formatTimeRange } from "@/utils/time"

const props = defineProps<{
    event: EventItem
}>()

/**
 * 将活动文本解析为可渲染片段。
 * @param text 原始文本
 * @returns 文本片段
 */
function parseEventText(text?: string): StoryTextSegment[] {
    return parseStoryTextSegments(text || "", DEFAULT_STORY_TEXT_CONFIG)
}

/**
 * 根据文本片段语气返回对应的强调样式。
 * @param tone 片段语气
 * @returns Tailwind 类名
 */
function getStoryToneClass(tone: StoryTextSegment["tone"]): string {
    if (tone === "highlight") return "text-primary font-semibold"
    if (tone === "warning") return "text-error font-semibold"
    if (tone === "title") return "text-base-content font-semibold"
    return ""
}

/**
 * 累充返利积分档位列表（按积分升序），并解析各档位对应的奖励组。
 * @returns 积分档位展示数组
 */
/** 拍照任务的展示项：把点位、任务链、奖励等 id 解析成可渲染内容 */
interface PhotoTaskEntry {
    id: number
    startTime: number
    endTime: number
    photoView: string
    questChain: number
    questChainName: string
    subRegionId: number
    locationName: string
    pos: [number, number]
    reward: RewardDetail | null
}

/**
 * 解析活动的拍照任务列表（逐日解锁）。
 * @returns 拍照任务展示数组
 */
const photoTaskEntries = computed<PhotoTaskEntry[]>(() =>
    (props.event.photoTasks ?? []).map(task => ({
        id: task.id,
        startTime: task.startTime,
        endTime: task.endTime,
        photoView: task.photoView,
        questChain: task.questChain,
        questChainName: questChainMap.get(task.questChain)?.name ?? "",
        subRegionId: task.location.subRegion,
        locationName: task.location.name,
        pos: task.location.pos,
        reward: getRewardDetails(task.reward),
    }))
)

const topUpRanks = computed(() => {
    const detail = props.event.topUpDetail
    if (!detail) {
        return []
    }

    return Object.entries(detail.scoreRankReward)
        .map(([score, rewardId]) => ({
            score: Number(score),
            reward: getRewardDetails(rewardId),
        }))
        .sort((a, b) => a.score - b.score)
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 活动档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
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
            <div class="relative">
                <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                    <span class="h-px w-6 bg-primary" aria-hidden="true" />
                    Event File
                </p>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SRouterLink
                        :to="`/db/event/${event.id}`"
                        class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                    >
                        {{ $t(event.name) }}
                    </SRouterLink>
                    <CopyID :id="event.id" />
                </div>
                <div class="mt-2 text-[11px] tabular-nums text-base-content/55">
                    {{ formatTimeRange(event.startTime, event.endTime) }}
                </div>
            </div>
        </header>

        <!-- 描述 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('resource.description')" />
            <div class="text-sm leading-relaxed whitespace-pre-wrap break-all text-base-content/85">
                <template v-for="(segment, index) in parseEventText(event.desc)" :key="`desc-${index}-${segment.tone}`">
                    <span :class="getStoryToneClass(segment.tone)">{{ segment.text }}</span>
                </template>
            </div>
        </section>

        <!-- 规则 -->
        <section v-if="event.rule" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="RULES" :title="$t('event.rule')" />
            <div class="text-sm leading-relaxed whitespace-pre-wrap break-all text-base-content/85">
                <template v-for="(segment, index) in parseEventText(event.rule)" :key="`rule-${index}-${segment.tone}`">
                    <span :class="getStoryToneClass(segment.tone)">{{ segment.text }}</span>
                </template>
            </div>
        </section>

        <!-- 拍照任务 -->
        <section v-if="photoTaskEntries.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PHOTO TASKS" :title="$t('event.photo_tasks')" />
            <div class="mt-3 space-y-2">
                <div
                    v-for="task in photoTaskEntries"
                    :key="task.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-start gap-2.5">
                        <div class="w-9 shrink-0">
                            <div class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                {{ String(task.id).padStart(2, "0") }}
                            </div>
                            <div class="text-[10px] tracking-wide text-base-content/45">{{ $t("event.photo_task_index") }}</div>
                        </div>
                        <div class="min-w-0 grow space-y-1.5">
                            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span class="shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("event.photo_task_unlock") }}</span>
                                <span class="text-[13px] tabular-nums text-base-content/85">
                                    {{ formatDateTime(task.startTime) }}
                                </span>
                            </div>
                            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span class="shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("event.photo_task_location") }}</span>
                                <span class="text-[13px] text-base-content/85">{{ $t(task.locationName) }}</span>
                                <MapPosLink
                                    :sub-region-id="task.subRegionId"
                                    :point="task.pos"
                                    :point-name="$t(task.locationName)"
                                    point-icon="T_Gp_MainMission"
                                />
                            </div>
                            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span class="shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("event.photo_task_region") }}</span>
                                <SubRegionLink :sub-region-id="task.subRegionId" />
                            </div>
                            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span class="shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("event.photo_task_quest") }}</span>
                                <SRouterLink
                                    v-if="task.questChainName"
                                    :to="`/db/questchain/${task.questChain}`"
                                    class="link link-primary"
                                >
                                    {{ task.questChainName }}
                                </SRouterLink>
                                <span v-else class="font-orbitron text-[13px] tabular-nums text-base-content/60">
                                    {{ task.questChain }}
                                </span>
                            </div>
                            <div v-if="task.reward" class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span class="shrink-0 text-[11px] tracking-wide text-base-content/55">{{ $t("event.photo_task_reward") }}</span>
                                <RewardItem :reward="task.reward" />
                            </div>
                        </div>
                    </div>
                    <div class="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">
                        {{ task.photoView }}
                    </div>
                </div>
            </div>
        </section>

        <!-- 累充返利 -->
        <section v-if="event.topUpDetail" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TOP-UP" :title="$t(event.topUpDetail.eventDes)" />
            <div
                v-if="event.topUpDetail.eventRule"
                class="text-sm leading-relaxed whitespace-pre-wrap break-all text-base-content/85"
            >
                <template
                    v-for="(segment, index) in parseEventText(event.topUpDetail.eventRule)"
                    :key="`topup-rule-${index}-${segment.tone}`"
                >
                    <span :class="getStoryToneClass(segment.tone)">{{ segment.text }}</span>
                </template>
            </div>
            <div class="mt-3 space-y-2">
                <div
                    v-for="rank in topUpRanks"
                    :key="rank.score"
                    class="grid grid-cols-[88px_1fr] items-start gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2 transition-colors duration-200 hover:border-primary/40 hover:bg-base-content/5"
                >
                    <div class="flex flex-col items-start gap-0.5 pt-0.5">
                        <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ rank.score }}</span>
                        <span class="text-[10px] tracking-wide text-base-content/45">积分档位</span>
                    </div>
                    <RewardItem v-if="rank.reward" :reward="rank.reward" />
                </div>
            </div>
        </section>

        <BackpackPuzzle v-if="event.id === 103015" :event-id="event.id" />

        <LimitedPrizeSimulator v-if="event.id in limitedPrizePools" :event-id="event.id" />

        <WeaponVerifyEvent v-if="event.id === 103026" />

        <div v-if="event.boxDrop" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <BoxDropItem :box-drop="event.boxDrop" />
        </div>
    </div>
</template>
