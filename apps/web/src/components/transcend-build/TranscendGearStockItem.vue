<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { TranscendGearStockRow } from "@/utils/transcend-gear/repo"
import TranscendGearSquareCard from "./TranscendGearSquareCard.vue"

/**
 * 库存卡：方形装备卡（自带 FullTooltip 富预览）+ 与构筑页槽位一致的顶部 hover 浮层（编辑 / 删除）。
 * 浮层隐藏时整层 inert、不进 Tab 序；无 hover 的触屏 / 粗指针环境常驻可见；入口先 `close()` 预览再执行。
 * 孔位与宝石在编辑表单内操作，库存卡不单设入口。
 */

const props = defineProps<{
    row: TranscendGearStockRow
    /** 库存份数 */
    count: number
    /** 是否与已装备物品同一身份 */
    equipped: boolean
    /** 数据包可用：缺包时禁用编辑 */
    dataReady: boolean
}>()

const emit = defineEmits<{
    (event: "edit", value: MouseEvent): void
    (event: "delete"): void
}>()

const cardRef = ref<{ close: () => void } | null>(null)

/** 触屏 / 粗指针：没有 hover 可用，浮层常驻（不加 inert，按钮留在 Tab / 点击可达序列） */
const touchFallback = ref(false)
let coarsePointerQuery: MediaQueryList | null = null

/** 同步无 hover 环境判定 */
function syncTouchFallback(): void {
    touchFallback.value = coarsePointerQuery?.matches ?? false
}

onMounted(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    coarsePointerQuery = window.matchMedia("(hover: none), (pointer: coarse)")
    syncTouchFallback()
    coarsePointerQuery.addEventListener("change", syncTouchFallback)
})

onBeforeUnmount(() => {
    coarsePointerQuery?.removeEventListener("change", syncTouchFallback)
})

/** 悬浮操作浮层是否可见（指针悬停 / 焦点在卡片子树 / 触屏常驻）：隐藏时整层 inert，不进 Tab 序 */
const hovered = ref(false)
const focusWithin = ref(false)
const actionsVisible = computed(() => touchFallback.value || hovered.value || focusWithin.value)

/**
 * 指针进入：只认真实指针事件，与离开对称（合成 pointerenter 会留下没有对应离开事件的常驻浮层）。
 * @param event 指针事件
 * @returns 无
 */
function handlePointerEnter(event: PointerEvent): void {
    if (!event.isTrusted) return
    hovered.value = true
}

/**
 * 指针离开：只认真实指针事件（FullTooltip 复位悬停态时会派发合成 pointerleave）。
 * @param event 指针事件
 * @returns 无
 */
function handlePointerLeave(event: PointerEvent): void {
    if (!event.isTrusted) return
    hovered.value = false
}

/**
 * 焦点进入：根节点自身不可聚焦，焦点落在卡片子树内时展开浮层。
 * @param event 焦点事件
 * @returns 无
 */
function handleFocusIn(event: FocusEvent): void {
    focusWithin.value = event.target !== event.currentTarget
}

/**
 * 焦点移出：仅在焦点仍留在卡片子树内时保持浮层可用。
 * @param event 焦点事件
 * @returns 无
 */
function handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    const root = event.currentTarget as HTMLElement
    focusWithin.value = next instanceof Node && next !== root && root.contains(next)
}

/**
 * 先关闭预览再执行操作：弹窗打开时键盘 Enter 不会像真实 click 那样触发 Reka 的关闭。
 * @param action 实际操作
 * @returns 无
 */
function closeThen(action: () => void): void {
    cardRef.value?.close()
    action()
}

/** 打开编辑（孔位与宝石在编辑表单内操作） */
function onEdit(event: MouseEvent): void {
    closeThen(() => emit("edit", event))
}

/** 删除库存行 */
function onDelete(): void {
    closeThen(() => emit("delete"))
}

/** 物品被替换（原地复用 DOM）时立即关闭预览，避免旧预览继续显示新物品 */
watch(
    () => props.row.item,
    () => cardRef.value?.close()
)
</script>

<template>
    <div
        class="relative"
        data-gear-stock-row
        :data-stock-id="row.id"
        :data-stock-hash="row.hash"
        @pointerenter="handlePointerEnter"
        @pointerleave="handlePointerLeave"
        @focusin="handleFocusIn"
        @focusout="handleFocusOut"
    >
        <TranscendGearSquareCard ref="cardRef" :item="row.item" :count="count" :equipped="equipped" context="stock" />

        <!-- 浮层在 DOM 中排在卡片之后：Tab 从卡片触发根继续进入操作按钮；绝对定位不影响视觉层级 -->
        <div
            class="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-1 bg-base-100/70 py-0.5 backdrop-blur-sm transition-opacity duration-150"
            :class="actionsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
            :inert="!actionsVisible"
            data-gear-actions
        >
            <button
                type="button"
                class="btn btn-ghost btn-xs h-5 min-h-0 px-1"
                :aria-label="$t('transcend-build.gear_stock_edit')"
                :disabled="!dataReady"
                :tabindex="actionsVisible ? undefined : -1"
                data-gear-stock-edit
                @click.stop="onEdit"
            >
                <Icon icon="ri:edit-line" class="size-3.5" />
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-xs h-5 min-h-0 px-1 text-error/80"
                :aria-label="$t('transcend-build.gear_stock_delete')"
                :tabindex="actionsVisible ? undefined : -1"
                data-gear-stock-delete
                @click.stop="onDelete"
            >
                <Icon icon="codicon:chrome-close" class="size-3.5" />
            </button>
        </div>
    </div>
</template>
