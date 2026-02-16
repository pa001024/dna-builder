<script setup lang="ts">
import type { CSSProperties } from "vue"
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import { importPic } from "@/api/app"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"

interface LoadedImageItem {
    id: string
    name: string
    url: string
    width: number
    height: number
    data: Uint8ClampedArray
    revokeUrl: boolean
}

interface PointItem {
    id: number
    x: number
    y: number
}

interface PixelColorInfo {
    r: number
    g: number
    b: number
    a: number
    hex: string
}

interface PointColorEntry {
    imageId: string
    color: PixelColorInfo | null
    match: boolean
}

interface PointColorRow {
    point: PointItem
    pointIndex: number
    referenceColor: PixelColorInfo | null
    colors: PointColorEntry[]
}

type BubbleQuadrant = "ru" | "rd" | "lu" | "ld"

const router = useRouter()
const ui = useUIStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const referenceImageRef = ref<HTMLImageElement | null>(null)
const loadedImages = ref<LoadedImageItem[]>([])
const points = ref<PointItem[]>([])
const loading = ref(false)
const isDragging = ref(false)
const zoomScale = ref(4)
const colorTolerance = ref(10)
let pointIdSeed = 1
let unlistenDragEnter = () => { }
let unlistenDragLeave = () => { }
let unlistenDragDrop = () => { }

const referenceImage = computed(() => loadedImages.value[0] ?? null)
const referenceImageStyle = computed<CSSProperties>(() => {
    const image = referenceImage.value
    if (!image) {
        return {}
    }
    return {
        width: `${image.width * zoomScale.value}px`,
        height: `${image.height * zoomScale.value}px`,
        minWidth: `${image.width * zoomScale.value}px`,
        minHeight: `${image.height * zoomScale.value}px`,
        maxWidth: "none",
        display: "block",
        imageRendering: "pixelated" as const,
    }
})

const referenceLayerStyle = computed<CSSProperties>(() => {
    const image = referenceImage.value
    if (!image) {
        return {}
    }
    return {
        width: `${image.width * zoomScale.value}px`,
        height: `${image.height * zoomScale.value}px`,
        minWidth: `${image.width * zoomScale.value}px`,
        minHeight: `${image.height * zoomScale.value}px`,
    }
})

const referenceImageInfo = computed(() => {
    const image = referenceImage.value
    if (!image) {
        return ""
    }
    return `${image.width}x${image.height} -> ${image.width * zoomScale.value}x${image.height * zoomScale.value}`
})

/**
 * 将数字转换为两位十六进制字符串。
 * @param value 颜色通道值
 * @returns 两位十六进制字符串
 */
function toHexByte(value: number): string {
    return value.toString(16).padStart(2, "0").toUpperCase()
}

/**
 * 释放当前已加载图片的对象 URL。
 */
function revokeLoadedImageUrls() {
    for (const item of loadedImages.value) {
        if (item.revokeUrl) {
            URL.revokeObjectURL(item.url)
        }
    }
}

/**
 * 清空当前加载状态和采样点。
 */
function resetImageState() {
    revokeLoadedImageUrls()
    loadedImages.value = []
    points.value = []
    pointIdSeed = 1
}

/**
 * 根据图片 URL 读取像素数据。
 * @param url 图片地址
 * @returns ImageData 像素数据
 */
async function readImageDataFromUrl(url: string): Promise<ImageData> {
    return await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement("canvas")
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            const ctx = canvas.getContext("2d")
            if (!ctx) {
                reject(new Error("无法创建 Canvas 上下文"))
                return
            }
            ctx.drawImage(img, 0, 0)
            resolve(ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight))
        }
        img.onerror = () => {
            reject(new Error(`无法读取图片: ${url}`))
        }
        img.src = url
    })
}

/**
 * 读取单个图片文件并转换为可采样的像素数据。
 * @param file 图片文件
 * @param index 当前序号
 * @returns 已加载图片对象
 */
async function loadImageFile(file: File, index: number): Promise<LoadedImageItem> {
    const objectUrl = URL.createObjectURL(file)
    try {
        const imageData = await readImageDataFromUrl(objectUrl)
        return {
            id: `${file.name}-${file.lastModified}-${index}`,
            name: file.name,
            url: objectUrl,
            width: imageData.width,
            height: imageData.height,
            data: imageData.data,
            revokeUrl: true,
        }
    } catch (error) {
        URL.revokeObjectURL(objectUrl)
        throw error
    }
}

