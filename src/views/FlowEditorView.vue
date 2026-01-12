<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useFlowEditorStore } from "../components/FlowEditor/store"
import DamageNodeEditor from "../components/FlowEditor/DamageNodeEditor.vue"

const store = useFlowEditorStore()

// 用于访问DamageNodeEditor组件实例
const canvas = ref<InstanceType<typeof DamageNodeEditor>>()
// 确保TypeScript知道这个ref在模板中被使用
if (canvas.value) {
    // 组件实例访问占位符
}

onMounted(() => {
    // Initialize demo graph if canvas is empty
    if (store.nodes.length === 0) {
        // Demo nodes will be auto-initialized by DamageNodeEditor component
    }
})
</script>

<template>
    <div class="flow-editor-view">
        <DamageNodeEditor ref="canvas" />
    </div>
</template>

<style scoped>
.flow-editor-view {
    @apply w-full h-full;
    background: hsl(var(--b3));
}
</style>
