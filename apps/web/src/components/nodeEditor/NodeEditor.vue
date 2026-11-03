<script setup lang="ts">
import { Background } from "@vue-flow/background"
import { Controls } from "@vue-flow/controls"
import { SelectionMode, useVueFlow, VueFlow } from "@vue-flow/core"
import { MiniMap } from "@vue-flow/minimap"
import { useLocalStorage } from "@vueuse/core"
import "@vue-flow/core/dist/style.css"
import "@vue-flow/core/dist/theme-default.css"
import type { Connection, EdgeMouseEvent, NodeMouseEvent } from "@vue-flow/core"
import { nanoid } from "nanoid"
import { computed, defineAsyncComponent, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { createGraphMutation, graphQuery } from "@/api/graphql"
import { useCharSettings } from "@/composables/useCharSettings"
import { charMap } from "@/data"
import { env } from "@/env"
import { NodeType, useNodeEditorStore } from "@/store/nodeEditor"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"
import { dataPackHydrationKey } from "@/utils/data-pack/data-pack-bridge"
import { importCharSettingsToNodeEditor } from "@/utils/importCharSettingsToNodeEditor"
import { createMindMapTree } from "@/utils/mindMap"
import { resetNodeEditorPerf } from "@/utils/nodeEditorPerf"
import { getNodePorts, isPortTypeCompatible, PORT_META, PortType, resolvePort } from "@/utils/nodeEditorPorts"
import AddCalcNode from "./nodes/AddCalcNode.vue"
import ASTExpressionNode from "./nodes/ASTExpressionNode.vue"
import AttrCalcNode from "./nodes/AttrCalcNode.vue"
import BuffInputNode from "./nodes/BuffInputNode.vue"
import BuffMergeNode from "./nodes/BuffMergeNode.vue"
import CardNode from "./nodes/CardNode.vue"
import CharInputNode from "./nodes/CharInputNode.vue"
import ChartNode from "./nodes/ChartNode.vue"
import CoreCalcNode from "./nodes/CoreCalcNode.vue"
import CustomExpressionNode from "./nodes/CustomExpressionNode.vue"
import CustomVariablesNode from "./nodes/CustomVariablesNode.vue"
import DotInputNode from "./nodes/DotInputNode.vue"
import EffectInputNode from "./nodes/EffectInputNode.vue"
import EnemyInputNode from "./nodes/EnemyInputNode.vue"
import ExpressionCalcNode from "./nodes/ExpressionCalcNode.vue"
import GroupNode from "./nodes/GroupNode.vue"
import HubNode from "./nodes/HubNode.vue"
import ImageNode from "./nodes/ImageNode.vue"
import JSONBuildNode from "./nodes/JSONBuildNode.vue"
import JSONExportNode from "./nodes/JSONExportNode.vue"
import LabelNode from "./nodes/LabelNode.vue"
import MeleeWeaponInputNode from "./nodes/MeleeWeaponInputNode.vue"
import MindMapNode from "./nodes/MindMapNode.vue"
import ModInputNode from "./nodes/ModInputNode.vue"
import MultiplyCalcNode from "./nodes/MultiplyCalcNode.vue"
import NumberInputNode from "./nodes/NumberInputNode.vue"
import OnlineBuildNode from "./nodes/OnlineBuildNode.vue"
import OutputNode from "./nodes/OutputNode.vue"
import PetInputNode from "./nodes/PetInputNode.vue"
import RangedWeaponInputNode from "./nodes/RangedWeaponInputNode.vue"
import TextInputNode from "./nodes/TextInputNode.vue"
import VectorCalcNode from "./nodes/VectorCalcNode.vue"
import VectorDecomposeNode from "./nodes/VectorDecomposeNode.vue"
import VectorInputNode from "./nodes/VectorInputNode.vue"
import WeaponAttrCalcNode from "./nodes/WeaponAttrCalcNode.vue"
import { type NodeData, PALETTE_ITEMS, type PaletteItem } from "./types"

// Store
const store = useNodeEditorStore()
const ui = useUIStore()
const route = useRoute()
const router = useRouter()

/** 路由上的分享图 id（/flow/:graphId） */
const routeGraphId = computed(() => (typeof route.params.graphId === "string" ? route.params.graphId : ""))

// VueFlow 实例
const {
    onInit,
    fitView,
    getSelectedNodes,
    getSelectedEdges,
    onConnectStart,
    onConnectEnd,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    screenToFlowCoordinate,
    findNode,
    addSelectedNodes,
    removeSelectedNodes,
    viewport,
} = useVueFlow()

// 选中的节点和边
const selectedNode = ref<{ id: string; data: NodeData } | null>(null)
const selectedEdge = ref<{ id: string; source: string; target: string } | null>(null)

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })

/** 右键菜单作用对象：命中已选中的元素时按整个选中集合操作，否则只作用于命中项 */
type ContextMenuTarget =
    | { type: "selection" }
    | { type: "node"; id: string }
    | { type: "edge"; id: string }
    | { type: "pane" }

const contextMenuTarget = ref<ContextMenuTarget>({ type: "pane" })

/** 快捷键说明弹窗 */
const shortcutsHelpShow = ref(false)

/** 快捷键说明内容：按用途分组展示全部键位 */
const shortcutHelpGroups = [
    {
        title: "编辑",
        items: [
            { label: "复制选中节点", keys: "Ctrl+C" },
            { label: "粘贴节点", keys: "Ctrl+V" },
            { label: "删除选中的节点或边", keys: "Delete / Backspace" },
            { label: "撤销", keys: "Ctrl+Z" },
            { label: "重做", keys: "Ctrl+Shift+Z / Ctrl+Y" },
            { label: "保存当前图", keys: "Ctrl+S" },
        ],
    },
    {
        title: "画布与选择",
        items: [
            { label: "多选节点或边", keys: "Shift+点击" },
            { label: "框选", keys: "Shift+拖动空白处" },
            { label: "平移画布", keys: "拖动空白处 / Space+拖动" },
            { label: "缩放画布", keys: "滚轮" },
        ],
    },
    {
        title: "拖动节点",
        items: [
            { label: "复制节点及连线", keys: "Ctrl+拖动" },
            { label: "只复制节点，不复制连线", keys: "Ctrl+Alt+拖动" },
        ],
    },
    {
        title: "节点与菜单",
        items: [
            { label: "重命名节点", keys: "点击标题" },
            { label: "从端口拖到空白处，选择节点并自动连接", keys: "拖出端口" },
            { label: "取消重命名 / 关闭候选节点菜单", keys: "Esc" },
        ],
    },
]

function isItemSelected(type: "node" | "edge", id: string) {
    const selected = type === "node" ? getSelectedNodes.value : getSelectedEdges.value
    return selected.some(item => item.id === id)
}

function resolveContextMenuTarget(type: "node" | "edge", id: string): ContextMenuTarget {
    return isItemSelected(type, id) ? { type: "selection" } : { type, id }
}

// 拖拽状态
const draggingItem = ref<PaletteItem | null>(null)
const draggingPosition = ref({ x: 0, y: 0 })
/** 侧栏整体收起（完全隐藏），标题栏按钮再点开 */
const sidebarCollapsed = useLocalStorage("node-editor-sidebar-collapsed", false)
/** 侧栏标签页：节点库 = 可拖入的节点，画布 = 当前图里的节点，性能 = 计算耗时统计 */
const activePane = useLocalStorage<"palette" | "canvas" | "perf">("node-editor-active-pane", "palette")

/** 从端口拖出但未连接时，候选节点与端口 */
interface ConnectCandidate {
    item: PaletteItem
    inputId?: string
    outputId?: string
    portLabel: string
}

/** 端口拖出后的落点菜单状态 */
interface ConnectMenuState {
    x: number
    y: number
    clientX: number
    clientY: number
    /** 新节点需要提供的端口方向：从输出拖出时为 input，从输入拖出时为 output */
    direction: "input" | "output"
    sourceNodeId: string
    sourceHandleId: string | null
    portType: PortType
    candidates: ConnectCandidate[]
}

interface ConnectStartState {
    nodeId: string
    handleId: string | null
    handleType: "source" | "target"
    portType: PortType
    /** 输入端口是否允许多条连线（MOD / BUFF） */
    multiple: boolean
    clientX: number
    clientY: number
    /** 开始连接时的边数量，用于判定本次手势是否已成功建线 */
    edgeCount: number
}

const connectMenu = ref<ConnectMenuState | null>(null)
const connectMenuSearch = ref("")
const connectMenuEl = ref<HTMLElement | null>(null)
const connectSearchInput = ref<HTMLInputElement | null>(null)
let pendingConnectStart: ConnectStartState | null = null
let connectSucceeded = false
let connectGestureId = 0

function getEventClientPoint(event?: MouseEvent | TouchEvent) {
    if (!event) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    if ("changedTouches" in event && event.changedTouches.length > 0) {
        return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
    }
    if ("touches" in event && event.touches.length > 0) {
        return { x: event.touches[0].clientX, y: event.touches[0].clientY }
    }
    const mouseEvent = event as MouseEvent
    return { x: mouseEvent.clientX, y: mouseEvent.clientY }
}

/** 数值输出同样可以接入向量输入 */
function findConnectCandidates(portType: PortType, direction: "input" | "output"): ConnectCandidate[] {
    return PALETTE_ITEMS.flatMap((item): ConnectCandidate[] => {
        const ports = getNodePorts(item.type)
        if (direction === "input") {
            // 精确同类型优先，其次才是数值 → 向量的兼容端口
            const port =
                ports.inputs.find(candidate => candidate.type === portType) ??
                ports.inputs.find(candidate => isPortTypeCompatible(portType, candidate.type))
            return port ? [{ item, inputId: port.id, portLabel: port.label }] : []
        }
        const port =
            ports.outputs.find(candidate => candidate.type === portType) ??
            ports.outputs.find(candidate => isPortTypeCompatible(candidate.type, portType))
        return port ? [{ item, outputId: port.id, portLabel: port.label }] : []
    })
}

function closeConnectMenu() {
    connectMenu.value = null
    connectMenuSearch.value = ""
}

function openConnectMenu(start: ConnectStartState, event?: MouseEvent | TouchEvent) {
    // 从已占用且只允许单连线的输入端口拖出时，无法再接入第二条边
    if (start.handleType === "target" && !start.multiple) {
        const occupied = store.edges.some(edge => edge.target === start.nodeId && edge.targetHandle === start.handleId)
        if (occupied) return
    }
    const point = getEventClientPoint(event)
    // 单击端口（没有实际拖动）不弹菜单，避免干扰 VueFlow 的点击连线模式
    if (Math.hypot(point.x - start.clientX, point.y - start.clientY) < 6) return
    const direction = start.handleType === "source" ? "input" : "output"
    const candidates = findConnectCandidates(start.portType, direction)
    const width = 320
    const height = 360
    connectMenuSearch.value = ""
    contextMenuVisible.value = false
    connectMenu.value = {
        x: Math.max(8, Math.min(point.x, window.innerWidth - width - 8)),
        y: Math.max(8, Math.min(point.y, window.innerHeight - height - 8)),
        clientX: point.x,
        clientY: point.y,
        direction,
        sourceNodeId: start.nodeId,
        sourceHandleId: start.handleId,
        portType: start.portType,
        candidates,
    }
    nextTick(() => connectSearchInput.value?.focus())
}

