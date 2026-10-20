<script setup lang="ts">
import { DNACommentContentBean, DNAPostContentBean, PostContentType } from "dna-api"

defineProps<{
    contents: (DNAPostContentBean | DNACommentContentBean)[]
}>()
</script>
<template>
    <template v-for="(content, index) in contents" :key="index">
        <!-- 文本内容 -->
        <EmojiContent v-if="content.contentType === PostContentType.TEXT" :content="content.content!" class="prose prose-base max-w-none" />

        <!-- 图片内容 -->
        <div v-else-if="content.contentType === PostContentType.IMAGE" class="flex justify-center">
            <img
                v-if="content.url"
                :src="content.url"
                :alt="`帖子图片 ${index + 1}`"
                class="max-w-full rounded-xs border border-base-content/10 object-cover"
            />
        </div>

        <!-- 视频内容 -->
        <div v-else-if="content.contentType === PostContentType.VIDEO" class="flex justify-center">
            <video
                v-if="(content as DNAPostContentBean).contentVideo?.videoUrl"
                :src="(content as DNAPostContentBean).contentVideo.videoUrl"
                controls
                class="max-w-full rounded-xs border border-base-content/10 object-cover"
            >
                {{ $t("dna-post-content.video_unsupported") }}
            </video>
            <img
                v-else-if="(content as DNAPostContentBean).contentVideo?.coverUrl"
                :src="(content as DNAPostContentBean).contentVideo.coverUrl"
                :alt="`视频封面 ${index + 1}`"
                class="max-w-full rounded-xs border border-base-content/10"
            />
        </div>

        <!-- 其他内容类型 -->
        <div v-else class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm text-base-content/50">[不支持的内容类型: {{ content.contentType }}]</div>
    </template>
</template>
