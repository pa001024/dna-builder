<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import draftData from "@/data/d/draft.data"

const route = useRoute()

const draft = computed(() => {
    const id = Number(route.params.id)
    const foundDraft = draftData.find(d => d.id === id)
    if (!foundDraft) {
        throw new Error(`Draft with id ${id} not found`)
    }
    return foundDraft
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBDraftDetailItem :draft="draft" />
        </div>
    </ScrollArea>
</template>
