import type { DnaSeasonTalent } from "@/data/d/dnaseasonprogress.data"
import { matchPinyin } from "@/utils/pinyin-utils"

/** 上游 `IconLoc` 是 UMG 画布坐标，且 UMG 画布 y 轴向下；如需翻转只改这一处。 */
export const TALENT_TREE_Y_SIGN = 1

/** 上游 `DNASeasonTopLevelLayout.Measure` 的画布边距（四周各 100）。 */
export const TALENT_TREE_MARGIN = 100

/**
 * 节点视觉档位（对齐游戏实机 §56）：
 * - `diamond`：主干（阶段起点/终点）与高级节点，旋转 45° 的方形（外框对角线 = 尺寸 × √2）；
 * - `large` / `medium` / `small`：常规方形节点三档，按类型与连接度区分。
 */
export type TalentNodeTier = "diamond" | "large" | "medium" | "small"

/** 菱形节点边长（旋转前的方形边长；视觉外框为其对角线）。 */
export const TALENT_NODE_SIZE_DIAMOND = 110
export const TALENT_NODE_SIZE_LARGE = 86
export const TALENT_NODE_SIZE_MEDIUM = 72
export const TALENT_NODE_SIZE_SMALL = 60

/** 档位 → 边长 */
export const TALENT_NODE_TIER_SIZE: Record<TalentNodeTier, number> = {
    diamond: TALENT_NODE_SIZE_DIAMOND,
    large: TALENT_NODE_SIZE_LARGE,
    medium: TALENT_NODE_SIZE_MEDIUM,
    small: TALENT_NODE_SIZE_SMALL,
}

/**
 * 推导节点档位：高级节点与树干端点（无父 / 无子）为菱形；
 * 其余方形中，Middle 类型为大档，多父/多子的汇合点为中档，普通节点为小档。
 * @param talent 节点原始数据
 * @param parentCount 父节点数（仅本树内）
 * @param childCount 子节点数（仅本树内）
 * @returns 视觉档位
 */
export function resolveTalentNodeTier(talent: Pick<DnaSeasonTalent, "kind">, parentCount: number, childCount: number): TalentNodeTier {
    if (talent.kind === 4 || parentCount === 0 || childCount === 0) {
        return "diamond"
    }

    if (talent.kind === 3) {
        return "large"
    }

    return parentCount > 1 || childCount > 1 ? "medium" : "small"
}

export const TALENT_TREE_INITIAL_ZOOM = 0.75
/** 最低缩放：最宽树（stage 1，9080px）在 320px 视口需 (320−48)/9080≈0.02996，取 0.028 留余量。 */
export const TALENT_TREE_MIN_ZOOM = 0.028
export const TALENT_TREE_MAX_ZOOM = 4

/** 平移/缩放视口：屏幕坐标 = 世界坐标 × scale + pan。 */
export interface TalentTreeViewport {
    scale: number
    panX: number
    panY: number
}

export interface TalentTreeBounds {
    minX: number
    minY: number
    maxX: number
    maxY: number
    /** 含两侧 100px 边距的画布宽高 */
    width: number
    height: number
    /** 原始坐标 → 画布坐标的偏移 */
    offsetX: number
    offsetY: number
}

export interface TalentTreeNode {
    talent: DnaSeasonTalent
    /** 原始上游坐标 */
    rawX: number
    rawY: number
    /** 画布中心坐标（含边距偏移） */
    x: number
    y: number
    width: number
    height: number
    /** 形状与尺寸档位（菱形 / 方形三档） */
    tier: TalentNodeTier
    depth: number
    parentIds: number[]
}

export interface TalentTreeEdge {
    from: number
    to: number
    /** 父节点中心 */
    x1: number
    y1: number
    /** 子节点中心 */
    x2: number
    y2: number
    /** 子节点有多个父节点时降低连线不透明度 */
    multiParent: boolean
}

export interface TalentTreeLayout {
    nodes: TalentTreeNode[]
    nodeMap: Map<number, TalentTreeNode>
    edges: TalentTreeEdge[]
    bounds: TalentTreeBounds
    roots: number[]
    depth: Map<number, number>
    /** 异常数据里的环（正常数据为空）；用于测试与兜底，不影响渲染 */
    cycles: number[][]
}

