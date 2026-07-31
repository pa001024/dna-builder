<script setup lang="ts">
import { useAutoScriptStore } from "@/store/autoScript"
import type { FlowNode } from "@/utils/autoscript/types"
import Icon, { type IconTypes } from "../Icon.vue"
import FlowList from "./FlowList.vue"
import { CONTAINER_KINDS, getNodeSlots, NODE_LABELS } from "./palette"

const props = defineProps<{
    node: FlowNode
    depth: number
}>()

const store = useAutoScriptStore()

const NODE_ICONS: Partial<Record<FlowNode["kind"], IconTypes>> = {
    loop: "ri:loop-left-line",
    if: "ri:git-branch-line",
    switch: "ri:list-check-3",
    functionDef: "ri:function-line",
    functionCall: "ri:play-circle-line",
    break: "ri:logout-circle-r-line",
    continue: "ri:skip-forward-line",
    mouseClick: "ri:cursor-line",
    mouseDown: "ri:mouse-line",
    mouseUp: "ri:mouse-line",
    keyPress: "ri:keyboard-line",
    keyDown: "ri:keyboard-fill",
    keyUp: "ri:keyboard-fill",
    sleep: "ri:time-line",
    waitColor: "ri:palette-line",
    capFrame: "ri:screenshot-2-line",
    playDsl: "ri:magic-line",
    stopPlay: "ri:stop-circle-line",
    setStatus: "ri:information-line",
    setConfig: "ri:settings-4-line",
    code: "ri:code-s-slash-line",
}

function nodeIcon(node: FlowNode): IconTypes {
    return NODE_ICONS[node.kind] ?? "ri:question-line"
}

function summary(node: FlowNode): string {
    switch (node.kind) {
        case "mouseClick":
        case "mouseDown":
        case "mouseUp":
            return node.x != null ? `(${node.x}, ${node.y}) ${node.button}` : node.button
        case "keyPress":
            return node.duration ? `${node.key} ${node.duration}ms` : node.key
        case "keyDown":
        case "keyUp":
            return node.key
        case "sleep":
            return `${node.ms}ms`
        case "waitColor":
            return `(${node.x}, ${node.y}) #${node.color.toString(16).toUpperCase().padStart(6, "0")}`
        case "playDsl":
            return node.dsl.length > 24 ? node.dsl.slice(0, 24) + "…" : node.dsl
        case "setStatus":
            return node.title
        case "setConfig":
            return node.name
        case "code":
            return node.source.split("\n")[0]?.slice(0, 24) || "(空)"
        case "loop":
            return node.loopType === "count" ? `×${node.count ?? 0}` : node.loopType === "while" ? "while 条件" : "无限"
        case "functionDef":
            return node.funcName
        case "functionCall":
            return node.funcName || "(未选择)"
        default:
            return ""
    }
}

function select() {
    store.selectedNodeId = props.node.id
}

function onDragStart(event: DragEvent) {
    event.stopPropagation()
    event.dataTransfer?.setData("autoscript/move", props.node.id)
    event.dataTransfer?.setData("text/plain", props.node.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move"
}

function onRemove(event: MouseEvent) {
    event.stopPropagation()
    store.removeNode(props.node.id)
}

function onClone(event: MouseEvent) {
    event.stopPropagation()
    store.cloneNode(props.node.id)
}

const slots = () => getNodeSlots(props.node)
</script>

<template>
    <div class="flow-block">
        <div
            class="flex items-center gap-1 rounded border px-2 py-1 cursor-pointer select-none group"
            :class="[
                store.selectedNodeId === node.id ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-100 hover:border-primary/50',
                CONTAINER_KINDS.includes(node.kind) ? 'border-l-4 border-l-secondary' : '',
            ]"
            draggable="true"
            @click.stop="select"
            @dragstart="onDragStart"
        >
            <Icon icon="ri:draggable" class="w-3.5 h-3.5 text-base-content/30 cursor-grab" />
            <Icon :icon="nodeIcon(node)" class="w-4 h-4 text-primary" />
            <span class="text-xs font-medium">{{ NODE_LABELS[node.kind] }}</span>
            <span class="text-xs text-base-content/60 truncate flex-1">{{ summary(node) }}</span>
            <span v-if="node.comment" class="text-xs text-base-content/40 truncate max-w-24" :title="node.comment">// {{ node.comment }}</span>
            <div class="hidden group-hover:flex items-center gap-0.5 h-4">
                <button
                    class="inline-flex shrink-0 items-center justify-center w-4 h-4 min-w-0 min-h-0 p-0 border-0 rounded bg-transparent text-base-content/60 cursor-pointer hover:bg-base-content/10"
                    title="克隆"
                    @click="onClone"
                >
                    <Icon icon="ri:file-copy-line" class="w-3 h-3" />
                </button>
                <button
                    class="inline-flex shrink-0 items-center justify-center w-4 h-4 min-w-0 min-h-0 p-0 border-0 rounded bg-transparent text-error cursor-pointer hover:bg-error/10"
                    title="删除"
                    @click="onRemove"
                >
                    <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                </button>
            </div>
        </div>

        <!-- 容器插槽 -->
        <div v-for="slot in slots()" :key="slot.key" class="ml-5 mt-1 mb-1 pl-2 border-l-2 border-dashed border-base-300">
            <div class="text-[10px] uppercase text-base-content/40 mb-0.5">{{ slot.label }}</div>
            <FlowList :nodes="slot.list" :depth="depth + 1" />
        </div>
    </div>
</template>
