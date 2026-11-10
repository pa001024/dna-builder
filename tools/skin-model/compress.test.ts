import { describe, expect, it } from "vitest"
import { type GlbDocument, type GltfMaterial, readGlb } from "../../apps/web/src/utils/skin-model-glb"
import { classifyTextures, compressGlb, DEFAULT_TEXTURE_BUDGET } from "./compress"

/** 造一个带蒙皮、逆绑定矩阵与动画的最小 GLB，用来回归「压缩不能丢 skin 数据」。 */
function skinnedGlb(jointCount = 2): Uint8Array {
    const chunks: Uint8Array[] = []
    const views: Record<string, any>[] = []
    const accessors: Record<string, any>[] = []
    let offset = 0
    const push = (data: ArrayBufferView, target?: number) => {
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        const pad = (4 - (offset % 4)) % 4
        if (pad) {
            chunks.push(new Uint8Array(pad))
            offset += pad
        }
        views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) })
        chunks.push(bytes)
        offset += bytes.length
        return views.length - 1
    }
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const joints = new Uint16Array(12)
    const weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
    const ibm = new Float32Array(Array.from({ length: jointCount * 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)))
    const time = new Float32Array([0, 1])
    const rot = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1])
    const aPos =
        accessors.push({ bufferView: push(pos, 34962), componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }) - 1
    const aJoints = accessors.push({ bufferView: push(joints, 34962), componentType: 5123, count: 3, type: "VEC4" }) - 1
    const aWeights = accessors.push({ bufferView: push(weights, 34962), componentType: 5126, count: 3, type: "VEC4" }) - 1
    const aIbm = accessors.push({ bufferView: push(ibm), componentType: 5126, count: jointCount, type: "MAT4" }) - 1
    const aTime = accessors.push({ bufferView: push(time), componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] }) - 1
    const aRot = accessors.push({ bufferView: push(rot), componentType: 5126, count: 2, type: "VEC4" }) - 1

    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const binary = new Uint8Array(total + ((4 - (total % 4)) % 4))
    let cursor = 0
    for (const chunk of chunks) {
        binary.set(chunk, cursor)
        cursor += chunk.length
    }

    const json = {
        asset: { version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [0, 1] }],
        nodes: [{ name: "bone", children: [2] }, { name: "Body", mesh: 0, skin: 0 }, { name: "leaf" }],
        meshes: [{ primitives: [{ attributes: { POSITION: aPos, JOINTS_0: aJoints, WEIGHTS_0: aWeights }, material: 0 }] }],
        skins: [{ joints: [0, 2], inverseBindMatrices: aIbm }],
        materials: [{ name: "MI_Test", extras: { dnaColorize: { version: 1, kind: "base", role: "character", textures: {} } } }],
        animations: [{ channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }], samplers: [{ input: aTime, output: aRot }] }],
        bufferViews: views,
        accessors,
        buffers: [{ byteLength: binary.length }],
    }
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
    // JSON chunk 必须用空格补齐，NUL 会让解析器直接报错
    const jsonChunk = new Uint8Array(jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4)).fill(0x20)
    jsonChunk.set(jsonBytes)
    const header = new Uint8Array(12)
    const hv = new DataView(header.buffer)
    hv.setUint32(0, 0x46546c67, true)
    hv.setUint32(4, 2, true)
    hv.setUint32(8, 12 + 8 + jsonChunk.length + 8 + binary.length, true)
    const jsonHeader = new Uint8Array(8)
    new DataView(jsonHeader.buffer).setUint32(0, jsonChunk.length, true)
    new DataView(jsonHeader.buffer).setUint32(4, 0x4e4f534a, true)
    const binHeader = new Uint8Array(8)
    new DataView(binHeader.buffer).setUint32(0, binary.length, true)
    new DataView(binHeader.buffer).setUint32(4, 0x004e4942, true)
    const out = new Uint8Array(12 + 8 + jsonChunk.length + 8 + binary.length)
    let at = 0
    for (const part of [header, jsonHeader, jsonChunk, binHeader, binary]) {
        out.set(part, at)
        at += part.length
    }
    return out
}

/**
 * @description 造一个最小的 glTF 文档，只包含材质贴图槽，用来验证分类。
 * @param materials 材质定义
 * @param images 贴图名列表
 * @returns GLB 文档
 */
