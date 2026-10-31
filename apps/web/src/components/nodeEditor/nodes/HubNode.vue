<script setup lang="ts">
import type { NodeProps } from "@vue-flow/core"
import BaseNode from "./BaseNode.vue"

defineProps<NodeProps>()
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div class="text-[10px] text-base-content/45">将构筑原样传递给输出</div>
    </BaseNode>
</template>
