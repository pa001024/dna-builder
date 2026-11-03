import type { EdgeData, GraphData, NodeData, TreeData } from "@antv/g6"
import {
    MIND_MAP_BOX,
    type MindMapEdgeRouting,
    type MindMapEffectiveStyle,
    type MindMapLayoutMeta,
    type MindMapLayoutNode,
    type MindMapLayoutResult,
    type MindMapMeasure,
    type MindMapNode,
} from "./mindMap"
import { layoutFishbone, layoutTimeline } from "./mindMapCustomLayouts"

export { MIND_MAP_BOX, type MindMapLayoutNode, type MindMapLayoutResult, type MindMapMeasure }

/** 连线样式：肘形 / 直线 / 大圆角括号 */
export type MindMapEdgeStyle = MindMapLayoutMeta["edgeStyle"]

/** 判断某主题是否向布局展开子级 */
function isExpanded(node: MindMapNode) {
    return node.collapsed !== true
}

/** 统计子树节点数（含自身），用于左右均衡分配 */
function subtreeWeight(node: MindMapNode): number {
    let total = 1
    node.children.forEach(child => {
        total += subtreeWeight(child)
    })
    return total
}

/**
 * 按子树规模把根的直接子级分到左右两侧，尽量让两侧高度接近。
 * 子树规模大的分支优先独占一侧，避免一侧堆满、另一侧空着。
 * @param children 根的直接子级
 * @returns 每个子级所属侧
 */
export function balanceMindMapSides(children: MindMapNode[]): ("left" | "right")[] {
    const weights = children.map(subtreeWeight)
    const sides: ("left" | "right")[] = new Array(children.length).fill("right")
    const order = weights.map((weight, index) => ({ weight, index })).sort((a, b) => b.weight - a.weight)
    let leftWeight = 0
    let rightWeight = 0
    order.forEach(({ weight, index }) => {
        // 两侧持平时优先放右侧：首个分支在右边更符合思维导图习惯
        const side = leftWeight < rightWeight ? "left" : "right"
        sides[index] = side
        if (side === "left") leftWeight += weight
        else rightWeight += weight
    })
    return sides
}

/**
 * 把主题树转换成 G6 图数据（节点 + 父子边）。
 * 折叠的主题只保留自身，子级不进入图数据。
 * @param root 根主题
 * @param styles 生效样式表
 * @param measure 盒子尺寸测量
 * @returns G6 图数据
 */
export function buildMindMapGraphData(root: MindMapNode, styles: Map<string, MindMapEffectiveStyle>, measure: MindMapMeasure): GraphData {
    const nodes: NodeData[] = []
    const edges: EdgeData[] = []
    const visit = (node: MindMapNode, depth: number) => {
        const style = styles.get(node.id) ?? { fontSize: 14, color: "#3b82f6", bg: undefined }
        const size = measure(node, style, depth)
        nodes.push({
            id: node.id,
            data: { text: node.text, note: node.note, depth, style, lines: size.lines },
            style: { width: size.width, height: size.height, lines: size.lines },
        })
        if (!isExpanded(node)) return
        node.children.forEach(child => {
            edges.push({ id: `${node.id}->${child.id}`, source: node.id, target: child.id })
            visit(child, depth + 1)
        })
    }
    visit(root, 0)
    return { nodes, edges }
}

/**
 * 把主题树转成 G6 树布局可直接消费的 TreeData。
 * @param root 根主题
 * @param styles 生效样式表
 * @param measure 盒子尺寸测量
 * @returns 树数据
 */
export function buildMindMapTreeData(root: MindMapNode, styles: Map<string, MindMapEffectiveStyle>, measure: MindMapMeasure): TreeData {
    const build = (node: MindMapNode, depth: number): TreeData => {
        const style = styles.get(node.id) ?? { fontSize: 14, color: "#3b82f6", bg: undefined }
        const size = measure(node, style, depth)
        const data: TreeData = {
            id: node.id,
            depth,
            width: size.width,
            height: size.height,
            text: node.text,
            note: node.note,
            lines: size.lines,
            mindStyle: style,
        }
        if (isExpanded(node) && node.children.length > 0) {
            data.children = node.children.map(child => build(child, depth + 1))
        }
        return data
    }
    return build(root, 0)
}

