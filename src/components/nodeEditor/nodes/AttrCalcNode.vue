<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import { computed } from "vue"
import type { CharAttr } from "@/data/CharBuild"
import { format100 } from "@/util"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

// 计算角色属性
const attrs = computed<CharAttr | null>(() => {
    return props.data.result
})

// 格式化数值
const formatNumber = (num: number) => {
    if (num === undefined || num === null) return "-"
    return Math.round(num * 100) / 100
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div v-if="attrs" class="space-y-1 text-sm">
            <!-- 基础属性 -->
            <div class="font-semibold text-xs text-base-content/60 mb-2">基础属性</div>
            <div class="grid grid-cols-2 gap-1">
                <div>攻击: {{ formatNumber(attrs.攻击) }}</div>
                <div>生命: {{ formatNumber(attrs.生命) }}</div>
                <div>护盾: {{ formatNumber(attrs.护盾) }}</div>
                <div>防御: {{ formatNumber(attrs.防御) }}</div>
                <div>神智: {{ formatNumber(attrs.神智) }}</div>
            </div>

            <!-- 其他属性 -->
            <div class="font-semibold text-xs text-base-content/60 mt-3 mb-2">其他属性</div>
            <div class="grid grid-cols-2 gap-1">
                <div>技能威力: {{ format100(attrs.技能威力) }}</div>
                <div>技能耐久: {{ format100(attrs.技能耐久) }}</div>
                <div>技能效益: {{ format100(attrs.技能效益) }}</div>
                <div>技能范围: {{ format100(attrs.技能范围) }}</div>
                <div>昂扬: {{ format100(attrs.昂扬) }}</div>
                <div>背水: {{ format100(attrs.背水) }}</div>
                <div>增伤: {{ format100(attrs.增伤) }}</div>
                <div>武器伤害: {{ format100(attrs.武器伤害) }}</div>
                <div>技能伤害: {{ format100(attrs.技能伤害) }}</div>
                <div>独立增伤: {{ format100(attrs.独立增伤) }}</div>
                <div>属性穿透: {{ format100(attrs.属性穿透) }}</div>
                <div>无视防御: {{ format100(attrs.无视防御) }}</div>
            </div>
        </div>
        <div v-else class="text-sm text-base-content/60">等待输入...</div>
    </BaseNode>
</template>
