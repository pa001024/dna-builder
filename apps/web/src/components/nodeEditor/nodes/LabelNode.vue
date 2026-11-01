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
const text = ref(typeof props.data.text === "string" ? props.data.text : "")

if (props.data.text === undefined) props.data.text = ""

watch(
    () => props.data.text,
    value => {
        if (typeof value === "string" && value !== text.value) text.value = value
    }
)

function commit() {
    store.updateNodeData(props.id, { text: text.value })
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <textarea
            v-model="text"
            class="nodrag nowheel min-h-20 w-75 resize-y rounded-none border border-base-content/15 bg-base-100/60 p-1.5 text-[12px] leading-relaxed outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary/60"
            placeholder="输入说明文字..."
            @input="commit"
            @pointerdown.stop
            @mousedown.stop
        />
    </BaseNode>
</template>
