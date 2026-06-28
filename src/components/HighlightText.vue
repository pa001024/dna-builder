<script lang="ts" setup>
import { computed } from "vue"
import { buildSearchTextSegments } from "@/utils/story-text"

const props = defineProps<{
    text: string
    keyword?: string
}>()

const textSegments = computed(() => buildSearchTextSegments(props.text, props.keyword || ""))
</script>

<template>
    <span class="whitespace-pre-wrap wrap-break-word">
        <template v-for="(segment, index) in textSegments" :key="`${index}-${segment.highlighted ? 1 : 0}`">
            <span v-if="segment.highlighted" class="rounded bg-primary/20 px-0.5 font-semibold text-primary">
                {{ segment.text }}
            </span>
            <span v-else>{{ segment.text }}</span>
        </template>
    </span>
</template>
