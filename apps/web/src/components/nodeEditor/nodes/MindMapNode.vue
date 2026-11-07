<script setup lang="ts">
import type { TreeData } from "@antv/g6"
import { CompactBoxLayout, DendrogramLayout, IndentedLayout, MindmapLayout } from "@antv/g6"
import { useVueFlow } from "@vue-flow/core"
import { nanoid } from "nanoid"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { NodeType } from "@/store/nodeEditorTypes"
import { detectImageFormat, encodeImageBytes, imageMimeForFormat } from "@/utils/imagePack"
import {
    DEFAULT_FONT_SIZE,
    MIND_MAP_COLORS,
    MIND_MAP_LAYOUTS,
    MIND_MAP_TOOLBAR_HEIGHT,
    type MindMapEffectiveStyle,
    type MindMapNode,
    measureMindMapText,
    readLayoutMeta,
    resolveMindMapStyles,
    walkMindMap,
    walkVisibleMindMap,
} from "@/utils/mindMap"
import {
    buildMindMapEdgePath,
    createBoundNodeMeasure,
    layoutMindMap,
    MIND_MAP_BOX,
    type MindMapLayoutNode,
    type MindMapLayoutResult,
    type MindMapTreeLayoutOptions,
} from "@/utils/mindMapLayout"
import MindMapToolbar from "../mindmap/MindMapToolbar.vue"
import MindNodeBox from "../mindmap/MindNodeBox.vue"
import { PALETTE_ITEMS, paletteNodeDefaults } from "../types"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const { updateNodeInternals, viewport } = useVueFlow()

/** G6 内置树布局函数：布局由 G6 算法算坐标，本组件只负责画盒子与连线 */
const TREE_LAYOUTS = {
    mindmap: MindmapLayout,
    "compact-box": CompactBoxLayout,
    indented: IndentedLayout,
    dendrogram: DendrogramLayout,
} as Record<string, (tree: TreeData, options: MindMapTreeLayoutOptions) => unknown>

/** 主题树（就地修改后统一提交，保证历史记录只有一个撤销步骤） */
const root = computed<MindMapNode>(() => props.data.tree as MindMapNode)
const layoutMeta = computed(() => readLayoutMeta(props.data.layout))
const baseFontSize = computed(() => Number(props.data.baseFontSize) || DEFAULT_FONT_SIZE)
const baseColor = computed(() => (typeof props.data.baseColor === "string" ? props.data.baseColor : MIND_MAP_COLORS[0]))

/** 选中 / 编辑 / 落点高亮 */
const selectedIds = ref(new Set<string>())
const editingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
/** 指针是否停在本节点上：键盘快捷键据此判断作用对象 */
const hovered = ref(false)

/** 沉浸展开：与角色节点同一口径，隐藏工具栏与外框，导图直接画在画布上 */
const focusMode = computed(() => props.data.focusMode === true)

function toggleFocus() {
    store.updateNodeData(props.id, { focusMode: !focusMode.value })
    // 沉浸查看会去掉工具栏与边框，绑定节点需要按新偏移重排
    nextTick(() => refreshBoundNodes())
}

/** 主题 id → 绑定的画布节点 id（只看可见主题，折叠分支里的主题不参与渲染） */
const boundTopics = computed(() => {
    const topics = new Map<string, string>()
    walkVisibleMindMap(root.value, node => {
        if (node.nodeId) topics.set(node.id, node.nodeId)
    })
    return topics
})

/** 绑定的画布节点 id → 主题 id（拖拽时反查主题） */
const boundTopicIds = computed(() => {
    const ids = new Map<string, string>()
    for (const [topicId, nodeId] of boundTopics.value) ids.set(nodeId, topicId)
    return ids
})

/** 绑定节点的实测尺寸（DOM 测量，键为画布节点 id） */
const boundSizes = ref(new Map<string, { width: number; height: number }>())

/** 绑定节点的实测尺寸：尚未测量时用兜底尺寸 */
function boundNodeSize(nodeId: string): { width: number; height: number } | undefined {
    return boundSizes.value.get(nodeId)
}

/** 测量绑定节点的真实尺寸，尺寸变化时写回响应式表触发重排 */
function measureBoundNodes() {
    let changed = false
    const next = new Map<string, { width: number; height: number }>()
    for (const nodeId of boundTopics.value.values()) {
        const element = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${nodeId}"]`)
        const width = element?.offsetWidth ?? 0
        const height = element?.offsetHeight ?? 0
        if (width <= 0 || height <= 0) continue
        next.set(nodeId, { width, height })
        const previous = boundSizes.value.get(nodeId)
        if (!previous || previous.width !== width || previous.height !== height) changed = true
    }
    // 折叠隐藏的节点保留上次尺寸：展开首帧就能按真实大小排版，不必等重新测量
    walkMindMap(root.value, topic => {
        if (!topic.nodeId || next.has(topic.nodeId)) return
        const previous = boundSizes.value.get(topic.nodeId)
        if (previous) next.set(topic.nodeId, previous)
    })
    if (changed || next.size !== boundSizes.value.size) boundSizes.value = next
}

/**
 * 主题盒子测量：文字按最大宽度折行后加上盒子内边距与边框，保证量出的尺寸与 CSS 渲染一致。
 * 根主题是加粗文本，需按粗体测宽，否则文字会被裁掉。
 * @param node 主题
 * @param style 生效样式
 * @param depth 层级
 * @returns 折行结果与盒子尺寸
 */
function measureBox(node: MindMapNode, style: { fontSize: number }, depth: number) {
    const text = measureMindMapText(node.text, style.fontSize, MIND_MAP_BOX.maxTextWidth, depth === 0)
    return { lines: text.lines, width: Math.max(MIND_MAP_BOX.minWidth, text.width + MIND_MAP_BOX.paddingX * 2 + 2), height: text.height + MIND_MAP_BOX.paddingY * 2 + 2 }
}

/**
 * 盒子测量：绑定主题用真实节点尺寸，普通主题按文字折行测量。
 * @param node 主题
 * @param style 生效样式
 * @param depth 层级
 */
function measureLayoutBox(node: MindMapNode, style: { fontSize: number }, depth: number) {
    if (node.nodeId) return boundMeasure(node, style as MindMapEffectiveStyle, depth)
    return measureBox(node, style, depth)
}

/** 绑定节点的尺寸测量：真实节点由 DOM 决定尺寸 */
const boundMeasure = createBoundNodeMeasure(boundNodeSize)

/** 排版结果：节点位置 + 连线路径 */
const layout = computed<MindMapLayoutResult>(() => {
    const styles = resolveMindMapStyles(root.value, baseFontSize.value, baseColor.value)
    return layoutMindMap(root.value, layoutMeta.value, styles, measureLayoutBox, TREE_LAYOUTS)
})

/** 绑定节点尺寸测量完成后再排一次版，首帧用兜底尺寸保证布局完整 */
watch(boundSizes, () => {
    if (boundTopics.value.size > 0) requestAnimationFrame(() => syncBoundNodes())
})

/** 画布尺寸 = 内容包围盒 + 内边距；下限与工具栏同宽，避免小图被工具栏撑出空白 */
const CANVAS_MIN_WIDTH = 232
const CANVAS_MIN_HEIGHT = 96

/** 内容放得下所需的最小画布尺寸 */
const contentSize = computed(() => ({
    width: Math.max(CANVAS_MIN_WIDTH, Math.ceil(layout.value.bounds.width + MIND_MAP_BOX.canvasPadding * 2)),
    height: Math.max(CANVAS_MIN_HEIGHT, Math.ceil(layout.value.bounds.height + MIND_MAP_BOX.canvasPadding * 2)),
}))

