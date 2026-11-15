<script setup lang="ts">
import { useVueFlow } from "@vue-flow/core"
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { embedImageFile, findImageFile, fitImageBox, formatByteSize, readImageFileSize } from "@/utils/imageEmbed"
import { decodeImageBytes, detectImageFormat, imageMimeForFormat } from "@/utils/imagePack"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const { nodesDraggable, viewport } = useVueFlow()

const MIN_BOX_WIDTH = 120
const MIN_BOX_HEIGHT = 80
const MAX_BOX_EDGE = 2400

const fileInput = ref<HTMLInputElement | null>(null)
const urlInput = ref<HTMLInputElement | null>(null)
const error = ref("")
const hovered = ref(false)
const dragOver = ref(false)
const previewOpen = ref(false)
const imageFailed = ref(false)
/** PNG 转 WebP 期间禁用重复上传，避免并发大图编码 */
const compressing = ref(false)

/** 当前模式：默认内嵌，URL 作为备选 */
const mode = computed<"url" | "embed">(() => (props.data.imageMode === "url" ? "url" : "embed"))

/** 沉浸查看：只保留图片本体，隐藏模式切换、上传与尺寸控件 */
const focusMode = computed(() => props.data.focusMode === true)

const urlDraft = ref(typeof props.data.imageUrl === "string" ? props.data.imageUrl : "")

watch(
    () => props.data.imageUrl,
    value => {
        const next = typeof value === "string" ? value : ""
        if (next !== urlDraft.value && document.activeElement !== urlInput.value) urlDraft.value = next
    }
)

/** 内嵌图片解码结果：Blob URL 由组件持有，数据变化或卸载时回收 */
const embedUrl = ref("")
const embedError = ref("")
const encodedBytes = ref(0)
let objectUrl: string | null = null

function revokeEmbedUrl() {
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = null
    }
    embedUrl.value = ""
}

function readEncodedSize(payload: string): number {
    return new TextEncoder().encode(payload).length
}

function rebuildEmbedUrl() {
    revokeEmbedUrl()
    embedError.value = ""
    const payload = typeof props.data.imageData === "string" ? props.data.imageData : ""
    encodedBytes.value = payload ? readEncodedSize(payload) : 0
    if (!payload) return

    // 兼容手工传入的 data URL：直接交给 <img>，不参与 JPack 解码
    if (payload.startsWith("data:")) {
        embedUrl.value = payload
        return
    }

    try {
        const bytes = decodeImageBytes(payload)
        const mime =
            imageMimeForFormat(detectImageFormat(bytes)) ||
            (typeof props.data.imageMime === "string" ? props.data.imageMime : "application/octet-stream")
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }))
        embedUrl.value = objectUrl
    } catch (cause) {
        embedError.value = cause instanceof Error ? cause.message : "内嵌图片解码失败"
    }
}

watch(() => props.data.imageData, rebuildEmbedUrl, { immediate: true })

const displayUrl = computed(() => {
    if (mode.value === "url") return typeof props.data.imageUrl === "string" ? props.data.imageUrl.trim() : ""
    return embedUrl.value
})

const hasImage = computed(() => displayUrl.value.length > 0 && !imageFailed.value)

watch(displayUrl, () => {
    imageFailed.value = false
    if (!displayUrl.value) previewOpen.value = false
})

const boxWidth = computed(() => clampSize(props.data.imageWidth, MIN_BOX_WIDTH, 320))
const boxHeight = computed(() => clampSize(props.data.imageHeight, MIN_BOX_HEIGHT, 200))

function clampSize(value: unknown, min: number, fallback: number, max = MAX_BOX_EDGE): number {
    const size = Number(value)
    return Number.isFinite(size) && size > 0 ? Math.min(max, Math.max(min, Math.round(size))) : fallback
}

const sizeLabel = computed(() => {
    if (compressing.value) return "压缩中…"
    if (mode.value === "url") return displayUrl.value ? "URL 引用" : "未设置图片"
    if (!props.data.imageData) return "未内嵌图片"
    const size = formatByteSize(encodedBytes.value)
    return props.data.imageMime === "image/webp" ? `WebP · ${size}` : size
})

function setMode(next: "url" | "embed") {
    if (mode.value === next) return
    error.value = ""
    store.updateNodeData(props.id, { imageMode: next })
    if (next === "url") nextTick(() => urlInput.value?.focus())
}

function commitUrl() {
    const value = urlDraft.value.trim()
    if (value === (typeof props.data.imageUrl === "string" ? props.data.imageUrl : "")) return
    error.value = ""
    store.updateNodeData(props.id, { imageUrl: value })
}

