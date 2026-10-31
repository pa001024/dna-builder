<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { DamageResult } from "@/data/CharBuild"
import { formatDamage } from "@/util"
import BaseNode from "./BaseNode.vue"
import VectorResultTable from "./VectorResultTable.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const { t } = useTranslation()

// 伤害结果由 worker 异步写回节点数据
const damage = computed<DamageResult | null>(() => props.data.result ?? null)
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div v-if="damage" class="w-52.5 max-w-full space-y-0.5 text-[11px] tabular-nums">
            <div class="mb-1 text-[10px] text-base-content/45">{{ t("node-editor.skillDmg.result") }}</div>
            <div>{{ t("node-editor.skillDmg.expectedDamage") }}: {{ formatDamage(damage.expectedDamage ?? 0) }}</div>
            <div>{{ t("node-editor.skillDmg.noHpDamage") }}: {{ formatDamage(damage.noHpDamage ?? 0) }}</div>
        </div>
        <div v-else-if="data.evalPending" class="text-[11px] text-base-content/45">{{ t("node-editor.skillDmg.waiting") }}</div>
        <div v-else-if="data.error" class="text-[11px] text-error">{{ data.error }}</div>
        <div v-else class="text-[11px] text-base-content/45">{{ t("node-editor.skillDmg.waiting") }}</div>
        <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
    </BaseNode>
</template>
