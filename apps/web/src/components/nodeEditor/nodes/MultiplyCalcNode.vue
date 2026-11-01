<script setup lang="ts">
import type { NodeProps } from "@vue-flow/core"
import { useVueFlow } from "@vue-flow/core"
import { useTranslation } from "i18next-vue"
import { ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatDamage } from "@/util"
import BaseNode from "./BaseNode.vue"
import NumberRowInput from "./NumberRowInput.vue"

const props = defineProps<NodeProps>()
const store = useNodeEditorStore()
const { updateNodeInternals } = useVueFlow()

const { t } = useTranslation()

/** 输入数量：旧图没有该字段时默认 4，与原固定端口一致 */
const inputCount = ref(Number(props.data.inputCount) || 4)

/** 输入数量：数值组件增减端口，钳制在 1-5 */
function setInputCount(next: number) {
    if (!Number.isFinite(next)) return
    inputCount.value = Math.min(5, Math.max(1, Math.round(next)))
    store.updateNodeData(props.id, { inputCount: inputCount.value })
    requestAnimationFrame(() => updateNodeInternals([props.id]))
}

watch(
    () => props.data.inputCount,
    value => {
        inputCount.value = Number(value) || 4
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
        :title="t('node-editor.multiplyCalc.title')"
        :description="t('node-editor.multiplyCalc.description')"
    >
        <!-- 节点内容 -->
        <div class="w-45 max-w-full space-y-1.5">
            <!-- 输入数量设置 -->
            <div class="flex items-center gap-2">
                <span class="text-[10px] text-base-content/45">{{ t("node-editor.expressionCalc.inputCount") }}</span>
                <NumberRowInput
                    class="min-w-0 flex-1"
                    :model-value="inputCount"
                    :min="1"
                    :max="5"
                    :step="1"
                    :precision="0"
                    @update:model-value="setInputCount($event)"
                />
            </div>
            <!-- 计算结果预览 -->
            <div v-if="data.result">
                <div class="text-[10px] text-base-content/45">{{ t("node-editor.multiplyCalc.result") }}</div>
                <div class="font-orbitron text-[13px] font-bold tabular-nums text-primary">{{ formatDamage(data.result?.value ?? 0) }}</div>
            </div>

            <!-- 提示信息 -->
            <div v-else class="text-[10px] text-yellow-500">{{ t("node-editor.multiplyCalc.waiting") }}</div>
        </div>
    </BaseNode>
</template>
