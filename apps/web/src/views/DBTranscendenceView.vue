<script lang="ts" setup>
import { computed } from "vue"
import { seasons } from "@/data/d/dnaseason.data"
import DBTranscendenceOverview from "./DBTranscendenceOverview.vue"

/** 安全模式 / 旧数据包下赛季主表为空，整页回落到空状态而不是渲染空壳 */
const hasSeasonData = computed(() => seasons.length > 0)
</script>

<template>
    <div class="h-full flex flex-col">
        <div v-if="!hasSeasonData" class="flex min-h-0 flex-1 items-center justify-center p-6">
            <div class="max-w-sm rounded-xs border border-base-content/10 bg-base-100/60 p-6 text-center backdrop-blur-sm">
                <Icon icon="ri:magic-line" class="mx-auto size-10 text-primary/40" />
                <p class="mt-3 text-sm font-semibold text-base-content/80">{{ $t("db-transcendence.empty") }}</p>
                <p class="mt-1 text-[11px] leading-relaxed text-base-content/45">{{ $t("db-transcendence.empty_hint") }}</p>
            </div>
        </div>
        <div v-else class="flex min-h-0 flex-1 flex-col">
            <DBTranscendenceOverview />
        </div>
    </div>
</template>