/** 用户手动拖出的画布尺寸；内容放不下时始终以内容为准自动撑大 */
function readCanvasExtent(key: "canvasWidth" | "canvasHeight") {
    const value = Number(props.data[key])
    return Number.isFinite(value) && value > 0 ? value : 0
}

const canvasSize = computed(() => ({
    width: Math.max(contentSize.value.width, readCanvasExtent("canvasWidth")),
    height: Math.max(contentSize.value.height, readCanvasExtent("canvasHeight")),
}))

/** 实际渲染的画布尺寸：沉浸查看时贴合内容，不保留手动撑出的空白 */
const renderSize = computed(() => (focusMode.value ? contentSize.value : canvasSize.value))

/** 右下角手柄拖动缩放：实时写回节点数据，松手时记一条历史 */
let resizeStart: { x: number; y: number; width: number; height: number; changed: boolean } | null = null

function startCanvasResize(event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    resizeStart = { x: event.clientX, y: event.clientY, width: canvasSize.value.width, height: canvasSize.value.height, changed: false }
    window.addEventListener("pointermove", handleCanvasResize)
    window.addEventListener("pointerup", endCanvasResize)
}

function handleCanvasResize(event: PointerEvent) {
    if (!resizeStart) return
    const zoom = viewport.value.zoom || 1
    const width = Math.max(contentSize.value.width, Math.round(resizeStart.width + (event.clientX - resizeStart.x) / zoom))
    const height = Math.max(contentSize.value.height, Math.round(resizeStart.height + (event.clientY - resizeStart.y) / zoom))
    if (width === canvasSize.value.width && height === canvasSize.value.height) return
    resizeStart.changed = true
    props.data.canvasWidth = width
    props.data.canvasHeight = height
}

function endCanvasResize() {
    if (resizeStart?.changed) store.commitHistory("调整画布尺寸")
    resizeStart = null
    window.removeEventListener("pointermove", handleCanvasResize)
    window.removeEventListener("pointerup", endCanvasResize)
}

/** 偏移后的主题位置：让内容落在内边距内 */
const nodes = computed(() =>
    layout.value.nodes.map(node => ({
        ...node,
        x: node.x - layout.value.bounds.minX + MIND_MAP_BOX.canvasPadding,
        y: node.y - layout.value.bounds.minY + MIND_MAP_BOX.canvasPadding,
    }))
)

/** 主题 id → 布局节点 */
const nodeMap = computed(() => new Map(nodes.value.map(node => [node.id, node])))

/** 子树节点总数（不含自身）：折叠圆点上的数字要反映被隐藏的全部主题 */
function countDescendants(node: MindMapNode): number {
    return node.children.reduce((total, child) => total + 1 + countDescendants(child), 0)
}

/** 主题 id → 是否有子级 / 是否折叠 / 被折叠隐藏的主题数 */
const nodeFlags = computed(() => {
    const flags = new Map<string, { hasChildren: boolean; collapsed: boolean; childCount: number }>()
    const visit = (node: MindMapNode) => {
        flags.set(node.id, {
            hasChildren: node.children.length > 0,
            collapsed: node.collapsed === true,
            childCount: countDescendants(node),
        })
        node.children.forEach(visit)
    }
    visit(root.value)
    return flags
})

/** 可见主题的 DFS 先序序列；时间轴按这个顺序串联 */
function collectVisibleOrder(node: MindMapNode): MindMapNode[] {
    const order: MindMapNode[] = []
    const visit = (current: MindMapNode) => {
        order.push(current)
        if (current.collapsed === true) return
        current.children.forEach(visit)
    }
    visit(node)
    return order
}

/** 父子连线：从主题树推导，避免折叠后的隐藏节点残留连线 */
const edges = computed(() => {
    const result: { id: string; source: string; target: string; path: string; color: string }[] = []
    const addEdge = (sourceId: string, targetId: string) => {
        const sourceLayout = nodeMap.value.get(sourceId)
        const targetLayout = nodeMap.value.get(targetId)
        if (!sourceLayout || !targetLayout) return
        result.push({
            id: `${sourceId}->${targetId}`,
            source: sourceId,
            target: targetId,
            path: buildMindMapEdgePath(sourceLayout, targetLayout, layoutMeta.value.edgeStyle, layoutMeta.value.edgeRouting),
            color: targetLayout.style.color,
        })
    }
    // 时间轴按阅读顺序连成一条蛇形链，父子线会横穿整张网格
    if (layoutMeta.value.kind === "timeline") {
        const order = collectVisibleOrder(root.value)
        for (let index = 1; index < order.length; index++) addEdge(order[index - 1].id, order[index].id)
        return result
    }
    const visit = (node: MindMapNode) => {
        if (node.collapsed === true) return
        node.children.forEach(child => addEdge(node.id, child.id))
        node.children.forEach(visit)
    }
    visit(root.value)
    return result
})

/**
 * 修改树并提交一次历史：所有导图操作都经由这里，保证撤销粒度一致。
 * 直接就地改节点数据，不经过 updateNodeData，避免它再单独记一条历史。
 * @param description 撤销说明
 * @param mutate 就地修改函数
 */
function commitTree(description: string, mutate: (rootNode: MindMapNode) => void) {
    mutate(root.value)
    store.commitHistory(description)
}

/** 画布内边距偏移：nodes 已把内容平移到画布内边距处，这里直接取画布坐标 */
const offsetOf = (node: MindMapLayoutNode) => ({ x: node.x, y: node.y })

/** 导图节点外框占位：边框 1px + 工具栏（沉浸查看两者都没有） */
const frameOffset = computed(() => (focusMode.value ? { x: 0, y: 0 } : { x: 1, y: MIND_MAP_TOOLBAR_HEIGHT + 1 }))

/**
 * 把绑定节点的位置同步到导图布局：节点用画布绝对坐标，
 * 由导图节点位置 + 外框 / 工具栏 / 内边距 + 主题盒子位置算出，标题条占据盒子顶部。
 */
function syncBoundNodes() {
    const boundIds = new Set<string>()
    const own = store.nodes.find(node => node.id === props.id)?.position ?? { x: 0, y: 0 }
    // 折叠分支里的绑定主题：主题不可见，但节点仍属于导图，需要隐藏而不是解绑
    const hiddenBound = new Set<string>()
    walkMindMap(root.value, topic => {
        if (topic.nodeId) hiddenBound.add(topic.nodeId)
    })
    for (const [topicId, nodeId] of boundTopics.value) {
        const layoutNode = nodeMap.value.get(topicId)
        const target = store.nodes.find(item => item.id === nodeId)
        if (!layoutNode || !target) continue
        const offset = offsetOf(layoutNode)
        const position = {
            x: own.x + frameOffset.value.x + offset.x,
            y: own.y + frameOffset.value.y + offset.y,
        }
        boundIds.add(nodeId)
        if (target.position.x !== position.x || target.position.y !== position.y) target.position = position
    }
    store.markBoundNodes([...boundIds])
    // 展开后节点才重新挂载，需要等 DOM 出现后再测量一次真实尺寸
    let revealed = false
    for (const nodeId of boundIds) {
        if (store.setBoundNodeHidden(nodeId, false)) revealed = true
    }
    if (revealed) requestAnimationFrame(() => refreshBoundNodes())
    // 解绑的节点恢复可拖动；位置保持不动，用户可继续自由摆放
    for (const node of store.nodes) {
        if (node.draggable === false && !boundIds.has(node.id) && !hiddenBound.has(node.id)) store.releaseBoundNode(node.id)
    }
    // 折叠的绑定节点保持绑定并隐藏，展开后重新跟随布局
    for (const nodeId of hiddenBound) {
        if (boundIds.has(nodeId)) continue
        store.markBoundNodes([nodeId])
        store.setBoundNodeHidden(nodeId, true)
    }
}

