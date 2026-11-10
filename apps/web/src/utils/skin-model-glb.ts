/**
 * glTF 2.0 二进制容器的读写与合并。
 *
 * 前端运行期要把「公共体型 + 角色头发/脸」几个部件拼成一个模型，工具侧导出/压缩
 * 也走同一套结构操作，所以这个文件放在 web 侧、由 `tools/skin-model/*` 反向引用。
 */

export interface GlbDocument {
    json: Record<string, any>
    binary: Uint8Array
}

export function readGlb(bytes: Uint8Array): GlbDocument {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
        throw new Error("Expected a glTF 2 binary model")
    }
    if (view.getUint32(8, true) !== bytes.length) throw new Error("Truncated GLB")
    let json: Record<string, any> | undefined
    let binary = new Uint8Array()
    for (let offset = 12; offset < bytes.length; ) {
        const length = view.getUint32(offset, true)
        const type = view.getUint32(offset + 4, true)
        if (offset + 8 + length > bytes.length) throw new Error("Truncated GLB chunk")
        const chunk = bytes.slice(offset + 8, offset + 8 + length)
        if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk))
        else if (type === 0x004e4942) binary = chunk
        offset += 8 + length
    }
    if (!json) throw new Error("GLB has no JSON chunk")
    return { json, binary }
}

export function writeGlb(document: GlbDocument): Uint8Array {
    const json = new TextEncoder().encode(JSON.stringify(document.json))
    const jsonLength = Math.ceil(json.length / 4) * 4
    const binLength = Math.ceil(document.binary.length / 4) * 4
    // buffers[0].byteLength 必须与实际写入的 BIN 块一致，否则严格校验器会判定越界
    if (document.json.buffers?.length === 1) document.json.buffers[0].byteLength = binLength
    const output = new Uint8Array(28 + jsonLength + binLength)
    const view = new DataView(output.buffer)
    view.setUint32(0, 0x46546c67, true)
    view.setUint32(4, 2, true)
    view.setUint32(8, output.length, true)
    view.setUint32(12, jsonLength, true)
    view.setUint32(16, 0x4e4f534a, true)
    output.fill(32, 20, 20 + jsonLength)
    output.set(json, 20)
    view.setUint32(20 + jsonLength, binLength, true)
    view.setUint32(24 + jsonLength, 0x004e4942, true)
    output.set(document.binary, 28 + jsonLength)
    return output
}

export function appendBinary(document: GlbDocument, bytes: Uint8Array): number {
    const offset = Math.ceil(document.binary.length / 4) * 4
    const binary = new Uint8Array(offset + bytes.length)
    binary.set(document.binary)
    binary.set(bytes, offset)
    document.binary = binary
    document.json.buffers = [{ byteLength: binary.length }]
    return offset
}

/** 追加裸 bufferView（贴图等非 accessor 数据），返回视图索引。 */
export function appendBufferView(document: GlbDocument, bytes: Uint8Array): number {
    const offset = appendBinary(document, bytes)
    return document.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }) - 1
}

const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

export interface AccessorRequest {
    data: ArrayBufferView
    type: string
    componentType: number
    count?: number
    normalized?: boolean
    min?: number[]
    max?: number[]
    target?: number
    byteStride?: number
}

/** 单次追加多个 accessor，避免逐条复制整个二进制缓冲。 */
export function appendAccessors(document: GlbDocument, requests: AccessorRequest[]): number[] {
    let offset = Math.ceil(document.binary.length / 4) * 4
    const views: Record<string, any>[] = []
    for (const request of requests) {
        offset = Math.ceil(offset / 4) * 4
        const view: Record<string, any> = { buffer: 0, byteOffset: offset, byteLength: request.data.byteLength }
        if (request.target !== undefined) view.target = request.target
        if (request.byteStride !== undefined) view.byteStride = request.byteStride
        views.push(view)
        offset += request.data.byteLength
    }
    const binary = new Uint8Array(offset)
    binary.set(document.binary)
    const indices: number[] = []
    for (const [index, request] of requests.entries()) {
        const view = views[index]
        binary.set(new Uint8Array(request.data.buffer, request.data.byteOffset, request.data.byteLength), view.byteOffset)
        const viewIndex = document.json.bufferViews.push(view) - 1
        const components = TYPE_COMPONENTS[request.type]
        const count = request.count ?? request.data.byteLength / (components * COMPONENT_SIZE[request.componentType])
        const accessor: Record<string, any> = {
            bufferView: viewIndex,
            componentType: request.componentType,
            count,
            type: request.type,
        }
        if (request.normalized) accessor.normalized = true
        if (request.min) accessor.min = request.min
        if (request.max) accessor.max = request.max
        indices.push(document.json.accessors.push(accessor) - 1)
    }
    document.binary = binary
    document.json.buffers = [{ byteLength: binary.length }]
    return indices
}

