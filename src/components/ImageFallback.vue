<script setup lang="ts">
import { computed, ref, watch } from "vue"

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

const isLoading = ref(true)
const hasError = ref(false)
const normalizedSrc = computed(() => props.src.trim())

/**
 * 重置图片状态，保证在 src 变化时重新进入加载流程。
 */
function resetState() {
    hasError.value = normalizedSrc.value.length === 0
    isLoading.value = !hasError.value
}

/**
 * 图片加载成功后关闭加载态并清理错误态。
 */
function handleLoad() {
    isLoading.value = false
    hasError.value = false
}

/**
 * 图片加载失败后展示插槽中的兜底内容。
 */
function handleError() {
    isLoading.value = false
    hasError.value = true
}

watch(normalizedSrc, resetState, { immediate: true })
</script>

<template>
    <div class="inline-flex justify-center items-center relative">
        <div v-if="isLoading && !hasError" class="absolute w-12 h-12 m-auto animate-spin rounded-full border-b-2 border-base-content" />
        <img v-if="!hasError" v-bind="$attrs" :src="normalizedSrc" :alt="alt" @load="handleLoad" @error="handleError" />
        <slot v-else />
    </div>
</template>
