<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { questChainMap } from "@/data/d/questchain.data"

const route = useRoute()

const questChainId = computed(() => Number(route.params.questChainId))
const questChain = computed(() => questChainMap.get(questChainId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <template v-if="questChain">
            <!-- 使用 DBQuestDetailItem 组件显示任务剧情详情 -->
            <DBQuestDetailItem :questChain="questChain" class="flex-1" />
        </template>

        <div v-else class="p-4">
            <div class="text-base-content/70">未找到任务剧情</div>
        </div>
    </ScrollArea>
</template>
