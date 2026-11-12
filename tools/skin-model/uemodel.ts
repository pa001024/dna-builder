/**
 * UEFormat `.uemodel` 解析：只取出顶点色。
 *
 * fmodel-cli 的 glTF2 导出会把 COLOR_0 全写成 0（源资产里有上百种颜色），
 * 而同一份网格的 UEFormat 导出（`export-mesh-uf`）保留了完整顶点色。
 * 因此导出时装时以 `.uemodel` 为准回填顶点色。
 */

const MAGIC = "UEFORMAT"

export interface UeCursor {
    readonly bytes: Uint8Array
    readonly view: DataView
    offset: number
}

export function ueCursorOf(bytes: Uint8Array): UeCursor {
    return { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset: 0 }
}

export function ueU8(cursor: UeCursor): number {
    return cursor.bytes[cursor.offset++]
}

export function ueI32(cursor: UeCursor): number {
    const value = cursor.view.getInt32(cursor.offset, true)
    cursor.offset += 4
    return value
}

export function ueF32(cursor: UeCursor): number {
    const value = cursor.view.getFloat32(cursor.offset, true)
    cursor.offset += 4
    return value
}

/** UEFormat 的 fstring：int32 长度 + UTF-8 字节（含结尾 NUL）。 */
export function ueText(cursor: UeCursor): string {
    const length = ueI32(cursor)
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

function sectionAt(cursor: UeCursor): UeModelSection {
    const count = ueI32(cursor)
    const size = ueI32(cursor)
    const offset = cursor.offset
    if (size < 0 || offset + size > cursor.bytes.length) throw new Error("Truncated UEMODEL section")
    return { count, size, offset }
}

/**
 * 跳过文件头，游标停在第一个段之前。
 * 文件头是「8 字节 magic + int32 类型名长度 + 类型名 + 1 字节版本 + 资产名 + 1 字节标志」；
 * 注意 magic 后紧跟的那个 int32 是**类型名长度**，不是版本号。
 */
function openModel(bytes: Uint8Array): UeCursor {
    if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) throw new Error("Expected a UEFormat model")
    const cursor = ueCursorOf(bytes)
    cursor.offset = 8
    if (ueText(cursor) !== "UEMODEL") throw new Error("Expected a UEMODEL asset")
    const version = ueU8(cursor)
    if (version !== 9) throw new Error(`Unsupported UEMODEL version ${version}`)
    ueText(cursor) // 资产名
    ueU8(cursor) // 标志位
    return cursor
}

/** 在 [cursor, end) 内按名字找段；找不到返回 undefined，游标停在段头。 */
function findSection(cursor: UeCursor, end: number, wanted: string): UeModelSection | undefined {
    while (cursor.offset < end) {
        const name = ueText(cursor)
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
    const lods = ueText(cursor) === "LODS" ? sectionAt(cursor) : undefined
    if (!lods) throw new Error("UEMODEL has no LODS section")
    const lodEnd = lods.offset + lods.size

    // 每个 LOD 是「名字 + 该 LOD 字节数 + 若干子段」，只取第一个 LOD。
    ueText(cursor) // LOD 名
    ueI32(cursor) // 该 LOD 的字节数
    const sections = new Map<string, UeModelSection>()
    while (cursor.offset < lodEnd) {
        const name = ueText(cursor)
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
    ueText(cursor) // 缓冲名，通常为 COL0
    const colorCount = ueI32(cursor)
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

const SCALE = 0.01

/** UE 局部位置（厘米、Z-up）转 glTF 局部位置（米、Y-up）：与动画轨道同一套换算。 */
export function toTranslation(value: number[]): [number, number, number] {
    return [value[0] * SCALE, value[2] * SCALE, value[1] * SCALE]
}

/**
 * UE 四元数 (x,y,z,w) 转到 glTF 的 Y-up 空间。
 *
 * 只交换 y/z 会得到镜像旋转：手部骨骼会被转到相反方向，手指/裙摆绑定的顶点被拉成长刺。
 * 引擎侧该变换是左手到右手的反射，反射作用在旋转上表现为共轭，因此 x/y/z 三个分量都要取反，
 * w 保持符号。用「骨骼世界坐标 vs 网格顶点重心」实测，共轭把平均误差从 0.41 降到 0.12。
 */
export function toRotation(value: number[]): [number, number, number, number] {
    const length = Math.hypot(value[0], value[1], value[2], value[3]) || 1
    return [-value[0] / length, -value[2] / length, -value[1] / length, value[3] / length]
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
        const name = ueText(cursor)
        const parent = ueI32(cursor)
        const position = [ueF32(cursor), ueF32(cursor), ueF32(cursor)]
        const rotation = [ueF32(cursor), ueF32(cursor), ueF32(cursor), ueF32(cursor)]
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
