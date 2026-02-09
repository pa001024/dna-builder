<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import titleData from "@/data/d/title.data"

const route = useRoute()

const titleId = computed(() => Number(route.params.id))
const title = computed(() => titleData.find(item => item.id === titleId.value))
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <ScrollArea v-if="title" class="flex-1">
            <DBTitleDetailItem :title="title" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到称号</div>
        </div>
    </div>
</template>
