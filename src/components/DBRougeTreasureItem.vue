<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { rougeLikeTreasures, rougeProTreasures } from "@/data/d/rouge.data"

const props = defineProps<{
    id: number
}>()

const route = useRoute()

/**
 * 从当前迷津路由判断遗物所属模式，避免两套数据中重复 ID 产生歧义。
 */
const mode = computed(() => {
    return route.params.mode === "pro" || route.query.mode === "pro" ? "pro" : "like"
})

/**
 * 按当前模式和 ID 查找遗物数据。
 */
const treasure = computed(() => {
    const treasures = mode.value === "pro" ? rougeProTreasures : rougeLikeTreasures
    return treasures.find(item => item.id === props.id)
})

/**
 * 获取遗物图标地址。
 */
const iconUrl = computed(() => {
    const icon = treasure.value?.icon?.trim()
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
})
</script>

<template>
    <SRouterLink
        :to="`/db/rouge/${mode}/treasure/${id}`"
        class="flex min-w-0 items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2 transition-colors duration-200 hover:border-primary/40"
    >
        <div class="size-10 shrink-0 overflow-hidden rounded-xs bg-linear-15">
            <ImageFallback :src="iconUrl" :alt="treasure?.name || `ID ${id}`" class="size-10 object-contain">
                <img src="/imgs/webp/T_Head_Empty.webp" :alt="treasure?.name || `ID ${id}`" class="size-10 object-contain" />
            </ImageFallback>
        </div>
        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ treasure?.name || `未知遗物 ${id}` }}</span>
                <span class="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-base-content/35">ID {{ id }}</span>
            </div>
            <div v-if="treasure?.simpleDesc" class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-base-content/55">
                {{ treasure.simpleDesc }}
            </div>
        </div>
    </SRouterLink>
</template>
