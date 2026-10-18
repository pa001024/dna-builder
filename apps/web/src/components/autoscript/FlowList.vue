<script setup lang="ts">
import { ref } from "vue"
import { createNodeByKind, useAutoScriptStore } from "@/store/autoScript"
import type { FlowNode } from "@/utils/autoscript/types"
import FlowBlock from "./FlowBlock.vue"

const props = defineProps<{
    nodes: FlowNode[]
    depth: number
}>()

const store = useAutoScriptStore()
const dropIndex = ref<number | null>(null)

function readPayload(event: DragEvent): { moveId?: string; newKind?: FlowNode["kind"] } {
    const moveId = event.dataTransfer?.getData("autoscript/move")
    const newKind = event.dataTransfer?.getData("autoscript/new") as FlowNode["kind"] | ""
    return { moveId: moveId || undefined, newKind: newKind || undefined }
}

function hasPayload(event: DragEvent): boolean {
    const types = event.dataTransfer?.types ?? []
    return types.includes("autoscript/move") || types.includes("autoscript/new")
}

function onDragOver(event: DragEvent, index: number) {
    if (!hasPayload(event)) return
    event.preventDefault()
    event.stopPropagation()
    dropIndex.value = index
}

function onDrop(event: DragEvent, index: number) {
    if (!hasPayload(event)) return
    event.preventDefault()
    event.stopPropagation()
    const { moveId, newKind } = readPayload(event)
    if (moveId) {
        store.moveNode(moveId, props.nodes, index)
    } else if (newKind) {
        store.insertNode(createNodeByKind(newKind), props.nodes, index)
    }
    dropIndex.value = null
}

function onDragLeave() {
    dropIndex.value = null
}
</script>

<template>
    <div class="flow-list flex flex-col" @dragleave="onDragLeave">
        <template v-for="(node, index) in nodes" :key="node.id">
            <div
                class="drop-zone h-1.5 rounded transition-colors"
                :class="dropIndex === index ? 'bg-primary/60' : 'bg-transparent hover:bg-primary/20'"
                @dragover="onDragOver($event, index)"
                @drop="onDrop($event, index)"
            />
            <FlowBlock :node="node" :depth="depth" />
        </template>
        <div
            class="drop-zone min-h-6 rounded border border-dashed text-center text-[10px] leading-6 transition-colors"
            :class="dropIndex === nodes.length ? 'border-primary bg-primary/10 text-primary' : 'border-base-300 text-base-content/30'"
            @dragover="onDragOver($event, nodes.length)"
            @drop="onDrop($event, nodes.length)"
        >
            {{ nodes.length === 0 ? "拖入节点" : "+" }}
        </div>
    </div>
</template>
