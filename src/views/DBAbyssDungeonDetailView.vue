<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { abyssDungeonMap } from "../data/d/index"

const route = useRoute()

const dungeonId = computed(() => Number(route.params.dungeonId))
const dungeon = computed(() => abyssDungeonMap.get(dungeonId.value))
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <ScrollArea v-if="dungeon" class="flex-1">
            <DBAbyssDungeonDetailItem :dungeon="dungeon" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到深渊副本</div>
        </div>
    </div>
</template>