/** 绑定节点的尺寸观察器：沉浸切换 / 折叠 / 内容变化都会改变真实节点尺寸，需要重排 */
let boundResizeObserver: ResizeObserver | null = null
const observedBoundElements = new Map<Element, string>()

/** 只观察当前可见的绑定节点，节点解绑或被折叠时停止观察 */
function observeBoundNodes() {
    if (typeof ResizeObserver === "undefined") return
    if (!boundResizeObserver) {
        boundResizeObserver = new ResizeObserver(() => refreshBoundNodes())
    }
    const live = new Map<Element, string>()
    for (const nodeId of boundTopics.value.values()) {
        const element = document.querySelector(`.vue-flow__node[data-id="${nodeId}"]`)
        if (element) live.set(element, nodeId)
    }
    for (const element of observedBoundElements.keys()) {
        if (!live.has(element)) boundResizeObserver.unobserve(element)
    }
    for (const element of live.keys()) {
        if (!observedBoundElements.has(element)) boundResizeObserver.observe(element)
    }
    observedBoundElements.clear()
    for (const [element, nodeId] of live) observedBoundElements.set(element, nodeId)
}

/**
 * 全量同步：测量真实节点尺寸 → 重排布局 → 写回位置。
 * 尺寸变化与布局变化都经由这里，避免两个方向互相触发抖动。
 */
function refreshBoundNodes() {
    measureBoundNodes()
    observeBoundNodes()
    syncBoundNodes()
    requestAnimationFrame(() => updateNodeInternals([props.id]))
}

/**
 * 给主题插入一个新节点并绑定。
 * @param topicId 主题 id
 * @param type 节点类型
 * @param data 节点数据（会与调色板默认值合并）
 */
function insertNodeAsTopic(topicId: string, type: string, data: Record<string, any> = {}) {
    const item = PALETTE_ITEMS.find(entry => entry.type === type)
    const label = data.label ?? item?.label ?? String(type)
    const nodeId = nanoid()
    store.beginHistoryBatch()
    store.addNode({
        id: nodeId,
        type,
        position: { x: 0, y: 0 },
        data: { label, ...paletteNodeDefaults(type), ...data },
    })
    commitTree("绑定节点", rootNode => {
        const topic = findNode(rootNode, topicId)
        if (!topic) return
        topic.nodeId = nodeId
        // 占位主题改用节点标题，避免标题条写着“新主题”
        if (!topic.text.trim() || topic.text === "新主题") topic.text = label
    })
    store.endHistoryBatch("绑定节点")
    selectOnly(topicId)
    nextTick(() => {
        refreshBoundNodes()
        // 节点首次挂载后尺寸才有值，再同步一次把布局对齐真实尺寸
        requestAnimationFrame(() => refreshBoundNodes())
    })
}

/**
 * 把画布节点拖入主题：在落点主题下新建子主题并绑定，
 * 与导图内部拖拽一致——只增加子级，不改动落点主题本身。
 * @param topicId 落点主题 id
 * @param nodeId 画布节点 id
 */
function bindNodeToTopic(topicId: string, nodeId: string) {
    const node = store.nodes.find(item => item.id === nodeId)
    const topic = findNode(root.value, topicId)
    if (!node || !topic) return
    const label =
        (typeof node.data?.label === "string" && node.data.label.trim()) ||
        PALETTE_ITEMS.find(item => item.type === node.type)?.label ||
        "新主题"
    const childId = nanoid(8)
    commitTree("绑定节点", rootNode => {
        const target = findNode(rootNode, topicId)
        if (!target) return
        delete target.collapsed
        target.children.push({ id: childId, text: label, nodeId, children: [] })
    })
    selectOnly(childId)
    nextTick(() => {
        refreshBoundNodes()
        requestAnimationFrame(() => refreshBoundNodes())
    })
}

/** 解绑主题：节点归还画布，主题退回纯文字 */
function unbindTopic(topicId: string) {
    commitTree("解除绑定", rootNode => {
        const topic = findNode(rootNode, topicId)
        if (topic) delete topic.nodeId
    })
    nextTick(() => refreshBoundNodes())
}

/** 选中单个主题（清空其它选择） */
function selectOnly(id: string) {
    selectedIds.value = new Set([id])
}

/** 点击主题：Shift 追加选择，否则单选 */
function handleNodeClick(event: MouseEvent, id: string) {
    if (event.shiftKey) {
        const next = new Set(selectedIds.value)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        selectedIds.value = next
        return
    }
    selectOnly(id)
}

/** 双击进入编辑 */
function handleNodeDoubleClick(id: string) {
    editingId.value = id
}

/**
 * 提交文字编辑；绑定主题的标题同步到真实节点，避免两处标题不一致。
 * @param id 主题 id
 * @param text 新文字
 */
function commitText(id: string, text: string) {
    editingId.value = null
    const nodeId = boundTopics.value.get(id)
    commitTree("编辑主题", rootNode => {
        const target = findNode(rootNode, id)
        if (target) target.text = text
    })
    if (nodeId) store.updateNodeData(nodeId, { label: text })
}

/** 取消编辑 */
function cancelEdit() {
    editingId.value = null
}

/** 折叠 / 展开子树 */
function toggleCollapse(id: string) {
    commitTree("折叠主题", rootNode => {
        const target = findNode(rootNode, id)
        if (target) {
            if (target.collapsed) delete target.collapsed
            else target.collapsed = true
        }
    })
}

/** 在树中查找主题（就地操作，不复制） */
function findNode(node: MindMapNode, id: string): MindMapNode | null {
    if (node.id === id) return node
    for (const child of node.children) {
        const found = findNode(child, id)
        if (found) return found
    }
    return null
}

/** 当前操作目标：有选中项用选中项，否则用根主题 */
const activeIds = computed(() => (selectedIds.value.size > 0 ? selectedIds.value : new Set([root.value.id])))

/** 加子主题 */
function addChild(id?: string) {
    const parentId = id ?? [...activeIds.value][0]
    const newId = createId()
    commitTree("添加子主题", rootNode => {
        const parent = findNode(rootNode, parentId) ?? rootNode
        delete parent.collapsed
        parent.children.push({ id: newId, text: "新主题", children: [] })
    })
    selectOnly(newId)
    editingId.value = newId
}

/** 加同级主题；根主题上等价于加子主题 */
function addSibling(targetId?: string) {
    const id = targetId ?? [...activeIds.value][0]
    if (id === root.value.id) {
        addChild(root.value.id)
        return
    }
    const newId = createId()
    commitTree("添加同级主题", rootNode => {
        const located = findParent(rootNode, id)
        if (!located) {
            rootNode.children.push({ id: newId, text: "新主题", children: [] })
            return
        }
        const index = located.parent.children.indexOf(located.node)
        located.parent.children.splice(index + 1, 0, { id: newId, text: "新主题", children: [] })
    })
    selectOnly(newId)
    editingId.value = newId
}

/** 查找主题的父级 */
function findParent(node: MindMapNode, id: string): { parent: MindMapNode; node: MindMapNode } | null {
    for (const child of node.children) {
        if (child.id === id) return { parent: node, node: child }
        const found = findParent(child, id)
        if (found) return found
    }
    return null
}

/** 删除选中主题（连同子树）；根主题不允许删除 */
function removeSelected() {
    const ids = [...activeIds.value].filter(id => id !== root.value.id)
    if (ids.length === 0) return
    // 被删主题绑定的节点留在画布原位，只解除绑定（refreshBoundNodes 会恢复可拖动）
    commitTree("删除主题", rootNode => {
        ids.forEach(id => {
            const located = findParent(rootNode, id)
            if (located) located.parent.children = located.parent.children.filter(child => child.id !== id)
        })
    })
    selectedIds.value = new Set()
    editingId.value = null
    nextTick(() => refreshBoundNodes())
}

/** 生成新主题 id */
function createId() {
    return Math.random().toString(36).slice(2, 10)
}

