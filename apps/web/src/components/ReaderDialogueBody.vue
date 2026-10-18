<script lang="ts">
/**
 * 阅读模式的对话正文排版：说话人名 + 台词段落。
 *
 * 任务剧情（DBQuestDetailItem）与光阴集（DBPartyTopicDetailItem）的阅读模式
 * 都把对话链展开成 {@link ReaderDialogueLine} 后交给本组件渲染。
 */
export interface ReaderDialogueLine {
    /** 行唯一键，用作 v-for key */
    key: string | number
    /** 说话人名称（游戏原文键，展示前过 $t）；旁白等无说话人行留空 */
    speaker?: string
    /** 台词原文（含剧情样式标签与占位符，由 StoryArticleBody 解析） */
    content: string
}
</script>

<script setup lang="ts">
import StoryArticleBody from "@/components/StoryArticleBody.vue"

defineProps<{
    lines: ReaderDialogueLine[]
}>()
</script>

<template>
    <div class="space-y-9">
        <div v-for="line in lines" :key="line.key">
            <p v-if="line.speaker" class="mb-1.5 text-[11px] font-semibold tracking-[0.18em] text-primary">
                {{ $t(line.speaker) }}
            </p>
            <StoryArticleBody :text="line.content" paragraph-gap="space-y-4" unwrap-lines :translate="false" />
        </div>
    </div>
</template>
