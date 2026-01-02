<script setup lang="tsx">
import { formatProp } from "../util"
withDefaults(
    defineProps<{
        props: Record<string, any>
        code?: string
        side?: "top" | "bottom" | "left" | "right"
        title?: string
        desc?: string
        effdesc?: string
        polarity?: "A" | "D" | "V" | "O"
        cost?: number
        type?: string
        eff?: { isEffective: boolean; props?: Record<string, any> }
    }>(),
    {
        side: "top",
    },
)

const formatDesc = (desc: string) => {
    const po = desc.match(/([DVOA])趋向/)
    if (!po) {
        return desc
    }
    const parts = desc.split(po[0])
    return [parts[0], po[1], parts[1]]
}
</script>
<template>
    <FullTooltip :side="side">
        <template #tooltip>
            <div class="flex flex-col gap-2 max-w-[300px] min-w-28">
                <div v-if="title" class="text-sm font-bold">{{ title }}</div>
                <div v-if="desc" class="text-xs text-gray-400">{{ desc }}</div>
                <div v-if="polarity || cost" class="ml-auto badge badge-sm badge-soft gap-1 text-base-content/80">
                    {{ cost }}
                    <Icon v-if="polarity" :icon="`po-${polarity}`" />
                </div>
                <div
                    v-for="[prop, val] in Object.entries(props).filter(([_, v]) => v)"
                    :key="prop"
                    class="flex justify-between items-center gap-2 text-sm"
                >
                    <div class="text-xs text-neutral-500 whitespace-nowrap">
                        {{ prop.startsWith("基础") ? `${$t("基础")}${$t(prop.slice(2))}` : $t(prop) }}
                    </div>
                    <div class="font-medium text-primary">{{ formatProp(prop, val) }}</div>
                </div>
                <div
                    v-if="eff && !eff.isEffective"
                    v-for="[prop, val] in Object.entries(eff.props!).filter(([_, v]) => v)"
                    :key="prop"
                    class="flex justify-between items-center gap-2 text-sm line-through"
                >
                    <div class="text-xs text-neutral-500">{{ $t(prop) }}</div>
                    <div class="font-medium text-primary">{{ formatProp(prop, val) }}</div>
                </div>
                <div v-if="effdesc" class="text-xs text-neutral-500">
                    <span v-if="/[DVOA]趋向/.test(effdesc)">
                        <template v-for="(part, index) in formatDesc(effdesc)">
                            <span v-if="index !== 1">{{ part }}</span>
                            <span v-else><Icon class="inline-block mx-1" :icon="`po-${part as 'A' | 'D' | 'V' | 'O'}`" />趋向</span>
                        </template>
                    </span>
                    <span v-else>{{ effdesc }}</span>
                </div>

                <div v-if="code" class="text-xs text-gray-400">
                    <div class="text-xs text-neutral-500">{{ $t("char-build.dynamic_prop") }}</div>
                    {{ code }}
                </div>
                <div v-if="type" class="text-xs text-neutral-500 font-bold">{{ type }}</div>
            </div>
        </template>
        <slot></slot>
    </FullTooltip>
</template>
