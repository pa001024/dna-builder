<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import * as dialog from "@tauri-apps/plugin-dialog"
import { useLocalStorage } from "@vueuse/core"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useUIStore } from "@/store/ui"
import { cleanupTempDir, getFileSize, readTextFile, writeTextFile } from "../api/app"
import { useGameStore } from "../store/game"
import {
    CDN_LIST,
    type DownloadProgress,
    downloadAssets,
    GameVersionListLocal,
    type GameVersionListRes,
    getBaseVersion,
} from "../utils/game-download"

// 状态管理
const gameStore = useGameStore()
const ui = useUIStore()
const versionList = ref<{
    subVersion: string
    gameVersionList: GameVersionListRes
} | null>(null)
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

const channels = [
    {
        name: "正式服",
        value: "PC_OBT_CN_Pub",
    },
    {
        name: "1.2媒体服",
        value: "PC_OBT12_Media_CN_Pub",
    },
]

const selectedChannel = useLocalStorage("selectedChannel", channels[0].value)
const selectedCDN = useLocalStorage("selectedCDN", CDN_LIST[1].url)

watch(selectedChannel, fetchVersionList)

// 计算属性
const gamePath = computed(() => gameStore.path.replace(/\\DNA Game\\EM\.exe/, ""))
const tempDownloadDir = computed(() => {
    if (!gamePath.value) return ""
    return `${gamePath.value}\\DNA Game\\TempPath\\`
})
const extractDir = computed(() => {
    if (!gamePath.value) return ""
    return `${gamePath.value}\\DNA Game\\`
})
const baseVersionPath = computed(() => {
    if (!gamePath.value) return ""
    return `${gamePath.value}\\DNA Game\\BaseVersion.json`
})

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的大小字符串
 */
function formatSize(bytes: number): string {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

/**
 * 计算下载速度
 * @param currentBytes 当前已下载字节数
 * @returns 格式化后的下载速度字符串
 */
function calculateDownloadSpeed(currentBytes: number): string {
    const now = Date.now()
    const timeDiff = now - lastTimestamp

    if (timeDiff > 1000) {
        // 每秒计算一次
        const bytesDiff = currentBytes - lastDownloadedBytes
        const speed = bytesDiff / (timeDiff / 1000)

        lastDownloadedBytes = currentBytes
        lastTimestamp = now

        return formatSize(speed) + "/s"
    }

    return downloadSpeed.value
}

/**
 * 获取版本列表
 */
async function fetchVersionList() {
    isLoading.value = true

    try {
        versionList.value = await getBaseVersion(selectedCDN.value, selectedChannel.value)
        calculateTotalSize()
    } catch (err) {
        ui.showErrorMessage(`获取版本列表失败: ${err instanceof Error ? err.message : String(err)}`)
        console.error("获取版本列表失败:", err)
    } finally {
        isLoading.value = false
    }
}

/**
 * 计算总文件大小
 */
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
}

/**
 * 检查是否需要更新
 */
async function checkForUpdates() {
    if (!gamePath.value) return

    try {
        // 读取本地 BaseVersion.json
        const localContent = await readTextFile(baseVersionPath.value)
        const localVersionList = JSON.parse(localContent) as GameVersionListLocal
        // 对比版本信息
        if (versionList.value && localVersionList) {
            const remoteVersions = versionList.value.gameVersionList.GameVersionList["1"].GameVersionList
            const localVersions = localVersionList.gameVersionList["1"].gameVersionList

            // 检查是否需要更新
            let hasUpdate = false
            let updateSizeBytes = 0

            for (const [filename, remoteAsset] of Object.entries(remoteVersions)) {
                if (localVersions[filename]) {
                    // 对比版本号
                    if (remoteAsset.ZipGameVersion > localVersions[filename].ZipGameVersion) {
                        hasUpdate = true
                        updateSizeBytes += remoteAsset.ZipSize
                    }
                } else {
                    // 本地不存在该文件，需要下载
                    hasUpdate = true
                    updateSizeBytes += remoteAsset.ZipSize
                }
            }

            needUpdate.value = hasUpdate
            updateSize.value = updateSizeBytes
        }
    } catch (err) {
        // 如果本地文件不存在或读取失败，默认为需要更新
        needUpdate.value = true
        updateSize.value = totalSize.value
        console.error("检查更新失败:", err)
    }
}

