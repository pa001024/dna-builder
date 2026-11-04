import { nanoid } from "nanoid"
import { getDefaultLabel, PALETTE_ITEMS, paletteNodeDefaults } from "@/components/nodeEditor/types"
import type { useNodeEditorStore } from "@/store/nodeEditor"
import { NodeType } from "@/store/nodeEditor"
import type {
    AddNodeResult,
    ApiResult,
    ConnectResult,
    GraphApi,
    GraphEdgeView,
    GraphNodeError,
    GraphNodeTypeInfo,
    GraphNodeView,
    GraphState,
} from "@/utils/graph-api.contract"

export interface GraphApiHost {
    store: ReturnType<typeof useNodeEditorStore>
}

let current: GraphApi | null = null
let deadline = 0

export function setGraphApi(api: GraphApi | null): void {
    current = api
}

export function getGraphApi(): GraphApi | null {
    return current
}

export function setGraphDeadline(at: number): void {
    deadline = at
}

const VALID_TYPES = new Set<string>(Object.values(NodeType))

function fail(error: string): ApiResult {
    return { ok: false, error, message: error }
}

function ok(message: string): ApiResult {
    return { ok: true, message }
}

function toNodeView(node: { id: string; type?: string; position: { x: number; y: number }; data: Record<string, any> }): GraphNodeView {
    let data: Record<string, unknown> = {}
    try {
        data = JSON.parse(JSON.stringify(node.data ?? {})) as Record<string, unknown>
    } catch {
        data = {}
    }
    // 内嵌图片可能有数 MB，state() 只报告是否存在，完整数据走 export()
    if (node.type === NodeType.IMAGE && typeof data.imageData === "string") {
        delete data.imageData
        data.hasImageData = true
    }
    return {
        id: node.id,
        type: node.type ?? "",
        label: typeof node.data?.label === "string" ? (node.data.label as string) : (node.type ?? ""),
        x: node.position.x,
        y: node.position.y,
        data,
    }
}

function toEdgeView(edge: {
    id: string
    source: string
    target: string
    sourceHandle?: string | null
    targetHandle?: string | null
}): GraphEdgeView {
    return {
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? null,
        target: edge.target,
        targetHandle: edge.targetHandle ?? null,
    }
}

