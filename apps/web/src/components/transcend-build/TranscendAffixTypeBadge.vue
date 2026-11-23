<script setup lang="ts">
import { computed } from "vue"
import type { TranscendAffixUiType } from "@/utils/transcendence-gear"

/**
 * 词缀类型徽章：普通 / 专属 / 宝石 / 未知。
 * 颜色只做辅助，文案始终可见；`count` 用于槽位摘要之类的聚合场景。
 * U49 起宝石词缀行不再渲染文字徽章（语义由 `data-affix-type` + `aria-label` 承载），不得加回。
 */

const props = withDefaults(
    defineProps<{
        type?: TranscendAffixUiType | null
        count?: number
        tiny?: boolean
        /** 预览模式（tooltip 内嵌）：抑制原生 title，保留文案 / data 语义 */
        preview?: boolean
    }>(),
    { preview: false }
)

const labelKey = computed(() => (props.type ? `transcend-build.gear_type_${props.type}` : ""))

const toneClass = computed(() => {
    if (props.type === "unique") return "border-warning/50 bg-warning/5 text-warning/90"
    if (props.type === "gem") return "border-info/50 bg-info/5 text-info/90"
    if (props.type === "unknown") return "border-error/40 bg-error/5 text-error/80"
    return "border-base-content/25 text-base-content/55"
})
</script>

<template>
    <span
        v-if="type"
        class="inline-flex shrink-0 items-center border px-1 py-px leading-none"
        :class="[toneClass, tiny ? 'text-[8px]' : 'text-[10px]']"
        :title="preview ? undefined : $t(labelKey)"
        :data-affix-type="type"
    >
        {{ $t(labelKey) }}<template v-if="count !== undefined">&nbsp;{{ count }}</template>
    </span>
</template>