function chooseConnectCandidate(candidate: ConnectCandidate) {
    const menu = connectMenu.value
    if (!menu) return
    const position = screenToFlowCoordinate({ x: menu.clientX, y: menu.clientY })
    const nodeId = nanoid()
    // 图源节点带上默认值，保证首次重算就能读到这次连线
    const data: Record<string, any> = { label: candidate.item.label, ...paletteNodeDefaults(candidate.item.type) }
    if (candidate.item.type === NodeType.VECTOR_INPUT) data.values = [0]
    if (candidate.item.type === NodeType.NUMBER_INPUT) data.value = 0
    store.addNode({
        id: nodeId,
        type: candidate.item.type,
        position,
        data,
    })
    if (menu.direction === "input") {
        store.addEdge({
            id: `e${nanoid()}`,
            source: menu.sourceNodeId,
            target: nodeId,
            sourceHandle: menu.sourceHandleId,
            targetHandle: candidate.inputId,
        })
    } else {
        store.addEdge({
            id: `e${nanoid()}`,
            source: nodeId,
            target: menu.sourceNodeId,
            sourceHandle: candidate.outputId,
            targetHandle: menu.sourceHandleId,
        })
    }
    closeConnectMenu()
}

const filteredConnectCandidates = computed(() => {
    const query = connectMenuSearch.value.trim().toLowerCase()
    if (!query) return connectMenu.value?.candidates ?? []
    return (connectMenu.value?.candidates ?? []).filter(candidate =>
        `${candidate.item.label} ${candidate.item.description ?? ""}`.toLowerCase().includes(query)
    )
})

const groupedConnectCandidates = computed(() => {
    const groups: Record<string, ConnectCandidate[]> = {}
    filteredConnectCandidates.value.forEach(candidate => {
        const category = candidate.item.category
        if (!groups[category]) groups[category] = []
        groups[category].push(candidate)
    })
    return groups
})

function chooseFirstConnectCandidate() {
    const first = filteredConnectCandidates.value[0]
    if (first) chooseConnectCandidate(first)
}

/** 画布连线校验：单占端口允许被新连线替换 */
function isValidCanvasConnection(connection: Connection) {
    return store.isValidConnection(connection, { allowOccupiedTarget: true })
}

function handleCanvasConnect(connection: Connection) {
    const added = store.onConnect(connection)
    if (added) connectSucceeded = true
    return added
}

/** 读取指针下方的 VueFlow 端口；用于落点判定失败时手动补连 */
function findHandleAtPoint(point: { x: number; y: number }) {
    const element = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>(".vue-flow__handle")
    if (!element) return null
    const nodeId = element.dataset.nodeid
    const handleId = element.dataset.handleid ?? null
    if (!nodeId) return null
    return {
        nodeId,
        handleId,
        handleType: element.classList.contains("source") ? ("source" as const) : ("target" as const),
    }
}

/** 端口拖出结束：已建线则不弹菜单；落在端口上则手动补连，仍失败才弹出候选节点菜单 */
onConnectStart(params => {
    connectGestureId++
    connectSucceeded = false
    const node = params.nodeId ? store.nodes.find(item => item.id === params.nodeId) : undefined
    const handleType = params.handleType === "target" ? "target" : "source"
    const port = resolvePort(node?.type ?? "", params.handleId, handleType === "source" ? "output" : "input", node?.data ?? {})
    const startPoint = getEventClientPoint(params.event)
    pendingConnectStart =
        params.nodeId && port
            ? {
                  nodeId: params.nodeId,
                  handleId: params.handleId,
                  handleType,
                  portType: port.type,
                  multiple: port.multiple === true,
                  clientX: startPoint.x,
                  clientY: startPoint.y,
                  edgeCount: store.edges.length,
              }
            : null
})

onConnectEnd(event => {
    const start = pendingConnectStart
    const gesture = connectGestureId
    pendingConnectStart = null
    if (!start || connectSucceeded) {
        connectSucceeded = false
        return
    }
    // onConnect 与 connectEnd 的触发顺序在不同输入方式下可能不同，放到微任务后再判定
    setTimeout(() => {
        if (gesture !== connectGestureId) return
        if (connectSucceeded || store.edges.length > start.edgeCount) {
            connectSucceeded = false
            return
        }
        const dropHandle = findHandleAtPoint(getEventClientPoint(event))
        if (dropHandle && dropHandle.nodeId !== start.nodeId && dropHandle.handleType !== start.handleType) {
            const connection: Connection =
                start.handleType === "source"
                    ? {
                          source: start.nodeId,
                          sourceHandle: start.handleId,
                          target: dropHandle.nodeId,
                          targetHandle: dropHandle.handleId,
                      }
                    : {
                          source: dropHandle.nodeId,
                          sourceHandle: dropHandle.handleId,
                          target: start.nodeId,
                          targetHandle: start.handleId,
                      }
            if (handleCanvasConnect(connection)) {
                connectSucceeded = false
                return
            }
        }
        openConnectMenu(start, event)
        connectSucceeded = false
    }, 0)
})

// 图切换
const selectedGraphId = ref<number | "">("")
/** 切换图浮层菜单开关：切换图标是独立按钮，点开后列出已存图 */
const switchMenuOpen = ref(false)
/** 首屏加载图数据时显示画布加载层 */
const initializing = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)

// 节点点击事件：锁定节点不响应
function handleNodeClick(event: NodeMouseEvent) {
    const node = event.node as unknown as { id: string; data: NodeData } | undefined
    if (!node || (node.data as Record<string, any>)?.locked === true) return
    selectedNode.value = node
    selectedEdge.value = null
}

// 边点击事件
function handleEdgeClick(event: EdgeMouseEvent) {
    selectedEdge.value = event.edge as unknown as { id: string; source: string; target: string }
    selectedNode.value = null
}

// 节点右键菜单事件
function handleNodeContextMenu(event: NodeMouseEvent) {
    // 阻止默认右键菜单
    if ("preventDefault" in event.event) {
        event.event.preventDefault()
    }

    // 锁定节点不弹出菜单
    if ((event.node.data as Record<string, any>)?.locked === true) return
    closeConnectMenu()
    selectedNode.value = event.node as unknown as { id: string; data: NodeData }
    selectedEdge.value = null
    contextMenuTarget.value = resolveContextMenuTarget("node", event.node.id)

    // 使用event的absolutePosition或clientX/clientY（根据事件类型）
    if ("clientX" in event.event) {
        contextMenuPosition.value = { x: event.event.clientX, y: event.event.clientY }
    } else if ("touches" in event.event && event.event.touches.length > 0) {
        contextMenuPosition.value = {
            x: event.event.touches[0].clientX,
            y: event.event.touches[0].clientY,
        }
    } else {
        // 作为 fallback，使用画布中心
        contextMenuPosition.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    }

    contextMenuVisible.value = true
}

// 边右键菜单事件
function handleEdgeContextMenu(event: EdgeMouseEvent) {
    // 阻止默认右键菜单
    if ("preventDefault" in event.event) {
        event.event.preventDefault()
    }

    closeConnectMenu()
    selectedEdge.value = event.edge as unknown as { id: string; source: string; target: string }
    selectedNode.value = null
    contextMenuTarget.value = resolveContextMenuTarget("edge", event.edge.id)

    // 使用event的absolutePosition或clientX/clientY（根据事件类型）
    if ("clientX" in event.event) {
        contextMenuPosition.value = { x: event.event.clientX, y: event.event.clientY }
    } else if ("touches" in event.event && event.event.touches.length > 0) {
        contextMenuPosition.value = {
            x: event.event.touches[0].clientX,
            y: event.event.touches[0].clientY,
        }
    } else {
        // 作为 fallback，使用画布中心
        contextMenuPosition.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    }

    contextMenuVisible.value = true
}

// 选中元素右键菜单事件
function handleSelectionContextMenu(event: { event: MouseEvent; nodes: any[] }) {
    // 阻止默认右键菜单
    event.event.preventDefault()

    closeConnectMenu()
    contextMenuTarget.value = { type: "selection" }
    contextMenuPosition.value = { x: event.event.clientX, y: event.event.clientY }
    contextMenuVisible.value = true
}

// 画布右键菜单事件
function handlePaneContextMenu(event: MouseEvent) {
    // 阻止默认右键菜单
    event.preventDefault()

    closeConnectMenu()
    contextMenuTarget.value = { type: "pane" }
    contextMenuPosition.value = { x: event.clientX, y: event.clientY }
    contextMenuVisible.value = true
}

// 删除节点
function deleteSelectedNode() {
    if (selectedNode.value) {
        store.removeNode(selectedNode.value.id)
        selectedNode.value = null
    }
}

// 删除边
function deleteSelectedEdge() {
    if (selectedEdge.value) {
        store.removeEdge(selectedEdge.value.id)
        selectedEdge.value = null
    }
}

/** 右键菜单撤销：不可撤销时保持菜单打开 */
function undoFromMenu() {
    if (!store.canUndo) return
    store.undo()
    contextMenuVisible.value = false
}

function redoFromMenu() {
    if (!store.canRedo) return
    store.redo()
    contextMenuVisible.value = false
}

function deleteSelectedItems() {
    // 删除选中的节点
    for (const node of getSelectedNodes.value) {
        store.removeNode(node.id)
    }
    // 删除选中的边
    for (const edge of getSelectedEdges.value) {
        store.removeEdge(edge.id)
    }
    // 清空选中状态
    selectedNode.value = null
    selectedEdge.value = null
}

function deleteNodeById(nodeId: string) {
    store.removeNode(nodeId)
    if (selectedNode.value?.id === nodeId) selectedNode.value = null
}

function deleteEdgeById(edgeId: string) {
    store.removeEdge(edgeId)
    if (selectedEdge.value?.id === edgeId) selectedEdge.value = null
}

/** 右键菜单删除项：只删除右键命中的目标，命中选中集合时才提供批量删除 */
const contextMenuDelete = computed(() => {
    const target = contextMenuTarget.value
    if (target.type === "selection") {
        const nodeCount = getSelectedNodes.value.length
        const edgeCount = getSelectedEdges.value.length
        if (nodeCount === 0 && edgeCount === 0) return null
        return { label: "删除选中项", detail: `(${nodeCount}节点, ${edgeCount}边)`, action: deleteSelectedItems }
    }
    if (target.type === "node") {
        return { label: "删除节点", detail: "", action: () => deleteNodeById(target.id) }
    }
    if (target.type === "edge") {
        return { label: "删除边", detail: "", action: () => deleteEdgeById(target.id) }
    }
    return null
})

/** 右键菜单是否提供复制：仅当命中项属于当前选中节点集合 */
const contextMenuCopyable = computed(() => {
    const target = contextMenuTarget.value
    if (target.type === "selection") return getSelectedNodes.value.length > 0
    if (target.type === "node") return isItemSelected("node", target.id)
    return false
})

function deleteFromMenu() {
    contextMenuDelete.value?.action()
    contextMenuVisible.value = false
}

function openShortcutsHelp() {
    contextMenuVisible.value = false
    shortcutsHelpShow.value = true
}

let paletteDragStart: { x: number; y: number } | null = null
let paletteDragMoved = false

function addPaletteNode(item: PaletteItem, position: { x: number; y: number }) {
    store.addNode({
        id: nanoid(),
        type: item.type as string,
        position,
        data: { label: item.label, ...paletteNodeDefaults(item.type) },
    })
    // 移动端侧栏是整屏面板，放完节点直接收起露出画布
    if (window.innerWidth < 1024) sidebarCollapsed.value = true
}

