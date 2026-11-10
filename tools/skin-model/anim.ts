import { appendAccessors, type GlbDocument } from "../../apps/web/src/utils/skin-model-glb"

export interface AnimationKey {
    frame: number
    value: number[]
}

export interface AnimationTrack {
    name: string
    positions: AnimationKey[]
    rotations: AnimationKey[]
    scales: AnimationKey[]
}

export interface UeAnimation {
    name: string
    frames: number
    fps: number
    tracks: AnimationTrack[]
}

/** 复用同一 DataView 读取 fstring，避免每个字段重建解码器。 */
function stringReader(bytes: Uint8Array, view: DataView) {
    let offset = 0
    const need = (size: number) => {
        if (offset + size > bytes.length) throw new Error("Truncated UE animation")
    }
    return {
        i32: () => {
            need(4)
            const value = view.getInt32(offset, true)
            offset += 4
            return value
        },
        f32: () => {
            need(4)
            const value = view.getFloat32(offset, true)
            offset += 4
            return value
        },
        u8: () => {
            need(1)
            return bytes[offset++]
        },
        text: () => {
            const length = view.getInt32(offset, true)
            offset += 4
            if (length < 0) throw new Error("Invalid UE string length")
            need(length)
            const value = new TextDecoder().decode(bytes.subarray(offset, offset + length)).replace(/\0.*$/, "")
            offset += length
            return value
        },
        tell: () => offset,
        seek: (value: number) => {
            offset = value
        },
        get length() {
            return bytes.length
        },
    }
}

/** 解析 fmodel-cli 导出的 .ueanim（UEFormat v9，未压缩）。 */
export function readUeAnim(bytes: Uint8Array): UeAnimation {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 16 || new TextDecoder().decode(bytes.subarray(0, 8)) !== "UEFORMAT") throw new Error("Expected a UEFormat animation")
    const cursor = stringReader(bytes, view)
    cursor.seek(8)
    if (cursor.text() !== "UEANIM") throw new Error("Expected a UEANIM asset")
    const version = cursor.u8()
    if (version !== 9) throw new Error(`Unsupported UEANIM version ${version}`)
    const name = cursor.text()
    if (cursor.u8() !== 0) throw new Error("Compressed UE animations are not supported")
    let frames = 0
    let fps = 30
    let tracks: AnimationTrack[] = []
    while (cursor.tell() < cursor.length) {
        const section = cursor.text()
        const count = cursor.i32()
        const size = cursor.i32()
        const start = cursor.tell()
        if (start + size > cursor.length) throw new Error(`Truncated ${section} section`)
        if (section === "METADATA") {
            frames = cursor.i32()
            fps = cursor.f32()
            cursor.text()
            cursor.u8()
            cursor.u8()
            cursor.i32()
        } else if (section === "TRACKS") {
            tracks = Array.from({ length: count }, () => {
                const bone = cursor.text()
                const positions = Array.from({ length: cursor.i32() }, () => ({
                    frame: cursor.i32(),
                    value: [cursor.f32(), cursor.f32(), cursor.f32()],
                }))
                const rotations = Array.from({ length: cursor.i32() }, () => ({
                    frame: cursor.i32(),
                    value: [cursor.f32(), cursor.f32(), cursor.f32(), cursor.f32()],
                }))
                const scales = Array.from({ length: cursor.i32() }, () => ({
                    frame: cursor.i32(),
                    value: [cursor.f32(), cursor.f32(), cursor.f32()],
                }))
                return { name: bone, positions, rotations, scales }
            })
        }
        cursor.seek(start + size)
    }
    if (!frames || !tracks.length) throw new Error("UE animation has no frames or tracks")
    return { name, frames, fps, tracks }
}

const SCALE = 0.01

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

function same(a: number[] | undefined, b: number[] | undefined, epsilon: number) {
    const left = a ?? [0, 0, 0]
    const right = b ?? [0, 0, 0]
    return left.every((value, index) => Math.abs(value - (right[index] ?? 0)) <= epsilon)
}

function sameRotation(a: number[], b: number[] | undefined) {
    const right = b ?? [0, 0, 0, 1]
    const dot = Math.abs(a[0] * right[0] + a[1] * right[1] + a[2] * right[2] + a[3] * right[3])
    return Math.acos(Math.min(1, dot)) < 1e-5
}

function constantVector(keys: AnimationKey[], convert: (value: number[]) => number[], epsilon: number): number[] | undefined {
    if (!keys.length) return undefined
    const first = convert(keys[0].value)
    for (const key of keys) if (!same(convert(key.value), first, epsilon)) return undefined
    return first
}

