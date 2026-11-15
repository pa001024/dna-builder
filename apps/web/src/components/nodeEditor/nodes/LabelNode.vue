<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 72

const text = ref(typeof props.data.text === "string" ? props.data.text : "")

if (props.data.text === undefined) props.data.text = ""

/** 字号是展示数据：拖动控制点只改它，不参与构筑求值 */
const fontSize = computed(() => {
    const value = Number(props.data.fontSize)
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_FONT_SIZE
    return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value))
})

const editing = ref(false)
/** 选中态即控制状态：显示控制点，再次点击文字才进入编辑 */
const showControls = computed(() => !editing.value && props.selected)
/** 拖动字号时的临时值：只在本组件内生效，松手后一次性写回节点数据 */
const draftFontSize = ref<number | null>(null)
const displayFontSize = computed(() => draftFontSize.value ?? fontSize.value)

const rootEl = ref<HTMLElement | null>(null)
const displayEl = ref<HTMLElement | null>(null)
const editor = ref<HTMLElement | null>(null)
/** 进入编辑前量好的文本尺寸：编辑期间锁住宽度，避免光标 / 输入框把节点撑变形 */
const editorWidth = ref(0)
const editorHeight = ref(0)

let pressStart: { x: number; y: number } | null = null
/** 按下时节点是否已处于选中态（VueFlow 会在本次点击里改 selected，必须提前记录） */
let selectedOnPointerDown = false

watch(
    () => props.data.text,
    value => {
        if (!editing.value && typeof value === "string" && value !== text.value) text.value = value
    }
)

// 持久化字号变化后清掉临时值（提交成功或撤销都会走到这里）
watch(
    () => props.data.fontSize,
    () => {
        draftFontSize.value = null
    }
)

/** 记录按下位置与选中状态：拖动节点时不误入编辑，首次点击只显示控制点 */
function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    pressStart = { x: event.clientX, y: event.clientY }
    selectedOnPointerDown = props.selected
}

/** 单击文字：控制状态下进入编辑，否则先点亮控制点 */
function onClick(event: MouseEvent) {
    const dragged = pressStart !== null && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 4
    pressStart = null
    if (dragged || editing.value || props.data.locked === true) return
    // 首次点击交给 VueFlow 选中并显示控制点；已选中时再次点击才进入编辑
    if (selectedOnPointerDown) void startEdit(event.clientX, event.clientY)
}

/** 读取点击位置对应的文本光标范围（Chromium / WebView2 走 caretRangeFromPoint） */
function caretRangeAt(x: number, y: number): Range | null {
    const doc = document as Document & {
        caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null
        caretPositionFromPoint?: (clientX: number, clientY: number) => { offsetNode: Node; offset: number } | null
    }
    const range = doc.caretRangeFromPoint?.(x, y)
    if (range) return range
    const position = doc.caretPositionFromPoint?.(x, y)
    if (!position) return null
    const fallback = document.createRange()
    fallback.setStart(position.offsetNode, position.offset)
    fallback.collapse(true)
    return fallback
}

/**
 * 进入编辑：锁住原文本尺寸与字号，并按点击位置放置光标。
 * @param clickX 触发编辑的点击位置（屏幕坐标）
 * @param clickY 触发编辑的点击位置（屏幕坐标）
 */
async function startEdit(clickX?: number, clickY?: number) {
    editorWidth.value = displayEl.value?.offsetWidth || 160
    editorHeight.value = displayEl.value?.offsetHeight || 0
    editing.value = true
    await nextTick()
    const element = editor.value
    if (!element) return
    element.innerText = text.value
    element.focus()
    // 优先把光标放到用户点击的位置；落点不在文本内时才退回文末
    let range = clickX !== undefined && clickY !== undefined ? caretRangeAt(clickX, clickY) : null
    if (!range || !element.contains(range.startContainer)) {
        range = document.createRange()
        range.selectNodeContents(element)
        range.collapse(false)
    }
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
}

function onInput() {
    if (editor.value) text.value = editor.value.innerText
}

/** 结束编辑并提交；内容没变时不写历史 */
function commitEdit() {
    if (!editing.value) return
    editing.value = false
    if (text.value !== props.data.text) store.updateNodeData(props.id, { text: text.value })
}

/** 粘贴只保留纯文本，避免把外部富文本结构带进标签 */
function onPaste(event: ClipboardEvent) {
    const content = event.clipboardData?.getData("text/plain")
    if (!content) {
        // 没有纯文本内容时吞掉粘贴，避免删除选区却插入空内容
        event.preventDefault()
        return
    }
    event.preventDefault()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(content)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    onInput()
}

