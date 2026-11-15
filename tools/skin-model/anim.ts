import { appendAccessors, type GlbDocument, type GltfAnimationSampler, type GltfChannel } from "../../apps/web/src/utils/skin-model-glb"
import { toRotation, toTranslation, ueCursorOf, ueF32, ueI32, ueText, ueU8 } from "./uemodel"

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

/** 解析 fmodel-cli 导出的 .ueanim（UEFormat v9，未压缩）。 */
export function readUeAnim(bytes: Uint8Array): UeAnimation {
    if (bytes.length < 16 || new TextDecoder().decode(bytes.subarray(0, 8)) !== "UEFORMAT") throw new Error("Expected a UEFormat animation")
    const cursor = ueCursorOf(bytes)
    cursor.offset = 8
    if (ueText(cursor) !== "UEANIM") throw new Error("Expected a UEANIM asset")
    const version = ueU8(cursor)
    if (version !== 9) throw new Error(`Unsupported UEANIM version ${version}`)
    const name = ueText(cursor)
    if (ueU8(cursor) !== 0) throw new Error("Compressed UE animations are not supported")
    let frames = 0
    let fps = 30
    let tracks: AnimationTrack[] = []
    while (cursor.offset < bytes.length) {
        const section = ueText(cursor)
        const count = ueI32(cursor)
        const size = ueI32(cursor)
        const start = cursor.offset
        if (start + size > bytes.length) throw new Error(`Truncated ${section} section`)
        if (section === "METADATA") {
            frames = ueI32(cursor)
            fps = ueF32(cursor)
            ueText(cursor)
            ueU8(cursor)
            ueU8(cursor)
            ueI32(cursor)
        } else if (section === "TRACKS") {
            tracks = Array.from({ length: count }, () => {
                const bone = ueText(cursor)
                const positions = Array.from({ length: ueI32(cursor) }, () => ({
                    frame: ueI32(cursor),
                    value: [ueF32(cursor), ueF32(cursor), ueF32(cursor)],
                }))
                const rotations = Array.from({ length: ueI32(cursor) }, () => ({
                    frame: ueI32(cursor),
                    value: [ueF32(cursor), ueF32(cursor), ueF32(cursor), ueF32(cursor)],
                }))
                const scales = Array.from({ length: ueI32(cursor) }, () => ({
                    frame: ueI32(cursor),
                    value: [ueF32(cursor), ueF32(cursor), ueF32(cursor)],
                }))
                return { name: bone, positions, rotations, scales }
            })
        }
        cursor.offset = start + size
    }
    if (!frames || !tracks.length) throw new Error("UE animation has no frames or tracks")
    return { name, frames, fps, tracks }
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
    const nodes = document.json.nodes
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
    const samplers: GltfAnimationSampler[] = []
    const channels: GltfChannel[] = []
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