/** 字号调整：作用于选中主题及其子树 */
function changeFontSize(delta: number) {
    const styles = resolveMindMapStyles(root.value, baseFontSize.value, baseColor.value)
    const ids = activeIds.value
    commitTree("调整字号", rootNode => {
        const apply = (node: MindMapNode) => {
            if (ids.has(node.id)) {
                const current = styles.get(node.id)?.fontSize ?? baseFontSize.value
                node.fontSize = Math.min(48, Math.max(9, Math.round(current + delta)))
            }
            node.children.forEach(apply)
        }
        apply(rootNode)
    })
}

/** 颜色调整：作用于选中主题及其子树 */
function changeColor(color: string | undefined) {
    const ids = activeIds.value
    commitTree("调整颜色", rootNode => {
        const apply = (node: MindMapNode) => {
            if (ids.has(node.id)) {
                if (color) node.color = color
                else delete node.color
            }
            node.children.forEach(apply)
        }
        apply(rootNode)
    })
}

/** 切换布局形态 */
function changeLayout(kind: string) {
    if (props.data.layout === kind) return
    props.data.layout = kind
    store.commitHistory("切换布局")
    nextTick(() => refreshBoundNodes())
}

/** 主题树 / 布局变化后通知 Vue Flow 重新测量节点尺寸，并让绑定节点跟随新布局 */
watch(
    () => [renderSize.value.width, renderSize.value.height, layout.value],
    () => {
        requestAnimationFrame(() => {
            updateNodeInternals([props.id])
            refreshBoundNodes()
        })
    }
)

/** 框选矩形（画布坐标系，仅拖动超过阈值后出现） */
const selectionRect = ref<{ x: number; y: number; width: number; height: number } | null>(null)

/** 指针是否落在本导图绑定的真实节点上（这类节点自己接管事件，导图不接管框选） */
function isBoundNodeTarget(target: HTMLElement | null): boolean {
    const host = target?.closest<HTMLElement>(".vue-flow__node")
    return Boolean(host?.dataset.id && host.dataset.id !== props.id)
}

/** 画布空白处按下：与外层保持一致，拖动平移画布，按住 Shift 拖动才框选 */
function handleCanvasPointerDown(event: PointerEvent) {
    if (event.button !== 0 || editingId.value) return
    // 点在主题上时由主题自己接管；点在绑定主题的真实节点上时交给节点本身
    if ((event.target as HTMLElement).closest(".mind-node")) return
    if (isBoundNodeTarget(event.target as HTMLElement | null)) return
    // 非 Shift：不拦截，放行给外层 Vue Flow 平移画布；仅在未拖动（点击）时清空选择
    if (!event.shiftKey) {
        const startX = event.clientX
        const startY = event.clientY
        let moved = false
        const onMove = (moveEvent: PointerEvent) => {
            if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return
            moved = true
        }
        const onUp = () => {
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", onUp)
            if (!moved) selectedIds.value = new Set()
        }
        window.addEventListener("pointermove", onMove)
        window.addEventListener("pointerup", onUp)
        return
    }
    event.preventDefault()
    const start = canvasPoint(event)
    let moved = false
    const onMove = (moveEvent: PointerEvent) => {
        const current = canvasPoint(moveEvent)
        const dx = current.x - start.x
        const dy = current.y - start.y
        if (!moved && Math.hypot(dx, dy) < 4) return
        moved = true
        selectionRect.value = {
            x: Math.min(start.x, current.x),
            y: Math.min(start.y, current.y),
            width: Math.abs(dx),
            height: Math.abs(dy),
        }
    }
    const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        const rect = selectionRect.value
        selectionRect.value = null
        if (!moved || !rect) {
            // 未拖动即点击空白：清空选择
            selectedIds.value = new Set()
            return
        }
        const hit = nodes.value.filter(node => !boundTopics.value.has(node.id) && intersects(rect, node)).map(node => node.id)
        selectedIds.value = new Set(hit)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
}

/** 把指针换算成画布内坐标 */
function canvasPoint(event: PointerEvent | MouseEvent) {
    const canvas = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${props.id}"] .mind-canvas`)
    const rect = canvas?.getBoundingClientRect()
    const pane = document.querySelector<HTMLElement>(".vue-flow__transformationpane")
    const zoom = pane ? new DOMMatrix(getComputedStyle(pane).transform).a || 1 : 1
    if (!rect) return { x: 0, y: 0 }
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
}

/** 矩形是否与主题盒子相交 */
function intersects(rect: { x: number; y: number; width: number; height: number }, node: MindMapLayoutNode) {
    return rect.x < node.x + node.width && node.x < rect.x + rect.width && rect.y < node.y + node.height && node.y < rect.y + rect.height
}

// 拖拽：拖整枝 + 落到主题上改父子。位置始终由布局算，拖动只表达结构关系。
// 画布内的一切指针操作都归本导图（Vue Flow 只在标题栏可拖整块），所以这里不需要 stopPropagation。
let dragState: {
    id: string
    startX: number
    startY: number
    moved: boolean
    fromNode: boolean
    /** 从绑定卡片发起时的画布节点 id */
    nodeId?: string
    /** 指针已拖出导图：节点解绑并跟随指针自由移动 */
    detached?: boolean
    /** 解绑瞬间指针相对节点左上角的偏移（画布坐标） */
    grab?: { x: number; y: number }
} | null = null

/** 绑定节点上不参与主题拖拽的区域：表单控件、链接、连线端口、内层导图 */
const DRAG_IGNORE_SELECTOR = "input, textarea, select, a[href], [contenteditable='true'], .vue-flow__handle, .mind-canvas"
/** 非沉浸模式下的额外禁拖区域：保留按钮与 nodrag 控件的原生交互（沉浸模式没有标题栏，整卡都要能拖） */
const DRAG_IGNORE_CONTROL_SELECTOR = `${DRAG_IGNORE_SELECTOR}, button, .nodrag`

/**
 * 按下主题开始拖拽（编辑中不拖）。
 * 绑定主题拖的是它自己的真实节点（不拖整枝），其余主题照旧拖整枝。
 * @param event 指针事件
 * @param id 主题 id
 * @param fromNode 是否从绑定节点卡片发起
 * @param nodeId 绑定卡片对应的画布节点 id
 */
function handlePointerDown(event: PointerEvent, id: string, fromNode = false, nodeId?: string) {
    if (event.button !== 0 || editingId.value) return
    event.preventDefault()
    let grab: { x: number; y: number } | undefined
    if (fromNode && nodeId) {
        // 卡片从一开始就跟随指针，拖出画布时不会因为位置滞后而错位
        const node = store.nodes.find(item => item.id === nodeId)
        if (node) {
            const flow = clientToFlow(event.clientX, event.clientY)
            grab = { x: flow.x - node.position.x, y: flow.y - node.position.y }
        }
    }
    dragState = { id, startX: event.clientX, startY: event.clientY, moved: false, fromNode, nodeId, grab }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
}

/** 拖过卡片后吞掉随后的一次 click，避免拖动结束顺带触发卡片的点击行为（如打开选择弹窗） */
function swallowNextClick() {
    const swallow = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        window.removeEventListener("click", swallow, true)
    }
    window.addEventListener("click", swallow, true)
    setTimeout(() => window.removeEventListener("click", swallow, true), 300)
}

/**
 * 绑定节点渲染在导图之外的 Vue Flow 节点里，捕获阶段把按在卡片上的指针事件接管成主题拖拽：
 * 拖动卡片等价于拖动对应主题（落点改父子），同时 preventDefault 抑制画布平移。
 * @param event 指针事件
 */
