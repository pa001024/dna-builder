<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { fishingSpotMap } from "@/data"

const route = useRoute()

const fishSpot = computed(() => {
    const id = Number(route.params.id)
    const foundFish = fishingSpotMap.get(id)
    if (!foundFish) {
        throw new Error(`FishSpot with id ${id} not found`)
    }
    return foundFish
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与首页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <div>
                <DBFishSpotDetailItem :spot="fishSpot" />
            </div>
        </div>
    </ScrollArea>
</template>