export function createGraphApi(host: GraphApiHost): GraphApi {
    const logs: string[] = []
    const store = host.store

    function record(text: string): void {
        logs.push(text)
        if (logs.length > 200) {
            logs.shift()
        }
    }

    function checkDeadline(): void {
        if (deadline && Date.now() > deadline) {
            throw new Error("执行超时：请把长任务拆成几段，或缩小循环次数")
        }
    }

    function findNode(id: string) {
        return store.nodes.find(node => node.id === id) ?? null
    }

    const api: GraphApi = {
        types: async (): Promise<GraphNodeTypeInfo[]> => {
            return PALETTE_ITEMS.map(item => ({
                type: item.type,
                label: item.label,
                category: item.category,
                ...(item.description ? { description: item.description } : {}),
            }))
        },

        state: async (): Promise<GraphState> => {
            return {
                name: store.currentGraphName,
                nodes: store.nodes.map(toNodeView),
                edges: store.edges.map(toEdgeView),
                nodeCount: store.nodes.length,
                edgeCount: store.edges.length,
            }
        },

        addNode: async (type, options = {}): Promise<AddNodeResult> => {
            checkDeadline()
            if (!VALID_TYPES.has(type)) {
                const hint = PALETTE_ITEMS.filter(item => item.label.includes(type) || item.type.includes(type))
                    .slice(0, 5)
                    .map(item => `${item.label}(${item.type})`)
                    .join("、")
                return { ...fail(`未知节点类型「${type}」${hint ? `，相近的有：${hint}` : "，请先调 types() 查全表"}`) }
            }
            const count = store.nodes.length
            const x = typeof options.x === "number" ? options.x : 120 + (count % 8) * 60
            const y = typeof options.y === "number" ? options.y : 120 + Math.floor(count / 8) * 60
            const id = `n${nanoid(8)}`
            const data = options.data && typeof options.data === "object" ? options.data : {}
            const defaults = paletteNodeDefaults(type, data)
            store.addNode({
                id,
                type,
                position: { x, y },
                data: { type, label: getDefaultLabel(type as NodeType), ...defaults, ...data },
            })
            record(`添加节点 ${type} (${id})`)
            return { ...ok(`已添加节点 ${type}，id=${id}`), id }
        },

        updateNode: async (id, data): Promise<ApiResult> => {
            checkDeadline()
            const node = findNode(id)
            if (!node) {
                return fail(`找不到节点 ${id}，请先调 state() 确认 id`)
            }
            if (!data || typeof data !== "object") {
                return fail("data 必须是非空对象")
            }
            store.updateNodeData(id, data as Record<string, any>)
            record(`更新节点 ${id}`)
            return ok(`节点 ${id} 已更新`)
        },

        removeNode: async (id): Promise<ApiResult> => {
            checkDeadline()
            if (!findNode(id)) {
                return fail(`找不到节点 ${id}，请先调 state() 确认 id`)
            }
            store.removeNode(id)
            record(`删除节点 ${id}`)
            return ok(`节点 ${id} 已删除（相连的边一并删除）`)
        },

        connect: async (source, target, sourceHandle, targetHandle): Promise<ConnectResult> => {
            checkDeadline()
            const sourceNode = findNode(source)
            const targetNode = findNode(target)
            if (!sourceNode) {
                return { ...fail(`找不到输出节点 ${source}`) }
            }
            if (!targetNode) {
                return { ...fail(`找不到输入节点 ${target}`) }
            }
            const edgeId = `e${nanoid(8)}`
            const added = store.addEdge({
                id: edgeId,
                source,
                target,
                sourceHandle: sourceHandle ?? null,
                targetHandle: targetHandle ?? null,
            })
            if (!added) {
                return {
                    ...fail(
                        `连线失败：端口类型不匹配、会形成环路，或目标端口已被占用（单连接端口会被替换）。请用 state() 核对两端节点的类型与已有连线`
                    ),
                }
            }
            record(`连线 ${source} → ${target} (${edgeId})`)
            return { ...ok(`已连线 ${source} → ${target}`), edgeId }
        },

        disconnect: async (edgeId): Promise<ApiResult> => {
            checkDeadline()
            if (!store.edges.some(edge => edge.id === edgeId)) {
                return fail(`找不到边 ${edgeId}，请先调 state() 确认 id`)
            }
            store.removeEdge(edgeId)
            record(`删除边 ${edgeId}`)
            return ok(`边 ${edgeId} 已删除`)
        },

        clear: async (): Promise<ApiResult> => {
            checkDeadline()
            store.clearGraph()
            record("清空图")
            return ok("已清空整张图（可用撤销恢复）")
        },

        evaluate: async (): Promise<{ ok: boolean; evaluated: number; errors: GraphNodeError[] }> => {
            checkDeadline()
            store.recalculateAllNodes()
            const errors: GraphNodeError[] = []
            for (const node of store.nodes) {
                const error = node.data?.error
                if (typeof error === "string" && error) {
                    errors.push({ id: node.id, type: node.type ?? "", label: toNodeView(node).label, error })
                }
            }
            const evaluated = store.nodes.length
            record(`触发求值：${evaluated} 节点，${errors.length} 报错`)
            return { ok: errors.length === 0, evaluated, errors }
        },

        import: async (json): Promise<ApiResult> => {
            checkDeadline()
            let parsed: unknown
            try {
                parsed = JSON.parse(json)
            } catch {
                return fail("不是合法 JSON")
            }
            const graph = parsed as { nodes?: unknown; edges?: unknown; name?: unknown }
            if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
                return fail("图 JSON 需要 { nodes[], edges[] } 结构（可用 export() 的输出对照）")
            }
            store.loadGraphData(graph as { nodes?: unknown[]; edges?: unknown[]; name?: string })
            record(`载入图：${graph.nodes.length} 节点 ${graph.edges.length} 边`)
            return ok(`已载入图：${graph.nodes.length} 节点、${graph.edges.length} 边`)
        },

        export: async () => {
            const json = store.exportGraphJson()
            return { name: store.currentGraphName, json, nodeCount: store.nodes.length, edgeCount: store.edges.length }
        },

        save: async (name): Promise<ApiResult & { graphId?: number }> => {
            checkDeadline()
            const id = await store.saveGraphToDB(name ?? store.currentGraphName)
            record(`保存图${name ? `（${name}）` : ""}`)
            return { ...ok(`图已保存到本地${name ? `（${name}）` : ""}`), graphId: id }
        },

        log: async (): Promise<string[]> => {
            return [...logs]
        },
    }

    return api
}
