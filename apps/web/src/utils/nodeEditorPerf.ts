import { reactive } from "vue"

/** 性能记录关联的节点信息 */
export interface PerfNodeInfo {
    nodeId?: string
    nodeType?: string
}

/** 单次调用的性能记录（节点展开视图用） */
export interface PerfRecord {
    /** 调用来源：同步计算 / worker 请求 */
    scope: "sync" | "worker"
    /** 同步阶段名或 worker 请求类型 */
    phase: string
    duration: number
    engine?: string
    status: "ok" | "error"
}

/** 聚合桶：次数 / 总耗时 / 最大耗时 / 最近一次 */
export interface PerfBucket {
    calls: number
    total: number
    max: number
    last: number
}

/** 单个节点的调用统计 */
export interface NodePerfStats extends PerfBucket {
    nodeId: string
    nodeType?: string
    syncCalls: number
    workerCalls: number
    records: PerfRecord[]
}

/** 单类 worker 请求的统计 */
export interface WorkerPerfStats extends PerfBucket {
    byEngine: Record<string, number>
    errors: number
}

/** 每个节点保留的最近调用记录条数 */
const NODE_RECORD_LIMIT = 12

/**
 * 节点图性能采集：同步阶段、worker 请求与按节点聚合的调用记录。
 * 由 store / calc-worker 写入，性能标签页只读展示。
 */
export const nodeEditorPerf = reactive({
    sync: {} as Record<string, PerfBucket>,
    worker: {} as Record<string, WorkerPerfStats>,
    nodes: {} as Record<string, NodePerfStats>,
    syncCalls: 0,
    syncTotal: 0,
    workerCalls: 0,
    workerTotal: 0,
    workerErrors: 0,
})

function createBucket(): PerfBucket {
    return { calls: 0, total: 0, max: 0, last: 0 }
}

function pushBucket(bucket: PerfBucket, duration: number) {
    bucket.calls += 1
    bucket.total += duration
    bucket.max = Math.max(bucket.max, duration)
    bucket.last = duration
}

/**
 * 把一次调用计入节点统计并保留最近记录。
 * @param record 调用记录
 */
function touchNode(record: PerfRecord & { nodeId: string; nodeType?: string }) {
    const stats = (nodeEditorPerf.nodes[record.nodeId] ??= {
        nodeId: record.nodeId,
        nodeType: record.nodeType,
        ...createBucket(),
        syncCalls: 0,
        workerCalls: 0,
        records: [],
    })
    if (record.nodeType) stats.nodeType = record.nodeType
    pushBucket(stats, record.duration)
    if (record.scope === "sync") stats.syncCalls += 1
    else stats.workerCalls += 1
    stats.records.push({
        scope: record.scope,
        phase: record.phase,
        duration: record.duration,
        engine: record.engine,
        status: record.status,
    })
    if (stats.records.length > NODE_RECORD_LIMIT) stats.records.splice(0, stats.records.length - NODE_RECORD_LIMIT)
}

/**
 * 记录一次同步阶段耗时。
 * @param phase 阶段名（如 节点计算 / 下游刷新）
 * @param duration 耗时（毫秒）
 * @param node 关联节点
 */
export function recordSyncPhase(phase: string, duration: number, node?: PerfNodeInfo) {
    pushBucket((nodeEditorPerf.sync[phase] ??= createBucket()), duration)
    nodeEditorPerf.syncCalls += 1
    nodeEditorPerf.syncTotal += duration
    if (node?.nodeId) {
        touchNode({
            scope: "sync",
            phase,
            duration,
            status: "ok",
            nodeId: node.nodeId,
            nodeType: node.nodeType,
        })
    }
}

/**
 * 记录一次 worker 请求耗时（请求结束或失败时调用）。
 * @param kind 请求类型（evaluate / panels / income …）
 * @param duration 耗时（毫秒）
 * @param info 关联节点、引擎与状态
 */
export function recordWorkerRequest(
    kind: string,
    duration: number,
    info: PerfNodeInfo & { engine?: string; status?: "ok" | "error" } = {}
) {
    const stats = (nodeEditorPerf.worker[kind] ??= { ...createBucket(), byEngine: {}, errors: 0 })
    pushBucket(stats, duration)
    const engine = info.engine ?? "unknown"
    stats.byEngine[engine] = (stats.byEngine[engine] ?? 0) + 1
    const status = info.status ?? "ok"
    if (status === "error") stats.errors += 1
    nodeEditorPerf.workerCalls += 1
    nodeEditorPerf.workerTotal += duration
    if (status === "error") nodeEditorPerf.workerErrors += 1
    if (info.nodeId) {
        touchNode({
            scope: "worker",
            phase: kind,
            duration,
            engine: info.engine,
            status,
            nodeId: info.nodeId,
            nodeType: info.nodeType,
        })
    }
}

/** 清空全部性能数据 */
export function resetNodeEditorPerf() {
    for (const key of Object.keys(nodeEditorPerf.sync)) delete nodeEditorPerf.sync[key]
    for (const key of Object.keys(nodeEditorPerf.worker)) delete nodeEditorPerf.worker[key]
    for (const key of Object.keys(nodeEditorPerf.nodes)) delete nodeEditorPerf.nodes[key]
    nodeEditorPerf.syncCalls = 0
    nodeEditorPerf.syncTotal = 0
    nodeEditorPerf.workerCalls = 0
    nodeEditorPerf.workerTotal = 0
    nodeEditorPerf.workerErrors = 0
}
