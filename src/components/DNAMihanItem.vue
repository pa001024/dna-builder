<script setup lang="ts">
import { MihanNotify } from "../store/mihan"
import { timeStr, useGameTimer } from "../util"
const { mihan } = useGameTimer()

defineProps<{
    missions: string[][]
    mihanNotifyMissions?: string[]
}>()
</script>
<template>
    <div class="grid grid-cols-3 gap-2">
        <div v-for="(item, missionId) in missions" :key="missionId" class="flex flex-col justify-start items-center">
            <div class="bg-base-100 rounded-xl p-2 py-4 w-full h-64 flex flex-col justify-start items-center gap-2">
                <div class="flex flex-col justify-center items-center gap-2">
                    <img
                        class="size-12"
                        :src="`/imgs/${MihanNotify.TYPES[missionId]}密函.png`"
                        :alt="`${MihanNotify.TYPES[missionId]}密函`"
                    />
                    <div
                        class="font-bold text-sm sm:text-lg"
                        :style="{
                            color: ['#ba9011', '#1171ba', '#ba1111'][missionId],
                        }"
                    >
                        {{ MihanNotify.TYPES[missionId] }}
                    </div>
                </div>
                <div class="divider mx-2 my-1"></div>
                <div
                    v-for="(mission, index) in item"
                    :key="index"
                    class="text-xs sm:text-sm p-1 whitespace-nowrap"
                    :class="{ 'text-secondary': mihanNotifyMissions?.includes(mission) }"
                >
                    {{ mission }}
                </div>
            </div>
        </div>
    </div>
    <div class="flex justify-center bg-base-300 p-3 rounded-md text-xs sm:text-sm text-base-content/80">
        {{ $t("resizeableWindow.nextRefresh") }}: {{ timeStr(mihan) }}
    </div>
</template>
