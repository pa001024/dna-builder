import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { deleteFile, getFileSize, listDirectories, listFiles, readTextFile, removeDirAll, writeTextFile } from "../api/app"
import {
    CDN_LIST,
    type DiffPackageInfo,
    downloadFullPackage,
    downloadHotUpdateAssets,
    type FullPackageInfo,
    getDiffPackageInfo,
    getDownloadProgress,
    getFullPackageInfo,
    getHotUpdatePakFilesInfo,
    getHotUpdateResDiscreteInfo,
    getHotUpdateVersionList,
    getPreFullPackageInfo,
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
    resolveGameVersion,
} from "../utils/game-download"
import { useGameStore } from "./game"
import { useUIStore } from "./ui"

const CUSTOM_CHANNEL_VALUE = "__custom_channel__"

/**
 * 基础包更新目标：差分包优先，无差分包时使用完整包。
 */
export interface ActiveBasePackage {
    /** hdiff 文件名。 */
    fileName: string
    /** 下载量（字节）。 */
    size: number
    /** hdiff 下载地址。 */
    downloadUrl: string
    /** 是否为差分包。 */
    isDiff: boolean
    /** 差分包来源版本号（完整包为 null）。 */
    fromVersion: number | null
    /** 目标版本号，应用成功后写入 GameVersion.json。 */
    targetVersion: string
}

/**
 * 游戏更新 Store：完整包 / 预下载 / 热更的「检查 + 下载」公共逻辑，供完整启动器（GameUpdate.vue）与
 * 首页迷你启动器（MiniGameLauncher.vue）共用，避免各自维护一套请求、差分解析与下载编排。
 * 包含：下载进度状态、更新目标（差分包优先）、预下载检查与下载、热更检查与下载、语音包签名缓存。
 */
