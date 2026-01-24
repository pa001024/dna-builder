<script setup lang="ts">
import { DNAAPI, DNAMineBean, DNAPostListBean, DNARoleInfoBean } from "dna-api"
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
const roleInfo = ref<DNARoleInfoBean | null>(null)
const loading = ref(true)
const userId = computed(() => (route.params.userId as string) || setting.dnaUserUID)
const activeTab = ref("游戏信息")

const scrollContainer = ref<HTMLElement | null>(null)
const isEnd = ref(false)

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
    await loadRole()
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

async function loadRole() {
    try {
        loading.value = true
        const res = userId.value ? await api.defaultRoleForTool(2, userId.value) : await api.defaultRoleForTool()
        if (res.is_success && res.data) {
            roleInfo.value = res.data.roleInfo
        } else {
            ui.showErrorMessage(res.msg || "获取游戏信息失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取游戏信息失败", e)
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
                <div class="card bg-base-100">
                    <div class="card-body">
                        <div class="flex items-start gap-4">
                            <img :src="mineData.headUrl" alt="avatar" class="w-20 h-20 rounded-full object-cover" />
                            <div class="flex-1">
                                <h2 class="text-xl font-bold">
                                    {{ mineData.userName }}
                                    <span class="badge badge-sm">Lv. {{ mineData.levelTotal }}</span>
                                </h2>
                                <p class="text-sm text-base-content/70">ID: {{ mineData.userId || userId }}</p>
                                <p class="text-sm text-base-content/70 mt-1">{{ mineData.signature }}</p>
                            </div>
                        </div>
                        <div class="flex gap-4 mt-4 flex-wrap">
                            <div class="flex gap-1 items-baseline">
                                <span class="text-lg font-bold">{{ mineData.followCount }}</span>
                                <span class="text-sm text-base-content/70">关注</span>
                            </div>
                            <div class="flex gap-1 items-baseline">
                                <span class="text-lg font-bold">{{ mineData.fansCount }}</span>
                                <span class="text-sm text-base-content/70">粉丝</span>
                            </div>
                            <div class="flex gap-1 items-baseline">
                                <span class="text-lg font-bold">{{ mineData.likeCount }}</span>
                                <span class="text-sm text-base-content/70">获赞</span>
                            </div>
                            <div class="flex gap-1 items-baseline">
                                <span class="text-lg font-bold">{{ mineData.collectCount }}</span>
                                <span class="text-sm text-base-content/70">收藏</span>
                            </div>
                            <div class="flex gap-1 items-baseline">
                                <span class="text-lg font-bold">{{ mineData.commentCount }}</span>
                                <span class="text-sm text-base-content/70">评论</span>
                            </div>
                            <div class="flex gap-1 items-baseline">
                                <span class="text-lg font-bold">{{ mineData.postCount }}</span>
                                <span class="text-sm text-base-content/70">帖子</span>
                            </div>
                            <div class="flex gap-1 items-baseline">
                                <span class="text-lg font-bold">{{ mineData.goldNum }}</span>
                                <span class="text-sm text-base-content/70">金币</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="tabs tabs-border gap-2">
                    <div class="tab" :class="{ 'tab-active': activeTab === '游戏信息' }" @click="activeTab = '游戏信息'">游戏信息</div>
                    <div class="tab" :class="{ 'tab-active': activeTab === '帖子' }" @click="activeTab = '帖子'">帖子</div>
                </div>
                <!-- 游戏角色信息 -->
                <div v-if="roleInfo && activeTab === '游戏信息'" class="card bg-base-200">
                    <DNAGameInfoShow :roleInfo="roleInfo" />
                </div>

                <div v-if="activeTab === '帖子'">
                    <div v-if="postList.length > 0" class="space-y-4">
                        <DNAPostListItem v-for="post in postList" :key="post.postId" :post="post" />
                    </div>
                    <div v-else class="flex justify-center items-center py-8">
                        <div class="text-center">
                            <p class="mb-4">暂无帖子数据</p>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="loading" class="flex justify-center items-center py-4">
                <span class="loading loading-spinner" />
            </div>
        </ScrollArea>
    </div>
</template>
