<script setup lang="ts">
import { DNAAPI, DNAMineBean, DNAPostListBean, DNARoleInfoBean } from "dna-api"
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { initEmojiDict } from "@/utils/emoji"

const setting = useSettingStore()
const ui = useUIStore()
const { t } = useTranslation()
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
        ui.showErrorMessage(t("dna-user-mine.loginFirst"))
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
            ui.showErrorMessage(res.msg || t("dna-user-mine.userInfoFailed"))
        }
    } catch (e) {
        ui.showErrorMessage(t("dna-user-mine.userInfoFailed"), e)
    } finally {
        loading.value = false
    }
}

async function loadRole() {
    try {
        loading.value = true
        await setting.startHeartbeat()
        const res = userId.value ? await api.defaultRoleForTool(2, userId.value) : await api.defaultRoleForTool()
        setting.stopHeartbeat()
        if (res.is_success && res.data) {
            roleInfo.value = res.data.roleInfo
        } else {
            ui.showErrorMessage(res.msg || t("dna-user-mine.gameInfoFailed"))
        }
    } catch (e) {
        ui.showErrorMessage(t("dna-user-mine.gameInfoFailed"), e)
    } finally {
        loading.value = false
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <!-- 顶栏：返回 + 标题（hairline 分隔，无实底页头） -->
        <div class="flex flex-none items-center gap-2.5 border-b border-base-content/15 px-4 py-2.5">
            <button
                type="button"
                class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                @click="router.back()"
            >
                <Icon icon="ri:arrow-left-line" class="size-4" />
            </button>
            <h1 class="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">{{ $t("dna-user-mine.title") }}</h1>
        </div>

        <ScrollArea class="flex-1" @loadref="r => (scrollContainer = r)">
            <div v-if="mineData" class="stagger-rise space-y-3 p-3 sm:p-4">
                <!-- 用户档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
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
                        <img
                            :src="mineData.headUrl"
                            alt="avatar"
                            class="relative size-20 shrink-0 rounded-full border border-base-content/15 object-cover"
                        />
                        <div class="relative min-w-0 flex-1">
                            <p
                                class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase"
                            >
                                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                                User File
                            </p>
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h2 class="truncate text-xl leading-tight font-bold tracking-tight text-base-content">
                                    {{ mineData.userName }}
                                </h2>
                                <span
                                    class="shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary tabular-nums"
                                    >Lv. {{ mineData.levelTotal }}</span
                                >
                                <CopyID :id="mineData.userId || userId" />
                            </div>
                            <p v-if="mineData.signature" class="mt-1.5 text-sm leading-relaxed text-base-content/60">
                                {{ mineData.signature }}
                            </p>
                        </div>
                    </div>
                </header>
                <!-- 用户统计 -->
                <div class="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("dna-user-mine.follow") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                            mineData.followCount
                        }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("dna-user-mine.fans") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                            mineData.fansCount
                        }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("dna-user-mine.likes") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                            mineData.likeCount
                        }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("dna-user-mine.favorites") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                            mineData.collectCount
                        }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("dna-user-mine.comments") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                            mineData.commentCount
                        }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("dna-user-mine.posts") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                            mineData.postCount
                        }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("dna-user-mine.coins") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                            mineData.goldNum
                        }}</span>
                    </div>
                </div>
                <AniTabs
                    v-model="activeTab"
                    :tabs="[
                        { label: $t('dna-user-mine.gameInfoTab'), value: '游戏信息' },
                        { label: $t('dna-user-mine.postTab'), value: '帖子' },
                    ]"
                />
                <!-- 游戏角色信息 -->
                <DNAGameInfoShow v-if="roleInfo && activeTab === '游戏信息'" :roleInfo="roleInfo" />

                <div v-if="activeTab === '帖子'">
                    <div v-if="postList.length > 0" class="space-y-2">
                        <DNAPostListItem v-for="post in postList" :key="post.postId" :post="post" />
                    </div>
                    <div v-else class="flex items-center justify-center py-8">
                        <div class="text-center">
                            <p class="text-sm text-base-content/60">{{ $t("dna-user-mine.noPosts") }}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="loading" class="flex items-center justify-center py-4">
                <span class="loading loading-spinner" />
            </div>
        </ScrollArea>
    </div>
</template>
