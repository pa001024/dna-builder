<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from "@/utils/color"

/** 当前选中颜色（十六进制，双向绑定）。 */
const hex = defineModel<string>({ default: "#ffffff" })

/** 色相 0~360。 */
const hue = ref(0)
/** 饱和度 0~1。 */
const saturation = ref(1)
/** 明度 0~1。 */
const value = ref(1)

/** 由当前 HSV 推导出的十六进制色值。 */
const localHex = computed(() => rgbToHex(hsvToRgb(hue.value, saturation.value, value.value)))
/** 输入框文本（允许中途输入不完整色值）。 */
const hexText = ref(hex.value)

const svCanvas = ref<HTMLCanvasElement>()
const hueCanvas = ref<HTMLCanvasElement>()
/** 「饱和度 × 明度」取色区是否处于拖动中。 */
const draggingSv = ref(false)
/** 色相条是否处于拖动中。 */
const draggingHue = ref(false)

/** 画布内部尺寸（按设备像素比放大，保证取色区边缘清晰）。 */
const SV_WIDTH = 240
const SV_HEIGHT = 150
const HUE_HEIGHT = 14

/** 把数值限制在闭区间内。 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** 按当前色相重绘「饱和度 × 明度」取色区。 */
function paintSaturationValue() {
    const canvas = svCanvas.value
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(SV_WIDTH * ratio)
    canvas.height = Math.round(SV_HEIGHT * ratio)
    const context = canvas.getContext("2d")
    if (!context) return
    const image = context.createImageData(canvas.width, canvas.height)
    for (let y = 0; y < canvas.height; y++) {
        const currentValue = 1 - y / (canvas.height - 1)
        for (let x = 0; x < canvas.width; x++) {
            const currentSaturation = x / (canvas.width - 1)
            const [r, g, b] = hsvToRgb(hue.value, currentSaturation, currentValue)
            const offset = (y * canvas.width + x) * 4
            image.data[offset] = r
            image.data[offset + 1] = g
            image.data[offset + 2] = b
            image.data[offset + 3] = 255
        }
    }
    context.putImageData(image, 0, 0)
}

/** 绘制色相条（六段标准色相线性渐变）。 */
function paintHue() {
    const canvas = hueCanvas.value
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(SV_WIDTH * ratio)
    canvas.height = Math.round(HUE_HEIGHT * ratio)
    const context = canvas.getContext("2d")
    if (!context) return
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0)
    for (let stop = 0; stop <= 6; stop++) {
        const [r, g, b] = hsvToRgb(stop * 60, 1, 1)
        gradient.addColorStop(stop / 6, `rgb(${r} ${g} ${b})`)
    }
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)
}

/** 取色游标位置（相对取色区的百分比）。 */
const svCursor = computed(() => ({ left: `${saturation.value * 100}%`, top: `${(1 - value.value) * 100}%` }))
/** 色相游标位置（相对色相条的百分比）。 */
const hueCursor = computed(() => ({ left: `${(hue.value / 360) * 100}%` }))

/** 把指针位置换算为取色区内的饱和度与明度。 */
function pickFromSaturationValue(event: PointerEvent) {
    const canvas = svCanvas.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    saturation.value = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    value.value = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1)
}

/** 把指针位置换算为色相。 */
function pickFromHue(event: PointerEvent) {
    const canvas = hueCanvas.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    hue.value = Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360) % 360
}

/** 开始在取色区拖动（捕获指针，拖出画布仍可继续取色）。 */
function startSaturationValueDrag(event: PointerEvent) {
    draggingSv.value = true
    const canvas = event.currentTarget as HTMLCanvasElement
    canvas.setPointerCapture(event.pointerId)
    pickFromSaturationValue(event)
}

/** 拖动取色区。 */
function moveSaturationValue(event: PointerEvent) {
    if (draggingSv.value) pickFromSaturationValue(event)
}

/** 结束取色区拖动。 */
function endSaturationValueDrag(event: PointerEvent) {
    draggingSv.value = false
    const canvas = event.currentTarget as HTMLCanvasElement
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
}

/** 开始在色相条拖动。 */
function startHueDrag(event: PointerEvent) {
    draggingHue.value = true
    const canvas = event.currentTarget as HTMLCanvasElement
    canvas.setPointerCapture(event.pointerId)
    pickFromHue(event)
}

/** 拖动色相条。 */
function moveHue(event: PointerEvent) {
    if (draggingHue.value) pickFromHue(event)
}

/** 结束色相条拖动。 */
function endHueDrag(event: PointerEvent) {
    draggingHue.value = false
    const canvas = event.currentTarget as HTMLCanvasElement
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
}

/** 提交输入框色值，非法时回退为当前颜色。 */
function commitHex() {
    const rgb = hexToRgb(hexText.value)
    if (!rgb) {
        hexText.value = hex.value
        return
    }
    hex.value = rgbToHex(rgb)
}

// 外部色值变化时同步 HSV（本地取色推导出的同值不回写，避免取色时游标抖动）
watch(
    () => hex.value,
    next => {
        hexText.value = next
        if (next.toLowerCase() === localHex.value) return
        const rgb = hexToRgb(next)
        if (!rgb) return
        const [h, s, v] = rgbToHsv(rgb)
        hue.value = h
        saturation.value = s
        value.value = v
    },
    { immediate: true }
)

// 本地 HSV 变化时回写色值
watch(localHex, next => {
    if (next !== hex.value.toLowerCase()) hex.value = next
})

// 色相变化需要重绘取色区
watch(hue, () => paintSaturationValue())

onMounted(() => {
    paintHue()
    paintSaturationValue()
})
</script>

<template>
    <div class="space-y-2">
        <!-- 饱和度 × 明度 取色区 -->
        <div class="relative">
            <canvas
                ref="svCanvas"
                class="block h-30 w-full cursor-crosshair touch-none rounded-xs border border-base-content/10"
                @pointerdown="startSaturationValueDrag"
                @pointermove="moveSaturationValue"
                @pointerup="endSaturationValueDrag"
                @pointercancel="endSaturationValueDrag"
            />
            <span
                class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-xs border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                :style="svCursor"
                aria-hidden="true"
            />
        </div>

        <!-- 色相条 -->
        <div class="relative">
            <canvas
                ref="hueCanvas"
                class="block h-3.5 w-full cursor-pointer touch-none rounded-xs border border-base-content/10"
                @pointerdown="startHueDrag"
                @pointermove="moveHue"
                @pointerup="endHueDrag"
                @pointercancel="endHueDrag"
            />
            <span
                class="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 rounded-xs border border-white/70 bg-base-content/25 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                :style="hueCursor"
                aria-hidden="true"
            />
        </div>

        <!-- 取色结果与十六进制输入 -->
        <div class="flex items-center gap-2">
            <span
                class="size-7 shrink-0 rounded-xs border border-base-content/20"
                :style="{ backgroundColor: localHex }"
                aria-hidden="true"
            />
            <input
                v-model="hexText"
                type="text"
                class="w-28 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] tabular-nums text-base-content uppercase outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                maxlength="7"
                spellcheck="false"
                aria-label="十六进制色值"
                @keydown.enter="commitHex"
                @blur="commitHex"
            />
        </div>
    </div>
</template>
