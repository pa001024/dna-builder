<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAMineBean } from "dna-api"
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { useUIStore } from "@/store/ui"
import { initEmojiDict } from "@/utils/emoji"
import { useSettingStore } from "../store/setting"

const setting = useSettingStore()
const router = useRouter()
const ui = useUIStore()
const { t } = useTranslation()

const HOME_TABS = {
    announcement: "announcement",
    gameInfo: "gameInfo",
    forum: "forum",
    signIn: "signIn",
    flowQuery: "flowQuery",
} as const

const LEGACY_HOME_TAB_MAP: Record<string, string> = {
    公告: HOME_TABS.announcement,
    游戏信息: HOME_TABS.gameInfo,
    论坛: HOME_TABS.forum,
    签到: HOME_TABS.signIn,
    流水查询: HOME_TABS.flowQuery,
}

const mine = useLocalStorage<DNAMineBean>("dna.mine", {} as any)
const activeTab = useLocalStorage("dna.activeTab", HOME_TABS.announcement)
let api: DNAAPI

const announcementRef = ref()
const gameInfoRef = ref()
const forumRef = ref()
const signCalendarRef = ref()
const propFlowRef = ref()

function normalizeActiveTab(tab: string) {
    return LEGACY_HOME_TAB_MAP[tab] || tab
}

onMounted(async () => {
    activeTab.value = normalizeActiveTab(activeTab.value)
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
        ui.showErrorMessage(rm.msg || t("dna-home.loadMineFailed"))
    }
}
const lastUpdateTime = computed(() => {
    if (activeTab.value === HOME_TABS.announcement && announcementRef.value) {
        return announcementRef.value.lastUpdateTime
    } else if (activeTab.value === HOME_TABS.gameInfo && gameInfoRef.value) {
        return gameInfoRef.value.lastUpdateTime
    } else if (activeTab.value === HOME_TABS.forum && forumRef.value) {
        return forumRef.value.lastUpdateTime
    } else if (activeTab.value === HOME_TABS.signIn && signCalendarRef.value) {
        return signCalendarRef.value.lastUpdateTime
    } else if (activeTab.value === HOME_TABS.flowQuery && propFlowRef.value) {
        return propFlowRef.value.lastUpdateTime
    }
    return 0
})

function handleRefreshAll() {
    if (activeTab.value === HOME_TABS.announcement && announcementRef.value) {
        announcementRef.value.loadData(true)
    } else if (activeTab.value === HOME_TABS.gameInfo && gameInfoRef.value) {
        gameInfoRef.value.loadData(true)
    } else if (activeTab.value === HOME_TABS.forum && forumRef.value) {
        forumRef.value.loadData(true)
    } else if (activeTab.value === HOME_TABS.signIn && signCalendarRef.value) {
        signCalendarRef.value.loadData(true)
    } else if (activeTab.value === HOME_TABS.flowQuery && propFlowRef.value) {
        propFlowRef.value.loadData(true)
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <div class="flex-none flex justify-between items-center p-4 bg-base-100 border-b border-base-200">
            <div class="tabs tabs-border gap-2">
                <div class="tab" :class="{ 'tab-active': activeTab === HOME_TABS.announcement }" @click="activeTab = HOME_TABS.announcement">{{ $t("dna-home.tabs.announcement") }}</div>
                <div class="tab" :class="{ 'tab-active': activeTab === HOME_TABS.gameInfo }" @click="activeTab = HOME_TABS.gameInfo">{{ $t("dna-home.tabs.gameInfo") }}</div>
                <div class="tab" :class="{ 'tab-active': activeTab === HOME_TABS.forum }" @click="activeTab = HOME_TABS.forum">{{ $t("dna-home.tabs.forum") }}</div>
                <div class="tab" :class="{ 'tab-active': activeTab === HOME_TABS.signIn }" @click="activeTab = HOME_TABS.signIn">{{ $t("dna-home.tabs.signIn") }}</div>
                <div class="tab" :class="{ 'tab-active': activeTab === HOME_TABS.flowQuery }" @click="activeTab = HOME_TABS.flowQuery">{{ $t("dna-home.tabs.flowQuery") }}</div>
            </div>
            <SRouterLink to="/dna/mine" class="flex items-center">
                <img :src="mine?.headUrl" alt="User Head" class="w-8 h-8 rounded-full mr-2" />
                <span>
                    {{ mine?.userName || "?" }}
                </span>
            </SRouterLink>
            <div class="flex items-center gap-4">
                <span class="text-xs text-gray-500"> {{ $t("dna-home.lastUpdate") }}: {{ ui.timeDistancePassed(lastUpdateTime) }} </span>
                <Tooltip :tooltip="$t('dna-home.refreshCurrentPage')" side="bottom">
                    <button class="btn btn-primary btn-square btn-sm ml-2" @click="handleRefreshAll">
                        <Icon icon="ri:refresh-line" />
                    </button>
                </Tooltip>
            </div>
        </div>
        <div v-if="activeTab === HOME_TABS.announcement" class="flex-1 overflow-hidden">
            <DNAAnnouncement ref="announcementRef" nobtn />
        </div>
        <ScrollArea v-else class="flex-1 p-4">
            <DNAGameInfo v-if="activeTab === HOME_TABS.gameInfo" ref="gameInfoRef" nobtn />
            <DNAForum v-if="activeTab === HOME_TABS.forum" ref="forumRef" nobtn />
            <DNASignCalendar v-if="activeTab === HOME_TABS.signIn" ref="signCalendarRef" nobtn />
            <!-- <DNAPropFlow v-if="activeTab === HOME_TABS.flowQuery" ref="propFlowRef" nobtn /> -->
        </ScrollArea>
    </div>
</template>
