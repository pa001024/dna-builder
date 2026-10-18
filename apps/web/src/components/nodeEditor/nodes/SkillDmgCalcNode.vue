<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core"
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { DamageResult } from "@/data/CharBuild"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const _props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const { t } = useTranslation()

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
            <div class="font-semibold text-xs text-base-content/60 mb-2">{{ t("node-editor.skillDmg.result") }}</div>
            <div>{{ t("node-editor.skillDmg.expectedDamage") }}: {{ formatNumber(damage.expectedDamage) }}</div>
            <div>{{ t("node-editor.skillDmg.noHpDamage") }}: {{ formatNumber(damage.noHpDamage) }}</div>
        </div>
        <div v-else class="text-sm text-base-content/60">{{ t("node-editor.skillDmg.waiting") }}</div>
        <template #output>
            <Handle id="expectedDamage" type="source" :position="Position.Right" style="top: 25%">
                <span class="ml-2 whitespace-nowrap text-xs text-base-content/60">{{ t("node-editor.skillDmg.expectedDamage") }}</span>
            </Handle>
            <Handle id="noHpDamage" type="source" :position="Position.Right" style="top: 50%">
                <span class="ml-2 whitespace-nowrap text-xs text-base-content/60">{{ t("node-editor.skillDmg.noHpDamage") }}</span>
            </Handle>
        </template>
    </BaseNode>
</template>
