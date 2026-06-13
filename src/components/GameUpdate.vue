<script setup lang="ts">
import { listen } from "@tauri-apps/api/event"
import * as dialog from "@tauri-apps/plugin-dialog"
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import {
    cleanupTempDir,
    deleteFile,
    extractGameAssets,
    getFileSize,
    listDirectories,
    listFiles,
    pathExists,
    readTextFile,
    renameFile,
    writeTextFile,
} from "../api/app"
import { useGameStore } from "../store/game"
import {
    CDN_LIST,
    compareGameVersions,
    type DownloadProgress,
    downloadAssets,
    downloadHotUpdateAssets,
    type GameVersionListWithPre,
    getBaseVersion,
    getDownloadProgress,
    getHotUpdatePakFilesInfo,
    getHotUpdateResDiscreteInfo,
    getHotUpdateVersionList,
    type HotUpdatePakFileInfo,
    type HotUpdatePakFilesInfoRes,
    type HotUpdateVersionListRes,
    isDownloadAlreadyActiveError,
    isDownloadPausedError,
    isLocalFileMatch,
    normalizeHotUpdatePakFilesInfo,
    normalizeOptionalPatchSigns,
    type OptionalPatchSignsRes,
    pauseDownload,
    resolveLocalVersions,
    toLocalBaseVersionFormat,
    VERSION_URL_PUB,
} from "../utils/game-download"

// 状态管理
const gameStore = useGameStore()
const ui = useUIStore()
const setting = useSettingStore()
const versionList = ref<GameVersionListWithPre | null>(null)
const isLoading = ref(false)
const isDownloading = ref(false)
const isExtracting = ref(false)

// 下载进度相关状态
const totalSize = ref(0)
const totalFiles = ref(0)
const currentDownloaded = ref(0)
const activeDownloadTotal = ref(0)
const activeDownloadCompletedBefore = ref(0)
const overallProgress = ref(0)
const currentFile = ref("")
const currentFileUrl = ref("")
const currentDownloadPath = ref("")
const currentFileDownloaded = ref("")
const currentFileTotal = ref("")
const fileProgress = ref(0)
const downloadSpeed = ref("")
const isDownloadPaused = ref(false)
const isPauseRequested = ref(false)
const isRecoveredActiveDownload = ref(false)
const activeDownloadAction = ref<"game" | "pre" | "hot" | "optional" | "">("")
const activeOptionalSign = ref("")
const concurrentThreads = useLocalStorage("download_threads", 1)

const preTotalSize = ref(0)
const preTotalFiles = ref(0)

// 热更相关状态
const needHotUpdate = ref(false)
const hotUpdateSize = ref(0)
const hotUpdateFiles = ref(0)
const hotUpdateVersionListCache = ref<HotUpdateVersionListRes | null>(null)
const hotUpdatePendingVersions = ref<number[]>([])
const optionalPatchSignsCache = ref<OptionalPatchSignsRes>({ optionalPatchInfos: {} })
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

// 下载速度计算相关
let lastDownloadedBytes = 0
let lastTimestamp = 0

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

const CUSTOM_CHANNEL_VALUE = "__custom_channel__"

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
    //     name: "1.2Beta",
    //     value: "PC_OBT12_Media_CN_Pub",
    // },
    // {
    //     name: "1.3Beta",
    //     value: "PC_OBT13_Media_CN_Pub",
    // },
    {
        name: t("game-update.global_server"),
        value: "PC_OBT_Global_Pub",
    },
]

const selectedChannel = useLocalStorage("selectedChannel", channels[0].value)
const customChannel = useLocalStorage("selectedChannel.custom", "")
const channelGamePathMap = useLocalStorage<Record<string, string>>("game.path_by_channel", {})
const gameInstalled = ref(false)

/**
 * 兼容旧版全局路径存储，首次迁移到当前服务器专属配置。
 */
function migrateLegacyGamePath() {
    const channel = getActiveChannel()
    if (!gameStore.path || !channel || channelGamePathMap.value[channel]) return
    channelGamePathMap.value = {
        ...channelGamePathMap.value,
        [channel]: gameStore.path,
    }
}

/**
 * 切换服务器时同步对应的游戏路径到共享状态。
 */
function syncGamePathByChannel() {
    const channel = getActiveChannel()
    if (!channel) return
    const channelPath = channelGamePathMap.value[channel] ?? ""
    if (gameStore.path !== channelPath) {
        gameStore.path = channelPath
    }
}

/**
 * 将当前服务器的游戏路径写入独立存储。
 */
function saveChannelGamePath(path: string) {
    const channel = getActiveChannel()
    if (!channel || !path || channelGamePathMap.value[channel] === path) return
    channelGamePathMap.value = {
        ...channelGamePathMap.value,
        [channel]: path,
    }
}

/**
 * 刷新当前游戏路径是否真实存在。
 */
async function refreshGameInstalled() {
    gameInstalled.value =
        !!gameStore.path &&
        (await pathExists(gameStore.path)) &&
        (await pathExists(baseVersionPath.value)) &&
        !(await pathExists(extractProgressPath.value))
    gameStore.installed = gameInstalled.value
}

/**
 * 判断当前是否选中了自定义 channel。
 * @returns 是否选中自定义 channel
 */
function isCustomChannelSelected() {
    return selectedChannel.value === CUSTOM_CHANNEL_VALUE
}

/**
 * 获取当前实际生效的 channel。
 * @returns 实际 channel，若自定义未填写则返回空字符串
 */
