<script setup lang="ts">
import { ref } from "vue"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { timeStr, useGameTimer } from "@/util"
import { buildWeeklyHardbossGroups, getHardbossIcon, type WeeklyHardbossRewardGroup } from "@/utils/hardboss-rewards"

const ui = useUIStore()
const showWeeklyHardbossModal = ref(false)
const weeklyGroups = ref<WeeklyHardbossRewardGroup[]>([])

/**
 * 打开周本奖励弹窗并刷新内容。
 */
function openWeeklyHardbossModal() {
    const nowTimestamp = Math.floor(Date.now() / 1000)
    weeklyGroups.value = buildWeeklyHardbossGroups(nowTimestamp)
    showWeeklyHardbossModal.value = true
}

const { mihan, moling, zhouben } = useGameTimer()
</script>
<template>
    <div class="flex ml-4 gap-8 items-center text-xs text-base-content/80">
        <div class="inline-block text-center min-w-16 cursor-pointer" @click="ui.mihanVisible = true">
            <div class="whitespace-nowrap">
                {{ $t("resizeableWindow.mihan") }}
            </div>
            <div class="font-orbitron tabular-nums">
                {{ timeStr(mihan) }}
            </div>
        </div>
        <div class="text-center min-w-16" :class="[env.isApp ? 'hidden sm:inline-block' : 'inline-block']">
            <div class="whitespace-nowrap">
                {{ $t("魔灵") }}
            </div>
            <div class="font-orbitron tabular-nums">
                {{ timeStr(moling) }}
            </div>
        </div>
        <button type="button" class="hidden sm:inline-block text-center min-w-16 cursor-pointer" @click="openWeeklyHardbossModal">
            <div class="whitespace-nowrap">
                {{ $t("resizeableWindow.zhouben") }}
            </div>
            <div class="font-orbitron tabular-nums">
                {{ timeStr(zhouben) }}
            </div>
        </button>
    </div>
    <dialog class="modal" :class="{ 'modal-open': ui.mihanVisible }">
        <div class="modal-box rounded-xs border border-base-content/15 bg-base-100/85 text-md backdrop-blur-md">
            <div class="mb-3 flex items-center justify-between gap-3 border-b border-base-content/10 pb-2">
                <h3 class="text-lg font-medium">{{ $t("委托密函") }}</h3>
                <form class="flex justify-end gap-2" method="dialog">
                    <button class="btn btn-ghost btn-sm btn-square rounded-xs" @click="ui.mihanVisible = false">
                        <Icon bold icon="codicon:chrome-close" />
                    </button>
                </form>
            </div>
            <DNAMihan />
        </div>

        <div class="modal-backdrop" @click="ui.mihanVisible = false" />
    </dialog>
    <DialogModel
        v-model="showWeeklyHardbossModal"
        class="w-[min(92vw,56rem)] rounded-xs border border-base-content/15 bg-base-100/85 backdrop-blur-md"
    >
        <div class="space-y-4 p-4">
            <div class="flex items-center justify-between gap-3 border-b border-base-content/10 pb-3">
                <h3 class="text-lg font-medium">{{ $t("resizeableWindow.zhouben") }}</h3>
            </div>
            <div v-if="weeklyGroups.length" class="space-y-3">
                <div class="space-y-3">
                    <div
                        v-for="group in weeklyGroups"
                        :key="group.key"
                        class="space-y-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="flex flex-wrap items-start gap-2">
                            <SRouterLink
                                v-for="boss in group.bosses"
                                :key="boss.bossId"
                                :to="`/db/hardboss/${boss.bossId}`"
                                class="flex min-w-0 items-center gap-1.5 rounded-xs border border-base-content/10 bg-base-100/50 px-1.5 py-1 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                            >
                                <img :src="getHardbossIcon(boss.bossIcon)" :alt="boss.bossName" class="size-6 shrink-0 rounded-xs" />
                                <span class="truncate text-sm font-medium">{{ boss.bossName }}</span>
                            </SRouterLink>
                        </div>
                        <div v-if="group.nextRotationTime" class="text-xs text-base-content/50">
                            下次轮换：{{ new Date(group.nextRotationTime * 1000).toLocaleString("zh-CN") }}
                        </div>
                        <div v-else class="text-xs text-base-content/45">{{ $t("resizeable-window-timers.no_rotation_time") }}</div>
                        <div class="flex flex-wrap gap-2">
                            <div v-for="slot in group.slots" :key="slot.key" class="flex w-16 shrink-0 flex-col items-center gap-1">
                                <div class="relative">
                                    <ResourceCostItem
                                        v-if="slot.currentItem"
                                        :name="slot.currentItem.name"
                                        :value="slot.currentItem.value"
                                        mini
                                    />
                                    <div v-else class="h-8 w-8" />
                                </div>
                                <div
                                    v-if="group.nextRotationTime && slot.nextItem && slot.nextItem.key !== slot.currentItem?.key"
                                    class="relative"
                                >
                                    <span
                                        v-if="slot.nextItem.diffState === 'added'"
                                        class="absolute -left-1 -top-1 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded-xs border border-success/50 bg-success/15 px-1 font-mono text-[9px] font-semibold tracking-wide text-success"
                                    >
                                        NEW
                                    </span>
                                    <ResourceCostItem :name="slot.nextItem.name" :value="slot.nextItem.value" mini />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div
                v-if="!weeklyGroups.length"
                class="rounded-xs border border-dashed border-base-content/15 p-6 text-center text-sm text-base-content/45"
            >
                {{ $t("common.no_data") }}
            </div>
        </div>
    </DialogModel>
</template>
