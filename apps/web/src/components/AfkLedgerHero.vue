<script setup lang="ts">
import { ref } from "vue"
import { useAfkAnimation } from "@/composables/useAfkAnimation"
import { env } from "@/env"

/**
 * 狩月账本的页头动画。
 *
 * 素材直接读本机游戏目录里的官方浮窗资源（`AFKSupport/Res/Runtime`），
 * 不做二次打包：雪碧图、背景层与帧率都和「小小狩月人」一致。
 * 角色由管道下发的 `character` 事件切换，只驱动动画、不落库。
 */
const props = defineProps<{
    /** 页头标题 */
    title: string
    /** 副标题 */
    subtitle: string
    /** 页头英文小标 */
    kicker?: string
}>()

/** 页头逻辑画布：官方 366×118 横向铺三屏。 */
const CANVAS_WIDTH = 1098
const CANVAS_HEIGHT = 118

const canvas = ref<HTMLCanvasElement | null>(null)
const { manifest, error } = useAfkAnimation(canvas, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    entitySize: CANVAS_HEIGHT,
    idleOffsetRatio: 0.22,
})
</script>

<template>
    <div class="relative overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60">
        <!-- 画布铺满宽度；场景内容由引擎按固定宽度居中，不随容器等比放大 -->
        <canvas ref="canvas" class="block w-full" />
        <!-- 没有游戏目录时的底纹：保留页头体积，不出现一块纯黑 -->
        <div
            v-if="!manifest"
            class="absolute inset-0 bg-linear-to-r from-base-content/5 via-base-content/3 to-base-content/5"
        />
        <!-- 左侧渐隐遮罩：压住背景细节，标题才读得清 -->
        <div
            class="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-base-100/95 via-base-100/70 to-transparent"
        />
        <!-- 标题压在动画上，左侧留出可读区 -->
        <div class="pointer-events-none absolute inset-0 flex flex-col justify-center gap-0.5 px-4">
            <span class="text-[10px] font-semibold tracking-[0.3em] text-base-content/50 uppercase">{{ props.kicker }}</span>
            <span class="text-[17px] font-semibold text-base-content drop-shadow-sm">{{ props.title }}</span>
            <span class="text-[11px] text-base-content/60">{{ props.subtitle }}</span>
        </div>
        <span
            v-if="!env.isApp"
            class="absolute right-2 bottom-2 rounded-xs bg-base-content/60 px-1.5 py-0.5 text-[10px] text-base-100"
        >
            {{ $t("afk-support.app_only") }}
        </span>
        <span v-else-if="error" class="absolute right-2 bottom-2 max-w-2/3 truncate text-[10px] text-warning">
            {{ $t("afk-ledger.hero_missing") }}
        </span>
    </div>
</template>
