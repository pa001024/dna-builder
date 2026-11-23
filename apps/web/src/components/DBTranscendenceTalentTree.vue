<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { DnaSeasonTalent } from "@/data/d/dnaseasonprogress.data"
import { getTalentIconUrl, getTalentKindLabelKey } from "@/utils/transcendence-display"
import {
    buildTalentTreeLayout,
    centerTalentTreeOn,
    fitTalentTreeBoundsScale,
    shouldApplyTalentTreeGesture,
    shouldZoomTalentTreeWheel,
    TALENT_TREE_INITIAL_ZOOM,
    TalentTreeClickGate,
    type TalentTreeEdge,
    TalentTreeGesture,
    type TalentTreeNode,
    type TalentTreeViewport,
    talentEdgeOpacity,
    talentNodeOpacity,
    talentTreeCanvasZoom,
    talentTreeContentSize,
    talentTreePanToScroll,
    talentTreeScrollToPan,
    zoomTalentTreeAt,
} from "@/utils/transcendence-talent-tree"

const props = withDefaults(
    defineProps<{
        /** 当前树的全部节点（同一 stageId） */
        talents: DnaSeasonTalent[]
        /** 选中节点 id；0 表示未选中 */
        selectedId?: number
        /** 搜索/类型/等级筛选命中的节点 id；只变暗不改布局 */
        matchSet: Set<number>
        /** 阶段二/三数据未开放时整体置灰 */
        stageLocked?: boolean
        /** 已激活节点 id；`null` 表示资料库浏览口径（全部按已激活渲染） */
        activeIds?: Set<number> | null
    }>(),
    { selectedId: 0, stageLocked: false, activeIds: null }
)

const emit = defineEmits<{
    select: [id: number]
}>()

/** 每一档滚轮/按钮的缩放倍率 */
const ZOOM_STEP = 1.12
/** 节点名称标签宽度（px），以节点中心对称展开 */
const LABEL_WIDTH = 120
/** 连线颜色：两端均已激活 / 其余（未激活） */
const EDGE_ACTIVE_COLOR = "rgba(198, 212, 255, 0.9)"
const EDGE_IDLE_COLOR = "rgba(158, 150, 122, 0.5)"

const { t } = useTranslation()
const { gt } = useGameText()

const containerRef = ref<HTMLElement | null>(null)
const size = reactive({ width: 0, height: 0 })
/** pan 是「世界原点在视口中的屏幕位置」；平移由容器原生滚动承担（pan = 半屏留白 − scroll） */
const viewport = reactive({ scale: TALENT_TREE_INITIAL_ZOOM, panX: 0, panY: 0 })
/** 是否正在拖拽（仅用于光标样式；拖拽结束后立即复位） */
const grabbing = ref(false)
/** 视口动画帧；用户输入或卸载时取消 */
let animationFrame = 0

const layout = computed(() => buildTalentTreeLayout(props.talents))
const matchedCount = computed(() => props.talents.filter(talent => props.matchSet.has(talent.id)).length)
const isFiltering = computed(() => props.matchSet.size !== props.talents.length)

/** 空匹配时提示“无结果”，否则区分筛选变暗与常规操作提示 */
const dimHint = computed(() => {
    if (!matchedCount.value) {
        return t("db-transcendence.talent.no_match")
    }

    return isFiltering.value ? t("db-transcendence.talent.dim_hint") : t("db-transcendence.talent.drag_hint")
})
const rootNode = computed(() => layout.value.nodeMap.get(layout.value.roots[0] ?? -1) ?? layout.value.nodes[0] ?? null)

/** 画布缩放用 CSS zoom：文字/图片按最终字号布局，放大后不会因低分辨率栅格化再拉伸而发虚 */
const canvasStyle = computed(() => ({
    width: `${layout.value.bounds.width}px`,
    height: `${layout.value.bounds.height}px`,
    zoom: talentTreeCanvasZoom(viewport.scale),
}))

/** 可滚动内容：画布按 zoom 布局后的尺寸 + 四周各半个视口，保证任意节点都能滚到视口中心 */
const contentStyle = computed(() => {
    const box = talentTreeContentSize(
        layout.value.bounds.width,
        layout.value.bounds.height,
        viewport.scale,
        size.width / 2,
        size.height / 2
    )

    return { width: `${box.width}px`, height: `${box.height}px` }
})

/** 画布在滚动内容中的原点：半屏留白 */
const originStyle = computed(() => ({ left: `${size.width / 2}px`, top: `${size.height / 2}px` }))

