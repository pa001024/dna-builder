<script setup lang="ts">
import { DNAAPI, DNAPostDetailResponse } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const postRes = ref<DNAPostDetailResponse | null>(null)
const loading = ref(true)
const commentLoading = ref(false)
const commentContent = ref("")

const postId = computed(() => route.params.postId as string)

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage("请先登录")
        router.push("/game-accounts")
        return
    }
    api = p

    await loadPostDetail()
})

async function loadPostDetail(softReload = false) {
    try {
        if (!softReload) loading.value = true
        const res = await api.getPostDetail(postId.value)
        if (res.is_success && res.data) {
            postRes.value = res.data
        } else {
            ui.showErrorMessage(res.msg || "获取帖子详情失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取帖子详情失败", e)
    } finally {
        loading.value = false
    }
}

async function follow(userId: string, unfollow?: boolean) {
    const res = await api.followUser(userId, unfollow)
    if (res.is_success) {
        await loadPostDetail(true)
    }
}

async function submitComment() {
    if (!commentContent.value.trim()) {
        ui.showErrorMessage("评论内容不能为空")
        return
    }

    if (!postRes.value?.postDetail) {
        return
    }

    try {
        commentLoading.value = true

        const post = {
            userId: postRes.value.postDetail.postUserId,
            postId: postRes.value.postDetail.id,
            gameForumId: postRes.value.postDetail.gameForumId,
        }

        const res = await api.createComment(post, commentContent.value.trim())

        if (res.is_success) {
            // 清空输入框
            commentContent.value = ""
            // 重新加载帖子详情以获取最新评论
            await loadPostDetail()
            ui.showSuccessMessage("评论发布成功")
        } else {
            ui.showErrorMessage(res.msg || "评论发布失败")
        }
    } catch (e) {
        ui.showErrorMessage("评论发布失败", e)
    } finally {
        commentLoading.value = false
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <!-- 头部 -->
        <div class="flex-none p-4 bg-base-100 border-b border-base-200 flex items-center justify-between">
            <button class="btn btn-ghost" @click="router.back()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
            </button>
            <h1 class="text-xl font-bold inline-flex justify-center items-center gap-4">
                <img :src="postRes?.postDetail?.gameForumVo.iconUrl" class="size-8" />
                {{ postRes?.postDetail?.gameForumVo.name || "帖子详情" }}
            </h1>
            <div class="w-12" />
            <!-- Spacer -->
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-auto p-4">
            <div v-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="postRes?.postDetail" class="space-y-6">
                <!-- 帖子基本信息 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <div class="flex items-center gap-3 mb-2">
                            <SRouterLink :to="`/dna/mine/${postRes.postDetail.postUserId}`" class="cursor-pointer">
                                <img
                                    :src="postRes.postDetail.headCodeUrl"
                                    alt="用户头像"
                                    class="w-10 h-10 rounded-full object-cover border border-base-300"
                                />
                            </SRouterLink>
                            <div class="flex-1">
                                <div class="flex items-center gap-2">
                                    <span class="font-medium text-base-content">{{ postRes.postDetail.userName }}</span>
                                </div>
                                <div class="text-xs text-base-content/60">
                                    {{ postRes.postDetail.postTime }}
                                </div>
                            </div>
                            <div class="btn" @click="follow(postRes.postDetail.postUserId, !!postRes.isFollow)">
                                {{ postRes.isFollow ? "取消关注" : "关注" }}
                            </div>
                        </div>
                        <!-- 帖子标题 -->
                        <h2 class="text-2xl font-bold mb-2">
                            {{ postRes.postDetail.postTitle }}
                        </h2>

                        <!-- 帖子元信息 -->
                        <div class="flex flex-wrap gap-2 mb-4 text-sm text-base-content/70">
                            <span class="text-xs text-base-content/50">
                                <span>浏览: {{ postRes.postDetail.browseCount }}</span>
                                <span>评论: {{ postRes.postDetail.commentCount }}</span>
                                <span>点赞: {{ postRes.postDetail.likeCount }}</span>
                                <span>收藏: {{ postRes.postDetail.collectionCount }}</span></span
                            >
                        </div>

                        <!-- 帖子标签 -->
                        <div class="flex flex-wrap gap-2">
                            <span v-if="postRes.postDetail.isElite === 1" class="badge badge-secondary text-xs">精华</span>
                            <span v-if="postRes.postDetail.isOfficial === 1" class="badge badge-info text-xs">官方</span>
                            <span v-for="(topic, index) in postRes.postDetail.topics" :key="index" class="badge badge-outline text-xs">
                                <Icon icon="ri:hashtag" />
                                {{ topic.topicName }}</span
                            >
                        </div>
                    </div>
                </div>

                <!-- 帖子内容 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <div class="space-y-6">
                            <DNAPostContent :contents="postRes.postDetail.postContent" />
                        </div>
                    </div>
                </div>

                <!-- 评论区 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title text-xl mb-4">评论 ({{ postRes.comment.length }})</h3>

                        <!-- 评论列表 -->
                        <div class="space-y-4">
                            <div v-for="comment in postRes.comment" :key="comment.commentId" class="p-4 bg-base-200 rounded-lg">
                                <!-- 评论头部 -->
                                <div class="flex items-center gap-3 mb-2">
                                    <SRouterLink :to="`/dna/mine/${comment.userId}`" class="cursor-pointer">
                                        <img
                                            :src="comment.userHeadUrl"
                                            alt="用户头像"
                                            class="w-10 h-10 rounded-full object-cover border border-base-300"
                                        />
                                    </SRouterLink>
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium text-base-content">{{ comment.userName }}</span>
                                            <span v-if="comment.isOfficial === 1" class="badge badge-sm badge-primary text-xs">官方</span>
                                            <span v-if="comment.isCreator === 1" class="badge badge-sm badge-secondary text-xs"
                                                >创作者</span
                                            >
                                        </div>
                                        <div class="text-xs text-base-content/60">
                                            {{ comment.commentTime }}
                                        </div>
                                    </div>
                                    <span class="text-xs text-base-content/50">#{{ comment.floor }}</span>
                                </div>

                                <!-- 评论内容 -->
                                <div class="mb-3 text-base-content">
                                    <DNAPostContent :contents="comment.commentContent" />
                                </div>

                                <!-- 评论操作 -->
                                <div class="flex items-center gap-4 text-sm text-base-content/70">
                                    <button class="flex items-center gap-1 hover:text-primary transition-colors">
                                        <span>
                                            <Icon icon="ri:heart-line" />
                                        </span>
                                        <span>{{ comment.likeCount }}</span>
                                    </button>
                                    <button class="flex items-center gap-1 hover:text-primary transition-colors">
                                        <span>
                                            <Icon icon="ri:message-2-line" />
                                        </span>
                                        <span>{{ comment.replyCount }}</span>
                                    </button>
                                </div>

                                <!-- 回复列表 -->
                                <div v-if="comment.replyVos && comment.replyVos.length > 0" class="mt-3 space-y-3 pl-4">
                                    <div
                                        v-for="reply in comment.replyVos"
                                        :key="reply.postCommentReplayId"
                                        class="p-3 bg-base-100 rounded-lg"
                                    >
                                        <div class="flex items-center gap-2 mb-1">
                                            <span class="font-medium text-sm">{{ reply.userName }}</span>
                                            <span class="text-xs text-base-content/60">{{ reply.replyTime }}</span>
                                        </div>
                                        <div class="text-sm text-base-content/80">
                                            <DNAPostContent :contents="reply.replyContent" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 无评论提示 -->
                            <div v-if="postRes.comment.length === 0" class="text-center py-8">
                                <p class="text-base-content/60 mb-2">暂无评论</p>
                                <p class="text-xs text-base-content/40">成为第一个评论的人吧</p>
                            </div>
                        </div>

                        <!-- 加载更多按钮 -->
                        <div v-if="postRes.hasNext === 1" class="flex justify-center mt-6">
                            <button class="btn btn-outline">加载更多</button>
                        </div>

                        <!-- 发表评论 -->
                        <div class="mt-6 pt-6 border-t border-base-200">
                            <h3 class="text-lg font-semibold mb-4">发表评论</h3>
                            <div class="space-y-4">
                                <textarea
                                    v-model="commentContent"
                                    placeholder="写下你的评论..."
                                    class="textarea textarea-bordered w-full min-h-30 bg-base-100 border-base-300 text-base-content"
                                    :disabled="commentLoading"
                                />
                                <div class="flex justify-end">
                                    <button
                                        class="btn btn-primary"
                                        :disabled="commentLoading || !commentContent.trim()"
                                        @click="submitComment"
                                    >
                                        <span v-if="commentLoading" class="loading loading-spinner loading-sm mr-2" />
                                        {{ commentLoading ? "发布中..." : "发布评论" }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4">无法获取帖子详情</p>
                    <button class="btn btn-secondary" @click="loadPostDetail()">重试</button>
                </div>
            </div>
        </div>
    </div>
</template>
