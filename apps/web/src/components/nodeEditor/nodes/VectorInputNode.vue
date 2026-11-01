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

/** 读取数值列表，过滤非有限数字 */
function readValues(): number[] {
    if (!Array.isArray(props.data.values)) return [0]
    const values = props.data.values.filter((value: unknown): value is number => typeof value === "number" && Number.isFinite(value))
    return values.length > 0 ? values : [0]
}

const values = ref<number[]>(readValues())

if (!Array.isArray(props.data.values) || props.data.values.length === 0) props.data.values = [...values.value]

watch(
    () => props.data.values,
    () => {
        const nextValues = readValues()
        if (JSON.stringify(nextValues) !== JSON.stringify(values.value)) values.value = nextValues
    },
    { deep: true }
)

function commit() {
    store.updateNodeData(props.id, {
        values: values.value.map(value => (Number.isFinite(value) ? value : 0)),
    })
}

/** 行输入组件的提交入口 */
function setValue(index: number, value: number) {
    values.value[index] = value
    commit()
}

function addValue() {
    values.value.push(0)
    commit()
}

function removeValue(index: number) {
    values.value.splice(index, 1)
    if (values.value.length === 0) values.value.push(0)
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-60 max-w-full space-y-1.5">
            <div class="space-y-1">
                <div v-for="(value, index) in values" :key="index" class="flex items-center gap-1.5">
                    <span class="w-4 shrink-0 text-right font-mono text-[10px] tabular-nums text-base-content/35">{{ index + 1 }}</span>
                    <NumberRowInput
                        class="min-w-0 flex-1"
                        :model-value="value"
                        :step="1"
                        @update:model-value="setValue(index, $event)"
                    />
                    <button
                        type="button"
                        class="grid size-5 shrink-0 cursor-pointer place-items-center text-base-content/40 transition-colors duration-150 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.95]"
                        title="删除"
                        @click="removeValue(index)"
                    >
                        <Icon icon="codicon:chrome-close" class="size-3" />
                    </button>
                </div>
            </div>
            <button
                type="button"
                class="flex h-6 w-full cursor-pointer items-center justify-center gap-1 bg-primary/10 px-2 text-[10px] font-semibold text-primary transition-colors duration-150 hover:bg-primary/15 active:scale-[0.97]"
                @click="addValue"
            >
                <Icon icon="ri:add-line" class="size-3" />
                数值
            </button>
            <div class="text-[10px] leading-snug text-base-content/40">连接到自定义变量组中某个变量的输入端口，只覆盖该变量的取值</div>
        </div>
    </BaseNode>
</template>