/**
 * 读取本地路径图片并转换为可采样的像素数据。
 * @param path 本地文件路径
 * @param index 当前序号
 * @returns 已加载图片对象
 */
async function loadImagePath(path: string, index: number): Promise<LoadedImageItem> {
    const imageUrl = await importPic(path)
    const imageData = await readImageDataFromUrl(imageUrl)
    const name = path.split(/[\\/]/).pop() || path
    return {
        id: `${name}-${index}`,
        name,
        url: imageUrl,
        width: imageData.width,
        height: imageData.height,
        data: imageData.data,
        revokeUrl: false,
    }
}

/**
 * 判断路径是否为支持的图片格式。
 * @param path 本地路径
 * @returns 是否支持
 */
function isSupportedImagePath(path: string): boolean {
    return /\.(?:png|jpg|jpeg|gif|webp|bmp|tif|tiff|ico)$/i.test(path)
}

/**
 * 加载多个图片文件并重置采样点。
 * @param files 图片文件数组
 */
async function loadImages(files: File[]) {
    resetImageState()
    if (files.length === 0) {
        return
    }

    loading.value = true
    try {
        const items: LoadedImageItem[] = []
        for (const [index, file] of files.entries()) {
            items.push(await loadImageFile(file, index))
        }
        loadedImages.value = items
    } catch (error) {
        ui.showErrorMessage(`图片加载失败: ${String(error)}`)
        resetImageState()
    } finally {
        loading.value = false
    }
}

/**
 * 从本地路径数组加载图片并重置采样点。
 * @param paths 本地文件路径数组
 */
async function loadImagesFromPaths(paths: string[]) {
    const imagePaths = paths.filter(isSupportedImagePath)
    if (imagePaths.length === 0) {
        ui.showErrorMessage("拖拽文件中不包含受支持的图片格式")
        return
    }
    resetImageState()

    loading.value = true
    try {
        const items: LoadedImageItem[] = []
        for (const [index, path] of imagePaths.entries()) {
            items.push(await loadImagePath(path, index))
        }
        loadedImages.value = items
    } catch (error) {
        ui.showErrorMessage(`图片加载失败: ${String(error)}`)
        resetImageState()
    } finally {
        loading.value = false
    }
}

/**
 * 处理文件选择事件。
 * @param event input change 事件
 */
async function handleFileSelection(event: Event) {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    await loadImages(files)
    input.value = ""
}

/**
 * 打开本地文件选择器。
 */
function openFilePicker() {
    fileInputRef.value?.click()
}

/**
 * 设置图像缩放倍数（仅支持整数倍）。
 * @param value 目标缩放倍数
 */
function setZoomScale(value: number) {
    const next = Math.round(value)
    zoomScale.value = Math.max(1, Math.min(32, next))
}

/**
 * 放大参考图像。
 */
function zoomIn() {
    setZoomScale(zoomScale.value + 1)
}

/**
 * 缩小参考图像。
 */
function zoomOut() {
    setZoomScale(zoomScale.value - 1)
}

/**
 * 处理缩放输入框变更。
 * @param event 输入事件
 */
function handleZoomInput(event: Event) {
    const input = event.target as HTMLInputElement
    setZoomScale(Number(input.value))
}

/**
 * 设置 RGB 匹配容差（单通道绝对差阈值）。
 * @param value 目标容差
 */
function setColorTolerance(value: number) {
    const next = Math.round(value)
    colorTolerance.value = Math.max(0, Math.min(255, next))
}

/**
 * 处理容差输入框变更。
 * @param event 输入事件
 */
function handleToleranceInput(event: Event) {
    const input = event.target as HTMLInputElement
    setColorTolerance(Number(input.value))
}

/**
 * 在参考图上添加采样点。
 * @param event 鼠标点击事件
 */
function addPointOnReferenceImage(event: MouseEvent) {
    const base = referenceImage.value
    const imageEl = referenceImageRef.value
    if (!base || !imageEl) {
        return
    }

    const rect = imageEl.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
        return
    }

    // 按当前 1:N 缩放倍数直接换算像素坐标，避免比例误差。
    const scale = zoomScale.value
    const rawX = (event.clientX - rect.left) / scale
    const rawY = (event.clientY - rect.top) / scale
    const x = Math.max(0, Math.min(base.width - 1, Math.floor(rawX)))
    const y = Math.max(0, Math.min(base.height - 1, Math.floor(rawY)))

    points.value.push({
        id: pointIdSeed++,
        x,
        y,
    })
}