/**
 * 更新完成后更新 BaseVersion.json 文件
 */
async function updateBaseVersionFile() {
    if (!gamePath.value || !versionList.value) return

    try {
        // 将 GameVersionListRes 转换为 GameVersionListLocal
        const localVersionList: GameVersionListLocal = {
            gameVersionList: {
                "1": {
                    gameVersionList: versionList.value.gameVersionList.GameVersionList["1"].GameVersionList,
                },
            },
        }

        const content = JSON.stringify(localVersionList, null, 2)
        await writeTextFile(baseVersionPath.value, content)
        ui.showSuccessMessage("更新成功")
    } catch (err) {
        ui.showErrorMessage(`更新 BaseVersion.json 失败: ${err instanceof Error ? err.message : String(err)}`)
        console.error("更新 BaseVersion.json 失败:", err)
    }
}

/**
 * 选择游戏目录
 */
async function selectGameDir() {
    try {
        // 打开目录选择对话框
        const selected = await dialog.open({
            title: "选择游戏安装目录",
            multiple: false,
            directory: true,
        })

        if (selected) {
            // 构建 EM.exe 的路径
            const emExePath = `${selected}\\DNA Game\\EM.exe`

            // 直接设置游戏路径
            gameStore.path = emExePath
            ui.showSuccessMessage(`游戏目录设置成功: ${emExePath}`)

            // 检查是否需要更新
            if (versionList.value) {
                await checkForUpdates()
            }
        }
    } catch (err) {
        ui.showErrorMessage(`选择目录失败: ${err instanceof Error ? err.message : String(err)}`)
        console.error("选择目录失败:", err)
    }
}

/**
 * 下载所有文件
 */
async function downloadAllFiles() {
    if (!gamePath.value) {
        ui.showErrorMessage("请先选择游戏安装目录")
        return
    }

    if (!versionList.value) {
        ui.showErrorMessage("版本列表未加载")
        return
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

            // 构建完整的文件路径
            const fullFilePath = `${tempDownloadDir.value}${filename}`

            // 检查文件是否已存在且大小匹配
            const actualSize = await getFileSize(fullFilePath)
            const expectedSize = assets.ZipSize

            // 如果文件已存在且大小匹配，则跳过下载
            if (actualSize > 0 && actualSize === expectedSize) {
                console.debug(`文件 ${filename} 已存在且大小匹配，跳过下载`)

                // 更新整体下载进度
                const fileIndex = files.findIndex(([name]) => name === filename)
                const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
                const totalDownloaded = previousFilesSize + expectedSize
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / totalSize.value

                // 触发一次100%进度回调
                fileProgress.value = 1
                currentFileDownloaded.value = formatSize(expectedSize)
                currentFileTotal.value = formatSize(expectedSize)

                // 保存最后下载的文件路径
                lastDownloadedFile.value = fullFilePath

                continue
            }

            // 下载进度回调
            const onProgress = (progress: DownloadProgress) => {
                // 计算当前文件的下载进度
                fileProgress.value = progress.downloaded / progress.total
                currentFileDownloaded.value = formatSize(progress.downloaded)
                currentFileTotal.value = formatSize(progress.total)

                // 更新整体下载进度
                const fileDownloaded = progress.downloaded
                const estimatedTotal = totalSize.value

                // 计算已下载的比例
                const fileIndex = files.findIndex(([name]) => name === filename)
                const previousFilesSize = files.slice(0, fileIndex).reduce((sum, [, asset]) => sum + asset.ZipSize, 0)
                const totalDownloaded = previousFilesSize + fileDownloaded
                currentDownloaded.value = totalDownloaded
                overallProgress.value = totalDownloaded / estimatedTotal

                // 计算下载速度
                downloadSpeed.value = calculateDownloadSpeed(totalDownloaded)
            }

            // 执行下载
            const result = await downloadAssets(
                selectedCDN.value,
                filename,
                selectedChannel.value,
                versionList.value.subVersion,
                onProgress,
                tempDownloadDir.value
            )
            console.debug("下载结果:", result)

            // 保存最后下载的文件路径
            lastDownloadedFile.value = `${tempDownloadDir.value}/${filename}`
        }

        // 重置状态
        isDownloading.value = false
        currentFile.value = ""
        downloadSpeed.value = ""

        // 下载完成后自动执行解压缩
        await extractAllFiles()

        // 更新 BaseVersion.json 文件
        await updateBaseVersionFile()

        // 重新检查更新状态
        await checkForUpdates()
    } catch (err) {
        ui.showErrorMessage(`下载失败: ${err instanceof Error ? err.message : String(err)}`)
        console.error("下载失败:", err)
        isDownloading.value = false
        downloadSpeed.value = ""
    }
}

