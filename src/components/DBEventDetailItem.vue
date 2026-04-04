<script lang="ts" setup>
import type { EventItem } from "@/data/d/event.data"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextSegment } from "@/utils/story-text"
import { formatTimeRange } from "@/utils/time"

const props = defineProps<{
    event: EventItem
}>()

/**
 * 将活动文本解析为可渲染片段。
 * @param text 原始文本
 * @returns 文本片段
 */
function parseEventText(text?: string): StoryTextSegment[] {
    return parseStoryTextSegments(text || "", DEFAULT_STORY_TEXT_CONFIG)
}
</script>

<template>
    <div class="p-4 space-y-4">
        <div class="rounded-md bg-base-200 p-3">
            <div class="flex items-start justify-between gap-3">
                <SRouterLink :to="`/db/event/${event.id}`" class="text-lg font-bold link link-primary">
                    {{ event.name }}
                </SRouterLink>
                <span class="text-sm text-base-content/70">ID: {{ event.id }}</span>
            </div>
            <div class="mt-1 text-xs text-base-content/70">
                {{ formatTimeRange(event.startTime, event.endTime) }}
            </div>
        </div>

        <div class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">描述</div>
            <div class="text-sm leading-6 whitespace-pre-wrap break-all">
                <template v-for="(segment, index) in parseEventText(event.desc)" :key="`desc-${index}-${segment.tone}`">
                    <span
                        :class="{
                            'text-primary font-semibold': segment.tone === 'highlight',
                            'text-error font-semibold': segment.tone === 'warning',
                            'text-base-content font-semibold': segment.tone === 'title',
                        }"
                    >
                        {{ segment.text }}
                    </span>
                </template>
            </div>
        </div>

        <div v-if="event.rule" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">规则</div>
            <div class="text-sm leading-6 whitespace-pre-wrap break-all">
                <template v-for="(segment, index) in parseEventText(event.rule)" :key="`rule-${index}-${segment.tone}`">
                    <span
                        :class="{
                            'text-primary font-semibold': segment.tone === 'highlight',
                            'text-error font-semibold': segment.tone === 'warning',
                            'text-base-content font-semibold': segment.tone === 'title',
                        }"
                    >
                        {{ segment.text }}
                    </span>
                </template>
            </div>
        </div>

        <div v-if="event.boxDrop" class="rounded-md bg-base-200 p-3">
            <BoxDropItem :box-drop="event.boxDrop" />
        </div>
    </div>
</template>
