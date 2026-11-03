<script setup lang="ts">
import type { TreeData } from "@antv/g6"
import { CompactBoxLayout, DendrogramLayout, IndentedLayout, MindmapLayout } from "@antv/g6"
import { useVueFlow } from "@vue-flow/core"
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { DEFAULT_FONT_SIZE, MIND_MAP_COLORS, MIND_MAP_LAYOUTS, type MindMapNode, measureMindMapText, readLayoutMeta, resolveMindMapStyles } from "@/utils/mindMap"
import { buildMindMapEdgePath, layoutMindMap, MIND_MAP_BOX, type MindMapLayoutNode, type MindMapLayoutResult, type MindMapTreeLayoutOptions } from "@/utils/mindMapLayout"
import MindMapToolbar from "../mindmap/MindMapToolbar.vue"
import MindNodeBox from "../mindmap/MindNodeBox.vue"

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
    return {
        lines: text.lines,
        width: Math.max(MIND_MAP_BOX.minWidth, text.width + MIND_MAP_BOX.paddingX * 2 + 2),
        height: text.height + MIND_MAP_BOX.paddingY * 2 + 2,
    }
}

/** 排版结果：节点位置 + 连线路径 */
const layout = computed<MindMapLayoutResult>(() => {
    const styles = resolveMindMapStyles(root.value, baseFontSize.value, baseColor.value)
    return layoutMindMap(root.value, layoutMeta.value, styles, measureBox, TREE_LAYOUTS)
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

/** 主题 id → 是否有子级 / 是否折叠 */
const nodeFlags = computed(() => {
    const flags = new Map<string, { hasChildren: boolean; collapsed: boolean }>()
    const visit = (node: MindMapNode) => {
        flags.set(node.id, { hasChildren: node.children.length > 0, collapsed: node.collapsed === true })
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

/** 提交文字编辑 */
function commitText(id: string, text: string) {
    editingId.value = null
    commitTree("编辑主题", rootNode => {
        const target = findNode(rootNode, id)
        if (target) target.text = text
    })
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
    commitTree("删除主题", rootNode => {
        ids.forEach(id => {
            const located = findParent(rootNode, id)
            if (located) located.parent.children = located.parent.children.filter(child => child.id !== id)
        })
    })
    selectedIds.value = new Set()
    editingId.value = null
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
}

/** 主题树变化后通知 Vue Flow 重新测量节点尺寸 */
watch(
    () => [canvasSize.value.width, canvasSize.value.height],
    () => requestAnimationFrame(() => updateNodeInternals([props.id]))
)

/** 框选矩形（画布坐标系，仅拖动超过阈值后出现） */
const selectionRect = ref<{ x: number; y: number; width: number; height: number } | null>(null)

/** 画布空白处按下：开始框选 */
function handleCanvasPointerDown(event: PointerEvent) {
    if (event.button !== 0 || editingId.value) return
    // 点在主题上时由主题自己接管
    if ((event.target as HTMLElement).closest(".mind-node")) return
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
        const hit = nodes.value.filter(node => intersects(rect, node)).map(node => node.id)
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
let dragState: { id: string; startX: number; startY: number; moved: boolean } | null = null

/**
 * 按下主题开始拖拽（编辑中不拖）。
 * @param event 指针事件
 * @param id 主题 id
 */
function handlePointerDown(event: PointerEvent, id: string) {
    if (event.button !== 0 || editingId.value) return
    event.preventDefault()
    dragState = { id, startX: event.clientX, startY: event.clientY, moved: false }
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
}

/** 拖动中：命中其它主题时高亮落点 */
function handlePointerMove(event: PointerEvent) {
    if (!dragState) return
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) dragState.moved = true
    if (!dragState.moved) return
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
    if (!state || !state.moved || !target) return
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
    const host = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${props.id}"]`)
    const canvas = host?.querySelector<HTMLElement>(".mind-canvas")
    if (!host || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    const pane = document.querySelector<HTMLElement>(".vue-flow__transformationpane")
    const matrix = new DOMMatrix(pane ? getComputedStyle(pane).transform : "matrix(1,0,0,1,0,0)")
    const zoom = matrix.a || 1
    const x = (event.clientX - rect.left) / zoom
    const y = (event.clientY - rect.top) / zoom
    // 命中检测必须用偏移后的坐标：nodes 已把内容平移到画布内边距处
    for (const node of nodes.value) {
        if (node.x <= x && x <= node.x + node.width && node.y <= y && y <= node.y + node.height) return node.id
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

    // 没有选中主题时不接管 Delete，交给外层删除整个导图节点
    if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedIds.value.size === 0) return
        event.preventDefault()
        event.stopImmediatePropagation()
        removeSelected()
        return
    }

    // Tab / Enter：指针停在这张导图上，或内部已有选中主题（点击主题后鼠标可能已移开）
    if (!hovered.value && selectedIds.value.size === 0) return
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

onBeforeUnmount(() => {
    window.removeEventListener("keydown", handleKeyDown, true)
    window.removeEventListener("pointerdown", handleOutsidePointerDown, true)
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

window.addEventListener("pointerdown", closeMenu)
onBeforeUnmount(() => window.removeEventListener("pointerdown", closeMenu))

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
        class="relative rounded-xs border border-base-content/15 bg-base-100/85 shadow-sm backdrop-blur-sm"
        :class="selected ? 'border-primary/70 ring-1 ring-primary/30' : ''"
        @pointerenter="hovered = true"
        @pointerleave="hovered = false"
    >
        <MindMapToolbar
            :layout="props.data.layout"
            :node-count="nodeCount"
            :layouts="MIND_MAP_LAYOUTS"
            @change-layout="changeLayout"
            @add-child="addChild()"
            @add-sibling="addSibling"
            @font-size="changeFontSize"
            @color="changeColor"
        />
        <!-- 内层画布没有滚动/缩放，滚轮交给外层 Vue Flow，避免形成滚轮死区 -->
        <div
            class="mind-canvas nodrag relative overflow-hidden"
            :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
            @pointerdown="handleCanvasPointerDown"
        >
            <svg class="pointer-events-none absolute inset-0" :width="canvasSize.width" :height="canvasSize.height">
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
                :selected="selectedIds.has(node.id)"
                :editing="editingId === node.id"
                :has-children="nodeFlags.get(node.id)?.hasChildren ?? false"
                :collapsed="nodeFlags.get(node.id)?.collapsed ?? false"
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
                class="nodrag nopan absolute bottom-0 right-0 z-10 size-4 cursor-se-resize text-base-content/30 transition-colors duration-150 hover:text-primary"
                title="拖动调整画布大小"
                @pointerdown="startCanvasResize"
            >
                <svg viewBox="0 0 16 16" class="size-full">
                    <path d="M15 15H9L15 9V15ZM15 11H13L15 9V11Z" fill="currentColor" />
                </svg>
            </div>
        </div>

        <!-- 主题右键菜单：Teleport 到 body，避免被节点 transform 缩放/偏移 -->
        <Teleport to="body">
            <div
                v-if="menu"
                ref="menuEl"
                data-mind-map-popover
                class="fixed z-[100] w-52 rounded-xs border border-base-content/10 bg-base-100 p-1 shadow-lg"
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
