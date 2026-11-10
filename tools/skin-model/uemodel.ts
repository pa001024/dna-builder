/**
 * UEFormat `.uemodel` 解析：只取出顶点色。
 *
 * fmodel-cli 的 glTF2 导出会把 COLOR_0 全写成 0（源资产里有上百种颜色），
 * 而同一份网格的 UEFormat 导出（`export-mesh-uf`）保留了完整顶点色。
 * 因此导出时装时以 `.uemodel` 为准回填顶点色。
 */

import { toRotation, toTranslation } from "./anim"

const MAGIC = "UEFORMAT"

interface Cursor {
    readonly bytes: Uint8Array
    readonly view: DataView
    offset: number
}

function cursorOf(bytes: Uint8Array): Cursor {
    return { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset: 0 }
}

function u8(cursor: Cursor): number {
    return cursor.bytes[cursor.offset++]
}

function i32(cursor: Cursor): number {
    const value = cursor.view.getInt32(cursor.offset, true)
    cursor.offset += 4
    return value
}

function f32(cursor: Cursor): number {
    const value = cursor.view.getFloat32(cursor.offset, true)
    cursor.offset += 4
    return value
}

/** UEFormat 的 fstring：int32 长度 + UTF-8 字节（含结尾 NUL）。 */
function text(cursor: Cursor): string {
    const length = i32(cursor)
    if (length < 0 || cursor.offset + length > cursor.bytes.length) throw new Error("Truncated UEMODEL string")
    const raw = cursor.bytes.subarray(cursor.offset, cursor.offset + length)
    cursor.offset += length
    let end = raw.length
    while (end > 0 && raw[end - 1] === 0) end--
    return new TextDecoder().decode(raw.subarray(0, end))
}

export interface UeModelSection {
    count: number
    size: number
    offset: number
}

export interface UeModelVertexColor {
    /** UE 空间的位置（厘米，Z-up），用于和 glTF 顶点按位置对齐。 */
    position: [number, number, number]
    /** BGRA，取值 0–255。 */
    color: [number, number, number, number]
}

function sectionAt(cursor: Cursor): UeModelSection {
    const count = i32(cursor)
    const size = i32(cursor)
    const offset = cursor.offset
    if (size < 0 || offset + size > cursor.bytes.length) throw new Error("Truncated UEMODEL section")
    return { count, size, offset }
}

/**
 * 跳过文件头，游标停在第一个段之前。
 * 文件头是「8 字节 magic + int32 类型名长度 + 类型名 + 1 字节版本 + 资产名 + 1 字节标志」；
 * 注意 magic 后紧跟的那个 int32 是**类型名长度**，不是版本号。
 */
function openModel(bytes: Uint8Array): Cursor {
    if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) throw new Error("Expected a UEFormat model")
    const cursor = cursorOf(bytes)
    cursor.offset = 8
    if (text(cursor) !== "UEMODEL") throw new Error("Expected a UEMODEL asset")
    const version = u8(cursor)
    if (version !== 9) throw new Error(`Unsupported UEMODEL version ${version}`)
    text(cursor) // 资产名
    u8(cursor) // 标志位
    return cursor
}

/** 在 [cursor, end) 内按名字找段；找不到返回 undefined，游标停在段头。 */
function findSection(cursor: Cursor, end: number, wanted: string): UeModelSection | undefined {
    while (cursor.offset < end) {
        const name = text(cursor)
        if (!name) return undefined
        const section = sectionAt(cursor)
        if (name === wanted) return section
        cursor.offset = section.offset + section.size
    }
    return undefined
}

/**
 * 读取 `.uemodel` 的顶点与顶点色（取第一个 LOD）。
 * 顶点与颜色一一对应，顺序与 VERTICES 段一致。
 */
