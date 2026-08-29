<script lang="ts" setup>
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import { MATERIALS } from "@/api/app"
import SafeModeQuizDialog from "@/components/SafeModeQuizDialog.vue"
import { clearAllDataPackOpfs, getInstalledDataPackVersions, getMergedDataPackVersions } from "@/data/data-pack"
import { deleteImgsCache, imgsDownloadState } from "@/data/imgs-runtime"
import { closeSafeMode, openSafeMode } from "@/data/versionGate"
import { env } from "@/env"
import { i18nLanguages } from "@/i18n"
import { useDataPackStore } from "@/store/dataPack"
import { db } from "@/store/db"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { cssQuoteFamily, customFontCssFamily } from "@/utils/font-storage"

const setting = useSettingStore()
const ui = useUIStore()
const dataPack = useDataPackStore()
const isUpdatingLaunchAtStartup = ref(false)
const safeModeQuizOpen = ref(false)
const dataPackFileInput = ref<HTMLInputElement | null>(null)
const dataPackSourceBaseUrl = ref("")
const dataPackSourceKind = ref<"official" | "custom">("custom")
const CDN_DATA_PACK_BASE_URL = "https://cdn.dna-builder.cn/data-pack"
const versionDragUrls = ref<Record<string, string>>({})
const sourceSaveTimer = ref<number | null>(null)
const isApplyingSourceUpdate = ref(false)
const isClearingDataPackOpfs = ref(false)
const formatSize = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 })
const dataPackLoadingRemoteVersions = ref(false)

const imgsDownloadSummary = computed(() => {
    const state = imgsDownloadState.value
    if (!state.active) {
        return ""
    }

    const speed = state.speedBps > 0 ? `${formatSize.format(state.speedBps / 1024 / 1024)} MB/s` : "0 MB/s"
    const size = state.bytesTotal > 0 ? `${formatSize.format(state.bytesTotal / 1024 / 1024)} MB` : "--"

    if (state.stage === "pack-current") {
        return `包 ${state.version} · ${state.currentPackFiles} 张 · ${size} · ${speed}`
    }

    return `单图 ${state.completed} / ${state.total} · ${speed}`
})

const imgsDownloadProgressLabel = computed(() => {
    const state = imgsDownloadState.value
    if (!state.active && state.total === 0) {
        return ""
    }

    if (state.stage === "pack-current") {
        return state.completed >= state.total && state.total > 0 ? "图片包下载完成" : `图片包 ${state.version} 下载中`
    }

    return state.completed >= state.total && state.total > 0 ? "图片下载完成" : "图片下载中"
})

const imgsDownloadProgressValue = computed(() => {
    const state = imgsDownloadState.value
    if (state.stage === "pack-current" && state.bytesTotal > 0) {
        return Math.round((state.bytesDownloaded / state.bytesTotal) * 100)
    }

    if (!state.total) {
        return 0
    }

    return Math.round((state.completed / state.total) * 100)
})

const dataPackVersions = computed(() => {
    const versions = dataPack.status?.versions || []
    return [...versions].sort((a, b) => b.version.localeCompare(a.version, "zh-CN", { numeric: true }))
})

// 数据包版本列表分页：每页最多展示的版本数
const DATA_PACK_PAGE_SIZE = 6
// 数据包版本列表当前页码（从 1 开始）
const dataPackPage = ref(1)

/**
 * 数据包版本列表总页数（至少为 1）。
 */
const dataPackTotalPages = computed(() => Math.max(1, Math.ceil(dataPackVersions.value.length / DATA_PACK_PAGE_SIZE)))

/**
 * 收敛后的当前页码：列表刷新导致页码越界时自动回落到最后一页。
 */
const currentDataPackPage = computed(() => Math.min(dataPackPage.value, dataPackTotalPages.value))

/**
 * 当前页展示的数据包版本切片。
 */
const pagedDataPackVersions = computed(() => {
    const start = (currentDataPackPage.value - 1) * DATA_PACK_PAGE_SIZE
    return dataPackVersions.value.slice(start, start + DATA_PACK_PAGE_SIZE)
})

/**
 * 切换数据包版本列表页码。
 * @param page 目标页码（1 起）
 */
function gotoDataPackPage(page: number) {
    dataPackPage.value = Math.min(Math.max(1, page), dataPackTotalPages.value)
}

const installedDataPackVersions = computed(() => {
    return new Set(dataPack.installedVersions)
})

