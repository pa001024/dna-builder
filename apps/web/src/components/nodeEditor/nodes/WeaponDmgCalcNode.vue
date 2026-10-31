<script setup lang="ts">
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

// 伤害结果由 worker 异步写回节点数据
const weaponDamage = computed<DamageResult | null>(() => props.data.result ?? null)
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div v-if="weaponDamage" class="w-52.5 max-w-full space-y-0.5 text-[11px] tabular-nums">
            <div class="mb-1 text-[10px] text-base-content/45">{{ $t("武器伤害") }}</div>
            <div>{{ $t("node-editor.weaponDmg.expectedDamage") }}: {{ formatDamage(weaponDamage.expectedDamage ?? 0) }}</div>
            <div>{{ $t("物理") }}: {{ formatDamage(weaponDamage.physicalDamage ?? 0) }}</div>
            <div>{{ $t("元素") }}: {{ formatDamage(weaponDamage.elementDamage ?? 0) }}</div>
        </div>
        <div v-else-if="data.evalPending" class="text-[11px] text-base-content/45">{{ $t("node-editor.weaponDmg.waiting") }}</div>
        <div v-else-if="data.error" class="text-[11px] text-error">{{ data.error }}</div>
        <div v-else class="text-[11px] text-base-content/45">{{ $t("node-editor.weaponDmg.waiting") }}</div>
        <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
    </BaseNode>
</template>
