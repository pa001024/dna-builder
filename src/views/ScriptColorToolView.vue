<script setup lang="ts">
import * as dialog from "@tauri-apps/plugin-dialog"
import type { CSSProperties } from "vue"
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import { deleteFile, getDocumentsDir, importPic, runScript, stopScriptByPath, writeTextFile } from "@/api/app"
import { env } from "@/env"
import type { ScriptColorToolState } from "@/store/db"
import { db } from "@/store/db"
import { useScriptRuntimeStore } from "@/store/scriptRuntime"
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
    toleranceInput: string
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
    forceCheck: boolean
    color: PixelColorInfo | null
    match: boolean
}

interface ImageColorRow {
    image: LoadedImageItem
    imageIndex: number
    label: string
    colors: ImagePointColorEntry[]
}

interface ClassificationTestResult {
    result: string
    error: boolean
}

interface ScriptColorToolProjectExport {
    type: "script-color-tool-project"
    version: 1
    exportedAt: number
    state: ScriptColorToolState
}

type ScriptCcFunction = (frame: unknown, x: number, y: number, color: unknown, tolerance?: unknown) => boolean

interface ClassificationPointItem {
    pointId: number
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
const CLASSIFICATION_UNKNOWN_LABEL = "unknown"

const router = useRouter()
const ui = useUIStore()
const scriptRuntime = useScriptRuntimeStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const projectFileInputRef = ref<HTMLInputElement | null>(null)
const referenceImageRef = ref<HTMLImageElement | null>(null)
const loadedImages = ref<LoadedImageItem[]>([])
const points = ref<PointItem[]>([])
const activeImageIndex = ref(0)
const imageLabels = ref<Record<string, string>>({})
const imageLabelEditing = ref<Record<string, boolean>>({})
const pointInitialCheckColors = ref<Record<number, string>>({})
const pointCheckColorInputs = ref<Record<number, string>>({})
const pointCheckColorEditing = ref<Record<number, boolean>>({})
const pointCategoryForceChecks = ref<Record<string, boolean>>({})
const pointTolerances = ref<Record<number, number>>({})
const pointToleranceInputs = ref<Record<number, string>>({})
const classificationTestResults = ref<Record<string, ClassificationTestResult>>({})
const loading = ref(false)
const isDragging = ref(false)
const zoomScale = ref(4)
const defaultTolerance = ref(10)
const realtimeTestCloudMode = ref(false)
const restoringPersistedState = ref(false)
const realtimeTestScriptPath = ref("")
let pointIdSeed = 1
let unlistenDragEnter = () => {}
let unlistenDragLeave = () => {}
let unlistenDragDrop = () => {}
let persistStateTimer: ReturnType<typeof setTimeout> | null = null

const REALTIME_TEST_STATUS_RESULT = "result"
const REALTIME_TEST_STATUS_IMAGE = "img"
const REALTIME_TEST_STATUS_FPS = "fps"
const REALTIME_TEST_SCRIPT_FILE_NAME = "__script_color_tool_realtime_test__.js"

const referenceImage = computed(() => loadedImages.value[activeImageIndex.value] ?? null)
/**
 * 规范化脚本事件作用域，统一路径分隔符与大小写。
 * @param scope 原始作用域
 * @returns 规范化作用域
 */
function normalizeScriptEventScope(scope?: string | null): string {
    return String(scope ?? "")
        .trim()
        .replace(/\//g, "\\")
        .toLowerCase()
}

/**
 * 按脚本路径提取文件名。
 * @param scriptPath 脚本完整路径
 * @returns 文件名
 */
function getScriptFileNameFromPath(scriptPath: string): string {
    return (
        String(scriptPath ?? "")
            .split(/[\\/]/)
            .filter(Boolean)
            .pop() ?? ""
    )
}

/**
 * 获取图色工具实时测试脚本当前作用域。
 * @returns 当前作用域
 */
function getCurrentRealtimeTestScope(): string {
    return normalizeScriptEventScope(realtimeTestScriptPath.value)
}

/**
 * 判断实时测试状态事件 scope 是否应被当前页面接收。
 * @param scope 事件 scope
 * @returns true 表示接收；false 表示忽略
 */
function shouldAcceptRealtimeTestScopedEvent(scope?: string | null): boolean {
    const payloadScope = normalizeScriptEventScope(scope)
    if (!payloadScope) {
        return true
    }
    const currentScope = getCurrentRealtimeTestScope()
    if (!currentScope) {
        return false
    }
    if (payloadScope === currentScope) {
        return true
    }
    const payloadFileName = getScriptFileNameFromPath(payloadScope).toLowerCase()
    const currentFileName = getScriptFileNameFromPath(currentScope).toLowerCase()
    return Boolean(payloadFileName) && payloadFileName === currentFileName
}

const realtimeTestStatuses = computed(() =>
    scriptRuntime.scriptStatuses.filter(status => shouldAcceptRealtimeTestScopedEvent(status.scope))
)
const runningScriptFileNameSet = computed(
    () => new Set(scriptRuntime.runningScriptPaths.map(path => getScriptFileNameFromPath(path)).filter(Boolean))
)
const realtimeTestResultStatus = computed(
    () => realtimeTestStatuses.value.find(status => status.title === REALTIME_TEST_STATUS_RESULT) ?? null
)
const realtimeTestImageStatus = computed(
    () => realtimeTestStatuses.value.find(status => status.title === REALTIME_TEST_STATUS_IMAGE) ?? null
)
const realtimeTestFpsStatus = computed(() => realtimeTestStatuses.value.find(status => status.title === REALTIME_TEST_STATUS_FPS) ?? null)
const realtimeTestResultText = computed(() => realtimeTestResultStatus.value?.text ?? "")
const realtimeTestFpsText = computed(() => realtimeTestFpsStatus.value?.text ?? "")
const realtimeTestImageUrl = computed(() => realtimeTestImageStatus.value?.image ?? realtimeTestImageStatus.value?.images?.[0] ?? "")
const isRealtimeTesting = computed(() => runningScriptFileNameSet.value.has(REALTIME_TEST_SCRIPT_FILE_NAME))
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
    pointCategoryForceChecks.value = {}
    pointTolerances.value = {}
    pointToleranceInputs.value = {}
    classificationTestResults.value = {}
    pointIdSeed = 1
}

/**
 * 获取默认分类标签。
 * @returns 默认标签
 */
function inferDefaultImageLabel(): string {
    return CLASSIFICATION_UNKNOWN_LABEL
}

/**
 * 初始化每张图片的分类标签。
 * @param items 已加载图片列表
 */
function appendImageLabels(items: LoadedImageItem[]) {
    const nextLabels: Record<string, string> = { ...imageLabels.value }
    for (const image of items) {
        if (!(image.id in nextLabels)) {
            nextLabels[image.id] = inferDefaultImageLabel()
        }
    }
    imageLabels.value = nextLabels
}

/**
 * 获取指定索引图片的有效分类标签（空值回退 unknown）。
 * @param index 图片索引
 * @returns 有效标签
 */
function getImageLabelByIndex(index: number): string {
    const image = loadedImages.value[index]
    if (!image) {
        return inferDefaultImageLabel()
    }
    const inputValue = imageLabels.value[image.id]?.trim() ?? ""
    return inputValue.length > 0 ? inputValue : inferDefaultImageLabel()
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
 * 读取 data URL 图片并转换为可采样的像素数据。
 * @param sourceDataUrl 图片 data URL
 * @param name 图片名称
 * @param index 当前序号
 * @returns 已加载图片对象
 */
async function loadImageDataUrl(sourceDataUrl: string, name: string, index: number): Promise<LoadedImageItem> {
    const imageData = await readImageDataFromUrl(sourceDataUrl)
    return {
        id: `${name}-${Date.now()}-${index}`,
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
        appendImageLabels(items)
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
        appendImageLabels(items)
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
 * 构建当前图色工具状态快照。
 * @returns 当前状态快照
 */
function createScriptColorToolStateSnapshot(): ScriptColorToolState {
    return {
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
        pointCategoryForceChecks: { ...pointCategoryForceChecks.value },
        activeImageIndex: activeImageIndex.value,
        zoomScale: zoomScale.value,
        defaultTolerance: defaultTolerance.value,
        realtimeTestCloudMode: realtimeTestCloudMode.value,
        updatedAt: Date.now(),
    }
}

/**
 * 将状态快照应用到当前页面并重建图片数据。
 * @param state 状态快照
 */
async function applyScriptColorToolStateSnapshot(state: ScriptColorToolState) {
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
    pointToleranceInputs.value = {}
    pointInitialCheckColors.value = { ...state.pointInitialCheckColors }
    pointCheckColorInputs.value = { ...state.pointCheckColorInputs }
    pointCategoryForceChecks.value = { ...(state.pointCategoryForceChecks ?? {}) }
    pointCheckColorEditing.value = {}
    imageLabelEditing.value = {}
    classificationTestResults.value = {}
    defaultTolerance.value = normalizeTolerance(state.defaultTolerance ?? 10)
    realtimeTestCloudMode.value = state.realtimeTestCloudMode ?? false
    zoomScale.value = Math.max(1, Math.min(32, Math.round(state.zoomScale ?? 4)))
    if (restoredImages.length > 0) {
        activeImageIndex.value = Math.max(0, Math.min(restoredImages.length - 1, Math.round(state.activeImageIndex ?? 0)))
    } else {
        activeImageIndex.value = 0
    }

    const maxPointId = points.value.reduce((maxId, point) => Math.max(maxId, point.id), 0)
    pointIdSeed = maxPointId + 1
}

/**
 * 将当前工具状态持久化到 Dexie。
 */
async function persistScriptColorToolState() {
    if (restoringPersistedState.value) {
        return
    }
    const payload = createScriptColorToolStateSnapshot()
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
        await applyScriptColorToolStateSnapshot(state)
    } catch (error) {
        console.error("恢复图色工具状态失败", error)
    } finally {
        restoringPersistedState.value = false
    }
}

/**
 * 读取工程文件并返回导出数据。
 * @param file JSON 文件
 * @returns 导出数据
 */
function readProjectExportFile(file: File): Promise<ScriptColorToolProjectExport> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = event => {
            try {
                const text = event.target?.result as string
                const payload = JSON.parse(text) as Partial<ScriptColorToolProjectExport>
                if (payload.type !== "script-color-tool-project" || payload.version !== 1 || !payload.state) {
                    throw new Error("工程文件格式不正确")
                }
                resolve(payload as ScriptColorToolProjectExport)
            } catch (error) {
                reject(error)
            }
        }
        reader.onerror = () => {
            reject(new Error("读取工程文件失败"))
        }
        reader.readAsText(file)
    })
}

