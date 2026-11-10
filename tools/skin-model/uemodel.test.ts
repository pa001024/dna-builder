import { describe, expect, it } from "vitest"
import { mapVertexColors, readUeModelSkeleton, readUeModelVertexColors, type UeModelVertexColor, uePositionKey } from "./uemodel"

const encoder = new TextEncoder()
const fstring = (value: string) => {
    const body = encoder.encode(value)
    const out = new Uint8Array(4 + body.length)
    new DataView(out.buffer).setInt32(0, body.length, true)
    out.set(body, 4)
    return out
}
const int32 = (value: number) => {
    const out = new Uint8Array(4)
    new DataView(out.buffer).setInt32(0, value, true)
    return out
}
const floats = (values: number[]) => {
    const out = new Uint8Array(values.length * 4)
    values.forEach((value, index) => new DataView(out.buffer).setFloat32(index * 4, value, true))
    return out
}
const concat = (parts: Uint8Array[]) => {
    const total = parts.reduce((sum, part) => sum + part.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}
const header = () =>
    concat([encoder.encode("UEFORMAT"), int32(7), encoder.encode("UEMODEL"), new Uint8Array([9]), fstring("Test"), new Uint8Array([0])])

/** 最小可用的 UEMODEL：一个 LOD、一个 VERTICES 段、一个 VERTEXCOLORS 段。 */
function fixture(vertices: number[][], colors: number[][]): Uint8Array {
    const vertexPayload = new Uint8Array(vertices.length * 12)
    vertices.forEach((position, index) => {
        position.forEach((value, channel) => new DataView(vertexPayload.buffer).setFloat32(index * 12 + channel * 4, value, true))
    })
    const colorPayload = new Uint8Array(colors.length * 4)
    colors.forEach((color, index) => colorPayload.set(color, index * 4))

    // VERTEXCOLORS 段内容 = 「缓冲数 + 每个缓冲（名字 + 元素数）+ 颜色数据」
    const colorBufferHeader = concat([fstring("COL0"), int32(colors.length)])
    const colorSection = concat([colorBufferHeader, colorPayload])

    const lodSections = concat([
        fstring("VERTICES"),
        int32(vertices.length),
        int32(vertexPayload.length),
        vertexPayload,
        fstring("VERTEXCOLORS"),
        int32(1),
        int32(colorSection.length),
        colorSection,
    ])
    const lodPayload = concat([fstring("LOD0"), int32(lodSections.length), lodSections])

    return concat([header(), fstring("LODS"), int32(1), int32(lodPayload.length), lodPayload])
}

/** SKELETON 段：METADATA + BONES（名字 + 父级 + 局部位置 3 + 局部旋转 4）。 */
function skeletonFixture(bones: { name: string; parent: number; position: number[]; rotation: number[] }[]): Uint8Array {
    const bonePayload = concat(
        bones.flatMap(bone => [fstring(bone.name), int32(bone.parent), floats(bone.position), floats(bone.rotation)])
    )
    const bonesSection = concat([fstring("BONES"), int32(bones.length), int32(bonePayload.length), bonePayload])
    const metadata = concat([fstring("METADATA"), int32(1), int32(0)])
    const skeletonPayload = concat([metadata, bonesSection])
    return concat([header(), fstring("SKELETON"), int32(1), int32(skeletonPayload.length), skeletonPayload])
}

describe("UEFormat vertex colors", () => {
    it("reads vertex positions and BGRA colors from a UEMODEL", () => {
        const bytes = fixture(
            [
                [10, 20, 30],
                [40, 50, 60],
            ],
            [
                [255, 128, 0, 255],
                [0, 0, 0, 255],
            ]
        )
        const entries = readUeModelVertexColors(bytes)
        expect(entries).toHaveLength(2)
        expect(entries[0].position).toEqual([10, 20, 30])
        expect(entries[0].color).toEqual([255, 128, 0, 255])
        expect(entries[1].position).toEqual([40, 50, 60])
    })

    it("maps colors onto glTF vertices through the UE to Y-up axis swap", () => {
        // UE(厘米, Z-up) → glTF(米, Y-up)：x→x, z→y, y→z
        const entries: UeModelVertexColor[] = [
            { position: [10, 20, 30], color: [1, 2, 3, 255] },
            { position: [40, 50, 60], color: [4, 5, 6, 255] },
        ]
        const positions = new Float32Array([0.1, 0.3, 0.2, 0.4, 0.6, 0.5])
        const result = mapVertexColors(entries, positions)
        expect(result.matched).toBe(2)
        expect(result.total).toBe(2)
        expect(Array.from(result.colors)).toEqual([1, 2, 3, 255, 4, 5, 6, 255])
    })

    it("leaves unmatched vertices zeroed instead of guessing", () => {
        const entries: UeModelVertexColor[] = [{ position: [10, 20, 30], color: [9, 9, 9, 255] }]
        const positions = new Float32Array([0.1, 0.3, 0.2, 99, 99, 99])
        const result = mapVertexColors(entries, positions)
        expect(result.matched).toBe(1)
        expect(Array.from(result.colors.slice(4))).toEqual([0, 0, 0, 0])
    })

    it("formats position keys consistently for lookups", () => {
        expect(uePositionKey(0.1, 0.3, 0.2)).toBe("0.1000,0.3000,0.2000")
    })
})

describe("UEFormat skeleton", () => {
    it("reads the bind pose and converts it from UE to glTF space", () => {
        const bones = readUeModelSkeleton(
            skeletonFixture([
                { name: "Root", parent: -1, position: [0, 0, 0], rotation: [0, 0, 0, 1] },
                // UE 身高 87.94 cm 记在 z 上，glTF 里应落在 y
                { name: "pelvis", parent: 0, position: [0, 0, 87.94], rotation: [Math.SQRT1_2, 0, Math.SQRT1_2, 0] },
            ])
        )
        expect(bones.map(bone => [bone.name, bone.parent])).toEqual([
            ["Root", -1],
            ["pelvis", 0],
        ])
        expect(bones[1].translation.map(value => +value.toFixed(4))).toEqual([0, 0.8794, 0])
        expect(bones[1].rotation[0]).toBeCloseTo(-Math.SQRT1_2, 6)
        expect(bones[1].rotation[1]).toBeCloseTo(-Math.SQRT1_2, 6)
        expect(bones[1].rotation[2]).toBeCloseTo(0, 6)
        expect(bones[1].rotation[3]).toBeCloseTo(0, 6)
    })
})