function pickFile() {
    error.value = ""
    fileInput.value?.click()
}

function focusUrlInput() {
    urlInput.value?.focus()
}

/** 空状态点击：加载失败时重试；沉浸查看时先退出以露出控件；否则按模式选文件 / 聚焦输入框 */
function handleEmptyClick() {
    if (displayUrl.value && imageFailed.value) {
        imageFailed.value = false
        return
    }
    if (focusMode.value) {
        store.updateNodeData(props.id, { focusMode: false })
        nextTick(() => {
            if (mode.value === "url") focusUrlInput()
        })
        return
    }
    if (mode.value === "embed") pickFile()
    else focusUrlInput()
}

function clearImage() {
    error.value = ""
    imageFailed.value = false
    if (mode.value === "url") {
        urlDraft.value = ""
        store.updateNodeData(props.id, { imageUrl: "" })
        return
    }
    revokeEmbedUrl()
    encodedBytes.value = 0
    store.updateNodeData(props.id, {
        imageData: undefined,
        imageName: undefined,
        imageMime: undefined,
    })
}

async function embedFile(file: File) {
    if (compressing.value) return
    error.value = ""
    compressing.value = true
    try {
        const [payload, size] = await Promise.all([embedImageFile(file), readImageFileSize(file)])
        // 显示框长边沿用当前尺寸，宽高比改为图片本身的比例，避免固定框里留空白边
        const box = size ? fitImageBox(size.width, size.height, Math.max(boxWidth.value, boxHeight.value)) : null
        store.updateNodeData(props.id, {
            imageMode: "embed",
            imageData: payload.imageData,
            imageMime: payload.imageMime,
            imageName: payload.imageName,
            ...(box ? { imageWidth: box.width, imageHeight: box.height } : {}),
        })
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : "读取图片失败"
    } finally {
        compressing.value = false
    }
}

function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) void embedFile(file)
    input.value = ""
}

function handleDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return
    event.preventDefault()
    event.stopPropagation()
    dragOver.value = true
}

function handleDragLeave(event: DragEvent) {
    const related = event.relatedTarget as Node | null
    if (related && (event.currentTarget as HTMLElement).contains(related)) return
    dragOver.value = false
}

function handleDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    dragOver.value = false
    const file = event.dataTransfer?.files?.[0]
    if (file) void embedFile(file)
}

function handlePaste(event: ClipboardEvent) {
    if (!hovered.value && !props.selected) return
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
    const files = Array.from(event.clipboardData?.files ?? [])
    if (files.length === 0) return
    event.preventDefault()
    event.stopImmediatePropagation()
    void embedClipboardFile(files)
}

/** 剪贴板图片按魔数挑选：浏览器可能把 PNG 标成 image/jpeg */
async function embedClipboardFile(files: File[]) {
    const file = await findImageFile(files)
    if (file) await embedFile(file)
}

/** 右下角拖拽调整显示区域，节点内的图片按 zoom 换算，避免画布缩放后手感漂移 */
let resizeStart: { x: number; y: number; width: number; height: number; changed: boolean } | null = null
/** 缩放前节点的可拖动状态：缩放期间关闭，结束后恢复 */
let draggableBeforeResize: boolean | null = null
/** 缩放期间钉住的节点位置：某些环境下指针手势会同时触发节点拖动 */
let pinnedPosition: { x: number; y: number } | null = null

// 缩放期间只要节点位置被外部改动就立即钉回，避免图片变大时节点跟着跑
watch(
    () => store.nodes.find(node => node.id === props.id)?.position,
    position => {
        if (!resizeStart || !pinnedPosition || !position) return
        if (position.x === pinnedPosition.x && position.y === pinnedPosition.y) return
        const node = store.nodes.find(item => item.id === props.id)
        if (node) node.position = { ...pinnedPosition }
    },
    { deep: true, flush: "sync" }
)

/** 缩放期间吞掉节点拖动起手事件：VueFlow 的拖动监听在 mousedown / touchstart 上 */
function blockNodeDrag(event: Event) {
    event.preventDefault()
    event.stopImmediatePropagation()
}

function addResizeBlockers() {
    window.addEventListener("pointerdown", blockNodeDrag, true)
    window.addEventListener("mousedown", blockNodeDrag, true)
    window.addEventListener("touchstart", blockNodeDrag, { capture: true, passive: false })
    window.addEventListener("dragstart", blockNodeDrag, true)
}

