<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { npcMap } from "@/data/d/npc.data"

const route = useRoute()

const npcId = computed(() => Number(route.params.npcId))
const npc = computed(() => npcMap.get(npcId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <template v-if="npc">
            <!-- 使用 DBNpcDetailItem 组件显示 NPC 详情 -->
            <DBNpcDetailItem :npc="npc" class="flex-1" />
        </template>

        <div v-else class="p-4">
            <div class="text-base-content/70">未找到 NPC</div>
        </div>
    </ScrollArea>
</template>
