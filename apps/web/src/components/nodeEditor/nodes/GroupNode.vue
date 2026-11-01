<script setup lang="ts">
import { useVueFlow } from "@vue-flow/core"
import { onBeforeUnmount, ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const { viewport } = useVueFlow()

const MIN_WIDTH = 260
const MIN_HEIGHT = 160

const width = ref(Number(props.data.width) || 640)
const height = ref(Number(props.data.height) || 420)
const title = ref(typeof props.data.label === "string" ? props.data.label : "分组")

// 首次创建时补齐尺寸，保证保存后重新加载仍是同一大小
if (props.data.width === undefined) props.data.width = width.value
if (props.data.height === undefined) props.data.height = height.value

watch(
    () => props.data.width,
    value => {
        if (Number(value) > 0) width.value = Number(value)
    }
)
watch(
    () => props.data.height,
    value => {
        if (Number(value) > 0) height.value = Number(value)
    }
)
watch(
    () => props.data.label,
    value => {
        if (typeof value === "string") title.value = value
    }
)

let resizeStart: { x: number; y: number; width: number; height: number } | null = null

/** 开始拖动右下角缩放手柄 */
function onResizePointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    resizeStart = { x: event.clientX, y: event.clientY, width: width.value, height: height.value }
    window.addEventListener("pointermove", onResizePointerMove)
    window.addEventListener("pointerup", onResizePointerUp)
}

/** 按画布缩放换算指针位移 */
function onResizePointerMove(event: PointerEvent) {
    if (!resizeStart) return
    const zoom = viewport.value.zoom || 1
    width.value = Math.max(MIN_WIDTH, Math.round(resizeStart.width + (event.clientX - resizeStart.x) / zoom))
    height.value = Math.max(MIN_HEIGHT, Math.round(resizeStart.height + (event.clientY - resizeStart.y) / zoom))
}

/** 结束缩放并写回节点数据 */
function onResizePointerUp() {
    if (resizeStart) store.updateNodeData(props.id, { width: width.value, height: height.value })
    resizeStart = null
    window.removeEventListener("pointermove", onResizePointerMove)
    window.removeEventListener("pointerup", onResizePointerUp)
}

function commitTitle() {
    store.updateNodeData(props.id, { label: title.value })
}

function blurOnEnter(event: KeyboardEvent) {
    ;(event.target as HTMLInputElement | null)?.blur()
}

onBeforeUnmount(() => {
    window.removeEventListener("pointermove", onResizePointerMove)
    window.removeEventListener("pointerup", onResizePointerUp)
})
</script>

<template>
    <div
        class="relative rounded-xs border border-dashed transition-colors duration-150"
        :class="selected ? 'border-primary/70 bg-primary/8' : 'border-base-content/20 bg-primary/4 hover:border-base-content/40'"
        :style="{ width: `${width}px`, height: `${height}px` }"
    >
        <div class="flex h-7 items-center gap-1.5 border-b border-dashed border-base-content/15 bg-base-content/5 px-2">
            <Icon icon="ri:group-line" class="size-3.5 shrink-0 text-base-content/45" />
            <input
                v-model="title"
                class="nodrag nopan w-full min-w-0 rounded-none bg-transparent px-0.5 text-[12px] font-semibold text-base-content/80 outline-none placeholder:text-base-content/30 focus:text-base-content"
                placeholder="分组名称"
                @change="commitTitle"
                @keydown.enter.prevent="blurOnEnter"
                @pointerdown.stop
                @mousedown.stop
            />
        </div>
        <!-- 右下角缩放手柄 -->
        <div class="nodrag nopan absolute bottom-0 right-0 size-4 cursor-se-resize" title="拖动调整分组大小" @pointerdown="onResizePointerDown">
            <svg viewBox="0 0 16 16" class="size-full text-base-content/35">
                <path d="M15 15H9L15 9V15ZM15 11H13L15 9V11Z" fill="currentColor" />
            </svg>
        </div>
    </div>
</template>
