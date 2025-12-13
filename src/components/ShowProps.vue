<script setup lang="ts">
import { formatProp } from "../util"
withDefaults(
    defineProps<{
        props: Record<string, any>
        code?: string
        side?: "top" | "bottom" | "left" | "right"
        title?: string
        type?: string
    }>(),
    {
        side: "top",
    },
)
</script>
<template>
    <FullTooltip :side="side">
        <template #tooltip>
            <div class="flex flex-col gap-2 text-gray-700 max-w-[300px]">
                <div v-if="title" class="text-sm font-bold">{{ title }}</div>
                <div v-if="type" class="text-xs text-neutral-500 font-bold">{{ type }}</div>
                <div v-for="(val, prop) in props" :key="prop" class="flex justify-between items-center gap-2 text-sm">
                    <div class="text-xs text-neutral-500">{{ prop }}</div>
                    <div class="font-medium text-primary">{{ formatProp(prop, val) }}</div>
                </div>
                <div v-if="code" class="text-xs text-gray-400">
                    <div class="text-xs text-neutral-500">{{ $t("char-build.dynamic_prop") }}</div>
                    {{ code }}
                </div>
            </div>
        </template>
        <slot></slot>
    </FullTooltip>
</template>
