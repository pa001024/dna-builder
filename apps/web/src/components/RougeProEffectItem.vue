<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { RougeProEffect } from "@/data/d/rouge.data"

const props = defineProps<{
    effect: RougeProEffect
    name?: string
}>()

/** 效果名走游戏原文取词，效果说明走界面文案（参数化模板）。 */
const { gt } = useGameText()
const { t } = useTranslation()

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

/**
 * 效果说明文案：按效果枚举名挑一条参数化模板，再把数值代入。
 *
 * 模板取自 `db-rouge-pro-detail.fx_*`，数值由 `param` 还原；
 * 未收录的效果名返回空串（只显示名称与枚举名）。
 */
const detailText = computed<string>(() => {
    switch (effect.value.name) {
        case "RandomChoice":
            return t("db-rouge-pro-detail.fx_random_choice")
        case "RecoverTimeAdd":
            return t("db-rouge-pro-detail.fx_recover_time", { seconds: paramNumber(0) })
        case "ShopDiscount":
            return t("db-rouge-pro-detail.fx_shop_discount", { percent: formatPercent(1 - paramNumber(0, 1)) })
        case "GetToken":
            return t("db-rouge-pro-detail.fx_get_token", { num: paramNumber(0) })
        case "GetTreasure":
            return t("db-rouge-pro-detail.fx_get_treasure", { name: treasureName.value || "-" })
        case "ChoiceNumber":
            return t("db-rouge-pro-detail.fx_choice_number", { num: paramNumber(0) })
        case "BlockEffect":
            return t("db-rouge-pro-detail.fx_block_effect", { name: blockDescription.value || "-" })
        case "GetTokenByTime":
            return t("db-rouge-pro-detail.fx_token_by_time", { seconds: paramNumber(0), num: paramNumber(1) })
        case "GetModEveryOne":
            return t("db-rouge-pro-detail.fx_get_mod", { id: paramNumber(0) })
        case "AddBuff":
            return t("db-rouge-pro-detail.fx_get_buff", { id: paramNumber(0) })
        case "ActiveStaticPoint":
        case "ActiveMonsterSP":
        case "CreateCowEvent":
            return ""
        case "TokenExtraRate":
            return t("db-rouge-pro-detail.fx_token_extra_rate", { percent: formatPercent(paramNumber(0)) })
        case "OreExtraRate":
            return t("db-rouge-pro-detail.fx_ore_extra_rate", { percent: formatPercent(paramNumber(0)) })
        case "TimberExtraRate":
            return t("db-rouge-pro-detail.fx_timber_extra_rate", { percent: formatPercent(paramNumber(0)) })
        case "LanternRange":
            return t("db-rouge-pro-detail.fx_lantern_range", { value: paramNumber(0) })
        case "EndPointsExtraRate":
            return t("db-rouge-pro-detail.fx_end_points_rate", { percent: formatPercent(paramNumber(0)) })
        case "RebornFree":
            return t("db-rouge-pro-detail.fx_reborn_free", { num: paramNumber(0) })
        case "PayForRebornGetBuff":
            return t("db-rouge-pro-detail.fx_pay_for_reborn", { num: paramNumber(0) })
        case "KillGetToken":
            return t("db-rouge-pro-detail.fx_kill_get_token", { times: paramNumber(1), num: paramNumber(2) })
        default:
            return ""
    }
})
</script>

<template>
    <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-3">
        <div class="flex items-center gap-1.5">
            <span v-if="name" class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] text-base-content/60">
                {{ gt(name) }}
            </span>
            <span class="text-xs text-base-content/55">{{ effect.name }}</span>
            <div class="flex-1"></div>
            <CopyID :id="effect.id" />
        </div>
        <div v-if="detailText" class="mt-1.5 text-sm text-base-content">{{ detailText }}</div>
    </div>
</template>
