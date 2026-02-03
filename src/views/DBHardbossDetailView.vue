<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { hardBossMap } from "../data/d/hardboss.data"

const route = useRoute()

const bossId = computed(() => Number(route.params.bossId))
const boss = computed(() => hardBossMap.get(bossId.value))
</script>

<template>
    <ScrollArea class="h-full">
        <template v-if="boss">
            <!-- 使用 HardbossDetailItem 组件显示Boss详情 -->
            <DBHardbossDetailItem :boss="boss" />
        </template>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到梦魇残声</div>
        </div>
    </ScrollArea>
</template>
