<script setup lang="ts">
import { listen } from "@tauri-apps/api/event"
import * as dialog from "@tauri-apps/plugin-dialog"
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useUIStore } from "@/store/ui"
import { cleanupTempDir, extractGameAssets, getFileSize, listFiles, readTextFile, renameFile, writeTextFile } from "../api/app"
import { useGameStore } from "../store/game"
import {
    CDN_LIST,
    type DownloadProgress,
    downloadAssets,
    type GameAssets,
    type GameVersionListLocal,
    type GameVersionListRes,
    type GameVersionListWithPre,
    getBaseVersion,
} from "../utils/game-download"

// 状态管理
const gameStore = useGameStore()
const ui = useUIStore()
const versionList = ref<GameVersionListWithPre | null>(null)
const isLoading = ref(false)
const isDownloading = ref(false)
const isExtracting = ref(false)
const lastDownloadedFile = ref<string | null>(null)

// 下载进度相关状态
const totalSize = ref(0)
const totalFiles = ref(0)
const currentDownloaded = ref(0)
const overallProgress = ref(0)
const currentFile = ref("")
const currentFileDownloaded = ref("")
const currentFileTotal = ref("")
const fileProgress = ref(0)
const downloadSpeed = ref("")
const concurrentThreads = ref(5)

const preTotalSize = ref(0)
const preTotalFiles = ref(0)

// 解压缩进度相关状态
const extractionCurrentFileCount = ref(0)
const extractionCurrentSize = ref(0)
const extractionTotalFiles = ref(0)
const extractionTotalSize = ref(0)
const extractionCurrentFile = ref("")

// 下载速度计算相关
let lastDownloadedBytes = 0
let lastTimestamp = 0

// 版本更新相关状态
const needUpdate = ref(false)
const updateSize = ref(0)

// 是否需要预下载
const needPreDownload = ref(false)

const channels = [
    {
        name: t("game-update.formal_server"),
        value: "PC_OBT_CN_Pub",
    },
    {
        name: "bilibili",
        value: "PC_OBT_Bili_Pub",
    },
    // {
    //     name: t("game-update.media_server"),
    //     value: "PC_OBT12_Media_CN_Pub",
    // },
    {
        name: t("game-update.global_server"),
        value: "PC_OBT_Global_Pub",
    },
]

const selectedChannel = useLocalStorage("selectedChannel", channels[0].value)
const availableCDN = computed(() => {
    if (selectedChannel.value === channels[2].value) {
        return CDN_LIST.filter(cdn => cdn.name === '海外')
    }
    return CDN_LIST.filter(cdn => cdn.name !== '海外')
})

const selectedCDN = useLocalStorage("selectedCDN", CDN_LIST[1].url)

watch([selectedChannel, selectedCDN], async () => {
    if (!availableCDN.value.find(cdn => cdn.url === selectedCDN.value)) {
        selectedCDN.value = availableCDN.value[0].url
    }
    await fetchVersionList()
    await checkForUpdates()
})

const gamePath = computed(() => gameStore.path.replace(/\\DNA Game\\EM\.exe/, ""))
const tempDownloadDir = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\TempPath\\"
})

const tempPreDownloadDir = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\TempPrePath\\"
})
const extractDir = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\"
})
const baseVersionPath = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\BaseVersion.json"
})

function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

function calculateDownloadSpeed(currentBytes: number): string {
    const now = Date.now()
    const timeDiff = now - lastTimestamp
    if (timeDiff > 1000) {
        const bytesDiff = currentBytes - lastDownloadedBytes
        const speed = bytesDiff / (timeDiff / 1000)
        lastDownloadedBytes = currentBytes
        lastTimestamp = now
        return formatSize(speed) + "/s"
    }
    return downloadSpeed.value
}

