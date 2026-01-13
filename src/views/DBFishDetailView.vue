<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { fishMap } from "../data"

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
    <div class="h-full flex flex-col">
        <DBFishDetailItem :fish="fish" class="flex-1" />
    </div>
</template>
