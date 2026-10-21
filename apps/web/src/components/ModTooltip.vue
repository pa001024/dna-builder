<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { formatModName, type LeveledMod } from "@/data"
import type { ParamText } from "@/data/data-types"
import { formatProp } from "@/util"
import { formatModLimit } from "@/utils/mod-limit"
import { getParamTemplate, splitByPolarity } from "@/utils/param-text"
import { getRarityGradientClass, getRaritySwatchClass } from "@/utils/rarity-utils"

/**
 * 魔之楔富卡片的数据源：刻意只取公有子集构成结构类型。
 *
 * 模板链条上的映射类型会丢掉 class 的 private 成员（如 `LeveledMod` 的 `_等级` 等），
 * 直接写 `LeveledMod` 会让模板里递过来的值过不了 nominal 检查，此处只依赖公有成员故用 `Pick`。
 */
export type ModCardSource = Pick<
    LeveledMod,
    "id" | "名称" | "系列" | "品质" | "耐受" | "类型" | "极性" | "url" | "等级" | "maxLevel" | "getProperties" | "getCondition"
> & {
    /** 以下三项经索引签名动态挂载（非常驻声明），故单列为可选 */
    属性?: string
    限定?: string | number
    效果?: ParamText
}

const props = defineProps<{
    mod: ModCardSource
    eff?: { isEffective: boolean; props?: Record<string, any> }
    link?: string
    /** 无边框版本：内嵌进 ShowProps 时顶边渲染，不与 tooltip 描边叠框 */
    bare?: boolean
}>()

const { gt, gpt } = useGameText()
const title = computed(() => formatModName(props.mod.系列, props.mod.名称, gt))
const detail = computed(() => props.mod.getProperties())
const eff = computed(() => props.eff ?? props.mod.getCondition())
const effectText = computed(() => gpt(props.mod.效果, props.mod.等级))
const polarityMarker = computed(() => getParamTemplate(props.mod.效果).match(/([DVOA])趋向/)?.[1])
const effectParts = computed(() => (polarityMarker.value ? splitByPolarity(effectText.value, polarityMarker.value) : [effectText.value]))
const conditionEntries = computed(() => Object.entries(eff.value?.props || {}).filter(([key, val]) => val && !detail.value[key]))
const typeLine = computed(() =>
    [gt(props.mod.类型), props.mod.属性 ? gt(`${props.mod.属性}属性`) : "", props.mod.限定 ? gt(formatModLimit(props.mod.限定)) : ""]
        .filter(Boolean)
        .join(" · ")
)
const link = computed(() => props.link ?? `/db/mod/${props.mod.id}`)
</script>
<template>
    <div class="w-72 overflow-hidden rounded-xs bg-base-100 text-left" :class="bare ? '' : 'border border-base-content/10'">
        <div class="relative h-24 w-full overflow-hidden bg-linear-45" :class="getRarityGradientClass(mod.品质)">
            <img :src="mod.url" :alt="mod.名称" class="absolute inset-0 h-full w-full object-cover" />
            <span
                class="absolute left-2 top-2 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-base-100"
            >
                MOD
            </span>
            <span
                class="absolute right-2 top-2 border border-base-content/25 bg-base-100/60 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-base-content/70 backdrop-blur-sm"
            >
                Lv.{{ mod.等级 }}/{{ mod.maxLevel }}
            </span>
        </div>
        <div class="flex flex-col gap-2 p-3">
            <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1 text-sm font-bold">
                    <SRouterLink v-if="link" :to="link" class="cursor-pointer hover:underline">{{ title }}</SRouterLink>
                    <span v-else>{{ title }}</span>
                    <span class="ml-1.5 align-middle" :class="getRaritySwatchClass(mod.品质)" />
                </div>
                <div
                    v-if="mod.极性 || mod.耐受"
                    class="badge badge-sm badge-soft shrink-0 gap-1 font-mono tabular-nums text-base-content/80"
                >
                    {{ mod.耐受 }}
                    <Icon v-if="mod.极性" :icon="`po-${mod.极性}`" />
                </div>
            </div>
            <div v-if="typeLine" class="text-xs font-bold text-neutral-500">{{ typeLine }}</div>
            <div
                v-for="[ key, val ] in Object.entries(detail).filter(([, val]) => val)"
                :key="key"
                class="flex items-center justify-between gap-2 text-sm"
            >
                <div class="whitespace-nowrap text-xs text-neutral-500">{{ gt(key) }}</div>
                <div class="font-medium text-primary">{{ formatProp(key, val) }}</div>
            </div>
            <div
                v-for="[ key, val ] in conditionEntries"
                :key="key"
                class="flex items-center justify-between gap-2 text-sm"
                :class="{ 'line-through': !eff?.isEffective }"
            >
                <div class="text-xs text-neutral-500">{{ gt(key) }}</div>
                <div class="font-medium text-primary">{{ formatProp(key, val) }}</div>
            </div>
            <div v-if="effectText" class="text-xs leading-5 text-neutral-500">
                <span v-if="polarityMarker">
                    <template v-for="(part, index) in effectParts" :key="index">
                        <span v-if="index !== 1">{{ part }}</span>
                        <span v-else>
                            <Icon class="mx-1 inline-block" :icon="`po-${part as 'A' | 'D' | 'V' | 'O'}`" />
                            {{ $t("趋向") }}
                        </span>
                    </template>
                </span>
                <span v-else>{{ effectText }}</span>
            </div>
        </div>
    </div>
</template>
