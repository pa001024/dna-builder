<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { musicData } from "@/data/d/music.data"

const route = useRoute()

/** 当前路由对应的音乐。 */
const music = computed(() => {
    const id = Number(route.params.id)
    const foundMusic = musicData.find(item => item.id === id)
    if (!foundMusic) {
        throw new Error(`Music with id ${id} not found`)
    }
    return foundMusic
})
</script>

<template>
    <ScrollArea class="h-full flex flex-col">
        <DBMusicDetailItem :music="music" class="flex-1" />
    </ScrollArea>
</template>
