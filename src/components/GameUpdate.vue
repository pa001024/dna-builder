<script setup lang="ts">
import { listen } from "@tauri-apps/api/event"
import * as dialog from "@tauri-apps/plugin-dialog"
import { t } from "i18next"
import { storeToRefs } from "pinia"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import {
    applyGamePatch,
    cleanupTempDir,
    deleteFile,
    extractGameAssets,
    getFileSize,
    listFiles,
    readTextFile,
    renameFile,
    writeTextFile,
} from "@/api/app"
import { useGameStore } from "@/store/game"
import { useGameUpdateStore } from "@/store/gameUpdate"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import {
    compareGameVersions,
    type DownloadProgress,
    downloadAssets,
    downloadFullPackage,
    downloadHotUpdateAssets,
    type FullPackageInfo,
    type GameVersionListWithPre,
    getBaseVersion,
    getDownloadProgress,
    getHotUpdatePakFilesInfo,
    getPreFullPackageInfo,
    type HotUpdatePakFileInfo,
    type HotUpdatePakFilesInfoRes,
    isDownloadAlreadyActiveError,
    isDownloadPausedError,
    isLocalFileMatch,
    normalizeHotUpdatePakFilesInfo,
    resolveGameVersion,
    resolveLocalVersions,
    toLocalBaseVersionFormat,
    VERSION_URL_PUB,
} from "@/utils/game-download"

// 状态管理
const gameStore = useGameStore()
const ui = useUIStore()
const setting = useSettingStore()
const gameUpdateStore = useGameUpdateStore()
// 下载进度 / 热更状态统一来自公共 store（完整启动器与迷你启动器共用）
const {
    isDownloading,
    isDownloadPaused,
    isPauseRequested,
    isRecoveredActiveDownload,
    activeDownloadAction,
    activeOptionalSign,
    currentDownloaded,
    activeDownloadTotal,
    activeDownloadCompletedBefore,
    overallProgress,
    currentFile,
    currentFileUrl,
    currentDownloadPath,
    currentFileDownloaded,
    currentFileTotal,
    fileProgress,
    downloadSpeed,
    concurrentThreads,
    needHotUpdate,
    hotUpdateSize,
    hotUpdateFiles,
    hotUpdateVersionListCache,
    hotUpdatePendingVersions,
    optionalPatchSignsCache,
} = storeToRefs(gameUpdateStore)

const versionList = ref<GameVersionListWithPre | null>(null)
const fullPackageInfo = ref<FullPackageInfo | null>(null)
const preFullPackageInfo = ref<FullPackageInfo | null>(null)
const isLoading = ref(false)
const isExtracting = ref(false)

const totalSize = ref(0)
const totalFiles = ref(0)

const preTotalSize = ref(0)
const preTotalFiles = ref(0)

// 可选语音包 / 热更详情 UI 状态（展示层，留在组件内）
const showOptionalVoicePacks = ref(false)
const optionalPackEntries = ref<
    Array<{
        sign: string
        version: number
        versions: Array<{
            version: number
            files: HotUpdatePakFileInfo[]
        }>
        files: HotUpdatePakFileInfo[]
    }>
>([])
const optionalPackDownloadQueue = ref<string[]>([])
const isProcessingOptionalPackQueue = ref(false)
const downloadingOptionalSign = ref("")
const hotUpdateDetailOpen = ref(false)
const hotUpdateDetailEntries = ref<Array<{ version: number; files: string[] }>>([])

// 解压缩进度相关状态
const extractionCurrentFileCount = ref(0)
const extractionCurrentSize = ref(0)
const extractionTotalFiles = ref(0)
const extractionTotalSize = ref(0)
const extractionCurrentFile = ref("")
let extractionProgressTimer: number | null = null

const EXTRACTION_LINEAR_DURATION = 40_000
const EXTRACTION_LOG_DURATION = 30_000

/**
 * 计算解压阶段的模拟进度：前 40 秒匀速到 90%，后 30 秒按对数曲线减速到 100%。
 * @param elapsedMs 解压开始后经过的毫秒数
 * @returns 0 到 1 之间的模拟进度
 */
function calculateExtractionProgress(elapsedMs: number) {
    if (elapsedMs <= EXTRACTION_LINEAR_DURATION) {
        return (elapsedMs / EXTRACTION_LINEAR_DURATION) * 0.9
    }
    const logPhaseProgress = Math.min(1, (elapsedMs - EXTRACTION_LINEAR_DURATION) / EXTRACTION_LOG_DURATION)
    return 0.9 + 0.1 * (Math.log1p(9 * logPhaseProgress) / Math.log(10))
}

/**
 * 启动解压阶段的模拟进度更新。
 */
function startExtractionProgress() {
    if (extractionProgressTimer !== null) {
        window.clearInterval(extractionProgressTimer)
    }
    const startedAt = performance.now()
    overallProgress.value = 0
    extractionProgressTimer = window.setInterval(() => {
        overallProgress.value = calculateExtractionProgress(performance.now() - startedAt)
    }, 100)
}

/**
 * 停止解压阶段的模拟进度更新。
 * @param completed 是否已成功完成解压
 */
function stopExtractionProgress(completed: boolean) {
    if (extractionProgressTimer !== null) {
        window.clearInterval(extractionProgressTimer)
        extractionProgressTimer = null
    }
    if (completed) {
        overallProgress.value = 1
    }
}

/**
 * 清理解压阶段的展示状态。
 */
function resetExtractionState() {
    stopExtractionProgress(false)
    isExtracting.value = false
    overallProgress.value = 0
    extractionCurrentFileCount.value = 0
    extractionCurrentSize.value = 0
    extractionTotalFiles.value = 0
    extractionTotalSize.value = 0
    extractionCurrentFile.value = ""
}

// 版本更新相关状态
const needUpdate = ref(false)
const updateSize = ref(0)
const hasUpdate = computed(() => needUpdate.value || needHotUpdate.value)
const displayDownloadSize = computed(() => {
    if (isDownloading.value || isDownloadPaused.value) return activeDownloadTotal.value
    if (needUpdate.value) return updateSize.value
    if (needHotUpdate.value) return hotUpdateSize.value
    if (needPreDownload.value) return preTotalSize.value
    return totalSize.value
})
const displayDownloadFileCount = computed(() => {
    if (needUpdate.value) return totalFiles.value
    if (needHotUpdate.value) return hotUpdateFiles.value
    if (needPreDownload.value) return preTotalFiles.value
    return totalFiles.value
})
const displayOverallProgressPercent = computed(() => Math.min(100, Math.max(0, Math.floor(overallProgress.value * 100))))

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
    {
        name: t("game-update.global_server"),
        value: "PC_OBT_Global_Pub",
    },
]

const gameInstalled = ref(false)

/**
 * 根据 CDN 正式版本刷新当前游戏是否正确安装。
 */
async function refreshGameInstalled() {
    const expectedVersion = fullPackageInfo.value?.latestVersion ?? versionList.value?.subVersion
    await gameStore.refreshGameInstalled(expectedVersion)
    gameInstalled.value = gameStore.installed
}

// 服务器 / CDN / 游戏路径配置统一在公共 store（与迷你启动器共用同一份输入）
gameUpdateStore.migrateLegacyGamePath()

watch(
    () => gameUpdateStore.selectedChannel,
    () => {
        if (gameUpdateStore.isCustomChannelSelected() && !gameUpdateStore.getActiveChannel()) return
        gameUpdateStore.syncGamePathByChannel()
    },
    { immediate: true }
)

watch(
    () => gameStore.path,
    path => {
        gameUpdateStore.saveChannelGamePath(path)
        void refreshGameInstalled()
    }
)

