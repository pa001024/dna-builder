<script setup lang="ts">
import type { CSSProperties } from "vue"
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import { importPic } from "@/api/app"
import { env } from "@/env"
import type { ScriptColorToolState } from "@/store/db"
import { db } from "@/store/db"
import { useUIStore } from "@/store/ui"
import { copyText, pasteText } from "@/util"

interface LoadedImageItem {
    id: string
    name: string
    url: string
    sourceDataUrl: string
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
    tolerance: number
    checkColor: PixelColorInfo | null
    checkColorDisplay: string
    checkColorInput: string
    checkColorCustom: boolean
    checkColorInputInvalid: boolean
    checkColorEditing: boolean
    colors: PointColorEntry[]
}

interface ImagePointColorEntry {
    point: PointItem
    pointIndex: number
    color: PixelColorInfo | null
    match: boolean
}

interface ImageColorRow {
    image: LoadedImageItem
    imageIndex: number
    colors: ImagePointColorEntry[]
}

interface ClassificationTestResult {
    result: string
    error: boolean
}

type ScriptCcFunction = (frame: unknown, x: number, y: number, color: unknown, tolerance?: unknown) => boolean

interface ClassificationPointItem {
    pointIndex: number
    condition: string
    matches: boolean[]
}

type ClassificationTreeNode = ClassificationTreeLeaf | ClassificationTreeBranch

interface ClassificationTreeLeaf {
    type: "leaf"
    label: string
    ambiguous: boolean
}

interface ClassificationTreeBranch {
    type: "branch"
    pointItemIndex: number
    trueNode: ClassificationTreeNode
    falseNode: ClassificationTreeNode
}

type BubbleQuadrant = "ru" | "rd" | "lu" | "ld"

const router = useRouter()
const ui = useUIStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const referenceImageRef = ref<HTMLImageElement | null>(null)
const loadedImages = ref<LoadedImageItem[]>([])
const points = ref<PointItem[]>([])
const activeImageIndex = ref(0)
const imageLabels = ref<Record<string, string>>({})
const imageLabelEditing = ref<Record<string, boolean>>({})
const pointInitialCheckColors = ref<Record<number, string>>({})
const pointCheckColorInputs = ref<Record<number, string>>({})
const pointCheckColorEditing = ref<Record<number, boolean>>({})
const pointTolerances = ref<Record<number, number>>({})
const classificationTestResults = ref<Record<string, ClassificationTestResult>>({})
const loading = ref(false)
const isDragging = ref(false)
const zoomScale = ref(4)
const defaultTolerance = ref(10)
const restoringPersistedState = ref(false)
let pointIdSeed = 1
let unlistenDragEnter = () => {}
let unlistenDragLeave = () => {}
let unlistenDragDrop = () => {}
let persistStateTimer: ReturnType<typeof setTimeout> | null = null

const referenceImage = computed(() => loadedImages.value[activeImageIndex.value] ?? null)
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
    activeImageIndex.value = 0
    imageLabels.value = {}
    imageLabelEditing.value = {}
    pointInitialCheckColors.value = {}
    pointCheckColorInputs.value = {}
    pointCheckColorEditing.value = {}
    pointTolerances.value = {}
    classificationTestResults.value = {}
    pointIdSeed = 1
}

/**
 * 从文件名推导默认分类标签。
 * @param name 图片名称
 * @param index 图片索引
 * @returns 默认标签
 */
function inferDefaultImageLabel(name: string, index: number): string {
    const raw = name.replace(/\.[^/.]+$/, "").trim()
    return raw.length > 0 ? raw : `state_${index + 1}`
}

/**
 * 初始化每张图片的分类标签。
 * @param items 已加载图片列表
 */
function appendImageLabels(items: LoadedImageItem[], startIndex: number) {
    const nextLabels: Record<string, string> = { ...imageLabels.value }
    for (const [offset, image] of items.entries()) {
        if (!(image.id in nextLabels)) {
            nextLabels[image.id] = inferDefaultImageLabel(image.name, startIndex + offset)
        }
    }
    imageLabels.value = nextLabels
}

/**
 * 获取指定索引图片的有效分类标签（空值回退默认标签）。
 * @param index 图片索引
 * @returns 有效标签
 */
function getImageLabelByIndex(index: number): string {
    const image = loadedImages.value[index]
    if (!image) {
        return `state_${index + 1}`
    }
    const inputValue = imageLabels.value[image.id]?.trim() ?? ""
    return inputValue.length > 0 ? inputValue : inferDefaultImageLabel(image.name, index)
}

/**
 * 将 File 对象读取为 data URL。
 * @param file 图片文件
 * @returns data URL
 */
async function readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : ""
            if (!result) {
                reject(new Error("读取文件内容失败"))
                return
            }
            resolve(result)
        }
        reader.onerror = () => {
            reject(new Error("读取文件内容失败"))
        }
        reader.readAsDataURL(file)
    })
}

/**
 * 将 ImageData 转为 PNG data URL，用于持久化原始像素图。
 * @param imageData 图片像素数据
 * @returns PNG data URL
 */
