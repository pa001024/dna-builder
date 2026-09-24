<script setup lang="tsx">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { ParamText } from "@/data/data-types"
import { formatProp } from "@/util"
import { getParamTemplate, splitByPolarity } from "@/utils/param-text"

const componentProps = withDefaults(
    defineProps<{
        props: Record<string, any>
        attr?: Record<string, string>
        code?: string
        side?: "top" | "bottom" | "left" | "right"
        title?: string
        rarity?: string
        desc?: string
        /** 效果文案原文（参数化文本） */
        effdesc?: ParamText
        /** 效果档位下标（武器为精炼等级，MOD 为 `等级 - 1`） */
        effindex?: number
        /** 是否去掉首句（武器熔炼文案首句是属性摘要，数值已在属性区展示） */
        effstrip?: boolean
        polarity?: "A" | "D" | "V" | "O"
        cost?: number
        type?: string
        link?: string
        eff?: { isEffective: boolean; props?: Record<string, any> }
    }>(),
    {
        side: "top",
        effindex: 0,
        effstrip: false,
    }
)

const { gpt } = useGameText()

/** 当前档位下已翻译的效果文案 */
const effectText = computed(() =>
    gpt(componentProps.effdesc, componentProps.effindex, { stripFirstSentence: componentProps.effstrip })
)

/** 原文模板里的极性字母（译文里的标记形态各语言不同，只能用原文判） */
const polarityMarker = computed(() => getParamTemplate(componentProps.effdesc).match(/([DVOA])趋向/)?.[1])

/**
 * 把效果文案按极性标记切成 [前段, 极性字母, 后段]，供模板画极性图标。
 * @returns 三段式；无标记或无法定位时返回单元素数组
 */
function formatDesc(): string[] {
    return polarityMarker.value ? splitByPolarity(effectText.value, polarityMarker.value) : [effectText.value]
}

function getQualityColor(quality: string): string {
    const colorMap: Record<string, string> = {
        白: "bg-gray-200 text-gray-800",
        绿: "bg-green-200 text-green-800",
        蓝: "bg-blue-200 text-blue-800",
        紫: "bg-purple-200 text-purple-800",
        金: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[quality] || "bg-base-200 text-base-content"
}
</script>
<template>
    <FullTooltip :side="side">
        <template #tooltip>
            <div class="flex flex-col gap-2 max-w-75 min-w-28">
                <div class="flex">
                    <div v-if="title" class="text-sm font-bold">
                        <SRouterLink v-if="link" :to="link" class="cursor-pointer hover:underline">{{ title }}</SRouterLink>
                        <span v-else>{{ title }}</span>
                        <span v-if="rarity" class="text-xs p-1 rounded-sm ml-1" :class="getQualityColor(rarity)">
                            {{ rarity }}
                        </span>
                    </div>
                    <div v-if="polarity || cost" class="ml-auto badge badge-sm badge-soft gap-1 text-base-content/80">
                        {{ cost }}
                        <Icon v-if="polarity" :icon="`po-${polarity}`" />
                    </div>
                </div>
                <div v-if="desc" class="text-xs text-gray-400">
                    {{ desc }}
                </div>
                <div
                    v-for="[prop, val] in Object.entries(props).filter(([, val]) => val)"
                    :key="prop"
                    class="flex justify-between items-center gap-2 text-sm"
                >
                    <div class="text-xs text-neutral-500 whitespace-nowrap">
                        {{ prop.startsWith("基础") ? `${$t("基础")}${$t(prop.slice(2))}` : $t(prop) }}
                    </div>
                    <div class="flex flex-col items-end">
                        <div class="font-medium text-primary">
                            {{ formatProp(prop, val) }}
                        </div>
                        <div v-if="attr?.[prop]" class="text-[11px] text-neutral-500">
                            {{ attr[prop] }}
                        </div>
                    </div>
                </div>
                <div
                    v-for="[prop, val] in Object.entries(eff?.props || {}).filter(([prop, val]) => val && !props[prop])"
                    :key="prop"
                    class="flex justify-between items-center gap-2 text-sm"
                    :class="{ 'line-through': !eff?.isEffective }"
                >
                    <div class="text-xs text-neutral-500">
                        {{ $t(prop) }}
                    </div>
                    <div class="font-medium text-primary">
                        {{ formatProp(prop, val) }}
                    </div>
                </div>
                <div v-if="effectText" class="text-xs text-neutral-500">
                    <span v-if="polarityMarker">
                        <template v-for="(part, index) in formatDesc()" :key="index">
                            <span v-if="index !== 1">{{ part }}</span>
                            <span v-else>
                                <Icon class="inline-block mx-1" :icon="`po-${part as 'A' | 'D' | 'V' | 'O'}`" />
                                {{ $t("趋向") }}
                            </span>
                        </template>
                    </span>
                    <span v-else>{{ effectText }}</span>
                </div>

                <div v-if="code" class="text-xs text-gray-400">
                    <div class="text-xs text-neutral-500">
                        {{ $t("char-build.dynamic_prop") }}
                    </div>
                    {{ code }}
                </div>
                <div v-if="type" class="text-xs text-neutral-500 font-bold">
                    {{ type }}
                </div>
            </div>
        </template>
        <slot />
    </FullTooltip>
</template>
