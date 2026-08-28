import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { deleteFile, getFileSize, listDirectories, listFiles, readTextFile, writeTextFile } from "../api/app"
import {
    CDN_LIST,
    downloadHotUpdateAssets,
    getDownloadProgress,
    getFullPackageInfo,
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
} from "../utils/game-download"
import { useGameStore } from "./game"
import { useUIStore } from "./ui"

const CUSTOM_CHANNEL_VALUE = "__custom_channel__"

/**
 * 游戏更新 Store：热更「检查 + 下载」的公共逻辑，供完整启动器（GameUpdate.vue）与
 * 首页迷你启动器（MiniGameLauncher.vue）共用，避免各自维护一套热更请求与下载编排。
 * 包含：下载进度状态、热更版本检查（含具体版本号提取）、热更下载、语音包签名缓存。
 */
export const useGameUpdateStore = defineStore("gameUpdate", () => {
    const gameStore = useGameStore()
    const ui = useUIStore()

    // 与更新页共用同一份 CDN / 服务器 / 并发配置（localStorage 同名 key 天然共享）
    const selectedCDN = useLocalStorage("selectedCDN", CDN_LIST[1].url)
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
        return cdn?.name === "海外" || cdn?.name === "AWS"
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

    /**
     * 获取当前渠道生效的完整包信息（自定义 channel 时解析 selectedChannel.custom，
     * 并先校正 CDN 到可用列表；无有效 channel 时返回 null）。两个启动器共用同一实现。
     * @returns 完整包信息或 null
     */
    async function getFullPackageInfoForActiveChannel() {
        const activeChannel = getActiveChannel()
        if (!activeChannel) return null
        ensureValidCDN()
        return await getFullPackageInfo(selectedCDN.value, activeChannel)
    }

    /** 游戏安装根目录（由 EM.exe 路径推导）。 */
    const gamePath = computed(() => gameStore.path.replace(/\\DNA Game\\EM\.exe/, ""))

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
        getFullPackageInfoForActiveChannel,
        gamePath,
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