/** 部分节点首次落图时需要预置数据，保证节点组件挂载即有内容 */
function paletteNodeDefaults(type: string): Record<string, unknown> {
    if (type === NodeType.MIND_MAP) return { tree: createMindMapTree(), layout: "mindmap" }
    if (type === NodeType.IMAGE) return { imageMode: "embed", imageWidth: 320, imageHeight: 200 }
    if (type === NodeType.CARD) return { cardKind: "char" }
    return {}
}

/**
 * 移动端侧栏占满整屏，画布被挤到 0 宽、量不出尺寸，落点改用现有节点包围盒中心，
 * 保证收起侧栏后新节点就在视野里。
 * @returns 画布坐标落点
 */
function paletteClickPosition(canvas: Element) {
    const rect = canvas.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return screenPointToFlow({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    if (store.nodes.length === 0) return { x: 0, y: 0 }
    const xs = store.nodes.map(node => node.position.x)
    const ys = store.nodes.map(node => node.position.y)
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2 + 40, y: (Math.min(...ys) + Math.max(...ys)) / 2 + 40 }
}

function screenPointToFlow(point: { x: number; y: number }) {
    const canvas = document.querySelector(".vue-flow__container")
    if (!canvas) return null
    const transformationPane = (document.querySelector(".vue-flow__transformationpane") as Element) || canvas
    const rect = canvas.getBoundingClientRect()
    const transform = window.getComputedStyle(transformationPane).transform
    const matrix = new DOMMatrix(transform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : transform)
    return {
        x: (point.x - rect.left + canvas.scrollLeft - matrix.e) / matrix.a,
        y: (point.y - rect.top + canvas.scrollTop - matrix.f) / matrix.d,
    }
}

// 鼠标按下事件 - 开始拖拽
function onMouseDown(event: MouseEvent, item: PaletteItem) {
    // 记录拖拽的节点项
    draggingItem.value = item
    draggingPosition.value = { x: event.clientX, y: event.clientY }
    paletteDragStart = { x: event.clientX, y: event.clientY }
    paletteDragMoved = false

    // 添加全局鼠标事件监听
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
    document.addEventListener("mouseleave", onMouseUp)

    // 阻止默认行为，避免文本选择
    event.preventDefault()
}

// 鼠标移动事件 - 更新拖拽位置
function onMouseMove(event: MouseEvent) {
    if (!draggingItem.value) return
    if (paletteDragStart && Math.hypot(event.clientX - paletteDragStart.x, event.clientY - paletteDragStart.y) > 4) {
        paletteDragMoved = true
    }

    // 更新拖拽位置
    draggingPosition.value = { x: event.clientX, y: event.clientY }
}

// 鼠标释放事件 - 完成拖拽
function onMouseUp(event: MouseEvent) {
    if (!draggingItem.value) return
    const item = draggingItem.value
    const canvas = document.querySelector(".vue-flow__container")
    if (!canvas) {
        resetDragState()
        return
    }
    const rect = canvas.getBoundingClientRect()
    const insideCanvas =
        event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom

    if (!paletteDragMoved) {
        // 点击/点按调色板：放到画布中心，兼容触屏设备
        const center = paletteClickPosition(canvas)
        if (center) addPaletteNode(item, center)
    } else if (insideCanvas) {
        const position = screenPointToFlow({ x: event.clientX, y: event.clientY })
        if (position) addPaletteNode(item, position)
    }

    // 重置拖拽状态
    resetDragState()
}

// 重置拖拽状态
function resetDragState() {
    draggingItem.value = null
    draggingPosition.value = { x: 0, y: 0 }
    paletteDragStart = null
    paletteDragMoved = false

    // 移除全局事件监听
    document.removeEventListener("mousemove", onMouseMove)
    document.removeEventListener("mouseup", onMouseUp)
    document.removeEventListener("mouseleave", onMouseUp)
}

// 注册自定义节点类型
const nodeTypes = {
    "char-input": markRaw(CharInputNode),
    "melee-weapon-input": markRaw(MeleeWeaponInputNode),
    "ranged-weapon-input": markRaw(RangedWeaponInputNode),
    "mod-input": markRaw(ModInputNode),
    "buff-input": markRaw(BuffInputNode),
    "buff-merge": markRaw(BuffMergeNode),
    "effect-input": markRaw(EffectInputNode),
    "pet-input": markRaw(PetInputNode),
    "enemy-input": markRaw(EnemyInputNode),
    "custom-vars-input": markRaw(CustomVariablesNode),
    "dot-input": markRaw(DotInputNode),
    "core-calc": markRaw(CoreCalcNode),
    "attr-calc": markRaw(AttrCalcNode),
    "weapon-attr-calc": markRaw(WeaponAttrCalcNode),
    "ast-expression-calc": markRaw(ASTExpressionNode),
    "custom-expression": markRaw(CustomExpressionNode),
    "add-calc": markRaw(AddCalcNode),
    "multiply-calc": markRaw(MultiplyCalcNode),
    "expression-calc": markRaw(ExpressionCalcNode),
    "hub-calc": markRaw(HubNode),
    "attr-output": markRaw(OutputNode),
    "weapon-output": markRaw(OutputNode),
    chart: markRaw(ChartNode),
    group: markRaw(GroupNode),
    label: markRaw(LabelNode),
    "text-input": markRaw(TextInputNode),
    "number-input": markRaw(NumberInputNode),
    "vector-input": markRaw(VectorInputNode),
    "vector-decompose": markRaw(VectorDecomposeNode),
    "vector-calc": markRaw(VectorCalcNode),
    mindmap: markRaw(MindMapNode),
    image: markRaw(ImageNode),
    card: markRaw(CardNode),
    "json-build": markRaw(JSONBuildNode),
    "json-export": markRaw(JSONExportNode),
    "online-build": markRaw(OnlineBuildNode),
} as unknown as import("@vue-flow/core").NodeTypesObject

// 按类别分组调色板项
const groupedPaletteItems = computed(() => {
    const grouped: Record<string, PaletteItem[]> = {}
    for (const item of PALETTE_ITEMS) {
        if (!grouped[item.category]) {
            grouped[item.category] = []
        }
        grouped[item.category].push(item)
    }
    return grouped
})

// 获取类别标签
function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
        input: "输入节点",
        calculation: "计算节点",
        output: "输出节点",
        special: "特殊节点",
        basic: "基础组件",
        "build-source": "构筑来源",
    }
    return labels[category] || category
}

/** 拖动排序期间的本地预览顺序：只存在内存里，松手才写回 store */
const graphNodeDragOrder = ref<string[] | null>(null)

const graphNodes = computed(() => {
    const mapped = store.nodes.map(node => {
        const palette = PALETTE_ITEMS.find(item => item.type === node.type)
        const label = typeof node.data?.label === "string" ? node.data.label.trim() : ""
        return {
            id: node.id,
            label: label || palette?.label || String(node.type ?? ""),
            icon: palette?.icon,
            hidden: node.hidden === true,
            locked: node.data?.locked === true,
            selected: isItemSelected("node", node.id),
        }
    })
    const order = graphNodeDragOrder.value
    if (!order) return mapped
    const byId = new Map(mapped.map(node => [node.id, node]))
    const ordered = order.map(id => byId.get(id)).filter((node): node is (typeof mapped)[number] => node !== undefined)
    const orderedIds = new Set(order)
    for (const node of mapped) {
        if (!orderedIds.has(node.id)) ordered.push(node)
    }
    return ordered
})

/** 隐藏节点先自动显示；锁定节点不可选中 */
function selectGraphNode(id: string, event?: MouseEvent) {
    const target = store.nodes.find(node => node.id === id)
    if (!target || target.data?.locked === true) return
    if (target.hidden) store.setNodeHidden(id, false)
    const flowNode = findNode(id)
    const additive = !!event && (event.shiftKey || event.ctrlKey || event.metaKey)
    if (additive && flowNode) {
        if (isItemSelected("node", id)) {
            removeSelectedNodes([flowNode])
            if (selectedNode.value?.id === id) selectedNode.value = null
        } else {
            addSelectedNodes([flowNode])
            selectedNode.value = { id: target.id, data: target.data as NodeData }
            selectedEdge.value = null
        }
        return
    }
    if (flowNode) {
        removeSelectedNodes([...getSelectedNodes.value])
        addSelectedNodes([flowNode])
    }
    selectedNode.value = { id: target.id, data: target.data as NodeData }
    selectedEdge.value = null
}

function toggleGraphNodeHidden(id: string) {
    const target = store.nodes.find(node => node.id === id)
    if (!target) return
    store.setNodeHidden(id, !target.hidden)
}

function toggleGraphNodeLocked(id: string) {
    const target = store.nodes.find(node => node.id === id)
    if (!target) return
    store.setNodeLocked(id, !(target.data?.locked === true))
}

/** 画布列表拖拽排序：按住手柄实时换位，数组越靠后画布层级越靠前 */
const graphNodeDragId = ref<string | null>(null)
const graphNodeListEl = ref<HTMLElement | null>(null)

interface GraphNodeDragSession {
    id: string
    pointerId: number
    startX: number
    startY: number
    /** 按住点相对行顶部的偏移 */
    offsetY: number
    pointerY: number
    rowEl: HTMLElement
    listEl: HTMLElement
    scrollEl: HTMLElement | null
    ghostEl: HTMLElement | null
    rowHeight: number
    rowLeft: number
    rowWidth: number
    /** 拖动开始时行所在下标与槽位中心（视口坐标），用于按槽位换算目标位置 */
    originIndex: number
    originCenterY: number
    initialScrollTop: number
    /** 相邻两行的布局间距（行高 + 外边距），行等高 */
    slotHeight: number
    /** 超过阈值后才进入拖拽，避免普通点击触发换位 */
    started: boolean
    frame: number
}

let graphNodeDrag: GraphNodeDragSession | null = null
/** 各节点进行中的换位补间：只重启动真正换位的行，避免整列动画被反复重置 */
const graphNodeSwapAnimations = new Map<string, Animation>()
let graphNodeDragBodyCursor = ""
let graphNodeDragBodyUserSelect = ""

const GRAPH_NODE_DRAG_EDGE = 28
const GRAPH_NODE_DRAG_MAX_SCROLL = 12
/** 换位补间时长（毫秒） */
const GRAPH_NODE_SWAP_DURATION = 160

function onGraphNodePointerDown(event: PointerEvent, id: string) {
    if (event.button !== 0 || graphNodeDrag) return
    const rowEl = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>("[data-graph-node-row]")
    const listEl = graphNodeListEl.value
    if (!rowEl || !listEl) return
    // 阻止按下时选中文本或触发原生拖拽
    event.preventDefault()
    // 清掉上一次拖拽残留的补间，保证以最终布局为基准
    for (const animation of graphNodeSwapAnimations.values()) animation.cancel()
    graphNodeSwapAnimations.clear()
    const rect = rowEl.getBoundingClientRect()
    const scrollEl = listEl.closest<HTMLElement>("[data-reka-scroll-area-viewport]")
    const rows = listEl.querySelectorAll<HTMLElement>("[data-graph-node-row]")
    const slotHeight = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : rect.height
    graphNodeDrag = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetY: event.clientY - rect.top,
        pointerY: event.clientY,
        rowEl,
        listEl,
        scrollEl,
        ghostEl: null,
        rowHeight: rect.height,
        rowLeft: rect.left,
        rowWidth: rect.width,
        originIndex: store.nodes.findIndex(node => node.id === id),
        originCenterY: rect.top + rect.height / 2,
        initialScrollTop: scrollEl?.scrollTop ?? 0,
        slotHeight: slotHeight > 0 ? slotHeight : rect.height,
        started: false,
        frame: 0,
    }
    window.addEventListener("pointermove", onGraphNodePointerMove)
    window.addEventListener("pointerup", onGraphNodePointerUp)
    window.addEventListener("pointercancel", onGraphNodePointerUp)
    window.addEventListener("blur", finishGraphNodeDrag)
}

