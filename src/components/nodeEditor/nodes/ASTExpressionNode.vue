<script setup lang="ts">
import { NodeProps } from "@vue-flow/core"
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<NodeProps>()

const store = useNodeEditorStore()
const { t } = useTranslation()

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
        if (!charBuild) return t("node-editor.astExpression.missingCore")
        return charBuild.validateAST(expression.value) || null
    } catch (error) {
        console.error("AST验证错误:", error)
        return error instanceof Error ? error.message : t("node-editor.astExpression.unknownError")
    }
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }" :title="$t('node-editor.astExpression.title')" :description="$t('node-editor.astExpression.description')">
        <div class="space-y-2 text-sm">
            <div>
                <label class="text-xs text-base-content/60 block mb-1">{{ $t("node-editor.astExpression.expression") }}</label>
                <input v-model="expression" type="text" class="input input-bordered input-xs w-full" :placeholder="$t('node-editor.astExpression.expressionPlaceholder')" />
            </div>

            <div v-if="validationError" class="text-xs text-error">
                {{ validationError }}
            </div>
            <!-- 计算结果预览 -->
            <div v-if="data.result">
                <div class="font-semibold text-xs text-base-content/60">{{ $t("node-editor.astExpression.result") }}</div>
                <div class="flex justify-between items-center mb-1">
                    <span class="font-bold text-lg text-primary font-orbitron">{{ data.result.value?.toFixed(0) || "0" }}</span>
                </div>
            </div>

            <!-- 提示信息 -->
            <div v-else class="text-xs text-yellow-500">{{ $t("node-editor.astExpression.waiting") }}</div>
        </div>
    </BaseNode>
</template>
