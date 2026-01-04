<script lang="ts" setup>
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import dungeonData from "../data/d/dungeon.data"

const route = useRoute()
const router = useRouter()

const dungeonId = computed(() => Number(route.params.dungeonId))
const dungeon = computed(() => dungeonData.find((d) => d.id === dungeonId.value))

function goBack() {
    router.push("/db/dungeon")
}
</script>

<template>
    <div class="dungeon-detail-page h-full flex flex-col bg-base-300">
        <template v-if="dungeon">
            <div class="p-3 border-b border-base-400 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <button class="btn btn-ghost btn-sm btn-circle" @click="goBack">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h2 class="text-lg font-bold">{{ dungeon.n }}</h2>
                        <div class="text-sm text-base-content/70">{{ dungeon.desc }}</div>
                    </div>
                </div>
            </div>

            <!-- 使用 DungeonDetailItem 组件显示副本详情 -->
            <DungeonDetailItem :dungeon="dungeon" class="flex-1" />
        </template>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到副本</div>
        </div>
    </div>
</template>
