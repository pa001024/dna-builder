<script setup lang="ts">
import { useInfiniteScroll, useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAPostListBean } from "dna-api"
import { t } from "i18next"
import { onMounted, ref } from "vue"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()

let api: DNAAPI
const ANNOUNCEMENT_USER_ID = "709542994134436647"
const ANNOUNCEMENT_PAGE_SIZE = 20

const loading = ref(false)
const annPosts = useLocalStorage<DNAPostListBean[]>("dna.ann.annPosts", [])
const lastUpdateTime = useLocalStorage("dna.ann.lastUpdateTime", 0)
const scrollContainer = ref<HTMLElement | null>(null)
const currentPage = ref(0)
const hasNext = ref(true)

useInfiniteScroll(scrollContainer, async () => {
    await loadNextPage()
})

onMounted(async () => {
    const dnaApi = await setting.getDNAAPI()
    if (!dnaApi) {
        ui.showErrorMessage(t("chat.needLogin"))
        return
    }
    api = dnaApi
    await loadData()
})

/**
 * 加载公告数据，并重置自动翻页状态。
 * @param force 是否忽略本地缓存强制刷新。
 */
async function loadData(force = false) {
    try {
        if (lastUpdateTime.value > 0 && ui.timeNow - lastUpdateTime.value < 1000 * 60 * 5 && !force) {
            loading.value = false
            currentPage.value = Math.ceil(annPosts.value.length / ANNOUNCEMENT_PAGE_SIZE)
            hasNext.value = annPosts.value.length >= ANNOUNCEMENT_PAGE_SIZE
            return
        }
        await resetAndLoadAnnouncements()
        lastUpdateTime.value = ui.timeNow
    } catch (e) {
        console.error(e)
        ui.showErrorMessage(t("dna-announcement.fetch_failed"))
    } finally {
        loading.value = false
    }
}

/**
 * 重置公告列表状态，并重新从第一页开始加载。
 */
async function resetAndLoadAnnouncements() {
    annPosts.value = []
    currentPage.value = 0
    hasNext.value = true
    loading.value = false
    await loadNextPage()
}

/**
 * 拉取下一页公告，并沿用帖子列表页的滚动加载方式。
 */
async function loadNextPage() {
    if (loading.value || !hasNext.value) return
    await loadPosts(currentPage.value + 1)
}

/**
 * 加载指定页码的公告列表。
 * @param page 需要加载的页码，第一页为 1。
 */
async function loadPosts(page = 1) {
    try {
        loading.value = true
        const res =
            page === 1
                ? await api.getOtherMine(ANNOUNCEMENT_USER_ID)
                : await api.getMinePost(ANNOUNCEMENT_USER_ID, page, ANNOUNCEMENT_PAGE_SIZE, 1, 2)
        if (!res.is_success || !res.data) {
            hasNext.value = false
            ui.showErrorMessage(res.msg || t("dna-announcement.fetch_failed"))
            return
        }

        const currentPosts = res.data.postList
        annPosts.value = page === 1 ? currentPosts : [...annPosts.value, ...currentPosts]
        currentPage.value = page
        /**
         * 公告接口的 hasNext 不稳定，后续是否继续加载以本页条数是否满页为准。
         */
        hasNext.value = currentPosts.length >= ANNOUNCEMENT_PAGE_SIZE
    } catch (e) {
        hasNext.value = false
        console.error(e)
        ui.showErrorMessage(t("dna-announcement.fetch_failed"))
    } finally {
        loading.value = false
    }
}

defineExpose({
    loadData,
    lastUpdateTime,
})
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <div v-if="!nobtn" class="flex justify-between items-center flex-none">
            <span class="text-xs text-gray-500"
                >{{ $t("dna-announcement.last_updated") }}: {{ ui.timeDistancePassed(lastUpdateTime) }}</span
            >
            <Tooltip :tooltip="$t('dna-announcement.refresh')" side="bottom">
                <button class="btn btn-primary btn-square btn-sm" @click="loadData(true)">
                    <Icon icon="ri:refresh-line" />
                </button>
            </Tooltip>
        </div>
        <ScrollArea class="flex-1 p-4" @loadref="r => (scrollContainer = r)">
            <div v-if="annPosts.length > 0" class="space-y-4">
                <DNAPostListItem v-for="post in annPosts" :key="post.postId" :post="post" />
            </div>

            <div v-else-if="!loading" class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4">{{ $t("dna-announcement.empty") }}</p>
                </div>
            </div>

            <div v-if="loading" class="flex justify-center items-center h-full py-8">
                <span class="loading loading-spinner loading-lg" />
            </div>
        </ScrollArea>
    </div>
</template>
