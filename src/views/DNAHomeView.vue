<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAMineBean } from "dna-api"
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { initEmojiDict } from "@/utils/emoji"

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
        <!-- 顶部标签栏：方章切换 + 用户信息 + 刷新（半透明、hairline 分隔，无实底页头） -->
        <div
            class="flex-none flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-base-content/15 px-4 py-2.5 stagger-rise"
        >
            <div class="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        activeTab === HOME_TABS.announcement
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="activeTab = HOME_TABS.announcement"
                >
                    {{ $t("dna-home.tabs.announcement") }}
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        activeTab === HOME_TABS.gameInfo
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="activeTab = HOME_TABS.gameInfo"
                >
                    {{ $t("dna-home.tabs.gameInfo") }}
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        activeTab === HOME_TABS.forum
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="activeTab = HOME_TABS.forum"
                >
                    {{ $t("dna-home.tabs.forum") }}
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        activeTab === HOME_TABS.signIn
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="activeTab = HOME_TABS.signIn"
                >
                    {{ $t("dna-home.tabs.signIn") }}
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        activeTab === HOME_TABS.flowQuery
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="activeTab = HOME_TABS.flowQuery"
                >
                    {{ $t("dna-home.tabs.flowQuery") }}
                </button>
            </div>
            <div class="flex items-center gap-3">
                <SRouterLink
                    to="/dna/mine"
                    class="group flex items-center gap-2 text-sm text-base-content/80 transition-colors duration-150 hover:text-primary"
                >
                    <img
                        :src="mine?.headUrl"
                        alt="User Head"
                        class="size-7 rounded-full border border-base-content/15 object-cover transition-colors duration-150 group-hover:border-primary/50"
                    />
                    <span class="max-w-24 truncate">{{ mine?.userName || "?" }}</span>
                </SRouterLink>
                <span class="h-4 w-px bg-base-content/15" aria-hidden="true" />
                <span class="text-xs tracking-wide text-base-content/50">
                    {{ $t("dna-home.lastUpdate") }}: {{ ui.timeDistancePassed(lastUpdateTime) }}
                </span>
                <Tooltip :tooltip="$t('dna-home.refreshCurrentPage')" side="bottom">
                    <button
                        type="button"
                        class="inline-flex size-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                        @click="handleRefreshAll"
                    >
                        <Icon icon="ri:refresh-line" class="size-4" />
                    </button>
                </Tooltip>
            </div>
        </div>
        <div v-if="activeTab === HOME_TABS.announcement" class="flex-1 overflow-hidden">
            <DNAAnnouncement ref="announcementRef" nobtn />
        </div>
        <ScrollArea v-else class="flex-1 p-3 sm:p-4">
            <DNAGameInfo v-if="activeTab === HOME_TABS.gameInfo" ref="gameInfoRef" nobtn />
            <DNAForum v-if="activeTab === HOME_TABS.forum" ref="forumRef" nobtn />
            <DNASignCalendar v-if="activeTab === HOME_TABS.signIn" ref="signCalendarRef" nobtn />
            <!-- <DNAPropFlow v-if="activeTab === HOME_TABS.flowQuery" ref="propFlowRef" nobtn /> -->
        </ScrollArea>
    </div>
</template>
