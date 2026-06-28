<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useAttrs } from "vue"

defineOptions({
    inheritAttrs: false,
})

const props = defineProps<{
    thumbUrl: string
    fullUrl: string
    manual?: boolean
}>()

type FrameRect = {
    left: number
    top: number
}

const attrs = useAttrs()
const overlayVisible = ref(false)
const zoomScale = ref(1)
const baseScale = ref(1)
const displayUrl = ref("")
const loadedFullImage = ref(false)
const loadingVisible = ref(false)
const frameRect = ref<FrameRect | null>(null)
const imageNaturalSize = ref({ width: 0, height: 0 })
const bodyOverflow = ref("")
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const controlMargin = 60
const panOffset = ref({ x: 0, y: 0 })
let requestId = 0
let loader: HTMLImageElement | null = null
let enterFrameId = 0
let settleFrameId = 0

/**
 * 将数值限制在指定范围内。
 * @param value 待限制的数值
 * @param min 最小值
 * @param max 最大值
 * @returns 限制后的数值
 */
function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

/**
 * 计算大图在视口中的目标矩形。
 * 这里先固定一个居中展示区域，再按图片自然尺寸和视口计算基础展示尺寸。
 * @returns 目标矩形
 */
function getTargetRect() {
    if (imageNaturalSize.value.width && imageNaturalSize.value.height) {
        const padding = 32
        const maxWidth = window.innerWidth - padding * 2
        const scale = Math.min(maxWidth / imageNaturalSize.value.width, 1)
        return {
            left: Math.round((window.innerWidth - imageNaturalSize.value.width * scale) / 2),
            top: Math.round((window.innerHeight - imageNaturalSize.value.height * scale) / 2),
        }
    }

    const padding = 32
    const maxWidth = Math.min(window.innerWidth - padding * 2, 1200)
    const maxHeight = Math.min(window.innerHeight - padding * 2, 900)
    const width = Math.max(320, maxWidth)
    const height = Math.max(240, maxHeight)
    return {
        left: Math.round((window.innerWidth - width) / 2),
        top: Math.round((window.innerHeight - height) / 2),
    }
}

/**
 * 锁定或恢复页面滚动，避免大图弹层打开时底层页面跟随滚动。
 * @param locked 是否锁定滚动
 */
function syncBodyScroll(locked: boolean) {
    if (locked) {
        bodyOverflow.value = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return
    }
    document.body.style.overflow = bodyOverflow.value
}

/**
 * 根据当前矩形和鼠标位置，更新大图位置。
 * @param clientX 鼠标横坐标
 * @param clientY 鼠标纵坐标
 */
function updateFramePosition(clientX: number, clientY: number) {
    if (!frameRect.value) return

    const totalScale = baseScale.value * zoomScale.value
    const scaledWidth = imageNaturalSize.value.width * totalScale
    const scaledHeight = imageNaturalSize.value.height * totalScale
    const minPanX = scaledWidth > window.innerWidth ? window.innerWidth - frameRect.value.left - scaledWidth : 0
    const maxPanX = scaledWidth > window.innerWidth ? -frameRect.value.left : 0
    const minPanY = scaledHeight > window.innerHeight ? window.innerHeight - frameRect.value.top - scaledHeight : 0
    const maxPanY = scaledHeight > window.innerHeight ? -frameRect.value.top : 0

    panOffset.value = {
        x: clamp(Math.round(clientX - dragOffset.value.x - frameRect.value.left), minPanX, maxPanX),
        y: clamp(Math.round(clientY - dragOffset.value.y - frameRect.value.top), minPanY, maxPanY),
    }
}

/**
 * 关闭当前大图预览，并清理异步加载状态。
 */
function closePreview() {
    overlayVisible.value = false
    frameRect.value = null
    zoomScale.value = 1
    imageNaturalSize.value = { width: 0, height: 0 }
    panOffset.value = { x: 0, y: 0 }
    loadedFullImage.value = false
    loadingVisible.value = false
    displayUrl.value = ""
    isDragging.value = false
    syncBodyScroll(false)
    window.removeEventListener("keydown", handleKeydown)
    window.removeEventListener("pointermove", handleDragMove)
    window.removeEventListener("pointerup", handleDragUp)
    window.cancelAnimationFrame(enterFrameId)
    window.cancelAnimationFrame(settleFrameId)
    requestId += 1
    loader = null
}

