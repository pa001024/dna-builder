<script setup lang="ts">
import { formatDamage } from "@/util"

defineProps<{
    value: number
}>()
</script>
<template>
    <div class="text-primary font-bold text-md font-orbitron">
        {{ formatDamage(value) }}
    </div>
</template>
