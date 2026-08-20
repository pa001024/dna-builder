<script setup lang="ts">
import { ref } from "vue"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { timeStr, useGameTimer } from "@/util"
import {
    buildWeeklyHardbossSections,
    getHardbossIcon,
    type WeeklyHardbossRewardSection,
} from "@/utils/hardboss-rewards"

const ui = useUIStore()
const showWeeklyHardbossModal = ref(false)
const weeklyCurrentSections = ref<WeeklyHardbossRewardSection[]>([])

/**
 * 打开周本奖励弹窗并刷新内容。
 */
function openWeeklyHardbossModal() {
    const nowTimestamp = Math.floor(Date.now() / 1000)
    weeklyCurrentSections.value = buildWeeklyHardbossSections(nowTimestamp)
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
            <div class="font-orbitron">
                {{ timeStr(mihan) }}
            </div>
        </div>
        <div class="text-center min-w-16" :class="[env.isApp ? 'hidden sm:inline-block' : 'inline-block']">
            <div class="whitespace-nowrap">
                {{ $t("resizeableWindow.moling") }}
            </div>
            <div class="font-orbitron">
                {{ timeStr(moling) }}
            </div>
        </div>
        <button type="button" class="hidden sm:inline-block text-center min-w-16 cursor-pointer" @click="openWeeklyHardbossModal">
            <div class="whitespace-nowrap">
                {{ $t("resizeableWindow.zhouben") }}
            </div>
            <div class="font-orbitron">
                {{ timeStr(zhouben) }}
            </div>
        </button>
    </div>
    <dialog class="modal" :class="{ 'modal-open': ui.mihanVisible }">
        <div class="modal-box bg-base-300 text-md">
            <div class="text-lg font-bold flex justify-between items-center pb-2">
                {{ $t("resizeableWindow.mihanTitle") }}

                <form class="flex justify-end gap-2" method="dialog">
                    <button class="btn btn-ghost btn-sm btn-square" @click="ui.mihanVisible = false">
                        <Icon bold icon="codicon:chrome-close" />
                    </button>
                </form>
            </div>
            <DNAMihan />
        </div>

        <div class="modal-backdrop" @click="ui.mihanVisible = false" />
    </dialog>
    <DialogModel v-model="showWeeklyHardbossModal" class="w-[min(92vw,56rem)]">
        <div class="space-y-5 p-4">
            <div v-if="weeklyCurrentSections.length" class="space-y-3">
                <div class="space-y-3">
                    <div
                        v-for="section in weeklyCurrentSections"
                        :key="section.key"
                        class="space-y-3 rounded-lg border border-base-200 bg-base-100 p-3"
                    >
                        <div class="flex items-start gap-3">
                            <img :src="getHardbossIcon(section.bossIcon)" :alt="section.bossName" class="size-10 rounded-lg shrink-0" />
                            <div class="min-w-0">
                                <SRouterLink :to="`/db/hardboss/${section.bossId}`" class="font-medium hover:underline">
                                    {{ section.bossName }}
                                </SRouterLink>
                                <div v-if="section.nextRotationTime" class="text-xs text-base-content/60">
                                    下次轮换：{{ new Date(section.nextRotationTime * 1000).toLocaleString("zh-CN") }}
                                </div>
                                <div v-else class="text-xs text-base-content/60">暂无下次轮换时间</div>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <div v-for="slot in section.slots" :key="slot.key" class="w-16 shrink-0 flex flex-col items-center gap-1">
                                <div class="relative">
                                    <ResourceCostItem v-if="slot.currentItem" :name="slot.currentItem.name" :value="slot.currentItem.value" mini />
                                    <div v-else class="h-8 w-8" />
                                </div>
                                <div v-if="section.nextRotationTime && slot.nextItem && slot.nextItem.key !== slot.currentItem?.key" class="relative">
                                    <span
                                        v-if="slot.nextItem.diffState === 'added'"
                                        class="absolute -left-1 -top-1 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded bg-success px-1 text-[10px] font-bold text-success-content"
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
            <div v-if="!weeklyCurrentSections.length" class="rounded-lg border border-base-200 bg-base-100 p-6 text-center text-sm text-base-content/60">
                暂无数据
            </div>
        </div>
    </DialogModel>
</template>