function getActiveChannel() {
    if (!isCustomChannelSelected()) {
        return selectedChannel.value
    }
    return customChannel.value.trim()
}

migrateLegacyGamePath()
const availableCDN = computed(() => {
    const activeChannel = getActiveChannel()
    if (activeChannel === channels[2].value) {
        return CDN_LIST.filter(cdn => cdn.name === "海外")
    }
    return CDN_LIST.filter(cdn => cdn.name !== "海外")
})

const selectedCDN = useLocalStorage("selectedCDN", CDN_LIST[1].url)

watch(
    selectedChannel,
    () => {
        if (isCustomChannelSelected() && !getActiveChannel()) return
        syncGamePathByChannel()
    },
    { immediate: true }
)

watch(
    () => gameStore.path,
    path => {
        saveChannelGamePath(path)
        void refreshGameInstalled()
    }
)

watch([selectedChannel, customChannel, selectedCDN], async () => {
    const activeChannel = getActiveChannel()
    if (!activeChannel) {
        versionList.value = null
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
    syncGamePathByChannel()
    saveChannelGamePath(gameStore.path)
    await refreshGameInstalled()
    if (!availableCDN.value.find(cdn => cdn.url === selectedCDN.value)) {
        selectedCDN.value = availableCDN.value[0].url
    }
    await fetchVersionList()
    await checkForUpdates()
    await checkHotUpdateStatus()
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
const extractProgressPath = computed(() => {
    if (!gamePath.value) return ""
    return gamePath.value + "\\DNA Game\\.extracting"
})

const hotUpdatePatchRootDir = computed(() => {
    const activeChannel = getActiveChannel()
    if (!gamePath.value || !activeChannel) return ""
    return `${gamePath.value}\\DNA Game\\EM\\EMPatches\\Paks\\CN\\${activeChannel}\\Patch\\`
})

/**
 * 获取热更根目录下的版本目录列表。
 * @returns 排序后的版本号列表
 */
async function listLocalHotUpdateVersions() {
    if (!hotUpdatePatchRootDir.value) return []
    const directories = await listDirectories(hotUpdatePatchRootDir.value)
    return directories
        .map(dir => Number(dir))
        .filter(version => Number.isFinite(version))
        .sort((a, b) => a - b)
}

/**
 * 构建指定热更版本的缓存目录。
 * @param version 版本号
 * @returns 版本目录路径
 */
function getHotUpdateVersionDir(version: number) {
    return `${hotUpdatePatchRootDir.value}${version}\\`
}

/**
 * 读取本地 OptionalPatchSigns.json。
 */
async function loadOptionalPatchSignsCache() {
    if (!hotUpdatePatchRootDir.value) return
    const optionalPatchSignsPath = `${hotUpdatePatchRootDir.value}OptionalPatchSigns.json`
    try {
        const content = await readTextFile(optionalPatchSignsPath)
        optionalPatchSignsCache.value = normalizeOptionalPatchSigns(JSON.parse(content))
    } catch {
        optionalPatchSignsCache.value = { optionalPatchInfos: {} }
    }
}

/**
 * 从本地热更缓存中按语音包签名汇总所有版本文件。
 */
async function loadOptionalPackEntries() {
    optionalPackEntries.value = []
    if (!hotUpdatePatchRootDir.value) return

    const versions = await listLocalHotUpdateVersions()
    const signEntries = new Map<string, Map<number, HotUpdatePakFileInfo[]>>()
    for (const version of versions) {
        try {
            const content = await readTextFile(`${getHotUpdateVersionDir(version)}PakFilesInfo.json`)
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
    await loadOptionalPatchSignsCache()
    await loadOptionalPackEntries()
}

/**
 * 校验指定热更版本是否已完整落盘。
 * @param patchVersion 版本号
 * @returns 是否完整
 */
async function isHotUpdateVersionInstalled(patchVersion: number) {
    if (!hotUpdatePatchRootDir.value) return false
    try {
        const content = await readTextFile(`${getHotUpdateVersionDir(patchVersion)}PakFilesInfo.json`)
        const pakInfo = normalizeHotUpdatePakFilesInfo(JSON.parse(content))
        const files = getHotUpdateFilesToDownload(pakInfo, getDownloadedOptionalSigns())
        const localFiles = new Set(await listFiles(getHotUpdateVersionDir(patchVersion)))
        for (const file of files) {
            if (!localFiles.has(file.fileName) || localFiles.has(`${file.fileName}.progress`)) {
                return false
            }
        }
        return true
    } catch {
        return false
    }
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
 * 获取已下载的语音包签名集合。
 * @returns 已下载语音包签名
 */
function getDownloadedOptionalSigns() {
    return new Set(
        Object.entries(optionalPatchSignsCache.value.optionalPatchInfos)
            .filter(([, info]) => info.state === "Downloaded")
            .map(([sign]) => sign)
    )
}

/**
 * 判断热更文件是否需要随当前热更下载。
 * @param file 热更文件
 * @param downloadedOptionalSigns 已下载语音包签名
 * @returns 是否需要下载
 */
function shouldDownloadHotUpdateFile(file: HotUpdatePakFileInfo, downloadedOptionalSigns: Set<string>) {
    return !file.pakOptionalSign || downloadedOptionalSigns.has(file.pakOptionalSign)
}

/**
 * 过滤需要下载的热更文件。
 * @param pakInfo 热更文件清单
 * @param downloadedOptionalSigns 已下载语音包签名
 * @returns 需要下载的文件
 */
function getHotUpdateFilesToDownload(pakInfo: HotUpdatePakFilesInfoRes, downloadedOptionalSigns: Set<string>) {
    const files = pakInfo.pakFilesMap.WindowsNoEditor?.pakFileInfos ?? []
    return files.filter(file => shouldDownloadHotUpdateFile(file, downloadedOptionalSigns))
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
    const activeChannel = getActiveChannel()
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
    lastDownloadedBytes = 0
    lastTimestamp = Date.now()
    try {
        const optionalFiles = entry.versions.flatMap(versionEntry => versionEntry.files.map(file => ({ version: versionEntry.version, file })))
        const totalSizeVal = optionalFiles.reduce((sum, item) => sum + item.file.fileSize, 0)
        activeDownloadTotal.value = totalSizeVal
        let fileBytesBefore = 0
        const filesToDownload = [...optionalFiles]
        const pendingHashChecks: Array<() => Promise<void>> = []
        const runningHashChecks: Promise<void>[] = []
        let index = 0
        while (index < filesToDownload.length || pendingHashChecks.length || runningHashChecks.length) {
            throwIfPauseRequested()
            if (index >= filesToDownload.length) {
                startPendingHashChecks(pendingHashChecks, runningHashChecks)
                if (runningHashChecks.length > 0) {
                    await Promise.all(runningHashChecks.splice(0))
                }
                continue
            }
            const item = filesToDownload[index]
            const { file, version } = item
            index++
            const fullFilePath = `${getHotUpdateVersionDir(version)}${file.fileName}`
            const progressFilePath = `${fullFilePath}.progress`
            await prepareCurrentDownloadFile(
                fullFilePath,
                file.fileName,
                file.fileSize,
                fileBytesBefore,
                totalSizeVal,
                getHotUpdateAssetUrl(file.fileName, activeChannel, version)
            )
            if (await canSkipBeforeHashCheck(fullFilePath, progressFilePath, file.fileSize)) {
                pendingHashChecks.push(() => queueExistingFileHashCheck(fullFilePath, file.fileSize, file.hash, filesToDownload, item))
                const totalDownloaded = fileBytesBefore + file.fileSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalSizeVal > 0 ? totalDownloaded / totalSizeVal : 0
                fileProgress.value = 1
                currentFileDownloaded.value = formatSize(file.fileSize)
                currentFileTotal.value = formatSize(file.fileSize)
                fileBytesBefore += file.fileSize
                continue
            }
            const downloadTask = downloadHotUpdateAssets(
                selectedCDN.value,
                file.fileName,
                activeChannel,
                version,
                concurrentThreads.value,
                undefined,
                getHotUpdateVersionDir(version)
            )
            startPendingHashChecks(pendingHashChecks, runningHashChecks)
            await downloadTask
            fileBytesBefore += file.fileSize
        }
        await markOptionalPatchDownloaded(sign)
        await refreshLocalHotUpdateCaches()
        ui.showSuccessMessage(`${getOptionalPackLabel(sign)} 下载完成`)
    } catch (err) {
        if (isDownloadPausedError(err)) {
            markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            markDownloadAlreadyActive()
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
    const activeChannel = getActiveChannel()
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

/**
 * 设置当前下载文件，并从后端进度文件同步当前文件进度。
 * @param filePath 下载目标路径
 * @param filename 展示文件名
 * @param expectedSize 预期文件大小
 * @param totalDownloadedBefore 当前任务此前累计完成字节
 * @param totalSizeVal 当前任务总大小
 */
async function prepareCurrentDownloadFile(
    filePath: string,
    filename: string,
    expectedSize: number,
    totalDownloadedBefore: number,
    totalSizeVal: number,
    fileUrl = ""
) {
    currentFile.value = filename
    currentFileUrl.value = fileUrl
    currentDownloadPath.value = filePath
    currentFileTotal.value = formatSize(expectedSize)
    activeDownloadTotal.value = totalSizeVal
    activeDownloadCompletedBefore.value = totalDownloadedBefore

    try {
        const progress = await getDownloadProgress(filePath)
        const downloaded = Math.min(progress.downloaded, expectedSize)
        if (!progress.hasProgressFile && downloaded === 0) return
        currentFileDownloaded.value = formatSize(downloaded)
        fileProgress.value = expectedSize > 0 ? downloaded / expectedSize : 0
        currentDownloaded.value = totalDownloadedBefore + downloaded
        overallProgress.value = totalSizeVal > 0 ? currentDownloaded.value / totalSizeVal : 0
    } catch {
        currentFileDownloaded.value = "0 B"
        fileProgress.value = 0
    }
}

/**
 * 暂停当前下载。
 */
async function pauseCurrentDownload() {
    if (!currentDownloadPath.value) return
    await pauseDownload(currentDownloadPath.value)
    isPauseRequested.value = true
    downloadSpeed.value = ""
    void waitUntilBackendPaused(currentDownloadPath.value)
}

/**
 * 刷新页面后的下载没有本页 Promise 可 catch，轮询后端状态直到暂停完成。
 * @param filePath 当前下载文件路径
 */
async function waitUntilBackendPaused(filePath: string) {
    for (let i = 0; i < 80; i++) {
        if (!isPauseRequested.value || currentDownloadPath.value !== filePath) return
        const progress = await getDownloadProgress(filePath)
        if (progress.paused && !progress.active) {
            markDownloadPaused()
            return
        }
        await new Promise(resolve => window.setTimeout(resolve, 250))
    }
}

/**
 * 下载暂停后的统一状态收尾。
 */
function markDownloadPaused() {
    isPauseRequested.value = false
    isDownloadPaused.value = true
    isDownloading.value = false
    downloadSpeed.value = ""
}

/**
 * 已有同文件下载任务继续运行时的状态收尾。
 */
function markDownloadAlreadyActive() {
    isDownloading.value = true
    isDownloadPaused.value = false
    isPauseRequested.value = false
    isRecoveredActiveDownload.value = true
    downloadSpeed.value = ""
}

/**
 * 判断本地文件是否可先跳过下载并进入后台 hash 校验。
 * @param filePath 文件路径
 * @param progressFilePath 断点进度文件路径
 * @param expectedSize 预期大小
 * @returns 是否可先跳过下载
 */
async function canSkipBeforeHashCheck(filePath: string, progressFilePath: string, expectedSize: number) {
    const progressFileSize = await getFileSize(progressFilePath)
    if (progressFileSize !== 0) return false
    return (await getFileSize(filePath)) === expectedSize
}

/**
 * 暂停请求生效时中断当前前端队列。
 */
function throwIfPauseRequested() {
    if (isPauseRequested.value) {
        throw new Error("download_paused")
    }
}

/**
 * 后台校验已存在文件，失败时删除并追加回下载队列。
 * @param filePath 文件路径
 * @param expectedSize 预期大小
 * @param expectedHash 预期 hash
 * @param retryQueue 下载重试队列
 * @param item 队列条目
 */
function queueExistingFileHashCheck<T>(filePath: string, expectedSize: number, expectedHash: string, retryQueue: T[], item: T) {
    return isLocalFileMatch(filePath, expectedSize, expectedHash).then(async matched => {
        if (matched) return
        await deleteFile(filePath, true)
        retryQueue.push(item)
    })
}

/**
 * 启动已收集的后台 hash 校验任务。
 * @param pendingHashChecks 尚未启动的校验任务
 * @param runningHashChecks 正在执行的校验任务
 */
function startPendingHashChecks(pendingHashChecks: Array<() => Promise<void>>, runningHashChecks: Promise<void>[]) {
    while (pendingHashChecks.length > 0) {
        const task = pendingHashChecks.shift()
        if (task) {
            runningHashChecks.push(
                task().catch(error => {
                    throw error
                })
            )
        }
    }
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
    return `${selectedCDN.value}${versionUrl}${channel}/${subVersion ? `${subVersion}/` : ""}${filename}`
}

/**
 * 拼接热更下载地址。
 * @param filename 文件名
 * @param channel 渠道名
 * @param patchVersion 热更版本
 * @returns 完整下载地址
 */
function getHotUpdateAssetUrl(filename: string, channel: string, patchVersion: number) {
    const server = getResourceServer(channel)
    return `${selectedCDN.value}/Patches/FinalPatch/${server}/Default/WindowsNoEditor/${channel}/${patchVersion}/${filename}`
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
        await downloadHotUpdateAllFiles()
    } else if (action === "optional" && activeOptionalSign.value) {
        await downloadOptionalPackTask(activeOptionalSign.value)
    }
}

async function fetchVersionList() {
    const activeChannel = getActiveChannel()
    if (!activeChannel) {
        versionList.value = null
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
    try {
        versionList.value = await getBaseVersion(selectedCDN.value, activeChannel)
        calculateTotalSize()
        await checkPreDownloadStatus()
        await checkHotUpdateStatus()
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
    const activeChannel = getActiveChannel()
    if (!gamePath.value || !versionList.value || !versionList.value.preVersionList || !activeChannel) {
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

/**
 * 从热更版本清单中按版本号排序。
 * @param versionList 热更版本清单
 * @returns 排序后的版本信息
 */
function getSortedHotUpdateVersions(versionList: HotUpdateVersionListRes) {
    return Object.values(versionList.versionList).sort((a, b) => a.patchVersion - b.patchVersion)
}

/**
 * 检查当前渠道是否存在可用热更，以及本地补丁文件是否已经完整。
 */
async function checkHotUpdateStatus() {
    const activeChannel = getActiveChannel()
    if (!gamePath.value || !activeChannel) {
        needHotUpdate.value = false
        hotUpdateSize.value = 0
        hotUpdatePendingVersions.value = []
        await refreshLocalHotUpdateCaches()
        return
    }
    try {
        const hotUpdateVersionList = await getHotUpdateVersionList(selectedCDN.value, activeChannel)
        hotUpdateVersionListCache.value = hotUpdateVersionList
        const sortedVersions = getSortedHotUpdateVersions(hotUpdateVersionList)
        let localLatestVersion = 0
        for (const version of sortedVersions) {
            const installed = await isHotUpdateVersionInstalled(version.patchVersion)
            if (!installed) break
            localLatestVersion = version.patchVersion
        }
        const pendingVersions = sortedVersions.filter(version => version.patchVersion > localLatestVersion)
        hotUpdatePendingVersions.value = pendingVersions.map(version => version.patchVersion)

        if (!pendingVersions.length) {
            needHotUpdate.value = false
            hotUpdateSize.value = 0
            hotUpdateFiles.value = 0
            await refreshLocalHotUpdateCaches()
            return
        }

        await loadOptionalPatchSignsCache()
        const downloadedOptionalSigns = getDownloadedOptionalSigns()
        const firstHotUpdatePakInfo = await getHotUpdatePakFilesInfo(selectedCDN.value, activeChannel, pendingVersions[0].patchVersion)

        let allFilesComplete = true
        let totalSizeBytes = 0
        let totalFileCount = 0
        for (const version of pendingVersions) {
            const hotUpdatePakInfo =
                version.patchVersion === pendingVersions[0].patchVersion
                    ? firstHotUpdatePakInfo
                    : await getHotUpdatePakFilesInfo(selectedCDN.value, activeChannel, version.patchVersion)
            const pakFiles = getHotUpdateFilesToDownload(hotUpdatePakInfo, downloadedOptionalSigns)
            for (const file of pakFiles) {
                totalSizeBytes += file.fileSize
                totalFileCount++
                const localFilePath = `${getHotUpdateVersionDir(version.patchVersion)}${file.fileName}`
                const progressFilePath = `${localFilePath}.progress`
                const progressFileSize = await getFileSize(progressFilePath)
                const isFileComplete = progressFileSize === 0 && (await isLocalFileMatch(localFilePath, file.fileSize, file.hash))
                if (!isFileComplete) {
                    allFilesComplete = false
                }
            }
        }

        needHotUpdate.value = !allFilesComplete
        hotUpdateSize.value = totalSizeBytes
        hotUpdateFiles.value = totalFileCount
        await refreshLocalHotUpdateCaches()
    } catch (error) {
        console.error("检查热更状态时出错:", error)
        needHotUpdate.value = true
        hotUpdateSize.value = 0
        hotUpdateFiles.value = 0
        hotUpdatePendingVersions.value = []
        await refreshLocalHotUpdateCaches()
    }
}

async function checkForUpdates() {
    const activeChannel = getActiveChannel()
    if (!activeChannel) {
        needUpdate.value = false
        updateSize.value = 0
        return
    }
    if (!gamePath.value) return
    try {
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
    await checkHotUpdateStatus()
    await syncDownloadProgressAfterRefresh()
}

/**
 * 页面刷新后根据后端进度文件恢复当前下载进度显示。
 */
async function syncDownloadProgressAfterRefresh() {
    if (!gamePath.value) return
    const activeChannel = getActiveChannel()
    if (!activeChannel) return
    if (needUpdate.value && versionList.value) {
        const files = Object.entries(versionList.value.gameVersionList.GameVersionList["1"].GameVersionList)
        for (const [index, [filename, assets]] of files.entries()) {
            const fullFilePath = `${tempDownloadDir.value}${filename}`
            const progress = await getDownloadProgress(fullFilePath)
            if (!progress.hasProgressFile) continue
            const previousFilesSize = files.slice(0, index).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
            await prepareCurrentDownloadFile(
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

    if (needPreDownload.value && versionList.value?.preVersionList) {
        const files = Object.entries(versionList.value.preVersionList.GameVersionList["1"].GameVersionList)
        const totalSizeVal = files.reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
        for (const [index, [filename, assets]] of files.entries()) {
            const fullFilePath = `${tempPreDownloadDir.value}${filename}`
            const progress = await getDownloadProgress(fullFilePath)
            if (!progress.hasProgressFile) continue
            const previousFilesSize = files.slice(0, index).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
            await prepareCurrentDownloadFile(
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
        await loadOptionalPatchSignsCache()
        const downloadedOptionalSigns = getDownloadedOptionalSigns()
        let completedBytes = 0
        for (const patchVersion of hotUpdatePendingVersions.value) {
            const content = await readTextFile(`${getHotUpdateVersionDir(patchVersion)}PakFilesInfo.json`).catch(() => "")
            if (!content) continue
            const pakInfo = normalizeHotUpdatePakFilesInfo(JSON.parse(content))
            const files = getHotUpdateFilesToDownload(pakInfo, downloadedOptionalSigns)
            const totalSizeVal = hotUpdateSize.value
            for (const file of files) {
                const fullFilePath = `${getHotUpdateVersionDir(patchVersion)}${file.fileName}`
                const progress = await getDownloadProgress(fullFilePath)
                if (!progress.hasProgressFile) {
                    completedBytes += file.fileSize
                    continue
                }
                await prepareCurrentDownloadFile(
                    fullFilePath,
                    file.fileName,
                    file.fileSize,
                    completedBytes,
                    totalSizeVal,
                    getHotUpdateAssetUrl(file.fileName, activeChannel, patchVersion)
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
    const activeChannel = getActiveChannel()
    if (!activeChannel) return
    const versions = hotUpdatePendingVersions.value.length
        ? hotUpdatePendingVersions.value
        : hotUpdateVersionListCache.value
          ? getSortedHotUpdateVersions(hotUpdateVersionListCache.value).map(version => version.patchVersion)
          : []
    const entries: Array<{ version: number; files: string[] }> = []
    for (const version of versions) {
        try {
            let pakInfo: HotUpdatePakFilesInfoRes
            const localContent = await readTextFile(`${getHotUpdateVersionDir(version)}PakFilesInfo.json`).catch(() => "")
            if (localContent) {
                pakInfo = normalizeHotUpdatePakFilesInfo(JSON.parse(localContent))
            } else {
                pakInfo = normalizeHotUpdatePakFilesInfo(await getHotUpdatePakFilesInfo(selectedCDN.value, activeChannel, version))
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
        await refreshGameInstalled()
        ui.showSuccessMessage(t("game-update.update_success"))
    } catch (err) {
        ui.showErrorMessage(t("game-update.update_base_version_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("更新 BaseVersion.json 失败:", err)
    }
}

/**
 * 保存热更根版本清单。
 */
async function saveHotUpdateVersionListCache() {
    if (!gamePath.value || !hotUpdateVersionListCache.value) return
    try {
        await writeTextFile(`${hotUpdatePatchRootDir.value}VersionList.json`, JSON.stringify(hotUpdateVersionListCache.value, null, 2))
    } catch (err) {
        console.error("保存热更版本清单失败:", err)
    }
}

/**
 * 保存指定版本的热更缓存文件。
 * @param version 版本号
 * @param pakInfo 补丁文件清单
 * @param resDiscreteInfo 离散资源清单
 */
async function saveHotUpdateVersionCache(version: number, pakInfo: HotUpdatePakFilesInfoRes, resDiscreteInfo: HotUpdatePakFilesInfoRes) {
    try {
        const versionDir = getHotUpdateVersionDir(version)
        await writeTextFile(`${versionDir}PakFilesInfo.json`, JSON.stringify(pakInfo, null, 2))
        await writeTextFile(`${versionDir}ResDiscreteInfo.json`, JSON.stringify(resDiscreteInfo, null, 2))
    } catch (err) {
        console.error("保存热更版本缓存失败:", err)
    }
}

/**
 * 写入语音包下载状态缓存。
 * @param sign 语音包签名
 */
async function markOptionalPatchDownloaded(sign: string) {
    const localVersions = await listLocalHotUpdateVersions()
    const version = localVersions.at(-1) ?? 0
    await markOptionalPatchesDownloaded([sign], version)
}

/**
 * 批量写入语音包下载状态缓存。
 * @param signs 语音包签名
 * @param version 已下载版本
 */
async function markOptionalPatchesDownloaded(signs: string[], version: number) {
    if (!signs.length) return
    const optionalPatchInfos = { ...optionalPatchSignsCache.value.optionalPatchInfos }
    for (const sign of signs) {
        optionalPatchInfos[sign] = {
            state: "Downloaded",
            version,
        }
    }
    const nextCache: OptionalPatchSignsRes = {
        optionalPatchInfos,
    }
    optionalPatchSignsCache.value = nextCache
    if (!gamePath.value) return
    try {
        await writeTextFile(`${hotUpdatePatchRootDir.value}OptionalPatchSigns.json`, JSON.stringify(nextCache, null, 2))
    } catch (err) {
        console.error("保存 OptionalPatchSigns.json 失败:", err)
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
            saveChannelGamePath(emExePath)
            await refreshGameInstalled()
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
    const activeChannel = getActiveChannel()
    if (!activeChannel) {
        ui.showErrorMessage("请先填写自定义 channel")
        return
    }
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
    lastDownloadedBytes = 0
    lastTimestamp = Date.now()
    try {
        const gameVersionList = versionList.value.gameVersionList.GameVersionList["1"].GameVersionList
        const files = Object.entries(gameVersionList)
        const filesToDownload = [...files]
        const pendingHashChecks: Array<() => Promise<void>> = []
        const runningHashChecks: Promise<void>[] = []
        activeDownloadTotal.value = totalSize.value
        let queueIndex = 0
        while (queueIndex < filesToDownload.length || pendingHashChecks.length || runningHashChecks.length) {
            throwIfPauseRequested()
            if (queueIndex >= filesToDownload.length) {
                startPendingHashChecks(pendingHashChecks, runningHashChecks)
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
            await prepareCurrentDownloadFile(
                fullFilePath,
                filename,
                assets.ZipSize,
                previousFilesSize,
                totalSize.value,
                getGameAssetUrl(filename, activeChannel, versionList.value.subVersion)
            )
            if (await canSkipBeforeHashCheck(fullFilePath, progressFilePath, assets.ZipSize)) {
                pendingHashChecks.push(() =>
                    queueExistingFileHashCheck(fullFilePath, assets.ZipSize, assets.ZipMd5, filesToDownload, [filename, assets])
                )
                console.debug(`文件 ${filename} 已存在且大小匹配，跳过下载`)
                const totalDownloaded = previousFilesSize + assets.ZipSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / totalSize.value
                fileProgress.value = 1
                currentFileDownloaded.value = formatSize(assets.ZipSize)
                currentFileTotal.value = formatSize(assets.ZipSize)
                continue
            }
            const downloadTask = downloadAssets(
                selectedCDN.value,
                filename,
                activeChannel,
                versionList.value.subVersion,
                concurrentThreads.value,
                undefined,
                tempDownloadDir.value
            )
            startPendingHashChecks(pendingHashChecks, runningHashChecks)
            await downloadTask
        }
        isDownloading.value = false
        currentFile.value = ""
        currentFileUrl.value = ""
        downloadSpeed.value = ""
        await extractAllFiles()
        await updateBaseVersionFile()
        await checkForUpdates()
        if (needHotUpdate.value && hotUpdatePendingVersions.value.length) {
            await downloadHotUpdateAllFiles()
        }
    } catch (err) {
        if (isDownloadPausedError(err)) {
            markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            markDownloadAlreadyActive()
            return
        }
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("下载失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

async function preDownloadAllFiles() {
    const activeChannel = getActiveChannel()
    if (!activeChannel) {
        ui.showErrorMessage("请先填写自定义 channel")
        return
    }
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
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
    lastDownloadedBytes = 0
    lastTimestamp = Date.now()
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
            throwIfPauseRequested()
            if (queueIndex >= filesToDownload.length) {
                startPendingHashChecks(pendingHashChecks, runningHashChecks)
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
            await prepareCurrentDownloadFile(
                fullFilePath,
                filename,
                assets.ZipSize,
                previousFilesSize,
                preTotalSizeVal,
                getGameAssetUrl(filename, activeChannel, versionList.value.preVersion!)
            )
            if (await canSkipBeforeHashCheck(fullFilePath, progressFilePath, assets.ZipSize)) {
                pendingHashChecks.push(() =>
                    queueExistingFileHashCheck(fullFilePath, assets.ZipSize, assets.ZipMd5, filesToDownload, [filename, assets])
                )
                console.debug(`预下载文件 ${filename} 已存在且大小匹配，跳过下载`)
                const totalDownloaded = previousFilesSize + assets.ZipSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / preTotalSizeVal
                fileProgress.value = 1
                currentFileDownloaded.value = formatSize(assets.ZipSize)
                currentFileTotal.value = formatSize(assets.ZipSize)
                continue
            }
            const downloadTask = downloadAssets(
                selectedCDN.value,
                filename,
                activeChannel,
                versionList.value.preVersion!,
                concurrentThreads.value,
                undefined,
                tempPreDownloadDir.value
            )
            startPendingHashChecks(pendingHashChecks, runningHashChecks)
            await downloadTask
        }
        isDownloading.value = false
        currentFile.value = ""
        currentFileUrl.value = ""
        downloadSpeed.value = ""
        await checkPreDownloadStatus()
        ui.showSuccessMessage(t("game-update.pre_download_complete", { size: formatSize(preTotalSizeVal) }))
    } catch (err) {
        if (isDownloadPausedError(err)) {
            markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            markDownloadAlreadyActive()
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
async function downloadHotUpdateAllFiles() {
    const activeChannel = getActiveChannel()
    if (!activeChannel) {
        ui.showErrorMessage("请先填写自定义 channel")
        return
    }
    if (!gamePath.value) {
        ui.showErrorMessage(t("game-update.select_game_dir_first"))
        return
    }
    if (!hotUpdatePendingVersions.value.length) {
        ui.showErrorMessage("没有可用的热更版本")
        return
    }

    isDownloading.value = true
    activeDownloadAction.value = "hot"
    activeOptionalSign.value = ""
    isRecoveredActiveDownload.value = false
    isDownloadPaused.value = false
    isPauseRequested.value = false
    currentDownloaded.value = 0
    overallProgress.value = 0
    downloadSpeed.value = ""
    lastDownloadedBytes = 0
    lastTimestamp = Date.now()
    try {
        await loadOptionalPatchSignsCache()
        const downloadedOptionalSigns = getDownloadedOptionalSigns()
        const versionsToDownload = [...hotUpdatePendingVersions.value]
        const versionTasks: Array<{
            patchVersion: number
            pakInfo: HotUpdatePakFilesInfoRes
            resDiscreteInfo: HotUpdatePakFilesInfoRes
            files: HotUpdatePakFileInfo[]
        }> = []
        let totalSizeVal = 0
        for (const patchVersion of versionsToDownload) {
            const pakInfo = await getHotUpdatePakFilesInfo(selectedCDN.value, activeChannel, patchVersion)
            const resDiscreteInfo = await getHotUpdateResDiscreteInfo(selectedCDN.value, activeChannel, patchVersion)
            const files = getHotUpdateFilesToDownload(pakInfo, downloadedOptionalSigns)
            totalSizeVal += files.reduce((sum, file) => sum + file.fileSize, 0)
            versionTasks.push({
                patchVersion,
                pakInfo,
                resDiscreteInfo,
                files,
            })
        }
        activeDownloadTotal.value = totalSizeVal

        let completedBytes = 0
        for (const task of versionTasks) {
            let versionBytes = 0
            for (const file of task.files) {
                versionBytes += file.fileSize
            }
            let fileBytesBefore = 0
            const filesToDownload = [...task.files]
            const pendingHashChecks: Array<() => Promise<void>> = []
            const runningHashChecks: Promise<void>[] = []
            let queueIndex = 0
            while (queueIndex < filesToDownload.length || pendingHashChecks.length || runningHashChecks.length) {
                throwIfPauseRequested()
                if (queueIndex >= filesToDownload.length) {
                    startPendingHashChecks(pendingHashChecks, runningHashChecks)
                    if (runningHashChecks.length > 0) {
                        await Promise.all(runningHashChecks.splice(0))
                    }
                    continue
                }
                const file = filesToDownload[queueIndex]
                queueIndex++
                const filename = file.fileName
                const fullFilePath = `${getHotUpdateVersionDir(task.patchVersion)}${filename}`
                const progressFilePath = `${fullFilePath}.progress`
                await prepareCurrentDownloadFile(
                    fullFilePath,
                    filename,
                    file.fileSize,
                    completedBytes + fileBytesBefore,
                    totalSizeVal,
                    getHotUpdateAssetUrl(filename, activeChannel, task.patchVersion)
                )
                if (await canSkipBeforeHashCheck(fullFilePath, progressFilePath, file.fileSize)) {
                    pendingHashChecks.push(() => queueExistingFileHashCheck(fullFilePath, file.fileSize, file.hash, filesToDownload, file))
                    console.debug(`热更文件 ${filename} 已存在且 hash 匹配，跳过下载`)
                    const totalDownloaded = completedBytes + fileBytesBefore + file.fileSize
                    currentDownloaded.value = totalDownloaded
                    overallProgress.value = totalSizeVal > 0 ? totalDownloaded / totalSizeVal : 0
                    fileProgress.value = 1
                    currentFileDownloaded.value = formatSize(file.fileSize)
                    currentFileTotal.value = formatSize(file.fileSize)
                    fileBytesBefore += file.fileSize
                    continue
                }
                const downloadTask = downloadHotUpdateAssets(
                    selectedCDN.value,
                    filename,
                    activeChannel,
                    task.patchVersion,
                    concurrentThreads.value,
                    undefined,
                    getHotUpdateVersionDir(task.patchVersion)
                )
                startPendingHashChecks(pendingHashChecks, runningHashChecks)
                await downloadTask
                fileBytesBefore += file.fileSize
            }
            completedBytes += versionBytes
            await saveHotUpdateVersionCache(task.patchVersion, task.pakInfo, task.resDiscreteInfo)
        }
        isDownloading.value = false
        currentFile.value = ""
        currentFileUrl.value = ""
        downloadSpeed.value = ""
        await saveHotUpdateVersionListCache()
        await markOptionalPatchesDownloaded(Array.from(downloadedOptionalSigns), versionsToDownload.at(-1) ?? 0)
        await checkHotUpdateStatus()
        await refreshLocalHotUpdateCaches()
        ui.showSuccessMessage(`热更完成，总大小: ${formatSize(totalSizeVal)}`)
    } catch (err) {
        if (isDownloadPausedError(err)) {
            markDownloadPaused()
            return
        }
        if (isDownloadAlreadyActiveError(err)) {
            markDownloadAlreadyActive()
            return
        }
        ui.showErrorMessage(t("game-update.download_failed", { error: err instanceof Error ? err.message : String(err) }))
        console.error("热更失败:", err)
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
            overallProgress.value = (i + 1) / totalFilesCount
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
        isExtracting.value = false
        overallProgress.value = 0
        extractionCurrentFileCount.value = 0
        extractionCurrentSize.value = 0
        extractionTotalFiles.value = 0
        extractionTotalSize.value = 0
        extractionCurrentFile.value = ""
        await deleteFile(extractProgressPath.value, true)
        await refreshGameInstalled()
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
    const unlistenDownload = await listen<DownloadProgress>("download_progress", event => {
        if (!currentDownloadPath.value || event.payload.filename !== currentDownloadPath.value) return
        const progress = event.payload
        fileProgress.value = progress.total > 0 ? progress.downloaded / progress.total : 0
        currentFileDownloaded.value = formatSize(progress.downloaded)
        currentFileTotal.value = formatSize(progress.total)
        const totalDownloaded = activeDownloadCompletedBefore.value + progress.downloaded
        currentDownloaded.value = totalDownloaded
        overallProgress.value = activeDownloadTotal.value > 0 ? totalDownloaded / activeDownloadTotal.value : 0
        downloadSpeed.value = calculateDownloadSpeed(totalDownloaded)
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
        <img
            class="absolute top-0 left-0 w-full h-full object-cover pointer-events-none opacity-60"
            src="https://cdnstatic.yingxiong.com/dna/hd/imgs/home/pc/bg.webp"
            alt="bg"
        />
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
                                v-if="!setting.safeMode && selectedChannel === CUSTOM_CHANNEL_VALUE"
                                v-model.lazy="customChannel"
                                type="text"
                                class="bg-transparent border-none outline-hidden text-sm min-w-36 placeholder:text-base-content/30"
                                placeholder="自定义 channel"
                            />
                            <Select
                                v-model="selectedChannel"
                                class="bg-transparent border-none outline-hidden text-sm appearance-none cursor-pointer min-w-20"
                            >
                                <SelectItem v-for="channel in channels" :key="channel.value" :value="channel.value" xs>
                                    {{ channel.name }}
                                </SelectItem>
                                <SelectItem v-if="!setting.safeMode" :value="CUSTOM_CHANNEL_VALUE" xs>自定义</SelectItem>
                            </Select>
                        </div>
                    </div>

                    <div class="group relative">
                        <div
                            class="flex items-center gap-2 bg-base-content/5 hover:bg-base-content/10 px-3 py-1.5 rounded-lg border border-base-content/5 transition-colors duration-200 cursor-pointer"
                        >
                            <Icon icon="ri:cloud-line" class="text-base-content/40 w-4 h-4" />
                            <Select
                                v-model="selectedCDN"
                                class="bg-transparent border-none outline-hidden text-sm appearance-none cursor-pointer min-w-20 truncate"
                            >
                                <SelectItem v-for="cdn in availableCDN" :key="cdn.url" :value="cdn.url">
                                    {{ cdn.name }}
                                </SelectItem>
                            </Select>
                        </div>
                    </div>

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
                <div v-if="versionList" class="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                            <span class="text-2xl font-bold font-mono">{{ versionList.subVersion }}</span>
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
                            <span class="text-2xl font-bold text-secondary">{{ formatSize(displayDownloadSize) }}</span>
                            <span class="text-xs opacity-80 mb-1.5">{{ displayDownloadFileCount }} {{ t("game-update.files") }}</span>
                        </div>
                    </div>
                </div>

                <!-- 预下载通知条 -->
                <div
                    v-if="needPreDownload && versionList"
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
                                        version: versionList.preVersion,
                                        size: formatSize(preTotalSize),
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
                                    ? `${formatSize(currentDownloaded)} / ${formatSize(activeDownloadTotal)}`
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
                            @click="pauseCurrentDownload()"
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
                        @click="needUpdate ? downloadAllFiles() : needHotUpdate ? downloadHotUpdateAllFiles() : launchGame()"
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
                                {{ t("game-update.update_size", { size: formatSize(needUpdate ? updateSize : hotUpdateSize) }) }}
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
