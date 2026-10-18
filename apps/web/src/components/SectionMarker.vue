<script setup lang="ts">
import { computed } from "vue"

// 模块作用域变量：在组件每次被使用时自增
let counter = (globalThis as any).__chapterCounter || 1

const props = defineProps<{ reset?: boolean }>()

// 颜色列表
const colors = [
    "bg-amber-500", // 琥珀色
    "bg-blue-500", // 蓝色
    "bg-green-500", // 绿色
    "bg-purple-500", // 紫色
    "bg-red-500", // 红色
    "bg-yellow-500", // 黄色
    "bg-cyan-500", // 青色
    "bg-pink-500", // 粉色
]

// 重置计数器
if (props.reset) {
    counter = (globalThis as any).__chapterCounter = 1
}

// 为每个组件实例分配一个唯一的数字，在创建时就递增计数器
++(globalThis as any).__chapterCounter

// 计算属性：根据实例数字获取颜色
const colorClass = computed(() => colors[(counter - 1) % colors.length])
</script>

<template>
    <div :class="['w-5 h-5 rounded-sm flex items-center justify-center text-white', colorClass]">
        <!-- <span class="text-xs">{{ counter }}</span> -->
        <slot />
    </div>
</template>
