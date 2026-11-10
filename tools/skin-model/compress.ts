import { MeshoptEncoder } from "meshoptimizer"
import { type GlbDocument, readAccessorBytes, readGlb, writeGlb } from "../../apps/web/src/utils/skin-model-glb"

/**
 * 把导出好的 GLB 压成发布体积：剔除武器、贴图按语义分档重编码、顶点属性收窄 + meshopt 压缩。
 *
 * 不用 gltf-transform 之类的现成管线，是因为这个模型的蒙皮、动画、染色元数据都是自定义结构，
 * 过第三方管线容易丢 extras 或重排骨骼；仓库本身已有 meshoptimizer，自己拼 glTF 更可控。
 */

/** 单类贴图的编码预算。`lossless` 表示必须逐像素一致。 */
export type TextureSpec = { scale: number; lossless: true } | { scale: number; quality: number }

/** 按材质语义分的四档贴图预算 */
export type TextureBudget = {
    /** 剪影写在底图通道里（丝绸层与羽片的 B 通道），有损会翻掉阈值附近的纹素 */
    cutout: TextureSpec
    /** 混合贴图、丝绸混合贴图、SDF 等遮罩 */
    mask: TextureSpec
    /** 法线贴图 */
    normal: TextureSpec
    /** 颜色、自发光及其它 */
    color: TextureSpec
}

export const DEFAULT_TEXTURE_BUDGET: TextureBudget = {
    cutout: { scale: 0.45, lossless: true },
    mask: { scale: 0.3, lossless: true },
    normal: { scale: 0.4, quality: 90 },
    color: { scale: 0.5, quality: 88 },
}

/** 体积上限重试：整套预算等比缩一档，直到压进上限或到底。 */
const BUDGET_LADDER = [1, 0.85, 0.7, 0.6, 0.5]

export type CompressOptions = {
    /** 要剔除的材质名，默认武器 */
    dropMaterials?: string[]
    texture?: TextureBudget
    /** 目标体积上限（字节）。给了就按 BUDGET_LADDER 逐档缩小贴图预算，直到压进来 */
    maxBytes?: number
    /** 顶点/索引走 EXT_meshopt_compression，默认开 */
    geometry?: boolean
    /** 动画关键帧量化，默认开 */
    animation?: boolean
}

export type CompressReport = {
    before: number
    after: number
    textures: { name: string; kind: string; before: number; after: number }[]
    geometry: { before: number; after: number }
    animation: { before: number; after: number }
    removed: { materials: string[]; nodes: string[]; images: string[] }
}

const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }

const CLASS_RANK: Record<keyof TextureBudget, number> = { cutout: 0, mask: 1, normal: 2, color: 3 }

/** 按材质槽语义给每张贴图归类，优先级：剪影 > 遮罩 > 法线 > 颜色。 */
export function classifyTextures(document: GlbDocument): Map<string, keyof TextureBudget> {
    const json = document.json as Record<string, any>
    const result = new Map<string, keyof TextureBudget>()
    const imageName = (slot: number | undefined) => {
        if (slot === undefined) return undefined
        const texture = json.textures?.[slot]
        if (!texture) return undefined
        return json.images?.[texture.source]?.name as string | undefined
    }
    const assign = (name: string | undefined, kind: keyof TextureBudget) => {
        if (!name) return
        const current = result.get(name)
        if (current && CLASS_RANK[current] <= CLASS_RANK[kind]) return
        result.set(name, kind)
    }
    for (const material of json.materials ?? []) {
        const data = material.extras?.dnaColorize
        if (!data || data.kind === "shadow") continue
        const textures = (data.textures ?? {}) as Record<string, number>
        const silk = textures["丝绸混合贴图"] !== undefined
        const wing = String(data.parent ?? "").includes("M_Player_Wing_ShopSkin")
        assign(imageName(textures["时装BaseClor"] ?? textures["颜色贴图"]), silk || wing ? "cutout" : "color")
        assign(imageName(textures["混合贴图"]), "mask")
        assign(imageName(textures["丝绸混合贴图"]), "mask")
        assign(imageName(textures["法线贴图"]), "normal")
        assign(imageName(textures["自发光贴图"]), "color")
    }
    for (const image of json.images ?? []) assign(image.name, "color")
    return result
}

