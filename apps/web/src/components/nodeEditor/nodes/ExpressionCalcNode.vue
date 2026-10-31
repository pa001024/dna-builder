<script setup lang="ts">
import type { NodeProps } from "@vue-flow/core"
import { useVueFlow } from "@vue-flow/core"
import { computed, ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatDamage } from "@/util"
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
const inputCount = ref<number>(Number(props.data.inputCount) || 2)
const { updateNodeInternals } = useVueFlow()
// 更新输入数量：端口行随 inputCount 增减，通知 VueFlow 重新测量连接点
const updateInputCount = () => {
    store.updateNodeData(props.id, { inputCount: inputCount.value })
    requestAnimationFrame(() => updateNodeInternals([props.id]))
}

watch(
    () => props.data.inputCount,
    value => {
        inputCount.value = Number(value) || 2
        requestAnimationFrame(() => updateNodeInternals([props.id]))
    }
)
</script>

<template>
    <BaseNode
        :id="id"
        :data="data"
        :type="type"
        :selected="selected"
        :title="$t('node-editor.expressionCalc.title')"
        :description="$t('node-editor.expressionCalc.description')"
    >
        <!-- 节点内容 -->
        <div class="w-55 max-w-full space-y-1.5">
            <!-- 表达式输入 -->
            <div>
                <label class="mb-0.5 block text-[10px] text-base-content/45">{{ $t("node-editor.expressionCalc.expression") }}</label>
                <input
                    v-model="expression"
                    type="text"
                    :placeholder="$t('node-editor.expressionCalc.expressionPlaceholder')"
                    class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 font-mono text-[11px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                    @input="updateExpression"
                />
            </div>

            <!-- 输入数量设置 -->
            <div class="flex items-center gap-2">
                <label class="text-[10px] text-base-content/45">{{ $t("node-editor.expressionCalc.inputCount") }}</label>
                <Select
                    v-model.number="inputCount"
                    class="w-16 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[11px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                    @change="updateInputCount"
                >
                    <SelectItem :value="1">1</SelectItem>
                    <SelectItem :value="2">2</SelectItem>
                    <SelectItem :value="3">3</SelectItem>
                    <SelectItem :value="4">4</SelectItem>
                    <SelectItem :value="5">5</SelectItem>
                </Select>
            </div>

            <!-- 计算结果预览 -->
            <div>
                <div class="text-[10px] text-base-content/45">{{ $t("node-editor.expressionCalc.result") }}</div>
                <div class="font-orbitron text-[13px] font-bold tabular-nums text-primary">{{ formatDamage(result) }}</div>
            </div>

            <!-- 错误信息 -->
            <div v-if="data.error" class="text-[10px] text-red-500">{{ data.error }}</div>
        </div>
    </BaseNode>
</template>
