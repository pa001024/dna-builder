<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useAttrs } from "vue"

defineOptions({
    inheritAttrs: false,
})

const props = defineProps<{
    thumbUrl: string
    fullUrl: string
}>()

type FrameRect = {
    left: number
    top: number
    width: number
    height: number
}

const attrs = useAttrs()
const overlayVisible = ref(false)
const zoomScale = ref(1)
const displayUrl = ref("")
const loadedFullImage = ref(false)
const frameRect = ref<FrameRect | null>(null)
const startRadius = ref("16px")
const endRadius = ref("24px")
const bodyOverflow = ref("")
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
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
 * 这里先固定一个居中展示区域，再由图片自身的 object-contain 适配内容。
 * @returns 目标矩形
 */
function getTargetRect() {
    const padding = 32
    const maxWidth = Math.min(window.innerWidth - padding * 2, 1200)
    const maxHeight = Math.min(window.innerHeight - padding * 2, 900)
    const width = Math.max(320, maxWidth)
    const height = Math.max(240, maxHeight)
    return {
        left: Math.round((window.innerWidth - width) / 2),
        top: Math.round((window.innerHeight - height) / 2),
        width: Math.round(width),
        height: Math.round(height),
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
    const nextLeft = Math.round(clientX - dragOffset.value.x)
    const nextTop = Math.round(clientY - dragOffset.value.y)
    frameRect.value = {
        ...frameRect.value,
        left: clamp(nextLeft, 0, Math.max(0, window.innerWidth - frameRect.value.width)),
        top: clamp(nextTop, 0, Math.max(0, window.innerHeight - frameRect.value.height)),
    }
}

/**
 * 关闭当前大图预览，并清理异步加载状态。
 */
function closePreview() {
    overlayVisible.value = false
    frameRect.value = null
    zoomScale.value = 1
    loadedFullImage.value = false
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
function preloadFullImage(token: number) {
    loader = new Image()
    loader.decoding = "async"
    loader.onload = () => {
        if (token !== requestId) return
        loadedFullImage.value = true
        displayUrl.value = props.fullUrl
    }
    loader.onerror = () => {
        if (token !== requestId) return
        loadedFullImage.value = true
    }
    loader.src = props.fullUrl
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
    if (overlayVisible.value) return

    const target = event.currentTarget as HTMLButtonElement | null
    if (!target) return

    event.preventDefault()
    event.stopPropagation()

    const rect = target.getBoundingClientRect()
    const computedStyle = window.getComputedStyle(target)

    requestId += 1
    const token = requestId
    overlayVisible.value = true
    loadedFullImage.value = false
    displayUrl.value = props.thumbUrl
    zoomScale.value = 1
    startRadius.value = computedStyle.borderRadius || "16px"
    endRadius.value = "24px"
    frameRect.value = {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    }

    syncBodyScroll(true)
    window.addEventListener("keydown", handleKeydown)
    preloadFullImage(token)

    await nextTick()
    enterFrameId = window.requestAnimationFrame(() => {
        settleFrameId = window.requestAnimationFrame(() => {
            if (token !== requestId) return
            frameRect.value = getTargetRect()
        })
    })
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
    dragOffset.value = {
        x: event.clientX - frameRect.value.left,
        y: event.clientY - frameRect.value.top,
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
    const delta = event.deltaY > 0 ? -0.12 : 0.12
    zoomScale.value = clamp(Number((zoomScale.value + delta).toFixed(2)), 0.5, 4)
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
}

onBeforeUnmount(() => {
    closePreview()
})
</script>

<template>
    <button type="button" v-bind="attrs" class="inline-flex cursor-zoom-in p-0 border-0 bg-transparent" @click="openPreview">
        <img :src="thumbUrl" alt="" class="block h-full w-full object-cover" draggable="false" />
    </button>

    <Teleport to="body">
        <transition name="image-preview-fade">
            <div v-if="overlayVisible" class="fixed inset-0 z-9999">
                <div class="absolute inset-0 bg-black/80" @click="closePreview" />
                <div
                    class="fixed left-4 top-4 items-center z-10 gap-1 text-xs bg-base-200 hover:bg-base-300 cursor-pointer p-1 rounded"
                    @click="closePreview"
                >
                    <Icon icon="ri:close-line" class="text-2xl text-red-500" />
                </div>

                <div class="fixed right-4 top-4 z-10 flex gap-2">
                    <button
                        type="button"
                        class="rounded bg-base-100/90 px-3 py-2 text-sm text-base-content shadow-xl backdrop-blur"
                        @click="zoomOut"
                    >
                        -
                    </button>
                    <button
                        type="button"
                        class="rounded bg-base-100/90 px-3 py-2 text-sm text-base-content shadow-xl backdrop-blur"
                        @click="resetZoom"
                    >
                        1:1
                    </button>
                    <button
                        type="button"
                        class="rounded bg-base-100/90 px-3 py-2 text-sm text-base-content shadow-xl backdrop-blur"
                        @click="zoomIn"
                    >
                        +
                    </button>
                </div>

                <img
                    v-if="frameRect"
                    :src="displayUrl"
                    alt=""
                    class="fixed select-none object-contain shadow-2xl"
                    draggable="false"
                    @click.stop
                    @wheel.prevent="handleWheel"
                    @pointerdown="startDrag"
                    :style="{
                        left: `${frameRect.left}px`,
                        top: `${frameRect.top}px`,
                        width: `${frameRect.width}px`,
                        height: `${frameRect.height}px`,
                        borderRadius: overlayVisible && loadedFullImage ? endRadius : startRadius,
                        transform: `scale(${zoomScale})`,
                        cursor: isDragging ? 'grabbing' : loadedFullImage ? 'grab' : 'default',
                        transitionProperty: isDragging ? 'transform' : 'left, top, width, height, border-radius, transform, opacity',
                        transitionDuration: '360ms',
                        transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        willChange: 'left, top, width, height, transform',
                    }"
                />
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
