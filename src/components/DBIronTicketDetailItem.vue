<script lang="ts" setup>
import { computed } from "vue"
import type { IconTicket } from "@/data/d/iconticket.data"
import { collectIronTicketDraftSources } from "@/utils/draft-source"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import {
    collectIronTicketDungeonSources,
    collectIronTicketHardbossSources,
    collectIronTicketQuestSources,
    collectIronTicketShopSources,
} from "@/utils/resource-source"

const props = defineProps<{
    ticket: IconTicket
}>()

const draftSources = computed(() => collectIronTicketDraftSources(props.ticket.id))
const dungeonSources = computed(() => collectIronTicketDungeonSources(props.ticket.id))
const hardbossSources = computed(() => collectIronTicketHardbossSources(props.ticket.id))
const questSources = computed(() => collectIronTicketQuestSources(props.ticket.id))
const shopSources = computed(() => collectIronTicketShopSources(props.ticket.id))
const sourceCounts = computed(
    () =>
        draftSources.value.length +
        dungeonSources.value.length +
        hardbossSources.value.length +
        questSources.value.length +
        shopSources.value.length
)

/**
 * 获取深境罗盘图标地址。
 * @param icon 图标标识
 * @returns 图标地址
 */
function getTicketIconUrl(icon: string): string {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 罗盘档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
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
                <div class="size-20 shrink-0 overflow-hidden rounded-xs bg-linear-15 sm:size-24" :class="getRarityGradientClass(ticket.rarity)">
                    <ImageFallback :src="getTicketIconUrl(ticket.icon)" :alt="ticket.name" class="w-full h-full object-cover">
                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="ticket.name" class="w-full h-full object-cover" />
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Iron Ticket
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/iron-ticket/${ticket.id}`"
                            class="truncate font-orbitron text-xl leading-none font-bold tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ ticket.name }}
                        </SRouterLink>
                        <CopyID :id="ticket.id" />
                    </div>
                    <!-- 计数行：等级 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <span class="inline-flex items-center gap-1.5">
                            {{ $t("iron-ticket.level") }}
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ ticket.level }}</span>
                        </span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 罗盘描述 -->
        <section v-if="ticket.desc" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('iron-ticket.description')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/90">{{ ticket.desc }}</div>
        </section>

        <!-- 罗盘功能 -->
        <section v-if="ticket.func" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="FUNCTION" :title="$t('iron-ticket.function')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/90">{{ ticket.func }}</div>
        </section>

        <!-- 获取途径 -->
        <section v-if="sourceCounts" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('resource.source')" />
            <div class="space-y-3">
                <DraftSource :draft-sources="draftSources" />
                <DungeonSource :dungeon-sources="dungeonSources" />
                <BossSource :boss-sources="hardbossSources" />
                <QuestSource :quest-sources="questSources" :iron-ticket-id="ticket.id" />
                <ShopSource :shop-sources="shopSources" />
            </div>
        </section>
    </div>
</template>
