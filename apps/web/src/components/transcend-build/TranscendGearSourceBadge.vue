<script setup lang="ts">
import { computed } from "vue"
import type { TranscendGearAffixSource } from "@/data"

/**
 * 词缀来源徽章：基础 / 随机 / 暗金专属 / 未知（旧物品无法推断）。
 * 与「词缀类型」徽章（普通 / 专属 / 宝石）区分：来源说明该条词缀从哪条通道进入物品。
 *
 * @deprecated U36 起预览 / 分享 / 编辑行不再渲染来源文字徽章（官方 tips 无此文字），
 * 来源语义由行的 `data-gear-line-mark` + `aria-label` / `title` 承载。本组件已无调用，
 * **不要**再把它加回词缀行；保留文件仅为避免旧引用报错。
 */

const props = defineProps<{
    source: TranscendGearAffixSource
}>()

const labelKey = computed(() => `transcend-build.gear_source_${props.source}`)

const toneClass = computed(() => {
    if (props.source === "unique") return "border-warning/50 bg-warning/5 text-warning/90"
    if (props.source === "base") return "border-primary/40 bg-primary/5 text-primary/80"
    if (props.source === "unknown") return "border-error/40 bg-error/5 text-error/80"
    return "border-base-content/25 text-base-content/55"
})
</script>

<template>
    <span class="inline-flex shrink-0 items-center border px-1 py-px text-[10px] leading-none" :class="toneClass" :data-affix-source="source">
        {{ $t(labelKey) }}
    </span>
</template>