const lightThemes = [
    "light",
    "lofi",
    "cupcake",
    "retro",
    "valentine",
    "garden",
    "aqua",
    "pastel",
    "wireframe",
    "winter",
    "cyberpunk",
    "corporate",
    "bumblebee",
    "emerald",
    "fantasy",
    "cmyk",
    "autumn",
    "acid",
    "lemonade",
    "ez",
]
const darkThemes = ["dark", "black", "synthwave", "halloween", "forest", "dracula", "business", "night", "coffee"]

watch(
    () => setting.winMaterial,
    v => setting.setWinMaterial(v)
)

watch(
    () => dataPack.sourceInfo?.baseUrl,
    v => {
        dataPackSourceBaseUrl.value = v || ""
    },
    { immediate: true }
)

watch(
    () => dataPack.sourceInfo?.sourceKind,
    v => {
        dataPackSourceKind.value = v || "custom"
    },
    { immediate: true }
)

watch(
    () => dataPackSourceKind.value,
    kind => {
        if (kind === "official") {
            dataPackSourceBaseUrl.value = CDN_DATA_PACK_BASE_URL
        } else if (!dataPackSourceBaseUrl.value || dataPackSourceBaseUrl.value === CDN_DATA_PACK_BASE_URL) {
            dataPackSourceBaseUrl.value = "/mock/data-pack"
        }
    },
    { immediate: true }
)

watch(
    () => dataPackSourceBaseUrl.value,
    () => {
        if (isApplyingSourceUpdate.value) {
            return
        }

        if (sourceSaveTimer.value) {
            window.clearTimeout(sourceSaveTimer.value)
        }

        if (dataPackSourceKind.value === "official") {
            return
        }

        sourceSaveTimer.value = window.setTimeout(() => {
            void saveSourceBaseUrl()
        }, 600)
    }
)

function capitalize(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

// 自定义底图文件选择器引用
const wallpaperFileInput = ref<HTMLInputElement | null>(null)

/**
 * 打开自定义底图的文件选择器。
 */
function pickWallpaper() {
    wallpaperFileInput.value?.click()
}

/**
 * 清除自定义底图。
 */
async function clearWallpaper() {
    try {
        await setting.clearCustomWallpaper()
    } catch (error) {
        console.error("清除自定义底图失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
}

/**
 * 处理底图文件选择：压缩后写入 OPFS，失败时提示错误。
 * @param event 文件输入变更事件
 */
async function onWallpaperFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) {
        return
    }
    if (!file.type.startsWith("image/")) {
        ui.showErrorMessage("请选择图片文件")
        return
    }

    try {
        const dataUrl = await compressImageToDataUrl(file)
        await setting.setCustomWallpaper(dataUrl)
        ui.showSuccessMessage("自定义底图已更新")
    } catch (error) {
        console.error("解析自定义底图失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
}

/**
 * 将图片文件压缩为适合本地存储的 JPEG 数据 URL。
 * 最长边不超过 1920px，透明区域填充白色（JPEG 不支持透明）。
 * @param file 图片文件
 * @returns 压缩后的数据 URL
 */
function compressImageToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error("读取图片失败"))
        reader.onload = () => {
            const img = new Image()
            img.onerror = () => reject(new Error("解析图片失败"))
            img.onload = () => {
                // 限制最长边，控制底图体积
                const MAX_EDGE = 1920
                const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
                const canvas = document.createElement("canvas")
                canvas.width = Math.max(1, Math.round(img.width * scale))
                canvas.height = Math.max(1, Math.round(img.height * scale))
                const ctx = canvas.getContext("2d")
                if (!ctx) {
                    reject(new Error("无法创建画布上下文"))
                    return
                }
                ctx.fillStyle = "#ffffff"
                ctx.fillRect(0, 0, canvas.width, canvas.height)
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                resolve(canvas.toDataURL("image/jpeg", 0.85))
            }
            img.src = String(reader.result)
        }
        reader.readAsDataURL(file)
    })
}

// 自定义字体：Select 中表示“默认字体”的哨兵值（空字符串值在部分组件中不可用）
const FONT_DEFAULT_VALUE = "__default__"
// 自定义字体：系统字体列表为空/加载中时的占位条目值
const FONT_SYSTEMS_EMPTY_VALUE = "__empty__"
// 自定义字体文件选择器引用
const fontFileInput = ref<HTMLInputElement | null>(null)
// Select 双向绑定：空字符串与哨兵值互转
const selectedFontFamily = computed({
    get: () => setting.appFontFamily || FONT_DEFAULT_VALUE,
    set: (value: string) => setting.setAppFontFamily(value === FONT_DEFAULT_VALUE ? "" : value),
})
// 当前选择是否为上传的自定义字体（决定显示“删除”还是“清除”按钮）
const isCustomFontSelected = computed(() => setting.customFonts.some(meta => customFontCssFamily(meta) === setting.appFontFamily))