export const useGameUpdateStore = defineStore("gameUpdate", () => {
    const gameStore = useGameStore()
    const ui = useUIStore()

    // 与更新页共用同一份 CDN / 服务器 / 并发配置（localStorage 同名 key 天然共享）
    const selectedCDN = useLocalStorage("selectedCDN", CDN_LIST[0].url)
    const selectedChannel = useLocalStorage("selectedChannel", "PC_OBT_CN_Pub")
    const customChannel = useLocalStorage("selectedChannel.custom", "")
    const concurrentThreads = useLocalStorage("download_threads", 8)

    // 按渠道分区的游戏安装路径（更新页选择目录时写入），确保迷你启动器与完整启动器检查同一份安装
    const channelGamePathMap = useLocalStorage<Record<string, string>>("game.path_by_channel", {})

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

    /**
     * 判断 CDN 是否面向海外（AWS 与「海外」同属海外节点，仅海外渠道可用）。
     * @param cdnUrl CDN 地址
     * @returns 是否海外 CDN
     */
    function isOverseasCDN(cdnUrl: string) {
        const cdn = CDN_LIST.find(item => item.url === cdnUrl)
        return cdn?.name === "AWS"
    }

    /**
     * 当前渠道可用的 CDN 列表（与更新页一致：海外渠道仅海外 CDN，其余排除海外）。
     * 自定义 channel 时不做 CDN 过滤（内容地址可能落在任意节点）。
     * @returns 可用 CDN 列表
     */
    const availableCDN = computed(() => {
        const activeChannel = getActiveChannel()
        if (isCustomChannelSelected()) {
            return CDN_LIST
        }
        if (activeChannel === "PC_OBT_Global_Pub") {
            return CDN_LIST.filter(cdn => isOverseasCDN(cdn.url))
        }
        return CDN_LIST.filter(cdn => !isOverseasCDN(cdn.url))
    })

    /**
     * 将当前选中的 CDN 校正到当前渠道可用列表内（选中项失效时回退到列表首个）。
     */
    function ensureValidCDN() {
        if (!availableCDN.value.find(cdn => cdn.url === selectedCDN.value)) {
            selectedCDN.value = availableCDN.value[0].url
        }
    }

    /**
     * 兼容旧版全局路径存储，首次把全局路径迁移到当前渠道专属配置。
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
     * 切换服务器时同步对应的游戏路径到共享状态（迷你启动器检查前与更新页一致地调用）。
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
     * @param path 游戏主程序（EM.exe）路径
     */
    function saveChannelGamePath(path: string) {
        const channel = getActiveChannel()
        if (!channel || !path || channelGamePathMap.value[channel] === path) return
        channelGamePathMap.value = {
            ...channelGamePathMap.value,
            [channel]: path,
        }
    }

    /** 迷你启动器等入口检查前需要同步输入（路径 / CDN）与完整启动器保持一致。 */
    function syncLauncherInputs() {
        migrateLegacyGamePath()
        syncGamePathByChannel()
        ensureValidCDN()
    }

    /** 游戏安装根目录（由 EM.exe 路径推导）。 */
    const gamePath = computed(() => gameStore.path.replace(/\\DNA Game\\EM\.exe/, ""))

    //#region 完整包 / 预下载目标
    /** 当前渠道正式完整包清单。 */
    const fullPackageInfo = ref<FullPackageInfo | null>(null)
    /** 当前渠道预下载完整包清单。 */
    const preFullPackageInfo = ref<FullPackageInfo | null>(null)
    /** 正式版更新差分包（本地版本可用且远端提供时非空）。 */
    const diffPackageInfo = ref<DiffPackageInfo | null>(null)
    /** 预下载目标差分包（本地版本可用且远端提供时非空）。 */
    const preDiffPackageInfo = ref<DiffPackageInfo | null>(null)
    /** 预下载差分包解析缓存键（CDN / 渠道 / 目标清单 / 本地版本 / 安装路径）。 */
    let preDiffCacheKey = ""

    const needUpdate = ref(false)
    const updateSize = ref(0)
    const needPreDownload = ref(false)
    const preTotalSize = ref(0)
    const preTotalFiles = ref(0)

    /** 基础包下载目录（完整包与差分包共用，正式版本直接复用预下载文件）。 */
    const fullPackageDownloadDir = computed(() => (gamePath.value ? `${gamePath.value}\\Diff\\` : ""))

    /**
     * 将完整包信息转换为统一基础包目标。
     * @param info 完整包信息
     * @returns 基础包更新目标
     */
    function toActiveFullPackage(info: FullPackageInfo): ActiveBasePackage {
        return {
            fileName: info.fileName,
            size: info.size,
            downloadUrl: info.downloadUrl,
            isDiff: false,
            fromVersion: null,
            targetVersion: info.latestVersion,
        }
    }

    /**
     * 将差分包信息转换为统一基础包目标。
     * @param diff 差分包信息
     * @returns 基础包更新目标
     */
    function toActiveDiffPackage(diff: DiffPackageInfo): ActiveBasePackage {
        return {
            fileName: diff.fileName,
            size: diff.size,
            downloadUrl: diff.downloadUrl,
            isDiff: true,
            fromVersion: diff.fromVersion,
            targetVersion: String(diff.toVersion),
        }
    }

    /** 当前正式版基础包目标（差分包优先，无差分包时用完整包）。 */
    const activeBasePackage = computed<ActiveBasePackage | null>(() => {
        if (diffPackageInfo.value) return toActiveDiffPackage(diffPackageInfo.value)
        return fullPackageInfo.value ? toActiveFullPackage(fullPackageInfo.value) : null
    })

    /** 当前预下载目标（差分包优先，无差分包时用完整包）。 */
    const activePrePackage = computed<ActiveBasePackage | null>(() => {
        if (preDiffPackageInfo.value) return toActiveDiffPackage(preDiffPackageInfo.value)
        return preFullPackageInfo.value ? toActiveFullPackage(preFullPackageInfo.value) : null
    })

    /**
     * 读取本地 GameVersion.json 的版本号。
     * @returns 本地版本号，文件缺失或格式异常时返回 null
     */
    async function readLocalGameVersion() {
        try {
            return resolveGameVersion(await readTextFile(`${gamePath.value}\\DNA Game\\GameVersion.json`))
        } catch {
            return null
        }
    }

    /**
     * 清空完整包 / 预下载相关状态（无有效渠道或切换渠道时）。
     */
    function resetPackageUpdateState() {
        fullPackageInfo.value = null
        preFullPackageInfo.value = null
        diffPackageInfo.value = null
        preDiffPackageInfo.value = null
        preDiffCacheKey = ""
        needUpdate.value = false
        updateSize.value = 0
        needPreDownload.value = false
        preTotalSize.value = 0
        preTotalFiles.value = 0
    }

    /**
     * 拉取当前渠道的正式 / 预下载清单（自定义 channel 与 CDN 校正复用 launcher 输入）。
     * 预下载清单异常只降级为无预下载，不阻断正式版本检查。
     */
    async function refreshPackageInfo() {
        const activeChannel = getActiveChannel()
        if (!activeChannel) {
            resetPackageUpdateState()
            return
        }
        ensureValidCDN()
        const cdn = selectedCDN.value
        const [fullPackage, preFullPackage] = await Promise.all([
            getFullPackageInfo(cdn, activeChannel),
            getPreFullPackageInfo(cdn, activeChannel).catch(err => {
                console.warn("获取预下载完整包信息失败:", err)
                return null
            }),
        ])
        fullPackageInfo.value = fullPackage
        preFullPackageInfo.value = preFullPackage
        // 目标清单已更新，清空旧差分结果，等待随后的按本地版本解析
        diffPackageInfo.value = null
        preDiffPackageInfo.value = null
        preDiffCacheKey = ""
        if (!preFullPackage) {
            needPreDownload.value = false
            preTotalSize.value = 0
            preTotalFiles.value = 0
        }
    }

    /**
     * 判断预下载完整包是否已完整落盘（无残留进度文件且大小匹配）。
     * @param packageInfo 预下载完整包信息
     * @returns 是否可以直接复用
     */
    async function isPreFullPackageComplete(packageInfo: FullPackageInfo) {
        if (!fullPackageDownloadDir.value) return false
        const filePath = `${fullPackageDownloadDir.value}${packageInfo.fileName}`
        if ((await getFileSize(`${filePath}.progress`)) !== 0) return false
        return (await getFileSize(filePath)) === packageInfo.size
    }

    /**
     * 解析预下载目标版本的差分包：本地版本可用且远端提供时使用差分，否则回退完整包。
     * 已完整下载的预下载完整包优先复用，避免升级到差分下载后重复占用带宽。
     * @param localVersion 本地版本号
     */
    async function refreshPreDiffPackage(localVersion: number | null) {
        const prePackage = preFullPackageInfo.value
        const activeChannel = getActiveChannel()
        if (!prePackage || !activeChannel) {
            preDiffPackageInfo.value = null
            preDiffCacheKey = ""
            return
        }
        const cacheKey = [selectedCDN.value, activeChannel, prePackage.downloadUrl, localVersion ?? "", gamePath.value].join("|")
        if (cacheKey === preDiffCacheKey) return
        preDiffCacheKey = cacheKey
        const diff = localVersion ? await getDiffPackageInfo(selectedCDN.value, activeChannel, prePackage, localVersion) : null
        preDiffPackageInfo.value = diff && (await isPreFullPackageComplete(prePackage)) ? null : diff
    }

    /**
     * 判断新清单布局下预下载是否可用；无预下载清单时返回 false，由旧版预下载逻辑接手。
     * @returns 是否已由完整包清单处理
     */
    async function checkPreDownloadStatus() {
        if (!gamePath.value || !getActiveChannel()) {
            needPreDownload.value = false
            return false
        }
        if (!preFullPackageInfo.value) {
            needPreDownload.value = false
            return false
        }
        if (preFullPackageInfo.value.latestVersion === fullPackageInfo.value?.latestVersion) {
            needPreDownload.value = false
            return true
        }
        const prePackage = activePrePackage.value
        if (!prePackage) {
            needPreDownload.value = false
            return true
        }
        const fullFilePath = `${fullPackageDownloadDir.value}${prePackage.fileName}`
        const progressFileSize = await getFileSize(`${fullFilePath}.progress`)
        needPreDownload.value = progressFileSize !== 0 || (await getFileSize(fullFilePath)) !== prePackage.size
        return true
    }

    /**
     * 解析预下载目标（差分优先）并刷新预下载状态与展示大小。
     * @param localVersion 本地版本号，省略时读取 GameVersion.json
     */
    async function resolvePreDownloadTarget(localVersion?: number | null) {
        const version = localVersion === undefined ? await readLocalGameVersion() : localVersion
        await refreshPreDiffPackage(version)
        if (!preFullPackageInfo.value) {
            needPreDownload.value = false
            return
        }
        preTotalSize.value = activePrePackage.value?.size ?? 0
        preTotalFiles.value = activePrePackage.value ? 1 : 0
        await checkPreDownloadStatus()
    }

    /**
     * 解析正式版更新目标（差分优先）与预下载目标。
     * 无正式完整包清单（旧版资源分包布局）时保留调用方自行计算的更新状态。
     * @param localVersion 本地版本号，省略时读取 GameVersion.json
     */
    async function refreshUpdateTargets(localVersion?: number | null) {
        // 未选择游戏目录时无法判断本地版本，保持「无需更新」以免主按钮被更新态抢占
        if (!gamePath.value) {
            diffPackageInfo.value = null
            needUpdate.value = false
            updateSize.value = 0
            needPreDownload.value = false
            preTotalSize.value = 0
            preTotalFiles.value = 0
            return
        }
        const version = localVersion === undefined ? await readLocalGameVersion() : localVersion
        const activeChannel = getActiveChannel()
        if (fullPackageInfo.value && activeChannel) {
            needUpdate.value = String(version) !== fullPackageInfo.value.latestVersion
            diffPackageInfo.value = needUpdate.value
                ? await getDiffPackageInfo(selectedCDN.value, activeChannel, fullPackageInfo.value, version ?? 0)
                : null
            updateSize.value = needUpdate.value ? (diffPackageInfo.value?.size ?? fullPackageInfo.value.size) : 0
        } else {
            diffPackageInfo.value = null
            needUpdate.value = false
            updateSize.value = 0
        }
        await resolvePreDownloadTarget(version)
    }

    /**
     * 基础包下载候选：差分包优先，差分失败时回退正式完整包。
     * @returns 按尝试顺序排列的下载目标
     */
    function getBasePackageCandidates() {
        const active = activeBasePackage.value
        if (!active) return []
        return active.isDiff && fullPackageInfo.value ? [active, toActiveFullPackage(fullPackageInfo.value)] : [active]
    }

    /**
     * 下载预下载目标（差分优先，无差分时完整包），文件保留在 Diff 目录供正式版本复用。
     */
    async function downloadPreDownloadPackage() {
        const activeChannel = getActiveChannel()
        if (!activeChannel) {
            ui.showErrorMessage("请先填写自定义 channel")
            return
        }
        if (!gamePath.value) {
            ui.showErrorMessage(t("game-update.select_game_dir_first"))
            return
        }
        const packageInfo = activePrePackage.value
        if (!packageInfo) return

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
        resetSpeedBaseline()

        try {
            await prepareCurrentDownloadFile(
                fullFilePath,
                packageInfo.fileName,
                packageInfo.size,
                0,
                packageInfo.size,
                packageInfo.downloadUrl
            )
            const isPackageComplete = await canSkipBeforeHashCheck(fullFilePath, progressFilePath, packageInfo.size)
            if (!isPackageComplete) {
                await downloadFullPackage(packageInfo, fullFilePath, concurrentThreads.value)
            }
            throwIfPauseRequested()

            isDownloading.value = false
            needPreDownload.value = false
            currentFile.value = ""
            currentFileUrl.value = ""
            currentDownloadPath.value = ""
            currentDownloaded.value = packageInfo.size
            overallProgress.value = 0
            downloadSpeed.value = ""
            ui.showSuccessMessage(t("game-update.pre_download_complete", { size: formatSize(packageInfo.size) }))
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
     * 页面刷新后按预下载目标的进度文件恢复下载展示。
     * @returns 是否恢复了预下载进度
     */
    async function resumePreDownloadProgress() {
        if (!needPreDownload.value || !preFullPackageInfo.value) return false
        const prePackage = activePrePackage.value
        if (!prePackage) return false
        const fullFilePath = `${fullPackageDownloadDir.value}${prePackage.fileName}`
        const progress = await getDownloadProgress(fullFilePath)
        if (!progress.hasProgressFile) return false
        await prepareCurrentDownloadFile(fullFilePath, prePackage.fileName, prePackage.size, 0, prePackage.size, prePackage.downloadUrl)
        isDownloading.value = progress.active
        isPauseRequested.value = progress.active && progress.paused
        isDownloadPaused.value = progress.paused && !progress.active
        isRecoveredActiveDownload.value = progress.active
        activeDownloadAction.value = "pre"
        return true
    }
    //#endregion

    /** 热更补丁根目录（按渠道分区）。 */
    const hotUpdatePatchRootDir = computed(() => {
        const activeChannel = getActiveChannel()
        if (!gamePath.value || !activeChannel) return ""
        return `${gamePath.value}\\DNA Game\\EM\\EMPatches\\Paks\\CN\\${activeChannel}\\Patch\\`
    })

    /**
     * 构建指定热更版本的缓存目录。
     * @param version 版本号
     * @returns 版本目录路径
     */
    function getHotUpdateVersionDir(version: number) {
        return `${hotUpdatePatchRootDir.value}${version}\\`
    }

    //#region 下载进度状态（完整包 / 预下载 / 热更 / 语音包共用）
    const isDownloading = ref(false)
    const activeDownloadAction = ref<"game" | "pre" | "hot" | "optional" | "">("")
    const activeOptionalSign = ref("")
    const isRecoveredActiveDownload = ref(false)
    const isDownloadPaused = ref(false)
    const isPauseRequested = ref(false)
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

    // 下载速度计算相关（非响应式）
    let lastDownloadedBytes = 0
    let lastTimestamp = 0
    //#endregion

    //#region 热更状态
    const needHotUpdate = ref(false)
    const hotUpdateSize = ref(0)
    const hotUpdateFiles = ref(0)
    const hotUpdateVersionListCache = ref<HotUpdateVersionListRes | null>(null)
    const hotUpdatePendingVersions = ref<number[]>([])
    const optionalPatchSignsCache = ref<OptionalPatchSignsRes>({ optionalPatchInfos: {} })
    /** 具体版本号（热更详情文件名 "_" 前缀，如 1.5.190.1），检查更新时顺带提取。 */
    const concreteVersion = ref<string | null>(null)
    //#endregion

    /** 总进度百分比（0-100）。 */
    const displayOverallProgressPercent = computed(() => Math.min(100, Math.max(0, Math.floor(overallProgress.value * 100))))

    /**
     * 格式化字节数为可读大小。
     * @param bytes 字节数
     * @returns 格式化后的字符串
     */
    function formatSize(bytes: number): string {
        if (bytes === 0) return "0 B"
        const k = 1024
        const sizes = ["B", "KB", "MB", "GB"]
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
    }

    /**
     * 计算当前下载速度。
     * @param currentBytes 当前累计已下载字节数
     * @returns 速度字符串
     */
    function calculateDownloadSpeed(currentBytes: number): string {
        const now = Date.now()
        const timeDiff = now - lastTimestamp
        if (timeDiff > 1000) {
            const bytesDiff = currentBytes - lastDownloadedBytes
            const speed = bytesDiff / (timeDiff / 1000)
            lastDownloadedBytes = currentBytes
            lastTimestamp = now
            return `${formatSize(speed)}/s`
        }
        return downloadSpeed.value
    }

    /**
     * 重置下载速度计算的基准点（新下载任务开始时调用）。
     */
    function resetSpeedBaseline() {
        lastDownloadedBytes = 0
        lastTimestamp = Date.now()
    }

    /**
     * 记录当前正在下载的文件信息并恢复断点进度。
     * @param filePath 文件路径
     * @param filename 文件名
     * @param expectedSize 预期大小
     * @param totalDownloadedBefore 本次下载任务开始前已下载字节数
     * @param totalSizeVal 本次下载任务总大小
     * @param fileUrl 文件下载地址
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

    //#region 热更辅助

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
     * 清理热更根目录下不在当前热更版本列表中的旧版本文件夹（含其中残留的语音包等文件）。
     * 仅处理目录名为纯数字的版本目录；无有效补丁根目录时跳过。
     * 内存中无版本列表缓存时（如仅下载语音包未做过热更检查）按当前远端列表兜底刷新一次。
     * 单个目录删除失败只记录日志，不影响主流程。
     */
    async function cleanupObsoleteHotUpdateVersionDirs() {
        const rootDir = hotUpdatePatchRootDir.value
        if (!rootDir) return
        let versionList = hotUpdateVersionListCache.value
        if (!versionList) {
            const activeChannel = getActiveChannel()
            if (!activeChannel || !gamePath.value) return
            try {
                versionList = await getHotUpdateVersionList(selectedCDN.value, activeChannel)
                hotUpdateVersionListCache.value = versionList
            } catch (err) {
                console.error("清理旧热更版本目录时获取版本列表失败，跳过:", err)
                return
            }
        }
        const keepVersions = new Set(getSortedHotUpdateVersions(versionList).map(version => version.patchVersion))
        if (!keepVersions.size) return
        let directories: string[]
        try {
            directories = await listDirectories(rootDir)
        } catch (err) {
            console.error("读取热更版本目录列表失败，跳过清理:", err)
            return
        }
        for (const dir of directories) {
            const version = Number(dir)
            // 只删除数字命名的版本目录，避免误删非热更目录
            if (!Number.isFinite(version) || keepVersions.has(version)) continue
            try {
                await removeDirAll(`${rootDir}${dir}\\`)
                console.log(`已删除不在当前热更列表中的旧版本目录: ${dir}`)
            } catch (err) {
                console.error(`删除旧热更版本目录 ${dir} 失败:`, err)
            }
        }
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
    async function saveHotUpdateVersionCache(
        version: number,
        pakInfo: HotUpdatePakFilesInfoRes,
        resDiscreteInfo: HotUpdatePakFilesInfoRes
    ) {
        try {
            const versionDir = getHotUpdateVersionDir(version)
            await writeTextFile(`${versionDir}PakFilesInfo.json`, JSON.stringify(pakInfo, null, 2))
            await writeTextFile(`${versionDir}ResDiscreteInfo.json`, JSON.stringify(resDiscreteInfo, null, 2))
        } catch (err) {
            console.error("保存热更版本缓存失败:", err)
        }
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

    /**
     * 写入单个语音包下载状态缓存。
     * @param sign 语音包签名
     */
    async function markOptionalPatchDownloaded(sign: string) {
        const localVersions = await listLocalHotUpdateVersions()
        const version = localVersions.at(-1) ?? 0
        await markOptionalPatchesDownloaded([sign], version)
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
     * 提取热更详情中任意一个文件名的 "_" 前缀作为具体版本号（如 1.5.190.1_xxx.pak → 1.5.190.1）。
     * @param pakInfo 热更文件清单
     * @returns 具体版本号，无含 "_" 的文件名时返回 null
     */
    function extractConcreteVersion(pakInfo: HotUpdatePakFilesInfoRes): string | null {
        const fileName = pakInfo.pakFilesMap.WindowsNoEditor?.pakFileInfos.find(file => file.fileName.includes("_"))?.fileName
        if (!fileName) return null
        const prefix = fileName.split("_")[0]
        return prefix || null
    }
    //#endregion

    //#region 热更检查

    /**
     * 检查当前渠道是否存在可用热更，以及本地补丁文件是否已经完整。
     * 顺带从最新热更详情中提取具体版本号（文件名 "_" 前缀）供展示，不额外请求。
     */
    async function checkHotUpdateStatus() {
        const activeChannel = getActiveChannel()
        if (!gamePath.value || !activeChannel) {
            needHotUpdate.value = false
            hotUpdateSize.value = 0
            hotUpdateFiles.value = 0
            hotUpdatePendingVersions.value = []
            concreteVersion.value = null
            return
        }
        try {
            const hotUpdateVersionList = await getHotUpdateVersionList(selectedCDN.value, activeChannel)
            hotUpdateVersionListCache.value = hotUpdateVersionList
            const sortedVersions = getSortedHotUpdateVersions(hotUpdateVersionList)
            // 并行检查所有版本是否已安装，再按顺序求首个未安装版本之前的连续已安装序列末尾
            const installStates = await Promise.all(sortedVersions.map(version => isHotUpdateVersionInstalled(version.patchVersion)))
            let localLatestVersion = 0
            for (const [index, installed] of installStates.entries()) {
                if (!installed) break
                localLatestVersion = sortedVersions[index].patchVersion
            }
            const pendingVersions = sortedVersions.filter(version => version.patchVersion > localLatestVersion)
            hotUpdatePendingVersions.value = pendingVersions.map(version => version.patchVersion)

            // 远端版本列表已是最新，清理不在列表中的旧版本目录（含热更下载完成后残留的老版本文件）
            await cleanupObsoleteHotUpdateVersionDirs()

            // 提取最新热更版本的具体版本号（检查更新过程必然请求热更信息，顺带复用）
            const latestHotUpdateVersion = sortedVersions.at(-1)
            concreteVersion.value = latestHotUpdateVersion
                ? extractConcreteVersion(
                      await getHotUpdatePakFilesInfo(selectedCDN.value, activeChannel, latestHotUpdateVersion.patchVersion)
                  )
                : null

            if (!pendingVersions.length) {
                needHotUpdate.value = false
                hotUpdateSize.value = 0
                hotUpdateFiles.value = 0
                return
            }

            await loadOptionalPatchSignsCache()
            const downloadedOptionalSigns = getDownloadedOptionalSigns()

            let allFilesComplete = true
            let totalSizeBytes = 0
            let totalFileCount = 0
            for (const version of pendingVersions) {
                const hotUpdatePakInfo = await getHotUpdatePakFilesInfo(selectedCDN.value, activeChannel, version.patchVersion)
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
        } catch (error) {
            console.error("检查热更状态时出错:", error)
            needHotUpdate.value = true
            hotUpdateSize.value = 0
            hotUpdateFiles.value = 0
            hotUpdatePendingVersions.value = []
        }
    }
    //#endregion

    //#region 热更下载

    /**
     * 下载全部待安装的热更版本（含断点续传、后台 hash 校验与版本缓存写入）。
     */
    async function downloadHotUpdate() {
        const activeChannel = getActiveChannel()
        if (!activeChannel) {
            ui.showErrorMessage("请先填写自定义 channel")
            return
        }
        if (!gamePath.value) {
            ui.showErrorMessage("请先选择游戏目录")
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
                        pendingHashChecks.push(() =>
                            queueExistingFileHashCheck(fullFilePath, file.fileSize, file.hash, filesToDownload, file)
                        )
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
            ui.showErrorMessage(`热更下载失败: ${err instanceof Error ? err.message : String(err)}`)
            console.error("热更失败:", err)
            isDownloading.value = false
            downloadSpeed.value = ""
        }
    }
    //#endregion

    return {
        CUSTOM_CHANNEL_VALUE,
        selectedCDN,
        selectedChannel,
        customChannel,
        concurrentThreads,
        isCustomChannelSelected,
        getActiveChannel,
        availableCDN,
        ensureValidCDN,
        channelGamePathMap,
        migrateLegacyGamePath,
        syncGamePathByChannel,
        saveChannelGamePath,
        syncLauncherInputs,
        gamePath,
        fullPackageDownloadDir,
        fullPackageInfo,
        preFullPackageInfo,
        diffPackageInfo,
        preDiffPackageInfo,
        activeBasePackage,
        needUpdate,
        updateSize,
        needPreDownload,
        preTotalSize,
        preTotalFiles,
        resetPackageUpdateState,
        refreshPackageInfo,
        refreshUpdateTargets,
        checkPreDownloadStatus,
        getBasePackageCandidates,
        downloadPreDownloadPackage,
        resumePreDownloadProgress,
        hotUpdatePatchRootDir,
        getHotUpdateVersionDir,
        isDownloading,
        activeDownloadAction,
        activeOptionalSign,
        isRecoveredActiveDownload,
        isDownloadPaused,
        isPauseRequested,
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
        displayOverallProgressPercent,
        needHotUpdate,
        hotUpdateSize,
        hotUpdateFiles,
        hotUpdateVersionListCache,
        hotUpdatePendingVersions,
        optionalPatchSignsCache,
        concreteVersion,
        formatSize,
        calculateDownloadSpeed,
        resetSpeedBaseline,
        prepareCurrentDownloadFile,
        pauseCurrentDownload,
        markDownloadPaused,
        markDownloadAlreadyActive,
        canSkipBeforeHashCheck,
        throwIfPauseRequested,
        queueExistingFileHashCheck,
        startPendingHashChecks,
        getHotUpdateAssetUrl,
        listLocalHotUpdateVersions,
        cleanupObsoleteHotUpdateVersionDirs,
        loadOptionalPatchSignsCache,
        getDownloadedOptionalSigns,
        getHotUpdateFilesToDownload,
        isHotUpdateVersionInstalled,
        saveHotUpdateVersionListCache,
        saveHotUpdateVersionCache,
        markOptionalPatchesDownloaded,
        markOptionalPatchDownloaded,
        extractConcreteVersion,
        getSortedHotUpdateVersions,
        checkHotUpdateStatus,
        downloadHotUpdate,
    }
})