function removeResizeBlockers() {
    window.removeEventListener("pointerdown", blockNodeDrag, true)
    window.removeEventListener("mousedown", blockNodeDrag, true)
    window.removeEventListener("touchstart", blockNodeDrag, true)
    window.removeEventListener("dragstart", blockNodeDrag, true)
}

function removeResizeListeners() {
    window.removeEventListener("pointermove", handleResizeMove)
    window.removeEventListener("pointerup", endResize)
    window.removeEventListener("pointercancel", endResize)
    removeResizeBlockers()
}

function startResize(event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const node = store.nodes.find(item => item.id === props.id)
    pinnedPosition = node ? { ...node.position } : null
    resizeStart = { x: event.clientX, y: event.clientY, width: boxWidth.value, height: boxHeight.value, changed: false }
    draggableBeforeResize = nodesDraggable.value
    nodesDraggable.value = false
    addResizeBlockers()
    window.addEventListener("pointermove", handleResizeMove)
    window.addEventListener("pointerup", endResize)
    window.addEventListener("pointercancel", endResize)
}

function handleResizeMove(event: PointerEvent) {
    if (!resizeStart) return
    const zoom = viewport.value.zoom || 1
    const width = clampSize(resizeStart.width + (event.clientX - resizeStart.x) / zoom, MIN_BOX_WIDTH, boxWidth.value)
    const height = clampSize(resizeStart.height + (event.clientY - resizeStart.y) / zoom, MIN_BOX_HEIGHT, boxHeight.value)
    if (width === boxWidth.value && height === boxHeight.value) return
    resizeStart.changed = true
    props.data.imageWidth = width
    props.data.imageHeight = height
}

function endResize() {
    removeResizeListeners()
    if (draggableBeforeResize !== null) {
        nodesDraggable.value = draggableBeforeResize
        draggableBeforeResize = null
    }
    // 松手时再钉一次：拖动结束事件可能晚于最后一次 pointermove
    if (pinnedPosition) {
        const node = store.nodes.find(item => item.id === props.id)
        if (node) node.position = { ...pinnedPosition }
        pinnedPosition = null
    }
    if (resizeStart?.changed) store.commitHistory("调整图片尺寸")
    resizeStart = null
}

function openPreview() {
    if (hasImage.value) previewOpen.value = true
}

function closePreview() {
    previewOpen.value = false
}

function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && previewOpen.value) {
        event.preventDefault()
        event.stopImmediatePropagation()
        closePreview()
    }
}

window.addEventListener("keydown", handleKeyDown, true)
window.addEventListener("paste", handlePaste)