/**
 * 计算采样点锚点位置（像素中心）。
 * @param point 采样点
 * @returns 样式对象
 */
function getPointAnchorStyle(point: PointItem): CSSProperties {
    return {
        left: `${(point.x + 0.5) * zoomScale.value}px`,
        top: `${(point.y + 0.5) * zoomScale.value}px`,
    }
}

/**
 * 计算标记气泡所在象限，尽量避免贴边和遮挡目标像素。
 * @param point 采样点
 * @returns 气泡象限
 */
function getPointBubbleQuadrant(point: PointItem): BubbleQuadrant {
    const base = referenceImage.value
    if (!base) {
        return "ru"
    }

    const displayWidth = base.width * zoomScale.value
    const anchorX = (point.x + 0.5) * zoomScale.value
    const anchorY = (point.y + 0.5) * zoomScale.value

    const nearRight = anchorX > displayWidth - 140
    const nearTop = anchorY < 56
    if (nearRight && nearTop) return "ld"
    if (nearRight) return "lu"
    if (nearTop) return "rd"
    return "ru"
}

/**
 * 计算气泡容器偏移样式。
 * @param point 采样点
 * @returns 样式对象
 */
function getPointBubbleContainerStyle(point: PointItem): CSSProperties {
    const quadrant = getPointBubbleQuadrant(point)
    switch (quadrant) {
        case "ru":
            return { transform: "translate(-13px, calc(-100% - 10px))" }
        case "rd":
            return { transform: "translate(-13px, 10px)" }
        case "lu":
            return { transform: "translate(calc(-100% + 13px), calc(-100% - 10px))" }
        case "ld":
            return { transform: "translate(calc(-100% + 13px), 10px)" }
    }
}

/**
 * 计算气泡尾巴样式（带柄）。
 * @param point 采样点
 * @returns 样式对象
 */
function getPointBubbleTailStyle(point: PointItem): CSSProperties {
    const quadrant = getPointBubbleQuadrant(point)
    switch (quadrant) {
        case "ru":
            return { left: "8px", bottom: "-4px", transform: "rotate(45deg)" }
        case "rd":
            return { left: "8px", top: "-4px", transform: "rotate(225deg)" }
        case "lu":
            return { right: "8px", bottom: "-4px", transform: "rotate(135deg)" }
        case "ld":
            return { right: "8px", top: "-4px", transform: "rotate(315deg)" }
    }
}

/**
 * 删除指定采样点。
 * @param pointId 采样点 ID
 */
function removePoint(pointId: number) {
    points.value = points.value.filter(point => point.id !== pointId)
}

/**
 * 清空所有采样点。
 */
function clearPoints() {
    points.value = []
}

/**
 * 读取图片中指定坐标像素颜色。
 * @param image 图片数据
 * @param x X 坐标
 * @param y Y 坐标
 * @returns 颜色信息；超出范围时返回 null
 */
function getPixelColor(image: LoadedImageItem, x: number, y: number): PixelColorInfo | null {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
        return null
    }
    const offset = (y * image.width + x) * 4
    const r = image.data[offset]
    const g = image.data[offset + 1]
    const b = image.data[offset + 2]
    const a = image.data[offset + 3]
    return {
        r,
        g,
        b,
        a,
        hex: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`,
    }
}

/**
 * 判断两个颜色在 RGB 三通道上是否都在容差范围内。
 * @param expected 目标颜色
 * @param actual 实际颜色
 * @param tolerance 单通道容差
 * @returns 是否匹配
 */
function isRgbMatch(expected: PixelColorInfo, actual: PixelColorInfo, tolerance: number): boolean {
    return Math.abs(expected.r - actual.r) <= tolerance
        && Math.abs(expected.g - actual.g) <= tolerance
        && Math.abs(expected.b - actual.b) <= tolerance
}

/**
 * 将颜色 HEX（#RRGGBB）转换为脚本用 HEX（0xRRGGBB）。
 * @param color 颜色信息
 * @returns 脚本颜色文本
 */
function toScriptHex(color: PixelColorInfo): string {
    return `0x${color.hex.replace("#", "")}`
}

/**
 * 复制坐标检测脚本片段：cc(frame,x,y,0xRRGGBB,tolerance)。
 * @param row 颜色行
 */
async function copyCoordinateCommand(row: PointColorRow) {
    if (!row.referenceColor) {
        ui.showErrorMessage(`点 #${row.pointIndex} 在参考图中没有有效颜色`)
        return
    }

    const command = `cc(frame,${row.point.x},${row.point.y},${toScriptHex(row.referenceColor)},${colorTolerance.value})`
    try {
        await copyText(command)
        ui.showSuccessMessage(`已复制: ${command}`)
    } catch (error) {
        ui.showErrorMessage(`复制失败: ${String(error)}`)
    }
}

