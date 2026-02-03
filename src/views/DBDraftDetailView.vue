<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import draftData from "../data/d/draft.data"

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
    <ScrollArea class="h-full flex flex-col">
        <DBDraftDetailItem :draft="draft" class="flex-1" />
    </ScrollArea>
</template>
