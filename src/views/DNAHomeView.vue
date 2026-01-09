<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { DNAAPI, DNAMineBean } from "dna-api"
import { useSettingStore } from "../store/setting"
import { useRouter } from "vue-router"
import { useLocalStorage } from "@vueuse/core"
import { initEmojiDict } from "@/util"
import { useUIStore } from "@/store/ui"

const setting = useSettingStore()
const router = useRouter()
const ui = useUIStore()

const mine = useLocalStorage<DNAMineBean>("dna.mine", {} as any)
const activeTab = useLocalStorage("dna.activeTab", "公告")
let api: DNAAPI

const announcementRef = ref()
const gameInfoRef = ref()
const forumRef = ref()
const signCalendarRef = ref()

onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        router.push("/login")
        return
    }
    api = t
    await initEmojiDict()
    await loadMine()
})

async function loadMine() {
    const rm = await api.getMine()
    if (rm.is_success && rm.data) {
        mine.value = rm.data.mine
    } else {
        ui.showErrorMessage(rm.msg || "获取用户信息失败")
    }
}
const lastUpdateTime = computed(() => {
    if (activeTab.value === "公告" && announcementRef.value) {
        return announcementRef.value.lastUpdateTime
    } else if (activeTab.value === "游戏信息" && gameInfoRef.value) {
        return gameInfoRef.value.lastUpdateTime
    } else if (activeTab.value === "论坛" && forumRef.value) {
        return forumRef.value.lastUpdateTime
    } else if (activeTab.value === "签到" && signCalendarRef.value) {
        return signCalendarRef.value.lastUpdateTime
    }
    return 0
})

function handleRefreshAll() {
    if (activeTab.value === "公告" && announcementRef.value) {
        announcementRef.value.loadData(true)
    } else if (activeTab.value === "游戏信息" && gameInfoRef.value) {
        gameInfoRef.value.loadData(true)
    } else if (activeTab.value === "论坛" && forumRef.value) {
        forumRef.value.loadData(true)
    } else if (activeTab.value === "签到" && signCalendarRef.value) {
        signCalendarRef.value.loadData(true)
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <div class="flex-none flex justify-between items-center p-4 bg-base-100 border-b border-base-200">
            <div class="tabs tabs-border gap-2">
                <div @click="activeTab = '公告'" class="tab" :class="{ 'tab-active': activeTab === '公告' }">公告</div>
                <div @click="activeTab = '游戏信息'" class="tab" :class="{ 'tab-active': activeTab === '游戏信息' }">游戏信息</div>
                <div @click="activeTab = '论坛'" class="tab" :class="{ 'tab-active': activeTab === '论坛' }">论坛</div>
                <div @click="activeTab = '签到'" class="tab" :class="{ 'tab-active': activeTab === '签到' }">签到</div>
            </div>
            <RouterLink to="/dna/mine" class="flex items-center">
                <img :src="mine?.headUrl" alt="User Head" class="w-8 h-8 rounded-full mr-2" />
                <span>
                    {{ mine?.userName || "?" }}
                </span>
            </RouterLink>
            <div class="flex items-center gap-4">
                <span class="text-xs text-gray-500"> 最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }} </span>
                <Tooltip tooltip="刷新当前页面" side="bottom">
                    <button class="btn btn-primary btn-square btn-sm ml-2" @click="handleRefreshAll">
                        <Icon icon="ri:refresh-line" />
                    </button>
                </Tooltip>
            </div>
        </div>
        <ScrollArea class="flex-1 p-4">
            <DNAAnnouncement v-if="activeTab === '公告'" ref="announcementRef" nobtn />
            <DNAGameInfo v-if="activeTab === '游戏信息'" ref="gameInfoRef" nobtn />
            <DNAForum v-if="activeTab === '论坛'" ref="forumRef" nobtn />
            <DNASignCalendar v-if="activeTab === '签到'" ref="signCalendarRef" nobtn />
        </ScrollArea>
    </div>
</template>
