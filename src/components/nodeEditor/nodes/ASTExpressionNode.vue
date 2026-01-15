<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { NodeProps } from "@vue-flow/core"

const props = defineProps<NodeProps>()

const store = useNodeEditorStore()

// AST 表达式
const expression = computed({
    get: () => props.data.expression,
    set: value => {
        store.updateNodeData(props.id, { expression: value })
    },
})

// 验证表达式
const validationError = computed(() => {
    if (!expression.value) return null

    try {
        const charBuild = store.getConnectedCharBuild(props.id)
        if (!charBuild) return "缺少核心计算节点"
        return charBuild.validateAST(expression.value) || null
    } catch (error) {
        console.error("AST验证错误:", error)
        return error instanceof Error ? error.message : "未知错误"
    }
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="space-y-2 text-sm">
            <div>
                <label class="text-xs text-base-content/60 block mb-1">表达式</label>
                <input v-model="expression" type="text" class="input input-bordered input-xs w-full" placeholder="伤害" />
            </div>

            <div v-if="validationError" class="text-xs text-error">
                {{ validationError }}
            </div>
            <!-- 计算结果预览 -->
            <div v-if="data.result">
                <div class="font-semibold text-xs text-base-content/60">结果</div>
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-lg text-primary font-orbitron">{{ data.result.value?.toFixed(0) || "0" }}</span>
                </div>
            </div>

            <!-- 提示信息 -->
            <div v-else class="text-xs text-yellow-500">等待输入...</div>
        </div>
    </BaseNode>
</template>
