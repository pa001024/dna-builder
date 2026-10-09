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
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBEventDetailItem :event="eventItem" />
        </div>
    </ScrollArea>
</template>
