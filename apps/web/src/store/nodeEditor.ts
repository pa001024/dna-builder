import * as dialog from "@tauri-apps/plugin-dialog"
import type { Connection, HandleConnectable } from "@vue-flow/core"
import { nanoid } from "nanoid"
import { defineStore } from "pinia"
import { computed, markRaw, ref } from "vue"
import { writeTextFile } from "@/api/app"
import type { CalcBuildEvaluation } from "@/data/Calc.worker"
import type { CharBuild } from "@/data/CharBuild"
import { env } from "@/env"
import { requestBuildEvaluation, requestBuildPanels } from "@/utils/calc-worker"
import {
    type BuildVector,
    type BuildVectorDimension,
    clonePlain,
    collectAllInputs,
    collectCoreInputNodes,
    collectNumericParamVectors,
    collectVariableVectors,
    computeVectorStat,
    createBuildContextFromInputs,
    createBuildContextFromJSONText,
    createBuildContextFromSettings,
    createBuildContextsFromInputs,
    createExpressionVectorOutput,
    createVectorDecomposeOutput,
    migrateLegacyTeamBuffs,
    type NodeBuildContext,
    normalizeLabeledVector,
    readNodeBuffEntries,
    readNodeCustomVariables,
    readNodeTeamBuffs,
    readVectorCalcMode,
    resolveBuffSourceNode,
    serializeBuildContext,
    sortDownstreamIds,
    withExpressionSettings,
} from "@/utils/nodeEditorBuild"
import { recordSyncPhase } from "@/utils/nodeEditorPerf"
import {
    CORE_INPUT,
    canConnectPorts,
    customVariableVectorPortId,
    getNodePorts,
    NUMERIC_PARAM_PORTS,
    PortType,
    parseCustomVariableVectorPortId,
    portColor,
    resolvePort,
} from "@/utils/nodeEditorPorts"
import type { NodeEditorGraph, UNodeEditorGraph } from "./db"
import { db } from "./db"
import { NodeType } from "./nodeEditorTypes"
import { useUIStore } from "./ui"

export { NodeType }

/**
 * 节点编辑器状态
 */
/**
 * 历史记录项类型
 */
interface HistoryItem {
    nodes: UNodeEditorGraph["nodes"]
    edges: UNodeEditorGraph["edges"]
    description: string
}

/**
 * 节点编辑器中使用的轻量节点数据类型。
 */
type EditorNodeData = Record<string, any>

/**
 * 节点位置类型。
 */
interface EditorNodePosition {
    x: number
    y: number
}

/**
 * 节点编辑器内部使用的轻量节点类型，避免直接依赖 vue-flow 的深层递归泛型。
 */
interface EditorNode {
    id: string
    type?: string
    position: EditorNodePosition
    data: EditorNodeData
    /** 隐藏：不渲染但仍参与计算 */
    hidden?: boolean
    /** 锁定衍生的 vue-flow 交互开关（以 data.locked 为准） */
    selected?: boolean
    draggable?: boolean
    selectable?: boolean
    connectable?: HandleConnectable
}

/**
 * 节点编辑器内部使用的轻量边类型，避免直接依赖 vue-flow 的深层递归泛型。
 */
interface EditorEdge {
    id: string
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
    data?: Record<string, any>
    style?: Record<string, any>
    animated?: boolean
}

/**
 * 外部传入的节点类型，兼容 vue-flow 中可选 data 的定义。
 */
interface EditorNodeInput extends Omit<EditorNode, "data"> {
    data?: EditorNodeData
}

const NODE_DATA_HISTORY_THROTTLE_MS = 400

