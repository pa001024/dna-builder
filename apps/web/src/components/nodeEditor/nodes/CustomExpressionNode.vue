<script setup lang="ts">
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatExpressionValue } from "@/util"
import BaseNode from "./BaseNode.vue"
import VectorResultTable from "./VectorResultTable.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

// 只读取构筑输入端口传来的构筑，不使用下游或全图搜索的构筑
const context = computed(() => store.getInputBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)

const variables = computed<[string, string][]>(() => {
    const build = charBuild.value
    return (context.value?.settings.customVariables ?? []).filter(([name]) => !build?.parseCustomFunctionDefinition(name))
})

const selectedVariable = computed(() => (typeof props.data.selectedVariable === "string" ? props.data.selectedVariable : ""))
const selectedEntry = computed(() => variables.value.find(([name]) => name === selectedVariable.value))

const resultValue = computed(() => {
    const value = props.data.result?.value
    return typeof value === "number" ? value : null
})

const resultText = computed(() => (resultValue.value === null ? "-" : formatExpressionValue(resultValue.value)))

/** 切换变量：清掉旧求值结果，避免切换瞬间显示上一个变量的数值 */
function selectVariable(value: string) {
    store.updateNodeData(props.id, {
        selectedVariable: value,
        result: undefined,
        evaluation: undefined,
        evalSignature: undefined,
    })
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-80 max-w-full space-y-1.5">
            <div>
                <label class="mb-0.5 block text-[10px] text-base-content/45">构筑中的自定义变量</label>
                <Select
                    :model-value="selectedVariable"
                    class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                    placeholder="请选择变量"
                    :disabled="!context || variables.length === 0"
                    @update:model-value="selectVariable"
                >
                    <SelectItem v-for="[name] in variables" :key="name" :value="name">{{ name }}</SelectItem>
                </Select>
            </div>

            <div v-if="!context" class="text-[10px] text-yellow-500">缺少构筑输入</div>
            <div v-else-if="variables.length === 0" class="text-[10px] text-base-content/45">构筑中没有可求值的自定义变量</div>
            <div v-else-if="selectedVariable && !selectedEntry" class="text-[10px] text-red-500">
                变量「{{ selectedVariable }}」已不存在
            </div>
            <div v-else-if="selectedEntry">
                <div class="mb-0.5 break-all font-mono text-[10px] text-base-content/45">
                    {{ selectedEntry[0] }} = {{ selectedEntry[1] }}
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-base-content/45">数值</span>
                    <span class="font-orbitron text-[13px] font-bold tabular-nums text-primary">{{ resultText }}</span>
                    <span v-if="data.evalPending" class="loading loading-spinner loading-xs" />
                </div>
            </div>

            <div v-if="data.error" class="text-[10px] text-red-500">{{ data.error }}</div>
            <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
        </div>
    </BaseNode>
</template>
