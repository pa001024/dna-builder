<script setup lang="ts">
import { useVueFlow } from "@vue-flow/core"
import { computed, onBeforeUnmount, ref } from "vue"
import CardEntityPickerDialog from "@/components/CardEntityPickerDialog.vue"
import DBAICard from "@/components/DBAICard.vue"
import ModPickerDialog from "@/components/ModPickerDialog.vue"
import { modData } from "@/data"
import { useInvStore } from "@/store/inv"
import { useNodeEditorStore } from "@/store/nodeEditor"
import type { ModPickerOption } from "@/utils/modPicker"
import BaseNode from "./BaseNode.vue"

type CardKind = "char" | "weapon" | "mod"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const inv = useInvStore()
const { viewport } = useVueFlow()

const DEFAULT_CARD_WIDTH = 224
const MIN_CARD_WIDTH = 160
const MAX_CARD_WIDTH = 560

/** 三种可展示的资料库条目 */
const KINDS: Array<{ kind: CardKind; label: string; icon: "ri:user-line" | "ri:sword-line" | "ri:grid-line" }> = [
    { kind: "char", label: "角色", icon: "ri:user-line" },
    { kind: "weapon", label: "武器", icon: "ri:sword-line" },
    { kind: "mod", label: "魔之楔", icon: "ri:grid-line" },
]

/** 每种类型独立记住自己的选择，切换类型不会互相覆盖 */
const SELECTION_KEY: Record<CardKind, string> = {
    char: "cardCharId",
    weapon: "cardWeaponId",
    mod: "cardModId",
}

const kind = computed<CardKind>(() => {
    const value = props.data.cardKind
    return value === "weapon" || value === "mod" ? value : "char"
})

const currentKind = computed(() => KINDS.find(item => item.kind === kind.value) ?? KINDS[0])

const currentId = computed(() => {
    const value = Number(props.data[SELECTION_KEY[kind.value]])
    return Number.isFinite(value) && value > 0 ? value : undefined
})

/** 角色 / 武器弹窗只接受这两种 kind；魔之楔走独立弹窗 */
const entityPickKind = computed<"char" | "weapon">(() => (kind.value === "weapon" ? "weapon" : "char"))

/** 沉浸查看：只保留卡片本体 */
const focusMode = computed(() => props.data.focusMode === true)

/** 卡片宽度：卡片按宽度等比缩放，高度由内容决定 */
const cardWidth = computed(() => {
    const value = Number(props.data.cardWidth)
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_CARD_WIDTH
    return Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, Math.round(value)))
})

const pickerOpen = ref(false)

/** 魔之楔候选：卡片节点不参与构筑计算，使用全部数据 */
const modOptions = computed<ModPickerOption[]>(() =>
    modData.map(mod => ({
        value: mod.id,
        label: mod.名称,
        quality: mod.品质,
        type: mod.类型,
        ser: mod.系列,
        bufflv: inv.getBuffLv(mod.id),
        lv: inv.getModLv(mod.id, mod.品质),
    }))
)

function setKind(next: CardKind) {
    if (kind.value === next) return
    store.updateNodeData(props.id, { cardKind: next })
}

function openPicker() {
    pickerOpen.value = true
}

// 记录按下位置：节点整体可拖拽后，拖动结束的 click 不应再打开弹窗
let pressStart: { x: number; y: number } | null = null

/** 记录卡片区域按下的起点 */
function onCardPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    pressStart = { x: event.clientX, y: event.clientY }
}

/** 指针移动超过阈值视为拖拽节点而非点击；键盘触发的 click 不参与判断 */
function isDragGesture(event: MouseEvent) {
    if (event.detail === 0) return false
    return pressStart !== null && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 4
}

/** 点击卡片进入选择弹窗；拖拽节点时不触发 */
function openPickerFromCard(event: MouseEvent) {
    const dragged = isDragGesture(event)
    pressStart = null
    if (dragged) return
    openPicker()
}

// 右下角拖拽调整卡片宽度，按画布缩放换算位移
let resizeStart: { x: number; y: number; width: number; changed: boolean } | null = null

/** 开始拖动右下角缩放手柄 */
function startResize(event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    resizeStart = { x: event.clientX, y: event.clientY, width: cardWidth.value, changed: false }
    window.addEventListener("pointermove", handleResizeMove)
    window.addEventListener("pointerup", endResize)
}

