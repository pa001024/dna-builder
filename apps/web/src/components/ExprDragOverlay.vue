<script setup lang="ts">
import { useExprDrag } from "@/composables/useExprDrag"

/**
 * 表达式字段拖拽反馈（共享）：跟随指针的浮动 ghost + 底部「已抓起」提示条。
 * Teleport 到 body，避免被页面滚动容器裁剪；只读拖拽状态，放置仍由各页面的目标输入区注册。
 */

const { floatingPayload, ghostPosition, dragging, clearExprDrag } = useExprDrag()
</script>

<template>
    <Teleport to="body">
        <div
            v-if="floatingPayload"
            data-expr-float
            class="pointer-events-none fixed z-10000 rounded-xs border border-primary/50 bg-base-100/95 px-2 py-1 text-xs font-semibold whitespace-nowrap text-primary shadow-lg"
            :style="{ left: `${ghostPosition.x + 14}px`, top: `${ghostPosition.y + 16}px` }"
        >
            {{ floatingPayload.expr }}
        </div>
        <div
            v-if="floatingPayload && !dragging"
            data-expr-armed-hint
            class="fixed bottom-4 left-1/2 z-10000 flex -translate-x-1/2 items-center gap-2 rounded-xs border border-primary/40 bg-base-100/95 px-3 py-1.5 text-xs text-base-content shadow-lg"
        >
            <Icon icon="ri:drag-move-line" class="size-3.5 shrink-0 text-primary" />
            <span>{{ $t("char-build.drag_field_armed", { name: floatingPayload.label }) }}</span>
            <button type="button" class="cursor-pointer font-semibold text-primary hover:underline" @click="clearExprDrag">
                {{ $t("取消") }}
            </button>
        </div>
    </Teleport>
</template>
