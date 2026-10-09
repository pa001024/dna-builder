<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { forgeLevelData } from "@/data"

const route = useRoute()

const forge = computed(() => {
    const id = Number(route.params.id)
    const foundForge = forgeLevelData.find(item => item.ForgeLevel === id)
    if (!foundForge) {
        throw new Error(`Forge level ${id} not found`)
    }
    return foundForge
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBForgeDetailItem :forge="forge" />
        </div>
    </ScrollArea>
</template>
