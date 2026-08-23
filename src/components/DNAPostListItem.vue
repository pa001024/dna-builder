<script setup lang="ts">
import type { DNAPostListBean } from "dna-api"
import { onUnmounted } from "vue"
import { useUIStore } from "@/store/ui"

const ui = useUIStore()

defineProps<{
    post: DNAPostListBean
}>()

onUnmounted(() => {
    ui.stopImagePreview()
})
</script>

<template>
    <article
        class="group relative cursor-pointer overflow-hidden rounded-xs border border-base-content/15 bg-base-100/60 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
        v-bind="$attrs"
        @click="$router.push(`/dna/posts/${post.gameForumId}/${post.postId}`)"
    >
        <div class="p-3">
            <!-- 帖子头部：用户信息 -->
            <div class="flex items-center gap-3">
                <img
                    v-if="post.userHeadUrl"
                    :src="post.userHeadUrl"
                    alt="用户头像"
                    class="h-9 w-9 shrink-0 rounded-full border border-base-content/15 object-cover"
                />
                <div
                    v-else
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-base-content/15 bg-base-content/5"
                >
                    <span class="text-sm text-base-content/60">{{ post.userName?.[0] || "?" }}</span>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <span class="truncate text-sm font-medium text-base-content">{{ post.userName }}</span>
                        <span v-if="post.isOfficial === 1" class="shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            官方
                        </span>
                        <span v-if="post.isElite === 1" class="shrink-0 rounded-xs border border-secondary/40 bg-secondary/10 px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                            精华
                        </span>
                    </div>
                    <div class="mt-0.5 text-xs text-base-content/50">
                        {{ post.showTime }}
                    </div>
                </div>
            </div>

            <!-- 帖子标题 -->
            <EmojiContent class="text-base font-semibold text-base-content mt-2.5" :content="post.postTitle" />

            <!-- 帖子内容预览 -->
            <EmojiContent class="text-sm text-base-content/70 mt-1 line-clamp-2" :content="post.postContent" />

            <!-- 帖子图片预览 -->
            <div v-if="post.imgCount > 0" class="flex gap-2 mt-2.5">
                <img
                    v-for="(img, index) in post.imgContent.slice(0, 3)"
                    :key="index"
                    :src="img.url"
                    alt="帖子图片"
                    class="h-14 w-14 rounded-xs border border-base-content/10 object-cover cursor-pointer transition-transform duration-200 hover:scale-105"
                    @mouseenter="ui.startImagePreview(img.url, $event)"
                    @mouseleave="ui.stopImagePreview()"
                />
                <div
                    v-if="post.imgCount > 3"
                    class="flex h-14 w-14 items-center justify-center rounded-xs border border-base-content/10 bg-base-content/5 text-xs text-base-content/50"
                >
                    +{{ post.imgCount - 3 }}
                </div>
            </div>

            <!-- 帖子统计信息 -->
            <div class="mt-2.5 flex items-center gap-4 text-xs text-base-content/60">
                <!-- 话题标签 -->
                <div v-if="post.topics && post.topics.length > 0" class="flex flex-wrap gap-1.5">
                    <span v-for="topic in post.topics" :key="topic.topicId" class="inline-flex items-center gap-0.5 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/60">
                        <Icon icon="ri:hashtag" class="size-3 text-base-content/60" />
                        {{ topic.topicName }}
                    </span>
                </div>
                <div class="ml-auto flex items-center gap-4">
                    <span class="inline-flex items-center gap-1 tabular-nums">
                        <Icon icon="ri:eye-line" class="text-base-content/60" />
                        {{ post.browseCount }}
                    </span>
                    <span class="inline-flex items-center gap-1 tabular-nums">
                        <Icon icon="ri:message-2-line" class="text-base-content/60" />
                        {{ post.commentCount }}
                    </span>
                    <span class="inline-flex items-center gap-1 tabular-nums">
                        <Icon icon="ri:heart-line" class="text-base-content/60" />
                        {{ post.likeCount }}
                    </span>
                </div>
            </div>
        </div>
    </article>
</template>