/**
 * 构建“点位 x 图片”的颜色矩阵，便于表格展示。
 */
const pointColorRows = computed<PointColorRow[]>(() =>
    points.value.map((point, pointIndex) => {
        const rawColors = loadedImages.value.map(image => ({
            imageId: image.id,
            color: getPixelColor(image, point.x, point.y),
        }))
        const referenceColor = rawColors[0]?.color ?? null

        return {
            point,
            pointIndex: pointIndex + 1,
            referenceColor,
            colors: rawColors.map(entry => ({
                imageId: entry.imageId,
                color: entry.color,
                match: referenceColor && entry.color ? isRgbMatch(referenceColor, entry.color, colorTolerance.value) : false,
            })),
        }
    })
)

/**
 * 返回脚本页。
 */
function backToScriptPage() {
    router.push({ name: "script-list" })
}

/**
 * 初始化 Tauri 全局拖拽事件监听，用于桌面端文件拖放导入。
 */
async function initTauriDragEvents() {
    if (!env.isApp) {
        return
    }

    try {
        const { listen, TauriEvent } = await import("@tauri-apps/api/event")

        interface TauriDragEvent {
            paths: string[]
            position: {
                x: number
                y: number
            }
        }

        unlistenDragEnter = await listen<TauriDragEvent>(TauriEvent.DRAG_ENTER, () => {
            isDragging.value = true
        })
        unlistenDragLeave = await listen<TauriDragEvent>(TauriEvent.DRAG_LEAVE, () => {
            isDragging.value = false
        })
        unlistenDragDrop = await listen<TauriDragEvent>(TauriEvent.DRAG_DROP, async event => {
            isDragging.value = false
            await loadImagesFromPaths(event.payload.paths ?? [])
        })
    } catch (error) {
        console.error("初始化 Tauri 拖拽事件失败", error)
    }
}

onMounted(() => {
    initTauriDragEvents()
})

onUnmounted(() => {
    unlistenDragEnter()
    unlistenDragLeave()
    unlistenDragDrop()
    revokeLoadedImageUrls()
})
</script>

