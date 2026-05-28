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
    <ScrollArea class="h-full flex flex-col">
        <DBForgeDetailItem :forge="forge" class="flex-1" />
    </ScrollArea>
</template>
