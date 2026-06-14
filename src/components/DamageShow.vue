<script setup lang="ts">
import { formatBigNumber } from "@/util"

const props = defineProps<{
    value: number
}>()

function formatDamage(v: number) {
    if (v >= 1e8) {
        return formatBigNumber(v, 6)
    } else if (v < 1) {
        return v
    } else {
        return v.toFixed(0)
    }
}
</script>
<template>
    <div class="text-primary font-bold text-md font-orbitron">
        {{ formatDamage(value) }}
    </div>
</template>
