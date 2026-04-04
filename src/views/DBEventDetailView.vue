<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { eventData } from "@/data"

const route = useRoute()

const eventItem = computed(() => {
    const id = Number(route.params.id)
    const foundEvent = eventData.find(item => item.id === id)
    if (!foundEvent) {
        throw new Error(`Event with id ${id} not found`)
    }
    return foundEvent
})
</script>

<template>
    <ScrollArea class="h-full flex flex-col">
        <DBEventDetailItem :event="eventItem" class="flex-1" />
    </ScrollArea>
</template>
