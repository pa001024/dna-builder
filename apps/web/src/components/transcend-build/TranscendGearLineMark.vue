<script setup lang="ts">
import { computed } from "vue"
import { type GearAffixLine, getGearLineMarkState } from "@/utils/transcend-gear/display"
import { TRANSCEND_LINE_MARKS, TRANSCEND_MARK_BORDER_CSS } from "@/utils/transcendence-icon"
import TranscendGearMark from "./TranscendGearMark.vue"

/**
 * 词条行行首标记（官方 tips 标记槽内的 PointStyle，槽 1.6em 随宿主字号缩放）：
 * - `PointStyle=1`（Forge）：四层独立显隐、同一锚点叠放，z 从下到上为
 *   太古 1.8667em 红色多刺星 → 最终精锻 1.0667em 金星 → 淬炼 0.4667em 橙红点 → 附魔 0.4667em 紫点；
 *   可同时出现，不并排、不取最高级。
 * - `PointStyle=2`：专属 1.3333em 橙星；`PointStyle=0`：0.2667em 灰点；`base` 无槽。
 * 设计值 56/32/40/14/8 是 4K 设计尺寸，上游运行时减半为 28/16/20/7/4；太古 28 > 24 设计槽，
 * 按上游 `SizeBox_Point` 不裁剪、居中溢出。
 * 彩色贴图用 `<img>` 原色保留红色多刺星 / 金星 / 橙星；灰 / 橙 / 紫点为纯色块，淬炼 / 附魔描边 `max(1px, 0.0667em)`。
 */

const props = withDefaults(
    defineProps<{
        line: GearAffixLine
        /** 预览模式（tooltip 内嵌）：抑制原生 title，保留 aria / data 语义 */
        preview?: boolean
    }>(),
    { preview: false }
)

/** 各层语义标签：点层挂在层自身，图片层由 inner `TranscendGearMark` 输出 */
const LABEL_KEYS = {
    random: "transcend-build.gear_source_random",
    tempering: "transcend-build.gear_source_tempering",
    enchant: "transcend-build.gear_source_enchant",
    ancient: "transcend-build.gear_ancient",
    finalMasterwork: "transcend-build.gear_mark_final_masterwork",
    unique: "transcend-build.gear_mark_unique",
} as const

type LayerKey = keyof typeof LABEL_KEYS

interface MarkLayer {
    key: LayerKey
    z: string
    dot: boolean
    style: Record<string, string>
    labelKey: string
}

const state = computed(() => getGearLineMarkState(props.line))

/**
 * 生成一层标记的几何 / 颜色样式：尺寸统一按 em（随宿主字号缩放），居中于 1.6em 槽，点层叠加黑描边。
 * @param key 标记键
 * @returns 内联样式
 */
function layerStyle(key: LayerKey): Record<string, string> {
    const spec = TRANSCEND_LINE_MARKS[key]
    const anchor = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
    const size = `${spec.em}em`
    if (key === "ancient" || key === "finalMasterwork" || key === "unique") {
        return { ...anchor, width: size, height: size, zIndex: String(spec.z) }
    }
    return {
        ...anchor,
        width: size,
        height: size,
        backgroundColor: spec.color ?? "transparent",
        opacity: String(spec.opacity ?? 1),
        borderColor: "#000",
        borderWidth: spec.border ? TRANSCEND_MARK_BORDER_CSS : "0",
        borderStyle: spec.border ? "solid" : "none",
        zIndex: String(spec.z),
    }
}

/**
 * 构造一层标记。
 * @param key 标记键
 * @returns 渲染层数据
 */
function makeLayer(key: LayerKey): MarkLayer {
    const dot = key === "random" || key === "tempering" || key === "enchant"
    const labelKey = key === "random" && state.value.unknown ? "transcend-build.gear_source_unknown" : LABEL_KEYS[key]
    return { key, z: String(TRANSCEND_LINE_MARKS[key].z), dot, style: layerStyle(key), labelKey }
}

/** 当前行要渲染的层：Forge 四层按 z 顺序全出，其余单层 */
const layers = computed<MarkLayer[]>(() => {
    const current = state.value
    if (current.base) return []
    if (current.forge) {
        const keys: LayerKey[] = []
        if (current.ancient) keys.push("ancient")
        if (current.finalMasterwork) keys.push("finalMasterwork")
        if (current.tempering) keys.push("tempering")
        if (current.enchant) keys.push("enchant")
        return keys.map(makeLayer)
    }
    return [makeLayer(current.unique ? "unique" : "random")]
})

/** 上游 PointStyle（none / 0 / 1 / 2），供测试与调试读取 */
const pointStyle = computed(() => state.value.pointStyle)
</script>

<template>
    <span
        v-if="layers.length"
        class="pointer-events-none relative block size-full"
        data-gear-line-mark-root
        :data-gear-line-point-style="pointStyle"
        :data-mark-source-unknown="state.unknown ? '' : undefined"
    >
        <span
            v-for="layer in layers"
            :key="layer.key"
            class="absolute flex items-center justify-center"
            :class="layer.dot ? 'rounded-full' : ''"
            :data-gear-line-mark="layer.key"
            :data-forge-layer="layer.key"
            :data-forge-z="layer.z"
            :data-mark-source-unknown="state.unknown ? '' : undefined"
            :style="layer.style"
            :role="layer.dot || state.unknown ? 'img' : undefined"
            :aria-label="layer.dot || state.unknown ? $t(layer.dot ? layer.labelKey : 'transcend-build.gear_source_unknown') : undefined"
            :title="(layer.dot || state.unknown) && !preview ? $t(layer.dot ? layer.labelKey : 'transcend-build.gear_source_unknown') : undefined"
        >
            <TranscendGearMark v-if="layer.key === 'ancient'" kind="ancient" variant="line" :suppress-title="preview" />
            <TranscendGearMark v-else-if="layer.key === 'finalMasterwork'" kind="finalMasterwork" variant="line" :suppress-title="preview" />
            <TranscendGearMark v-else-if="layer.key === 'unique'" kind="unique" variant="line" :suppress-title="preview" />
        </span>
    </span>
</template>
