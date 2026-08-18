<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { onMounted, ref, watch } from "vue"
import type { Comment } from "@/api/gen/api-types"
import { commentsQuery, createCommentMutation, deleteCommentMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { formatRelativeTime } from "@/utils/time"

/**
 * 通用评论区组件。
 * 通过 targetId（唯一目标 ID，如染色方案 dp_<planId>）挂在任意业务对象上，
 * 自带评论列表加载、发表与删除（本人或管理员）能力。
 */
const props = defineProps<{
    /** 评论目标唯一 ID。 */
    targetId: string
}>()

const emit = defineEmits<{
    /** 评论数变化时触发（加载/发表/删除后）。 */
    count: [count: number]
}>()

const ui = useUIStore()
const user = useUserStore()
/** i18n 实例（代理访问会登记语言切换重渲染依赖，保证相对时间随语言刷新）。 */
const { i18next } = useTranslation()

const comments = ref<Comment[]>([])
const loading = ref(false)
const content = ref("")
const posting = ref(false)

/**
 * @description 判断当前用户能否删除指定评论（本人或管理员）。
 * @param comment 评论对象。
 * @returns 是否可删除。
 */
function canDelete(comment: Comment) {
    return user.id === comment.user?.id || user.isAdmin
}

/**
 * @description 拉取目标 ID 的最新评论列表并同步评论数。
 */
async function loadComments() {
    if (!props.targetId) return
    loading.value = true
    try {
        comments.value = (await commentsQuery({ targetId: props.targetId, limit: 50 })) || []
        emit("count", comments.value.length)
    } catch (error) {
        console.error("加载评论失败:", error)
    } finally {
        loading.value = false
    }
}

/**
 * @description 发表一条评论，成功后置顶插入列表。
 */
async function postComment() {
    const text = content.value.trim()
    if (!text) return
    if (!user.id) {
        ui.showErrorMessage("请先登录后再评论")
        return
    }
    posting.value = true
    try {
        const comment = await createCommentMutation({ targetId: props.targetId, content: text })
        if (comment) {
            content.value = ""
            comments.value = [comment, ...comments.value]
            emit("count", comments.value.length)
        }
    } catch (error) {
        ui.showErrorMessage("评论失败", error instanceof Error ? error.message : String(error))
    } finally {
        posting.value = false
    }
}

/**
 * @description 删除一条评论（本人或管理员），成功后从列表移除。
 * @param comment 要删除的评论。
 */
async function removeComment(comment: Comment) {
    if (!confirm(`确定删除「${comment.content}」这条评论吗？`)) return
    try {
        await deleteCommentMutation({ id: comment.id })
        comments.value = comments.value.filter(item => item.id !== comment.id)
        emit("count", comments.value.length)
    } catch (error) {
        ui.showErrorMessage("删除评论失败", error instanceof Error ? error.message : String(error))
    }
}

watch(
    () => props.targetId,
    () => {
        void loadComments()
    }
)

onMounted(() => {
    void loadComments()
})
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
            <div class="text-sm font-medium">
                评论 <span class="opacity-60">({{ comments.length }})</span>
            </div>
            <button class="btn btn-ghost btn-xs" type="button" @click="loadComments">
                <Icon icon="ri:refresh-line" />
            </button>
        </div>

        <div class="flex items-center gap-2">
            <input
                v-model="content"
                type="text"
                class="input input-bordered input-sm flex-1"
                maxlength="500"
                placeholder="友善评论，理性交流～"
                @keyup.enter="postComment"
            />
            <button class="btn btn-primary btn-sm shrink-0" type="button" :disabled="!content.trim() || posting" @click="postComment">
                {{ posting ? "发表中..." : "发表" }}
            </button>
        </div>

        <div v-if="loading" class="py-2 text-xs opacity-60">加载中...</div>
        <div v-else-if="!comments.length" class="py-2 text-xs opacity-60">暂无评论，快来抢沙发～</div>
        <div v-else class="space-y-3">
            <div v-for="comment in comments" :key="comment.id" class="flex gap-2.5">
                <QQAvatar class="w-8" :qq="comment.user?.qq" />
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-medium">{{ comment.user?.name || "匿名" }}</span>
                        <span class="text-[10px] opacity-50">{{ formatRelativeTime(comment.createdAt, i18next.language) }}</span>
                        <button
                            v-if="canDelete(comment)"
                            class="btn btn-ghost btn-xs btn-square ml-auto shrink-0 opacity-60 hover:opacity-100"
                            type="button"
                            @click="removeComment(comment)"
                        >
                            <Icon icon="ri:delete-bin-line" />
                        </button>
                    </div>
                    <div class="mt-0.5 wrap-break-word text-sm leading-relaxed">{{ comment.content }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
