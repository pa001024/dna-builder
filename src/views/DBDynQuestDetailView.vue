<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { dynQuestMap } from "@/data/d/dynquest.data"

const route = useRoute()

const questId = computed(() => Number(route.params.questId))
const quest = computed(() => dynQuestMap.get(questId.value))
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <template v-if="quest">
            <!-- 使用 DynQuestDetailItem 组件显示委托详情 -->
            <DBDynQuestDetailItem :quest="quest" class="flex-1" />
        </template>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到委托</div>
        </div>
    </div>
</template>
