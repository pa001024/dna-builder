import * as dialog from "@tauri-apps/plugin-dialog"
import type { Connection, Edge, Node } from "@vue-flow/core"
import { nanoid } from "nanoid"
import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { writeTextFile } from "@/api/app"
import { env } from "@/env"
import { CharBuild } from "../data/CharBuild"
import { LeveledBuff, LeveledChar, LeveledMod, LeveledWeapon } from "../data/leveled"
import type { NodeEditorGraph, UNodeEditorGraph } from "./db"
import { db } from "./db"
import { useUIStore } from "./ui"

/**
 * 节点类型枚举
 */
export enum NodeType {
    // 输入节点（按类别分组）
    CHAR_INPUT = "char-input", // 角色输入
    MELEE_WEAPON_INPUT = "melee-weapon-input", // 近战武器输入
    RANGED_WEAPON_INPUT = "ranged-weapon-input", // 远程武器输入
    WEAPON_INPUT = "weapon-input", // 旧的武器输入（保留兼容）
    MOD_INPUT = "mod-input", // MOD输入
    BUFF_INPUT = "buff-input", // Buff输入
    ENEMY_INPUT = "enemy-input", // 敌人设置输入

    // 核心计算节点
    CORE_CALC = "core-calc", // 核心CharBuild计算节点

    // 计算节点（显式计算方法）
    ATTR_CALC = "attr-calc", // calculateAttributes()
    WEAPON_ATTR_CALC = "weapon-attr-calc", // calculateWeaponAttributes()
    SKILL_DMG_CALC = "skill-dmg-calc", // calculateSkillDamage()
    WEAPON_DMG_CALC = "weapon-dmg-calc", // calculateWeaponDamage()
    FULL_CALC = "full-calc", // calculate() - 快捷节点

    // 数学计算节点
    ADD_CALC = "add-calc", // 加法计算
    MULTIPLY_CALC = "multiply-calc", // 乘法计算
    EXPRESSION_CALC = "expression-calc", // 通用表达式计算
    HUB_CALC = "hub-calc", // 集线节点

    // 输出节点
    ATTR_OUTPUT = "attr-output", // 显示 CharAttr
    WEAPON_OUTPUT = "weapon-output", // 显示 WeaponAttr
    DAMAGE_OUTPUT = "damage-output", // 显示 DamageResult

    // AST节点
    AST_EXPRESSION_CALC = "ast-expression-calc", // 自定义目标函数
}

/**
 * 节点编辑器状态
 */
/**
 * 历史记录项类型
 */
interface HistoryItem {
    nodes: Node[]
    edges: Edge[]
    description: string
}

