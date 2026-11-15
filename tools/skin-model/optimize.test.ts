import { describe, expect, it } from "vitest"
import type { GlbDocument } from "../../apps/web/src/utils/skin-model-glb"
import { averageAlpha, cutoutBaseNames, optimizeGlb } from "./optimize"

function triangleDocument() {
    const vertices = 3
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
    const uvs = new Float32Array(vertices * 2).fill(0.5)
    const tangents = new Float32Array(vertices * 4)
    const mask = new Float32Array(vertices * 4)
    for (let i = 0; i < vertices; i++) mask.set([1, 0.5, 0.25, 1], i * 4)
    const index = new Uint16Array([0, 1, 2])
    const binary = new Uint8Array(positions.byteLength + uvs.byteLength * 2 + tangents.byteLength + mask.byteLength + index.byteLength)
    let offset = 0
    for (const data of [positions, uvs, uvs, tangents, mask, index]) {
        binary.set(new Uint8Array(data.buffer), offset)
        offset += data.byteLength
    }
    const view = (start: number, length: number, target: number) => ({
        buffer: 0,
        byteOffset: start,
        byteLength: length,
        target,
    })
    return {
        json: {
            asset: { version: "2.0" },
            buffers: [{ byteLength: binary.length }],
            bufferViews: [
                view(0, 36, 34962),
                view(36, 24, 34962),
                view(60, 24, 34962),
                view(84, 48, 34962),
                view(132, 48, 34962),
                view(180, 6, 34963),
            ],
            accessors: [
                { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
                { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
                { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
                { bufferView: 3, componentType: 5126, count: 3, type: "VEC4" },
                { bufferView: 4, componentType: 5126, count: 3, type: "VEC4" },
                { bufferView: 5, componentType: 5123, count: 3, type: "SCALAR" },
            ],
            materials: [{ name: "skin" }],
            meshes: [
                {
                    name: "body",
                    primitives: [
                        {
                            attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2, TANGENT: 3, COLOR_0: 4 },
                            indices: 5,
                            material: 0,
                        },
                    ],
                },
            ],
            nodes: [],
            scenes: [{ nodes: [] }],
            scene: 0,
        },
        binary,
    }
}

describe("skin GLB optimization", () => {
    it("drops tangent and extra UVs while keeping the mask as normalized u8", async () => {
        const document = triangleDocument()
        await optimizeGlb(document, { convertTextures: false, simplifyRatio: 1 })
        const primitive = document.json.meshes[0].primitives[0]
        expect(Object.keys(primitive.attributes).sort()).toEqual(["COLOR_0", "POSITION", "TEXCOORD_0"])
        expect(primitive.attributes.TANGENT).toBeUndefined()
        expect(primitive.attributes.TEXCOORD_1).toBeUndefined()
        const mask = document.json.accessors[primitive.attributes.COLOR_0] as {
            componentType: number
            normalized?: boolean
            bufferView: number
        }
        expect(mask.componentType).toBe(5121)
        expect(mask.normalized).toBe(true)
        const view = document.json.bufferViews[mask.bufferView]
        const bytes = document.binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)
        expect(Array.from(bytes.subarray(0, 4))).toEqual([255, 128, 64, 255])
        expect(primitive.attributes.COLOR_0).not.toBe(4)
    })

    it("keeps normalized mask encoding after mesh simplification", async () => {
        const size = 24
        const positions: number[] = []
        const uvs: number[] = []
        const indices: number[] = []
        for (let y = 0; y <= size; y++) {
            for (let x = 0; x <= size; x++) {
                positions.push(x / size, y / size, Math.sin((x / size) * Math.PI) * 0.1)
                uvs.push(x / size, y / size)
            }
        }
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const a = y * (size + 1) + x
                indices.push(a, a + 1, a + size + 1, a + 1, a + size + 2, a + size + 1)
            }
        }
        const count = (size + 1) ** 2
        const position = new Float32Array(positions)
        const uv = new Float32Array(uvs)
        const normal = new Float32Array(count * 3).fill(0)
        for (let i = 0; i < count; i++) normal[i * 3 + 2] = 1
        const mask = new Uint8Array(count * 4)
        for (let i = 0; i < count; i++) mask.set([255, 128, 64, 255], i * 4)
        const index = new Uint16Array(indices)
        const chunks: { data: Uint8Array; target: number; type: string; componentType: number; normalized?: boolean }[] = [
            { data: new Uint8Array(position.buffer), target: 34962, type: "VEC3", componentType: 5126 },
            { data: new Uint8Array(normal.buffer), target: 34962, type: "VEC3", componentType: 5126 },
            { data: new Uint8Array(uv.buffer), target: 34962, type: "VEC2", componentType: 5126 },
            { data: mask, target: 34962, type: "VEC4", componentType: 5121, normalized: true },
            { data: new Uint8Array(index.buffer), target: 34963, type: "SCALAR", componentType: 5123 },
        ]
        const offsets: number[] = []
        let total = 0
        for (const chunk of chunks) {
            offsets.push(total)
            total += chunk.data.byteLength
        }
        const binary = new Uint8Array(total)
        chunks.forEach((chunk, i) => binary.set(chunk.data, offsets[i]))
        const document = {
            json: {
                asset: { version: "2.0" },
                buffers: [{ byteLength: total }],
                bufferViews: chunks.map((chunk, i) => ({
                    buffer: 0,
                    byteOffset: offsets[i],
                    byteLength: chunk.data.byteLength,
                    target: chunk.target,
                })),
                accessors: chunks.map((chunk, i) => ({
                    bufferView: i,
                    componentType: chunk.componentType,
                    count: chunk.type === "SCALAR" ? index.length : count,
                    type: chunk.type,
                    ...(chunk.normalized ? { normalized: true } : {}),
                })),
                materials: [{ name: "body" }],
                meshes: [
                    {
                        name: "body",
                        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4, material: 0 }],
                    },
                ],
                nodes: [],
                scenes: [{ nodes: [] }],
                scene: 0,
                skins: [],
                animations: [],
                samplers: [],
                images: [],
                textures: [],
            },
            binary,
        }
        const report = await optimizeGlb(document, { convertTextures: false, simplifyRatio: 0.6 })
        expect(report.geometry[0].after).toBeLessThan(report.geometry[0].before)
        const primitive = document.json.meshes[0].primitives[0]
        const meta = document.json.accessors[primitive.attributes.COLOR_0] as {
            componentType: number
            normalized?: boolean
            count: number
            bufferView: number
        }
        expect(meta.componentType).toBe(5121)
        expect(meta.normalized).toBe(true)
        const view = document.json.bufferViews[meta.bufferView]
        const bytes = document.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
        expect(bytes[0]).toBe(255)
        expect(bytes[1]).toBe(128)
        expect(bytes[2]).toBe(64)
        const positionAccessor = document.json.accessors[primitive.attributes.POSITION]
        expect(positionAccessor.count).toBe(meta.count)
        const indexMeta = document.json.accessors[primitive.indices!]
        expect(indexMeta.count % 3).toBe(0)
    })
})

