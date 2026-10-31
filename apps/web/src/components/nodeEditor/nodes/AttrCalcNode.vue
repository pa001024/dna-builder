<script setup lang="ts">
import { computed } from "vue"
import type { CharAttr } from "@/data/CharBuild"
import { format1, format100 } from "@/util"
import BaseNode from "./BaseNode.vue"
import VectorResultTable from "./VectorResultTable.vue"

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
    return format1(num, 2)
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div v-if="attrs" class="w-62.5 max-w-full space-y-1 text-[11px] tabular-nums">
            <!-- 基础属性 -->
            <div class="mb-0.5 font-semibold text-[10px] text-base-content/45">{{ $t("node-editor.attrCalc.base") }}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div>{{ $t("攻击") }}: {{ formatNumber(attrs.攻击) }}</div>
                <div>{{ $t("生命") }}: {{ formatNumber(attrs.生命) }}</div>
                <div>{{ $t("护盾") }}: {{ formatNumber(attrs.护盾) }}</div>
                <div>{{ $t("防御") }}: {{ formatNumber(attrs.防御) }}</div>
                <div>{{ $t("神智") }}: {{ formatNumber(attrs.神智) }}</div>
            </div>

            <!-- 其他属性 -->
            <div class="mb-0.5 mt-2 font-semibold text-[10px] text-base-content/45">{{ $t("node-editor.attrCalc.other") }}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div>{{ $t("技能威力") }}: {{ format100(attrs.技能威力) }}</div>
                <div>{{ $t("技能耐久") }}: {{ format100(attrs.技能耐久) }}</div>
                <div>{{ $t("技能效益") }}: {{ format100(attrs.技能效益) }}</div>
                <div>{{ $t("技能范围") }}: {{ format100(attrs.技能范围) }}</div>
                <div>{{ $t("昂扬") }}: {{ format100(attrs.昂扬) }}</div>
                <div>{{ $t("背水") }}: {{ format100(attrs.背水) }}</div>
                <div>{{ $t("增伤") }}: {{ format100(attrs.增伤) }}</div>
                <div>{{ $t("武器伤害") }}: {{ format100(attrs.武器伤害) }}</div>
                <div>{{ $t("技能伤害") }}: {{ format100(attrs.技能伤害) }}</div>
                <div>{{ $t("独立增伤") }}: {{ format100(attrs.独立增伤) }}</div>
                <div>{{ $t("属性穿透") }}: {{ format100(attrs.属性穿透) }}</div>
                <div>{{ $t("无视防御") }}: {{ format100(attrs.无视防御) }}</div>
            </div>
        </div>
        <div v-else-if="data.error" class="text-[11px] text-error">{{ data.error }}</div>
        <div v-else class="text-[11px] text-base-content/45">{{ $t("node-editor.attrCalc.waiting") }}</div>
        <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
    </BaseNode>
</template>