/** 取水平/垂直位移较大的方向作为缩放依据 */
function handleResizeMove(event: PointerEvent) {
    if (!resizeStart) return
    const zoom = viewport.value.zoom || 1
    const dx = (event.clientX - resizeStart.x) / zoom
    const dy = (event.clientY - resizeStart.y) / zoom
    const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy
    const width = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, Math.round(resizeStart.width + delta)))
    if (width === cardWidth.value) return
    resizeStart.changed = true
    props.data.cardWidth = width
}

/** 结束缩放并写入历史 */
function endResize() {
    if (resizeStart?.changed) store.commitHistory("调整卡片尺寸")
    resizeStart = null
    window.removeEventListener("pointermove", handleResizeMove)
    window.removeEventListener("pointerup", endResize)
}

onBeforeUnmount(() => {
    window.removeEventListener("pointermove", handleResizeMove)
    window.removeEventListener("pointerup", endResize)
})

function selectEntity(id: number) {
    store.updateNodeData(props.id, { [SELECTION_KEY[kind.value]]: id })
}

function selectMod(option: ModPickerOption) {
    store.updateNodeData(props.id, { cardModId: option.value })
}

function clearSelection() {
    store.updateNodeData(props.id, { [SELECTION_KEY[kind.value]]: undefined })
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }" :focusable="true">
        <div
            class="relative [&_img]:[-webkit-user-drag:none]"
            :style="{ width: `${cardWidth}px` }"
            @pointerdown="onCardPointerDown"
            @dragstart.prevent
        >
            <!-- 类型切换：编辑态默认露出，沉浸查看时收起 -->
            <div v-if="!focusMode" class="mb-1 flex items-center gap-1 text-[10px]">
                <div class="flex min-w-0 overflow-hidden rounded-xs border border-base-content/15">
                    <button
                        v-for="item in KINDS"
                        :key="item.kind"
                        type="button"
                        class="nodrag cursor-pointer px-1.5 py-0.5 transition-colors duration-150"
                        :class="
                            kind === item.kind
                                ? 'bg-primary/15 text-primary'
                                : 'text-base-content/55 hover:text-base-content'
                        "
                        @click.stop="setKind(item.kind)"
                    >
                        {{ item.label }}
                    </button>
                </div>
                <button
                    v-if="currentId"
                    type="button"
                    class="nodrag ml-auto cursor-pointer text-base-content/45 transition-colors duration-150 hover:text-primary"
                    title="清除卡片"
                    @click.stop="clearSelection"
                >
                    <Icon icon="ri:delete-bin-line" class="size-3" />
                </button>
            </div>

            <!-- 未选择时的编辑占位 -->
            <button
                v-if="!currentId"
                type="button"
                class="flex aspect-4/3 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xs border border-dashed border-base-content/20 bg-base-content/4 text-[11px] text-base-content/35 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                @click.stop="openPickerFromCard"
            >
                <Icon :icon="currentKind.icon" class="size-6" />
                <span>点击选择{{ currentKind.label }}</span>
            </button>

            <!-- 卡片本体：整体可拖拽节点，点击进入编辑（阻止 DBAICard 自带的资料库跳转） -->
            <div
                v-else
                class="group relative w-full cursor-pointer"
                @click.capture.stop.prevent="openPickerFromCard"
            >
                <DBAICard :kind="kind" :id="currentId" :style="{ width: `${cardWidth}px`, margin: '0' }" />
                <span
                    class="pointer-events-none absolute inset-0 rounded-xs border border-transparent transition-colors duration-200 group-hover:border-primary/45"
                />
            </div>

            <!-- 缩放手柄 -->
            <div
                v-if="!focusMode"
                class="nodrag nopan absolute bottom-0 right-0 z-10 size-3.5 cursor-se-resize text-base-content/30 transition-colors duration-150 hover:text-primary"
                title="拖动调整卡片大小"
                @pointerdown="startResize"
            >
                <svg viewBox="0 0 16 16" class="size-full">
                    <path d="M15 15H9L15 9V15ZM15 11H13L15 9V11Z" fill="currentColor" />
                </svg>
            </div>
        </div>

        <CardEntityPickerDialog
            v-if="pickerOpen && kind !== 'mod'"
            :open="pickerOpen"
            :kind="entityPickKind"
            :selected-id="currentId"
            @update:open="pickerOpen = $event"
            @select="selectEntity"
        />
        <ModPickerDialog
            v-if="pickerOpen && kind === 'mod'"
            :open="pickerOpen"
            :mod-options="modOptions"
            title="选择魔之楔"
            @update:open="pickerOpen = $event"
            @select="selectMod"
        />
    </BaseNode>
</template>