export interface TalentTreeFilter {
    kind?: number
    maxLevel?: number
    keyword?: string
}

export type TalentTextResolver = (text: string) => string

/**
 * 把一棵树的节点按上游 `position` 原样铺到画布上，并生成全部父子边。
 *
 * 坐标来自 `TalentList.IconLoc`（UMG 画布，y 向下）。节点视觉档位由
 * `resolveTalentNodeTier` 推导（菱形 + 方形三档），连线一律从父节点中心直连子节点中心。
 * 边用 `unlockChildren` 与 `parentIds` 双向补齐、去重，保证多父节点的全部入边都保留；
 * 异常引用与环只记录，不抛错。
 * @param talents 同一棵树（同一 stageId）的节点
 * @returns 节点、边、画布边界、深度与根节点
 */
export function buildTalentTreeLayout(talents: readonly DnaSeasonTalent[]): TalentTreeLayout {
    const validTalents = talents.filter(talent => Number.isFinite(talent.position?.[0]) && Number.isFinite(talent.position?.[1]))
    const nodeMap = new Map<number, TalentTreeNode>()
    const cycles: number[][] = []

    let minRawX = Number.POSITIVE_INFINITY
    let maxRawX = Number.NEGATIVE_INFINITY
    let minRawY = Number.POSITIVE_INFINITY
    let maxRawY = Number.NEGATIVE_INFINITY

    for (const talent of validTalents) {
        const rawX = talent.position[0]
        const rawY = talent.position[1] * TALENT_TREE_Y_SIGN

        minRawX = Math.min(minRawX, rawX)
        maxRawX = Math.max(maxRawX, rawX)
        minRawY = Math.min(minRawY, rawY)
        maxRawY = Math.max(maxRawY, rawY)
    }

    if (!validTalents.length) {
        const emptyBounds: TalentTreeBounds = {
            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,
            width: TALENT_TREE_MARGIN * 2,
            height: TALENT_TREE_MARGIN * 2,
            offsetX: TALENT_TREE_MARGIN,
            offsetY: TALENT_TREE_MARGIN,
        }

        return { nodes: [], nodeMap, edges: [], bounds: emptyBounds, roots: [], depth: new Map(), cycles }
    }

    const offsetX = TALENT_TREE_MARGIN - minRawX
    const offsetY = TALENT_TREE_MARGIN - minRawY
    const bounds: TalentTreeBounds = {
        minX: minRawX,
        minY: minRawY,
        maxX: maxRawX,
        maxY: maxRawY,
        width: maxRawX - minRawX + TALENT_TREE_MARGIN * 2,
        height: maxRawY - minRawY + TALENT_TREE_MARGIN * 2,
        offsetX,
        offsetY,
    }

    const nodes: TalentTreeNode[] = validTalents
        .slice()
        .sort((left, right) => left.position[0] - right.position[0] || left.position[1] - right.position[1] || left.id - right.id)
        .map(talent => ({
            talent,
            rawX: talent.position[0],
            rawY: talent.position[1] * TALENT_TREE_Y_SIGN,
            x: talent.position[0] + offsetX,
            y: talent.position[1] * TALENT_TREE_Y_SIGN + offsetY,
            width: TALENT_NODE_SIZE_SMALL,
            height: TALENT_NODE_SIZE_SMALL,
            tier: "small" as TalentNodeTier,
            depth: 0,
            parentIds: [],
        }))

    for (const node of nodes) {
        nodeMap.set(node.talent.id, node)
    }

    const edgeKeys = new Set<string>()
    const rawEdges: { from: number; to: number }[] = []

    /**
     * 登记一条父→子边；两端必须都在本树内，自身成环的异常数据直接跳过。
     */
    function link(from: number, to: number): void {
        if (from === to) {
            return
        }

        const parent = nodeMap.get(from)
        const child = nodeMap.get(to)

        if (!parent || !child || parent.talent.stageId !== child.talent.stageId) {
            return
        }

        const key = `${from}:${to}`

        if (edgeKeys.has(key)) {
            return
        }

        edgeKeys.add(key)
        rawEdges.push({ from, to })
    }

    for (const node of nodes) {
        for (const childId of node.talent.unlockChildren ?? []) {
            link(node.talent.id, childId)
        }
    }

    for (const node of nodes) {
        for (const parentId of node.talent.parentIds ?? []) {
            link(parentId, node.talent.id)
        }
    }

    const parentsById = new Map<number, number[]>()

    for (const edge of rawEdges) {
        const parents = parentsById.get(edge.to) ?? []
        parents.push(edge.from)
        parentsById.set(edge.to, parents)
    }

    const edges: TalentTreeEdge[] = rawEdges.map(rawEdge => {
        const parent = nodeMap.get(rawEdge.from)!
        const child = nodeMap.get(rawEdge.to)!

        return {
            from: rawEdge.from,
            to: rawEdge.to,
            x1: parent.x,
            y1: parent.y,
            x2: child.x,
            y2: child.y,
            multiParent: (parentsById.get(rawEdge.to)?.length ?? 0) > 1,
        }
    })

    const childCount = new Map<number, number>()

    for (const edge of rawEdges) {
        childCount.set(edge.from, (childCount.get(edge.from) ?? 0) + 1)
    }

    const depth = new Map<number, number>()
    const visiting = new Set<number>()

    /**
     * 最长路径深度（与上游 BFS 层一致）；遇到环时记录并停止递归。
     */
    function resolveDepth(id: number, stack: number[]): number {
        const cached = depth.get(id)

        if (cached !== undefined) {
            return cached
        }

        if (visiting.has(id)) {
            const start = stack.indexOf(id)
            cycles.push([...stack.slice(start === -1 ? 0 : start), id])
            return 0
        }

        visiting.add(id)
        let value = 0

        for (const parentId of parentsById.get(id) ?? []) {
            if (nodeMap.has(parentId)) {
                value = Math.max(value, resolveDepth(parentId, [...stack, id]) + 1)
            }
        }

        visiting.delete(id)
        depth.set(id, value)
        return value
    }

    for (const node of nodes) {
        node.parentIds = parentsById.get(node.talent.id) ?? []
        node.depth = resolveDepth(node.talent.id, [])
        node.tier = resolveTalentNodeTier(node.talent, node.parentIds.length, childCount.get(node.talent.id) ?? 0)

        const size = TALENT_NODE_TIER_SIZE[node.tier]
        node.width = size
        node.height = size
    }

    const roots = nodes.filter(node => node.parentIds.length === 0).map(node => node.talent.id)

    return { nodes, nodeMap, edges, bounds, roots, depth, cycles }
}

