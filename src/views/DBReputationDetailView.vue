<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import reputationData from "@/data/d/reputation.data"

const route = useRoute()

/**
 * 从路由参数中读取区域声名 ID。
 */
const reputationId = computed(() => Number(route.params.reputationId))

/**
 * 根据区域声名 ID 获取详情数据。
 */
const reputation = computed(() => reputationData.find(item => item.id === reputationId.value))
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <ScrollArea v-if="reputation" class="flex-1">
            <DBReputationDetailItem :reputation="reputation" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">{{ $t("reputation.notFound") }}</div>
        </div>
    </div>
</template>
