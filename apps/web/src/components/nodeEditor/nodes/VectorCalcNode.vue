<script setup lang="ts">
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatExpressionValue } from "@/util"
import { readVectorCalcMode, VECTOR_CALC_MODES, type VectorCalcMode } from "@/utils/nodeEditorBuild"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const mode = computed(() => readVectorCalcMode(props.data))
const modeLabel = computed(() => VECTOR_CALC_MODES.find(item => item.mode === mode.value)?.label ?? "")
const result = computed(() => (typeof props.data.result?.value === "number" ? (props.data.result.value as number) : undefined))
const count = computed(() => (typeof props.data.result?.count === "number" ? (props.data.result.count as number) : undefined))

/** 切换计算模式并重算 */
function setMode(next: VectorCalcMode) {
    if (next === mode.value) return
    store.updateNodeData(props.id, { mode: next })
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-55 max-w-full space-y-1.5">
            <div class="flex items-center gap-2">
                <span class="shrink-0 text-[10px] text-base-content/45">计算模式</span>
                <Select
                    :model-value="mode"
                    class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[11px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
                    @update:model-value="setMode($event)"
                >
                    <SelectItem v-for="item in VECTOR_CALC_MODES" :key="item.mode" :value="item.mode">
                        {{ item.label }}
                    </SelectItem>
                </Select>
            </div>
            <div>
                <div class="text-[10px] text-base-content/45">{{ modeLabel }}结果{{ count === undefined ? "" : ` · 共 ${count} 项` }}</div>
                <div class="font-orbitron text-[13px] font-bold tabular-nums text-primary">
                    {{ result === undefined ? "-" : formatExpressionValue(result) }}
                </div>
            </div>
            <div v-if="data.error" class="text-[10px] text-red-500">{{ data.error }}</div>
        </div>
    </BaseNode>
</template>