export function readAccessorBytes(document: GlbDocument, index: number): Uint8Array {
    const accessor = document.json.accessors[index]
    if (accessor.bufferView === undefined) throw new Error(`Accessor ${index} has no buffer view`)
    const view = document.json.bufferViews[accessor.bufferView]
    const componentSize = COMPONENT_SIZE[accessor.componentType]
    const elementSize = componentSize * TYPE_COMPONENTS[accessor.type]
    const stride = view.byteStride ?? elementSize
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const end = start + stride * (accessor.count - 1) + elementSize
    if (end > view.byteLength + (view.byteOffset ?? 0) || end > document.binary.length)
        throw new Error(`Accessor ${index} exceeds its buffer`)
    if (stride === elementSize) return document.binary.slice(start, end)
    const output = new Uint8Array(accessor.count * elementSize)
    for (let i = 0; i < accessor.count; i++)
        output.set(document.binary.subarray(start + i * stride, start + i * stride + elementSize), i * elementSize)
    return output
}

/** 重映射染色元数据里的贴图槽索引（槽名 → 数字索引）。 */
function remapDyeTextures(meta: Record<string, any> | undefined, map: (index: number) => number): void {
    const slots = meta?.textures
    if (!slots || typeof slots !== "object") return
    for (const [name, index] of Object.entries(slots)) {
        if (typeof index === "number") slots[name] = map(index)
    }
}

/** 合并独立骨骼资产，保留每套蒙皮、UV、顶点色及材质索引，不烘焙或丢弃骨骼。 */
export function mergeGlbs(documents: GlbDocument[]): GlbDocument {
    const keys = ["bufferViews", "accessors", "images", "samplers", "textures", "materials", "meshes", "nodes", "skins", "animations"]
    const result: GlbDocument = {
        json: { asset: { version: "2.0", generator: "dna-builder flora exporter" }, scene: 0, scenes: [{ nodes: [] }] },
        binary: new Uint8Array(),
    }
    for (const key of keys) result.json[key] = []
    for (const document of documents) {
        const source = structuredClone(document.json)
        if (source.buffers?.length !== 1 || source.buffers[0].uri) throw new Error("Only self-contained GLBs are supported")
        const offsets = Object.fromEntries(keys.map(key => [key, result.json[key].length]))
        const binOffset = appendBinary(result, document.binary)
        for (const b of source.bufferViews ?? []) {
            b.buffer = 0
            b.byteOffset = (b.byteOffset ?? 0) + binOffset
            // 部件是 meshopt 压缩的：压缩数据也挂在同一个二进制块里，偏移要一起搬
            const compressed = b.extensions?.EXT_meshopt_compression
            if (compressed) {
                compressed.buffer = 0
                compressed.byteOffset = (compressed.byteOffset ?? 0) + binOffset
            }
        }
        for (const a of source.accessors ?? []) {
            if (a.bufferView !== undefined) a.bufferView += offsets.bufferViews
            if (a.sparse) {
                a.sparse.indices.bufferView += offsets.bufferViews
                a.sparse.values.bufferView += offsets.bufferViews
            }
        }
        for (const image of source.images ?? []) if (image.bufferView !== undefined) image.bufferView += offsets.bufferViews
        for (const texture of source.textures ?? []) {
            if (texture.source !== undefined) texture.source += offsets.images
            if (texture.sampler !== undefined) texture.sampler += offsets.samplers
        }
        const remapTextures = (value: any) => {
            if (!value || typeof value !== "object") return
            for (const [key, child] of Object.entries(value)) {
                if (key.endsWith("Texture") && child && typeof child === "object" && "index" in child) {
                    ;(child as { index: number }).index += offsets.textures
                } else remapTextures(child)
            }
        }
        for (const material of source.materials ?? []) {
            remapTextures(material)
            // 染色元数据里的贴图槽存的是数字索引，同样要跟着重映射
            remapDyeTextures(material.extras?.dnaColorize, index => index + offsets.textures)
        }
        for (const mesh of source.meshes ?? []) {
            for (const primitive of mesh.primitives) {
                for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] += offsets.accessors
                if (primitive.indices !== undefined) primitive.indices += offsets.accessors
                if (primitive.material !== undefined) primitive.material += offsets.materials
                for (const target of primitive.targets ?? []) for (const key of Object.keys(target)) target[key] += offsets.accessors
            }
        }
        for (const node of source.nodes ?? []) {
            if (node.mesh !== undefined) node.mesh += offsets.meshes
            if (node.skin !== undefined) node.skin += offsets.skins
            if (node.children) node.children = node.children.map((index: number) => index + offsets.nodes)
        }
        for (const skin of source.skins ?? []) {
            skin.joints = skin.joints.map((index: number) => index + offsets.nodes)
            if (skin.skeleton !== undefined) skin.skeleton += offsets.nodes
            if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices += offsets.accessors
        }
        for (const animation of source.animations ?? []) {
            for (const sampler of animation.samplers ?? []) {
                if (sampler.input !== undefined) sampler.input += offsets.accessors
                if (sampler.output !== undefined) sampler.output += offsets.accessors
            }
            for (const channel of animation.channels ?? []) {
                if (channel.target?.node !== undefined) channel.target.node += offsets.nodes
            }
        }
        result.json.scenes[0].nodes.push(...source.scenes[source.scene ?? 0].nodes.map((index: number) => index + offsets.nodes))
        for (const key of keys) result.json[key].push(...(source[key] ?? []))
        // 顶层 extras 是皮肤染色元数据（皮肤 id / 色板表 / 部件名），每个部件都带着同一份，
        // 合并后必须保留，否则前端拿不到染色信息。
        if (source.extras) result.json.extras = source.extras
        result.json.extensionsUsed = [...new Set([...(result.json.extensionsUsed ?? []), ...(source.extensionsUsed ?? [])])]
        result.json.extensionsRequired = [...new Set([...(result.json.extensionsRequired ?? []), ...(source.extensionsRequired ?? [])])]
    }
    dedupeSkeletons(result)
    return result
}

