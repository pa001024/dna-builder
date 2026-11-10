import { appendAccessors, type GlbDocument, readAccessorBytes } from "../../apps/web/src/utils/skin-model-glb"
import type { UeModelBone } from "./uemodel"

/**
 * 导出器给的骨骼静止姿态是共享骨架的 T-pose，网格顶点却是 A-pose 建模，两者对不上。
 * `bindToSkeleton` 用 `.uemodel` 里的网格绑定姿态重绑（游戏用的正是这套）；
 * `rebindToAnimation` 是拿不到网格骨架时的退路，把绑定姿态近似成某段动画的首帧。
 */

type Mat4 = Float32Array

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/** glTF 缓冲区是列主序，这里保持同一内存布局：out = a * b。 */
function multiply(a: Mat4, b: Mat4): Mat4 {
    const out = new Float32Array(16)
    for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) {
            out[column * 4 + row] =
                a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3]
        }
    }
    return out
}

function compose(translation: number[], rotation: number[], scale: number[]): Mat4 {
    const [x, y, z, w] = rotation
    const x2 = x + x
    const y2 = y + y
    const z2 = z + z
    const xx = x * x2
    const xy = x * y2
    const xz = x * z2
    const yy = y * y2
    const yz = y * z2
    const zz = z * z2
    const wx = w * x2
    const wy = w * y2
    const wz = w * z2
    return new Float32Array([
        (1 - (yy + zz)) * scale[0],
        (xy + wz) * scale[0],
        (xz - wy) * scale[0],
        0,
        (xy - wz) * scale[1],
        (1 - (xx + zz)) * scale[1],
        (yz + wx) * scale[1],
        0,
        (xz + wy) * scale[2],
        (yz - wx) * scale[2],
        (1 - (xx + yy)) * scale[2],
        0,
        translation[0],
        translation[1],
        translation[2],
        1,
    ])
}

function invert(matrix: Mat4): Mat4 {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = matrix
    const b00 = a00 * a11 - a01 * a10
    const b01 = a00 * a12 - a02 * a10
    const b02 = a00 * a13 - a03 * a10
    const b03 = a01 * a12 - a02 * a11
    const b04 = a01 * a13 - a03 * a11
    const b05 = a02 * a13 - a03 * a12
    const b06 = a20 * a31 - a21 * a30
    const b07 = a20 * a32 - a22 * a30
    const b08 = a20 * a33 - a23 * a30
    const b09 = a21 * a32 - a22 * a31
    const b10 = a21 * a33 - a23 * a31
    const b11 = a22 * a33 - a23 * a32
    let determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
    if (!determinant) throw new Error("Singular bone matrix")
    determinant = 1 / determinant
    return new Float32Array([
        (a11 * b11 - a12 * b10 + a13 * b09) * determinant,
        (a02 * b10 - a01 * b11 - a03 * b09) * determinant,
        (a31 * b05 - a32 * b04 + a33 * b03) * determinant,
        (a22 * b04 - a21 * b05 - a23 * b03) * determinant,
        (a12 * b08 - a10 * b11 - a13 * b07) * determinant,
        (a00 * b11 - a02 * b08 + a03 * b07) * determinant,
        (a32 * b02 - a30 * b05 - a33 * b01) * determinant,
        (a20 * b05 - a22 * b02 + a23 * b01) * determinant,
        (a10 * b10 - a11 * b08 + a13 * b06) * determinant,
        (a01 * b08 - a00 * b10 - a03 * b06) * determinant,
        (a30 * b04 - a31 * b02 + a33 * b00) * determinant,
        (a21 * b02 - a20 * b04 - a23 * b00) * determinant,
        (a11 * b07 - a10 * b09 - a12 * b06) * determinant,
        (a00 * b09 - a01 * b07 + a02 * b06) * determinant,
        (a31 * b01 - a30 * b03 - a32 * b00) * determinant,
        (a20 * b03 - a21 * b01 + a22 * b00) * determinant,
    ])
}

/** 骨骼世界矩阵 = 父级世界矩阵 · 本地 TRS；节点顺序在 glTF 里保证父级在前。 */
function worldMatrices(nodes: Record<string, any>[]): Mat4[] {
    const parents = new Int32Array(nodes.length).fill(-1)
    for (const [index, node] of nodes.entries()) for (const child of node.children ?? []) parents[child] = index
    const output: Mat4[] = new Array(nodes.length)
    const resolve = (index: number): Mat4 => {
        const cached = output[index]
        if (cached) return cached
        const node = nodes[index]
        const local = compose(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1])
        const matrix = parents[index] < 0 ? local : multiply(resolve(parents[index]), local)
        output[index] = matrix
        return matrix
    }
    for (let index = 0; index < nodes.length; index++) resolve(index)
    return output
}

