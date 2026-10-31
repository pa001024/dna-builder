<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { WeaponAttr } from "@/data/CharBuild"
import { format1, format100 } from "@/util"
import BaseNode from "./BaseNode.vue"
import VectorResultTable from "./VectorResultTable.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()
const { t } = useTranslation()

// 计算武器属性

// 计算角色属性
const weaponAttrs = computed<WeaponAttr | null>(() => {
    return props.data.result
})
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div v-if="weaponAttrs" class="w-55 max-w-full text-[11px] tabular-nums">
            <div class="mb-1 text-[10px] text-base-content/45">{{ t("node-editor.weaponAttr.result") }}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div>{{ $t("攻击") }}: {{ format1(weaponAttrs.攻击, 2) }}</div>
                <div>{{ $t("暴击") }}: {{ format100(weaponAttrs.暴击) }}</div>
                <div>{{ $t("暴伤") }}: {{ format100(weaponAttrs.暴伤) }}</div>
                <div>{{ $t("攻速") }}: {{ format1(weaponAttrs.攻速, 2) }}</div>
                <div>{{ $t("触发") }}: {{ format100(weaponAttrs.触发) }}</div>
                <div>{{ $t("多重") }}: {{ format1(weaponAttrs.多重, 2) }}</div>
            </div>
        </div>
        <div v-else-if="data.error" class="text-[11px] text-error">{{ data.error }}</div>
        <div v-else class="text-[11px] text-base-content/45">{{ $t("node-editor.weaponAttr.waiting") }}</div>
        <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
    </BaseNode>
</template>
