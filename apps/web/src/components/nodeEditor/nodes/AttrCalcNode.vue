<script setup lang="ts">
import { computed } from "vue"
import { getNodePorts } from "@/utils/nodeEditorPorts"
import AttributeOutputList from "./AttributeOutputList.vue"
import BaseNode from "./BaseNode.vue"
import NodePortRow from "./NodePortRow.vue"
import VectorResultTable from "./VectorResultTable.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

// 计算角色属性
const attrs = computed<Record<string, number> | null>(() => props.data.result)

const ports = computed(() => getNodePorts(props.type, props.data))
const buildInput = computed(() => ports.value.inputs[0])
const attrsOutput = computed(() => ports.value.outputs[0])
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <template #ports>
            <NodePortRow :input="buildInput" :output="attrsOutput" />
        </template>
        <div class="w-62.5 max-w-full space-y-1 text-[11px]">
            <div v-if="data.error" class="text-[11px] text-error">{{ data.error }}</div>
            <div v-else-if="!attrs" class="text-[11px] text-base-content/45">{{ $t("node-editor.attrCalc.waiting") }}</div>
            <AttributeOutputList
                kind="char"
                :values="attrs"
                :vectors="data.attributeVectorValues"
                :char-build="data.charBuild"
            />
        </div>
        <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
    </BaseNode>
</template>
