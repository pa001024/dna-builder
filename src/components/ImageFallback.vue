<script setup>
import { useImage } from "@vueuse/core"

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

const { isLoading, error } = useImage({
    src: props.src,
})
</script>

<template>
    <div class="inline-flex justify-center items-center relative">
        <div v-if="isLoading" class="absolute w-12 h-12 m-auto animate-spin rounded-full border-b-2 border-base-content" />
        <img v-if="!error" v-bind="$attrs" :src="src" :alt="alt" />
        <slot v-else />
    </div>
</template>