/**
 * 导出整个图色工程到 JSON 文件。
 */
async function exportProject() {
    try {
        const payload: ScriptColorToolProjectExport = {
            type: "script-color-tool-project",
            version: 1,
            exportedAt: Date.now(),
            state: createScriptColorToolStateSnapshot(),
        }
        const json = JSON.stringify(payload, null, 2)
        const fileName = `script-color-tool-project-${new Date(payload.exportedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`

        if (env.isApp) {
            const path = await dialog.save({
                title: "导出图色工具工程",
                defaultPath: fileName,
                filters: [{ name: "JSON 文件", extensions: ["json"] }],
            })
            if (!path) {
                return
            }
            await writeTextFile(path, json)
        } else {
            const blob = new Blob([json], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = fileName
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        }
        ui.showSuccessMessage("工程导出成功")
    } catch (error) {
        console.error("导出图色工具工程失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : "工程导出失败")
    }
}

/**
 * 打开工程文件选择器。
 */
function openProjectImportPicker() {
    projectFileInputRef.value?.click()
}

/**
 * 导入整个图色工程。
 * @param event input change 事件
 */
async function handleProjectImportSelection(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) {
        return
    }

    restoringPersistedState.value = true
    try {
        const payload = await readProjectExportFile(file)
        await applyScriptColorToolStateSnapshot(payload.state)
        await db.scriptColorToolStates.put({
            ...createScriptColorToolStateSnapshot(),
            id: "default",
        })
        ui.showSuccessMessage("工程导入成功")
    } catch (error) {
        console.error("导入图色工具工程失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : "工程导入失败")
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
    const normalizedValue = normalizeTolerance(value)
    pointTolerances.value = {
        ...pointTolerances.value,
        [pointId]: normalizedValue,
    }
    pointToleranceInputs.value = {
        ...pointToleranceInputs.value,
        [pointId]: String(normalizedValue),
    }
    schedulePersistScriptColorToolState()
}

/**
 * 处理点位容差输入框实时变更。
 * @param pointId 点位 ID
 * @param event 输入事件
 */
function handlePointToleranceInput(pointId: number, event: Event) {
    const input = event.target as HTMLInputElement
    pointToleranceInputs.value = {
        ...pointToleranceInputs.value,
        [pointId]: input.value,
    }
}

/**
 * 提交点位容差输入框的值。
 * @param pointId 点位 ID
 */
function commitPointToleranceInput(pointId: number) {
    const rawValue = pointToleranceInputs.value[pointId]
    const parsedValue = Number(rawValue)
    if (!Number.isFinite(parsedValue)) {
        const fallbackValue = pointTolerances.value[pointId] ?? defaultTolerance.value
        pointToleranceInputs.value = {
            ...pointToleranceInputs.value,
            [pointId]: String(fallbackValue),
        }
        return
    }
    setPointTolerance(pointId, parsedValue)
}

/**
 * 取消点位容差输入，恢复到当前已生效值。
 * @param pointId 点位 ID
 */
function revertPointToleranceInput(pointId: number) {
    const fallbackValue = pointTolerances.value[pointId] ?? defaultTolerance.value
    pointToleranceInputs.value = {
        ...pointToleranceInputs.value,
        [pointId]: String(fallbackValue),
    }
}

/**
 * 在参考图上添加采样点。
 * @param event 鼠标事件
 * @param forceCheck 是否按当前分类自动启用强制检查
 */
function addPointOnReferenceImage(event: MouseEvent, forceCheck: boolean) {
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
    const activeLabel = getImageLabelByIndex(activeImageIndex.value)
    if (forceCheck && activeLabel !== CLASSIFICATION_UNKNOWN_LABEL) {
        pointCategoryForceChecks.value = {
            ...pointCategoryForceChecks.value,
            [getPointCategoryForceCheckKey(pointId, activeLabel)]: true,
        }
    }
    schedulePersistScriptColorToolState()
}

/**
 * 处理参考图左键打点，仅添加普通点。
 * @param event 鼠标事件
 */
function handleReferenceImageClick(event: MouseEvent) {
    addPointOnReferenceImage(event, false)
}

/**
 * 处理参考图右键打点，沿用当前强制点逻辑。
 * @param event 鼠标事件
 */
function handleReferenceImageContextMenu(event: MouseEvent) {
    event.preventDefault()
    addPointOnReferenceImage(event, true)
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
 * 判断点位在当前图片分类下是否启用了强制检查。
 * @param point 采样点
 * @returns 是否为当前图强制点
 */
function isPointForcedOnActiveImage(point: PointItem): boolean {
    const activeLabel = getImageLabelByIndex(activeImageIndex.value)
    return activeLabel !== CLASSIFICATION_UNKNOWN_LABEL && isPointCategoryForceCheckEnabled(point.id, activeLabel)
}

/**
 * 获取图片标点圆心的颜色类。
 * @param point 采样点
 * @returns Tailwind 类名
 */
function getPointAnchorColorClass(point: PointItem): string {
    return isPointForcedOnActiveImage(point) ? "bg-success" : "bg-error"
}

/**
 * 获取图片标点编号的颜色类。
 * @param point 采样点
 * @returns Tailwind 类名
 */
function getPointLabelColorClass(point: PointItem): string {
    return isPointForcedOnActiveImage(point) ? "text-success" : "text-error"
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
    const nextForceChecks = { ...pointCategoryForceChecks.value }
    for (const key of Object.keys(nextForceChecks)) {
        if (key.startsWith(`${pointId}:`)) {
            delete nextForceChecks[key]
        }
    }
    pointCategoryForceChecks.value = nextForceChecks
    const nextTolerances = { ...pointTolerances.value }
    delete nextTolerances[pointId]
    pointTolerances.value = nextTolerances
    const nextToleranceInputs = { ...pointToleranceInputs.value }
    delete nextToleranceInputs[pointId]
    pointToleranceInputs.value = nextToleranceInputs
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
    pointCategoryForceChecks.value = {}
    pointTolerances.value = {}
    pointToleranceInputs.value = {}
    schedulePersistScriptColorToolState()
}

/**
 * 构建点位与分类标签的强制检查绑定键。
 * @param pointId 点位 ID
 * @param label 分类标签
 * @returns 绑定键
 */
function getPointCategoryForceCheckKey(pointId: number, label: string): string {
    const normalizedLabel = label.trim() || CLASSIFICATION_UNKNOWN_LABEL
    return `${pointId}:${normalizedLabel}`
}

/**
 * 获取指定点位在某个分类下是否开启强制检查。
 * @param pointId 点位 ID
 * @param label 分类标签
 * @returns 是否开启强制检查
 */
function isPointCategoryForceCheckEnabled(pointId: number, label: string): boolean {
    const key = getPointCategoryForceCheckKey(pointId, label)
    return pointCategoryForceChecks.value[key] ?? false
}

/**
 * 设置指定点位在某个分类下的强制检查开关。
 * @param pointId 点位 ID
 * @param label 分类标签
 * @param forceCheck 是否强制检查
 */
function setPointCategoryForceCheck(pointId: number, label: string, forceCheck: boolean) {
    const key = getPointCategoryForceCheckKey(pointId, label)
    const nextForceChecks = { ...pointCategoryForceChecks.value }
    if (forceCheck) {
        nextForceChecks[key] = true
    } else {
        delete nextForceChecks[key]
    }
    pointCategoryForceChecks.value = nextForceChecks
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
 * 清除指定点位的自定义检查颜色，回退到默认采样色。
 * @param pointId 点位 ID
 */
function clearPointCheckColor(pointId: number) {
    const nextInputs = { ...pointCheckColorInputs.value }
    delete nextInputs[pointId]
    pointCheckColorInputs.value = nextInputs
    schedulePersistScriptColorToolState()
}

/**
 * 判断指定格子的颜色是否就是该点当前使用的检查色。
 * @param pointId 点位 ID
 * @param color 格子颜色
 * @returns 是否已选为检查色
 */
function isCellUsingPointCheckColor(pointId: number, color: PixelColorInfo): boolean {
    const customInput = pointCheckColorInputs.value[pointId]
    const initialInput = pointInitialCheckColors.value[pointId] ?? ""
    const effectiveInput = customInput?.trim().length ? customInput : initialInput
    const checkColor = parseCheckHexColor(effectiveInput)
    return checkColor?.hex === color.hex
}

/**
 * 切换指定格子的“设为检查色”状态。
 * @param pointId 点位 ID
 * @param color 格子颜色
 * @param checked 是否选中
 */
function togglePointCheckColor(pointId: number, color: PixelColorInfo, checked: boolean) {
    if (checked) {
        applyPointCheckColor(pointId, color)
        return
    }
    if (isCellUsingPointCheckColor(pointId, color)) {
        clearPointCheckColor(pointId)
    }
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
            pointId: row.point.id,
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
    let bestLabel = labels[indices[0]] ?? CLASSIFICATION_UNKNOWN_LABEL
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
            label: CLASSIFICATION_UNKNOWN_LABEL,
            ambiguous: true,
        }
    }

    const labelSet = new Set(imageIndices.map(index => labels[index]))
    if (labelSet.size <= 1) {
        return {
            type: "leaf",
            label: labels[imageIndices[0]] ?? CLASSIFICATION_UNKNOWN_LABEL,
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
 * 判断分类子树是否存在可输出的非 unknown 返回分支。
 * @param node 分类树节点
 * @param pointItems 点位条件数组
 * @returns 是否存在有效返回分支
 */
function hasRenderableClassificationReturn(node: ClassificationTreeNode, pointItems: ClassificationPointItem[]): boolean {
    if (node.type === "leaf") {
        const normalizedLabel = node.label.trim() || CLASSIFICATION_UNKNOWN_LABEL
        return normalizedLabel !== CLASSIFICATION_UNKNOWN_LABEL
    }

    const condition = pointItems[node.pointItemIndex]?.condition.trim()
    if (!condition) {
        return false
    }

    return hasRenderableClassificationReturn(node.trueNode, pointItems) || hasRenderableClassificationReturn(node.falseNode, pointItems)
}

/**
 * 将条件数组合并为 && 表达式。
 * @param conditions 条件数组
 * @returns 合并后的表达式；无条件时返回 null
 */
function buildCombinedConditionExpression(conditions: string[]): string | null {
    const validConditions = conditions.map(condition => condition.trim()).filter(condition => condition.length > 0)
    if (validConditions.length === 0) {
        return null
    }
    if (validConditions.length === 1) {
        return validConditions[0]
    }
    return validConditions.join(" && ")
}

/**
 * 去重并保留条件原始顺序。
 * @param conditions 条件数组
 * @returns 去重后的条件数组
 */
function dedupeConditions(conditions: string[]): string[] {
    const seen = new Set<string>()
    const dedupedConditions: string[] = []
    for (const condition of conditions) {
        const normalizedCondition = condition.trim()
        if (!normalizedCondition || seen.has(normalizedCondition)) {
            continue
        }
        seen.add(normalizedCondition)
        dedupedConditions.push(normalizedCondition)
    }
    return dedupedConditions
}

/**
 * 将分类树渲染为分支型 JavaScript 条件代码。
 * 对单分支链路合并为 && 条件；unknown 在函数底部统一兜底。
 * @param node 分类树节点
 * @param pointItems 点位条件数组
 * @param indentLevel 缩进层级
 * @param prefixConditions 前置条件数组
 * @returns 代码行数组
 */
function renderClassificationTreeBranches(
    node: ClassificationTreeNode,
    pointItems: ClassificationPointItem[],
    indentLevel: number,
    prefixConditions: string[] = [],
    activeConditions: string[] = [],
    forcedConditionsByLabel: Record<string, string[]> = {}
): string[] {
    const indent = "    ".repeat(indentLevel)

    if (node.type === "leaf") {
        const normalizedLabel = node.label.trim() || CLASSIFICATION_UNKNOWN_LABEL
        if (normalizedLabel === CLASSIFICATION_UNKNOWN_LABEL) {
            return []
        }
        const labelLiteral = JSON.stringify(normalizedLabel)
        const activeConditionSet = new Set(dedupeConditions(activeConditions))
        const leafConditions = dedupeConditions([...prefixConditions, ...(forcedConditionsByLabel[normalizedLabel] ?? [])]).filter(
            condition => !activeConditionSet.has(condition)
        )
        const mergedCondition = buildCombinedConditionExpression(leafConditions)
        const returnLine = node.ambiguous ? `return ${labelLiteral} // 存在重叠样本，回退为多数标签` : `return ${labelLiteral}`
        if (!mergedCondition) {
            return [`${indent}${returnLine}`]
        }
        return [`${indent}if (${mergedCondition}) {`, `${indent}    ${returnLine}`, `${indent}}`]
    }

    const condition = pointItems[node.pointItemIndex]?.condition.trim()
    if (!condition) {
        return []
    }

    const trueHasRenderableReturn = hasRenderableClassificationReturn(node.trueNode, pointItems)
    const falseHasRenderableReturn = hasRenderableClassificationReturn(node.falseNode, pointItems)
    if (!trueHasRenderableReturn && !falseHasRenderableReturn) {
        return []
    }
    if (trueHasRenderableReturn && !falseHasRenderableReturn) {
        return renderClassificationTreeBranches(
            node.trueNode,
            pointItems,
            indentLevel,
            [...prefixConditions, condition],
            activeConditions,
            forcedConditionsByLabel
        )
    }
    if (!trueHasRenderableReturn && falseHasRenderableReturn) {
        return renderClassificationTreeBranches(
            node.falseNode,
            pointItems,
            indentLevel,
            [...prefixConditions, `!(${condition})`],
            activeConditions,
            forcedConditionsByLabel
        )
    }

    const mergedPrefixConditions = dedupeConditions(prefixConditions)
    const mergedPrefixCondition = buildCombinedConditionExpression(mergedPrefixConditions)
    const nextActiveConditions = dedupeConditions([...activeConditions, ...mergedPrefixConditions])
    const innerIndentLevel = mergedPrefixCondition ? indentLevel + 1 : indentLevel
    const innerIndent = "    ".repeat(innerIndentLevel)
    const lines: string[] = []
    if (mergedPrefixCondition) {
        lines.push(`${indent}if (${mergedPrefixCondition}) {`)
    }

    lines.push(`${innerIndent}if (${condition}) {`)
    lines.push(
        ...renderClassificationTreeBranches(
            node.trueNode,
            pointItems,
            innerIndentLevel + 1,
            [],
            [...nextActiveConditions, condition],
            forcedConditionsByLabel
        )
    )
    lines.push(`${innerIndent}} else {`)
    lines.push(
        ...renderClassificationTreeBranches(
            node.falseNode,
            pointItems,
            innerIndentLevel + 1,
            [],
            [...nextActiveConditions, `!(${condition})`],
            forcedConditionsByLabel
        )
    )
    lines.push(`${innerIndent}}`)

    if (mergedPrefixCondition) {
        lines.push(`${indent}}`)
    }
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
    const uniqueLabels = Array.from(new Set(labels))
    const pointItemIndexByPointId = new Map(pointItems.map((pointItem, index) => [pointItem.pointId, index]))
    const unavailableForcedPointMap = new Map<string, number[]>()

    for (const label of uniqueLabels) {
        for (const row of pointColorRows.value) {
            if (!isPointCategoryForceCheckEnabled(row.point.id, label)) {
                continue
            }
            if (!pointItemIndexByPointId.has(row.point.id)) {
                const pointIndices = unavailableForcedPointMap.get(label) ?? []
                pointIndices.push(row.pointIndex)
                unavailableForcedPointMap.set(label, pointIndices)
            }
        }
    }

    if (unavailableForcedPointMap.size > 0) {
        const message = Array.from(unavailableForcedPointMap.entries())
            .map(([label, pointIndices]) => `${label}: #${pointIndices.join("、#")}`)
            .join("；")
        ui.showErrorMessage(`强制检查点当前不可用于分类，请检查颜色输入和点位范围：${message}`)
        return null
    }

    const imageIndices = loadedImages.value.map((_, index) => index)
    const pointItemIndices = pointItems.map((_, index) => index)
    const tree = buildClassificationTree(imageIndices, pointItemIndices, labels, pointItems)
    const missingForcedPointMap = new Map<string, number[]>()
    const forcedConditionsByLabel: Record<string, string[]> = {}
    for (const label of uniqueLabels) {
        const labelImageIndices = imageIndices.filter(imageIndex => labels[imageIndex] === label)
        for (const row of pointColorRows.value) {
            if (!isPointCategoryForceCheckEnabled(row.point.id, label)) {
                continue
            }
            const pointItemIndex = pointItemIndexByPointId.get(row.point.id)
            if (pointItemIndex === undefined) {
                continue
            }
            const pointItem = pointItems[pointItemIndex]
            const matchesAllLabelImages = labelImageIndices.every(imageIndex => pointItem.matches[imageIndex])
            const mismatchesAllLabelImages = labelImageIndices.every(imageIndex => !pointItem.matches[imageIndex])
            if (!matchesAllLabelImages && !mismatchesAllLabelImages) {
                const pointIndices = missingForcedPointMap.get(label) ?? []
                pointIndices.push(row.pointIndex)
                missingForcedPointMap.set(label, pointIndices)
                continue
            }
            const nextConditions = forcedConditionsByLabel[label] ?? []
            nextConditions.push(matchesAllLabelImages ? pointItem.condition : `!(${pointItem.condition})`)
            forcedConditionsByLabel[label] = nextConditions
        }
    }

    if (missingForcedPointMap.size > 0) {
        const message = Array.from(missingForcedPointMap.entries())
            .map(([label, pointIndices]) => `${label}: #${pointIndices.join("、#")}`)
            .join("；")
        ui.showErrorMessage(`强制检查点与对应分类样本冲突，请补充样本或关闭强制检查：${message}`)
        return null
    }

    const lines = [
        "function checkState(frame) {",
        ...renderClassificationTreeBranches(tree, pointItems, 1, [], [], forcedConditionsByLabel),
    ]
    lines.push(`    return ${JSON.stringify(CLASSIFICATION_UNKNOWN_LABEL)}`)
    lines.push("}")
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
 * 构建图色工具实时测试脚本内容。
 * @param checkStateCode 分类函数代码
 * @returns 实时测试脚本文本
 */
function buildRealtimeTestScript(checkStateCode: string): string {
    return `const cloud = ${realtimeTestCloudMode.value ? "true" : "false"}
const hwnd = cloud ? getCGWindow() : getWindowByProcessName("EM-Win64-Shipping.exe")
if (!hwnd) throw new Error("未找到窗口")
checkSize(hwnd)

${checkStateCode}

async function main() {
    let i = 0
    const timer = new Timer()
    while (true) {
        const frame = captureWindowWGC(hwnd)
        const state = checkState(frame)
        setStatus(${JSON.stringify(REALTIME_TEST_STATUS_RESULT)}, state)
        setStatus(${JSON.stringify(REALTIME_TEST_STATUS_IMAGE)}, frame)
        if (timer.elapsed() > 1000) {
            setStatus(${JSON.stringify(REALTIME_TEST_STATUS_FPS)}, i)
            i = 0
            timer.reset()
        }
        i++
        await sleep(30)
    }
}
main()
`
}

/**
 * 获取实时测试要使用的分类函数代码。
 * 无点位或无图片时回退为恒定返回 unknown，保证实时测试可启动。
 * @returns 分类函数代码
 */
function getRealtimeTestCheckStateCode(): string | null {
    if (loadedImages.value.length === 0 || points.value.length === 0) {
        return `function checkState(_frame) {
    return ${JSON.stringify(CLASSIFICATION_UNKNOWN_LABEL)}
}`
    }
    return generateClassificationCode()
}

/**
 * 获取图色工具实时测试脚本路径。
 * @returns 脚本路径
 */
async function ensureRealtimeTestScriptPath(): Promise<string> {
    if (realtimeTestScriptPath.value) {
        return realtimeTestScriptPath.value
    }
    const documentsDir = env.isApp ? await getDocumentsDir() : "C:\\Users\\Public\\Documents"
    const scriptPath = `${documentsDir}\\dob-scripts\\${REALTIME_TEST_SCRIPT_FILE_NAME}`
    realtimeTestScriptPath.value = scriptPath
    return scriptPath
}

/**
 * 启动图色工具实时测试。
 */
async function startRealtimeTest() {
    const checkStateCode = getRealtimeTestCheckStateCode()
    if (!checkStateCode) {
        return
    }

    try {
        await scriptRuntime.initRuntimeTracking()
        const scriptPath = await ensureRealtimeTestScriptPath()
        const scriptContent = buildRealtimeTestScript(checkStateCode)
        await writeTextFile(scriptPath, scriptContent)
        void runScript(scriptPath).catch(error => {
            console.error("图色工具实时测试脚本运行失败", error)
            ui.showErrorMessage(`实时测试运行失败: ${String(error)}`)
        })
    } catch (error) {
        console.error("启动图色工具实时测试失败", error)
        ui.showErrorMessage(`启动实时测试失败: ${String(error)}`)
    }
}

/**
 * 停止图色工具实时测试。
 */
async function stopRealtimeTest() {
    try {
        const scriptPath = await ensureRealtimeTestScriptPath()
        await stopScriptByPath(scriptPath)
        try {
            await deleteFile(scriptPath)
        } catch (deleteError) {
            console.error("删除图色工具实时测试临时脚本失败", deleteError)
        }
        realtimeTestScriptPath.value = ""
    } catch (error) {
        console.error("停止图色工具实时测试失败", error)
        ui.showErrorMessage(`停止实时测试失败: ${String(error)}`)
    }
}

/**
 * 切换图色工具实时测试状态。
 */
async function toggleRealtimeTest() {
    if (isRealtimeTesting.value) {
        await stopRealtimeTest()
        return
    }
    await startRealtimeTest()
}

/**
 * 将实时测试最新截图加入图片列表。
 */
async function addRealtimeTestScreenshot() {
    const imageUrl = realtimeTestImageUrl.value
    if (!imageUrl) {
        ui.showErrorMessage("当前没有可添加的实时截图")
        return
    }

    loading.value = true
    try {
        const baseIndex = loadedImages.value.length
        const snapshotName = `realtime-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`
        const item = await loadImageDataUrl(imageUrl, snapshotName, baseIndex)
        loadedImages.value = [...loadedImages.value, item]
        appendImageLabels([item])
        if (baseIndex === 0) {
            activeImageIndex.value = 0
        }
        schedulePersistScriptColorToolState()
        ui.showSuccessMessage("已添加实时截图到图片列表")
    } catch (error) {
        console.error("添加实时截图失败", error)
        ui.showErrorMessage(`添加实时截图失败: ${String(error)}`)
    } finally {
        loading.value = false
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
        const toleranceInput = pointToleranceInputs.value[point.id] ?? String(tolerance)

        return {
            point,
            pointIndex: pointIndex + 1,
            referenceColor,
            tolerance,
            toleranceInput,
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
    loadedImages.value.map((image, imageIndex) => {
        const label = getImageLabelByIndex(imageIndex)
        return {
            image,
            imageIndex,
            label,
            colors: pointColorRows.value.map(pointRow => {
                const entry = pointRow.colors[imageIndex]
                return {
                    point: pointRow.point,
                    pointIndex: pointRow.pointIndex,
                    forceCheck: isPointCategoryForceCheckEnabled(pointRow.point.id, label),
                    color: entry?.color ?? null,
                    match: entry?.match ?? false,
                }
            }),
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

onMounted(async () => {
    if (env.isApp) {
        await scriptRuntime.initRuntimeTracking()
        await ensureRealtimeTestScriptPath()
    }
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
            <button class="btn btn-sm btn-ghost" @click="openProjectImportPicker">导入工程</button>
            <button class="btn btn-sm btn-ghost" @click="exportProject">导出工程</button>
            <button
                class="btn btn-sm btn-ghost"
                @click="addRealtimeTestScreenshot"
                :disabled="!env.isApp || !realtimeTestImageUrl || loading"
            >
                截图
            </button>
            <button
                class="btn btn-sm"
                :class="isRealtimeTesting ? 'btn-warning' : 'btn-success'"
                @click="toggleRealtimeTest"
                :disabled="!env.isApp"
            >
                {{ isRealtimeTesting ? "停止实时测试" : "启动实时测试" }}
            </button>
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
            <label v-if="env.isApp" class="flex items-center gap-2 text-xs text-base-content/70">
                <span>云游戏</span>
                <input
                    v-model="realtimeTestCloudMode"
                    type="checkbox"
                    class="toggle toggle-xs toggle-primary"
                    @change="schedulePersistScriptColorToolState()"
                />
            </label>
            <input ref="fileInputRef" type="file" multiple accept="image/*" class="hidden" @change="handleFileSelection" />
            <input
                ref="projectFileInputRef"
                type="file"
                accept=".json,application/json"
                class="hidden"
                @change="handleProjectImportSelection"
            />
            <div v-if="env.isApp" class="flex items-center gap-3 text-xs text-base-content/70">
                <span>实时结果 {{ realtimeTestResultText || "-" }}</span>
                <span>FPS {{ realtimeTestFpsText || "-" }}</span>
            </div>
            <div class="text-xs text-base-content/70">
                请先加载多张图片，然后在当前图上点击添加坐标点（坐标可点击复制 cc，桌面端支持拖拽导入）
            </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0 flex-1">
            <div class="card bg-base-100 border border-base-300 min-h-0">
                <div class="card-body min-h-0 p-3 gap-3">
                    <div class="text-sm font-medium flex items-center">
                        <div>当前图（点击打点）</div>

                        <div v-if="loadedImages.length > 0" class="flex items-center gap-1">
                            <button
                                class="btn btn-xs btn-ghost btn-square"
                                @click="setActiveImageIndex(activeImageIndex - 1)"
                                :disabled="activeImageIndex <= 0"
                            >
                                &lt;
                            </button>
                            <select
                                class="select select-xs select-bordered w-64"
                                :value="activeImageIndex"
                                @change="handleActiveImageChange"
                            >
                                <option v-for="(image, index) in loadedImages" :key="image.id" :value="index">
                                    {{ index + 1 }}. {{ image.name }}
                                </option>
                            </select>
                            <button
                                class="btn btn-xs btn-ghost btn-square"
                                @click="setActiveImageIndex(activeImageIndex + 1)"
                                :disabled="activeImageIndex >= loadedImages.length - 1"
                            >
                                &gt;
                            </button>
                            <span class="text-xs text-base-content/70">当前图 {{ activeImageIndex + 1 }}/{{ loadedImages.length }}</span>
                        </div>
                    </div>
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
                                @click="handleReferenceImageClick"
                                @contextmenu="handleReferenceImageContextMenu"
                            />
                            <div
                                v-for="(point, index) in points"
                                :key="point.id"
                                class="absolute pointer-events-none"
                                :style="getPointAnchorStyle(point)"
                            >
                                <div
                                    class="absolute left-0 top-0 w-2 h-2 rounded-full border border-white shadow -translate-x-1/2 -translate-y-1/2"
                                    :class="getPointAnchorColorClass(point)"
                                ></div>
                                <div class="absolute left-0 top-0 opacity-50" :style="getPointBubbleContainerStyle(point)">
                                    <div
                                        class="relative rounded-md bg-base-100 border border-base-300 shadow px-2 py-1 text-[10px] leading-tight whitespace-nowrap"
                                    >
                                        <div class="font-semibold" :class="getPointLabelColorClass(point)">#{{ index + 1 }}</div>
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
                                                    class="input input-xs input-bordered w-15 text-center"
                                                    :value="row.toleranceInput"
                                                    min="0"
                                                    max="255"
                                                    step="1"
                                                    @input="handlePointToleranceInput(row.point.id, $event)"
                                                    @blur="commitPointToleranceInput(row.point.id)"
                                                    @keydown.enter.prevent="commitPointToleranceInput(row.point.id)"
                                                    @keydown.esc.prevent="revertPointToleranceInput(row.point.id)"
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
                                                    <div class="flex items-center gap-2">
                                                        <label class="flex items-center gap-1 text-base-content/70">
                                                            <input
                                                                :checked="entry.forceCheck"
                                                                type="checkbox"
                                                                class="toggle toggle-xs toggle-primary"
                                                                @change="
                                                                    setPointCategoryForceCheck(
                                                                        entry.point.id,
                                                                        imageRow.label,
                                                                        ($event.target as HTMLInputElement).checked
                                                                    )
                                                                "
                                                            />
                                                        </label>
                                                        <input
                                                            :checked="isCellUsingPointCheckColor(entry.point.id, entry.color)"
                                                            type="checkbox"
                                                            class="checkbox checkbox-xs checkbox-info"
                                                            @change="
                                                                togglePointCheckColor(
                                                                    entry.point.id,
                                                                    entry.color,
                                                                    ($event.target as HTMLInputElement).checked
                                                                )
                                                            "
                                                        />
                                                    </div>
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
