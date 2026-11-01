import { beforeEach, describe, expect, it } from "vitest"
import { nodeEditorPerf, recordSyncPhase, recordWorkerRequest, resetNodeEditorPerf } from "@/utils/nodeEditorPerf"

describe("nodeEditorPerf", () => {
    beforeEach(() => resetNodeEditorPerf())

    it("同步阶段按阶段与节点聚合", () => {
        recordSyncPhase("节点计算", 2, { nodeId: "a", nodeType: "attr-calc" })
        recordSyncPhase("节点计算", 4, { nodeId: "a", nodeType: "attr-calc" })
        recordSyncPhase("下游刷新", 1, { nodeId: "a", nodeType: "attr-calc" })

        expect(nodeEditorPerf.syncCalls).toBe(3)
        expect(nodeEditorPerf.syncTotal).toBeCloseTo(7)
        expect(nodeEditorPerf.sync.节点计算).toMatchObject({ calls: 2, total: 6, max: 4, last: 4 })
        const node = nodeEditorPerf.nodes.a
        expect(node.calls).toBe(3)
        expect(node.syncCalls).toBe(3)
        expect(node.workerCalls).toBe(0)
        expect(node.records.map(record => record.phase)).toEqual(["节点计算", "节点计算", "下游刷新"])
    })

    it("worker 请求按类型与引擎聚合", () => {
        recordWorkerRequest("panels", 8, { nodeId: "b", nodeType: "weapon-attr-calc", engine: "wasm" })
        recordWorkerRequest("panels", 12, { nodeId: "b", nodeType: "weapon-attr-calc", engine: "ts" })
        recordWorkerRequest("panels", 3, { engine: "wasm", status: "error" })

        expect(nodeEditorPerf.workerCalls).toBe(3)
        expect(nodeEditorPerf.workerErrors).toBe(1)
        expect(nodeEditorPerf.worker.panels).toMatchObject({ calls: 3, total: 23, max: 12, last: 3, errors: 1 })
        expect(nodeEditorPerf.worker.panels.byEngine).toEqual({ wasm: 2, ts: 1 })
        expect(nodeEditorPerf.nodes.b.workerCalls).toBe(2)
        expect(nodeEditorPerf.nodes.b.records.at(-1)).toMatchObject({ scope: "worker", engine: "ts", status: "ok" })
    })

    it("清空后统计归零", () => {
        recordSyncPhase("节点计算", 1, { nodeId: "a" })
        recordWorkerRequest("evaluate", 2, { nodeId: "a", engine: "wasm" })

        resetNodeEditorPerf()

        expect(nodeEditorPerf.syncCalls).toBe(0)
        expect(nodeEditorPerf.syncTotal).toBe(0)
        expect(nodeEditorPerf.workerCalls).toBe(0)
        expect(nodeEditorPerf.workerTotal).toBe(0)
        expect(Object.keys(nodeEditorPerf.sync)).toHaveLength(0)
        expect(Object.keys(nodeEditorPerf.worker)).toHaveLength(0)
        expect(Object.keys(nodeEditorPerf.nodes)).toHaveLength(0)
    })
})
