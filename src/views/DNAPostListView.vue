<script setup lang="ts">
import { useInfiniteScroll } from "@vueuse/core"
import { DNAAPI, DNAPostListBean } from "dna-api"
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { initEmojiDict } from "@/utils/emoji"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const postList = ref<DNAPostListBean[]>([])
const loading = ref(false)
const forumId = computed(() => route.params.forumId as string)
const topicId = computed(() => route.params.topicId as string)
const limit = 20

const scrollContainer = ref<HTMLElement | null>(null)
const currentPage = ref(0)
const hasNext = ref(true)

/**
 * 滚动到底部时按服务端分页状态继续加载，不再通过当前条数猜测是否还有下一页。
 */
useInfiniteScroll(scrollContainer, async () => {
    await loadNextPage()
})

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage("请先登录")
        router.push("/game-accounts")
        return
    }
    api = p
    await initEmojiDict()
    await resetAndLoadPosts()
})

watch([forumId, topicId], async () => {
    if (!api) return
    await resetAndLoadPosts()
})

/**
 * 重置帖子列表状态，并重新从第一页开始加载。
 */
async function resetAndLoadPosts() {
    postList.value = []
    currentPage.value = 0
    hasNext.value = true
    loading.value = false
    await loadNextPage()
}

/**
 * 拉取下一页帖子，并以接口返回的 hasNext 作为终止条件。
 */
async function loadNextPage() {
    if (loading.value || !hasNext.value) return
    await loadPosts(currentPage.value + 1)
}

/**
 * 加载指定页码的帖子列表。
 * @param page 需要加载的页码，第一页为 1。
 */
async function loadPosts(page = 1) {
    try {
        loading.value = true
        const res = topicId.value
            ? await api.getPostByTopic(+topicId.value, page, limit)
            : await api.getPostList(+forumId.value, page, limit)
        if (res.is_success && res.data) {
            const currentPosts = res.data.postList
            postList.value = page === 1 ? currentPosts : [...postList.value, ...currentPosts]
            currentPage.value = page
            hasNext.value = currentPosts.length >= limit
        } else {
            hasNext.value = false
            ui.showErrorMessage(res.msg || "获取帖子列表失败")
        }
    } catch (e) {
        hasNext.value = false
        ui.showErrorMessage("获取帖子列表失败", e)
    } finally {
        loading.value = false
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
            <h1 class="text-xl font-bold">社区帖子</h1>
            <div class="w-12" />
            <!-- Spacer -->
        </div>

        <!-- 内容区域 -->
        <ScrollArea class="flex-1 p-4" @loadref="r => (scrollContainer = r)">
            <div v-if="postList.length > 0" class="space-y-4">
                <DNAPostListItem v-for="post in postList" :key="post.postId" :post="post" />
            </div>

            <div v-else class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4">暂无帖子数据</p>
                    <button class="btn btn-secondary" @click="resetAndLoadPosts()">刷新</button>
                </div>
            </div>

            <div v-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner loading-lg" />
            </div>
        </ScrollArea>
    </div>
</template>