/** 从世界矩阵的 3×3 部分拆出旋转四元数与轴向缩放（列主序：m[col * 4 + row]）。 */
function decomposeRotation(matrix: Mat4): { rotation: number[]; scale: number[] } {
    const axes = [
        [matrix[0], matrix[1], matrix[2]],
        [matrix[4], matrix[5], matrix[6]],
        [matrix[8], matrix[9], matrix[10]],
    ]
    const scale = axes.map(axis => Math.hypot(axis[0], axis[1], axis[2]) || 1)
    const [m00, m10, m20] = axes[0].map(value => value / scale[0])
    const [m01, m11, m21] = axes[1].map(value => value / scale[1])
    const [m02, m12, m22] = axes[2].map(value => value / scale[2])
    const trace = m00 + m11 + m22
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2
        return { rotation: [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s], scale }
    }
    if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2
        return { rotation: [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s], scale }
    }
    if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2
        return { rotation: [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s], scale }
    }
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2
    return { rotation: [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s], scale }
}

/**
 * @description 把独立骨架的根节点挂到角色骨骼上（皮肤品阶效果网格：翅膀等）。
 *
 * 效果网格的绑定姿态绕自身原点书写，直接并进文档会落在角色脚下；这里把根节点
 * 改挂到目标骨骼，并用骨骼世界旋转的逆抵消朝向，网格本体保持原来的世界朝向只换位置。
 * 必须在 `bindToSkeleton` 之后调用：逆绑定矩阵已按原世界坐标生成，
 * 之后改父子关系才会把顶点一起带走（先改的话绑定矩阵会把位移抵消掉）。
 * @param document 已绑定的模型
 * @param roots 根节点名列表
 * @param bone 目标骨骼名
 * @returns 成功挂接的数量
 */
export function attachEffectRoots(document: GlbDocument, roots: string[], bone: string): number {
    const nodes = document.json.nodes as Record<string, any>[]
    const indexOf = new Map<string, number>()
    for (const [index, node] of nodes.entries()) if (typeof node.name === "string") indexOf.set(node.name, index)
    const boneIndex = indexOf.get(bone)
    if (boneIndex === undefined) throw new Error(`Effect attach bone not found: ${bone}`)
    const worlds = worldMatrices(nodes)
    let attached = 0
    for (const rootName of roots) {
        const rootIndex = indexOf.get(rootName)
        if (rootIndex === undefined) throw new Error(`Effect mesh root not found: ${rootName}`)
        for (const node of nodes) if (node.children) node.children = node.children.filter((child: number) => child !== rootIndex)
        for (const scene of document.json.scenes ?? []) scene.nodes = (scene.nodes ?? []).filter((index: number) => index !== rootIndex)
        const { rotation, scale } = decomposeRotation(worlds[boneIndex])
        const [x, y, z, w] = rotation
        const attach =
            nodes.push({
                name: `${rootName}@${bone}`,
                rotation: [-x, -y, -z, w],
                scale: [1 / scale[0], 1 / scale[1], 1 / scale[2]],
                children: [rootIndex],
            }) - 1
        ;(nodes[boneIndex].children ??= []).push(attach)
        attached++
    }
    return attached
}

function sampleKeys(document: GlbDocument, sampler: Record<string, any>, time: number, components: number): number[] {
    const times = new Float32Array(readAccessorBytes(document, sampler.input).buffer.slice(0))
    const values = new Float32Array(readAccessorBytes(document, sampler.output).buffer.slice(0))
    let low = 0
    while (low + 1 < times.length && times[low + 1] <= time) low++
    const high = Math.min(low + 1, times.length - 1)
    const span = times[high] - times[low]
    const weight = span <= 0 ? 0 : Math.max(0, Math.min(1, (time - times[low]) / span))
    const output: number[] = []
    for (let channel = 0; channel < components; channel++) {
        const a = values[low * components + channel]
        const b = values[high * components + channel]
        output.push(a + (b - a) * weight)
    }
    return output
}

export interface RebindResult {
    skins: number
    joints: number
    nodes: number
}

/**
 * 按网格自带的绑定姿态重绑：节点默认 TRS 写成绑定姿态，inverseBindMatrices 取该姿态世界矩阵的逆。
 * 之后任意动画帧都按 UE 的公式 `M(帧) · M(绑定)^-1` 计算，与游戏逐帧一致。
 */
