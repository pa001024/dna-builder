<script setup lang="ts">
import { DNAPostListBean } from "dna-api"
import { useUIStore } from "../store/ui"
const ui = useUIStore()

defineProps<{
    post: DNAPostListBean
}>()
</script>

<template>
    <div
        class="card bg-base-100 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
        v-bind="$attrs"
        @click="$router.push(`/dna/posts/${post.gameForumId}/${post.postId}`)"
    >
        <div class="card-body p-4">
            <!-- 帖子头部：用户信息 -->
            <div class="flex items-center gap-3 mb-3">
                <img
                    v-if="post.userHeadUrl"
                    :src="post.userHeadUrl"
                    alt="用户头像"
                    class="w-10 h-10 rounded-full object-cover border border-base-200"
                />
                <div v-else class="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center">
                    <span class="text-base-content/60">{{ post.userName?.[0] || "?" }}</span>
                </div>
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-base-content">{{ post.userName }}</span>
                        <span v-if="post.isOfficial === 1" class="badge badge-primary text-xs">官方</span>
                        <span v-if="post.isElite === 1" class="badge badge-secondary text-xs">精华</span>
                    </div>
                    <div class="text-xs text-base-content/50 mt-1">
                        {{ post.showTime }}
                    </div>
                </div>
            </div>

            <!-- 帖子标题 -->
            <EmojiContent class="card-title text-base-content text-lg mb-2" :content="post.postTitle" />

            <!-- 帖子内容预览 -->
            <EmojiContent class="text-sm text-base-content/70 mb-3 line-clamp-2" :content="post.postContent" />

            <!-- 帖子图片预览 -->
            <div v-if="post.imgCount > 0" class="flex gap-2 mb-3">
                <img
                    v-for="(img, index) in post.imgContent.slice(0, 3)"
                    :key="index"
                    :src="img.url"
                    alt="帖子图片"
                    class="w-16 h-16 object-cover rounded-md cursor-pointer transition-transform hover:scale-105"
                    @mouseenter="ui.startImagePreview(img.url, $event)"
                    @mouseleave="ui.stopImagePreview()"
                />
                <div
                    v-if="post.imgCount > 3"
                    class="w-16 h-16 bg-base-200 rounded-md flex items-center justify-center text-xs text-base-content/50"
                >
                    +{{ post.imgCount - 3 }}
                </div>
            </div>

            <!-- 帖子统计信息 -->
            <div class="flex items-center gap-4 text-xs text-base-content/60">
                <!-- 话题标签 -->
                <div v-if="post.topics && post.topics.length > 0" class="flex flex-wrap gap-2">
                    <span v-for="topic in post.topics" :key="topic.topicId" class="badge badge-outline text-xs">
                        <Icon icon="ri:hashtag" class="text-base-content/60" />
                        {{ topic.topicName }}
                    </span>
                </div>
                <div class="flex ml-auto gap-4">
                    <div class="flex items-center gap-1">
                        <Icon icon="ri:eye-line" class="text-base-content/60" />
                        <span>{{ post.browseCount }}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <Icon icon="ri:message-2-line" class="text-base-content/60" />
                        <span>{{ post.commentCount }}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <Icon icon="ri:heart-line" class="text-base-content/60" />
                        <span>{{ post.likeCount }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