<template>
    <div class="h-full flex flex-col p-4 gap-4 overflow-hidden relative">
        <div class="flex flex-wrap items-center gap-2">
            <button class="btn btn-sm btn-ghost" @click="backToScriptPage">返回脚本</button>
            <button class="btn btn-sm btn-primary" @click="openFilePicker" :disabled="loading">
                {{ loading ? "加载中..." : "加载图片" }}
            </button>
            <button class="btn btn-sm btn-ghost" @click="clearPoints" :disabled="points.length === 0">清空点位</button>
            <div class="flex items-center gap-1">
                <button class="btn btn-sm btn-ghost btn-square" @click="zoomOut" :disabled="zoomScale <= 1">-</button>
                <input type="number" class="input input-sm input-bordered w-20 text-center" :value="zoomScale" min="1"
                    max="32" step="1" @change="handleZoomInput" />
                <button class="btn btn-sm btn-ghost btn-square" @click="zoomIn" :disabled="zoomScale >= 32">+</button>
                <span class="text-xs text-base-content/70">缩放 {{ zoomScale }}x（1:N 像素）</span>
            </div>
            <div class="flex items-center gap-1">
                <span class="text-xs text-base-content/70">容差</span>
                <input type="number" class="input input-sm input-bordered w-20 text-center" :value="colorTolerance"
                    min="0" max="255" step="1" @change="handleToleranceInput" />
                <span class="text-xs text-base-content/70">RGB 单通道</span>
            </div>
            <input ref="fileInputRef" type="file" multiple accept="image/*" class="hidden"
                @change="handleFileSelection" />
            <div class="text-xs text-base-content/70">
                请先加载多张图片，然后在第一张图上点击添加坐标点（坐标可点击复制 cc，桌面端支持拖拽导入）
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0 flex-1">
            <div class="card bg-base-100 border border-base-300 min-h-0">
                <div class="card-body min-h-0 p-3 gap-3">
                    <div class="text-sm font-medium">参考图（第 1 张，点击打点）</div>
                    <div v-if="referenceImageInfo" class="text-xs text-base-content/60">
                        {{ referenceImageInfo }}
                    </div>
                    <div class="flex-1 overflow-auto border border-base-300 rounded bg-base-200/30 p-2">
                        <div v-if="!referenceImage"
                            class="h-full min-h-60 flex items-center justify-center text-base-content/50 text-sm">
                            暂无图片
                        </div>
                        <div v-else class="relative" :style="referenceLayerStyle">
                            <img ref="referenceImageRef" :src="referenceImage.url" :alt="referenceImage.name"
                                class="select-none cursor-crosshair" :style="referenceImageStyle"
                                @click="addPointOnReferenceImage" />
                            <div v-for="(point, index) in points" :key="point.id" class="absolute pointer-events-none"
                                :style="getPointAnchorStyle(point)">
                                <div
                                    class="absolute left-0 top-0 w-2 h-2 rounded-full bg-error border border-white shadow -translate-x-1/2 -translate-y-1/2">
                                </div>
                                <div class="absolute left-0 top-0" :style="getPointBubbleContainerStyle(point)">
                                    <div
                                        class="relative rounded-md bg-base-100 border border-base-300 shadow px-2 py-1 text-[10px] leading-tight whitespace-nowrap">
                                        <div class="font-semibold text-error">#{{ index + 1 }}</div>
                                        <div class="text-base-content/80">{{ point.x }}, {{ point.y }}</div>
                                        <span class="absolute w-2 h-2 bg-base-100 border-l border-b border-base-300"
                                            :style="getPointBubbleTailStyle(point)" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="text-xs text-base-content/60">
                        已加载 {{ loadedImages.length }} 张图片，已打点 {{ points.length }} 个
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 border border-base-300 min-h-0">
                <div class="card-body min-h-0 p-3 gap-3">
                    <div class="text-sm font-medium">同坐标颜色信息</div>
                    <div class="flex-1 overflow-auto border border-base-300 rounded">
                        <div v-if="points.length === 0 || loadedImages.length === 0"
                            class="h-full min-h-60 flex items-center justify-center text-base-content/50 text-sm">
                            请先加载图片并在参考图上点击添加点位
                        </div>
                        <table v-else class="table table-xs">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>坐标</th>
                                    <th v-for="image in loadedImages" :key="image.id" class="min-w-48">
                                        <div class="truncate" :title="image.name">{{ image.name }}</div>
                                        <div class="text-[10px] text-base-content/60">{{ image.width }}x{{ image.height
                                            }}</div>
                                    </th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in pointColorRows" :key="row.point.id">
                                    <td>{{ row.pointIndex }}</td>
                                    <td>
                                        <button class="link link-hover text-info text-xs"
                                            @click="copyCoordinateCommand(row)">
                                            ({{ row.point.x }}, {{ row.point.y }})
                                        </button>
                                    </td>
                                    <td v-for="entry in row.colors" :key="`${row.point.id}-${entry.imageId}`">
                                        <div v-if="entry.color" class="flex items-center gap-2">
                                            <span class="inline-block w-4 h-4 rounded border border-base-300"
                                                :style="{ backgroundColor: `rgba(${entry.color.r}, ${entry.color.g}, ${entry.color.b}, ${entry.color.a / 255})` }" />
                                            <div class="leading-tight">
                                                <div>{{ entry.color.hex }}</div>
                                                <div class="text-[10px] text-base-content/65">
                                                    {{ entry.color.r }}, {{ entry.color.g }}, {{ entry.color.b }}, {{
                                                        entry.color.a }}
                                                </div>
                                                <div class="text-[10px]">
                                                    <span class="text-base-content/60">匹配:</span>
                                                    <span class="ml-1 font-semibold"
                                                        :class="entry.match ? 'text-success' : 'text-error'">
                                                        {{ entry.match ? 1 : 0 }}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div v-else class="text-base-content/50">超出范围</div>
                                    </td>
                                    <td>
                                        <button class="btn btn-xs btn-ghost"
                                            @click="removePoint(row.point.id)">删除</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="isDragging"
            class="absolute inset-0 z-50 bg-base-100/70 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
            <div class="text-center">
                <div class="text-lg font-medium text-primary">拖拽图片到此处导入</div>
                <div class="text-xs text-base-content/70 mt-1">支持 png / jpg / jpeg / webp / bmp / gif / tiff / ico</div>
            </div>
        </div>
    </div>
</template>
