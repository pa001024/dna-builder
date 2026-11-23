<script setup lang="ts">
import { computed } from "vue"
import { headFrameIdToKey, headFrames } from "@/utils/head-frame/head-frame.generated"

const props = withDefaults(
    defineProps<{
        headFrameId: number
        icon?: string
        alt?: string
        avatar?: string
        playing?: boolean
        timeMs?: number
    }>(),
    { playing: true, icon: "", alt: "" }
)

const frame = computed(() => headFrames[headFrameIdToKey[props.headFrameId]])
const fallbackSrc = computed(() => (props.icon ? `/imgs/headframe/${props.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"))
</script>

<template>
    <div class="head-frame relative shrink-0" :style="{ aspectRatio: frame ? `${frame.bounds.width} / ${frame.bounds.height}` : '1' }" :aria-label="alt" role="img">
        <img v-if="avatar" :src="avatar" alt="" class="absolute inset-1/4 size-1/2 rounded-full object-cover" />
        <TitleFrameRender v-if="frame" class="absolute inset-0 size-full" :frame="frame" :playing="playing" :time-ms="timeMs" :material-motion="true" :fit-bounds="true" />
        <img v-else :src="fallbackSrc" :alt="alt" class="size-full rounded-xs object-contain" />
    </div>
</template>