function handleBoundNodePointerDown(event: PointerEvent) {
    if (event.button !== 0 || editingId.value) return
    const target = event.target as HTMLElement | null
    if (!target) return
    const host = target.closest<HTMLElement>(".vue-flow__node")
    const nodeId = host?.dataset.id
    const topicId = nodeId ? boundTopicIds.value.get(nodeId) : undefined
    if (!topicId) return
    const node = store.nodes.find(item => item.id === nodeId)
    if (node?.data?.locked === true) return
    // 沉浸模式没有标题栏，整块内容都可能被标成 nodrag 或包在 button 里，只保留表单控件的原生交互
    const focusMode = node?.data?.focusMode === true
    if (target.closest(focusMode ? DRAG_IGNORE_SELECTOR : DRAG_IGNORE_CONTROL_SELECTOR)) return
    handlePointerDown(event, topicId, true, nodeId)
}

/** 从画布拖动普通节点到本导图主题上的落点跟踪 */
let externalDrag: {
    nodeId: string
    startX: number
    startY: number
    moved: boolean
    /** 沉浸模式内容整块是 nodrag，Vue Flow 不会拖，由这里接管移动 */
    manual: boolean
    grab?: { x: number; y: number }
} | null = null

/**
 * 画布普通节点按下：跟踪它是否会被拖到本导图的主题上（落点以指针位置判定）。
 * 普通节点交给 Vue Flow 拖动；沉浸模式卡片自己接管移动。
 * @param event 指针事件
 */
function handleExternalNodePointerDown(event: PointerEvent) {
    if (event.button !== 0 || editingId.value) return
    const target = event.target as HTMLElement | null
    if (!target) return
    const host = target.closest<HTMLElement>(".vue-flow__node")
    const nodeId = host?.dataset.id
    if (!nodeId || nodeId === props.id || boundTopicIds.value.has(nodeId)) return
    const node = store.nodes.find(item => item.id === nodeId)
    if (!node || node.draggable === false || node.data?.locked === true) return
    // 沉浸模式没有标题栏，整块内容都可能被标成 nodrag 或包在 button 里，只保留表单控件的原生交互
    const focusMode = node.data?.focusMode === true
    if (target.closest(focusMode ? DRAG_IGNORE_SELECTOR : DRAG_IGNORE_CONTROL_SELECTOR)) return
    const manual = Boolean(target.closest(".nodrag"))
    let grab: { x: number; y: number } | undefined
    if (manual) {
        // 抑制 mousedown：挡掉画布平移与 Vue Flow 拖动，改为自己移动节点
        event.preventDefault()
        const flow = clientToFlow(event.clientX, event.clientY)
        grab = { x: flow.x - node.position.x, y: flow.y - node.position.y }
    }
    externalDrag = { nodeId, startX: event.clientX, startY: event.clientY, moved: false, manual, grab }
    window.addEventListener("pointermove", handleExternalNodePointerMove)
    window.addEventListener("pointerup", handleExternalNodePointerUp)
}

/** 拖动普通节点中：指针落在主题上时显示虚线落点；接管移动的节点实时跟随指针 */
function handleExternalNodePointerMove(event: PointerEvent) {
    const state = externalDrag
    if (!state) return
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 4) state.moved = true
    if (!state.moved) return
    if (state.manual && state.grab) {
        const node = store.nodes.find(item => item.id === state.nodeId)
        if (node) {
            const flow = clientToFlow(event.clientX, event.clientY)
            node.position = { x: flow.x - state.grab.x, y: flow.y - state.grab.y }
        }
    }
    dropTargetId.value = findTopicAtClientPoint({ x: event.clientX, y: event.clientY })
}

/** 松开普通节点：落在主题上则作为子主题绑定，否则保持原样（接管移动时提交一次历史） */
function handleExternalNodePointerUp() {
    const state = externalDrag
    const target = dropTargetId.value
    externalDrag = null
    dropTargetId.value = null
    window.removeEventListener("pointermove", handleExternalNodePointerMove)
    window.removeEventListener("pointerup", handleExternalNodePointerUp)
    if (!state || !state.moved) return
    if (state.manual) swallowNextClick()
    if (target) {
        bindNodeToTopic(target, state.nodeId)
        return
    }
    if (state.manual) store.commitHistory("移动节点")
}

/** 屏幕坐标 → 画布坐标（node.position 的坐标系） */
function clientToFlow(clientX: number, clientY: number) {
    const pane = document.querySelector<HTMLElement>(".vue-flow__transformationpane")
    const rect = pane?.getBoundingClientRect()
    if (!pane || !rect) return { x: 0, y: 0 }
    const zoom = new DOMMatrix(getComputedStyle(pane).transform).a || 1
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom }
}

/** 指针是否已经完全离开导图节点（含工具栏与外框） */
function isOutsideMindMap(event: PointerEvent) {
    const host = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${props.id}"]`)
    const rect = host?.getBoundingClientRect()
    if (!rect) return false
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
}

/**
 * 绑定卡片拖出导图：立即解绑，节点转为普通节点（位置已在跟随指针）。
 * 历史在松手时统一提交，撤销可以一次还原绑定与位置。
 * @param state 拖拽状态
 */
function detachBoundNode(state: NonNullable<typeof dragState>) {
    const topic = findNode(root.value, state.id)
    if (!topic) return
    if (state.id === root.value.id) {
        // 根主题不能删除，退回普通文字主题
        delete topic.nodeId
    } else {
        // 其余绑定主题随节点一起移除，用户给它加的子主题上移一级
        const located = findParent(root.value, state.id)
        if (located) {
            const index = located.parent.children.indexOf(located.node)
            located.parent.children.splice(index, 1, ...located.node.children)
        }
    }
    state.detached = true
    dropTargetId.value = null
}

/** 让卡片节点跟随指针移动 */
function moveCardNode(state: NonNullable<typeof dragState>, event: PointerEvent) {
    const node = state.nodeId ? store.nodes.find(item => item.id === state.nodeId) : undefined
    if (!node || !state.grab) return
    const flow = clientToFlow(event.clientX, event.clientY)
    node.position = { x: flow.x - state.grab.x, y: flow.y - state.grab.y }
}

/** 拖动中：卡片实时跟随指针，命中主题时高亮落点；拖出导图则解绑成普通节点 */
function handlePointerMove(event: PointerEvent) {
    const state = dragState
    if (!state) return
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 4) state.moved = true
    if (!state.moved) return
    if (state.fromNode && state.nodeId) {
        moveCardNode(state, event)
        if (!state.detached && isOutsideMindMap(event)) detachBoundNode(state)
        dropTargetId.value = findTopicAtClientPoint({ x: event.clientX, y: event.clientY })
        return
    }
    dropTargetId.value = findDropTarget(event)
}

/** 松开：落在其它主题上则把拖动主题（连同选中集合）挂到该主题下 */
function handlePointerUp() {
    const state = dragState
    const target = dropTargetId.value
    dragState = null
    dropTargetId.value = null
    window.removeEventListener("pointermove", handlePointerMove)
    window.removeEventListener("pointerup", handlePointerUp)
    if (!state) return
    if (state.moved && state.fromNode) swallowNextClick()
    if (state.detached) {
        // 拖出后落在主题上则重新绑定，否则保持普通节点；历史在这里一次提交
        if (state.moved && target && state.nodeId) bindNodeToTopic(target, state.nodeId)
        else if (state.moved) store.commitHistory("拖出导图")
        return
    }
    if (!state.moved) return
    if (!target) {
        // 没落到主题：卡片回到导图布局位置
        if (state.fromNode && state.nodeId) refreshBoundNodes()
        return
    }
    if (state.fromNode && state.nodeId) syncBoundNodes()
    const moving = selectedIds.value.has(state.id) ? [...selectedIds.value] : [state.id]
    reparent(moving, target)
}

/**
 * 命中检测：把指针换算到内容坐标系后逐个盒子测试。
 * 以画布元素自身的包围盒为基准（节点外壳还含工具栏高度），缩放从画布 transform 读取。
 * @param event 指针事件
 * @returns 命中的主题 id
 */
