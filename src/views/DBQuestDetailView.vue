<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { questChainMap } from "@/data/d"

const route = useRoute()

const questChainId = computed(() => Number(route.params.questChainId))
const questId = computed(() => Number(route.params.questId || 0))
const questChain = computed(() => questChainMap.get(questChainId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div v-if="questChain" class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBQuestDetailItem :quest-chain="questChain" :focus-quest-id="questId || undefined" />
        </div>

        <div v-else class="p-4">
            <div class="text-base-content/70">{{ $t('questchain-detail.not_found') }}</div>
        </div>
    </ScrollArea>
</template>