async function fetchVersionList() {
    isLoading.value = true
    try {
        versionList.value = await getBaseVersion(selectedCDN.value, selectedChannel.value)
        calculateTotalSize()
        await checkPreDownloadStatus()
    } catch (err) {
        ui.showErrorMessage(t("game-update.get_version_list_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("获取版本列表失败:", err)
    } finally {
        isLoading.value = false
    }
}

function calculateTotalSize() {
    if (!versionList.value) return
    let size = 0
    let files = 0
    const gameVersionList = versionList.value.gameVersionList.GameVersionList["1"].GameVersionList
    for (const assets of Object.values(gameVersionList)) {
        size += assets.ZipSize
        files++
    }
    totalSize.value = size
    totalFiles.value = files
    if (versionList.value.preVersionList) {
        let preSize = 0
        let preFiles = 0
        const preVersionList = versionList.value.preVersionList.GameVersionList["1"].GameVersionList
        for (const assets of Object.values(preVersionList)) {
            preSize += assets.ZipSize
            preFiles++
        }
        preTotalSize.value = preSize
        preTotalFiles.value = preFiles
    } else {
        preTotalSize.value = 0
        preTotalFiles.value = 0
    }
}

async function checkPreDownloadStatus() {
    if (!gamePath.value || !versionList.value || !versionList.value.preVersionList) {
        needPreDownload.value = false
        return
    }
    try {
        const preFiles = await listFiles(tempPreDownloadDir.value)
        const preVersionList = versionList.value.preVersionList.GameVersionList["1"].GameVersionList
        const expectedFiles = Object.keys(preVersionList)
        let allFilesComplete = true
        for (const filename of expectedFiles) {
            const fileExists = preFiles.includes(filename)
            const progressFileExists = preFiles.includes(filename + ".progress")
            if (!fileExists || progressFileExists) {
                allFilesComplete = false
                break
            }
        }
        needPreDownload.value = !allFilesComplete
    } catch (error) {
        console.error("检查预下载状态时出错:", error)
        needPreDownload.value = true
    }
}

/**
 * 兼容本地 BaseVersion.json 的两种结构并提取版本映射
 */
function resolveLocalVersions(localContent: string): Record<string, GameAssets> | null {
    const localVersionList = JSON.parse(localContent) as Partial<GameVersionListLocal> & Partial<GameVersionListRes>
    if (localVersionList.gameVersionList?.["1"]?.gameVersionList) {
        return localVersionList.gameVersionList["1"].gameVersionList
    }
    if (localVersionList.GameVersionList?.["1"]?.GameVersionList) {
        return localVersionList.GameVersionList["1"].GameVersionList
    }
    return null
}

async function checkForUpdates() {
    if (!gamePath.value) return
    try {
        const localContent = await readTextFile(baseVersionPath.value)
        const localVersions = resolveLocalVersions(localContent)
        if (!localVersions) {
            throw new Error("Unsupported BaseVersion format")
        }
        if (versionList.value) {
            const remoteVersions = versionList.value.gameVersionList.GameVersionList["1"].GameVersionList
            let hasUpdate = false
            let updateSizeBytes = 0
            for (const [filename, remoteAsset] of Object.entries(remoteVersions)) {
                if (!localVersions[filename] || remoteAsset.ZipGameVersion !== localVersions[filename].ZipGameVersion) {
                    hasUpdate = true
                    updateSizeBytes += remoteAsset.ZipSize
                }
            }
            needUpdate.value = hasUpdate
            updateSize.value = updateSizeBytes
        }
    } catch (err) {
        needUpdate.value = true
        updateSize.value = totalSize.value
        console.error("检查更新时出错:", err)
    }
    await checkPreDownloadStatus()
}

async function updateBaseVersionFile() {
    if (!gamePath.value || !versionList.value) return
    try {
        const localVersionList: GameVersionListRes = {
            GameVersionList: {
                "1": {
                    GameVersionList: versionList.value.gameVersionList.GameVersionList["1"].GameVersionList,
                },
            },
        }
        const content = JSON.stringify(localVersionList, null, 2)
        await writeTextFile(baseVersionPath.value, content)
        ui.showSuccessMessage(t("game-update.update_success"))
    } catch (err) {
        ui.showErrorMessage(t("game-update.update_base_version_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("更新 BaseVersion.json 失败:", err)
    }
}

async function selectGameDir() {
    try {
        const selected = await dialog.open({
            title: t("game-update.select_game_dir_first"),
            multiple: false,
            directory: true,
        })
        if (selected) {
            const emExePath = `${selected}\\DNA Game\\EM.exe`
            gameStore.path = emExePath
            ui.showSuccessMessage(`游戏目录设置成功: ${emExePath}`)
            if (versionList.value) {
                await checkForUpdates()
            }
        }
    } catch (err) {
        ui.showErrorMessage(t("game-update.select_dir_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("选择目录失败:", err)
    }
}

async function downloadAllFiles() {
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }
    if (!versionList.value) {
        ui.showErrorMessage(t("game-update.version_list_not_loaded"))
        return
    }
    if (tempPreDownloadDir.value) {
        try {
            const preFiles = await listFiles(tempPreDownloadDir.value)
            if (preFiles.length > 0) {
                for (const filename of preFiles) {
                    const preFilePath = tempPreDownloadDir.value + filename
                    const tempFilePath = tempDownloadDir.value + filename
                    try {
                        await renameFile(preFilePath, tempFilePath)
                    } catch (renameError) {
                        console.error("移动文件失败:", renameError)
                    }
                }
            }
        } catch { }
    }
    isDownloading.value = true
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    lastDownloadedBytes = 0
    lastTimestamp = Date.now()
    try {
        const gameVersionList = versionList.value.gameVersionList.GameVersionList["1"].GameVersionList
        const files = Object.entries(gameVersionList)
        for (const [filename, assets] of files) {
            currentFile.value = filename
            const fullFilePath = `${tempDownloadDir.value}${filename}`
            const progressFilePath = `${fullFilePath}.progress`
            const actualSize = await getFileSize(fullFilePath)
            const expectedSize = assets.ZipSize
            const progressFileSize = await getFileSize(progressFilePath)
            const isFileComplete = actualSize > 0 && actualSize === expectedSize && progressFileSize === 0
            if (isFileComplete) {
                console.debug(`文件 ${filename} 已存在且大小匹配，跳过下载`)
                const fileIndex = files.findIndex(([name]) => name === filename)
                const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
                const totalDownloaded = previousFilesSize + expectedSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / totalSize.value
                fileProgress.value = 1
                currentFileDownloaded.value = formatSize(expectedSize)
                currentFileTotal.value = formatSize(expectedSize)
                lastDownloadedFile.value = fullFilePath
                continue
            }
            const onProgress = (progress: DownloadProgress) => {
                fileProgress.value = progress.downloaded / progress.total
                currentFileDownloaded.value = formatSize(progress.downloaded)
                currentFileTotal.value = formatSize(progress.total)
                const fileDownloaded = progress.downloaded
                const estimatedTotal = totalSize.value
                const fileIndex = files.findIndex(([name]) => name === filename)
                const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
                const totalDownloaded = previousFilesSize + fileDownloaded
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / estimatedTotal
                downloadSpeed.value = calculateDownloadSpeed(totalDownloaded)
            }
            await downloadAssets(
                selectedCDN.value,
                filename,
                selectedChannel.value,
                versionList.value.subVersion,
                concurrentThreads.value,
                onProgress,
                tempDownloadDir.value
            )
            lastDownloadedFile.value = fullFilePath
        }
        isDownloading.value = false
        currentFile.value = ""
        downloadSpeed.value = ""
        await extractAllFiles()
        await updateBaseVersionFile()
        await checkForUpdates()
    } catch (err) {
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("下载失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

async function preDownloadAllFiles() {
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }
    if (!versionList.value || !versionList.value.preVersion || !versionList.value.preVersionList) {
        ui.showErrorMessage(t("game-update.no_pre_download_available"))
        return
    }
    isDownloading.value = true
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    lastDownloadedBytes = 0
    lastTimestamp = Date.now()
    try {
        const preVersionList = versionList.value.preVersionList.GameVersionList["1"].GameVersionList
        const files = Object.entries(preVersionList)
        let preTotalSizeVal = 0
        for (const [, assets] of files) {
            preTotalSizeVal += assets.ZipSize
        }
        for (const [filename, assets] of files) {
            currentFile.value = filename
            const fullFilePath = `${tempPreDownloadDir.value}${filename}`
            const progressFilePath = `${fullFilePath}.progress`
            const actualSize = await getFileSize(fullFilePath)
            const expectedSize = assets.ZipSize
            const progressFileSize = await getFileSize(progressFilePath)
            const isFileComplete = actualSize > 0 && actualSize === expectedSize && progressFileSize === 0
            if (isFileComplete) {
                console.debug(`预下载文件 ${filename} 已存在且大小匹配，跳过下载`)
                const fileIndex = files.findIndex(([name]) => name === filename)
                const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
                const totalDownloaded = previousFilesSize + expectedSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / preTotalSizeVal
                fileProgress.value = 1
                currentFileDownloaded.value = formatSize(expectedSize)
                currentFileTotal.value = formatSize(expectedSize)
                lastDownloadedFile.value = fullFilePath
                continue
            }
            const onProgress = (progress: DownloadProgress) => {
                fileProgress.value = progress.downloaded / progress.total
                currentFileDownloaded.value = formatSize(progress.downloaded)
                currentFileTotal.value = formatSize(progress.total)
                const fileDownloaded = progress.downloaded
                const fileIndex = files.findIndex(([name]) => name === filename)
                const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
                const totalDownloaded = previousFilesSize + fileDownloaded
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / preTotalSizeVal
                downloadSpeed.value = calculateDownloadSpeed(totalDownloaded)
            }
            await downloadAssets(
                selectedCDN.value,
                filename,
                selectedChannel.value,
                versionList.value.preVersion!,
                concurrentThreads.value,
                onProgress,
                tempPreDownloadDir.value
            )
            lastDownloadedFile.value = fullFilePath
        }
        isDownloading.value = false
        currentFile.value = ""
        downloadSpeed.value = ""
        await checkPreDownloadStatus()
        ui.showSuccessMessage(t("game-update.pre_download_complete", { size: formatSize(preTotalSizeVal) }))
    } catch (err) {
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("预下载失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

async function extractAllFiles() {
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }
    if (!versionList.value) {
        ui.showErrorMessage(t("game-update.version_list_not_loaded"))
        return
    }
    isExtracting.value = true
    overallProgress.value = 0
    try {
        const gameVersionList = versionList.value.gameVersionList.GameVersionList["1"].GameVersionList
        const files = Object.entries(gameVersionList)
        const totalFilesCount = files.length
        for (let i = 0; i < files.length; i++) {
            const [filename] = files[i]
            const zipPath = `${tempDownloadDir.value}/${filename}`
            const targetDir = extractDir.value
            overallProgress.value = (i + 1) / totalFilesCount
            await extractGameAssets(zipPath, targetDir)
        }
        if (tempDownloadDir.value) {
            try {
                await cleanupTempDir(tempDownloadDir.value)
            } catch (err) {
                console.error("临时目录清理失败:", err)
            }
        }
        isExtracting.value = false
        overallProgress.value = 0
        extractionCurrentFileCount.value = 0
        extractionCurrentSize.value = 0
        extractionTotalFiles.value = 0
        extractionTotalSize.value = 0
        extractionCurrentFile.value = ""
        ui.showSuccessMessage(t("game-update.download_complete", { size: formatSize(totalSize.value) }))
    } catch (err) {
        ui.showErrorMessage(t("game-update.extract_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("解压缩失败:", err)
        isExtracting.value = false
    }
}

onMounted(async () => {
    await fetchVersionList()
    await checkForUpdates()
    const unlisten = await listen("extract_progress", event => {
        const payload = event.payload as {
            current_file_count: number
            current_size: number
            total_files: number
            total_size: number
            current_file: string
        }
        const { current_file_count, current_size, total_files, total_size, current_file } = payload
        extractionCurrentFileCount.value = current_file_count
        extractionCurrentSize.value = current_size
        extractionTotalFiles.value = total_files
        extractionTotalSize.value = total_size
        extractionCurrentFile.value = current_file
    })
    onUnmounted(() => {
        unlisten()
    })
})
const launchGame = async () => {
    if (!gameStore.path) {
        ui.showErrorMessage(t("game-launcher.selectGameFileFirst"))
        return
    }
    try {
        await gameStore.launchGame()
    } catch (error) {
        console.error("启动游戏失败:", error)
        ui.showErrorMessage(t("game-launcher.launchGameFailed", { error: error instanceof Error ? error.message : String(error) }))
    }
}
</script>

<template>
    <!-- 主容器：深色背景，全屏 -->
    <div class="relative w-full h-full overflow-hidden select-none bg-base-100 font-sans">
        <img class="absolute top-0 left-0 w-full h-full object-cover pointer-events-none opacity-60"
            src="https://cdnstatic.yingxiong.com/dna/hd/imgs/home/pc/bg.webp" alt="bg" />
        <div class="flex flex-col h-full p-8 max-w-7xl mx-auto gap-8">
            <!-- 顶部 HUD：服务器配置 -->
            <header
                class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-base-300/20 backdrop-blur-md rounded-2xl p-4 border border-base-content/5 shadow-xl transition-all hover:border-base-content/10">
                <div class="flex items-center gap-3">
                    <img src="/setup-icon.webp" alt="LOGO" class="h-8" />
                    <h1 class="text-2xl font-semibold">{{ t("game-update.game") }}</h1>
                </div>

                <!-- 配置区域 -->
                <div class="flex flex-wrap items-center gap-3">
                    <div class="group relative">
                        <div
                            class="flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors cursor-pointer">
                            <Icon icon="ri:server-line" class="text-base-content/40 w-4 h-4" />
                            <Select v-model="selectedChannel"
                                class="bg-transparent border-none outline-hidden text-sm appearance-none cursor-pointer min-w-20">
                                <SelectItem v-for="channel in channels" :key="channel.value" :value="channel.value" xs>
                                    {{ channel.name }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>

                    <div class="group relative">
                        <div
                            class="flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors cursor-pointer">
                            <Icon icon="ri:cloud-line" class="text-base-content/40 w-4 h-4" />
                            <Select v-model="selectedCDN"
                                class="bg-transparent border-none outline-hidden text-sm appearance-none cursor-pointer min-w-20 truncate">
                                <SelectItem v-for="cdn in availableCDN" :key="cdn.url" :value="cdn.url">
                                    {{ cdn.name }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>

                    <div class="group relative flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors"
                        :title="t('game-update.threads')">
                        <Icon icon="ri:speed-line" class="text-base-content/40 w-4 h-4" />
                        <input v-model.number="concurrentThreads" type="number"
                            class="bg-transparent border-none outline-hidden text-sm w-8 text-center" min="1"
                            max="32" />
                    </div>
                </div>
            </header>
            <div class="flex-1"></div>
            <!-- 核心区域 -->
            <main class="flex-1 flex flex-col justify-end pb-8 gap-6">
                <!-- 状态指示 & 信息卡片 -->
                <div v-if="versionList" class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <!-- 目录设置卡片 -->
                    <div
                        class="md:col-span-2 bg-base-300/40 backdrop-blur-sm border border-base-content/10 rounded-2xl p-5 hover:bg-base-300/50 transition-colors group">
                        <div class="flex justify-between items-center mb-3">
                            <span class="opacity-60 text-xs font-bold uppercase tracking-wider">{{
                                t("game-update.install_path") }}</span>
                            <button @click="selectGameDir"
                                class="text-primary hover:text-base-content text-xs flex items-center gap-1 transition-colors">
                                <Icon icon="ri:folder-line" /> {{ t("game-update.change") }}
                            </button>
                        </div>
                        <div class="text-sm font-mono truncate opacity-80 group-hover:text-base-content transition-colors"
                            :title="gamePath">
                            {{ gamePath || t("game-update.no_path_selected") }}
                        </div>
                        <div class="mt-2 h-1 w-full bg-base-content/5 rounded-full overflow-hidden">
                            <div class="h-full bg-primary/50 w-full" v-if="gamePath"></div>
                        </div>
                    </div>

                    <!-- 版本信息 -->
                    <div
                        class="bg-base-300/40 backdrop-blur-sm border border-base-content/10 rounded-2xl p-5 flex flex-col justify-between">
                        <span class="text-base-content/40 text-xs font-bold uppercase tracking-wider">{{
                            t("game-update.version") }}</span>
                        <div class="flex items-end gap-2">
                            <span class="text-2xl font-bold font-mono">{{ versionList.subVersion }}</span>
                            <span class="text-xs mb-1 px-1.5 py-0.5 rounded bg-base-content/10 opacity-80"
                                v-if="needUpdate">{{
                                    t("game-update.old_version")
                                }}</span>
                            <span class="text-xs mb-1 px-1.5 py-0.5 rounded bg-success/20 text-success" v-else>{{
                                t("game-update.latest_version")
                            }}</span>
                        </div>
                    </div>

                    <!-- 大小信息 -->
                    <div
                        class="bg-base-300/40 backdrop-blur-sm border border-base-content/10 rounded-2xl p-5 flex flex-col justify-between">
                        <span class="opacity-60 text-xs font-bold uppercase tracking-wider">{{ t("game-update.size")
                        }}</span>
                        <div class="flex items-end gap-2">
                            <span class="text-2xl font-bold text-secondary">{{ formatSize(totalSize) }}</span>
                            <span class="text-xs opacity-80 mb-1.5">{{ totalFiles }} {{ t("game-update.files") }}</span>
                        </div>
                    </div>
                </div>

                <!-- 预下载通知条 -->
                <div v-if="needPreDownload && versionList"
                    class="bg-linear-to-r from-info/20 to-transparent border-l-4 border-info backdrop-blur-sm p-4 rounded-r-xl flex items-center justify-between animate-in slide-in-from-left-4 fade-in duration-500">
                    <div class="flex items-center gap-3">
                        <div class="p-2 rounded-full bg-info/20">
                            <Icon icon="ri:download-cloud-2-line" class="w-5 h-5 text-info" />
                        </div>
                        <div>
                            <h3 class="font-bold text-base-content text-sm">{{ t("game-update.pre_download_available")
                            }}</h3>
                            <p class="text-xs text-info/80">
                                {{
                                    t("game-update.pre_download_size", {
                                        version: versionList.preVersion,
                                        size: formatSize(preTotalSize),
                                    })
                                }}
                            </p>
                        </div>
                    </div>
                    <button @click="preDownloadAllFiles()" :disabled="isDownloading || isExtracting"
                        class="px-4 py-2 bg-info hover:bg-info/80 text-base-content text-xs font-bold uppercase tracking-wide rounded-lg transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] disabled:opacity-50 disabled:cursor-not-allowed">
                        {{ isDownloading ? t("game-update.downloading") : t("game-update.start_pre_download") }}
                    </button>
                </div>

                <!-- 进度面板 (下载/解压时显示) -->
                <div v-if="isDownloading || isExtracting"
                    class="space-y-3 bg-base-300/60 backdrop-blur-2xl rounded-2xl p-6 border border-base-content/10 shadow-2xl animate-in slide-in-from-bottom-4">
                    <div class="flex justify-between items-end">
                        <div>
                            <h2 class="text-xl font-bold text-base-content flex items-center gap-2">
                                <Icon v-if="isDownloading" icon="ri:download-2-line" class="animate-bounce" />
                                <Icon v-else icon="ri:install-line" class="animate-pulse" />
                                {{ isDownloading ? t("game-update.downloading_resources") :
                                    t("game-update.extracting_resources") }}
                            </h2>
                            <p class="text-xs text-base-content/40 font-mono mt-1">
                                {{ isDownloading ? currentFile : extractionCurrentFile }}
                            </p>
                        </div>
                        <div class="text-right">
                            <div
                                class="text-3xl font-black font-mono text-transparent bg-clip-text bg-linear-to-r from-white to-gray-400">
                                {{ Math.round(overallProgress * 100) }}<span class="text-lg">%</span>
                            </div>
                            <div class="text-xs font-mono text-primary" v-if="isDownloading">
                                {{ downloadSpeed }}
                            </div>
                        </div>
                    </div>

                    <!-- 总进度条 -->
                    <div class="h-4 bg-gray-900 rounded-full overflow-hidden border border-base-content/5 relative">
                        <!-- 动态条纹背景 -->
                        <div
                            class="absolute inset-0 w-full h-full opacity-10 bg-size-[20px_20px] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#fff_10px,#fff_20px)] animate-[move-bg_1s_linear_infinite]">
                        </div>
                        <div class="h-full bg-linear-to-r from-primary via-secondary to-primary bg-size-[200%_100%] animate-[shimmer_2s_linear_infinite] shadow-[0_0_20px_rgba(var(--primary),0.5)] transition-all duration-300 ease-out"
                            :style="{ width: `${overallProgress * 100}%` }"></div>
                    </div>

                    <!-- 详细数据行 -->
                    <div class="flex justify-between text-xs text-gray-500 font-mono pt-1">
                        <span>
                            {{
                                isDownloading
                                    ? `${formatSize(currentDownloaded)} / ${formatSize(totalSize)}`
                                    : `${extractionCurrentFileCount} / ${extractionTotalFiles} Files`
                            }}
                        </span>
                        <span v-if="isDownloading">
                            {{ currentFileDownloaded }} / {{ currentFileTotal }} ({{ t("game-update.current_file") }})
                        </span>
                    </div>
                </div>

                <!-- 底部主操作按钮 -->
                <div v-else class="flex gap-4 items-center">
                    <div v-if="!gamePath"
                        class="w-full text-center py-8 text-gray-500 font-mono border-2 border-dashed border-base-content/10 rounded-2xl">
                        {{ t("game-update.select_game_dir_first") }}
                    </div>

                    <button v-else @click="needUpdate ? downloadAllFiles() : launchGame()"
                        :disabled="!needUpdate && !gamePath"
                        class="group relative w-full h-20 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 shadow-xl"
                        :class="needUpdate
                            ? 'bg-primary hover:shadow-[0_0_40px_rgba(var(--primary),0.6)]'
                            : 'bg-base-200/40 backdrop-blur-sm border border-base-content/10 cursor-default'
                            ">
                        <!-- 按钮背景特效 -->
                        <div v-if="needUpdate"
                            class="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]">
                        </div>

                        <div class="relative z-10 flex flex-col items-center justify-center h-full gap-1">
                            <div class="flex items-center gap-3" :class="needUpdate ? 'text-white' : 'text-white/40'">
                                <Icon :icon="needUpdate ? 'ri:download-fill' : 'ri:play-fill'" class="w-8 h-8" />
                                <span class="text-2xl font-black tracking-widest uppercase">
                                    {{ needUpdate ? t("game-update.update_game") : t("game-update.game_ready") }}
                                </span>
                            </div>
                            <span v-if="needUpdate" class="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded">
                                {{ t("game-update.update_size", { size: formatSize(updateSize) }) }}
                            </span>
                        </div>
                    </button>
                </div>
            </main>
        </div>
    </div>
</template>

<style>
/* 自定义动画关键帧 */
@keyframes shimmer {
    0% {
        background-position: 100% 0;
    }

    100% {
        background-position: -100% 0;
    }
}

@keyframes move-bg {
    0% {
        background-position: 0 0;
    }

    100% {
        background-position: 20px 0;
    }
}
</style>
