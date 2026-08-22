<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import walnutData from "@/data/d/walnut.data"

const route = useRoute()

const walnutId = computed(() => Number(route.params.id))
const walnut = computed(() => walnutData.find(w => w.id === walnutId.value))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea v-if="walnut" class="flex-1">
            <!-- 居中容器：与首页一致的纸面排版宽度 -->
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <div>
                    <!-- 使用 DBWalnutDetailItem 组件显示密函详情 -->
                    <DBWalnutDetailItem :walnut="walnut" />
                </div>
            </div>
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到密函</div>
        </div>
    </div>
</template>