/**
 * 打开自定义字体的文件选择器。
 */
function pickFontFile() {
    fontFileInput.value?.click()
}

/**
 * 处理字体文件选择：写入 OPFS 并注册后自动启用。
 * @param event 文件输入变更事件
 */
async function onFontFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) {
        return
    }
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
        ui.showErrorMessage("请选择 .ttf / .otf / .woff / .woff2 字体文件")
        return
    }

    try {
        await setting.uploadCustomFont(file)
        ui.showSuccessMessage("自定义字体已更新")
    } catch (error) {
        console.error("上传自定义字体失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
}

/**
 * 删除当前选中的已上传字体，并回退默认字体。
 */
async function deleteSelectedCustomFont() {
    const meta = setting.customFonts.find(item => customFontCssFamily(item) === setting.appFontFamily)
    if (!meta) {
        return
    }

    try {
        await setting.deleteCustomFont(meta.fileName)
        ui.showSuccessMessage("字体文件已删除")
    } catch (error) {
        console.error("删除自定义字体失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
}

function applySafeMode(enabled: boolean) {
    setting.safeMode = enabled
    // 开启 = 删除键（键不存在 → 与当前版本不一致 → 视为开启）；关闭 = 键写为当前版本
    if (enabled) {
        openSafeMode()
    } else {
        closeSafeMode()
    }
    location.reload()
}

/**
 * 安全模式开关：开启直接生效；关闭需弹出三题校验。
 * @param enabled 目标状态
 */
function handleSafeModeToggle(enabled: boolean) {
    if (enabled) {
        applySafeMode(true)
        return
    }
    safeModeQuizOpen.value = true
}

/**
 * 校验全部通过：关闭弹窗并关闭安全模式。
 */
function onSafeModeQuizPassed() {
    safeModeQuizOpen.value = false
    applySafeMode(false)
}

/**
 * 校验取消：安全模式保持开启。
 */
function onSafeModeQuizCancelled() {
    safeModeQuizOpen.value = false
    setting.safeMode = true
}

async function resetStorage() {
    localStorage.clear()
    db.delete()
    await clearServiceWorkers()
    location.reload()
}

async function openResetConfirmDialog() {
    if (await ui.showDialog(t("setting.reset"), t("setting.resetTip"))) {
        resetStorage()
    }
}

async function updateLaunchAtStartup(enabled: boolean) {
    isUpdatingLaunchAtStartup.value = true
    try {
        await setting.setLaunchAtStartup(enabled)
    } catch (error) {
        console.error("更新开机启动设置失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        isUpdatingLaunchAtStartup.value = false
    }
}

async function clearServiceWorkers(): Promise<void> {
    if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
            await registration.unregister()
        }
        if ("caches" in window) {
            for (const cacheName of await caches.keys()) {
                await caches.delete(cacheName)
            }
        }
    }
}

async function refreshDataPackStatus(forceRefresh = false) {
    await dataPack.refreshStatus(forceRefresh)
    dataPackSourceBaseUrl.value = dataPack.sourceInfo?.baseUrl || ""
}

async function refreshDataPackVersionsInStages(forceRefresh = false) {
    dataPackLoadingRemoteVersions.value = true
    try {
        const localVersions = await getInstalledDataPackVersions()
        if (localVersions.length) {
            const currentStatus = dataPack.status || {
                ready: false,
                version: null,
                manifest: null,
                remote: null,
                versions: [],
            }
            dataPack.status = {
                ...currentStatus,
                versions: localVersions,
            }
        }

        if (!dataPack.isBootstrapping) {
            await dataPack.refreshStatus(forceRefresh)
        }

        const mergedVersions = await getMergedDataPackVersions(dataPack.status?.versions || [], localVersions)
        if (mergedVersions.length) {
            dataPack.status = {
                ...dataPack.status,
                versions: mergedVersions,
            } as typeof dataPack.status
        }
        dataPackSourceBaseUrl.value = dataPack.sourceInfo?.baseUrl || ""
    } finally {
        dataPackLoadingRemoteVersions.value = false
    }
}

async function downloadDataPack(version: string) {
    await dataPack.downloadVersion(version)
}

async function importDataPack() {
    dataPackFileInput.value?.click()
}

async function onImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) {
        return
    }
    await dataPack.importFromFile(file)
}

async function saveSourceBaseUrl() {
    isApplyingSourceUpdate.value = true
    try {
        await dataPack.setSourceBaseUrl(dataPackSourceBaseUrl.value.trim())
    } finally {
        isApplyingSourceUpdate.value = false
    }
}

