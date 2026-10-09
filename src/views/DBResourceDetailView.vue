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
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBResourceDetailItem :resource="resource" />
        </div>
    </ScrollArea>
</template>