/** G6 树布局的选项 */
export interface MindMapTreeLayoutOptions {
    getId: (datum: TreeData) => string
    getWidth: (datum: TreeData) => number
    getHeight: (datum: TreeData) => number
    getHGap: (datum: TreeData) => number
    getVGap: (datum: TreeData) => number
    getChildren: (datum: TreeData) => TreeData[] | undefined
    getSide?: (node: TreeData, index: number) => "left" | "right"
    /** 括号图的缩进量：可以是固定值，也可以是按节点计算的函数 */
    indent?: number | ((node: TreeData) => number)
    dropCap?: boolean
    direction: string
    [key: string]: unknown
}

/**
 * 生成对应布局形态的 G6 树布局选项。
 * @param meta 布局形态
 * @param root 根主题
 * @returns 布局选项
 */
export function buildTreeLayoutOptions(meta: MindMapLayoutMeta, root: MindMapNode): MindMapTreeLayoutOptions {
    const base: MindMapTreeLayoutOptions = {
        direction: meta.direction,
        getId: datum => String(datum.id),
        getWidth: datum => Number(datum.width) || MIND_MAP_BOX.minWidth,
        getHeight: datum => Number(datum.height) || 24,
        getHGap: () => MIND_MAP_BOX.hGap,
        getVGap: () => MIND_MAP_BOX.vGap,
        getChildren: datum => datum.children,
    }
    if (meta.g6Type === "mindmap") {
        const sides = balanceMindMapSides(root.children)
        base.getSide = (_datum, index) => sides[index] ?? "right"
    }
    if (meta.g6Type === "indented") {
        // 括号图按缩进排布；缩进量取该层父盒子的宽度，否则子主题会压住父主题
        base.indent = (node: any) => (Number(node.width) || MIND_MAP_BOX.minWidth) + MIND_MAP_BOX.hGap
        base.dropCap = false
    }
    if (meta.g6Type === "compact-box") {
        // 上下布局时兄弟之间留更宽的行距，避免盒子贴太近
        base.getVGap = () => MIND_MAP_BOX.vGap * 1.5
    }
    return base
}

/**
 * 把 G6 布局结果（HierarchyNode 树）摊平成位置列表。
 * @param laidOut 布局返回的根
 * @param styles 生效样式表
 * @param textByNode 主题 id → 折行结果
 * @returns 位置列表与包围盒
 */
export function flattenLayoutResult(
    laidOut: any,
    styles: Map<string, MindMapEffectiveStyle>,
    textByNode: Map<string, string[]>
): MindMapLayoutResult {
    const nodes: MindMapLayoutNode[] = []
    const bounds = {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
        width: 0,
        height: 0,
    }
    const visit = (node: any, depth: number) => {
        // G6 hierarchy 的 x/y 是「盒子 + 四周间距」扩展盒的左上角，width/height 也含两侧间距：
        // 需要各扣掉一份 hgap/vgap 才能还原真实盒子（左侧子树是镜像坐标，不能整体平移）
        const hgap = Number(node.hgap) || 0
        const vgap = Number(node.vgap) || 0
        const x = (Number(node.x) || 0) + hgap
        const y = (Number(node.y) || 0) + vgap
        const width = Math.max(MIND_MAP_BOX.minWidth, (Number(node.width) || 0) - hgap * 2)
        const height = Math.max(18, (Number(node.height) || 0) - vgap * 2)
        nodes.push({
            id: String(node.id),
            x,
            y,
            width,
            height,
            lines: textByNode.get(String(node.id)) ?? [],
            style: styles.get(String(node.id)) ?? { fontSize: 14, color: "#3b82f6", bg: undefined },
            depth,
        })
        bounds.minX = Math.min(bounds.minX, x)
        bounds.minY = Math.min(bounds.minY, y)
        bounds.maxX = Math.max(bounds.maxX, x + width)
        bounds.maxY = Math.max(bounds.maxY, y + height)
        ;(node.children ?? []).forEach((child: any) => visit(child, depth + 1))
    }
    visit(laidOut, 0)
    if (nodes.length === 0) {
        bounds.minX = 0
        bounds.minY = 0
        bounds.maxX = 0
        bounds.maxY = 0
    }
    bounds.width = Math.max(0, bounds.maxX - bounds.minX)
    bounds.height = Math.max(0, bounds.maxY - bounds.minY)
    return { nodes, bounds }
}

