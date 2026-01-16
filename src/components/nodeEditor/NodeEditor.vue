<script setup lang="ts">
import { Background } from "@vue-flow/background"
import { Controls } from "@vue-flow/controls"
import { useVueFlow, VueFlow } from "@vue-flow/core"
import { MiniMap } from "@vue-flow/minimap"
import "@vue-flow/core/dist/style.css"
import "@vue-flow/core/dist/theme-default.css"
import type { EdgeMouseEvent, NodeMouseEvent } from "@vue-flow/core"
import { nanoid } from "nanoid"
import { computed, markRaw, onMounted, onUnmounted, ref } from "vue"
import { useCharSettings } from "@/composables/useCharSettings"
import { useUIStore } from "@/store/ui"
import { importCharSettingsToNodeEditor } from "@/utils/importCharSettingsToNodeEditor"
import { useNodeEditorStore } from "../../store/nodeEditor"
import AddCalcNode from "./nodes/AddCalcNode.vue"
import ASTExpressionNode from "./nodes/ASTExpressionNode.vue"
import AttrCalcNode from "./nodes/AttrCalcNode.vue"
import BuffInputNode from "./nodes/BuffInputNode.vue"
import CharInputNode from "./nodes/CharInputNode.vue"
import CoreCalcNode from "./nodes/CoreCalcNode.vue"
import EnemyInputNode from "./nodes/EnemyInputNode.vue"
import ExpressionCalcNode from "./nodes/ExpressionCalcNode.vue"
import FullCalcNode from "./nodes/FullCalcNode.vue"
import HubNode from "./nodes/HubNode.vue"
import MeleeWeaponInputNode from "./nodes/MeleeWeaponInputNode.vue"
import ModInputNode from "./nodes/ModInputNode.vue"
import MultiplyCalcNode from "./nodes/MultiplyCalcNode.vue"
import RangedWeaponInputNode from "./nodes/RangedWeaponInputNode.vue"
import SkillDmgCalcNode from "./nodes/SkillDmgCalcNode.vue"
import WeaponAttrCalcNode from "./nodes/WeaponAttrCalcNode.vue"
import WeaponDmgCalcNode from "./nodes/WeaponDmgCalcNode.vue"
import { type NodeData, PALETTE_ITEMS, type PaletteItem } from "./types"

// Store
const store = useNodeEditorStore()
const ui = useUIStore()

// VueFlow 实例
const { onInit, fitView, getSelectedNodes, getSelectedEdges } = useVueFlow()

// 选中的节点和边
const selectedNode = ref<{ id: string; data: NodeData } | null>(null)
const selectedEdge = ref<{ id: string; source: string; target: string } | null>(null)

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })

// 拖拽状态
const draggingItem = ref<PaletteItem | null>(null)
const draggingPosition = ref({ x: 0, y: 0 })

// 图切换
const selectedGraphId = ref<number | "">("")
const fileInput = ref<HTMLInputElement | null>(null)

// 节点点击事件
function handleNodeClick(event: NodeMouseEvent) {
    selectedNode.value = event.node as unknown as { id: string; data: NodeData }
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

    selectedNode.value = event.node as unknown as { id: string; data: NodeData }
    selectedEdge.value = null

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

    selectedEdge.value = event.edge as unknown as { id: string; source: string; target: string }
    selectedNode.value = null

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

    contextMenuPosition.value = { x: event.event.clientX, y: event.event.clientY }
    contextMenuVisible.value = true
}