/**
 * @description 按指定缩略图和原图打开预览，供外部点击场景复用。
 * @param thumbUrl 缩略图地址。
 * @param fullUrl 原图地址。
 * @param left 起始左边距。
 * @param top 起始上边距。
 * @param width 起始宽度。
 * @param height 起始高度。
 * @param borderRadius 起始圆角。
 */
function openFromUrls(thumbUrl: string, fullUrl: string) {
    if (overlayVisible.value) return

    requestId += 1
    const token = requestId
    loadingVisible.value = true
    loadedFullImage.value = false
    displayUrl.value = thumbUrl
    zoomScale.value = 1
    baseScale.value = 1
    imageNaturalSize.value = { width: 0, height: 0 }
    panOffset.value = { x: 0, y: 0 }
    preloadFullImage(token, fullUrl)
}

/**
 * 按下 Esc 时关闭预览。
 * @param event 键盘事件
 */
function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        closePreview()
    }
}

/**
 * 开始预加载完整大图，加载完成后再切换到高清资源。
 * @param token 本次打开预览的请求编号
 */
function preloadFullImage(token: number, fullUrl: string) {
    loader = new Image()
    loader.decoding = "async"
    loader.onload = () => {
        if (token !== requestId) return
        loadingVisible.value = false
        imageNaturalSize.value = {
            width: loader?.naturalWidth || 0,
            height: loader?.naturalHeight || 0,
        }
        baseScale.value = Math.min((window.innerWidth - 64) / Math.max(1, imageNaturalSize.value.width), 1)
        loadedFullImage.value = true
        displayUrl.value = fullUrl
        overlayVisible.value = true
        if (frameRect.value) {
            frameRect.value = getTargetRect()
        }
        syncBodyScroll(true)
        window.addEventListener("keydown", handleKeydown)
        void nextTick().then(() => {
            enterFrameId = window.requestAnimationFrame(() => {
                settleFrameId = window.requestAnimationFrame(() => {
                    if (token !== requestId) return
                    frameRect.value = getTargetRect()
                })
            })
        })
    }
    loader.onerror = () => {
        if (token !== requestId) return
        loadingVisible.value = false
        loadedFullImage.value = true
    }
    loader.src = fullUrl
}

/**
 * 拖动图片时更新位置。
 * @param event 指针事件
 */
function handleDragMove(event: PointerEvent) {
    if (!isDragging.value || (event.pointerType === "mouse" && event.buttons === 0)) return
    event.preventDefault()
    updateFramePosition(event.clientX, event.clientY)
}

/**
 * 结束拖动。
 */
function handleDragUp() {
    isDragging.value = false
    window.removeEventListener("pointermove", handleDragMove)
    window.removeEventListener("pointerup", handleDragUp)
}

/**
 * 打开大图预览，并记录缩略图的真实坐标。
 * @param event 点击事件
 */
async function openPreview(event: MouseEvent) {
    const target = event.currentTarget as HTMLButtonElement | null
    if (!target) return

    event.preventDefault()
    event.stopPropagation()

    openFromUrls(props.thumbUrl, props.fullUrl)
}

/**
 * 在大图上按下鼠标后开始拖动。
 * @param event 指针事件
 */
function startDrag(event: PointerEvent) {
    if (!overlayVisible.value || !loadedFullImage.value || !frameRect.value) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    isDragging.value = true
    const visualLeft = frameRect.value.left + panOffset.value.x
    const visualTop = frameRect.value.top + panOffset.value.y
    dragOffset.value = {
        x: event.clientX - visualLeft,
        y: event.clientY - visualTop,
    }
    window.addEventListener("pointermove", handleDragMove, { passive: false })
    window.addEventListener("pointerup", handleDragUp, { once: true })
}

/**
 * 滚轮缩放大图，属于基础缩放能力。
 * @param event 滚轮事件
 */
function handleWheel(event: WheelEvent) {
    if (!overlayVisible.value || !loadedFullImage.value) return
    event.preventDefault()
    if (!frameRect.value) return
    const delta = event.deltaY > 0 ? -0.12 : 0.12
    const nextScale = clamp(Number((zoomScale.value + delta).toFixed(2)), 0.5, 4)
    const mouseX = event.clientX - frameRect.value.left
    const mouseY = event.clientY - frameRect.value.top
    const currentTotalScale = baseScale.value * zoomScale.value
    const contentX = (mouseX - panOffset.value.x) / currentTotalScale
    const contentY = (mouseY - panOffset.value.y) / currentTotalScale
    zoomScale.value = nextScale
    const nextTotalScale = baseScale.value * nextScale
    panOffset.value = {
        x: mouseX - contentX * nextTotalScale,
        y: mouseY - contentY * nextTotalScale,
    }
}

