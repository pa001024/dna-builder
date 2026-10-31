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

function onInput(event: Event) {
    const parsed = Number((event.target as HTMLInputElement).value)
    value.value = Number.isFinite(parsed) ? parsed : 0
    commit()
}

/** 按步长调整数值（保留三位小数，避免浮点尾差） */
function adjust(delta: number) {
    value.value = Math.round((value.value + delta) * 1000) / 1000
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="flex w-47.5 items-center gap-1">
            <button
                type="button"
                class="nodrag grid size-6 shrink-0 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.95]"
                @click="adjust(-1)"
            >
                <Icon icon="ri:subtract-line" class="size-3.5" />
            </button>
            <input
                :value="value"
                type="number"
                step="any"
                class="nodrag nowheel w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-center font-mono text-[12px] tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
                @input="onInput"
            />
            <button
                type="button"
                class="nodrag grid size-6 shrink-0 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.95]"
                @click="adjust(1)"
            >
                <Icon icon="ri:add-line" class="size-3.5" />
            </button>
        </div>
    </BaseNode>
</template>
