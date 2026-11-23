<script setup lang="ts">
import { computed } from "vue"
import { TRANSCEND_ANCIENT_TOTAL_EM, TRANSCEND_LINE_MARKS } from "@/utils/transcendence-icon"

/**
 * 太古星：官方 tips 贴图 `T_Season_Tips_Point_02`（1.8 pak 原尺寸 56×56，alpha bbox 42×47）。
 * 贴图本身即红色多刺爆裂星（高光 ~#FF8B8B、主体 ~#DD6A65、暗部 ~#A7392F，黑心 / 黑描边保留），
 * 与游戏截图逐色一致，`line` / `badge` / `total` 均用 `<img>` 原色渲染，禁止再叠 mask / 滤镜染色：
 * `line` 撑满 1.8667em 标记层（居中溢出 1.6em 槽，上游 `SizeBox_Point` 不裁剪）；
 * `total` 为 Tips 顶部总数条单颗星 1.2em（`TRANSCEND_ANCIENT_TOTAL_EM`），由外层统一 aria-label；
 * `badge` 12px 用于装备图标角标（U54 口径，布尔一颗）。
 * `suppressTitle` 抑制 `title` 提示（富预览 / 槽位子树），`aria-label` 保留。
 */
const props = withDefaults(
    defineProps<{
        /** 12px 图标角标 / 1.8667em 词条行 / 1.2em 顶部总数条 */
        variant?: "badge" | "line" | "total"
        suppressTitle?: boolean
    }>(),
    { variant: "badge", suppressTitle: false }
)

/** 顶部总数条按 em 缩放（随名称行字号），其余变体由 class 定尺寸 */
const totalStyle = computed(() =>
    props.variant === "total"
        ? { width: `${TRANSCEND_ANCIENT_TOTAL_EM}em`, height: `${TRANSCEND_ANCIENT_TOTAL_EM}em` }
        : undefined
)
</script>

<template>
    <img
        class="block shrink-0"
        :class="variant === 'line' ? 'size-full' : variant === 'badge' ? 'size-3' : ''"
        :style="totalStyle"
        :src="TRANSCEND_LINE_MARKS.ancient.url"
        alt=""
        draggable="false"
        data-transcend-mark-icon
        role="img"
        :aria-label="$t('transcend-build.gear_ancient')"
        :title="suppressTitle ? undefined : $t('transcend-build.gear_ancient')"
    />
</template>