function onGraphNodePointerMove(event: PointerEvent) {
    const drag = graphNodeDrag
    if (!drag || event.pointerId !== drag.pointerId) return
    drag.pointerY = event.clientY
    if (drag.started) return
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    startGraphNodeDrag(drag)
}

/**
 * 克隆整行作为拖动预览：X 轴固定在原行位置，只跟随 Y 轴；
 * 换位只改本地预览顺序，松手时才一次性写回 store。
 */
function startGraphNodeDrag(drag: GraphNodeDragSession) {
    drag.started = true
    graphNodeDragId.value = drag.id
    graphNodeDragOrder.value = store.nodes.map(node => node.id)
    // 拖动期间保持抓取光标，并禁止选中文本
    graphNodeDragBodyCursor = document.body.style.cursor
    graphNodeDragBodyUserSelect = document.body.style.userSelect
    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"
    const ghost = drag.rowEl.cloneNode(true) as HTMLElement
    ghost.removeAttribute("data-graph-node-row")
    ghost.removeAttribute("data-node-id")
    ghost.classList.remove("opacity-40", "border-primary/40")
    ghost.classList.add("border-primary/60", "bg-base-100", "shadow-lg")
    Object.assign(ghost.style, {
        position: "fixed",
        left: `${drag.rowLeft}px`,
        top: `${drag.rowEl.getBoundingClientRect().top}px`,
        width: `${drag.rowWidth}px`,
        margin: "0",
        zIndex: "60",
        pointerEvents: "none",
        boxSizing: "border-box",
    })
    document.body.appendChild(ghost)
    drag.ghostEl = ghost
    drag.frame = requestAnimationFrame(graphNodeDragTick)
}

/** 每帧统一处理自动滚动、预览跟随与换位判定，避免高频 pointermove 反复触发布局 */
function graphNodeDragTick() {
    const drag = graphNodeDrag
    if (!drag?.started) return
    autoscrollGraphNodeList(drag)
    positionGraphNodeGhost(drag)
    updateGraphNodeDragIndex(drag)
    drag.frame = requestAnimationFrame(graphNodeDragTick)
}

/** 预览贴住列表可视区上下边界，不允许拖出面板 */
function positionGraphNodeGhost(drag: GraphNodeDragSession) {
    const ghost = drag.ghostEl
    if (!ghost) return
    const listRect = drag.listEl.getBoundingClientRect()
    const viewportRect = drag.scrollEl?.getBoundingClientRect()
    const minTop = viewportRect ? Math.max(viewportRect.top, listRect.top) : listRect.top
    const bottom = viewportRect ? Math.min(viewportRect.bottom, listRect.bottom) : listRect.bottom
    const maxTop = Math.max(minTop, bottom - drag.rowHeight)
    const top = Math.min(Math.max(drag.pointerY - drag.offsetY, minTop), maxTop)
    ghost.style.top = `${top}px`
}

/** 指针跨过相邻槽位中线时立即换位；按槽位换算，不受进行中的动画影响 */
function updateGraphNodeDragIndex(drag: GraphNodeDragSession) {
    const order = graphNodeDragOrder.value
    if (!order || drag.slotHeight <= 0) return
    const currentIndex = order.indexOf(drag.id)
    if (currentIndex < 0) return
    const scrolled = (drag.scrollEl?.scrollTop ?? 0) - drag.initialScrollTop
    // 锚点取自原槽位，当前槽位要减去起始下标，否则按别的行起拖会整体偏移
    const slotCenter = drag.originCenterY - scrolled + (currentIndex - drag.originIndex) * drag.slotHeight
    const steps = Math.trunc((drag.pointerY - slotCenter) / drag.slotHeight)
    if (steps === 0) return
    const nextIndex = Math.min(order.length - 1, Math.max(0, currentIndex + steps))
    if (nextIndex === currentIndex) return
    const nextOrder = order.filter(id => id !== drag.id)
    nextOrder.splice(nextIndex, 0, drag.id)
    applyGraphNodeDragOrder(drag, nextOrder)
}

/** 用 FLIP 让被拖动行与让位行一起平滑地上下滑动 */
function applyGraphNodeDragOrder(drag: GraphNodeDragSession, nextOrder: string[]) {
    const order = graphNodeDragOrder.value
    if (!order) return
    const rows = [...drag.listEl.querySelectorAll<HTMLElement>("[data-graph-node-row]")]
    const previousTops = new Map<string, number>()
    for (const row of rows) {
        const id = row.dataset.nodeId
        if (id) previousTops.set(id, row.getBoundingClientRect().top)
    }
    // 只重启动真正换了位置的行；其余行的补间照常滑到终点，避免快速拖动时整列抖动
    const oldIndexes = new Map(order.map((id, index) => [id, index]))
    const affected = new Set<string>()
    nextOrder.forEach((id, index) => {
        if (oldIndexes.get(id) !== index) affected.add(id)
    })
    for (const id of affected) {
        graphNodeSwapAnimations.get(id)?.cancel()
        graphNodeSwapAnimations.delete(id)
    }
    graphNodeDragOrder.value = nextOrder
    void nextTick(() => {
        const rowsById = new Map<string, HTMLElement>()
        for (const row of drag.listEl.querySelectorAll<HTMLElement>("[data-graph-node-row]")) {
            if (row.dataset.nodeId) rowsById.set(row.dataset.nodeId, row)
        }
        for (const id of affected) {
            const row = rowsById.get(id)
            const before = previousTops.get(id)
            if (!row || before === undefined) continue
            const delta = before - row.getBoundingClientRect().top
            if (Math.abs(delta) < 0.5) continue
            graphNodeSwapAnimations.set(
                id,
                row.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
                    duration: GRAPH_NODE_SWAP_DURATION,
                    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                })
            )
        }
    })
}

/** 拖到列表上下边缘时自动滚动，便于跨屏换位 */
function autoscrollGraphNodeList(drag: GraphNodeDragSession) {
    const scrollEl = drag.scrollEl
    if (!scrollEl) return
    const rect = scrollEl.getBoundingClientRect()
    const topGap = drag.pointerY - rect.top
    const bottomGap = rect.bottom - drag.pointerY
    let delta = 0
    if (topGap < GRAPH_NODE_DRAG_EDGE) delta = -(GRAPH_NODE_DRAG_EDGE - topGap) / 3
    else if (bottomGap < GRAPH_NODE_DRAG_EDGE) delta = (GRAPH_NODE_DRAG_EDGE - bottomGap) / 3
    delta = Math.max(-GRAPH_NODE_DRAG_MAX_SCROLL, Math.min(GRAPH_NODE_DRAG_MAX_SCROLL, delta))
    if (delta !== 0) scrollEl.scrollTop += delta
}

function onGraphNodePointerUp(event: PointerEvent) {
    if (!graphNodeDrag || event.pointerId !== graphNodeDrag.pointerId) return
    finishGraphNodeDrag()
}

function finishGraphNodeDrag() {
    const drag = graphNodeDrag
    if (!drag) return
    graphNodeDrag = null
    window.removeEventListener("pointermove", onGraphNodePointerMove)
    window.removeEventListener("pointerup", onGraphNodePointerUp)
    window.removeEventListener("pointercancel", onGraphNodePointerUp)
    window.removeEventListener("blur", finishGraphNodeDrag)
    if (drag.frame) cancelAnimationFrame(drag.frame)
    drag.ghostEl?.remove()
    // 最后一次换位的补间继续播完，下一次按下时再统一清掉
    if (drag.started) {
        document.body.style.cursor = graphNodeDragBodyCursor
        document.body.style.userSelect = graphNodeDragBodyUserSelect
    }
    const order = graphNodeDragOrder.value
    graphNodeDragOrder.value = null
    graphNodeDragId.value = null
    // 拖动全程只改本地预览顺序，松手时一次性提交
    if (drag.started && order) {
        const fromIndex = store.nodes.findIndex(node => node.id === drag.id)
        const toIndex = order.indexOf(drag.id)
        if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) store.moveNode(fromIndex, toIndex)
    }
}

onUnmounted(finishGraphNodeDrag)

/**
 * 定位到图中某个节点：只移动视图，不改变选中；
 * 移动端侧栏占满整屏，收起后才看得见画布，故一并收起。
 * @param id 节点 id
 */
async function focusGraphNode(id: string) {
    const target = store.nodes.find(node => node.id === id)
    if (!target) return
    if (target.hidden) store.setNodeHidden(id, false)
    if (window.innerWidth < 1024) sidebarCollapsed.value = true
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    // 按节点实测包围盒同时算居中与缩放：大节点缩到能完整显示，小节点最多放到 1 倍
    // （setCenter 不传 zoom 时会用 maxZoom，大节点会溢出视野）
    void fitView({ nodes: [target.id], padding: 0.15, maxZoom: 1, duration: 300 })
}

/** VueFlow 画布就绪后 resolve：首屏与载图后的适配都等待它，避免在空画布上空跑 */
let resolveFlowReady: (() => void) | null = null
const flowReady = new Promise<void>(resolve => {
    resolveFlowReady = resolve
})

/** 适配视口到所有可见节点（隐藏节点不参与）：等待画布就绪与节点尺寸测量完成 */
async function fitVisibleNodes(duration = 250) {
    const ids = store.nodes.filter(node => !node.hidden).map(node => node.id)
    if (ids.length === 0) return
    await flowReady
    // 等待节点尺寸测量完成，否则包围盒为零导致缩放错误；最多等约 3 秒
    for (let frame = 0; frame < 180; frame++) {
        const measured = ids.every(id => {
            const found = findNode(id)
            if (!found) return true
            const dimensions = found.dimensions
            return (dimensions?.width ?? 0) > 0 && (dimensions?.height ?? 0) > 0
        })
        if (measured) break
        await new Promise(resolve => requestAnimationFrame(resolve))
    }
    await nextTick()
    void fitView({ nodes: ids, padding: 0.1, duration })
}

// 删除
function onDelete(event: { nodes: any[]; edges: any[] }) {
    for (const node of event.nodes) {
        store.removeNode(node.id)
    }
    for (const edge of event.edges) {
        store.removeEdge(edge.id)
    }
    selectedNode.value = null
    selectedEdge.value = null
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent) {
    // 如果焦点在 input 元素上，不处理快捷键
    const target = event.target as HTMLElement
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) {
        return
    }

    // 快捷键说明打开时只响应 Esc，避免误操作画布
    if (shortcutsHelpShow.value) {
        if (event.key === "Escape") shortcutsHelpShow.value = false
        return
    }

    if (event.key === "Escape" && switchMenuOpen.value) {
        switchMenuOpen.value = false
        return
    }

    if (event.key === "Escape" && connectMenu.value) {
        closeConnectMenu()
        return
    }

    // Delete 键删除选中的节点或边：框选 / Shift 多选时删除整个选中集合
    if (event.key === "Delete" || event.key === "Backspace") {
        const selectedNodes = getSelectedNodes.value
        const selectedEdges = getSelectedEdges.value
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
            event.preventDefault()
            deleteSelectedItems()
        } else if (selectedNode.value) {
            deleteSelectedNode()
        } else if (selectedEdge.value) {
            deleteSelectedEdge()
        }
    }
    // Ctrl+C 复制选中节点
    else if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        if (getSelectedNodes.value.length > 0) {
            store.copySelectedNodes(getSelectedNodes.value)
        }
    }
    // Ctrl+V 粘贴节点
    else if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        store.pasteNodes()
    }
    // Ctrl+S 保存图
    else if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        handleSave()
    }
    // Ctrl+Z 撤销 / Ctrl+Shift+Z 重做
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
    }
    // Ctrl+Y 重做
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault()
        store.redo()
    }
}