// 画布右键菜单事件
function handlePaneContextMenu(event: MouseEvent) {
    // 阻止默认右键菜单
    event.preventDefault()

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

function reloadPage() {
    location.reload()
}

// 批量删除选中的节点和边
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

// 鼠标按下事件 - 开始拖拽
function onMouseDown(event: MouseEvent, item: PaletteItem) {
    // 记录拖拽的节点项
    draggingItem.value = item
    draggingPosition.value = { x: event.clientX, y: event.clientY }

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

    // 更新拖拽位置
    draggingPosition.value = { x: event.clientX, y: event.clientY }
}

// 鼠标释放事件 - 完成拖拽
function onMouseUp(event: MouseEvent) {
    if (!draggingItem.value) return

    // 获取画布元素和变换容器
    const canvas = document.querySelector(".vue-flow__container")
    if (!canvas) {
        resetDragState()
        return
    }

    // 变换容器可能不存在，使用canvas作为备选
    const transformationPane = (document.querySelector(".vue-flow__transformationpane") as Element) || canvas

    // 检查鼠标是否在画布内
    const rect = canvas.getBoundingClientRect()
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        // 计算节点在画布中的位置，考虑画布的transform和滚动

        // 获取变换容器的transform矩阵（transform实际存在于此）
        const transform = window.getComputedStyle(transformationPane).transform
        const matrix = new DOMMatrix(transform === "none" ? "matrix(1, 0, 0, 1, 0, 0)" : transform)

        // 获取画布的滚动偏移
        const scrollLeft = canvas.scrollLeft
        const scrollTop = canvas.scrollTop

        // 计算鼠标在画布坐标系中的位置
        // 1. 计算鼠标相对于canvas的位置
        // 2. 考虑滚动偏移
        // 3. 减去translate偏移(matrix.e, matrix.f)
        // 4. 除以缩放因子(matrix.a, matrix.d)
        const relativeX = event.clientX - rect.left + scrollLeft
        const relativeY = event.clientY - rect.top + scrollTop
        const x = (relativeX - matrix.e) / matrix.a
        const y = (relativeY - matrix.f) / matrix.d

        // 创建新节点
        const newNodeId = nanoid()
        store.addNode({
            id: newNodeId,
            type: draggingItem.value.type as string,
            position: { x, y },
            data: {
                label: draggingItem.value.label,
            },
        })
    }

    // 重置拖拽状态
    resetDragState()
}

// 重置拖拽状态
function resetDragState() {
    draggingItem.value = null
    draggingPosition.value = { x: 0, y: 0 }

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
    "enemy-input": markRaw(EnemyInputNode),
    "core-calc": markRaw(CoreCalcNode),
    "attr-calc": markRaw(AttrCalcNode),
    "weapon-attr-calc": markRaw(WeaponAttrCalcNode),
    "skill-dmg-calc": markRaw(SkillDmgCalcNode),
    "weapon-dmg-calc": markRaw(WeaponDmgCalcNode),
    "full-calc": markRaw(FullCalcNode),
    "ast-expression-calc": markRaw(ASTExpressionNode),
    "add-calc": markRaw(AddCalcNode),
    "multiply-calc": markRaw(MultiplyCalcNode),
    "expression-calc": markRaw(ExpressionCalcNode),
    "hub-calc": markRaw(HubNode),
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
    }
    return labels[category] || category
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
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return
    }

    // Delete 键删除选中的节点或边
    if (event.key === "Delete") {
        // 使用store的方法删除选中的节点或边
        if (selectedNode.value) {
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
    // Ctrl+Z 撤销
    else if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault()
        store.undo()
    }
    // Ctrl+Y 重做
    else if ((event.ctrlKey || event.metaKey) && event.key === "y") {
        event.preventDefault()
        store.redo()
    }
}

// 初始化时调整视图
onInit(() => {
    fitView()
})

// 点击外部关闭右键菜单
function handleClickOutside(_event: MouseEvent) {
    contextMenuVisible.value = false
}

// 注册事件监听器
onMounted(() => {
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("click", handleClickOutside)
})

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
    // 加载所有图
    await store.loadAllGraphs()
    // 加载最后编辑的图
    await store.loadLastEditedGraph()
    // 更新selectedGraphId为当前图ID
    selectedGraphId.value = store.currentGraphId || ""
    // 启动自动保存
    store.startAutoSave()
})

// 移除事件监听器
onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyDown)
    window.removeEventListener("click", handleClickOutside)
    // 停止自动保存
    store.stopAutoSave()
})

const transferDialogShow = ref(false)
const selectedCharName = ref("")
function handleTransfer(charName: string) {
    const charSettings = useCharSettings(computed(() => charName))
    if (!charSettings) {
        ui.showErrorMessage(`角色 ${charName} 不存在`)
        return
    }
    importCharSettingsToNodeEditor(charName, charSettings.value)
    transferDialogShow.value = false
}
</script>

