<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { fishMap } from "@/data"

const route = useRoute()

const fish = computed(() => {
    const id = Number(route.params.id)
    const foundFish = fishMap.get(id)
    if (!foundFish) {
        throw new Error(`Fish with id ${id} not found`)
    }
    return foundFish
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与首页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <div>
                <DBFishDetailItem :fish="fish" />
            </div>
        </div>
    </ScrollArea>
</template>