function fixture(materials: GltfMaterial[], images: string[]): GlbDocument {
    return {
        json: {
            asset: { version: "2.0" },
            images: images.map(name => ({ name })),
            textures: images.map((_name, source) => ({ source })),
            materials,
            meshes: [],
            nodes: [],
            scenes: [{ nodes: [] }],
            bufferViews: [],
            accessors: [],
            skins: [],
            animations: [],
            samplers: [],
            buffers: [{ byteLength: 0 }],
        },
        binary: new Uint8Array(),
    }
}

describe("texture budget classification", () => {
    it("marks silk and wing bases as cutout, because their B channel is the silhouette", () => {
        const document = fixture(
            [
                {
                    name: "MI_Silk",
                    extras: {
                        dnaColorize: { kind: "packed", parent: "M_Player_Silk_ShopSkin.0", textures: { 时装BaseClor: 0, 丝绸混合贴图: 1 } },
                    },
                },
                {
                    name: "MI_Wing",
                    extras: { dnaColorize: { kind: "packed", parent: "M_Player_Wing_ShopSkin.0", textures: { 时装BaseClor: 2 } } },
                },
                { name: "MI_Skin", extras: { dnaColorize: { kind: "stocking", parent: "M_Player_Skin.0", textures: { 颜色贴图: 3 } } } },
            ],
            ["T_Silk_D", "T_Silk_A", "T_Wing_D", "T_Skin_D"]
        )
        const kinds = classifyTextures(document)
        expect(kinds.get("T_Silk_D")).toBe("cutout")
        expect(kinds.get("T_Wing_D")).toBe("cutout")
        expect(kinds.get("T_Silk_A")).toBe("mask")
        expect(kinds.get("T_Skin_D")).toBe("color")
    })

    it("keeps the stricter class when one image is referenced by several slots", () => {
        const document = fixture(
            [
                {
                    name: "MI_Silk",
                    extras: {
                        dnaColorize: {
                            kind: "packed",
                            parent: "M_Player_Silk_ShopSkin.0",
                            // 丝绸层：底图是剪影（cutout），同一张图又被当法线贴图引用
                            textures: { 时装BaseClor: 0, 丝绸混合贴图: 1, 法线贴图: 0 },
                        },
                    },
                },
            ],
            ["T_Shared", "T_Silk_A"]
        )
        expect(classifyTextures(document).get("T_Shared")).toBe("cutout")
    })

    it("classifies normals and untouched images", () => {
        const document = fixture(
            [{ name: "MI_Face", extras: { dnaColorize: { kind: "base", textures: { 颜色贴图: 0, 法线贴图: 1 } } } }],
            ["T_Face_D", "T_Face_N"]
        )
        const kinds = classifyTextures(document)
        expect(kinds.get("T_Face_D")).toBe("color")
        expect(kinds.get("T_Face_N")).toBe("normal")
    })

    it("ships a default budget whose cutout tier is lossless", () => {
        expect(DEFAULT_TEXTURE_BUDGET.cutout.lossless).toBe(true)
        expect(DEFAULT_TEXTURE_BUDGET.cutout.scale).toBeLessThanOrEqual(1)
        expect(DEFAULT_TEXTURE_BUDGET.mask.lossless).toBe(true)
    })
})

describe("compression keeps skin data", () => {
    it("re-registers inverse bind matrices after the accessor table is rebuilt", async () => {
        // 压缩会清空 accessors 再重建；逆绑定矩阵若没重新登记，会指向无关的几何 accessor，
        // 骨骼矩阵解出 NaN，模型在 three 里整只不显示。
        const { glb } = await compressGlb(skinnedGlb(2))
        const json = readGlb(glb).json
        expect(json.skins).toHaveLength(1)
        const accessor = json.accessors[json.skins[0].inverseBindMatrices!]
        expect(accessor.type).toBe("MAT4")
        expect(accessor.componentType).toBe(5126)
        expect(accessor.count).toBe(json.skins[0].joints.length)
    })

    it("keeps the animation and its time accessor usable", async () => {
        const { glb } = await compressGlb(skinnedGlb(2))
        const json = readGlb(glb).json
        expect(json.animations).toHaveLength(1)
        for (const sampler of json.animations[0].samplers) {
            const input = json.accessors[sampler.input]
            expect(input.componentType).toBe(5126)
            expect(input.count).toBe(2)
            expect(json.bufferViews[input.bufferView!]).toBeDefined()
        }
    })
})
