import type { MindMapEffectiveStyle, MindMapNode } from "./mindMap"
import { MIND_MAP_BOX, type MindMapLayoutNode, type MindMapLayoutResult, type MindMapMeasure } from "./mindMapLayout"

/** 样式缺失时的回退，与 buildMindMapGraphData 保持一致 */
const FALLBACK_STYLE: MindMapEffectiveStyle = { fontSize: 14, color: "#3b82f6", bg: undefined }

interface MeasuredMindNode {
    style: MindMapEffectiveStyle
    lines: string[]
    width: number
    height: number
}

interface BoundsState {
    minX: number
    minY: number
    maxX: number
    maxY: number
}

/** 按 id 缓存测量结果，避免同一主题被重复测量 */
function createNodeMeasurer(styles: Map<string, MindMapEffectiveStyle>, measure: MindMapMeasure) {
    const cache = new Map<string, MeasuredMindNode>()
    return (node: MindMapNode, depth: number): MeasuredMindNode => {
        const cached = cache.get(node.id)
        if (cached) return cached
        const style = styles.get(node.id) ?? FALLBACK_STYLE
        const size = measure(node, style, depth)
        // 绑定节点没有文字：用标题条占位，避免按零行渲染时高度塌陷
        const lines = node.nodeId ? [node.text] : size.lines
        const measured: MeasuredMindNode = { style, lines, width: size.width, height: size.height }
        cache.set(node.id, measured)
        return measured
    }
}

function createBoundsState(): BoundsState {
    return {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
    }
}

function createLayoutNode(node: MindMapNode, measured: MeasuredMindNode, depth: number, x: number, y: number): MindMapLayoutNode {
    return { id: node.id, x, y, width: measured.width, height: measured.height, lines: measured.lines, style: measured.style, depth }
}

function includeLayoutNode(bounds: BoundsState, node: MindMapLayoutNode) {
    bounds.minX = Math.min(bounds.minX, node.x)
    bounds.minY = Math.min(bounds.minY, node.y)
    bounds.maxX = Math.max(bounds.maxX, node.x + node.width)
    bounds.maxY = Math.max(bounds.maxY, node.y + node.height)
}

function toLayoutResult(nodes: MindMapLayoutNode[], bounds: BoundsState): MindMapLayoutResult {
    if (nodes.length === 0) {
        return { nodes, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 } }
    }
    return {
        nodes,
        bounds: {
            minX: bounds.minX,
            minY: bounds.minY,
            maxX: bounds.maxX,
            maxY: bounds.maxY,
            width: Math.max(0, bounds.maxX - bounds.minX),
            height: Math.max(0, bounds.maxY - bounds.minY),
        },
    }
}

interface FishboneExtent {
    /** 相对自身盒子中心向上的伸出量 */
    top: number
    /** 相对自身盒子中心向下的伸出量 */
    bottom: number
    /** 子树总高 */
    height: number
}

interface FishboneContext {
    measureNode: ReturnType<typeof createNodeMeasurer>
    extents: Map<string, FishboneExtent>
    nodes: MindMapLayoutNode[]
    bounds: BoundsState
}

/** 计算子树上下伸出量：偶数位子级在上、奇数位在下，块与块之间留 vGap */
function measureFishboneExtent(node: MindMapNode, depth: number, ctx: FishboneContext): FishboneExtent {
    const cached = ctx.extents.get(node.id)
    if (cached) return cached
    const measured = ctx.measureNode(node, depth)
    let upper = 0
    let lower = 0
    if (node.collapsed !== true) {
        node.children.forEach((child, index) => {
            const extent = measureFishboneExtent(child, depth + 1, ctx)
            if (index % 2 === 0) upper += MIND_MAP_BOX.vGap + extent.height
            else lower += MIND_MAP_BOX.vGap + extent.height
        })
    }
    const extent: FishboneExtent = {
        top: measured.height / 2 + upper,
        bottom: measured.height / 2 + lower,
        height: measured.height + upper + lower,
    }
    ctx.extents.set(node.id, extent)
    return extent
}

/** 按中心线放置子树，子级沿水平方向递增，垂直方向上下交错以避免重叠 */
function placeFishboneSubtree(node: MindMapNode, depth: number, x: number, centerY: number, ctx: FishboneContext) {
    const measured = ctx.measureNode(node, depth)
    const layoutNode = createLayoutNode(node, measured, depth, x, centerY - measured.height / 2)
    ctx.nodes.push(layoutNode)
    includeLayoutNode(ctx.bounds, layoutNode)
    if (node.collapsed === true) return

    const childX = x + measured.width + MIND_MAP_BOX.hGap
    let cursor = layoutNode.y
    for (let index = 0; index < node.children.length; index += 2) {
        const child = node.children[index]
        const extent = measureFishboneExtent(child, depth + 1, ctx)
        cursor -= MIND_MAP_BOX.vGap
        placeFishboneSubtree(child, depth + 1, childX, cursor - extent.bottom, ctx)
        cursor -= extent.height
    }
    cursor = layoutNode.y + measured.height
    for (let index = 1; index < node.children.length; index += 2) {
        const child = node.children[index]
        const extent = measureFishboneExtent(child, depth + 1, ctx)
        cursor += MIND_MAP_BOX.vGap
        placeFishboneSubtree(child, depth + 1, childX, cursor + extent.top, ctx)
        cursor += extent.height
    }
}