export const useNodeEditorStore = defineStore("nodeEditor", () => {
    // 节点和边
    const nodes = ref<EditorNode[]>([])
    const edges = ref<EditorEdge[]>([])

    // 计算缓存（防止重复计算）
    const calculationCache = new Map<string, any>()

    // 图数据版本号：节点/边变化时递增，用于失效 MOD/BUFF 编辑器的预览构筑
    const graphRevision = ref(0)
    /** 预览构筑缓存：非响应式，避免在组件渲染期间写入 ref 触发递归更新 */
    let previewCache: { revision: number; context: NodeBuildContext | null } | null = null
    // 求值请求防抖与乱序保护
    const evaluationTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const evaluationRequestIds = new Map<string, number>()

    // 当前编辑的图ID
    const currentGraphId = ref<number | null>(null)

    // 所有保存的图
    const savedGraphs = ref<NodeEditorGraph[]>([])

    // 自动保存配置：跟随 undo 记录点，变更后防抖写入
    const autoSaveEnabled = ref<boolean>(true)
    const AUTO_SAVE_DEBOUNCE_MS = 2000
    let autoSaveTimer: number | null = null
    /** 自动保存状态：checked 已落盘，waiting 有变更在等防抖写入 */
    const autoSaveStatus = ref<"checked" | "waiting">("checked")

    // 图名称
    const currentGraphName = ref<string>("未命名图")

    // 复制粘贴状态
    const copiedNodes = ref<EditorNode[]>([])
    const copiedEdges = ref<EditorEdge[]>([])

    // 历史记录状态
    const history = ref<HistoryItem[]>([])
    const historyIndex = ref<number>(-1)
    const historyLimit = ref<number>(50) // 历史记录最大数量
    let lastHistoryCommitAt = 0
    let lastHistoryCoalesceKey: string | null = null
    let historyBatchDepth = 0

    /**
     * 深拷贝图状态，统一先转成普通 JSON 数据，避免把 Vue 响应式代理或运行时实例带进历史记录。
     * @param value 任意可序列化数据。
     * @returns 深拷贝结果。
     */
    function cloneValue<T>(value: T): T {
        return JSON.parse(JSON.stringify(value)) as T
    }

    /** 标记图数据变化：递增版本号并失效预览构筑缓存。 */
    function markGraphDirty() {
        graphRevision.value++
    }

    /**
     * 仅影响节点自身展示、不参与构筑计算的字段：改动时不失效缓存、不触发重算。
     * 标题不在此列：向量输出的维度/标签读取 `data.label`，需按下游是否消费向量决定。
     */
    const DISPLAY_ONLY_NODE_KEYS = new Set(["isCollapsed"])

    /**
     * 判断节点标题是否参与计算：只有向量展示会读取输入节点标题。
     * 自身是图表节点，或下游存在向量输入端口、核心把该节点当作 MOD/BUFF 向量维度时才需要重算。
     * @param nodeId 改标题的节点 id
     * @returns 标题是否影响计算
     */
    function labelAffectsCalculation(nodeId: string): boolean {
        const node = nodes.value.find(item => item.id === nodeId)
        if (!node) return false
        // 图表没有上游标题时用自身标题兜底
        if (node.type === NodeType.CHART) return true
        // 输入节点的数值参数标题会进入构筑向量维度标签
        const paramIds = new Set((NUMERIC_PARAM_PORTS[node.type as NodeType] ?? []).map(param => param.id))
        if (paramIds.size > 0 && edges.value.some(edge => edge.target === nodeId && paramIds.has(edge.targetHandle ?? ""))) return true

        const visited = new Set<string>()
        const queue = edges.value.filter(edge => edge.source === nodeId).map(edge => edge.target)
        while (queue.length > 0) {
            const currentId = queue.shift()!
            if (visited.has(currentId)) continue
            visited.add(currentId)
            const current = nodes.value.find(item => item.id === currentId)
            if (!current) continue
            // 向量输入端口的节点会读取上游向量的标签 / 标题
            if (getNodePorts(current.type ?? "", current.data).inputs.some(port => port.type === PortType.VECTOR)) return true
            // 多个 MOD / BUFF 输入作为核心的向量维度，维度名取自输入节点标题
            if (current.type === NodeType.CORE_CALC) {
                const inputs = collectCoreInputNodes(nodes.value, edges.value, current.id)
                const isModDimension = inputs.modInputs.length > 1 && inputs.modInputs.some(item => item.id === nodeId)
                const isBuffDimension = inputs.buffInputs.length > 1 && inputs.buffInputs.some(item => item.id === nodeId)
                if (isModDimension || isBuffDimension) return true
            }
            edges.value.filter(edge => edge.source === currentId).forEach(edge => queue.push(edge.target))
        }
        return false
    }

    /**
     * 归一化单个节点，确保内部始终持有带 data 的轻量节点结构。
     * @param node 外部传入节点。
     * @returns 可安全读写的内部节点。
     */
    function normalizeNode(node: EditorNodeInput): EditorNode {
        const data = { ...(node.data ?? {}) }
        // 旧版角色输入节点携带完整 settings 快照：把可见字段搬到节点自身，再删除隐藏快照
        if (node.type === NodeType.CHAR_INPUT) {
            if (data.settings && typeof data.settings === "object") {
                const legacy = data.settings as Record<string, any>
                if (data.charLevel === undefined) data.charLevel = legacy.charLevel
                if (data.hpPercent === undefined) data.hpPercent = legacy.hpPercent
                if (data.resonanceGain === undefined) data.resonanceGain = legacy.resonanceGain
                if (data.extraMastery === undefined) data.extraMastery = legacy.extraMastery
                if (data.charSkillLevel === undefined) data.charSkillLevel = legacy.charSkillLevel
                delete data.settings
            }
            delete data.baseName
            delete data.isRouge
        }
        // 旧版 BUFF 节点把助战 BUFF 单独存在 teamBuffs 派生字段里：并入普通 BUFF 列表后删除该字段
        if (node.type === NodeType.BUFF_INPUT && Array.isArray(data.teamBuffs)) {
            data.buffs = migrateLegacyTeamBuffs(readNodeBuffEntries(data), data.teamBuffs)
            delete data.teamBuffs
        }
        const normalized: EditorNode = {
            ...node,
            data,
        }
        // 锁定状态跨版本恢复：仅 data.locked 可信时补齐交互开关
        if (data.locked === true) {
            normalized.draggable = false
            normalized.selectable = false
            normalized.connectable = false
            normalized.selected = false
        }
        return normalized
    }

    /**
     * 批量归一化节点数组。
     * @param inputNodes 外部节点数组。
     * @returns 内部节点数组。
     */
    function normalizeNodes(inputNodes: EditorNodeInput[]): EditorNode[] {
        return inputNodes.map(normalizeNode)
    }

    /**
     * 创建适合历史记录的节点快照，只保留可回放的纯数据。
     * @returns 历史快照节点列表。
     */
    function snapshotHistoryNodes(): EditorNode[] {
        return cloneValue(serializeNodes(Object.values(nodes.value)))
    }

    /**
     * 创建适合历史记录的边快照，只保留可回放的纯数据。
     * @returns 历史快照边列表。
     */
    function snapshotHistoryEdges(): EditorEdge[] {
        return cloneValue(serializeEdges(edges.value))
    }

    /**
     * 判断两份历史快照是否一致。
     * @param left 历史快照
     * @param right 当前快照
     */
    function isSameHistoryState(left: HistoryItem, right: HistoryItem) {
        return JSON.stringify(left.nodes) === JSON.stringify(right.nodes) && JSON.stringify(left.edges) === JSON.stringify(right.edges)
    }

    /**
     * 把当前图状态重置为历史基线（加载、导入、清空时调用）。
     * @param description 基线说明
     */
    function resetHistory(description = "初始状态") {
        history.value = [
            {
                nodes: snapshotHistoryNodes(),
                edges: snapshotHistoryEdges(),
                description,
            },
        ]
        historyIndex.value = 0
        lastHistoryCommitAt = 0
        lastHistoryCoalesceKey = null
    }

    /**
     * 记录一次用户操作后的图状态。
     * 求值结果等派生字段会在序列化时剔除，因此只改结果不会产生历史记录。
     * @param description 操作说明
     * @param coalesceKey 合并键：同一键在节流窗口内的连续编辑合并为一个撤销步骤
     */
    function commitHistory(description: string, coalesceKey?: string) {
        if (historyBatchDepth > 0) return
        const historyItem: HistoryItem = {
            nodes: snapshotHistoryNodes(),
            edges: snapshotHistoryEdges(),
            description,
        }
        if (history.value.length === 0) {
            history.value = [historyItem]
            historyIndex.value = 0
            lastHistoryCommitAt = Date.now()
            lastHistoryCoalesceKey = coalesceKey ?? null
            scheduleAutoSave()
            return
        }

        const now = Date.now()
        const current = history.value[historyIndex.value]
        const canCoalesce =
            coalesceKey !== undefined &&
            coalesceKey === lastHistoryCoalesceKey &&
            now - lastHistoryCommitAt < NODE_DATA_HISTORY_THROTTLE_MS &&
            historyIndex.value === history.value.length - 1

        if (current && isSameHistoryState(current, historyItem)) {
            lastHistoryCommitAt = now
            lastHistoryCoalesceKey = coalesceKey ?? null
            return
        }

        if (canCoalesce && current) {
            history.value[historyIndex.value] = historyItem
        } else {
            // 撤销后再操作时丢弃旧的重做分支
            if (historyIndex.value < history.value.length - 1) {
                history.value = history.value.slice(0, historyIndex.value + 1)
            }
            history.value.push(historyItem)
            historyIndex.value = history.value.length - 1
        }

        lastHistoryCommitAt = now
        lastHistoryCoalesceKey = coalesceKey ?? null

        if (history.value.length > historyLimit.value) {
            history.value.shift()
            historyIndex.value--
        }
        scheduleAutoSave()
    }

    /** 开始一个历史批次：批次内的多次变更合并为一个撤销步骤 */
    function beginHistoryBatch() {
        historyBatchDepth++
    }

    /** 结束历史批次并在最外层提交一次 */
    function endHistoryBatch(description = "编辑") {
        if (historyBatchDepth === 0) return
        historyBatchDepth--
        if (historyBatchDepth === 0) commitHistory(description)
    }

    /** 恢复指定历史快照 */
    function restoreHistoryItem(historyItem: HistoryItem) {
        nodes.value = cloneValue(historyItem.nodes)
        edges.value = cloneValue(historyItem.edges)
        edges.value.forEach(decorateEdge)
        lastHistoryCommitAt = 0
        lastHistoryCoalesceKey = null
        clearCache()
        markGraphDirty()
        recalculateAllNodes()
        scheduleAutoSave()
    }

    /**
     * 撤销操作
     */
    function undo() {
        if (historyIndex.value > 0) {
            historyIndex.value--
            restoreHistoryItem(history.value[historyIndex.value])
        }
    }

    /**
     * 重做操作
     */
    function redo() {
        if (historyIndex.value < history.value.length - 1) {
            historyIndex.value++
            restoreHistoryItem(history.value[historyIndex.value])
        }
    }

    const canUndo = computed(() => historyIndex.value > 0)
    const canRedo = computed(() => historyIndex.value >= 0 && historyIndex.value < history.value.length - 1)
    const undoDescription = computed(() => (canUndo.value ? history.value[historyIndex.value]?.description : ""))
    const redoDescription = computed(() => (canRedo.value ? history.value[historyIndex.value + 1]?.description : ""))

    /**
     * 更新节点数据并触发重新计算
     */
    function updateNodeData(nodeId: string, data: Record<string, any>) {
        const node = nodes.value.find(n => n.id === nodeId)
        if (node) {
            const currentNodeData = node.data
            const changedKeys = Object.keys(data).filter(key => !Object.is(currentNodeData[key], data[key]))
            if (changedKeys.length === 0) {
                return
            }

            // 更新节点数据
            node.data = { ...currentNodeData, ...data }

            const needsRecalculation = changedKeys.some(key => {
                if (DISPLAY_ONLY_NODE_KEYS.has(key)) return false
                // 标题只在向量展示读取时才参与计算
                return key !== "label" || labelAffectsCalculation(nodeId)
            })
            // 折叠 / 不影响向量的标题改动：保持计算缓存，避免连带 worker 求值
            if (needsRecalculation) {
                // 只重算该节点及其下游：上游命中缓存不再重算，签名未变的 worker 不发新请求
                markGraphDirty()
                recalculateFromSeeds([nodeId])
            }

            // 高频编辑（如输入框连续修改）合并为一个撤销步骤
            commitHistory("更新节点数据", `node:${nodeId}`)
        }
    }

    /**
     * 设置节点显隐：隐藏节点不渲染（含连线），但仍参与计算与保存。
     * @param nodeId 节点 id
     * @param hidden 是否隐藏
     */
    function setNodeHidden(nodeId: string, hidden: boolean) {
        const node = nodes.value.find(n => n.id === nodeId)
        if (!node || node.hidden === hidden) return
        node.hidden = hidden
        if (hidden) node.selected = false
        markGraphDirty()
        commitHistory(hidden ? "隐藏节点" : "显示节点")
    }

    /**
     * 设置节点锁定：锁定后不可选中 / 拖动 / 连线，节点内的全部事件由覆盖层吞掉。
     * @param nodeId 节点 id
     * @param locked 是否锁定
     */
    function setNodeLocked(nodeId: string, locked: boolean) {
        const node = nodes.value.find(n => n.id === nodeId)
        if (!node || node.data.locked === locked) return
        if (locked) node.data = { ...node.data, locked: true }
        else {
            const { locked: _omitted, ...rest } = node.data
            node.data = rest
        }
        node.draggable = !locked
        node.selectable = !locked
        node.connectable = !locked
        if (locked) node.selected = false
        markGraphDirty()
        commitHistory(locked ? "锁定节点" : "解锁节点")
    }

    /**
     * 添加节点
     */
    function addNode(node: EditorNodeInput) {
        nodes.value.push(normalizeNode(node))
        markGraphDirty()
        commitHistory(`添加节点: ${node.type}`)
    }

    /** 输入节点类型 → 核心节点输入端口 */
    const CORE_HANDLE_BY_INPUT_TYPE: Record<string, string> = {
        [NodeType.CHAR_INPUT]: CORE_INPUT.char,
        [NodeType.MELEE_WEAPON_INPUT]: CORE_INPUT.meleeWeapon,
        [NodeType.RANGED_WEAPON_INPUT]: CORE_INPUT.rangedWeapon,
        [NodeType.MOD_INPUT]: CORE_INPUT.mod,
        [NodeType.BUFF_INPUT]: CORE_INPUT.buff,
        [NodeType.EFFECT_INPUT]: CORE_INPUT.effect,
        [NodeType.PET_INPUT]: CORE_INPUT.pet,
        [NodeType.ENEMY_INPUT]: CORE_INPUT.enemy,
        [NodeType.CUSTOM_VARS_INPUT]: CORE_INPUT.customVariables,
    }

    /**
     * 读取旧图节点里内嵌的自定义变量（数组或响应式对象形式）。
     * @param data 节点数据
     * @returns 自定义变量键值对
     */
    function readLegacyCustomVariables(data: Record<string, any>): [string, string][] {
        const raw = data.customVariables
        const items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : []
        return items
            .filter((item): item is [string, string] => Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "string")
            .map(item => [item[0], item[1]])
    }

    /**
     * 迁移旧版表达式节点：
     * 1. 把目标函数 / 自定义表达式节点内嵌的变量搬进「自定义变量组」输入节点；
     * 2. 旧自定义表达式节点改为选择构筑变量的求值节点；
     * 3. 为目标函数/求值节点补齐 core → build 输入边。
     * @param graphNodes 图中节点（原地修改）
     * @param graphEdges 图中边（原地修改）
     */
    function migrateLegacyExpressionNodes(graphNodes: EditorNode[], graphEdges: EditorEdge[]) {
        const core = graphNodes.find(node => node.type === NodeType.CORE_CALC)
        const astNodes = graphNodes.filter(node => node.type === NodeType.AST_EXPRESSION_CALC)
        const oldExpressionNodes = graphNodes.filter(node => node.type === NodeType.CUSTOM_EXPRESSION)
        const variableMap = new Map<string, string>()
        astNodes.forEach(node => readLegacyCustomVariables(node.data).forEach(([name, expression]) => variableMap.set(name, expression)))
        oldExpressionNodes.forEach(node => {
            const name = typeof node.data.name === "string" ? node.data.name.trim() : ""
            const expression = typeof node.data.expression === "string" ? node.data.expression : ""
            if (name && expression) variableMap.set(name, expression)
        })

        if (variableMap.size > 0) {
            let varsNode = graphNodes.find(node => node.type === NodeType.CUSTOM_VARS_INPUT)
            if (!varsNode) {
                varsNode = {
                    id: `custom-vars-input-${nanoid(6)}`,
                    type: NodeType.CUSTOM_VARS_INPUT,
                    position: { x: (core?.position.x ?? 400) - 620, y: (core?.position.y ?? 400) + 360 },
                    data: { label: "自定义变量组", customVariables: [...variableMap.entries()] },
                }
                graphNodes.push(varsNode)
            } else {
                const existing = readLegacyCustomVariables(varsNode.data)
                const merged = new Map([...existing, ...variableMap])
                varsNode.data.customVariables = [...merged.entries()]
            }
            if (core && !graphEdges.some(edge => edge.source === varsNode!.id && edge.target === core.id)) {
                graphEdges.push({
                    id: `e-${varsNode.id}-${core.id}`,
                    source: varsNode.id,
                    target: core.id,
                    sourceHandle: "customVariables",
                    targetHandle: CORE_INPUT.customVariables,
                })
            }
        }

        astNodes.forEach(node => {
            delete node.data.customVariables
        })
        oldExpressionNodes.forEach(node => {
            const name = typeof node.data.name === "string" ? node.data.name.trim() : ""
            if (name) node.data.selectedVariable = name
            delete node.data.name
            delete node.data.expression
            delete node.data.customVariables
            if (core && !graphEdges.some(edge => edge.source === core.id && edge.target === node.id)) {
                graphEdges.push({
                    id: `e-${core.id}-${node.id}`,
                    source: core.id,
                    target: node.id,
                    sourceHandle: "build",
                    targetHandle: "build",
                })
            }
        })
    }

    /** 旧版独立队友节点类型；加载时合并进 BUFF 节点 */
    const LEGACY_TEAM_INPUT_TYPE = "team-input"

    /** 旧队友节点需要搬迁到 BUFF 节点的字段 */
    const LEGACY_TEAM_DATA_KEYS = [
        "team1",
        "team1Weapon",
        "team1Build",
        "team1BuildVariant",
        "team2",
        "team2Weapon",
        "team2Build",
        "team2BuildVariant",
    ] as const

    /**
     * 迁移旧版独立队友节点：队友配置并入 BUFF 节点，统一从 BUFF 端口进入核心。
     * 已有 BUFF 节点时合并数据并改接原有连线；没有时把队友节点原位转换为 BUFF 节点。
     * @param graphNodes 图中节点（原地修改）
     * @param graphEdges 图中边（原地修改）
     */
    function migrateLegacyTeamNodes(graphNodes: EditorNode[], graphEdges: EditorEdge[]) {
        const teamNodes = graphNodes.filter(node => (node.type as string) === LEGACY_TEAM_INPUT_TYPE)
        if (teamNodes.length === 0) return
        const buffNodes = graphNodes.filter(node => node.type === NodeType.BUFF_INPUT)
        teamNodes.forEach(teamNode => {
            const teamData: Record<string, any> = {}
            LEGACY_TEAM_DATA_KEYS.forEach(key => {
                if (teamNode.data[key] !== undefined) teamData[key] = teamNode.data[key]
            })
            const teamBuffs = readNodeTeamBuffs(teamNode.data)
            const buffNode = buffNodes.find(node => node.id !== teamNode.id)
            if (buffNode) {
                buffNode.data = {
                    ...buffNode.data,
                    ...teamData,
                    buffs: migrateLegacyTeamBuffs(readNodeBuffEntries(buffNode.data), teamBuffs),
                }
                delete buffNode.data.teamBuffs
                graphEdges.forEach(edge => {
                    if (edge.source !== teamNode.id) return
                    edge.source = buffNode.id
                    edge.sourceHandle = null
                })
                for (let index = graphEdges.length - 1; index >= 0; index--) {
                    if (graphEdges[index].target === teamNode.id) graphEdges.splice(index, 1)
                }
                graphNodes.splice(graphNodes.indexOf(teamNode), 1)
                return
            }
            teamNode.type = NodeType.BUFF_INPUT
            teamNode.data = {
                label: "BUFF与队友",
                buffs: migrateLegacyTeamBuffs(readNodeBuffEntries(teamNode.data), teamBuffs),
                customBuff: [],
                ...teamData,
            }
            // 旧 handle 名（team）在 BUFF 节点上不存在，交给后续边迁移按端口顺序重算
            graphEdges.forEach(edge => {
                if (edge.source === teamNode.id) edge.sourceHandle = null
            })
            buffNodes.push(teamNode)
        })
    }

    /** 已移除的求值节点类型：旧图加载时连同连线一起丢弃 */
    const LEGACY_REMOVED_NODE_TYPES = new Set(["full-calc", "skill-dmg-calc", "weapon-dmg-calc"])

    /**
     * 丢弃已移除节点类型的节点及其连线，保证旧图仍能载入。
     * @param inputNodes 图中的节点
     * @param inputEdges 图中的边
     * @returns 保留的节点与边
     */
    function dropRemovedNodes(inputNodes: EditorNode[], inputEdges: EditorEdge[]) {
        const keptNodes = inputNodes.filter(node => !LEGACY_REMOVED_NODE_TYPES.has(node.type ?? ""))
        if (keptNodes.length === inputNodes.length) return { nodes: inputNodes, edges: inputEdges }
        const keptIds = new Set(keptNodes.map(node => node.id))
        return { nodes: keptNodes, edges: inputEdges.filter(edge => keptIds.has(edge.source) && keptIds.has(edge.target)) }
    }

    /**
     * 找出旧版用于聚合输入节点的集线节点，迁移后可直接移除。
     * @param inputNodes 图中的节点
     * @param inputEdges 原始边
     * @returns 旧集线节点 id 集合
     */
    function collectLegacyHubIds(inputNodes: EditorNode[], inputEdges: EditorEdge[]): Set<string> {
        const byId = new Map(inputNodes.map(node => [node.id, node]))
        const legacyHubs = new Set<string>()
        inputEdges.forEach(edge => {
            const source = byId.get(edge.source)
            const target = byId.get(edge.target)
            if (target?.type === NodeType.HUB_CALC && source?.type?.endsWith("input")) legacyHubs.add(target.id)
            if (source?.type === NodeType.HUB_CALC && target?.type === NodeType.CORE_CALC) legacyHubs.add(source.id)
        })
        return legacyHubs
    }

    /**
     * 迁移旧图连线：补齐端口 handle，并把旧的「输入 → 集线 → 核心」结构改为输入直连核心。
     * @param inputNodes 图中的节点
     * @param inputEdges 图中的边
     * @returns 迁移后的边
     */
    function migrateGraphEdges(inputNodes: EditorNode[], inputEdges: EditorEdge[]): EditorEdge[] {
        const byId = new Map(inputNodes.map(node => [node.id, node]))
        const coresByHub = new Map<string, string[]>()
        inputEdges.forEach(edge => {
            const source = byId.get(edge.source)
            const target = byId.get(edge.target)
            if (source?.type === NodeType.HUB_CALC && target?.type === NodeType.CORE_CALC) {
                const cores = coresByHub.get(source.id) ?? []
                cores.push(target.id)
                coresByHub.set(source.id, cores)
            }
        })

        const result: EditorEdge[] = []
        const seen = new Set<string>()
        const usedNumberHandles = new Map<string, Set<string>>()
        const pushEdge = (edge: EditorEdge) => {
            const key = `${edge.source}|${edge.sourceHandle ?? ""}->${edge.target}|${edge.targetHandle ?? ""}`
            if (seen.has(key)) return
            seen.add(key)
            result.push(edge)
        }

        inputEdges.forEach(edge => {
            const source = byId.get(edge.source)
            const target = byId.get(edge.target)
            if (!source || !target) return

            // 旧版集线节点：输入 → hub → core，重建为输入 → core 的类型化直连
            if (target.type === NodeType.HUB_CALC) {
                const cores = coresByHub.get(target.id) ?? []
                const coreHandle = CORE_HANDLE_BY_INPUT_TYPE[source.type ?? ""]
                if (coreHandle && cores.length > 0) {
                    const sourcePort = resolvePort(source.type ?? "", edge.sourceHandle, "output", source.data)
                    cores.forEach(coreId => {
                        pushEdge({
                            id: `e-migrated-${edge.id}-${coreId}`,
                            source: source.id,
                            target: coreId,
                            sourceHandle: sourcePort?.id ?? null,
                            targetHandle: coreHandle,
                            data: undefined,
                            style: undefined,
                        })
                    })
                }
                return
            }
            if (source.type === NodeType.HUB_CALC && target.type === NodeType.CORE_CALC) return

            const sourcePorts = getNodePorts(source.type ?? "", source.data).outputs
            const sourcePort = resolvePort(source.type ?? "", edge.sourceHandle, "output", source.data) ?? sourcePorts[0]
            const targetPort =
                resolvePort(target.type ?? "", edge.targetHandle, "input", target.data) ??
                (getNodePorts(target.type ?? "", target.data).inputs.length === 1
                    ? getNodePorts(target.type ?? "", target.data).inputs[0]
                    : undefined)
            const next: EditorEdge = {
                ...edge,
                sourceHandle: edge.sourceHandle ?? sourcePort?.id ?? null,
                targetHandle: edge.targetHandle ?? targetPort?.id ?? null,
            }
            if (target.type === NodeType.CORE_CALC) {
                next.targetHandle = CORE_HANDLE_BY_INPUT_TYPE[source.type ?? ""] ?? next.targetHandle
            }
            // 旧版自定义变量组只有一个共享向量端口，按向量节点记录的变量名改接到对应变量行
            if (target.type === NodeType.CUSTOM_VARS_INPUT) {
                const variables = readNodeCustomVariables(target.data)
                const variableIndex = parseCustomVariableVectorPortId(next.targetHandle)
                if (variableIndex !== undefined) {
                    if (variableIndex >= variables.length) return
                } else if (!next.targetHandle || next.targetHandle === "vectors") {
                    const legacyVariable = typeof source.data?.variable === "string" ? source.data.variable.trim() : ""
                    const fallbackIndex = variables.findIndex(([name]) => name.trim() === legacyVariable)
                    if (fallbackIndex < 0) return
                    next.targetHandle = customVariableVectorPortId(fallbackIndex)
                }
            }
            // 多输入数学节点：旧边没有 handle，按端口顺序依次分配
            if (!next.targetHandle) {
                const numberPorts = getNodePorts(target.type ?? "", target.data).inputs.filter(port => port.type === PortType.NUMBER)
                const used = usedNumberHandles.get(target.id) ?? new Set<string>()
                const free = numberPorts.find(port => !used.has(port.id))
                if (free) {
                    next.targetHandle = free.id
                    used.add(free.id)
                    usedNumberHandles.set(target.id, used)
                }
            }
            // 旧图里类型不匹配的连线直接丢弃，避免迁移后仍能跨类型传值
            const finalSourcePort = resolvePort(source.type ?? "", next.sourceHandle, "output", source.data)
            const finalTargetPort = resolvePort(target.type ?? "", next.targetHandle, "input", target.data)
            if (finalSourcePort && finalTargetPort && finalSourcePort.type !== finalTargetPort.type) return
            pushEdge(next)
        })
        return result
    }

    /**
     * 删除节点
     */
    function removeNode(nodeId: string) {
        // 先记下被删节点的原下游：它们少一路输入，需要重算
        const downstreamIds = edges.value.filter(edge => edge.source === nodeId).map(edge => edge.target)
        nodes.value = nodes.value.filter(n => n.id !== nodeId)
        edges.value = edges.value.filter(e => e.source !== nodeId && e.target !== nodeId)
        const pendingTimer = evaluationTimers.get(nodeId)
        if (pendingTimer) clearTimeout(pendingTimer)
        evaluationTimers.delete(nodeId)
        evaluationRequestIds.delete(nodeId)
        markGraphDirty()
        recalculateFromSeeds(downstreamIds)
        commitHistory("删除节点")
    }

    /**
     * 添加边
     */
    function addEdge(edge: EditorEdge) {
        // 检查端口类型；单占输入端口默认用新连线替换旧连线
        if (!isValidConnection(edge, { allowOccupiedTarget: true })) {
            console.warn("Cannot add edge: port type mismatch")
            return false
        }
        const target = nodes.value.find(node => node.id === edge.target)
        const targetPort = resolvePort(target?.type ?? "", edge.targetHandle, "input", target?.data ?? {})
        const replacedEdges =
            targetPort && !targetPort.multiple
                ? edges.value.filter(item => item.target === edge.target && item.targetHandle === targetPort.id && item.id !== edge.id)
                : []
        if (
            wouldCreateCycle(
                edge,
                replacedEdges.map(item => item.id)
            )
        ) {
            console.warn("Cannot add edge: would create cycle")
            return false
        }
        if (replacedEdges.length > 0) {
            const replacedIds = new Set(replacedEdges.map(item => item.id))
            edges.value = edges.value.filter(item => !replacedIds.has(item.id))
        }
        edges.value.push(decorateEdge(edge))
        markGraphDirty()
        // 只重算连线目标及其下游：源头输出走缓存，核心输入集合变化经下游重算收敛
        recalculateFromSeeds([edge.target])
        commitHistory("添加连接")
        return true
    }

    /**
     * 删除边
     */
    function removeEdge(edgeId: string) {
        // 找到要删除的边，以便获取相关节点信息
        const edge = edges.value.find(e => e.id === edgeId)
        if (edge) {
            // 删除边
            edges.value = edges.value.filter(e => e.id !== edgeId)
            markGraphDirty()
            recalculateFromSeeds([edge.target])
            commitHistory("删除连接")
        }
    }

    /**
     * 删除自定义变量后同步向量接线：被删行上的连线移除，后续行的端口前移。
     * @param nodeId 自定义变量组节点 id
     * @param variableCount 删除后的变量数量
     * @param removedIndex 被删除的变量行下标
     */
    function syncVariableVectorEdges(nodeId: string, variableCount: number, removedIndex?: number) {
        let changed = false
        const nextEdges = edges.value.filter(edge => {
            if (edge.target !== nodeId) return true
            const index = parseCustomVariableVectorPortId(edge.targetHandle)
            if (index === undefined) return true
            let nextIndex = index
            if (removedIndex !== undefined) {
                if (index === removedIndex) {
                    changed = true
                    return false
                }
                if (index > removedIndex) nextIndex = index - 1
            }
            if (nextIndex >= variableCount) {
                changed = true
                return false
            }
            if (nextIndex !== index) {
                edge.targetHandle = customVariableVectorPortId(nextIndex)
                changed = true
            }
            return true
        })
        if (!changed) return
        edges.value = nextEdges
        markGraphDirty()
        recalculateFromSeeds([nodeId])
        commitHistory("同步变量接线", `node:${nodeId}`)
    }

    /**
     * 清空自定义变量组的向量接线（变量列表被整体替换时使用）。
     * @param nodeId 自定义变量组节点 id
     */
    function clearVariableVectorEdges(nodeId: string) {
        const nextEdges = edges.value.filter(
            edge => edge.target !== nodeId || parseCustomVariableVectorPortId(edge.targetHandle) === undefined
        )
        if (nextEdges.length === edges.value.length) return
        edges.value = nextEdges
        clearCache()
        markGraphDirty()
        recalculateAllNodes()
        commitHistory("清除变量接线", `node:${nodeId}`)
    }

    /**
     * 复制选中的节点和相关边
     */
    function copySelectedNodes(selectedNodes: EditorNodeInput[]) {
        if (selectedNodes.length === 0) return

        // 保存选中的节点（沿用序列化口径，避免把 CharBuild 实例等运行时数据带入剪贴板）
        copiedNodes.value = normalizeNodes(serializeNodes(normalizeNodes(selectedNodes)))

        // 保存与选中节点相关的边（源或目标在选中节点中）
        const selectedNodeIds = new Set(selectedNodes.map(node => node.id))
        copiedEdges.value = JSON.parse(
            JSON.stringify(edges.value.filter(edge => selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)))
        )
    }

    /**
     * 粘贴节点和边
     */
    function pasteNodes(offset: { x: number; y: number } = { x: 50, y: 50 }) {
        if (copiedNodes.value.length === 0) return

        // 创建ID映射，用于更新边的连接
        const idMap = new Map<string, string>()

        // 生成新节点，更新ID和位置
        const newNodes = copiedNodes.value.map(node => {
            const newId = nanoid()
            idMap.set(node.id, newId)

            return {
                ...node,
                id: newId,
                position: {
                    x: (node.position as { x: number; y: number }).x + offset.x,
                    y: (node.position as { x: number; y: number }).y + offset.y,
                },
            }
        })

        // 生成新边，更新ID和连接
        const newEdges = copiedEdges.value.map(edge => {
            const newId = `e${nanoid()}`

            return {
                ...edge,
                id: newId,
                source: idMap.get(edge.source) || edge.source,
                target: idMap.get(edge.target) || edge.target,
            }
        })

        // 过滤掉连接到外部节点的边（只保留内部连接）
        const newNodeIds = new Set(newNodes.map(node => node.id))
        const filteredEdges = newEdges.filter(edge => newNodeIds.has(edge.source) && newNodeIds.has(edge.target))

        // 添加新节点和边
        nodes.value.push(...newNodes)
        edges.value.push(...filteredEdges.map(decorateEdge))
        markGraphDirty()

        // 只算粘贴进来的节点：粘贴边只在新节点内部，已有节点不受影响
        recalculateFromSeeds(newNodes.map(node => node.id))
        commitHistory("粘贴节点")

        return newNodes
    }

    /**
     * 连接节点（@vue-flow onConnect 回调）
     */
    function onConnect(connection: Connection) {
        if (!isValidConnection(connection, { allowOccupiedTarget: true })) return false
        const edge: EditorEdge = {
            id: `e${nanoid()}`,
            source: connection.source!,
            target: connection.target!,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
        }
        return addEdge(edge)
    }

    /**
     * 从数据库加载所有图
     */
    async function loadAllGraphs(): Promise<void> {
        const graphs = await db.nodeEditorGraphs.toArray()
        savedGraphs.value = graphs
    }

    /**
     * 加载最后编辑的图
     */
    async function loadLastEditedGraph(): Promise<void> {
        // 获取所有图，并按更新时间排序
        const graphs = await db.nodeEditorGraphs.orderBy("updatedAt").reverse().toArray()
        if (graphs.length > 0) {
            const lastGraph = graphs[0]
            await loadGraphFromDB(lastGraph.id)
        }
    }

    /**
     * 序列化节点，只返回必要的数据
     */
    function serializeNodes(nodesToSerialize: EditorNode[]): EditorNode[] {
        return nodesToSerialize.map(node => {
            // 只保留必要的节点属性
            const serializedNode: EditorNode = {
                id: node.id,
                type: node.type,
                position: node.position,
                // 显隐与锁定是纯展示状态：持久化以便重开图 / 撤销 / 复制粘贴后保持一致
                ...(node.hidden === true ? { hidden: true as const } : null),
                ...(node.data?.locked === true ? { draggable: false, selectable: false, connectable: false } : null),
                data: {
                    ...node.data,
                    // 过滤掉不需要持久化的数据
                    charBuild: undefined, // 计算结果，不需要保存
                    build: undefined, // 构筑上下文（含 CharBuild 实例），不需要保存
                    buildVector: undefined, // 构筑向量（含 CharBuild 实例），不需要保存
                    vectorDimensions: undefined, // 构筑向量维度，重新计算即可
                    vectorResult: undefined, // 向量求值结果，不需要保存
                    chartVector: undefined, // 图表节点归一化后的输入向量，重新计算即可
                    evaluation: undefined, // worker 求值结果，不需要保存
                    evalSignature: undefined, // 求值签名，不需要保存
                    evalPending: undefined, // 求值状态，不需要保存
                    result: undefined, // 计算结果，不需要保存
                    error: undefined, // 错误信息，不需要保存
                    missingInputs: undefined, // 临时状态，不需要保存
                    hasSkillWeapon: undefined, // 武器槽按钮组状态，重新计算即可
                    weaponSlotAuto: undefined, // 构筑默认武器槽，重新计算即可
                    attrOutputVector: undefined, // 属性逐项输出类型，重新计算即可
                    attributeVectorValues: undefined, // 属性逐项向量值，重新计算即可
                    panels: undefined, // 面板缓存（角色 / 武器槽），重新计算即可
                    panelVectors: undefined, // 面板逐项向量缓存，重新计算即可
                    inputData: undefined, // 计算中间数据，不需要保存
                },
            }
            return serializedNode
        })
    }

    /**
     * 序列化边，只返回必要的数据
     */
    function serializeEdges(edgesToSerialize: EditorEdge[]): EditorEdge[] {
        return edgesToSerialize.map(edge => {
            // 只保留必要的边属性
            const serializedEdge: EditorEdge = {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
                data: edge.data ? { ...edge.data } : undefined,
            }
            return serializedEdge
        })
    }

    /**
     * 序列化图数据，只返回必要的数据
     */
    function serializeGraphData(name: string): UNodeEditorGraph {
        return JSON.parse(
            JSON.stringify({
                name,
                nodes: serializeNodes(Object.values(nodes.value)),
                edges: serializeEdges(edges.value),
                updatedAt: Date.now(),
            })
        )
    }

    /**
     * 保存图到数据库
     */
    async function saveGraphToDB(name: string, autoSave: boolean = false): Promise<number> {
        // 创建可序列化的数据，只包含必要的属性
        const graphData: UNodeEditorGraph = serializeGraphData(name)

        // 如果当前有图ID，则更新现有图
        if (currentGraphId.value) {
            await db.nodeEditorGraphs.update(currentGraphId.value, {
                ...graphData,
                updatedAt: Date.now(),
            })
            if (!autoSave) useUIStore().showSuccessMessage(`${name} 已保存`)
            return currentGraphId.value
        }
        // 否则创建新图
        else {
            const id = await db.nodeEditorGraphs.add(graphData)
            currentGraphId.value = id
            // 更新savedGraphs数组
            await loadAllGraphs()
            useUIStore().showSuccessMessage(`${name} 已保存`)
            return id
        }
    }

    /**
     * 取消所有排队中的求值，并让在途请求的结果失效。
     */
    function cancelPendingEvaluations() {
        evaluationTimers.forEach(timer => clearTimeout(timer))
        evaluationTimers.clear()
        evaluationRequestIds.clear()
        // 取消后必须作废签名：整图重算时签名相同会跳过调度，节点会永远停在 pending
        nodes.value.forEach(node => {
            node.data.evalSignature = undefined
            if (node.data.evalPending) node.data.evalPending = false
        })
        previewCache = null
    }

    /**
     * 重新计算所有计算节点
     */
    function recalculateAllNodes() {
        // 清除缓存与旧求值请求
        cancelPendingEvaluations()
        clearCache()

        Object.values(nodes.value).forEach(node => {
            calculateNode(node.id)
        })
    }

    /**
     * 加载图从数据库
     */
    async function loadGraphFromDB(graphId: number): Promise<void> {
        const graph = await db.nodeEditorGraphs.get(graphId)
        if (graph) {
            nodes.value = normalizeNodes(graph.nodes)
            const legacyHubs = collectLegacyHubIds(nodes.value, graph.edges)
            const migratedEdges = [...graph.edges]
            migrateLegacyExpressionNodes(nodes.value, migratedEdges)
            migrateLegacyTeamNodes(nodes.value, migratedEdges)
            edges.value = migrateGraphEdges(nodes.value, migratedEdges)
            nodes.value = nodes.value.filter(node => !legacyHubs.has(node.id))
            const pruned = dropRemovedNodes(nodes.value, edges.value)
            nodes.value = pruned.nodes
            edges.value = pruned.edges
            edges.value.forEach(decorateEdge)
            currentGraphId.value = graph.id
            markGraphDirty()
            resetHistory("加载图")

            // 重新计算所有计算节点
            recalculateAllNodes()
        }
    }

    /**
     * 删除图从数据库
     */
    async function deleteGraphFromDB(graphId: number): Promise<void> {
        await db.nodeEditorGraphs.delete(graphId)
        // 如果删除的是当前图，重置当前图ID
        if (currentGraphId.value === graphId) {
            currentGraphId.value = null
        }
        // 更新savedGraphs数组
        await loadAllGraphs()
    }

    /**
     * 清空图
     */
    function clearGraph(options: { resetHistory?: boolean } = {}) {
        nodes.value = []
        edges.value = []
        cancelPendingEvaluations()
        clearCache()
        markGraphDirty()
        if (options.resetHistory !== false) resetHistory("清空图")
        scheduleAutoSave()
    }

    /**
     * 清除计算缓存
     */
    function clearCache() {
        calculationCache.clear()
    }

    /**
     * 按依赖增量重算：只重算种子及其下游，上游命中缓存不再重算。
     * 不碰求值签名与 debounce 计时：签名未变的 worker 不发新请求，变化的由 schedule 自行取消旧计时重排。
     * @param seedIds 变化起点
     */
    function recalculateFromSeeds(seedIds: string[]) {
        const ordered = sortDownstreamIds(
            seedIds.filter(id => nodes.value.some(node => node.id === id)),
            edges.value
        )
        if (ordered.length === 0) return
        const startedAt = performance.now()
        // 只作废受影响节点的缓存，上游缓存保留
        ordered.forEach(id => calculationCache.delete(id))
        ordered.forEach(id => calculateNode(id, false))
        recordSyncPhase("增量重算", performance.now() - startedAt, { nodeId: seedIds.join(",") })
    }

    /**
     * undo 记录点同源的自动保存：每次图变更后 2s 防抖写回同一张图，未保存的新图不写。
     */
    function scheduleAutoSave() {
        if (autoSaveTimer) {
            window.clearTimeout(autoSaveTimer)
            autoSaveTimer = null
        }
        if (!autoSaveEnabled.value || !currentGraphId.value) return
        autoSaveStatus.value = "waiting"
        autoSaveTimer = window.setTimeout(() => {
            autoSaveTimer = null
            if (!autoSaveEnabled.value || !currentGraphId.value) return
            saveGraphToDB(currentGraphName.value, true)
                .catch(error => console.error("自动保存失败:", error))
                .finally(() => {
                    if (!autoSaveTimer) autoSaveStatus.value = "checked"
                })
        }, AUTO_SAVE_DEBOUNCE_MS)
    }

    /**
     * 立即落盘排队的自动保存（页面卸载前调用，避免丢防抖窗口内的变更）。
     */
    function flushAutoSave() {
        if (!autoSaveTimer) return
        window.clearTimeout(autoSaveTimer)
        autoSaveTimer = null
        if (!autoSaveEnabled.value || !currentGraphId.value) return
        saveGraphToDB(currentGraphName.value, true)
            .catch(error => console.error("自动保存失败:", error))
            .finally(() => {
                autoSaveStatus.value = "checked"
            })
    }

    /**
     * 启动自动保存：事件驱动无需轮询，保留入口供挂载时调用。
     */
    function startAutoSave() {
        if (autoSaveTimer) {
            window.clearTimeout(autoSaveTimer)
            autoSaveTimer = null
        }
        autoSaveStatus.value = "checked"
    }

    /**
     * 停止自动保存：丢弃排队的写入（关闭功能时用，卸载请用 flushAutoSave）。
     */
    function stopAutoSave() {
        if (autoSaveTimer) {
            window.clearTimeout(autoSaveTimer)
            autoSaveTimer = null
        }
        autoSaveStatus.value = "checked"
    }

    /**
     * 设置自动保存状态
     */
    function setAutoSaveEnabled(enabled: boolean) {
        autoSaveEnabled.value = enabled
        if (!enabled) stopAutoSave()
    }

    /**
     * 设置当前图名称
     */
    function setCurrentGraphName(name: string) {
        currentGraphName.value = name
        if (currentGraphId.value) {
            // 保存名称更改
            saveGraphToDB(name)
        }
    }

    /**
     * 导出图为JSON文件
     */
    async function exportGraph() {
        // 使用序列化函数创建只包含必要数据的图数据
        const graphData = {
            name: currentGraphName.value,
            nodes: serializeNodes(Object.values(nodes.value)),
            edges: serializeEdges(edges.value),
        }

        const json = JSON.stringify(graphData, null, 2)

        if (env.isApp) {
            const path = await dialog.save({
                title: "保存图为JSON文件",
                defaultPath: `${currentGraphName.value || "node-editor-graph"}.json`,
                filters: [{ name: "JSON 文件", extensions: ["json"] }],
            })
            if (!path) return
            await writeTextFile(path, json)
        } else {
            const blob = new Blob([json], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `${currentGraphName.value || "node-editor-graph"}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }
    }

    /**
     * 把已解析的图 JSON 载入画布（分享载入 / 在线载入共用，与 importGraph 同口径）。
     * @param graphData 图 JSON（含 nodes/edges/name）
     * @param graphName 覆盖显示的图名（缺省用 JSON 里的 name）
     */
    function loadGraphData(graphData: { nodes?: unknown[]; edges?: unknown[]; name?: string }, graphName?: string): void {
        const rawNodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
        const rawEdges = Array.isArray(graphData.edges) ? graphData.edges : []
        nodes.value = normalizeNodes(rawNodes as EditorNodeInput[])
        const legacyHubs = collectLegacyHubIds(nodes.value, rawEdges as EditorEdge[])
        const importedEdges = [...(rawEdges as EditorEdge[])]
        migrateLegacyExpressionNodes(nodes.value, importedEdges)
        migrateLegacyTeamNodes(nodes.value, importedEdges)
        edges.value = migrateGraphEdges(nodes.value, importedEdges)
        nodes.value = nodes.value.filter(node => !legacyHubs.has(node.id))
        const pruned = dropRemovedNodes(nodes.value, edges.value)
        nodes.value = pruned.nodes
        edges.value = pruned.edges
        edges.value.forEach(decorateEdge)
        currentGraphName.value = graphName ?? (typeof graphData.name === "string" && graphData.name ? graphData.name : "分享的图")
        currentGraphId.value = null
        markGraphDirty()
        resetHistory("载入分享图")
        recalculateAllNodes()
    }

    /**
     * 序列化当前图为可分享/可存档的 JSON 文本。
     * @param name 图名（缺省用当前图名）
     * @returns 图 JSON 文本
     */
    function exportGraphJson(name?: string): string {
        return JSON.stringify({
            name: name ?? currentGraphName.value,
            nodes: serializeNodes(Object.values(nodes.value)),
            edges: serializeEdges(edges.value),
        })
    }

    /**
     * 导入图从JSON文件
     */
    function importGraph(file: File): Promise<void> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = e => {
                try {
                    const json = e.target?.result as string
                    const graphData = JSON.parse(json)

                    // 加载图数据
                    nodes.value = normalizeNodes(graphData.nodes || [])
                    const legacyHubs = collectLegacyHubIds(nodes.value, graphData.edges || [])
                    const importedEdges = [...(graphData.edges || [])]
                    migrateLegacyExpressionNodes(nodes.value, importedEdges)
                    migrateLegacyTeamNodes(nodes.value, importedEdges)
                    edges.value = migrateGraphEdges(nodes.value, importedEdges)
                    nodes.value = nodes.value.filter(node => !legacyHubs.has(node.id))
                    const pruned = dropRemovedNodes(nodes.value, edges.value)
                    nodes.value = pruned.nodes
                    edges.value = pruned.edges
                    edges.value.forEach(decorateEdge)
                    currentGraphName.value = graphData.name || "导入的图"
                    currentGraphId.value = null // 新图，未保存
                    markGraphDirty()
                    resetHistory("导入图")

                    // 重新计算所有计算节点
                    recalculateAllNodes()

                    resolve()
                } catch (error) {
                    reject(error)
                }
            }
            reader.onerror = () => {
                reject(new Error("读取文件失败"))
            }
            reader.readAsText(file)
        })
    }

    const EVAL_DEBOUNCE_MS = 120

    /** 核心节点构筑解析结果（不写回节点数据，可在渲染期间安全使用） */
    interface CoreBuildResolution {
        contexts: NodeBuildContext[]
        vector?: BuildVector
        missing: string[]
        error?: string
    }

    /**
     * 解析核心节点的构筑输入：求值期按上游重新计算，渲染期只读已写回的结果。
     * @param coreId 核心节点 id
     * @param storedOnly 是否只读上游已缓存的构筑
     * @returns 构筑向量；没有构筑输入时返回 null
     */
    function resolveIncomingBuild(
        coreId: string,
        storedOnly: boolean
    ): { contexts: NodeBuildContext[]; dimensions: BuildVectorDimension[]; labels: string[] } | null {
        const source = findBuildInputSource(coreId)
        if (!source) return null
        if (!storedOnly) return getBuildInputVector(coreId)
        const storedVector = source.data.buildVector as BuildVector | undefined
        if (storedVector && storedVector.contexts.length > 0) return storedVector
        const storedBuild = source.data.build as NodeBuildContext | undefined
        return storedBuild ? { dimensions: [], labels: [""], contexts: [storedBuild] } : null
    }

    /**
     * 解析核心节点的构筑上下文，不修改节点数据。
     * @param coreNode 核心计算节点
     * @param options `readStoredBuildInput` 为 true 时只读上游缓存，供渲染期调用
     * @returns 构筑上下文、向量与缺失信息
     */
    function resolveCoreBuild(coreNode: EditorNode, options: { readStoredBuildInput?: boolean } = {}): CoreBuildResolution {
        // 只读取核心节点端口上直接相连的输入；下游节点永远不会反向并入构筑
        const inputs = collectCoreInputNodes(nodes.value, edges.value, coreNode.id)
        const variableVectors = collectVariableVectors(nodes.value, edges.value, inputs.customVarsInput?.id)
        const paramVectors = collectNumericParamVectors(nodes.value, edges.value, inputs)
        const incoming = resolveIncomingBuild(coreNode.id, options.readStoredBuildInput === true)
        const mode = coreNode.data.buildMode === "append" ? "append" : "override"
        return createBuildContextsFromInputs(
            inputs,
            variableVectors,
            coreNode.data,
            incoming ? { ...incoming, mode } : undefined,
            paramVectors
        )
    }

    /**
     * 组装核心节点的构筑上下文并写回节点数据。
     * @param coreNode 核心计算节点
     * @returns 构筑上下文；缺少输入或创建失败时返回 null
     */
    function createCoreContext(coreNode: EditorNode): NodeBuildContext | null {
        const { contexts, vector, missing, error } = resolveCoreBuild(coreNode)
        const context = contexts[0]
        if (!context) {
            coreNode.data.missingInputs = missing.length > 0 ? missing : undefined
            coreNode.data.error = error ?? (missing.length > 0 ? `缺少必要输入: ${missing.join(", ")}` : "构筑创建失败")
            coreNode.data.charBuild = undefined
            coreNode.data.build = undefined
            coreNode.data.buildVector = undefined
            coreNode.data.vectorDimensions = undefined
            return null
        }
        coreNode.data.build = markRaw(context)
        coreNode.data.buildVector = vector ? markRaw(vector) : undefined
        coreNode.data.vectorDimensions = vector ? vector.dimensions.map(dimension => dimension.values.length) : undefined
        coreNode.data.charBuild = markRaw(context.charBuild)
        coreNode.data.missingInputs = missing.length > 0 ? missing : undefined
        coreNode.data.error = missing.length > 0 ? missing.join("、") : undefined
        return context
    }

    /**
     * 沿边查找与节点连通的核心计算节点。
     * @param nodeId 起点节点
     * @param direction upstream 找输入方向，downstream 找输出方向
     * @returns 核心计算节点
     */
    function findConnectedCore(nodeId: string, direction: "upstream" | "downstream"): EditorNode | null {
        const byId = new Map(nodes.value.map(node => [node.id, node]))
        const visited = new Set<string>()
        const queue = [nodeId]
        while (queue.length > 0) {
            const id = queue.shift()!
            if (visited.has(id)) continue
            visited.add(id)
            const node = byId.get(id)
            if (!node) continue
            if (id !== nodeId && node.type === NodeType.CORE_CALC) return node
            edges.value.forEach(edge => {
                const matches = direction === "upstream" ? edge.target === id : edge.source === id
                if (matches) queue.push(direction === "upstream" ? edge.source : edge.target)
            })
        }
        return null
    }

    /**
     * 读取节点可用的构筑上下文：优先使用相连的核心节点，
     * 其次任一已构建的核心节点，最后用整张图的输入节点生成预览构筑。
     * @param nodeId 发起读取的节点（MOD / BUFF / AST 等编辑节点）
     * @returns 构筑上下文
     */
    function getBuildContext(nodeId?: string): NodeBuildContext | null {
        // 订阅图版本：节点变更后重新计算缓存
        graphRevision.value
        if (nodeId) {
            const related = findConnectedCore(nodeId, "downstream") ?? findConnectedCore(nodeId, "upstream")
            if (related) {
                // 这里会在节点渲染期间被调用：核心尚未计算时只做只读解析，不写回节点数据
                const context =
                    (related.data.build as NodeBuildContext | undefined) ??
                    resolveCoreBuild(related, { readStoredBuildInput: true }).contexts[0]
                if (context) return context
            }
        }
        const anyCore = nodes.value.find(node => node.type === NodeType.CORE_CALC && node.data.build)
        if (anyCore) return anyCore.data.build as NodeBuildContext
        if (!previewCache || previewCache.revision !== graphRevision.value) {
            const inputs = collectAllInputs(nodes.value)
            const { context } = createBuildContextFromInputs(inputs, {}, { fallbackChar: true })
            previewCache = { revision: graphRevision.value, context: context ? markRaw(context) : null }
        }
        return previewCache.context
    }

    /** 查找节点构筑输入端口的来源节点 */
    function findBuildInputSource(nodeId: string): EditorNode | null {
        const node = nodes.value.find(item => item.id === nodeId)
        if (!node) return null
        const edge = edges.value.find(item => {
            if (item.target !== nodeId) return false
            return resolvePort(node.type ?? "", item.targetHandle, "input", node.data)?.type === PortType.BUILD
        })
        if (!edge) return null
        return nodes.value.find(item => item.id === edge.source) ?? null
    }

    /**
     * 读取节点构筑输入端口的上下文。
     * 只接受类型为「构筑」的输入端口，不扫描核心节点。
     * @param nodeId 目标节点
     * @returns 构筑上下文；没有构筑输入时返回 null
     */
    function getBuildInputContext(nodeId: string): NodeBuildContext | null {
        const source = findBuildInputSource(nodeId)
        if (!source) return null
        const output = calculateNode(source.id)
        return (output?.build as NodeBuildContext | undefined) ?? null
    }

    /**
     * 读取节点构筑输入端口的向量；标量构筑包装为无维度向量。
     * @param nodeId 目标节点
     * @returns 构筑向量；没有构筑输入时返回 null
     */
    function getBuildInputVector(nodeId: string): BuildVector | null {
        const source = findBuildInputSource(nodeId)
        if (!source) return null
        const output = calculateNode(source.id)
        const vector = output?.buildVector as BuildVector | undefined
        if (vector) return vector
        const context = output?.build as NodeBuildContext | undefined
        return context ? { dimensions: [], labels: [""], contexts: [context] } : null
    }

    /**
     * 属性节点的输出：`attrs` 下挂整块面板，同时把每项属性平铺成独立输出口，
     * 向量构筑时每项属性是该组合下的数值数组。
     * @param node 目标节点
     * @returns 输出对象；尚未求值时返回 null
     */
    function attributeOutputs(node: EditorNode) {
        const panel = node.data.result as Record<string, number> | null | undefined
        if (!panel || typeof panel !== "object") return null
        const vectors = node.data.attributeVectorValues as Record<string, number[]> | undefined
        const output: Record<string, number | number[] | Record<string, number>> = { attrs: panel }
        Object.entries(panel).forEach(([key, value]) => {
            if (typeof value !== "number") return
            output[key] = vectors?.[key] ?? value
        })
        return output
    }

    /**
     * 读取上游节点的输出值：按 sourceHandle 精确取值，输入节点直接返回节点数据。
     * @param node 上游节点
     * @param handleId 输出端口 id
     * @returns 输出值
     */
    function getNodeOutput(node: EditorNode, handleId?: string | null): any {
        const result = calculateNode(node.id)
        if (result === undefined || result === null) return undefined
        const nodeType = node.type ?? ""
        if (nodeType.includes("input")) return result
        // 属性节点：attrs 取整块面板，属性键取逐项值；旧边没有 handle 时仍按整块面板处理
        if (nodeType === NodeType.ATTR_CALC || nodeType === NodeType.WEAPON_ATTR_CALC) {
            if (!handleId || handleId === "attrs") return result.attrs
            return result[handleId] ?? result.attrs
        }
        if (handleId && typeof result === "object" && handleId in result) return result[handleId]
        return result
    }

    /**
     * 收集节点的输入端口值：键为目标端口 id。
     * @param node 目标节点
     * @returns 端口值映射
     */
    function collectInputPortValues(node: EditorNode): Map<string, any> {
        const values = new Map<string, any>()
        edges.value.forEach(edge => {
            if (edge.target !== node.id) return
            const source = nodes.value.find(item => item.id === edge.source)
            if (!source) return
            const value = getNodeOutput(source, edge.sourceHandle)
            if (value === undefined || value === null) return
            values.set(edge.targetHandle ?? "", value)
        })
        return values
    }

    /**
     * 按端口顺序提取数值输入，保证表达式计算中的 a/b/c 与端口行一一对应。
     * @param node 目标节点
     * @param values 端口值映射
     * @returns 数值数组
     */
    function orderedNumericValues(node: EditorNode, values: Map<string, any>): number[] {
        const ports = getNodePorts(node.type ?? "", node.data).inputs.filter(port => port.type === PortType.NUMBER)
        const result: number[] = []
        ports.forEach(port => {
            const value = extractNumericValue(values.get(port.id))
            if (value !== undefined) result.push(value)
        })
        // 兼容没有 targetHandle 的旧边：单数值端口时按唯一输入处理
        if (result.length === 0 && ports.length === 1) {
            const legacy = extractNumericValue(values.get(""))
            if (legacy !== undefined) result.push(legacy)
        }
        return result
    }

    /**
     * 从节点输出中提取一个数值。
     * @param data 输出值
     * @returns 数值；无法解析时返回 undefined
     */
    function extractNumericValue(data: any): number | undefined {
        if (typeof data === "number") return data
        if (typeof data?.value === "number") return data.value
        if (typeof data?.expectedDamage === "number") return data.expectedDamage
        return undefined
    }

    /**
     * 为边补充端口类型与颜色。
     * @param edge 目标边
     * @returns 同一条边
     */
    function decorateEdge(edge: EditorEdge): EditorEdge {
        const source = nodes.value.find(node => node.id === edge.source)
        const target = nodes.value.find(node => node.id === edge.target)
        const sourcePort = resolvePort(source?.type ?? "", edge.sourceHandle, "output", source?.data ?? {})
        const targetPort = resolvePort(target?.type ?? "", edge.targetHandle, "input", target?.data ?? {})
        const type = sourcePort?.type ?? targetPort?.type
        if (!type) return edge
        if (!edge.sourceHandle && sourcePort) edge.sourceHandle = sourcePort.id
        if (!edge.targetHandle && targetPort) edge.targetHandle = targetPort.id
        edge.data = { ...edge.data, portType: type }
        edge.style = { ...edge.style, stroke: portColor(type), strokeWidth: 2 }
        return edge
    }

    /**
     * 校验连接是否符合端口类型：只允许同类型相连，单连接端口不能重复接线。
     * @param connection 待连接信息
     * @returns 是否允许连接
     */
    function isValidConnection(
        connection: Pick<Connection, "source" | "target" | "sourceHandle" | "targetHandle"> & { id?: string },
        options: { allowOccupiedTarget?: boolean } = {}
    ): boolean {
        const source = nodes.value.find(node => node.id === connection.source)
        const target = nodes.value.find(node => node.id === connection.target)
        if (!source || !target || source.id === target.id) return false
        const sourcePort = resolvePort(source.type ?? "", connection.sourceHandle, "output", source.data)
        const targetPort = resolvePort(target.type ?? "", connection.targetHandle, "input", target.data)
        if (!canConnectPorts(sourcePort, targetPort)) return false
        if (!targetPort!.multiple && options.allowOccupiedTarget !== true) {
            // 校验已有边时忽略自身；校验新连接时才把已占用的端口判为无效
            const occupied = edges.value.some(
                edge => edge.target === target.id && edge.targetHandle === targetPort!.id && edge.id !== connection.id
            )
            if (occupied) return false
        }
        return true
    }

    /**
     * 把异步求值结果写回节点并刷新下游。
     * @param node 目标节点
     * @param evaluation worker 求值结果
     */
    function applyEvaluation(node: EditorNode, evaluation: CalcBuildEvaluation) {
        const startedAt = performance.now()
        node.data.evalPending = false
        node.data.evaluation = evaluation
        // 属性节点只关心属性/面板：目标函数求值失败不应让属性结果变成错误
        const ignoresTargetError = node.type === NodeType.ATTR_CALC || node.type === NodeType.WEAPON_ATTR_CALC
        if (evaluation.error && !ignoresTargetError) {
            node.data.error = evaluation.error
            node.data.result = { value: evaluation.targetValue, error: evaluation.error }
        } else {
            node.data.error = undefined
            node.data.result = mapEvaluationResult(node, evaluation)
        }
        recalculateFromSeeds([node.id])
        recordSyncPhase("结果写回", performance.now() - startedAt, { nodeId: node.id, nodeType: node.type })
    }

    /**
     * 按节点类型从求值结果中取展示数据。
     * @param node 目标节点
     * @param evaluation worker 求值结果
     * @returns 节点结果
     */
    function mapEvaluationResult(node: EditorNode, evaluation: CalcBuildEvaluation) {
        switch (node.type) {
            case NodeType.ATTR_CALC:
                return evaluation.attributes
            case NodeType.WEAPON_ATTR_CALC:
                return evaluation.weapon
            default:
                return { value: evaluation.targetValue }
        }
    }

    /** 计算武器属性节点可选的武器槽 */
    type WeaponSlot = "melee" | "ranged" | "skill"

    /** 面板请求的面板键：角色属性面板 + 武器槽面板 */
    type PanelKey = "char" | WeaponSlot

    /** 武器属性节点一次取齐的槽位：切换按钮时直接取缓存，不再发请求 */
    const WEAPON_PANEL_SLOTS: WeaponSlot[] = ["melee", "ranged", "skill"]

    /** 构筑默认武器槽 → 节点展示槽位 */
    const AUTO_WEAPON_SLOT: Record<string, WeaponSlot> = { 近战: "melee", 远程: "ranged", 同律: "skill" }

    /**
     * 读取节点当前展示的武器面板槽：手选优先，未选时跟随构筑默认武器。
     * @param node 计算武器属性节点
     * @returns 武器槽
     */
    function activeWeaponSlot(node: EditorNode): WeaponSlot {
        const slot = node.data.weaponSlot
        if (slot === "melee" || slot === "ranged" || slot === "skill") return slot
        return AUTO_WEAPON_SLOT[node.data.weaponSlotAuto as string] ?? "melee"
    }

    /**
     * 节点在面板结果里展示的键：属性节点取角色面板，武器属性节点取当前槽位。
     * @param node 属性节点
     * @returns 面板键
     */
    function activePanelKey(node: EditorNode): PanelKey {
        return node.type === NodeType.ATTR_CALC ? "char" : activeWeaponSlot(node)
    }

    /**
     * 节点一次面板请求要取的面板键。
     * @param node 属性节点
     * @returns 面板键列表
     */
    function panelKeysFor(node: EditorNode): PanelKey[] {
        return node.type === NodeType.ATTR_CALC ? ["char"] : WEAPON_PANEL_SLOTS
    }

    /**
     * 从批量面板结果同步节点展示：面板与向量都按当前面板键取值（切换武器槽无需重新请求）。
     * @param node 属性节点
     */
    function applyPanelSelection(node: EditorNode) {
        const key = activePanelKey(node)
        const panels = node.data.panels as Partial<Record<PanelKey, Record<string, number>>> | undefined
        const vectorsByKey = node.data.panelVectors as Partial<Record<PanelKey, Record<string, number[]>>> | undefined
        node.data.result = panels?.[key] ?? null
        node.data.attributeVectorValues = vectorsByKey?.[key]
        const vectorResult = node.data.vectorResult as { values: number[] } | undefined
        const vectors = vectorsByKey?.[key]
        if (vectorResult && vectors) node.data.vectorResult = { ...vectorResult, values: vectors.攻击 ?? [] }
    }

    /**
     * 调度面板求值：只请求面板（不跑目标函数 / 伤害明细），同一构筑一次取齐该节点的全部面板键。
     * @param node 属性节点
     * @param context 构筑上下文
     */
    function schedulePanels(node: EditorNode, context: NodeBuildContext) {
        const signature = JSON.stringify([context.charId, context.settings])
        if (node.data.evalSignature === signature) {
            applyPanelSelection(node)
            return
        }
        node.data.evalSignature = signature
        node.data.evalPending = true
        node.data.panelVectors = undefined
        node.data.attributeVectorValues = undefined
        const pendingTimer = evaluationTimers.get(node.id)
        if (pendingTimer) clearTimeout(pendingTimer)
        const requestId = (evaluationRequestIds.get(node.id) ?? 0) + 1
        evaluationRequestIds.set(node.id, requestId)
        const timer = setTimeout(() => {
            evaluationTimers.delete(node.id)
            requestBuildPanels(
                {
                    charId: context.charId,
                    settings: clonePlain(context.settings),
                    panels: panelKeysFor(node),
                },
                { nodeId: node.id, nodeType: node.type }
            )
                .then(panels => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    node.data.evalPending = false
                    node.data.error = undefined
                    node.data.panels = panels
                    node.data.panelVectors = undefined
                    applyPanelSelection(node)
                    recalculateFromSeeds([node.id])
                })
                .catch(error => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    node.data.evalPending = false
                    node.data.error = error instanceof Error ? error.message : String(error)
                })
        }, EVAL_DEBOUNCE_MS)
        evaluationTimers.set(node.id, timer)
    }

    /**
     * 调度向量构筑的面板求值：每个组合一次批量面板请求，按面板键合并为逐项向量。
     * @param node 属性节点
     * @param vector 构筑向量
     */
    function scheduleVectorPanels(node: EditorNode, vector: BuildVector) {
        const panelKeys = panelKeysFor(node)
        const signature = JSON.stringify([
            vector.dimensions.map(dimension => dimension.values),
            vector.contexts.map(context => [context.charId, context.settings]),
        ])
        if (node.data.evalSignature === signature) {
            applyPanelSelection(node)
            return
        }
        node.data.evalSignature = signature
        node.data.evalPending = true
        node.data.panelVectors = undefined
        node.data.attributeVectorValues = undefined
        const pendingTimer = evaluationTimers.get(node.id)
        if (pendingTimer) clearTimeout(pendingTimer)
        const requestId = (evaluationRequestIds.get(node.id) ?? 0) + 1
        evaluationRequestIds.set(node.id, requestId)
        const timer = setTimeout(() => {
            evaluationTimers.delete(node.id)
            Promise.all(
                vector.contexts.map(context =>
                    requestBuildPanels(
                        {
                            charId: context.charId,
                            settings: clonePlain(context.settings),
                            panels: panelKeys,
                        },
                        { nodeId: node.id, nodeType: node.type }
                    )
                )
            )
                .then(panelsList => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    const vectorsByKey: Partial<Record<PanelKey, Record<string, number[]>>> = {}
                    panelsList.forEach(panels => {
                        panelKeys.forEach(panelKey => {
                            const panel = panels[panelKey]
                            if (!panel) return
                            const vectors = (vectorsByKey[panelKey] ??= {})
                            Object.entries(panel).forEach(([key, value]) => {
                                if (typeof value === "number") (vectors[key] ??= []).push(value)
                            })
                        })
                    })
                    node.data.evalPending = false
                    node.data.error = undefined
                    node.data.panels = panelsList[0] ?? {}
                    node.data.panelVectors = vectorsByKey
                    node.data.vectorResult = {
                        dimensions: vector.dimensions,
                        labels: vector.labels,
                        values: [],
                        valueLabel: "攻击",
                    }
                    applyPanelSelection(node)
                    recalculateFromSeeds([node.id])
                })
                .catch(error => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    node.data.evalPending = false
                    node.data.error = error instanceof Error ? error.message : String(error)
                })
        }, EVAL_DEBOUNCE_MS)
        evaluationTimers.set(node.id, timer)
    }

    /**
     * 调度一次异步构筑求值：按节点签名去重，过期请求的结果直接丢弃。
     * @param node 目标节点
     * @param context 构筑上下文
     * @param targetFunction 目标函数覆盖（AST 节点）
     * @param baseName 技能基名覆盖
     */
    function scheduleEvaluation(node: EditorNode, context: NodeBuildContext, targetFunction?: string, baseName?: string) {
        node.data.vectorResult = undefined
        node.data.attributeVectorValues = undefined
        const base = withExpressionSettings(context.settings, targetFunction)
        const settings = baseName ? { ...base, baseName } : base
        const signature = JSON.stringify([context.charId, settings])
        if (node.data.evalSignature === signature) return
        node.data.evalSignature = signature
        node.data.evalPending = true
        const pendingTimer = evaluationTimers.get(node.id)
        if (pendingTimer) clearTimeout(pendingTimer)
        const requestId = (evaluationRequestIds.get(node.id) ?? 0) + 1
        evaluationRequestIds.set(node.id, requestId)
        const timer = setTimeout(() => {
            evaluationTimers.delete(node.id)
            requestBuildEvaluation(
                {
                    charId: context.charId,
                    settings: clonePlain(settings),
                    targetFunction: settings.targetFunction,
                    baseName: settings.baseName,
                },
                { nodeId: node.id, nodeType: node.type }
            )
                .then(evaluation => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    applyEvaluation(node, evaluation)
                })
                .catch(error => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    node.data.evalPending = false
                    node.data.error = error instanceof Error ? error.message : String(error)
                })
        }, EVAL_DEBOUNCE_MS)
        evaluationTimers.set(node.id, timer)
    }

    /**
     * 调度向量构筑求值：每个组合各请求一次 worker，结果合并为二维表格。
     * @param node 目标节点
     * @param vector 构筑向量
     * @param targetFunction 目标函数或按组合解析的函数
     * @param baseName 技能名称覆盖
     */
    function scheduleVectorEvaluation(
        node: EditorNode,
        vector: BuildVector,
        targetFunction?: string | ((context: NodeBuildContext) => string | undefined),
        baseName?: string
    ) {
        const prepared = vector.contexts.map(context => {
            const target = typeof targetFunction === "function" ? targetFunction(context) : targetFunction
            const base = withExpressionSettings(context.settings, target)
            const settings = baseName ? { ...base, baseName } : base
            return { context, settings }
        })
        const signature = JSON.stringify([
            vector.dimensions.map(dimension => dimension.values),
            prepared.map(item => [item.context.charId, item.settings]),
        ])
        if (node.data.evalSignature === signature) return
        node.data.evalSignature = signature
        node.data.evalPending = true
        const pendingTimer = evaluationTimers.get(node.id)
        if (pendingTimer) clearTimeout(pendingTimer)
        const requestId = (evaluationRequestIds.get(node.id) ?? 0) + 1
        evaluationRequestIds.set(node.id, requestId)
        const timer = setTimeout(() => {
            evaluationTimers.delete(node.id)
            Promise.all(
                prepared.map(item =>
                    requestBuildEvaluation(
                        {
                            charId: item.context.charId,
                            settings: clonePlain(item.settings),
                            targetFunction: item.settings.targetFunction,
                            baseName: item.settings.baseName,
                        },
                        { nodeId: node.id, nodeType: node.type }
                    )
                )
            )
                .then(evaluations => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    applyVectorEvaluation(node, vector, evaluations)
                })
                .catch(error => {
                    if (evaluationRequestIds.get(node.id) !== requestId) return
                    node.data.evalPending = false
                    node.data.error = error instanceof Error ? error.message : String(error)
                })
        }, EVAL_DEBOUNCE_MS)
        evaluationTimers.set(node.id, timer)
    }

    /** 向量求值的展示取值：属性节点取攻击，伤害节点取期望伤害，其余取目标值 */
    function vectorValueExtractor(node: EditorNode): { label: string; pick: (evaluation: CalcBuildEvaluation) => number } {
        switch (node.type) {
            case NodeType.ATTR_CALC:
                return { label: "攻击", pick: evaluation => evaluation.attributes?.攻击 ?? 0 }
            case NodeType.WEAPON_ATTR_CALC:
                return { label: "攻击", pick: evaluation => evaluation.weapon?.攻击 ?? 0 }
            default:
                return { label: "数值", pick: evaluation => evaluation.targetValue ?? 0 }
        }
    }

    /**
     * 合并向量求值结果：首组结果沿用节点原有展示，全部结果写入表格数据。
     * @param node 目标节点
     * @param vector 构筑向量
     * @param evaluations 各组合的求值结果
     */
    function applyVectorEvaluation(node: EditorNode, vector: BuildVector, evaluations: CalcBuildEvaluation[]) {
        const startedAt = performance.now()
        node.data.evalPending = false
        node.data.evaluation = evaluations[0]
        const firstError = evaluations.find(evaluation => evaluation.error)?.error
        const extractor = vectorValueExtractor(node)
        node.data.vectorResult = {
            dimensions: vector.dimensions,
            labels: vector.labels,
            values: evaluations.map(evaluation => extractor.pick(evaluation)),
            valueLabel: extractor.label,
        }
        // 属性节点：逐项属性各存一组与组合对齐的数值，作为向量输出
        const panelKey = node.type === NodeType.ATTR_CALC ? "attributes" : node.type === NodeType.WEAPON_ATTR_CALC ? "weapon" : undefined
        if (panelKey) {
            const vectors: Record<string, number[]> = {}
            evaluations.forEach(evaluation => {
                const panel = evaluation[panelKey] as Record<string, number> | null
                if (!panel) return
                Object.entries(panel).forEach(([key, value]) => {
                    if (typeof value !== "number") return
                    ;(vectors[key] ??= []).push(value)
                })
            })
            node.data.attributeVectorValues = vectors
        }
        if (firstError) {
            node.data.error = firstError
            const structuredResult = node.type === NodeType.ATTR_CALC || node.type === NodeType.WEAPON_ATTR_CALC
            node.data.result = structuredResult ? null : { value: evaluations[0]?.targetValue ?? 0, error: firstError }
        } else {
            node.data.error = undefined
            node.data.result = evaluations[0] ? mapEvaluationResult(node, evaluations[0]) : null
        }
        recalculateFromSeeds([node.id])
        recordSyncPhase("向量写回", performance.now() - startedAt, { nodeId: node.id, nodeType: node.type })
    }

    /**
     * 取消单个节点的排队求值并作废在途请求，用于表达式被清空等情况。
     * @param node 目标节点
     */
    function clearNodeEvaluation(node: EditorNode) {
        const timer = evaluationTimers.get(node.id)
        if (timer) clearTimeout(timer)
        evaluationTimers.delete(node.id)
        evaluationRequestIds.delete(node.id)
        node.data.evalSignature = undefined
        node.data.evalPending = false
    }

    /**
     * 收集上游节点的输出数据（输出节点展示用）。
     * @param node 目标节点
     * @returns 输入数据列表
     */
    function collectInputData(node: EditorNode): any[] {
        const inputData: any[] = []
        collectInputPortValues(node).forEach(value => {
            if (value?.inputs) {
                inputData.push(...value.inputs)
            } else {
                inputData.push(value)
            }
        })
        return inputData
    }

    /**
     * 写入节点成功结果。
     * @param node 目标节点
     * @param result 结果
     * @returns 结果
     */
    function storeResult(node: EditorNode, result: any) {
        node.data.result = result
        node.data.error = undefined
        node.data.vectorResult = undefined
        return result
    }

    /**
     * 写入节点错误结果。
     * @param node 目标节点
     * @param message 错误信息
     * @param invalidateEvaluation 是否同时作废求值签名（表达式错误后允许重新求值）
     * @returns 错误结果
     */
    function storeError(node: EditorNode, message: string, invalidateEvaluation = false) {
        node.data.error = message
        // 属性节点的 result 有固定结构，出错时置空让组件展示错误而不是按字段取值
        const structuredResult = node.type === NodeType.ATTR_CALC || node.type === NodeType.WEAPON_ATTR_CALC
        node.data.result = structuredResult ? null : { value: 0, error: message }
        node.data.vectorResult = undefined
        node.data.attributeVectorValues = undefined
        if (invalidateEvaluation) {
            node.data.evalSignature = undefined
            node.data.evalPending = false
        }
        return node.data.result
    }

    /**
     * 计算节点：数学节点同步求值，构筑节点交给 worker 异步求值。
     * @param node 目标节点
     * @param inputData 上游输入数据
     * @returns 节点结果
     */
    function calculateCalcNode(node: EditorNode, portValues: Map<string, any>): any {
        const nodeType = node.type ?? ""
        switch (nodeType) {
            case NodeType.ADD_CALC:
                return storeResult(node, { value: orderedNumericValues(node, portValues).reduce((sum, value) => sum + value, 0) })
            case NodeType.MULTIPLY_CALC: {
                const values = orderedNumericValues(node, portValues)
                return storeResult(node, { value: values.length > 0 ? values.reduce((product, value) => product * value, 1) : 0 })
            }
            case NodeType.EXPRESSION_CALC: {
                try {
                    const values = orderedNumericValues(node, portValues)
                    const names = values.map((_, index) => String.fromCharCode(97 + index))
                    const evaluate = new Function(...names, `return ${node.data.expression || "a + b"}`) as (...args: number[]) => number
                    return storeResult(node, { value: evaluate(...values) })
                } catch (error) {
                    return storeError(node, `表达式计算失败: ${(error as Error).message}`)
                }
            }
            case NodeType.VECTOR_CALC: {
                const label = typeof node.data.label === "string" ? node.data.label : "向量"
                const raw = portValues.get("vector")
                if (raw === undefined || raw === null) return storeError(node, "缺少向量输入")
                // 构筑向量带维度信息，不是一维数值向量，直接报错
                if (typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as Record<string, any>).dimensions)) {
                    return storeError(node, "仅支持一维向量输入")
                }
                const vector = normalizeLabeledVector(raw, label)
                if (!vector || vector.values.length === 0) return storeError(node, "缺少向量输入")
                const value = computeVectorStat(readVectorCalcMode(node.data), vector.values)
                if (value === undefined || !Number.isFinite(value)) return storeError(node, "向量计算失败")
                return storeResult(node, { value, count: vector.values.length })
            }
            case NodeType.HUB_CALC: {
                const vector = getBuildInputVector(node.id)
                if (!vector) return storeError(node, "缺少构筑输入")
                const build = vector.contexts[0]
                return storeResult(node, { build, buildVector: vector.dimensions.length > 0 ? vector : undefined })
            }
            case NodeType.CUSTOM_EXPRESSION: {
                // 自定义变量求值：构筑必须从输入端口传入，变量只能来自该构筑的自定义变量组
                const vector = getBuildInputVector(node.id)
                if (!vector) return storeError(node, "缺少构筑输入")
                const context = vector.contexts[0]
                const selected = typeof node.data.selectedVariable === "string" ? node.data.selectedVariable.trim() : ""
                const entry = context.settings.customVariables.find(([name]) => name === selected)
                if (!selected || !entry) {
                    clearNodeEvaluation(node)
                    return storeResult(node, { value: undefined })
                }
                if (context.charBuild.parseCustomFunctionDefinition(entry[0])) {
                    clearNodeEvaluation(node)
                    return storeResult(node, { value: undefined, functionDefinition: true })
                }
                if (vector.dimensions.length > 0) {
                    scheduleVectorEvaluation(node, vector, current => {
                        return current.settings.customVariables.find(([name]) => name === selected)?.[1]
                    })
                    return node.data.result ?? undefined
                }
                const validation = context.charBuild.validateCustomVariable(entry[0], entry[1])
                if (validation) return storeError(node, validation, true)
                scheduleEvaluation(node, context, entry[1])
                return node.data.result ?? undefined
            }
        }

        const vector = getBuildInputVector(node.id)
        if (!vector) return storeError(node, "缺少构筑输入")
        const context = vector.contexts[0]
        const hasVector = vector.dimensions.length > 0

        switch (nodeType) {
            case NodeType.ATTR_CALC:
            case NodeType.WEAPON_ATTR_CALC: {
                if (nodeType === NodeType.WEAPON_ATTR_CALC) {
                    // 同律按钮只在构筑有独立同律武器时显示；未手选槽位时高亮构筑默认武器
                    node.data.hasSkillWeapon = Boolean(context.charBuild.skillWeapon && !context.charBuild.skillWeapon.inherit)
                    node.data.weaponSlotAuto = context.charBuild.selectedSkillType
                }
                // 逐项属性输出：向量构筑输出向量，单个构筑输出数值
                node.data.charBuild = markRaw(context.charBuild)
                node.data.attrOutputVector = hasVector
                // 属性 / 武器属性只依赖面板：走独立面板请求（不跑目标函数 / 伤害），一次取齐该节点的全部面板
                if (hasVector) scheduleVectorPanels(node, vector)
                else schedulePanels(node, context)
                return attributeOutputs(node)
            }
            case NodeType.AST_EXPRESSION_CALC: {
                const expression = typeof node.data.expression === "string" ? node.data.expression.trim() : ""
                if (expression) {
                    const validation = context.charBuild.validateAST(expression)
                    if (validation) return storeError(node, validation, true)
                }
                if (hasVector) scheduleVectorEvaluation(node, vector, expression || undefined)
                else scheduleEvaluation(node, context, expression || undefined)
                // 数值端口沿用原有结果，同时把带标题的向量输出给图表等下游节点
                return { ...(node.data.result ?? {}), vector: createExpressionVectorOutput(node.data) }
            }
            default:
                return storeError(node, "未知节点类型")
        }
    }

    /**
     * 计算单个节点的输出。
     * 核心/求值节点组装构筑上下文后交给 wasm worker 异步求值，
     * 数学节点保持同步；结果写回 node.data 供节点组件渲染。
     * @param nodeId 节点 id
     * @param useCache 是否复用计算结果
     * @returns 节点结果
     */
    function calculateNode(nodeId: string, useCache = true): any {
        if (useCache && calculationCache.has(nodeId)) {
            return calculationCache.get(nodeId)
        }
        const node = nodes.value.find(n => n.id === nodeId)
        if (!node) return null
        const nodeType = node.type ?? ""
        const startedAt = performance.now()
        try {
            // 输入节点：直接返回节点数据
            if (nodeType.includes("input")) {
                calculationCache.set(nodeId, node.data)
                return node.data
            }

            if (nodeType === NodeType.CORE_CALC) {
                // 核心节点只产出构筑，不在核心上执行任何目标函数求值
                const coreStartedAt = performance.now()
                const context = createCoreContext(node)
                recordSyncPhase("构筑组装", performance.now() - coreStartedAt, { nodeId: node.id, nodeType })
                const result = context
                    ? { build: context, buildVector: node.data.buildVector }
                    : { build: null, buildVector: undefined, error: node.data.error }
                calculationCache.set(nodeId, result)
                return result
            }

            // 构筑来源节点：JSON 文本 / 在线构筑
            if (nodeType === NodeType.JSON_BUILD) {
                const portValues = collectInputPortValues(node)
                const portValue = portValues.get("text")
                // 文本输入节点的输出是节点数据对象，这里统一取其中的 value
                const portText = typeof portValue === "string" ? portValue : typeof portValue?.value === "string" ? portValue.value : ""
                const text = portText.trim() ? portText : typeof node.data.text === "string" ? node.data.text : ""
                // 角色必须由角色端口提供；文本为标准 charSettings
                const charPort = portValues.get("char")
                const portCharId = Number(charPort?.charId)
                const { context, error } = createBuildContextFromJSONText(text, {
                    charName: typeof charPort?.charName === "string" ? charPort.charName : undefined,
                    charId: Number.isFinite(portCharId) ? portCharId : undefined,
                })
                node.data.build = context ? markRaw(context) : undefined
                node.data.charBuild = context ? markRaw(context.charBuild) : undefined
                node.data.error = error
                const result = context ? { build: context } : { build: null, error }
                calculationCache.set(nodeId, result)
                return result
            }

            if (nodeType === NodeType.ONLINE_BUILD) {
                const charSettings = typeof node.data.charSettings === "string" ? node.data.charSettings : ""
                const charId = typeof node.data.charId === "number" ? node.data.charId : 0
                if (!charSettings) {
                    node.data.build = undefined
                    node.data.charBuild = undefined
                    calculationCache.set(nodeId, { build: null })
                    return { build: null }
                }
                let rawSettings: unknown
                let error: string | undefined
                try {
                    rawSettings = JSON.parse(charSettings)
                } catch (parseError) {
                    error = `构筑配置解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`
                }
                const parsed = error ? { context: undefined, error } : createBuildContextFromSettings(charId, rawSettings)
                node.data.build = parsed.context ? markRaw(parsed.context) : undefined
                node.data.charBuild = parsed.context ? markRaw(parsed.context.charBuild) : undefined
                node.data.error = parsed.error
                const result = parsed.context ? { build: parsed.context } : { build: null, error: parsed.error }
                calculationCache.set(nodeId, result)
                return result
            }

            // JSON 导出节点：把上游构筑序列化为 JSON 文本
            if (nodeType === NodeType.JSON_EXPORT) {
                const context = getBuildInputVector(node.id)?.contexts[0]
                if (!context) {
                    node.data.build = undefined
                    node.data.exportText = ""
                    node.data.error = "缺少构筑输入"
                    const result = { value: "", text: "", error: node.data.error }
                    calculationCache.set(nodeId, result)
                    return result
                }
                try {
                    const text = serializeBuildContext(context)
                    node.data.build = markRaw(context)
                    node.data.exportText = text
                    node.data.error = undefined
                    const result = { value: text, text }
                    calculationCache.set(nodeId, result)
                    return result
                } catch (error) {
                    node.data.build = undefined
                    node.data.exportText = ""
                    node.data.error = `导出失败: ${error instanceof Error ? error.message : String(error)}`
                    const result = { value: "", text: "", error: node.data.error }
                    calculationCache.set(nodeId, result)
                    return result
                }
            }

            // 图表节点：把上游向量归一化为带标题的图表数据
            if (nodeType === NodeType.CHART) {
                const label = typeof node.data.label === "string" ? node.data.label : "向量"
                const chartVector = normalizeLabeledVector(collectInputPortValues(node).get("vector"), label)
                node.data.chartVector = chartVector
                const result = chartVector ? { vector: chartVector } : null
                calculationCache.set(nodeId, result)
                return result
            }

            // 向量分解节点：按分量展开为逐项数值输出
            if (nodeType === NodeType.VECTOR_DECOMPOSE) {
                const fallbackTitle = typeof node.data.label === "string" ? node.data.label : "向量"
                const decomposed = createVectorDecomposeOutput(collectInputPortValues(node).get("vector"), fallbackTitle)
                const labels = decomposed?.labels ?? []
                const currentLabels = Array.isArray(node.data.vectorLabels) ? node.data.vectorLabels : []
                // 输出端口随向量长度变化；标签随节点持久化，加载图时端口先于求值可用
                if (labels.length !== currentLabels.length || labels.some((label, index) => label !== currentLabels[index])) {
                    node.data.vectorLabels = labels
                }
                node.data.result = decomposed?.outputs ?? null
                node.data.error = undefined
                calculationCache.set(nodeId, node.data.result)
                return node.data.result
            }

            // BUFF 合并节点：按模式合并两路上游，输出结果供核心节点读取
            if (nodeType === NodeType.BUFF_MERGE) {
                const data = resolveBuffSourceNode(node, nodes.value, edges.value).data
                node.data.result = data
                node.data.error = undefined
                calculationCache.set(nodeId, data)
                return data
            }

            // 计算节点：按端口读取输入并生成输出
            if (nodeType.endsWith("calc") || nodeType === NodeType.CUSTOM_EXPRESSION) {
                const result = calculateCalcNode(node, collectInputPortValues(node))
                calculationCache.set(nodeId, result)
                return result
            }

            // 输出节点：直接返回收集的输入数据
            if (nodeType.includes("output")) {
                const inputData = collectInputData(node)
                const outputData = inputData.length === 0 ? undefined : inputData.length === 1 ? inputData[0] : inputData
                node.data.result = outputData
                calculationCache.set(nodeId, outputData)
                return outputData
            }

            return null
        } catch (error) {
            console.error(`计算节点 ${nodeId} 失败:`, error)
            node.data.error = `计算失败: ${(error as Error).message}`
            node.data.result = null
            return null
        } finally {
            recordSyncPhase("节点计算", performance.now() - startedAt, { nodeId: node.id, nodeType })
        }
    }

    /**
     * 检查添加边是否会创建循环
     */
    function wouldCreateCycle(newEdge: EditorEdge, ignoredEdgeIds: string[] = []): boolean {
        // 使用拓扑排序检测循环
        const graph = new Map<string, string[]>()
        const ignored = new Set(ignoredEdgeIds)

        // 构建邻接表
        for (const edge of [...edges.value.filter(item => !ignored.has(item.id)), newEdge]) {
            if (!graph.has(edge.source)) {
                graph.set(edge.source, [])
            }
            graph.get(edge.source)!.push(edge.target)
        }

        // 检测环
        const visiting = new Set<string>()
        const visited = new Set<string>()

        function hasCycle(node: string): boolean {
            if (visiting.has(node)) return true
            if (visited.has(node)) return false

            visiting.add(node)
            const neighbors = graph.get(node) || []
            for (const neighbor of neighbors) {
                if (hasCycle(neighbor)) return true
            }
            visiting.delete(node)
            visited.add(node)
            return false
        }

        for (const node of graph.keys()) {
            if (hasCycle(node)) return true
        }

        return false
    }

    /**
     * 通过节点ID查找其连接的core-calc节点的charBuild实例
     * @param nodeId 要查找的节点ID
     * @returns 找到的charBuild实例，如果没有找到则返回null
     */
    function getConnectedCharBuild(nodeId: string): CharBuild | null {
        // 从给定节点开始，向上遍历所有连接的节点
        const visited = new Set<string>()
        const queue = [nodeId]

        while (queue.length > 0) {
            const currentNodeId = queue.shift()!
            if (visited.has(currentNodeId)) continue
            visited.add(currentNodeId)

            // 查找当前节点
            const currentNode = nodes.value.find(n => n.id === currentNodeId)
            if (!currentNode) continue

            // 如果是核心计算节点，返回其charBuild实例
            if (currentNode.type === NodeType.CORE_CALC && currentNode.data.charBuild) {
                return currentNode.data.charBuild
            }

            // 查找所有指向当前节点的边（即当前节点的输入边）
            const inputEdges = edges.value.filter(edge => edge.target === currentNodeId)
            // 将输入边的源节点添加到队列中，继续向上遍历
            inputEdges.forEach(edge => {
                if (edge.source) {
                    queue.push(edge.source)
                }
            })
        }

        // 没有找到连接的core-calc节点
        return null
    }

    // 计算属性：统计
    const nodeCount = computed(() => nodes.value.length)
    const edgeCount = computed(() => edges.value.length)

    // 空图也保留一个历史基线，保证首次添加节点后可以撤销
    resetHistory("初始状态")

    return {
        // 状态
        nodes,
        edges,
        currentGraphId,
        savedGraphs,
        autoSaveEnabled,
        autoSaveStatus,
        currentGraphName,
        copiedNodes,
        copiedEdges,
        // 操作
        updateNodeData,
        setNodeHidden,
        setNodeLocked,
        addNode,
        removeNode,
        addEdge,
        removeEdge,
        syncVariableVectorEdges,
        clearVariableVectorEdges,
        onConnect,
        isValidConnection,
        clearGraph,
        clearCache,
        calculateNode,
        recalculateAllNodes,
        getBuildContext,
        getInputBuildContext: getBuildInputContext,
        cancelPendingEvaluations,
        copySelectedNodes,
        pasteNodes,
        getConnectedCharBuild,
        undo,
        redo,
        canUndo,
        canRedo,
        undoDescription,
        redoDescription,
        commitHistory,
        beginHistoryBatch,
        endHistoryBatch,
        resetHistory,
        // 数据库操作
        loadAllGraphs,
        saveGraphToDB,
        loadGraphFromDB,
        deleteGraphFromDB,
        loadLastEditedGraph,
        // 自动保存
        startAutoSave,
        stopAutoSave,
        flushAutoSave,
        setAutoSaveEnabled,
        setCurrentGraphName,
        // 导入导出
        exportGraph,
        importGraph,
        loadGraphData,
        exportGraphJson,
        // 计算属性
        nodeCount,
        edgeCount,
    }
})
