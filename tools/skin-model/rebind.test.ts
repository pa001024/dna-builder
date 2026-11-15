import { describe, expect, it } from "vitest"
import type { GlbDocument } from "../../apps/web/src/utils/skin-model-glb"
import { attachEffectRoots, bindToSkeleton } from "./rebind"
import type { UeModelBone } from "./uemodel"

function documentWithSkin(): GlbDocument {
    return {
        json: {
            asset: { version: "2.0" },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ name: "Root", children: [1] }, { name: "pelvis" }],
            skins: [{ joints: [0, 1], inverseBindMatrices: 0 }],
            accessors: [],
            bufferViews: [],
            meshes: [],
            materials: [],
            textures: [],
            images: [],
            samplers: [],
            animations: [],
        },
        binary: new Uint8Array(),
    }
}

const bone = (name: string, parent: number, translation: number[]): UeModelBone => ({
    name,
    parent,
    translation: translation as [number, number, number],
    rotation: [0, 0, 0, 1],
})

describe("bindToSkeleton", () => {
    it("writes the reference pose into node TRS and inverse bind matrices", () => {
        const document = documentWithSkin()
        const result = bindToSkeleton(document, [bone("Root", -1, [0, 0, 0]), bone("pelvis", 0, [0, 0.8794, 0])])
        expect(result).toEqual({ skins: 1, joints: 2, nodes: 2 })
        expect(document.json.nodes[1].translation).toEqual([0, 0.8794, 0])
        const accessor = document.json.accessors[document.json.skins[0].inverseBindMatrices]
        const view = document.json.bufferViews[accessor.bufferView!]
        const matrices = new Float32Array(document.binary.buffer, document.binary.byteOffset + (view.byteOffset ?? 0), 32)
        // Root 绑定在原点：逆矩阵是单位阵
        expect(Array.from(matrices.slice(0, 16)).map(value => value + 0)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
        // pelvis 的逆矩阵把绑定位置搬回原点（列主序第 4 列）
        expect(matrices[28]).toBeCloseTo(0, 6)
        expect(matrices[29]).toBeCloseTo(-0.8794, 5)
        expect(matrices[30]).toBeCloseTo(0, 6)
    })

    it("rejects skins whose joints are missing from the reference skeleton", () => {
        const document = documentWithSkin()
        expect(() => bindToSkeleton(document, [bone("Root", -1, [0, 0, 0])])).toThrow(/pelvis/)
    })
})

describe("attachEffectRoots", () => {
    /** 身体骨架 + 一棵独立的效果网格骨架（根节点在场景根上）。 */
    function effectDocument(): GlbDocument {
        return {
            json: {
                asset: { version: "2.0" },
                scene: 0,
                scenes: [{ nodes: [0, 2] }],
                nodes: [
                    { name: "Root" },
                    // 上背骨骼在绑定姿态里通常带 180° 朝向（UE 骨骼轴）
                    { name: "spine_03", translation: [0, 1.169, 0], rotation: [0, 1, 0, 0] },
                    { name: "Wing_Root", children: [3] },
                    { name: "Wing_a" },
                ],
                meshes: [],
                materials: [],
                textures: [],
                images: [],
                samplers: [],
                accessors: [],
                bufferViews: [],
                skins: [],
                animations: [],
            },
            binary: new Uint8Array(),
        }
    }

    it("reparents the effect root under the bone and cancels the bone's world rotation", () => {
        const document = effectDocument()
        expect(attachEffectRoots(document, ["Wing_Root"], "spine_03")).toBe(1)
        // 不再是场景根；挂到骨骼下
        expect(document.json.scenes[0].nodes).toEqual([0])
        const spine = document.json.nodes[1]
        expect(spine.children).toHaveLength(1)
        // 夹具形状已知：spine 必带子节点，挂接点必带旋转与缩放。
        const attach = document.json.nodes[spine.children![0]]
        expect(attach.children).toEqual([2])
        // 骨骼世界旋转 180° 绕 Y，补偿后应为共轭 [0, -1, 0, 0]
        expect(attach.rotation![0]).toBeCloseTo(0, 6)
        expect(attach.rotation![1]).toBeCloseTo(-1, 6)
        expect(attach.rotation![2]).toBeCloseTo(0, 6)
        expect(attach.rotation![3]).toBeCloseTo(0, 6)
        expect(attach.scale).toEqual([1, 1, 1])
    })

    it("throws instead of silently dropping a mesh whose bone is gone", () => {
        expect(() => attachEffectRoots(effectDocument(), ["Wing_Root"], "spine_09")).toThrow(/spine_09/)
        expect(() => attachEffectRoots(effectDocument(), ["Missing_Root"], "spine_03")).toThrow(/Missing_Root/)
    })
})
