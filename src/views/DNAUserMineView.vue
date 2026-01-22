<script setup lang="ts">
import { useInfiniteScroll } from "@vueuse/core"
import { DNAAPI, DNAMineBean, DNAPostListBean } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { initEmojiDict } from "@/utils/emoji"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const mineData = ref<DNAMineBean | null>(null)
const postList = ref<DNAPostListBean[]>([])
const loading = ref(true)
const userId = computed(() => route.params.userId as string)
const limit = 20

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
    await loadMine()
})

async function loadMine() {
    try {
        loading.value = true
        const res = userId.value ? await api.getOtherMine(userId.value) : await api.getMine()
        if (res.is_success && res.data) {
            mineData.value = res.data.mine
            postList.value = res.data.postList
            isEnd.value = res.data.hasNext === 0
        } else {
            ui.showErrorMessage(res.msg || "获取用户信息失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取用户信息失败", e)
    } finally {
        loading.value = false
    }
}

async function loadPosts(page = 1) {
    try {
        loading.value = true
        const res = userId.value ? await api.getOtherMine(userId.value) : await api.getMine()
        if (res.is_success && res.data) {
            mineData.value = res.data.mine
            postList.value = page === 1 ? res.data.postList : [...postList.value, ...res.data.postList]
            isEnd.value = res.data.hasNext === 0
        } else {
            ui.showErrorMessage(res.msg || "获取帖子列表失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取帖子列表失败", e)
    } finally {
        loading.value = false
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <div class="flex-none p-4 bg-base-100 border-b border-base-200 flex items-center justify-between">
            <button class="btn btn-ghost" @click="router.back()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
            </button>
            <h1 class="text-xl font-bold">用户主页</h1>
            <div class="w-12" />
        </div>

        <ScrollArea class="flex-1 p-4" @loadref="r => (scrollContainer = r)">
            <div v-if="mineData" class="space-y-4">
                <div class="card bg-base-200">
                    <div class="card-body">
                        <div class="flex items-start gap-4">
                            <img :src="mineData.headUrl" alt="avatar" class="w-20 h-20 rounded-full object-cover" />
                            <div class="flex-1">
                                <h2 class="text-xl font-bold">
                                    {{ mineData.userName }}
                                </h2>
                                <p class="text-sm text-base-content/70">ID: {{ mineData.userId }}</p>
                                <p class="text-sm text-base-content/70 mt-1">等级: {{ mineData.levelTotal }}</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-4 gap-4 mt-4 text-center">
                            <div>
                                <p class="text-lg font-bold">
                                    {{ mineData.postCount }}
                                </p>
                                <p class="text-sm text-base-content/70">帖子</p>
                            </div>
                            <div>
                                <p class="text-lg font-bold">
                                    {{ mineData.followCount }}
                                </p>
                                <p class="text-sm text-base-content/70">关注</p>
                            </div>
                            <div>
                                <p class="text-lg font-bold">
                                    {{ mineData.fansCount }}
                                </p>
                                <p class="text-sm text-base-content/70">粉丝</p>
                            </div>
                            <div>
                                <p class="text-lg font-bold">
                                    {{ mineData.likeCount }}
                                </p>
                                <p class="text-sm text-base-content/70">点赞</p>
                            </div>
                        </div>
                        <div class="divider" />
                        <div class="grid grid-cols-4 gap-4 text-center text-sm">
                            <div>
                                <p class="text-base-content/70">收藏</p>
                                <p>{{ mineData.collectCount }}</p>
                            </div>
                            <div>
                                <p class="text-base-content/70">评论</p>
                                <p>{{ mineData.commentCount }}</p>
                            </div>
                            <div>
                                <p class="text-base-content/70">文章</p>
                                <p>{{ mineData.postCount }}</p>
                            </div>
                            <div>
                                <p class="text-base-content/70">精华</p>
                                <p>{{ mineData.goldNum }}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="postList.length > 0" class="space-y-4">
                    <DNAPostListItem v-for="post in postList" :key="post.postId" :post="post" />
                </div>

                <div v-else class="flex justify-center items-center py-8">
                    <div class="text-center">
                        <p class="text-lg mb-4">暂无帖子数据</p>
                        <button class="btn btn-secondary" @click="loadMine()">刷新</button>
                    </div>
                </div>
            </div>

            <div v-else-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-if="loading" class="flex justify-center items-center py-4">
                <span class="loading loading-spinner" />
            </div>
        </ScrollArea>
    </div>
</template>
