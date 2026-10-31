<script setup lang="ts">
import type { NodeProps } from "@vue-flow/core"
import { useTranslation } from "i18next-vue"
import { formatDamage } from "@/util"
import BaseNode from "./BaseNode.vue"

// 定义节点属性
defineProps<NodeProps>()

const { t } = useTranslation()
</script>

<template>
    <BaseNode
        :id="id"
        :data="data"
        :type="type"
        :selected="selected"
        :title="t('node-editor.multiplyCalc.title')"
        :description="t('node-editor.multiplyCalc.description')"
    >
        <!-- 节点内容 -->
        <div class="w-45 max-w-full">
            <!-- 计算结果预览 -->
            <div v-if="data.result">
                <div class="text-[10px] text-base-content/45">{{ t("node-editor.multiplyCalc.result") }}</div>
                <div class="font-orbitron text-[13px] font-bold tabular-nums text-primary">{{ formatDamage(data.result?.value ?? 0) }}</div>
            </div>

            <!-- 提示信息 -->
            <div v-else class="text-[10px] text-yellow-500">{{ t("node-editor.multiplyCalc.waiting") }}</div>
        </div>
    </BaseNode>
</template>