// 画布就绪：放行等待中的视口适配（首屏空画布不再做无效适配）
onInit(() => {
    resolveFlowReady?.()
    resolveFlowReady = null
})

/** 复制节点时只保留可持久化的普通数据，避免把 CharBuild 实例带进新节点 */
function cloneNodeDataForDuplicate(data: Record<string, any>) {
    const clone = { ...data }
    delete clone.charBuild
    delete clone.build
    delete clone.buildVector
    delete clone.vectorDimensions
    delete clone.vectorResult
    delete clone.chartVector
    delete clone.evaluation
    delete clone.evalSignature
    delete clone.evalPending
    delete clone.result
    delete clone.panels
    delete clone.panelVectors
    delete clone.error
    delete clone.missingInputs
    delete clone.inputData
    return JSON.parse(JSON.stringify(clone)) as Record<string, any>
}

function createDuplicateLabel(label: string, usedLabels: Set<string>) {
    const base = label.trim().replace(/\s+#\d+$/, "").trim()
    if (!base) return label
    let index = 2
    while (usedLabels.has(`${base} #${index}`)) index++
    const next = `${base} #${index}`
    usedLabels.add(next)
    return next
}

/** Ctrl / Cmd 拖动时记录的“原节点 → 副本”映射 */
interface DuplicateDragEntry {
    originalId: string
    cloneId: string
    start: { x: number; y: number }
}

let duplicateDrag: DuplicateDragEntry[] | null = null
/** 复制拖动开始时的指针位置与画布缩放，用于把屏幕位移换算成流坐标 */
let duplicateDragStart: { x: number; y: number } | null = null
let duplicateDragZoom = 1
/** Ctrl 按下时的指针起点（VueFlow 的拖动事件会晚于真实按下位置） */
let duplicatePointerOrigin: { x: number; y: number } | null = null
/** 复制拖动是否已开启历史批次：整次复制 + 拖动只占一个撤销步骤 */
let duplicateHistoryBatch = false

/** 记录按住 Ctrl / Cmd 在节点上按下的真实指针位置 */
function captureDuplicatePointer(event: PointerEvent) {
    if (!(event.ctrlKey || event.metaKey)) {
        duplicatePointerOrigin = null
        return
    }
    const target = event.target as Element | null
    duplicatePointerOrigin = target?.closest?.(".vue-flow__node") ? { x: event.clientX, y: event.clientY } : null
}

/**
 * Ctrl / Cmd + 拖动：复制被拖动的节点及其全部连线，拖动的是副本，原节点留在原地。
 * 再按住 Alt 时只复制节点、不复制连线。
 * 连线外部的一端保持连接原节点，内部两端都换成副本；单连接端口已占用时自动跳过该线。
 * @param draggedNodes 被拖动的节点
 * @param copyEdges 是否连同连线一起复制
 * @returns 原节点与副本的对应关系
 */
function duplicateDraggedNodes(draggedNodes: { id: string }[], copyEdges: boolean): DuplicateDragEntry[] {
    const usedLabels = new Set(
        store.nodes.map(node => (typeof node.data.label === "string" ? node.data.label.trim() : "")).filter(Boolean)
    )
    const idMap = new Map<string, string>()
    const entries: DuplicateDragEntry[] = []
    draggedNodes.forEach(source => {
        const node = store.nodes.find(item => item.id === source.id)
        if (!node) return
        const nextId = nanoid()
        idMap.set(node.id, nextId)
        const data = cloneNodeDataForDuplicate(node.data)
        if (typeof data.label === "string" && data.label.trim()) {
            data.label = createDuplicateLabel(data.label, usedLabels)
        }
        store.addNode({
            id: nextId,
            type: node.type,
            position: { ...node.position },
            data,
        })
        entries.push({ originalId: node.id, cloneId: nextId, start: { ...node.position } })
    })
    if (idMap.size === 0) return entries
    let copiedEdge = false
    if (copyEdges) {
        store.edges.forEach(edge => {
            const source = idMap.get(edge.source) ?? edge.source
            const target = idMap.get(edge.target) ?? edge.target
            if (source === edge.source && target === edge.target) return
            const duplicate = {
                ...edge,
                id: `e${nanoid()}`,
                source,
                target,
                data: edge.data ? { ...edge.data } : undefined,
            }
            // 单连接端口已被原连线占用时无法复制该线，直接跳过
            if (store.isValidConnection(duplicate) && store.addEdge(duplicate)) copiedEdge = true
        })
    }
    // 没有复制到连线时不会触发现有重算：补算副本，按“无输入”刷新派生数据（如向量标签）
    if (!copiedEdge) {
        for (const entry of entries) store.calculateNode(entry.cloneId)
    }
    return entries
}

function syncDuplicateDrag(point: { x: number; y: number }) {
    if (!duplicateDrag || !duplicateDragStart) return
    const dx = (point.x - duplicateDragStart.x) / duplicateDragZoom
    const dy = (point.y - duplicateDragStart.y) / duplicateDragZoom
    duplicateDrag.forEach(entry => {
        const clone = store.nodes.find(node => node.id === entry.cloneId)
        if (clone) clone.position = { x: entry.start.x + dx, y: entry.start.y + dy }
        const original = store.nodes.find(node => node.id === entry.originalId)
        if (original) original.position = { ...entry.start }
    })
}

/** 拖动分组时记录的起始位置与框内节点偏移 */
let groupDrag: { id: string; children: { id: string; offsetX: number; offsetY: number }[] } | null = null

function measureNodeElement(nodeId: string) {
    const element = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${nodeId}"]`)
    return { width: element?.offsetWidth ?? 0, height: element?.offsetHeight ?? 0 }
}

function isNodeInsideGroup(node: { id: string; position: { x: number; y: number } }, group: { position: { x: number; y: number }; data: Record<string, any> }) {
    const size = measureNodeElement(node.id)
    const width = Number(group.data.width) || 640
    const height = Number(group.data.height) || 420
    return (
        node.position.x >= group.position.x &&
        node.position.y >= group.position.y &&
        node.position.x + size.width <= group.position.x + width &&
        node.position.y + size.height <= group.position.y + height
    )
}

// 拖动分组框时同步移动框内的普通节点；Ctrl 拖动时改为复制并拖动副本，Ctrl+Alt 复制时不带连线
onNodeDragStart(({ event, node, nodes: draggedNodes }) => {
    const mouseEvent = event as MouseEvent | undefined
    const modifier = mouseEvent?.ctrlKey || mouseEvent?.metaKey
    duplicateDrag = null
    duplicateDragStart = null
    if (modifier && draggedNodes.length > 0) {
        store.beginHistoryBatch()
        duplicateHistoryBatch = true
        duplicateDrag = duplicateDraggedNodes(draggedNodes, !mouseEvent?.altKey)
        duplicateDragStart = duplicatePointerOrigin ?? getEventClientPoint(event)
        duplicateDragZoom = viewport.value.zoom || 1
    }
    groupDrag = null
    if (duplicateDrag) return
    if (node.type !== NodeType.GROUP) return
    const group = store.nodes.find(item => item.id === node.id)
    if (!group) return
    const children = store.nodes.filter(
        item => item.id !== group.id && item.type !== NodeType.GROUP && isNodeInsideGroup(item, group)
    )
    groupDrag = {
        id: group.id,
        children: children.map(child => ({
            id: child.id,
            offsetX: child.position.x - node.position.x,
            offsetY: child.position.y - node.position.y,
        })),
    }
})

onNodeDrag(({ event, node }) => {
    if (duplicateDrag) {
        syncDuplicateDrag(getEventClientPoint(event))
        return
    }
    if (!groupDrag || node.id !== groupDrag.id) return
    groupDrag.children.forEach(child => {
        const target = store.nodes.find(item => item.id === child.id)
        if (!target) return
        target.position = { x: node.position.x + child.offsetX, y: node.position.y + child.offsetY }
    })
})

onNodeDragStop(({ event, node }) => {
    if (duplicateDrag) {
        // 用松开时的指针位置收尾：副本留在终点，原节点回到起点
        syncDuplicateDrag(getEventClientPoint(event))
        duplicateDrag = null
        duplicateDragStart = null
    }
    duplicatePointerOrigin = null
    if (groupDrag?.id === node.id) groupDrag = null
    if (duplicateHistoryBatch) {
        duplicateHistoryBatch = false
        store.endHistoryBatch("复制节点")
    } else {
        // 普通拖动/分组拖动：位置变化在松开时记为一步
        store.commitHistory("移动节点")
    }
})

// 点击外部关闭右键菜单与切换图菜单
function handleClickOutside(_event: MouseEvent) {
    contextMenuVisible.value = false
    switchMenuOpen.value = false
}

/** 点击菜单外部时关闭端口落点菜单（用 pointerdown 避免菜单打开当次点击立即关闭） */
function handleConnectMenuPointerDown(event: PointerEvent) {
    if (!connectMenu.value) return
    if (connectMenuEl.value?.contains(event.target as Node)) return
    closeConnectMenu()
}

// 注册事件监听器
onMounted(() => {
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("click", handleClickOutside)
    window.addEventListener("pointerdown", handleConnectMenuPointerDown, true)
    window.addEventListener("pointerdown", captureDuplicatePointer, true)
})

function selectGraphFromMenu(graphId: number) {
    selectedGraphId.value = graphId
    switchMenuOpen.value = false
    void handleGraphChange()
}

// 图切换处理
async function handleGraphChange() {
    if (selectedGraphId.value) {
        await store.loadGraphFromDB(Number(selectedGraphId.value))
    } else {
        // 创建新图
        store.clearGraph()
        store.currentGraphId = null
        store.currentGraphName = "未命名图"
    }
    // 载图后适配一次视口，容下所有可见节点（空图直接跳过）
    void fitVisibleNodes()
}

// 导入处理
function handleImport() {
    fileInput.value?.click()
}

// 文件输入变化处理
async function handleFileInputChange(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        const file = target.files[0]
        try {
            await store.importGraph(file)
            // 重置文件输入
            target.value = ""
            // 载图后适配一次视口，容下所有可见节点
            void fitVisibleNodes()
        } catch (error) {
            console.error("导入图失败:", error)
        }
    }
}

// 保存处理
async function handleSave() {
    await store.saveGraphToDB(store.currentGraphName)
    // 更新图列表
    await store.loadAllGraphs()
    selectedGraphId.value = store.currentGraphId || ""
}

// 删除图处理
function handleDeleteGraph() {
    const dialog = document.getElementById("delete-graph-dialog") as HTMLDialogElement
    if (dialog) {
        dialog.showModal()
    }
}

// 关闭删除对话框
function closeDeleteDialog() {
    const dialog = document.getElementById("delete-graph-dialog") as HTMLDialogElement
    if (dialog) {
        dialog.close()
    }
}

// 确认删除图
async function confirmDeleteGraph() {
    if (store.currentGraphId) {
        await store.deleteGraphFromDB(store.currentGraphId)
        // 重置当前图
        store.clearGraph()
        store.currentGraphId = null
        store.currentGraphName = "未命名图"
        selectedGraphId.value = ""
        // 关闭对话框
        closeDeleteDialog()
    }
}