watch([() => gameUpdateStore.selectedChannel, () => gameUpdateStore.customChannel, () => gameUpdateStore.selectedCDN], async () => {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) {
        versionList.value = null
        fullPackageInfo.value = null
        preFullPackageInfo.value = null
        needUpdate.value = false
        updateSize.value = 0
        needPreDownload.value = false
        needHotUpdate.value = false
        hotUpdateSize.value = 0
        hotUpdateFiles.value = 0
        hotUpdateVersionListCache.value = null
        hotUpdatePendingVersions.value = []
        optionalPackEntries.value = []
        optionalPatchSignsCache.value = { optionalPatchInfos: {} }
        return
    }
    gameUpdateStore.syncGamePathByChannel()
    gameUpdateStore.saveChannelGamePath(gameStore.path)
    await refreshGameInstalled()
    gameUpdateStore.ensureValidCDN()
    await fetchVersionList()
    await checkForUpdates()
    await gameUpdateStore.checkHotUpdateStatus()
})

watch(
    showOptionalVoicePacks,
    async enabled => {
        if (!enabled) {
            optionalPackEntries.value = []
            optionalPatchSignsCache.value = { optionalPatchInfos: {} }
            return
        }
        await refreshLocalHotUpdateCaches()
    },
    { immediate: true }
)

// 热更检查结果变化时刷新可选语音包本地缓存展示
watch([hotUpdatePendingVersions, needHotUpdate], () => {
    void refreshLocalHotUpdateCaches()
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
const fullPackageDownloadDir = computed(() => {
    if (!gamePath.value) return ""
    return `${gamePath.value}\\Diff\\`
})
const extractDir = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\"
})
const baseVersionPath = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\BaseVersion.json"
})
const gameVersionPath = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\GameVersion.json"
})
const extractProgressPath = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\.extracting"
})

/**
 * 读取本地 OptionalPatchSigns.json 缓存并构建可选语音包列表（语音包展示数据）。
 */
async function loadOptionalPackEntries() {
    optionalPackEntries.value = []
    if (!gameUpdateStore.hotUpdatePatchRootDir) return

    const versions = await gameUpdateStore.listLocalHotUpdateVersions()
    const signEntries = new Map<string, Map<number, HotUpdatePakFileInfo[]>>()
    for (const version of versions) {
        try {
            const content = await readTextFile(`${gameUpdateStore.getHotUpdateVersionDir(version)}PakFilesInfo.json`)
            const pakInfo = normalizeHotUpdatePakFilesInfo(JSON.parse(content))
            const files = pakInfo.pakFilesMap.WindowsNoEditor?.pakFileInfos ?? []
            for (const file of files) {
                if (!file.pakOptionalSign) continue
                const versionEntries = signEntries.get(file.pakOptionalSign) ?? new Map<number, HotUpdatePakFileInfo[]>()
                const versionFiles = versionEntries.get(version) ?? []
                versionFiles.push(file)
                versionEntries.set(version, versionFiles)
                signEntries.set(file.pakOptionalSign, versionEntries)
            }
        } catch {
            continue
        }
    }
    optionalPackEntries.value = Array.from(signEntries.entries())
        .map(([sign, versionEntries]) => {
            const versions = Array.from(versionEntries.entries())
                .map(([version, files]) => ({ version, files }))
                .sort((a, b) => a.version - b.version)
            const latestVersion = versions.at(-1)?.version ?? 0
            return {
                sign,
                version: latestVersion,
                versions,
                files: versions.flatMap(entry => entry.files),
            }
        })
        .sort((a, b) => a.sign.localeCompare(b.sign))
}

/**
 * 读取本地热更目录中的缓存和语音包信息。
 */
async function refreshLocalHotUpdateCaches() {
    if (!showOptionalVoicePacks.value) return
    await gameUpdateStore.loadOptionalPatchSignsCache()
    await loadOptionalPackEntries()
}

/**
 * 获取语音包显示名称。
 * @param sign 语音包签名
 * @returns 显示名称
 */
function getOptionalPackLabel(sign: string) {
    const labelMap: Record<string, string> = {
        VoiceCN: "中文语音",
        VoiceEN: "英文语音",
        VoiceJP: "日语语音",
        VoiceKR: "韩语语音",
    }
    return labelMap[sign] ?? sign
}

/**
 * 判断语音包是否已下载到指定版本。
 * @param sign 语音包签名
 * @param version 语音包版本
 * @returns 是否已下载
 */
function isOptionalPackDownloaded(sign: string, version: number) {
    const cached = optionalPatchSignsCache.value.optionalPatchInfos[sign]
    return cached?.state === "Downloaded" && cached.version >= version
}

/**
 * 判断语音包是否已在队列中或正在下载。
 * @param sign 语音包签名
 * @returns 是否已排队
 */
function isOptionalPackQueued(sign: string) {
    return downloadingOptionalSign.value === sign || optionalPackDownloadQueue.value.includes(sign)
}

/**
 * 执行单个语音包下载任务。
 * @param sign 语音包签名
 */
async function downloadOptionalPackTask(sign: string) {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) {
        ui.showErrorMessage("请先填写自定义 channel")
        return
    }
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }
    const entry = optionalPackEntries.value.find(item => item.sign === sign)
    if (!entry) {
        ui.showErrorMessage("未找到可下载的语音包")
        return
    }
    if (isOptionalPackDownloaded(sign, entry.version)) {
        ui.showSuccessMessage(`${getOptionalPackLabel(sign)} 已下载`)
        return
    }

    downloadingOptionalSign.value = sign
    activeDownloadAction.value = "optional"
    activeOptionalSign.value = sign
    isDownloading.value = true
    isRecoveredActiveDownload.value = false
    isDownloadPaused.value = false
    isPauseRequested.value = false
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    gameUpdateStore.resetSpeedBaseline()
    try {
        const optionalFiles = entry.versions.flatMap(versionEntry =>
            versionEntry.files.map(file => ({ version: versionEntry.version, file }))
        )
        const totalSizeVal = optionalFiles.reduce((sum, item) => sum + item.file.fileSize, 0)
        activeDownloadTotal.value = totalSizeVal
        let fileBytesBefore = 0
        const filesToDownload = [...optionalFiles]
        const pendingHashChecks: Array<() => Promise<void>> = []
        const runningHashChecks: Promise<void>[] = []
        let index = 0
        while (index < filesToDownload.length || pendingHashChecks.length || runningHashChecks.length) {
            gameUpdateStore.throwIfPauseRequested()
            if (index >= filesToDownload.length) {
                gameUpdateStore.startPendingHashChecks(pendingHashChecks, runningHashChecks)
                if (runningHashChecks.length > 0) {
                    await Promise.all(runningHashChecks.splice(0))
                }
                continue
            }
            const item = filesToDownload[index]
            const { file, version } = item
            index++
            const fullFilePath = `${gameUpdateStore.getHotUpdateVersionDir(version)}${file.fileName}`
            const progressFilePath = `${fullFilePath}.progress`
            await gameUpdateStore.prepareCurrentDownloadFile(
                fullFilePath,
                file.fileName,
                file.fileSize,
                fileBytesBefore,
                totalSizeVal,
                gameUpdateStore.getHotUpdateAssetUrl(file.fileName, activeChannel, version)
            )
            if (await gameUpdateStore.canSkipBeforeHashCheck(fullFilePath, progressFilePath, file.fileSize)) {
                pendingHashChecks.push(() =>
                    gameUpdateStore.queueExistingFileHashCheck(fullFilePath, file.fileSize, file.hash, filesToDownload, item)
                )
                const totalDownloaded = fileBytesBefore + file.fileSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalSizeVal > 0 ? totalDownloaded / totalSizeVal : 0
                fileProgress.value = 1
                currentFileDownloaded.value = gameUpdateStore.formatSize(file.fileSize)
                currentFileTotal.value = gameUpdateStore.formatSize(file.fileSize)
                fileBytesBefore += file.fileSize
                continue
            }
            const downloadTask = downloadHotUpdateAssets(
                gameUpdateStore.selectedCDN,
                file.fileName,
                activeChannel,
                version,
                concurrentThreads.value,
                undefined,
                gameUpdateStore.getHotUpdateVersionDir(version)
            )
            gameUpdateStore.startPendingHashChecks(pendingHashChecks, runningHashChecks)
            await downloadTask
            fileBytesBefore += file.fileSize
        }
        await gameUpdateStore.markOptionalPatchDownloaded(sign)
        await refreshLocalHotUpdateCaches()
        ui.showSuccessMessage(`${getOptionalPackLabel(sign)} 下载完成`)
    } catch (err) {
        if (isDownloadPausedError(err)) {
            gameUpdateStore.markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            gameUpdateStore.markDownloadAlreadyActive()
            return
        }
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("语音包下载失败:", err)
    } finally {
        if (!isDownloadPaused.value) {
            downloadingOptionalSign.value = ""
        }
        downloadSpeed.value = ""
    }
}