/** 节点卡（UMG 坐标，中心对齐）：尺寸取自节点档位（菱形边长为旋转前方形边长） */
function nodeStyle(node: TalentTreeNode) {
    return {
        left: `${node.x}px`,
        top: `${node.y}px`,
        width: `${node.width}px`,
        height: `${node.height}px`,
        transform: "translate(-50%, -50%)",
    }
}

/** 名称标签宽度（px）；标签在节点按钮内部，点击文字等同点击节点 */
function labelStyle() {
    return { width: `${LABEL_WIDTH}px` }
}

/** 节点是否已激活；资料库浏览口径（activeIds 为 null）视为全部已激活 */
function isNodeActive(talentId: number): boolean {
    return props.activeIds === null ? true : props.activeIds.has(talentId)
}

/** 节点形状：树干/高级节点为菱形，其余为方形 */
function nodeShape(node: TalentTreeNode): "diamond" | "square" {
    return node.tier === "diamond" ? "diamond" : "square"
}

/** 描边宽度：选中 2px、已激活 1.5px、未激活 1px（用 CSS 变量交给 Tailwind 读取，避免工具类排序覆盖） */
function nodeFrameWidth(node: TalentTreeNode): string {
    if (props.selectedId === node.talent.id) {
        return "2px"
    }

    return isNodeActive(node.talent.id) ? "1.5px" : "1px"
}

/** 连线颜色：两端都激活为亮蓝，否则为暗橄榄色 */
function edgeStroke(edge: TalentTreeEdge): string {
    return isNodeActive(edge.from) && isNodeActive(edge.to) ? EDGE_ACTIVE_COLOR : EDGE_IDLE_COLOR
}

/** 连线透明度：两端命中最高，单端命中次之，其余压暗；多父边再淡一档 */
function edgeOpacity(from: number, to: number, multiParent: boolean): number {
    return talentEdgeOpacity(props.matchSet, from, to, multiParent)
}

function nodeOpacity(id: number): number {
    return talentNodeOpacity(props.matchSet, id)
}

/** 把 pan 写回原生滚动位置；滚动条隐藏，用户感知到的就是平移 */
function writeScroll(): void {
    const container = containerRef.value

    if (!container) {
        return
    }

    const next = talentTreePanToScroll(viewport.panX, viewport.panY, size.width / 2, size.height / 2)
    container.scrollLeft = next.scrollLeft
    container.scrollTop = next.scrollTop
}

/** 等画布/内容尺寸随 zoom 更新后再写滚动，避免被旧尺寸夹取 */
function queueScroll(): void {
    void nextTick(writeScroll)
}

/** 原生滚动（触摸滑动、横向滚轮）反向同步 pan */
function onScroll(): void {
    const container = containerRef.value

    if (!container || animationFrame) {
        return
    }

    const next = talentTreeScrollToPan(container.scrollLeft, container.scrollTop, size.width / 2, size.height / 2)
    viewport.panX = next.panX
    viewport.panY = next.panY
}

/** 取消进行中的视口动画 */
function cancelViewportAnimation(): void {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame)
        animationFrame = 0
    }
}

/** 切换视口：缩放与滚动同帧推进，保证缩放锚点不漂移 */
function applyViewport(target: TalentTreeViewport, animate = true): void {
    cancelViewportAnimation()

    if (!animate) {
        viewport.scale = target.scale
        viewport.panX = target.panX
        viewport.panY = target.panY
        queueScroll()
        return
    }

    const from = { scale: viewport.scale, panX: viewport.panX, panY: viewport.panY }
    const start = performance.now()
    const step = (now: number) => {
        const progress = Math.min(1, (now - start) / 300)
        const eased = 1 - (1 - progress) ** 3
        viewport.scale = from.scale + (target.scale - from.scale) * eased
        viewport.panX = from.panX + (target.panX - from.panX) * eased
        viewport.panY = from.panY + (target.panY - from.panY) * eased
        queueScroll()
        animationFrame = progress < 1 ? requestAnimationFrame(step) : 0
    }

    animationFrame = requestAnimationFrame(step)
}

/** 把世界坐标点居中到视口；scale 省略时沿用当前缩放 */
function centerOn(worldX: number, worldY: number, scale = viewport.scale, animate = true): void {
    if (!(size.width > 0) || !(size.height > 0)) {
        return
    }

    applyViewport(centerTalentTreeOn(worldX, worldY, size.width, size.height, scale), animate)
}

/** 回到游戏默认视角：初始缩放并居中根节点 */
function resetView(): void {
    const root = rootNode.value

    if (root) {
        centerOn(root.x, root.y, TALENT_TREE_INITIAL_ZOOM)
    }
}

