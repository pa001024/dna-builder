<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import modData from "@/data/d/mod.data"

const route = useRoute()

const mod = computed(() => {
    const id = Number(route.params.id)
    const foundMod = modData.find(m => m.id === id)
    if (!foundMod) {
        throw new Error(`Mod with id ${id} not found`)
    }
    return foundMod
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBModDetailItem :mod="mod" />
        </div>
    </ScrollArea>
</template>
