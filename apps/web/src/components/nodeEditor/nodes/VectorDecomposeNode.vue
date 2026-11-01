<script setup lang="ts">
import { useVueFlow } from "@vue-flow/core"
import { computed, watch } from "vue"
import { formatExpressionValue } from "@/util"
import { vectorDecomposePortId } from "@/utils/nodeEditorPorts"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const { updateNodeInternals } = useVueFlow()

const items = computed(() => {
    const labels: string[] = Array.isArray(props.data.vectorLabels)
        ? props.data.vectorLabels.filter((label: unknown): label is string => typeof label === "string")
        : []
    const result = props.data.result && typeof props.data.result === "object" ? props.data.result : {}
    return labels.map((label, index) => {
        const value = result[vectorDecomposePortId(index)]
        return { label: label || `数值${index + 1}`, value: typeof value === "number" ? value : undefined }
    })
})

// 输出端口随向量长度增减，通知 VueFlow 重新测量连接点
watch(
    () => items.value.length,
    () => {
        requestAnimationFrame(() => updateNodeInternals([props.id]))
    }
)
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-60 max-w-full space-y-1">
            <div v-if="items.length === 0" class="text-[10px] leading-snug text-base-content/40">
                连接向量输入后，按分量自动生成数值输出
            </div>
            <template v-else>
                <div class="flex items-center justify-between text-[10px] text-base-content/45">
                    <span>共 {{ items.length }} 项</span>
                    <span>分量 → 数值</span>
                </div>
                <div class="nowheel max-h-36 space-y-0.5 overflow-y-auto pr-0.5" @wheel.stop>
                    <div v-for="(item, index) in items" :key="index" class="flex items-center gap-2">
                        <span class="w-4 shrink-0 text-right font-mono text-[10px] tabular-nums text-base-content/30">{{ index + 1 }}</span>
                        <span class="min-w-0 flex-1 truncate text-[10px] text-base-content/55" :title="item.label">{{ item.label }}</span>
                        <span class="shrink-0 font-mono text-[11px] tabular-nums text-base-content/80">
                            {{ item.value === undefined ? "-" : formatExpressionValue(item.value) }}
                        </span>
                    </div>
                </div>
            </template>
        </div>
    </BaseNode>
</template>
