<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAGameConfigResponse } from "dna-api"
import { onMounted, ref } from "vue"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()

let api: DNAAPI

const loading = ref(true)
const gameConfig = useLocalStorage<DNAGameConfigResponse>("dna.gameConfig", {} as any)
const lastUpdateTime = useLocalStorage("dna.forum.lastUpdateTime", 0)

onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        ui.showErrorMessage("请先登录")
        return
    }
    api = t
    await loadData()
})

async function loadData(force = false) {
    try {
        if (lastUpdateTime.value > 0 && ui.timeNow - lastUpdateTime.value < 1000 * 60 * 5 && !force) {
            loading.value = false
            return
        }
        loading.value = true
        const res = await api.getGameConfig()
        if (res.is_success && res.data) {
            gameConfig.value = res.data[0]
            lastUpdateTime.value = ui.timeNow
        } else {
            ui.showErrorMessage(res.msg || "获取游戏配置失败")
        }
    } catch (e) {
        console.error(e)
        ui.showErrorMessage("获取游戏配置失败")
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
    <div class="space-y-3">
        <div v-if="!nobtn" class="flex justify-between items-center">
            <span class="text-xs tracking-wide text-base-content/50">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <Tooltip tooltip="刷新" side="bottom">
                <button
                    type="button"
                    class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                    @click="loadData(true)"
                >
                    <Icon icon="ri:refresh-line" class="size-4" />
                </button>
            </Tooltip>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-full py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>
        <div v-if="gameConfig" class="space-y-3">
            <!-- 游戏板块 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="FORUMS" :title="$t('游戏板块')" />
                <div class="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-3">
                    <SRouterLink
                        v-for="forum in gameConfig.gameAllForumList"
                        :key="forum.id"
                        :to="`/dna/posts/${forum.id}`"
                        class="flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-150 hover:border-primary/40"
                    >
                        <img :src="forum.iconUrl" alt="Forum Icon" class="h-5 w-5 shrink-0 object-contain" />
                        <span class="truncate text-sm text-base-content/80 transition-colors duration-150 hover:text-primary">{{
                            forum.name
                        }}</span>
                    </SRouterLink>
                </div>
            </section>

            <!-- 话题列表 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="TOPICS" :title="$t('话题列表')" />
                <div class="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-3">
                    <SRouterLink
                        v-for="topic in gameConfig.topicList"
                        :key="topic.topicId"
                        :to="`/dna/topic/${topic.topicId}`"
                        class="flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-150 hover:border-primary/40"
                    >
                        <img :src="topic.topicIconUrl" alt="Wiki Icon" class="h-5 w-5 shrink-0 object-contain" />
                        <span class="truncate text-sm text-base-content/80 transition-colors duration-150 hover:text-primary">{{
                            topic.topicName
                        }}</span>
                    </SRouterLink>
                </div>
            </section>
        </div>

        <div v-else class="flex justify-center items-center h-full py-12">
            <div class="text-center">
                <p class="text-sm text-base-content/60 mb-4">无法获取游戏配置</p>
                <button
                    type="button"
                    class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                    @click="loadData(true)"
                >
                    重试
                </button>
            </div>
        </div>
    </div>
</template>