/** 追加裸 bufferView 到二进制尾部，返回视图索引。 */
function pushView(document: GlbDocument, bytes: Uint8Array, extra: Record<string, any> = {}): number {
    const offset = Math.ceil(document.binary.length / 4) * 4
    const next = new Uint8Array(offset + bytes.length)
    next.set(document.binary)
    next.set(bytes, offset)
    document.binary = next
    document.json.buffers = [{ byteLength: next.length }]
    return document.json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...extra }) - 1
}

/** 追加带 EXT_meshopt_compression 的 bufferView，返回视图索引。 */
function pushCompressedView(
    document: GlbDocument,
    bytes: Uint8Array,
    spec: { count: number; byteStride: number; mode: "ATTRIBUTES" | "TRIANGLES" }
): number {
    const offset = Math.ceil(document.binary.length / 4) * 4
    const next = new Uint8Array(offset + bytes.length)
    next.set(document.binary)
    next.set(bytes, offset)
    document.binary = next
    document.json.buffers = [{ byteLength: next.length }]
    // 规范要求 bufferView 的 byteLength 是解压后的字节数，数据本身走 extension 的 byteOffset。
    // 顶层的 byteStride 不能省：加载器按它决定要不要走交错缓冲，只写进 extension 的话
    // 量化成 byte 的法线会被当成 3 字节步长读，整片法线错位。
    const view: Record<string, any> = {
        buffer: 0,
        byteOffset: 0,
        byteLength: spec.count * spec.byteStride,
        extensions: {
            EXT_meshopt_compression: {
                buffer: 0,
                byteOffset: offset,
                byteLength: bytes.length,
                byteStride: spec.byteStride,
                count: spec.count,
                mode: spec.mode,
            },
        },
    }
    if (spec.mode === "ATTRIBUTES") view.byteStride = spec.byteStride
    return document.json.bufferViews.push(view) - 1
}

