<script setup lang="ts">
import { computed, useId } from "vue"
import { createQrCode, type QrEccLevel } from "@/utils/qr-code"
import { buildQrCodeShapes, type QrShapeOptions } from "@/utils/qr-code-render"

/**
 * 美化二维码：圆角消融的数据模块 + 定位图形圆角方环，前景用「渐变遮罩」着色。
 *
 * 渐变不是直接填在形状上，而是把模块轮廓当作遮罩（mask）去裁一块渐变矩形，
 * 因此整张二维码共用一条连续的斜向线性渐变，颜色跨模块流动。
 * 默认配色取自应用图标（深海军蓝 → 天蓝）。
 *
 * 注意：配色必须保持与底色的对比度。浅色（如纯亮黄 #ffd23f）在白色底上对比不足，
 * 会让解码器的二值化失败，默认配色已按「能通过独立解码器」的标准压暗过。
 */
const props = withDefaults(
    defineProps<{
        /** 二维码内容 */
        value: string
        /** 渲染尺寸（px，正方形） */
        size?: number
        /** 纠错等级 */
        ecc?: QrEccLevel
        /** 渐变配色：左上 → 右下（默认取应用图标的蓝调） */
        colors?: [string, string, string, string]
        /** 留白底色 */
        background?: string
        /** 右侧竖排说明文字（留空则不渲染） */
        caption?: string
        /** 轮廓样式微调 */
        shapes?: QrShapeOptions
    }>(),
    {
        size: 208,
        ecc: "M",
        colors: () => ["#0d3b66", "#1c6ea4", "#3a9ad9", "#63bfe8"],
        background: "#ffffff",
        caption: "",
        shapes: () => ({}),
    }
)

/** 留白区宽度（模块单位） */
const QUIET_ZONE = 3

const uid = useId()
const qr = computed(() => createQrCode(props.value, { ecc: props.ecc }))
const shapes = computed(() => buildQrCodeShapes(qr.value, props.shapes))
const extent = computed(() => qr.value.size + QUIET_ZONE * 2)
const viewBox = computed(() => `${-QUIET_ZONE} ${-QUIET_ZONE} ${extent.value} ${extent.value}`)
const fillId = `${uid}-fill`
const modulesId = `${uid}-modules`
const ringsId = `${uid}-rings`
const maskId = `${uid}-mask`
</script>

<template>
    <div class="inline-flex items-center gap-2">
        <svg
            class="block shrink-0"
            :width="size"
            :height="size"
            :viewBox="viewBox"
            role="img"
            :aria-label="caption || value"
            shape-rendering="geometricPrecision"
        >
            <defs>
                <!-- 斜向线性渐变：左上 → 右下 -->
                <linearGradient :id="fillId" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" :stop-color="colors[0]" />
                    <stop offset="33%" :stop-color="colors[1]" />
                    <stop offset="67%" :stop-color="colors[2]" />
                    <stop offset="100%" :stop-color="colors[3]" />
                </linearGradient>
                <path :id="modulesId" :d="shapes.modules" />
                <path :id="ringsId" :d="shapes.rings" fill-rule="evenodd" />
                <mask :id="maskId" maskContentUnits="userSpaceOnUse">
                    <use :href="`#${modulesId}`" fill="#fff" />
                    <use :href="`#${ringsId}`" fill="#fff" />
                </mask>
            </defs>
            <rect :x="-QUIET_ZONE" :y="-QUIET_ZONE" :width="extent" :height="extent" rx="1.6" :fill="background" />
            <rect
                :x="-QUIET_ZONE"
                :y="-QUIET_ZONE"
                :width="extent"
                :height="extent"
                :fill="`url(#${fillId})`"
                :mask="`url(#${maskId})`"
            />
        </svg>
        <span
            v-if="caption"
            class="text-[11px] font-semibold tracking-[0.3em] text-primary [writing-mode:vertical-rl] select-none"
        >
            {{ caption }}
        </span>
    </div>
</template>
