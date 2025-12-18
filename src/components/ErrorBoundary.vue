<template>
    <!-- 正常渲染子组件 -->
    <slot v-if="!hasError" />
    <!-- 出错时展示备用 UI -->
    <div v-else class="flex w-full h-full items-center justify-center">
        <div class="p-5 bg-red-50 border border-red-200 rounded text-red-600">
            <h3 class="mb-2 font-semibold">组件渲染出错</h3>
            <p>{{ errorMessage }}</p>
            <button @click="resetError" class="mt-3 px-3 py-1 btn btn-primary btn-block">重试</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from "vue"

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
