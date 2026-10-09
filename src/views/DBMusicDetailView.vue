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
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBMusicDetailItem :music="music" />
        </div>
    </ScrollArea>
</template>
