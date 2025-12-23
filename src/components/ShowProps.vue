<script setup lang="ts">
import { formatProp } from "../util"
withDefaults(
    defineProps<{
        props: Record<string, any>
        code?: string
        side?: "top" | "bottom" | "left" | "right"
        title?: string
        desc?: string
        polarity?: "A" | "D" | "V" | "O"
        cost?: number
        type?: string
        eff?: boolean
    }>(),
    {
        side: "top",
    },
)
</script>
<template>
    <FullTooltip :side="side">
        <template #tooltip>
            <div class="flex flex-col gap-2 max-w-[300px]">
                <div v-if="title" class="text-sm font-bold">{{ title }}</div>
                <div v-if="polarity || cost" class="ml-auto badge badge-sm badge-soft gap-1 text-base-content/80">
                    {{ cost }}
                    <Icon v-if="polarity" :icon="`po-${polarity}`" />
                </div>
                <div
                    v-for="[prop, val] in Object.entries(props).filter(([_, v]) => v)"
                    :key="prop"
                    class="flex justify-between items-center gap-2 text-sm"
                >
                    <div class="text-xs text-neutral-500">{{ prop }}</div>
                    <div class="font-medium text-primary">{{ formatProp(prop, val) }}</div>
                </div>
                <div v-if="desc" class="text-xs text-neutral-500">
                    {{ desc }}
                    <div v-if="eff" class="text-xs text-success">(已生效)</div>
                </div>

                <div v-if="code" class="text-xs text-gray-400">
                    <div class="text-xs text-neutral-500">{{ $t("char-build.dynamic_prop") }}</div>
                    {{ code }}
                </div>
                <div v-if="type" class="text-xs text-neutral-500 font-bold">{{ type }}</div>
            </div>
        </template>
        <slot></slot>
    </FullTooltip>
</template>
