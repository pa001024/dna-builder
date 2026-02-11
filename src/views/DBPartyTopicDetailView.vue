<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { partyTopicMap } from "@/data/d/partytopic.data"

const route = useRoute()

const partyTopicId = computed(() => Number(route.params.partyTopicId))
const partyTopic = computed(() => partyTopicMap.get(partyTopicId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <template v-if="partyTopic">
            <DBPartyTopicDetailItem :party-topic="partyTopic" class="flex-1" />
        </template>

        <div v-else class="p-4">
            <div class="text-base-content/70">未找到光阴集</div>
        </div>
    </ScrollArea>
</template>
