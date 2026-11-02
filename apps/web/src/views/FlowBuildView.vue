<script setup lang="ts">
import { ref } from "vue"

/** 右键刷新时递增：卸载重挂 NodeEditor，走完整挂载流程但不碰整页 */
const editorKey = ref(0)
</script>

<template>
    <NodeEditor :key="editorKey" @request-refresh="editorKey++" />
</template>