/** 剔除指定材质，连带删掉变空的网格、节点与贴图。 */
function dropWeapon(document: GlbDocument, dropMaterials: Set<string>) {
    const json = document.json as Record<string, any>
    const removedMaterials: string[] = []
    const removedNodes: string[] = []
    const removedImages: string[] = []

    const materialRemap = new Map<number, number>()
    const keptMaterials: Record<string, any>[] = []
    for (const [index, material] of (json.materials ?? []).entries()) {
        if (dropMaterials.has(material.name)) {
            removedMaterials.push(material.name)
            continue
        }
        materialRemap.set(index, keptMaterials.length)
        keptMaterials.push(material)
    }
    json.materials = keptMaterials

    // 武器节点在导出时带了 `extras.dnaRole = "weapon"`，其中一块网格与场景共用材质，
    // 只按材质名剔除会留下这块；两处一起判断。
    const weaponNodes = new Set<number>()
    for (const [index, node] of (json.nodes ?? []).entries()) if (node.extras?.dnaRole === "weapon") weaponNodes.add(index)
    const weaponMeshes = new Set<number>()
    for (const index of weaponNodes) {
        const node = json.nodes[index]
        if (node.mesh !== undefined) weaponMeshes.add(node.mesh)
    }
    const weaponMeshNames = new Set<string>()
    for (const index of weaponMeshes) weaponMeshNames.add(json.meshes[index]?.name ?? "")

    const keptMeshes: Record<string, any>[] = []
    const meshRemap = new Map<number, number>()
    for (const [index, mesh] of (json.meshes ?? []).entries()) {
        // 同名的多个 primitive 集合属于同一份网格资产（导出器按材质拆成 mesh_N），
        // 武器网格与角色网格同名不同实例，这里按「网格名 + 是否为武器」区分
        if (weaponMeshes.has(index)) continue
        mesh.primitives = mesh.primitives.filter((primitive: any) => {
            if (primitive.material === undefined) return true
            if (!materialRemap.has(primitive.material)) return false
            primitive.material = materialRemap.get(primitive.material)
            return true
        })
        if (!mesh.primitives.length) continue
        meshRemap.set(index, keptMeshes.length)
        keptMeshes.push(mesh)
    }
    json.meshes = keptMeshes

    for (const node of json.nodes ?? []) {
        if (node.mesh === undefined) continue
        if (!meshRemap.has(node.mesh)) {
            removedNodes.push(node.name ?? "")
            delete node.mesh
            delete node.skin
        } else node.mesh = meshRemap.get(node.mesh)
    }

    // 被删掉网格的那套蒙皮（武器自带 6 关节）已经没人引用，留着白占逆绑定矩阵
    const usedSkins = new Set<number>()
    for (const node of json.nodes ?? []) if (node.skin !== undefined) usedSkins.add(node.skin)
    const keptSkins: Record<string, any>[] = []
    const skinRemap = new Map<number, number>()
    for (const [index, skin] of (json.skins ?? []).entries()) {
        if (!usedSkins.has(index)) continue
        skinRemap.set(index, keptSkins.length)
        keptSkins.push(skin)
    }
    json.skins = keptSkins
    for (const node of json.nodes ?? []) if (node.skin !== undefined) node.skin = skinRemap.get(node.skin)

    const droppedSources = new Set<number>()
    const keptImages: Record<string, any>[] = []
    for (const [index, image] of (json.images ?? []).entries()) {
        if (/Sword_Shezui/.test(image.name ?? "")) {
            removedImages.push(image.name)
            droppedSources.add(index)
            continue
        }
        keptImages.push(image)
    }
    json.images = keptImages
    const imageRemap = new Map<number, number>()
    let cursor = 0
    for (let index = 0; index < json.images.length + droppedSources.size; index++)
        if (!droppedSources.has(index)) imageRemap.set(index, cursor++)

    const keptTextures: Record<string, any>[] = []
    for (const texture of json.textures ?? []) {
        if (texture.source !== undefined && droppedSources.has(texture.source)) continue
        if (texture.source !== undefined) texture.source = imageRemap.get(texture.source)!
        keptTextures.push(texture)
    }
    json.textures = keptTextures

    // 材质里残留的贴图槽指向已删除的纹理：整槽去掉
    const liveTextures = new Set<number>()
    for (const [index] of json.textures.entries()) liveTextures.add(index)
    for (const material of json.materials) {
        const data = material.extras?.dnaColorize
        if (!data?.textures) continue
        for (const [slot, value] of Object.entries(data.textures as Record<string, number>)) {
            if (!liveTextures.has(value)) delete data.textures[slot]
        }
    }
    return { removedMaterials, removedNodes, removedImages }
}

/** 按预算重编码贴图，返回报告；同时把贴图视图放到 bufferViews 最前面。 */
async function reencodeTextures(
    document: GlbDocument,
    budget: TextureBudget
): Promise<{ name: string; kind: string; before: number; after: number }[]> {
    const json = document.json as Record<string, any>
    const kinds = classifyTextures(document)
    const binary = document.binary
    const report: { name: string; kind: string; before: number; after: number }[] = []
    const encoded: Uint8Array[] = []
    for (const image of json.images ?? []) {
        const view = json.bufferViews[image.bufferView]
        const start = view.byteOffset ?? 0
        const source = binary.subarray(start, start + view.byteLength)
        const kind = kinds.get(image.name) ?? "color"
        const spec = budget[kind]
        let output = source
        try {
            let decoded = new Bun.Image(source)
            const meta = await decoded.metadata()
            if (spec.scale < 1)
                decoded = decoded.resize(
                    Math.max(1, Math.round(meta.width * spec.scale)),
                    Math.max(1, Math.round(meta.height * spec.scale))
                )
            output =
                "lossless" in spec
                    ? new Uint8Array(await decoded.webp({ lossless: true }).bytes())
                    : new Uint8Array(await decoded.webp({ quality: spec.quality }).bytes())
            image.mimeType = "image/webp"
        } catch {
            // 解码不了的小图（1x1 等）原样保留
            output = source
        }
        encoded.push(output)
        report.push({ name: image.name, kind, before: source.length, after: output.length })
    }
    // 贴图统一放到二进制开头，bufferViews 前 N 项与 images 一一对应
    json.bufferViews = []
    document.binary = new Uint8Array(0)
    for (const [index, bytes] of encoded.entries()) {
        json.images[index].bufferView = pushView(document, bytes)
    }
    return report
}

