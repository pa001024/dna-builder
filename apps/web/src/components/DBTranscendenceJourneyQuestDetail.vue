<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import type { JourneyQuestRow } from "@/utils/transcendence-journey"
import { summarizeTranscendenceRewardFull } from "@/utils/transcendence-reward"

const props = defineProps<{
    /** 旅程任务行 */
    quest: JourneyQuestRow
}>()

const { gt } = useGameText()

/** 任务文案（上游已解析为中文，带样式标签） */
const desc = computed(() => cleanGameMarkup(gt(props.quest.desc)))

/** 全部奖励条目：每个 rewardId 摊平一次 */
const rewards = computed(() =>
    props.quest.rewardIds.flatMap(rewardId => {
        const summary = summarizeTranscendenceRewardFull(rewardId)

        return summary.rows.map(chip => ({ ...chip, key: `${rewardId}-${chip.key}` }))
    })
)
</script>

<template>
    <article class="min-h-0">
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
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
            <span class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]" aria-hidden="true" />
            <div class="relative flex items-start gap-3.5">
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Journey Quest
                    </p>
                    <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/transcendence/journey/quest/${quest.id}`"
                            class="min-w-0 text-[15px] font-semibold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary"
                        >
                            {{ desc }}
                        </SRouterLink>
                        <CopyID :id="quest.id" />
                        <span class="rounded-xs border border-primary/40 px-1.5 text-[10px] leading-4 text-primary">{{ $t("db-transcendence.journey.phase_n", { n: quest.phase }) }}</span>
                    </div>
                </div>
            </div>
        </header>

        <div class="space-y-3 pt-3">
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="TARGET" :title="$t('db-transcendence.journey.target')" />
                <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[11px] text-base-content/50">{{ $t("db-transcendence.journey.target_count") }}</span>
                    <span class="font-orbitron text-[13px] font-semibold text-primary">{{ quest.target }}</span>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                    <span class="text-[11px] text-base-content/50">{{ $t("db-transcendence.journey.target_ids") }}</span>
                    <CopyID v-for="targetId in quest.targetIds" :key="targetId" compact :id="targetId" />
                    <span v-if="!quest.targetIds.length" class="text-[11px] text-base-content/40">{{ $t("common.no_data") }}</span>
                </div>
            </section>

            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="REWARD" :title="$t('db-transcendence.journey.rewards')" :count="rewards.length" />
                <div class="flex flex-wrap gap-1.5">
                    <span v-for="chip in rewards" :key="chip.key" class="inline-flex items-center gap-1.5 rounded-xs border px-2 py-1" :class="chip.missing ? 'border-warning/40 bg-warning/10 text-warning' : 'border-base-content/10 bg-base-content/3'">
                        <template v-if="chip.missing">
                            {{ $t("db-transcendence.overview.reward_missing") }}
                            <CopyID :id="chip.missingId ?? '?'" />
                        </template>
                        <template v-else>
                            <span class="max-w-44 truncate text-[11px] text-base-content/70">{{ chip.unnamed ? $t("db-transcendence.unknown_reward") : gt(chip.name) || chip.name }}</span>
                            <span class="font-orbitron text-[11px] font-semibold text-primary">{{ chip.count }}</span>
                        </template>
                    </span>
                    <span v-if="!rewards.length" class="text-[11px] text-base-content/40">{{ $t("common.no_data") }}</span>
                </div>
            </section>

            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="JUMP" :title="$t('db-transcendence.journey.jump')" />
                <div class="flex flex-wrap items-center gap-2">
                    <template v-if="quest.jumpUiId !== undefined">
                        <CopyID :id="quest.jumpUiId" />
                    </template>
                    <span v-else class="text-[11px] text-base-content/40">{{ $t("db-transcendence.journey.jump_none") }}</span>
                </div>
            </section>

            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="PHASE" :title="$t('db-transcendence.journey.belongs')" />
                <div class="grid grid-cols-2 gap-2">
                    <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/50">{{ $t("db-transcendence.journey.phase") }}</span>
                        <span class="font-orbitron text-[13px] font-semibold text-primary">{{ quest.phase }}</span>
                    </div>
                    <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <span class="text-[11px] text-base-content/50">{{ $t("db-transcendence.journey.core_quest") }}</span>
                        <CopyID compact :id="quest.coreQuestId" />
                    </div>
                </div>
            </section>
        </div>
    </article>
</template>