/**
 * 顺序处理语音包下载队列。
 */
async function processOptionalPackDownloadQueue() {
    if (isProcessingOptionalPackQueue.value) return
    isProcessingOptionalPackQueue.value = true
    isDownloading.value = true
    try {
        while (optionalPackDownloadQueue.value.length > 0) {
            const nextSign = optionalPackDownloadQueue.value.shift()
            if (!nextSign) continue
            await downloadOptionalPackTask(nextSign)
            if (isDownloadPaused.value) break
        }
    } finally {
        isProcessingOptionalPackQueue.value = false
        if (!isDownloadPaused.value) {
            isDownloading.value = false
        }
    }
}

/**
 * 将语音包加入下载队列，并按顺序执行。
 * @param sign 语音包签名
 */
async function downloadOptionalPack(sign: string) {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) {
        ui.showErrorMessage("请先填写自定义 channel")
        return
    }
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }

    const entry = optionalPackEntries.value.find(item => item.sign === sign)
    if (!entry) {
        ui.showErrorMessage("未找到可下载的语音包")
        return
    }
    if (isOptionalPackDownloaded(sign, entry.version)) {
        ui.showSuccessMessage(`${getOptionalPackLabel(sign)} 已下载`)
        return
    }
    if (isOptionalPackQueued(sign)) {
        return
    }

    optionalPackDownloadQueue.value.push(sign)
    void processOptionalPackDownloadQueue()
}

/**
 * 获取当前渠道对应的资源服务器目录。
 * @param channel 渠道名
 * @returns 服务器目录
 */
function getResourceServer(channel: string) {
    return channel.match(/(Global)_Pub/)?.[1] || "CN"
}

/**
 * 拼接游戏本体下载地址。
 * @param filename 文件名
 * @param channel 渠道名
 * @param subVersion 资源版本
 * @returns 完整下载地址
 */
function getGameAssetUrl(filename: string, channel: string, subVersion: string) {
    const server = getResourceServer(channel)
    const versionUrl = VERSION_URL_PUB(server)
    return `${gameUpdateStore.selectedCDN}${versionUrl}${channel}/${subVersion ? `${subVersion}/` : ""}${filename}`
}

/**
 * 从暂停位置继续当前下载。
 */
async function resumeCurrentDownload() {
    const action = activeDownloadAction.value
    if (currentDownloadPath.value) {
        const progress = await getDownloadProgress(currentDownloadPath.value)
        if (progress.active) {
            isDownloading.value = true
            isDownloadPaused.value = false
            isPauseRequested.value = progress.paused
            isRecoveredActiveDownload.value = true
            return
        }
    }
    isPauseRequested.value = false
    isDownloadPaused.value = false
    if (action === "game") {
        await downloadAllFiles()
    } else if (action === "pre") {
        await preDownloadAllFiles()
    } else if (action === "hot") {
        await gameUpdateStore.downloadHotUpdate()
    } else if (action === "optional" && activeOptionalSign.value) {
        await downloadOptionalPackTask(activeOptionalSign.value)
    }
}

