<script lang="ts" setup>
import { computed } from "vue"
import {
    buildSearchStorySegments,
    DEFAULT_STORY_TEXT_CONFIG,
    type SearchableStoryTextSegment,
    type StoryTextConfig,
} from "@/utils/story-text"

const props = withDefaults(
    defineProps<{
        text: string
        keyword?: string
        storyConfig?: StoryTextConfig
    }>(),
    {
        keyword: "",
        storyConfig: undefined,
    }
)

const resolvedStoryConfig = computed<StoryTextConfig>(() => props.storyConfig ?? DEFAULT_STORY_TEXT_CONFIG)

const textSegments = computed(() => buildSearchStorySegments(props.text, props.keyword || "", resolvedStoryConfig.value))

/**
 * 根据片段语调与命中状态生成样式类。
 * @param segment 渲染片段
 * @returns 样式类名
 */
function getSegmentClasses(segment: SearchableStoryTextSegment): string {
    const toneClasses: Record<SearchableStoryTextSegment["tone"], string> = {
        normal: "",
        highlight: "font-semibold text-primary",
        warning: "font-semibold text-error",
        title: "font-semibold text-base-content",
        blue: "font-semibold text-info",
    }

    if (!segment.highlighted) {
        return toneClasses[segment.tone]
    }

    // 命中片段叠加底色与下划线，同时保留语调颜色（如 <W> 的红色警示文字）
    const markClasses = "rounded-xs bg-primary/20 px-0.5 underline decoration-primary/80 decoration-2 underline-offset-2"
    if (segment.tone === "normal") {
        return `font-semibold text-primary ${markClasses}`
    }

    return `${toneClasses[segment.tone]} ${markClasses}`
}
</script>

<template>
    <span class="whitespace-pre-wrap wrap-break-word">
        <template v-for="(segment, index) in textSegments" :key="`${index}-${segment.highlighted ? 1 : 0}-${segment.tone}`">
            <span :class="getSegmentClasses(segment)">{{ segment.text }}</span>
        </template>
    </span>
</template>
