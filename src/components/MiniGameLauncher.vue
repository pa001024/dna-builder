<script setup lang="ts">
import * as dialog from "@tauri-apps/plugin-dialog"
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { pathExists, readTextFile } from "@/api/app"
import { useGameStore } from "@/store/game"
import { useGameUpdateStore } from "@/store/gameUpdate"
import { useUIStore } from "@/store/ui"
import { CDN_LIST, getFullPackageInfo, resolveGameVersion } from "@/utils/game-download"

// 迷你游戏启动器：首页 header 内的紧凑启动入口（仅 app 端）
// 状态机：checking(检测中) / no-path(未设置路径) / needs-update(需要更新) / downloading(热更下载中) / ready(就绪)
// 热更检查与下载复用公共 store（与完整启动器同一套逻辑，不额外请求）
type LauncherState = "checking" | "no-path" | "needs-update" | "downloading" | "ready"

const game = useGameStore()
const ui = useUIStore()
const router = useRouter()
const gameUpdateStore = useGameUpdateStore()

// 与游戏更新页共用同一份 CDN / 服务器配置（localStorage）
const selectedCDN = useLocalStorage("selectedCDN", CDN_LIST[1].url)
const selectedChannel = useLocalStorage("selectedChannel", "PC_OBT_CN_Pub")

const launcherState = ref<LauncherState>("checking")

/**
 * 检查游戏状态：未设置路径 / 已设置路径但需要更新 / 就绪可启动。
 * 需要更新判定：完整包版本不一致或存在 .extracting（安装中），或公共热更检查发现待装热更。
 */
async function refreshLauncherState() {
    if (!game.path) {
        launcherState.value = "no-path"
        return
    }
    launcherState.value = "checking"
    try {
        const [fullPackage, localVersionRes, extracting] = await Promise.all([
            getFullPackageInfo(selectedCDN.value, selectedChannel.value).catch(() => null),
            readTextFile(`${game.gameDir}GameVersion.json`)
                .then(resolveGameVersion)
                .catch(() => null),
            pathExists(`${game.gameDir}.extracting`).catch(() => false),
        ])
        // 热更检查（含具体版本号提取）复用公共 store，检查过程必然请求热更信息
        await gameUpdateStore.checkHotUpdateStatus()
        const baseUpToDate =
            fullPackage !== null && localVersionRes !== null && String(localVersionRes) === String(fullPackage.latestVersion) && !extracting
        launcherState.value = baseUpToDate && !gameUpdateStore.needHotUpdate ? "ready" : "needs-update"
    } catch (error) {
        console.error("检查游戏状态失败:", error)
        // 网络/读取异常时退化为可直接启动，避免误拦截
        launcherState.value = "ready"
    }
}

/**
 * 选择游戏主程序（EM.exe）路径并刷新状态。
 */
async function selectGamePath() {
    const result = await dialog.open({
        defaultPath: game.path,
        filters: [{ name: "EM.exe", extensions: ["exe"] }],
    })
    if (result && typeof result === "string") {
        game.path = result
        await refreshLauncherState()
    }
}

/**
 * 启动游戏。
 */
