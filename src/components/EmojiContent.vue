<template>
    <component :is="props.tag" v-bind="$attrs">
        <template v-for="(segment, index) in contentSegments" :key="index">
            <img v-if="segment.type === 'emoji'" :src="segment.content" :alt="segment.alt" class="inline-block w-6 h-6 align-middle" />
            <span v-else>{{ segment.content }}</span>
        </template>
    </component>
</template>

<script setup lang="ts">
import { ref, watchEffect } from "vue"
import { getEmoji } from "../util"

const props = withDefaults(
    defineProps<{
        content: string
        tag?: string | import("vue").Component
    }>(),
    {
        tag: "div",
    },
)

const emojiPattren = /_\[\/[\u4e00-\u9fa5-a-zA-Z0-9？！@#%&?!+=~…]*]/g

interface ContentSegment {
    type: "text" | "emoji"
    content: string
    alt?: string
}

const contentSegments = ref<ContentSegment[]>([])

watchEffect(() => {
    const segments: ContentSegment[] = []
    const text = props.content
    let lastIndex = 0
    let match

    // 重置正则表达式的lastIndex，避免多次调用时出现问题
    emojiPattren.lastIndex = 0

    while ((match = emojiPattren.exec(text)) !== null) {
        // 添加匹配前的文本
        if (match.index > lastIndex) {
            segments.push({
                type: "text",
                content: text.slice(lastIndex, match.index),
            })
        }

        // 处理表情符号
        const emojiKey = match[0].slice(1)
        const emojiUrl = getEmoji(emojiKey)
        if (emojiUrl) {
            segments.push({
                type: "emoji",
                content: emojiUrl,
                alt: match[0],
            })
        } else {
            // 如果没有找到对应的表情，作为普通文本处理
            segments.push({
                type: "text",
                content: match[0],
            })
        }

        lastIndex = match.index + match[0].length
    }

    // 添加剩余的文本
    if (lastIndex < text.length) {
        segments.push({
            type: "text",
            content: text.slice(lastIndex),
        })
    }

    contentSegments.value = segments
})
</script>