export const useNodeEditorStore = defineStore("nodeEditor", () => {
    // 节点和边
    const nodes = ref<Node[]>([])
    const edges = ref<Edge[]>([])

    // 计算缓存（防止重复计算）
    const calculationCache = new Map<string, any>()

    // 当前编辑的图ID
    const currentGraphId = ref<number | null>(null)

    // 所有保存的图
    const savedGraphs = ref<NodeEditorGraph[]>([])

    // 自动保存配置
    const autoSaveEnabled = ref<boolean>(true)
    const autoSaveInterval = ref<number>(30000) // 30秒自动保存
    let autoSaveTimer: number | null = null

    // 图名称
    const currentGraphName = ref<string>("未命名图")

    // 复制粘贴状态
    const copiedNodes = ref<Node[]>([])
    const copiedEdges = ref<Edge[]>([])

    // 历史记录状态
    const history = ref<HistoryItem[]>([])
    const historyIndex = ref<number>(-1)
    const historyLimit = ref<number>(50) // 历史记录最大数量

    /**
     * 保存当前状态到历史记录
     */
    function saveToHistory(description: string) {
        // 删除当前索引之后的历史记录（如果有）
        if (historyIndex.value < history.value.length - 1) {
            history.value = history.value.slice(0, historyIndex.value + 1)
        }

        // 创建历史记录项
        const historyItem: HistoryItem = {
            nodes: JSON.parse(JSON.stringify(nodes.value)),
            edges: JSON.parse(JSON.stringify(edges.value)),
            description,
        }

        // 添加到历史记录
        history.value.push(historyItem)
        historyIndex.value = history.value.length - 1

        // 限制历史记录数量
        if (history.value.length > historyLimit.value) {
            history.value.shift()
            historyIndex.value--
        }
    }

    /**
     * 撤销操作
     */
    function undo() {
        if (historyIndex.value > 0) {
            historyIndex.value--
            const historyItem = history.value[historyIndex.value]
            nodes.value = JSON.parse(JSON.stringify(historyItem.nodes))
            edges.value = JSON.parse(JSON.stringify(historyItem.edges))
            clearCache()
            recalculateAllNodes()
        }
    }

    /**
     * 重做操作
     */
    function redo() {
        if (historyIndex.value < history.value.length - 1) {
            historyIndex.value++
            const historyItem = history.value[historyIndex.value]
            nodes.value = JSON.parse(JSON.stringify(historyItem.nodes))
            edges.value = JSON.parse(JSON.stringify(historyItem.edges))
            clearCache()
            recalculateAllNodes()
        }
    }

    /**
     * 更新节点数据并触发重新计算
     */
    function updateNodeData(nodeId: string, data: Record<string, any>) {
        const node = nodes.value.find(n => n.id === nodeId)
        if (node) {
            // 保存历史记录
            saveToHistory("更新节点数据")

            // 保存当前的selectedSkill值
            const oldSelectedSkill = node.data.selectedSkill

            // 更新节点数据
            node.data = { ...node.data, ...data }

            // 如果是CoreCalc节点且selectedSkill发生变化，更新charBuild的baseName
            if (node.type === NodeType.CORE_CALC && data.selectedSkill !== oldSelectedSkill) {
                if (node.data.charBuild) {
                    // 更新charBuild实例的baseName
                    node.data.charBuild.baseName = data.selectedSkill
                }
            }

            // 清除缓存并触发相关节点的重新计算
            clearCache()
            triggerRecalculation(nodeId)
        }
    }

    /**
     * 添加节点
     */
    function addNode(node: Node) {
        // 保存历史记录
        saveToHistory(`添加节点: ${node.type}`)
        nodes.value.push(node)
    }

    /**
     * 删除节点
     */
    function removeNode(nodeId: string) {
        // 保存历史记录
        saveToHistory("删除节点")
        nodes.value = nodes.value.filter(n => n.id !== nodeId)
        edges.value = edges.value.filter(e => e.source !== nodeId && e.target !== nodeId)
        clearCache()
    }

    /**
     * 添加边
     */
    function addEdge(edge: Edge) {
        // 检查是否会产生循环依赖
        if (wouldCreateCycle(edge)) {
            console.warn("Cannot add edge: would create cycle")
            return false
        }
        // 保存历史记录
        saveToHistory("添加连接")
        edges.value.push(edge)
        // 触发目标节点的重新计算
        triggerRecalculation(edge.target)
        calculateNode(edge.target, false)
        return true
    }

    /**
     * 删除边
     */
    function removeEdge(edgeId: string) {
        // 找到要删除的边，以便获取相关节点信息
        const edge = edges.value.find(e => e.id === edgeId)
        if (edge) {
            // 保存历史记录
            saveToHistory("删除连接")
            // 删除边
            edges.value = edges.value.filter(e => e.id !== edgeId)
            // 触发相关节点的重新计算
            triggerRecalculation(edge.target)
            calculateNode(edge.target, false)
        }
    }

    /**
     * 复制选中的节点和相关边
     */
    function copySelectedNodes(selectedNodes: Node[]) {
        if (selectedNodes.length === 0) return

        // 保存选中的节点
        copiedNodes.value = JSON.parse(JSON.stringify(selectedNodes))

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

        // 保存历史记录
        saveToHistory("粘贴节点")

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
        edges.value.push(...filteredEdges)

        // 触发重新计算
        newNodes.forEach(node => {
            calculateNode(node.id)
        })

        return newNodes
    }

    /**
     * 连接节点（@vue-flow onConnect 回调）
     */
    function onConnect(connection: Connection) {
        const edge: Edge = {
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
    function serializeNodes(nodesToSerialize: Node[]): Node[] {
        return nodesToSerialize.map(node => {
            // 只保留必要的节点属性
            const serializedNode: Node = {
                id: node.id,
                type: node.type,
                position: node.position,
                data: {
                    ...node.data,
                    // 过滤掉不需要持久化的数据
                    charBuild: undefined, // 计算结果，不需要保存
                    result: undefined, // 计算结果，不需要保存
                    error: undefined, // 错误信息，不需要保存
                    missingInputs: undefined, // 临时状态，不需要保存
                    inputData: undefined, // 计算中间数据，不需要保存
                },
            }
            return serializedNode
        })
    }

    /**
     * 序列化边，只返回必要的数据
     */
    function serializeEdges(edgesToSerialize: Edge[]): Edge[] {
        return edgesToSerialize.map(edge => {
            // 只保留必要的边属性
            const serializedEdge: Edge = {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle,
                targetHandle: edge.targetHandle,
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
     * 重新计算所有计算节点
     */
    function recalculateAllNodes() {
        // 清除缓存
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
            nodes.value = graph.nodes
            edges.value = graph.edges
            currentGraphId.value = graph.id

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
    function clearGraph() {
        nodes.value = []
        edges.value = []
        clearCache()
    }

    /**
     * 清除计算缓存
     */
    function clearCache() {
        calculationCache.clear()
    }

    /**
     * 触发相关节点的重新计算
     */
    function triggerRecalculation(nodeId: string) {
        // 找到所有受影响的下游节点
        const affectedNodes = new Set<string>()
        const visited = new Set<string>()
        const queue = [nodeId]

        while (queue.length > 0) {
            const current = queue.shift()!
            if (visited.has(current)) continue
            visited.add(current)

            // 找到所有以此节点为源头的边
            const outgoingEdges = edges.value.filter(e => e.source === current)
            for (const edge of outgoingEdges) {
                const targetId = edge.target
                affectedNodes.add(targetId)
                queue.push(targetId)
            }
        }

        // 重新计算受影响的节点
        affectedNodes.forEach(nodeId => {
            calculateNode(nodeId, false)
        })
    }

    /**
     * 启动自动保存
     */
    function startAutoSave() {
        if (autoSaveTimer) {
            window.clearInterval(autoSaveTimer)
        }

        if (autoSaveEnabled.value) {
            autoSaveTimer = window.setInterval(() => {
                if (currentGraphId.value) {
                    saveGraphToDB(currentGraphName.value, true)
                }
            }, autoSaveInterval.value)
        }
    }

    /**
     * 停止自动保存
     */
    function stopAutoSave() {
        if (autoSaveTimer) {
            window.clearInterval(autoSaveTimer)
            autoSaveTimer = null
        }
    }

    /**
     * 设置自动保存状态
     */
    function setAutoSaveEnabled(enabled: boolean) {
        autoSaveEnabled.value = enabled
        if (enabled) {
            startAutoSave()
        } else {
            stopAutoSave()
        }
    }

    /**
     * 设置自动保存间隔
     */
    function setAutoSaveInterval(interval: number) {
        autoSaveInterval.value = interval
        if (autoSaveEnabled.value) {
            startAutoSave()
        }
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
                    nodes.value = graphData.nodes || []
                    edges.value = graphData.edges || []
                    currentGraphName.value = graphData.name || "导入的图"
                    currentGraphId.value = null // 新图，未保存

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

    /**
     * 计算单个节点的输出
     * 基于节点连接关系，从输入节点获取数据，通过计算节点处理，最后输出结果
     */
    function calculateNode(nodeId: string, useCache = true): any {
        if (useCache && calculationCache.has(nodeId)) {
            return calculationCache.get(nodeId)
        }
        try {
            const node = nodes.value.find(n => n.id === nodeId)
            if (!node) return null

            // 获取节点类型
            const nodeType = node.type as string

            // 输入节点：直接返回节点数据
            if (nodeType.includes("input")) {
                calculationCache.set(nodeId, node.data)
                return node.data
            }

            // 获取所有输入边
            const inputEdges = edges.value.filter(edge => edge.target === nodeId)

            // 收集所有输入数据
            const inputData: any[] = []
            for (const edge of inputEdges) {
                try {
                    const sourceNodeId = edge.source
                    if (sourceNodeId) {
                        const input = calculateNode(sourceNodeId)

                        if (input.inputs) {
                            inputData.push(...input.inputs)
                        } else if (input) {
                            inputData.push(
                                edge.sourceHandle && edge.sourceHandle in input
                                    ? input[edge.sourceHandle]
                                    : { ...input, type: nodes.value.find(n => n.id === sourceNodeId)?.type }
                            )
                        }
                    }
                } catch (error) {
                    console.error(`计算输入节点 ${edge.source} 失败:`, error)
                }
            }

            // 计算节点：处理输入数据，生成输出
            if (nodeType.endsWith("calc")) {
                // 特殊处理核心计算节点
                if (nodeType === NodeType.CORE_CALC) {
                    // 分类收集输入数据
                    const charInputs: any[] = []
                    const meleeWeaponInputs: any[] = []
                    const rangedWeaponInputs: any[] = []
                    const modInputs: any[] = []
                    const buffInputs: any[] = []
                    const enemyInputs: any[] = []

                    // 按节点类型分类数据
                    for (const input of inputData) {
                        const type = input.type
                        switch (type) {
                            case NodeType.CHAR_INPUT:
                                charInputs.push(input)
                                break
                            case NodeType.MELEE_WEAPON_INPUT:
                                // 近战武器输入节点
                                meleeWeaponInputs.push({
                                    ...input,
                                    meleeWeapon: input.weapon,
                                    meleeRefine: input.refine,
                                    meleeLevel: input.level,
                                })
                                break
                            case NodeType.RANGED_WEAPON_INPUT:
                                // 远程武器输入节点
                                rangedWeaponInputs.push({
                                    ...input,
                                    rangedWeapon: input.weapon,
                                    rangedRefine: input.refine,
                                    rangedLevel: input.level,
                                })
                                break
                            case NodeType.MOD_INPUT:
                                modInputs.push(input)
                                break
                            case NodeType.BUFF_INPUT:
                                buffInputs.push(input)
                                break
                            case NodeType.ENEMY_INPUT:
                                enemyInputs.push(input)
                                break
                        }
                    }

                    // 检查是否有多个角色输入
                    if (charInputs.length > 1) {
                        return { error: "不允许同时输入多个角色" }
                    }

                    // 检查是否有多个近战武器输入
                    if (meleeWeaponInputs.length > 1) {
                        return { error: "不允许同时输入多个近战武器" }
                    }

                    // 检查是否有多个远程武器输入
                    if (rangedWeaponInputs.length > 1) {
                        return { error: "不允许同时输入多个远程武器" }
                    }

                    // 检查是否有多个敌人输入
                    if (enemyInputs.length > 1) {
                        return { error: "不允许同时输入多个敌人" }
                    }

                    // 合并角色数据（最多一个）
                    const charData = charInputs.length > 0 ? charInputs[0] : {}

                    // 合并武器数据（最多各一个）
                    const meleeWeaponData = meleeWeaponInputs.length > 0 ? meleeWeaponInputs[0] : {}
                    const rangedWeaponData = rangedWeaponInputs.length > 0 ? rangedWeaponInputs[0] : {}
                    const weaponData = { ...meleeWeaponData, ...rangedWeaponData }

                    // 合并敌人数据（最多一个）
                    const enemyData = enemyInputs.length > 0 ? enemyInputs[0] : {}

                    // 合并MOD数据（数组合并）
                    const modData: any = { mods: [], modLevels: [] }
                    modInputs.forEach(input => {
                        if (Array.isArray(input.mods)) {
                            modData.mods.push(...input.mods)
                        } else if (input.mods) {
                            modData.mods.push(input.mods)
                        }

                        if (Array.isArray(input.modLevels)) {
                            modData.modLevels.push(...input.modLevels)
                        } else if (input.modLevels) {
                            modData.modLevels.push(input.modLevels)
                        }
                    })

                    // 合并BUFF数据（数组合并）
                    const buffData: any = { buffs: [], buffLevels: [] }
                    buffInputs.forEach(input => {
                        if (Array.isArray(input.buffs)) {
                            buffData.buffs.push(...input.buffs)
                        } else if (input.buffs) {
                            buffData.buffs.push(input.buffs)
                        }

                        if (Array.isArray(input.buffLevels)) {
                            buffData.buffLevels.push(...input.buffLevels)
                        } else if (input.buffLevels) {
                            buffData.buffLevels.push(input.buffLevels)
                        }
                    })

                    // 输入校验：检查是否缺少必要输入
                    const missingInputs: string[] = []

                    // 检查角色数据
                    if (!charData.charName) {
                        missingInputs.push("角色")
                    }

                    // 检查近战武器数据
                    if (!weaponData.meleeWeapon) {
                        missingInputs.push("近战武器")
                    }

                    // 检查远程武器数据
                    if (!weaponData.rangedWeapon) {
                        missingInputs.push("远程武器")
                    }

                    // 更新核心节点数据
                    // node.data.inputData = { charData, weaponData, modData, buffData, enemyData }

                    // 如果缺少必要输入，返回错误信息
                    if (missingInputs.length > 0) {
                        node.data.missingInputs = missingInputs
                        node.data.error = `缺少必要输入: ${missingInputs.join(", ")}`
                        node.data.charBuild = undefined
                        return { charBuild: null, missingInputs, error: node.data.error }
                    }

                    // 创建CharBuild实例
                    let charBuild: CharBuild
                    try {
                        // 使用LeveledChar和LeveledWeapon创建正确的实例
                        const charId = charData.charName
                        const charLevel = charData.charLevel || 80

                        // 创建角色实例
                        const char = new LeveledChar(charId, charLevel)

                        // 创建武器实例（近战和远程）
                        const meleeWeaponId = weaponData.meleeWeapon
                        const meleeRefine = weaponData.meleeRefine || weaponData.refineLevel || 1
                        const meleeLevel = weaponData.meleeLevel || weaponData.weaponLevel || charLevel

                        const rangedWeaponId = weaponData.rangedWeapon
                        const rangedRefine = weaponData.rangedRefine || weaponData.refineLevel || 1
                        const rangedLevel = weaponData.rangedLevel || weaponData.weaponLevel || charLevel

                        if (!meleeWeaponId) {
                            throw new Error("缺少近战武器信息")
                        }

                        if (!rangedWeaponId) {
                            throw new Error("缺少远程武器信息")
                        }

                        const meleeWeapon = new LeveledWeapon(meleeWeaponId, meleeRefine, meleeLevel)

                        const rangedWeapon = new LeveledWeapon(rangedWeaponId, rangedRefine, rangedLevel)

                        // 创建CharBuildOptions
                        // 使用节点中保存的selectedSkill作为baseName，如果没有则使用默认值
                        const options = {
                            char,
                            hpPercent: charData.hpPercent || 1,
                            resonanceGain: charData.resonanceGain || 0,
                            skillLevel: charData.skillLevel || 12,
                            melee: meleeWeapon,
                            ranged: rangedWeapon,
                            baseName: node.data.selectedSkill || char.技能[0].名称, // 使用保存的技能或默认第一个技能
                            // 这里可以根据需要添加更多选项，如MOD、BUFF、敌人等
                        }

                        charBuild = new CharBuild(options)

                        // 添加MOD到CharBuild实例
                        if (modData.mods && Array.isArray(modData.mods)) {
                            // 获取MOD等级数据
                            const modLevels = modData.modLevels || []

                            // 收集所有非空MOD
                            const mods: LeveledMod[] = []
                            modData.mods.forEach((modId: number | null, index: number) => {
                                if (modId) {
                                    const mod = new LeveledMod(modId, modLevels[index])
                                    mods.push(mod)
                                }
                            })

                            charBuild.mods = mods
                        }

                        if (buffData.buffs && Array.isArray(buffData.buffs)) {
                            charBuild.buffs = buffData.buffs
                                .map((id: string, index: number) => (id ? new LeveledBuff(id, buffData.buffLevels[index]) : null))
                                .filter((buff: LeveledBuff | null) => buff !== null) as LeveledBuff[]
                            console.log(charBuild.buffs, buffData)
                        }

                        if ("enemyId" in enemyData) {
                            charBuild.enemyId = enemyData.enemyId
                            charBuild.enemyLevel = enemyData.enemyLevel || 80
                            charBuild.enemyResistance = enemyData.enemyResistance || 0
                        }
                    } catch (error) {
                        console.error("创建CharBuild实例失败:", error)
                        node.data.error = (error as Error).message
                        node.data.missingInputs = undefined
                        node.data.charBuild = undefined
                        return { charBuild: null, error: node.data.error }
                    }

                    // 更新核心节点数据
                    node.data.charBuild = charBuild
                    node.data.error = undefined
                    node.data.missingInputs = undefined
                    calculationCache.set(nodeId, { charBuild })

                    // 返回包含charBuild实例的数据
                    return { charBuild }
                }

                // 其他计算节点
                const result = calculateWithInputData(node, inputData)
                // 将计算结果存储在节点数据中，这样节点组件就能访问到
                if ((result || result === 0) && !result.error) {
                    node.data.result = result
                } else if (result.error) {
                    node.data.error = result.error
                }
                calculationCache.set(nodeId, result)
                return result
            }

            // 输出节点：直接返回收集的输入数据
            if (nodeType.includes("output")) {
                const outputData = inputData.length === 1 ? inputData[0] : inputData
                calculationCache.set(nodeId, outputData)
                return outputData
            }

            return null
        } catch (error) {
            console.error(`计算节点 ${nodeId} 失败:`, error)
            // 确保节点状态不会导致组件崩溃
            const node = nodes.value.find(n => n.id === nodeId)
            if (node) {
                node.data.error = `计算失败: ${(error as Error).message}`
                node.data.charBuild = undefined
                node.data.result = null
            }
            return null
        }
    }

    /**
     * 从输入数据中提取数值
     * @param inputData 输入数据数组
     * @returns 提取的数值数组
     */
    function extractValuesFromInputData(inputData: any[]): number[] {
        return inputData
            .map(data => {
                // 从命名handle中提取数据
                if (typeof data === "number") {
                    return data
                }
                // 从result.value中提取数据
                if (data?.value !== undefined && data?.value !== null) {
                    return data.value
                }
                // 从DamageResult中提取期望伤害
                if (data?.expectedDamage !== undefined) {
                    return data.expectedDamage
                }
                return 0
            })
            .filter(value => typeof value === "number")
    }

    /**
     * 使用输入数据执行计算
     */
    function calculateWithInputData(node: Node, inputData: any[]): any {
        try {
            // 首先获取节点类型
            const nodeType = node.type

            // 处理数学计算节点（不需要CharBuild实例）
            switch (nodeType) {
                case NodeType.ADD_CALC: {
                    const values = extractValuesFromInputData(inputData)
                    const sum = values.reduce((acc, val) => acc + val, 0)
                    const result = { value: sum }
                    node.data.result = result
                    node.data.error = undefined
                    return result
                }
                case NodeType.MULTIPLY_CALC: {
                    const values = extractValuesFromInputData(inputData)
                    const product = values.reduce((acc, val) => acc * val, 1)
                    const result = { value: product }
                    node.data.result = result
                    node.data.error = undefined
                    return result
                }
                case NodeType.EXPRESSION_CALC: {
                    try {
                        const values = extractValuesFromInputData(inputData)
                        const expression = node.data.expression || "a + b"

                        // 创建变量映射（a, b, c, d, e）
                        const variables: Record<string, number> = {}
                        values.forEach((val, index) => {
                            variables[String.fromCharCode(97 + index)] = val
                        })

                        // 使用Function构造器安全地计算表达式
                        const func = new Function(...Object.keys(variables), `return ${expression}`)
                        const result = { value: func(...Object.values(variables)) }

                        node.data.result = result
                        node.data.error = undefined
                        return result
                    } catch (error) {
                        console.error("表达式计算失败:", error)
                        const errorResult = { error: `表达式计算失败: ${(error as Error).message}`, value: 0 }
                        node.data.result = errorResult
                        node.data.error = errorResult.error
                        return errorResult
                    }
                }
                case NodeType.HUB_CALC: {
                    // 集线节点：将所有输入原样传递给输出
                    // 合并所有输入数据
                    const hubResult = {
                        inputs: inputData,
                    }
                    node.data.result = hubResult
                    node.data.error = undefined
                    return hubResult
                }
            }

            // 处理需要CharBuild实例的节点
            // 从输入数据中查找核心计算节点提供的CharBuild实例
            const charBuild = inputData.find(data => data.charBuild)?.charBuild as CharBuild

            if (charBuild) {
                let result: any = null
                try {
                    switch (nodeType) {
                        case NodeType.ATTR_CALC:
                            result = charBuild.calculateAttributes()
                            break
                        case NodeType.WEAPON_ATTR_CALC:
                            result = charBuild.calculateWeaponAttributes()
                            break
                        case NodeType.SKILL_DMG_CALC: {
                            const skillAttrs = charBuild.calculateAttributes()
                            result = charBuild.calculateSkillDamage(skillAttrs)
                            break
                        }
                        case NodeType.WEAPON_DMG_CALC: {
                            const weaponAttrs = charBuild.calculateWeaponAttributes()
                            const weapon = charBuild.meleeWeapon
                            result = charBuild.calculateWeaponDamage(weaponAttrs, weapon)
                            break
                        }
                        case NodeType.FULL_CALC:
                            // 完整计算：执行所有计算
                            try {
                                result = { value: charBuild.calculate() }
                            } catch (error) {
                                console.error("完整计算失败:", error)
                                result = { error: "完整计算失败" }
                            }
                            break
                        case NodeType.AST_EXPRESSION_CALC:
                            try {
                                result = { value: charBuild.calculateTargetFunction(undefined, node.data.expression) }
                            } catch (error) {
                                console.error("AST表达式计算失败:", error)
                                result = { error: "AST表达式计算失败" }
                            }
                            break
                        default:
                            // 默认返回空结果，避免显示"等待计算"
                            result = { error: "未知节点类型", value: 0 }
                            break
                    }
                } catch (error) {
                    console.error(`执行计算类型 ${nodeType} 失败:`, error)
                    const errorResult = { error: `计算失败: ${(error as Error).message}`, value: 0 }
                    node.data.result = errorResult
                    node.data.error = errorResult.error
                    return errorResult
                }

                // 更新节点的结果，确保result始终有值
                node.data.result = result
                node.data.error = undefined
                return result
            }

            // 如果没有CharBuild实例且不是数学计算节点，返回默认结果
            const defaultResult = 0
            node.data.result = defaultResult
            node.data.error = undefined
            return defaultResult
        } catch (error) {
            console.error(`计算节点 ${node.id} 输入数据失败:`, error)
            // 确保节点状态不会导致组件崩溃
            const errorResult = { error: `输入数据计算失败: ${(error as Error).message}`, value: 0 }
            node.data.result = errorResult
            node.data.error = errorResult.error
            return errorResult
        }
    }

    /**
     * 检查添加边是否会创建循环
     */
    function wouldCreateCycle(newEdge: Edge): boolean {
        // 使用拓扑排序检测循环
        const graph = new Map<string, string[]>()

        // 构建邻接表
        for (const edge of [...edges.value, newEdge]) {
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

    return {
        // 状态
        nodes,
        edges,
        currentGraphId,
        savedGraphs,
        autoSaveEnabled,
        autoSaveInterval,
        currentGraphName,
        copiedNodes,
        copiedEdges,
        // 操作
        updateNodeData,
        addNode,
        removeNode,
        addEdge,
        removeEdge,
        onConnect,
        clearGraph,
        clearCache,
        calculateNode,
        copySelectedNodes,
        pasteNodes,
        getConnectedCharBuild,
        undo,
        redo,
        // 数据库操作
        loadAllGraphs,
        saveGraphToDB,
        loadGraphFromDB,
        deleteGraphFromDB,
        loadLastEditedGraph,
        // 自动保存
        startAutoSave,
        stopAutoSave,
        setAutoSaveEnabled,
        setAutoSaveInterval,
        setCurrentGraphName,
        // 导入导出
        exportGraph,
        importGraph,
        // 计算属性
        nodeCount,
        edgeCount,
    }
})
