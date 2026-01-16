<script setup lang="ts">
import { computed } from "vue"
import type { WeaponAttr } from "@/data/CharBuild"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

// 计算武器属性

// 计算角色属性
const weaponAttrs = computed<WeaponAttr | null>(() => {
    return props.data.result
})
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div v-if="weaponAttrs" class="space-y-1 text-sm">
            <div class="font-semibold text-xs text-base-content/60 mb-2">武器属性</div>
            <div class="grid grid-cols-2 gap-1">
                <div>攻击: {{ Math.round(weaponAttrs.攻击 * 100) / 100 }}</div>
                <div>暴击率: {{ Math.round(weaponAttrs.暴击 * 100) }}%</div>
                <div>暴击伤害: {{ Math.round(weaponAttrs.暴伤 * 100) }}%</div>
                <div>攻击速度: {{ Math.round(weaponAttrs.攻速 * 100) / 100 }}</div>
                <div>触发率: {{ Math.round(weaponAttrs.触发 * 100) }}%</div>
                <div>多重射击: {{ weaponAttrs.多重 }}</div>
            </div>
        </div>
        <div v-else class="text-sm text-base-content/60">等待输入...</div>
    </BaseNode>
</template>
