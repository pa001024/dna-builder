<script setup lang="ts">
import { ref, watchEffect } from "vue"
import { getEmoji, type EmojiStyle } from "../util"

const props = withDefaults(
    defineProps<{
        content: string
        tag?: string | import("vue").Component
    }>(),
    {
        tag: "div",
    }
)

const emojiPattren = /_\[\/[\u4e00-\u9fa5-a-zA-Z0-9？！@#%&?!+=~…]*]/g

interface ContentSegment {
    type: "text" | "emoji"
    content: string
    alt?: string
    emojiStyle?: EmojiStyle
}

const contentSegments = ref<ContentSegment[]>([])

watchEffect(() => {
    const segments: ContentSegment[] = []
    const text = props.content
    let lastIndex = 0
    let match

    emojiPattren.lastIndex = 0

    while ((match = emojiPattren.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({
                type: "text",
                content: text.slice(lastIndex, match.index),
            })
        }

        const emojiKey = match[0].slice(1)
        const emojiStyle = getEmoji(emojiKey)
        if (emojiStyle) {
            segments.push({
                type: "emoji",
                content: emojiStyle.src,
                alt: match[0],
                emojiStyle,
            })
        } else {
            segments.push({
                type: "text",
                content: match[0],
            })
        }

        lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
        segments.push({
            type: "text",
            content: text.slice(lastIndex),
        })
    }

    contentSegments.value = segments
})
</script>
<template>
    <component :is="props.tag" v-bind="$attrs">
        <template v-for="(segment, index) in contentSegments" :key="index">
            <img
                v-if="segment.type === 'emoji' && segment.emojiStyle?.type === 'local'"
                :src="segment.emojiStyle.src"
                :alt="segment.alt"
                class="inline-block w-12 h-12 align-middle"
            />
            <span
                v-else-if="segment.type === 'emoji' && segment.emojiStyle?.type === 'remote'"
                class="inline-block w-12 h-12 align-middle emoji-sprite"
                :style="{
                    'background-image': `url(${segment.emojiStyle.src})`,
                    'background-size': `${segment.emojiStyle.size}px`,
                    'background-position': segment.emojiStyle.position,
                }"
            />
            <span v-else>{{ segment.content }}</span>
        </template>
    </component>
</template>
<style>
.emoji-sprite {
    display: inline-block;
    background-repeat: no-repeat;
    background-origin: padding-box;
    background-clip: border-box;
}
</style>