/** 居中当前：有选中节点时居中该节点，否则回到根节点 */
function centerCurrent(): void {
    const node = (props.selectedId ? layout.value.nodeMap.get(props.selectedId) : null) ?? rootNode.value

    if (node) {
        centerOn(node.x, node.y)
    }
}

/** 显示全部：整棵树装进视口并居中 */
function fitAll(): void {
    const bounds = layout.value.bounds
    const scale = fitTalentTreeBoundsScale(size.width, size.height, bounds.width, bounds.height)
    centerOn(bounds.width / 2, bounds.height / 2, scale)
}

function zoomBy(factor: number): void {
    applyViewport(zoomTalentTreeAt(viewport, viewport.scale * factor, size.width / 2, size.height / 2))
}

/** 指针相对容器的坐标 */
function localPoint(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = containerRef.value?.getBoundingClientRect()

    if (!rect) {
        return { x: 0, y: 0 }
    }

    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

/** 手势状态机：单指平移、双指缩放，并在越过拖拽阈值后才捕获指针 */
const gesture = new TalentTreeGesture()
/** 拖拽结束后只吞掉紧随 pointerup 的那次 click；键盘/辅助技术后续的 click 不受影响 */
const clickGate = new TalentTreeClickGate()
let clickGateTimer = 0

function armClickSuppression(): void {
    clickGate.arm()
    window.clearTimeout(clickGateTimer)
    clickGateTimer = window.setTimeout(() => clickGate.reset(), 0)
}

/** 只有确实捕获过才释放，避免对未捕获的 pointerId 抛 NotFoundError */
function releaseCapture(pointerId: number): void {
    const container = containerRef.value

    if (container?.hasPointerCapture?.(pointerId)) {
        container.releasePointerCapture(pointerId)
    }
}

function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) {
        return
    }

    cancelViewportAnimation()
    window.clearTimeout(clickGateTimer)
    clickGate.reset()
    const point = localPoint(event)
    const update = gesture.down(event.pointerId, point.x, point.y, viewport)

    if (update.capture !== undefined) {
        containerRef.value?.setPointerCapture?.(update.capture)
    }
}

function onPointerMove(event: PointerEvent): void {
    const point = localPoint(event)
    const update = gesture.move(event.pointerId, point.x, point.y, viewport)

    if (update.capture !== undefined) {
        containerRef.value?.setPointerCapture?.(update.capture)
    }

    // 单指触摸交给原生滚动；鼠标拖拽与双指缩放（pointerCount ≥ 2）由手势接管
    if (update.viewport && shouldApplyTalentTreeGesture(event.pointerType, gesture.pointerCount)) {
        viewport.scale = update.viewport.scale
        viewport.panX = update.viewport.panX
        viewport.panY = update.viewport.panY
        queueScroll()
    }

    grabbing.value = gesture.dragging
}

function releasePointer(event: PointerEvent): void {
    if (gesture.dragging) {
        armClickSuppression()
    }

    const update = gesture.up(event.pointerId, viewport)
    releaseCapture(update.release ?? event.pointerId)
    grabbing.value = false
}

function onWheel(event: WheelEvent): void {
    // 横向滚轮 / 零 delta 不缩放，交给容器原生滚动（触控板横滑）
    if (!shouldZoomTalentTreeWheel(event.deltaX, event.deltaY)) {
        return
    }

    event.preventDefault()
    const point = localPoint(event)
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    applyViewport(zoomTalentTreeAt(viewport, viewport.scale * factor, point.x, point.y), false)
}

/** 节点点击：拖拽后紧跟的 click 被吞掉；键鼠轻点与键盘 Enter 正常选中 */
function onNodeClick(id: number): void {
    if (clickGate.consume()) {
        return
    }

    emit("select", id)
}

function onKeydown(event: KeyboardEvent): void {
    const step = 80
    const panDeltas: Record<string, [number, number]> = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
    }
    const delta = panDeltas[event.key]

    if (delta) {
        cancelViewportAnimation()
        viewport.panX += delta[0]
        viewport.panY += delta[1]
        queueScroll()
        event.preventDefault()
        return
    }

    switch (event.key) {
        case "+":
        case "=":
            zoomBy(ZOOM_STEP)
            break
        case "-":
            zoomBy(1 / ZOOM_STEP)
            break
        case "0":
            resetView()
            break
        default:
            return
    }

    event.preventDefault()
}

/** 尺寸变化时按差值平移，保持画布中心点不动（详情面板展开/收起会改变可用宽度） */
let observer: ResizeObserver | null = null
let initialized = false

