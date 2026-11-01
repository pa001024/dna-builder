<script setup lang="ts">
import { useVueFlow } from "@vue-flow/core"
import { computed, nextTick, ref, watch } from "vue"
import { IconTypes } from "@/components/Icon.vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { getNodePorts, type NodePortSchema } from "@/utils/nodeEditorPorts"
import NodePortRow from "./NodePortRow.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
    ports?: NodePortSchema
}>()

// 获取store实例
const store = useNodeEditorStore()
const { updateNodeInternals } = useVueFlow()

// 收起 / 展开会改变端口位置（部分节点把端口渲染在行内），通知 VueFlow 重新测量
watch(
    () => props.data.isCollapsed,
    () => requestAnimationFrame(() => updateNodeInternals([props.id]))
)

// 切换收缩状态
const toggleCollapse = () => {
    store.updateNodeData(props.id, { isCollapsed: !props.data.isCollapsed })
}

// 标题点击编辑：记录按下位置，拖动节点时不误触编辑
const editingTitle = ref(false)
const titleDraft = ref("")
const titleInput = ref<HTMLInputElement | null>(null)
let titlePointerStart: { x: number; y: number } | null = null

watch(
    () => props.data.label,
    value => {
        if (!editingTitle.value) titleDraft.value = typeof value === "string" ? value : ""
    }
)

/** 记录标题按下的起始位置；模板内直接赋值会被 vue-tsc 按初始值收窄为 null */
function onTitlePointerDown(event: PointerEvent) {
    titlePointerStart = { x: event.clientX, y: event.clientY }
}

/** 点击标题文本进入编辑；拖动超过阈值时不触发 */
function onTitleClick(event: MouseEvent) {
    if (titlePointerStart && Math.hypot(event.clientX - titlePointerStart.x, event.clientY - titlePointerStart.y) > 4) return
    titleDraft.value = typeof props.data.label === "string" ? props.data.label : ""
    editingTitle.value = true
    nextTick(() => {
        titleInput.value?.focus()
        titleInput.value?.select()
    })
}

/** 提交标题，空标题视为取消 */
function commitTitle() {
    if (!editingTitle.value) return
    editingTitle.value = false
    const next = titleDraft.value.trim()
    if (!next || next === props.data.label) return
    store.updateNodeData(props.id, { label: next })
}

/** Esc 取消标题编辑 */
function cancelTitle() {
    editingTitle.value = false
    titleDraft.value = typeof props.data.label === "string" ? props.data.label : ""
}

// 节点样式类
const nodeClass = computed(() => {
    const classes = ["min-w-[200px]"]
    if (props.selected) {
        classes.push("border-primary/70", "ring-1", "ring-primary/30")
    }
    if (props.data.isCollapsed) {
        classes.push("min-w-[150px]")
    }
    return classes.join(" ")
})

const resolvedPorts = computed(() => props.ports ?? getNodePorts(props.type, props.data))

// 输入与输出按行配对：同一行左侧放输入端口，右侧放输出端口，保证端口与具体行精确对齐
const portRows = computed(() => {
    const { inputs, outputs } = resolvedPorts.value
    return Array.from({ length: Math.max(inputs.length, outputs.length) }, (_, index) => ({
        input: inputs[index],
        output: outputs[index],
    }))
})

// 获取节点图标
const getIcon = (type: string): IconTypes => {
    const icons: Record<string, IconTypes> = {
        "char-input": "ri:user-line",
        "melee-weapon-input": "ri:sword-line",
        "ranged-weapon-input": "ri:crosshair-line",
        "mod-input": "ri:grid-line",
        "buff-input": "ri:flashlight-line",
        "effect-input": "ri:sparkling-line",
        "pet-input": "ri:ghost-2-line",
        "enemy-input": "ri:skull-line",
        "custom-vars-input": "ri:code-s-slash-line",
        "dot-input": "ri:time-line",
        "core-calc": "ri:cpu-line",
        "attr-calc": "ri:calculator-line",
        "weapon-attr-calc": "ri:sword-line",
        "add-calc": "ri:add-line",
        "multiply-calc": "ri:calculator-line",
        "expression-calc": "ri:equalizer-line",
        "hub-calc": "ri:git-branch-line",
        "buff-merge": "ri:git-merge-line",
        "attr-output": "ri:bar-chart-line",
        "weapon-output": "ri:bar-chart-line",
        "damage-output": "ri:more-line",
        chart: "ri:line-chart-line",
        "ast-expression-calc": "ri:function-line",
        "custom-expression": "ri:function-line",
        group: "ri:group-line",
        label: "ri:pushpin-2-line",
        "text-input": "ri:edit-line",
        "number-input": "ri:hashtag",
        "vector-input": "ri:sort-number-asc",
        "vector-decompose": "ri:split-cells-horizontal",
        "json-build": "ri:file-code-line",
        "online-build": "ri:cloud-line",
    }
    return icons[type] || "ri:node-tree"
}
</script>

<template>
    <div class="rounded-xs border border-base-content/15 bg-base-100/80 shadow-sm backdrop-blur-sm" :class="nodeClass">
        <div class="flex h-7 items-center gap-1.5 px-2">
            <Icon :icon="getIcon(type)" class="size-3.5 shrink-0 text-base-content/55" />
            <input
                v-if="editingTitle"
                ref="titleInput"
                v-model="titleDraft"
                type="text"
                class="nodrag nopan min-w-0 flex-1 rounded-none border-b border-primary/60 bg-transparent px-0.5 pb-0.5 text-[12px] font-semibold text-base-content outline-none"
                @keydown.enter.prevent="commitTitle"
                @keydown.esc.prevent="cancelTitle"
                @blur="commitTitle"
                @pointerdown.stop
                @click.stop
            />
            <span
                v-else
                class="min-w-0 cursor-text truncate text-[12px] font-semibold"
                title="点击编辑标题"
                @pointerdown="onTitlePointerDown"
                @click="onTitleClick"
            >
                {{ data.label }}
            </span>
            <button
                type="button"
                class="nodrag ml-auto grid size-5 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/10 hover:text-base-content"
                @click.stop="toggleCollapse"
            >
                <Icon :icon="data.isCollapsed ? 'radix-icons:chevron-down' : 'radix-icons:chevron-up'" class="size-3.5" />
            </button>
        </div>

        <!-- 端口行始终显示：折叠时仍保留连接点，且每个端口固定在对应行上 -->
        <div v-if="portRows.length > 0 || $slots.ports" class="space-y-px px-2 pb-0.5">
            <slot name="ports">
                <NodePortRow v-for="(row, index) in portRows" :key="index" :input="row.input" :output="row.output" />
            </slot>
        </div>

        <!-- 插槽：节点主体内容（非迷你模式下显示） -->
        <div v-if="!data.isCollapsed" class="px-2 pb-2 pt-1.5">
            <slot></slot>
        </div>
    </div>
</template>