/**
 * 按关键词/类型/等级上限计算匹配集合；只影响高亮，不改变布局。
 *
 * 关键词在翻译后的名称、描述与效果文本上匹配（非 CN 环境不会只命中中文原文），
 * 并保留拼音匹配。
 * @param talents 当前树节点
 * @param filter 筛选条件
 * @param resolveText 文本翻译函数，默认原文
 * @returns 命中的节点 id 集合
 */
export function computeTalentMatchSet(
    talents: readonly DnaSeasonTalent[],
    filter: TalentTreeFilter,
    resolveText: TalentTextResolver = text => text
): Set<number> {
    const keyword = (filter.keyword ?? "").trim()
    const kind = filter.kind ?? 0
    const maxLevel = filter.maxLevel ?? 0
    const matched = new Set<number>()

    for (const talent of talents) {
        if (kind && talent.kind !== kind) {
            continue
        }

        if (maxLevel && talent.maxLevel !== maxLevel) {
            continue
        }

        if (!keyword) {
            matched.add(talent.id)
            continue
        }

        const name = resolveText(talent.name)
        const desc = resolveText(talent.desc)
        const effectTexts = talent.effects.flatMap(effect => [
            resolveText(effect.attr),
            effect.description ? resolveText(effect.description) : "",
        ])
        const directHit =
            `${talent.id}`.includes(keyword) ||
            name.includes(keyword) ||
            desc.includes(keyword) ||
            effectTexts.some(text => text.includes(keyword))

        if (
            directHit ||
            matchPinyin(name, keyword).match ||
            matchPinyin(desc, keyword).match ||
            effectTexts.some(text => matchPinyin(text, keyword).match)
        ) {
            matched.add(talent.id)
        }
    }

    return matched
}