function findDropTarget(event: PointerEvent): string | null {
    return findTopicAtClientPoint({ x: event.clientX, y: event.clientY })
}

/**
 * 按屏幕坐标命中主题盒子。
 * @param point 屏幕坐标
 * @returns 命中的主题 id
 */
function findTopicAtClientPoint(point: { x: number; y: number }): string | null {
    const host = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${props.id}"]`)
    const canvas = host?.querySelector<HTMLElement>(".mind-canvas")
    if (!host || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    const pane = document.querySelector<HTMLElement>(".vue-flow__transformationpane")
    const matrix = new DOMMatrix(pane ? getComputedStyle(pane).transform : "matrix(1,0,0,1,0,0)")
    const zoom = matrix.a || 1
    const x = (point.x - rect.left) / zoom
    const y = (point.y - rect.top) / zoom
    // 命中检测必须用偏移后的坐标：nodes 已把内容平移到画布内边距处。
    // 绑定主题的实际内容由真实节点接管指针事件，只有标题条参与导图内部拖拽
    const hit = (node: MindMapLayoutNode) => node.x <= x && x <= node.x + node.width && node.y <= y && y <= node.y + node.height
    for (const node of nodes.value) {
        if (boundTopics.value.has(node.id) && hit(node)) return node.id
    }
    for (const node of nodes.value) {
        if (!boundTopics.value.has(node.id) && hit(node)) return node.id
    }
    return null
}

/**
 * 批量改父子：目标不能是自身或自身后代，根主题不参与移动。
 * @param sourceIds 被拖动的主题
 * @param targetId 落点主题
 */
function reparent(sourceIds: string[], targetId: string) {
    const rootId = root.value.id
    const movable = sourceIds.filter(id => id !== rootId && id !== targetId && !isDescendant(root.value, id, targetId))
    if (movable.length === 0) return
    commitTree("移动主题", rootNode => {
        const target = findNode(rootNode, targetId)
        if (!target) return
        delete target.collapsed
        movable.forEach(id => {
            const located = findParent(rootNode, id)
            if (!located) return
            // 目标若在被移动分支内部，取出的顺序会影响结果，逐个校验
            located.parent.children = located.parent.children.filter(child => child.id !== id)
            target.children.push(located.node)
        })
    })
    selectOnly(movable[0])
    nextTick(() => refreshBoundNodes())
}

/** 判断 candidate 是否为 ancestor 的后代 */
function isDescendant(node: MindMapNode, ancestorId: string, candidateId: string): boolean {
    const ancestor = findNode(node, ancestorId)
    if (!ancestor) return false
    let found = false
    const visit = (current: MindMapNode) => {
        if (current.id === candidateId) found = true
        current.children.forEach(visit)
    }
    ancestor.children.forEach(visit)
    return found
}

/**
 * 键盘：Tab 加子主题、Enter 加同级主题、Delete 只删除导图内选中的主题。
 * 监听放在捕获阶段：外层的 NodeEditor 也在 window 上听 Delete，冒泡阶段它会先删除整个节点，
 * 只有捕获 + 处理时截断事件，才能把删除限定在导图内部。
 */
function handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable) return
    if (event.key === "Escape" && menu.value) {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeMenu()
        return
    }
    if (editingId.value) return

    // Esc 退出沉浸查看
    if (event.key === "Escape" && focusMode.value) {
        event.preventDefault()
        event.stopImmediatePropagation()
        toggleFocus()
        return
    }

    // 没有选中主题时不接管 Delete，交给外层删除整个导图节点
    if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.value.size === 0) return
        event.preventDefault()
        event.stopImmediatePropagation()
        removeSelected()
        return
    }

    // Tab / Enter：指针停在这张导图上、处于沉浸查看，或内部已有选中主题（点击主题后鼠标可能已移开）
    if (!hovered.value && !focusMode.value && selectedIds.value.size === 0) return
    if (event.key === "Tab") {
        event.preventDefault()
        event.stopImmediatePropagation()
        addChild()
    } else if (event.key === "Enter") {
        event.preventDefault()
        event.stopImmediatePropagation()
        addSibling()
    }
}

window.addEventListener("keydown", handleKeyDown, true)

/** 组件根元素：用于判断点击是否落在导图内部 */
const rootRef = ref<HTMLElement | null>(null)

/**
 * 点击导图之外（画布空白、其它节点）时清空内部选中，避免后续快捷键仍作用在旧主题上。
 * 工具栏的浮层 Teleport 到 body，不在根元素内，需要按标记单独放行。
 */
function handleOutsidePointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (rootRef.value?.contains(target)) return
    if (target.closest("[data-mind-map-popover]")) return
    selectedIds.value = new Set()
}

window.addEventListener("pointerdown", handleOutsidePointerDown, true)
window.addEventListener("pointerdown", handleBoundNodePointerDown, true)
window.addEventListener("pointerdown", handleExternalNodePointerDown, true)

/** 指针当前悬停的主题；绑定卡片渲染在导图节点之外，需要单独跟踪才能显示折叠圆点 */
const hoveredTopicId = ref<string | null>(null)

/**
 * 跟踪指针悬停的主题：绑定卡片是独立的 Vue Flow 节点，按节点 id 反查主题。
 * @param event 指针事件
 */
function handlePointerOver(event: PointerEvent) {
    const target = event.target as HTMLElement | null
    if (!target) return
    const host = target.closest<HTMLElement>(".vue-flow__node")
    if (host?.dataset.id === props.id) {
        hoveredTopicId.value = target.closest<HTMLElement>("[data-mind-id]")?.dataset.mindId ?? null
        return
    }
    hoveredTopicId.value = host?.dataset.id ? (boundTopicIds.value.get(host.dataset.id) ?? null) : null
}

/** 指针移出窗口时清除悬停态，否则圆点会一直挂着 */
function handlePointerOut(event: PointerEvent) {
    if (!event.relatedTarget) hoveredTopicId.value = null
}

window.addEventListener("pointerover", handlePointerOver, true)
window.addEventListener("pointerout", handlePointerOut, true)

/** 挂载后先同步一次绑定关系：旧图里的绑定节点需要重新挂到本导图下 */
onMounted(() => {
    nextTick(() => refreshBoundNodes())
})

onBeforeUnmount(() => {
    boundResizeObserver?.disconnect()
    observedBoundElements.clear()
    window.removeEventListener("keydown", handleKeyDown, true)
    window.removeEventListener("pointerdown", handleOutsidePointerDown, true)
    window.removeEventListener("pointerdown", handleBoundNodePointerDown, true)
    window.removeEventListener("pointerdown", handleExternalNodePointerDown, true)
    window.removeEventListener("pointermove", handleExternalNodePointerMove)
    window.removeEventListener("pointerup", handleExternalNodePointerUp)
    window.removeEventListener("pointerover", handlePointerOver, true)
    window.removeEventListener("pointerout", handlePointerOut, true)
    window.removeEventListener("pointermove", handlePointerMove)
    window.removeEventListener("pointerup", handlePointerUp)
    window.removeEventListener("pointermove", handleCanvasResize)
    window.removeEventListener("pointerup", endCanvasResize)
})

/** 右键菜单：命中主题时以其为操作目标 */
const menu = ref<{ x: number; y: number; id: string } | null>(null)
const menuEl = ref<HTMLElement | null>(null)

function openContextMenu(event: MouseEvent, id: string) {
    event.preventDefault()
    event.stopPropagation()
    if (!selectedIds.value.has(id)) selectOnly(id)
    menu.value = { x: event.clientX, y: event.clientY, id }
    // 菜单渲染后按实际尺寸收回视口内，贴边右键时不被截断
    nextTick(() => {
        const el = menuEl.value
        const current = menu.value
        if (!el || !current) return
        const rect = el.getBoundingClientRect()
        menu.value = {
            ...current,
            x: Math.max(8, Math.min(current.x, window.innerWidth - rect.width - 8)),
            y: Math.max(8, Math.min(current.y, window.innerHeight - rect.height - 8)),
        }
    })
}

