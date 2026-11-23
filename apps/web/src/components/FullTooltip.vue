<script lang="ts" setup>
import { TooltipArrow, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from "reka-ui"
import { nextTick, ref, watch } from "vue"

const props = withDefaults(
    defineProps<{
        side: "top" | "right" | "bottom" | "left"
        /** 禁用打开（无预览内容）；触摸按住同样不生效 */
        disabled?: boolean
    }>(),
    { disabled: false }
)
/** 受控 open：禁用时立即关闭，触摸按住临时打开（不依赖 reka 内部状态，避免空槽残留） */
const open = ref(false)
const triggerRef = ref<InstanceType<typeof TooltipTrigger> | null>(null)

/**
 * 取触发器根元素（as-child 下由 TooltipTrigger 转发）。
 * @returns 触发器 DOM；未挂载时为 null
 */
function getTriggerElement(): HTMLElement | null {
    const instance = triggerRef.value as unknown as { $el?: unknown } | null
    const element = instance?.$el
    return element instanceof HTMLElement ? element : null
}

/**
 * 复位触发器悬停态：Reka 的 `hasPointerMoveOpened` 只在 pointerleave 时清零，
 * disabled 期间监听被移除，指针原地停留后重新启用会卡在「已移入」而无法再次打开。
 * @returns 无
 */
function resetTriggerHover(): void {
    getTriggerElement()?.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }))
}

watch(
    () => props.disabled,
    async disabled => {
        if (disabled) {
            open.value = false
            return
        }
        await nextTick()
        // 同一 tick 内可能已被重新禁用（null → 有 → null），此时不要再复位 / 补开
        if (props.disabled) return
        resetTriggerHover()
        // 键盘焦点在禁用期间一直停在触发器上时不会有新的 focus 事件，补开一次预览
        if (!getTriggerElement()?.contains(document.activeElement)) return
        // 复位派发的 pointerleave 会被 Reka 排队成一次关闭（onOpenChange(false)），
        // 同一 tick 内先打开会被它覆盖；等这次关闭落地后再补开
        await nextTick()
        if (!props.disabled && getTriggerElement()?.contains(document.activeElement)) open.value = true
    }
)
/** 触摸按住打开；禁用时不生效 */
function handleTouchStart(): void {
    if (!props.disabled) open.value = true
}
/** 主动关闭（如触发元素打开弹窗）：键盘 Enter 不会像真实 click 那样触发 Reka 的关闭 */
function close(): void {
    open.value = false
}
defineExpose({ close })
</script>
<template>
    <TooltipProvider>
        <TooltipRoot :delay-duration="100" :disabled="disabled" :open="open" @update:open="!disabled && (open = $event)">
            <TooltipTrigger ref="triggerRef" as-child @touchstart.passive="handleTouchStart" @touchend.passive="open = false">
                <slot />
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent
                    class="z-10000 max-w-80 rounded-xs border border-base-content/15 bg-base-100/85 px-3 py-2 text-[13px] leading-tight text-base-content shadow-lg backdrop-blur-md select-none will-change-[transform,opacity] data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade"
                    :side-offset="5"
                    :side="side"
                >
                    <div @pointermove.stop>
                        <slot name="tooltip" />
                    </div>
                    <TooltipArrow class="fill-base-100/85" :width="8" />
                </TooltipContent>
            </TooltipPortal>
        </TooltipRoot>
    </TooltipProvider>
</template>