/** 顶点属性收窄规格：权重 u8、法线 signed byte（KHR_mesh_quantization 放行）。 */
const NARROWED: Record<string, { componentType: number; stride: number }> = {
    WEIGHTS_0: { componentType: 5121, stride: 4 },
    NORMAL: { componentType: 5120, stride: 4 },
}

/** 把单个 primitive 重排 + 收窄 + meshopt 压缩，返回压缩前后的字节数。 */
async function compressPrimitive(
    document: GlbDocument,
    primitive: Record<string, any>,
    source: GlbDocument
): Promise<{ before: number; after: number } | undefined> {
    const json = document.json as Record<string, any>
    const sourceJson = source.json as Record<string, any>
    if (primitive.indices === undefined || primitive.attributes?.POSITION === undefined) return undefined
    const indexAccessor = sourceJson.accessors[primitive.indices]
    const rawIndex = readAccessorBytes(source, primitive.indices)
    const index =
        indexAccessor.componentType === 5125
            ? new Uint32Array(rawIndex.buffer.slice(rawIndex.byteOffset, rawIndex.byteOffset + rawIndex.byteLength))
            : indexAccessor.componentType === 5123
              ? Uint32Array.from(new Uint16Array(rawIndex.buffer.slice(rawIndex.byteOffset, rawIndex.byteOffset + rawIndex.byteLength)))
              : Uint32Array.from(rawIndex)
    const vertexCount = sourceJson.accessors[primitive.attributes.POSITION].count
    // 源资产里有越界的损坏 primitive（M_EyeShadow_V14），压缩无法进行，保持原样
    if (index.some(value => value >= vertexCount)) return undefined

    await MeshoptEncoder.ready
    if (!MeshoptEncoder.supported) return undefined
    // reorderMesh 会原地改写传入的索引数组，返回值 remap 是 oldVertex -> newVertex
    const remap = MeshoptEncoder.reorderMesh(index, true, false)[0]

    let before = indexAccessor.count * (COMPONENT_SIZE[indexAccessor.componentType] ?? 4)
    let after = 0
    const encodedIndex = await MeshoptEncoder.encodeGltfBuffer(index, index.length, 4, "TRIANGLES")
    after += encodedIndex.byteLength
    const indexView = pushCompressedView(document, encodedIndex, { count: index.length, byteStride: 4, mode: "TRIANGLES" })
    const attributes: Record<string, number> = {}
    for (const [name, accessorIndex] of Object.entries(primitive.attributes as Record<string, number>)) {
        const accessor = sourceJson.accessors[accessorIndex]
        const components = TYPE_COMPONENTS[accessor.type] ?? 1
        const size = COMPONENT_SIZE[accessor.componentType] ?? 4
        before += accessor.count * components * size
        const bytes = readAccessorBytes(source, accessorIndex)
        const narrow = NARROWED[name]
        let stride: number
        let componentType = accessor.componentType
        let type = accessor.type
        let normalized = accessor.normalized === true
        let data: Uint8Array
        if (narrow && accessor.componentType === 5126) {
            const source = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
            stride = narrow.stride
            componentType = narrow.componentType
            normalized = true
            data = new Uint8Array(vertexCount * stride)
            if (name === "WEIGHTS_0") {
                for (let v = 0; v < vertexCount; v++)
                    for (let c = 0; c < 4; c++) data[v * stride + c] = Math.round(Math.min(1, Math.max(0, source[v * 4 + c])) * 255)
            } else {
                for (let v = 0; v < vertexCount; v++)
                    for (let c = 0; c < 3; c++)
                        data[v * stride + c] = Math.max(-127, Math.min(127, Math.round(source[v * 3 + c] * 127))) & 0xff
                type = "VEC3"
            }
        } else {
            stride = components * size
            data = new Uint8Array(bytes.length)
            data.set(bytes)
        }
        const reordered = new Uint8Array(data.length)
        for (let v = 0; v < vertexCount; v++) {
            const target = remap[v]
            if (target === 0xffffffff) continue
            for (let c = 0; c < stride; c++) reordered[target * stride + c] = data[v * stride + c]
        }
        const encoded = await MeshoptEncoder.encodeGltfBuffer(reordered, vertexCount, stride, "ATTRIBUTES")
        after += encoded.byteLength
        const view = pushCompressedView(document, encoded, { count: vertexCount, byteStride: stride, mode: "ATTRIBUTES" })
        const entry: Record<string, any> = { bufferView: view, componentType, count: vertexCount, type }
        if (normalized) entry.normalized = true
        if (accessor.min) entry.min = accessor.min
        if (accessor.max) entry.max = accessor.max
        attributes[name] = json.accessors.push(entry) - 1
    }
    const indexEntry: Record<string, any> = { bufferView: indexView, componentType: 5125, count: index.length, type: "SCALAR" }
    primitive.indices = json.accessors.push(indexEntry) - 1
    primitive.attributes = attributes
    return { before, after }
}