async function fetchVersionList() {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) {
        versionList.value = null
        fullPackageInfo.value = null
        preFullPackageInfo.value = null
        needUpdate.value = false
        updateSize.value = 0
        needPreDownload.value = false
        needHotUpdate.value = false
        hotUpdateSize.value = 0
        hotUpdateVersionListCache.value = null
        hotUpdatePendingVersions.value = []
        optionalPackEntries.value = []
        optionalPatchSignsCache.value = { optionalPatchInfos: {} }
        return
    }
    isLoading.value = true
    versionList.value = null
    fullPackageInfo.value = null
    preFullPackageInfo.value = null
    try {
        const [fullPackage, preFullPackage] = await Promise.all([
            gameUpdateStore.getFullPackageInfoForActiveChannel(),
            getPreFullPackageInfo(gameUpdateStore.selectedCDN, activeChannel),
        ])
        const baseVersion = fullPackage ? null : await getBaseVersion(gameUpdateStore.selectedCDN, activeChannel)
        versionList.value = baseVersion
        fullPackageInfo.value = fullPackage
        preFullPackageInfo.value = preFullPackage
        await refreshGameInstalled()
        calculateTotalSize()
        await checkPreDownloadStatus()
        await gameUpdateStore.checkHotUpdateStatus()
    } catch (err) {
        ui.showErrorMessage(t("game-update.get_version_list_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("获取版本列表失败:", err)
    } finally {
        isLoading.value = false
    }
}

function calculateTotalSize() {
    if (fullPackageInfo.value) {
        totalSize.value = fullPackageInfo.value.size
        totalFiles.value = 1
        preTotalSize.value = preFullPackageInfo.value?.size ?? 0
        preTotalFiles.value = preFullPackageInfo.value ? 1 : 0
        return
    }
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
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!gamePath.value || !activeChannel) {
        needPreDownload.value = false
        return
    }
    if (fullPackageInfo.value) {
        if (!preFullPackageInfo.value || preFullPackageInfo.value.latestVersion === fullPackageInfo.value.latestVersion) {
            needPreDownload.value = false
            return
        }
        const fullFilePath = `${fullPackageDownloadDir.value}${preFullPackageInfo.value.fileName}`
        const progressFileSize = await getFileSize(`${fullFilePath}.progress`)
        needPreDownload.value = progressFileSize !== 0 || (await getFileSize(fullFilePath)) !== preFullPackageInfo.value.size
        return
    }
    if (!versionList.value?.preVersionList) {
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
            const asset = preVersionList[filename]
            const isFileMatch = await isLocalFileMatch(`${tempPreDownloadDir.value}${filename}`, asset.ZipSize, asset.ZipMd5)
            if (!isFileMatch) {
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

async function checkForUpdates() {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) {
        needUpdate.value = false
        updateSize.value = 0
        return
    }
    if (!gamePath.value) return
    try {
        if (fullPackageInfo.value) {
            const localContent = await readTextFile(gameVersionPath.value)
            const localVersion = resolveGameVersion(localContent)
            needUpdate.value = String(localVersion) !== fullPackageInfo.value.latestVersion
            updateSize.value = needUpdate.value ? fullPackageInfo.value.size : 0
            await checkPreDownloadStatus()
            await gameUpdateStore.checkHotUpdateStatus()
            await syncDownloadProgressAfterRefresh()
            return
        }
        const localContent = await readTextFile(baseVersionPath.value)
        const localVersions = resolveLocalVersions(localContent)
        if (!localVersions) {
            throw new Error("Unsupported BaseVersion format")
        }
        if (versionList.value) {
            const remoteVersions = resolveLocalVersions(JSON.stringify(versionList.value.gameVersionList))
            if (!remoteVersions) {
                throw new Error("Unsupported remote BaseVersion format")
            }
            const { hasUpdate, updateSizeBytes } = compareGameVersions(localVersions, remoteVersions)
            needUpdate.value = hasUpdate
            updateSize.value = updateSizeBytes
        }
    } catch (err) {
        needUpdate.value = true
        updateSize.value = totalSize.value
        console.error("检查更新时出错:", err)
    }
    await checkPreDownloadStatus()
    await gameUpdateStore.checkHotUpdateStatus()
    await syncDownloadProgressAfterRefresh()
}

/**
 * 页面刷新后根据后端进度文件恢复当前下载进度显示。
 */
async function syncDownloadProgressAfterRefresh() {
    if (!gamePath.value) return
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) return
    if (needUpdate.value && fullPackageInfo.value) {
        const fullFilePath = `${fullPackageDownloadDir.value}${fullPackageInfo.value.fileName}`
        const progress = await getDownloadProgress(fullFilePath)
        if (progress.hasProgressFile) {
            await gameUpdateStore.prepareCurrentDownloadFile(
                fullFilePath,
                fullPackageInfo.value.fileName,
                fullPackageInfo.value.size,
                0,
                fullPackageInfo.value.size,
                fullPackageInfo.value.downloadUrl
            )
            isDownloading.value = progress.active
            isPauseRequested.value = progress.active && progress.paused
            isDownloadPaused.value = progress.paused && !progress.active
            isRecoveredActiveDownload.value = progress.active
            activeDownloadAction.value = "game"
        }
        return
    }
    if (needUpdate.value && versionList.value) {
        const files = Object.entries(versionList.value.gameVersionList.GameVersionList["1"].GameVersionList)
        for (const [index, [filename, assets]] of files.entries()) {
            const fullFilePath = `${tempDownloadDir.value}${filename}`
            const progress = await getDownloadProgress(fullFilePath)
            if (!progress.hasProgressFile) continue
            const previousFilesSize = files.slice(0, index).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
            await gameUpdateStore.prepareCurrentDownloadFile(
                fullFilePath,
                filename,
                assets.ZipSize,
                previousFilesSize,
                totalSize.value,
                getGameAssetUrl(filename, activeChannel, versionList.value.subVersion)
            )
            isDownloading.value = progress.active
            isPauseRequested.value = progress.active && progress.paused
            isDownloadPaused.value = progress.paused && !progress.active
            isRecoveredActiveDownload.value = progress.active
            activeDownloadAction.value = "game"
            return
        }
    }

    if (needPreDownload.value && preFullPackageInfo.value) {
        const fullFilePath = `${fullPackageDownloadDir.value}${preFullPackageInfo.value.fileName}`
        const progress = await getDownloadProgress(fullFilePath)
        if (progress.hasProgressFile) {
            await gameUpdateStore.prepareCurrentDownloadFile(
                fullFilePath,
                preFullPackageInfo.value.fileName,
                preFullPackageInfo.value.size,
                0,
                preFullPackageInfo.value.size,
                preFullPackageInfo.value.downloadUrl
            )
            isDownloading.value = progress.active
            isPauseRequested.value = progress.active && progress.paused
            isDownloadPaused.value = progress.paused && !progress.active
            isRecoveredActiveDownload.value = progress.active
            activeDownloadAction.value = "pre"
        }
        return
    }

    if (needPreDownload.value && versionList.value?.preVersionList) {
        const files = Object.entries(versionList.value.preVersionList.GameVersionList["1"].GameVersionList)
        const totalSizeVal = files.reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
        for (const [index, [filename, assets]] of files.entries()) {
            const fullFilePath = `${tempPreDownloadDir.value}${filename}`
            const progress = await getDownloadProgress(fullFilePath)
            if (!progress.hasProgressFile) continue
            const previousFilesSize = files.slice(0, index).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
            await gameUpdateStore.prepareCurrentDownloadFile(
                fullFilePath,
                filename,
                assets.ZipSize,
                previousFilesSize,
                totalSizeVal,
                getGameAssetUrl(filename, activeChannel, versionList.value.preVersion!)
            )
            isDownloading.value = progress.active
            isPauseRequested.value = progress.active && progress.paused
            isDownloadPaused.value = progress.paused && !progress.active
            isRecoveredActiveDownload.value = progress.active
            activeDownloadAction.value = "pre"
            return
        }
    }

    if (needHotUpdate.value && hotUpdatePendingVersions.value.length) {
        await gameUpdateStore.loadOptionalPatchSignsCache()
        const downloadedOptionalSigns = gameUpdateStore.getDownloadedOptionalSigns()
        let completedBytes = 0
        for (const patchVersion of hotUpdatePendingVersions.value) {
            const content = await readTextFile(`${gameUpdateStore.getHotUpdateVersionDir(patchVersion)}PakFilesInfo.json`).catch(() => "")
            if (!content) continue
            const pakInfo = normalizeHotUpdatePakFilesInfo(JSON.parse(content))
            const files = gameUpdateStore.getHotUpdateFilesToDownload(pakInfo, downloadedOptionalSigns)
            const totalSizeVal = hotUpdateSize.value
            for (const file of files) {
                const fullFilePath = `${gameUpdateStore.getHotUpdateVersionDir(patchVersion)}${file.fileName}`
                const progress = await getDownloadProgress(fullFilePath)
                if (!progress.hasProgressFile) {
                    completedBytes += file.fileSize
                    continue
                }
                await gameUpdateStore.prepareCurrentDownloadFile(
                    fullFilePath,
                    file.fileName,
                    file.fileSize,
                    completedBytes,
                    totalSizeVal,
                    gameUpdateStore.getHotUpdateAssetUrl(file.fileName, activeChannel, patchVersion)
                )
                isDownloading.value = progress.active
                isPauseRequested.value = progress.active && progress.paused
                isDownloadPaused.value = progress.paused && !progress.active
                isRecoveredActiveDownload.value = progress.active
                activeDownloadAction.value = "hot"
                return
            }
        }
    }
}

/**
 * 打开热更详情弹窗。
 */
async function openHotUpdateDetail() {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) return
    const versions = hotUpdatePendingVersions.value.length
        ? hotUpdatePendingVersions.value
        : hotUpdateVersionListCache.value
          ? gameUpdateStore.getSortedHotUpdateVersions(hotUpdateVersionListCache.value).map(version => version.patchVersion)
          : []
    const entries: Array<{ version: number; files: string[] }> = []
    for (const version of versions) {
        try {
            let pakInfo: HotUpdatePakFilesInfoRes
            const localContent = await readTextFile(`${gameUpdateStore.getHotUpdateVersionDir(version)}PakFilesInfo.json`).catch(() => "")
            if (localContent) {
                pakInfo = normalizeHotUpdatePakFilesInfo(JSON.parse(localContent))
            } else {
                pakInfo = normalizeHotUpdatePakFilesInfo(await getHotUpdatePakFilesInfo(gameUpdateStore.selectedCDN, activeChannel, version))
            }
            entries.push({
                version,
                files: (pakInfo.pakFilesMap.WindowsNoEditor?.pakFileInfos ?? []).map(file => file.fileName),
            })
        } catch (error) {
            console.error("读取热更详情失败:", error)
        }
    }
    hotUpdateDetailEntries.value = entries
    hotUpdateDetailOpen.value = true
}