function constantRotation(keys: AnimationKey[]): number[] | undefined {
    if (!keys.length) return undefined
    const first = toRotation(keys[0].value)
    for (const key of keys) if (!sameRotation(toRotation(key.value), first)) return undefined
    return first
}

export interface AnimationResult {
    channels: number
    samplers: number
    keys: number
    skipped: number
}

/** 把 UE 动画转成 glTF channel；骨骼按名称匹配，静止且与绑定姿态一致的通道省略。 */
export function appendUeAnimation(document: GlbDocument, animation: UeAnimation): AnimationResult {
    const nodes = document.json.nodes as Record<string, any>[]
    const byName = new Map<string, number[]>()
    for (const [index, node] of nodes.entries()) {
        if (!node.name) continue
        const list = byName.get(node.name) ?? []
        list.push(index)
        byName.set(node.name, list)
    }
    const inputs = new Map<string, number>()
    const times = (keys: AnimationKey[]) => {
        const signature = `${animation.fps}:${keys.length}:${keys[0].frame}:${keys.at(-1)!.frame}:${keys.reduce((sum, key) => sum + key.frame, 0)}`
        const cached = inputs.get(signature)
        if (cached !== undefined) return cached
        const data = new Float32Array(keys.map(key => key.frame / animation.fps))
        const [accessor] = appendAccessors(document, [{ data, type: "SCALAR", componentType: 5126, min: [data[0]], max: [data.at(-1)!] }])
        inputs.set(signature, accessor)
        return accessor
    }
    const samplers: Record<string, any>[] = []
    const channels: Record<string, any>[] = []
    let keyCount = 0
    let skipped = 0
    const push = (node: number, path: string, sampler: number) => {
        channels.push({ sampler, target: { node, path } })
    }
    const samplerFor = (values: { frame: number; value: number[] }[], type: "VEC3" | "VEC4", components: number) => {
        const data = new Float32Array(values.length * components)
        values.forEach((key, index) => data.set(key.value, index * components))
        const [accessor] = appendAccessors(document, [{ data, type, componentType: 5126 }])
        keyCount += values.length
        return samplers.push({ input: times(values), output: accessor, interpolation: "LINEAR" }) - 1
    }
    for (const track of animation.tracks) {
        const targets = byName.get(track.name)
        if (!targets?.length) {
            skipped++
            continue
        }
        // 四套 skin 各有同名骨骼，采样器只写一份，多个 channel 共享，避免动画数据翻数倍。
        const rotations = track.rotations.map(key => ({ frame: key.frame, value: toRotation(key.value) }))
        for (let index = 1; index < rotations.length; index++) {
            const previous = rotations[index - 1].value
            const current = rotations[index].value
            if (previous[0] * current[0] + previous[1] * current[1] + previous[2] * current[2] + previous[3] * current[3] < 0)
                rotations[index].value = current.map(value => -value) as [number, number, number, number]
        }
        const positions = track.positions.map(key => ({ frame: key.frame, value: toTranslation(key.value) }))
        const scales = track.scales.map(key => ({ frame: key.frame, value: [key.value[0], key.value[1], key.value[2]] }))
        const constantPosition = constantVector(track.positions, toTranslation, 1e-5)
        const constantScale = constantVector(track.scales, value => value, 1e-5)
        const constant = constantRotation(track.rotations)
        let rotationSampler: number | undefined
        let positionSampler: number | undefined
        let scaleSampler: number | undefined
        const rotation = () => (rotationSampler ??= samplerFor(rotations, "VEC4", 4))
        const position = () => (positionSampler ??= samplerFor(positions, "VEC3", 3))
        const scale = () => (scaleSampler ??= samplerFor(scales, "VEC3", 3))
        for (const node of targets) {
            const source = nodes[node]
            const keepRotation = constant ? !sameRotation(constant, source.rotation) : rotations.length > 0
            if (keepRotation) push(node, "rotation", rotation())
            const keepPosition = constantPosition ? !same(constantPosition, source.translation, 1e-5) : positions.length > 0
            if (keepPosition) push(node, "translation", position())
            const keepScale = constantScale ? !same(constantScale, source.scale ?? [1, 1, 1], 1e-5) : scales.length > 0
            if (keepScale) push(node, "scale", scale())
        }
    }
    if (!channels.length) return { channels: 0, samplers: 0, keys: 0, skipped }
    document.json.animations = document.json.animations ?? []
    document.json.animations.push({
        name: animation.name,
        samplers,
        channels,
        extras: { ueFrames: animation.frames, ueFps: animation.fps },
    })
    return { channels: channels.length, samplers: samplers.length, keys: keyCount, skipped }
}
