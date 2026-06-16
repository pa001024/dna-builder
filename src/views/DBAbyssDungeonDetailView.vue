<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { abyssDungeonMap } from "../data/d/index"

const route = useRoute()

const dungeonId = computed(() => Number(route.params.dungeonId))
const dungeon = computed(() => abyssDungeonMap.get(dungeonId.value))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea v-if="dungeon" class="flex-1">
            <DBAbyssDungeonDetailItem :dungeon="dungeon" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">{{ $t("abyss-dungeon-detail.notFound") }}</div>
        </div>
    </div>
</template>