function handleResize(entries: ResizeObserverEntry[]): void {
    const entry = entries[entries.length - 1]

    if (!entry) {
        return
    }

    const previousWidth = size.width
    const previousHeight = size.height
    size.width = entry.contentRect.width
    size.height = entry.contentRect.height

    if (!initialized && size.width > 0) {
        initialized = true
        const target = (props.selectedId ? layout.value.nodeMap.get(props.selectedId) : null) ?? rootNode.value

        if (target) {
            centerOn(target.x, target.y, TALENT_TREE_INITIAL_ZOOM, false)
        }

        return
    }

    if (previousWidth > 0) {
        viewport.panX += (size.width - previousWidth) / 2
        viewport.panY += (size.height - previousHeight) / 2
        queueScroll()
    }
}

/** 切树后回到默认视角 */
watch(
    () => props.talents,
    () => {
        if (initialized) {
            resetView()
        }
    }
)

/** 选中变化（点击或深链跳转）时把节点平滑居中 */
watch(
    () => props.selectedId,
    id => {
        const node = id ? layout.value.nodeMap.get(id) : null

        if (node) {
            centerOn(node.x, node.y)
        }
    }
)

onMounted(() => {
    if (typeof ResizeObserver !== "undefined" && containerRef.value) {
        observer = new ResizeObserver(handleResize)
        observer.observe(containerRef.value)
    }
})

onBeforeUnmount(() => {
    cancelViewportAnimation()
    window.clearTimeout(clickGateTimer)
    observer?.disconnect()
    observer = null
})
</script>