const launchGame = async () => {
    if (!game.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
        return
    }
    try {
        await game.launchGame()
    } catch (error) {
        console.error("启动游戏失败:", error)
        ui.showErrorMessage(t("game-launcher.launchGameFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}

/**
 * 进入完整启动器（更新/设置页）。
 */
function openLauncher() {
    router.push("/game-launcher")
}

// 各状态下的提示文案
const stateText = computed(() => {
    switch (launcherState.value) {
        case "checking":
            return "检测中..."
        case "no-path":
            return "未设置游戏路径"
        case "needs-update":
            return "需要更新"
        case "downloading":
            return `下载中 ${gameUpdateStore.displayOverallProgressPercent}%`
        case "ready":
            return "就绪"
    }
})

// 各状态下的状态图标
const stateIcon = computed(() => {
    switch (launcherState.value) {
        case "checking":
            return "ri:refresh-line"
        case "no-path":
            return "ri:error-warning-line"
        case "needs-update":
            return "ri:download-2-line"
        case "downloading":
            return "ri:download-2-line"
        case "ready":
            return "ri:checkbox-circle-line"
    }
})

// 状态图标颜色
const stateIconClass = computed(() => {
    switch (launcherState.value) {
        case "checking":
            return "animate-spin text-base-content/50"
        case "no-path":
            return "text-warning"
        case "needs-update":
            return "text-primary"
        case "downloading":
            return "text-primary"
        case "ready":
            return "text-success"
    }
})

// 主按钮的悬停提示（各状态下的动作说明）
const launchTitle = computed(() => {
    switch (launcherState.value) {
        case "checking":
            return "检测中..."
        case "no-path":
            return "未设置游戏路径，点击选择"
        case "needs-update":
            return gameUpdateStore.hotUpdatePendingVersions.length ? "点击下载热更" : "需要完整包更新，点击前往"
        case "downloading":
            return "热更下载中"
        case "ready":
            return "启动游戏"
    }
})

// 主按钮文案（状态感知：设置路径 / 更新 / 下载中 / 启动游戏）
const primaryLabel = computed(() => {
    switch (launcherState.value) {
        case "checking":
            return "检测中"
        case "no-path":
            return "设置路径"
        case "needs-update":
            return gameUpdateStore.hotUpdatePendingVersions.length ? "更新" : t("game-launcher.launch")
        case "downloading":
            return `${gameUpdateStore.displayOverallProgressPercent}%`
        case "ready":
            return t("game-launcher.launch")
    }
})

// 主按钮图标
const primaryIcon = computed(() => {
    switch (launcherState.value) {
        case "no-path":
            return "ri:folder-line"
        case "needs-update":
        case "downloading":
            return "ri:download-2-line"
        case "ready":
            return "ri:rocket-2-line"
        default:
            return "ri:refresh-line"
    }
})

// 左侧补充版本信息：显示热更详情提取的具体版本号（检查更新时由公共 store 顺带提取，不额外请求）
const versionInfo = computed(() => {
    const latest = gameUpdateStore.concreteVersion
    if (!latest) return ""
    return launcherState.value === "needs-update" ? `最新 v${latest}` : `v${latest}`
})

// 检测中 / 下载中 / 游戏运行中时禁用主按钮
const isBusy = computed(() => launcherState.value === "checking" || launcherState.value === "downloading" || game.running)

/**
 * 主按钮点击：按当前状态分发到对应动作。
 */
async function primaryAction() {
    switch (launcherState.value) {
        case "no-path":
            await selectGamePath()
            break
        case "needs-update":
            // 有待装热更时直接复用公共下载逻辑；否则（完整包更新）进入完整启动器
            if (gameUpdateStore.hotUpdatePendingVersions.length) {
                await gameUpdateStore.downloadHotUpdate()
            } else {
                openLauncher()
            }
            break
        case "ready":
            await launchGame()
            break
        default:
            break
    }
}

// 热更下载状态变化时同步迷你启动器状态
watch(
    () => gameUpdateStore.isDownloading,
    downloading => {
        if (downloading) {
            launcherState.value = "downloading"
        } else if (launcherState.value === "downloading") {
            void refreshLauncherState()
        }
    }
)

// 初始化时与游戏路径变化时刷新状态
onMounted(refreshLauncherState)
watch(() => game.path, refreshLauncherState)
</script>

<template>
    <!-- 迷你启动器：无边框容器；左侧为状态/版本/下载进度补充信息，右侧为状态感知的主按钮 -->
    <div class="flex items-center gap-2">
        <!-- 补充信息：状态图标 + 文案 + 版本号 / 下载进度 -->
        <div class="hidden items-center gap-1.5 text-xs font-medium text-base-content/60 md:flex">
            <Icon :icon="stateIcon" class="h-4 w-4" :class="stateIconClass" />
            <span>{{ stateText }}</span>
            <span v-if="versionInfo" class="tabular-nums opacity-70">{{ versionInfo }}</span>
            <span v-if="launcherState === 'downloading' && gameUpdateStore.currentFile" class="max-w-40 truncate opacity-60">
                {{ gameUpdateStore.currentFile }}
            </span>
            <span v-if="launcherState === 'downloading' && gameUpdateStore.downloadSpeed" class="tabular-nums opacity-60">
                {{ gameUpdateStore.downloadSpeed }}
            </span>
        </div>
        <!-- 跳转完整启动器（与主按钮同高） -->
        <RouterLink
            to="/game-launcher"
            class="inline-flex h-11 w-11 items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-base-content/10 hover:text-base-content"
            aria-label="打开游戏启动器"
            :title="$t('game-launcher.title')"
        >
            <Icon icon="ri:more-line" class="h-5 w-5" />
        </RouterLink>
        <!-- 主操作按钮（状态感知：设置路径 / 更新 / 下载中 / 启动游戏，样式与首页「检查更新」按钮一致） -->
        <button
            type="button"
            class="cursor-pointer inline-flex h-11 items-center justify-center gap-2 rounded-xs bg-primary px-5 text-sm font-semibold text-primary-content transition-all duration-150 hover:bg-primary/90 active:translate-y-px motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isBusy"
            :title="launchTitle"
            @click="primaryAction()"
        >
            <Icon :icon="primaryIcon" class="h-5 w-5" :class="{ 'animate-spin': launcherState === 'checking' }" />
            {{ primaryLabel }}
        </button>
    </div>
</template>