function imageDataToDataUrl(imageData: ImageData): string {
    const canvas = document.createElement("canvas")
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext("2d")
    if (!ctx) {
        throw new Error("无法创建 Canvas 上下文")
    }
    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL("image/png")
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
    const sourceDataUrl = await readFileAsDataUrl(file)
    const imageData = await readImageDataFromUrl(sourceDataUrl)
    return {
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name,
        url: sourceDataUrl,
        sourceDataUrl,
        width: imageData.width,
        height: imageData.height,
        data: imageData.data,
        revokeUrl: false,
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
    const sourceDataUrl = imageDataToDataUrl(imageData)
    const name = path.split(/[\\/]/).pop() || path
    return {
        id: `${name}-${index}`,
        name,
        url: sourceDataUrl,
        sourceDataUrl,
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
    if (files.length === 0) {
        return
    }

    loading.value = true
    try {
        const baseIndex = loadedImages.value.length
        const items: LoadedImageItem[] = []
        for (const [offset, file] of files.entries()) {
            items.push(await loadImageFile(file, baseIndex + offset))
        }
        loadedImages.value = [...loadedImages.value, ...items]
        appendImageLabels(items, baseIndex)
        if (loadedImages.value.length > 0 && baseIndex === 0) {
            activeImageIndex.value = 0
        }
        schedulePersistScriptColorToolState()
    } catch (error) {
        ui.showErrorMessage(`图片加载失败: ${String(error)}`)
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
    loading.value = true
    try {
        const baseIndex = loadedImages.value.length
        const items: LoadedImageItem[] = []
        for (const [offset, path] of imagePaths.entries()) {
            items.push(await loadImagePath(path, baseIndex + offset))
        }
        loadedImages.value = [...loadedImages.value, ...items]
        appendImageLabels(items, baseIndex)
        if (loadedImages.value.length > 0 && baseIndex === 0) {
            activeImageIndex.value = 0
        }
        schedulePersistScriptColorToolState()
    } catch (error) {
        ui.showErrorMessage(`图片加载失败: ${String(error)}`)
    } finally {
        loading.value = false
    }
}

/**
 * 对容差值做边界和整数规范化。
 * @param value 输入值
 * @returns 0-255 的整数容差
 */
function normalizeTolerance(value: number): number {
    const next = Math.round(value)
    return Math.max(0, Math.min(255, next))
}

/**
 * 将当前工具状态持久化到 Dexie。
 */
async function persistScriptColorToolState() {
    if (restoringPersistedState.value) {
        return
    }
    const payload: ScriptColorToolState = {
        id: "default",
        images: loadedImages.value.map(image => ({
            id: image.id,
            name: image.name,
            sourceDataUrl: image.sourceDataUrl,
        })),
        imageLabels: { ...imageLabels.value },
        points: points.value.map(point => ({
            id: point.id,
            x: point.x,
            y: point.y,
        })),
        pointTolerances: { ...pointTolerances.value },
        pointInitialCheckColors: { ...pointInitialCheckColors.value },
        pointCheckColorInputs: { ...pointCheckColorInputs.value },
        activeImageIndex: activeImageIndex.value,
        zoomScale: zoomScale.value,
        defaultTolerance: defaultTolerance.value,
        updatedAt: Date.now(),
    }
    await db.scriptColorToolStates.put(payload)
}

/**
 * 调度状态持久化（防抖）。
 */
function schedulePersistScriptColorToolState() {
    if (restoringPersistedState.value) {
        return
    }
    if (persistStateTimer) {
        clearTimeout(persistStateTimer)
    }
    persistStateTimer = setTimeout(() => {
        void persistScriptColorToolState()
    }, 200)
}

/**
 * 从 Dexie 恢复图色工具状态。
 */
async function restoreScriptColorToolState() {
    restoringPersistedState.value = true
    try {
        const state = await db.scriptColorToolStates.get("default")
        if (!state) {
            return
        }
        resetImageState()

        const restoredImages: LoadedImageItem[] = []
        for (const image of state.images) {
            const imageData = await readImageDataFromUrl(image.sourceDataUrl)
            restoredImages.push({
                id: image.id,
                name: image.name,
                url: image.sourceDataUrl,
                sourceDataUrl: image.sourceDataUrl,
                width: imageData.width,
                height: imageData.height,
                data: imageData.data,
                revokeUrl: false,
            })
        }

        loadedImages.value = restoredImages
        imageLabels.value = { ...state.imageLabels }
        points.value = state.points.map(point => ({
            id: point.id,
            x: point.x,
            y: point.y,
        }))
        pointTolerances.value = { ...state.pointTolerances }
        pointInitialCheckColors.value = { ...state.pointInitialCheckColors }
        pointCheckColorInputs.value = { ...state.pointCheckColorInputs }
        pointCheckColorEditing.value = {}
        defaultTolerance.value = normalizeTolerance(state.defaultTolerance ?? 10)
        zoomScale.value = Math.max(1, Math.min(32, Math.round(state.zoomScale ?? 4)))
        if (restoredImages.length > 0) {
            activeImageIndex.value = Math.max(0, Math.min(restoredImages.length - 1, Math.round(state.activeImageIndex ?? 0)))
        } else {
            activeImageIndex.value = 0
        }

        const maxPointId = points.value.reduce((maxId, point) => Math.max(maxId, point.id), 0)
        pointIdSeed = maxPointId + 1
    } catch (error) {
        console.error("恢复图色工具状态失败", error)
    } finally {
        restoringPersistedState.value = false
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
 * 设置当前展示图片索引。
 * @param index 目标索引
 */
function setActiveImageIndex(index: number) {
    if (loadedImages.value.length === 0) {
        activeImageIndex.value = 0
        return
    }
    activeImageIndex.value = Math.max(0, Math.min(loadedImages.value.length - 1, index))
    schedulePersistScriptColorToolState()
}

/**
 * 处理图片切换下拉框输入。
 * @param event 输入事件
 */
function handleActiveImageChange(event: Event) {
    const input = event.target as HTMLSelectElement
    setActiveImageIndex(Number(input.value))
}

/**
 * 更新指定图片的分类标签文本。
 * @param imageId 图片 ID
 * @param event 输入事件
 */
function updateImageLabelInput(imageId: string, event: Event) {
    const input = event.target as HTMLInputElement
    imageLabels.value = {
        ...imageLabels.value,
        [imageId]: input.value,
    }
    schedulePersistScriptColorToolState()
}

/**
 * 进入指定图片标签编辑态，并聚焦输入框。
 * @param imageId 图片 ID
 */
function beginEditImageLabel(imageId: string) {
    imageLabelEditing.value = {
        ...imageLabelEditing.value,
        [imageId]: true,
    }
    nextTick(() => {
        const input = document.querySelector(`[data-image-label-input-id="${imageId}"]`) as HTMLInputElement | null
        input?.focus()
        input?.select()
    })
}

/**
 * 结束指定图片标签编辑态。
 * @param imageId 图片 ID
 */
function endEditImageLabel(imageId: string) {
    const nextEditing = { ...imageLabelEditing.value }
    delete nextEditing[imageId]
    imageLabelEditing.value = nextEditing
}

/**
 * 删除指定图片。
 * @param imageId 图片 ID
 */
function removeImage(imageId: string) {
    const index = loadedImages.value.findIndex(image => image.id === imageId)
    if (index < 0) {
        return
    }
    const [removed] = loadedImages.value.splice(index, 1)
    if (removed?.revokeUrl) {
        URL.revokeObjectURL(removed.url)
    }

    const nextLabels = { ...imageLabels.value }
    delete nextLabels[imageId]
    imageLabels.value = nextLabels

    const nextLabelEditing = { ...imageLabelEditing.value }
    delete nextLabelEditing[imageId]
    imageLabelEditing.value = nextLabelEditing

    const nextResults = { ...classificationTestResults.value }
    delete nextResults[imageId]
    classificationTestResults.value = nextResults

    if (loadedImages.value.length === 0) {
        activeImageIndex.value = 0
    } else if (activeImageIndex.value >= loadedImages.value.length) {
        activeImageIndex.value = loadedImages.value.length - 1
    }
    schedulePersistScriptColorToolState()
}

/**
 * 清空已加载的所有图片（保留点位与点位配置）。
 */
function clearImages() {
    revokeLoadedImageUrls()
    loadedImages.value = []
    activeImageIndex.value = 0
    imageLabels.value = {}
    imageLabelEditing.value = {}
    classificationTestResults.value = {}
    schedulePersistScriptColorToolState()
}

/**
 * 将脚本中的颜色参数解析为 RGB 颜色。
 * @param color 脚本颜色值（number 或 string）
 * @returns 颜色信息；无法解析返回 null
 */
function parseScriptColorArgument(color: unknown): PixelColorInfo | null {
    if (typeof color === "number" && Number.isFinite(color)) {
        const numeric = Math.max(0, Math.floor(color))
        const r = (numeric >> 16) & 0xff
        const g = (numeric >> 8) & 0xff
        const b = numeric & 0xff
        return {
            r,
            g,
            b,
            a: 255,
            hex: `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`,
        }
    }
    if (typeof color === "string") {
        const normalized = color.trim().replace(/^0x/i, "").replace(/^#/, "")
        if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
            const r = Number.parseInt(normalized.slice(0, 2), 16)
            const g = Number.parseInt(normalized.slice(2, 4), 16)
            const b = Number.parseInt(normalized.slice(4, 6), 16)
            return {
                r,
                g,
                b,
                a: 255,
                hex: `#${normalized.toUpperCase()}`,
            }
        }
    }
    return null
}

/**
 * 规范化分类函数返回值为可展示文本。
 * @param value 返回值
 * @returns 展示文本
 */
function normalizeClassificationValue(value: unknown): string {
    if (typeof value === "string") {
        return value
    }
    if (value === undefined) {
        return "undefined"
    }
    if (value === null) {
        return "null"
    }
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value)
    }
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

/**
 * 在指定图片上执行脚本中的 cc 判定。
 * @param image 图片数据
 * @param x X 坐标
 * @param y Y 坐标
 * @param color 目标颜色
 * @param tolerance 容差
 * @returns 是否匹配
 */
function evaluateCcForImage(image: LoadedImageItem, x: number, y: number, color: unknown, tolerance: unknown = 10): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return false
    }
    const expected = parseScriptColorArgument(color)
    if (!expected) {
        return false
    }
    const px = getPixelColor(image, Math.floor(x), Math.floor(y))
    if (!px) {
        return false
    }
    const normalizedTolerance = normalizeTolerance(Number(tolerance))
    return isRgbMatch(expected, px, normalizedTolerance)
}

/**
 * 从剪贴板读取分类代码并对每张图片执行一次分类测试。
 */
async function runClassificationTestFromClipboard() {
    if (loadedImages.value.length === 0) {
        ui.showErrorMessage("请先加载图片")
        return
    }

    let code = ""
    try {
        try {
            code = await pasteText()
        } catch {
            code = await navigator.clipboard.readText()
        }
    } catch (error) {
        ui.showErrorMessage(`读取剪贴板失败: ${String(error)}`)
        return
    }

    if (code.trim().length === 0) {
        ui.showErrorMessage("剪贴板中没有可执行代码")
        return
    }

    let executeCheckState: ((cc: ScriptCcFunction, frame: unknown) => unknown) | null = null
    try {
        executeCheckState = new Function(
            "cc",
            "frame",
            `${code}
if (typeof checkState !== "function") {
    throw new Error("剪贴板代码中未找到 checkState(frame) 函数")
}
return checkState(frame)`
        ) as (cc: ScriptCcFunction, frame: unknown) => unknown
    } catch (error) {
        ui.showErrorMessage(`分类代码编译失败: ${String(error)}`)
        return
    }

    const nextResults: Record<string, ClassificationTestResult> = {}
    for (const image of loadedImages.value) {
        try {
            const result = executeCheckState(
                (_frame: unknown, x: number, y: number, color: unknown, tolerance: unknown = 10) =>
                    evaluateCcForImage(image, x, y, color, tolerance),
                image
            )
            nextResults[image.id] = {
                result: normalizeClassificationValue(result),
                error: false,
            }
        } catch (error) {
            nextResults[image.id] = {
                result: String(error),
                error: true,
            }
        }
    }
    classificationTestResults.value = nextResults
    ui.showSuccessMessage("已完成剪贴板分类测试")
}

/**
 * 设置图像缩放倍数（仅支持整数倍）。
 * @param value 目标缩放倍数
 */
function setZoomScale(value: number) {
    const next = Math.round(value)
    zoomScale.value = Math.max(1, Math.min(32, next))
    schedulePersistScriptColorToolState()
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
 * 设置默认容差（仅用于新打点初始化）。
 * @param value 目标容差
 */
function setDefaultTolerance(value: number) {
    defaultTolerance.value = normalizeTolerance(value)
    schedulePersistScriptColorToolState()
}

/**
 * 处理默认容差输入框变更。
 * @param event 输入事件
 */
function handleToleranceInput(event: Event) {
    const input = event.target as HTMLInputElement
    setDefaultTolerance(Number(input.value))
}

/**
 * 设置指定点位的容差。
 * @param pointId 点位 ID
 * @param value 目标容差
 */
function setPointTolerance(pointId: number, value: number) {
    pointTolerances.value = {
        ...pointTolerances.value,
        [pointId]: normalizeTolerance(value),
    }
    schedulePersistScriptColorToolState()
}

/**
 * 处理点位容差输入框变更。
 * @param pointId 点位 ID
 * @param event 输入事件
 */
function handlePointToleranceInput(pointId: number, event: Event) {
    const input = event.target as HTMLInputElement
    setPointTolerance(pointId, Number(input.value))
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

    const pointId = pointIdSeed++
    points.value.push({
        id: pointId,
        x,
        y,
    })
    pointTolerances.value = {
        ...pointTolerances.value,
        [pointId]: defaultTolerance.value,
    }

    const baseColor = getPixelColor(base, x, y)
    if (baseColor) {
        pointInitialCheckColors.value = {
            ...pointInitialCheckColors.value,
            [pointId]: baseColor.hex,
        }
    }
    schedulePersistScriptColorToolState()
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
    const nextInitialColors = { ...pointInitialCheckColors.value }
    delete nextInitialColors[pointId]
    pointInitialCheckColors.value = nextInitialColors
    const nextInputs = { ...pointCheckColorInputs.value }
    delete nextInputs[pointId]
    pointCheckColorInputs.value = nextInputs
    const nextEditing = { ...pointCheckColorEditing.value }
    delete nextEditing[pointId]
    pointCheckColorEditing.value = nextEditing
    const nextTolerances = { ...pointTolerances.value }
    delete nextTolerances[pointId]
    pointTolerances.value = nextTolerances
    schedulePersistScriptColorToolState()
}

/**
 * 清空所有采样点。
 */
function clearPoints() {
    points.value = []
    pointInitialCheckColors.value = {}
    pointCheckColorInputs.value = {}
    pointCheckColorEditing.value = {}
    pointTolerances.value = {}
    schedulePersistScriptColorToolState()
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
    return (
        Math.abs(expected.r - actual.r) <= tolerance &&
        Math.abs(expected.g - actual.g) <= tolerance &&
        Math.abs(expected.b - actual.b) <= tolerance
    )
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
 * 解析输入的 HEX 检查颜色。
 * @param input 颜色输入文本
 * @returns 颜色信息；无效输入返回 null
 */
function parseCheckHexColor(input: string): PixelColorInfo | null {
    const normalized = input.trim().replace(/^0x/i, "").replace(/^#/, "")
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
        return null
    }

    const r = Number.parseInt(normalized.slice(0, 2), 16)
    const g = Number.parseInt(normalized.slice(2, 4), 16)
    const b = Number.parseInt(normalized.slice(4, 6), 16)
    return {
        r,
        g,
        b,
        a: 255,
        hex: `#${normalized.toUpperCase()}`,
    }
}

/**
 * 更新指定点位的检查颜色输入值。
 * @param pointId 点位 ID
 * @param event 输入事件
 */
function updatePointCheckColorInput(pointId: number, event: Event) {
    const input = event.target as HTMLInputElement
    const value = input.value
    const nextInputs = { ...pointCheckColorInputs.value }
    if (value.trim().length === 0) {
        delete nextInputs[pointId]
    } else {
        nextInputs[pointId] = value
    }
    pointCheckColorInputs.value = nextInputs
    schedulePersistScriptColorToolState()
}

/**
 * 进入指定点位的检查颜色编辑态，并聚焦输入框。
 * @param pointId 点位 ID
 */
function beginEditPointCheckColor(pointId: number) {
    pointCheckColorEditing.value = {
        ...pointCheckColorEditing.value,
        [pointId]: true,
    }

    nextTick(() => {
        const input = document.querySelector(`[data-check-color-input-id="${pointId}"]`) as HTMLInputElement | null
        input?.focus()
        input?.select()
    })
}

/**
 * 结束指定点位的检查颜色编辑态。
 * @param pointId 点位 ID
 */
function endEditPointCheckColor(pointId: number) {
    const nextEditing = { ...pointCheckColorEditing.value }
    delete nextEditing[pointId]
    pointCheckColorEditing.value = nextEditing
}

/**
 * 将颜色设置为指定点位的检查颜色。
 * @param pointId 点位 ID
 * @param color 颜色信息
 */
function applyPointCheckColor(pointId: number, color: PixelColorInfo) {
    pointCheckColorInputs.value = {
        ...pointCheckColorInputs.value,
        [pointId]: color.hex,
    }
    schedulePersistScriptColorToolState()
}

/**
 * 获取分类中可用的点位条件列表（无效检查色和越界点位会被跳过）。
 * @returns 点位条件列表
 */
function getClassificationPointItems(): ClassificationPointItem[] {
    const items: ClassificationPointItem[] = []
    for (const row of pointColorRows.value) {
        if (!row.checkColor || row.checkColorInputInvalid) {
            continue
        }
        if (row.colors.some(entry => entry.color === null)) {
            continue
        }
        items.push({
            pointIndex: row.pointIndex,
            condition: `cc(frame,${row.point.x},${row.point.y},${toScriptHex(row.checkColor)},${row.tolerance})`,
            matches: row.colors.map(entry => entry.match),
        })
    }
    return items
}

/**
 * 计算给定图片索引集合的 Gini 不纯度。
 * @param indices 图片索引集合
 * @param labels 图片标签数组
 * @returns Gini 值
 */
function calculateGini(indices: number[], labels: string[]): number {
    if (indices.length === 0) {
        return 0
    }
    const counts = new Map<string, number>()
    for (const index of indices) {
        const label = labels[index]
        counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    let impurity = 1
    for (const count of counts.values()) {
        const probability = count / indices.length
        impurity -= probability * probability
    }
    return impurity
}

/**
 * 获取给定图片索引集合的多数标签。
 * @param indices 图片索引集合
 * @param labels 图片标签数组
 * @returns 多数标签
 */
function getMajorityLabel(indices: number[], labels: string[]): string {
    const counts = new Map<string, number>()
    for (const index of indices) {
        const label = labels[index]
        counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    let bestLabel = labels[indices[0]] ?? "unknown"
    let bestCount = -1
    for (const [label, count] of counts.entries()) {
        if (count > bestCount) {
            bestLabel = label
            bestCount = count
        }
    }
    return bestLabel
}

/**
 * 递归构建基于点位匹配结果的二叉分类树。
 * @param imageIndices 当前参与分类的图片索引集合
 * @param pointItemIndices 可用点位条件索引集合
 * @param labels 图片标签数组
 * @param pointItems 点位条件数组
 * @returns 分类树节点
 */
function buildClassificationTree(
    imageIndices: number[],
    pointItemIndices: number[],
    labels: string[],
    pointItems: ClassificationPointItem[]
): ClassificationTreeNode {
    if (imageIndices.length === 0) {
        return {
            type: "leaf",
            label: "unknown",
            ambiguous: true,
        }
    }

    const labelSet = new Set(imageIndices.map(index => labels[index]))
    if (labelSet.size <= 1) {
        return {
            type: "leaf",
            label: labels[imageIndices[0]] ?? "unknown",
            ambiguous: false,
        }
    }

    let bestPointItemIndex = -1
    let bestGain = 0
    let bestTrueIndices: number[] = []
    let bestFalseIndices: number[] = []
    const parentGini = calculateGini(imageIndices, labels)

    for (const pointItemIndex of pointItemIndices) {
        const pointItem = pointItems[pointItemIndex]
        const trueIndices: number[] = []
        const falseIndices: number[] = []
        for (const imageIndex of imageIndices) {
            if (pointItem.matches[imageIndex]) {
                trueIndices.push(imageIndex)
            } else {
                falseIndices.push(imageIndex)
            }
        }
        if (trueIndices.length === 0 || falseIndices.length === 0) {
            continue
        }

        const trueWeight = trueIndices.length / imageIndices.length
        const falseWeight = falseIndices.length / imageIndices.length
        const gain = parentGini - trueWeight * calculateGini(trueIndices, labels) - falseWeight * calculateGini(falseIndices, labels)
        if (gain > bestGain) {
            bestGain = gain
            bestPointItemIndex = pointItemIndex
            bestTrueIndices = trueIndices
            bestFalseIndices = falseIndices
        }
    }

    if (bestPointItemIndex < 0) {
        return {
            type: "leaf",
            label: getMajorityLabel(imageIndices, labels),
            ambiguous: true,
        }
    }

    const nextPointItemIndices = pointItemIndices.filter(index => index !== bestPointItemIndex)
    return {
        type: "branch",
        pointItemIndex: bestPointItemIndex,
        trueNode: buildClassificationTree(bestTrueIndices, nextPointItemIndices, labels, pointItems),
        falseNode: buildClassificationTree(bestFalseIndices, nextPointItemIndices, labels, pointItems),
    }
}

/**
 * 将分类树渲染为可执行的 JavaScript 条件代码。
 * @param node 分类树节点
 * @param pointItems 点位条件数组
 * @param indentLevel 缩进层级
 * @returns 代码行数组
 */
function renderClassificationTree(node: ClassificationTreeNode, pointItems: ClassificationPointItem[], indentLevel: number): string[] {
    const indent = "    ".repeat(indentLevel)
    if (node.type === "leaf") {
        const labelLiteral = JSON.stringify(node.label)
        if (node.ambiguous) {
            return [`${indent}return ${labelLiteral} // 存在重叠样本，回退为多数标签`]
        }
        return [`${indent}return ${labelLiteral}`]
    }

    const condition = pointItems[node.pointItemIndex].condition
    const lines: string[] = [`${indent}if (${condition}) {`]
    lines.push(...renderClassificationTree(node.trueNode, pointItems, indentLevel + 1))
    lines.push(`${indent}}`)
    lines.push(`${indent} else {`)
    lines.push(...renderClassificationTree(node.falseNode, pointItems, indentLevel + 1))
    lines.push(`${indent}}`)
    return lines
}

/**
 * 生成图片分类函数代码。
 * @returns 分类函数代码；无法生成时返回 null
 */
function generateClassificationCode(): string | null {
    if (loadedImages.value.length === 0) {
        ui.showErrorMessage("请先加载图片")
        return null
    }
    if (points.value.length === 0) {
        ui.showErrorMessage("请先添加至少一个检测点")
        return null
    }

    const pointItems = getClassificationPointItems()
    if (pointItems.length === 0) {
        ui.showErrorMessage("没有可用于分类的有效点位，请检查颜色输入和点位范围")
        return null
    }

    const labels = loadedImages.value.map((_, index) => getImageLabelByIndex(index))
    const imageIndices = loadedImages.value.map((_, index) => index)
    const pointItemIndices = pointItems.map((_, index) => index)
    const tree = buildClassificationTree(imageIndices, pointItemIndices, labels, pointItems)

    const lines = ["function checkState(frame) {", ...renderClassificationTree(tree, pointItems, 1), "}"]
    return lines.join("\n")
}

/**
 * 复制自动生成的图片分类函数代码。
 */
async function copyClassificationCode() {
    const code = generateClassificationCode()
    if (!code) {
        return
    }
    try {
        await copyText(code)
        ui.showSuccessMessage("已复制自动分类代码")
    } catch (error) {
        ui.showErrorMessage(`复制失败: ${String(error)}`)
    }
}

/**
 * 复制坐标检测脚本片段：cc(frame,x,y,0xRRGGBB,tolerance)。
 * @param row 颜色行
 */
async function copyCoordinateCommand(row: PointColorRow) {
    if (!row.checkColor) {
        ui.showErrorMessage(`点 #${row.pointIndex} 在当前图中没有有效检查颜色`)
        return
    }

    const command = `cc(frame,${row.point.x},${row.point.y},${toScriptHex(row.checkColor)},${row.tolerance})`
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
        const referenceColor = rawColors[activeImageIndex.value]?.color ?? null
        const initialInput = pointInitialCheckColors.value[point.id] ?? ""
        const customInput = pointCheckColorInputs.value[point.id]
        const trimmedInput = customInput?.trim() ?? ""
        const hasCustomInput = trimmedInput.length > 0
        const effectiveInput = hasCustomInput ? (customInput ?? "") : initialInput
        const parsedCheckColor = parseCheckHexColor(effectiveInput)
        const parsedInputColor = trimmedInput.length > 0 ? parseCheckHexColor(trimmedInput) : null
        const checkColor = parsedCheckColor ?? null
        const checkColorDisplay = checkColor?.hex ?? (hasCustomInput ? (customInput ?? "") : initialInput)
        const checkColorEditing = pointCheckColorEditing.value[point.id] === true
        const tolerance = pointTolerances.value[point.id] ?? defaultTolerance.value

        return {
            point,
            pointIndex: pointIndex + 1,
            referenceColor,
            tolerance,
            checkColor,
            checkColorDisplay,
            checkColorInput: hasCustomInput ? (customInput ?? "") : initialInput,
            checkColorCustom: hasCustomInput,
            checkColorInputInvalid: hasCustomInput && trimmedInput.length > 0 && !parsedInputColor,
            checkColorEditing,
            colors: rawColors.map(entry => ({
                imageId: entry.imageId,
                color: entry.color,
                match: checkColor && entry.color ? isRgbMatch(checkColor, entry.color, tolerance) : false,
            })),
        }
    })
)

/**
 * 构建“图片 x 点位”的颜色矩阵（已按行列转置）。
 */
const imageColorRows = computed<ImageColorRow[]>(() =>
    loadedImages.value.map((image, imageIndex) => ({
        image,
        imageIndex,
        colors: pointColorRows.value.map(pointRow => {
            const entry = pointRow.colors[imageIndex]
            return {
                point: pointRow.point,
                pointIndex: pointRow.pointIndex,
                color: entry?.color ?? null,
                match: entry?.match ?? false,
            }
        }),
    }))
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

onMounted(async () => {
    await restoreScriptColorToolState()
    initTauriDragEvents()
})

onUnmounted(() => {
    if (persistStateTimer) {
        clearTimeout(persistStateTimer)
        persistStateTimer = null
    }
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
            <button class="btn btn-sm btn-ghost" @click="clearImages" :disabled="loadedImages.length === 0">清空图片</button>
            <button class="btn btn-sm btn-ghost" @click="clearPoints" :disabled="points.length === 0">清空点位</button>
            <button
                class="btn btn-sm btn-secondary"
                @click="copyClassificationCode"
                :disabled="loadedImages.length === 0 || points.length === 0"
            >
                复制分类代码
            </button>
            <button class="btn btn-sm btn-accent" @click="runClassificationTestFromClipboard" :disabled="loadedImages.length === 0">
                剪贴板测试分类
            </button>
            <div v-if="loadedImages.length > 0" class="flex items-center gap-1">
                <button
                    class="btn btn-sm btn-ghost btn-square"
                    @click="setActiveImageIndex(activeImageIndex - 1)"
                    :disabled="activeImageIndex <= 0"
                >
                    &lt;
                </button>
                <select class="select select-sm select-bordered w-64" :value="activeImageIndex" @change="handleActiveImageChange">
                    <option v-for="(image, index) in loadedImages" :key="image.id" :value="index">{{ index + 1 }}. {{ image.name }}</option>
                </select>
                <button
                    class="btn btn-sm btn-ghost btn-square"
                    @click="setActiveImageIndex(activeImageIndex + 1)"
                    :disabled="activeImageIndex >= loadedImages.length - 1"
                >
                    &gt;
                </button>
                <span class="text-xs text-base-content/70">当前图 {{ activeImageIndex + 1 }}/{{ loadedImages.length }}</span>
            </div>
            <div class="flex items-center gap-1">
                <button class="btn btn-sm btn-ghost btn-square" @click="zoomOut" :disabled="zoomScale <= 1">-</button>
                <input
                    type="number"
                    class="input input-sm input-bordered w-20 text-center"
                    :value="zoomScale"
                    min="1"
                    max="32"
                    step="1"
                    @change="handleZoomInput"
                />
                <button class="btn btn-sm btn-ghost btn-square" @click="zoomIn" :disabled="zoomScale >= 32">+</button>
                <span class="text-xs text-base-content/70">缩放 {{ zoomScale }}x（1:N 像素）</span>
            </div>
            <div class="flex items-center gap-1">
                <span class="text-xs text-base-content/70">默认容差</span>
                <input
                    type="number"
                    class="input input-sm input-bordered w-20 text-center"
                    :value="defaultTolerance"
                    min="0"
                    max="255"
                    step="1"
                    @change="handleToleranceInput"
                />
                <span class="text-xs text-base-content/70">新打点使用</span>
            </div>
            <input ref="fileInputRef" type="file" multiple accept="image/*" class="hidden" @change="handleFileSelection" />
            <div class="text-xs text-base-content/70">
                请先加载多张图片，然后在当前图上点击添加坐标点（坐标可点击复制 cc，桌面端支持拖拽导入）
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0 flex-1">
            <div class="card bg-base-100 border border-base-300 min-h-0">
                <div class="card-body min-h-0 p-3 gap-3">
                    <div class="text-sm font-medium">当前图（支持切换，点击打点）</div>
                    <div class="flex-1 overflow-auto border border-base-300 rounded bg-base-200/30 p-2">
                        <div v-if="!referenceImage" class="h-full min-h-60 flex items-center justify-center text-base-content/50 text-sm">
                            暂无图片
                        </div>
                        <div v-else class="relative" :style="referenceLayerStyle">
                            <img
                                ref="referenceImageRef"
                                :src="referenceImage.url"
                                :alt="referenceImage.name"
                                class="select-none cursor-crosshair"
                                :style="referenceImageStyle"
                                @click="addPointOnReferenceImage"
                            />
                            <div
                                v-for="(point, index) in points"
                                :key="point.id"
                                class="absolute pointer-events-none"
                                :style="getPointAnchorStyle(point)"
                            >
                                <div
                                    class="absolute left-0 top-0 w-2 h-2 rounded-full bg-error border border-white shadow -translate-x-1/2 -translate-y-1/2"
                                ></div>
                                <div class="absolute left-0 top-0" :style="getPointBubbleContainerStyle(point)">
                                    <div
                                        class="relative rounded-md bg-base-100 border border-base-300 shadow px-2 py-1 text-[10px] leading-tight whitespace-nowrap"
                                    >
                                        <div class="font-semibold text-error">#{{ index + 1 }}</div>
                                        <div class="text-base-content/80">{{ point.x }}, {{ point.y }}</div>
                                        <span
                                            class="absolute w-2 h-2 bg-base-100 border-l border-b border-base-300"
                                            :style="getPointBubbleTailStyle(point)"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="text-xs text-base-content/60">已加载 {{ loadedImages.length }} 张图片，已打点 {{ points.length }} 个</div>
                </div>
            </div>

            <div class="card bg-base-100 border border-base-300 min-h-0">
                <div class="card-body min-h-0 p-3 gap-3">
                    <div class="text-sm font-medium">同坐标颜色信息</div>
                    <div class="flex-1 overflow-auto border border-base-300 rounded">
                        <div
                            v-if="points.length === 0 || loadedImages.length === 0"
                            class="h-full min-h-60 flex items-center justify-center text-base-content/50 text-sm"
                        >
                            请先加载图片并在当前图上点击添加点位
                        </div>
                        <table v-else class="table table-xs">
                            <thead>
                                <tr>
                                    <th class="min-w-42">图片/标签</th>
                                    <th class="min-w-36">分类结果</th>
                                    <th v-for="row in pointColorRows" :key="row.point.id" class="align-top">
                                        <div class="flex items-center justify-between gap-2">
                                            <div class="font-semibold">点 #{{ row.pointIndex }}</div>
                                            <button
                                                class="btn btn-ghost btn-xs text-error h-5 min-h-0 px-1"
                                                @click="removePoint(row.point.id)"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <button class="link link-hover text-info text-xs" @click="copyCoordinateCommand(row)">
                                            ({{ row.point.x }}, {{ row.point.y }})
                                        </button>
                                        <div class="mt-1 flex flex-col gap-1">
                                            <div v-if="row.checkColorEditing" class="flex items-center gap-2">
                                                <input
                                                    :data-check-color-input-id="row.point.id"
                                                    type="text"
                                                    class="input input-xs w-28 font-mono"
                                                    :class="row.checkColorInputInvalid ? 'input-error' : 'input-bordered'"
                                                    :value="row.checkColorInput"
                                                    placeholder="#RRGGBB 或 0xRRGGBB"
                                                    @input="updatePointCheckColorInput(row.point.id, $event)"
                                                    @blur="endEditPointCheckColor(row.point.id)"
                                                    @keydown.enter.prevent="endEditPointCheckColor(row.point.id)"
                                                    @keydown.esc.prevent="endEditPointCheckColor(row.point.id)"
                                                />
                                            </div>
                                            <button
                                                v-else
                                                class="w-fit flex items-center gap-2 text-[10px] text-base-content/75 hover:text-base-content"
                                                @click="beginEditPointCheckColor(row.point.id)"
                                            >
                                                <span
                                                    class="inline-block w-3 h-3 rounded border border-base-300"
                                                    :style="{ backgroundColor: row.checkColor ? row.checkColor.hex : 'transparent' }"
                                                />
                                                <span class="font-mono">{{ row.checkColorDisplay || "无效" }}</span>
                                            </button>
                                            <div class="flex items-center gap-1">
                                                <span class="text-[10px] text-base-content/60">容差</span>
                                                <input
                                                    type="number"
                                                    class="input input-xs input-bordered w-20 text-center"
                                                    :value="row.tolerance"
                                                    min="0"
                                                    max="255"
                                                    step="1"
                                                    @change="handlePointToleranceInput(row.point.id, $event)"
                                                />
                                            </div>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="imageRow in imageColorRows"
                                    :key="imageRow.image.id"
                                    :class="{ 'bg-primary/5': imageRow.imageIndex === activeImageIndex }"
                                >
                                    <td>
                                        <div class="flex items-center gap-1">
                                            <button
                                                class="link link-hover text-left"
                                                :class="
                                                    imageRow.imageIndex === activeImageIndex
                                                        ? 'text-primary font-semibold'
                                                        : 'text-base-content'
                                                "
                                                @click="setActiveImageIndex(imageRow.imageIndex)"
                                            >
                                                <div class="truncate" :title="imageRow.image.name">
                                                    {{ imageRow.imageIndex + 1 }}. {{ imageRow.image.name }}
                                                </div>
                                            </button>
                                            <button
                                                class="btn btn-ghost btn-xs text-error h-5 min-h-0 px-1"
                                                @click="removeImage(imageRow.image.id)"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                        <div class="mt-1">
                                            <input
                                                v-if="imageLabelEditing[imageRow.image.id]"
                                                :data-image-label-input-id="imageRow.image.id"
                                                type="text"
                                                class="input input-xs input-bordered w-full"
                                                :value="imageLabels[imageRow.image.id] ?? ''"
                                                placeholder="输入分类标签"
                                                @input="updateImageLabelInput(imageRow.image.id, $event)"
                                                @blur="endEditImageLabel(imageRow.image.id)"
                                                @keydown.enter.prevent="endEditImageLabel(imageRow.image.id)"
                                                @keydown.esc.prevent="endEditImageLabel(imageRow.image.id)"
                                            />
                                            <button
                                                v-else
                                                class="link link-hover text-xs text-left"
                                                @click="beginEditImageLabel(imageRow.image.id)"
                                            >
                                                {{ getImageLabelByIndex(imageRow.imageIndex) }}
                                            </button>
                                        </div>
                                    </td>
                                    <td>
                                        <div
                                            v-if="classificationTestResults[imageRow.image.id]"
                                            class="text-xs font-semibold break-all"
                                            :class="
                                                classificationTestResults[imageRow.image.id].error
                                                    ? 'text-error'
                                                    : classificationTestResults[imageRow.image.id].result ===
                                                        getImageLabelByIndex(imageRow.imageIndex)
                                                      ? 'text-success'
                                                      : 'text-error'
                                            "
                                        >
                                            {{ classificationTestResults[imageRow.image.id].result }}
                                        </div>
                                        <div v-else class="text-xs text-base-content/50">未测试</div>
                                    </td>
                                    <td v-for="entry in imageRow.colors" :key="`${imageRow.image.id}-${entry.point.id}`">
                                        <div v-if="entry.color" class="flex items-center gap-2">
                                            <span
                                                class="inline-block w-4 h-4 rounded border border-base-300"
                                                :style="{
                                                    backgroundColor: `rgba(${entry.color.r}, ${entry.color.g}, ${entry.color.b}, ${entry.color.a / 255})`,
                                                }"
                                            />
                                            <div class="leading-tight">
                                                <div>{{ entry.color.hex }}</div>
                                                <div class="text-[10px]">
                                                    <span class="text-base-content/60">匹配:</span>
                                                    <span class="ml-1 font-semibold" :class="entry.match ? 'text-success' : 'text-error'">
                                                        {{ entry.match ? 1 : 0 }}
                                                    </span>
                                                </div>
                                                <div class="text-[10px]">
                                                    <button
                                                        class="link link-hover text-info"
                                                        @click="applyPointCheckColor(entry.point.id, entry.color)"
                                                    >
                                                        设为检查色
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        <div v-else class="text-base-content/50">超出范围</div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-if="isDragging"
            class="absolute inset-0 z-50 bg-base-100/70 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none"
        >
            <div class="text-center">
                <div class="text-lg font-medium text-primary">拖拽图片到此处导入</div>
                <div class="text-xs text-base-content/70 mt-1">支持 png / jpg / jpeg / webp / bmp / gif / tiff / ico</div>
            </div>
        </div>
    </div>
</template>
