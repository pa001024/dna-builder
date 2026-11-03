import { nanoid } from "nanoid"

/** 思维导图布局形态：对应 G6 内置布局的组合 */
export type MindMapLayoutKind = "mindmap" | "logic" | "brace" | "org" | "tree" | "timeline" | "fishbone"

/** 思维导图中的一个主题节点（纯 JSON，随节点数据持久化） */
export interface MindMapNode {
    id: string
    text: string
    /** 折叠子树：折叠后布局不展开该主题的子级 */
    collapsed?: boolean
    /** 字号覆盖；缺省继承父级，根节点用 data.fontSize */
    fontSize?: number
    /** 分支色；缺省继承父级，根节点用 data.color */
    color?: string
    /** 主题底色 */
    bg?: string
    /** 备注文字（悬浮展示） */
    note?: string
    children: MindMapNode[]
}

/** 连线走向：由布局的展开方向决定，不能靠两个盒子的相对位置去猜 */
export type MindMapEdgeRouting = "horizontal" | "vertical" | "auto" | "fishbone"

/** 布局形态元信息 */
export interface MindMapLayoutMeta {
    kind: MindMapLayoutKind
    label: string
    /** G6 内置布局 type */
    g6Type: "mindmap" | "compact-box" | "indented" | "dendrogram" | "snake" | "fishbone"
    /** 布局方向 */
    direction: "H" | "LR" | "TB" | "BT" | "RL"
    /** 连线样式 */
    edgeStyle: "elbow" | "straight" | "bracket"
    /** 连线走向：横向布局从左右两侧连，纵向布局从上下两端连 */
    edgeRouting: MindMapEdgeRouting
    description: string
}

/** 七种布局形态（顺序即菜单顺序） */
export const MIND_MAP_LAYOUTS: MindMapLayoutMeta[] = [
    {
        kind: "mindmap",
        label: "思维导图",
        g6Type: "mindmap",
        direction: "H",
        edgeStyle: "elbow",
        edgeRouting: "horizontal",
        description: "双向展开，中心主题居中",
    },
    {
        kind: "logic",
        label: "逻辑图",
        g6Type: "compact-box",
        direction: "LR",
        edgeStyle: "elbow",
        edgeRouting: "horizontal",
        description: "统一向右展开，适合长文本",
    },
    {
        kind: "brace",
        label: "括号图",
        g6Type: "indented",
        direction: "LR",
        edgeStyle: "bracket",
        edgeRouting: "horizontal",
        description: "缩进层级，适合目录与大纲",
    },
    {
        kind: "org",
        label: "组织结构图",
        g6Type: "compact-box",
        direction: "TB",
        edgeStyle: "elbow",
        edgeRouting: "vertical",
        description: "自上而下分层，最常用",
    },
    {
        kind: "tree",
        label: "树形图",
        g6Type: "compact-box",
        direction: "LR",
        edgeStyle: "straight",
        edgeRouting: "horizontal",
        description: "树状分支，层级分明",
    },
    {
        kind: "timeline",
        label: "时间轴",
        g6Type: "snake",
        direction: "LR",
        edgeStyle: "straight",
        edgeRouting: "auto",
        description: "按顺序蛇形排列",
    },
    {
        kind: "fishbone",
        label: "鱼骨图",
        g6Type: "fishbone",
        direction: "LR",
        edgeStyle: "straight",
        edgeRouting: "fishbone",
        description: "因果分析，鱼头在左",
    },
]

/** 读取布局元信息，未知形态回落到思维导图 */
export function readLayoutMeta(kind: unknown): MindMapLayoutMeta {
    return MIND_MAP_LAYOUTS.find(item => item.kind === kind) ?? MIND_MAP_LAYOUTS[0]
}

/** 主题字号基准（根节点未指定时使用） */
export const DEFAULT_FONT_SIZE = 14

/** 主题盒子的内边距与行高参数（与 MindNodeBox 的 CSS 保持一致） */
export const MIND_MAP_BOX = {
    paddingX: 10,
    paddingY: 6,
    /** 单行最小宽度 */
    minWidth: 56,
    /** 文本最大宽度（超出折行） */
    maxTextWidth: 220,
    /** 水平间距：父子之间 */
    hGap: 34,
    /** 垂直间距：兄弟之间 */
    vGap: 12,
    /** 画布内边距 */
    canvasPadding: 24,
} as const

/** 布局后每个主题的位置与尺寸 */
export interface MindMapLayoutNode {
    id: string
    x: number
    y: number
    width: number
    height: number
    /** 文字折行结果 */
    lines: string[]
    style: MindMapEffectiveStyle
    depth: number
}

/** 布局结果 */
export interface MindMapLayoutResult {
    nodes: MindMapLayoutNode[]
    /** 内容包围盒（未加内边距） */
    bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }
}

/** 主题盒子尺寸测量回调 */
export type MindMapMeasure = (
    node: MindMapNode,
    style: MindMapEffectiveStyle,
    depth: number
) => { lines: string[]; width: number; height: number }

/** 主题可选配色（分支色） */
export const MIND_MAP_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7", "#14b8a6", "#64748b"]

