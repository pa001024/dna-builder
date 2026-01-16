<script setup lang="ts">
import type { NodeProps } from "@vue-flow/core"
import { Handle, Position } from "@vue-flow/core"
import BaseNode from "./BaseNode.vue"

// 定义节点属性
defineProps<NodeProps>()
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected" title="完整计算" description="基于核心计算节点的完整伤害计算">
        <!-- 输入手柄 -->
        <Handle
            id="input"
            type="target"
            :position="Position.Left"
            style="top: 50%"
            class="w-3 h-3 bg-blue-500 border-2 border-white shadow-md"
        />

        <!-- 节点内容 -->
        <div class="space-y-2">
            <!-- 计算结果预览 -->
            <div v-if="data.result">
                <div class="font-semibold text-xs text-base-content/60">结果</div>
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-lg text-primary font-orbitron">{{ data.result?.value?.toFixed(0) || "0" }}</span>
                </div>
            </div>

            <!-- 提示信息 -->
            <div v-else class="text-xs text-yellow-500">等待输入...</div>
        </div>
    </BaseNode>
</template>
