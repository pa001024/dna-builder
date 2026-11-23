<script setup lang="ts">
import { computed } from "vue"
import { TRANSCEND_LINE_MARKS, TRANSCEND_MARK_ICONS, transcendIconMaskStyle } from "@/utils/transcendence-icon"
import TranscendGearAncientStar from "./TranscendGearAncientStar.vue"

/**
 * 装备标记：太古红星 / 专属橙星 / 最终精锻金星。
 * 图形一律用官方 tips 贴图（`T_Season_Tips_Point_0{1,2,3}`）：
 * - `badge`（装备图标角标）：仅太古与专属（mask + `currentColor`）；官方图标角标没有最终精锻标记，
 *   `kind: "finalMasterwork"` 从类型上只允许 `variant: "line"`；
 * - `line`（词条行）：尺寸由 `TranscendGearLineMark` 的 1.6em 锚点层给（太古 56 / 太阳 32 / 橙星 40 设计值），
 *   一律 `<img>` 原色贴图，保留红色多刺星 / 太阳黑心与星星层次，不再用 currentColor 染成单色。
 * `suppressTitle` 用于富预览 / 槽位子树：抑制 `title` 提示，保留 `aria-label` 语义。
 */

/** 角标只支持太古 / 专属；最终精锻必须显式声明词条行变体 */
type TranscendGearMarkProps =
    | { kind: "ancient"; variant?: "badge" | "line"; suppressTitle?: boolean }
    | { kind: "unique"; variant?: "badge" | "line"; suppressTitle?: boolean }
    | { kind: "finalMasterwork"; variant: "line"; suppressTitle?: boolean }

const props = defineProps<TranscendGearMarkProps>()

/** 缺省为图标角标 */
const markVariant = computed(() => props.variant ?? "badge")
const hideTitle = computed(() => props.suppressTitle === true)
const uniqueStyle = transcendIconMaskStyle(TRANSCEND_MARK_ICONS.unique.url, TRANSCEND_MARK_ICONS.unique.maskSize)
</script>

<template>
    <span v-if="kind === 'ancient'" class="inline-flex shrink-0" :class="markVariant === 'line' ? 'size-full' : ''" data-gear-mark="ancient">
        <TranscendGearAncientStar :variant="markVariant" :suppress-title="hideTitle" />
    </span>
    <img
        v-else-if="kind === 'finalMasterwork' && markVariant === 'line'"
        class="block size-full shrink-0"
        :src="TRANSCEND_LINE_MARKS.finalMasterwork.url"
        alt=""
        draggable="false"
        data-transcend-mark-icon
        data-gear-mark="final-masterwork"
        role="img"
        :aria-label="$t('transcend-build.gear_mark_final_masterwork')"
        :title="hideTitle ? undefined : $t('transcend-build.gear_mark_final_masterwork')"
    />
    <img
        v-else-if="kind === 'unique' && markVariant === 'line'"
        class="block size-full shrink-0"
        :src="TRANSCEND_LINE_MARKS.unique.url"
        alt=""
        draggable="false"
        data-transcend-mark-icon
        data-gear-mark="unique"
        role="img"
        :aria-label="$t('transcend-build.gear_mark_unique')"
        :title="hideTitle ? undefined : $t('transcend-build.gear_mark_unique')"
    />
    <span
        v-else-if="kind === 'unique'"
        class="inline-block size-3 shrink-0 bg-current text-orange-400"
        data-transcend-mark-icon
        role="img"
        data-gear-mark="unique"
        :aria-label="$t('transcend-build.gear_mark_unique')"
        :title="hideTitle ? undefined : $t('transcend-build.gear_mark_unique')"
        :style="uniqueStyle"
    />
</template>