/** 四角控制点：拖动任意一个按离文字中心的距离缩放字号 */
const HANDLES = [
    { key: "nw", className: "-top-1 -left-1 cursor-nwse-resize" },
    { key: "ne", className: "-top-1 -right-1 cursor-nesw-resize" },
    { key: "sw", className: "-bottom-1 -left-1 cursor-nesw-resize" },
    { key: "se", className: "-bottom-1 -right-1 cursor-nwse-resize" },
] as const

interface ResizeSession {
    startFontSize: number
    centerX: number
    centerY: number
    startDistance: number
}

let resizeSession: ResizeSession | null = null

function removeResizeListeners() {
    window.removeEventListener("pointermove", onResizeMove)
    window.removeEventListener("pointerup", finishResize)
    window.removeEventListener("pointercancel", finishResize)
}

/**
 * 开始拖动字号控制点：以文字包围盒中心为基准，按指针到中心的距离等比缩放字号。
 * 拖动期间只更新本地临时值，松手后一次性写回节点数据（一个撤销步骤）。
 * @param event 指针事件
 */
function startResize(event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const rect = rootEl.value?.getBoundingClientRect()
    const centerX = rect ? rect.left + rect.width / 2 : event.clientX
    const centerY = rect ? rect.top + rect.height / 2 : event.clientY
    resizeSession = {
        startFontSize: displayFontSize.value,
        centerX,
        centerY,
        startDistance: Math.max(12, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
    }
    window.addEventListener("pointermove", onResizeMove)
    window.addEventListener("pointerup", finishResize)
    window.addEventListener("pointercancel", finishResize)
}

function onResizeMove(event: PointerEvent) {
    if (!resizeSession) return
    const distance = Math.hypot(event.clientX - resizeSession.centerX, event.clientY - resizeSession.centerY)
    const next = resizeSession.startFontSize * (distance / resizeSession.startDistance)
    draftFontSize.value = Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, next)) * 2) / 2
}

function finishResize() {
    removeResizeListeners()
    if (!resizeSession) return
    resizeSession = null
    const draft = draftFontSize.value
    if (draft === null || draft === fontSize.value) {
        draftFontSize.value = null
        return
    }
    // 保留临时值直到 props 更新，避免提交的同一帧跳回旧字号
    store.updateNodeData(props.id, { fontSize: draft })
}

onBeforeUnmount(() => {
    removeResizeListeners()
    resizeSession = null
    draftFontSize.value = null
})
</script>

<template>
    <div ref="rootEl" class="relative" :style="{ fontSize: `${displayFontSize}px` }">
        <div
            v-if="!editing"
            ref="displayEl"
            class="min-w-20 cursor-text whitespace-pre-wrap wrap-break-word leading-relaxed text-base-content"
            :class="showControls ? 'outline-1 outline-dashed outline-primary/40' : 'outline-none'"
            title="单击显示控制点，再次点击文字编辑"
            @pointerdown="onPointerDown"
            @click="onClick"
        >
            <span v-if="text">{{ text }}</span>
            <span v-else class="text-base-content/35">点击输入文字</span>
        </div>
        <div
            v-else
            ref="editor"
            contenteditable="true"
            spellcheck="false"
            class="nodrag nopan nowheel cursor-text select-text whitespace-pre-wrap wrap-break-word leading-relaxed text-base-content outline-1 outline-dashed outline-primary/60"
            :style="{ width: `${editorWidth}px`, minHeight: editorHeight > 0 ? `${editorHeight}px` : undefined }"
            @input="onInput"
            @blur="commitEdit"
            @keydown.esc.stop.prevent="commitEdit"
            @paste="onPaste"
            @pointerdown.stop
            @mousedown.stop
            @wheel.stop
        />

        <!-- 控制点：只响应拖动，不参与节点拖动与文字点击 -->
        <div v-if="showControls" class="pointer-events-none absolute inset-0">
            <span
                v-for="handle in HANDLES"
                :key="handle.key"
                class="nodrag nopan pointer-events-auto absolute size-2 border border-primary bg-base-100 shadow-sm"
                :class="handle.className"
                title="拖动调整字号"
                @pointerdown="startResize"
                @click.stop
                @mousedown.stop
            />
        </div>
    </div>
</template>

<style>
/*
 * 文本标签按内容无限撑宽：节点是绝对定位元素，自动宽度默认被包含块（画布视口）的
 * 可用宽度截断，长文本会在约一屏处自动换行。max-content 让宽度只由文本本身决定。
 */
.vue-flow__node-label {
    width: max-content;
    max-width: none;
}
</style>
