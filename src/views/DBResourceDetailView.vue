<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { resourceData } from "@/data/d/resource.data"

const route = useRoute()

const resource = computed(() => {
    const id = Number(route.params.id)
    const foundResource = resourceData.find(item => item.id === id)
    if (!foundResource) {
        throw new Error(`Resource with id ${id} not found`)
    }
    return foundResource
})
</script>

<template>
    <ScrollArea class="h-full flex flex-col">
        <DBResourceDetailItem :resource="resource" class="flex-1" />
    </ScrollArea>
</template>
