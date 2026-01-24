<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAMineBean } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { useUIStore } from "@/store/ui"
import { initEmojiDict } from "@/utils/emoji"
import { useSettingStore } from "../store/setting"

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
const propFlowRef = ref()

onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        router.push("/game-accounts")
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
    } else if (activeTab.value === "流水查询" && propFlowRef.value) {
        return propFlowRef.value.lastUpdateTime
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
    } else if (activeTab.value === "流水查询" && propFlowRef.value) {
        propFlowRef.value.loadData(true)
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <div class="flex-none flex justify-between items-center p-4 bg-base-100 border-b border-base-200">
            <div class="tabs tabs-border gap-2">
                <div class="tab" :class="{ 'tab-active': activeTab === '公告' }" @click="activeTab = '公告'">公告</div>
                <div class="tab" :class="{ 'tab-active': activeTab === '游戏信息' }" @click="activeTab = '游戏信息'">游戏信息</div>
                <div class="tab" :class="{ 'tab-active': activeTab === '论坛' }" @click="activeTab = '论坛'">论坛</div>
                <div class="tab" :class="{ 'tab-active': activeTab === '签到' }" @click="activeTab = '签到'">签到</div>
                <div class="tab" :class="{ 'tab-active': activeTab === '流水查询' }" @click="activeTab = '流水查询'">流水查询</div>
            </div>
            <SRouterLink to="/dna/mine" class="flex items-center">
                <img :src="mine?.headUrl" alt="User Head" class="w-8 h-8 rounded-full mr-2" />
                <span>
                    {{ mine?.userName || "?" }}
                </span>
            </SRouterLink>
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
            <DNAPropFlow v-if="activeTab === '流水查询'" ref="propFlowRef" nobtn />
        </ScrollArea>
    </div>
</template>