export function bindToSkeleton(document: GlbDocument, bones: UeModelBone[]): RebindResult {
    const nodes = document.json.nodes as Record<string, any>[]
    const bind = new Map<string, UeModelBone>()
    for (const bone of bones) if (!bind.has(bone.name)) bind.set(bone.name, bone)
    const missing = new Set<string>()
    for (const skin of document.json.skins ?? [])
        for (const joint of skin.joints as number[]) {
            const name = nodes[joint]?.name
            if (typeof name !== "string" || !bind.has(name)) missing.add(name ?? `#${joint}`)
        }
    // 缺骨会静默沿用导出骨架的 T-pose 局部姿态，蒙皮矩阵随之出错，宁可中止导出。
    if (missing.size) throw new Error(`Skin joints missing from the reference skeleton: ${[...missing].slice(0, 8).join(", ")}`)
    let matched = 0
    const posed = nodes.map(node => {
        const bone = typeof node.name === "string" ? bind.get(node.name) : undefined
        if (!bone) return node
        matched++
        return { ...node, translation: bone.translation, rotation: bone.rotation }
    })
    const worlds = worldMatrices(posed)
    posed.forEach((node, index) => {
        const source = nodes[index]
        if (node === source) return
        source.translation = node.translation
        source.rotation = node.rotation
    })
    let joints = 0
    for (const skin of document.json.skins ?? []) {
        if (skin.inverseBindMatrices === undefined) continue
        const indices: number[] = skin.joints
        const matrices = new Float32Array(indices.length * 16)
        let offset = 0
        for (const joint of indices) {
            matrices.set(invert(worlds[joint] ?? IDENTITY), offset)
            offset += 16
            joints++
        }
        const [accessor] = appendAccessors(document, [{ data: matrices, type: "MAT4", componentType: 5126, count: indices.length }])
        skin.inverseBindMatrices = accessor
    }
    return { skins: document.json.skins?.length ?? 0, joints, nodes: matched }
}

/**
 * 把每个 skin 的 inverseBindMatrices 重绑到 `animation` 的 `time` 帧姿态。
 * 同时把节点 TRS 写成该帧姿态，否则「不播放动画」时会按旧绑定把网格拉回 T-pose。
 * 同一 skin 的多条通道若存在冲突，后写入者覆盖前值（glTF 规定同节点同路径只应有一条）。
 */
export function rebindToAnimation(document: GlbDocument, animationIndex = 0, time = 0): RebindResult {
    const animation = document.json.animations?.[animationIndex]
    if (!animation) return { skins: 0, joints: 0, nodes: 0 }
    const nodes = document.json.nodes as Record<string, any>[]
    const animated = new Map<number, Record<string, number[]>>()
    for (const channel of animation.channels) {
        const sampler = animation.samplers[channel.sampler]
        const path = channel.target.path as string
        const components = path === "rotation" ? 4 : 3
        if (path !== "translation" && path !== "rotation" && path !== "scale") continue
        const value = sampleKeys(document, sampler, time, components)
        const entry = animated.get(channel.target.node) ?? {}
        entry[path] = value
        animated.set(channel.target.node, entry)
    }
    const poseNodes = nodes.map((node, index) => {
        const entry = animated.get(index)
        if (!entry) return node
        return {
            ...node,
            translation: entry.translation ?? node.translation,
            rotation: entry.rotation ?? node.rotation,
            scale: entry.scale ?? node.scale,
        }
    })
    const worlds = worldMatrices(poseNodes)
    for (const [index, entry] of animated) {
        const node = nodes[index]
        if (entry.translation) node.translation = entry.translation
        if (entry.rotation) node.rotation = entry.rotation
        if (entry.scale) node.scale = entry.scale
    }
    let joints = 0
    for (const skin of document.json.skins ?? []) {
        if (skin.inverseBindMatrices === undefined) continue
        const indices: number[] = skin.joints
        const matrices = new Float32Array(indices.length * 16)
        let offset = 0
        for (const joint of indices) {
            // 绑定矩阵是首帧骨骼世界矩阵的逆；静止姿态因此正好落在首帧动画上。
            matrices.set(invert(worlds[joint] ?? IDENTITY), offset)
            offset += 16
            joints++
        }
        const [accessor] = appendAccessors(document, [{ data: matrices, type: "MAT4", componentType: 5126, count: indices.length }])
        skin.inverseBindMatrices = accessor
    }
    return { skins: document.json.skins?.length ?? 0, joints, nodes: animated.size }
}