/**
 * 解压缩所有下载的文件
 */
async function extractAllFiles() {
    if (!gamePath.value) {
        ui.showErrorMessage("请先选择游戏安装目录")
        return
    }

    if (!versionList.value) {
        ui.showErrorMessage("版本列表未加载")
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

            // 更新总体进度（基于文件数量）
            overallProgress.value = (i + 1) / totalFilesCount

            console.debug(`开始解压缩: ${filename}, 进度: ${Math.round(overallProgress.value * 100)}%`)

            // 调用后端解压缩命令
            const result = await invoke<string>("extract_game_assets", {
                zipPath,
                targetDir,
            })

            console.debug("解压缩结果:", result)
        }

        // 清理临时目录
        if (tempDownloadDir.value) {
            try {
                const cleanupResult = await cleanupTempDir(tempDownloadDir.value)
                console.debug("临时目录清理结果:", cleanupResult)
            } catch (err) {
                console.error("临时目录清理失败:", err)
            }
        }

        // 重置状态
        isExtracting.value = false
        overallProgress.value = 0
        extractionCurrentFileCount.value = 0
        extractionCurrentSize.value = 0
        extractionTotalFiles.value = 0
        extractionTotalSize.value = 0
        extractionCurrentFile.value = ""
        ui.showSuccessMessage(`所有文件下载和解压缩成功，总大小: ${formatSize(totalSize.value)}`)
    } catch (err) {
        ui.showErrorMessage(`解压缩失败: ${err instanceof Error ? err.message : String(err)}`)
        console.error("解压缩失败:", err)
        isExtracting.value = false
    }
}

