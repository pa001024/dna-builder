<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { iconticketMap } from "@/data/d"


const route = useRoute()

const ticket = computed(() => {
    const id = Number(route.params.id)
    const foundTicket = iconticketMap.get(id)
    if (!foundTicket) {
        throw new Error(`IronTicket with id ${id} not found`)
    }
    return foundTicket
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBIronTicketDetailItem :ticket="ticket" />
        </div>
    </ScrollArea>
</template>
