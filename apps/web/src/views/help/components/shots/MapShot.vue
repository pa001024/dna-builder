<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import { L, type MapShot } from "../../content/types"
import { clamp01, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: MapShot; time: number; duration: number }>()
const tr = useHelpText()

const pathOpacity = computed(() => clamp01(progressAt(props.time, props.shot.showPathAt ?? 1.2, 0.8)))
const hoverVisible = computed(() => !!props.shot.hover && props.time > 0.9)
</script>

<template>
    <div class="help-map-shot">
        <div class="help-map-canvas">
            <div class="help-map-grid" />

            <div class="help-map-layer" style="left: 8%; top: 18%; width: 44%; height: 38%; transform: rotate(-8deg)" />
            <div class="help-map-layer" style="left: 44%; top: 30%; width: 42%; height: 44%; transform: rotate(12deg); opacity: 0.7" />
            <div class="help-map-layer" style="left: 22%; top: 54%; width: 34%; height: 28%; transform: rotate(4deg); opacity: 0.55" />

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 h-full w-full">
                <g v-if="shot.path?.length" :style="{ opacity: pathOpacity }">
                    <line
                        v-for="(segment, index) in shot.path"
                        :key="index"
                        :x1="segment.x1"
                        :y1="segment.y1"
                        :x2="segment.x2"
                        :y2="segment.y2"
                        fill="none"
                        :stroke="segment.kind === 'teleport' ? '#67e8f9' : '#fde047'"
                        stroke-width="0.7"
                        :stroke-dasharray="segment.kind === 'teleport' ? '2 1.4' : '0.9 0.8'"
                        vector-effect="non-scaling-stroke"
                        stroke-linecap="square"
                    />
                </g>
            </svg>

            <div
                v-for="(point, index) in shot.points"
                :key="index"
                class="help-map-point"
                :class="`help-map-point--${point.kind}`"
                :style="{ left: `${point.x}%`, top: `${point.y}%`, ...enterStyle(time, point.at ?? 0.45 + index * 0.16, 0.4, 8) }"
                :title="point.label ? tr(point.label) : ''"
            />

            <div v-if="hoverVisible" class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2" :style="{ left: `${shot.hover![0]}%`, top: `${shot.hover![1]}%` }">
                <div class="size-7 rounded-full border border-white/70" />
                <div class="absolute left-3 top-3 h-px w-16 bg-white/40" />
                <div class="absolute left-3 top-3 h-16 w-px bg-white/40" />
                <div class="absolute left-20 top-2 whitespace-nowrap border border-white/15 bg-black/70 px-2 py-1 font-orbitron text-[9px] text-white/70">
                    {{ shot.coordinate ?? "X 1240 · Y -860" }}
                </div>
            </div>

            <div class="absolute left-4 top-3">
                <div class="help-kicker">WORLD MAP</div>
                <div class="mt-1 text-xl font-bold">{{ tr(shot.region) }}</div>
            </div>

            <div class="absolute bottom-3 left-4 flex items-center gap-2">
                <span class="help-chip h-5! px-2! text-[9px]!">{{ tr(L("滚轮缩放", "滾輪縮放", "Wheel zoom", "ホイール拡大", "휠 확대", "Zoom molette")) }}</span>
                <span class="help-chip h-5! px-2! text-[9px]!">{{ tr(L("拖拽平移", "拖曳平移", "Drag to pan", "ドラッグで移動", "드래그 이동", "Glisser pour déplacer")) }}</span>
            </div>
        </div>

        <div class="help-map-panel">
            <div class="help-build-panel__title">{{ tr(L("图层", "圖層", "LAYERS", "レイヤー", "레이어", "CALQUES")) }}</div>
            <div class="mt-3 space-y-1.5">
                <div v-for="(layer, index) in shot.layers" :key="index" class="flex items-center justify-between border border-white/8 bg-white/3 px-2.5 py-2 text-[11px]">
                    <span class="text-white/60">{{ tr(layer.label) }}</span>
                    <span class="help-toggle" :class="{ 'help-toggle--on': layer.on !== false }"><span class="help-toggle__knob" /></span>
                </div>
            </div>

            <div class="mt-5 help-build-panel__title">{{ tr(L("筛选", "篩選", "FILTERS", "フィルター", "필터", "FILTRES")) }}</div>
            <div class="mt-3 flex flex-wrap gap-1.5">
                <span class="help-chip help-chip--accent">{{ tr(L("魔灵", "魔靈", "Pets", "魔霊", "마령", "Familiers")) }}</span>
                <span class="help-chip">{{ tr(L("传送点", "傳送點", "Teleport", "転送点", "전송점", "Téléport")) }}</span>
                <span class="help-chip">{{ tr(L("资源", "資源", "Resources", "資源", "자원", "Ressources")) }}</span>
                <span class="help-chip">{{ tr(L("潘神", "潘神", "Pan", "パン", "판", "Pan")) }}</span>
            </div>

            <div class="mt-5 border border-white/10 bg-white/3 p-3">
                <div class="flex items-center justify-between text-[11px]">
                    <span class="text-white/60">{{ tr(L("最短图遍历", "最短路徑遍歷", "Shortest traversal", "最短巡回", "최단 경로", "Parcours optimal")) }}</span>
                    <span class="help-toggle help-toggle--on"><span class="help-toggle__knob" /></span>
                </div>
                <div class="mt-3 space-y-1.5 text-[10px] text-white/40">
                    <div class="flex items-center gap-2"><span class="h-0.5 w-5 bg-yellow-300" />{{ tr(L("步行", "步行", "Walk", "徒歩", "도보", "Marche")) }}</div>
                    <div class="flex items-center gap-2"><span class="h-0.5 w-5 border-t border-dashed border-cyan-300" />{{ tr(L("传送", "傳送", "Teleport", "転送", "전송", "Téléportation")) }}</div>
                    <div class="flex items-center gap-2"><span class="h-0.5 w-5 bg-red-400" />{{ tr(L("不可达", "不可達", "Unreachable", "到達不可", "도달 불가", "Inaccessible")) }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
