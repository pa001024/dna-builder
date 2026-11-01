<script setup lang="ts">
import { nextTick, ref, watch } from "vue"
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

/** 读取维度标签，缺失或空白时用 #N 补齐 */
function readLabels(count: number): string[] {
    const raw = Array.isArray(props.data.labels) ? props.data.labels : []
    return Array.from({ length: count }, (_, index) => {
        const name = typeof raw[index] === "string" ? raw[index].trim() : ""
        return name || `#${index + 1}`
    })
}

const labels = ref<string[]>(readLabels(values.value.length))

watch(
    () => props.data.labels,
    () => {
        const nextLabels = readLabels(values.value.length)
        if (JSON.stringify(nextLabels) !== JSON.stringify(labels.value)) labels.value = nextLabels
    },
    { deep: true }
)

/** 当前重命名中的维度行，同一时间只有一行 */
const editingLabel = ref<number | null>(null)
const labelDraft = ref("")
const labelInput = ref<HTMLInputElement | null>(null)

/** 收集当前编辑行的标签输入框 */
function setLabelInput(el: unknown) {
    if (el) labelInput.value = el as HTMLInputElement
}

/** 点击维度标签进入重命名 */
function startLabelEdit(index: number) {
    labelDraft.value = labels.value[index] ?? `#${index + 1}`
    editingLabel.value = index
    nextTick(() => {
        labelInput.value?.focus()
        labelInput.value?.select()
    })
}

/** 提交维度重命名，空名称回退默认序号 */
function commitLabelEdit() {
    if (editingLabel.value === null) return
    const index = editingLabel.value
    editingLabel.value = null
    const next = labelDraft.value.trim()
    labels.value[index] = next || `#${index + 1}`
    commit()
}

/** Esc 取消维度重命名 */
function cancelLabelEdit() {
    editingLabel.value = null
}

function commit() {
    store.updateNodeData(props.id, {
        values: values.value.map(value => (Number.isFinite(value) ? value : 0)),
        labels: [...labels.value],
    })
}

/** 行输入组件的提交入口 */
function setValue(index: number, value: number) {
    values.value[index] = value
    commit()
}

/** 维度数量：数值输入增减维度，不足补 0，多余截掉 */
function setDimCount(next: number) {
    if (!Number.isFinite(next)) return
    const count = Math.min(32, Math.max(1, Math.round(next)))
    if (count === values.value.length) return
    if (count > values.value.length) {
        values.value.push(...Array.from({ length: count - values.value.length }, () => 0))
        const base = labels.value.length
        labels.value.push(...Array.from({ length: count - base }, (_, offset) => `#${base + offset + 1}`))
    } else {
        values.value.splice(count)
        labels.value.splice(count)
    }
    commit()
}

function removeValue(index: number) {
    values.value.splice(index, 1)
    labels.value.splice(index, 1)
    if (values.value.length === 0) values.value.push(0)
    if (labels.value.length === 0) labels.value.push("#1")
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-60 max-w-full space-y-1.5">
            <div class="space-y-1">
                <div v-for="(value, index) in values" :key="index" class="flex items-center gap-1.5">
                    <input
                        v-if="editingLabel === index"
                        :ref="setLabelInput"
                        v-model="labelDraft"
                        type="text"
                        class="nodrag w-14 shrink-0 rounded-none border-b border-primary/60 bg-transparent px-0.5 pb-0.5 font-mono text-[10px] text-base-content outline-none"
                        @keydown.enter.prevent="commitLabelEdit"
                        @keydown.esc.prevent="cancelLabelEdit"
                        @blur="commitLabelEdit"
                        @pointerdown.stop
                        @mousedown.stop
                        @click.stop
                    />
                    <span
                        v-else
                        class="nodrag w-14 shrink-0 cursor-text truncate text-right font-mono text-[10px] tabular-nums text-base-content/35 transition-colors duration-150 hover:text-primary"
                        :title="`点击重命名维度 ${index + 1}`"
                        @pointerdown.stop
                        @mousedown.stop
                        @click="startLabelEdit(index)"
                    >{{ labels[index] }}</span>
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
            <div class="flex items-center gap-2">
                <span class="text-[10px] text-base-content/45">长度</span>
                <NumberRowInput
                    class="min-w-0 flex-1"
                    :model-value="values.length"
                    :min="1"
                    :max="32"
                    :step="1"
                    :precision="0"
                    @update:model-value="setDimCount($event)"
                />
            </div>
            <div class="text-[10px] leading-snug text-base-content/40">连接到自定义变量组中某个变量的输入端口，只覆盖该变量的取值</div>
        </div>
    </BaseNode>
</template>