/**
 * 计算父子连线路径。走向由布局声明的方向决定：横向布局从左右两侧连，纵向布局从上下两端连，
 * 不能按两盒子的中心距离去猜——同一个布局里外层分支的水平距离很容易大于层高。
 * 鱼骨图的一级主刺沿脊柱出线，单独处理。
 * @param parent 父主题
 * @param child 子主题
 * @param style 连线样式
 * @param routing 连线走向
 * @returns SVG path
 */
export function buildMindMapEdgePath(
    parent: MindMapLayoutNode,
    child: MindMapLayoutNode,
    style: MindMapEdgeStyle = "elbow",
    routing: MindMapEdgeRouting = "auto"
): string {
    const parentCx = parent.x + parent.width / 2
    const parentCy = parent.y + parent.height / 2
    const childCx = child.x + child.width / 2
    const childCy = child.y + child.height / 2

    // 鱼骨图：从鱼头右端沿脊柱水平前进，再垂直连到主刺靠近脊柱的一侧
    if (routing === "fishbone" && parent.depth === 0) {
        const startX = parent.x + parent.width
        const endY = childCy <= parentCy ? child.y + child.height : child.y
        return `M ${startX} ${parentCy} L ${childCx} ${parentCy} L ${childCx} ${endY}`
    }

    const horizontal = routing === "horizontal" || (routing === "auto" && Math.abs(childCx - parentCx) >= Math.abs(childCy - parentCy))

    if (horizontal) {
        const goingRight = childCx >= parentCx
        const startX = goingRight ? parent.x + parent.width : parent.x
        const endX = goingRight ? child.x : child.x + child.width
        if (style === "straight") return `M ${startX} ${parentCy} L ${endX} ${childCy}`
        const sign = goingRight ? 1 : -1
        const dy = childCy - parentCy
        const midX = (startX + endX) / 2
        if (Math.abs(dy) < 0.5) return `M ${startX} ${parentCy} L ${endX} ${childCy}`
        const radius = style === "bracket" ? 18 : 8
        const r = Math.min(radius, Math.abs(dy) / 2, Math.abs(midX - startX), Math.abs(endX - midX))
        const corner = dy >= 0 ? 1 : -1
        return (
            `M ${startX} ${parentCy} ` +
            `L ${midX - sign * r} ${parentCy} ` +
            `Q ${midX} ${parentCy} ${midX} ${parentCy + corner * r} ` +
            `L ${midX} ${childCy - corner * r} ` +
            `Q ${midX} ${childCy} ${midX + sign * r} ${childCy} ` +
            `L ${endX} ${childCy}`
        )
    }

    const goingDown = childCy >= parentCy
    const startY = goingDown ? parent.y + parent.height : parent.y
    const endY = goingDown ? child.y : child.y + child.height
    const startX = parentCx
    const endX = childCx
    if (style === "straight") return `M ${startX} ${startY} L ${endX} ${endY}`
    const sign = goingDown ? 1 : -1
    const dx = endX - startX
    const midY = (startY + endY) / 2
    if (Math.abs(dx) < 0.5) return `M ${startX} ${startY} L ${endX} ${endY}`
    const radius = style === "bracket" ? 18 : 8
    const r = Math.min(radius, Math.abs(dx) / 2, Math.abs(midY - startY), Math.abs(endY - midY))
    const corner = dx >= 0 ? 1 : -1
    return (
        `M ${startX} ${startY} ` +
        `L ${startX} ${midY - sign * r} ` +
        `Q ${startX} ${midY} ${startX + corner * r} ${midY} ` +
        `L ${endX - corner * r} ${midY} ` +
        `Q ${endX} ${midY} ${endX} ${midY + sign * r} ` +
        `L ${endX} ${endY}`
    )
}

