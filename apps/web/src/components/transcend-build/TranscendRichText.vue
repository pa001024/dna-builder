<script setup lang="ts">
import { computed } from "vue"
import { AFFIX_TONE_CLASSES, type AffixTextSegment, parseAffixMarkup } from "@/utils/transcend-gear/richtext"

/**
 * 词缀富文本：白名单标签用 span 上色，未知标签由解析层丢弃。
 * 不使用 `v-html`，片段一律按文本插值输出（XSS 安全）。
 */

const props = defineProps<{
    /** 可能含白名单标签的原文 */
    text?: string
}>()

const segments = computed<AffixTextSegment[]>(() => parseAffixMarkup(props.text))
</script>

<template>
    <template v-for="(segment, index) in segments" :key="index">
        <span v-if="segment.tone === 'default'">{{ segment.text }}</span>
        <span v-else :class="AFFIX_TONE_CLASSES[segment.tone]" :data-affix-tone="segment.tone">{{ segment.text }}</span>
    </template>
</template>
