<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { hardBossMap } from "@/data/d"


const route = useRoute()

const bossId = computed(() => Number(route.params.bossId))
const boss = computed(() => hardBossMap.get(bossId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div v-if="boss" class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <!-- 使用 HardbossDetailItem 组件显示梦魇残声详情 -->
            <DBHardbossDetailItem :boss="boss" />
        </div>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到梦魇残声</div>
        </div>
    </ScrollArea>
</template>