/**
 * 键盘和按钮都可以触发缩放，便于通用使用。
 */
function zoomIn() {
    zoomScale.value = clamp(Number((zoomScale.value + 0.15).toFixed(2)), 0.5, 4)
}

/**
 * 键盘和按钮都可以触发缩放，便于通用使用。
 */
function zoomOut() {
    zoomScale.value = clamp(Number((zoomScale.value - 0.15).toFixed(2)), 0.5, 4)
}

/**
 * 将大图缩放重置到初始状态。
 */
function resetZoom() {
    zoomScale.value = 1
    panOffset.value = { x: 0, y: 0 }
}

onBeforeUnmount(() => {
    closePreview()
})

defineExpose({
    openFromUrls,
})
</script>

<template>
    <button
        v-if="!manual"
        type="button"
        v-bind="attrs"
        class="relative inline-flex cursor-zoom-in overflow-hidden p-0 border-0 bg-transparent"
        @click="openPreview"
    >
        <img :src="thumbUrl" alt="" class="block h-full w-full object-cover" draggable="false" />
        <div v-if="loadingVisible" class="absolute inset-0 flex items-center justify-center backdrop-blur-[1px]">
            <span class="loading loading-spinner loading-md text-white"></span>
        </div>
    </button>

    <Teleport to="body">
        <transition name="image-preview-fade">
            <div v-if="overlayVisible" class="fixed inset-0 z-9999">
                <div class="absolute inset-0 bg-black/80" @click="closePreview" />

                <img
                    v-if="frameRect"
                    :src="displayUrl"
                    alt=""
                    class="fixed select-none max-w-none max-h-none shadow-2xl rounded"
                    draggable="false"
                    @click.stop
                    @wheel.prevent="handleWheel"
                    @pointerdown="startDrag"
                    :style="{
                        left: `${frameRect.left}px`,
                        top: `${frameRect.top}px`,
                        width: `${Math.max(1, imageNaturalSize.width * baseScale * zoomScale)}px`,
                        height: `${Math.max(1, imageNaturalSize.height * baseScale * zoomScale)}px`,
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
                        cursor: isDragging ? 'grabbing' : loadedFullImage ? 'grab' : 'default',
                        transitionProperty: isDragging ? 'transform' : 'left, top, width, height, border-radius, transform, opacity',
                        transitionDuration: '360ms',
                        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        willChange: 'left, top, width, height, transform',
                    }"
                />

                <button
                    type="button"
                    class="fixed z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white shadow-2xl backdrop-blur-md transition hover:bg-white/12"
                    :style="{ left: `${controlMargin}px`, top: `${controlMargin}px` }"
                    @click="closePreview"
                    aria-label="关闭预览"
                >
                    <Icon icon="ri:close-line" class="text-lg" />
                </button>

                <div
                    v-if="frameRect"
                    class="fixed z-30 flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-2 text-white shadow-2xl backdrop-blur-md"
                    :style="{
                        left: `${controlMargin}px`,
                        bottom: `${controlMargin}px`,
                    }"
                >
                    <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/12"
                        @click="zoomOut"
                        aria-label="缩小"
                    >
                        <Icon icon="ri:zoom-out-line" class="text-lg" />
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/12"
                        @click="resetZoom"
                        aria-label="重置缩放"
                    >
                        <Icon icon="ri:focus-3-line" class="text-lg" />
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/12"
                        @click="zoomIn"
                        aria-label="放大"
                    >
                        <Icon icon="ri:zoom-in-line" class="text-lg" />
                    </button>
                </div>
            </div>
        </transition>
    </Teleport>
</template>

<style scoped>
.image-preview-fade-enter-active,
.image-preview-fade-leave-active {
    transition: opacity 180ms ease;
}

.image-preview-fade-enter-from,
.image-preview-fade-leave-to {
    opacity: 0;
}

.image-preview-fade-enter-to,
.image-preview-fade-leave-from {
    opacity: 1;
}
</style>
