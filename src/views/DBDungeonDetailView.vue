<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import dungeonData from "../data/d/dungeon.data"

const route = useRoute()

const dungeonId = computed(() => Number(route.params.dungeonId))
const dungeon = computed(() => dungeonData.find(d => d.id === dungeonId.value))
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <ScrollArea v-if="dungeon" class="flex-1">
            <DBDungeonDetailItem :dungeon="dungeon" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到副本</div>
        </div>
    </div>
</template>
