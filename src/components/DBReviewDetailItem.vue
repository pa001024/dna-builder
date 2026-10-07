<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { conditionsMap } from "@/data/d/condition.data"
import type { ReviewEntry } from "@/views/DBReviewListView.vue"

const { gt } = useGameText()

const props = defineProps<{
    entry: ReviewEntry
}>()

/** 回顾配图：pic2 是每条的详情图所以排在前，部分条目另有 pic1 排在后，去重后进画框轮播 */
const platePics = computed(() => [...new Set([props.entry.review.pic2, props.entry.review.pic1].filter((pic): pic is string => Boolean(pic)))])

/** 解锁条件：review.unlock 存的是 Condition 表 id，取表里对应条目交给 ConditionItem 呈现 */
const unlockCondition = computed(() => (props.entry.review.unlock ? conditionsMap[props.entry.review.unlock] : undefined))
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 回顾档案头：纸面 + primary 强调线 -->
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
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Review File
                    </p>
                    <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/review/${entry.review.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ gt(entry.review.name) }}
                        </SRouterLink>
                        <CopyID :id="entry.review.id" />
                    </div>
                </div>
            </div>
        </header>

        <!-- 调查墙画框：回顾配图 + 名牌，对齐游戏内「画框 → 名牌 → 正文」的呈现 -->
        <DBStringBoardPlate v-if="platePics.length" :pics="platePics" :title="entry.review.name" />

        <!-- 回顾正文 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CONTENT" :title="$t('review-detail.content')" />
            <p v-if="!entry.review.content" class="text-xs text-base-content/50">{{ $t("review-detail.emptyContent") }}</p>
            <p v-else class="whitespace-pre-wrap text-[13px] leading-relaxed text-base-content/80">{{ gt(entry.review.content) }}</p>
        </section>

        <!-- 回顾信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="INFO" :title="$t('review-detail.infoSection')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("review-detail.episode") }}</span>
                    <span class="truncate text-[13px] font-semibold text-primary">{{ gt(entry.episodeName) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("review-detail.branch") }}</span>
                    <span class="shrink-0 text-[13px] font-semibold text-primary">
                        {{ entry.isMain ? $t("review-detail.main") : $t("review-detail.side") }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("review-detail.chainId") }}</span>
                    <CopyID :id="entry.chainId" />
                </div>
                <div
                    v-if="entry.review.questChainId"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("review-detail.questChain") }}</span>
                    <CopyID :id="entry.review.questChainId" />
                </div>
            </div>
        </section>

        <!-- 解锁条件 -->
        <section v-if="unlockCondition" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="UNLOCK" :title="$t('review-detail.unlockCondition')" />
            <ConditionItem :condition="unlockCondition" />
        </section>
    </div>
</template>