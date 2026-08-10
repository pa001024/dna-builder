<script lang="ts" setup>
import { computed } from "vue"
import type { RougeProEffect } from "@/data/d/rouge.data"

const props = defineProps<{
    effect: RougeProEffect
    name?: string
}>()

const effect = computed(() => props.effect)

const param = computed<unknown[]>(() => {
    const value = effect.value.param
    if (value === undefined) {
        return []
    }
    return Array.isArray(value) ? value : [value]
})

const paramNumber = (index: number, fallback = 0): number => {
    const value = param.value[index]
    return typeof value === "number" ? value : fallback
}

const formatPercent = (ratio: number): string => {
    return `${Math.round(ratio * 100)}%`
}

const blockDescription = computed<string>(() => {
    const blockedIds = param.value[0]
    const ids = Array.isArray(blockedIds) ? (blockedIds as number[]) : []
    return ids.map(id => `#${id}`).join(", ")
})

const treasureName = computed<string>(() => {
    const ids = param.value as number[]
    if (!ids.length) {
        return ""
    }
    return ids.map(id => `#${id}`).join(", ")
})

const detailText = computed<string>(() => {
    switch (effect.value.name) {
        case "RandomChoice":
            return "抉择选项变为随机"
        case "RecoverTimeAdd":
            return `受伤后回复提前 ${paramNumber(0)} 秒`
        case "ShopDiscount":
            return `商店价格降低 ${formatPercent(1 - paramNumber(0, 1))}`
        case "GetToken":
            return `立即获得 ${paramNumber(0)} 余烬`
        case "GetTreasure":
            return `获得遗物：${treasureName.value || "-"}`
        case "ChoiceNumber":
            return `每次抉择可选数量 ${paramNumber(0)} 个`
        case "BlockEffect":
            return `禁用效果：${blockDescription.value || "-"}`
        case "GetTokenByTime":
            return `每 ${paramNumber(0)} 秒获得 ${paramNumber(1)} 余烬`
        case "GetModEveryOne":
            return `全体获得 Mod #${paramNumber(0)}`
        case "AddBuff":
            return `获得 Buff #${paramNumber(0)}`
        case "ActiveStaticPoint":
        case "ActiveMonsterSP":
        case "CreateCowEvent":
            return ""
        case "TokenExtraRate":
            return `余烬获取提高 ${formatPercent(paramNumber(0))}`
        case "OreExtraRate":
            return `矿石获取提高 ${formatPercent(paramNumber(0))}`
        case "TimberExtraRate":
            return `木材获取提高 ${formatPercent(paramNumber(0))}`
        case "LanternRange":
            return `提灯照亮范围扩大 ${paramNumber(0)}`
        case "EndPointsExtraRate":
            return `积分获取提高 ${formatPercent(paramNumber(0))}`
        case "RebornFree":
            return `免费复活次数 +${paramNumber(0)}`
        case "PayForRebornGetBuff":
            return `复活消耗 ${paramNumber(0)} 余烬`
        case "KillGetToken":
            return `击杀目标后每 ${paramNumber(1)} 次获得 ${paramNumber(2)} 余烬`
        default:
            return ""
    }
})
</script>

<template>
    <div class="rounded-md bg-base-200 p-3">
        <div class="flex items-center gap-1.5">
            <span v-if="name" class="rounded px-1.5 py-0.5 bg-base-300/70 text-xs">{{ $t(name) }}</span>
            <span class="text-xs text-base-content/40">{{ effect.name }}</span>
            <span class="text-xs text-base-content/40">#{{ effect.id }}</span>
            <div class="flex-1"></div>
            <CopyID :id="effect.id" />
        </div>
        <div v-if="detailText" class="mt-1.5 text-sm text-base-content">{{ detailText }}</div>
    </div>
</template>