async function saveSourceKind(kind: "official" | "custom") {
    isApplyingSourceUpdate.value = true
    dataPackSourceKind.value = kind
    try {
        await dataPack.setSourceKind(kind)
        if (kind === "official") {
            dataPackSourceBaseUrl.value = CDN_DATA_PACK_BASE_URL
        }
    } finally {
        isApplyingSourceUpdate.value = false
    }
}

async function refreshDataPackVersions() {
    await refreshDataPackVersionsInStages(true)
}

function formatVersionDate(date: string | undefined) {
    if (!date) {
        return t("setting.unknown")
    }

    return new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(date))
}

function getVersionLabel(version: string) {
    return version
}

function isDownloadedVersion(version: string) {
    return version === dataPack.status?.version || installedDataPackVersions.value.has(version)
}

function isCurrentDataPackVersion(version: string) {
    return dataPack.status?.version === version
}

function onVersionDragStart(event: DragEvent, version: string) {
    if (!event.dataTransfer || !isDownloadedVersion(version)) {
        event.preventDefault()
        return
    }

    try {
        const file = dataPack.versionFiles[version]
        if (!file) {
            throw new Error(`${t("setting.missingDragDataPack")} ${version}`)
        }
        event.dataTransfer.effectAllowed = "copy"
        event.dataTransfer.items.clear()
        event.dataTransfer.items.add(file)
        const fileUrl = versionDragUrls.value[version] || URL.createObjectURL(file)
        versionDragUrls.value[version] = fileUrl
        event.dataTransfer.setData("DownloadURL", `application/zip:${version}.zip:${fileUrl}`)
    } catch (error) {
        console.error("准备拖拽数据包失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
        event.preventDefault()
    }
}

function onVersionDragEnd(version: string) {
    const fileUrl = versionDragUrls.value[version]
    if (fileUrl) {
        window.setTimeout(() => {
            URL.revokeObjectURL(fileUrl)
            delete versionDragUrls.value[version]
        }, 5000)
    }
}

async function useDataPackVersion(version: string) {
    if (isCurrentDataPackVersion(version)) {
        return
    }

    await dataPack.useVersion(version)
}

async function uninstallDataPackVersion(version: string) {
    if (!isDownloadedVersion(version)) {
        return
    }

    if (!(await ui.showDialog(t("setting.uninstallDataPack"), t("setting.uninstallDataPackConfirm", { version })))) {
        return
    }

    await dataPack.uninstallVersion(version)
}

async function clearDataPackStorage() {
    if (!(await ui.showDialog(t("setting.reset"), "清空后会删除所有数据包和图片缓存，且无法恢复。"))) {
        return
    }

    isClearingDataPackOpfs.value = true
    try {
        await clearAllDataPackOpfs()
        await deleteImgsCache()
        await refreshDataPackStatus(true)
    } catch (error) {
        console.error("清空数据包存储失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        isClearingDataPackOpfs.value = false
    }
}
onMounted(() => {
    if (!dataPack.status) {
        void dataPack.bootstrap()
    }
    // 懒加载系统字体列表（桌面端读注册表；Web 端需要用户手势授权，失败时可手动刷新重试）
    void setting.loadSystemFonts()
})
</script>

<template>
    <div class="w-full h-full overflow-y-auto">
        <div class="p-4 flex flex-col gap-4 max-w-2xl m-auto">
            <article>
                <SectionHeader no-animate compact kicker="APPEARANCE" :title="$t('setting.appearance')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            v-if="env.isApp"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.theme") }}</span>
                            <Select v-model="setting.theme" class="input input-bordered input-sm w-40">
                                <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t("setting.lightTheme") }}</SelectLabel>
                                <SelectGroup>
                                    <SelectItem v-for="th in lightThemes" :key="th" :value="th">{{ capitalize(th) }}</SelectItem>
                                </SelectGroup>
                                <SelectSeparator />
                                <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t("setting.darkTheme") }}</SelectLabel>
                                <SelectGroup>
                                    <SelectItem v-for="th in darkThemes" :key="th" :value="th">{{ capitalize(th) }}</SelectItem>
                                </SelectGroup>
                                <SelectSeparator />
                                <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t("setting.customTheme") }}</SelectLabel>
                                <SelectGroup>
                                    <SelectItem value="custom">{{ $t("setting.customThemeOption") }}</SelectItem>
                                </SelectGroup>
                            </Select>
                        </div>
                        <CustomThemeDesigner v-if="env.isApp && setting.theme === 'custom'" class="p-2" />
                        <div
                            v-if="env.isApp"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t("setting.windowTrasnparent") }}
                                <div class="text-xs text-base-content/50">{{ $t("setting.windowTrasnparentTip") }}</div>
                            </span>
                            <input v-model="setting.windowTrasnparent" type="checkbox" class="toggle toggle-secondary" />
                        </div>
                        <!-- 自定义底图：上传图片作为全局背景 -->
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                自定义底图
                                <div class="text-xs text-base-content/50">上传一张图片作为全局背景，可配合窗口透明使用</div>
                            </span>
                            <div class="flex shrink-0 items-center gap-2">
                                <!-- 预览图：hover 显示「更换」覆盖层，点击触发文件选择，替代独立更换按钮 -->
                                <button
                                    v-if="setting.customWallpaper"
                                    type="button"
                                    class="group relative h-9 w-16 cursor-pointer overflow-hidden rounded-xs border border-base-content/15"
                                    @click="pickWallpaper"
                                >
                                    <img
                                        :src="setting.customWallpaper"
                                        alt="自定义底图预览"
                                        class="h-full w-full object-cover"
                                    />
                                    <span
                                        class="absolute inset-0 flex items-center justify-center bg-base-content/55 text-[11px] font-medium text-base-100 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                        >更换</span
                                    >
                                </button>
                                <button v-else class="btn btn-sm" @click="pickWallpaper">上传</button>
                                <button v-if="setting.customWallpaper" class="btn btn-sm btn-error" @click="clearWallpaper">清除</button>
                            </div>
                        </div>
                        <input ref="wallpaperFileInput" type="file" accept="image/*" class="hidden" @change="onWallpaperFileChange" />
                        <!-- 底图透明度：仅设置了底图后展示 -->
                        <div
                            v-if="setting.customWallpaper"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                底图透明度
                                <div class="text-xs text-base-content/50">数值越小越透明，用于弱化背景干扰</div>
                            </span>
                            <div class="flex shrink-0 items-center gap-2">
                                <input
                                    :value="setting.customWallpaperOpacity"
                                    type="range"
                                    class="range range-secondary w-32"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    @input="setting.customWallpaperOpacity = +($event.target as HTMLInputElement)!.value"
                                />
                                <span
                                    class="w-10 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                                    >{{ Math.round(setting.customWallpaperOpacity * 100) }}%</span
                                >
                            </div>
                        </div>
                        <!-- 底图模糊度：仅设置了底图后展示 -->
                        <div
                            v-if="setting.customWallpaper"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                底图模糊度
                                <div class="text-xs text-base-content/50">对底图做高斯模糊，营造景深效果</div>
                            </span>
                            <div class="flex shrink-0 items-center gap-2">
                                <input
                                    :value="setting.customWallpaperBlur"
                                    type="range"
                                    class="range range-secondary w-32"
                                    min="0"
                                    max="20"
                                    step="1"
                                    @input="setting.customWallpaperBlur = +($event.target as HTMLInputElement)!.value"
                                />
                                <span
                                    class="w-12 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                                    >{{ setting.customWallpaperBlur }}px</span
                                >
                            </div>
                        </div>
                        <!-- 自定义字体：选择系统字体或上传字体文件（OPFS），空值恢复默认 -->
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                自定义字体
                                <div class="text-xs text-base-content/50">选择系统字体或上传字体文件，留空恢复默认</div>
                            </span>
                            <div class="flex shrink-0 items-center gap-2">
                                <Select v-model="selectedFontFamily" class="input input-bordered input-sm w-44" :placeholder="'默认字体'">
                                    <SelectItem :value="FONT_DEFAULT_VALUE">默认字体</SelectItem>
                                    <SelectSeparator />
                                    <SelectLabel class="p-2 text-sm font-semibold text-primary">系统字体</SelectLabel>
                                    <SelectGroup>
                                        <template v-if="setting.systemFonts.length">
                                            <SelectItem
                                                v-for="font in setting.systemFonts"
                                                :key="`sys-${font}`"
                                                :value="cssQuoteFamily(font)"
                                                :style="{ fontFamily: cssQuoteFamily(font) }"
                                            >
                                                {{ font }}
                                            </SelectItem>
                                        </template>
                                        <SelectItem v-else :value="FONT_SYSTEMS_EMPTY_VALUE" disabled>
                                            {{ setting.systemFontsLoading ? "加载中…" : "暂无，可点右侧刷新" }}
                                        </SelectItem>
                                    </SelectGroup>
                                    <template v-if="setting.customFonts.length">
                                        <SelectSeparator />
                                        <SelectLabel class="p-2 text-sm font-semibold text-primary">上传的字体</SelectLabel>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="meta in setting.customFonts"
                                                :key="`custom-${meta.fileName}`"
                                                :value="customFontCssFamily(meta)"
                                                :style="{ fontFamily: customFontCssFamily(meta) }"
                                            >
                                                {{ meta.displayName }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </template>
                                </Select>
                                <button class="btn btn-sm btn-square" title="刷新系统字体" @click="setting.loadSystemFonts(true)">
                                    <span v-if="setting.systemFontsLoading" class="loading loading-spinner loading-xs" />
                                    <Icon v-else icon="ri:refresh-line" class="size-4" />
                                </button>
                                <button class="btn btn-sm" @click="pickFontFile">上传</button>
                                <button v-if="isCustomFontSelected" class="btn btn-sm btn-error" @click="deleteSelectedCustomFont">
                                    删除
                                </button>
                                <button
                                    v-else-if="setting.appFontFamily"
                                    class="btn btn-sm"
                                    @click="selectedFontFamily = FONT_DEFAULT_VALUE"
                                >
                                    清除
                                </button>
                            </div>
                        </div>
                        <input ref="fontFileInput" type="file" accept=".ttf,.otf,.woff,.woff2" class="hidden" @change="onFontFileChange" />
                        <div
                            v-if="env.isApp"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t("setting.launchAtStartup") }}
                                <div class="text-xs text-base-content/50">{{ $t("setting.launchAtStartupTip") }}</div>
                            </span>
                            <input
                                :checked="setting.launchAtStartup"
                                :disabled="isUpdatingLaunchAtStartup"
                                type="checkbox"
                                class="toggle toggle-secondary"
                                @change="updateLaunchAtStartup(($event.target as HTMLInputElement).checked)"
                            />
                        </div>
                        <div
                            v-if="env.isApp"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.winMaterial") }}</span>
                            <Select
                                v-model="setting.winMaterial"
                                class="input input-bordered input-sm w-40"
                                :placeholder="$t('setting.winMaterial')"
                            >
                                <SelectItem v-for="th in MATERIALS" :key="th" :value="th">{{ th }}</SelectItem>
                            </Select>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.lang") }}</span>
                            <Select
                                v-model="setting.lang"
                                class="input input-bordered input-sm w-40"
                                :placeholder="$t('setting.lang')"
                                @update:model-value="setting.setLang($event)"
                            >
                                <SelectItem v-for="lang in i18nLanguages" :key="lang.code" :value="lang.code">{{ lang.name }}</SelectItem>
                            </Select>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.uiScale") }}</span>
                            <div class="min-w-56">
                                <input
                                    :value="setting.uiScale"
                                    type="range"
                                    class="range range-secondary"
                                    min="0.8"
                                    max="1.5"
                                    step="0.1"
                                    @input="setting.uiScale = +($event.target as HTMLInputElement)!.value"
                                />
                                <div class="w-full flex justify-between text-xs px-1">
                                    <span
                                        v-for="i in 8"
                                        :key="i"
                                        :class="{ 'text-secondary': setting.uiScale.toFixed(1) === (0.7 + i / 10).toFixed(1) }"
                                        >{{ (0.7 + i / 10).toFixed(1) }}</span
                                    >
                                </div>
                            </div>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">
                                {{ $t("setting.safeMode") }}
                                <div class="text-xs text-base-content/50">{{ $t("setting.safeModeHint") }}</div>
                            </span>
                            <input
                                :checked="setting.safeMode"
                                type="checkbox"
                                class="toggle toggle-secondary"
                                @click.prevent="handleSafeModeToggle(!setting.safeMode)"
                            />
                        </div>
                        <div
                            v-if="!setting.safeMode"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text"> {{ $t("setting.initScriptHotkeysAtStartup") }} </span>
                            <input v-model="setting.initScriptHotkeysAtStartup" type="checkbox" class="toggle toggle-secondary" />
                        </div>
                    </div>
                </div>
            </article>

            <article>
                <SectionHeader no-animate compact kicker="DATA PACK" :title="$t('setting.dataPackManagement')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    :style="{ animationDelay: '0.05s' }"
                >
                    <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                        <div class="flex flex-wrap items-center gap-2">
                            <Select
                                v-model="dataPackSourceKind"
                                class="input input-bordered input-sm w-40"
                                @update:model-value="saveSourceKind($event as 'official' | 'custom')"
                            >
                                <SelectItem value="official">{{ $t("setting.officialSource") }}</SelectItem>
                                <SelectItem value="custom">{{ $t("setting.customSource") }}</SelectItem>
                            </Select>
                            <input
                                v-model="dataPackSourceBaseUrl"
                                :disabled="dataPackSourceKind === 'official'"
                                type="text"
                                class="input input-bordered input-sm min-w-40 flex-1"
                                :placeholder="
                                    dataPackSourceKind === 'official' ? CDN_DATA_PACK_BASE_URL : $t('setting.dataPackSourceAddress')
                                "
                                @input="dataPackSourceKind === 'custom' && saveSourceBaseUrl()"
                            />
                            <button class="btn btn-sm" @click="importDataPack">{{ $t("achievement.import") }}</button>
                            <button class="btn btn-sm btn-error" :disabled="isClearingDataPackOpfs" @click="clearDataPackStorage">
                                清空
                            </button>
                        </div>
                    </div>

                    <div class="mt-3 mb-2 flex items-center justify-between gap-2">
                        <div class="text-xs text-base-content/60">{{ $t("setting.versionList") }}</div>
                        <button class="btn btn-ghost btn-xs" :disabled="dataPack.isBootstrapping" @click="refreshDataPackVersions">
                            {{ $t("setting.refresh") }}
                        </button>
                    </div>

                    <div v-if="imgsDownloadState.active || imgsDownloadState.total > 0" class="mb-2">
                        <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-3">
                            <div class="flex items-center justify-between gap-2 text-xs text-base-content/70">
                                <span>{{ imgsDownloadProgressLabel }}</span>
                                <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                    {{ imgsDownloadProgressValue }}%
                                </span>
                            </div>
                            <div
                                v-if="imgsDownloadState.stage === 'pack-current' && imgsDownloadState.packTotal > 1"
                                class="mt-1 text-[11px] text-base-content/55"
                            >
                                包({{ imgsDownloadState.packCompleted }}/{{ imgsDownloadState.packTotal }})
                                {{ imgsDownloadState.version }} · {{ imgsDownloadState.currentPackFiles }} 张 ·
                                {{
                                    imgsDownloadState.bytesTotal > 0
                                        ? `${formatSize.format(imgsDownloadState.bytesTotal / 1024 / 1024)} MB`
                                        : "--"
                                }}
                                ·
                                {{
                                    imgsDownloadState.speedBps > 0
                                        ? `${formatSize.format(imgsDownloadState.speedBps / 1024 / 1024)} MB/s`
                                        : "0 MB/s"
                                }}
                            </div>
                            <div v-else class="mt-1 text-[11px] text-base-content/50">{{ imgsDownloadSummary }}</div>
                            <progress class="progress progress-primary w-full mt-2" :value="imgsDownloadProgressValue" max="100" />
                        </div>
                    </div>

                    <div>
                        <div
                            v-if="dataPackVersions.length === 0"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-6 text-sm text-base-content/60 text-center"
                        >
                            {{ $t("setting.noAvailableVersions") }}
                        </div>
                        <div v-else class="flex flex-col gap-2">
                            <div
                                v-for="version in pagedDataPackVersions"
                                :key="version.version"
                                class="rounded-xs border bg-base-content/3 px-3 py-3 flex flex-col gap-3 transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between"
                                :class="[
                                    isCurrentDataPackVersion(version.version) ? 'border-primary/70' : 'border-base-content/10',
                                    { 'opacity-80': isDownloadedVersion(version.version) },
                                ]"
                                :draggable="isDownloadedVersion(version.version)"
                                @dragstart="onVersionDragStart($event, version.version)"
                                @dragend="onVersionDragEnd(version.version)"
                            >
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <div class="font-medium break-all">{{ getVersionLabel(version.version) }}</div>
                                        <span
                                            v-if="isCurrentDataPackVersion(version.version)"
                                            class="rounded-xs border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                                            >{{ $t("setting.current") }}</span
                                        >
                                        <span
                                            v-else-if="isDownloadedVersion(version.version)"
                                            class="rounded-xs border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success"
                                            >{{ $t("setting.downloaded") }}</span
                                        >
                                    </div>
                                    <div class="text-xs text-base-content/60">
                                        <span>{{ formatVersionDate(version.builtAt) }}</span>
                                        <span class="mx-2">·</span>
                                        <span>{{ version.notes || $t("setting.noDescription") }}</span>
                                    </div>
                                </div>
                                <div class="sm:w-48">
                                    <div
                                        v-if="dataPack.isDownloading && dataPack.downloadingVersion === version.version"
                                        class="w-full flex flex-col gap-1"
                                    >
                                        <progress
                                            class="progress progress-primary w-full"
                                            :value="Math.round(dataPack.downloadProgress * 100)"
                                            max="100"
                                        />
                                        <div class="font-orbitron text-[13px] font-semibold tabular-nums text-primary text-right">
                                            {{ Math.round(dataPack.downloadProgress * 100) }}%
                                        </div>
                                    </div>
                                    <div v-else-if="isDownloadedVersion(version.version)" class="flex gap-2">
                                        <button class="btn btn-error btn-sm flex-1" @click="uninstallDataPackVersion(version.version)">
                                            {{ $t("setting.uninstall") }}
                                        </button>
                                        <button
                                            class="btn btn-primary btn-sm flex-1"
                                            :disabled="isCurrentDataPackVersion(version.version)"
                                            @click="useDataPackVersion(version.version)"
                                        >
                                            {{ $t("setting.use") }}
                                        </button>
                                    </div>
                                    <button
                                        v-else
                                        class="btn btn-primary btn-sm w-full"
                                        :disabled="dataPack.isDownloading"
                                        @click="downloadDataPack(version.version)"
                                    >
                                        {{ $t("setting.download") }}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <!-- 分页条：超过一页时展示 -->
                        <div v-if="dataPackTotalPages > 1" class="mt-3 flex items-center justify-center gap-1.5">
                            <button
                                type="button"
                                class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs border transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    currentDataPackPage === 1
                                        ? 'pointer-events-none border-base-content/10 text-base-content/30'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                :aria-label="'上一页'"
                                @click="gotoDataPackPage(currentDataPackPage - 1)"
                            >
                                <Icon icon="ri:arrow-left-line" class="size-3.5" />
                            </button>
                            <button
                                v-for="n in dataPackTotalPages"
                                :key="n"
                                type="button"
                                class="inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-xs border px-1.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    currentDataPackPage === n
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="gotoDataPackPage(n)"
                            >
                                {{ n }}
                            </button>
                            <button
                                type="button"
                                class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs border transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    currentDataPackPage === dataPackTotalPages
                                        ? 'pointer-events-none border-base-content/10 text-base-content/30'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                :aria-label="'下一页'"
                                @click="gotoDataPackPage(currentDataPackPage + 1)"
                            >
                                <Icon icon="ri:arrow-right-line" class="size-3.5" />
                            </button>
                        </div>
                    </div>
                    <div v-if="dataPackVersions.length > 0" class="mt-2 text-center text-[11px] text-base-content/45">
                        共
                        <b class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ dataPackVersions.length }}</b>
                        个版本 · 第 {{ currentDataPackPage }}/{{ dataPackTotalPages }} 页
                    </div>
                    <input ref="dataPackFileInput" type="file" accept=".zip" class="hidden" @change="onImportFileChange" />
                </div>
            </article>

            <article>
                <SectionHeader no-animate compact kicker="ACCOUNT" :title="$t('setting.account')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    :style="{ animationDelay: '0.1s' }"
                >
                    <DOBAccountSetting />
                </div>
            </article>

            <article>
                <SectionHeader no-animate compact kicker="STORY" :title="$t('setting.storyText')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    :style="{ animationDelay: '0.15s' }"
                >
                    <div class="flex flex-col gap-2">
                        <div
                            class="flex items-center justify-between gap-4 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.protagonistName1") }}</span>
                            <input v-model="setting.protagonistName1" type="text" class="input input-bordered input-sm w-64" />
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.protagonistGender1") }}</span>
                            <Select v-model="setting.protagonistGender" class="input input-bordered input-sm w-64">
                                <SelectItem value="female">{{ $t("setting.female") }}</SelectItem>
                                <SelectItem value="male">{{ $t("setting.male") }}</SelectItem>
                            </Select>
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.protagonistName2") }}</span>
                            <input v-model="setting.protagonistName2" type="text" class="input input-bordered input-sm w-64" />
                        </div>
                        <div
                            class="flex items-center justify-between gap-4 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="label-text">{{ $t("setting.protagonistGender2") }}</span>
                            <Select v-model="setting.protagonistGender2" class="input input-bordered input-sm w-64">
                                <SelectItem value="female">{{ $t("setting.female") }}</SelectItem>
                                <SelectItem value="male">{{ $t("setting.male") }}</SelectItem>
                            </Select>
                        </div>
                    </div>
                </div>
            </article>

            <article>
                <SectionHeader no-animate compact kicker="OTHER" :title="$t('setting.other')" />
                <div
                    class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                    :style="{ animationDelay: '0.2s' }"
                >
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="label-text">
                            {{ $t("setting.reset") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.resetTip") }}</div>
                        </span>
                        <div class="btn btn-secondary w-40" @click="openResetConfirmDialog">{{ $t("setting.confirm") }}</div>
                    </div>
                </div>
            </article>
        </div>
    </div>

    <SafeModeQuizDialog v-model="safeModeQuizOpen" @passed="onSafeModeQuizPassed" @cancelled="onSafeModeQuizCancelled" />
</template>
