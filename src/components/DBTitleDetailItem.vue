<script lang="ts" setup>
import { computed } from "vue"
import type { Title } from "@/data/d/title.data"

const props = defineProps<{
    title: Title
}>()

const titleTypeLabel = computed(() => {
    return props.title.suf ? "后缀" : "前缀"
})

const titlePreview = computed(() => {
    const playerName = "玩家昵称"
    return props.title.suf ? `${playerName} · ${props.title.name}` : `${props.title.name} · ${playerName}`
})
</script>

<template>
    <div class="p-4 space-y-4">
        <div class="flex items-center gap-3 p-3 rounded-md bg-base-200">
            <img src="/imgs/webp/T_Icon_Random_Title.webp" alt="title-icon" class="w-12 h-12 object-cover rounded" />
            <div>
                <h2 class="text-lg font-bold">{{ title.name }}</h2>
                <p class="text-sm text-base-content/70">ID: {{ title.id }}</p>
            </div>
            <span class="ml-auto badge badge-primary">{{ titleTypeLabel }}</span>
        </div>

        <div class="p-3 rounded-md bg-base-200">
            <h3 class="font-medium mb-2">称号预览</h3>
            <p class="text-base">{{ titlePreview }}</p>
        </div>

        <div class="p-3 rounded-md bg-base-200">
            <h3 class="font-medium mb-2">来源</h3>
            <p class="text-sm leading-6 break-all">{{ title.src || "暂无来源说明" }}</p>
        </div>
    </div>
</template>
