<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import dungeonData from "@/data/d/dungeon.data"

const route = useRoute()

const dungeonId = computed(() => Number(route.params.dungeonId))
const dungeon = computed(() => dungeonData.find(d => d.id === dungeonId.value))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea v-if="dungeon" class="flex-1">
            <!-- 居中容器：与首页一致的纸面排版宽度 -->
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <div>
                    <DBDungeonDetailItem :dungeon="dungeon" />
                </div>
            </div>
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到副本</div>
        </div>
    </div>
</template>
