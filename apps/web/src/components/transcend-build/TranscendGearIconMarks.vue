<script setup lang="ts">
import TranscendGearMark from "./TranscendGearMark.vue"

/**
 * 装备图标左上角标记：只渲染太古红星（官方图标角标无最终精锻黄点）。
 * 专属橙菱只出现在词条行，图标永不渲染（上游 `DNASeasonEquipItem`）。
 * `suppressTitle` 用于富预览 / 槽位子树：抑制标记 SVG `<title>` 元素。
 */

withDefaults(
    defineProps<{
        ancient?: boolean
        suppressTitle?: boolean
    }>(),
    { ancient: false, suppressTitle: false }
)
</script>

<template>
    <span class="flex flex-col items-center gap-0.5" data-gear-icon-marks>
        <TranscendGearMark v-if="ancient" kind="ancient" :suppress-title="suppressTitle" />
    </span>
</template>
