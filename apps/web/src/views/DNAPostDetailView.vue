<script setup lang="ts">
import { DNAAPI, type DNAPostCommentListBean, type DNAPostDetailResponse } from "dna-api"
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { uploadAbyssUsageFromPost } from "@/utils/admin-data-sync"

const setting = useSettingStore()
const ui = useUIStore()
const user = useUserStore()
const { t } = useTranslation()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const postRes = ref<DNAPostDetailResponse | null>(null)
const comments = ref<DNAPostCommentListBean[]>([])
const loading = ref(true)
const moreLoading = ref(false)
const commentLoading = ref(false)
const abyssUploadLoading = ref(false)
const commentContent = ref("")
const commentPageIndex = ref(1)
const commentHasNext = ref(false)

const postId = computed(() => route.params.postId as string)

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage(t("dna-post.loginFirst"))
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
            comments.value = res.data.comment || []
            commentHasNext.value = res.data.hasNext === 1
            commentPageIndex.value = 1
        } else {
            ui.showErrorMessage(res.msg || t("dna-post.postDetailFailed"))
        }
    } catch (e) {
        ui.showErrorMessage(t("dna-post.postDetailFailed"), e)
    } finally {
        loading.value = false
    }
}

/**
 * 加载更多评论。
 */
async function loadMoreComments() {
    if (!api || moreLoading.value || !commentHasNext.value) {
        return
    }
    try {
        moreLoading.value = true
        const nextPage = commentPageIndex.value + 1
        const res = await api.getPostCommentList(postId.value, nextPage, 20, 0)
        if (res.is_success && res.data) {
            comments.value = [...comments.value, ...(res.data.postCommentList || [])]
            commentPageIndex.value = nextPage
            commentHasNext.value = res.data.hasNext === 1
        } else {
            ui.showErrorMessage(res.msg || t("dna-post.loadMoreCommentsFailed"))
        }
    } catch (e) {
        ui.showErrorMessage(t("dna-post.loadMoreCommentsFailed"), e)
    } finally {
        moreLoading.value = false
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
        ui.showErrorMessage(t("dna-post.commentRequired"))
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
            ui.showSuccessMessage(t("dna-post.commentPublished"))
        } else {
            ui.showErrorMessage(res.msg || t("dna-post.commentPublishFailed"))
        }
    } catch (e) {
        ui.showErrorMessage(t("dna-post.commentPublishFailed"), e)
    } finally {
        commentLoading.value = false
    }
}

/**
 * 上传当前帖子评论区的深渊数据。
 */
