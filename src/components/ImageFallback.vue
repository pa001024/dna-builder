<script setup>
import { useImage } from "@vueuse/core"
import { computed } from "vue"

const props = defineProps({
    src: {
        type: String,
        required: true,
    },
    alt: {
        type: String,
        default: "",
    },
})

const { isLoading, error } = useImage({ src: props.src })
</script>

<template>
    <div v-if="isLoading" class="w-12 h-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
    <img v-bind="$attrs" v-if="!error" :src="src" :alt="alt" />
    <slot v-else></slot>
</template>
