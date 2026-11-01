<script setup lang="ts">
import { ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"
import NumberRowInput from "./NumberRowInput.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const value = ref(typeof props.data.value === "number" && Number.isFinite(props.data.value) ? props.data.value : 0)

if (typeof props.data.value !== "number" || !Number.isFinite(props.data.value)) props.data.value = value.value

watch(
    () => props.data.value,
    next => {
        if (typeof next === "number" && Number.isFinite(next) && next !== value.value) value.value = next
    }
)

function commit() {
    store.updateNodeData(props.id, { value: value.value })
}

/** 行输入组件的提交入口：按钮 / 拖动 / 输入都走这里 */
function setValue(next: number) {
    value.value = next
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <NumberRowInput class="w-47.5 max-w-full" :model-value="value" :step="1" @update:model-value="setValue" />
    </BaseNode>
</template>
