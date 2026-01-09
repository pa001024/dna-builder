<script setup lang="ts">
import { DNACommentContentBean, DNAPostContentBean, PostContentType } from "dna-api"

defineProps<{
    contents: (DNAPostContentBean | DNACommentContentBean)[]
}>()
</script>
<template>
    <template v-for="(content, index) in contents" :key="index">
        <!-- 文本内容 -->
        <EmojiContent :content="content.content!" v-if="content.contentType === PostContentType.TEXT" class="prose prose-base max-w-none" />

        <!-- 图片内容 -->
        <div v-else-if="content.contentType === PostContentType.IMAGE" class="flex justify-center">
            <img
                v-if="content.url"
                :src="content.url"
                :alt="`帖子图片 ${index + 1}`"
                class="max-w-full rounded-lg object-cover shadow-md"
            />
        </div>

        <!-- 视频内容 -->
        <div v-else-if="content.contentType === PostContentType.VIDEO" class="flex justify-center">
            <video
                v-if="(content as DNAPostContentBean).contentVideo?.videoUrl"
                :src="(content as DNAPostContentBean).contentVideo.videoUrl"
                controls
                class="max-w-full rounded-lg object-cover shadow-md"
            >
                您的浏览器不支持视频播放
            </video>
            <img
                v-else-if="(content as DNAPostContentBean).contentVideo?.coverUrl"
                :src="(content as DNAPostContentBean).contentVideo.coverUrl"
                :alt="`视频封面 ${index + 1}`"
                class="max-w-full rounded-lg shadow-md"
            />
        </div>

        <!-- 其他内容类型 -->
        <div v-else class="text-sm text-base-content/50 p-3 bg-base-200 rounded-lg">[不支持的内容类型: {{ content.contentType }}]</div>
    </template>
</template>
