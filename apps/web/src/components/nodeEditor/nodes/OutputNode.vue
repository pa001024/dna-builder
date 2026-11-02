<script setup lang="ts">
import { computed } from "vue"
import { format1, format100 } from "@/util"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const result = computed<Record<string, any> | null>(() => {
    const value = props.data.result
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-65 max-w-full text-[11px] tabular-nums">
            <template v-if="type === 'weapon-output'">
                <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("node-editor.weaponAttr.result") }}</div>
                <div v-if="result" class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <div>{{ $t("攻击") }}: {{ format1(result.攻击 ?? 0, 2) }}</div>
                    <div>{{ $t("暴击") }}: {{ format100(result.暴击 ?? 0) }}</div>
                    <div>{{ $t("暴伤") }}: {{ format100(result.暴伤 ?? 0) }}</div>
                    <div>{{ $t("攻速") }}: {{ format1(result.攻速 ?? 0, 2) }}</div>
                    <div>{{ $t("触发") }}: {{ format100(result.触发 ?? 0) }}</div>
                    <div>{{ $t("多重") }}: {{ format1(result.多重 ?? 0, 2) }}</div>
                </div>
                <div v-else class="text-[10px] text-base-content/40">连接武器属性节点后显示结果</div>
            </template>

            <template v-else>
                <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("node-editor.attrCalc.base") }}</div>
                <div v-if="result" class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    <div>{{ $t("攻击") }}: {{ format1(result.攻击 ?? 0, 2) }}</div>
                    <div>{{ $t("生命") }}: {{ format1(result.生命 ?? 0, 2) }}</div>
                    <div>{{ $t("护盾") }}: {{ format1(result.护盾 ?? 0, 2) }}</div>
                    <div>{{ $t("防御") }}: {{ format1(result.防御 ?? 0, 2) }}</div>
                    <div>{{ $t("神智") }}: {{ format1(result.神智 ?? 0, 2) }}</div>
                    <div>{{ $t("技能威力") }}: {{ format100(result.技能威力 ?? 0) }}</div>
                    <div>{{ $t("技能耐久") }}: {{ format100(result.技能耐久 ?? 0) }}</div>
                    <div>{{ $t("技能效益") }}: {{ format100(result.技能效益 ?? 0) }}</div>
                    <div>{{ $t("技能范围") }}: {{ format100(result.技能范围 ?? 0) }}</div>
                </div>
                <div v-else class="text-[10px] text-base-content/40">连接属性节点后显示结果</div>
            </template>
        </div>
    </BaseNode>
</template>
