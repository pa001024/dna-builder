<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { npcMap } from "@/data/d"


const route = useRoute()

const npcId = computed(() => Number(route.params.npcId))
const npc = computed(() => npcMap.get(npcId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div v-if="npc" class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <!-- 使用 DBNpcDetailItem 组件显示 NPC 详情 -->
            <DBNpcDetailItem :npc="npc" />
        </div>

        <div v-else class="p-4">
            <div class="text-base-content/70">未找到 NPC</div>
        </div>
    </ScrollArea>
</template>
