<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import type { DamageResult } from "@/data/CharBuild"
import { Handle, Position } from "@vue-flow/core"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

// 计算武器伤害
const weaponDamage = computed<DamageResult | null>(() => {
    return store.calculateNode(props.id) as DamageResult | null
})
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div v-if="weaponDamage" class="space-y-1 text-sm">
            <div class="font-semibold text-xs text-base-content/60 mb-2">武器伤害</div>
            <div class="grid grid-cols-1 gap-1">
                <div>期望伤害: {{ +(weaponDamage.expectedDamage?.toFixed(4) || 0) }}</div>
                <div>低级暴击: {{ +(weaponDamage.lowerCritNoTrigger?.toFixed(4) || 0) }}</div>
                <div>高级暴击: {{ +(weaponDamage.higherCritNoTrigger?.toFixed(4) || 0) }}</div>
            </div>
        </div>
        <div v-else class="text-sm text-base-content/60">等待输入...</div>

        <template #output>
            <Handle id="expectedDamage" type="source" :position="Position.Right" style="top: 25%">
                <span class="ml-2 whitespace-nowrap text-xs text-base-content/60">期望伤害</span>
            </Handle>
            <Handle id="lowerCritNoTrigger" type="source" :position="Position.Right" style="top: 50%">
                <span class="ml-2 whitespace-nowrap text-xs text-base-content/60">低级暴击</span>
            </Handle>
            <Handle id="higherCritNoTrigger" type="source" :position="Position.Right" style="top: 75%">
                <span class="ml-2 whitespace-nowrap text-xs text-base-content/60">高级暴击</span>
            </Handle>
        </template>
    </BaseNode>
</template>