/** 新建一个主题 */
export function createMindMapNode(text: string, extra: Partial<MindMapNode> = {}): MindMapNode {
    return { id: nanoid(8), text, children: [], ...extra }
}

/** 新建一张只有中心主题的导图 */
export function createMindMapTree(text = "中心主题"): MindMapNode {
    return createMindMapNode(text)
}

/**
 * 深拷贝子树并重新生成 id，用于复制 / 粘贴 / 拆分主题。
 * @param node 源主题
 * @returns 副本
 */
export function cloneMindMapTree(node: MindMapNode): MindMapNode {
    return {
        ...node,
        id: nanoid(8),
        children: node.children.map(cloneMindMapTree),
    }
}

/**
 * 规范化外部传入的树数据：补齐字段、丢弃空 id、保证 children 数组。
 * @param raw 原始数据
 * @returns 规范化后的根主题；无效时返回 null
 */
export function normalizeMindMapTree(raw: unknown): MindMapNode | null {
    if (!raw || typeof raw !== "object") return null
    const source = raw as Record<string, any>
    if (typeof source.text !== "string" && typeof source.label !== "string") return null
    const children = Array.isArray(source.children)
        ? source.children.map(normalizeMindMapTree).filter((child): child is MindMapNode => child !== null)
        : []
    const node: MindMapNode = {
        id: typeof source.id === "string" && source.id ? source.id : nanoid(8),
        text: typeof source.text === "string" ? source.text : String(source.label ?? ""),
        children,
    }
    if (source.collapsed === true) node.collapsed = true
    if (typeof source.fontSize === "number" && source.fontSize > 0) node.fontSize = source.fontSize
    if (typeof source.color === "string" && source.color) node.color = source.color
    if (typeof source.bg === "string" && source.bg) node.bg = source.bg
    if (typeof source.note === "string" && source.note) node.note = source.note
    return node
}

/** 深度优先遍历主题 */
export function walkMindMap(
    node: MindMapNode,
    visit: (node: MindMapNode, parent: MindMapNode | null, depth: number) => void,
    parent: MindMapNode | null = null,
    depth = 0
) {
    visit(node, parent, depth)
    node.children.forEach(child => walkMindMap(child, visit, node, depth + 1))
}

/** 统计主题数量 */
export function countMindMapNodes(node: MindMapNode): number {
    let total = 1
    node.children.forEach(child => {
        total += countMindMapNodes(child)
    })
    return total
}

/**
 * 在树中按 id 查找主题及其父级。
 * @param root 根主题
 * @param id 目标主题 id
 * @returns 命中的主题与父级；未找到返回 null
 */
export function findMindMapNode(root: MindMapNode, id: string): { node: MindMapNode; parent: MindMapNode | null; index: number } | null {
    let found: { node: MindMapNode; parent: MindMapNode | null; index: number } | null = null
    walkMindMap(root, (node, parent) => {
        if (found || node.id !== id) return
        found = { node, parent, index: parent ? parent.children.indexOf(node) : 0 }
    })
    return found
}

/** 判断目标是否为指定主题的后代（改父子时防止成环） */
export function isMindMapDescendant(root: MindMapNode, ancestorId: string, candidateId: string): boolean {
    const found = findMindMapNode(root, ancestorId)
    if (!found) return false
    let result = false
    walkMindMap(found.node, node => {
        if (node.id === candidateId && node.id !== ancestorId) result = true
    })
    return result
}

/**
 * 把子树从原父级摘下。
 * @returns 摘下的主题；不存在时返回 null
 */
export function detachMindMapNode(root: MindMapNode, id: string): MindMapNode | null {
    if (root.id === id) return null
    const found = findMindMapNode(root, id)
    if (!found?.parent) return null
    const { parent, node } = found
    parent.children = parent.children.filter(child => child.id !== id)
    return node
}

/** 主题在树中的深度（根为 0） */
export function mindMapDepth(root: MindMapNode, id: string): number {
    let depth = -1
    walkMindMap(root, (node, _parent, currentDepth) => {
        if (node.id === id) depth = currentDepth
    })
    return depth
}

/**
 * 收集主题的子树 id 集合（含自身），用于批量样式操作。
 * @param root 根主题
 * @param id 起始主题 id
 * @returns id 集合
 */
export function collectMindMapSubtreeIds(root: MindMapNode, id: string): Set<string> {
    const found = findMindMapNode(root, id)
    const ids = new Set<string>()
    if (!found) return ids
    walkMindMap(found.node, node => ids.add(node.id))
    return ids
}

/**
 * 按子树 id 集合批量更新样式字段；传 undefined 表示清除该字段（回到继承）。
 * @param root 根主题（原地修改）
 * @param ids 目标主题 id 集合
 * @param patch 样式补丁
 */
export function patchMindMapStyle(root: MindMapNode, ids: Set<string>, patch: Partial<Pick<MindMapNode, "fontSize" | "color" | "bg">>) {
    walkMindMap(root, node => {
        if (!ids.has(node.id)) return
        if (patch.fontSize === undefined || patch.fontSize === null) delete node.fontSize
        else node.fontSize = patch.fontSize
        if (patch.color === undefined || patch.color === null) delete node.color
        else node.color = patch.color
        if (patch.bg === undefined || patch.bg === null) delete node.bg
        else node.bg = patch.bg
    })
}