/**
 * 滚轮是否应该缩放：只接受纵向为主的有限 deltaY；
 * 横向滚轮（触控板横滑）与零 delta 一律忽略。
 */
export function shouldZoomTalentTreeWheel(deltaX: number, deltaY: number): boolean {
    return Number.isFinite(deltaY) && Math.abs(deltaY) > Math.abs(deltaX)
}

/** 把缩放限制在画布允许区间；非有限值（NaN / ±Infinity）回落到初始缩放。 */
export function clampTalentTreeZoom(scale: number): number {
    if (!Number.isFinite(scale)) {
        return TALENT_TREE_INITIAL_ZOOM
    }

    return Math.min(TALENT_TREE_MAX_ZOOM, Math.max(TALENT_TREE_MIN_ZOOM, scale))
}

/**
 * 画布层缩放值：用 CSS zoom 而非 transform: scale，文字与图片按最终字号布局与栅格化，
 * 放大后不会因为按初始比例栅格化再拉伸而发虚。
 */
export function talentTreeCanvasZoom(scale: number): number {
    return clampTalentTreeZoom(scale)
}

/** 原生滚动位置（容器 scrollLeft / scrollTop）。 */
export interface TalentTreeScrollPosition {
    scrollLeft: number
    scrollTop: number
}

/**
 * pan → 原生滚动位置。内容四周各留半个视口，pan 表示世界原点在视口中的位置，
 * 因此滚动量 = 半屏留白 − pan。
 */
export function talentTreePanToScroll(panX: number, panY: number, halfWidth: number, halfHeight: number): TalentTreeScrollPosition {
    return { scrollLeft: halfWidth - panX, scrollTop: halfHeight - panY }
}

/** 原生滚动位置 → pan（触摸滑动、横向滚轮后同步视口）。 */
export function talentTreeScrollToPan(
    scrollLeft: number,
    scrollTop: number,
    halfWidth: number,
    halfHeight: number
): { panX: number; panY: number } {
    return { panX: halfWidth - scrollLeft, panY: halfHeight - scrollTop }
}

/** 可滚动内容尺寸：画布按 zoom 布局后的尺寸 + 四周各半个视口的留白。 */
export function talentTreeContentSize(
    boundsWidth: number,
    boundsHeight: number,
    scale: number,
    halfWidth: number,
    halfHeight: number
): { width: number; height: number } {
    return { width: boundsWidth * scale + halfWidth * 2, height: boundsHeight * scale + halfHeight * 2 }
}

/** 未命中节点的透明度（筛选只变暗，不移除） */
export const TALENT_TREE_DIM_NODE_OPACITY = 0.25
/** 两端都未命中的连线透明度 */
export const TALENT_TREE_DIM_EDGE_OPACITY = 0.12

/**
 * 节点透明度：命中为 1，未命中变暗。筛选不改变节点数量与位置。
 * @param matchSet 命中集合
 * @param talentId 节点 id
 */
export function talentNodeOpacity(matchSet: ReadonlySet<number>, talentId: number): number {
    return matchSet.has(talentId) ? 1 : TALENT_TREE_DIM_NODE_OPACITY
}

/**
 * 连线透明度：两端命中最高，单端命中次之，其余压暗；多父边再淡一档。
 * @param matchSet 命中集合
 * @param from 父节点 id
 * @param to 子节点 id
 * @param multiParent 子节点是否有多个父节点
 */
export function talentEdgeOpacity(matchSet: ReadonlySet<number>, from: number, to: number, multiParent: boolean): number {
    const fromHit = matchSet.has(from)
    const toHit = matchSet.has(to)
    const base = fromHit && toHit ? 0.6 : fromHit || toHit ? 0.32 : TALENT_TREE_DIM_EDGE_OPACITY

    return multiParent ? base * 0.75 : base
}

/** 世界坐标 → 屏幕坐标。 */
export function worldToScreen(viewport: TalentTreeViewport, x: number, y: number): { x: number; y: number } {
    return { x: x * viewport.scale + viewport.panX, y: y * viewport.scale + viewport.panY }
}

