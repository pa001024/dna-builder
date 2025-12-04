<script lang="ts" setup>
import { ref } from "vue"

const props = defineProps<{
    src: string
    autoplay?: boolean
}>()

const playing = ref(false)

const audio = ref<HTMLAudioElement>(null as any)

async function play() {
    const el = audio.value
    if (!el) return
    if (playing.value) {
        playing.value = false
        el.pause()
        return
    }

    await el.play()

    playing.value = true
    el.onended = () => {
        playing.value = false
    }
}
function onLoad() {
    if (props.autoplay) play()
}
</script>

<template>
    <div class="btn btn-square btn-ghost btn-sm" @click="play">
        <template v-if="src">
            <Icon icon="la:play-solid" v-if="!playing" />
            <Icon icon="la:pause-solid" v-else />
            <audio ref="audio" :src="src" @canplay="onLoad" />
        </template>
        <span v-else class="loading loading-spinner loading-sm"></span>
    </div>
</template>
