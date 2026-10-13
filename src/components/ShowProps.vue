<script setup lang="tsx">
import { computed } from "vue"
import type { ModCardSource } from "@/components/ModTooltip.vue"
import { useGameText } from "@/composables/useGameText"
import type { LeveledChar, LeveledWeapon } from "@/data"
import type { ParamText } from "@/data/data-types"
import { formatProp } from "@/util"
import { getParamTemplate, splitByPolarity } from "@/utils/param-text"
import { getRaritySwatchClass } from "@/utils/rarity-utils"

const componentProps = withDefaults(
    defineProps<{
        /** 通用分支的属性表；传入 mod / weapon / char 时由卡片自行计算，可省略 */
        props?: Record<string, any>
        attr?: Record<string, string>
        code?: string
        /** 条件BUFF（技能限定）生效范围：字段名需包含该技能名（如 "暗影奔袭"），显示为「适用于 X」 */
        applicableSkill?: string
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
        /** 富卡片数据源：传入后 tooltip 改用对应的带图卡片（ModTooltip / WeaponTooltip / CharTooltip）渲染 */
        mod?: ModCardSource
        weapon?: LeveledWeapon
        char?: LeveledChar
        /** 通用分支的图片头：无富卡片数据源时展示（如魔灵潜质 trait.url） */
        image?: string
        /** 图片头左上角角标（如 MOD / TRAIT） */
        tag?: string
        /** 图片头右上角徽记（如 Lv.10） */
        badge?: string
    }>(),
    {
        side: "top",
        effindex: 0,
        effstrip: false,
        props: () => ({}),
    }
)

const { gpt, gt } = useGameText()

/** 条件BUFF（技能限定）生效范围：按 "|" 拆分多技能并逐个翻译（如 "月猎|日食" → "月猎 / 日食"） */
const applicableSkillText = computed(() =>
    (componentProps.applicableSkill || "")
        .split("|")
        .map(skill => gt(skill.trim()))
        .filter(Boolean)
        .join(" / ")
) /** 当前档位下已翻译的效果文案 */
const effectText = computed(() => gpt(componentProps.effdesc, componentProps.effindex, { stripFirstSentence: componentProps.effstrip }))

/** 原文模板里的极性字母（译文里的标记形态各语言不同，只能用原文判） */
const polarityMarker = computed(() => getParamTemplate(componentProps.effdesc).match(/([DVOA])趋向/)?.[1])

/**
 * 把效果文案按极性标记切成 [前段, 极性字母, 后段]，供模板画极性图标。
 * @returns 三段式；无标记或无法定位时返回单元素数组
 */
function formatDesc(): string[] {
    return polarityMarker.value ? splitByPolarity(effectText.value, polarityMarker.value) : [effectText.value]
}
</script>
<template>
    <FullTooltip :side="side">
        <template #tooltip>
            <div v-if="mod" class="-mx-3.75 -my-2.5">
                <ModTooltip :mod="mod" :eff="eff ?? mod.getCondition()" :link="link" bare />
            </div>
            <div v-else-if="weapon" class="-mx-3.75 -my-2.5">
                <WeaponTooltip :weapon="weapon" :link="link" bare />
            </div>
            <div v-else-if="char" class="-mx-3.75 -my-2.5">
                <CharTooltip :char="char" :link="link" bare />
            </div>
            <div v-else class="flex flex-col gap-2 max-w-75 min-w-28">
                <div v-if="image" class="relative -mx-3.75 -mt-2.5 mb-1 h-24 w-64 overflow-hidden">
                    <img :src="image" :alt="title" class="absolute inset-0 h-full w-full object-cover" />
                    <span
                        v-if="tag"
                        class="absolute left-2 top-2 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-base-100"
                    >
                        {{ tag }}
                    </span>
                    <span
                        v-if="badge"
                        class="absolute right-2 top-2 border border-base-content/25 bg-base-100/60 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-base-content/70 backdrop-blur-sm"
                    >
                        {{ badge }}
                    </span>
                </div>
                <div class="flex">
                    <div v-if="title" class="text-sm font-bold">
                        <SRouterLink v-if="link" :to="link" class="cursor-pointer hover:underline">{{ title }}</SRouterLink>
                        <span v-else>{{ title }}</span>
                        <span v-if="rarity" class="ml-1" :class="getRaritySwatchClass(rarity)" />
                    </div>
                    <div v-if="polarity || cost" class="ml-auto badge badge-sm badge-soft gap-1 text-base-content/80">
                        {{ cost }}
                        <Icon v-if="polarity" :icon="`po-${polarity}`" />
                    </div>
                </div>
                <div v-if="desc" class="text-xs text-gray-400">
                    {{ desc }}
                </div>
                <div v-if="applicableSkill" class="flex justify-between items-center gap-2 text-sm">
                    <div class="text-xs text-neutral-500 whitespace-nowrap">{{ $t("char-build.buff_applicable") }}</div>
                    <div class="font-medium text-primary">{{ applicableSkillText }}</div>
                </div>
                <div
                    v-for="[ prop, val ] in Object.entries(props).filter(([, val]) => val)"
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
                    v-for="[ prop, val ] in Object.entries(eff?.props || {}).filter(([prop, val]) => val && !props[prop])"
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