/** 屏幕坐标 → 世界坐标。 */
export function screenToWorld(viewport: TalentTreeViewport, x: number, y: number): { x: number; y: number } {
    return { x: (x - viewport.panX) / viewport.scale, y: (y - viewport.panY) / viewport.scale }
}

/**
 * 以屏幕上的某一点为锚缩放，锚点下的世界坐标保持不动。
 * @param viewport 当前视口
 * @param nextScale 目标缩放
 * @param screenX 锚点屏幕 x
 * @param screenY 锚点屏幕 y
 * @returns 新视口
 */
export function zoomTalentTreeAt(viewport: TalentTreeViewport, nextScale: number, screenX: number, screenY: number): TalentTreeViewport {
    const scale = clampTalentTreeZoom(nextScale)
    const world = screenToWorld(viewport, screenX, screenY)

    return {
        scale,
        panX: screenX - world.x * scale,
        panY: screenY - world.y * scale,
    }
}

/**
 * 把世界坐标点放到视口中心。
 * @returns 只含 pan 的视口（沿用传入缩放）
 */
export function centerTalentTreeOn(
    worldX: number,
    worldY: number,
    viewportWidth: number,
    viewportHeight: number,
    scale: number
): TalentTreeViewport {
    return {
        scale,
        panX: viewportWidth / 2 - worldX * scale,
        panY: viewportHeight / 2 - worldY * scale,
    }
}

/**
 * 显示全部：画布宽高同时装进视口，取较小的缩放（通常受宽度限制）。
 */
export function fitTalentTreeBoundsScale(
    viewportWidth: number,
    viewportHeight: number,
    boundsWidth: number,
    boundsHeight: number,
    padding = 24
): number {
    if (!(viewportWidth > 0) || !(viewportHeight > 0) || !(boundsWidth > 0) || !(boundsHeight > 0)) {
        return TALENT_TREE_INITIAL_ZOOM
    }

    const widthScale = (viewportWidth - padding * 2) / boundsWidth
    const heightScale = (viewportHeight - padding * 2) / boundsHeight

    return clampTalentTreeZoom(Math.min(widthScale, heightScale))
}

/** 指针位移超过该距离即视为拖拽 */
export const TALENT_TREE_DRAG_THRESHOLD = 4

/** 手势处理结果：需要落地的视口，以及需要由 DOM 层执行的指针捕获动作 */
export interface TalentTreeGestureUpdate {
    viewport?: TalentTreeViewport
    /** 需要 `setPointerCapture(pointerId)` */
    capture?: number
    /** 需要 `releasePointerCapture(pointerId)` */
    release?: number
}

/**
 * 手势结果是否应落盘：单指触摸交给原生滚动（含惯性），
 * 鼠标拖拽与双指缩放（pointerCount ≥ 2）由手势接管。
 */
export function shouldApplyTalentTreeGesture(pointerType: string, pointerCount: number): boolean {
    return pointerType !== "touch" || pointerCount >= 2
}

/**
 * 拖拽后的 click 抑制闸门：只吞掉紧随 pointerup 的一次 click。
 *
 * 键盘 Enter / 辅助技术触发的 click 不经过 pointerup，若用「拖拽标记」直接拦截会误伤；
 * 闸门由 DOM 层在 pointerup 时 arm、在 0ms 定时器里 reset，只有同一事件循环内派生的
 * click 会被 consume。
 */
export class TalentTreeClickGate {
    private armed = false

    /** 拖拽结束，武装一次抑制 */
    arm(): void {
        this.armed = true
    }

    /** 消费一次 click；返回 true 表示这次 click 应被吞掉 */
    consume(): boolean {
        if (!this.armed) {
            return false
        }

        this.armed = false
        return true
    }

    /** 下一次按下或抑制窗口结束时复位 */
    reset(): void {
        this.armed = false
    }
}

/**
 * 画布手势状态机：单指平移、双指缩放，并区分「点击」与「拖拽」。
 *
 * 关键约定：**单指按下时绝不调用 setPointerCapture**。一旦在 pointerdown 阶段捕获指针，
 * 浏览器会把后续 pointerup 与派生的 click 重定向到捕获元素（画布容器），
 * 节点按钮上的 click 就永远不会触发。只有越过拖拽阈值、确认是拖拽后才请求捕获。
 */
