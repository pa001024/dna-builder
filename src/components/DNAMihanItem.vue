<script setup lang="ts">
import { MIHAN_TYPES } from "@/store/mihan"
import { timeStr, useGameTimer } from "@/util"

const { mihan } = useGameTimer()

defineProps<{
    missions: string[][]
    mihanNotifyMissions?: string[]
}>()
</script>
<template>
    <div class="grid grid-cols-3 gap-2">
        <div v-if="missions.length === 0" class="flex justify-center items-center col-span-3 py-5">
            <div class="loading loading-spinner loading-sm"></div>
        </div>
        <div v-for="(item, missionId) in missions" :key="missionId" class="flex flex-col justify-start items-center">
            <div
                class="flex h-64 w-full flex-col items-center justify-start gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2 py-4"
            >
                <div class="flex flex-col justify-center items-center gap-2">
                    <img
                        class="size-12"
                        :src="`/imgs/webp/T_Walnut_${['Avatar', 'Weapon', 'Mod'][missionId]}.webp`"
                        :alt="`${MIHAN_TYPES[missionId]}密函`"
                    />
                    <div
                        class="font-bold text-sm sm:text-lg whitespace-nowrap"
                        :style="{
                            color: ['#ba9011', '#1171ba', '#ba1111'][missionId],
                        }"
                    >
                        {{ $t(MIHAN_TYPES[missionId]) }}
                    </div>
                </div>
                <div class="mx-2 my-1 h-px w-full bg-base-content/10" />
                <div
                    v-for="(mission, index) in item"
                    :key="index"
                    class="text-sm p-1 whitespace-nowrap"
                    :class="{ 'text-secondary': mihanNotifyMissions?.includes(mission) }"
                >
                    {{ $t(mission) }}
                </div>
            </div>
        </div>
    </div>
    <div class="mt-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-center text-xs text-base-content/80">
        {{ $t("resizeableWindow.nextRefresh") }}: <span class="font-orbitron tabular-nums text-primary">{{ timeStr(mihan) }}</span>
    </div>
</template>