/**
 * 用 G6 内置树布局函数给主题树排版；鱼骨 / 时间轴走自实现算法。
 * @param root 根主题
 * @param meta 布局形态
 * @param styles 生效样式表
 * @param measure 盒子尺寸测量
 * @param treeLayouts G6 树布局函数表
 * @returns 布局结果
 */
export function layoutMindMap(
    root: MindMapNode,
    meta: MindMapLayoutMeta,
    styles: Map<string, MindMapEffectiveStyle>,
    measure: MindMapMeasure,
    treeLayouts: Record<string, (tree: TreeData, options: MindMapTreeLayoutOptions) => any>
): MindMapLayoutResult {
    if (meta.kind === "timeline") return layoutTimeline(root, styles, measure)
    if (meta.kind === "fishbone") return layoutFishbone(root, styles, measure)

    const textByNode = new Map<string, string[]>()
    const tree = buildMindMapTreeData(root, styles, (node, style, depth) => {
        const size = measure(node, style, depth)
        textByNode.set(node.id, size.lines)
        return size
    })
    const run = (kind: MindMapLayoutMeta) => treeLayouts[kind.g6Type]?.(tree, buildTreeLayoutOptions(kind, root))
    let laidOut = run(meta)
    // 布局函数缺失或返回空结果时回落到逻辑图
    if (!laidOut || typeof laidOut.x !== "number") laidOut = run(MIND_MAP_FALLBACK)
    // 兜底布局也不可用时退化为单列堆叠，保证节点仍可渲染
    if (!laidOut || typeof laidOut.x !== "number") return stackFallback(root, styles, textByNode)
    return flattenLayoutResult(laidOut, styles, textByNode)
}

/**
 * 最后的兜底排版：按先序把主题纵向堆叠，只在布局函数全部缺失时使用。
 * @param root 根主题
 * @param styles 生效样式表
 * @param textByNode 折行结果
 * @returns 布局结果
 */
function stackFallback(
    root: MindMapNode,
    styles: Map<string, MindMapEffectiveStyle>,
    textByNode: Map<string, string[]>
): MindMapLayoutResult {
    const nodes: MindMapLayoutNode[] = []
    let cursor = 0
    let depth = 0
    let maxWidth = 0
    const visit = (node: MindMapNode, currentDepth: number) => {
        const textLines = textByNode.get(node.id) ?? [node.text]
        const style = styles.get(node.id) ?? { fontSize: 14, color: "#3b82f6", bg: undefined }
        const width = Math.max(
            MIND_MAP_BOX.minWidth,
            Math.max(...textLines.map(line => line.length)) * style.fontSize * 0.7 + MIND_MAP_BOX.paddingX * 2
        )
        const height = Math.round(style.fontSize * 1.35 * textLines.length + MIND_MAP_BOX.paddingY * 2)
        nodes.push({
            id: node.id,
            x: currentDepth * MIND_MAP_BOX.hGap,
            y: cursor,
            width,
            height,
            lines: textLines,
            style,
            depth: currentDepth,
        })
        maxWidth = Math.max(maxWidth, currentDepth * MIND_MAP_BOX.hGap + width)
        depth = Math.max(depth, currentDepth)
        cursor += height + MIND_MAP_BOX.vGap
        if (node.collapsed !== true) node.children.forEach(child => visit(child, currentDepth + 1))
    }
    visit(root, 0)
    return {
        nodes,
        bounds: {
            minX: 0,
            minY: 0,
            maxX: maxWidth,
            maxY: Math.max(0, cursor - MIND_MAP_BOX.vGap),
            width: maxWidth,
            height: Math.max(0, cursor - MIND_MAP_BOX.vGap),
        },
    }
}

/** 兜底布局：逻辑图（compact-box 左到右），任何树形数据都能排 */
export const MIND_MAP_FALLBACK: MindMapLayoutMeta = {
    kind: "logic",
    label: "逻辑图",
    g6Type: "compact-box",
    direction: "LR",
    edgeStyle: "elbow",
    edgeRouting: "horizontal",
    description: "统一向右展开，适合长文本",
}
