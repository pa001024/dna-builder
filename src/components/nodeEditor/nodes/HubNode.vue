<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import type { NodeProps } from "@vue-flow/core"
import { Handle, Position } from "@vue-flow/core"
defineProps<NodeProps>()

// 支持最多10个输入端口
const inputCount = 10
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <!-- 替换默认的单个输入端口，添加多个输入端口 -->
        <template #input>
            <!-- 动态生成多个输入端口 -->
            <div class="flex flex-col items-center justify-center h-full gap-3">
                <Handle v-for="i in inputCount" :key="`input-${i}`" type="target" :position="Position.Left" class="bg-primary!" />
            </div>
        </template>
    </BaseNode>
</template>