/** 动画关键帧量化：旋转四元数 → int16，位移/缩放 → int16，时间保持 float。 */
async function compressAnimation(document: GlbDocument, source: GlbDocument): Promise<{ before: number; after: number }> {
    const json = document.json as Record<string, any>
    const sourceJson = source.json as Record<string, any>
    let before = 0
    let after = 0
    for (const animation of json.animations ?? []) {
        for (const sampler of animation.samplers) {
            const inputAccessor = sourceJson.accessors[sampler.input]
            before += inputAccessor.count * 4
            // 时间轴保持 float（播放器直接按秒采样），但必须重新挂到新的 accessor 列表
            const timeBytes = readAccessorBytes(source, sampler.input)
            const timeView = pushView(document, timeBytes, { target: 34962 })
            const timeEntry: Record<string, any> = {
                bufferView: timeView,
                componentType: 5126,
                count: inputAccessor.count,
                type: "SCALAR",
            }
            if (inputAccessor.min) timeEntry.min = inputAccessor.min
            if (inputAccessor.max) timeEntry.max = inputAccessor.max
            sampler.input = json.accessors.push(timeEntry) - 1
            after += timeBytes.length
            const outputAccessor = sourceJson.accessors[sampler.output]
            const components = TYPE_COMPONENTS[outputAccessor.type] ?? 1
            before += outputAccessor.count * components * 4
            const bytes = readAccessorBytes(source, sampler.output)
            const values = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
            const stride = Math.ceil((components * 2) / 4) * 4
            const quantized = new Uint8Array(outputAccessor.count * stride)
            const view = new DataView(quantized.buffer)
            for (let i = 0; i < values.length; i++)
                view.setInt16(
                    Math.floor(i / components) * stride + (i % components) * 2,
                    Math.round(Math.max(-1, Math.min(1, values[i])) * 32767),
                    true
                )
            // 动画同样走 meshopt，必须等编码器初始化完成（几何分支里等过，但没有动画的模型不会走到那里）
            await MeshoptEncoder.ready
            if (!MeshoptEncoder.supported) return { before, after }
            const encoded = await MeshoptEncoder.encodeGltfBuffer(quantized, outputAccessor.count, stride, "ATTRIBUTES")
            after += encoded.byteLength
            const bufferView = pushCompressedView(document, encoded, {
                count: outputAccessor.count,
                byteStride: stride,
                mode: "ATTRIBUTES",
            })
            const entry: Record<string, any> = {
                bufferView,
                componentType: 5122,
                count: outputAccessor.count,
                type: outputAccessor.type,
                normalized: true,
            }
            sampler.output = json.accessors.push(entry) - 1
        }
    }
    return { before, after }
}