function closeMenu() {
    menu.value = null
}

/** 右键目标主题的文字 / 子级 / 折叠状态 */
const menuText = computed(() => (menu.value ? (findNode(root.value, menu.value.id)?.text ?? "") : ""))
const menuFlags = computed(() => (menu.value ? nodeFlags.value.get(menu.value.id) : undefined))
/** 主题自己声明的颜色（未声明时为继承，不在色板上标记） */
const menuExplicitColor = computed(() => (menu.value ? findNode(root.value, menu.value.id)?.color : undefined))

/** 菜单动作统一先关菜单再执行，避免菜单元素参与后续焦点处理 */
function runMenuAction(action: () => void) {
    closeMenu()
    action()
}

function menuEdit() {
    const id = menu.value?.id
    if (id) runMenuAction(() => {
        selectOnly(id)
        editingId.value = id
    })
}

function menuAddChild() {
    const id = menu.value?.id
    if (id) runMenuAction(() => addChild(id))
}

function menuAddSibling() {
    const id = menu.value?.id
    if (id) runMenuAction(() => addSibling(id))
}

function menuToggleCollapse() {
    const id = menu.value?.id
    if (id) runMenuAction(() => toggleCollapse(id))
}

function menuFontSize(delta: number) {
    runMenuAction(() => changeFontSize(delta))
}

function menuColor(color: string | undefined) {
    runMenuAction(() => changeColor(color))
}

function menuRemove() {
    runMenuAction(() => removeSelected())
}

/** 右键主题的绑定状态：已绑定时菜单显示解绑，否则显示插入节点 */
const menuBound = computed(() => Boolean(menu.value && findNode(root.value, menu.value.id)?.nodeId))

/** 可作为主题插入的节点：能独立展示且不依赖上游的节点类型 */
const MIND_MAP_INSERT_TYPES = [
    NodeType.NUMBER_INPUT,
    NodeType.TEXT_INPUT,
    NodeType.CHAR_INPUT,
    NodeType.MELEE_WEAPON_INPUT,
    NodeType.RANGED_WEAPON_INPUT,
    NodeType.MOD_INPUT,
    NodeType.BUFF_INPUT,
    NodeType.EFFECT_INPUT,
    NodeType.PET_INPUT,
    NodeType.ENEMY_INPUT,
    NodeType.CUSTOM_VARS_INPUT,
    NodeType.DOT_INPUT,
    NodeType.ADD_CALC,
    NodeType.MULTIPLY_CALC,
    NodeType.EXPRESSION_CALC,
    NodeType.VECTOR_CALC,
    NodeType.ATTR_CALC,
    NodeType.WEAPON_ATTR_CALC,
    NodeType.AST_EXPRESSION_CALC,
    NodeType.CUSTOM_EXPRESSION,
    NodeType.BUFF_MERGE,
    NodeType.ATTR_OUTPUT,
    NodeType.WEAPON_OUTPUT,
    NodeType.CHART,
    NodeType.VECTOR_INPUT,
    NodeType.VECTOR_DECOMPOSE,
    NodeType.CARD,
    NodeType.IMAGE,
    NodeType.LABEL,
    NodeType.JSON_BUILD,
    NodeType.ONLINE_BUILD,
    NodeType.JSON_EXPORT,
]

/** 插入菜单项：按调色板顺序取标签与图标，过滤掉不适用的类型 */
const MIND_MAP_INSERT_ITEMS = PALETTE_ITEMS.filter(item => MIND_MAP_INSERT_TYPES.includes(item.type))

/** 插入菜单折叠：类型太多，默认只展开常用项 */
const insertMenuExpanded = ref(false)
const INSERT_ITEM_PREVIEW = 6
const visibleInsertItems = computed(() =>
    insertMenuExpanded.value ? MIND_MAP_INSERT_ITEMS : MIND_MAP_INSERT_ITEMS.slice(0, INSERT_ITEM_PREVIEW)
)

function menuInsertNode(type: string) {
    const id = menu.value?.id
    if (id) runMenuAction(() => insertNodeAsTopic(id, type))
}

function menuUnbind() {
    const id = menu.value?.id
    if (id) runMenuAction(() => unbindTopic(id))
}

/** 粘贴图片：图片文件编码成内嵌数据，作为新的绑定节点挂到选中主题下 */
const MAX_EMBED_BYTES = 2 * 1024 * 1024

/**
 * 把剪贴板里的图片插成主题的绑定节点。
 * @param topicId 目标主题 id
 * @param file 图片文件
 */
async function pasteImageAsTopic(topicId: string, file: File) {
    if (file.size > MAX_EMBED_BYTES) return
    try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const format = detectImageFormat(bytes)
        const { encoded } = encodeImageBytes(bytes)
        insertNodeAsTopic(topicId, NodeType.IMAGE, {
            label: file.name || "图片",
            imageMode: "embed",
            imageData: encoded,
            imageMime: file.type || imageMimeForFormat(format) || "application/octet-stream",
            imageName: file.name,
            imageWidth: 320,
            imageHeight: 200,
        })
    } catch {
        // 解码失败时不插入节点，剪贴板内容交给其它节点处理
    }
}

/**
 * Ctrl+V：指针在导图上或主题有选中时，把剪贴板图片插成绑定节点。
 * 没有图片时不拦截，保证普通节点粘贴照常工作。
 * @param event 剪贴板事件
 */
function handlePaste(event: ClipboardEvent) {
    if (!hovered.value && !focusMode.value && selectedIds.value.size === 0) return
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
    const file = Array.from(event.clipboardData?.files ?? []).find(item => item.type.startsWith("image/"))
    if (!file) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const topicId = [...activeIds.value][0] ?? root.value.id
    void pasteImageAsTopic(topicId, file)
}

window.addEventListener("paste", handlePaste)
window.addEventListener("pointerdown", closeMenu)
onBeforeUnmount(() => {
    window.removeEventListener("paste", handlePaste)
    window.removeEventListener("pointerdown", closeMenu)
})

/** 主题数量，用于工具栏统计 */
const nodeCount = computed(() => nodes.value.length)

/** 初始树缺失时补一棵，保证节点首次渲染就有内容 */
if (!props.data.tree) {
    props.data.tree = { id: createId(), text: "中心主题", children: [] }
    store.commitHistory("初始化思维导图")
}

/** 视图适配：让整张导图填满节点区域 */
async function fitMindMap() {
    await nextTick()
    requestAnimationFrame(() => updateNodeInternals([props.id]))
}

defineExpose({ fitMindMap })
</script>