<template>
    <div class="relative min-h-0 w-full flex-1 overflow-hidden">
        <div
            ref="containerRef"
            class="talent-tree-scroll absolute inset-0 select-none overflow-auto bg-base-200/25 outline-none"
            :class="grabbing ? 'cursor-grabbing' : 'cursor-grab'"
            tabindex="0"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="releasePointer"
            @pointercancel="releasePointer"
            @scroll.passive="onScroll"
            @wheel="onWheel"
            @keydown="onKeydown"
            @dragstart.prevent
        >
            <!-- 原生滚动内容：四周各留半个视口，任意节点都能滚到视口中心 -->
            <div class="relative" :style="contentStyle">
                <div class="absolute" :style="originStyle">
                    <!-- 画布层：与游戏一致的 UMG 坐标（y 向下），缩放用 CSS zoom 保证文字清晰 -->
                    <div class="origin-top-left" :style="canvasStyle">
                        <svg
                            class="pointer-events-none absolute top-0 left-0 overflow-visible"
                            :width="layout.bounds.width"
                            :height="layout.bounds.height"
                            :viewBox="`0 0 ${layout.bounds.width} ${layout.bounds.height}`"
                            aria-hidden="true"
                        >
                            <line
                                v-for="edge in layout.edges"
                                :key="`${edge.from}:${edge.to}`"
                                :x1="edge.x1"
                                :y1="edge.y1"
                                :x2="edge.x2"
                                :y2="edge.y2"
                                :stroke="edgeStroke(edge)"
                                :stroke-opacity="edgeOpacity(edge.from, edge.to, edge.multiParent)"
                                :stroke-width="edge.multiParent ? 1.3 : 1.8"
                                stroke-linecap="round"
                            />
                        </svg>

                        <template v-for="node in layout.nodes" :key="node.talent.id">
                            <button
                                type="button"
                                class="group absolute overflow-visible border-0 bg-transparent p-0 text-center focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[rgba(180,200,255,0.85)]"
                                :class="[stageLocked ? 'grayscale' : '', selectedId === node.talent.id ? 'z-10' : 'hover:z-20']"
                                :style="{ ...nodeStyle(node), opacity: nodeOpacity(node.talent.id), '--tn-frame-w': nodeFrameWidth(node) }"
                                :data-talent-id="node.talent.id"
                                :data-shape="nodeShape(node)"
                                :data-tier="node.tier"
                                :data-state="isNodeActive(node.talent.id) ? 'active' : 'inactive'"
                                :data-selected="selectedId === node.talent.id ? 'true' : undefined"
                                :title="`${gt(node.talent.name)} · ${t(getTalentKindLabelKey(node.talent.kind))} · ${t('db-transcendence.talent.max_lv', { level: node.talent.maxLevel })}`"
                                @click="onNodeClick(node.talent.id)"
                            >
                                <span
                                    class="talent-node__shape pointer-events-none absolute inset-0 block before:absolute before:inset-0 before:[border-width:var(--tn-frame-w)] before:border-[#dfe4ff] before:shadow-[0_0_5px_rgba(122,152,255,0.55)] before:transition-[border-color,box-shadow] before:duration-200 after:absolute after:inset-[10%] after:border after:border-[rgba(240,242,255,0.6)] after:bg-[#6076ca] after:shadow-[inset_0_0_10px_2px_rgba(168,182,255,0.55),inset_0_-5px_9px_rgba(196,176,240,0.42)] group-data-[shape=diamond]:rotate-45 group-data-[shape=diamond]:after:inset-[21%] group-data-[state=inactive]:before:border-[rgba(150,143,116,0.45)] group-data-[state=inactive]:before:shadow-none group-data-[state=inactive]:after:border-[rgba(158,150,120,0.3)] group-data-[state=inactive]:after:bg-[#36332c] group-data-[state=inactive]:after:shadow-[inset_0_0_8px_1px_rgba(120,114,92,0.3)] group-hover:before:border-white group-data-[selected=true]:before:border-white group-data-[selected=true]:before:shadow-[0_0_0_1px_rgba(255,255,255,0.45),0_0_12px_rgba(140,170,255,0.9)]"
                                    aria-hidden="true"
                                />
                                <span
                                    class="talent-node__icon absolute top-1/2 left-1/2 block size-[52%] -translate-x-1/2 -translate-y-1/2 overflow-hidden [&_img]:scale-[1.8] group-data-[shape=diamond]:size-[42%] group-data-[state=inactive]:opacity-50 group-data-[state=inactive]:brightness-[0.85] group-data-[state=inactive]:grayscale"
                                >
                                    <ImageFallback
                                        :src="getTalentIconUrl(node.talent.icon)"
                                        :alt="gt(node.talent.name)"
                                        draggable="false"
                                        class="talent-node__figure block size-full object-contain"
                                    >
                                        <span class="talent-node__fallback flex size-full items-center justify-center text-[11px] text-[rgba(226,232,248,0.7)]">
                                            {{ gt(node.talent.name).slice(0, 1) }}
                                        </span>
                                    </ImageFallback>
                                </span>
                                <span
                                    class="talent-node__name absolute top-full left-1/2 mt-0.5 line-clamp-2 -translate-x-1/2 text-[10px] leading-[1.15] text-[rgba(226,232,248,0.78)] group-data-[shape=diamond]:mt-6.5 group-data-[state=inactive]:text-[rgba(214,218,232,0.48)] group-hover:text-[rgba(235,240,255,0.9)] group-focus-visible:text-[rgba(235,240,255,0.9)]"
                                    :style="labelStyle()"
                                >
                                    {{ gt(node.talent.name) }}
                                </span>
                            </button>
                        </template>
                    </div>
                </div>
            </div>
        </div>

        <!-- 工具条：缩放 / 居中当前 / 显示全部 -->
        <div class="absolute top-3 right-3 z-20 flex flex-col gap-1.5">
            <button type="button" class="btn btn-circle btn-xs" :title="$t('db-transcendence.talent.zoom_in')" @click="zoomBy(ZOOM_STEP)">
                <Icon icon="ri:add-line" class="size-3.5" />
            </button>
            <button
                type="button"
                class="btn btn-circle btn-xs"
                :title="$t('db-transcendence.talent.zoom_out')"
                @click="zoomBy(1 / ZOOM_STEP)"
            >
                <Icon icon="ri:subtract-line" class="size-3.5" />
            </button>
            <button
                type="button"
                class="btn btn-circle btn-xs"
                :title="$t('db-transcendence.talent.center_current')"
                @click="centerCurrent"
            >
                <Icon icon="ri:crosshair-line" class="size-3.5" />
            </button>
            <button type="button" class="btn btn-circle btn-xs" :title="$t('db-transcendence.talent.show_all')" @click="fitAll">
                <Icon icon="ri:fullscreen-line" class="size-3.5" />
            </button>
        </div>

        <!-- 匹配数 + 操作提示 -->
        <div class="pointer-events-none absolute top-3 left-3 z-20 flex flex-col gap-1">
            <span class="badge badge-sm border-base-content/15 bg-base-100/80 font-mono text-[10px]">
                {{ $t("db-transcendence.talent.match_count", { count: matchedCount }) }}
            </span>
            <span class="text-[10px] text-base-content/45">{{ dimHint }}</span>
        </div>
    </div>
</template>

<style scoped>
.talent-tree-scroll {
    touch-action: pan-x pan-y;
    overscroll-behavior: contain;
    overflow-anchor: none;
    scrollbar-width: none;
}

.talent-tree-scroll::-webkit-scrollbar {
    display: none;
}

:deep(img) {
    -webkit-user-drag: none;
}
</style>