onBeforeUnmount(() => {
    revokeEmbedUrl()
    window.removeEventListener("keydown", handleKeyDown, true)
    window.removeEventListener("paste", handlePaste)
    removeResizeListeners()
    if (draggableBeforeResize !== null) {
        nodesDraggable.value = draggableBeforeResize
        draggableBeforeResize = null
    }
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }" :focusable="true">
        <div
            class="min-w-0"
            :style="{ width: `${boxWidth}px` }"
            @pointerenter="hovered = true"
            @pointerleave="hovered = false"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
        >
            <!-- 模式切换与操作：沉浸查看时全部收起 -->
            <template v-if="!focusMode">
                <div class="mb-1 flex items-center gap-1 text-[10px]">
                    <div class="flex overflow-hidden rounded-xs border border-base-content/15">
                        <button
                            type="button"
                            class="nodrag cursor-pointer px-1.5 py-0.5 transition-colors duration-150"
                            :class="mode === 'embed' ? 'bg-primary/15 text-primary' : 'text-base-content/55 hover:text-base-content'"
                            @click.stop="setMode('embed')"
                        >
                            内嵌
                        </button>
                        <button
                            type="button"
                            class="nodrag cursor-pointer border-l border-base-content/15 px-1.5 py-0.5 transition-colors duration-150"
                            :class="mode === 'url' ? 'bg-primary/15 text-primary' : 'text-base-content/55 hover:text-base-content'"
                            @click.stop="setMode('url')"
                        >
                            URL
                        </button>
                    </div>
                    <span class="min-w-0 flex-1 truncate text-base-content/40" :title="sizeLabel">{{ sizeLabel }}</span>
                    <button
                        v-if="displayUrl"
                        type="button"
                        class="nodrag cursor-pointer text-base-content/45 transition-colors duration-150 hover:text-primary"
                        title="清除当前图片"
                        @click.stop="clearImage"
                    >
                        <Icon icon="ri:delete-bin-line" class="size-3" />
                    </button>
                </div>

                <!-- URL 输入 -->
                <div v-if="mode === 'url'" class="mb-1 flex items-center gap-1">
                    <input
                        ref="urlInput"
                        v-model="urlDraft"
                        type="text"
                        class="nodrag nopan min-w-0 flex-1 rounded-none border border-base-content/15 bg-base-100/60 px-1.5 py-1 text-[11px] outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary/60"
                        placeholder="https://example.com/image.png"
                        @keydown.enter.prevent="commitUrl"
                        @blur="commitUrl"
                        @pointerdown.stop
                        @mousedown.stop
                    />
                    <button
                        type="button"
                        class="nodrag shrink-0 cursor-pointer border border-base-content/15 px-1.5 py-1 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                        @click.stop="commitUrl"
                    >
                        应用
                    </button>
                </div>

                <!-- 内嵌操作 -->
                <div v-else class="mb-1 flex items-center gap-1">
                    <button
                        type="button"
                        class="nodrag flex shrink-0 cursor-pointer items-center gap-1 border border-base-content/15 px-1.5 py-1 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary disabled:cursor-progress disabled:opacity-50"
                        :disabled="compressing"
                        @click.stop="pickFile"
                    >
                        <Icon :icon="compressing ? 'ri:refresh-line' : 'ri:upload-2-line'" class="size-3" :class="compressing ? 'animate-spin' : ''" />
                        {{ compressing ? "压缩中" : data.imageData ? "替换" : "选择图片" }}
                    </button>
                    <span v-if="data.imageName" class="min-w-0 flex-1 truncate text-right text-[10px] text-base-content/35" :title="data.imageName">
                        {{ data.imageName }}
                    </span>
                </div>
            </template>

            <!-- 图片显示区 -->
            <div
                class="relative flex items-center justify-center overflow-hidden rounded-xs border border-base-content/15 bg-base-content/5"
                :class="dragOver ? 'border-primary/70 ring-2 ring-primary/25' : ''"
                :style="{ width: `${boxWidth}px`, height: `${boxHeight}px` }"
            >
                <img
                    v-if="hasImage"
                    :src="displayUrl"
                    class="size-full select-none object-contain"
                    draggable="false"
                    alt=""
                    @load="imageFailed = false"
                    @error="imageFailed = true"
                    @dblclick.stop="openPreview"
                />
                <button
                    v-else
                    type="button"
                    class="nodrag flex size-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] text-base-content/35 transition-colors duration-150 hover:text-primary"
                    @click.stop="handleEmptyClick"
                >
                    <Icon :icon="displayUrl && imageFailed ? 'ri:error-warning-line' : mode === 'embed' ? 'ri:image-add-line' : 'ri:image-line'" class="size-6" />
                    <span v-if="displayUrl && imageFailed" class="text-error/80">图片加载失败，点击重试</span>
                    <span v-else>{{ mode === "embed" ? "点击选择 / 拖入 / 粘贴图片" : "填写图片 URL 或拖入图片" }}</span>
                </button>

                <!-- 缩放手柄 -->
                <div
                    class="nodrag nopan absolute bottom-0 right-0 z-10 size-3.5 cursor-se-resize text-base-content/30 transition-colors duration-150 hover:text-primary"
                    title="拖动调整图片显示区域"
                    @pointerdown="startResize"
                    @mousedown.stop
                >
                    <svg viewBox="0 0 16 16" class="size-full">
                        <path d="M15 15H9L15 9V15ZM15 11H13L15 9V11Z" fill="currentColor" />
                    </svg>
                </div>
            </div>

            <div v-if="!focusMode && (error || embedError)" class="mt-1 max-w-80 text-[10px] leading-snug text-error">
                {{ error || embedError }}
            </div>

            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />
        </div>

        <!-- 大图预览：渲染到 body，避免被节点裁剪 -->
        <Teleport to="body">
            <div
                v-if="previewOpen"
                class="fixed inset-0 z-200 flex items-center justify-center bg-black/75 p-6"
                @pointerdown.stop
                @click.self="closePreview"
            >
                <img :src="displayUrl" class="max-h-full max-w-full select-none object-contain shadow-2xl" alt="" />
                <button
                    type="button"
                    class="absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 transition-colors duration-150 hover:bg-white/20 hover:text-white"
                    title="关闭 (Esc)"
                    @click.stop="closePreview"
                >
                    <Icon icon="ri:close-line" class="size-4" />
                </button>
            </div>
        </Teleport>
    </BaseNode>
</template>