<template>
    <div
        ref="rootRef"
        class="group/node relative"
        :class="focusMode ? 'w-fit' : ['rounded-xs border border-base-content/15 bg-base-100/85 shadow-sm backdrop-blur-sm', selected ? 'border-primary/70 ring-1 ring-primary/30' : '']"
        @pointerenter="hovered = true"
        @pointerleave="hovered = false"
    >
        <!-- 沉浸查看只留导图本体：工具栏、外框与背景都隐藏 -->
        <MindMapToolbar
            v-if="!focusMode"
            :layout="props.data.layout"
            :node-count="nodeCount"
            :layouts="MIND_MAP_LAYOUTS"
            @change-layout="changeLayout"
            @add-child="addChild()"
            @add-sibling="addSibling"
            @font-size="changeFontSize"
            @color="changeColor"
            @toggle-focus="toggleFocus"
        />
        <!-- 内层画布没有滚动/缩放，滚轮交给外层 Vue Flow，避免形成滚轮死区 -->
        <div
            class="mind-canvas nodrag relative overflow-hidden"
            :style="{ width: `${renderSize.width}px`, height: `${renderSize.height}px` }"
            @pointerdown="handleCanvasPointerDown"
        >
            <svg class="pointer-events-none absolute inset-0" :width="renderSize.width" :height="renderSize.height">
                <path
                    v-for="edge in edges"
                    :key="edge.id"
                    :d="edge.path"
                    fill="none"
                    :stroke="edge.color"
                    stroke-width="1.5"
                    stroke-opacity="0.65"
                    stroke-linecap="round"
                />
            </svg>
            <!-- 框选矩形 -->
            <div
                v-if="selectionRect"
                class="pointer-events-none absolute border border-primary/60 bg-primary/10"
                :style="{
                    left: `${selectionRect.x}px`,
                    top: `${selectionRect.y}px`,
                    width: `${selectionRect.width}px`,
                    height: `${selectionRect.height}px`,
                }"
            />
            <MindNodeBox
                v-for="node in nodes"
                :key="node.id"
                :node="node"
                :bound="boundTopics.has(node.id)"
                :selected="selectedIds.has(node.id)"
                :editing="editingId === node.id"
                :has-children="nodeFlags.get(node.id)?.hasChildren ?? false"
                :collapsed="nodeFlags.get(node.id)?.collapsed ?? false"
                :child-count="nodeFlags.get(node.id)?.childCount ?? 0"
                :hovered="hoveredTopicId === node.id"
                :drop-target="dropTargetId === node.id"
                @click="handleNodeClick($event, node.id)"
                @dblclick="handleNodeDoubleClick(node.id)"
                @pointerdown="handlePointerDown($event, node.id)"
                @contextmenu="openContextMenu($event, node.id)"
                @toggle-collapse="toggleCollapse"
                @commit="commitText"
                @cancel="cancelEdit"
            />
            <!-- 右下角缩放手柄：自由调整画布大小，内容放不下时仍会自动撑大 -->
            <div
                v-if="!focusMode"
                class="nodrag nopan absolute bottom-0 right-0 z-10 size-4 cursor-se-resize text-base-content/30 transition-colors duration-150 hover:text-primary"
                title="拖动调整画布大小"
                @pointerdown="startCanvasResize"
            >
                <svg viewBox="0 0 16 16" class="size-full">
                    <path d="M15 15H9L15 9V15ZM15 11H13L15 9V11Z" fill="currentColor" />
                </svg>
            </div>
        </div>

        <!-- 沉浸查看的退出按钮：平时隐藏，悬停导图右上角时出现 -->
        <button
            v-if="focusMode"
            type="button"
            class="nodrag absolute right-1 top-1 z-20 grid size-5 cursor-pointer place-items-center rounded-xs border border-base-content/15 bg-base-100/90 text-base-content/60 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-150 group-hover/node:opacity-100 hover:text-primary pointer-events-none group-hover/node:pointer-events-auto"
            title="退出沉浸查看"
            @click.stop="toggleFocus"
        >
            <Icon icon="ri:fullscreen-exit-line" class="size-3.5" />
        </button>

        <!-- 主题右键菜单：Teleport 到 body，避免被节点 transform 缩放/偏移 -->
        <Teleport to="body">
            <div
                v-if="menu"
                ref="menuEl"
                data-mind-map-popover
                class="fixed z-100 w-52 rounded-xs border border-base-content/10 bg-base-100 p-1 shadow-lg"
                :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
                @pointerdown.stop
                @contextmenu.prevent.stop
                @click.stop
            >
                <div class="flex items-center gap-1 px-2 py-1">
                    <Icon icon="ri:node-tree" class="size-3 shrink-0 text-base-content/40" />
                    <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-base-content/70">{{ menuText }}</span>
                    <span v-if="selectedIds.size > 1" class="shrink-0 text-[10px] text-base-content/35">已选 {{ selectedIds.size }} 项</span>
                </div>
                <div class="my-1 h-px bg-base-content/10" />

                <button class="menu-item" @click="menuEdit()">编辑文字<span class="menu-hint">双击</span></button>
                <button class="menu-item" @click="menuAddChild()">添加子主题<span class="menu-hint">Tab</span></button>
                <button v-if="menu.id !== root.id" class="menu-item" @click="menuAddSibling()">添加同级主题<span class="menu-hint">Enter</span></button>
                <button v-if="menuFlags?.hasChildren" class="menu-item" @click="menuToggleCollapse()">
                    {{ menuFlags?.collapsed ? "展开子主题" : "折叠子主题" }}
                </button>

                <div class="my-1 h-px bg-base-content/10" />
                <!-- 绑定真实节点：插入任意节点 / 解绑，绑定后位置由导图布局驱动 -->
                <template v-if="!menuBound">
                    <div class="px-2 py-1 text-[10px] text-base-content/40">插入节点作为此主题</div>
                    <div class="max-h-52 overflow-y-auto">
                        <button v-for="item in visibleInsertItems" :key="item.type" class="menu-item" @click="menuInsertNode(item.type)">
                            <Icon v-if="item.icon" :icon="item.icon" class="size-3 shrink-0 opacity-60" />
                            {{ item.label }}
                        </button>
                    </div>                    <button
                        v-if="MIND_MAP_INSERT_ITEMS.length > INSERT_ITEM_PREVIEW"
                        class="menu-item"
                        @click="insertMenuExpanded = !insertMenuExpanded"
                    >
                        {{ insertMenuExpanded ? "收起节点类型" : `更多节点类型（${MIND_MAP_INSERT_ITEMS.length - INSERT_ITEM_PREVIEW}）` }}
                    </button>
                </template>
                <button v-else class="menu-item" @click="menuUnbind()">解除节点绑定<span class="menu-hint">留空</span></button>

                <div class="my-1 h-px bg-base-content/10" />
                <button class="menu-item" @click="menuFontSize(-2)">减小字号<span class="menu-hint">A−</span></button>
                <button class="menu-item" @click="menuFontSize(2)">增大字号<span class="menu-hint">A+</span></button>
                <div class="px-2 py-1">
                    <div class="mb-1 text-[10px] text-base-content/40">主题颜色</div>
                    <div class="flex flex-wrap items-center gap-1">
                        <button
                            v-for="color in MIND_MAP_COLORS"
                            :key="color"
                            class="size-3.5 cursor-pointer rounded-full border border-base-content/20 transition-transform duration-150 hover:scale-110"
                            :class="color === menuExplicitColor ? 'ring-2 ring-base-content/50 ring-offset-1 ring-offset-base-100' : ''"
                            :style="{ background: color }"
                            :title="color"
                            @click="menuColor(color)"
                        />
                        <button
                            class="grid size-3.5 cursor-pointer place-items-center rounded-full border border-base-content/20 bg-base-100 text-[9px] leading-none text-base-content/60 hover:text-primary"
                            title="恢复继承父级颜色"
                            @click="menuColor(undefined)"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <template v-if="menu.id !== root.id">
                    <div class="my-1 h-px bg-base-content/10" />
                    <button class="menu-item menu-item--danger" @click="menuRemove()">删除主题<span class="menu-hint">Delete</span></button>
                </template>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.menu-item {
    display: flex;
    width: 100%;
    cursor: pointer;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    text-align: left;
    font-size: 11px;
    line-height: 1.6;
    color: color-mix(in srgb, var(--color-base-content) 75%, transparent);
}
.menu-item:hover {
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
}
.menu-item--danger {
    color: var(--color-error);
}
.menu-item--danger:hover {
    background: color-mix(in srgb, var(--color-error) 10%, transparent);
    color: var(--color-error);
}
.menu-hint {
    margin-left: auto;
    font-size: 10px;
    opacity: 0.45;
}
</style>