export class TalentTreeGesture {
    private readonly pointers = new Map<number, { x: number; y: number }>()
    private dragOrigin: { x: number; y: number; panX: number; panY: number } | null = null
    private pinchOrigin: { distance: number; scale: number; worldX: number; worldY: number } | null = null
    private moved = false

    constructor(private readonly dragThreshold = TALENT_TREE_DRAG_THRESHOLD) {}

    /** 本次按下是否已经变成拖拽（拖拽后的 click 应被吞掉） */
    get dragging(): boolean {
        return this.moved
    }

    /** 当前按下的指针数 */
    get pointerCount(): number {
        return this.pointers.size
    }

    /** 双指距离与中点（容器坐标） */
    private pinch(): { distance: number; midX: number; midY: number } {
        const [first, second] = [...this.pointers.values()]

        if (!first || !second) {
            return { distance: 0, midX: 0, midY: 0 }
        }

        return {
            distance: Math.hypot(second.x - first.x, second.y - first.y),
            midX: (first.x + second.x) / 2,
            midY: (first.y + second.y) / 2,
        }
    }

    /**
     * 指针按下。
     * @param x 容器内 x
     * @param y 容器内 y
     * @param viewport 当前视口
     */
    down(pointerId: number, x: number, y: number, viewport: TalentTreeViewport): TalentTreeGestureUpdate {
        this.pointers.set(pointerId, { x, y })

        if (this.pointers.size === 1) {
            this.moved = false
            this.pinchOrigin = null
            this.dragOrigin = { x, y, panX: viewport.panX, panY: viewport.panY }
            return {}
        }

        if (this.pointers.size === 2) {
            const { distance, midX, midY } = this.pinch()
            const world = screenToWorld(viewport, midX, midY)
            this.pinchOrigin = { distance: distance || 1, scale: viewport.scale, worldX: world.x, worldY: world.y }
            this.dragOrigin = null
            return { capture: pointerId }
        }

        return {}
    }

    /**
     * 指针移动：单指平移，双指缩放；越过阈值后才请求捕获。
     * @param viewport 当前视口
     */
    move(pointerId: number, x: number, y: number, viewport: TalentTreeViewport): TalentTreeGestureUpdate {
        if (!this.pointers.has(pointerId)) {
            return {}
        }

        this.pointers.set(pointerId, { x, y })

        if (this.pointers.size >= 2 && this.pinchOrigin) {
            const { distance, midX, midY } = this.pinch()
            const scale = clampTalentTreeZoom(this.pinchOrigin.scale * (distance / this.pinchOrigin.distance))
            this.moved = true

            // 双指同向平移也要生效：让按下时的世界锚点跟随当前双指中点
            return {
                viewport: {
                    scale,
                    panX: midX - this.pinchOrigin.worldX * scale,
                    panY: midY - this.pinchOrigin.worldY * scale,
                },
            }
        }

        if (!this.dragOrigin) {
            return {}
        }

        const dx = x - this.dragOrigin.x
        const dy = y - this.dragOrigin.y
        const update: TalentTreeGestureUpdate = {
            viewport: { scale: viewport.scale, panX: this.dragOrigin.panX + dx, panY: this.dragOrigin.panY + dy },
        }

        if (!this.moved && Math.abs(dx) + Math.abs(dy) > this.dragThreshold) {
            this.moved = true
            update.capture = pointerId
        }

        return update
    }

    /**
     * 指针抬起/取消：释放捕获并交接剩余指针。
     * @param viewport 当前视口
     */
    up(pointerId: number, viewport: TalentTreeViewport): TalentTreeGestureUpdate {
        const tracked = this.pointers.delete(pointerId)
        const update: TalentTreeGestureUpdate = tracked ? { release: pointerId } : {}

        if (this.pointers.size < 2) {
            this.pinchOrigin = null
        }

        if (this.pointers.size === 1) {
            const [remaining] = [...this.pointers.values()]
            this.dragOrigin = { x: remaining.x, y: remaining.y, panX: viewport.panX, panY: viewport.panY }
        } else {
            this.dragOrigin = null
        }

        return update
    }
}
