<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { conditionsMap } from "@/data/d/condition.data"
import type { ClueEntry } from "@/views/DBClueListView.vue"

const { gt } = useGameText()

const props = defineProps<{
    entry: ClueEntry
}>()

/** 线索配图：pic2 排在前面（游戏内先展示的那张），pic1 在后，去重并剔除空值后进画框轮播 */
const platePics = computed(() => [...new Set([props.entry.clue.pic2, props.entry.clue.pic1].filter((pic): pic is string => Boolean(pic)))])

/** 解锁条件：pageUnlock 是所属页在 Condition 表里的 id，取对应条目交给 ConditionItem 呈现 */
const unlockCondition = computed(() => (props.entry.pageUnlock ? conditionsMap[props.entry.pageUnlock] : undefined))
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 线索档案头：纸面 + primary 强调线 -->
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
                        Clue File
                    </p>
                    <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/clue/${entry.clue.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ gt(entry.clue.name) }}
                        </SRouterLink>
                        <CopyID :id="entry.clue.id" />
                    </div>
                </div>
            </div>
        </header>

        <!-- 调查墙画框：线索配图 + 名牌，对齐游戏内的呈现 -->
        <DBStringBoardPlate v-if="platePics.length" :pics="platePics" :title="entry.clue.name" />

        <!-- 归属信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('clue-detail.sourceSection')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("clue-detail.tabType") }}</span>
                    <span class="shrink-0 text-[13px] font-semibold text-primary">{{ gt(entry.tabName) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("clue-detail.pageName") }}</span>
                    <span class="truncate text-[13px] font-semibold text-primary">{{ gt(entry.pageName) }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("clue-detail.pageId") }}</span>
                    <span class="shrink-0 font-mono text-[13px] font-semibold text-primary">{{ entry.pageId }}</span>
                </div>
            </div>
        </section>

        <!-- 解锁条件 -->
        <section v-if="unlockCondition" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="UNLOCK" :title="$t('clue-detail.unlockCondition')" />
            <ConditionItem :condition="unlockCondition" />
        </section>

        <!-- 内容条目 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="RECORDS" :title="$t('clue-detail.records')" />
            <p v-if="entry.clue.contents.length === 0" class="text-xs text-base-content/50">{{ $t("clue-detail.emptyRecords") }}</p>
            <div v-else class="space-y-2">
                <article
                    v-for="content in entry.clue.contents"
                    :key="content.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="mb-1.5 flex flex-wrap items-center gap-2">
                        <CopyID :id="content.id" />
                        <CopyID
                            v-if="content.trigger"
                            :id="content.trigger.id"
                            :name="content.trigger.type === 'Dialogue' ? $t('clue-detail.triggerDialogue') : $t('clue-detail.triggerResource')"
                        />
                    </div>
                    <p class="whitespace-pre-wrap text-[13px] leading-relaxed text-base-content/80">{{ gt(content.text) }}</p>
                </article>
            </div>
        </section>
    </div>
</template>