// 组件挂载时获取版本列表
onMounted(async () => {
    await fetchVersionList()
    // 检查是否需要更新
    await checkForUpdates()

    // 监听解压缩进度事件
    const unlisten = await listen("extract_progress", event => {
        const payload = event.payload as {
            current_file_count: number
            current_size: number
            total_files: number
            total_size: number
            current_file: string
        }

        const { current_file_count, current_size, total_files, total_size, current_file } = payload

        // 更新解压缩进度状态（单个压缩包内的进度）
        extractionCurrentFileCount.value = current_file_count
        extractionCurrentSize.value = current_size
        extractionTotalFiles.value = total_files
        extractionTotalSize.value = total_size
        extractionCurrentFile.value = current_file

        // 注意：整体进度由 extractAllFiles 函数通过文件数量来更新

        console.debug("单个压缩包解压缩进度:", payload)
    })

    // 组件卸载时移除监听器
    onUnmounted(() => {
        unlisten()
    })
})
</script>
<template>
    <ScrollArea class="h-full p-6">
        <div class="space-y-4">
            <!-- 游戏目录设置 -->
            <div class="bg-base-100/50 backdrop-blur-sm rounded-xl border border-base-200 p-6 shadow-lg space-y-4">
                <div class="flex flex-col md:flex-row items-start gap-4">
                    <div>
                        <p class="text-gray-400 mb-2">服务器</p>
                        <Select v-model="selectedChannel" class="w-40 input">
                            <SelectItem v-for="channel in channels" :key="channel.value" :value="channel.value">
                                {{ channel.name }}
                            </SelectItem>
                        </Select>
                    </div>
                    <div>
                        <p class="text-gray-400 mb-2">CDN</p>
                        <Select v-model="selectedCDN" class="w-40 input">
                            <SelectItem v-for="cdn in CDN_LIST" :key="cdn.url" :value="cdn.url">
                                {{ cdn.name }}
                            </SelectItem>
                        </Select>
                    </div>
                    <div class="flex-1">
                        <p class="text-gray-400 mb-2">游戏安装目录</p>
                        <div class="input input-bordered input-primary w-full">
                            {{ gamePath || "未设置" }}
                            <button
                                @click="selectGameDir"
                                class="ml-auto hover:text-primary transition-colors duration-300 flex gap-2 rounded-md p-2 cursor-pointer"
                            >
                                <Icon icon="ri:folder-line" class="w-5 h-5 mr-2" />
                                选择目录
                            </button>
                        </div>
                        <p class="opacity-60 text-xs mt-2">
                            {{ gamePath ? `游戏将下载到${gamePath}\\DNA Game文件夹` : `游戏将下载到该文件夹下的DNA Game文件夹` }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- 资源概览 -->
            <div v-if="versionList" class="bg-base-100/50 backdrop-blur-sm rounded-xl border border-base-200 p-6 shadow-lg space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-base-200 rounded-lg p-4 border border-base-300">
                        <p class="text-gray-400 text-sm">文件总数</p>
                        <p class="text-3xl font-bold text-primary">{{ totalFiles }}</p>
                    </div>
                    <div class="bg-base-200 rounded-lg p-4 border border-base-300">
                        <p class="text-gray-400 text-sm">总文件大小</p>
                        <p class="text-3xl font-bold text-secondary">{{ formatSize(totalSize) }}</p>
                    </div>
                    <div class="bg-base-200 rounded-lg p-4 border border-base-300">
                        <p class="text-gray-400 text-sm">目标目录</p>
                        <p class="text-xl font-bold text-success truncate">
                            {{ extractDir || "未设置" }}
                        </p>
                    </div>
                </div>

                <!-- 更新检查和操作按钮 -->
                <div v-if="gamePath" class="space-y-4">
                    <div v-if="needUpdate" class="bg-warning/30 border border-warning/50 rounded-lg p-4">
                        <div class="flex items-start">
                            <Icon icon="ri:error-warning-line" class="w-6 h-6 text-warning mr-3" />
                            <div>
                                <h3 class="font-semibold text-warning mb-1">游戏需要更新</h3>
                                <p class="text-gray-300">发现新版本，需要更新的大小：{{ formatSize(updateSize) }}</p>
                            </div>
                        </div>
                    </div>
                    <div v-else-if="gamePath && !needUpdate" class="bg-success/30 border border-success/50 rounded-lg p-4">
                        <div class="flex items-start">
                            <Icon icon="ri:checkbox-circle-line" class="w-6 h-6 text-success mr-3" />
                            <div>
                                <h3 class="font-semibold text-success mb-1">游戏已最新</h3>
                                <p class="text-gray-300">当前版本无需更新</p>
                            </div>
                        </div>
                    </div>

                    <button
                        v-if="gamePath && needUpdate"
                        @click="downloadAllFiles()"
                        class="w-full btn btn-lg btn-primary"
                        :disabled="isDownloading || isExtracting || !gamePath || !needUpdate"
                    >
                        <Icon v-if="isDownloading" icon="ri:refresh-line" class="w-5 h-5 mr-2 animate-spin" />
                        <Icon v-else-if="isExtracting" icon="ri:box-3-line" class="w-5 h-5 mr-2 animate-spin" />
                        <Icon v-else icon="ri:download-2-line" class="w-5 h-5 mr-2" />
                        {{ isDownloading ? "下载中..." : isExtracting ? "解压缩中..." : needUpdate ? "更新游戏" : "无需更新" }}
                    </button>
                </div>
                <div v-else>请先选择游戏目录</div>
            </div>

            <!-- 下载/解压缩进度 -->
            <div
                v-if="isDownloading || isExtracting"
                class="bg-base-100/50 backdrop-blur-sm rounded-xl border border-base-200 p-6 shadow-lg space-y-4"
            >
                <h2 class="text-2xl font-bold flex items-center">
                    <span class="w-8 h-8 rounded-full bg-success flex items-center justify-center mr-2">
                        <Icon v-if="isDownloading" icon="ri:download-2-line" class="w-5 h-5 text-white" />
                        <Icon v-else icon="ri:box-3-line" class="w-5 h-5 text-white" />
                    </span>
                    {{ isDownloading ? "下载进度" : "解压缩进度" }}
                </h2>

                <!-- 整体进度 -->
                <div>
                    <div class="flex justify-between mb-2">
                        <span class="opacity-80">{{ isDownloading ? "整体下载进度" : "解压缩进度" }}</span>
                        <span class="text-primary font-semibold">{{ Math.round(overallProgress * 100) }}%</span>
                    </div>
                    <div class="w-full bg-base-200 rounded-full h-3 border border-base-300 overflow-hidden">
                        <div
                            class="bg-linear-to-br from-primary to-secondary h-full transition-all duration-300 ease-out"
                            :style="{ width: `${overallProgress * 100}%` }"
                        ></div>
                    </div>
                    <div class="flex justify-between mt-2 text-sm">
                        <span class="opacity-80">
                            {{
                                isDownloading
                                    ? `${formatSize(currentDownloaded)} / ${formatSize(totalSize)}`
                                    : `${formatSize(extractionCurrentSize)} / ${formatSize(extractionTotalSize)}`
                            }}
                        </span>
                        <span v-if="isDownloading && downloadSpeed" class="text-success">
                            {{ downloadSpeed }}
                        </span>
                        <span v-else-if="isExtracting" class="text-success">
                            {{ extractionCurrentFile }} : {{ extractionCurrentFileCount }} / {{ extractionTotalFiles }} 文件
                        </span>
                    </div>
                </div>

                <!-- 当前文件进度 -->
                <div v-if="isDownloading && currentFile" class="bg-base-200/70 rounded-lg p-4 border border-base-300">
                    <h3 class="text-lg font-semibold mb-3 text-secondary">{{ currentFile }}</h3>
                    <div class="w-full bg-base-300 rounded-full h-2 overflow-hidden mb-2">
                        <div
                            class="bg-linear-to-br from-secondary to-accent h-full transition-all duration-300 ease-out"
                            :style="{ width: `${fileProgress * 100}%` }"
                        ></div>
                    </div>
                    <div class="flex justify-between text-xs text-gray-400">
                        <span>{{ currentFileDownloaded }} / {{ currentFileTotal }}</span>
                        <span>{{ Math.round(fileProgress * 100) }}%</span>
                    </div>
                </div>
            </div>

            <!-- 加载状态 -->
            <div v-if="isLoading" class="flex justify-center items-center py-16">
                <div
                    class="w-16 h-16 border-4 border-t-primary border-r-secondary border-b-accent border-l-primary rounded-full animate-spin"
                ></div>
            </div>

            <!-- 未加载版本列表时的提示 -->
            <div v-if="!isLoading && !versionList" class="flex justify-center items-center py-16">
                <div class="text-center">
                    <Icon icon="ri:refresh-line" class="w-24 h-24 mb-4 animate-spin" />
                    <p class="text-gray-400 text-lg">正在加载版本列表...</p>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