/** 2×2 RGBA：一张全透明、一张不透明，用来区分“遮罩贴图”和普通贴图。 */
const TRANSPARENT_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DAAMJgAsQAACnoA/2tJ5gCAAAAAElFTkSuQmCC",
    "base64"
)
const OPAQUE_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGM4YSP3n+tE1H8GOZsT/3/9+vUfAE6MCluAnzZdAAAAAElFTkSuQmCC",
    "base64"
)

function imageDocument(name: string, png: Buffer): GlbDocument {
    return {
        json: {
            asset: { version: "2.0" },
            buffers: [{ byteLength: png.length }],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
            accessors: [],
            images: [{ bufferView: 0, mimeType: "image/png", name }],
            textures: [{ source: 0 }],
            materials: [{ name: "MI_Test", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
            meshes: [],
            nodes: [],
            scenes: [{ nodes: [] }],
            scene: 0,
            skins: [],
            animations: [],
            samplers: [],
        },
        binary: new Uint8Array(png),
    }
}

const encodeTexture = async () => Uint8Array.of(0x52, 0x49, 0x46, 0x46)

function imageBytes(document: GlbDocument): Uint8Array {
    // 夹具必带 bufferView；外来文档缺视图时与之前一致直接抛错。
    const view = document.json.bufferViews[document.json.images[0].bufferView!]
    return document.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
}

describe("cutout base detection", () => {
    it("marks Wing-shopskin and silk bases, where the B channel is the opacity mask", () => {
        const document = {
            json: {
                images: [{ name: "T_Wing_D" }, { name: "T_Skin_D" }, { name: "T_Silk_D" }, { name: "T_Weapon_D" }, { name: "T_Eye_D" }],
                textures: [{ source: 0 }, { source: 1 }, { source: 2 }, { source: 3 }, { source: 4 }],
                materials: [
                    {
                        name: "MI_Wing",
                        extras: { dnaColorize: { kind: "packed", parent: "M_Player_Wing_ShopSkin.0", textures: { 时装BaseClor: 0 } } },
                    },
                    {
                        name: "MI_Skin",
                        extras: { dnaColorize: { kind: "stocking", parent: "M_Player_Skin.0", textures: { 颜色贴图: 1 } } },
                    },
                    {
                        name: "MI_Silk",
                        extras: {
                            dnaColorize: {
                                kind: "packed",
                                parent: "M_Player_Silk_ShopSkin.0",
                                textures: { 时装BaseClor: 2, 丝绸混合贴图: 3 },
                            },
                        },
                    },
                    { name: "MI_Shadow", extras: { dnaColorize: { kind: "shadow", textures: {} } } },
                    { name: "MI_Eye", extras: { dnaColorize: { kind: "eye", parent: "M_Player_Eye_V14.0", textures: { 颜色贴图: 4 } } } },
                ],
                bufferViews: [],
                accessors: [],
                meshes: [],
                nodes: [],
                scenes: [{ nodes: [] }],
                skins: [],
                animations: [],
                samplers: [],
            },
            binary: new Uint8Array(),
        }
        expect([...cutoutBaseNames(document)].sort()).toEqual(["T_Eye_D", "T_Silk_D", "T_Wing_D"])
    })
})

describe("skin GLB texture repacking", () => {
    it("measures how much of a PNG is transparent", () => {
        expect(averageAlpha(new Uint8Array(TRANSPARENT_PNG))).toBe(0)
        expect(averageAlpha(new Uint8Array(OPAQUE_PNG))).toBe(255)
    })

    it("converts opaque mask textures to WebP", async () => {
        const document = imageDocument("T_Test_M", OPAQUE_PNG)
        await optimizeGlb(document, { encodeTexture })
        expect(document.json.images[0].mimeType).toBe("image/webp")
        expect(imageBytes(document)[0]).toBe(0x52)
    })

    // WebP 会把透明像素的 RGB 清零，而遮罩贴图的剪影恰好画在 alpha=0 的区域，
    // 转码后整件衣服会被裁没（芙罗拉 SP10 的双手就是这样消失的）。
    it("keeps transparent mask textures lossless instead of letting WebP blank their RGB", async () => {
        const document = imageDocument("T_Test_M", TRANSPARENT_PNG)
        await optimizeGlb(document, { encodeTexture })
        expect(document.json.images[0].mimeType).toBe("image/png")
        expect(Buffer.from(imageBytes(document)).equals(TRANSPARENT_PNG)).toBe(true)
    })

    it("still converts transparent colour textures, where blanked RGB is invisible", async () => {
        const document = imageDocument("T_Test_D", TRANSPARENT_PNG)
        await optimizeGlb(document, { encodeTexture })
        expect(document.json.images[0].mimeType).toBe("image/webp")
    })
})
