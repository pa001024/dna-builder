<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import type { DamageResult } from "@/data/CharBuild"
import { Handle, Position } from "@vue-flow/core"

const _props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

// 计算伤害
const damage = computed<DamageResult | null>(() => {
    return store.calculateNode(_props.id) as DamageResult | null
})

// 格式化数值
const formatNumber = (num: number) => {
    if (num === undefined || num === null) return "-"
    return +num.toFixed(4)
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div v-if="damage" class="space-y-1 text-sm">
            <div class="font-semibold text-xs text-base-content/60 mb-2">伤害结果</div>
            <div>期望伤害: {{ formatNumber(damage.expectedDamage) }}</div>
            <div>无血量因数伤害: {{ formatNumber(damage.noHpDamage) }}</div>
        </div>
        <div v-else class="text-sm text-base-content/60">等待输入...</div>
        <template #output>
            <Handle id="expectedDamage" type="source" :position="Position.Right" style="top: 25%">
                <span class="ml-2 whitespace-nowrap text-xs text-base-content/60">期望伤害</span>
            </Handle>
            <Handle id="noHpDamage" type="source" :position="Position.Right" style="top: 50%">
                <span class="ml-2 whitespace-nowrap text-xs text-base-content/60">无血量因数伤害</span>
            </Handle>
        </template>
    </BaseNode>
</template>