async function updateBaseVersionFile() {
    if (!gamePath.value || !versionList.value) return
    try {
        const localVersionList = toLocalBaseVersionFormat(versionList.value.gameVersionList.GameVersionList["1"].GameVersionList)
        const content = JSON.stringify(localVersionList, null, 2)
        await writeTextFile(baseVersionPath.value, content)
        const gameVersion = Number(versionList.value.subVersion)
        if (!Number.isSafeInteger(gameVersion) || gameVersion <= 0) {
            throw new Error(`Invalid game version: ${versionList.value.subVersion}`)
        }
        await writeTextFile(gameVersionPath.value, JSON.stringify({ version: gameVersion }, null, 2))
        await refreshGameInstalled()
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
            gameUpdateStore.saveChannelGamePath(emExePath)
            await refreshGameInstalled()
            ui.showSuccessMessage(`游戏目录设置成功: ${emExePath}`)
            if (versionList.value || fullPackageInfo.value) {
                await checkForUpdates()
            }
        }
    } catch (err) {
        ui.showErrorMessage(t("game-update.select_dir_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("选择目录失败:", err)
    }
}

/**
 * 下载、校验并应用新版完整 hdiff 游戏包。
 */
async function downloadAndApplyFullPackage() {
    const packageInfo = fullPackageInfo.value
    if (!packageInfo || !gamePath.value) return

    const fullFilePath = `${fullPackageDownloadDir.value}${packageInfo.fileName}`
    const progressFilePath = `${fullFilePath}.progress`
    isDownloading.value = true
    activeDownloadAction.value = "game"
    activeOptionalSign.value = ""
    isRecoveredActiveDownload.value = false
    isDownloadPaused.value = false
    isPauseRequested.value = false
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    gameUpdateStore.resetSpeedBaseline()

    try {
        await gameUpdateStore.prepareCurrentDownloadFile(
            fullFilePath,
            packageInfo.fileName,
            packageInfo.size,
            0,
            packageInfo.size,
            packageInfo.downloadUrl
        )
        const isPackageComplete = await gameUpdateStore.canSkipBeforeHashCheck(fullFilePath, progressFilePath, packageInfo.size)
        if (!isPackageComplete) {
            await downloadFullPackage(packageInfo, fullFilePath, concurrentThreads.value)
        }
        gameUpdateStore.throwIfPauseRequested()

        isDownloading.value = false
        isExtracting.value = true
        startExtractionProgress()
        currentFile.value = packageInfo.fileName
        currentFileUrl.value = packageInfo.downloadUrl
        currentDownloaded.value = packageInfo.size
        downloadSpeed.value = ""
        await applyGamePatch(fullFilePath, extractDir.value)
        stopExtractionProgress(true)
        const gameVersion = Number(packageInfo.latestVersion)
        if (!Number.isSafeInteger(gameVersion) || gameVersion <= 0) {
            throw new Error(`Invalid game version: ${packageInfo.latestVersion}`)
        }
        await writeTextFile(gameVersionPath.value, JSON.stringify({ version: gameVersion }, null, 2))
        await deleteFile(fullFilePath, true)

        currentFile.value = ""
        currentFileUrl.value = ""
        currentDownloadPath.value = ""
        await refreshGameInstalled()
        ui.showSuccessMessage(t("game-update.download_complete", { size: gameUpdateStore.formatSize(packageInfo.size) }))
        await checkForUpdates()
        resetExtractionState()
        if (needHotUpdate.value && hotUpdatePendingVersions.value.length) {
            await gameUpdateStore.downloadHotUpdate()
        }
    } catch (err) {
        resetExtractionState()
        if (isDownloadPausedError(err)) {
            gameUpdateStore.markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            gameUpdateStore.markDownloadAlreadyActive()
            return
        }
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("完整包下载或应用失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

async function downloadAllFiles() {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) {
        ui.showErrorMessage("请先填写自定义 channel")
        return
    }
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }
    if (fullPackageInfo.value) {
        await downloadAndApplyFullPackage()
        return
    }
    const currentVersionList = versionList.value
    if (!currentVersionList) {
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
        } catch {}
    }
    isDownloading.value = true
    activeDownloadAction.value = "game"
    activeOptionalSign.value = ""
    isRecoveredActiveDownload.value = false
    isDownloadPaused.value = false
    isPauseRequested.value = false
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    gameUpdateStore.resetSpeedBaseline()
    try {
        const gameVersionList = currentVersionList.gameVersionList.GameVersionList["1"].GameVersionList
        const files = Object.entries(gameVersionList)
        const filesToDownload = [...files]
        const pendingHashChecks: Array<() => Promise<void>> = []
        const runningHashChecks: Promise<void>[] = []
        activeDownloadTotal.value = totalSize.value
        let queueIndex = 0
        while (queueIndex < filesToDownload.length || pendingHashChecks.length || runningHashChecks.length) {
            gameUpdateStore.throwIfPauseRequested()
            if (queueIndex >= filesToDownload.length) {
                gameUpdateStore.startPendingHashChecks(pendingHashChecks, runningHashChecks)
                if (runningHashChecks.length > 0) {
                    await Promise.all(runningHashChecks.splice(0))
                }
                continue
            }
            const [filename, assets] = filesToDownload[queueIndex]
            queueIndex++
            const fullFilePath = `${tempDownloadDir.value}${filename}`
            const progressFilePath = `${fullFilePath}.progress`
            const fileIndex = files.findIndex(([name]) => name === filename)
            const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
            await gameUpdateStore.prepareCurrentDownloadFile(
                fullFilePath,
                filename,
                assets.ZipSize,
                previousFilesSize,
                totalSize.value,
                getGameAssetUrl(filename, activeChannel, currentVersionList.subVersion)
            )
            if (await gameUpdateStore.canSkipBeforeHashCheck(fullFilePath, progressFilePath, assets.ZipSize)) {
                pendingHashChecks.push(() =>
                    gameUpdateStore.queueExistingFileHashCheck(fullFilePath, assets.ZipSize, assets.ZipMd5, filesToDownload, [
                        filename,
                        assets,
                    ])
                )
                console.debug(`文件 ${filename} 已存在且大小匹配，跳过下载`)
                const totalDownloaded = previousFilesSize + assets.ZipSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / totalSize.value
                fileProgress.value = 1
                currentFileDownloaded.value = gameUpdateStore.formatSize(assets.ZipSize)
                currentFileTotal.value = gameUpdateStore.formatSize(assets.ZipSize)
                continue
            }
            const downloadTask = downloadAssets(
                gameUpdateStore.selectedCDN,
                filename,
                activeChannel,
                currentVersionList.subVersion,
                concurrentThreads.value,
                undefined,
                tempDownloadDir.value
            )
            gameUpdateStore.startPendingHashChecks(pendingHashChecks, runningHashChecks)
            await downloadTask
        }
        isDownloading.value = false
        currentFile.value = ""
        currentFileUrl.value = ""
        downloadSpeed.value = ""
        if (!(await extractAllFiles())) return
        await updateBaseVersionFile()
        await checkForUpdates()
        resetExtractionState()
        if (needHotUpdate.value && hotUpdatePendingVersions.value.length) {
            await gameUpdateStore.downloadHotUpdate()
        }
    } catch (err) {
        if (isExtracting.value) {
            resetExtractionState()
        }
        if (isDownloadPausedError(err)) {
            gameUpdateStore.markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            gameUpdateStore.markDownloadAlreadyActive()
            return
        }
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("下载失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

/**
 * 下载并校验新版预下载完整包，保留文件供正式版本直接复用。
 */
async function preDownloadFullPackage() {
    const packageInfo = preFullPackageInfo.value
    if (!packageInfo || !gamePath.value) return

    const fullFilePath = `${fullPackageDownloadDir.value}${packageInfo.fileName}`
    const progressFilePath = `${fullFilePath}.progress`
    isDownloading.value = true
    activeDownloadAction.value = "pre"
    activeOptionalSign.value = ""
    isRecoveredActiveDownload.value = false
    isDownloadPaused.value = false
    isPauseRequested.value = false
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    gameUpdateStore.resetSpeedBaseline()

    try {
        await gameUpdateStore.prepareCurrentDownloadFile(
            fullFilePath,
            packageInfo.fileName,
            packageInfo.size,
            0,
            packageInfo.size,
            packageInfo.downloadUrl
        )
        const isPackageComplete = await gameUpdateStore.canSkipBeforeHashCheck(fullFilePath, progressFilePath, packageInfo.size)
        if (!isPackageComplete) {
            await downloadFullPackage(packageInfo, fullFilePath, concurrentThreads.value)
        }
        gameUpdateStore.throwIfPauseRequested()

        isDownloading.value = false
        needPreDownload.value = false
        currentFile.value = ""
        currentFileUrl.value = ""
        currentDownloadPath.value = ""
        currentDownloaded.value = packageInfo.size
        overallProgress.value = 0
        downloadSpeed.value = ""
        ui.showSuccessMessage(t("game-update.pre_download_complete", { size: gameUpdateStore.formatSize(packageInfo.size) }))
    } catch (err) {
        if (isDownloadPausedError(err)) {
            gameUpdateStore.markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            gameUpdateStore.markDownloadAlreadyActive()
            return
        }
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("预下载完整包失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

async function preDownloadAllFiles() {
    const activeChannel = gameUpdateStore.getActiveChannel()
    if (!activeChannel) {
        ui.showErrorMessage("请先填写自定义 channel")
        return
    }
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }
    if (preFullPackageInfo.value) {
        await preDownloadFullPackage()
        return
    }
    if (!versionList.value || !versionList.value.preVersion || !versionList.value.preVersionList) {
        ui.showErrorMessage(t("game-update.no_pre_download_available"))
        return
    }
    isDownloading.value = true
    activeDownloadAction.value = "pre"
    activeOptionalSign.value = ""
    isRecoveredActiveDownload.value = false
    isDownloadPaused.value = false
    isPauseRequested.value = false
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    gameUpdateStore.resetSpeedBaseline()
    try {
        const preVersionList = versionList.value.preVersionList.GameVersionList["1"].GameVersionList
        const files = Object.entries(preVersionList)
        let preTotalSizeVal = 0
        for (const [, assets] of files) {
            preTotalSizeVal += assets.ZipSize
        }
        const filesToDownload = [...files]
        const pendingHashChecks: Array<() => Promise<void>> = []
        const runningHashChecks: Promise<void>[] = []
        activeDownloadTotal.value = preTotalSizeVal
        let queueIndex = 0
        while (queueIndex < filesToDownload.length || pendingHashChecks.length || runningHashChecks.length) {
            gameUpdateStore.throwIfPauseRequested()
            if (queueIndex >= filesToDownload.length) {
                gameUpdateStore.startPendingHashChecks(pendingHashChecks, runningHashChecks)
                if (runningHashChecks.length > 0) {
                    await Promise.all(runningHashChecks.splice(0))
                }
                continue
            }
            const [filename, assets] = filesToDownload[queueIndex]
            queueIndex++
            const fullFilePath = `${tempPreDownloadDir.value}${filename}`
            const progressFilePath = `${fullFilePath}.progress`
            const fileIndex = files.findIndex(([name]) => name === filename)
            const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
            await gameUpdateStore.prepareCurrentDownloadFile(
                fullFilePath,
                filename,
                assets.ZipSize,
                previousFilesSize,
                preTotalSizeVal,
                getGameAssetUrl(filename, activeChannel, versionList.value.preVersion!)
            )
            if (await gameUpdateStore.canSkipBeforeHashCheck(fullFilePath, progressFilePath, assets.ZipSize)) {
                pendingHashChecks.push(() =>
                    gameUpdateStore.queueExistingFileHashCheck(fullFilePath, assets.ZipSize, assets.ZipMd5, filesToDownload, [
                        filename,
                        assets,
                    ])
                )
                console.debug(`预下载文件 ${filename} 已存在且大小匹配，跳过下载`)
                const totalDownloaded = previousFilesSize + assets.ZipSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / preTotalSizeVal
                fileProgress.value = 1
                currentFileDownloaded.value = gameUpdateStore.formatSize(assets.ZipSize)
                currentFileTotal.value = gameUpdateStore.formatSize(assets.ZipSize)
                continue
            }
            const downloadTask = downloadAssets(
                gameUpdateStore.selectedCDN,
                filename,
                activeChannel,
                versionList.value.preVersion!,
                concurrentThreads.value,
                undefined,
                tempPreDownloadDir.value
            )
            gameUpdateStore.startPendingHashChecks(pendingHashChecks, runningHashChecks)
            await downloadTask
        }
        isDownloading.value = false
        currentFile.value = ""
        currentFileUrl.value = ""
        downloadSpeed.value = ""
        await checkPreDownloadStatus()
        ui.showSuccessMessage(t("game-update.pre_download_complete", { size: gameUpdateStore.formatSize(preTotalSizeVal) }))
    } catch (err) {
        if (isDownloadPausedError(err)) {
            gameUpdateStore.markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            gameUpdateStore.markDownloadAlreadyActive()
            return
        }
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("预下载失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

/**
 * 下载热更补丁文件。
 */
/**
 * 解压全部游戏资源并保留完成态，供调用方无缝衔接热更检查。
 * @returns 是否成功完成解压
 */
async function extractAllFiles() {
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return false
    }
    if (!versionList.value) {
        ui.showErrorMessage(t("game-update.version_list_not_loaded"))
        return false
    }
    isExtracting.value = true
    startExtractionProgress()
    try {
        const gameVersionList = versionList.value.gameVersionList.GameVersionList["1"].GameVersionList
        const files = Object.entries(gameVersionList)
        const totalFilesCount = files.length
        await writeTextFile(
            extractProgressPath.value,
            JSON.stringify(
                {
                    totalFiles: totalFilesCount,
                    currentIndex: 0,
                    currentFile: "",
                },
                null,
                2
            )
        )
        for (let i = 0; i < files.length; i++) {
            const [filename] = files[i]
            const zipPath = `${tempDownloadDir.value}/${filename}`
            const targetDir = extractDir.value
            await writeTextFile(
                extractProgressPath.value,
                JSON.stringify(
                    {
                        totalFiles: totalFilesCount,
                        currentIndex: i,
                        currentFile: filename,
                    },
                    null,
                    2
                )
            )
            await extractGameAssets(zipPath, targetDir)
        }
        if (tempDownloadDir.value) {
            try {
                await cleanupTempDir(tempDownloadDir.value)
            } catch (err) {
                console.error("临时目录清理失败:", err)
            }
        }
        stopExtractionProgress(true)
        await deleteFile(extractProgressPath.value, true)
        await refreshGameInstalled()
        ui.showSuccessMessage(t("game-update.download_complete", { size: gameUpdateStore.formatSize(totalSize.value) }))
        return true
    } catch (err) {
        ui.showErrorMessage(t("game-update.extract_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("解压缩失败:", err)
        resetExtractionState()
        return false
    }
}

onMounted(async () => {
    await fetchVersionList()
    await checkForUpdates()
    const unlistenDownload = await listen<DownloadProgress>("download_progress", event => {
        if (!currentDownloadPath.value || event.payload.filename !== currentDownloadPath.value) return
        const progress = event.payload
        fileProgress.value = progress.total > 0 ? progress.downloaded / progress.total : 0
        currentFileDownloaded.value = gameUpdateStore.formatSize(progress.downloaded)
        currentFileTotal.value = gameUpdateStore.formatSize(progress.total)
        const totalDownloaded = activeDownloadCompletedBefore.value + progress.downloaded
        currentDownloaded.value = totalDownloaded
        overallProgress.value = activeDownloadTotal.value > 0 ? totalDownloaded / activeDownloadTotal.value : 0
        downloadSpeed.value = gameUpdateStore.calculateDownloadSpeed(totalDownloaded)
        if (progress.total > 0 && progress.downloaded >= progress.total && isRecoveredActiveDownload.value) {
            isDownloading.value = false
            isRecoveredActiveDownload.value = false
            void checkForUpdates()
        }
    })
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
        stopExtractionProgress(false)
        unlistenDownload()
        unlisten()
    })
})
const launchGame = async () => {
    if (!gameInstalled.value) {
        ui.showErrorMessage(t("game-launcher.selectGamePathFirst"))
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
        <video
            src="http://cdn.dna-builder.cn/bg.mp4"
            muted
            autoplay
            loop
            class="absolute top-0 left-0 w-full h-full object-cover pointer-events-none opacity-80"
        ></video>
        <div class="flex flex-col h-full p-8 max-w-7xl mx-auto gap-8">
            <!-- 顶部 HUD：服务器配置 -->
            <header
                class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-base-300/20 backdrop-blur-md rounded-2xl p-4 border border-base-content/5 shadow-xl transition-all duration-200 hover:border-base-content/10"
            >
                <div class="flex items-center gap-3">
                    <img src="/setup-icon.webp" alt="LOGO" class="h-8" />
                    <h1 class="text-2xl font-semibold">{{ t("game-update.game") }}</h1>
                </div>

                <!-- 配置区域 -->
                <div class="flex flex-wrap items-center gap-3">
                    <div class="group relative">
                        <div
                            class="flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors duration-200 cursor-pointer"
                        >
                            <Icon icon="ri:server-line" class="text-base-content/40 w-4 h-4" />
                            <input
                                v-if="!setting.safeMode && gameUpdateStore.selectedChannel === gameUpdateStore.CUSTOM_CHANNEL_VALUE"
                                v-model.lazy="gameUpdateStore.customChannel"
                                type="text"
                                class="bg-transparent border-none outline-hidden text-sm min-w-36 placeholder:text-base-content/30"
                                placeholder="自定义 channel"
                            />
                            <Select v-model="gameUpdateStore.selectedChannel" variant="ghost" class="min-w-20">
                                <SelectItem v-for="channel in channels" :key="channel.value" :value="channel.value" xs>
                                    {{ channel.name }}
                                </SelectItem>
                                <SelectItem v-if="!setting.safeMode" :value="gameUpdateStore.CUSTOM_CHANNEL_VALUE" xs>自定义</SelectItem>
                            </Select>
                        </div>
                    </div>

                    <div class="group relative">
                        <div
                            class="flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors duration-200 cursor-pointer"
                        >
                            <Icon icon="ri:cloud-line" class="text-base-content/40 w-4 h-4" />
                            <Select v-model="gameUpdateStore.selectedCDN" variant="ghost" class="min-w-20 truncate">
                                <SelectItem v-for="cdn in gameUpdateStore.availableCDN" :key="cdn.url" :value="cdn.url">
                                    {{ cdn.name }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>

                    <div class="tooltip" data-tip="自定义 channel 时不限制 CDN（内容可能位于任意节点）">
                        <div
                            class="group relative flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors duration-200"
                            :title="t('game-update.threads')"
                        >
                            <Icon icon="ri:speed-line" class="text-base-content/40 w-4 h-4" />
                            <input
                                v-model.number="concurrentThreads"
                                type="number"
                                class="bg-transparent border-none outline-hidden text-sm w-8 text-center"
                                min="1"
                                max="32"
                            />
                        </div>
                    </div>

                    <label
                        class="group relative flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors duration-200 cursor-pointer"
                    >
                        <input v-model="showOptionalVoicePacks" type="checkbox" class="checkbox checkbox-xs" />
                        <span class="text-sm">语音包</span>
                    </label>
                </div>
            </header>
            <div class="flex-1"></div>
            <!-- 核心区域 -->
            <main class="flex-1 flex flex-col justify-end pb-8 gap-6">
                <!-- 状态指示 & 信息卡片 -->
                <div v-if="versionList || fullPackageInfo" class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <!-- 目录设置卡片 -->
                    <div
                        class="md:col-span-2 bg-base-300/40 backdrop-blur-sm border border-base-content/10 rounded-2xl p-5 hover:bg-base-300/50 transition-colors duration-200 group"
                    >
                        <div class="flex justify-between items-center mb-3">
                            <span class="opacity-60 text-xs font-bold uppercase tracking-wider">{{ t("game-update.install_path") }}</span>
                            <button
                                @click="selectGameDir"
                                class="text-primary hover:text-base-content text-xs flex items-center gap-1 transition-colors duration-200"
                            >
                                <Icon icon="ri:folder-line" /> {{ t("game-update.change") }}
                            </button>
                        </div>
                        <div
                            class="text-sm font-mono truncate opacity-80 group-hover:text-base-content transition-colors duration-200"
                            :title="gamePath"
                        >
                            {{ gamePath || t("game-update.no_path_selected") }}
                        </div>
                        <div class="mt-2 h-1 w-full bg-base-content/5 rounded-full overflow-hidden">
                            <div class="h-full bg-primary/50 w-full" v-if="gamePath"></div>
                        </div>
                    </div>

                    <!-- 版本信息 -->
                    <div
                        class="relative bg-base-300/40 backdrop-blur-sm border border-base-content/10 rounded-2xl p-5 flex flex-col justify-between"
                    >
                        <button
                            class="absolute top-3 right-3 btn btn-ghost btn-xs btn-circle"
                            :disabled="!hotUpdateVersionListCache && !hotUpdatePendingVersions.length"
                            @click="openHotUpdateDetail()"
                        >
                            <Icon icon="ri:file-list-line" class="w-4 h-4" />
                        </button>
                        <span class="text-base-content/40 text-xs font-bold uppercase tracking-wider">{{ t("game-update.version") }}</span>
                        <div class="flex items-end gap-2">
                            <span class="text-2xl font-bold font-mono">{{
                                fullPackageInfo?.latestVersion ?? versionList?.subVersion
                            }}</span>
                            <span class="text-xs mb-1 px-1.5 py-0.5 rounded bg-base-content/10 opacity-80" v-if="needUpdate">{{
                                t("game-update.old_version")
                            }}</span>
                            <span class="text-xs mb-1 px-1.5 py-0.5 rounded bg-success/20 text-success" v-else>{{
                                t("game-update.latest_version")
                            }}</span>
                        </div>
                    </div>

                    <!-- 大小信息 -->
                    <div
                        class="bg-base-300/40 backdrop-blur-sm border border-base-content/10 rounded-2xl p-5 flex flex-col justify-between"
                    >
                        <span class="opacity-60 text-xs font-bold uppercase tracking-wider">{{ t("game-update.size") }}</span>
                        <div class="flex items-end gap-2">
                            <span class="text-2xl font-bold text-secondary">{{ gameUpdateStore.formatSize(displayDownloadSize) }}</span>
                            <span class="text-xs opacity-80 mb-1.5">{{ displayDownloadFileCount }} {{ t("game-update.files") }}</span>
                        </div>
                    </div>
                </div>

                <!-- 预下载通知条 -->
                <div
                    v-if="needPreDownload && (versionList || preFullPackageInfo)"
                    class="bg-linear-to-r from-info/20 to-transparent border-l-4 border-info backdrop-blur-sm p-4 rounded-r-xl flex items-center justify-between animate-in slide-in-from-left-4 fade-in duration-500"
                >
                    <div class="flex items-center gap-3">
                        <div class="p-2 rounded-full bg-info/20">
                            <Icon icon="ri:download-cloud-2-line" class="w-5 h-5 text-info" />
                        </div>
                        <div>
                            <h3 class="font-bold text-base-content text-sm">{{ t("game-update.pre_download_available") }}</h3>
                            <p class="text-xs text-info/80">
                                {{
                                    t("game-update.pre_download_size", {
                                        version: preFullPackageInfo?.latestVersion ?? versionList?.preVersion,
                                        size: gameUpdateStore.formatSize(preTotalSize),
                                    })
                                }}
                            </p>
                        </div>
                    </div>
                    <button
                        @click="preDownloadAllFiles()"
                        :disabled="isDownloading || isExtracting"
                        class="px-4 py-2 bg-info hover:bg-info/80 text-base-content text-xs font-bold uppercase tracking-wide rounded-lg transition-all duration-200 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {{ isDownloading ? t("game-update.downloading") : t("game-update.start_pre_download") }}
                    </button>
                </div>

                <!-- 语音包列表 -->
                <div
                    v-if="showOptionalVoicePacks && optionalPackEntries.length"
                    class="bg-base-300/40 backdrop-blur-sm border border-base-content/10 rounded-2xl p-4 space-y-3"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold uppercase tracking-wider opacity-60">语音包</span>
                        <span class="text-xs opacity-50">本地缓存</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div
                            v-for="pack in optionalPackEntries"
                            :key="pack.sign"
                            class="flex items-center justify-between gap-3 rounded-xl border border-base-content/10 bg-base-100/30 px-4 py-3"
                        >
                            <div class="min-w-0">
                                <div class="text-sm font-medium">{{ getOptionalPackLabel(pack.sign) }}</div>
                                <div class="text-xs opacity-50 truncate">{{ pack.sign }} · {{ pack.version }}</div>
                            </div>
                            <button
                                v-if="!isOptionalPackDownloaded(pack.sign, pack.version)"
                                @click="downloadOptionalPack(pack.sign)"
                                :disabled="isOptionalPackQueued(pack.sign)"
                                class="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-50"
                            >
                                {{
                                    downloadingOptionalSign === pack.sign
                                        ? "下载中"
                                        : optionalPackDownloadQueue.includes(pack.sign)
                                          ? "排队中"
                                          : "下载"
                                }}
                            </button>
                            <span v-else class="text-xs text-success">已下载</span>
                        </div>
                    </div>
                </div>

                <!-- 进度面板 (下载/解压时显示) -->
                <div
                    v-if="isDownloading || isExtracting || isDownloadPaused"
                    class="space-y-3 bg-base-300/60 backdrop-blur-2xl rounded-2xl p-6 border border-base-content/10 shadow-2xl animate-in slide-in-from-bottom-4"
                >
                    <div class="flex justify-between items-end">
                        <div>
                            <h2 class="text-xl font-bold text-base-content flex items-center gap-2">
                                <Icon v-if="isDownloading || isDownloadPaused" icon="ri:download-2-line" class="animate-bounce" />
                                <Icon v-else icon="ri:install-line" class="animate-pulse" />
                                {{ isExtracting ? t("game-update.extracting_resources") : t("game-update.downloading_resources") }}
                            </h2>
                            <p class="text-xs text-base-content/40 font-mono mt-1">
                                <span v-if="isExtracting">{{ extractionCurrentFile }}</span>
                                <a
                                    v-else-if="currentFileUrl"
                                    :href="currentFileUrl"
                                    target="_blank"
                                    rel="noreferrer"
                                    class="hover:underline"
                                >
                                    {{ currentFile }}
                                </a>
                                <span v-else>{{ currentFile }}</span>
                            </p>
                        </div>
                        <div class="text-right">
                            <div class="text-3xl font-black font-mono text-transparent bg-clip-text bg-linear-to-r from-white to-gray-400">
                                {{ displayOverallProgressPercent }}<span class="text-lg">%</span>
                            </div>
                            <div class="text-xs font-mono text-primary" v-if="isDownloading">
                                {{ downloadSpeed }}
                            </div>
                            <div class="text-xs font-mono text-warning" v-else-if="isDownloadPaused">已暂停</div>
                        </div>
                    </div>

                    <!-- 总进度条 -->
                    <div class="h-4 bg-gray-900 rounded-full overflow-hidden border border-base-content/5 relative">
                        <!-- 动态条纹背景 -->
                        <div
                            class="absolute inset-0 w-full h-full opacity-10 bg-size-[20px_20px] bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#fff_10px,#fff_20px)] animate-[move-bg_1s_linear_infinite]"
                        ></div>
                        <div
                            class="h-full bg-linear-to-r from-primary via-secondary to-primary bg-size-[200%_100%] animate-[shimmer_2s_linear_infinite] shadow-[0_0_20px_rgba(var(--primary),0.5)] transition-all duration-300 ease-out"
                            :style="{ width: `${overallProgress * 100}%` }"
                        ></div>
                    </div>

                    <!-- 详细数据行 -->
                    <div class="flex justify-between text-xs text-gray-500 font-mono pt-1">
                        <span>
                            {{
                                isDownloading || isDownloadPaused
                                    ? `${gameUpdateStore.formatSize(currentDownloaded)} / ${gameUpdateStore.formatSize(activeDownloadTotal)}`
                                    : `${extractionCurrentFileCount} / ${extractionTotalFiles} Files`
                            }}
                        </span>
                        <span v-if="isDownloading || isDownloadPaused">
                            {{ currentFileDownloaded }} / {{ currentFileTotal }} ({{ t("game-update.current_file") }})
                        </span>
                    </div>
                    <div v-if="isDownloading || isDownloadPaused" class="flex justify-end gap-2">
                        <button
                            v-if="isDownloading && !isPauseRequested"
                            @click="gameUpdateStore.pauseCurrentDownload()"
                            class="px-4 py-2 rounded-lg bg-warning text-warning-content text-xs font-semibold"
                        >
                            暂停
                        </button>
                        <button
                            v-else-if="isDownloading && isPauseRequested"
                            disabled
                            class="px-4 py-2 rounded-lg bg-warning text-warning-content text-xs font-semibold opacity-60"
                        >
                            暂停中
                        </button>
                        <button
                            v-else
                            @click="resumeCurrentDownload()"
                            class="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold"
                        >
                            继续
                        </button>
                    </div>
                </div>

                <!-- 底部主操作按钮 -->
                <div v-else class="flex gap-4 items-center">
                    <div
                        v-if="!gamePath"
                        class="w-full text-center py-8 text-gray-500 font-mono border-2 border-dashed border-base-content/10 rounded-2xl"
                    >
                        {{ t("game-update.select_game_dir_first") }}
                    </div>

                    <button
                        v-else
                        @click="needUpdate ? downloadAllFiles() : needHotUpdate ? gameUpdateStore.downloadHotUpdate() : launchGame()"
                        :disabled="!hasUpdate && !gamePath"
                        class="group relative w-full h-20 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 shadow-xl"
                        :class="
                            hasUpdate
                                ? 'bg-primary hover:shadow-[0_0_40px_rgba(var(--primary),0.6)]'
                                : 'bg-base-200/40 backdrop-blur-sm border border-base-content/10 cursor-default'
                        "
                    >
                        <!-- 按钮背景特效 -->
                        <div
                            v-if="hasUpdate"
                            class="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"
                        ></div>

                        <div class="relative z-10 flex flex-col items-center justify-center h-full gap-1">
                            <div class="flex items-center gap-3" :class="hasUpdate ? 'text-white' : 'text-white/40'">
                                <Icon :icon="hasUpdate ? 'ri:download-fill' : 'ri:play-fill'" class="w-8 h-8" />
                                <span class="text-2xl font-black tracking-widest uppercase">
                                    {{ hasUpdate ? t("game-update.update_game") : t("game-update.game_ready") }}
                                </span>
                            </div>
                            <span v-if="hasUpdate" class="text-xs text-white/80 bg-white/20 px-2 py-0.5 rounded">
                                {{
                                    t("game-update.update_size", {
                                        size: gameUpdateStore.formatSize(needUpdate ? updateSize : hotUpdateSize),
                                    })
                                }}
                            </span>
                        </div>
                    </button>
                </div>
            </main>
        </div>
    </div>
    <dialog class="modal" :class="{ 'modal-open': hotUpdateDetailOpen }" @click="hotUpdateDetailOpen = false">
        <div class="modal-box bg-base-100 w-[80%] min-w-72 max-w-160" @click.stop>
            <div class="text-center">
                <h3 class="text-xl font-bold">热更详情</h3>
            </div>
            <div class="max-h-96 overflow-y-auto py-4">
                <div v-if="hotUpdateDetailEntries.length" class="space-y-4">
                    <div v-for="entry in hotUpdateDetailEntries" :key="entry.version" class="bg-base-200 p-4 rounded-lg">
                        <div class="font-bold text-primary">
                            {{ entry.version }}
                        </div>
                        <div class="text-sm text-base-content/80 mt-1">
                            <ul class="list-disc list-inside space-y-1">
                                <li v-for="file in entry.files" :key="`${entry.version}-${file}`" class="break-all">
                                    {{ file }}
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div v-else class="text-center text-gray-500">暂无热更</div>
            </div>
            <div class="modal-action justify-center">
                <button class="btn btn-primary" @click="hotUpdateDetailOpen = false">关闭</button>
            </div>
        </div>
        <div class="modal-backdrop" @click="hotUpdateDetailOpen = false" />
    </dialog>
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
