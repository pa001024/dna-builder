<script setup lang="ts">
import { useInfiniteScroll } from "@vueuse/core"
import { DNAAPI, DNAPostListBean } from "dna-api"
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { initEmojiDict } from "@/utils/emoji"

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
        <!-- 顶栏：返回 + 标题 + 计数（hairline 分隔，无实底页头） -->
        <div class="flex flex-none items-center gap-2.5 border-b border-base-content/15 px-4 py-2.5">
            <button
                type="button"
                class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                @click="router.back()"
            >
                <Icon icon="ri:arrow-left-line" class="size-4" />
            </button>
            <h1 class="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">
                {{ $t("dna-post-list.community_posts") }}
            </h1>
            <span class="shrink-0 font-orbitron text-sm font-semibold text-primary tabular-nums">{{ postList.length }}</span>
        </div>

        <!-- 内容区域 -->
        <ScrollArea class="flex-1" @loadref="r => (scrollContainer = r)">
            <div class="p-3 sm:p-4">
                <div v-if="postList.length > 0" class="space-y-2">
                    <DNAPostListItem v-for="post in postList" :key="post.postId" :post="post" />
                </div>

                <div v-else class="flex items-center justify-center py-20">
                    <div class="text-center">
                        <p class="mb-4 text-sm text-base-content/60">{{ $t("dna-post-list.no_posts") }}</p>
                        <button
                            type="button"
                            class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                            @click="resetAndLoadPosts()"
                        >
                            {{ $t("common.refresh") }}
                        </button>
                    </div>
                </div>

                <div v-if="loading" class="flex items-center justify-center py-8">
                    <span class="loading loading-spinner loading-lg" />
                </div>
            </div>
        </ScrollArea>
    </div>
</template>