async function uploadPostAbyssUsage() {
    if (!user.isAdmin || abyssUploadLoading.value) return
    abyssUploadLoading.value = true
    try {
        const summary = await uploadAbyssUsageFromPost(postId.value)
        ui.showSuccessMessage(`深渊数据上传完成：成功 ${summary.uploaded}，跳过 ${summary.skipped}，失败 ${summary.failed}`)
    } catch (error) {
        ui.showErrorMessage("深渊数据上传失败", error instanceof Error ? error.message : String(error))
    } finally {
        abyssUploadLoading.value = false
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <!-- 顶栏：返回 + 版块 + 管理员动作（hairline 分隔，无实底页头） -->
        <div class="flex flex-none items-center gap-2.5 border-b border-base-content/15 px-4 py-2.5">
            <button
                type="button"
                class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                @click="router.back()"
            >
                <Icon icon="ri:arrow-left-line" class="size-4" />
            </button>
            <img
                v-if="postRes?.postDetail?.gameForumVo.iconUrl"
                :src="postRes.postDetail.gameForumVo.iconUrl"
                class="size-6 shrink-0 rounded-xs border border-base-content/10 object-contain"
            />
            <h1 class="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">
                {{ postRes?.postDetail?.gameForumVo.name || $t("dna-post.postDetailTitle") }}
            </h1>
            <button
                v-if="user.isAdmin"
                type="button"
                class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xs border border-primary bg-primary px-2.5 py-1 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="abyssUploadLoading"
                @click="uploadPostAbyssUsage"
            >
                <span v-if="abyssUploadLoading" class="loading loading-spinner loading-xs" />
                <Icon v-else icon="ri:upload-cloud-line" class="size-3.5" />
                {{ $t("dna-post-detail.upload_abyss_data") }}
            </button>
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-auto">
            <div v-if="loading" class="flex h-full items-center justify-center">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="postRes?.postDetail" class="stagger-rise space-y-3 p-3 sm:p-4">
                <!-- 帖子档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
                <header class="relative overflow-hidden border-b-2 border-primary pb-4">
                    <!-- 引导线网格（装饰性，随主题明暗） -->
                    <div
                        class="pointer-events-none absolute inset-0"
                        style="
                            background-image:
                                linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                                linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                            background-size: 26px 26px;
                            mask-image: linear-gradient(to bottom, black, transparent 85%);
                        "
                        aria-hidden="true"
                    />
                    <!-- 右上角斜切楔形 -->
                    <span
                        class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                        aria-hidden="true"
                    />
                    <div class="relative flex items-start gap-3.5">
                        <SRouterLink :to="`/dna/mine/${postRes.postDetail.postUserId}`" class="relative shrink-0 cursor-pointer">
                            <img
                                :src="postRes.postDetail.headCodeUrl"
                                :alt="$t('dna-post.userAvatar')"
                                class="size-12 rounded-full border border-base-content/15 object-cover"
                            />
                        </SRouterLink>
                        <div class="relative min-w-0 flex-1">
                            <p
                                class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase"
                            >
                                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                                Post File
                            </p>
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h2
                                    class="truncate font-orbitron text-xl leading-tight font-bold tracking-tight text-base-content sm:text-2xl"
                                >
                                    {{ postRes.postDetail.postTitle }}
                                </h2>
                                <CopyID :id="postRes.postDetail.id" />
                            </div>
                            <div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-base-content/50">
                                <span class="font-medium text-base-content/80">{{ postRes.postDetail.userName }}</span>
                                <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                                <span>{{ postRes.postDetail.postTime }}</span>
                            </div>
                            <!-- 帖子元信息 -->
                            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/50">
                                <span class="tabular-nums"
                                    >{{ $t("dna-post.browse") }} {{ postRes.postDetail.browseCount }}</span
                                >
                                <span class="tabular-nums"
                                    >{{ $t("dna-post.comment") }} {{ postRes.postDetail.commentCount }}</span
                                >
                                <span class="tabular-nums"
                                    >{{ $t("dna-post.like") }} {{ postRes.postDetail.likeCount }}</span
                                >
                                <span class="tabular-nums"
                                    >{{ $t("dna-post.favorite") }} {{ postRes.postDetail.collectionCount }}</span
                                >
                            </div>
                            <!-- 帖子标签 -->
                            <div class="mt-2 flex flex-wrap gap-1.5">
                                <span
                                    v-if="postRes.postDetail.isElite === 1"
                                    class="shrink-0 rounded-xs border border-secondary/40 bg-secondary/10 px-1.5 py-0.5 text-[10px] font-medium text-secondary"
                                >
                                    {{ $t("dna-post.featured") }}
                                </span>
                                <span
                                    v-if="postRes.postDetail.isOfficial === 1"
                                    class="shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                >
                                    {{ $t("dna-post.official") }}
                                </span>
                                <span
                                    v-for="(topic, index) in postRes.postDetail.topics"
                                    :key="index"
                                    class="inline-flex shrink-0 items-center gap-0.5 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/60"
                                >
                                    <Icon icon="ri:hashtag" class="size-3" />
                                    {{ topic.topicName }}</span
                                >
                            </div>
                        </div>
                        <button
                            type="button"
                            class="btn btn-xs relative whitespace-nowrap"
                            :class="
                                postRes.isFollow
                                    ? 'btn-primary'
                                    : ''
                            "
                            @click="follow(postRes.postDetail.postUserId, !!postRes.isFollow)"
                        >
                            {{ postRes.isFollow ? $t("dna-post.cancelFollow") : $t("dna-post.follow") }}
                        </button>
                    </div>
                </header>

                <!-- 帖子内容 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="CONTENT" />
                    <div class="select-text">
                        <DNAPostContent :contents="postRes.postDetail.postContent" />
                    </div>
                </section>

                <!-- 评论区 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader
                        no-animate
                        compact
                        kicker="COMMENTS"
                        :title="$t('dna-post.commentsTitle', { count: comments.length })"
                    />

                    <!-- 评论列表 -->
                    <div class="space-y-2">
                        <div
                            v-for="comment in comments"
                            :key="comment.commentId"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                        >
                            <!-- 评论头部 -->
                            <div class="mb-2 flex items-center gap-2.5">
                                <SRouterLink :to="`/dna/mine/${comment.userId}`" class="shrink-0 cursor-pointer">
                                    <img
                                        :src="comment.userHeadUrl"
                                        :alt="$t('common.user_avatar')"
                                        class="size-9 rounded-full border border-base-content/15 object-cover"
                                    />
                                </SRouterLink>
                                <div class="min-w-0 flex-1">
                                    <div class="flex flex-wrap items-center gap-1.5">
                                        <span class="truncate text-sm font-medium text-base-content">{{ comment.userName }}</span>
                                        <span
                                            v-if="comment.isOfficial === 1"
                                            class="shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                        >
                                            {{ $t("common.official") }}
                                        </span>
                                        <span
                                            v-if="comment.isCreator === 1"
                                            class="shrink-0 rounded-xs border border-secondary/40 bg-secondary/10 px-1.5 py-0.5 text-[10px] font-medium text-secondary"
                                        >
                                            {{ $t("dna-post-detail.creator") }}
                                        </span>
                                    </div>
                                    <div class="mt-0.5 text-xs text-base-content/50">
                                        {{ comment.commentTime }}
                                    </div>
                                </div>
                                <span class="shrink-0 font-mono text-xs tabular-nums text-base-content/40"
                                    >#{{ comment.floor }}</span
                                >
                            </div>

                            <!-- 评论内容 -->
                            <div class="mb-2.5 text-sm text-base-content">
                                <DNAPostContent :contents="comment.commentContent" />
                            </div>

                            <!-- 评论操作 -->
                            <div class="flex items-center gap-4 text-xs text-base-content/60">
                                <button
                                    type="button"
                                    class="inline-flex cursor-pointer items-center gap-1 tabular-nums transition-colors duration-150 hover:text-primary"
                                >
                                    <Icon icon="ri:heart-line" class="size-3.5" />
                                    <span>{{ comment.likeCount }}</span>
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex cursor-pointer items-center gap-1 tabular-nums transition-colors duration-150 hover:text-primary"
                                >
                                    <Icon icon="ri:message-2-line" class="size-3.5" />
                                    <span>{{ comment.replyCount }}</span>
                                </button>
                            </div>

                            <!-- 回复列表 -->
                            <div v-if="comment.replyVos && comment.replyVos.length > 0" class="mt-2.5 space-y-1.5">
                                <div
                                    v-for="reply in comment.replyVos"
                                    :key="reply.postCommentReplayId"
                                    class="rounded-xs border border-base-content/10 bg-base-100/60 p-2.5"
                                >
                                    <div class="mb-1 flex flex-wrap items-center gap-2">
                                        <span class="text-sm font-medium">{{ reply.userName }}</span>
                                        <span class="text-xs text-base-content/50">{{ reply.replyTime }}</span>
                                    </div>
                                    <div class="text-sm text-base-content/80">
                                        <DNAPostContent :contents="reply.replyContent" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 无评论提示 -->
                        <div v-if="comments.length === 0" class="py-8 text-center">
                            <p class="mb-2 text-sm text-base-content/60">{{ $t("dna-post-detail.no_comments") }}</p>
                            <p class="text-xs text-base-content/40">{{ $t("dna-post-detail.be_first_commenter") }}</p>
                        </div>
                    </div>

                    <!-- 加载更多按钮 -->
                    <div v-if="commentHasNext" class="mt-3 flex justify-center">
                        <button
                            type="button"
                            class="cursor-pointer rounded-xs border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                            :class="
                                moreLoading
                                    ? 'border-base-content/10 text-base-content/35'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            :disabled="moreLoading"
                            @click="loadMoreComments"
                        >
                            <span v-if="moreLoading" class="loading loading-spinner loading-xs mr-2" />
                            {{ $t("common.load_more") }}
                        </button>
                    </div>

                    <!-- 发表评论 -->
                    <div class="mt-3 border-t border-base-content/15 pt-3">
                        <div class="mb-2 text-[11px] tracking-wide text-base-content/55">
                            {{ $t("dna-post-detail.post_comment") }}
                        </div>
                        <div class="space-y-2.5">
                            <textarea
                                v-model="commentContent"
                                :placeholder="$t('dna-post-detail.comment_placeholder')"
                                class="w-full min-h-30 rounded-none border-b border-base-content/20 bg-transparent px-0.5 py-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary resize-none"
                                :disabled="commentLoading"
                            />
                            <div class="flex justify-end">
                                <button
                                    type="button"
                                    class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                                    :disabled="commentLoading || !commentContent.trim()"
                                    @click="submitComment"
                                >
                                    <span v-if="commentLoading" class="loading loading-spinner loading-sm mr-2" />
                                    {{ commentLoading ? "发布中..." : "发布评论" }}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div v-else class="flex h-full items-center justify-center">
                <div class="text-center">
                    <p class="mb-4 text-sm text-base-content/60">{{ $t("dna-post-detail.load_failed") }}</p>
                    <button
                        type="button"
                        class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                        @click="loadPostDetail()"
                    >
                        {{ $t("common.retry") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