<template>
    <div class="flex h-full w-full" style="touch-action: manipulation">
        <DialogModel v-model="transferDialogShow">
            <div class="flex flex-col gap-2">
                <div>从角色构筑导入数据</div>
                <CharSelect v-model="selectedCharName" />
            </div>
            <template #action>
                <button class="btn btn-sm btn-primary" :disabled="!selectedCharName" @click="handleTransfer(selectedCharName)">迁移</button>
            </template>
        </DialogModel>
        <!-- 调色板侧边栏 -->
        <div class="w-64 bg-base-200 border-r border-base-300 p-4 overflow-y-auto">
            <h2 class="text-lg font-bold mb-4">节点列表</h2>
            <div v-for="(items, category) in groupedPaletteItems" :key="category" class="mb-4">
                <div class="font-semibold mb-2">{{ getCategoryLabel(category) }}</div>
                <div
                    v-for="item in items"
                    :key="item.type"
                    class="p-3 mb-2 bg-base-100 rounded cursor-move hover:bg-base-300 transition-colors"
                    @mousedown="onMouseDown($event, item)"
                >
                    <div class="flex items-center gap-2">
                        <Icon v-if="item.icon" :icon="item.icon" class="text-lg" />
                        <span>{{ item.label }}</span>
                    </div>
                    <div v-if="item.description" class="text-xs text-base-content/60 mt-1">{{ item.description }}</div>
                </div>
            </div>

            <!-- 拖拽中的节点副本 -->
            <div
                v-if="draggingItem"
                class="fixed pointer-events-none z-50 bg-base-100/80 backdrop-blur-sm border border-base-300 rounded-lg shadow-lg p-3 opacity-80"
                :style="{
                    left: draggingPosition.x + 'px',
                    top: draggingPosition.y + 'px',
                    transform: 'translate(-50%, -50%)',
                }"
            >
                <div class="flex items-center gap-2">
                    <Icon v-if="draggingItem.icon" :icon="draggingItem.icon" class="text-lg" />
                    <span>{{ draggingItem.label }}</span>
                </div>
            </div>
        </div>

        <!-- 节点编辑器画布 -->
        <div class="flex-1 flex flex-col relative">
            <!-- 工具栏 -->
            <div class="bg-base-100 border-b border-base-300 p-2 flex items-center gap-2">
                <!-- 图切换 -->
                <div class="relative grow flex items-center">
                    <label class="text-sm text-base-content/60 mr-2">图名称:</label>
                    <input
                        v-model="store.currentGraphName"
                        class="input input-sm input-bordered w-48"
                        placeholder="未命名图"
                        @blur="store.setCurrentGraphName(store.currentGraphName)"
                    />
                </div>

                <div class="relative flex items-center">
                    <label class="text-sm text-base-content/60 mr-2 shrink-0">切换图:</label>
                    <select v-model="selectedGraphId" class="select select-sm select-bordered" @change="handleGraphChange">
                        <option value="">创建新图</option>
                        <option v-for="graph in store.savedGraphs" :key="graph.id" :value="graph.id">
                            {{ graph.name }}
                        </option>
                    </select>
                </div>

                <!-- 自动保存 -->
                <div class="flex items-center gap-2">
                    <input
                        id="auto-save"
                        v-model="store.autoSaveEnabled"
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        @change="store.setAutoSaveEnabled(store.autoSaveEnabled)"
                    />
                    <label for="auto-save" class="text-sm">自动保存</label>
                </div>

                <!-- 导入导出 -->
                <div class="flex items-center gap-2">
                    <button class="btn btn-sm btn-outline" @click="transferDialogShow = true">
                        <Icon icon="ri:file-transfer-line" class="mr-1" />
                        迁移
                    </button>
                    <button class="btn btn-sm btn-outline" @click="handleImport">
                        <Icon icon="ri:upload-2-line" class="mr-1" />
                        导入
                    </button>
                    <button class="btn btn-sm btn-outline" @click="store.exportGraph">
                        <Icon icon="ri:download-2-line" class="mr-1" />
                        导出
                    </button>
                    <button class="btn btn-sm btn-primary" @click="handleSave">
                        <Icon icon="ri:save-fill" class="mr-1" />
                        保存
                    </button>
                    <button class="btn btn-sm btn-error" :disabled="!store.currentGraphId" @click="handleDeleteGraph">
                        <Icon icon="ri:delete-bin-2-fill" class="mr-1" />
                        删除
                    </button>
                </div>

                <!-- 删除确认对话框 -->
                <dialog id="delete-graph-dialog" class="modal">
                    <div class="modal-box">
                        <h3 class="font-bold text-lg">确认删除</h3>
                        <p class="py-4">您确定要删除当前图吗？此操作不可撤销。</p>
                        <div class="modal-action">
                            <button class="btn" @click="closeDeleteDialog">取消</button>
                            <button class="btn btn-error" @click="confirmDeleteGraph">确认删除</button>
                        </div>
                    </div>
                    <form method="dialog" class="modal-backdrop">
                        <button>关闭</button>
                    </form>
                </dialog>
            </div>

            <!-- 隐藏的文件输入 -->
            <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleFileInputChange" />

            <VueFlow
                v-model:nodes="store.nodes"
                v-model:edges="store.edges"
                :node-types="nodeTypes"
                :default-zoom="0.8"
                :min-zoom="0.2"
                :max-zoom="2"
                @connect="store.onConnect"
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

                <!-- 小地图 -->
                <MiniMap />
            </VueFlow>

            <!-- 自定义右键菜单 -->
            <div
                v-if="contextMenuVisible"
                class="fixed z-50 bg-base-100/80 backdrop-blur-sm border border-base-300 rounded-lg shadow-lg p-2 outline-none"
                :style="{
                    left: contextMenuPosition.x + 'px',
                    top: contextMenuPosition.y + 'px',
                    transform: 'translate(0, 0)',
                }"
                @click.stop
                @contextmenu.stop
            >
                <!-- 复制选项 -->
                <div
                    v-if="getSelectedNodes.length > 0"
                    class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none hover:bg-primary hover:text-base-100 cursor-pointer"
                    @click="
                        () => {
                            store.copySelectedNodes(getSelectedNodes)
                            contextMenuVisible = false
                        }
                    "
                >
                    <Icon class="size-4 mr-2" icon="ri:file-copy-line" />
                    复制选中项
                    <span v-if="getSelectedNodes.length > 0" class="ml-1 text-xs opacity-70"> ({{ getSelectedNodes.length }}节点) </span>
                </div>
                <!-- 粘贴选项 -->
                <div
                    v-if="store.copiedNodes.length > 0"
                    class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none hover:bg-primary hover:text-base-100 cursor-pointer"
                    @click="
                        () => {
                            store.pasteNodes()
                            contextMenuVisible = false
                        }
                    "
                >
                    <Icon class="size-4 mr-2" icon="ri:clipboard-line" />
                    粘贴
                    <span v-if="store.copiedNodes.length > 0" class="ml-1 text-xs opacity-70"> ({{ store.copiedNodes.length }}节点) </span>
                </div>
                <!-- 批量删除选项 -->
                <div
                    v-if="getSelectedNodes.length > 0 || getSelectedEdges.length > 0"
                    class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none hover:bg-primary hover:text-base-100 cursor-pointer"
                    @click="
                        () => {
                            deleteSelectedItems()
                            contextMenuVisible = false
                        }
                    "
                >
                    <Icon class="size-4 mr-2" icon="ri:delete-bin-line" />
                    删除选中项
                    <span v-if="getSelectedNodes.length > 0 || getSelectedEdges.length > 0" class="ml-1 text-xs opacity-70">
                        ({{ getSelectedNodes.length }}节点, {{ getSelectedEdges.length }}边)
                    </span>
                </div>
                <!-- 单个节点删除选项 -->
                <div
                    v-else-if="selectedNode"
                    class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none hover:bg-primary hover:text-base-100 cursor-pointer"
                    @click="
                        () => {
                            deleteSelectedNode()
                            contextMenuVisible = false
                        }
                    "
                >
                    <Icon class="size-4 mr-2" icon="ri:delete-bin-line" />
                    删除节点
                </div>
                <!-- 单条边删除选项 -->
                <div
                    v-else-if="selectedEdge"
                    class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none hover:bg-primary hover:text-base-100 cursor-pointer"
                    @click="
                        () => {
                            deleteSelectedEdge()
                            contextMenuVisible = false
                        }
                    "
                >
                    <Icon class="size-4 mr-2" icon="ri:delete-bin-line" />
                    删除边
                </div>
                <div
                    class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none hover:bg-primary hover:text-base-100 cursor-pointer"
                    @click="reloadPage"
                >
                    <Icon class="size-4 mr-2" icon="ri:refresh-line" />
                    刷新
                </div>
            </div>
        </div>
    </div>
</template>
<style>
.vue-flow__handle {
    /* 自定义宽高，替换默认值（默认一般是 10px 左右） */
    width: 10px !important;
    height: 10px !important;
}
</style>
