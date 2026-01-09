<script setup lang="ts">
import { onMounted, ref } from "vue"
import { DNAAPI, DNAGameConfigResponse } from "dna-api"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"
import { useLocalStorage } from "@vueuse/core"

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
    <div class="space-y-6">
        <div class="flex justify-between items-center" v-if="!nobtn">
            <span class="text-xs text-gray-500">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <Tooltip tooltip="刷新" side="bottom">
                <button class="btn btn-primary btn-square btn-sm" @click="loadData(true)">
                    <Icon icon="ri:refresh-line" />
                </button>
            </Tooltip>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-full">
            <span class="loading loading-spinner loading-lg"></span>
        </div>
        <div v-if="gameConfig" class="space-y-6">
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title">游戏板块</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                        <RouterLink
                            v-for="forum in gameConfig.gameAllForumList"
                            :key="forum.id"
                            :to="`/dna/posts/${forum.id}`"
                            class="bg-base-200 p-3 rounded-lg cursor-pointer hover:bg-base-300 transition-colors flex items-center"
                        >
                            <img :src="forum.iconUrl" alt="Forum Icon" class="w-6 h-6 mr-2" />
                            <span>{{ forum.name }}</span>
                        </RouterLink>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title">话题列表</h3>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                        <RouterLink
                            v-for="topic in gameConfig.topicList"
                            :key="topic.topicId"
                            :to="`/dna/topic/${topic.topicId}`"
                            class="bg-base-200 p-3 rounded-lg cursor-pointer hover:bg-base-300 transition-colors flex items-center"
                        >
                            <img :src="topic.topicIconUrl" alt="Wiki Icon" class="w-6 h-6 mr-2" />
                            <span>{{ topic.topicName }}</span>
                        </RouterLink>
                    </div>
                </div>
            </div>
        </div>

        <div v-else class="flex justify-center items-center h-full">
            <div class="text-center">
                <p class="text-lg mb-4">无法获取游戏配置</p>
                <button class="btn btn-secondary" @click="loadData(true)">重试</button>
            </div>
        </div>
    </div>
</template>
