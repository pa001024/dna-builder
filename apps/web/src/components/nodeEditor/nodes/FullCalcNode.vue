<script setup lang="ts">
import type { NodeProps } from "@vue-flow/core"
import { formatDamage } from "@/util"
import BaseNode from "./BaseNode.vue"
import VectorResultTable from "./VectorResultTable.vue"

// 定义节点属性
defineProps<NodeProps>()
</script>

<template>
    <BaseNode
        :id="id"
        :data="data"
        :type="type"
        :selected="selected"
        :title="$t('node-editor.fullCalc.title')"
        :description="$t('node-editor.fullCalc.description')"
    >
        <!-- 节点内容 -->
        <div class="w-55 max-w-full space-y-1.5">
            <!-- 计算结果预览 -->
            <div v-if="data.result">
                <div class="text-[10px] text-base-content/45">{{ $t("node-editor.fullCalc.result") }}</div>
                <div class="font-orbitron text-[13px] font-bold tabular-nums text-primary">{{ formatDamage(data.result?.value ?? 0) }}</div>
            </div>

            <!-- 提示信息 -->
            <div v-else class="text-[10px] text-yellow-500">{{ $t("node-editor.fullCalc.waiting") }}</div>

            <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
        </div>
    </BaseNode>
</template>
