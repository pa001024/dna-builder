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
    <div class="p-3 space-y-4">
        <div class="flex items-center">
            <div class="size-24 shrink-0 overflow-hidden rounded bg-linear-15" :class="getRarityGradientClass(ticket.rarity)">
                <ImageFallback :src="getTicketIconUrl(ticket.icon)" :alt="ticket.name" class="w-full h-full object-cover">
                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="ticket.name" class="w-full h-full object-cover" />
                </ImageFallback>
            </div>
            <div class="space-y-2 flex-1">
                <div class="flex items-center gap-3 p-3">
                    <SRouterLink :to="`/db/iron-ticket/${ticket.id}`" class="text-lg font-bold link link-primary">
                        {{ ticket.name }}
                    </SRouterLink>
                    <CopyID :id="ticket.id" />
                </div>
                <div class="flex flex-wrap gap-3 text-sm opacity-70 p-3 h-12">
                    <span
                        >{{ $t("iron-ticket.level") }} <span class="text-primary">{{ ticket.level }}</span></span
                    >
                </div>
            </div>
        </div>

        <div v-if="ticket.desc" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("iron-ticket.description") }}</div>
            <div class="text-sm leading-6 whitespace-pre-wrap">{{ ticket.desc }}</div>
        </div>

        <div v-if="ticket.func" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("iron-ticket.function") }}</div>
            <div class="text-sm leading-6 whitespace-pre-wrap">{{ ticket.func }}</div>
        </div>

        <div v-if="sourceCounts" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.source") }}</div>
            <div class="space-y-3">
                <DraftSource :draft-sources="draftSources" />
                <DungeonSource :dungeon-sources="dungeonSources" />
                <BossSource :boss-sources="hardbossSources" />
                <QuestSource :quest-sources="questSources" :iron-ticket-id="ticket.id" />
                <ShopSource :shop-sources="shopSources" />
            </div>
        </div>
    </div>
</template>