/**
 * 每个网格导出的骨架都是同一副骨骼的完整副本（pelvis/spine_01… 重名 2-3 份）。
 * 运行时动画按名字绑定只会命中第一套，其余骨架静止、共享骨名的蒙皮顶点被错绑变形。
 * 同名关节一律归并到最先出现的那一份，其它引用（children/joints/skeleton/动画通道/场景根）全部重定向。
 * @returns 被归并掉的节点数。
 */
export function dedupeSkeletons(document: GlbDocument): number {
    const json = document.json
    const nodes = json.nodes as Record<string, any>[]
    const jointNames = new Set<string>()
    for (const skin of json.skins ?? []) for (const joint of skin.joints) jointNames.add(nodes[joint].name ?? "")
    const canonical = new Map<string, number>()
    const alias = new Map<number, number>()
    for (const [index, node] of nodes.entries()) {
        const name = node.name as string | undefined
        if (!name || !jointNames.has(name)) continue
        if (canonical.has(name)) alias.set(index, canonical.get(name)!)
        else canonical.set(name, index)
    }
    if (!alias.size) return 0
    const parentOf = new Map<number, number>()
    nodes.forEach((node, index) => {
        for (const child of node.children ?? []) if (!parentOf.has(child)) parentOf.set(child, index)
    })
    const newIndexOf = new Map<number, number>()
    const merged: Record<string, any>[] = []
    for (const [index, node] of nodes.entries()) {
        if (alias.has(index)) continue
        newIndexOf.set(index, merged.length)
        merged.push({ ...node, children: [] })
    }
    const resolve = (index: number) => newIndexOf.get(alias.get(index) ?? index)!
    const adopted = new Set<number>()
    for (const [index, node] of nodes.entries()) {
        if (alias.has(index)) continue
        const children = new Set<number>()
        for (const child of node.children ?? []) {
            if (alias.has(child)) continue // 被归并节点不重复挂接，它已在规范父级名下
            children.add(resolve(child))
        }
        merged[newIndexOf.get(index)!].children = [...children]
    }
    for (const node of merged) for (const child of node.children) adopted.add(child)
    // 后续文档独有的新骨骼（如发骨）：原父级被归并时改挂到规范父级下。
    for (const [index, mergedIndex] of newIndexOf) {
        if (adopted.has(mergedIndex)) continue
        const parent = parentOf.get(index)
        if (parent !== undefined && alias.has(parent)) merged[resolve(parent)].children.push(mergedIndex)
    }
    json.nodes = merged
    const remap = (index: number | undefined) => (index === undefined ? undefined : resolve(index))
    for (const scene of json.scenes ?? []) scene.nodes = (scene.nodes ?? []).map(resolve)
    for (const skin of json.skins ?? []) {
        skin.joints = skin.joints.map(resolve)
        skin.skeleton = remap(skin.skeleton)
    }
    for (const animation of json.animations ?? [])
        for (const channel of animation.channels ?? []) channel.target.node = resolve(channel.target.node)
    return alias.size
}
