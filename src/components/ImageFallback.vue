<script setup lang="ts">
    import { computed, ref, watch } from "vue"
    import { swapCdnBase } from "@/utils/cdn"

    const props = defineProps({
        src: {
            type: String,
            required: true,
        },
        alt: {
            type: String,
            default: "",
        },
        /** 是否在主基址失败时自动回退到兜底基址（仅对站内 CDN 相对路径生效） */
        cdnFallback: {
            type: Boolean,
            default: true,
        },
    })

    const isLoading = ref(true)
    const hasError = ref(false)
    /** 当前已回退到兜底源的次数，最多回退一次，避免死循环 */
    const fallbackTried = ref(false)

    /** 解析出的主源地址 */
    const primarySrc = computed(() => props.src.trim())

    /** 实际渲染的地址：主源失败后切成兜底源 */
    const renderSrc = ref(primarySrc.value)

    /**
     * 重置图片状态，保证在 src 变化时重新进入加载流程。
     */
    function resetState() {
        fallbackTried.value = false
        renderSrc.value = primarySrc.value
        hasError.value = primarySrc.value.length === 0
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
     * 图片加载失败：主源失败时先切到兜底源重试，两个源都失败才展示插槽兜底内容。
     */
    function handleError() {
        if (!fallbackTried.value) {
            const backupUrl = props.cdnFallback ? swapCdnBase(renderSrc.value) : null
            if (backupUrl) {
                fallbackTried.value = true
                renderSrc.value = backupUrl
                return
            }
        }

        isLoading.value = false
        hasError.value = true
    }

    watch(primarySrc, resetState, { immediate: true })
</script>

<template>
    <div class="inline-flex justify-center items-center relative">
        <img v-if="!hasError" v-bind="$attrs" :src="renderSrc" :alt="alt" @load="handleLoad" @error="handleError" />
        <slot v-else />
    </div>
</template>