/**
 * 相对字号调整：每个目标主题在当前生效字号基础上加/减一档，并写成绝对值。
 * @param root 根主题（原地修改）
 * @param ids 目标主题 id 集合
 * @param delta 相对增量（像素）
 * @param baseFontSize 根节点字号
 */
export function scaleMindMapFont(root: MindMapNode, ids: Set<string>, delta: number, baseFontSize: number) {
    const effective = resolveMindMapStyles(root, baseFontSize)
    walkMindMap(root, node => {
        if (!ids.has(node.id)) return
        const current = effective.get(node.id)?.fontSize ?? baseFontSize
        const next = Math.min(48, Math.max(9, Math.round(current + delta)))
        node.fontSize = next
    })
}

/** 主题生效样式（字号 / 颜色 / 底色，均支持继承） */
export interface MindMapEffectiveStyle {
    fontSize: number
    color: string
    bg: string | undefined
}

/**
 * 计算每个主题实际生效的样式：字号与颜色沿父级继承，根节点取全局基准。
 * @param root 根主题
 * @param baseFontSize 根节点字号
 * @param baseColor 根节点颜色
 * @returns 主题 id → 生效样式
 */
export function resolveMindMapStyles(
    root: MindMapNode,
    baseFontSize = DEFAULT_FONT_SIZE,
    baseColor = MIND_MAP_COLORS[0]
): Map<string, MindMapEffectiveStyle> {
    const result = new Map<string, MindMapEffectiveStyle>()
    function visit(node: MindMapNode, inherited: MindMapEffectiveStyle, depth: number) {
        const style: MindMapEffectiveStyle = {
            fontSize: typeof node.fontSize === "number" && node.fontSize > 0 ? node.fontSize : inherited.fontSize,
            color: node.color ?? inherited.color,
            bg: node.bg ?? (depth === 0 ? inherited.bg : undefined),
        }
        result.set(node.id, style)
        node.children.forEach(child => visit(child, style, depth + 1))
    }
    visit(root, { fontSize: baseFontSize, color: baseColor, bg: undefined }, 0)
    return result
}

/** 文本排版结果：按最大宽度换行后的行与盒子尺寸 */
export interface MindMapTextMetrics {
    lines: string[]
    width: number
    height: number
}

/** 换行所需的字符宽度（canvas 实测，失败时按字号估算） */
let measureCanvas: HTMLCanvasElement | null = null
let measureContext: CanvasRenderingContext2D | null = null

function getMeasureContext(): CanvasRenderingContext2D | null {
    if (measureContext) return measureContext
    if (typeof document === "undefined") return null
    measureCanvas = document.createElement("canvas")
    measureContext = measureCanvas.getContext("2d")
    return measureContext
}

/**
 * 测量一段文字在指定字号下的宽度。
 * @param text 文本
 * @param fontSize 字号
 * @param bold 是否粗体
 * @returns 像素宽度
 */
export function measureTextWidth(text: string, fontSize: number, bold = false): number {
    const context = getMeasureContext()
    if (!context) return text.length * fontSize * 0.6
    context.font = `${bold ? 600 : 400} ${fontSize}px ui-sans-serif, system-ui, sans-serif`
    return context.measureText(text).width
}

/**
 * 按最大宽度折行并给出盒子尺寸。
 * 中文按字断行，英文按空格优先断行；超长单词退化为按字断行。
 * @param text 主题文字
 * @param fontSize 字号
 * @param maxWidth 最大文本宽度
 * @param bold 是否粗体
 * @returns 行与盒子尺寸
 */
export function measureMindMapText(text: string, fontSize: number, maxWidth: number, bold = false): MindMapTextMetrics {
    const lineHeight = Math.round(fontSize * 1.35)
    const source = text.length > 0 ? text : " "
    const lines: string[] = []
    let current = ""
    const pushLine = () => {
        if (current.length > 0) lines.push(current)
        current = ""
    }
    for (const char of source) {
        if (char === "\n") {
            pushLine()
            continue
        }
        const next = current + char
        if (measureTextWidth(next, fontSize, bold) > maxWidth && current.length > 0) {
            // 英文单词尽量整词换行：回退到最近一个空格
            const breakAt = char === " " ? -1 : current.lastIndexOf(" ")
            if (breakAt > 0 && char !== " ") {
                const head = current.slice(0, breakAt)
                const tail = current.slice(breakAt + 1)
                lines.push(head)
                current = tail + char
            } else {
                pushLine()
                current = char === " " ? "" : char
            }
        } else {
            current = next
        }
    }
    pushLine()
    if (lines.length === 0) lines.push(" ")
    const width = Math.max(...lines.map(line => measureTextWidth(line, fontSize, bold)))
    return {
        lines,
        width: Math.ceil(width),
        height: Math.round(lineHeight * lines.length),
    }
}
