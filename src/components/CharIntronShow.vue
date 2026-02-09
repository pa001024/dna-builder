<script setup lang="ts">
import type { LeveledChar } from "@/data"

const props = defineProps<{
    char: LeveledChar
}>()
</script>
<template>
    <h2 v-if="char.溯源" class="text-lg font-bold p-2 mt-2">
        {{ $t("溯源") }}
    </h2>
    <div v-if="char.溯源" class="flex flex-col gap-2 p-2">
        <div v-for="(grade, i) in char.溯源" :key="i" class="font-medium flex text-sm justify-between items-center gap-8">
            <div class="font-medium whitespace-nowrap opacity-70">
                {{ $t("第" + ["一", "二", "三", "四", "五", "六"][i] + "根源") }}
            </div>
            <div>{{ $t(grade) }}</div>
        </div>
    </div>
</template>
