<script setup lang="ts">
import { useInfiniteScroll } from "@vueuse/core"
import { DNAAPI, DNAPostListBean } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router"
import { initEmojiDict } from "@/utils/emoji"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const postList = ref<DNAPostListBean[]>([])
const loading = ref(true)
const forumId = computed(() => route.params.forumId as string)
const topicId = computed(() => route.params.topicId as string)
const limit = 19

const scrollContainer = ref<HTMLElement | null>(null)
const isEnd = ref(false)
useInfiniteScroll(scrollContainer, async () => {
    if (loading.value || isEnd.value) return
    loading.value = true
    await loadPosts(~~(postList.value.length / limit) + 1)
    loading.value = false
    if (postList.value.length === 0 || postList.value.length % limit !== 0) {
        isEnd.value = true
    }
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
    await loadPosts()
})

async function loadPosts(page = 1) {
    try {
        loading.value = true
        const res = topicId.value
            ? await api.getPostByTopic(+topicId.value, page, limit)
            : await api.getPostList(+forumId.value, page, limit)
        if (res.is_success && res.data) {
            postList.value = page === 1 ? res.data.postList : [...postList.value, ...res.data.postList]
        } else {
            ui.showErrorMessage(res.msg || "获取帖子列表失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取帖子列表失败", e)
    } finally {
        loading.value = false
    }
}
onBeforeRouteLeave(() => {
    ui.previewVisible = false
})
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
                <!-- 帖子卡片 -->
                <DNAPostListItem v-for="post in postList" :key="post.postId" :post="post" />
            </div>

            <div v-else class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4">暂无帖子数据</p>
                    <button class="btn btn-secondary" @click="loadPosts()">刷新</button>
                </div>
            </div>

            <div v-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner loading-lg" />
            </div>
        </ScrollArea>
    </div>
</template>
