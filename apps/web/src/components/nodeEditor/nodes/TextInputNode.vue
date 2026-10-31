<script setup lang="ts">
import { ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const text = ref(typeof props.data.value === "string" ? props.data.value : "")

if (props.data.value === undefined) props.data.value = ""

watch(
    () => props.data.value,
    value => {
        if (typeof value === "string" && value !== text.value) text.value = value
    }
)

function commit() {
    store.updateNodeData(props.id, { value: text.value })
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <textarea
            v-model="text"
            class="nodrag nowheel min-h-16 w-70 resize-y rounded-none border border-base-content/15 bg-base-100/60 p-1.5 text-[12px] leading-relaxed outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary/60"
            placeholder="输入文本..."
            @input="commit"
        />
    </BaseNode>
</template>
