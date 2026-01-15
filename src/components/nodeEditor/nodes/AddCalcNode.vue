<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import type { NodeProps } from "@vue-flow/core"

// 定义节点属性
defineProps<NodeProps>()
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected" title="加法计算" description="计算输入值的总和">
        <!-- 节点内容 -->
        <div class="space-y-2">
            <!-- 计算结果预览 -->
            <div v-if="data.result">
                <div class="font-semibold text-xs text-base-content/60">结果</div>
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-lg text-primary font-orbitron">{{ data.result?.value?.toFixed(2) || "0" }}</span>
                </div>
            </div>

            <!-- 提示信息 -->
            <div v-else class="text-xs text-yellow-500">等待输入...</div>
        </div>
    </BaseNode>
</template>
