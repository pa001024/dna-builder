<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { questChainMap } from "@/data/d/questchain.data"

const route = useRoute()

const questChainId = computed(() => Number(route.params.questChainId))
const questId = computed(() => Number(route.params.questId || 0))
const questChain = computed(() => questChainMap.get(questChainId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <template v-if="questChain">
            <DBQuestDetailItem :quest-chain="questChain" :focus-quest-id="questId || undefined" class="flex-1" />
        </template>

        <div v-else class="p-4">
            <div class="text-base-content/70">未找到任务剧情</div>
        </div>
    </ScrollArea>
</template>
