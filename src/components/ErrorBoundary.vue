<template>
    <!-- 正常渲染子组件 -->
    <slot v-if="!hasError" />
    <!-- 出错时展示备用 UI -->
    <div v-else class="h-full bg-linear-to-br from-base-200/30 to-base-300/30 flex items-center justify-center p-4">
        <div class="max-w-md w-full bg-base-100 rounded-xl shadow-lg overflow-hidden border border-base-100">
            <div class="bg-red-500/10 px-6 py-4">
                <div class="flex items-center justify-center w-16 h-16 bg-red-500/10 rounded-full mx-auto mb-4">
                    <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-center mb-2">
                    {{ $t("errorBoundary.title") || "组件渲染出错" }}
                </h3>
            </div>
            <div class="px-6 py-6">
                <div class="bg-base-200/50 p-4 rounded-lg border border-base-200 mb-4">
                    <p class="text-base-600 text-center font-medium">
                        {{ errorMessage }}
                    </p>
                </div>
                <button
                    class="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    @click="resetError"
                >
                    {{ $t("errorBoundary.retry") || "重试" }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from "vue"

const hasError = ref(false)
const errorMessage = ref("")

// 捕获子孙组件错误

const resetError = () => {
    hasError.value = false
    errorMessage.value = ""
    // localStorage.clear()
}

onErrorCaptured((err, vm, info) => {
    console.error("捕获到错误:", err, vm, info)
    hasError.value = true
    errorMessage.value = (err as any).message || "未知错误"
    // 返回 false 阻止错误继续向上传播
    return false
})
</script>
