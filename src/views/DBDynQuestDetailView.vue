<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { dynQuestMap } from "@/data/d"


const route = useRoute()

const questId = computed(() => Number(route.params.questId))
const quest = computed(() => dynQuestMap.get(questId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div v-if="quest" class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <!-- 使用 DynQuestDetailItem 组件显示委托详情 -->
            <DBDynQuestDetailItem :quest="quest" />
        </div>

        <div v-else class="p-4">
            <div class="text-base-content/70">未找到委托</div>
        </div>
    </ScrollArea>
</template>
