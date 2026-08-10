<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { iconticketMap } from "@/data/d/iconticket.data"

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
    <ScrollArea class="h-full flex flex-col">
        <DBIronTicketDetailItem :ticket="ticket" class="flex-1" />
    </ScrollArea>
</template>
