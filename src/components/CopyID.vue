<script setup lang="ts">
import { copyText } from "@/util"

defineProps<{
    id: string | number
}>()
</script>
<template>
    <button
        type="button"
        class="px-1.5 py-0.5 cursor-pointer rounded bg-base-200 text-xs hover:bg-primary/20 transition-colors duration-200"
        title="点击复制ID"
        @click="copyText(`${id}`)"
    >
        ID {{ id }}
    </button>
</template>
