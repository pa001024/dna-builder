<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { fishingSpotMap } from "../data"

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
    <div class="h-full flex flex-col">
        <DBFishSpotDetailItem :spot="fishSpot" class="flex-1" />
    </div>
</template>