export function readUeModelVertexColors(bytes: Uint8Array): UeModelVertexColor[] {
    const cursor = openModel(bytes)
    const lods = text(cursor) === "LODS" ? sectionAt(cursor) : undefined
    if (!lods) throw new Error("UEMODEL has no LODS section")
    const lodEnd = lods.offset + lods.size

    // 每个 LOD 是「名字 + 该 LOD 字节数 + 若干子段」，只取第一个 LOD。
    text(cursor) // LOD 名
    i32(cursor) // 该 LOD 的字节数
    const sections = new Map<string, UeModelSection>()
    while (cursor.offset < lodEnd) {
        const name = text(cursor)
        if (!name) break
        const section = sectionAt(cursor)
        sections.set(name, section)
        cursor.offset = section.offset + section.size
    }

    const vertices = sections.get("VERTICES")
    const colors = sections.get("VERTEXCOLORS")
    if (!vertices) throw new Error("UEMODEL has no VERTICES section")
    if (!colors) return []

    // VERTEXCOLORS 是「若干颜色缓冲」的容器（count = 缓冲数），取第一个（通常名为 COL0）。
    // 缓冲本身只有名字 + 元素数，没有独立的字节数字段。
    cursor.offset = colors.offset
    if (colors.count < 1) return []
    text(cursor) // 缓冲名，通常为 COL0
    const colorCount = i32(cursor)
    const colorOffset = cursor.offset

    // VERTICES 是紧凑 float3（12 字节），UE 坐标（厘米、Z-up）。
    const vertexCount = Math.min(vertices.count, colorCount)
    if (vertices.size !== vertices.count * 12) throw new Error("Unexpected UEMODEL vertex stride")
    const output: UeModelVertexColor[] = new Array(vertexCount)
    for (let index = 0; index < vertexCount; index++) {
        const base = vertices.offset + index * 12
        const c = colorOffset + index * 4
        output[index] = {
            position: [cursor.view.getFloat32(base, true), cursor.view.getFloat32(base + 4, true), cursor.view.getFloat32(base + 8, true)],
            color: [bytes[c], bytes[c + 1], bytes[c + 2], bytes[c + 3]],
        }
    }
    return output
}

export interface UeModelBone {
    name: string
    parent: number
    /** glTF 空间的局部 TRS（米、Y-up），与动画轨道同一套换算。 */
    translation: [number, number, number]
    rotation: [number, number, number, number]
}

/**
 * 读取 `.uemodel` 的 SKELETON 段，即网格资产自带的绑定姿态。
 * 它和共享骨架（`Biped_Skeleton`）的静止姿态不同：骨架是 T-pose，网格是 A-pose，
 * 蒙皮矩阵必须按这份姿态求逆，否则播放动画时手臂/手指会按错误的绑定旋转。
 */
export function readUeModelSkeleton(bytes: Uint8Array): UeModelBone[] {
    const cursor = openModel(bytes)
    const skeleton = findSection(cursor, bytes.length, "SKELETON")
    if (!skeleton) throw new Error("UEMODEL has no SKELETON section")
    cursor.offset = skeleton.offset
    const bones = findSection(cursor, skeleton.offset + skeleton.size, "BONES")
    if (!bones) throw new Error("UEMODEL skeleton has no BONES section")

    // 每条骨骼：名字 + 父级序号 + 局部位置（3）+ 局部旋转（4），没有缩放段。
    cursor.offset = bones.offset
    const output: UeModelBone[] = new Array(bones.count)
    for (let index = 0; index < bones.count; index++) {
        const name = text(cursor)
        const parent = i32(cursor)
        const position = [f32(cursor), f32(cursor), f32(cursor)]
        const rotation = [f32(cursor), f32(cursor), f32(cursor), f32(cursor)]
        output[index] = { name, parent, translation: toTranslation(position), rotation: toRotation(rotation) }
    }
    return output
}

/**
 * UE（厘米、Z-up）→ glTF（米、Y-up）：x 不变，y 取 UE 的 z，z 取 UE 的 y。
 * 保留 4 位小数作为匹配键，实测可覆盖 99.9% 顶点。
 */
export function uePositionKey(x: number, y: number, z: number): string {
    return `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
}

/** 把 `.uemodel` 的顶点色按位置映射到 glTF 顶点上，返回每个顶点的 BGRA。 */
export function mapVertexColors(
    entries: UeModelVertexColor[],
    positions: Float32Array
): { colors: Uint8Array; matched: number; total: number } {
    const lookup = new Map<string, [number, number, number, number]>()
    for (const entry of entries) {
        const [x, y, z] = entry.position
        const key = uePositionKey(x / 100, z / 100, y / 100)
        if (!lookup.has(key)) lookup.set(key, entry.color)
    }
    const count = positions.length / 3
    const colors = new Uint8Array(count * 4)
    let matched = 0
    for (let index = 0; index < count; index++) {
        const key = uePositionKey(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2])
        const color = lookup.get(key)
        if (!color) continue
        colors.set(color, index * 4)
        matched++
    }
    return { colors, matched, total: count }
}
