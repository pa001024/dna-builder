import { describe, expect, it } from "bun:test"
import { planDiffReplicaRepair } from "./data-pack-diff-storage"

describe("差分副本补齐计划", () => {
    it("两端都有时不产生补传", () => {
        const plan = planDiffReplicaRepair(
            new Map([
                ["OSS", new Set(["data-pack/diff/a.hdiff"])],
                ["R2", new Set(["data-pack/diff/a.hdiff"])],
            ])
        )
        expect(plan).toEqual([])
    })

    it("只在 OSS 的补丁计划补传 R2，源为 OSS", () => {
        const plan = planDiffReplicaRepair(
            new Map([
                ["OSS", new Set(["data-pack/diff/a.hdiff"])],
                ["R2", new Set<string>()],
            ])
        )
        expect(plan).toEqual([{ key: "data-pack/diff/a.hdiff", missing: ["R2"], source: "OSS" }])
    })

    it("只在 R2 的补丁计划补传 OSS，源为 R2", () => {
        const plan = planDiffReplicaRepair(
            new Map([
                ["OSS", new Set<string>()],
                ["R2", new Set(["data-pack/diff/b.hdiff"])],
            ])
        )
        expect(plan).toEqual([{ key: "data-pack/diff/b.hdiff", missing: ["OSS"], source: "R2" }])
    })

    it("跳过目录占位对象", () => {
        const plan = planDiffReplicaRepair(
            new Map([
                ["OSS", new Set(["data-pack/diff/"])],
                ["R2", new Set<string>()],
            ])
        )
        expect(plan).toEqual([])
    })

    it("多端缺失时一次覆盖全部缺失端", () => {
        const plan = planDiffReplicaRepair(
            new Map([
                ["OSS", new Set(["data-pack/diff/c.hdiff"])],
                ["R2", new Set<string>()],
                ["TMP", new Set<string>()],
            ])
        )
        expect(plan).toEqual([{ key: "data-pack/diff/c.hdiff", missing: ["R2", "TMP"], source: "OSS" }])
    })
})
