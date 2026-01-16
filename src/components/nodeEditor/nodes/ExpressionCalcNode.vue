<script setup lang="ts">
import type { NodeProps } from "@vue-flow/core"
import { Handle, Position, useVueFlow } from "@vue-flow/core"
import { computed, ref } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<NodeProps>()
const store = useNodeEditorStore()

// 表达式输入
const expression = ref<string>(props.data.expression || "a + b")

// 更新表达式
const updateExpression = () => {
    store.updateNodeData(props.id, { expression: expression.value })
}

// 计算结果
const result = computed(() => {
    return props.data.result?.value || 0
})

// 输入数量
const inputCount = ref<number>(2)
const { updateNodeInternals } = useVueFlow()
// 更新输入数量
const updateInputCount = () => {
    store.updateNodeData(props.id, { inputCount: inputCount.value })
    updateNodeInternals([props.id])
}
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <template #input>
            <!-- 动态输入手柄 -->
            <Handle
                v-for="i in inputCount"
                :id="`input${i}`"
                :key="`input${i}`"
                type="target"
                :position="Position.Left"
                :style="{ top: `${(i / (inputCount + 1)) * 100}%` }"
                class="w-3 h-3 bg-blue-500 border-2 border-white shadow-md"
            >
                <span class="mr-2 whitespace-nowrap text-xs text-base-content/60">{{ String.fromCharCode(96 + i) }}</span>
            </Handle>
        </template>

        <!-- 节点内容 -->
        <div class="space-y-2">
            <!-- 表达式输入 -->
            <div>
                <label class="block text-xs font-semibold text-base-content/60 mb-1">表达式</label>
                <input
                    v-model="expression"
                    type="text"
                    placeholder="例如: a + b * c"
                    class="w-full input input-sm text-xs"
                    @input="updateExpression"
                />
            </div>

            <!-- 输入数量设置 -->
            <div class="flex items-center gap-2">
                <label class="text-xs font-semibold text-base-content/60">输入数量:</label>
                <Select v-model.number="inputCount" class="input input-sm text-xs w-24" @change="updateInputCount">
                    <SelectItem :value="1">1</SelectItem>
                    <SelectItem :value="2">2</SelectItem>
                    <SelectItem :value="3">3</SelectItem>
                    <SelectItem :value="4">4</SelectItem>
                    <SelectItem :value="5">5</SelectItem>
                </Select>
            </div>

            <!-- 计算结果预览 -->
            <div>
                <div class="font-semibold text-xs text-base-content/60 mb-1">结果</div>
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-lg text-primary font-orbitron">{{ result?.toFixed(2) || "0" }}</span>
                </div>
            </div>

            <!-- 错误信息 -->
            <div v-if="data.error" class="text-xs text-red-500">{{ data.error }}</div>
        </div>
    </BaseNode>
</template>