/** 子树从自身左边缘到最右后代右边缘的宽度，用于给主刺在脊柱上分配等距位置 */
function measureFishboneWidth(node: MindMapNode, depth: number, ctx: FishboneContext): number {
    const measured = ctx.measureNode(node, depth)
    if (node.collapsed === true || node.children.length === 0) return measured.width
    let childWidth = 0
    node.children.forEach(child => {
        childWidth = Math.max(childWidth, measureFishboneWidth(child, depth + 1, ctx))
    })
    return measured.width + MIND_MAP_BOX.hGap + childWidth
}

/**
 * 鱼骨图布局：鱼头在最左并垂直居中于脊柱，一级主刺沿脊柱依次向右排布并上下交替；
 * 后代再从主刺向右延伸、上下交错，像附在主刺上的小刺。
 * @param root 根主题
 * @param styles 生效样式表
 * @param measure 盒子尺寸测量
 * @returns 位置列表与包围盒
 */
export function layoutFishbone(
    root: MindMapNode,
    styles: Map<string, MindMapEffectiveStyle>,
    measure: MindMapMeasure
): MindMapLayoutResult {
    const ctx: FishboneContext = {
        measureNode: createNodeMeasurer(styles, measure),
        extents: new Map(),
        nodes: [],
        bounds: createBoundsState(),
    }
    const rootMeasured = ctx.measureNode(root, 0)
    const ribs = root.collapsed === true ? [] : root.children
    const ribGap = MIND_MAP_BOX.vGap * 2

    // 先给每条主刺算好块宽与上下伸出量，再沿脊柱顺序摆放
    const plans = ribs.map((child, index) => ({
        child,
        width: measureFishboneWidth(child, 1, ctx),
        extent: measureFishboneExtent(child, 1, ctx),
        above: index % 2 === 0,
    }))
    // 脊柱的上下空间取两侧主刺块的最大伸出量：主刺块彼此沿 x 展开，不会叠加高度
    const spineY = plans.filter(plan => plan.above).reduce((max, plan) => Math.max(max, ribGap + plan.extent.height), 0)

    const rootLayoutNode = createLayoutNode(root, rootMeasured, 0, 0, spineY - rootMeasured.height / 2)
    ctx.nodes.push(rootLayoutNode)
    includeLayoutNode(ctx.bounds, rootLayoutNode)

    let cursor = rootMeasured.width + MIND_MAP_BOX.hGap
    plans.forEach(plan => {
        // 主刺中心到脊柱的距离要让整个子树块都落在脊柱同侧
        const centerY = plan.above ? spineY - ribGap - plan.extent.bottom : spineY + ribGap + plan.extent.top
        placeFishboneSubtree(plan.child, 1, cursor, centerY, ctx)
        cursor += plan.width + MIND_MAP_BOX.hGap
    })

    return toLayoutResult(ctx.nodes, ctx.bounds)
}

interface TimelineEntry {
    node: MindMapNode
    depth: number
}

/** 收集可见主题的 DFS 先序序列 */
function collectTimelineEntries(root: MindMapNode): TimelineEntry[] {
    const entries: TimelineEntry[] = []
    const visit = (node: MindMapNode, depth: number) => {
        entries.push({ node, depth })
        if (node.collapsed === true) return
        node.children.forEach(child => visit(child, depth + 1))
    }
    visit(root, 0)
    return entries
}

/**
 * 时间轴布局：按 DFS 先序把可见主题填入蛇形网格，奇数行从右向左。
 * @param root 根主题
 * @param styles 生效样式表
 * @param measure 盒子尺寸测量
 * @returns 位置列表与包围盒
 */
export function layoutTimeline(
    root: MindMapNode,
    styles: Map<string, MindMapEffectiveStyle>,
    measure: MindMapMeasure
): MindMapLayoutResult {
    const measureNode = createNodeMeasurer(styles, measure)
    const entries = collectTimelineEntries(root)
    const columns = Math.max(2, Math.ceil(Math.sqrt(entries.length)))
    const nodes: MindMapLayoutNode[] = []
    const bounds = createBoundsState()
    let rowTop = 0

    for (let start = 0; start < entries.length; start += columns) {
        const row = entries.slice(start, start + columns)
        const rowMeasured = row.map(entry => measureNode(entry.node, entry.depth))
        const maxWidth = Math.max(...rowMeasured.map(item => item.width))
        const maxHeight = Math.max(...rowMeasured.map(item => item.height))
        const cellWidth = maxWidth + MIND_MAP_BOX.hGap
        const rowHeight = maxHeight + MIND_MAP_BOX.vGap
        const rowIndex = start / columns
        row.forEach((entry, position) => {
            const measured = rowMeasured[position]
            const column = rowIndex % 2 === 0 ? position : columns - 1 - position
            const layoutNode = createLayoutNode(
                entry.node,
                measured,
                entry.depth,
                column * cellWidth + (cellWidth - measured.width) / 2,
                rowTop + (rowHeight - measured.height) / 2
            )
            nodes.push(layoutNode)
            includeLayoutNode(bounds, layoutNode)
        })
        rowTop += rowHeight
    }

    return toLayoutResult(nodes, bounds)
}