// 组件挂载时加载所有图和最后编辑的图
onMounted(async () => {
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("click", handleClickOutside)
    // 每次挂载（含右键刷新重挂）都从零开始计数
    resetNodeEditorPerf()
    // 加载所有图
    await store.loadAllGraphs()
    // 分享链接进来的优先加载分享图，否则恢复最后编辑的本地图
    if (routeGraphId.value) {
        await loadSharedGraph(routeGraphId.value)
    } else {
        // 加载最后编辑的图
        await store.loadLastEditedGraph()
        // 首屏视口容下所有可见节点
        void fitVisibleNodes()
    }
    // 更新selectedGraphId为当前图ID
    selectedGraphId.value = store.currentGraphId || ""
    // 启动自动保存
    store.startAutoSave()
    await nextTick()
    initializing.value = false
})

// 数据包延迟 hydrate 后重建构筑实例与求值结果
watch(dataPackHydrationKey, () => {
    store.recalculateAllNodes()
})

// 分享路由切换（/flow ↔ /flow/:graphId）：切到带 id 时载入分享图，切回时不断开当前画布
watch(routeGraphId, graphId => {
    if (graphId && graphId !== activeRemoteId.value) {
        void loadSharedGraph(graphId)
    }
})

// 移除事件监听器
onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("click", handleClickOutside)
    window.removeEventListener("pointerdown", handleConnectMenuPointerDown, true)
    window.removeEventListener("pointerdown", captureDuplicatePointer, true)
    // 复制拖动期间卸载时结束未闭合的历史批次
    if (duplicateHistoryBatch) {
        duplicateHistoryBatch = false
        store.endHistoryBatch("复制节点")
    }
    // 落盘排队的自动保存
    store.flushAutoSave()
    // 杀掉在途求值：重挂后图数据会整体替换，旧 debounce 回调不再有意义
    store.cancelPendingEvaluations()
})

/** 当前载入的分享图 id（路由 /flow/:graphId 或浏览弹窗载入后设置，用于徽标与评论区） */
const activeRemoteId = ref<string | null>(null)
const share_model_show = ref(false)
const share_title = ref("")
const share_desc = ref("")
const sharing = ref(false)
const browse_open = ref(false)
const graphShow = ref<{ fetchGraphs: () => void } | null>(null)
const graphChat = ref<{ open: () => void } | null>(null)
const DOBGraphShow = defineAsyncComponent(() => import("@/components/DOBGraphShow.vue"))
const CommentSection = defineAsyncComponent(() => import("@/components/CommentSection.vue"))
const GraphChatDialog = defineAsyncComponent(() => import("@/components/GraphChatDialog.vue"))

/** 节点图助手会话键：分享图按远端 id，本地按图，互不串话 */
const graphChatKey = computed(() => (activeRemoteId.value ? `shared:${activeRemoteId.value}` : `local:${store.currentGraphId ?? "new"}`))

function openShareModal() {
    share_title.value = store.currentGraphName ? `${store.currentGraphName}节点图` : "我的节点图"
    share_desc.value = ""
    share_model_show.value = true
}

