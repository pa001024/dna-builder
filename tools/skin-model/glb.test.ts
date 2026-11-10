import { describe, expect, it } from "vitest"
import { type GlbDocument, mergeGlbs, readGlb, writeGlb } from "../../apps/web/src/utils/skin-model-glb"

function fixture(): GlbDocument {
    return {
        json: {
            asset: { version: "2.0" },
            buffers: [{ byteLength: 4 }],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
            accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "SCALAR" }],
            materials: [{ name: "cloth" }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 0, material: 0 }] }],
            nodes: [{ mesh: 0, skin: 0, children: [1] }, { name: "root" }],
            skins: [{ joints: [1], skeleton: 1, inverseBindMatrices: 0 }],
            images: [],
            textures: [],
            samplers: [],
            animations: [],
            scene: 0,
            scenes: [{ nodes: [0] }],
        },
        binary: new Uint8Array([0, 0, 128, 63]),
    }
}

describe("skin GLB packaging", () => {
    it("round-trips a self-contained binary", () => {
        const document = fixture()
        expect(readGlb(writeGlb(document))).toEqual(document)
    })
    it("remaps geometry, bones, materials and roots of independent assets", () => {
        const result = mergeGlbs([fixture(), fixture()])
        expect(result.json.bufferViews[1].byteOffset).toBe(4)
        expect(result.json.accessors[1].bufferView).toBe(1)
        expect(result.json.meshes[1].primitives[0]).toEqual({ attributes: { POSITION: 1 }, indices: 1, material: 1 })
        expect(result.json.nodes[2]).toEqual({ mesh: 1, skin: 1, children: [] })
        expect(result.json.skins[1]).toEqual({ joints: [1], skeleton: 1, inverseBindMatrices: 1 })
        expect(result.json.scenes[0].nodes).toEqual([0, 2])
        expect(readGlb(writeGlb(result)).binary.length).toBe(8)
    })
    it("rejects truncated input instead of silently losing data", () => {
        expect(() => readGlb(writeGlb(fixture()).slice(0, -1))).toThrow("Truncated")
    })
    it("remaps meshopt-compressed buffer views so compressed parts can be merged", () => {
        // 部件是 EXT_meshopt_compression 压缩的：压缩数据也在同一个二进制块里，
        // 合并时必须把 extension 里的 byteOffset 一起搬，否则解压会读到别的部件的数据。
        const compressed = fixture()
        compressed.json.bufferViews[0].extensions = {
            EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 4, byteStride: 4, count: 1, mode: "ATTRIBUTES" },
        }
        Object.assign(compressed.json, {
            extensionsUsed: ["EXT_meshopt_compression"],
            extensionsRequired: ["EXT_meshopt_compression"],
        })
        const result = mergeGlbs([compressed, compressed])
        expect(result.json.bufferViews[0].extensions?.EXT_meshopt_compression?.byteOffset).toBe(0)
        expect(result.json.bufferViews[1].extensions?.EXT_meshopt_compression?.byteOffset).toBe(4)
        expect(result.json.extensionsRequired).toEqual(["EXT_meshopt_compression"])
    })
    it("remaps animation accessors and target nodes of independent assets", () => {
        const animated = fixture()
        Object.assign(animated.json, {
            animations: [
                { name: "idle", samplers: [{ input: 0, output: 0 }], channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }] },
            ],
        })
        const result = mergeGlbs([animated, animated])
        expect(result.json.animations[0].samplers[0]).toEqual({ input: 0, output: 0 })
        expect(result.json.animations[1].samplers[0]).toEqual({ input: 1, output: 1 })
        expect(result.json.animations[1].channels[0].target.node).toBe(1)
    })
})
