<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import walnutData from "../data/d/walnut.data"

const route = useRoute()

const walnutId = computed(() => Number(route.params.id))
const walnut = computed(() => walnutData.find(w => w.id === walnutId.value))
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <ScrollArea v-if="walnut" class="flex-1">
            <!-- 使用 DBWalnutDetailItem 组件显示密函详情 -->
            <DBWalnutDetailItem :walnut="walnut" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到密函</div>
        </div>
    </div>
</template>