async function confirmShare() {
    if (sharing.value) return
    const title = share_title.value.trim()
    if (!title) {
        ui.showErrorMessage("请填写标题")
        return
    }
    sharing.value = true
    try {
        const graphData = store.exportGraphJson(store.currentGraphName || title)
        const result = await createGraphMutation({
            input: { title, desc: share_desc.value, graphData },
        })

        if (result) {
            activeRemoteId.value = result.id
            await copyText(`${env.endpoint}/graph/${result.id}`)
            ui.showSuccessMessage("节点图分享链接已复制")
            share_model_show.value = false
            graphShow.value?.fetchGraphs()
        }
    } catch (error) {
        ui.showErrorMessage("分享失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        sharing.value = false
    }
}

async function loadSharedGraph(graphId: string) {
    try {
        const graph = await graphQuery({ id: graphId }, { requestPolicy: "network-only" })
        if (graph?.graphData) {
            const parsed = JSON.parse(graph.graphData) as { nodes?: unknown[]; edges?: unknown[]; name?: string }
            store.loadGraphData(parsed, graph.title)
            selectedGraphId.value = ""
            activeRemoteId.value = graph.id
            // 载图后适配一次视口，容下所有可见节点
            await fitVisibleNodes()
            return
        }
        ui.showErrorMessage("节点图不存在或数据损坏")
    } catch (error) {
        console.error("加载分享节点图失败", error)
        ui.showErrorMessage("加载分享节点图失败")
    }
}

/** 浏览弹窗里点「载入」：走路由中转，保证刷新/短链与当前视图一致 */
function handleUseGraph(_graphData: string, remoteId: string) {
    browse_open.value = false
    if (remoteId === routeGraphId.value) {
        void loadSharedGraph(remoteId)
        return
    }
    void router.replace(`/flow/${remoteId}`)
}

function handleNewGraph() {
    activeRemoteId.value = null
    void router.replace("/flow")
    store.clearGraph()
    store.currentGraphId = null
    store.currentGraphName = "未命名图"
    selectedGraphId.value = ""
}

const emit = defineEmits<{
    (e: "request-refresh"): void
}>()

/** 右键刷新：通知外层卸载重挂本组件，走完整挂载流程（加载图 + 正在加载遮罩），不碰整页 */
function requestRefresh() {
    contextMenuVisible.value = false
    emit("request-refresh")
}

const transferDialogShow = ref(false)
const selectedCharName = ref("")
async function handleTransfer(charName: string) {
    const charId = charMap.get(charName)?.id
    if (!charId) {
        ui.showErrorMessage(`角色 ${charName} 不存在`)
        return
    }
    const charSettings = useCharSettings(ref(charId))
    await importCharSettingsToNodeEditor(charName, charSettings.value)
    transferDialogShow.value = false
    // 等待 VueFlow 完成节点尺寸测量后再适配视图
    await fitVisibleNodes(300)
}
</script>

<template>
    <div class="relative flex h-full min-h-0 bg-base-200 text-base-content" style="touch-action: manipulation">
        <DialogModel v-model="transferDialogShow">
            <div class="flex flex-col gap-2">
                <div>{{ $t("node-editor.import_from_build") }}</div>
                <CharSelect v-model="selectedCharName" />
            </div>
            <template #action>
                <button class="btn btn-xs btn-primary" :disabled="!selectedCharName" @click="handleTransfer(selectedCharName)">
                    {{ $t("node-editor.migrate") }}
                </button>
            </template>
        </DialogModel>
        <!-- 左侧栏：节点库 / 画布 / 性能 三个标签页，可整体收起 -->
        <aside v-if="!sidebarCollapsed" class="flex w-full flex-none flex-col border-r border-base-content/10 bg-base-100 lg:w-56">
            <div class="flex h-8 flex-none items-center gap-1.5 border-b border-base-content/10 px-2">
                <PaneTabs v-model="activePane" />
                <!-- 移动端抽屉关闭：侧栏打开时画布工具栏不可见，只能在这里关 -->
                <button
                    type="button"
                    class="ml-auto grid size-6 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.95] lg:hidden"
                    title="关闭侧栏"
                    aria-label="关闭侧栏"
                    @click="sidebarCollapsed = true"
                >
                    <Icon icon="ri:close-line" class="size-4" />
                </button>
            </div>
            <ScrollArea class="min-h-0 flex-1">
                <!-- 节点库：可拖入画布的节点 -->
                <div v-if="activePane === 'palette'" class="p-1.5">
                    <div class="flex items-center gap-1.5 px-1 py-1">
                        <Icon icon="ri:node-tree" class="size-3.5 text-base-content/50" />
                        <span class="text-[11px] tracking-wide text-base-content/55">节点列表</span>
                        <span class="ml-auto font-mono text-[10px] text-base-content/35">{{ PALETTE_ITEMS.length }}</span>
                    </div>
                    <div v-for="(items, category) in groupedPaletteItems" :key="category" class="mb-1.5">
                        <div class="px-1 py-1 text-[10px] tracking-wide text-base-content/40">{{ getCategoryLabel(category) }}</div>
                        <div
                            v-for="item in items"
                            :key="item.type"
                            class="group mb-0.5 flex cursor-move items-center gap-1.5 border border-transparent px-1.5 py-1 transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5"
                            @mousedown="onMouseDown($event, item)"
                        >
                            <Icon v-if="item.icon" :icon="item.icon" class="size-3.5 shrink-0 text-base-content/50 group-hover:text-primary" />
                            <span class="min-w-0 flex-1">
                                <span class="block truncate text-[12px] text-base-content/80">{{ item.label }}</span>
                                <span v-if="item.description" class="block truncate text-[10px] leading-4 text-base-content/35">
                                    {{ item.description }}
                                </span>
                            </span>
                        </div>
                    </div>
                </div>
                <!-- 画布：当前图里的全部节点，点击选中并定位；拖动手柄实时调整层级 -->
                <div v-else-if="activePane === 'canvas'" ref="graphNodeListEl" class="p-1.5">
                    <div class="flex items-center gap-1.5 px-1 py-1">
                        <Icon icon="ri:artboard-2-line" class="size-3.5 text-base-content/50" />
                        <span class="text-[11px] tracking-wide text-base-content/55">画布</span>
                        <span class="ml-auto font-mono text-[10px] text-base-content/35">{{ graphNodes.length }}</span>
                    </div>
                    <div v-if="graphNodes.length === 0" class="px-1.5 py-3 text-[11px] text-base-content/40">画布里还没有节点</div>
                    <div
                        v-for="node in graphNodes"
                        :key="node.id"
                        data-graph-node-row
                        :data-node-id="node.id"
                        class="group mb-0.5 flex w-full items-center gap-0.5 border px-1 py-0.5 transition-colors duration-150"
                        :class="[
                            node.selected ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-primary/40 hover:bg-primary/5',
                            graphNodeDragId === node.id ? 'opacity-40' : '',
                        ]"
                    >
                        <button
                            type="button"
                            class="grid size-5 shrink-0 cursor-grab touch-none place-items-center text-base-content/30 transition-colors duration-150 select-none hover:text-primary active:cursor-grabbing"
                            title="拖动调整层级（越靠下越靠前）"
                            aria-label="拖动调整节点层级"
                            @pointerdown="onGraphNodePointerDown($event, node.id)"
                        >
                            <Icon icon="ri:draggable" class="size-3.5" />
                        </button>
                        <button
                            type="button"
                            class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-0.5 text-left"
                            :title="node.locked ? `${node.label}（已锁定）` : node.label"
                            @click="selectGraphNode(node.id, $event)"
                        >
                            <Icon v-if="node.icon" :icon="node.icon" class="size-3.5 shrink-0 text-base-content/50 group-hover:text-primary" />
                            <span
                                class="min-w-0 flex-1 truncate text-[12px]"
                                :class="node.hidden ? 'text-base-content/35 line-through' : 'text-base-content/80'"
                            >
                                {{ node.label }}
                            </span>
                        </button>
                        <button
                            type="button"
                            class="grid size-5 shrink-0 cursor-pointer place-items-center text-base-content/45 transition-colors duration-150 hover:text-primary"
                            title="定位到节点"
                            @click.stop="focusGraphNode(node.id)"
                        >
                            <Icon icon="ri:crosshair-line" class="size-3.5" />
                        </button>
                        <button
                            type="button"
                            class="grid size-5 shrink-0 cursor-pointer place-items-center transition-colors duration-150 hover:text-primary"
                            :class="node.hidden ? 'text-warning' : 'text-base-content/45'"
                            :title="node.hidden ? '显示节点' : '隐藏节点'"
                            @click.stop="toggleGraphNodeHidden(node.id)"
                        >
                            <Icon :icon="node.hidden ? 'ri:eye-off-line' : 'ri:eye-line'" class="size-3.5" />
                        </button>
                        <button
                            type="button"
                            class="grid size-5 shrink-0 cursor-pointer place-items-center transition-colors duration-150 hover:text-primary"
                            :class="node.locked ? 'text-warning' : 'text-base-content/45'"
                            :title="node.locked ? '解锁节点' : '锁定节点'"
                            @click.stop="toggleGraphNodeLocked(node.id)"
                        >
                            <Icon icon="ri:lock-line" class="size-3.5" />
                        </button>
                    </div>
                </div>
                <!-- 性能：同步阶段 / worker 请求耗时与按节点的调用记录 -->
                <PerformancePane v-else />
            </ScrollArea>

            <!-- 拖拽中的节点副本 -->
            <div
                v-if="draggingItem"
                class="pointer-events-none fixed z-50 rounded-xs border border-base-content/20 bg-base-100/90 px-2 py-1 shadow-lg backdrop-blur-sm"
                :style="{
                    left: draggingPosition.x + 'px',
                    top: draggingPosition.y + 'px',
                    transform: 'translate(-50%, -50%)',
                }"
            >
                <div class="flex items-center gap-1.5">
                    <Icon v-if="draggingItem.icon" :icon="draggingItem.icon" class="size-3.5" />
                    <span class="text-[12px]">{{ draggingItem.label }}</span>
                </div>
            </div>
        </aside>

        <!-- 节点编辑器画布：移动端侧栏占满整屏时整列隐藏，桌面端始终与侧栏并排 -->
        <div class="relative min-w-0 flex-1 flex-col" :class="sidebarCollapsed ? 'flex' : 'hidden lg:flex'">
            <!-- 工具栏 -->
            <div class="flex flex-none flex-wrap items-center gap-1 border-b border-base-content/10 bg-base-100 px-2 py-1 sm:gap-1.5">
                <!-- 侧栏收起 / 展开 -->
                <button
                    type="button"
                    class="grid size-6 cursor-pointer place-items-center text-base-content/60 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary"
                    :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
                    :aria-label="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
                    @click="sidebarCollapsed = !sidebarCollapsed"
                >
                    <Icon :icon="sidebarCollapsed ? 'ri:contract-right-line' : 'ri:contract-left-line'" class="size-3.5" />
                </button>
                <!-- 移动端撤销 / 重做（无键盘、右键菜单时仍可操作） -->
                <button
                    type="button"
                    class="grid size-6 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30 sm:hidden"
                    title="撤销"
                    aria-label="撤销"
                    :disabled="!store.canUndo"
                    @click="store.undo"
                >
                    <Icon icon="ri:arrow-left-line" class="size-3.5" />
                </button>
                <button
                    type="button"
                    class="grid size-6 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30 sm:hidden"
                    title="重做"
                    aria-label="重做"
                    :disabled="!store.canRedo"
                    @click="store.redo"
                >
                    <Icon icon="ri:arrow-right-line" class="size-3.5" />
                </button>
                <!-- 图名称 + 切换图合并：输入框改名，加号新建，切换图标切图 -->
                <div class="hidden min-w-0 items-center gap-0.5 md:flex">
                    <input
                        v-model="store.currentGraphName"
                        class="w-36 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        placeholder="未命名图"
                        @blur="store.setCurrentGraphName(store.currentGraphName)"
                    />
                    <button
                        type="button"
                        class="grid size-6 shrink-0 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.95]"
                        title="创建新图"
                        aria-label="创建新图"
                        @click="handleNewGraph"
                    >
                        <Icon icon="ri:add-line" class="size-3.5" />
                    </button>
                    <div class="relative shrink-0">
                        <button
                            type="button"
                            class="grid size-6 cursor-pointer place-items-center text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary active:scale-[0.95]"
                            title="切换图"
                            aria-label="切换图"
                            @click.stop="switchMenuOpen = !switchMenuOpen"
                        >
                            <Icon icon="ri:exchange-line" class="size-3.5" />
                        </button>
                        <div
                            v-if="switchMenuOpen"
                            class="absolute left-0 top-7 z-50 max-h-64 w-44 overflow-y-auto border border-base-content/10 bg-base-100 py-1 shadow-lg"
                            @click.stop
                        >
                            <div v-if="store.savedGraphs.length === 0" class="px-2 py-3 text-center text-[11px] text-base-content/45">
                                还没有保存的图
                            </div>
                            <button
                                v-for="graph in store.savedGraphs"
                                :key="graph.id"
                                type="button"
                                class="flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-[12px] transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                                :class="graph.id === store.currentGraphId ? 'text-primary' : 'text-base-content/75'"
                                @click="selectGraphFromMenu(graph.id)"
                            >
                                <span class="min-w-0 flex-1 truncate">{{ graph.name }}</span>
                                <Icon v-if="graph.id === store.currentGraphId" icon="ri:check-line" class="size-3.5 shrink-0" />
                            </button>
                        </div>
                    </div>
                </div>
                <span v-if="activeRemoteId" class="badge badge-success badge-sm hidden gap-1 md:inline-flex" title="当前画布来自分享链接，可继续编辑后另存为新分享">
                    <Icon icon="ri:download-2-line" class="size-3" />
                    分享载入
                </span>
                <OpenInAppButton
                    kind="graph"
                    :id="activeRemoteId"
                    class="flex h-6 cursor-pointer items-center gap-1 border border-base-content/10 bg-base-100 px-1.5 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                    icon-class="size-3"
                >
                    <span class="hidden sm:inline">{{ $t("deep-link.open_in_app") }}</span>
                </OpenInAppButton>

                <!-- 自动保存 -->
                <label class="flex items-center gap-1 text-[11px] text-base-content/50" title="自动保存">
                    <input
                        id="auto-save"
                        v-model="store.autoSaveEnabled"
                        type="checkbox"
                        class="checkbox checkbox-xs"
                        aria-label="自动保存"
                        @change="store.setAutoSaveEnabled(store.autoSaveEnabled)"
                    />
                    <span class="hidden sm:inline">自动保存</span>
                    <Icon
                        v-if="store.autoSaveEnabled"
                        :icon="store.autoSaveStatus === 'waiting' ? 'ri:time-line' : 'ri:check-line'"
                        class="size-3.5"
                        :class="store.autoSaveStatus === 'waiting' ? 'text-warning/70' : 'text-success/70'"
                        :title="store.autoSaveStatus === 'waiting' ? '等待自动保存' : '已自动保存'"
                    />
                </label>

                <!-- 导入导出：移动端仅显示图标 -->
                <div class="ml-auto flex items-center gap-0.5 sm:gap-1">
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-base-content/10 bg-base-100 px-1.5 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                        title="显示全部"
                        aria-label="显示全部"
                        @click="fitVisibleNodes(300)"
                    >
                        <Icon icon="ri:focus-3-line" class="size-3" />
                        <span class="hidden sm:inline">显示全部</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-base-content/10 bg-base-100 px-1.5 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                        :title="$t('node-editor.migrate')"
                        :aria-label="$t('node-editor.migrate')"
                        @click="transferDialogShow = true"
                    >
                        <Icon icon="ri:file-transfer-line" class="size-3" />
                        <span class="hidden sm:inline">{{ $t("node-editor.migrate") }}</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-base-content/10 bg-base-100 px-1.5 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                        title="导入"
                        aria-label="导入"
                        @click="handleImport"
                    >
                        <Icon icon="ri:upload-2-line" class="size-3" />
                        <span class="hidden sm:inline">导入</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-base-content/10 bg-base-100 px-1.5 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                        title="导出"
                        aria-label="导出"
                        @click="store.exportGraph"
                    >
                        <Icon icon="ri:download-2-line" class="size-3" />
                        <span class="hidden sm:inline">导出</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-base-content/10 bg-base-100 px-1.5 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                        title="浏览"
                        aria-label="浏览"
                        @click="browse_open = true"
                    >
                        <Icon icon="ri:share-line" class="size-3" />
                        <span class="hidden sm:inline">浏览</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-base-content/10 bg-base-100 px-1.5 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                        title="AI"
                        aria-label="AI"
                        @click="graphChat?.open()"
                    >
                        <Icon icon="ri:robot-2-line" class="size-3" />
                        <span class="hidden sm:inline">AI</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-primary/40 bg-primary/15 px-1.5 text-[10px] font-semibold text-primary transition-colors duration-150 hover:bg-primary/20 active:scale-[0.97]"
                        :title="activeRemoteId ? '已载入分享图，分享当前画布为一张新图' : '分享'"
                        aria-label="分享"
                        @click="openShareModal"
                    >
                        <Icon icon="ri:upload-cloud-line" class="size-3" />
                        <span class="hidden sm:inline">分享</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-primary/40 bg-primary/15 px-1.5 text-[10px] font-semibold text-primary transition-colors duration-150 hover:bg-primary/20 active:scale-[0.97]"
                        title="保存"
                        aria-label="保存"
                        @click="handleSave"
                    >
                        <Icon icon="ri:save-fill" class="size-3" />
                        <span class="hidden sm:inline">保存</span>
                    </button>
                    <button
                        class="flex h-6 cursor-pointer items-center gap-1 border border-error/30 bg-base-100 px-1.5 text-[10px] text-error transition-colors duration-150 hover:bg-error/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                        title="删除"
                        aria-label="删除"
                        :disabled="!store.currentGraphId"
                        @click="handleDeleteGraph"
                    >
                        <Icon icon="ri:delete-bin-2-fill" class="size-3" />
                        <span class="hidden sm:inline">删除</span>
                    </button>
                </div>

                <!-- 删除确认对话框 -->
                <dialog id="delete-graph-dialog" class="modal">
                    <div class="modal-box rounded-xs">
                        <h3 class="text-base font-bold">确认删除</h3>
                        <p class="py-3 text-sm text-base-content/60">您确定要删除当前图吗？此操作不可撤销。</p>
                        <div class="modal-action">
                            <button class="btn btn-xs" @click="closeDeleteDialog">取消</button>
                            <button class="btn btn-xs btn-error" @click="confirmDeleteGraph">确认删除</button>
                        </div>
                    </div>
                    <form method="dialog" class="modal-backdrop">
                        <button>关闭</button>
                    </form>
                </dialog>

                <!-- 分享弹窗 -->
                <DialogModel v-model="share_model_show" class="bg-base-300" @submit="confirmShare">
                    <div class="space-y-4">
                        <h3 class="text-xl font-bold">分享节点图</h3>
                        <p class="text-xs text-base-content/55">将当前画布的全部节点与连线打包分享，载入后可继续编辑与求值。</p>
                        <div>
                            <label class="label" for="share-graph-title">
                                <span class="label-text">标题</span>
                            </label>
                            <input
                                id="share-graph-title"
                                v-model="share_title"
                                type="text"
                                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                placeholder="输入标题..."
                                maxlength="50"
                            />
                        </div>
                        <div>
                            <label class="label" for="share-graph-desc">
                                <span class="label-text">描述</span>
                            </label>
                            <textarea
                                id="share-graph-desc"
                                v-model="share_desc"
                                class="w-full resize-none rounded-none border-b border-base-content/20 bg-transparent px-0.5 py-1 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                placeholder="这张图算什么、怎么用..."
                                rows="3"
                                maxlength="800"
                            ></textarea>
                        </div>
                    </div>
                    <template #action>
                        <button type="button" class="btn btn-ghost flex-1" @click="share_model_show = false">取消</button>
                        <button type="button" class="btn btn-primary flex-1" :class="{ 'btn-disabled': sharing }" @click="confirmShare">
                            <span v-if="sharing" class="loading loading-spinner loading-sm" />
                            {{ sharing ? "分享中..." : "分享" }}
                        </button>
                    </template>
                </DialogModel>

                <!-- 浏览分享弹窗 -->
                <DialogModel v-model="browse_open" class="max-w-4xl bg-base-200">
                    <div class="flex h-[70vh] flex-col">
                        <div class="mb-2 flex items-center justify-between">
                            <h3 class="text-lg font-bold">节点图分享</h3>
                            <button type="button" class="btn btn-ghost btn-sm" @click="browse_open = false">关闭</button>
                        </div>
                        <div class="min-h-0 flex-1">
                            <DOBGraphShow v-if="browse_open" ref="graphShow" :active-graph-id="activeRemoteId" @use-graph="handleUseGraph" />
                        </div>
                        <div v-if="activeRemoteId" class="mt-2 border-t border-base-content/10 pt-2">
                            <CommentSection :target-id="`graph_${activeRemoteId}`" />
                        </div>
                    </div>
                </DialogModel>

                <!-- 快捷键说明弹窗 -->
                <DialogModel v-model="shortcutsHelpShow" class="max-w-xl bg-base-100">
                    <div class="flex items-center gap-2">
                        <Icon icon="ri:keyboard-line" class="size-4 text-primary" />
                        <h3 class="text-base font-bold">快捷键说明</h3>
                    </div>
                    <p class="mt-1 text-[11px] text-base-content/45">macOS 上可将 Ctrl 换成 Cmd 使用。</p>
                    <div class="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                        <section v-for="group in shortcutHelpGroups" :key="group.title" class="space-y-1">
                            <div class="text-[10px] tracking-wide text-base-content/40">{{ group.title }}</div>
                            <div
                                v-for="item in group.items"
                                :key="item.label"
                                class="flex items-start justify-between gap-2 text-[11px] leading-4"
                            >
                                <span class="min-w-0 text-base-content/70">{{ item.label }}</span>
                                <kbd
                                    class="kbd kbd-xs mt-0.5 shrink-0 border-base-content/15 bg-base-200 font-mono text-[10px] text-base-content/60"
                                >
                                    {{ item.keys }}
                                </kbd>
                            </div>
                        </section>
                    </div>
                    <template #action>
                        <button type="button" class="btn btn-xs btn-primary" @click="shortcutsHelpShow = false">关闭</button>
                    </template>
                </DialogModel>

                <!-- 节点图助手对话窗（悬浮按钮关闭，只走工具栏「AI 助手」入口） -->
                <GraphChatDialog ref="graphChat" :chat-key="graphChatKey" :fab="false" />
            </div>

            <!-- 隐藏的文件输入 -->
            <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleFileInputChange" />

            <!-- 图数据加载层 -->
            <div
                v-if="initializing"
                class="absolute inset-0 z-20 grid place-items-center bg-base-100/75 backdrop-blur-sm"
            >
                <div class="flex flex-col items-center gap-2">
                    <span class="loading loading-spinner loading-md text-primary" />
                    <span class="text-[11px] tracking-wide text-base-content/50">正在加载节点图…</span>
                </div>
            </div>

            <VueFlow
                v-model:nodes="store.nodes"
                v-model:edges="store.edges"
                :node-types="nodeTypes"
                :default-zoom="0.8"
                :min-zoom="0.2"
                :max-zoom="2"
                :selection-mode="SelectionMode.Partial"
                multi-selection-key-code="Shift"
                :is-valid-connection="isValidCanvasConnection"
                :delete-key-code="null"
                @connect="handleCanvasConnect"
                @node-click="handleNodeClick"
                @edge-click="handleEdgeClick"
                @node-context-menu="handleNodeContextMenu"
                @edge-context-menu="handleEdgeContextMenu"
                @selection-context-menu="handleSelectionContextMenu"
                @pane-context-menu="handlePaneContextMenu"
                @delete="onDelete"
            >
                <!-- 背景 -->
                <Background pattern-color="#aaa" :gap="20" />

                <!-- 控制按钮 -->
                <Controls />

                <!-- 小地图：移动端隐藏以避免遮挡画布 -->
                <MiniMap class="hidden md:block" />
            </VueFlow>

            <!-- 端口拖出未连接时的候选节点菜单 -->
            <div
                v-if="connectMenu"
                ref="connectMenuEl"
                class="fixed z-50 flex w-72 max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/95 shadow-lg backdrop-blur-sm"
                :style="{ left: connectMenu.x + 'px', top: connectMenu.y + 'px' }"
                @pointerdown.stop
                @click.stop
                @wheel.stop
            >
                <div class="flex items-center gap-1.5 border-b border-base-content/10 px-2 py-1.5">
                    <span class="size-2 shrink-0 rounded-full" :style="{ background: PORT_META[connectMenu.portType].color }" />
                    <span class="text-[11px] text-base-content/60">
                        {{ PORT_META[connectMenu.portType].label }}
                        {{ connectMenu.direction === "input" ? "输入" : "输出" }}
                    </span>
                    <button class="ml-auto grid size-5 place-items-center text-base-content/50 hover:text-base-content" @click="closeConnectMenu">
                        <Icon icon="ri:close-line" class="size-3.5" />
                    </button>
                </div>
                <div class="border-b border-base-content/10 px-2 py-1.5">
                    <input
                        ref="connectSearchInput"
                        v-model="connectMenuSearch"
                        type="search"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        placeholder="搜索可连接的节点"
                        @keydown.enter.prevent="chooseFirstConnectCandidate"
                        @keydown.esc.stop.prevent="closeConnectMenu"
                    />
                </div>
                <div class="max-h-80 overflow-y-auto p-1">
                    <div v-for="(items, category) in groupedConnectCandidates" :key="category">
                        <div class="px-1.5 py-1 text-[10px] tracking-wide text-base-content/40">
                            {{ getCategoryLabel(category) }}
                        </div>
                        <button
                            v-for="candidate in items"
                            :key="candidate.item.type"
                            class="flex w-full items-center gap-1.5 px-1.5 py-1 text-left transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                            @click="chooseConnectCandidate(candidate)"
                        >
                            <Icon v-if="candidate.item.icon" :icon="candidate.item.icon" class="size-3.5 shrink-0" />
                            <span class="min-w-0 flex-1">
                                <span class="block truncate text-[12px]">{{ candidate.item.label }}</span>
                                <span class="block truncate text-[10px] opacity-50">{{ candidate.item.description }}</span>
                            </span>
                            <span class="shrink-0 border border-base-content/15 px-1 text-[9px] text-base-content/45">
                                {{ connectMenu.direction === "input" ? "输入" : "输出" }} {{ candidate.portLabel }}
                            </span>
                        </button>
                    </div>
                    <div v-if="filteredConnectCandidates.length === 0" class="px-2 py-3 text-center text-[11px] text-base-content/45">
                        没有可连接的节点
                    </div>
                </div>
            </div>

            <!-- 自定义右键菜单 -->
            <div
                v-if="contextMenuVisible"
                class="fixed z-50 rounded-xs border border-base-content/10 bg-base-100/95 p-1 shadow-lg outline-none backdrop-blur-sm"
                :style="{
                    left: contextMenuPosition.x + 'px',
                    top: contextMenuPosition.y + 'px',
                    transform: 'translate(0, 0)',
                }"
                @click.stop
                @contextmenu.stop
            >
                <!-- 撤销 / 重做 -->
                <div
                    class="flex select-none items-center gap-1.5 px-2 py-1 text-[11px] leading-none transition-colors duration-150"
                    :class="store.canUndo ? 'cursor-pointer text-base-content/75 hover:bg-primary/10 hover:text-primary' : 'cursor-not-allowed text-base-content/30'"
                    @click="undoFromMenu"
                >
                    <Icon class="size-3.5" icon="ri:arrow-left-line" />
                    撤销
                    <span class="ml-auto text-[10px] opacity-60">Ctrl+Z</span>
                </div>
                <div
                    class="flex select-none items-center gap-1.5 px-2 py-1 text-[11px] leading-none transition-colors duration-150"
                    :class="store.canRedo ? 'cursor-pointer text-base-content/75 hover:bg-primary/10 hover:text-primary' : 'cursor-not-allowed text-base-content/30'"
                    @click="redoFromMenu"
                >
                    <Icon class="size-3.5" icon="ri:arrow-right-line" />
                    重做
                    <span class="ml-auto text-[10px] opacity-60">Ctrl+Y</span>
                </div>
                <div class="my-1 h-px bg-base-content/10" />
                <!-- 复制选项 -->
                <div
                    v-if="contextMenuCopyable"
                    class="group flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 text-[11px] leading-none text-base-content/75 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                    @click="
                        () => {
                            store.copySelectedNodes(getSelectedNodes)
                            contextMenuVisible = false
                        }
                    "
                >
                    <Icon class="size-3.5" icon="ri:file-copy-line" />
                    复制选中项
                    <span v-if="getSelectedNodes.length > 0" class="ml-1 text-xs opacity-70"> ({{ getSelectedNodes.length }}节点) </span>
                    <span class="ml-auto pl-3 text-[10px] opacity-60">Ctrl+C</span>
                </div>
                <!-- 粘贴选项 -->
                <div
                    v-if="store.copiedNodes.length > 0"
                    class="group flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 text-[11px] leading-none text-base-content/75 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                    @click="
                        () => {
                            store.pasteNodes()
                            contextMenuVisible = false
                        }
                    "
                >
                    <Icon class="size-3.5" icon="ri:clipboard-line" />
                    粘贴
                    <span v-if="store.copiedNodes.length > 0" class="ml-1 text-xs opacity-70"> ({{ store.copiedNodes.length }}节点) </span>
                    <span class="ml-auto pl-3 text-[10px] opacity-60">Ctrl+V</span>
                </div>
                <!-- 删除选项：按右键命中的目标决定删除对象 -->
                <div
                    v-if="contextMenuDelete"
                    class="group flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 text-[11px] leading-none text-base-content/75 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                    @click="deleteFromMenu"
                >
                    <Icon class="size-3.5" icon="ri:delete-bin-line" />
                    {{ contextMenuDelete.label }}
                    <span v-if="contextMenuDelete.detail" class="ml-1 text-xs opacity-70">{{ contextMenuDelete.detail }}</span>
                    <span class="ml-auto pl-3 text-[10px] opacity-60">Delete</span>
                </div>
                <div
                    class="group flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 text-[11px] leading-none text-base-content/75 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                    title="重载节点图，不刷新整页"
                    @click="requestRefresh"
                >
                    <Icon class="size-3.5" icon="ri:refresh-line" />
                    刷新
                </div>
                <div class="my-1 h-px bg-base-content/10" />
                <!-- 快捷键说明入口 -->
                <div
                    class="group flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 text-[11px] leading-none text-base-content/75 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                    @click="openShortcutsHelp"
                >
                    <Icon class="size-3.5" icon="ri:keyboard-line" />
                    快捷键说明
                </div>
            </div>
        </div>
    </div>
</template>
<style>
.vue-flow__handle {
    /* 高紧凑节点使用 8px 连接点 */
    width: 8px !important;
    height: 8px !important;
}

/* 分组框始终垫在普通节点下方 */
.vue-flow__node-group {
    z-index: -1 !important;
}
</style>