/**
 * @description 按比例缩放整套贴图预算，档位低于 1 时只会更小。
 * @param budget 原预算
 * @param factor 缩放系数
 * @returns 缩放后的预算
 */
function scaleBudget(budget: TextureBudget, factor: number): TextureBudget {
    const scale = (spec: TextureSpec): TextureSpec =>
        "lossless" in spec ? { scale: spec.scale * factor, lossless: true } : { scale: spec.scale * factor, quality: spec.quality }
    return { cutout: scale(budget.cutout), mask: scale(budget.mask), normal: scale(budget.normal), color: scale(budget.color) }
}

/** 压成发布体积。 */
export async function compressGlb(bytes: Uint8Array, options: CompressOptions = {}): Promise<{ glb: Uint8Array; report: CompressReport }> {
    const base = options.texture ?? DEFAULT_TEXTURE_BUDGET
    if (!options.maxBytes) return compressOnce(bytes, { ...options, texture: base })
    // 不同皮肤的贴图张数与分辨率差别很大，固定档位压出来的体积会飘。
    // 逐档缩到上限内，取第一个达标的；都不达标就用最小那档。
    let result = await compressOnce(bytes, { ...options, texture: base })
    for (const factor of BUDGET_LADDER.slice(1)) {
        if (result.glb.length <= options.maxBytes) break
        result = await compressOnce(bytes, { ...options, texture: scaleBudget(base, factor) })
    }
    return result
}

/** 用一套固定预算压一次。 */
async function compressOnce(bytes: Uint8Array, options: CompressOptions = {}): Promise<{ glb: Uint8Array; report: CompressReport }> {
    const document = readGlb(bytes)
    const json = document.json as Record<string, any>
    const before = bytes.length
    // 压缩阶段要读原始几何，而贴图重编码会重建 bufferViews，先留一份源快照
    const source: GlbDocument = { json: structuredClone(json), binary: document.binary }

    const { removedMaterials, removedNodes, removedImages } = dropWeapon(document, new Set(options.dropMaterials ?? ["MI_Sword_Shezui"]))
    const textures = await reencodeTextures(document, options.texture ?? DEFAULT_TEXTURE_BUDGET)
    // 旧的几何 bufferView / accessor 全部丢弃，只保留贴图视图
    json.accessors = []
    // 逆绑定矩阵是 accessor 而不是内联数据，清空 accessors 后必须重新登记，
    // 否则 skin.inverseBindMatrices 会指向无关的几何 accessor，骨骼矩阵解出 NaN、整只模型不渲染。
    for (const skin of json.skins ?? []) {
        const oldIndex = skin.inverseBindMatrices
        const bytes = oldIndex === undefined ? undefined : readAccessorBytes(source, oldIndex)
        if (!bytes) continue
        const view = pushView(document, bytes)
        skin.inverseBindMatrices =
            json.accessors.push({
                bufferView: view,
                componentType: 5126,
                count: bytes.byteLength / 64,
                type: "MAT4",
            }) - 1
    }
    const geometry = { before: 0, after: 0 }
    if (options.geometry !== false) {
        for (const mesh of json.meshes ?? []) {
            for (const primitive of mesh.primitives) {
                const result = await compressPrimitive(document, primitive, source)
                if (!result) continue
                geometry.before += result.before
                geometry.after += result.after
            }
        }
        json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), "EXT_meshopt_compression", "KHR_mesh_quantization"])]
        json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), "EXT_meshopt_compression", "KHR_mesh_quantization"])]
    }

    const animation = options.animation === false ? { before: 0, after: 0 } : await compressAnimation(document, source)

    const glb = writeGlb(document)
    return {
        glb,
        report: {
            before,
            after: glb.length,
            textures,
            geometry,
            animation,
            removed: { materials: removedMaterials, nodes: removedNodes, images: removedImages },
        },
    }
}
