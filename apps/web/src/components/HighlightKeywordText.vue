<script lang="ts" setup>
import { computed } from "vue"
import { buildHighlightSegments, type HighlightSegment, type HighlightSnippet } from "@/utils/keyword-highlight"

const props = withDefaults(
    defineProps<{
        /** 待展示文本（命中片段会套上主色高亮） */
        text?: string
        /** 已截断好的命中摘要；与 text 二选一 */
        snippet?: HighlightSnippet | null
        /** 关键词；为空时不启用高亮 */
        keyword?: string
    }>(),
    { text: "", snippet: null, keyword: "" }
)

const segments = computed<HighlightSegment[]>(() => {
    if (props.snippet) {
        return props.snippet.segments
    }
    const keyword = props.keyword.trim()
    return keyword ? buildHighlightSegments(props.text, keyword) : [{ text: props.text, highlighted: false }]
})

const prefixEllipsis = computed(() => props.snippet?.prefixEllipsis ?? false)
const suffixEllipsis = computed(() => props.snippet?.suffixEllipsis ?? false)
</script>

<template>
    <span>
        <template v-if="prefixEllipsis">...</template>
        <template v-for="(segment, index) in segments" :key="index">
            <mark
                v-if="segment.highlighted"
                class="rounded-xs bg-primary/20 px-0.5 font-semibold text-primary underline decoration-primary/80 decoration-2 underline-offset-2"
                >{{ segment.text }}</mark
            >
            <template v-else>{{ segment.text }}</template>
        </template>
        <template v-if="suffixEllipsis">...</template>
    </span>
</template>
